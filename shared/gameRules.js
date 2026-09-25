/**
 * OTTv2 (Oẳn Tù Tì v2) - Shared Game Engine & Rules Module
 * Tương thích cả Node.js (CommonJS/Backend) và Browser (UMD/Frontend)
 *
 * ĐÂY LÀ NGUỒN SỰ THẬT DUY NHẤT cho luật chơi. Không tạo bản copy nào khác.
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GameRules = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ==========================================================================
  // 1. HẰNG SỐ CƠ BẢN
  // ==========================================================================

  const BOARD_SIZE = 9;

  const SIDES = Object.freeze({
    RED: 'RED',
    BLUE: 'BLUE'
  });

  const PIECE_TYPES = Object.freeze({
    ROCK: 'ROCK',         // Đấm / Búa
    PAPER: 'PAPER',       // Lá / Bao
    SCISSORS: 'SCISSORS'  // Kéo
  });

  /** Thứ tự cố định dùng khi duyệt / hiển thị các loại quân */
  const TYPE_ORDER = Object.freeze([
    PIECE_TYPES.ROCK,
    PIECE_TYPES.PAPER,
    PIECE_TYPES.SCISSORS
  ]);

  const TYPE_NAMES_VI = Object.freeze({
    ROCK: 'Đấm',
    PAPER: 'Lá',
    SCISSORS: 'Kéo'
  });

  const SIDE_NAMES_VI = Object.freeze({
    RED: 'Đỏ',
    BLUE: 'Xanh'
  });

  /**
   * Toạ độ ô căn cứ.
   * Quy ước ma trận: row 0 = hàng 9 (rank 9), row 8 = hàng 1 (rank 1).
   *   -> a1 = { row: 8, col: 0 }   (căn cứ phe Đỏ)
   *   -> i9 = { row: 0, col: 8 }   (căn cứ phe Xanh)
   * Đưa được 1 quân vào căn cứ ĐỐI PHƯƠNG thì thắng ngay.
   */
  const BASES = Object.freeze({
    RED: Object.freeze({ row: 8, col: 0, notation: 'a1' }),
    BLUE: Object.freeze({ row: 0, col: 8, notation: 'i9' })
  });

  /** 8 hướng di chuyển (4 trực giao + 4 chéo) — đúng 1 ô, như quân Vua trong cờ vua */
  const DIRECTIONS = Object.freeze([
    Object.freeze({ dr: -1, dc: 0, name: 'UP' }),
    Object.freeze({ dr: 1, dc: 0, name: 'DOWN' }),
    Object.freeze({ dr: 0, dc: -1, name: 'LEFT' }),
    Object.freeze({ dr: 0, dc: 1, name: 'RIGHT' }),
    Object.freeze({ dr: -1, dc: -1, name: 'UP_LEFT' }),
    Object.freeze({ dr: -1, dc: 1, name: 'UP_RIGHT' }),
    Object.freeze({ dr: 1, dc: -1, name: 'DOWN_LEFT' }),
    Object.freeze({ dr: 1, dc: 1, name: 'DOWN_RIGHT' })
  ]);

  /** Quy tắc khắc chế Oẳn Tù Tì: Đấm ăn Kéo, Kéo ăn Lá, Lá ăn Đấm */
  const BEATS = Object.freeze({
    [PIECE_TYPES.ROCK]: PIECE_TYPES.SCISSORS,
    [PIECE_TYPES.SCISSORS]: PIECE_TYPES.PAPER,
    [PIECE_TYPES.PAPER]: PIECE_TYPES.ROCK
  });

  /** Lý do kết thúc ván */
  const GAME_OVER_REASONS = Object.freeze({
    BASE_INVADED: 'BASE_INVADED',
    TYPE_ELIMINATED: 'TYPE_ELIMINATED',
    ALL_PIECES_CAPTURED: 'ALL_PIECES_CAPTURED',
    NO_VALID_MOVES: 'NO_VALID_MOVES',
    TIMEOUT: 'TIMEOUT',
    SURRENDER: 'SURRENDER',
    OPPONENT_LEFT: 'OPPONENT_LEFT'
  });

  // ==========================================================================
  // 2. TIỆN ÍCH CƠ BẢN
  // ==========================================================================

  function opponentOf(side) {
    return side === SIDES.RED ? SIDES.BLUE : SIDES.RED;
  }

  /**
   * Quân tấn công có ăn được quân bị tấn công không.
   * Hai quân CÙNG LOẠI luôn trả về false -> không ăn nhau, chỉ chặn đường.
   */
  function canCapture(attackerType, defenderType) {
    if (!attackerType || !defenderType) return false;
    return BEATS[attackerType] === defenderType;
  }

  function isValidPosition(r, c) {
    return Number.isInteger(r) && Number.isInteger(c) &&
      r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
  }

  /** (row, col) -> ký hiệu cờ. row 8, col 0 -> 'a1' */
  function posToNotation(row, col) {
    if (!isValidPosition(row, col)) return '??';
    return `${String.fromCharCode(97 + col)}${BOARD_SIZE - row}`;
  }

  /** Ký hiệu cờ -> { row, col }. 'a1' -> { row: 8, col: 0 } */
  function notationToPos(notation) {
    if (typeof notation !== 'string' || notation.length !== 2) return null;
    const col = notation[0].toLowerCase().charCodeAt(0) - 97;
    const rowNumber = parseInt(notation[1], 10);
    if (Number.isNaN(rowNumber)) return null;
    const row = BOARD_SIZE - rowNumber;
    if (!isValidPosition(row, col)) return null;
    return { row, col };
  }

  /** Ô này có phải căn cứ của phe nào không -> trả về 'RED' | 'BLUE' | null */
  function baseOwnerAt(row, col) {
    if (row === BASES.RED.row && col === BASES.RED.col) return SIDES.RED;
    if (row === BASES.BLUE.row && col === BASES.BLUE.col) return SIDES.BLUE;
    return null;
  }

  function cloneBoard(board) {
    return board.map(row => row.map(cell => (cell ? { ...cell } : null)));
  }

  // ==========================================================================
  // 3. KHỞI TẠO BÀN CỜ
  // ==========================================================================

  /**
   * Khởi tạo bàn cờ 9x9. Mỗi phe 9 quân: 3 Đấm, 3 Lá, 3 Kéo.
   * Hai ô căn cứ a1 / i9 để trống lúc bắt đầu.
   */
  function createInitialBoard() {
    const board = Array.from({ length: BOARD_SIZE }, () =>
      Array.from({ length: BOARD_SIZE }, () => null)
    );

    let idCounter = 1;
    const put = (row, col, type, side) => {
      board[row][col] = {
        id: `${side[0].toLowerCase()}_${type[0].toLowerCase()}_${idCounter++}`,
        type,
        side
      };
    };

    const { ROCK, PAPER, SCISSORS } = PIECE_TYPES;
    const { RED, BLUE } = SIDES;

    // --- PHE XANH (BLUE) ở hàng trên. i9 (row 0, col 8) là căn cứ -> để trống
    put(0, 1, ROCK, BLUE);      // b9
    put(0, 3, PAPER, BLUE);     // d9
    put(0, 5, SCISSORS, BLUE);  // f9
    put(0, 7, ROCK, BLUE);      // h9
    put(1, 0, PAPER, BLUE);     // a8
    put(1, 2, SCISSORS, BLUE);  // c8
    put(1, 4, ROCK, BLUE);      // e8
    put(1, 6, PAPER, BLUE);     // g8
    put(1, 8, SCISSORS, BLUE);  // i8

    // --- PHE ĐỎ (RED) ở hàng dưới. a1 (row 8, col 0) là căn cứ -> để trống
    put(7, 0, SCISSORS, RED);   // a2
    put(7, 2, PAPER, RED);      // c2
    put(7, 4, ROCK, RED);       // e2
    put(7, 6, SCISSORS, RED);   // g2
    put(7, 8, PAPER, RED);      // i2
    put(8, 1, ROCK, RED);       // b1
    put(8, 3, SCISSORS, RED);   // d1
    put(8, 5, PAPER, RED);      // f1
    put(8, 7, ROCK, RED);       // h1

    return board;
  }

  /**
   * Số quân MỖI LOẠI mà từng phe có lúc bắt đầu ván.
   * Suy trực tiếp từ createInitialBoard() để nếu đổi bố trí thì luật thắng
   * "ăn hết một loại" vẫn tự đúng theo.
   * @returns {{ RED: Object<string, number>, BLUE: Object<string, number> }}
   */
  let _initialTypeCountsCache = null;
  function getInitialTypeCounts() {
    if (!_initialTypeCountsCache) {
      _initialTypeCountsCache = countPieces(createInitialBoard()).byType;
    }
    return _initialTypeCountsCache;
  }

  // ==========================================================================
  // 4. NƯỚC ĐI
  // ==========================================================================

  /**
   * Các nước đi hợp lệ của quân tại (fromRow, fromCol).
   * Đi đúng 1 ô theo 8 hướng. Ô đích hợp lệ khi:
   *   - trống, HOẶC
   *   - có quân đối phương mà quân mình ăn được theo luật Oẳn Tù Tì.
   * Quân cùng phe, quân cùng loại, và quân khắc chế mình đều CHẶN đường.
   */
  function getValidMoves(board, fromRow, fromCol) {
    if (!isValidPosition(fromRow, fromCol)) return [];
    const piece = board[fromRow] && board[fromRow][fromCol];
    if (!piece) return [];

    const validMoves = [];

    for (const dir of DIRECTIONS) {
      const toRow = fromRow + dir.dr;
      const toCol = fromCol + dir.dc;
      if (!isValidPosition(toRow, toCol)) continue;

      const targetPiece = board[toRow][toCol];

      if (!targetPiece) {
        validMoves.push({ row: toRow, col: toCol, isCapture: false, targetPiece: null });
        continue;
      }

      // Cùng phe -> chặn
      if (targetPiece.side === piece.side) continue;

      // Khác phe -> chỉ đi vào được nếu ăn được (cùng loại / bị khắc chế đều chặn)
      if (canCapture(piece.type, targetPiece.type)) {
        validMoves.push({ row: toRow, col: toCol, isCapture: true, targetPiece });
      }
    }

    return validMoves;
  }

  /** Toàn bộ nước đi hợp lệ của một phe */
  function getAllValidMoves(board, side) {
    const allMoves = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const piece = board[r][c];
        if (!piece || piece.side !== side) continue;
        for (const m of getValidMoves(board, r, c)) {
          allMoves.push({
            from: { row: r, col: c },
            to: { row: m.row, col: m.col },
            isCapture: m.isCapture,
            piece
          });
        }
      }
    }
    return allMoves;
  }

  /**
   * Kiểm tra 1 nước đi có hợp lệ với phe đang tới lượt hay không.
   * Dùng ở cả client (chặn click sai) và khi nhận state từ mạng (chống gian lận).
   */
  function validateMove(board, from, to, turnSide) {
    if (!from || !to) {
      return { isValid: false, error: 'Thiếu toạ độ nước đi.' };
    }
    if (!isValidPosition(from.row, from.col) || !isValidPosition(to.row, to.col)) {
      return { isValid: false, error: 'Toạ độ nằm ngoài bàn cờ 9x9.' };
    }

    const piece = board[from.row][from.col];
    if (!piece) {
      return { isValid: false, error: `Không có quân nào ở ô ${posToNotation(from.row, from.col)}.` };
    }
    if (turnSide && piece.side !== turnSide) {
      return { isValid: false, error: `Quân ở ${posToNotation(from.row, from.col)} không thuộc phe đang đi.` };
    }

    const matched = getValidMoves(board, from.row, from.col)
      .find(m => m.row === to.row && m.col === to.col);

    if (!matched) {
      return {
        isValid: false,
        error: `Nước ${posToNotation(from.row, from.col)} → ${posToNotation(to.row, to.col)} không hợp lệ theo luật OTTv2.`
      };
    }

    return { isValid: true, isCapture: matched.isCapture, targetPiece: matched.targetPiece };
  }

  /**
   * Áp nước đi lên một BẢN SAO của bàn cờ (thuần khiết, không mutate input).
   * @returns {{ board: Array, movedPiece: Object, capturedPiece: Object|null }}
   */
  function applyMove(board, from, to) {
    const next = cloneBoard(board);
    const movedPiece = next[from.row][from.col];
    const capturedPiece = next[to.row][to.col];
    next[to.row][to.col] = movedPiece;
    next[from.row][from.col] = null;
    return { board: next, movedPiece, capturedPiece };
  }

  // ==========================================================================
  // 5. ĐẾM QUÂN
  // ==========================================================================

  /**
   * Đếm quân trên bàn, TỔNG và THEO TỪNG LOẠI.
   * byType là thứ luật thắng "ăn hết sạch một loại" dựa vào.
   */
  function countPieces(board) {
    const total = { RED: 0, BLUE: 0 };
    const byType = {
      RED: { ROCK: 0, PAPER: 0, SCISSORS: 0 },
      BLUE: { ROCK: 0, PAPER: 0, SCISSORS: 0 }
    };
    const pieces = { RED: [], BLUE: [] };

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const piece = board[r][c];
        if (!piece) continue;
        if (piece.side !== SIDES.RED && piece.side !== SIDES.BLUE) continue;
        total[piece.side]++;
        if (byType[piece.side][piece.type] !== undefined) {
          byType[piece.side][piece.type]++;
        }
        pieces[piece.side].push({ piece, pos: { row: r, col: c } });
      }
    }

    return {
      RED: total.RED,
      BLUE: total.BLUE,
      total,
      byType,
      pieces
    };
  }

  /**
   * Những LOẠI quân của `side` đã bị ăn hết sạch (0 quân còn lại,
   * trong khi lúc bắt đầu ván thì có).
   * @returns {Array<string>} ví dụ ['SCISSORS']
   */
  function findEliminatedTypes(board, side) {
    const counts = countPieces(board).byType[side];
    const initial = getInitialTypeCounts()[side];
    const eliminated = [];
    for (const type of TYPE_ORDER) {
      if ((initial[type] || 0) > 0 && (counts[type] || 0) === 0) {
        eliminated.push(type);
      }
    }
    return eliminated;
  }

  // ==========================================================================
  // 6. ĐIỀU KIỆN KẾT THÚC
  // ==========================================================================

  /**
   * Kiểm tra ván đã kết thúc chưa. Gọi NGAY SAU mỗi nước đi.
   *
   * Thứ tự ưu tiên:
   *   1. BASE_INVADED       — có quân địch đứng trên ô căn cứ a1 / i9
   *   2. ALL_PIECES_CAPTURED— mất toàn bộ quân (trường hợp đặc biệt của 3)
   *   3. TYPE_ELIMINATED    — mất sạch hoàn toàn MỘT LOẠI quân  ← luật chính của đề
   *   4. NO_VALID_MOVES     — phe tới lượt không còn nước đi hợp lệ (luật mở rộng)
   *
   * @param {Array} board
   * @param {string} [nextTurnSide] - phe chuẩn bị đi; bỏ qua nếu không cần check bí nước
   */
  function checkGameOver(board, nextTurnSide) {
    const notOver = { isGameOver: false, winner: null, loser: null, reason: null, message: '', detail: null };

    // --- 1. Chiếm căn cứ đối phương -----------------------------------------
    for (const defender of [SIDES.RED, SIDES.BLUE]) {
      const base = BASES[defender];
      const occupant = board[base.row][base.col];
      if (occupant && occupant.side !== defender) {
        const winner = occupant.side;
        return {
          isGameOver: true,
          winner,
          loser: defender,
          reason: GAME_OVER_REASONS.BASE_INVADED,
          message: `Phe ${SIDE_NAMES_VI[winner]} đã chiếm căn cứ ${base.notation} của phe ${SIDE_NAMES_VI[defender]}!`,
          detail: { base: base.notation, pieceType: occupant.type }
        };
      }
    }

    const counts = countPieces(board);

    // --- 2 & 3. Mất sạch toàn bộ quân / mất sạch một loại quân ---------------
    for (const defender of [SIDES.RED, SIDES.BLUE]) {
      const winner = opponentOf(defender);

      if (counts.total[defender] === 0) {
        return {
          isGameOver: true,
          winner,
          loser: defender,
          reason: GAME_OVER_REASONS.ALL_PIECES_CAPTURED,
          message: `Phe ${SIDE_NAMES_VI[defender]} đã mất toàn bộ quân! Phe ${SIDE_NAMES_VI[winner]} thắng.`,
          detail: { eliminatedTypes: TYPE_ORDER.slice() }
        };
      }

      const eliminated = findEliminatedTypes(board, defender);
      if (eliminated.length > 0) {
        const names = eliminated.map(t => TYPE_NAMES_VI[t]).join(', ');
        return {
          isGameOver: true,
          winner,
          loser: defender,
          reason: GAME_OVER_REASONS.TYPE_ELIMINATED,
          message: `Phe ${SIDE_NAMES_VI[defender]} đã bị ăn hết sạch quân ${names}! Phe ${SIDE_NAMES_VI[winner]} thắng.`,
          detail: { eliminatedTypes: eliminated }
        };
      }
    }

    // --- 4. Bí nước (luật mở rộng) ------------------------------------------
    if (nextTurnSide === SIDES.RED || nextTurnSide === SIDES.BLUE) {
      if (getAllValidMoves(board, nextTurnSide).length === 0) {
        const winner = opponentOf(nextTurnSide);
        return {
          isGameOver: true,
          winner,
          loser: nextTurnSide,
          reason: GAME_OVER_REASONS.NO_VALID_MOVES,
          message: `Phe ${SIDE_NAMES_VI[nextTurnSide]} không còn nước đi hợp lệ! Phe ${SIDE_NAMES_VI[winner]} thắng.`,
          detail: null
        };
      }
    }

    return notOver;
  }

  // ==========================================================================
  // 7. EXPORT
  // ==========================================================================

  return {
    // hằng số
    BOARD_SIZE,
    SIDES,
    PIECE_TYPES,
    TYPE_ORDER,
    TYPE_NAMES_VI,
    SIDE_NAMES_VI,
    BASES,
    DIRECTIONS,
    BEATS,
    GAME_OVER_REASONS,

    // tiện ích
    opponentOf,
    canCapture,
    isValidPosition,
    posToNotation,
    notationToPos,
    baseOwnerAt,
    cloneBoard,

    // bàn cờ & nước đi
    createInitialBoard,
    getInitialTypeCounts,
    getValidMoves,
    getAllValidMoves,
    validateMove,
    applyMove,

    // đếm quân & kết thúc
    countPieces,
    findEliminatedTypes,
    checkGameOver
  };
}));

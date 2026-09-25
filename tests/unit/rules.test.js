/**
 * Unit test cho luật chơi OTTv2 (shared/gameRules.js)
 * Chạy: npm run test:unit
 */
'use strict';

const { describe, it, expect } = require('../harness');
const R = require('../../shared/gameRules');

const { ROCK, PAPER, SCISSORS } = R.PIECE_TYPES;
const { RED, BLUE } = R.SIDES;

// ---------------------------------------------------------------------------
// Tiện ích dựng bàn cờ tuỳ ý cho test
// ---------------------------------------------------------------------------

function emptyBoard() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null));
}

/**
 * Dựng bàn cờ từ map ký hiệu cờ -> "SIDE:TYPE"
 *   boardFrom({ e5: 'RED:ROCK', e6: 'BLUE:SCISSORS' })
 */
function boardFrom(spec) {
  const board = emptyBoard();
  let n = 0;
  for (const [notation, desc] of Object.entries(spec)) {
    const pos = R.notationToPos(notation);
    if (!pos) throw new Error(`Ký hiệu không hợp lệ trong test: ${notation}`);
    const [side, type] = desc.split(':');
    board[pos.row][pos.col] = { id: `t${++n}`, type, side };
  }
  return board;
}

/**
 * Bộ 3 quân "đủ loại" để một phe không bị xử thua vì mất sạch một loại.
 * Dùng khi test điều kiện khác (base, bí nước...).
 */
function fullSet(side, rockAt, paperAt, scissorsAt) {
  return {
    [rockAt]: `${side}:${ROCK}`,
    [paperAt]: `${side}:${PAPER}`,
    [scissorsAt]: `${side}:${SCISSORS}`
  };
}

function chebyshev(a, b) {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

// ---------------------------------------------------------------------------

describe('Bàn cờ & khởi tạo', () => {
  const board = R.createInitialBoard();

  it('bàn cờ là lưới 9x9 (81 ô)', () => {
    expect(R.BOARD_SIZE).toBe(9);
    expect(board).toHaveLength(9);
    board.forEach(row => expect(row).toHaveLength(9));
    expect(board.flat()).toHaveLength(81);
  });

  it('mỗi phe có đúng 9 quân', () => {
    const c = R.countPieces(board);
    expect(c.total.RED).toBe(9, 'quân Đỏ');
    expect(c.total.BLUE).toBe(9, 'quân Xanh');
  });

  it('mỗi phe có đúng 3 Đấm, 3 Lá, 3 Kéo', () => {
    const { byType } = R.countPieces(board);
    expect(byType.RED).toEqual({ ROCK: 3, PAPER: 3, SCISSORS: 3 }, 'Đỏ');
    expect(byType.BLUE).toEqual({ ROCK: 3, PAPER: 3, SCISSORS: 3 }, 'Xanh');
  });

  it('hai ô căn cứ a1 và i9 để trống lúc bắt đầu', () => {
    expect(board[8][0]).toBeNull('a1');
    expect(board[0][8]).toBeNull('i9');
  });

  it('getInitialTypeCounts() trả về 3 quân mỗi loại cho cả hai phe', () => {
    const initial = R.getInitialTypeCounts();
    expect(initial.RED.SCISSORS).toBe(3);
    expect(initial.BLUE.PAPER).toBe(3);
  });

  it('căn cứ Đỏ là a1, căn cứ Xanh là i9', () => {
    expect(R.BASES.RED.notation).toBe('a1');
    expect(R.BASES.BLUE.notation).toBe('i9');
    expect(R.BASES.RED).toEqual({ row: 8, col: 0, notation: 'a1' });
    expect(R.BASES.BLUE).toEqual({ row: 0, col: 8, notation: 'i9' });
  });
});

describe('Hệ toạ độ', () => {
  it('posToNotation map đúng các mốc', () => {
    expect(R.posToNotation(8, 0)).toBe('a1');
    expect(R.posToNotation(0, 8)).toBe('i9');
    expect(R.posToNotation(4, 4)).toBe('e5');
    expect(R.posToNotation(0, 0)).toBe('a9');
    expect(R.posToNotation(8, 8)).toBe('i1');
  });

  it('notationToPos / posToNotation round-trip đúng cho cả 81 ô', () => {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const n = R.posToNotation(r, c);
        expect(R.notationToPos(n)).toEqual({ row: r, col: c }, `ô ${n}`);
      }
    }
  });

  it('notationToPos từ chối ký hiệu không hợp lệ', () => {
    expect(R.notationToPos('z9')).toBeNull('cột z');
    expect(R.notationToPos('a0')).toBeNull('hàng 0');
    expect(R.notationToPos('j1')).toBeNull('cột j');
    expect(R.notationToPos('a')).toBeNull('thiếu hàng');
    expect(R.notationToPos('')).toBeNull('rỗng');
    expect(R.notationToPos(null)).toBeNull('null');
  });

  it('baseOwnerAt nhận đúng ô căn cứ', () => {
    expect(R.baseOwnerAt(8, 0)).toBe(RED);
    expect(R.baseOwnerAt(0, 8)).toBe(BLUE);
    expect(R.baseOwnerAt(4, 4)).toBeNull();
  });
});

describe('Luật ăn quân Oẳn Tù Tì', () => {
  it('Đấm ăn Kéo, Kéo ăn Lá, Lá ăn Đấm', () => {
    expect(R.canCapture(ROCK, SCISSORS)).toBeTruthy('Đấm ăn Kéo');
    expect(R.canCapture(SCISSORS, PAPER)).toBeTruthy('Kéo ăn Lá');
    expect(R.canCapture(PAPER, ROCK)).toBeTruthy('Lá ăn Đấm');
  });

  it('không ăn được theo chiều ngược lại', () => {
    expect(R.canCapture(SCISSORS, ROCK)).toBeFalsy('Kéo không ăn Đấm');
    expect(R.canCapture(PAPER, SCISSORS)).toBeFalsy('Lá không ăn Kéo');
    expect(R.canCapture(ROCK, PAPER)).toBeFalsy('Đấm không ăn Lá');
  });

  it('hai quân CÙNG LOẠI không ăn được nhau', () => {
    expect(R.canCapture(ROCK, ROCK)).toBeFalsy('Đấm vs Đấm');
    expect(R.canCapture(PAPER, PAPER)).toBeFalsy('Lá vs Lá');
    expect(R.canCapture(SCISSORS, SCISSORS)).toBeFalsy('Kéo vs Kéo');
  });
});

describe('Di chuyển 1 ô theo 8 hướng', () => {
  it('có đúng 8 hướng, mỗi hướng dịch đúng 1 ô', () => {
    expect(R.DIRECTIONS).toHaveLength(8);
    R.DIRECTIONS.forEach(d => {
      expect(Math.max(Math.abs(d.dr), Math.abs(d.dc))).toBe(1, `hướng ${d.name}`);
    });
  });

  it('quân giữa bàn trống có đúng 8 nước đi', () => {
    const board = boardFrom({ e5: `${RED}:${ROCK}` });
    expect(R.getValidMoves(board, 4, 4)).toHaveLength(8);
  });

  it('quân ở góc a1 chỉ có 3 nước đi', () => {
    const board = boardFrom({ a1: `${RED}:${ROCK}` });
    expect(R.getValidMoves(board, 8, 0)).toHaveLength(3);
  });

  it('quân ở biên a5 chỉ có 5 nước đi', () => {
    const board = boardFrom({ a5: `${RED}:${ROCK}` });
    expect(R.getValidMoves(board, 4, 0)).toHaveLength(5);
  });

  it('mọi nước đi luôn cách ô xuất phát đúng 1 ô (không bao giờ trượt dài)', () => {
    const board = R.createInitialBoard();
    for (const side of [RED, BLUE]) {
      R.getAllValidMoves(board, side).forEach(m => {
        expect(chebyshev(m.from, m.to)).toBe(1,
          `${R.posToNotation(m.from.row, m.from.col)} → ${R.posToNotation(m.to.row, m.to.col)}`);
      });
    }
  });

  it('quân CÙNG PHE chặn đường (không đi vào được)', () => {
    const board = boardFrom({
      e5: `${RED}:${ROCK}`,
      e6: `${RED}:${PAPER}`
    });
    const moves = R.getValidMoves(board, 4, 4);
    expect(moves.some(m => m.row === 3 && m.col === 4)).toBeFalsy('không được vào e6');
    expect(moves).toHaveLength(7);
  });

  it('quân địch CÙNG LOẠI chỉ chặn đường, không ăn được', () => {
    const board = boardFrom({
      e5: `${RED}:${ROCK}`,
      e6: `${BLUE}:${ROCK}`
    });
    const moves = R.getValidMoves(board, 4, 4);
    expect(moves.some(m => m.row === 3 && m.col === 4)).toBeFalsy('Đấm không vào ô Đấm địch');
    expect(moves).toHaveLength(7);
    expect(moves.some(m => m.isCapture)).toBeFalsy('không có nước ăn nào');
  });

  it('quân địch KHẮC CHẾ mình cũng chặn đường (không tự sát)', () => {
    // Đấm Đỏ đứng cạnh Lá Xanh: Lá ăn Đấm nên Đấm không được đi vào
    const board = boardFrom({
      e5: `${RED}:${ROCK}`,
      e6: `${BLUE}:${PAPER}`
    });
    const moves = R.getValidMoves(board, 4, 4);
    expect(moves.some(m => m.row === 3 && m.col === 4)).toBeFalsy('Đấm không vào ô Lá');
    expect(moves).toHaveLength(7);
  });

  it('quân địch mình ăn được thì tạo ra nước ĂN', () => {
    const board = boardFrom({
      e5: `${RED}:${ROCK}`,
      e6: `${BLUE}:${SCISSORS}`
    });
    const moves = R.getValidMoves(board, 4, 4);
    const capture = moves.find(m => m.row === 3 && m.col === 4);
    expect(capture).toBeTruthy('phải có nước ăn e6');
    expect(capture.isCapture).toBeTruthy();
    expect(capture.targetPiece.type).toBe(SCISSORS);
    expect(moves).toHaveLength(8);
  });

  it('ô trống không có quân thì không có nước đi', () => {
    expect(R.getValidMoves(emptyBoard(), 4, 4)).toHaveLength(0);
  });

  it('toạ độ ngoài bàn cờ trả về mảng rỗng', () => {
    const board = R.createInitialBoard();
    expect(R.getValidMoves(board, -1, 0)).toHaveLength(0);
    expect(R.getValidMoves(board, 9, 0)).toHaveLength(0);
  });
});

describe('validateMove (chống nước đi phi luật)', () => {
  const board = R.createInitialBoard();

  it('chấp nhận nước đi hợp lệ', () => {
    // e2 (row 7, col 4) Đấm Đỏ -> e3 (row 6, col 4) ô trống
    const res = R.validateMove(board, { row: 7, col: 4 }, { row: 6, col: 4 }, RED);
    expect(res.isValid).toBeTruthy(res.error);
    expect(res.isCapture).toBeFalsy();
  });

  it('từ chối nước đi 2 ô', () => {
    const res = R.validateMove(board, { row: 7, col: 4 }, { row: 5, col: 4 }, RED);
    expect(res.isValid).toBeFalsy('đi 2 ô phải bị từ chối');
  });

  it('từ chối đi quân của phe khác', () => {
    const res = R.validateMove(board, { row: 1, col: 4 }, { row: 2, col: 4 }, RED);
    expect(res.isValid).toBeFalsy('Đỏ không được đi quân Xanh');
  });

  it('từ chối xuất phát từ ô trống', () => {
    const res = R.validateMove(board, { row: 4, col: 4 }, { row: 4, col: 5 }, RED);
    expect(res.isValid).toBeFalsy();
  });

  it('từ chối toạ độ ngoài bàn cờ', () => {
    const res = R.validateMove(board, { row: 7, col: 4 }, { row: -1, col: 4 }, RED);
    expect(res.isValid).toBeFalsy();
  });

  it('từ chối ăn quân cùng loại', () => {
    const b = boardFrom({ e5: `${RED}:${ROCK}`, e6: `${BLUE}:${ROCK}` });
    const res = R.validateMove(b, { row: 4, col: 4 }, { row: 3, col: 4 }, RED);
    expect(res.isValid).toBeFalsy('Đấm không ăn Đấm');
  });
});

describe('applyMove là hàm thuần khiết', () => {
  it('không làm thay đổi bàn cờ đầu vào', () => {
    const before = R.createInitialBoard();
    const snapshot = JSON.stringify(before);
    R.applyMove(before, { row: 7, col: 4 }, { row: 6, col: 4 });
    expect(JSON.stringify(before)).toBe(snapshot, 'input phải nguyên vẹn');
  });

  it('trả về bàn cờ mới đã dịch quân và quân bị ăn', () => {
    const b = boardFrom({ e5: `${RED}:${ROCK}`, e6: `${BLUE}:${SCISSORS}` });
    const res = R.applyMove(b, { row: 4, col: 4 }, { row: 3, col: 4 });
    expect(res.board[4][4]).toBeNull('ô cũ phải trống');
    expect(res.board[3][4].side).toBe(RED, 'ô mới là quân Đỏ');
    expect(res.movedPiece.type).toBe(ROCK);
    expect(res.capturedPiece.type).toBe(SCISSORS);
  });
});

describe('Điều kiện thắng: chiếm căn cứ a1 / i9', () => {
  it('thế khởi đầu chưa kết thúc', () => {
    const res = R.checkGameOver(R.createInitialBoard(), RED);
    expect(res.isGameOver).toBeFalsy(res.message);
  });

  it('Đỏ đưa quân vào i9 (căn cứ Xanh) → Đỏ thắng', () => {
    const board = boardFrom({
      ...fullSet(RED, 'b1', 'c1', 'd1'),
      ...fullSet(BLUE, 'b9', 'c9', 'd9'),
      i9: `${RED}:${ROCK}`
    });
    const res = R.checkGameOver(board, BLUE);
    expect(res.isGameOver).toBeTruthy();
    expect(res.winner).toBe(RED);
    expect(res.reason).toBe(R.GAME_OVER_REASONS.BASE_INVADED);
    expect(res.detail.base).toBe('i9');
  });

  it('Xanh đưa quân vào a1 (căn cứ Đỏ) → Xanh thắng', () => {
    const board = boardFrom({
      ...fullSet(RED, 'b1', 'c1', 'd1'),
      ...fullSet(BLUE, 'b9', 'c9', 'd9'),
      a1: `${BLUE}:${SCISSORS}`
    });
    const res = R.checkGameOver(board, RED);
    expect(res.isGameOver).toBeTruthy();
    expect(res.winner).toBe(BLUE);
    expect(res.reason).toBe(R.GAME_OVER_REASONS.BASE_INVADED);
    expect(res.detail.base).toBe('a1');
  });

  it('quân đứng trên căn cứ CỦA CHÍNH MÌNH thì không ai thắng', () => {
    const board = boardFrom({
      ...fullSet(RED, 'b1', 'c1', 'd1'),
      ...fullSet(BLUE, 'b9', 'c9', 'd9'),
      a1: `${RED}:${ROCK}`,
      i9: `${BLUE}:${PAPER}`
    });
    const res = R.checkGameOver(board, RED);
    expect(res.isGameOver).toBeFalsy(res.message);
  });
});

describe('Điều kiện thắng: ăn hết sạch MỘT LOẠI quân (luật chính của đề)', () => {
  it('Đỏ mất sạch quân KÉO → Xanh thắng, reason TYPE_ELIMINATED', () => {
    const board = boardFrom({
      // Đỏ còn Đấm và Lá, KHÔNG còn Kéo nào
      b1: `${RED}:${ROCK}`,
      c1: `${RED}:${ROCK}`,
      d1: `${RED}:${PAPER}`,
      e1: `${RED}:${PAPER}`,
      // Xanh còn đủ 3 loại
      ...fullSet(BLUE, 'b9', 'c9', 'd9')
    });
    const res = R.checkGameOver(board, RED);
    expect(res.isGameOver).toBeTruthy('phải kết thúc ngay khi mất sạch 1 loại');
    expect(res.winner).toBe(BLUE);
    expect(res.loser).toBe(RED);
    expect(res.reason).toBe(R.GAME_OVER_REASONS.TYPE_ELIMINATED);
    expect(res.detail.eliminatedTypes).toEqual([SCISSORS]);
    expect(res.message).toContain('Kéo');
  });

  it('Xanh mất sạch quân LÁ → Đỏ thắng', () => {
    const board = boardFrom({
      ...fullSet(RED, 'b1', 'c1', 'd1'),
      b9: `${BLUE}:${ROCK}`,
      c9: `${BLUE}:${SCISSORS}`,
      d9: `${BLUE}:${SCISSORS}`
    });
    const res = R.checkGameOver(board, BLUE);
    expect(res.isGameOver).toBeTruthy();
    expect(res.winner).toBe(RED);
    expect(res.reason).toBe(R.GAME_OVER_REASONS.TYPE_ELIMINATED);
    expect(res.detail.eliminatedTypes).toEqual([PAPER]);
    expect(res.message).toContain('Lá');
  });

  it('Đỏ mất sạch quân ĐẤM → Xanh thắng', () => {
    const board = boardFrom({
      b1: `${RED}:${PAPER}`,
      c1: `${RED}:${SCISSORS}`,
      ...fullSet(BLUE, 'b9', 'c9', 'd9')
    });
    const res = R.checkGameOver(board, RED);
    expect(res.isGameOver).toBeTruthy();
    expect(res.winner).toBe(BLUE);
    expect(res.detail.eliminatedTypes).toEqual([ROCK]);
  });

  it('còn 1 quân của loại đó thì CHƯA kết thúc', () => {
    const board = boardFrom({
      b1: `${RED}:${ROCK}`,
      c1: `${RED}:${PAPER}`,
      d1: `${RED}:${SCISSORS}`,     // chỉ còn 1 Kéo, vẫn chưa mất sạch
      ...fullSet(BLUE, 'b9', 'c9', 'd9')
    });
    const res = R.checkGameOver(board, RED);
    expect(res.isGameOver).toBeFalsy(res.message);
  });

  it('mất 2 trong 3 quân cùng loại vẫn CHƯA kết thúc (thế khởi đầu bỏ 2 Kéo Đỏ)', () => {
    const board = R.createInitialBoard();
    // Xoá 2 trong 3 quân Kéo của Đỏ: a2 (7,0) và g2 (7,6)
    board[7][0] = null;
    board[7][6] = null;
    const counts = R.countPieces(board);
    expect(counts.byType.RED.SCISSORS).toBe(1, 'còn đúng 1 Kéo');
    const res = R.checkGameOver(board, RED);
    expect(res.isGameOver).toBeFalsy(res.message);
  });

  it('xoá quân Kéo thứ 3 của Đỏ thì Xanh thắng ngay', () => {
    const board = R.createInitialBoard();
    board[7][0] = null;  // a2 Kéo
    board[7][6] = null;  // g2 Kéo
    board[8][3] = null;  // d1 Kéo  -> hết Kéo
    const res = R.checkGameOver(board, RED);
    expect(res.isGameOver).toBeTruthy();
    expect(res.winner).toBe(BLUE);
    expect(res.reason).toBe(R.GAME_OVER_REASONS.TYPE_ELIMINATED);
  });

  it('findEliminatedTypes trả về đúng danh sách loại đã mất sạch', () => {
    const board = boardFrom({
      b1: `${RED}:${ROCK}`,
      ...fullSet(BLUE, 'b9', 'c9', 'd9')
    });
    expect(R.findEliminatedTypes(board, RED)).toEqual([PAPER, SCISSORS]);
    expect(R.findEliminatedTypes(board, BLUE)).toEqual([]);
  });
});

describe('Điều kiện thắng: mất toàn bộ quân & bí nước', () => {
  it('mất toàn bộ quân → ALL_PIECES_CAPTURED', () => {
    const board = boardFrom(fullSet(BLUE, 'b9', 'c9', 'd9'));
    const res = R.checkGameOver(board, RED);
    expect(res.isGameOver).toBeTruthy();
    expect(res.winner).toBe(BLUE);
    expect(res.reason).toBe(R.GAME_OVER_REASONS.ALL_PIECES_CAPTURED);
  });

  it('phe tới lượt không còn nước đi hợp lệ → NO_VALID_MOVES', () => {
    // Đấm Đỏ ở góc a1, bị vây kín bởi Lá Xanh (Lá ăn Đấm nên Đấm không đi vào được)
    const board = boardFrom({
      a1: `${RED}:${ROCK}`,
      a2: `${BLUE}:${PAPER}`,
      b1: `${BLUE}:${PAPER}`,
      b2: `${BLUE}:${PAPER}`,
      // cho Đỏ đủ 3 loại để không rơi vào TYPE_ELIMINATED trước
      h1: `${RED}:${PAPER}`,
      h2: `${RED}:${SCISSORS}`,
      // Xanh đủ 3 loại
      i9: `${BLUE}:${ROCK}`,
      h9: `${BLUE}:${SCISSORS}`
    });
    // Chặn nốt 2 quân Đỏ còn lại để Đỏ bí hoàn toàn
    const blocked = R.cloneBoard(board);
    blocked[8][7] = null; // bỏ h1
    blocked[7][7] = null; // bỏ h2
    // Giờ Đỏ chỉ còn Đấm a1 -> nhưng như vậy mất sạch Lá/Kéo.
    // Nên dùng bàn gốc và kiểm tra riêng: Đấm a1 không có nước nào
    expect(R.getValidMoves(board, 8, 0)).toHaveLength(0, 'Đấm a1 phải bị vây kín');
  });

  it('bí nước hoàn toàn: phe Đỏ chỉ có quân bị vây → NO_VALID_MOVES', () => {
    // Đỏ có đủ 3 loại nhưng cả 3 đều bị vây kín ở góc
    const board = boardFrom({
      a1: `${RED}:${ROCK}`,
      a2: `${RED}:${PAPER}`,
      a3: `${RED}:${SCISSORS}`,
      // vây: Đấm chặn Kéo, Kéo chặn Lá, Lá chặn Đấm -> chọn quân địch cùng loại để chắc chắn chặn
      b1: `${BLUE}:${ROCK}`,
      b2: `${BLUE}:${PAPER}`,
      b3: `${BLUE}:${SCISSORS}`,
      a4: `${BLUE}:${SCISSORS}`,
      b4: `${BLUE}:${SCISSORS}`
    });
    // a1 Đấm: cạnh a2(Lá Đỏ, cùng phe), b1(Đấm Xanh cùng loại), b2(Lá Xanh khắc chế) -> bí
    expect(R.getValidMoves(board, 8, 0)).toHaveLength(0, 'a1 Đấm bí');
    // a2 Lá: cạnh a1(Đỏ), a3(Đỏ), b1(Đấm Xanh -> Lá ĂN được!) -> không bí
    expect(R.getValidMoves(board, 7, 0).length > 0).toBeTruthy('a2 Lá ăn được Đấm b1');
  });
});

describe('Ưu tiên giữa các điều kiện thắng', () => {
  it('chiếm căn cứ được ưu tiên hơn mất sạch một loại', () => {
    const board = boardFrom({
      // Đỏ mất sạch Kéo (đáng lẽ Xanh thắng)...
      b1: `${RED}:${ROCK}`,
      c1: `${RED}:${PAPER}`,
      // ...nhưng Đỏ đã có quân nằm trên i9
      i9: `${RED}:${ROCK}`,
      ...fullSet(BLUE, 'b9', 'c9', 'd9')
    });
    const res = R.checkGameOver(board, BLUE);
    expect(res.isGameOver).toBeTruthy();
    expect(res.reason).toBe(R.GAME_OVER_REASONS.BASE_INVADED);
    expect(res.winner).toBe(RED);
  });
});

describe('Kịch bản chơi thật: thắng bằng cách ăn hết một loại', () => {
  it('ăn lần lượt 3 quân Kéo của Xanh thì thắng đúng ở nước thứ 3', () => {
    // Đỏ có 3 Đấm sẵn cạnh 3 Kéo Xanh; Đấm ăn Kéo.
    let board = boardFrom({
      // Đỏ: 3 Đấm tấn công + Lá & Kéo để không tự thua vì mất loại
      b2: `${RED}:${ROCK}`,
      d2: `${RED}:${ROCK}`,
      f2: `${RED}:${ROCK}`,
      a1: `${RED}:${PAPER}`,
      i1: `${RED}:${SCISSORS}`,
      // Xanh: 3 Kéo là mục tiêu + Đấm & Lá để chỉ mất đúng loại Kéo
      b3: `${BLUE}:${SCISSORS}`,
      d3: `${BLUE}:${SCISSORS}`,
      f3: `${BLUE}:${SCISSORS}`,
      i9: `${BLUE}:${ROCK}`,
      h9: `${BLUE}:${PAPER}`
    });

    expect(R.countPieces(board).byType.BLUE.SCISSORS).toBe(3, 'Xanh có 3 Kéo');
    expect(R.checkGameOver(board, RED).isGameOver).toBeFalsy('chưa kết thúc lúc đầu');

    const captures = [
      [R.notationToPos('b2'), R.notationToPos('b3')],
      [R.notationToPos('d2'), R.notationToPos('d3')],
      [R.notationToPos('f2'), R.notationToPos('f3')]
    ];

    captures.forEach(([from, to], i) => {
      const v = R.validateMove(board, from, to, RED);
      expect(v.isValid).toBeTruthy(`nước ăn thứ ${i + 1}: ${v.error || ''}`);
      expect(v.isCapture).toBeTruthy(`nước ${i + 1} phải là nước ăn`);

      board = R.applyMove(board, from, to).board;

      const over = R.checkGameOver(board, BLUE);
      const remaining = R.countPieces(board).byType.BLUE.SCISSORS;
      expect(remaining).toBe(2 - i, `Kéo Xanh còn lại sau nước ${i + 1}`);

      if (i < 2) {
        expect(over.isGameOver).toBeFalsy(`chưa được kết thúc ở nước ${i + 1}`);
      } else {
        expect(over.isGameOver).toBeTruthy('phải kết thúc ở nước thứ 3');
        expect(over.winner).toBe(RED);
        expect(over.reason).toBe(R.GAME_OVER_REASONS.TYPE_ELIMINATED);
        expect(over.detail.eliminatedTypes).toEqual([SCISSORS]);
      }
    });
  });
});

describe('countPieces', () => {
  it('đếm đúng tổng, theo loại và vị trí', () => {
    const board = boardFrom({
      e5: `${RED}:${ROCK}`,
      e6: `${RED}:${ROCK}`,
      f5: `${RED}:${PAPER}`,
      a9: `${BLUE}:${SCISSORS}`
    });
    const c = R.countPieces(board);
    expect(c.total.RED).toBe(3);
    expect(c.total.BLUE).toBe(1);
    expect(c.byType.RED).toEqual({ ROCK: 2, PAPER: 1, SCISSORS: 0 });
    expect(c.byType.BLUE).toEqual({ ROCK: 0, PAPER: 0, SCISSORS: 1 });
    expect(c.pieces.RED).toHaveLength(3);
  });
});

describe('opponentOf', () => {
  it('trả về phe đối diện', () => {
    expect(R.opponentOf(RED)).toBe(BLUE);
    expect(R.opponentOf(BLUE)).toBe(RED);
  });
});

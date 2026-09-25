/**
 * Mô hình trạng thái một trận OTTv2.
 *
 * NGUYÊN TẮC THIẾT KẾ QUAN TRỌNG:
 * State chia sẻ qua mạng chỉ lưu DANH SÁCH NƯỚC ĐI, không lưu bàn cờ.
 * Bàn cờ luôn được suy ra (replay) từ vị trí khởi đầu.
 *
 * Nhờ vậy:
 *   - Hai máy không thể lệch bàn cờ: cùng danh sách nước đi -> cùng bàn cờ.
 *   - Không cần "last write wins" trên cả bàn cờ (thứ gây mất nước đi).
 *   - Điểm số suy ra từ bảng kết quả từng vòng -> không thể cộng đôi.
 *   - Nước đi phi luật bị loại lúc replay -> client sửa code cũng không gian lận được.
 */
(function (global) {
  'use strict';

  const R = global.GameRules;
  const OTT = global.OTT || (global.OTT = {});

  /**
   * Tạo state khởi đầu cho một trận mới.
   * seating = 'claims': ghế được SUY RA từ bảng claims (mỗi người chỉ ghi khoá của
   *   chính mình -> không bao giờ có hai người ghi tranh cùng một khoá -> không race).
   * seating = 'fixed' : ghế do tầng trên quyết định (dùng cho các bàn của giải đội).
   */
  function createMatch({ code, name, mode = '1v1', timePerTurn = 30, createdBy = null, teamCode = null, boardIndex = 0, fixedPlayers = null, seating = 'fixed' }) {
    return {
      code,
      name: name || `Phòng ${code}`,
      mode,                       // '1v1' | 'team'
      timePerTurn: Number(timePerTurn) || 30,
      createdAt: Date.now(),
      createdBy,
      teamCode,                   // mã trận đội, null nếu là 1v1
      boardIndex,                 // 0 | 1 — bàn số mấy trong trận đội
      seating,
      players: fixedPlayers || { RED: null, BLUE: null },
      claims: {},                 // { [playerId]: { id, name, at, spectator } }
      spectators: {},             // chỉ dùng khi seating = 'fixed'
      round: 1,
      moves: [],                  // [{ id, seq, side, from, to, at }]
      results: {},                // { [round]: { winner, reason, message, at } }
      resign: null,               // { round, side, by }
      timeout: null,              // { round, side, at }
      rematch: {},                // { [playerId]: round }
      chat: [],                   // [{ id, name, side, text, at }] — giới hạn 60
      startedAt: null             // thời điểm đủ 2 người, để tính đồng hồ nước đầu
    };
  }

  /** So sánh 2 nước đi cùng seq để chọn ra nước "thắng" một cách tất định trên mọi máy */
  function compareMove(a, b) {
    const at = (a.at || 0) - (b.at || 0);
    if (at !== 0) return at;
    return String(a.id || '').localeCompare(String(b.id || ''));
  }

  /** Chặn trên số nước đi để một client lỗi không thể làm treo vòng replay */
  const MAX_MOVES = 2000;

  /**
   * Gom nước đi theo seq. Mỗi seq giữ TẤT CẢ ứng viên, sắp theo thứ tự tất định.
   *
   * Không chốt "nước thắng" ở bước này: một client lỗi/gian lận có thể ghi nước
   * rác với timestamp sớm, nếu chốt sớm thì nước rác đó sẽ chặn cả ván.
   * Việc chọn để dành cho lúc replay — lấy ứng viên HỢP LỆ đầu tiên.
   */
  function groupMovesBySeq(raw) {
    const bySeq = new Map();
    for (const m of Array.isArray(raw) ? raw : []) {
      if (!m || !m.from || !m.to) continue;
      const seq = Number(m.seq);
      if (!Number.isInteger(seq) || seq < 1 || seq > MAX_MOVES) continue;
      if (!bySeq.has(seq)) bySeq.set(seq, []);
      bySeq.get(seq).push(m);
    }
    for (const list of bySeq.values()) list.sort(compareMove);
    return bySeq;
  }

  /** Danh sách nước đi đã chuẩn hoá theo thứ tự tất định (dùng để debug / hiển thị) */
  function normalizeMoves(raw) {
    const bySeq = groupMovesBySeq(raw);
    const ordered = [];
    for (let seq = 1; bySeq.has(seq); seq++) ordered.push(bySeq.get(seq)[0]);
    return ordered;
  }

  /**
   * Suy ra ai ngồi ghế nào từ bảng claims.
   * Thứ tự: theo thời điểm đăng ký (at) tăng dần, cùng at thì theo id -> TẤT ĐỊNH
   * và giống nhau trên mọi máy. Người thứ 3 trở đi thành khán giả.
   */
  function playersFromClaims(state) {
    const list = Object.values((state && state.claims) || {})
      .filter(c => c && c.id)
      .sort((a, b) => ((a.at || 0) - (b.at || 0)) || String(a.id).localeCompare(String(b.id)));

    const players = { RED: null, BLUE: null };
    const spectators = [];

    for (const c of list) {
      const entry = { id: c.id, name: c.name || 'Người chơi', at: c.at || 0 };
      if (c.spectator) { spectators.push(entry); continue; }
      if (!players.RED) players.RED = entry;
      else if (!players.BLUE) players.BLUE = entry;
      else spectators.push(entry);
    }
    return { players, spectators };
  }

  function sideForSeq(seq) {
    // seq 1 -> RED, seq 2 -> BLUE, ...
    return seq % 2 === 1 ? R.SIDES.RED : R.SIDES.BLUE;
  }

  /**
   * Suy ra toàn bộ thông tin hiển thị được từ state.
   * Đây là hàm duy nhất được phép quyết định bàn cờ / lượt / kết quả.
   */
  function derive(state, opts) {
    const safe = state || {};
    const o = opts || {};
    let board = R.createInitialBoard();
    const applied = [];
    let rulesResult = null;

    const bySeq = groupMovesBySeq(safe.moves);

    for (let seq = 1; seq <= MAX_MOVES; seq++) {
      // Ván đã kết thúc theo luật thì mọi nước sau đó bị bỏ
      if (rulesResult) break;

      const candidates = bySeq.get(seq);
      if (!candidates) break;                   // đứt đoạn seq -> dừng

      const expectedSide = sideForSeq(seq);

      // Lấy ứng viên HỢP LỆ đầu tiên theo thứ tự tất định.
      // Nước sai lượt / phi luật / toạ độ rác đều bị bỏ qua chứ không chặn ván.
      let chosen = null;
      let res = null;
      for (const cand of candidates) {
        if (cand.side !== expectedSide) continue;
        if (!R.validateMove(board, cand.from, cand.to, expectedSide).isValid) continue;
        chosen = cand;
        res = R.applyMove(board, cand.from, cand.to);
        break;
      }
      if (!chosen) break;                       // không có nước hợp lệ nào cho seq này

      board = res.board;
      applied.push({
        ...chosen,
        seq,
        capturedPiece: res.capturedPiece
          ? { type: res.capturedPiece.type, side: res.capturedPiece.side }
          : null,
        notation: `${R.posToNotation(chosen.from.row, chosen.from.col)} → ${R.posToNotation(chosen.to.row, chosen.to.col)}`
      });

      const over = R.checkGameOver(board, sideForSeq(seq + 1));
      if (over.isGameOver) {
        rulesResult = {
          winner: over.winner,
          loser: over.loser,
          reason: over.reason,
          message: over.message,
          detail: over.detail
        };
      }
    }

    const turn = sideForSeq(applied.length + 1);
    const counts = R.countPieces(board);

    // --- Kết quả: đầu hàng > hết giờ > luật chơi ---
    const round = Number(safe.round) || 1;
    let result = null;
    if (safe.resign && safe.resign.round === round) {
      const loser = safe.resign.side;
      const winner = R.opponentOf(loser);
      result = {
        winner, loser,
        reason: R.GAME_OVER_REASONS.SURRENDER,
        message: `Phe ${R.SIDE_NAMES_VI[loser]} đã đầu hàng. Phe ${R.SIDE_NAMES_VI[winner]} thắng.`
      };
    } else if (safe.timeout && safe.timeout.round === round) {
      const loser = safe.timeout.side;
      const winner = R.opponentOf(loser);
      result = {
        winner, loser,
        reason: R.GAME_OVER_REASONS.TIMEOUT,
        message: `Phe ${R.SIDE_NAMES_VI[loser]} hết thời gian suy nghĩ. Phe ${R.SIDE_NAMES_VI[winner]} thắng.`
      };
    } else if (rulesResult) {
      result = rulesResult;
    }

    // --- Ai ngồi ghế nào ---
    let players;
    let spectators;
    if (o.players) {
      players = o.players;
      spectators = o.spectators || [];
    } else if (safe.seating === 'claims') {
      const seated = playersFromClaims(safe);
      players = seated.players;
      spectators = seated.spectators;
    } else {
      players = safe.players || { RED: null, BLUE: null };
      spectators = Object.values(safe.spectators || {}).filter(Boolean);
    }

    const hasBoth = Boolean(players.RED && players.BLUE);
    const status = !hasBoth ? 'WAITING' : (result ? 'FINISHED' : 'PLAYING');

    // --- Điểm suy ra từ bảng kết quả các vòng đã ghi ---
    const scores = { RED: 0, BLUE: 0 };
    for (const r of Object.values(safe.results || {})) {
      if (r && scores[r.winner] !== undefined) scores[r.winner]++;
    }

    // Mốc bắt đầu ván: nếu không được ghi sẵn thì lấy lúc người thứ hai vào ghế
    let startedAt = o.startedAt || safe.startedAt || null;
    if (!startedAt && hasBoth) {
      const t = Math.max(players.RED.at || 0, players.BLUE.at || 0);
      startedAt = t || null;
    }

    const lastMove = applied.length ? applied[applied.length - 1] : null;
    const turnStartedAt = lastMove ? lastMove.at : startedAt;

    return {
      board,
      players,
      spectators,
      startedAt,
      moves: applied,
      moveCount: applied.length,
      turn,
      status,
      result,
      counts,
      scores,
      lastMove,
      turnStartedAt,
      round,
      hasBoth
    };
  }

  /** Số giây còn lại của lượt hiện tại; null nếu chưa bắt đầu tính */
  function secondsLeft(state, view, now = Date.now()) {
    if (!view || view.status !== 'PLAYING' || !view.turnStartedAt) return null;
    const limit = Number(state.timePerTurn) || 30;
    return Math.max(0, Math.ceil(limit - (now - view.turnStartedAt) / 1000));
  }

  /**
   * Vai của một người: 'RED' | 'BLUE' | 'SPECTATOR'.
   * Nhận vào bất cứ object nào có .players — cả state (seating 'fixed') lẫn view.
   */
  function roleOf(stateOrView, playerId) {
    if (!stateOrView || !playerId) return 'SPECTATOR';
    const p = (stateOrView.seating === 'claims' && !stateOrView.board)
      ? playersFromClaims(stateOrView).players
      : (stateOrView.players || {});
    if (p.RED && p.RED.id === playerId) return R.SIDES.RED;
    if (p.BLUE && p.BLUE.id === playerId) return R.SIDES.BLUE;
    return 'SPECTATOR';
  }

  /** Người này có được đi nước lúc này không */
  function canMove(state, view, playerId) {
    const role = roleOf(view && view.players ? view : state, playerId);
    if (role === 'SPECTATOR') return false;
    return view.status === 'PLAYING' && view.turn === role;
  }

  OTT.Match = {
    createMatch,
    derive,
    normalizeMoves,
    sideForSeq,
    playersFromClaims,
    secondsLeft,
    roleOf,
    canMove
  };
})(typeof window !== 'undefined' ? window : globalThis);

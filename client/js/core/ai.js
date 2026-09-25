/**
 * Bot đơn giản cho chế độ luyện tập một người.
 * Đánh giá: chiếm căn cứ > ăn quân khiến địch mất sạch một loại > ăn quân >
 * tiến về căn cứ địch, và trừ điểm nếu nước đi đó để quân bị ăn lại.
 */
(function (global) {
  'use strict';
  const R = global.GameRules;
  const OTT = global.OTT || (global.OTT = {});

  function pickMove(board, side) {
    const moves = R.getAllValidMoves(board, side);
    if (!moves.length) return null;

    const foe = R.opponentOf(side);
    const targetBase = R.BASES[foe];
    const scored = moves.map(move => {
      let score = Math.random() * 3;

      if (move.to.row === targetBase.row && move.to.col === targetBase.col) score += 1000;

      const next = R.applyMove(board, move.from, move.to).board;

      // Thắng ngay bằng cách ăn hết một loại quân của địch
      if (R.findEliminatedTypes(next, foe).length > 0) score += 800;

      if (move.isCapture) score += 40;

      const dNow = Math.abs(move.from.row - targetBase.row) + Math.abs(move.from.col - targetBase.col);
      const dNext = Math.abs(move.to.row - targetBase.row) + Math.abs(move.to.col - targetBase.col);
      if (dNext < dNow) score += 8;

      // Tránh để địch ăn lại, và tránh để mình mất sạch một loại
      const replies = R.getAllValidMoves(next, foe);
      if (replies.some(r => r.to.row === move.to.row && r.to.col === move.to.col)) {
        score -= 35;
        const after = R.applyMove(next, move.from, move.to);
        void after;
      }
      for (const reply of replies) {
        const afterReply = R.applyMove(next, reply.from, reply.to).board;
        if (R.findEliminatedTypes(afterReply, side).length > 0) { score -= 500; break; }
      }

      return { move, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0].move;
  }

  OTT.Ai = { pickMove };
})(typeof window !== 'undefined' ? window : globalThis);

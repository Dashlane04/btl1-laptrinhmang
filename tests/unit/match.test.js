/**
 * Unit test cho mô hình trạng thái trận (client/js/core/match.js).
 * Trọng tâm: chứng minh hai máy KHÔNG THỂ lệch bàn cờ và điểm KHÔNG THỂ cộng đôi.
 */
'use strict';

const { describe, it, expect } = require('../harness');

// match.js là script cho browser, gắn vào global -> nạp global trước khi require
globalThis.GameRules = require('../../shared/gameRules');
require('../../client/js/core/match.js');

const R = globalThis.GameRules;
const Match = globalThis.OTT.Match;
const { RED, BLUE } = R.SIDES;

function mv(seq, side, fromN, toN, at) {
  return {
    id: `${side}-${seq}`,
    seq,
    side,
    from: R.notationToPos(fromN),
    to: R.notationToPos(toN),
    at: at || 1000 + seq
  };
}

function baseMatch(extra) {
  return Object.assign(Match.createMatch({ code: 'ott-test', createdBy: 'a' }), {
    players: { RED: { id: 'a', name: 'An' }, BLUE: { id: 'b', name: 'Bình' } },
    startedAt: 1000
  }, extra || {});
}

function boardSignature(board) {
  return board.map(row => row.map(c => (c ? c.side[0] + c.type[0] : '..')).join('|')).join('/');
}

describe('createMatch', () => {
  it('sinh state hợp lệ với giá trị mặc định', () => {
    const m = Match.createMatch({ code: 'ott-1', name: 'Test', timePerTurn: 15, createdBy: 'x' });
    expect(m.code).toBe('ott-1');
    expect(m.timePerTurn).toBe(15);
    expect(m.round).toBe(1);
    expect(m.moves).toHaveLength(0);
    expect(m.players).toEqual({ RED: null, BLUE: null });
  });
});

describe('derive: trạng thái phòng', () => {
  it('thiếu người chơi thì status = WAITING', () => {
    const m = Match.createMatch({ code: 'c' });
    m.players.RED = { id: 'a', name: 'An' };
    const v = Match.derive(m);
    expect(v.status).toBe('WAITING');
    expect(v.hasBoth).toBeFalsy();
  });

  it('đủ 2 người thì status = PLAYING, lượt đầu là Đỏ', () => {
    const v = Match.derive(baseMatch());
    expect(v.status).toBe('PLAYING');
    expect(v.turn).toBe(RED);
    expect(v.moveCount).toBe(0);
  });

  it('bàn cờ khởi đầu có 9 quân mỗi phe', () => {
    const v = Match.derive(baseMatch());
    expect(v.counts.total.RED).toBe(9);
    expect(v.counts.total.BLUE).toBe(9);
  });
});

describe('derive: replay nước đi', () => {
  it('áp đúng 2 nước đi và đổi lượt', () => {
    const m = baseMatch({ moves: [mv(1, RED, 'e2', 'e3'), mv(2, BLUE, 'e8', 'e7')] });
    const v = Match.derive(m);
    expect(v.moveCount).toBe(2);
    expect(v.turn).toBe(RED, 'sau 2 nước thì lại tới Đỏ');
    expect(v.board[6][4]).toBeTruthy('e3 phải có quân Đỏ');
    expect(v.board[7][4]).toBeNull('e2 phải trống');
    expect(v.board[2][4]).toBeTruthy('e7 phải có quân Xanh');
  });

  it('gán notation và quân bị ăn cho từng nước', () => {
    const m = baseMatch({ moves: [mv(1, RED, 'e2', 'e3')] });
    const v = Match.derive(m);
    expect(v.moves[0].notation).toBe('e2 → e3');
    expect(v.moves[0].capturedPiece).toBeNull();
  });

  it('bỏ nước đi phi luật (đi 2 ô)', () => {
    const m = baseMatch({ moves: [mv(1, RED, 'e2', 'e4')] });
    const v = Match.derive(m);
    expect(v.moveCount).toBe(0, 'nước 2 ô phải bị loại');
    expect(v.turn).toBe(RED);
  });

  it('bỏ nước đi của phe sai lượt', () => {
    const m = baseMatch({ moves: [mv(1, BLUE, 'e8', 'e7')] });
    const v = Match.derive(m);
    expect(v.moveCount).toBe(0, 'seq 1 phải là Đỏ');
  });

  it('cắt tại chỗ đứt đoạn seq (thiếu seq 2)', () => {
    const m = baseMatch({ moves: [mv(1, RED, 'e2', 'e3'), mv(3, RED, 'c2', 'c3')] });
    const v = Match.derive(m);
    expect(v.moveCount).toBe(1, 'thiếu seq 2 thì dừng ở seq 1');
  });
});

describe('derive: TẤT ĐỊNH — hai máy luôn ra cùng bàn cờ', () => {
  const moves = [
    mv(1, RED, 'e2', 'e3'),
    mv(2, BLUE, 'e8', 'e7'),
    mv(3, RED, 'c2', 'c3'),
    mv(4, BLUE, 'g8', 'g7')
  ];

  it('thứ tự mảng khác nhau vẫn cho bàn cờ giống nhau', () => {
    const inOrder = Match.derive(baseMatch({ moves: moves.slice() }));
    const shuffled = Match.derive(baseMatch({ moves: [moves[2], moves[0], moves[3], moves[1]] }));
    const reversed = Match.derive(baseMatch({ moves: moves.slice().reverse() }));

    expect(boardSignature(shuffled.board)).toBe(boardSignature(inOrder.board), 'mảng xáo trộn');
    expect(boardSignature(reversed.board)).toBe(boardSignature(inOrder.board), 'mảng đảo ngược');
    expect(shuffled.moveCount).toBe(4);
    expect(reversed.moveCount).toBe(4);
  });

  it('hai nước đi tranh cùng seq: chọn tất định theo (at, id)', () => {
    const early = { ...mv(2, BLUE, 'e8', 'e7'), id: 'zzz', at: 5000 };
    const late = { ...mv(2, BLUE, 'g8', 'g7'), id: 'aaa', at: 9000 };

    const v1 = Match.derive(baseMatch({ moves: [mv(1, RED, 'e2', 'e3'), early, late] }));
    const v2 = Match.derive(baseMatch({ moves: [mv(1, RED, 'e2', 'e3'), late, early] }));

    expect(boardSignature(v1.board)).toBe(boardSignature(v2.board), 'phải hội tụ');
    expect(v1.moveCount).toBe(2, 'chỉ 1 trong 2 nước tranh chấp được áp');
    expect(v1.board[2][4]).toBeTruthy('nước at nhỏ hơn (e8→e7) thắng');
  });

  it('cùng at thì phân giải bằng id, vẫn tất định', () => {
    const a = { ...mv(2, BLUE, 'e8', 'e7'), id: 'aaa', at: 7000 };
    const b = { ...mv(2, BLUE, 'g8', 'g7'), id: 'bbb', at: 7000 };
    const v1 = Match.derive(baseMatch({ moves: [mv(1, RED, 'e2', 'e3'), a, b] }));
    const v2 = Match.derive(baseMatch({ moves: [mv(1, RED, 'e2', 'e3'), b, a] }));
    expect(boardSignature(v1.board)).toBe(boardSignature(v2.board));
    expect(v1.board[2][4]).toBeTruthy("id 'aaa' thắng");
  });

  it('nước đi trùng lặp y hệt không bị áp 2 lần', () => {
    const dup = mv(1, RED, 'e2', 'e3');
    const v = Match.derive(baseMatch({ moves: [dup, { ...dup }] }));
    expect(v.moveCount).toBe(1);
  });
});

describe('derive: kết thúc ván', () => {
  it('nước đi sau khi ván đã kết thúc bị bỏ qua', () => {
    // Dựng thế Đỏ ăn quân Kéo cuối của Xanh bằng cách bỏ sẵn 2 Kéo Xanh
    const m = baseMatch();
    // f9 Kéo, c8 Kéo, i8 Kéo là 3 Kéo Xanh. Ta cho Đỏ ăn dần là quá dài,
    // nên test ở mức: sau khi có result thì moveCount không tăng nữa.
    m.moves = [mv(1, RED, 'e2', 'e3'), mv(2, BLUE, 'e8', 'e7')];
    m.resign = { round: 1, side: BLUE, by: 'b' };
    m.moves.push(mv(3, RED, 'c2', 'c3'));
    const v = Match.derive(m);
    expect(v.result).toBeTruthy('phải có kết quả do đầu hàng');
    expect(v.status).toBe('FINISHED');
  });

  it('đầu hàng: phe còn lại thắng, reason SURRENDER', () => {
    const m = baseMatch({ resign: { round: 1, side: RED, by: 'a' } });
    const v = Match.derive(m);
    expect(v.result.winner).toBe(BLUE);
    expect(v.result.loser).toBe(RED);
    expect(v.result.reason).toBe(R.GAME_OVER_REASONS.SURRENDER);
    expect(v.status).toBe('FINISHED');
  });

  it('hết giờ: phe hết giờ thua, reason TIMEOUT', () => {
    const m = baseMatch({ timeout: { round: 1, side: BLUE, at: 9999 } });
    const v = Match.derive(m);
    expect(v.result.winner).toBe(RED);
    expect(v.result.reason).toBe(R.GAME_OVER_REASONS.TIMEOUT);
  });

  it('đầu hàng được ưu tiên hơn hết giờ', () => {
    const m = baseMatch({
      resign: { round: 1, side: RED, by: 'a' },
      timeout: { round: 1, side: BLUE, at: 1 }
    });
    expect(Match.derive(m).result.reason).toBe(R.GAME_OVER_REASONS.SURRENDER);
  });

  it('đầu hàng ở vòng khác không ảnh hưởng vòng hiện tại', () => {
    const m = baseMatch({ round: 2, resign: { round: 1, side: RED, by: 'a' } });
    const v = Match.derive(m);
    expect(v.result).toBeNull('resign vòng 1 không áp cho vòng 2');
    expect(v.status).toBe('PLAYING');
  });
});

describe('Điểm số suy ra từ bảng kết quả (không thể cộng đôi)', () => {
  it('không có kết quả nào thì 0-0', () => {
    const v = Match.derive(baseMatch());
    expect(v.scores).toEqual({ RED: 0, BLUE: 0 });
  });

  it('đếm đúng theo số vòng đã ghi kết quả', () => {
    const m = baseMatch({
      round: 4,
      results: {
        1: { winner: RED, reason: 'X', message: '' },
        2: { winner: BLUE, reason: 'X', message: '' },
        3: { winner: RED, reason: 'X', message: '' }
      }
    });
    expect(Match.derive(m).scores).toEqual({ RED: 2, BLUE: 1 });
  });

  it('derive nhiều lần KHÔNG làm điểm tăng thêm (idempotent)', () => {
    const m = baseMatch({ round: 2, results: { 1: { winner: RED, reason: 'X', message: '' } } });
    const a = Match.derive(m).scores;
    const b = Match.derive(m).scores;
    const c = Match.derive(m).scores;
    expect(a).toEqual({ RED: 1, BLUE: 0 });
    expect(b).toEqual(a, 'lần 2');
    expect(c).toEqual(a, 'lần 3');
  });
});

describe('roleOf / canMove', () => {
  const m = baseMatch();

  it('nhận đúng vai theo playerId', () => {
    expect(Match.roleOf(m, 'a')).toBe(RED);
    expect(Match.roleOf(m, 'b')).toBe(BLUE);
    expect(Match.roleOf(m, 'zzz')).toBe('SPECTATOR');
    expect(Match.roleOf(m, null)).toBe('SPECTATOR');
  });

  it('chỉ phe đang tới lượt được đi', () => {
    const v = Match.derive(m);
    expect(Match.canMove(m, v, 'a')).toBeTruthy('Đỏ đi nước đầu');
    expect(Match.canMove(m, v, 'b')).toBeFalsy('Xanh chưa tới lượt');
  });

  it('khán giả không bao giờ được đi', () => {
    const v = Match.derive(m);
    expect(Match.canMove(m, v, 'khan-gia')).toBeFalsy();
  });

  it('phòng chưa đủ người thì không ai được đi', () => {
    const waiting = Match.createMatch({ code: 'c' });
    waiting.players.RED = { id: 'a', name: 'An' };
    const v = Match.derive(waiting);
    expect(Match.canMove(waiting, v, 'a')).toBeFalsy('status WAITING');
  });

  it('ván đã kết thúc thì không ai được đi', () => {
    const done = baseMatch({ resign: { round: 1, side: RED, by: 'a' } });
    const v = Match.derive(done);
    expect(Match.canMove(done, v, 'a')).toBeFalsy();
    expect(Match.canMove(done, v, 'b')).toBeFalsy();
  });
});

describe('secondsLeft', () => {
  it('tính theo mốc nước đi cuối', () => {
    const m = baseMatch({ timePerTurn: 30, moves: [mv(1, RED, 'e2', 'e3', 10000)] });
    const v = Match.derive(m);
    expect(Match.secondsLeft(m, v, 10000)).toBe(30, 'ngay sau nước đi');
    expect(Match.secondsLeft(m, v, 20000)).toBe(20, 'sau 10 giây');
    expect(Match.secondsLeft(m, v, 45000)).toBe(0, 'quá hạn thì kẹp về 0');
  });

  it('dùng startedAt cho nước đầu tiên', () => {
    const m = baseMatch({ timePerTurn: 15, startedAt: 5000, moves: [] });
    const v = Match.derive(m);
    expect(Match.secondsLeft(m, v, 10000)).toBe(10);
  });

  it('trả null khi chưa vào ván', () => {
    const waiting = Match.createMatch({ code: 'c' });
    expect(Match.secondsLeft(waiting, Match.derive(waiting))).toBeNull();
  });
});

describe('Chống gian lận qua state mạng', () => {
  it('client gửi nước đi vô lý (đặt quân thẳng vào i9) bị loại khi replay', () => {
    const cheat = baseMatch({
      moves: [{ id: 'hack', seq: 1, side: RED, from: R.notationToPos('e2'), to: R.notationToPos('i9'), at: 1 }]
    });
    const v = Match.derive(cheat);
    expect(v.moveCount).toBe(0, 'nước gian lận bị loại');
    expect(v.result).toBeNull('không được thắng bằng nước phi luật');
  });

  it('nước đi với toạ độ rác không làm crash', () => {
    const junk = baseMatch({
      moves: [
        { id: 'j1', seq: 1, side: RED, from: null, to: null, at: 1 },
        { id: 'j2', seq: 1, side: RED, from: { row: 99, col: 99 }, to: { row: -5, col: 3 }, at: 2 },
        mv(1, RED, 'e2', 'e3')
      ]
    });
    const v = Match.derive(junk);
    expect(v.moveCount).toBe(1, 'chỉ nước hợp lệ được áp');
  });

  it('moves không phải mảng cũng không crash', () => {
    const v = Match.derive(baseMatch({ moves: 'không phải mảng' }));
    expect(v.moveCount).toBe(0);
  });

  it('state rỗng / null không crash', () => {
    expect(Match.derive(null).moveCount).toBe(0);
    expect(Match.derive({}).status).toBe('WAITING');
  });
});

describe('Chia ghế tất định từ claims (chống hai người cùng nhận một phe)', () => {
  function withClaims(claims, extra) {
    return Object.assign(Match.createMatch({ code: 'c', seating: 'claims' }), { claims }, extra || {});
  }

  it('người đăng ký trước nhận Đỏ, người sau nhận Xanh', () => {
    const v = Match.derive(withClaims({
      a: { id: 'a', name: 'An', at: 1000 },
      b: { id: 'b', name: 'Bình', at: 2000 }
    }));
    expect(v.players.RED.id).toBe('a');
    expect(v.players.BLUE.id).toBe('b');
    expect(v.status).toBe('PLAYING');
  });

  it('kết quả KHÔNG phụ thuộc thứ tự khoá trong object (mọi máy ra như nhau)', () => {
    const c1 = { a: { id: 'a', name: 'An', at: 1000 }, b: { id: 'b', name: 'Bình', at: 2000 } };
    const c2 = { b: { id: 'b', name: 'Bình', at: 2000 }, a: { id: 'a', name: 'An', at: 1000 } };
    const v1 = Match.derive(withClaims(c1));
    const v2 = Match.derive(withClaims(c2));
    expect(v1.players.RED.id).toBe(v2.players.RED.id, 'ghế Đỏ');
    expect(v1.players.BLUE.id).toBe(v2.players.BLUE.id, 'ghế Xanh');
  });

  it('hai người đăng ký cùng thời điểm: phân giải bằng id, vẫn tất định', () => {
    const v1 = Match.derive(withClaims({
      zeta: { id: 'zeta', name: 'Z', at: 5000 },
      alpha: { id: 'alpha', name: 'A', at: 5000 }
    }));
    const v2 = Match.derive(withClaims({
      alpha: { id: 'alpha', name: 'A', at: 5000 },
      zeta: { id: 'zeta', name: 'Z', at: 5000 }
    }));
    expect(v1.players.RED.id).toBe('alpha');
    expect(v2.players.RED.id).toBe('alpha', 'hai máy hội tụ');
    expect(v1.players.BLUE.id).toBe('zeta');
  });

  it('người thứ 3 trở đi thành khán giả, không chiếm ghế', () => {
    const v = Match.derive(withClaims({
      a: { id: 'a', name: 'An', at: 1000 },
      b: { id: 'b', name: 'Bình', at: 2000 },
      c: { id: 'c', name: 'Cường', at: 3000 },
      d: { id: 'd', name: 'Dũng', at: 4000 }
    }));
    expect(v.players.RED.id).toBe('a');
    expect(v.players.BLUE.id).toBe('b');
    expect(v.spectators.map(s => s.id)).toEqual(['c', 'd']);
    expect(Match.roleOf(v, 'c')).toBe('SPECTATOR');
    expect(Match.canMove(null, v, 'c')).toBeFalsy('khán giả không được đi');
  });

  it('claim với spectator=true thì không nhận ghế dù còn trống', () => {
    const v = Match.derive(withClaims({
      s: { id: 's', name: 'Xem', at: 500, spectator: true },
      a: { id: 'a', name: 'An', at: 1000 }
    }));
    expect(v.players.RED.id).toBe('a');
    expect(v.players.BLUE).toBeNull();
    expect(Match.roleOf(v, 's')).toBe('SPECTATOR');
  });

  it('bỏ claim (null) thì ghế nhường lại cho người tiếp theo', () => {
    const v = Match.derive(withClaims({
      a: null,
      b: { id: 'b', name: 'Bình', at: 2000 },
      c: { id: 'c', name: 'Cường', at: 3000 }
    }));
    expect(v.players.RED.id).toBe('b', 'Bình lên ghế Đỏ');
    expect(v.players.BLUE.id).toBe('c');
  });

  it('một claim duy nhất thì phòng vẫn ở trạng thái chờ', () => {
    const v = Match.derive(withClaims({ a: { id: 'a', name: 'An', at: 1000 } }));
    expect(v.players.RED.id).toBe('a');
    expect(v.players.BLUE).toBeNull();
    expect(v.status).toBe('WAITING');
    expect(Match.canMove(null, v, 'a')).toBeFalsy('chưa đủ người thì chưa được đi');
  });

  it('startedAt suy ra từ lúc người thứ hai vào ghế', () => {
    const v = Match.derive(withClaims({
      a: { id: 'a', name: 'An', at: 1000 },
      b: { id: 'b', name: 'Bình', at: 7500 }
    }));
    expect(v.startedAt).toBe(7500);
    expect(v.turnStartedAt).toBe(7500, 'đồng hồ nước đầu tính từ lúc đủ người');
  });

  it('claims rác không làm sập việc chia ghế', () => {
    const v = Match.derive(withClaims({
      x: null,
      y: { name: 'thiếu id', at: 1 },
      z: 'không phải object',
      a: { id: 'a', name: 'An', at: 1000 }
    }));
    expect(v.players.RED.id).toBe('a');
    expect(v.players.BLUE).toBeNull();
  });

  it('seating "fixed" vẫn dùng players ghi sẵn (dùng cho bàn của giải đội)', () => {
    const m = Match.createMatch({ code: 'b1', seating: 'fixed' });
    m.players = { RED: { id: 'r', name: 'R' }, BLUE: { id: 'b', name: 'B' } };
    m.claims = { zzz: { id: 'zzz', name: 'Người lạ', at: 1 } };
    const v = Match.derive(m);
    expect(v.players.RED.id).toBe('r', 'claims không ghi đè players cố định');
    expect(Match.roleOf(v, 'zzz')).toBe('SPECTATOR');
  });

  it('opts.players ghi đè mọi thứ (tầng giải đội truyền vào)', () => {
    const m = Match.createMatch({ code: 'b1', seating: 'claims' });
    m.claims = { a: { id: 'a', name: 'An', at: 1 }, b: { id: 'b', name: 'Bình', at: 2 } };
    const v = Match.derive(m, {
      players: { RED: { id: 'x', name: 'X', at: 10 }, BLUE: { id: 'y', name: 'Y', at: 20 } }
    });
    expect(v.players.RED.id).toBe('x');
    expect(v.players.BLUE.id).toBe('y');
    expect(v.status).toBe('PLAYING');
  });
});

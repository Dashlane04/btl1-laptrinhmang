const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { io: connect } = require('socket.io-client');
const rules = require('../shared/gameRules');
const { createGameServer } = require('../server/server');

test('static build uses the current version for multiplayer assets', () => {
  const version = require('../package.json').version;
  const html = fs.readFileSync(path.join(__dirname, '../client/index.html'), 'utf8');
  for (const asset of ['shared/gameRules.js', 'js/network/playhtmlAdapter.js', 'js/main.js']) {
    assert.ok(html.includes(`${asset}?v=${version}`), `${asset} cache key is stale`);
  }
});

function once(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), 3000);
    socket.once(event, data => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

test('OTTv2 rules match the assignment', () => {
  const board = rules.createInitialBoard();
  const counts = rules.countPieces(board);
  assert.equal(board.length, 9);
  assert.equal(board.flat().length, 81);
  assert.equal(counts.RED, 9);
  assert.equal(counts.BLUE, 9);

  const openBoard = Array.from({ length: 9 }, () => Array(9).fill(null));
  openBoard[4][4] = { id: 'red-rock', side: rules.SIDES.RED, type: rules.PIECE_TYPES.ROCK };
  assert.equal(rules.getValidMoves(openBoard, 4, 4).length, 8);

  openBoard[3][4] = { id: 'blue-scissors', side: rules.SIDES.BLUE, type: rules.PIECE_TYPES.SCISSORS };
  openBoard[4][5] = { id: 'blue-rock', side: rules.SIDES.BLUE, type: rules.PIECE_TYPES.ROCK };
  const moves = rules.getValidMoves(openBoard, 4, 4);
  assert.ok(moves.some(move => move.row === 3 && move.col === 4 && move.isCapture));
  assert.ok(!moves.some(move => move.row === 4 && move.col === 5));

  for (const row of board) {
    for (let col = 0; col < row.length; col++) {
      if (row[col]?.side === rules.SIDES.BLUE && row[col].type === rules.PIECE_TYPES.SCISSORS) row[col] = null;
    }
  }
  assert.deepEqual(rules.checkGameOver(board, rules.SIDES.BLUE), {
    isGameOver: true,
    winner: rules.SIDES.RED,
    reason: 'PIECE_TYPE_ELIMINATED',
    eliminatedType: rules.PIECE_TYPES.SCISSORS,
    message: 'Phe Xanh đã mất sạch quân Kéo! Phe Đỏ thắng cuộc!'
  });

  const baseBoard = rules.createInitialBoard();
  baseBoard[0][8] = { id: 'winner', side: rules.SIDES.RED, type: rules.PIECE_TYPES.ROCK };
  assert.equal(rules.checkGameOver(baseBoard, rules.SIDES.BLUE).reason, 'BASE_INVADED');
});

test('self-hosted server validates moves and serves the client', async t => {
  const { httpServer, io } = createGameServer();
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address();
  const url = `http://127.0.0.1:${port}`;
  const red = connect(url, { transports: ['websocket'] });
  const blue = connect(url, { transports: ['websocket'] });

  t.after(async () => {
    red.disconnect();
    blue.disconnect();
    io.close();
    await new Promise(resolve => httpServer.close(resolve));
  });

  await Promise.all([once(red, 'connect'), once(blue, 'connect')]);
  red.emit('room:create', { roomId: 'ott-test1', roomName: 'Test', playerName: 'Red' });
  const redJoined = await once(red, 'room:joined');
  assert.equal(redJoined.side, rules.SIDES.RED);

  const redStarted = once(red, 'game:start');
  const blueStarted = once(blue, 'game:start');
  blue.emit('room:join', { roomId: 'ott-test1', playerName: 'Blue' });
  const blueJoined = await once(blue, 'room:joined');
  assert.equal(blueJoined.side, rules.SIDES.BLUE);
  await Promise.all([redStarted, blueStarted]);

  blue.emit('game:move', { from: { row: 1, col: 0 }, to: { row: 2, col: 0 } });
  assert.match((await once(blue, 'error:message')).message, /lượt/i);

  const redMove = once(red, 'game:move_success');
  const blueMove = once(blue, 'game:move_success');
  red.emit('game:move', { from: { row: 8, col: 1 }, to: { row: 7, col: 1 }, board: [['forged']] });
  const [move] = await Promise.all([redMove, blueMove]);
  assert.equal(move.board[8][1], null);
  assert.equal(move.board[7][1].side, rules.SIDES.RED);
  assert.equal(move.nextTurn, rules.SIDES.BLUE);

  const status = await fetch(`${url}/api/status`).then(response => response.json());
  assert.equal(status.status, 'online');
  assert.match(status.engine, /authoritative/);
});

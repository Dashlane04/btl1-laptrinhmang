/**
 * E2E test bằng browser thật (Playwright).
 *
 * KHÔNG dùng localhost. Lý do: playhtml prefix room bằng window.location.hostname,
 * nên "127.0.0.1:PORT" tạo room chứa dấu ':' -> PartyKit không sync -> init() treo.
 * Thay vào đó ta chặn request cho một hostname https giả và phục vụ file từ đĩa,
 * mô phỏng đúng môi trường GitHub Pages.
 *
 * Chạy:  node tests/e2e/run-e2e.js
 * Test trên URL đã deploy:  OTT_URL=https://user.github.io/repo node tests/e2e/run-e2e.js
 */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const R = require('../../shared/gameRules');

const ROOT = path.resolve(__dirname, '..', '..');
const LIVE_URL = process.env.OTT_URL || '';
// Hostname RANDOM mỗi lần chạy: mỗi lần test có một room playhtml sạch, không bị
// ảnh hưởng bởi dữ liệu của các lần chạy trước. Bước warm-up bên dưới lo phần
// độ trễ khởi tạo room.
const HOSTNAME = process.env.OTT_HOST || ('ottv2-e2e-' + Math.random().toString(36).slice(2, 8) + '.example');
const ORIGIN = 'https://' + HOSTNAME;
const HEADLESS = process.env.OTT_HEADED !== '1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8'
};

// ---------------------------------------------------------------------------
// Báo cáo
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];
let section = '';

function head(name) { section = name; console.log(`\n  ${name}`); }

function ok(name) { passed++; console.log(`    \x1b[32m✓\x1b[0m ${name}`); }

function bad(name, detail) {
  failed++;
  failures.push({ section, name, detail });
  console.log(`    \x1b[31m✗\x1b[0m ${name}`);
  console.log(`        \x1b[31m${detail}\x1b[0m`);
}

function check(name, cond, detail) {
  if (cond) ok(name); else bad(name, detail || 'điều kiện không thoả');
}

async function step(name, fn) {
  try {
    const detail = await fn();
    if (detail === false) bad(name, 'trả về false');
    else ok(name);
  } catch (e) {
    bad(name, (e && e.message) || String(e));
  }
}

// ---------------------------------------------------------------------------
// Hạ tầng browser
// ---------------------------------------------------------------------------

function baseUrl() {
  return LIVE_URL ? LIVE_URL.replace(/\/+$/, '') : ORIGIN;
}

function appUrl(query) {
  const base = baseUrl();
  const p = LIVE_URL ? base + '/client/index.html' : base + '/client/index.html';
  return p + (query ? '?' + query : '');
}

async function serveFromDisk(context) {
  if (LIVE_URL) return;   // test trên URL thật thì không chặn gì
  await context.route(ORIGIN + '/**', route => {
    const url = new URL(route.request().url());
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(ROOT, '.' + rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found ' + rel });
    }
    route.fulfill({
      status: 200,
      contentType: MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      body: fs.readFileSync(file),
      headers: { 'cache-control': 'no-store' }
    });
  });
}

/** Mở một client mới, đặt tên người chơi trước khi app khởi động */
async function openClient(browser, { name, query, label }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await serveFromDisk(context);
  const page = await context.newPage();

  page.on('pageerror', e => console.log(`      [${label} pageerror] ${e.message.slice(0, 180)}`));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (t.includes('favicon') || t.includes('unpkg.com')) return;
    console.log(`      [${label} console.error] ${t.slice(0, 180)}`);
  });

  await page.addInitScript(n => {
    try {
      localStorage.setItem('ottv2_player_name', n);
      localStorage.setItem('ottv2_player_id', 'p_' + n.toLowerCase().replace(/[^a-z0-9]/g, ''));
      localStorage.setItem('ottv2_muted', '1');       // tắt tiếng khi test
      // KHÔNG seed ottv2_theme: addInitScript chạy lại ở mỗi lần navigate,
      // seed sẽ ghi đè lựa chọn của người dùng và làm sai test "ghi nhớ".
    } catch (e) {}
  }, name);

  await page.goto(appUrl(query), { waitUntil: 'domcontentloaded' });
  return { context, page, label, name };
}

async function waitReady(client, timeout = 60000) {
  await client.page.waitForFunction(
    () => window.__ottReady === true || typeof window.__ottError === 'string',
    { timeout }
  );
  const err = await client.page.evaluate(() => window.__ottError || null);
  if (err) throw new Error(`${client.label} không kết nối được: ${err}`);
}

// ---------------------------------------------------------------------------
// Truy vấn UI
// ---------------------------------------------------------------------------

function pieceAt(page, pos) {
  return page.evaluate(p => {
    const cell = document.querySelector(`.board-grid .cell[data-pos="${p}"]`);
    if (!cell) return 'NO_CELL';
    const piece = cell.querySelector('.piece');
    if (!piece) return null;
    const side = piece.classList.contains('piece--red') ? 'RED' : 'BLUE';
    const letter = piece.querySelector('.piece-letter');
    return side + ':' + (letter ? letter.textContent : '?');
  }, pos);
}

function historyOf(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#history .history__item'))
      .map(n => n.querySelector('.history__txt').textContent.trim()));
}

function rolePill(page) {
  return page.evaluate(() => document.getElementById('match-role').textContent.trim());
}

function boardOrder(page) {
  return page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('.board-grid .cell'));
    return { first: cells[0].dataset.pos, last: cells[cells.length - 1].dataset.pos, n: cells.length };
  });
}

function countsOf(page, side) {
  return page.evaluate(s => {
    const box = document.getElementById(s + '-counts');
    return Array.from(box.querySelectorAll('.count')).map(c => ({
      type: c.children[0].textContent,
      n: Number(c.querySelector('.count__n').textContent),
      critical: c.classList.contains('is-critical')
    }));
  }, side);
}

async function clickCell(page, pos) {
  await page.click(`.board-grid .cell[data-pos="${pos}"]`, { timeout: 8000 });
}

async function makeMove(page, from, to) {
  await clickCell(page, from);
  await clickCell(page, to);
}

/** Đợi một điều kiện trên page, trả về true/false thay vì ném lỗi */
async function waitFor(page, fn, arg, timeout = 30000) {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 250 });
    return true;
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Sinh một ván hợp lệ kết thúc bằng "ăn hết sạch một loại quân"
// Dùng chính engine luật chơi để đảm bảo mọi nước đều hợp lệ.
// ---------------------------------------------------------------------------

function generateTypeEliminationGame(targetSide = R.SIDES.BLUE, targetType = R.PIECE_TYPES.PAPER) {
  const attacker = R.SIDES.RED;
  // Kéo ăn Lá -> dùng quân Kéo của Đỏ đi bắt các quân Lá của Xanh
  const hunterType = R.PIECE_TYPES.SCISSORS;
  let board = R.createInitialBoard();
  const moves = [];
  let seq = 1;
  let fillerToggle = false;

  const targetsOf = b => {
    const out = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const p = b[r][c];
      if (p && p.side === targetSide && p.type === targetType) out.push({ row: r, col: c });
    }
    return out;
  };

  const dist = (a, b) => Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));

  const push = (from, to, side) => {
    moves.push({ id: `gen-${seq}`, seq, side, from, to, at: 1_700_000_000_000 + seq * 1000 });
    board = R.applyMove(board, from, to).board;
    seq++;
  };

  for (let guard = 0; guard < 400; guard++) {
    const over = R.checkGameOver(board, seq % 2 === 1 ? attacker : targetSide);
    if (over.isGameOver) {
      return { moves, done: over.reason === R.GAME_OVER_REASONS.TYPE_ELIMINATED && over.winner === attacker, over };
    }

    const side = seq % 2 === 1 ? attacker : targetSide;
    const legal = R.getAllValidMoves(board, side);
    if (!legal.length) return { moves, done: false, over: null };

    if (side === attacker) {
      // Ưu tiên ăn đúng loại mục tiêu, sau đó là tiến gần quân mục tiêu nhất
      const targets = targetsOf(board);
      const capture = legal.find(m =>
        m.isCapture && m.piece.type === hunterType &&
        targets.some(t => t.row === m.to.row && t.col === m.to.col));
      if (capture) { push(capture.from, capture.to, side); continue; }

      const hunters = legal.filter(m => m.piece.type === hunterType && !m.isCapture);
      const pool = hunters.length ? hunters : legal.filter(m => !m.isCapture);
      if (!pool.length) { push(legal[0].from, legal[0].to, side); continue; }

      let best = null;
      let bestScore = Infinity;
      for (const m of pool) {
        const d = Math.min(...targets.map(t => dist(m.to, t)));
        // tránh tự đi vào ô cạnh quân Đấm địch (Đấm ăn Kéo)
        let risky = 0;
        for (const dir of R.DIRECTIONS) {
          const nr = m.to.row + dir.dr, nc = m.to.col + dir.dc;
          if (!R.isValidPosition(nr, nc)) continue;
          const q = board[nr][nc];
          if (q && q.side === targetSide && R.canCapture(q.type, m.piece.type)) risky = 1;
        }
        const score = d * 10 + risky * 25;
        if (score < bestScore) { bestScore = score; best = m; }
      }
      push(best.from, best.to, side);
    } else {
      // Bên phòng ngự đi nước "vô hại": không ăn quân, không vào căn cứ địch,
      // không di chuyển quân thuộc loại mục tiêu (để loại đó bị ăn dần).
      const enemyBase = R.BASES[attacker];
      const safe = legal.filter(m =>
        !m.isCapture &&
        m.piece.type !== targetType &&
        !(m.to.row === enemyBase.row && m.to.col === enemyBase.col));
      const pool = safe.length ? safe : legal.filter(m => !m.isCapture);
      if (!pool.length) { push(legal[0].from, legal[0].to, side); continue; }
      fillerToggle = !fillerToggle;
      const pick = pool[fillerToggle ? 0 : pool.length - 1];
      push(pick.from, pick.to, side);
    }
  }

  return { moves, done: false, over: null };
}

// ---------------------------------------------------------------------------
// Các nhóm test
// ---------------------------------------------------------------------------

async function testSyncAndOrientation(browser) {
  head('Đồng bộ 2 máy + xoay bàn cờ (lỗi người dùng báo)');

  const code = 'ott-e2e' + Math.random().toString(36).slice(2, 6);

  // Mở TUẦN TỰ, giống cách dùng thật: A tạo phòng, vào ghế, rồi mới gửi link cho B.
  const A = await openClient(browser, { name: 'An', query: 'room=' + code, label: 'A' });
  let B = null;

  try {
    await step('A kết nối được playhtml', async () => { await waitReady(A); });
    await A.page.waitForSelector('#view-match.is-active', { timeout: 20000 });
    await waitFor(A.page, () => {
      const v = window.OTT.Match.derive(window.OTT._internal.currentState());
      return Boolean(v.players.RED);
    }, null, 30000);

    B = await openClient(browser, { name: 'Binh', query: 'room=' + code, label: 'B' });
    await step('B vào cùng phòng qua link mời', async () => { await waitReady(B); });

    await A.page.waitForSelector('#view-match.is-active', { timeout: 15000 });
    await B.page.waitForSelector('#view-match.is-active', { timeout: 15000 });

    // Chờ cả hai nhận đủ 2 người chơi
    const bothSeated = await waitFor(A.page, () => {
      const v = window.OTT.Match.derive(window.OTT._internal.currentState());
      return Boolean(v.players.RED && v.players.BLUE);
    }, null, 25000);
    check('hai người được xếp vào 2 ghế Đỏ / Xanh', bothSeated, 'không đủ 2 ghế sau 25s');

    // Hai máy phải suy ra CÙNG bảng ghế — đây là thứ thay thế cho cơ chế
    // "ai ghi sau thắng" từng gây ra cảnh cả hai đều nhận phe Đỏ.
    const seatsOn = page => page.evaluate(() => {
      const st = window.OTT._internal.currentState();
      const v = window.OTT.Match.derive(st);
      return (v.players.RED ? v.players.RED.id : '-') + ' / ' + (v.players.BLUE ? v.players.BLUE.id : '-');
    });
    const seatsA = await seatsOn(A.page);
    const seatsB = await seatsOn(B.page);
    check('A và B suy ra CÙNG bảng ghế', seatsA === seatsB, `A="${seatsA}" B="${seatsB}"`);

    const roleA = await rolePill(A.page);
    const roleB = await rolePill(B.page);
    check('A và B nhận vai khác nhau', roleA !== roleB, `A="${roleA}" B="${roleB}"`);
    check('A là phe Đỏ (người vào trước)', /Đỏ/.test(roleA), `nhận được "${roleA}"`);
    check('B là phe Xanh', /Xanh/.test(roleB), `nhận được "${roleB}"`);

    // --- XOAY BÀN CỜ ---
    const ordA = await boardOrder(A.page);
    const ordB = await boardOrder(B.page);
    check('bàn cờ có đủ 81 ô', ordA.n === 81 && ordB.n === 81, `A=${ordA.n} B=${ordB.n}`);
    check('phe Đỏ nhìn bàn cờ hướng chuẩn (góc trên-trái là a9)',
      ordA.first === 'a9' && ordA.last === 'i1', JSON.stringify(ordA));
    check('phe Xanh thấy bàn cờ QUAY 180° (góc trên-trái là i1)',
      ordB.first === 'i1' && ordB.last === 'a9', JSON.stringify(ordB));

    // --- CHỌN QUÂN PHẢI HIỆN GỢI Ý NƯỚC ĐI ---
    await clickCell(A.page, 'e2');
    const sel = await A.page.evaluate(() => {
      const cell = document.querySelector('.board-grid .cell[data-pos="e2"]');
      const moves = Array.from(document.querySelectorAll('.board-grid .cell.is-move')).map(c => c.dataset.pos).sort();
      const caps = Array.from(document.querySelectorAll('.board-grid .cell.is-capture')).map(c => c.dataset.pos).sort();
      return { selected: cell.classList.contains('is-selected'), moves, caps };
    });
    check('click vào quân thì ô đó được đánh dấu đang chọn', sel.selected, 'thiếu class is-selected');
    check('hiện đúng các ô đi được của quân Đấm e2',
      JSON.stringify(sel.moves) === JSON.stringify(['d2', 'd3', 'e1', 'e3', 'f2', 'f3']),
      JSON.stringify(sel.moves));
    check('quân cùng phe ở d1/f1 chặn đường, không được gợi ý',
      !sel.moves.includes('d1') && !sel.moves.includes('f1'), JSON.stringify(sel.moves));

    await clickCell(A.page, 'e2');   // bấm lại để bỏ chọn
    const cleared = await A.page.evaluate(() =>
      document.querySelectorAll('.board-grid .cell.is-selected, .board-grid .cell.is-move').length);
    check('bấm lại chính ô đó thì bỏ chọn và xoá gợi ý', cleared === 0, `còn ${cleared} ô sáng`);

    // --- ĐỒNG BỘ NƯỚC ĐI ---
    check('trước khi đi: B thấy e2 có quân Đỏ', (await pieceAt(B.page, 'e2')) !== null, 'e2 rỗng');

    await makeMove(A.page, 'e2', 'e3');

    const bSaw = await waitFor(B.page, () => {
      const cell = document.querySelector('.board-grid .cell[data-pos="e3"]');
      return !!(cell && cell.querySelector('.piece'));
    }, null, 20000);
    check('A đi e2→e3 thì B THẤY NGAY trên bàn cờ', bSaw, 'B không thấy quân ở e3 sau 20s');
    check('ô e2 trên máy B đã trống', (await pieceAt(B.page, 'e2')) === null, 'e2 vẫn còn quân');

    const histB = await historyOf(B.page);
    check('B thấy nước đi trong lịch sử', histB.length === 1 && histB[0].includes('e2'), JSON.stringify(histB));

    // --- B đi, A phải thấy ---
    const bCanMove = await waitFor(B.page, () => {
      const el = document.getElementById('turnbanner');
      return el && el.classList.contains('is-yours');
    }, null, 15000);
    check('tới lượt B và UI của B báo đúng', bCanMove, 'banner của B không chuyển sang lượt mình');

    await makeMove(B.page, 'e8', 'e7');
    const aSaw = await waitFor(A.page, () => {
      const cell = document.querySelector('.board-grid .cell[data-pos="e7"]');
      return !!(cell && cell.querySelector('.piece'));
    }, null, 20000);
    check('B đi e8→e7 thì A thấy ngay', aSaw, 'A không thấy quân ở e7');

    // --- lịch sử phải GIỐNG NHAU (lỗi cũ: B ngừng cập nhật sau nước đầu) ---
    await waitFor(A.page, () => document.querySelectorAll('#history .history__item').length === 2, null, 15000);
    await waitFor(B.page, () => document.querySelectorAll('#history .history__item').length === 2, null, 15000);
    const hA = await historyOf(A.page);
    const hB = await historyOf(B.page);
    check('lịch sử nước đi của A và B GIỐNG NHAU',
      JSON.stringify(hA) === JSON.stringify(hB) && hA.length === 2,
      `A=${JSON.stringify(hA)} B=${JSON.stringify(hB)}`);

    // --- hai máy cùng bàn cờ (so sánh toàn bộ 81 ô theo toạ độ thật) ---
    const snap = page => page.evaluate(() => {
      const out = {};
      document.querySelectorAll('.board-grid .cell').forEach(c => {
        const p = c.querySelector('.piece');
        out[c.dataset.pos] = p
          ? (p.classList.contains('piece--red') ? 'R' : 'B') + p.querySelector('.piece-letter').textContent
          : '.';
      });
      return out;
    });
    const sA = await snap(A.page);
    const sB = await snap(B.page);
    const diff = Object.keys(sA).filter(k => sA[k] !== sB[k]);
    check('toàn bộ 81 ô của A và B khớp nhau', diff.length === 0, 'lệch ở: ' + diff.join(', '));

    // --- đếm quân theo loại (cần cho luật thắng mới) ---
    const cnt = await countsOf(A.page, 'red');
    check('hiển thị số quân từng loại (Đấm/Lá/Kéo)',
      cnt.length === 3 && cnt.every(c => c.n === 3), JSON.stringify(cnt));

    // --- chat đồng bộ ---
    await A.page.fill('#chat-input', 'xin chao B');
    await A.page.click('#chat-send');
    const chatSynced = await waitFor(B.page,
      () => document.getElementById('chat-log').textContent.includes('xin chao B'), null, 15000);
    check('tin nhắn chat của A tới được B', chatSynced, 'B không nhận được chat');

    return { code, A, B };
  } catch (e) {
    bad('nhóm test đồng bộ', e.message);
    await A.context.close();
    if (B) await B.context.close();
    return null;
  }
}

async function testSpectator(browser, code) {
  head('Khán giả (spectator)');
  const C = await openClient(browser, { name: 'Cuong', query: 'room=' + code, label: 'C' });
  try {
    await step('người thứ 3 vào phòng đã đủ 2 người', async () => { await waitReady(C); });
    await C.page.waitForSelector('#view-match.is-active', { timeout: 15000 });

    const isSpec = await waitFor(C.page,
      () => document.getElementById('match-role').textContent.trim() === 'Khán giả', null, 20000);
    const role = await rolePill(C.page);
    check('người thứ 3 trở thành Khán giả, không chiếm ghế', isSpec, `nhận được "${role}"`);

    const seatsIntact = await C.page.evaluate(() => {
      const v = window.OTT.Match.derive(window.OTT._internal.currentState());
      return (v.players.RED ? v.players.RED.name : '-') + '|' + (v.players.BLUE ? v.players.BLUE.name : '-');
    });
    check('hai ghế người chơi không bị khán giả ghi đè', seatsIntact === 'An|Binh', seatsIntact);

    check('khán giả thấy được các nước đã đi',
      (await historyOf(C.page)).length === 2, 'lịch sử của khán giả không đủ');

    const disabled = await C.page.evaluate(() =>
      Array.from(document.querySelectorAll('.board-grid .cell')).every(c => c.disabled));
    check('bàn cờ của khán giả bị vô hiệu hoá (không đi được)', disabled, 'vẫn còn ô click được');

    const noResign = await C.page.evaluate(() => document.getElementById('btn-resign').classList.contains('hidden'));
    check('khán giả không có nút Đầu hàng', noResign, 'nút đầu hàng vẫn hiện');

    return C;
  } catch (e) {
    bad('nhóm test khán giả', e.message);
    await C.context.close();
    return null;
  }
}

async function testTypeEliminationWin(browser) {
  head('Thắng do ăn hết sạch MỘT LOẠI quân (đồng bộ qua playhtml)');

  const gen = generateTypeEliminationGame();
  check('sinh được ván hợp lệ kết thúc bằng TYPE_ELIMINATED',
    gen.done, gen.over ? 'kết thúc bằng ' + gen.over.reason : 'không kết thúc trong 400 nước');
  if (!gen.done) return;
  console.log(`      (ván sinh ra dài ${gen.moves.length} nước, tất cả đều hợp lệ theo engine)`);

  const code = 'ott-win' + Math.random().toString(36).slice(2, 6);
  const A = await openClient(browser, { name: 'An', query: 'room=' + code, label: 'A' });
  let B = null;

  try {
    await waitReady(A);
    await A.page.waitForSelector('#view-match.is-active', { timeout: 20000 });
    await waitFor(A.page, () => {
      const v = window.OTT.Match.derive(window.OTT._internal.currentState());
      return Boolean(v.players.RED);
    }, null, 30000);

    B = await openClient(browser, { name: 'Binh', query: 'room=' + code, label: 'B' });
    await waitReady(B);
    await B.page.waitForSelector('#view-match.is-active', { timeout: 20000 });
    await waitFor(A.page, () => {
      const v = window.OTT.Match.derive(window.OTT._internal.currentState());
      return Boolean(v.players.RED && v.players.BLUE);
    }, null, 30000);

    // Nạp cả ván vào state chia sẻ từ máy A.
    // Có retry: khi mạng chậm, lần ghi đầu có thể chưa lan kịp; đây là chuyện của
    // hạ tầng test, nên xác nhận state đã nhận rồi mới assert phần kết quả.
    // Đẩy từng nước một, đúng đường mà app dùng khi người chơi click (push vào mảng
    // moves), chứ không gán cả mảng — gán cả mảng là ghi đè container, dễ xung đột.
    let injected = false;
    for (let attempt = 1; attempt <= 3 && !injected; attempt++) {
      await A.page.evaluate(moves => {
        const ch = window.OTT._internal.S.ch;
        ch.ensure('moves', 'array');
        const now = Date.now();
        const have = new Set((ch.get().moves || []).map(m => m.seq));
        moves.forEach((m, i) => {
          if (have.has(m.seq)) return;
          ch.update(d => { d.moves.push({ ...m, at: now - (moves.length - i) * 200 }); });
        });
      }, gen.moves);

      injected = await waitFor(A.page, n => {
        const v = window.OTT.Match.derive(window.OTT._internal.currentState());
        return v.moveCount === n;
      }, gen.moves.length, 25000);
    }
    check(`nạp được ${gen.moves.length} nước đi vào state chia sẻ`, injected,
      'state không nhận đủ số nước đi sau 3 lần thử');

    const bGot = await waitFor(B.page, n => {
      const v = window.OTT.Match.derive(window.OTT._internal.currentState());
      return v.moveCount === n;
    }, gen.moves.length, 30000);
    check('B nhận đủ toàn bộ ván qua playhtml', bGot, 'B không nhận đủ nước đi');

    const aOver = await waitFor(A.page,
      () => document.getElementById('modal-result').classList.contains('is-open'), null, 30000);
    check('A thấy modal kết quả', aOver, 'modal không mở trên A');

    const bOver = await waitFor(B.page,
      () => document.getElementById('modal-result').classList.contains('is-open'), null, 30000);
    check('B cũng thấy modal kết quả (đồng bộ)', bOver, 'modal không mở trên B');

    const reasonOn = page => page.evaluate(() => document.getElementById('result-why').textContent.trim());
    const msgOn = page => page.evaluate(() => document.getElementById('result-msg').textContent.trim());

    const whyA = await reasonOn(A.page);
    check('lý do thắng là "ăn hết sạch một loại quân"',
      whyA.includes('một loại quân'), `nhận được "${whyA}"`);

    const mA = await msgOn(A.page);
    const mB = await msgOn(B.page);
    check('A và B cùng thông báo kết quả', mA === mB && mA.length > 0, `A="${mA}" B="${mB}"`);
    check('thông báo nêu đúng loại quân bị diệt (Lá)', mA.includes('Lá'), mA);

    const titleA = await A.page.evaluate(() => document.getElementById('result-title').textContent.trim());
    const titleB = await B.page.evaluate(() => document.getElementById('result-title').textContent.trim());
    check('A (Đỏ) thắng và B (Xanh) thua — hai máy nhất quán',
      titleA === 'Bạn thắng!' && titleB === 'Bạn thua', `A="${titleA}" B="${titleB}"`);

    // Quân Lá của Xanh phải về 0 và được đánh dấu nguy cấp
    const blueCounts = await countsOf(A.page, 'blue');
    const paper = blueCounts.find(c => c.type === 'Lá');
    check('ô đếm cho thấy Xanh còn 0 quân Lá', paper && paper.n === 0, JSON.stringify(blueCounts));

    // Điểm phải là 1–0, không bị cộng đôi
    const scores = await waitFor(A.page, () =>
      document.getElementById('red-score').textContent === '1', null, 15000);
    const sRed = await A.page.evaluate(() => document.getElementById('red-score').textContent);
    const sBlue = await A.page.evaluate(() => document.getElementById('blue-score').textContent);
    check('điểm là 1–0, không cộng đôi', scores && sRed === '1' && sBlue === '0', `${sRed}–${sBlue}`);

    await A.context.close();
    if (B) await B.context.close();
  } catch (e) {
    bad('nhóm test thắng theo loại quân', e.message);
    await A.context.close();
    if (B) await B.context.close();
  }
}

async function testLobby(browser) {
  head('Sảnh chờ toàn cục (nhiều phòng cùng lúc)');

  const code1 = 'ott-lb' + Math.random().toString(36).slice(2, 6);
  const H = await openClient(browser, { name: 'Host', query: 'room=' + code1, label: 'H' });
  const V = await openClient(browser, { name: 'Viewer', label: 'V' });

  try {
    await waitReady(H);
    await waitReady(V);
    await H.page.waitForSelector('#view-match.is-active', { timeout: 15000 });

    const seen = await waitFor(V.page, c => {
      const txt = document.getElementById('rooms').textContent;
      return txt.includes(c);
    }, code1, 25000);
    check('client khác thấy phòng vừa tạo trong sảnh', seen, `không thấy ${code1} trong danh sách`);

    const count = await V.page.evaluate(() => document.querySelectorAll('#rooms .room').length);
    check('sảnh chờ render được thẻ phòng', count >= 1, `số thẻ = ${count}`);

    // Mở thêm phòng thứ 2 -> chứng minh nhiều phòng song song
    const code2 = 'ott-lb' + Math.random().toString(36).slice(2, 6);
    const H2 = await openClient(browser, { name: 'Host2', query: 'room=' + code2, label: 'H2' });
    await waitReady(H2);
    await H2.page.waitForSelector('#view-match.is-active', { timeout: 15000 });

    const bothSeen = await waitFor(V.page, codes => {
      const txt = document.getElementById('rooms').textContent;
      return codes.every(c => txt.includes(c));
    }, [code1, code2], 25000);
    check('hai phòng độc lập cùng tồn tại trong sảnh', bothSeen, 'không thấy đủ 2 phòng');

    const isolated = await H.page.evaluate(c => window.OTT._internal.currentState().code === c, code1);
    check('phòng 1 không bị phòng 2 ảnh hưởng (state tách biệt)', isolated, 'state bị lẫn');

    await H2.context.close();
    await H.context.close();
    await V.context.close();
  } catch (e) {
    bad('nhóm test sảnh chờ', e.message);
    await H.context.close(); await V.context.close();
  }
}

async function testTeamMode(browser) {
  head('Giải đấu 2 vs 2 — hai bàn song song, tính điểm đội');

  const code = 'team-e2e' + Math.random().toString(36).slice(2, 5);
  const names = ['A1p', 'B1p', 'A2p', 'B2p'];
  const clients = [];

  try {
    // Vào lần lượt để thứ tự slot xác định: A1, B1, A2, B2
    for (let i = 0; i < 4; i++) {
      const c = await openClient(browser, { name: names[i], query: 'team=' + code, label: names[i] });
      await waitReady(c);
      await c.page.waitForSelector('#view-team.is-active', { timeout: 15000 });
      await waitFor(c.page, n => {
        const I = window.OTT._internal;
        const st = I.S.team && I.S.team.ch.get();
        if (!st) return false;
        return Object.values(I.teamSlotsOf(st)).some(s => s && s.name === n);
      }, names[i], 20000);
      clients.push(c);
    }
    ok('4 người vào được giải đấu');

    const slotsFilled = await waitFor(clients[0].page, () => {
      const I = window.OTT._internal;
      const slots = I.teamSlotsOf(I.S.team.ch.get());
      return ['A1', 'A2', 'B1', 'B2'].every(k => slots[k]);
    }, null, 25000);
    check('cả 4 vị trí A1/A2/B1/B2 đều có người', slotsFilled, 'chưa đủ 4 vị trí');

    const slots = await clients[0].page.evaluate(() => {
      const I = window.OTT._internal;
      const s = I.teamSlotsOf(I.S.team.ch.get());
      return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v && v.name]));
    });
    check('mỗi người một vị trí, không trùng nhau',
      new Set(Object.values(slots)).size === 4, JSON.stringify(slots));

    // Mọi client phải suy ra CÙNG bảng vị trí (tính tất định từ claims)
    const allSlots = [];
    for (const c of clients) {
      allSlots.push(await c.page.evaluate(() => {
        const I = window.OTT._internal;
        const s = I.teamSlotsOf(I.S.team.ch.get());
        return ['A1', 'B1', 'A2', 'B2'].map(k => (s[k] ? s[k].name : '-')).join('|');
      }));
    }
    check('cả 4 client suy ra cùng bảng vị trí (không lệch)',
      new Set(allSlots).size === 1, JSON.stringify(allSlots));

    // Hai bàn phải có state riêng
    const boardCodes = await clients[0].page.evaluate(() =>
      window.OTT._internal.S.team.boards.map(b => b.code));
    check('giải tạo ra 2 bàn riêng biệt',
      boardCodes.length === 2 && boardCodes[0] !== boardCodes[1], JSON.stringify(boardCodes));

    // A1 ngồi ghế Đỏ bàn 1 -> được đi trước
    const a1 = clients[names.indexOf('A1p')];
    const a1CanMove = await waitFor(a1.page,
      () => document.getElementById('team-turnbanner').classList.contains('is-yours'), null, 25000);
    check('A1 (Đỏ bàn 1) được đi trước', a1CanMove, 'banner của A1 không báo tới lượt');

    await makeMove(a1.page, 'e2', 'e3');

    // B1 là đối thủ cùng bàn -> phải thấy
    const b1 = clients[names.indexOf('B1p')];
    const b1Saw = await waitFor(b1.page, () => {
      const cell = document.querySelector('#team-board .cell[data-pos="e3"]');
      return !!(cell && cell.querySelector('.piece'));
    }, null, 20000);
    check('đối thủ cùng bàn (B1) thấy nước đi của A1', b1Saw, 'B1 không thấy nước đi');

    // A2 ở bàn 2 -> bàn CHÍNH của A2 không được đổi
    const a2 = clients[names.indexOf('A2p')];
    const a2Unaffected = await a2.page.evaluate(() => {
      const cell = document.querySelector('#team-board .cell[data-pos="e3"]');
      return !cell.querySelector('.piece');
    });
    check('bàn 2 KHÔNG bị ảnh hưởng bởi nước đi ở bàn 1', a2Unaffected, 'hai bàn bị lẫn state');

    // A2 thấy bàn 1 ở khung xem nhỏ
    const a2Mini = await waitFor(a2.page, () => {
      const cell = document.querySelector('#mini-board .cell[data-pos="e3"]');
      return !!(cell && cell.querySelector('.piece'));
    }, null, 20000);
    check('A2 xem được diễn biến bàn 1 qua khung bàn nhỏ', a2Mini, 'khung bàn nhỏ không cập nhật');

    // Điểm đội khởi đầu 0-0
    const pts = await clients[0].page.evaluate(() => ({
      A: document.getElementById('teamA-pts').textContent,
      B: document.getElementById('teamB-pts').textContent
    }));
    check('điểm đội khởi đầu 0–0', pts.A === '0' && pts.B === '0', JSON.stringify(pts));

    // Đội thắng 1 bàn bằng cách B1 đầu hàng -> đội A được 1 điểm
    await b1.page.evaluate(() => {
      window.OTT._internal.S.team.boards[0].ch.update(d => {
        d.resign = { round: 1, side: 'BLUE', by: 'x' };
      });
    });
    const teamAScored = await waitFor(clients[0].page,
      () => document.getElementById('teamA-pts').textContent === '1', null, 25000);
    const ptsAfter = await clients[0].page.evaluate(() => ({
      A: document.getElementById('teamA-pts').textContent,
      B: document.getElementById('teamB-pts').textContent
    }));
    check('thắng ở bàn 1 thì ĐỘI A được 1 điểm', teamAScored, JSON.stringify(ptsAfter));

    const resultTxt = await clients[0].page.evaluate(() => document.getElementById('team-results').textContent);
    check('bảng kết quả ghi nhận bàn 1 cho đội A', /Bàn 1.*đội A/.test(resultTxt), resultTxt.slice(0, 120));

    for (const c of clients) await c.context.close();
  } catch (e) {
    bad('nhóm test 2vs2', e.message);
    for (const c of clients) { try { await c.context.close(); } catch (_) {} }
  }
}

async function testThemeAndA11y(browser) {
  head('Giao diện: chế độ sáng / tối');
  const C = await openClient(browser, { name: 'Theme', label: 'T' });
  const themeOf = () => C.page.evaluate(() => document.documentElement.dataset.theme);
  try {
    await waitReady(C);

    const first = await themeOf();
    check('khởi động với một chế độ xác định', first === 'dark' || first === 'light', String(first));

    const other = first === 'dark' ? 'light' : 'dark';
    await C.page.click('#btn-theme');
    const toggled = await themeOf();
    check(`bấm nút đổi được sang chế độ ${other}`, toggled === other, `nhận được ${toggled}`);

    const bg = await C.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const expectBg = other === 'light' ? 'rgb(244, 245, 247)' : 'rgb(20, 23, 28)';
    check('màu nền trang đổi theo chế độ', bg === expectBg, `${bg} (mong đợi ${expectBg})`);

    await C.page.reload({ waitUntil: 'domcontentloaded' });
    await waitReady(C);
    const persisted = await themeOf();
    check('lựa chọn sáng/tối được ghi nhớ sau khi tải lại', persisted === other, `nhận được ${persisted}`);

    await C.page.click('#btn-theme');
    const back = await themeOf();
    check('đổi lại được về chế độ ban đầu', back === first, `nhận được ${back}`);

    // Bàn cờ phải dùng token màu khác nhau ở 2 chế độ
    await C.page.click('#mode-local');
    await C.page.waitForSelector('#view-match.is-active');
    // Ô bàn cờ có transition 120ms nên phải chờ transition kết thúc mới đọc màu,
    // nếu không getComputedStyle trả về màu ĐẦU transition (màu cũ).
    const cellBg = async () => {
      await C.page.waitForTimeout(400);
      return C.page.evaluate(() =>
        getComputedStyle(document.querySelector('.board-grid .cell:not(.cell--alt):not(.cell--base)')).backgroundColor);
    };
    const cellA = await cellBg();
    await C.page.click('#btn-theme');
    await C.page.waitForFunction(t => document.documentElement.dataset.theme === t, other);
    const cellB = await cellBg();
    check('ô bàn cờ đổi màu giữa 2 chế độ', cellA !== cellB, `${first}=${cellA} ${other}=${cellB}`);

    // Quân cờ phân biệt được bằng chữ, không chỉ bằng màu
    const letters = await C.page.evaluate(() => {
      const out = new Set();
      document.querySelectorAll('.board-grid .piece-letter').forEach(t => out.add(t.textContent));
      return Array.from(out).sort();
    });
    check('quân cờ có nhãn chữ Đ/L/K (không chỉ dựa vào màu)',
      letters.length === 3 && letters.join('') === 'KLĐ', JSON.stringify(letters));

    await C.context.close();
  } catch (e) {
    bad('nhóm test giao diện', e.message);
    await C.context.close();
  }
}

async function testOfflineModes(browser) {
  head('Chế độ ngoại tuyến: đấu máy & hai người cùng máy');
  const C = await openClient(browser, { name: 'Solo', label: 'S' });
  try {
    await waitReady(C);

    await C.page.click('#mode-local');
    await C.page.waitForSelector('#view-match.is-active');

    // gợi ý nước đi cũng phải hoạt động ở chế độ ngoại tuyến
    await clickCell(C.page, 'e2');
    const offlineMoves = await C.page.evaluate(() =>
      document.querySelectorAll('.board-grid .cell.is-move').length);
    check('chế độ cùng máy: chọn quân cũng hiện gợi ý nước đi', offlineMoves === 6, `${offlineMoves} ô`);
    await clickCell(C.page, 'e2');

    await makeMove(C.page, 'e2', 'e3');
    const moved = await waitFor(C.page, () => {
      const c = document.querySelector('.board-grid .cell[data-pos="e3"]');
      return !!(c && c.querySelector('.piece'));
    }, null, 8000);
    check('chơi 2 người cùng máy: đi được quân Đỏ', moved, 'quân không di chuyển');

    const blueTurn = await waitFor(C.page,
      () => document.getElementById('turnbanner').textContent.includes('Xanh'), null, 8000);
    check('đổi lượt sang phe Xanh trên cùng máy', blueTurn, 'không đổi lượt');

    await makeMove(C.page, 'e8', 'e7');
    const blueMoved = await waitFor(C.page, () => {
      const c = document.querySelector('.board-grid .cell[data-pos="e7"]');
      return !!(c && c.querySelector('.piece'));
    }, null, 8000);
    check('phe Xanh cũng đi được trên cùng máy', blueMoved, 'quân Xanh không di chuyển');

    // Chế độ đấu máy
    await C.page.click('#btn-leave');
    await C.page.waitForSelector('#view-lobby.is-active');
    await C.page.click('#mode-ai');
    await C.page.waitForSelector('#view-match.is-active');
    await makeMove(C.page, 'e2', 'e3');
    const botReplied = await waitFor(C.page,
      () => document.querySelectorAll('#history .history__item').length >= 2, null, 12000);
    check('bot tự động đi nước đáp lại', botReplied, 'bot không đi');

    const backToRed = await waitFor(C.page,
      () => document.getElementById('turnbanner').textContent.includes('Lượt của bạn'), null, 8000);
    check('sau khi bot đi thì trả lượt cho người chơi', backToRed, 'không trả lượt');

    await C.context.close();
  } catch (e) {
    bad('nhóm test ngoại tuyến', e.message);
    await C.context.close();
  }
}

async function testIllegalMoveBlocked(browser) {
  head('Chống nước đi phi luật qua mạng');
  const code = 'ott-hack' + Math.random().toString(36).slice(2, 5);
  const A = await openClient(browser, { name: 'An', query: 'room=' + code, label: 'A' });
  await waitReady(A);
  await A.page.waitForSelector('#view-match.is-active', { timeout: 20000 });
  await waitFor(A.page, () => {
    const v = window.OTT.Match.derive(window.OTT._internal.currentState());
    return Boolean(v.players.RED);
  }, null, 30000);
  const B = await openClient(browser, { name: 'Binh', query: 'room=' + code, label: 'B' });
  try {
    await waitReady(B);
    await B.page.waitForSelector('#view-match.is-active', { timeout: 20000 });
    await waitFor(A.page, () => {
      const v = window.OTT.Match.derive(window.OTT._internal.currentState());
      return Boolean(v.players.RED && v.players.BLUE);
    }, null, 25000);

    // A tự ghi một nước gian lận: nhảy thẳng quân vào căn cứ i9
    await A.page.evaluate(() => {
      window.OTT._internal.S.ch.update(d => {
        d.moves = [{ id: 'hack', seq: 1, side: 'RED', from: { row: 7, col: 4 }, to: { row: 0, col: 8 }, at: 1 }];
      });
    });
    await new Promise(r => setTimeout(r, 4000));

    const i9OnB = await pieceAt(B.page, 'i9');
    check('nước nhảy thẳng vào i9 bị loại trên máy B', i9OnB === null, `i9 = ${i9OnB}`);

    const modalB = await B.page.evaluate(() => document.getElementById('modal-result').classList.contains('is-open'));
    check('không ai thắng bằng nước phi luật', modalB === false, 'modal kết quả đã mở');

    const histB = await historyOf(B.page);
    check('nước phi luật không vào lịch sử', histB.length === 0, JSON.stringify(histB));

    await A.context.close(); await B.context.close();
  } catch (e) {
    bad('nhóm test chống gian lận', e.message);
    await A.context.close(); await B.context.close();
  }
}

// ---------------------------------------------------------------------------
// Chạy
// ---------------------------------------------------------------------------

(async () => {
  console.log('\n\x1b[1mE2E TEST — OTTv2\x1b[0m');
  console.log(LIVE_URL
    ? `  Mục tiêu: ${LIVE_URL} (URL đã deploy)`
    : `  Mục tiêu: ${ORIGIN} (phục vụ file từ đĩa, không dùng localhost)`);
  console.log(`  Backend đồng bộ: api.playhtml.fun (playhtml lo, không có server riêng)`);

  const browser = await chromium.launch({ headless: HEADLESS });
  const t0 = Date.now();

  try {
    // Warm-up: room PartyKit cho hostname này là mới, lần kết nối đầu có độ trễ
    // khởi tạo. Mở sẵn một client rồi đóng để room tồn tại trước khi test thật.
    console.log('  (warm-up room playhtml...)');
    const warm = await openClient(browser, { name: 'Warmup', label: 'W' });
    await waitReady(warm);
    // Tạo thật một kênh trận để doc của room được khởi tạo đầy đủ
    await warm.page.evaluate(() => window.OTT._internal.enterMatch('warmup-probe', { name: 'warmup' }));
    await warm.page.waitForTimeout(2500);
    await warm.context.close();
    console.log('  warm-up xong');

    const first = await testSyncAndOrientation(browser);
    if (first) {
      const C = await testSpectator(browser, first.code);
      if (C) await C.context.close();
      await first.A.context.close();
      await first.B.context.close();
    }
    await testTypeEliminationWin(browser);
    await testIllegalMoveBlocked(browser);
    await testLobby(browser);
    await testTeamMode(browser);
    await testThemeAndA11y(browser);
    await testOfflineModes(browser);
  } finally {
    await browser.close();
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n' + '─'.repeat(64));
  if (failed === 0) {
    console.log(`\x1b[32m  ✓ ${passed} kiểm tra E2E passed\x1b[0m  (${secs}s)`);
  } else {
    console.log(`\x1b[31m  ✗ ${failed} failed\x1b[0m, \x1b[32m${passed} passed\x1b[0m  (${secs}s)`);
    console.log('\n  Chi tiết lỗi:');
    failures.forEach(f => console.log(`   • [${f.section}] ${f.name}\n     ${f.detail}`));
  }
  console.log('─'.repeat(64) + '\n');
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => {
  console.error('\x1b[31mE2E lỗi nghiêm trọng:\x1b[0m', e);
  process.exit(1);
});

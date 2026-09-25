/**
 * Điều phối ứng dụng OTTv2.
 *
 * Mọi thứ hiển thị đều suy ra từ state bằng OTT.Match.derive(), nên hai máy
 * có cùng state thì chắc chắn thấy cùng bàn cờ, cùng lượt, cùng điểm.
 */
(function (global) {
  'use strict';

  const OTT = global.OTT || (global.OTT = {});
  const R = global.GameRules;
  const Match = OTT.Match;
  const Net = OTT.Net;
  const Sound = OTT.Sound;

  const el = id => document.getElementById(id);
  const SPECTATOR = 'SPECTATOR';
  const TIMEOUT_GRACE_MS = 3000;

  const S = {
    view: 'lobby',
    mode: null,             // '1v1' | 'ai' | 'local' | 'team'
    code: null,
    ch: null,               // kênh trận 1v1
    unsub: null,
    localState: null,       // state cho chế độ offline (ai / local)
    boardView: null,
    controller: null,
    lastMoveCount: 0,
    shownResultKey: null,
    seatAttemptAt: 0,
    lobbyTimer: null,
    tickTimer: null,
    presenceTimer: null,
    team: null              // { code, ch, unsub, boards: [{code, ch, unsub}] }
  };

  // =========================================================================
  // 1. Tiện ích UI
  // =========================================================================

  function toast(msg, kind = '') {
    const box = el('toasts');
    if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast' + (kind ? ' toast--' + kind : '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }

  function openModal(id) { const m = el(id); if (m) m.classList.add('is-open'); }
  function closeModal(id) { const m = el(id); if (m) m.classList.remove('is-open'); }

  function showView(name) {
    S.view = name;
    ['lobby', 'match', 'team'].forEach(v => {
      const node = el('view-' + v);
      if (node) node.classList.toggle('is-active', v === name);
    });
    if (name === 'lobby') startLobbyPolling(); else stopLobbyPolling();
  }

  function setNetStatus(text, kind) {
    const pill = el('net-status');
    const label = el('net-status-text');
    if (label) label.textContent = text;
    if (pill) pill.className = 'pill' + (kind ? ' pill--' + kind : '');
  }

  function shareUrlFor(params) {
    const u = new URL(global.location.href);
    u.search = '';
    u.hash = '';
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    return u.toString();
  }

  function copyToClipboard(text, okMsg) {
    const done = () => toast(okMsg || 'Đã sao chép.', 'ok');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => global.prompt('Sao chép link:', text));
    } else {
      global.prompt('Sao chép link:', text);
    }
  }

  function extractCode(input) {
    const raw = String(input || '').trim();
    if (!raw) return { code: '', kind: null };
    let code = raw;
    let kind = null;
    if (raw.includes('?') || raw.includes('://')) {
      try {
        const u = new URL(raw.startsWith('http') ? raw : 'https://' + raw);
        if (u.searchParams.get('team')) { code = u.searchParams.get('team'); kind = 'team'; }
        else if (u.searchParams.get('room')) { code = u.searchParams.get('room'); kind = '1v1'; }
      } catch (e) { /* để nguyên */ }
    }
    return { code: Net.sanitizeCode(code), kind };
  }

  // =========================================================================
  // 2. Truy cập state (dùng chung cho online và offline)
  // =========================================================================

  function currentState() {
    if (S.mode === 'ai' || S.mode === 'local') return S.localState;
    return S.ch ? S.ch.get() : null;
  }

  function mutate(fn) {
    if (S.mode === 'ai' || S.mode === 'local') {
      fn(S.localState);
      renderMatch();
    } else if (S.ch) {
      S.ch.update(fn);
    }
  }

  function isOnline() { return S.mode === '1v1' || S.mode === 'team'; }

  /** Vai hiệu dụng của người đang ngồi trước máy */
  function myRole(state, view) {
    if (S.mode === 'ai') return R.SIDES.RED;
    if (S.mode === 'local') return view.turn;   // cùng máy: ai tới lượt thì điều khiển
    return Match.roleOf(view, Net.me.id);       // ghế suy ra từ claims
  }

  function canMoveNow(state, view) {
    if (view.status !== 'PLAYING') return false;
    if (S.mode === 'local') return true;
    if (S.mode === 'ai') return view.turn === R.SIDES.RED;
    return Match.canMove(state, view, Net.me.id);
  }

  /** Người được phép ghi các bản cập nhật "hệ thống" (kết quả, reset vòng) */
  function isWriter(view) {
    if (!isOnline()) return true;
    const p = (view && view.players) || {};
    if (p.RED) return p.RED.id === Net.me.id;
    if (p.BLUE) return p.BLUE.id === Net.me.id;
    return false;
  }

  // =========================================================================
  // 3. Sảnh chờ
  // =========================================================================

  function roomSummaryFrom(state, view) {
    return {
      code: state.code,
      name: state.name,
      mode: state.mode,
      createdAt: state.createdAt,
      timePerTurn: state.timePerTurn,
      status: view.status,
      round: view.round,
      moveCount: view.moveCount,
      players: {
        RED: view.players.RED ? { name: view.players.RED.name } : null,
        BLUE: view.players.BLUE ? { name: view.players.BLUE.name } : null
      },
      spectators: (view.spectators || []).length
    };
  }

  function publishCurrentRoom() {
    if (S.mode === '1v1' && S.ch) {
      const st = S.ch.get();
      if (st && st.code) Net.publishRoom(roomSummaryFrom(st, Match.derive(st)));
    } else if (S.mode === 'team' && S.team && S.team.ch) {
      const st = S.team.ch.get();
      if (!st || !st.code) return;
      const slots = teamSlotsOf(st);
      const filled = SLOT_ORDER.filter(k => slots[k]).length;
      Net.publishRoom({
        code: st.code,
        name: st.name,
        mode: 'team',
        createdAt: st.createdAt,
        timePerTurn: st.timePerTurn,
        status: filled >= 4 ? 'PLAYING' : 'WAITING',
        filled,
        players: {
          RED: slots.A1 ? { name: slots.A1.name } : null,
          BLUE: slots.B1 ? { name: slots.B1.name } : null
        },
        spectators: 0
      });
    }
  }

  function renderRooms() {
    const wrap = el('rooms');
    if (!wrap || !Net.isConnected()) return;

    const rooms = Net.listRooms();
    const countPill = el('rooms-count');
    if (countPill) countPill.innerHTML = `<span class="dot dot--pulse"></span><span>${rooms.length} phòng</span>`;

    if (!rooms.length) {
      wrap.innerHTML = `<div class="empty">
        <div class="empty__icon" aria-hidden="true">🎲</div>
        <div><strong>Chưa có phòng nào đang mở.</strong></div>
        <div class="small">Bấm “Tạo phòng 1 vs 1” để mở phòng và gửi link mời cho bạn bè.</div>
      </div>`;
      return;
    }

    wrap.innerHTML = '';
    rooms.forEach(r => {
      const isTeam = r.mode === 'team';
      const statusPill = r.status === 'WAITING'
        ? '<span class="pill pill--ok"><span class="dot"></span>Đang chờ</span>'
        : r.status === 'PLAYING'
          ? '<span class="pill pill--live"><span class="dot dot--pulse"></span>Đang đấu</span>'
          : '<span class="pill">Đã xong</span>';

      const card = document.createElement('div');
      card.className = 'card room';
      card.innerHTML = `
        <div class="room__top">
          <div>
            <div class="room__name"></div>
            <div class="room__code"></div>
          </div>
          ${statusPill}
        </div>
        <div class="room__vs">
          <span class="room__side room__side--red"><span class="dot"></span><span class="room__pname" data-red></span></span>
          <span class="faint">vs</span>
          <span class="room__side room__side--blue"><span class="dot"></span><span class="room__pname" data-blue></span></span>
        </div>
        <div class="room__meta">
          <span>${isTeam ? '2 vs 2 · ' + (r.filled || 0) + '/4 người' : '1 vs 1'}</span>
          <span>${r.timePerTurn || 30}s/lượt</span>
          ${isTeam ? '' : `<span>${r.moveCount || 0} nước</span>`}
          ${r.spectators ? `<span>${r.spectators} khán giả</span>` : ''}
        </div>
        <div class="room__actions">
          <button class="btn btn--primary btn--sm" data-act="join">${r.status === 'WAITING' ? 'Tham gia' : 'Vào xem'}</button>
          <button class="btn btn--sm" data-act="copy">Link</button>
        </div>`;

      card.querySelector('.room__name').textContent = r.name || r.code;
      card.querySelector('.room__code').textContent = r.code;
      card.querySelector('[data-red]').textContent = (r.players && r.players.RED && r.players.RED.name) || 'Trống';
      card.querySelector('[data-blue]').textContent = (r.players && r.players.BLUE && r.players.BLUE.name) || 'Trống';

      card.querySelector('[data-act="join"]').addEventListener('click', () => {
        if (isTeam) enterTeam(r.code);
        else enterMatch(r.code, { name: r.name, timePerTurn: r.timePerTurn });
      });
      card.querySelector('[data-act="copy"]').addEventListener('click', () => {
        copyToClipboard(shareUrlFor(isTeam ? { team: r.code } : { room: r.code }), 'Đã sao chép link phòng.');
      });

      wrap.appendChild(card);
    });
  }

  function startLobbyPolling() {
    stopLobbyPolling();
    if (!Net.isConnected()) return;
    renderRooms();
    S.lobbyTimer = setInterval(renderRooms, 3000);
  }

  function stopLobbyPolling() {
    if (S.lobbyTimer) { clearInterval(S.lobbyTimer); S.lobbyTimer = null; }
  }

  // =========================================================================
  // 4. Trận 1 vs 1 (và các chế độ offline dùng cùng bộ hiển thị)
  // =========================================================================

  function ensureBoard() {
    if (S.boardView) return;
    S.boardView = new OTT.BoardView(el('board'), {
      // Phải vẽ lại ngay sau khi click: việc chọn quân chỉ đổi trạng thái trong
      // controller, không đi qua state mạng nên không có sự kiện nào kích hoạt render.
      onCellClick: (row, col) => { S.controller.handleClick(row, col); renderMatch(); }
    });
    S.controller = new OTT.BoardController(S.boardView, {
      onMove: submitMove,
      onInvalid: reason => {
        if (reason === 'not-your-turn') toast('Chưa tới lượt của bạn.', 'warn');
        else if (reason === 'no-moves') toast('Quân này không còn nước đi nào.', 'warn');
      }
    });
  }

  function leaveMatch() {
    if (S.unsub) { S.unsub(); S.unsub = null; }
    if (S.mode === '1v1' && S.ch) {
      const st = S.ch.get();
      // Bỏ claim -> ghế tự động nhường cho người tiếp theo trong hàng
      S.ch.update(d => {
        if (d.claims && d.claims[Net.me.id]) d.claims[Net.me.id] = null;
      });
      if (st && st.code) {
        const after = Match.derive(S.ch.get());
        if (!after.players.RED && !after.players.BLUE) Net.unpublishRoom(st.code);
        else publishCurrentRoom();
      }
    }
    S.ch = null;
    S.mode = null;
    S.code = null;
    S.localState = null;
    S.lastMoveCount = 0;
    S.shownResultKey = null;
    stopTick();
    stopPresence();
    closeModal('modal-result');
    showView('lobby');
  }

  /** Tham gia / tạo một trận 1v1 */
  function enterMatch(code, opts = {}) {
    const clean = Net.sanitizeCode(code);
    if (!clean) { toast('Mã phòng không hợp lệ.', 'err'); return; }
    if (!Net.isConnected()) { toast('Chưa kết nối được máy chủ đồng bộ.', 'err'); return; }

    S.mode = '1v1';
    S.code = clean;
    S.lastMoveCount = 0;
    S.shownResultKey = null;

    const seed = Match.createMatch({
      code: clean,
      name: opts.name || ('Phòng ' + clean),
      timePerTurn: opts.timePerTurn || 30,
      createdBy: Net.me.id,
      seating: 'claims'
    });

    // Chỉ dùng metadata vô hại làm default. Các container (moves/claims/results/chat)
    // được tạo lúc dùng tới, để client vào sau không xoá mất dữ liệu ván đang chạy.
    S.ch = Net.matchChannel(clean, {
      code: seed.code,
      name: seed.name,
      mode: seed.mode,
      timePerTurn: seed.timePerTurn,
      createdAt: seed.createdAt,
      createdBy: seed.createdBy,
      seating: 'claims',
      round: 1
    });
    Net.initFields(S.ch, {
      code: seed.code, name: seed.name, mode: seed.mode,
      timePerTurn: seed.timePerTurn, createdAt: seed.createdAt,
      seating: 'claims', round: 1
    });
    sendClaim();
    if (S.unsub) S.unsub();
    S.unsub = S.ch.onUpdate(() => renderMatch());

    ensureBoard();
    showView('match');
    startTick();
    startPresence();
    renderMatch();

    el('sharebar').classList.remove('hidden');
    el('share-url').value = shareUrlFor({ room: clean });

    // Ghi lại claim một lần sau khi state từ mạng đã về (idempotent, giữ nguyên `at`)
    setTimeout(sendClaim, 1200);
  }

  /**
   * Đăng ký tham gia phòng.
   *
   * Mỗi client CHỈ ghi khoá claims của chính mình, không bao giờ ghi khoá của người
   * khác. Vì thế không tồn tại ghi tranh chấp, Yjs merge sạch, và ghế (Đỏ / Xanh /
   * khán giả) được suy ra tất định bằng cách sắp xếp claims theo (at, id) — mọi máy
   * tính ra cùng kết quả. Đây là lý do không còn cảnh hai người cùng nhận phe Đỏ.
   *
   * Giữ nguyên `at` khi gọi lại để việc đổi tên không làm đảo ghế.
   */
  function sendClaim(asSpectator) {
    if (S.mode !== '1v1' || !S.ch) return;
    S.seatAttemptAt = Date.now();
    const name = Net.displayName();
    S.ch.ensure('claims');
    S.ch.update(d => {
      const prev = d.claims[Net.me.id];
      d.claims[Net.me.id] = {
        id: Net.me.id,
        name,
        at: (prev && prev.at) || Date.now(),
        spectator: Boolean(asSpectator)
      };
    });
    publishCurrentRoom();
  }

  function startLocalGame(mode, opts = {}) {
    S.mode = mode;
    S.ch = null;
    S.code = null;
    S.lastMoveCount = 0;
    S.shownResultKey = null;

    const aiName = 'Máy';
    S.localState = Match.createMatch({
      code: 'local',
      name: mode === 'ai' ? 'Luyện tập với máy' : 'Hai người cùng máy',
      timePerTurn: opts.timePerTurn || 0,   // 0 = không giới hạn thời gian
      createdBy: Net.me.id
    });
    S.localState.players = {
      RED: { id: Net.me.id, name: mode === 'ai' ? Net.displayName() : 'Người chơi 1' },
      BLUE: { id: mode === 'ai' ? 'bot' : Net.me.id, name: mode === 'ai' ? aiName : 'Người chơi 2' }
    };
    S.localState.startedAt = Date.now();

    ensureBoard();
    showView('match');
    el('sharebar').classList.add('hidden');
    startTick();
    renderMatch();
  }

  function submitMove(from, to) {
    const st = currentState();
    if (!st) return;
    const view = Match.derive(st);
    if (!canMoveNow(st, view)) { toast('Chưa tới lượt của bạn.', 'warn'); return; }

    const side = view.turn;
    const check = R.validateMove(view.board, from, to, side);
    if (!check.isValid) { toast(check.error, 'err'); return; }

    const seq = view.moveCount + 1;
    const move = {
      id: Net.me.id + '-' + seq + '-' + Math.random().toString(36).slice(2, 6),
      seq,
      side,
      from: { row: from.row, col: from.col },
      to: { row: to.row, col: to.col },
      at: Date.now()
    };

    if (isOnline() && S.ch) S.ch.ensure('moves', 'array');
    mutate(d => {
      if (!Array.isArray(d.moves)) d.moves = [];
      d.moves.push(move);
    });

    if (isOnline()) publishCurrentRoom();

    // Chế độ đấu máy: bot đi ngay sau đó
    if (S.mode === 'ai') setTimeout(botMove, 420);
  }

  function botMove() {
    if (S.mode !== 'ai' || !S.localState) return;
    const view = Match.derive(S.localState);
    if (view.status !== 'PLAYING' || view.turn !== R.SIDES.BLUE) return;

    const best = OTT.Ai.pickMove(view.board, R.SIDES.BLUE);
    if (!best) return;

    const seq = view.moveCount + 1;
    mutate(d => {
      d.moves.push({
        id: 'bot-' + seq,
        seq,
        side: R.SIDES.BLUE,
        from: best.from,
        to: best.to,
        at: Date.now()
      });
    });
  }

  function resign() {
    const st = currentState();
    if (!st) return;
    const view = Match.derive(st);
    if (view.status !== 'PLAYING') { toast('Ván đã kết thúc.', 'warn'); return; }

    const side = S.mode === 'local' ? view.turn : myRole(st, view);
    if (side === SPECTATOR) { toast('Khán giả không thể đầu hàng.', 'warn'); return; }
    if (!global.confirm('Bạn chắc chắn muốn đầu hàng ván này?')) return;

    mutate(d => { d.resign = { round: Number(d.round) || 1, side, by: Net.me.id }; });
    if (isOnline()) publishCurrentRoom();
  }

  function voteRematch() {
    const st = currentState();
    if (!st) return;

    if (!isOnline()) {
      mutate(d => {
        d.results[Number(d.round) || 1] = Match.derive(d).result || { winner: null, reason: 'X', message: '' };
        d.round = (Number(d.round) || 1) + 1;
        d.moves = [];
        d.resign = null;
        d.timeout = null;
        d.startedAt = Date.now();
      });
      S.shownResultKey = null;
      closeModal('modal-result');
      return;
    }

    S.ch.ensure('rematch');
    mutate(d => {
      d.rematch[Net.me.id] = Number(d.round) || 1;
    });
    el('rematch-hint').textContent = 'Đã gửi yêu cầu, đang chờ đối thủ đồng ý…';
  }

  /** Ghi kết quả vòng hiện tại và xử lý đấu lại — chỉ một người ghi để tránh nhiễu */
  function reconcileMatch(state, view) {
    if (!isOnline() || !isWriter(view)) return;
    const round = view.round;

    if (view.result && !(state.results || {})[round]) {
      S.ch.ensure('results');
      S.ch.update(d => {
        if (!d.results[round]) {
          d.results[round] = {
            winner: view.result.winner,
            reason: view.result.reason,
            message: view.result.message,
            at: Date.now()
          };
        }
      });
      return;
    }

    // Cả hai người chơi đã bỏ phiếu đấu lại -> sang vòng mới
    if (view.result && view.status === 'FINISHED') {
      const p = view.players || {};
      const votes = state.rematch || {};
      const bothVoted = p.RED && p.BLUE && votes[p.RED.id] === round && votes[p.BLUE.id] === round;
      if (bothVoted) {
        S.ch.update(d => {
          if (Number(d.round) !== round) return;
          d.round = round + 1;
          d.moves = [];
          d.resign = null;
          d.timeout = null;
          d.rematch = {};
          d.startedAt = Date.now();
        });
      }
    }
  }

  /** Đòi thắng khi đối thủ hết giờ. Chỉ phe KHÔNG tới lượt được đòi, cộng thêm thời gian bù. */
  function checkTimeout(state, view) {
    const limit = Number(state.timePerTurn) || 0;
    if (!limit || view.status !== 'PLAYING' || !view.turnStartedAt) return;

    const elapsed = Date.now() - view.turnStartedAt;
    if (elapsed < limit * 1000 + TIMEOUT_GRACE_MS) return;

    if (isOnline()) {
      const role = Match.roleOf(view, Net.me.id);
      if (role === SPECTATOR || role === view.turn) return;  // chỉ đối thủ được đòi
    }

    mutate(d => {
      if (!d.timeout) d.timeout = { round: view.round, side: view.turn, at: Date.now() };
    });
  }

  /**
   * Nhịp hiện diện: cứ 5 giây tự đăng ký lại (idempotent, giữ nguyên `at`) và
   * làm mới thẻ phòng trong sảnh.
   *
   * Cần thiết vì: room PartyKit mới có độ trễ khởi tạo (cold start) — hai client
   * vào cùng lúc có thể chưa thấy nhau ở lần ghi đầu; và khi mạng chập chờn rồi
   * kết nối lại thì claim có thể bị mất. Ghi lại định kỳ giúp state tự lành.
   */
  function startPresence() {
    stopPresence();
    S.presenceTimer = setInterval(() => {
      if (!Net.isConnected()) return;
      if (S.mode === '1v1' && S.ch) {
        const st = S.ch.get() || {};
        const claimed = (st.claims || {})[Net.me.id];
        const view = Match.derive(st);
        const iAmPlayer = Match.roleOf(view, Net.me.id) !== SPECTATOR;
        if (!claimed || (!iAmPlayer && (!view.players.RED || !view.players.BLUE))) sendClaim();
        publishCurrentRoom();
      } else if (S.mode === 'team' && S.team) {
        const ts = S.team.ch.get() || {};
        if (!(ts.claims || {})[Net.me.id]) claimTeamSlot();
        publishCurrentRoom();
      }
    }, 5000);
  }

  function stopPresence() {
    if (S.presenceTimer) { clearInterval(S.presenceTimer); S.presenceTimer = null; }
  }

  function startTick() {
    stopTick();
    S.tickTimer = setInterval(() => {
      const st = currentState();
      if (!st) return;
      const view = Match.derive(st);
      renderTimer(st, view);
      checkTimeout(st, view);
    }, 400);
  }

  function stopTick() {
    if (S.tickTimer) { clearInterval(S.tickTimer); S.tickTimer = null; }
  }

  function renderTimer(state, view) {
    const box = el('timerbox');
    const out = el('timer');
    if (!out) return;
    const secs = Match.secondsLeft(state, view);
    if (secs === null) {
      out.textContent = Number(state.timePerTurn) ? '—' : '∞';
      if (box) box.classList.remove('is-warning');
      return;
    }
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    out.textContent = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : String(s);
    if (box) box.classList.toggle('is-warning', secs <= 5);
  }

  function renderCounts(node, byType, side) {
    if (!node) return;
    node.innerHTML = '';
    R.TYPE_ORDER.forEach(type => {
      const n = byType[type] || 0;
      const chip = document.createElement('span');
      chip.className = 'count' + (n === 0 ? ' is-gone is-critical' : n === 1 ? ' is-critical' : n === 2 ? ' is-low' : '');
      chip.title = `${R.SIDE_NAMES_VI[side]} còn ${n} quân ${R.TYPE_NAMES_VI[type]}` +
        (n === 1 ? ' — mất quân này là thua!' : '');
      chip.innerHTML = `<span>${R.TYPE_NAMES_VI[type]}</span><span class="count__n">${n}</span>`;
      node.appendChild(chip);
    });
  }

  function renderHistory(view) {
    const box = el('history');
    if (!box) return;
    // Dựng lại toàn bộ từ state -> không thể lệch giữa hai máy
    box.innerHTML = '';
    view.moves.forEach(m => {
      const row = document.createElement('div');
      row.className = 'history__item';
      const sideCls = m.side === R.SIDES.RED ? 'red' : 'blue';
      row.innerHTML = `
        <span class="history__n">${m.seq}.</span>
        <span class="history__side history__side--${sideCls}">${R.SIDE_NAMES_VI[m.side]}</span>
        <span class="history__txt">${m.notation}</span>
        ${m.capturedPiece ? `<span class="history__cap">ăn ${R.TYPE_NAMES_VI[m.capturedPiece.type]}</span>` : ''}`;
      box.appendChild(row);
    });
    box.scrollTop = box.scrollHeight;
  }

  function renderChat(state) {
    const box = el('chat-log');
    if (!box) return;
    const list = Array.isArray(state.chat) ? state.chat : [];
    box.innerHTML = '';
    list.forEach(c => {
      const cls = c.side === R.SIDES.RED ? 'red' : c.side === R.SIDES.BLUE ? 'blue' : 'spec';
      const row = document.createElement('div');
      row.className = 'chat__msg';
      const from = document.createElement('div');
      from.className = 'chat__from chat__from--' + cls;
      from.textContent = c.name || 'Ẩn danh';
      const txt = document.createElement('div');
      txt.textContent = c.text;                  // textContent -> không thể chèn HTML
      row.appendChild(from);
      row.appendChild(txt);
      box.appendChild(row);
    });
    box.scrollTop = box.scrollHeight;
  }

  function renderMatch() {
    const state = currentState();
    if (!state || S.view !== 'match') return;

    const view = Match.derive(state);
    const role = myRole(state, view);
    const iAmPlayer = role === R.SIDES.RED || role === R.SIDES.BLUE;

    ensureBoard();

    // --- xoay bàn cờ theo phe của mình (fix lỗi người Xanh thấy ngược) ---
    const orientation = (S.mode === '1v1' && role === R.SIDES.BLUE) ? R.SIDES.BLUE : R.SIDES.RED;
    S.boardView.setOrientation(orientation);

    // --- âm thanh khi có nước đi mới ---
    if (view.moveCount > S.lastMoveCount) {
      const last = view.lastMove;
      if (last && last.capturedPiece) Sound.capture(); else Sound.move();
    }
    S.lastMoveCount = view.moveCount;

    // --- tiêu đề, vai ---
    el('match-title').textContent = `${state.name} · ${state.code}` + (view.round > 1 ? ` · ván ${view.round}` : '');
    const rolePill = el('match-role');
    if (S.mode === 'local') rolePill.textContent = 'Hai người cùng máy';
    else if (S.mode === 'ai') rolePill.textContent = 'Bạn là phe Đỏ';
    else if (iAmPlayer) rolePill.textContent = 'Bạn là phe ' + R.SIDE_NAMES_VI[role];
    else rolePill.textContent = 'Khán giả';
    rolePill.className = 'pill' + (iAmPlayer ? ' pill--ok' : '');

    el('btn-resign').classList.toggle('hidden', !iAmPlayer || view.status !== 'PLAYING');

    // --- thẻ hai phe ---
    const p = view.players || {};
    el('red-name').textContent = (p.RED && p.RED.name) || 'Đang chờ…';
    el('blue-name').textContent = (p.BLUE && p.BLUE.name) || 'Đang chờ…';
    el('red-score').textContent = view.scores.RED;
    el('blue-score').textContent = view.scores.BLUE;
    el('red-you').classList.toggle('hidden', !(S.mode === '1v1' ? role === R.SIDES.RED : S.mode === 'ai'));
    el('blue-you').classList.toggle('hidden', !(S.mode === '1v1' && role === R.SIDES.BLUE));
    el('card-red').classList.toggle('is-turn', view.status === 'PLAYING' && view.turn === R.SIDES.RED);
    el('card-blue').classList.toggle('is-turn', view.status === 'PLAYING' && view.turn === R.SIDES.BLUE);
    renderCounts(el('red-counts'), view.counts.byType.RED, R.SIDES.RED);
    renderCounts(el('blue-counts'), view.counts.byType.BLUE, R.SIDES.BLUE);

    // --- băng trạng thái lượt ---
    const banner = el('turnbanner');
    banner.classList.remove('is-yours', 'is-over');
    if (view.status === 'WAITING') {
      banner.textContent = 'Đang chờ đối thủ vào phòng — hãy gửi link mời.';
    } else if (view.status === 'FINISHED') {
      banner.textContent = view.result ? view.result.message : 'Ván đã kết thúc.';
      banner.classList.add('is-over');
    } else if (S.mode === 'local') {
      banner.textContent = 'Lượt của phe ' + R.SIDE_NAMES_VI[view.turn];
      banner.classList.add('is-yours');
    } else if (view.turn === role) {
      banner.textContent = 'Lượt của bạn';
      banner.classList.add('is-yours');
    } else {
      banner.textContent = 'Đang chờ phe ' + R.SIDE_NAMES_VI[view.turn] + ' đi…';
    }

    // --- bàn cờ ---
    const canMove = canMoveNow(state, view);
    const controlSide = S.mode === 'local' ? view.turn : role;
    S.controller.setContext({ board: view.board, canMove, mySide: controlSide });
    S.boardView.render(view.board, {
      selected: S.controller.selected,
      moves: S.controller.moves,
      lastMove: view.lastMove,
      interactive: canMove,
      mySide: controlSide
    });

    renderHistory(view);
    renderChat(state);
    renderTimer(state, view);

    // --- kết quả ---
    const key = state.code + ':' + view.round;
    if (view.result && S.shownResultKey !== key) {
      S.shownResultKey = key;
      showResult(view, role);
    }
    if (!view.result && S.shownResultKey === key) {
      S.shownResultKey = null;
      closeModal('modal-result');
    }

    // --- công việc hậu kỳ (ghi kết quả, đấu lại) ---
    reconcileMatch(state, view);

    // Ghế trống mà mình chưa đăng ký (vd vừa có người rời phòng) thì đăng ký lại.
    if (S.mode === '1v1' && !iAmPlayer && (!p.RED || !p.BLUE)) {
      const claimed = (state.claims || {})[Net.me.id];
      if (!claimed && Date.now() - S.seatAttemptAt > 1500) sendClaim();
    }
  }

  function showResult(view, role) {
    const r = view.result;
    const iAmPlayer = role === R.SIDES.RED || role === R.SIDES.BLUE;
    const won = iAmPlayer && r.winner === role;

    if (S.mode === 'local') {
      el('result-icon').textContent = '🏆';
      el('result-title').textContent = 'Phe ' + R.SIDE_NAMES_VI[r.winner] + ' thắng';
      el('result-title').className = 'result__title';
    } else if (iAmPlayer) {
      el('result-icon').textContent = won ? '🏆' : '💔';
      el('result-title').textContent = won ? 'Bạn thắng!' : 'Bạn thua';
      el('result-title').className = 'result__title ' + (won ? 'result__title--win' : 'result__title--lose');
      won ? Sound.win() : Sound.lose();
    } else {
      el('result-icon').textContent = '🏆';
      el('result-title').textContent = 'Phe ' + R.SIDE_NAMES_VI[r.winner] + ' thắng';
      el('result-title').className = 'result__title';
    }

    el('result-msg').textContent = r.message;
    const why = {
      TYPE_ELIMINATED: 'Thắng do ăn hết sạch một loại quân của đối phương.',
      BASE_INVADED: 'Thắng do đưa quân vào ô căn cứ đối phương.',
      ALL_PIECES_CAPTURED: 'Thắng do ăn hết toàn bộ quân đối phương.',
      NO_VALID_MOVES: 'Thắng do đối phương hết nước đi hợp lệ.',
      TIMEOUT: 'Thắng do đối phương hết thời gian.',
      SURRENDER: 'Thắng do đối phương đầu hàng.'
    };
    el('result-why').textContent = why[r.reason] || '';
    el('rematch-hint').textContent = '';
    el('btn-rematch').classList.toggle('hidden', !iAmPlayer && S.mode === '1v1');
    openModal('modal-result');
  }

  function sendChat() {
    const input = el('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const state = currentState();
    if (!state) return;
    const view = Match.derive(state);
    const role = myRole(state, view);

    const entry = {
      id: Net.me.id + '-' + Date.now(),
      name: S.mode === 'local' ? 'Máy này' : Net.displayName(),
      side: role === SPECTATOR ? null : role,
      text: text.slice(0, 140),
      at: Date.now()
    };

    if (isOnline() && S.ch) Net.pushChat(S.ch, entry);
    else mutate(d => { if (!Array.isArray(d.chat)) d.chat = []; d.chat.push(entry); });
  }

  // =========================================================================
  // 5. Giải đấu 2 vs 2 — hai bàn song song, tính điểm đội
  //
  // Vị trí (A1/B1/A2/B2) cũng suy ra tất định từ claims như phòng 1v1, nên không
  // có ghi tranh chấp. Hai bàn là hai kênh trận riêng; người chơi của mỗi bàn
  // được TRUYỀN VÀO derive() chứ không ghi vào state bàn -> zero write xung đột.
  // =========================================================================

  const SLOT_ORDER = ['A1', 'B1', 'A2', 'B2'];
  // Bàn 1: A1 (Đỏ) vs B1 (Xanh) — Bàn 2: B2 (Đỏ) vs A2 (Xanh)
  const SLOT_MAP = {
    A1: { board: 0, side: R.SIDES.RED },
    B1: { board: 0, side: R.SIDES.BLUE },
    B2: { board: 1, side: R.SIDES.RED },
    A2: { board: 1, side: R.SIDES.BLUE }
  };

  function createTeamState(code, name, timePerTurn) {
    return {
      code, name,
      mode: 'team',
      timePerTurn: Number(timePerTurn) || 60,
      createdAt: Date.now(),
      createdBy: Net.me.id,
      claims: {}
    };
  }

  /** Suy ra ai giữ vị trí nào, tất định trên mọi máy */
  function teamSlotsOf(teamState) {
    const list = Object.values((teamState && teamState.claims) || {})
      .filter(c => c && c.id)
      .sort((a, b) => ((a.at || 0) - (b.at || 0)) || String(a.id).localeCompare(String(b.id)));
    const slots = { A1: null, B1: null, A2: null, B2: null };
    SLOT_ORDER.forEach((k, idx) => {
      const c = list[idx];
      if (c) slots[k] = { id: c.id, name: c.name, at: c.at || 0 };
    });
    return slots;
  }

  function boardPlayersFor(slots, boardIdx) {
    const out = { RED: null, BLUE: null };
    for (const [slot, cfg] of Object.entries(SLOT_MAP)) {
      if (cfg.board !== boardIdx) continue;
      out[cfg.side] = slots[slot] ? { id: slots[slot].id, name: slots[slot].name, at: slots[slot].at } : null;
    }
    return out;
  }

  function deriveBoard(teamState, boardState, boardIdx) {
    return Match.derive(boardState, { players: boardPlayersFor(teamSlotsOf(teamState), boardIdx) });
  }

  function mySlot(teamState) {
    const slots = teamSlotsOf(teamState);
    return SLOT_ORDER.find(k => slots[k] && slots[k].id === Net.me.id) || null;
  }

  function enterTeam(code, opts = {}) {
    const clean = Net.sanitizeCode(code);
    if (!clean) { toast('Mã giải không hợp lệ.', 'err'); return; }
    if (!Net.isConnected()) { toast('Chưa kết nối được máy chủ đồng bộ.', 'err'); return; }

    leaveTeam(true);
    S.mode = 'team';

    const teamMeta = createTeamState(clean, opts.name || ('Giải ' + clean), opts.timePerTurn || 60);
    delete teamMeta.claims;   // container tạo lúc dùng, không đưa vào default
    const ch = Net.teamChannel(clean, teamMeta);
    Net.initFields(ch, teamMeta);
    const perTurn = opts.timePerTurn || (ch.get() || {}).timePerTurn || 60;

    const boards = [0, 1].map(i => {
      const bcode = clean + '-b' + (i + 1);
      const meta = {
        code: bcode,
        name: 'Bàn ' + (i + 1),
        mode: 'team',
        timePerTurn: perTurn,
        createdAt: Date.now(),
        createdBy: Net.me.id,
        teamCode: clean,
        boardIndex: i,
        seating: 'fixed',
        round: 1
      };
      // Bốn client cùng mở hai bàn này, nên chỉ điền khoá còn thiếu (xem initFields)
      const bch = Net.matchChannel(bcode, meta);
      Net.initFields(bch, meta);
      return { code: bcode, ch: bch, unsub: null };
    });

    S.team = { code: clean, ch, boards, unsub: null, view: null, controller: null, mini: null };

    claimTeamSlot();

    S.team.unsub = ch.onUpdate(() => renderTeam());
    boards.forEach(b => { b.unsub = b.ch.onUpdate(() => renderTeam()); });

    showView('team');
    el('team-share-url').value = shareUrlFor({ team: clean });
    startTeamTick();
    startPresence();
    renderTeam();

    setTimeout(claimTeamSlot, 1200);
  }

  /** Chỉ ghi claim của chính mình; vị trí do teamSlotsOf() suy ra */
  function claimTeamSlot() {
    const T = S.team;
    if (!T) return;
    const name = Net.displayName();
    T.ch.ensure('claims');
    T.ch.update(d => {
      const prev = d.claims[Net.me.id];
      d.claims[Net.me.id] = { id: Net.me.id, name, at: (prev && prev.at) || Date.now() };
    });
    publishCurrentRoom();
  }

  function teamPoints(views) {
    // Bàn 1: Đỏ = đội A, Xanh = đội B. Bàn 2: Đỏ = đội B, Xanh = đội A.
    const A = views[0].scores.RED + views[1].scores.BLUE;
    const B = views[0].scores.BLUE + views[1].scores.RED;
    return { A, B };
  }

  function renderTeam() {
    const T = S.team;
    if (!T || S.view !== 'team') return;

    const ts = T.ch.get() || {};
    const slots = teamSlotsOf(ts);
    const states = T.boards.map(b => b.ch.get() || {});
    const views = states.map((st, i) => deriveBoard(ts, st, i));

    el('team-title').textContent = `${ts.name || T.code} · ${T.code}`;

    const pts = teamPoints(views);
    el('teamA-pts').textContent = pts.A;
    el('teamB-pts').textContent = pts.B;
    el('teamA-players').textContent = [slots.A1, slots.A2].map(s2 => (s2 ? s2.name : 'trống')).join(', ');
    el('teamB-players').textContent = [slots.B1, slots.B2].map(s2 => (s2 ? s2.name : 'trống')).join(', ');

    const slotBox = el('team-slots');
    slotBox.innerHTML = '';
    SLOT_ORDER.forEach(k => {
      const occ = slots[k];
      const cfg = SLOT_MAP[k];
      const d = document.createElement('div');
      d.className = 'slot' + (occ ? '' : ' is-empty') + (occ && occ.id === Net.me.id ? ' is-me' : '');
      d.innerHTML = `<span class="slot__tag">${k}</span>
        <span></span>
        <span class="spacer"></span>
        <span class="faint small">Bàn ${cfg.board + 1} · ${R.SIDE_NAMES_VI[cfg.side]}</span>`;
      d.children[1].textContent = occ ? occ.name : 'Đang trống';
      slotBox.appendChild(d);
    });

    const slot = mySlot(ts);
    const filled = SLOT_ORDER.filter(k => slots[k]).length;
    el('team-role').textContent = slot ? `Vị trí ${slot}` : 'Khán giả';
    el('team-role').className = 'pill' + (slot ? ' pill--ok' : '');
    el('team-status').textContent = filled < 4
      ? `Đã có ${filled}/4 người. Cần đủ 4 người thì cả hai bàn mới bắt đầu.`
      : 'Đủ 4 người — hai bàn đang thi đấu song song.';

    const cfg = slot ? SLOT_MAP[slot] : { board: 0, side: R.SIDES.RED };
    const mainIdx = cfg.board;
    const miniIdx = mainIdx === 0 ? 1 : 0;

    if (!T.view) {
      T.view = new OTT.BoardView(el('team-board'), {
        onCellClick: (row, col) => { T.controller.handleClick(row, col); renderTeam(); }
      });
      T.controller = new OTT.BoardController(T.view, {
        onMove: (from, to) => submitTeamMove(T.mainIdx, from, to),
        onInvalid: reason => { if (reason === 'not-your-turn') toast('Chưa tới lượt của bạn.', 'warn'); }
      });
      T.mini = new OTT.BoardView(el('mini-board'), { compact: true });
    }
    T.mainIdx = mainIdx;

    const mainState = states[mainIdx];
    const mainView = views[mainIdx];
    const mySide = slot ? cfg.side : null;

    T.view.setOrientation(mySide === R.SIDES.BLUE ? R.SIDES.BLUE : R.SIDES.RED);

    const canMove = Boolean(slot) && mainView.status === 'PLAYING' && mainView.turn === mySide;
    T.controller.setContext({ board: mainView.board, canMove, mySide });
    T.view.render(mainView.board, {
      selected: T.controller.selected,
      moves: T.controller.moves,
      lastMove: mainView.lastMove,
      interactive: canMove,
      mySide
    });

    const pMain = mainView.players || {};
    el('team-board-label').textContent =
      `Bàn ${mainIdx + 1}: ${(pMain.RED && pMain.RED.name) || 'trống'} (Đỏ) vs ${(pMain.BLUE && pMain.BLUE.name) || 'trống'} (Xanh)`;

    const banner = el('team-turnbanner');
    banner.classList.remove('is-yours', 'is-over');
    if (!slot) banner.textContent = 'Bạn đang xem với tư cách khán giả.';
    else if (mainView.status === 'WAITING') banner.textContent = 'Chờ đủ người cho bàn của bạn…';
    else if (mainView.status === 'FINISHED') {
      banner.textContent = mainView.result ? mainView.result.message : 'Bàn này đã xong.';
      banner.classList.add('is-over');
    } else if (canMove) { banner.textContent = 'Lượt của bạn'; banner.classList.add('is-yours'); }
    else banner.textContent = 'Đang chờ đối thủ đi…';

    const miniView = views[miniIdx];
    const pMini = miniView.players || {};
    el('mini-title').textContent = `Bàn ${miniIdx + 1}: ${(pMini.RED && pMini.RED.name) || 'trống'} vs ${(pMini.BLUE && pMini.BLUE.name) || 'trống'}`;
    const ms = el('mini-status');
    ms.textContent = miniView.status === 'PLAYING' ? 'Đang đấu' : miniView.status === 'FINISHED' ? 'Đã xong' : 'Đang chờ';
    ms.className = 'pill' + (miniView.status === 'PLAYING' ? ' pill--live' : '');
    T.mini.render(miniView.board, { interactive: false });

    const res = el('team-results');
    res.innerHTML = '';
    views.forEach((v, i) => {
      const line = document.createElement('div');
      const label = `Bàn ${i + 1}`;
      if (v.result) {
        const winnerTeam = (i === 0) === (v.result.winner === R.SIDES.RED) ? 'A' : 'B';
        line.innerHTML = `<strong>${label}:</strong> đội ${winnerTeam} thắng — <span class="faint"></span>`;
        line.querySelector('.faint').textContent = v.result.message;
      } else {
        line.innerHTML = `<strong>${label}:</strong> <span class="muted"></span>`;
        line.querySelector('.muted').textContent =
          v.status === 'PLAYING' ? 'đang đấu, ' + v.moveCount + ' nước' : 'chưa bắt đầu';
      }
      res.appendChild(line);
    });

    if (views.every(v => v.result)) {
      const verdict = pts.A === pts.B
        ? 'Hai đội hoà nhau.'
        : `Đội ${pts.A > pts.B ? 'A' : 'B'} thắng giải ${Math.max(pts.A, pts.B)}–${Math.min(pts.A, pts.B)}.`;
      const line = document.createElement('div');
      line.style.marginTop = '8px';
      line.innerHTML = '<strong>Kết quả giải:</strong> ';
      line.appendChild(document.createTextNode(verdict));
      res.appendChild(line);
    }

    // Ghi kết quả từng bàn — người giữ ghế Đỏ của bàn đó là người ghi
    T.boards.forEach((b, i) => {
      const st = states[i];
      const v = views[i];
      const amWriter = v.players.RED && v.players.RED.id === Net.me.id;
      if (amWriter && v.result && !(st.results || {})[v.round]) {
        b.ch.ensure('results');
        b.ch.update(d => {
          if (!d.results[v.round]) {
            d.results[v.round] = { winner: v.result.winner, reason: v.result.reason, message: v.result.message, at: Date.now() };
          }
        });
      }
    });
  }

  function submitTeamMove(boardIdx, from, to) {
    const T = S.team;
    if (!T) return;
    const board = T.boards[boardIdx];
    const ts = T.ch.get() || {};
    const view = deriveBoard(ts, board.ch.get() || {}, boardIdx);
    const slot = mySlot(ts);
    if (!slot) { toast('Khán giả không thể đi quân.', 'warn'); return; }
    const side = SLOT_MAP[slot].side;

    if (view.status !== 'PLAYING' || view.turn !== side) { toast('Chưa tới lượt của bạn.', 'warn'); return; }
    const check = R.validateMove(view.board, from, to, side);
    if (!check.isValid) { toast(check.error, 'err'); return; }

    const seq = view.moveCount + 1;
    board.ch.ensure('moves', 'array');
    board.ch.update(d => {
      d.moves.push({
        id: Net.me.id + '-' + seq + '-' + Math.random().toString(36).slice(2, 6),
        seq, side,
        from: { row: from.row, col: from.col },
        to: { row: to.row, col: to.col },
        at: Date.now()
      });
    });
    if (check.isCapture) Sound.capture(); else Sound.move();
    publishCurrentRoom();
  }

  function startTeamTick() {
    stopTick();
    S.tickTimer = setInterval(() => {
      const T = S.team;
      if (!T) return;
      const ts = T.ch.get() || {};
      T.boards.forEach((b, i) => {
        const st = b.ch.get() || {};
        const v = deriveBoard(ts, st, i);
        const limit = Number(st.timePerTurn) || 0;
        if (!limit || v.status !== 'PLAYING' || !v.turnStartedAt) return;
        if (Date.now() - v.turnStartedAt < limit * 1000 + TIMEOUT_GRACE_MS) return;
        const role = Match.roleOf(v, Net.me.id);
        if (role === SPECTATOR || role === v.turn) return;
        b.ch.update(d => { if (!d.timeout) d.timeout = { round: v.round, side: v.turn, at: Date.now() }; });
      });
    }, 700);
  }

  function leaveTeam(silent) {
    const T = S.team;
    if (!T) { if (!silent) showView('lobby'); return; }
    if (T.unsub) T.unsub();
    T.boards.forEach(b => { if (b.unsub) b.unsub(); });

    T.ch.update(d => {
      if (d.claims && d.claims[Net.me.id]) d.claims[Net.me.id] = null;
    });

    const ts = T.ch.get() || {};
    const remaining = Object.values(ts.claims || {}).filter(Boolean).length;
    if (!remaining && ts.code) Net.unpublishRoom(ts.code);

    S.team = null;
    stopTick();
    stopPresence();
    if (!silent) { S.mode = null; showView('lobby'); }
  }

  // =========================================================================
  // 6. Gắn sự kiện
  // =========================================================================

  function bindEvents() {
    el('btn-theme').addEventListener('click', () => OTT.Theme.toggle());

    const soundBtn = el('btn-sound');
    const paintSound = () => {
      soundBtn.textContent = Sound.isMuted() ? '🔇' : '♪';
      soundBtn.title = Sound.isMuted() ? 'Bật âm thanh' : 'Tắt âm thanh';
    };
    paintSound();
    soundBtn.addEventListener('click', () => { Sound.toggle(); paintSound(); });

    el('btn-rules').addEventListener('click', () => openModal('modal-rules'));
    document.querySelectorAll('[data-close]').forEach(b =>
      b.addEventListener('click', () => closeModal(b.getAttribute('data-close'))));
    document.querySelectorAll('.modal').forEach(m =>
      m.addEventListener('click', e => { if (e.target === m) m.classList.remove('is-open'); }));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') document.querySelectorAll('.modal.is-open').forEach(m => m.classList.remove('is-open'));
    });

    const nameInput = el('input-name');
    nameInput.value = Net.me.name;
    nameInput.placeholder = Net.displayName();
    nameInput.addEventListener('change', () => {
      Net.setName(nameInput.value);
      toast('Đã lưu tên: ' + Net.displayName(), 'ok');
      if (S.mode === '1v1') sendClaim();
      if (S.mode === 'team') claimTeamSlot();
    });

    el('mode-1v1').addEventListener('click', () => openModal('modal-create'));
    el('mode-team').addEventListener('click', () => openModal('modal-team'));
    el('mode-ai').addEventListener('click', () => startLocalGame('ai'));
    el('mode-local').addEventListener('click', () => startLocalGame('local'));

    el('form-create').addEventListener('submit', e => {
      e.preventDefault();
      closeModal('modal-create');
      enterMatch(Net.randomCode('ott'), {
        name: el('create-name').value.trim() || 'Phòng đấu OTTv2',
        timePerTurn: parseInt(el('create-time').value, 10) || 30
      });
    });

    el('form-team').addEventListener('submit', e => {
      e.preventDefault();
      closeModal('modal-team');
      enterTeam(Net.randomCode('team'), {
        name: el('team-name').value.trim() || 'Giải đấu đội',
        timePerTurn: parseInt(el('team-time').value, 10) || 60
      });
    });

    el('btn-join').addEventListener('click', () => {
      const { code, kind } = extractCode(el('input-join').value);
      if (!code) { toast('Hãy nhập mã phòng hoặc dán link mời.', 'warn'); return; }
      const known = Net.listRooms().find(r => r.code === code);
      if (kind === 'team' || (known && known.mode === 'team')) enterTeam(code);
      else enterMatch(code);
    });
    el('input-join').addEventListener('keydown', e => { if (e.key === 'Enter') el('btn-join').click(); });

    el('btn-refresh').addEventListener('click', () => { Net.pruneRooms(); renderRooms(); toast('Đã làm mới.', 'ok'); });

    el('btn-leave').addEventListener('click', leaveMatch);
    el('btn-resign').addEventListener('click', resign);
    el('btn-copy').addEventListener('click', () => copyToClipboard(el('share-url').value, 'Đã sao chép link mời.'));
    el('btn-rematch').addEventListener('click', voteRematch);
    el('btn-to-lobby').addEventListener('click', () => { closeModal('modal-result'); leaveMatch(); });

    el('btn-team-leave').addEventListener('click', () => leaveTeam(false));
    el('btn-team-copy').addEventListener('click', () => copyToClipboard(el('team-share-url').value, 'Đã sao chép link giải.'));

    el('chat-send').addEventListener('click', sendChat);
    el('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

    global.addEventListener('beforeunload', () => {
      if (S.mode === '1v1') { try { leaveMatch(); } catch (e) {} }
      if (S.mode === 'team') { try { leaveTeam(true); } catch (e) {} }
    });
  }

  // =========================================================================
  // 7. Khởi động
  // =========================================================================

  async function boot(playhtmlLib) {
    bindEvents();
    showView('lobby');
    setNetStatus('Đang kết nối…');

    // Các chế độ offline chạy được ngay, không cần đợi mạng
    try {
      await Net.connect(playhtmlLib);
      const info = Net.roomInfo();
      setNetStatus('Đã kết nối', 'ok');
      const dbg = el('room-debug');
      if (dbg) dbg.textContent = ` · room: ${info.roomId}`;
      global.__ottReady = true;

      Net.pruneRooms();
      startLobbyPolling();

      // Tự vào phòng nếu link có ?room= hoặc ?team=
      const q = new URLSearchParams(global.location.search);
      const room = Net.sanitizeCode(q.get('room'));
      const team = Net.sanitizeCode(q.get('team'));
      if (team) enterTeam(team);
      else if (room) enterMatch(room);
    } catch (err) {
      console.error('[boot]', err);
      setNetStatus('Không kết nối được', 'live');
      global.__ottError = String(err && err.message || err);
      toast(String(err && err.message || err), 'err');
    }
  }

  OTT.boot = boot;
  // để test tự động can thiệp được
  OTT._internal = { S, enterMatch, enterTeam, submitMove, currentState, renderMatch, teamSlotsOf, deriveBoard };
})(typeof window !== 'undefined' ? window : globalThis);

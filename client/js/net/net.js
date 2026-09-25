/**
 * Tầng mạng: bọc thư viện playhtml.
 *
 * playhtml lo toàn bộ phần "server": kết nối tới PartyKit công cộng
 * (api.playhtml.fun), đồng bộ realtime và lưu bền state bằng Yjs CRDT.
 * Dự án KHÔNG cần backend riêng — GitHub Pages chỉ phát file tĩnh.
 *
 * LƯU Ý QUAN TRỌNG (đã kiểm chứng bằng test):
 * playhtml tự prefix room bằng window.location.hostname. Nếu trang chạy trên
 * "127.0.0.1:PORT" thì room chứa dấu ':' làm vỡ đường dẫn PartyKit, provider
 * không bao giờ phát event 'sync', và playhtml.init() treo vĩnh viễn (nó await
 * sync mà không có timeout). Vì vậy app phải chạy trên hostname thật
 * (vd *.github.io). Test tự động dùng Playwright chặn request cho một hostname
 * https giả để mô phỏng đúng môi trường đó.
 */
(function (global) {
  'use strict';

  const OTT = global.OTT || (global.OTT = {});

  const APP_ROOM = 'ottv2-hub-v3';   // một room playhtml cho cả app
  const LOBBY_CHANNEL = 'lobby';
  const ROOM_TTL_MS = 90 * 1000;     // phòng không cập nhật quá lâu thì ẩn khỏi sảnh
  const CHAT_LIMIT = 60;

  let playhtml = null;
  let connected = false;
  let connectPromise = null;
  const channels = new Map();

  // --- Danh tính người chơi, bền theo trình duyệt ---------------------------

  function loadIdentity() {
    let id = null;
    let name = null;
    try {
      id = localStorage.getItem('ottv2_player_id');
      name = localStorage.getItem('ottv2_player_name');
    } catch (e) { /* private mode */ }

    if (!id) {
      id = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      try { localStorage.setItem('ottv2_player_id', id); } catch (e) {}
    }
    return { id, name: name || '' };
  }

  const me = loadIdentity();

  function setName(name) {
    me.name = (name || '').trim().slice(0, 24);
    try { localStorage.setItem('ottv2_player_name', me.name); } catch (e) {}
  }

  function displayName() {
    return me.name || 'Người chơi ' + me.id.slice(-4);
  }

  // --- Kết nối --------------------------------------------------------------

  /**
   * @param {object} lib module playhtml đã import
   * @param {object} [opts] { timeoutMs }
   */
  function connect(lib, opts = {}) {
    if (connectPromise) return connectPromise;
    playhtml = lib;

    const timeoutMs = opts.timeoutMs || 25000;

    connectPromise = (async () => {
      let timedOut = false;
      const init = playhtml.init({
        room: APP_ROOM,
        onError: () => console.warn('[net] playhtml báo lỗi kết nối')
      });

      await Promise.race([
        init.catch(err => { throw err; }),
        new Promise(resolve => setTimeout(() => { timedOut = true; resolve(); }, timeoutMs))
      ]);

      if (timedOut) {
        throw new Error(
          'Không kết nối được tới máy chủ đồng bộ playhtml sau ' + Math.round(timeoutMs / 1000) + 's. ' +
          'Nếu đang mở bằng localhost hoặc file:// thì playhtml không hoạt động — hãy mở qua tên miền thật (GitHub Pages).'
        );
      }

      connected = true;
      return playhtml;
    })();

    return connectPromise;
  }

  function isConnected() {
    return connected;
  }

  function roomInfo() {
    if (!playhtml) return { roomId: null, host: null };
    return { roomId: playhtml.roomId, host: playhtml.host };
  }

  // --- Kênh dữ liệu chia sẻ -------------------------------------------------

  function channel(name, defaultValue) {
    if (!connected) throw new Error('Chưa kết nối playhtml');
    if (channels.has(name)) return channels.get(name);

    const raw = playhtml.createPageData(name, defaultValue);
    const listeners = new Set();

    raw.onUpdate(data => {
      listeners.forEach(fn => {
        try { fn(data); } catch (e) { console.error('[net] lỗi trong listener ' + name, e); }
      });
    });

    const handle = {
      name,
      get() { return raw.getData(); },
      /** mutator nhận draft và sửa tại chỗ — Yjs sẽ merge theo từng key */
      update(mutator) { raw.setData(mutator); },
      onUpdate(fn) { listeners.add(fn); return () => listeners.delete(fn); },

      /**
       * Đảm bảo container lồng nhau đã tồn tại TRƯỚC khi ghi vào khoá con.
       *
       * Draft proxy của playhtml không cho đọc lại object vừa được gán trong CÙNG
       * một lần update():
       *     update(d => { if (!d.claims) d.claims = {}; d.claims[id] = x; })
       *     -> TypeError: Cannot read properties of undefined
       * Nên phải tách thành hai lần update. Việc này vẫn giữ được merge theo từng
       * khoá (điều kiện để không có ghi tranh chấp), khác với việc gán cả map.
       */
      ensure(key, kind) {
        const cur = raw.getData() || {};
        const val = cur[key];
        const ok = kind === 'array'
          ? Array.isArray(val)
          : Boolean(val) && typeof val === 'object';
        if (ok) return;
        raw.setData(d => {
          if (kind === 'array') { if (!Array.isArray(d[key])) d[key] = []; }
          else if (!d[key] || typeof d[key] !== 'object') d[key] = {};
        });
      }
    };

    channels.set(name, handle);
    return handle;
  }

  function sanitizeCode(code) {
    return String(code || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  }

  // --- Sảnh chờ -------------------------------------------------------------

  function lobbyChannel() {
    return channel(LOBBY_CHANNEL, { rooms: {} });
  }

  /** Danh sách phòng còn "sống", đã sắp xếp */
  function listRooms(now = Date.now()) {
    const data = lobbyChannel().get() || {};
    const rooms = data.rooms || {};
    return Object.values(rooms)
      .filter(r => r && r.code && (now - (r.updatedAt || 0) < ROOM_TTL_MS))
      .sort((a, b) => {
        const rank = s => (s === 'WAITING' ? 0 : s === 'PLAYING' ? 1 : 2);
        const d = rank(a.status) - rank(b.status);
        return d !== 0 ? d : (b.createdAt || 0) - (a.createdAt || 0);
      });
  }

  /** Ghi/cập nhật thẻ phòng trong sảnh. Chỉ ghi các key của chính phòng đó nên merge an toàn. */
  function publishRoom(summary) {
    if (!summary || !summary.code) return;
    const ch = lobbyChannel();
    ch.ensure('rooms');
    ch.update(d => {
      if (!d.rooms) d.rooms = {};
      d.rooms[summary.code] = { ...summary, updatedAt: Date.now() };
    });
  }

  /**
   * Gỡ thẻ phòng. Draft proxy của playhtml KHÔNG cho phép toán tử `delete`
   * (trap trả falsish -> TypeError), nên đánh dấu bằng null và lọc khi đọc.
   */
  function unpublishRoom(code) {
    const c = sanitizeCode(code);
    const ch = lobbyChannel();
    ch.ensure('rooms');
    ch.update(d => {
      if (d.rooms && d.rooms[c]) d.rooms[c] = null;
    });
  }

  /** Dọn các thẻ phòng đã quá hạn (bất kỳ client nào cũng có thể dọn) */
  function pruneRooms(now = Date.now()) {
    const ch = lobbyChannel();
    ch.ensure('rooms');
    ch.update(d => {
      if (!d.rooms) return;
      for (const [code, r] of Object.entries(d.rooms)) {
        if (r && now - (r.updatedAt || 0) > ROOM_TTL_MS * 3) d.rooms[code] = null;
      }
    });
  }

  // --- Trận đấu -------------------------------------------------------------

  function matchChannel(code, initialState) {
    return channel('match:' + sanitizeCode(code), initialState);
  }

  function teamChannel(code, initialState) {
    return channel('team:' + sanitizeCode(code), initialState);
  }

  /**
   * Điền các khoá còn THIẾU của state, không bao giờ ghi đè khoá đã có.
   *
   * Vì sao cần: createPageData(name, default) áp default khi kênh còn rỗng. Nếu hai
   * client mở cùng một phòng mới trong cùng khoảng round-trip đồng bộ thì cả hai đều
   * thấy kênh rỗng và cùng ghi default — bên ghi sau sẽ XOÁ SẠCH dữ liệu (vd moves)
   * mà bên kia vừa tạo. Vì vậy default truyền cho createPageData chỉ gồm metadata vô
   * hại, còn các container (moves/claims/results/chat) để cho tới khi thực sự dùng.
   */
  function initFields(ch, fields) {
    const cur = ch.get() || {};
    const missing = Object.keys(fields).filter(k => cur[k] === undefined);
    if (!missing.length) return;
    ch.update(d => {
      missing.forEach(k => { if (d[k] === undefined) d[k] = fields[k]; });
    });
  }

  /** Thêm tin nhắn chat, tự cắt bớt cho khỏi phình state */
  function pushChat(ch, entry) {
    ch.ensure('chat', 'array');
    ch.update(d => {
      d.chat.push(entry);
      if (d.chat.length > CHAT_LIMIT) d.chat.splice(0, d.chat.length - CHAT_LIMIT);
    });
  }

  function randomCode(prefix = 'ott') {
    return prefix + '-' + Math.random().toString(36).slice(2, 7);
  }

  OTT.Net = {
    APP_ROOM,
    ROOM_TTL_MS,
    me,
    setName,
    displayName,
    connect,
    isConnected,
    roomInfo,
    channel,
    sanitizeCode,
    randomCode,
    listRooms,
    publishRoom,
    unpublishRoom,
    pruneRooms,
    matchChannel,
    teamChannel,
    initFields,
    pushChat
  };
})(typeof window !== 'undefined' ? window : globalThis);

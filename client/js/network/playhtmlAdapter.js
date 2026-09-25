/** PlayHTML cloud adapter used by the static GitHub Pages build. */
const GLOBAL_CLOUD_ROOMS = new Map();

class PlayhtmlAdapter {
  constructor() {
    this.roomId = null;
    this.clientId = 'client_' + Math.random().toString(36).slice(2, 10);
    this.playerName = 'Người chơi';
    this.role = null;
    this.mySide = null;
    this.roomState = null;
    this.eventListeners = new Map();
    this.broadcastChannel = null;
    this.stateChannel = null;
    this.unsubscribeState = null;
    this.actionListenerId = null;
    this.heartbeatInterval = null;
    this.playhtmlReady = false;
  }

  isAuthoritative() {
    return true;
  }

  async init(roomId, playerName, isHost = false, options = {}) {
    this.roomId = String(roomId || '').trim().toLowerCase();
    if (!/^ott-[a-z0-9]{4,12}$/.test(this.roomId)) throw new Error('Mã phòng không hợp lệ.');

    this.playerName = String(playerName || '').trim().slice(0, 30) || 'Người chơi';
    this.role = isHost ? 'HOST' : 'GUEST';
    this.mySide = isHost ? 'RED' : 'BLUE';
    this._initBroadcastChannel();
    await this._initPlayhtml();

    if (isHost) {
      this.roomState = {
        roomId: this.roomId,
        roomName: String(options.roomName || `Phòng #${this.roomId.slice(-4).toUpperCase()}`).slice(0, 30),
        status: 'WAITING',
        hostId: this.clientId,
        hostName: this.playerName,
        guestId: null,
        guestName: null,
        spectators: [],
        board: GameRules.cloneBoard(options.initialBoard || GameRules.createInitialBoard()),
        currentTurn: 'RED',
        createdAt: Date.now(),
        gameStartedAt: null,
        finishedAt: null,
        lastMove: null,
        moveHistory: [],
        scores: { red: 0, blue: 0 },
        rematchVotes: [],
        version: 0,
        updatedAt: Date.now()
      };
      this._publishState();
      this._startHeartbeat();
    } else {
      const remote = this.stateChannel?.getData() || this._loadLocalState();
      if (remote?.hostId) this._handleIncomingState(remote);
      this._sendAction({ kind: 'JOIN', playerName: this.playerName });
      await this._waitForAssignment();
    }

    return {
      roomId: this.roomId,
      role: this.role,
      mySide: this.mySide,
      roomState: this.roomState
    };
  }

  async _initPlayhtml() {
    try {
      await Promise.race([
        PlayhtmlAdapter.initGlobalLobby(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('PlayHTML connection timeout')), 5000))
      ]);
      const playhtml = window.playhtml;
      if (!playhtml?.createPageData) return;

      this.playhtmlReady = true;
      this.stateChannel = playhtml.createPageData(`match-${this.roomId}`, null);
      this.unsubscribeState = this.stateChannel.onUpdate(state => this._handleIncomingState(state));
      const actionType = this._actionType();
      this.actionListenerId = playhtml.registerPlayEventListener(actionType, {
        onEvent: ({ eventPayload }) => this._handleAction(eventPayload)
      });
    } catch (error) {
      console.warn('PlayHTML unavailable; same-browser fallback only.', error);
      this.playhtmlReady = false;
    }
  }

  _initBroadcastChannel() {
    if (typeof BroadcastChannel === 'undefined') return;
    this.broadcastChannel = new BroadcastChannel(`ottv2-${this.roomId}`);
    this.broadcastChannel.onmessage = event => {
      if (event.data?.type === 'STATE') this._handleIncomingState(event.data.state);
      if (event.data?.type === 'ACTION') this._handleAction(event.data.action);
    };
  }

  _actionType() {
    return `ottv2-action-${this.roomId}`;
  }

  _sendAction(action) {
    const payload = { ...action, roomId: this.roomId, clientId: this.clientId };
    if (this.playhtmlReady) {
      window.playhtml.dispatchPlayEvent({ type: this._actionType(), eventPayload: payload });
    } else if (action.kind === 'CHAT' || this.role === 'HOST') {
      this._handleAction(payload);
      this.broadcastChannel?.postMessage({ type: 'ACTION', action: payload });
    } else {
      this.broadcastChannel?.postMessage({ type: 'ACTION', action: payload });
    }
  }

  _handleAction(action) {
    if (!action || action.roomId !== this.roomId) return;

    if (action.kind === 'CHAT') {
      this._trigger('chat:receive', {
        sender: String(action.playerName || 'Người chơi').slice(0, 30),
        side: action.side || 'SPECTATOR',
        message: String(action.message || '').slice(0, 120),
        timestamp: action.timestamp || Date.now()
      });
      return;
    }

    if (this.role !== 'HOST' || !this.roomState) return;
    if (action.kind === 'JOIN') this._acceptPlayer(action);
    if (action.kind === 'MOVE') this._applyMove(action);
    if (action.kind === 'REMATCH') this._voteRematch(action.clientId);
    if (action.kind === 'LEAVE') this._leavePlayer(action.clientId);
  }

  _acceptPlayer(action) {
    if (action.clientId === this.roomState.hostId) return;
    if (!this.roomState.guestId || this.roomState.guestId === action.clientId) {
      this.roomState.guestId = action.clientId;
      this.roomState.guestName = String(action.playerName || 'Người chơi Xanh').slice(0, 30);
      this.roomState.status = 'PLAYING';
      this.roomState.gameStartedAt ||= Date.now();
    } else if (!this.roomState.spectators.some(user => user.id === action.clientId)) {
      this.roomState.spectators.push({ id: action.clientId, name: String(action.playerName || 'Khán giả').slice(0, 30) });
    }
    this._publishState();
  }

  _applyMove(action) {
    if (this.roomState.status !== 'PLAYING') return;
    const side = action.clientId === this.roomState.hostId
      ? 'RED'
      : action.clientId === this.roomState.guestId ? 'BLUE' : null;
    if (!side || side !== this.roomState.currentTurn) return;

    const { from, to } = action;
    if (!from || !to) return;
    const validMove = GameRules.getValidMoves(this.roomState.board, from.row, from.col)
      .find(move => move.row === to.row && move.col === to.col);
    if (!validMove || this.roomState.board[from.row]?.[from.col]?.side !== side) return;

    const board = GameRules.cloneBoard(this.roomState.board);
    const movedPiece = board[from.row][from.col];
    const capturedPiece = board[to.row][to.col];
    board[to.row][to.col] = movedPiece;
    board[from.row][from.col] = null;
    const nextTurn = side === 'RED' ? 'BLUE' : 'RED';
    const moveRecord = {
      index: this.roomState.moveHistory.length + 1,
      side,
      from,
      to,
      capturedPiece,
      notation: `${GameRules.posToNotation(from.row, from.col)} → ${GameRules.posToNotation(to.row, to.col)}${capturedPiece ? ' (Ăn quân)' : ''}`,
      timestamp: Date.now()
    };

    Object.assign(this.roomState, {
      board,
      currentTurn: nextTurn,
      lastMove: moveRecord,
      moveHistory: [...this.roomState.moveHistory, moveRecord]
    });

    const result = GameRules.checkGameOver(board, nextTurn);
    if (result.isGameOver) {
      this.roomState.status = 'FINISHED';
      this.roomState.finishedAt = Date.now();
      this.roomState.gameOver = result;
      const scoreKey = result.winner === 'RED' ? 'red' : 'blue';
      this.roomState.scores[scoreKey]++;
    }
    this._publishState();
  }

  _voteRematch(clientId) {
    if (this.roomState.status !== 'FINISHED') return;
    const votes = new Set(this.roomState.rematchVotes);
    votes.add(clientId);
    this.roomState.rematchVotes = [...votes];
    if (votes.has(this.roomState.hostId) && votes.has(this.roomState.guestId)) {
      Object.assign(this.roomState, {
        status: 'PLAYING',
        board: GameRules.createInitialBoard(),
        currentTurn: 'RED',
        gameStartedAt: Date.now(),
        finishedAt: null,
        lastMove: null,
        moveHistory: [],
        rematchVotes: [],
        gameOver: null
      });
      this._trigger('game:reset', this.roomState);
    } else {
      this._trigger('rematch:waiting', { message: 'Đã gửi yêu cầu đấu lại! Đang chờ đối thủ.' });
    }
    this._publishState();
  }

  _leavePlayer(clientId) {
    if (clientId === this.roomState.guestId) {
      this.roomState.guestId = null;
      this.roomState.guestName = null;
      this.roomState.status = 'WAITING';
    }
    this.roomState.spectators = this.roomState.spectators.filter(user => user.id !== clientId);
    this._publishState();
  }

  _publishState() {
    this.roomState.version = (this.roomState.version || 0) + 1;
    this.roomState.updatedAt = Date.now();
    const state = JSON.parse(JSON.stringify(this.roomState));
    this.stateChannel?.setData(state);
    this._saveLocalState();
    this.broadcastChannel?.postMessage({ type: 'STATE', state });
    this._publishRoomBeacon();
    this._trigger('state:updated', { roomState: this.roomState, mySide: this.mySide, role: this.role });
  }

  _handleIncomingState(state) {
    if (!state?.hostId || state.roomId !== this.roomId) return;
    if (this.roomState && state.version <= this.roomState.version && state.updatedAt <= this.roomState.updatedAt) return;

    this.roomState = JSON.parse(JSON.stringify(state));
    if (this.role !== 'HOST') {
      if (state.guestId === this.clientId) {
        this.role = 'GUEST';
        this.mySide = 'BLUE';
      } else {
        this.role = 'SPECTATOR';
        this.mySide = null;
      }
    }
    this._saveLocalState();
    this._trigger('state:updated', { roomState: this.roomState, mySide: this.mySide, role: this.role });
  }

  _waitForAssignment() {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const check = () => {
        if (this.roomState?.guestId === this.clientId || this.roomState?.spectators?.some(user => user.id === this.clientId)) return resolve();
        if (Date.now() - startedAt > 5000) return reject(new Error('Không tìm thấy chủ phòng.'));
        setTimeout(check, 50);
      };
      check();
    });
  }

  sendMove(from, to) {
    this._sendAction({ kind: 'MOVE', from, to });
  }

  sendChat(message) {
    const text = String(message || '').trim().slice(0, 120);
    if (!text) return;
    this._sendAction({ kind: 'CHAT', playerName: this.playerName, side: this.mySide, message: text, timestamp: Date.now() });
  }

  requestRematch() {
    this._sendAction({ kind: 'REMATCH' });
  }

  notifyGameOver() {}

  leaveRoom() {
    if (this.role !== 'HOST') this._sendAction({ kind: 'LEAVE' });
    if (this.role === 'HOST') this._unpublishRoomBeacon();
    clearInterval(this.heartbeatInterval);
    this.unsubscribeState?.();
    this.stateChannel?.destroy();
    if (this.actionListenerId && window.playhtml) {
      window.playhtml.removePlayEventListener(this._actionType(), this.actionListenerId);
    }
    this.broadcastChannel?.close();
    this.roomState = null;
    this.roomId = null;
  }

  getShareUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('room', this.roomId);
    return url.toString();
  }

  _saveLocalState() {
    try { localStorage.setItem(`ottv2-room-${this.roomId}`, JSON.stringify(this.roomState)); } catch (_) {}
  }

  _loadLocalState() {
    try { return JSON.parse(localStorage.getItem(`ottv2-room-${this.roomId}`)); } catch (_) { return null; }
  }

  _roomSummary() {
    const state = this.roomState;
    return {
      id: this.roomId,
      name: state.roomName,
      status: state.status,
      playerCount: (state.hostId ? 1 : 0) + (state.guestId ? 1 : 0),
      maxPlayers: 2,
      spectatorCount: state.spectators.length,
      playerRed: state.hostName ? { name: state.hostName, score: state.scores.red } : null,
      playerBlue: state.guestName ? { name: state.guestName, score: state.scores.blue } : null,
      timePerTurn: 0,
      currentTurn: state.currentTurn,
      createdAt: state.createdAt,
      gameStartedAt: state.gameStartedAt,
      finishedAt: state.finishedAt,
      moveCount: state.moveHistory.length,
      scores: state.scores,
      heartbeat: Date.now()
    };
  }

  _publishRoomBeacon() {
    if (this.role !== 'HOST' || !this.roomState) return;
    const summary = this._roomSummary();
    GLOBAL_CLOUD_ROOMS.set(this.roomId, summary);
    PlayhtmlAdapter._lobbyChannel?.setData(rooms => { rooms[this.roomId] = summary; });
    try {
      const rooms = JSON.parse(localStorage.getItem('ottv2_global_rooms') || '{}');
      rooms[this.roomId] = summary;
      localStorage.setItem('ottv2_global_rooms', JSON.stringify(rooms));
    } catch (_) {}
    window.dispatchEvent(new CustomEvent('ottv2:rooms_updated'));
  }

  _unpublishRoomBeacon() {
    const roomId = this.roomId;
    GLOBAL_CLOUD_ROOMS.delete(roomId);
    PlayhtmlAdapter._lobbyChannel?.setData(rooms => { delete rooms[roomId]; });
    try {
      const rooms = JSON.parse(localStorage.getItem('ottv2_global_rooms') || '{}');
      delete rooms[roomId];
      localStorage.setItem('ottv2_global_rooms', JSON.stringify(rooms));
    } catch (_) {}
  }

  _startHeartbeat() {
    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => this._publishRoomBeacon(), 10000);
  }

  static async initGlobalLobby() {
    if (PlayhtmlAdapter._lobbyPromise) return PlayhtmlAdapter._lobbyPromise;
    if (!window.playhtml?.init) return;

    PlayhtmlAdapter._lobbyPromise = (async () => {
      await window.playhtml.init({ room: 'ottv2-global-v3' });
      PlayhtmlAdapter._lobbyChannel = window.playhtml.createPageData('rooms', {});
      PlayhtmlAdapter._lobbyChannel.onUpdate(rooms => {
        GLOBAL_CLOUD_ROOMS.clear();
        for (const [id, room] of Object.entries(rooms || {})) GLOBAL_CLOUD_ROOMS.set(id, room);
        window.dispatchEvent(new CustomEvent('ottv2:rooms_updated'));
      });
    })();
    return PlayhtmlAdapter._lobbyPromise;
  }

  static getDiscoveredRooms() {
    const rooms = new Map(GLOBAL_CLOUD_ROOMS);
    try {
      for (const [id, room] of Object.entries(JSON.parse(localStorage.getItem('ottv2_global_rooms') || '{}'))) rooms.set(id, room);
    } catch (_) {}
    const now = Date.now();
    return [...rooms.values()].filter(room => now - (room.heartbeat || 0) < 45000);
  }

  on(event, callback) {
    if (!this.eventListeners.has(event)) this.eventListeners.set(event, []);
    this.eventListeners.get(event).push(callback);
  }

  _trigger(event, data) {
    for (const callback of this.eventListeners.get(event) || []) callback(data);
  }
}

PlayhtmlAdapter._lobbyPromise = null;
PlayhtmlAdapter._lobbyChannel = null;

window.addEventListener('playhtml:ready', () => PlayhtmlAdapter.initGlobalLobby());

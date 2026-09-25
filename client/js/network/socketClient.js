/** Socket.IO adapter used when the page is served by the self-hosted Node server. */
class SocketClient {
  constructor() {
    this.socket = null;
    this.roomId = null;
    this.roomState = null;
    this.playerName = 'Người chơi';
    this.role = null;
    this.mySide = null;
    this.eventListeners = new Map();
    this.pendingJoin = null;
  }

  isAuthoritative() {
    return true;
  }

  async init(roomId, playerName, isHost = false, options = {}) {
    if (typeof io === 'undefined') throw new Error('Máy chủ Socket.IO không khả dụng.');

    this.roomId = String(roomId || '').trim().toLowerCase();
    this.playerName = String(playerName || '').trim() || 'Người chơi';
    this.joinRequest = {
      event: isHost ? 'room:create' : 'room:join',
      data: isHost
        ? { roomId: this.roomId, roomName: options.roomName, playerName: this.playerName, timePerTurn: 0 }
        : { roomId: this.roomId, playerName: this.playerName }
    };

    if (!this.socket) this._connect();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingJoin = null;
        reject(new Error('Không thể kết nối tới máy chủ.'));
      }, 5000);

      this.pendingJoin = {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); }
      };

      if (this.socket.connected) this.socket.emit(this.joinRequest.event, this.joinRequest.data);
      else this.socket.connect();
    });
  }

  _connect() {
    this.socket = io({ autoConnect: false, timeout: 4000 });

    this.socket.on('connect', () => {
      this._trigger('network:status', { status: 'CONNECTED_TO_SERVER' });
      if (this.joinRequest) this.socket.emit(this.joinRequest.event, this.joinRequest.data);
    });

    this.socket.on('connect_error', error => {
      this.pendingJoin?.reject(error);
      this.pendingJoin = null;
      this._trigger('network:status', { status: 'ERROR', message: error.message });
    });

    this.socket.on('disconnect', () => {
      this._trigger('network:status', { status: 'SERVER_DISCONNECTED' });
    });

    this.socket.on('room:joined', data => {
      this.roomId = data.roomId;
      this.role = data.role === 'SPECTATOR' ? 'SPECTATOR' : (data.side === 'RED' ? 'HOST' : 'GUEST');
      this.mySide = data.side;
      this.roomState = this._normalizeRoom(data.room);
      const result = { roomId: this.roomId, role: this.role, mySide: this.mySide, roomState: this.roomState };
      this.pendingJoin?.resolve(result);
      this.pendingJoin = null;
      this._emitState();
    });

    this.socket.on('room:updated', room => this._replaceRoom(room));
    this.socket.on('game:start', data => this._replaceRoom(data.room));

    this.socket.on('game:move_success', data => {
      this.roomState = {
        ...this.roomState,
        board: data.board,
        currentTurn: data.nextTurn,
        lastMove: data.moveRecord,
        moveHistory: [...(this.roomState?.moveHistory || []), data.moveRecord]
      };
      this._emitState();
    });

    this.socket.on('game:over', data => {
      if (data.room) this.roomState = this._normalizeRoom(data.room);
      this.roomState = { ...this.roomState, status: 'FINISHED', gameOver: data };
      this._emitState();
    });

    this.socket.on('game:rematch_response', data => this._trigger('rematch:waiting', data));
    this.socket.on('game:rematch_start', data => {
      this.roomState = this._normalizeRoom(data.room);
      this._trigger('game:reset', this.roomState);
      this._emitState();
    });
    this.socket.on('chat:receive', data => this._trigger('chat:receive', data));
    this.socket.on('room:list', () => window.dispatchEvent(new CustomEvent('ottv2:rooms_updated')));
    this.socket.on('error:message', data => {
      const error = new Error(data?.message || 'Lỗi máy chủ.');
      if (this.pendingJoin) {
        this.pendingJoin.reject(error);
        this.pendingJoin = null;
      }
      this._trigger('network:status', { status: 'ERROR', message: error.message });
    });
  }

  _normalizeRoom(room = {}) {
    return {
      roomId: room.id || this.roomId,
      roomName: room.name,
      status: room.status || 'WAITING',
      hostName: room.playerRed?.name || null,
      guestName: room.playerBlue?.name || null,
      board: room.board || this.roomState?.board || [],
      currentTurn: room.currentTurn || 'RED',
      lastMove: room.moveHistory?.at(-1) || null,
      moveHistory: room.moveHistory || [],
      scores: room.scores || { red: 0, blue: 0 },
      createdAt: room.createdAt,
      gameStartedAt: room.gameStartedAt,
      finishedAt: room.finishedAt,
      timePerTurn: 0
    };
  }

  _replaceRoom(room) {
    this.roomState = this._normalizeRoom(room);
    this._emitState();
  }

  _emitState() {
    this._trigger('state:updated', { roomState: this.roomState, mySide: this.mySide, role: this.role });
  }

  sendMove(from, to) {
    this.socket?.emit('game:move', { from, to });
  }

  sendChat(message) {
    this.socket?.emit('chat:send', { message: String(message || '').slice(0, 120) });
  }

  requestRematch() {
    this.socket?.emit('game:rematch_request');
  }

  notifyGameOver() {}

  leaveRoom() {
    this.socket?.emit('room:leave');
    this.roomId = null;
    this.roomState = null;
  }

  getShareUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('room', this.roomId);
    return url.toString();
  }

  on(event, callback) {
    if (!this.eventListeners.has(event)) this.eventListeners.set(event, []);
    this.eventListeners.get(event).push(callback);
  }

  _trigger(event, data) {
    for (const callback of this.eventListeners.get(event) || []) callback(data);
  }
}

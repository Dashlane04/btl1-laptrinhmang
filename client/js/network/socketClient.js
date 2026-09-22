/**
 * Socket Client: Quản lý kết nối WebSocket/Socket.io với máy chủ
 */
class SocketClient {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.eventListeners = new Map();
  }

  /**
   * Khởi tạo kết nối Socket.io
   */
  connect() {
    if (typeof io === 'undefined') {
      console.warn('Socket.io library not loaded (Offline Mode active).');
      return;
    }

    try {
      this.socket = io();

      this.socket.on('connect', () => {
        this.isConnected = true;
        this._trigger('connection_change', { isConnected: true });
      });

      this.socket.on('disconnect', () => {
        this.isConnected = false;
        this._trigger('connection_change', { isConnected: false });
      });

      // Lắng nghe các sự kiện game chính
      const events = [
        'room:list', 'room:joined', 'room:updated', 'room:closed',
        'game:start', 'game:move_success', 'game:tick', 'game:timeout',
        'game:over', 'game:rematch_response', 'game:rematch_start',
        'chat:receive', 'error:message'
      ];

      events.forEach(eventName => {
        this.socket.on(eventName, (data) => {
          this._trigger(eventName, data);
        });
      });
    } catch (e) {
      console.warn('Socket connect failed:', e);
    }
  }

  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  _trigger(event, data) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(cb => cb(data));
    }
  }

  emit(event, data) {
    if (this.socket && this.isConnected) {
      this.socket.emit(event, data);
    }
  }

  // --- ROOM METHODS ---
  createRoom(roomName, playerName, password, timePerTurn) {
    this.emit('room:create', { roomName, playerName, password, timePerTurn });
  }

  joinRoom(roomId, playerName, password) {
    this.emit('room:join', { roomId, playerName, password });
  }

  quickMatch(playerName) {
    this.emit('room:quick_match', { playerName });
  }

  leaveRoom() {
    this.emit('room:leave');
  }

  // --- GAME METHODS ---
  sendMove(from, to) {
    this.emit('game:move', { from, to });
  }

  surrender() {
    this.emit('game:surrender');
  }

  requestRematch() {
    this.emit('game:rematch_request');
  }

  // --- CHAT ---
  sendChat(message) {
    this.emit('chat:send', { message });
  }
}

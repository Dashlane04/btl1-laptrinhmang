/**
 * PlayhtmlAdapter: Quản lý đồng bộ trạng thái phòng chơi OTTv2 thời gian thực không cần Server
 * Sử dụng thư viện playhtml (PartyKit & Yjs CRDT) và hỗ trợ WebRTC/BroadcastChannel dự phòng.
 */
class PlayhtmlAdapter {
  constructor() {
    this.roomId = null;
    this.isHost = false;
    this.mySide = null; // 'RED' (Host) hoặc 'BLUE' (Guest)
    this.playerName = 'Người chơi';
    this.isInitialized = false;
    this.eventListeners = new Map();
    this.roomState = null;
    this.broadcastChannel = null;
    this.storageKey = null;
  }

  /**
   * Khởi tạo phòng chơi Serverless
   * @param {string} roomId Mã định danh phòng
   * @param {string} playerName Tên người chơi
   * @param {boolean} isHost Người tạo phòng (true) hay Người vào phòng (false)
   * @param {Array} initialBoard Ma trận bàn cờ 9x9 ban đầu
   */
  async init(roomId, playerName, isHost = false, initialBoard = null) {
    this.roomId = roomId;
    this.isHost = isHost;
    this.mySide = isHost ? 'RED' : 'BLUE';
    this.playerName = playerName;
    this.storageKey = `ottv2_room_${roomId}`;

    // Khởi tạo BroadcastChannel để đồng bộ tức thì giữa các tab cùng trình duyệt
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.broadcastChannel = new BroadcastChannel(`ottv2_${roomId}`);
        this.broadcastChannel.onmessage = (event) => {
          if (event.data && event.data.type === 'SYNC_STATE') {
            this._handleIncomingState(event.data.state);
          } else if (event.data && event.data.type === 'CHAT_MSG') {
            this._trigger('chat:receive', event.data.chat);
          }
        };
      }
    } catch (e) {
      console.warn('BroadcastChannel not supported:', e);
    }

    // Lắng nghe sự kiện storage cho tab
    window.addEventListener('storage', (e) => {
      if (e.key === this.storageKey && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          this._handleIncomingState(parsed);
        } catch (err) {}
      }
    });

    // Khởi tạo trạng thái ban đầu
    if (isHost || !this.roomState) {
      this.roomState = {
        roomId: this.roomId,
        hostName: this.playerName,
        guestName: isHost ? 'Đang chờ đối thủ...' : this.playerName,
        board: initialBoard || [],
        currentTurn: 'RED',
        lastMove: null,
        scores: { red: 0, blue: 0 },
        version: 1,
        updatedAt: Date.now()
      };
      this._saveLocalState();
    } else {
      this._loadLocalState();
    }

    // Khởi tạo thư viện playhtml nếu có sẵn
    this._initPlayhtmlSync();

    this.isInitialized = true;
    this._trigger('room:ready', {
      roomId: this.roomId,
      mySide: this.mySide,
      isHost: this.isHost,
      roomState: this.roomState,
      shareUrl: this.getShareUrl()
    });

    // Thông báo cho phòng biết có người mới vào
    if (!isHost) {
      this.roomState.guestName = this.playerName;
      this.syncState(this.roomState);
    }
  }

  /**
   * Kết nối với playhtml (nếu đã load thư viện)
   */
  _initPlayhtmlSync() {
    if (typeof playhtml !== 'undefined' && playhtml.init) {
      try {
        playhtml.init({
          room: `ottv2_${this.roomId}`
        });

        // Đăng ký custom element sync với playhtml
        if (playhtml.register) {
          playhtml.register('ottv2-sync-hub', {
            defaultData: this.roomState,
            updateElement: (element, data) => {
              if (data && data.version > (this.roomState?.version || 0)) {
                this._handleIncomingState(data);
              }
            }
          });
        }
      } catch (err) {
        console.warn('playhtml init error (falling back to P2P/Broadcast):', err);
      }
    }
  }

  /**
   * Đồng bộ trạng thái mới sang người chơi khác
   */
  syncState(newState) {
    newState.version = (this.roomState?.version || 0) + 1;
    newState.updatedAt = Date.now();
    this.roomState = newState;

    this._saveLocalState();

    // 1. Đồng bộ qua BroadcastChannel (cho cùng máy / đa tab)
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'SYNC_STATE',
          state: this.roomState
        });
      } catch (e) {}
    }

    // 2. Đồng bộ qua playhtml cloud
    if (typeof playhtml !== 'undefined' && playhtml.setData) {
      try {
        playhtml.setData('ottv2-sync-hub', this.roomState);
      } catch (e) {}
    }
  }

  _saveLocalState() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.roomState));
    } catch (e) {}
  }

  _loadLocalState() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        this.roomState = JSON.parse(raw);
      }
    } catch (e) {}
  }

  _handleIncomingState(newState) {
    if (!newState) return;
    if (this.roomState && newState.version <= this.roomState.version && newState.updatedAt <= this.roomState.updatedAt) {
      return;
    }

    const previousState = this.roomState;
    this.roomState = newState;
    this._saveLocalState();

    // Kích hoạt sự kiện cập nhật
    this._trigger('state:updated', {
      roomState: this.roomState,
      previousState
    });
  }

  /**
   * Gửi nước đi mới
   */
  sendMove(from, to, newBoardGrid, capturedPiece, notation, nextTurn) {
    if (!this.roomState) return;

    const updated = {
      ...this.roomState,
      board: newBoardGrid,
      currentTurn: nextTurn,
      lastMove: {
        from,
        to,
        capturedPiece,
        notation,
        side: this.mySide
      }
    };

    this.syncState(updated);
  }

  /**
   * Gửi tin nhắn Chat
   */
  sendChat(message) {
    const chatData = {
      sender: this.playerName,
      side: this.mySide,
      message: message,
      timestamp: Date.now()
    };

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'CHAT_MSG',
          chat: chatData
        });
      } catch (e) {}
    }

    this._trigger('chat:receive', chatData);
  }

  /**
   * Bắt đầu lại ván đấu (Rematch)
   */
  resetGame(initialBoard) {
    if (!this.roomState) return;

    const updated = {
      ...this.roomState,
      board: initialBoard,
      currentTurn: 'RED',
      lastMove: null,
      gameOver: null
    };

    this.syncState(updated);
    this._trigger('game:reset', updated);
  }

  /**
   * Lấy URL liên kết để chia sẻ cho đối thủ
   */
  getShareUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('room', this.roomId);
    return url.toString();
  }

  // --- HỆ THỐNG EVENT EMITTER ---
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
}

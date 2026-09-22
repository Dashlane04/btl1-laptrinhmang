/**
 * PlayhtmlAdapter: Bộ điều phối mạng thời gian thực Serverless cho OTTv2
 * Sử dụng thư viện playhtml (PartyKit & Yjs CRDT) và hỗ trợ đa kênh (BroadcastChannel, LocalStorage).
 * Không cần bất kỳ Backend Server riêng biệt nào!
 */
class PlayhtmlAdapter {
  constructor() {
    this.roomId = null;
    this.clientId = 'client_' + Math.random().toString(36).substring(2, 9);
    this.playerName = 'Người chơi';
    this.role = null;      // 'HOST' | 'GUEST' | 'SPECTATOR'
    this.mySide = null;    // 'RED' | 'BLUE' | null (SPECTATOR)
    this.isInitialized = false;
    this.eventListeners = new Map();
    this.roomState = null;
    this.broadcastChannel = null;
    this.storageKey = null;
    this.syncHubId = 'ottv2-sync-hub';
  }

  /**
   * Khởi tạo và tham gia vào phòng chơi Serverless
   * @param {string} roomId - Mã định danh phòng
   * @param {string} playerName - Tên hiển thị người chơi
   * @param {boolean} isHost - Người tạo phòng (true) hay Người tham gia (false)
   * @param {Object} [options] - Cấu hình phòng (roomName, timePerTurn, initialBoard)
   */
  async init(roomId, playerName, isHost = false, options = {}) {
    this.roomId = roomId;
    this.playerName = playerName || (isHost ? 'Chủ phòng' : 'Người chơi');
    this.storageKey = `ottv2_room_state_${roomId}`;

    // 1. Khởi tạo BroadcastChannel để đồng bộ tức thì không độ trễ giữa các tab cùng máy
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        if (this.broadcastChannel) {
          this.broadcastChannel.close();
        }
        this.broadcastChannel = new BroadcastChannel(`ottv2_channel_${roomId}`);
        this.broadcastChannel.onmessage = (event) => {
          if (!event.data) return;
          if (event.data.type === 'SYNC_STATE') {
            this._handleIncomingState(event.data.state);
          } else if (event.data.type === 'CHAT_MSG') {
            this._trigger('chat:receive', event.data.chat);
          }
        };
      }
    } catch (e) {
      console.warn('BroadcastChannel error:', e);
    }

    // 2. Lắng nghe storage event (phòng trường hợp BroadcastChannel bị chặn)
    window.addEventListener('storage', (e) => {
      if (e.key === this.storageKey && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          this._handleIncomingState(parsed);
        } catch (err) {}
      }
    });

    // 3. Đọc dữ liệu phòng nếu đã tồn tại
    const existingState = this._loadLocalState();

    if (isHost || !existingState) {
      // Khởi tạo phòng mới với vai trò HOST (Phe Đỏ)
      this.role = 'HOST';
      this.mySide = 'RED';

      this.roomState = {
        roomId: this.roomId,
        roomName: options.roomName || `Phòng Chiến Thuật #${roomId.slice(-4).toUpperCase()}`,
        timePerTurn: parseInt(options.timePerTurn, 10) || 30,
        status: 'WAITING', // 'WAITING' | 'PLAYING' | 'FINISHED'
        hostId: this.clientId,
        hostName: this.playerName,
        guestId: null,
        guestName: null,
        spectators: [],
        board: options.initialBoard || [],
        currentTurn: 'RED',
        turnStartTime: Date.now(),
        lastMove: null,
        moveHistory: [],
        scores: { red: 0, blue: 0 },
        rematchVotes: [],
        version: 1,
        updatedAt: Date.now()
      };

      this._saveLocalState();
    } else {
      // Người chơi tham gia phòng đã có sẵn
      this.roomState = existingState;

      // Xác định vai trò
      if (this.roomState.hostId === this.clientId) {
        this.role = 'HOST';
        this.mySide = 'RED';
      } else if (!this.roomState.guestId || this.roomState.guestId === this.clientId) {
        // Chưa có khách -> Trở thành GUEST (Phe Xanh)
        this.role = 'GUEST';
        this.mySide = 'BLUE';
        this.roomState.guestId = this.clientId;
        this.roomState.guestName = this.playerName;

        // Nếu phòng đang chờ -> Đủ 2 người -> Tự động chuyển sang PLAYING
        if (this.roomState.status === 'WAITING') {
          this.roomState.status = 'PLAYING';
          this.roomState.turnStartTime = Date.now();
        }
        this.syncState(this.roomState);
      } else {
        // Đã có 2 người -> Trở thành Khán giả (SPECTATOR)
        this.role = 'SPECTATOR';
        this.mySide = null;
        if (!this.roomState.spectators) this.roomState.spectators = [];
        if (!this.roomState.spectators.some(s => s.id === this.clientId)) {
          this.roomState.spectators.push({ id: this.clientId, name: this.playerName });
          this.syncState(this.roomState);
        }
      }
    }

    // 4. Khởi tạo đồng bộ đám mây với playhtml (PartyKit & Yjs)
    this._initPlayhtmlSync();

    this.isInitialized = true;
    this._trigger('room:ready', {
      roomId: this.roomId,
      role: this.role,
      mySide: this.mySide,
      roomState: this.roomState,
      shareUrl: this.getShareUrl()
    });

    return {
      roomId: this.roomId,
      role: this.role,
      mySide: this.mySide,
      roomState: this.roomState
    };
  }

  /**
   * Kết nối playhtml Cloud Sync
   */
  _initPlayhtmlSync() {
    if (typeof playhtml !== 'undefined' && playhtml.init) {
      try {
        playhtml.init({
          room: `ottv2_${this.roomId}`
        });

        if (playhtml.register) {
          playhtml.register(this.syncHubId, {
            defaultData: this.roomState,
            updateElement: (element, data) => {
              if (data && data.version > (this.roomState?.version || 0)) {
                this._handleIncomingState(data);
              }
            }
          });
        }
      } catch (err) {
        console.warn('playhtml init error (falling back to Local/Broadcast):', err);
      }
    }
  }

  /**
   * Đồng bộ trạng thái mới sang tất cả người chơi khác
   * @param {Object} newState 
   */
  syncState(newState) {
    newState.version = (this.roomState?.version || 0) + 1;
    newState.updatedAt = Date.now();
    this.roomState = newState;

    // Lưu vào Local Storage
    this._saveLocalState();

    // Phát qua BroadcastChannel (cho đa tab cùng máy)
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'SYNC_STATE',
          state: this.roomState
        });
      } catch (e) {}
    }

    // Phát qua playhtml cloud (cho người chơi khác qua Internet)
    if (typeof playhtml !== 'undefined' && playhtml.setData) {
      try {
        playhtml.setData(this.syncHubId, this.roomState);
      } catch (e) {}
    }

    // Kích hoạt sự kiện nội bộ
    this._trigger('state:updated', {
      roomState: this.roomState,
      mySide: this.mySide,
      role: this.role
    });
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
        return JSON.parse(raw);
      }
    } catch (e) {}
    return null;
  }

  _handleIncomingState(newState) {
    if (!newState) return;
    if (this.roomState && newState.version <= this.roomState.version && newState.updatedAt <= this.roomState.updatedAt) {
      return;
    }

    const previousState = this.roomState;
    this.roomState = newState;
    this._saveLocalState();

    // Nếu lúc trước mình là GUEST nhưng state mới chưa có guestId, cập nhật lại
    if (this.role === 'GUEST' && this.roomState.guestId !== this.clientId) {
      if (!this.roomState.guestId) {
        this.roomState.guestId = this.clientId;
        this.roomState.guestName = this.playerName;
      }
    }

    // Kích hoạt sự kiện state:updated
    this._trigger('state:updated', {
      roomState: this.roomState,
      previousState,
      mySide: this.mySide,
      role: this.role
    });
  }

  /**
   * Gửi một nước đi mới
   */
  sendMove(from, to, newBoardGrid, capturedPiece, notation, nextTurn) {
    if (!this.roomState) return;

    const moveRecord = {
      index: (this.roomState.moveHistory ? this.roomState.moveHistory.length : 0) + 1,
      from,
      to,
      side: this.mySide,
      capturedPiece: capturedPiece ? { type: capturedPiece.type, side: capturedPiece.side } : null,
      notation,
      timestamp: Date.now()
    };

    const newHistory = [...(this.roomState.moveHistory || []), moveRecord];

    const updated = {
      ...this.roomState,
      board: newBoardGrid,
      currentTurn: nextTurn,
      turnStartTime: Date.now(),
      lastMove: moveRecord,
      moveHistory: newHistory
    };

    this.syncState(updated);
  }

  /**
   * Xử lý kết thúc trận đấu
   */
  notifyGameOver(winner, message) {
    if (!this.roomState) return;

    const scores = { ...(this.roomState.scores || { red: 0, blue: 0 }) };
    if (winner === 'RED') scores.red = (scores.red || 0) + 1;
    if (winner === 'BLUE') scores.blue = (scores.blue || 0) + 1;

    const updated = {
      ...this.roomState,
      status: 'FINISHED',
      scores,
      gameOver: {
        winner,
        message,
        timestamp: Date.now()
      }
    };

    this.syncState(updated);
  }

  /**
   * Gửi tin nhắn Chat
   */
  sendChat(message) {
    if (!message || !message.trim()) return;

    const chatData = {
      sender: this.playerName,
      side: this.mySide || 'SPECTATOR',
      message: message.trim().slice(0, 150),
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
   * Yêu cầu đấu lại (Rematch)
   */
  requestRematch(freshBoardGrid) {
    if (!this.roomState) return;

    const votes = new Set(this.roomState.rematchVotes || []);
    votes.add(this.clientId);

    // Kiểm tra xem cả 2 người chơi (Host & Guest) đã đồng ý chưa
    const hasHostVoted = votes.has(this.roomState.hostId);
    const hasGuestVoted = votes.has(this.roomState.guestId);

    if (hasHostVoted && hasGuestVoted) {
      // Cả 2 cùng đồng ý -> Bắt đầu ván mới
      const updated = {
        ...this.roomState,
        status: 'PLAYING',
        board: freshBoardGrid,
        currentTurn: 'RED',
        turnStartTime: Date.now(),
        lastMove: null,
        moveHistory: [],
        rematchVotes: [],
        gameOver: null
      };

      this.syncState(updated);
      this._trigger('game:reset', updated);
    } else {
      // Ghi nhận phiếu và thông báo chờ đối thủ
      const updated = {
        ...this.roomState,
        rematchVotes: Array.from(votes)
      };

      this.syncState(updated);
      this._trigger('rematch:waiting', {
        message: 'Đã gửi yêu cầu đấu lại! Đang chờ đối thủ đồng ý...'
      });
    }
  }

  /**
   * Rời khỏi phòng
   */
  leaveRoom() {
    if (!this.roomState) return;

    // Nếu người chơi rời khi đang đấu -> Đối phương thắng
    if (this.roomState.status === 'PLAYING' && (this.role === 'HOST' || this.role === 'GUEST')) {
      const winner = this.mySide === 'RED' ? 'BLUE' : 'RED';
      this.notifyGameOver(winner, `Phe ${this.mySide === 'RED' ? 'Đỏ' : 'Xanh'} đã rời phòng!`);
    }

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
        this.broadcastChannel = null;
      } catch (e) {}
    }

    this.roomId = null;
    this.roomState = null;
    this.isInitialized = false;
  }

  /**
   * Lấy URL liên kết chia sẻ cho đối thủ
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
      listeners.forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in event listener for ${event}:`, err);
        }
      });
    }
  }
}

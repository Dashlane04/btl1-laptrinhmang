/**
 * Model phòng chơi OTTv2 In-Memory
 */
const Board = require('../core/Board');
const { SIDES, posToNotation } = require('../../shared/gameRules');
const config = require('../config/server.config');

class Room {
  /**
   * @param {string} id - Mã phòng
   * @param {string} name - Tên phòng
   * @param {string} [password=''] - Mật khẩu phòng (tuỳ chọn)
   * @param {number} [timePerTurn=30] - Thời gian mỗi lượt (giây)
   */
  constructor(id, name, password = '', timePerTurn = config.DEFAULT_TURN_TIME) {
    this.id = id;
    this.name = name || `Phòng #${id.slice(-4)}`;
    this.password = password || '';
    this.timePerTurn = parseInt(timePerTurn, 10) || config.DEFAULT_TURN_TIME;

    this.status = 'WAITING'; // 'WAITING' | 'PLAYING' | 'FINISHED'
    this.playerRed = null;   // { socketId, name, score: 0 }
    this.playerBlue = null;  // { socketId, name, score: 0 }
    this.spectators = [];    // Array<{ socketId, name }>

    this.board = new Board();
    this.currentTurn = SIDES.RED;
    this.turnTimeRemaining = this.timePerTurn;
    this.timerInterval = null;

    this.moveHistory = [];
    this.rematchVotes = new Set();
    this.scores = { red: 0, blue: 0 };
    this.createdAt = Date.now();
    this.gameStartedAt = null;
    this.finishedAt = null;
    this.lastActivityAt = Date.now();
  }

  /**
   * Thêm người chơi vào phòng
   * @param {string} socketId 
   * @param {string} playerName 
   * @returns {{ role: string, side: string|null }}
   */
  addPlayer(socketId, playerName) {
    this.lastActivityAt = Date.now();

    // Nếu phòng chưa có Red
    if (!this.playerRed) {
      this.playerRed = { socketId, name: playerName || 'Người chơi Đỏ', score: 0 };
      return { role: 'PLAYER', side: SIDES.RED };
    }

    // Nếu phòng chưa có Blue
    if (!this.playerBlue) {
      this.playerBlue = { socketId, name: playerName || 'Người chơi Xanh', score: 0 };
      return { role: 'PLAYER', side: SIDES.BLUE };
    }

    // Đã đủ 2 người -> Trở thành khán giả
    const spectator = { socketId, name: playerName || `Khán giả ${this.spectators.length + 1}` };
    this.spectators.push(spectator);
    return { role: 'SPECTATOR', side: null };
  }

  /**
   * Xóa người chơi/khán giả khi rời phòng
   * @param {string} socketId 
   * @returns {{ side: string|null, wasPlayer: boolean, isEmpty: boolean }}
   */
  removeUser(socketId) {
    this.lastActivityAt = Date.now();
    this.rematchVotes.delete(socketId);

    let side = null;
    let wasPlayer = false;

    if (this.playerRed && this.playerRed.socketId === socketId) {
      side = SIDES.RED;
      wasPlayer = true;
      this.playerRed = null;
    } else if (this.playerBlue && this.playerBlue.socketId === socketId) {
      side = SIDES.BLUE;
      wasPlayer = true;
      this.playerBlue = null;
    } else {
      this.spectators = this.spectators.filter(s => s.socketId !== socketId);
    }

    if (wasPlayer && this.status === 'PLAYING') {
      this.status = 'FINISHED';
      this.finishedAt = Date.now();
      this.stopTimer();
    }

    const isEmpty = !this.playerRed && !this.playerBlue && this.spectators.length === 0;
    return { side, wasPlayer, isEmpty };
  }

  /**
   * Tìm vai trò của socket trong phòng
   * @param {string} socketId 
   * @returns {string|null} 'RED' | 'BLUE' | 'SPECTATOR' | null
   */
  getSideBySocketId(socketId) {
    if (this.playerRed && this.playerRed.socketId === socketId) return SIDES.RED;
    if (this.playerBlue && this.playerBlue.socketId === socketId) return SIDES.BLUE;
    const isSpec = this.spectators.some(s => s.socketId === socketId);
    return isSpec ? 'SPECTATOR' : null;
  }

  /**
   * Bắt đầu trận đấu khi đủ 2 người
   */
  startGame(onTickCallback, onTimeoutCallback) {
    this.status = 'PLAYING';
    this.gameStartedAt = Date.now();
    this.finishedAt = null;
    this.board.reset();
    this.currentTurn = SIDES.RED;
    this.moveHistory = [];
    this.rematchVotes.clear();
    this.startTurnTimer(onTickCallback, onTimeoutCallback);
  }

  /**
   * Bắt đầu đồng hồ đếm ngược lượt đi
   */
  startTurnTimer(onTickCallback, onTimeoutCallback) {
    this.stopTimer();
    this.turnTimeRemaining = this.timePerTurn;

    this.timerInterval = setInterval(() => {
      this.turnTimeRemaining--;

      if (typeof onTickCallback === 'function') {
        onTickCallback(this.id, this.turnTimeRemaining, this.currentTurn);
      }

      if (this.turnTimeRemaining <= 0) {
        this.stopTimer();
        if (typeof onTimeoutCallback === 'function') {
          onTimeoutCallback(this.id, this.currentTurn);
        }
      }
    }, 1000);
  }

  /**
   * Dừng timer
   */
  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Chuyển lượt đi sang đối thủ
   */
  switchTurn(onTickCallback, onTimeoutCallback) {
    this.currentTurn = this.currentTurn === SIDES.RED ? SIDES.BLUE : SIDES.RED;
    this.startTurnTimer(onTickCallback, onTimeoutCallback);
  }

  /**
   * Ghi nhận một nước đi vào lịch sử
   */
  recordMove(from, to, movedPiece, capturedPiece) {
    this.lastActivityAt = Date.now();
    const fromNotation = posToNotation(from.row, from.col);
    const toNotation = posToNotation(to.row, to.col);

    const moveRecord = {
      index: this.moveHistory.length + 1,
      side: movedPiece.side,
      pieceType: movedPiece.type,
      from,
      to,
      fromNotation,
      toNotation,
      notation: `${fromNotation} -> ${toNotation}${capturedPiece ? ' (x)' : ''}`,
      capturedPiece: capturedPiece ? { type: capturedPiece.type, side: capturedPiece.side } : null,
      timestamp: Date.now()
    };

    this.moveHistory.push(moveRecord);
    return moveRecord;
  }

  /**
   * Dữ liệu tóm tắt phòng cho danh sách công khai (Kèm thời gian chơi và trạng thái chi tiết)
   */
  toSummaryJSON() {
    const now = Date.now();
    const playerCount = (this.playerRed ? 1 : 0) + (this.playerBlue ? 1 : 0);

    let elapsedTimeMs = 0;
    if (this.status === 'PLAYING' && this.gameStartedAt) {
      elapsedTimeMs = Math.max(0, now - this.gameStartedAt);
    } else if (this.status === 'FINISHED' && this.gameStartedAt) {
      elapsedTimeMs = Math.max(0, (this.finishedAt || now) - this.gameStartedAt);
    }

    const waitingTimeMs = this.status === 'WAITING' ? Math.max(0, now - this.createdAt) : 0;

    return {
      id: this.id,
      name: this.name,
      hasPassword: Boolean(this.password && this.password.length > 0),
      status: this.status, // 'WAITING' | 'PLAYING' | 'FINISHED'
      playerCount,
      maxPlayers: 2,
      spectatorCount: this.spectators.length,
      playerRed: this.playerRed ? { name: this.playerRed.name, score: this.playerRed.score || 0 } : null,
      playerBlue: this.playerBlue ? { name: this.playerBlue.name, score: this.playerBlue.score || 0 } : null,
      timePerTurn: this.timePerTurn,
      currentTurn: this.status === 'PLAYING' ? this.currentTurn : null,
      turnTimeRemaining: this.status === 'PLAYING' ? this.turnTimeRemaining : null,
      createdAt: this.createdAt,
      gameStartedAt: this.gameStartedAt,
      finishedAt: this.finishedAt,
      elapsedTimeMs,
      waitingTimeMs,
      moveCount: this.moveHistory.length,
      scores: this.scores
    };
  }

  /**
   * Dữ liệu chi tiết gửi cho người tham gia phòng
   */
  toDetailJSON() {
    const summary = this.toSummaryJSON();
    return {
      ...summary,
      playerRed: this.playerRed,
      playerBlue: this.playerBlue,
      spectators: this.spectators,
      board: this.board.getState(),
      currentTurn: this.currentTurn,
      timePerTurn: this.timePerTurn,
      turnTimeRemaining: this.turnTimeRemaining,
      moveHistory: this.moveHistory,
      stats: this.board.getStats()
    };
  }
}

module.exports = Room;

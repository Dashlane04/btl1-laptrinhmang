/**
 * Controller quản lý phòng chơi (In-Memory Room Manager)
 */
const Room = require('../models/Room');
const config = require('../config/server.config');

class RoomController {
  constructor() {
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
    /** @type {Map<string, string>} Mapping socketId -> roomId */
    this.userRoomMap = new Map();

    // Dọn dẹp định kỳ
    const cleanupTimer = setInterval(() => this.cleanupIdleRooms(), config.CLEANUP_INTERVAL_MS);
    cleanupTimer.unref?.();
  }

  /**
   * Tạo phòng mới
   * @param {string} roomName 
   * @param {string} password 
   * @param {number} timePerTurn 
   * @returns {Room}
   */
  createRoom(roomName, password = '', timePerTurn = config.DEFAULT_TURN_TIME, requestedId = '') {
    if (this.rooms.size >= config.MAX_ROOMS) {
      throw new Error('Hệ thống máy chủ đã đạt giới hạn số phòng tối đa!');
    }

    const roomId = requestedId || ('ott-' + Math.random().toString(36).substring(2, 8));
    if (!/^ott-[a-z0-9]{4,12}$/.test(roomId)) {
      throw new Error('Mã phòng phải có dạng ott-xxxx.');
    }
    if (this.rooms.has(roomId)) {
      throw new Error('Mã phòng đã tồn tại, vui lòng tạo phòng khác.');
    }

    const room = new Room(roomId, String(roomName || '').trim().slice(0, 30), password, timePerTurn);
    this.rooms.set(roomId, room);
    return room;
  }

  /**
   * Lấy phòng theo ID
   * @param {string} roomId 
   * @returns {Room|null}
   */
  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  /**
   * Lấy phòng theo socketId của người chơi
   * @param {string} socketId 
   * @returns {Room|null}
   */
  getRoomBySocketId(socketId) {
    const roomId = this.userRoomMap.get(socketId);
    if (!roomId) return null;
    return this.getRoom(roomId);
  }

  /**
   * Ghép phòng nhanh (Quick Match) - Tìm phòng WAITING chưa đủ 2 người và không có mật khẩu
   * @returns {Room|null}
   */
  findQuickMatchRoom() {
    for (const room of this.rooms.values()) {
      if (
        room.status === 'WAITING' &&
        (!room.playerRed || !room.playerBlue) &&
        (!room.password || room.password.trim() === '')
      ) {
        return room;
      }
    }
    return null;
  }

  /**
   * Gán người chơi vào phòng
   * @param {string} roomId 
   * @param {string} socketId 
   * @param {string} playerName 
   * @param {string} [password='']
   * @returns {{ room: Room, role: string, side: string|null }}
   */
  joinRoom(roomId, socketId, playerName, password = '') {
    if (typeof roomId !== 'string' || !/^ott-[a-z0-9]{4,12}$/.test(roomId)) {
      throw new Error('Mã phòng không hợp lệ!');
    }
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error('Phòng không tồn tại hoặc đã bị đóng!');
    }

    if (room.password && room.password.trim() !== '') {
      if (room.password !== password) {
        throw new Error('Mật khẩu phòng không chính xác!');
      }
    }

    const currentRoom = this.getRoomBySocketId(socketId);
    if (currentRoom && currentRoom.id !== roomId) this.leaveRoom(socketId);

    const safeName = String(playerName || '').trim().slice(0, 30) || 'Người chơi';
    const existingSide = room.getSideBySocketId(socketId);
    const joinResult = existingSide
      ? { role: existingSide === 'SPECTATOR' ? 'SPECTATOR' : 'PLAYER', side: existingSide === 'SPECTATOR' ? null : existingSide }
      : room.addPlayer(socketId, safeName);
    this.userRoomMap.set(socketId, roomId);

    return {
      room,
      role: joinResult.role,
      side: joinResult.side
    };
  }

  /**
   * Rời phòng
   * @param {string} socketId 
   * @returns {{ room: Room|null, side: string|null, wasPlayer: boolean, isEmpty: boolean }}
   */
  leaveRoom(socketId) {
    const roomId = this.userRoomMap.get(socketId);
    if (!roomId) return { room: null, side: null, wasPlayer: false, isEmpty: true };

    const room = this.getRoom(roomId);
    this.userRoomMap.delete(socketId);

    if (!room) return { room: null, side: null, wasPlayer: false, isEmpty: true };

    const removeResult = room.removeUser(socketId);

    if (removeResult.isEmpty) {
      this.rooms.delete(roomId);
    }

    return {
      room,
      side: removeResult.side,
      wasPlayer: removeResult.wasPlayer,
      isEmpty: removeResult.isEmpty
    };
  }

  /**
   * Lấy danh sách tóm tắt các phòng công khai (Kèm thời gian chơi & sắp xếp)
   * @param {Object} [filter]
   * @returns {Array<Object>}
   */
  getPublicRoomList(filter = {}) {
    const list = [];
    for (const room of this.rooms.values()) {
      const summary = room.toSummaryJSON();
      if (filter.status && summary.status !== filter.status) {
        continue;
      }
      list.push(summary);
    }
    // Sắp xếp: Phòng đang chờ lên trước, sau đó là phòng đang chơi mới nhất
    return list.sort((a, b) => {
      if (a.status === 'WAITING' && b.status !== 'WAITING') return -1;
      if (a.status !== 'WAITING' && b.status === 'WAITING') return 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  /**
   * Lấy thống kê tổng quan toàn hệ thống phòng
   * @returns {Object}
   */
  getRoomStats() {
    let totalRooms = this.rooms.size;
    let waitingRooms = 0;
    let playingRooms = 0;
    let finishedRooms = 0;
    let totalPlayers = 0;
    let totalSpectators = 0;

    for (const room of this.rooms.values()) {
      if (room.status === 'WAITING') waitingRooms++;
      else if (room.status === 'PLAYING') playingRooms++;
      else if (room.status === 'FINISHED') finishedRooms++;

      if (room.playerRed) totalPlayers++;
      if (room.playerBlue) totalPlayers++;
      totalSpectators += room.spectators.length;
    }

    return {
      totalRooms,
      waitingRooms,
      playingRooms,
      finishedRooms,
      totalPlayers,
      totalSpectators,
      totalUsers: totalPlayers + totalSpectators,
      timestamp: Date.now()
    };
  }

  /**
   * Dọn dẹp các phòng không có hoạt động trong 15 phút
   */
  cleanupIdleRooms() {
    const now = Date.now();
    const IDLE_LIMIT = 15 * 60 * 1000;

    for (const [roomId, room] of this.rooms.entries()) {
      if (now - room.lastActivityAt > IDLE_LIMIT || (!room.playerRed && !room.playerBlue)) {
        this.rooms.delete(roomId);
      }
    }
  }
}

module.exports = new RoomController();

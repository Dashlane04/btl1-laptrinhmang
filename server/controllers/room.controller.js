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
    setInterval(() => this.cleanupIdleRooms(), config.CLEANUP_INTERVAL_MS);
  }

  /**
   * Tạo phòng mới
   * @param {string} roomName 
   * @param {string} password 
   * @param {number} timePerTurn 
   * @returns {Room}
   */
  createRoom(roomName, password = '', timePerTurn = config.DEFAULT_TURN_TIME) {
    if (this.rooms.size >= config.MAX_ROOMS) {
      throw new Error('Hệ thống máy chủ đã đạt giới hạn số phòng tối đa!');
    }

    const roomId = 'room_' + Math.random().toString(36).substring(2, 8);
    const room = new Room(roomId, roomName, password, timePerTurn);
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
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error('Phòng không tồn tại hoặc đã bị đóng!');
    }

    if (room.password && room.password.trim() !== '') {
      if (room.password !== password) {
        throw new Error('Mật khẩu phòng không chính xác!');
      }
    }

    const joinResult = room.addPlayer(socketId, playerName);
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
      room.stopTimer();
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
   * Lấy danh sách tóm tắt các phòng công khai
   * @returns {Array<Object>}
   */
  getPublicRoomList() {
    const list = [];
    for (const room of this.rooms.values()) {
      list.push(room.toSummaryJSON());
    }
    return list;
  }

  /**
   * Dọn dẹp các phòng không có hoạt động trong 15 phút
   */
  cleanupIdleRooms() {
    const now = Date.now();
    const IDLE_LIMIT = 15 * 60 * 1000;

    for (const [roomId, room] of this.rooms.entries()) {
      if (now - room.lastActivityAt > IDLE_LIMIT || (!room.playerRed && !room.playerBlue)) {
        room.stopTimer();
        this.rooms.delete(roomId);
      }
    }
  }
}

module.exports = new RoomController();

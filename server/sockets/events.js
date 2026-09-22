/**
 * Danh sách hằng số tên các sự kiện Socket.io
 */
module.exports = Object.freeze({
  // Connection
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',

  // Room events
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_QUICK_MATCH: 'room:quick_match',
  ROOM_LEAVE: 'room:leave',
  ROOM_JOINED: 'room:joined',
  ROOM_UPDATED: 'room:updated',
  ROOM_LIST: 'room:list',
  ROOM_CLOSED: 'room:closed',

  // Game events
  GAME_START: 'game:start',
  GAME_MOVE: 'game:move',
  GAME_MOVE_SUCCESS: 'game:move_success',
  GAME_TICK: 'game:tick',
  GAME_TIMEOUT: 'game:timeout',
  GAME_SURRENDER: 'game:surrender',
  GAME_OVER: 'game:over',
  GAME_REMATCH_REQUEST: 'game:rematch_request',
  GAME_REMATCH_RESPONSE: 'game:rematch_response',
  GAME_REMATCH_START: 'game:rematch_start',

  // Chat & emote
  CHAT_SEND: 'chat:send',
  CHAT_RECEIVE: 'chat:receive',

  // Error
  ERROR_MESSAGE: 'error:message'
});

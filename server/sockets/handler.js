/**
 * Socket.io Handler: Bộ điều phối sự kiện thời gian thực
 */
const EVENTS = require('./events');
const roomController = require('../controllers/room.controller');
const gameController = require('../controllers/game.controller');

/**
 * Khởi tạo bộ xử lý Socket.io
 * @param {import('socket.io').Server} io 
 */
function initSocketHandler(io) {
  // Callback phát timer mỗi giây
  const handleTick = (roomId, remainingTime, currentTurn) => {
    io.to(roomId).emit(EVENTS.GAME_TICK, {
      turnTimeRemaining: remainingTime,
      currentTurn
    });
  };

  // Callback khi hết giờ lượt đi
  const handleTimeout = (roomId, timedOutSide) => {
    const room = roomController.getRoom(roomId);
    if (!room) return;

    const timeoutResult = gameController.handleTimeout(room, timedOutSide);
    io.to(roomId).emit(EVENTS.GAME_TIMEOUT, timeoutResult);
    io.to(roomId).emit(EVENTS.GAME_OVER, timeoutResult);
    io.emit(EVENTS.ROOM_LIST, roomController.getPublicRoomList());
  };

  io.on(EVENTS.CONNECTION, (socket) => {
    // Gửi danh sách phòng ban đầu cho client mới kết nối
    socket.emit(EVENTS.ROOM_LIST, roomController.getPublicRoomList());

    // 1. TẠO PHÒNG
    socket.on(EVENTS.ROOM_CREATE, (data) => {
      try {
        const { roomName, playerName, password, timePerTurn } = data || {};
        const room = roomController.createRoom(roomName, password, timePerTurn);
        const joinResult = roomController.joinRoom(room.id, socket.id, playerName, password);

        socket.join(room.id);
        socket.emit(EVENTS.ROOM_JOINED, {
          roomId: room.id,
          role: joinResult.role,
          side: joinResult.side,
          room: room.toDetailJSON()
        });

        io.emit(EVENTS.ROOM_LIST, roomController.getPublicRoomList());
      } catch (err) {
        socket.emit(EVENTS.ERROR_MESSAGE, { message: err.message });
      }
    });

    // 2. VÀO PHÒNG
    socket.on(EVENTS.ROOM_JOIN, (data) => {
      try {
        const { roomId, playerName, password } = data || {};
        const joinResult = roomController.joinRoom(roomId, socket.id, playerName, password);
        const room = joinResult.room;

        socket.join(roomId);
        socket.emit(EVENTS.ROOM_JOINED, {
          roomId: room.id,
          role: joinResult.role,
          side: joinResult.side,
          room: room.toDetailJSON()
        });

        // Nếu đã đủ 2 người chơi -> Tự động bắt đầu trận đấu
        if (room.playerRed && room.playerBlue && room.status === 'WAITING') {
          room.startGame(handleTick, handleTimeout);
          io.to(roomId).emit(EVENTS.GAME_START, {
            message: 'Trận đấu bắt đầu! Phe Đỏ đi trước.',
            room: room.toDetailJSON()
          });
        } else {
          socket.to(roomId).emit(EVENTS.ROOM_UPDATED, room.toDetailJSON());
        }

        io.emit(EVENTS.ROOM_LIST, roomController.getPublicRoomList());
      } catch (err) {
        socket.emit(EVENTS.ERROR_MESSAGE, { message: err.message });
      }
    });

    // 3. GHÉP NHANH (QUICK MATCH)
    socket.on(EVENTS.ROOM_QUICK_MATCH, (data) => {
      try {
        const { playerName } = data || {};
        let room = roomController.findQuickMatchRoom();

        if (!room) {
          // Tạo phòng mới nếu không tìm thấy phòng chờ
          room = roomController.createRoom(`Phòng Ghép Nhanh #${Math.floor(1000 + Math.random() * 9000)}`);
        }

        const joinResult = roomController.joinRoom(room.id, socket.id, playerName, '');
        socket.join(room.id);

        socket.emit(EVENTS.ROOM_JOINED, {
          roomId: room.id,
          role: joinResult.role,
          side: joinResult.side,
          room: room.toDetailJSON()
        });

        if (room.playerRed && room.playerBlue && room.status === 'WAITING') {
          room.startGame(handleTick, handleTimeout);
          io.to(room.id).emit(EVENTS.GAME_START, {
            message: 'Đã tìm thấy đối thủ! Trận đấu bắt đầu.',
            room: room.toDetailJSON()
          });
        } else {
          socket.to(room.id).emit(EVENTS.ROOM_UPDATED, room.toDetailJSON());
        }

        io.emit(EVENTS.ROOM_LIST, roomController.getPublicRoomList());
      } catch (err) {
        socket.emit(EVENTS.ERROR_MESSAGE, { message: err.message });
      }
    });

    // 4. DI CHUYỂN QUÂN CỜ
    socket.on(EVENTS.GAME_MOVE, (data) => {
      try {
        const room = roomController.getRoomBySocketId(socket.id);
        if (!room) {
          return socket.emit(EVENTS.ERROR_MESSAGE, { message: 'Bạn không ở trong phòng chơi nào!' });
        }

        const playerSide = room.getSideBySocketId(socket.id);
        if (!playerSide || playerSide === 'SPECTATOR') {
          return socket.emit(EVENTS.ERROR_MESSAGE, { message: 'Khán giả không thể thực hiện nước đi!' });
        }

        const { from, to } = data || {};
        const result = gameController.handleMove(
          room,
          playerSide,
          from,
          to,
          handleTick,
          handleTimeout
        );

        if (!result.success) {
          return socket.emit(EVENTS.ERROR_MESSAGE, { message: result.error });
        }

        // Phát thông báo nước đi thành công cho toàn phòng
        io.to(room.id).emit(EVENTS.GAME_MOVE_SUCCESS, {
          moveRecord: result.moveRecord,
          board: room.board.getState(),
          nextTurn: room.currentTurn,
          turnTimeRemaining: room.turnTimeRemaining,
          stats: room.board.getStats()
        });

        // Nếu trận đấu kết thúc
        if (result.isGameOver) {
          io.to(room.id).emit(EVENTS.GAME_OVER, result.gameOverData);
          io.emit(EVENTS.ROOM_LIST, roomController.getPublicRoomList());
        }
      } catch (err) {
        socket.emit(EVENTS.ERROR_MESSAGE, { message: err.message });
      }
    });

    // 5. ĐẦU HÀNG
    socket.on(EVENTS.GAME_SURRENDER, () => {
      try {
        const room = roomController.getRoomBySocketId(socket.id);
        if (!room) return;

        const playerSide = room.getSideBySocketId(socket.id);
        if (!playerSide || playerSide === 'SPECTATOR') return;

        const result = gameController.handleSurrender(room, playerSide);
        if (result.success) {
          io.to(room.id).emit(EVENTS.GAME_OVER, result);
          io.emit(EVENTS.ROOM_LIST, roomController.getPublicRoomList());
        }
      } catch (err) {
        socket.emit(EVENTS.ERROR_MESSAGE, { message: err.message });
      }
    });

    // 6. YÊU CẦU ĐẤU LẠI (REMATCH)
    socket.on(EVENTS.GAME_REMATCH_REQUEST, () => {
      try {
        const room = roomController.getRoomBySocketId(socket.id);
        if (!room) return;

        const rematchResult = gameController.handleRematch(room, socket.id, handleTick, handleTimeout);
        if (rematchResult.startNewGame) {
          io.to(room.id).emit(EVENTS.GAME_REMATCH_START, {
            message: 'Cả 2 người chơi đã sẵn sàng! Ván đấu mới bắt đầu.',
            room: room.toDetailJSON()
          });
        } else {
          socket.to(room.id).emit(EVENTS.GAME_REMATCH_RESPONSE, {
            message: 'Đối thủ muốn đấu lại ván mới!'
          });
        }
      } catch (err) {
        socket.emit(EVENTS.ERROR_MESSAGE, { message: err.message });
      }
    });

    // 7. TIN NHẮN CHAT & EMOTE
    socket.on(EVENTS.CHAT_SEND, (data) => {
      const room = roomController.getRoomBySocketId(socket.id);
      if (!room) return;

      const side = room.getSideBySocketId(socket.id);
      let senderName = 'Khán giả';
      if (side === 'RED' && room.playerRed) senderName = room.playerRed.name;
      if (side === 'BLUE' && room.playerBlue) senderName = room.playerBlue.name;

      io.to(room.id).emit(EVENTS.CHAT_RECEIVE, {
        sender: senderName,
        side: side || 'SPECTATOR',
        message: (data && data.message ? data.message.slice(0, 150) : ''),
        timestamp: Date.now()
      });
    });

    // 8. RỜI PHÒNG & NGẮT KẾT NỐI
    const handleLeave = () => {
      const leaveResult = roomController.leaveRoom(socket.id);
      if (leaveResult.room) {
        const { room, side, wasPlayer, isEmpty } = leaveResult;
        if (isEmpty) {
          io.emit(EVENTS.ROOM_LIST, roomController.getPublicRoomList());
        } else {
          io.to(room.id).emit(EVENTS.ROOM_UPDATED, room.toDetailJSON());
          if (wasPlayer && room.status === 'FINISHED') {
            const winner = side === 'RED' ? 'BLUE' : 'RED';
            io.to(room.id).emit(EVENTS.GAME_OVER, {
              winner,
              reason: 'OPPONENT_LEFT',
              message: `Người chơi phe ${side === 'RED' ? 'Đỏ' : 'Xanh'} đã thoát! Phe ${winner === 'RED' ? 'Đỏ' : 'Xanh'} thắng cuộc.`
            });
          }
          io.emit(EVENTS.ROOM_LIST, roomController.getPublicRoomList());
        }
      }
    };

    socket.on(EVENTS.ROOM_LEAVE, handleLeave);
    socket.on(EVENTS.DISCONNECT, handleLeave);
  });
}

module.exports = { initSocketHandler };

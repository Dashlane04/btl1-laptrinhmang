/**
 * Controller xử lý lượt đi và trạng thái ván đấu OTTv2
 */
const RuleEngine = require('../core/RuleEngine');
const { SIDES } = require('../../shared/gameRules');

class GameController {
  /**
   * Xử lý nước đi của người chơi
   * @param {Object} room - Room instance
   * @param {string} playerSide - 'RED' | 'BLUE'
   * @param {Object} from - { row, col }
   * @param {Object} to - { row, col }
   * @param {Function} onTick - Callback đồng bộ timer
   * @param {Function} onTimeout - Callback khi hết giờ
   * @returns {{ success: boolean, error?: string, moveRecord?: Object, isGameOver?: boolean, gameOverData?: Object }}
   */
  handleMove(room, playerSide, from, to, onTick, onTimeout) {
    if (!room || room.status !== 'PLAYING') {
      return { success: false, error: 'Trận đấu chưa bắt đầu hoặc đã kết thúc!' };
    }

    if (room.currentTurn !== playerSide) {
      return { success: false, error: 'Chưa tới lượt đi của bạn!' };
    }

    // 1. Thẩm định nước đi với RuleEngine
    const validation = RuleEngine.validateMove(room.board.grid, from, to, playerSide);
    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }

    // 2. Thực hiện nước đi trên bàn cờ
    const moveResult = room.board.movePiece(from.row, from.col, to.row, to.col);
    if (!moveResult) {
      return { success: false, error: 'Lỗi thực thi nước đi trên bàn cờ!' };
    }

    // 3. Ghi lại lịch sử nước đi
    const moveRecord = room.recordMove(
      from,
      to,
      moveResult.movedPiece,
      moveResult.capturedPiece
    );

    // 4. Xác định phe tiếp theo
    const nextTurnSide = playerSide === SIDES.RED ? SIDES.BLUE : SIDES.RED;

    // 5. Kiểm tra điều kiện Thắng / Thua sau nước đi
    const gameOverResult = RuleEngine.evaluateGameOver(room.board.grid, nextTurnSide);

    if (gameOverResult.isGameOver) {
      room.status = 'FINISHED';
      room.stopTimer();

      // Cộng điểm cho người thắng
      if (gameOverResult.winner === SIDES.RED && room.playerRed) {
        room.playerRed.score = (room.playerRed.score || 0) + 1;
      } else if (gameOverResult.winner === SIDES.BLUE && room.playerBlue) {
        room.playerBlue.score = (room.playerBlue.score || 0) + 1;
      }

      return {
        success: true,
        moveRecord,
        isGameOver: true,
        gameOverData: gameOverResult
      };
    }

    // 6. Chuyển lượt và reset đồng hồ đếm ngược
    room.switchTurn(onTick, onTimeout);

    return {
      success: true,
      moveRecord,
      isGameOver: false,
      nextTurn: room.currentTurn,
      turnTimeRemaining: room.turnTimeRemaining
    };
  }

  /**
   * Xử lý khi người chơi chủ động Đầu Hàng
   * @param {Object} room 
   * @param {string} playerSide 
   * @returns {Object}
   */
  handleSurrender(room, playerSide) {
    if (!room || room.status !== 'PLAYING') {
      return { success: false, error: 'Không thể đầu hàng lúc này!' };
    }

    const winner = playerSide === SIDES.RED ? SIDES.BLUE : SIDES.RED;
    room.status = 'FINISHED';
    room.stopTimer();

    if (winner === SIDES.RED && room.playerRed) room.playerRed.score = (room.playerRed.score || 0) + 1;
    if (winner === SIDES.BLUE && room.playerBlue) room.playerBlue.score = (room.playerBlue.score || 0) + 1;

    return {
      success: true,
      winner,
      reason: 'SURRENDER',
      message: `Phe ${playerSide === SIDES.RED ? 'Đỏ' : 'Xanh'} đã đầu hàng! Phe ${winner === SIDES.RED ? 'Đỏ' : 'Xanh'} giành chiến thắng!`
    };
  }

  /**
   * Xử lý khi người chơi hết thời gian suy nghĩ lượt
   * @param {Object} room 
   * @param {string} timedOutSide 
   * @returns {Object}
   */
  handleTimeout(room, timedOutSide) {
    const winner = timedOutSide === SIDES.RED ? SIDES.BLUE : SIDES.RED;
    room.status = 'FINISHED';
    room.stopTimer();

    if (winner === SIDES.RED && room.playerRed) room.playerRed.score = (room.playerRed.score || 0) + 1;
    if (winner === SIDES.BLUE && room.playerBlue) room.playerBlue.score = (room.playerBlue.score || 0) + 1;

    return {
      winner,
      reason: 'TIMEOUT',
      message: `Phe ${timedOutSide === SIDES.RED ? 'Đỏ' : 'Xanh'} đã hết thời gian lượt đi! Phe ${winner === SIDES.RED ? 'Đỏ' : 'Xanh'} giành chiến thắng!`
    };
  }

  /**
   * Xử lý bầu chọn đấu lại (Rematch)
   * @param {Object} room 
   * @param {string} socketId 
   * @param {Function} onTick 
   * @param {Function} onTimeout 
   * @returns {{ requested: boolean, startNewGame: boolean }}
   */
  handleRematch(room, socketId, onTick, onTimeout) {
    if (!room || room.status !== 'FINISHED') {
      return { requested: false, startNewGame: false, error: 'Chỉ có thể yêu cầu đấu lại khi ván cờ kết thúc!' };
    }

    room.rematchVotes.add(socketId);

    // Cần cả 2 người chơi Red và Blue cùng đồng ý
    const redReady = room.playerRed && room.rematchVotes.has(room.playerRed.socketId);
    const blueReady = room.playerBlue && room.rematchVotes.has(room.playerBlue.socketId);

    if (redReady && blueReady) {
      room.startGame(onTick, onTimeout);
      return { requested: true, startNewGame: true };
    }

    return { requested: true, startNewGame: false };
  }
}

module.exports = new GameController();

/**
 * RuleEngine: Động cơ thẩm định và xác thực luật chơi OTTv2 phía Server (Chống gian lận)
 */
const {
  SIDES,
  getValidMoves,
  getAllValidMoves,
  checkGameOver,
  posToNotation
} = require('../../shared/gameRules');

class RuleEngine {
  /**
   * Xác thực xem một nước đi có hợp lệ hay không
   * @param {Array<Array<Object|null>>} boardState - Ma trận bàn cờ
   * @param {Object} from - { row, col }
   * @param {Object} to - { row, col }
   * @param {string} currentTurnSide - 'RED' | 'BLUE'
   * @returns {{ isValid: boolean, error?: string, isCapture?: boolean, targetPiece?: Object|null }}
   */
  static validateMove(boardState, from, to, currentTurnSide) {
    if (!from || !to) {
      return { isValid: false, error: 'Toạ độ nước đi không đầy đủ!' };
    }

    const { row: fromRow, col: fromCol } = from;
    const { row: toRow, col: toCol } = to;

    const piece = boardState[fromRow] && boardState[fromRow][fromCol];
    if (!piece) {
      return { isValid: false, error: `Không có quân cờ nào tại ô ${posToNotation(fromRow, fromCol)}!` };
    }

    if (piece.side !== currentTurnSide) {
      return { isValid: false, error: `Không phải lượt của phe ${piece.side === SIDES.RED ? 'Đỏ' : 'Xanh'}!` };
    }

    const validMoves = getValidMoves(boardState, fromRow, fromCol);
    const matchedMove = validMoves.find(m => m.row === toRow && m.col === toCol);

    if (!matchedMove) {
      return {
        isValid: false,
        error: `Nước đi từ ${posToNotation(fromRow, fromCol)} tới ${posToNotation(toRow, toCol)} không hợp lệ theo quy tắc OTTv2!`
      };
    }

    return {
      isValid: true,
      isCapture: matchedMove.isCapture,
      targetPiece: matchedMove.targetPiece
    };
  }

  /**
   * Đánh giá kết quả kết thúc ván cờ sau nước đi
   * @param {Array<Array<Object|null>>} boardState 
   * @param {string} nextTurnSide 
   * @returns {{ isGameOver: boolean, winner: string|null, reason: string|null, message: string }}
   */
  static evaluateGameOver(boardState, nextTurnSide) {
    return checkGameOver(boardState, nextTurnSide);
  }

  /**
   * Lấy danh sách nước đi hợp lệ
   */
  static getValidMovesForPiece(boardState, row, col) {
    return getValidMoves(boardState, row, col);
  }

  /**
   * Lấy toàn bộ nước đi của một phe
   */
  static getAllMoves(boardState, side) {
    return getAllValidMoves(boardState, side);
  }
}

module.exports = RuleEngine;

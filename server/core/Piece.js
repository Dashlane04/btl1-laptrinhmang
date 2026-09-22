/**
 * Lớp biểu diễn một quân cờ OTTv2
 */
const { PIECE_TYPES, SIDES } = require('../../shared/gameRules');

class Piece {
  /**
   * @param {string} type - 'ROCK' | 'PAPER' | 'SCISSORS'
   * @param {string} side - 'RED' | 'BLUE'
   * @param {string} [id] - Mã định danh quân cờ
   */
  constructor(type, side, id = null) {
    if (!Object.values(PIECE_TYPES).includes(type)) {
      throw new Error(`Loại quân không hợp lệ: ${type}`);
    }
    if (!Object.values(SIDES).includes(side)) {
      throw new Error(`Phe không hợp lệ: ${side}`);
    }

    this.type = type;
    this.side = side;
    this.id = id || `${side[0].toLowerCase()}_${type[0].toLowerCase()}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      side: this.side
    };
  }
}

module.exports = Piece;

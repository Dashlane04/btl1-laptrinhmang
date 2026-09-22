/**
 * Client Piece Class
 */
class ClientPiece {
  /**
   * @param {string} id 
   * @param {string} type - 'ROCK' | 'PAPER' | 'SCISSORS'
   * @param {string} side - 'RED' | 'BLUE'
   */
  constructor(id, type, side) {
    this.id = id;
    this.type = type;
    this.side = side;
  }

  getAssetUrl() {
    return CONFIG.PIECE_ASSETS[this.side][this.type] || '';
  }

  getDisplayName() {
    const names = {
      ROCK: 'Đấm (Búa)',
      PAPER: 'Lá (Bao)',
      SCISSORS: 'Kéo'
    };
    return names[this.type] || this.type;
  }
}

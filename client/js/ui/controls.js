/**
 * Controls: Bộ điều khiển tương tác chọn quân và nước đi của người chơi
 */
class BoardControls {
  /**
   * @param {ClientBoard} board 
   * @param {BoardRenderer} renderer 
   * @param {Function} onMoveCallback 
   */
  constructor(board, renderer, onMoveCallback) {
    this.board = board;
    this.renderer = renderer;
    this.onMove = onMoveCallback;

    this.selectedCell = null; // { row, col }
    this.validMoves = [];     // Array<{ row, col, isCapture }>
    this.currentTurn = GameRules.SIDES.RED;
    this.playerSide = null;   // 'RED' | 'BLUE' | null (null: cho phép cả 2 ở chế độ Offline)
    this.isInteractive = true;
  }

  setGameState(currentTurn, playerSide, isInteractive = true) {
    this.currentTurn = currentTurn;
    this.playerSide = playerSide;
    this.isInteractive = isInteractive;
    this.clearSelection();
  }

  handleCellClick(row, col) {
    if (!this.isInteractive) return;

    const clickedPiece = this.board.getPiece(row, col);

    // Trường hợp 1: Đã chọn 1 quân cờ trước đó
    if (this.selectedCell) {
      // Nếu click lại chính ô đó -> Hủy chọn
      if (this.selectedCell.row === row && this.selectedCell.col === col) {
        this.clearSelection();
        return;
      }

      // Kiểm tra xem ô vừa click có nằm trong danh sách nước đi hợp lệ không
      const matchedMove = this.validMoves.find(m => m.row === row && m.col === col);
      if (matchedMove) {
        const from = { ...this.selectedCell };
        const to = { row, col };
        this.clearSelection();

        if (typeof this.onMove === 'function') {
          this.onMove(from, to, matchedMove);
        }
        return;
      }

      // Nếu click vào một quân khác của phe mình -> Chuyển vùng chọn sang quân mới
      if (clickedPiece && this._isPieceControllable(clickedPiece)) {
        this._selectPiece(row, col);
        return;
      }

      // Nếu click vào ô không hợp lệ khác -> Hủy chọn
      this.clearSelection();
      return;
    }

    // Trường hợp 2: Chưa chọn quân cờ nào
    if (clickedPiece && this._isPieceControllable(clickedPiece)) {
      this._selectPiece(row, col);
    }
  }

  _isPieceControllable(piece) {
    if (!piece) return false;
    // Phải đúng lượt của phe đó
    if (piece.side !== this.currentTurn) return false;
    // Nếu có giới hạn playerSide (ở chế độ Online / AI) thì chỉ được điều khiển phe mình
    if (this.playerSide && piece.side !== this.playerSide) return false;
    return true;
  }

  _selectPiece(row, col) {
    this.selectedCell = { row, col };
    this.validMoves = ClientRules.getValidMoves(this.board.grid, row, col);
    this.renderer.highlightSelected(row, col);
    this.renderer.showValidMoves(this.validMoves);
  }

  clearSelection() {
    this.selectedCell = null;
    this.validMoves = [];
    this.renderer.clearHighlights();
  }
}

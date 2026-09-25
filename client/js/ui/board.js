/**
 * Bàn cờ 9x9: dựng DOM, vẽ quân, xử lý chọn/di chuyển.
 *
 * XOAY BÀN CỜ: người chơi phe Xanh nhìn bàn cờ quay 180 độ, giống cờ vua,
 * để quân nhà luôn ở phía dưới và căn cứ nhà ở góc dưới-trái.
 * Toạ độ bàn cờ (row, col) không đổi; chỉ THỨ TỰ HIỂN THỊ đổi.
 *   RED : display(i, j) -> board(i, j)
 *   BLUE: display(i, j) -> board(8 - i, 8 - j)
 */
(function (global) {
  'use strict';

  const R = global.GameRules;
  const OTT = global.OTT || (global.OTT = {});
  const SIZE = 9;

  const TYPE_LETTER = { ROCK: 'Đ', PAPER: 'L', SCISSORS: 'K' };

  /** Hình dạng riêng cho từng loại quân -> phân biệt được không cần dựa vào màu */
  function pieceSvg(piece) {
    const letter = TYPE_LETTER[piece.type] || '?';
    let shape;
    if (piece.type === 'ROCK') {
      shape = '<circle cx="32" cy="32" r="25" />';
    } else if (piece.type === 'PAPER') {
      shape = '<rect x="9" y="9" width="46" height="46" rx="9" />';
    } else {
      shape = '<path d="M32 5 L59 54 H5 Z" />';
    }
    return `<svg class="piece-svg" viewBox="0 0 64 64" aria-hidden="true">
      <g class="piece-shape">${shape}</g>
      <text class="piece-letter" x="32" y="33" text-anchor="middle" dominant-baseline="central">${letter}</text>
    </svg>`;
  }

  function pieceLabel(piece) {
    return `${R.SIDE_NAMES_VI[piece.side]} ${R.TYPE_NAMES_VI[piece.type]}`;
  }

  class BoardView {
    /**
     * @param {HTMLElement} container
     * @param {{ onCellClick?: (row:number, col:number) => void, compact?: boolean }} opts
     */
    constructor(container, opts = {}) {
      this.container = container;
      this.onCellClick = opts.onCellClick || null;
      this.compact = Boolean(opts.compact);
      this.orientation = R.SIDES.RED;
      this.cells = [];          // cells[row][col] = HTMLElement
      this._build();
    }

    /** Đổi góc nhìn. Trả về true nếu có thay đổi (đã dựng lại DOM). */
    setOrientation(side) {
      const next = side === R.SIDES.BLUE ? R.SIDES.BLUE : R.SIDES.RED;
      if (next === this.orientation) return false;
      this.orientation = next;
      this._build();
      return true;
    }

    /** board(row, col) tương ứng với ô hiển thị thứ (i, j) */
    _toBoard(i, j) {
      return this.orientation === R.SIDES.BLUE
        ? { row: SIZE - 1 - i, col: SIZE - 1 - j }
        : { row: i, col: j };
    }

    _fileLabels() {
      const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
      return this.orientation === R.SIDES.BLUE ? letters.slice().reverse() : letters;
    }

    _rankLabels() {
      const ranks = ['9', '8', '7', '6', '5', '4', '3', '2', '1'];
      return this.orientation === R.SIDES.BLUE ? ranks.slice().reverse() : ranks;
    }

    _build() {
      this.container.innerHTML = '';
      this.cells = Array.from({ length: SIZE }, () => new Array(SIZE).fill(null));

      const frame = document.createElement('div');
      frame.className = 'board-frame' + (this.compact ? ' is-compact' : '');
      frame.dataset.orientation = this.orientation;

      const filesRow = () => {
        const row = document.createElement('div');
        row.className = 'board-files';
        row.setAttribute('aria-hidden', 'true');
        row.appendChild(document.createElement('span'));           // ô góc
        this._fileLabels().forEach(l => {
          const s = document.createElement('span');
          s.textContent = l;
          row.appendChild(s);
        });
        row.appendChild(document.createElement('span'));
        return row;
      };

      frame.appendChild(filesRow());

      const mid = document.createElement('div');
      mid.className = 'board-mid';

      const ranksCol = () => {
        const col = document.createElement('div');
        col.className = 'board-ranks';
        col.setAttribute('aria-hidden', 'true');
        this._rankLabels().forEach(l => {
          const s = document.createElement('span');
          s.textContent = l;
          col.appendChild(s);
        });
        return col;
      };

      mid.appendChild(ranksCol());

      const grid = document.createElement('div');
      grid.className = 'board-grid';
      grid.setAttribute('role', 'grid');
      grid.setAttribute('aria-label', 'Bàn cờ OTTv2 9x9');

      for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE; j++) {
          const { row, col } = this._toBoard(i, j);
          const cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'cell';
          cell.dataset.row = String(row);
          cell.dataset.col = String(col);
          cell.dataset.pos = R.posToNotation(row, col);
          // bàn cờ sáng/tối xen kẽ dựa trên toạ độ THẬT nên không đổi khi xoay
          if ((row + col) % 2 === 1) cell.classList.add('cell--alt');

          const baseOwner = R.baseOwnerAt(row, col);
          if (baseOwner) {
            cell.classList.add('cell--base', baseOwner === R.SIDES.RED ? 'cell--base-red' : 'cell--base-blue');
            cell.dataset.baseLabel = R.posToNotation(row, col);
          }

          if (this.onCellClick) {
            cell.addEventListener('click', () => this.onCellClick(row, col));
          } else {
            cell.tabIndex = -1;
          }

          this.cells[row][col] = cell;
          grid.appendChild(cell);
        }
      }

      mid.appendChild(grid);
      mid.appendChild(ranksCol());
      frame.appendChild(mid);
      frame.appendChild(filesRow());
      this.container.appendChild(frame);
    }

    /**
     * Vẽ lại toàn bộ bàn cờ.
     * @param {Array} board ma trận 9x9
     * @param {{ selected?: {row,col}, moves?: Array, lastMove?: object, interactive?: boolean, myeSide?: string }} opts
     */
    render(board, opts = {}) {
      const { selected = null, moves = [], lastMove = null, interactive = true, mySide = null } = opts;

      const moveMap = new Map();
      moves.forEach(m => moveMap.set(m.row + ':' + m.col, m));

      for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
          const cell = this.cells[row][col];
          const piece = board[row] ? board[row][col] : null;

          cell.classList.remove(
            'is-selected', 'is-move', 'is-capture',
            'is-last-from', 'is-last-to', 'is-mine'
          );

          // --- quân cờ ---
          const existing = cell.firstElementChild;
          const wantKey = piece ? piece.side + ':' + piece.type : '';
          if (cell.dataset.pieceKey !== wantKey) {
            if (existing) existing.remove();
            if (piece) {
              const el = document.createElement('span');
              el.className = 'piece piece--' + piece.side.toLowerCase();
              el.innerHTML = pieceSvg(piece);
              cell.appendChild(el);
            }
            cell.dataset.pieceKey = wantKey;
          }

          // --- nhãn trợ năng ---
          const posName = cell.dataset.pos;
          cell.setAttribute('aria-label', piece ? `${posName}: ${pieceLabel(piece)}` : `${posName}: ô trống`);

          if (piece && mySide && piece.side === mySide) cell.classList.add('is-mine');

          // --- highlight ---
          if (selected && selected.row === row && selected.col === col) cell.classList.add('is-selected');
          const mv = moveMap.get(row + ':' + col);
          if (mv) cell.classList.add(mv.isCapture ? 'is-capture' : 'is-move');

          if (lastMove) {
            if (lastMove.from && lastMove.from.row === row && lastMove.from.col === col) cell.classList.add('is-last-from');
            if (lastMove.to && lastMove.to.row === row && lastMove.to.col === col) cell.classList.add('is-last-to');
          }

          cell.disabled = !interactive || !this.onCellClick;
        }
      }
    }
  }

  /**
   * Xử lý tương tác chọn quân -> chọn ô đích.
   * Không tự áp nước đi; chỉ gọi onMove để tầng trên quyết định.
   */
  class BoardController {
    constructor(view, { onMove, onInvalid } = {}) {
      this.view = view;
      this.onMove = onMove || null;
      this.onInvalid = onInvalid || null;
      this.reset();
    }

    reset() {
      this.selected = null;
      this.moves = [];
    }

    /** @param {{ board: Array, canMove: boolean, mySide: string|null }} ctx */
    setContext(ctx) {
      this.ctx = ctx;
      // Nếu mất quyền đi hoặc quân đang chọn không còn thì bỏ chọn
      if (!ctx.canMove) this.reset();
      else if (this.selected) {
        const p = ctx.board[this.selected.row][this.selected.col];
        if (!p || p.side !== ctx.mySide) this.reset();
      }
    }

    handleClick(row, col) {
      const ctx = this.ctx;
      if (!ctx) return;

      if (!ctx.canMove) {
        if (this.onInvalid) this.onInvalid('not-your-turn');
        return;
      }

      const piece = ctx.board[row][col];

      if (this.selected) {
        if (this.selected.row === row && this.selected.col === col) {
          this.reset();
          return;
        }
        const target = this.moves.find(m => m.row === row && m.col === col);
        if (target) {
          const from = { ...this.selected };
          this.reset();
          if (this.onMove) this.onMove(from, { row, col }, target);
          return;
        }
        if (piece && piece.side === ctx.mySide) {
          this._select(row, col);
          return;
        }
        this.reset();
        return;
      }

      if (piece && piece.side === ctx.mySide) {
        this._select(row, col);
      } else if (piece) {
        if (this.onInvalid) this.onInvalid('not-your-piece');
      }
    }

    _select(row, col) {
      this.selected = { row, col };
      this.moves = R.getValidMoves(this.ctx.board, row, col);
      if (this.moves.length === 0 && this.onInvalid) this.onInvalid('no-moves');
    }
  }

  OTT.BoardView = BoardView;
  OTT.BoardController = BoardController;
  OTT.pieceSvg = pieceSvg;
})(typeof window !== 'undefined' ? window : globalThis);

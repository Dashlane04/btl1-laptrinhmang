/**
 * Main Controller: Điều phối toàn bộ ứng dụng OTTv2 Web
 * Chạy trên nền tảng Serverless thuần túy qua playhtml (PartyKit & Yjs CRDT).
 */
document.addEventListener('DOMContentLoaded', () => {
  // 1. KHỞI TẠO CÁC MODULE CỐT LÕI
  const board = new ClientBoard();
  const boardContainer = document.getElementById('board-container');
  let renderer = null;
  let controls = null;
  const playhtmlAdapter = new PlayhtmlAdapter();
  const playfullAdapter = new PlayfullAdapter(window);

  // Trạng thái cục bộ
  let currentMode = CONFIG.GAME_MODES.OFFLINE_2P;
  let mySide = GameRules.SIDES.RED;
  let currentTurn = GameRules.SIDES.RED;
  let currentRoomId = null;
  let localTimerInterval = null;
  let localTimeRemaining = CONFIG.DEFAULT_TURN_TIME;
  let playerRedName = 'Người chơi 1 (Đỏ)';
  let playerBlueName = 'Người chơi 2 (Xanh)';
  let scoreRed = 0;
  let scoreBlue = 0;

  // DOM Elements
  const lobbyView = document.getElementById('lobby-view');
  const arenaView = document.getElementById('arena-view');
  const userNicknameInput = document.getElementById('user-nickname');
  const connectionStatus = document.getElementById('connection-status');

  const pRedNameEl = document.getElementById('player-red-name');
  const pBlueNameEl = document.getElementById('player-blue-name');
  const pRedScoreEl = document.getElementById('player-red-score');
  const pBlueScoreEl = document.getElementById('player-blue-score');
  const turnIndicatorEl = document.getElementById('turn-indicator');
  const timerCountdownEl = document.getElementById('timer-countdown');
  const moveHistoryListEl = document.getElementById('move-history-list');
  const chatMessagesEl = document.getElementById('chat-messages');
  const chatInputEl = document.getElementById('chat-input');
  const chatSendBtn = document.getElementById('btn-chat-send');

  // Modals
  const createRoomModal = document.getElementById('create-room-modal');
  const gameOverModal = document.getElementById('game-over-modal');
  const rulesModal = document.getElementById('rules-modal');

  // Khởi tạo renderer và controls
  renderer = new BoardRenderer(boardContainer, (row, col) => {
    controls.handleCellClick(row, col);
  });

  controls = new BoardControls(board, renderer, (from, to, moveInfo) => {
    handleMoveExecution(from, to, moveInfo);
  });

  // 2. HỆ THỐNG TOAST THÔNG BÁO
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3500);
  }

  // 3. CHUYỂN ĐỔI GIAO DIỆN
  function showView(viewName) {
    const shareBar = document.getElementById('room-share-bar');
    if (viewName === 'lobby') {
      lobbyView.classList.add('active');
      arenaView.classList.remove('active');
      stopLocalTimer();
      if (shareBar) shareBar.style.display = 'none';
    } else if (viewName === 'arena') {
      lobbyView.classList.remove('active');
      arenaView.classList.add('active');
      renderer.renderBoard(board.grid);
      if (shareBar) {
        shareBar.style.display = (currentMode === CONFIG.GAME_MODES.PLAYHTML) ? 'flex' : 'none';
      }
    }
  }

  // 4. XỬ LÝ NƯỚC ĐI (MOVE EXECUTION)
  function handleMoveExecution(from, to, moveInfo) {
    if (currentMode === CONFIG.GAME_MODES.PLAYHTML) {
      // Chế độ Online Serverless (playhtml)
      if (currentTurn !== mySide) {
        showToast('Chưa tới lượt đi của bạn!', 'warning');
        return;
      }

      const moveResult = board.applyMove(from, to);

      if (moveResult.capturedPiece) {
        sounds.playCapture();
      } else {
        sounds.playMove();
      }

      renderer.renderBoard(board.grid);
      renderer.highlightLastMove(from, to);

      const notationFrom = GameRules.posToNotation(from.row, from.col);
      const notationTo = GameRules.posToNotation(to.row, to.col);
      const notation = `${notationFrom} ➔ ${notationTo}${moveResult.capturedPiece ? ' (Ăn quân)' : ''}`;
      addMoveToHistory(currentTurn, notation);

      const nextSide = currentTurn === GameRules.SIDES.RED ? GameRules.SIDES.BLUE : GameRules.SIDES.RED;
      const gameOverResult = ClientRules.checkGameOver(board.grid, nextSide);

      if (gameOverResult.isGameOver) {
        handleGameOver(gameOverResult.winner, gameOverResult.message);
        playhtmlAdapter.notifyGameOver(gameOverResult.winner, gameOverResult.message);
      }

      currentTurn = nextSide;
      updateTurnUI();
      startLocalTimer();

      // Đồng bộ nước đi cho đối thủ
      playhtmlAdapter.sendMove(from, to, board.grid, moveResult.capturedPiece, notation, nextSide);
      controls.setGameState(currentTurn, mySide, currentTurn === mySide);
    } else {
      // Chế độ Offline Pass & Play / AI Bot
      const moveResult = board.applyMove(from, to);

      if (moveResult.capturedPiece) {
        sounds.playCapture();
      } else {
        sounds.playMove();
      }

      renderer.renderBoard(board.grid);
      renderer.highlightLastMove(from, to);

      // Ghi lịch sử
      const notationFrom = GameRules.posToNotation(from.row, from.col);
      const notationTo = GameRules.posToNotation(to.row, to.col);
      addMoveToHistory(currentTurn, `${notationFrom} ➔ ${notationTo}${moveResult.capturedPiece ? ' (Ăn quân)' : ''}`);

      // Kiểm tra thắng thua
      const nextSide = currentTurn === GameRules.SIDES.RED ? GameRules.SIDES.BLUE : GameRules.SIDES.RED;
      const gameOverResult = ClientRules.checkGameOver(board.grid, nextSide);

      if (gameOverResult.isGameOver) {
        handleGameOver(gameOverResult.winner, gameOverResult.message);
        return;
      }

      // Đổi lượt
      currentTurn = nextSide;
      updateTurnUI();
      startLocalTimer();

      // Nếu là chế độ AI và đến lượt Bot (BLUE)
      if (currentMode === CONFIG.GAME_MODES.AI && currentTurn === GameRules.SIDES.BLUE) {
        controls.setGameState(currentTurn, mySide, false); // Khóa tương tác người chơi
        setTimeout(executeAiTurn, 600);
      } else {
        controls.setGameState(currentTurn, currentMode === CONFIG.GAME_MODES.OFFLINE_2P ? null : mySide, true);
      }
    }
  }

  // 5. THỰC THI NƯỚC ĐI CỦA BOT AI
  function executeAiTurn() {
    const bestMove = ClientRules.getBestAiMove(board.grid, GameRules.SIDES.BLUE);
    if (!bestMove) {
      handleGameOver(GameRules.SIDES.RED, 'Bot AI không còn nước đi hợp lệ! Bạn đã chiến thắng!');
      return;
    }

    const moveResult = board.applyMove(bestMove.from, bestMove.to);
    if (moveResult.capturedPiece) {
      sounds.playCapture();
    } else {
      sounds.playMove();
    }

    renderer.renderBoard(board.grid);
    renderer.highlightLastMove(bestMove.from, bestMove.to);

    const notationFrom = GameRules.posToNotation(bestMove.from.row, bestMove.from.col);
    const notationTo = GameRules.posToNotation(bestMove.to.row, bestMove.to.col);
    addMoveToHistory(GameRules.SIDES.BLUE, `${notationFrom} ➔ ${notationTo}${moveResult.capturedPiece ? ' (Ăn quân)' : ''}`);

    const gameOverResult = ClientRules.checkGameOver(board.grid, GameRules.SIDES.RED);
    if (gameOverResult.isGameOver) {
      handleGameOver(gameOverResult.winner, gameOverResult.message);
      return;
    }

    currentTurn = GameRules.SIDES.RED;
    updateTurnUI();
    startLocalTimer();
    controls.setGameState(currentTurn, mySide, true);
  }

  // 6. ĐỒNG HỒ ĐẾM NGƯỢC LƯỢT ĐI (TURN TIMER)
  function startLocalTimer(timeLimit) {
    stopLocalTimer();
    localTimeRemaining = timeLimit || CONFIG.DEFAULT_TURN_TIME;
    updateTimerDisplay(localTimeRemaining);

    localTimerInterval = setInterval(() => {
      localTimeRemaining--;
      updateTimerDisplay(localTimeRemaining);

      if (localTimeRemaining <= 5 && localTimeRemaining > 0) {
        sounds.playWarning();
      }

      if (localTimeRemaining <= 0) {
        stopLocalTimer();
        const winner = currentTurn === GameRules.SIDES.RED ? GameRules.SIDES.BLUE : GameRules.SIDES.RED;
        const msg = `Phe ${currentTurn === GameRules.SIDES.RED ? 'Đỏ' : 'Xanh'} đã hết thời gian lượt đi!`;
        handleGameOver(winner, msg);

        if (currentMode === CONFIG.GAME_MODES.PLAYHTML) {
          playhtmlAdapter.notifyGameOver(winner, msg);
        }
      }
    }, 1000);
  }

  function stopLocalTimer() {
    if (localTimerInterval) {
      clearInterval(localTimerInterval);
      localTimerInterval = null;
    }
  }

  function updateTimerDisplay(seconds) {
    if (!timerCountdownEl) return;
    const s = Math.max(0, seconds);
    timerCountdownEl.textContent = s < 10 ? `0${s}` : s;
    if (s <= 5) {
      timerCountdownEl.classList.add('warning');
    } else {
      timerCountdownEl.classList.remove('warning');
    }
  }

  // 7. CẬP NHẬT UI TRẬN ĐẤU
  function updateTurnUI() {
    if (turnIndicatorEl) {
      turnIndicatorEl.textContent = `LƯỢT: ${currentTurn === GameRules.SIDES.RED ? 'PHE ĐỎ' : 'PHE XANH'}`;
      turnIndicatorEl.style.color = currentTurn === GameRules.SIDES.RED ? '#ef4444' : '#3b82f6';
    }
  }

  function addMoveToHistory(side, text) {
    if (!moveHistoryListEl) return;
    const item = document.createElement('div');
    item.className = `history-item ${side.toLowerCase()}`;
    item.innerHTML = `<span>#${moveHistoryListEl.children.length + 1} [${side === GameRules.SIDES.RED ? 'ĐỎ' : 'XANH'}]</span> <span>${text}</span>`;
    moveHistoryListEl.appendChild(item);
    moveHistoryListEl.scrollTop = moveHistoryListEl.scrollHeight;
  }

  function handleGameOver(winner, message) {
    stopLocalTimer();
    sounds.playWin();

    if (winner === GameRules.SIDES.RED) scoreRed++;
    if (winner === GameRules.SIDES.BLUE) scoreBlue++;
    updateScores();

    const titleEl = document.getElementById('game-over-title');
    const msgEl = document.getElementById('game-over-message');

    if (titleEl) {
      if (currentMode === CONFIG.GAME_MODES.PLAYHTML) {
        titleEl.textContent = winner === mySide ? '🎉 BẠN ĐÃ CHIẾN THẮNG!' : (mySide ? '💔 BẠN ĐÃ THUA TRẬN!' : `🏆 PHE ${winner === GameRules.SIDES.RED ? 'ĐỎ' : 'XANH'} THẮNG!`);
      } else {
        titleEl.textContent = `🏆 PHE ${winner === GameRules.SIDES.RED ? 'ĐỎ' : 'XANH'} THẮNG!`;
      }
      titleEl.style.color = winner === GameRules.SIDES.RED ? '#ef4444' : '#3b82f6';
    }
    if (msgEl) msgEl.textContent = message;

    gameOverModal.classList.add('active');
    playfullAdapter.notifyGameOver(winner, message);
  }

  function updateScores() {
    if (pRedScoreEl) pRedScoreEl.textContent = `Điểm: ${scoreRed}`;
    if (pBlueScoreEl) pBlueScoreEl.textContent = `Điểm: ${scoreBlue}`;
  }

  function resetGameBoard() {
    board.reset();
    currentTurn = GameRules.SIDES.RED;
    if (moveHistoryListEl) moveHistoryListEl.innerHTML = '';
    renderer.renderBoard(board.grid);
    renderer.clearHighlights();
    updateTurnUI();
    controls.setGameState(currentTurn, currentMode === CONFIG.GAME_MODES.OFFLINE_2P ? null : mySide, true);
  }

  // 8. KHỞI TẠO VÀ ĐIỀU PHỐI CÁC CHẾ ĐỘ CHƠI

  // 8.1. Chế độ 2 Người Offline (Pass & Play)
  function startOffline2P() {
    currentMode = CONFIG.GAME_MODES.OFFLINE_2P;
    mySide = GameRules.SIDES.RED;
    playerRedName = 'Người chơi 1 (Đỏ)';
    playerBlueName = 'Người chơi 2 (Xanh)';
    pRedNameEl.textContent = playerRedName;
    pBlueNameEl.textContent = playerBlueName;
    resetGameBoard();
    showView('arena');
    startLocalTimer();
    showToast('Bắt đầu chế độ 2 người chơi trên cùng máy (Pass & Play)', 'success');
  }

  // 8.2. Chế độ Đấu với Máy (AI Bot)
  function startAiMode() {
    currentMode = CONFIG.GAME_MODES.AI;
    mySide = GameRules.SIDES.RED;
    playerRedName = (userNicknameInput.value.trim() || 'Bạn') + ' (Đỏ)';
    playerBlueName = 'Bot AI Thông Minh (Xanh)';
    pRedNameEl.textContent = playerRedName;
    pBlueNameEl.textContent = playerBlueName;
    resetGameBoard();
    showView('arena');
    startLocalTimer();
    showToast('Bắt đầu trận đấu với Máy (AI Bot)', 'success');
  }

  // 8.3. Chế độ Online Serverless (playhtml)
  async function startPlayhtmlRoom(roomId, isHost = false, options = {}) {
    currentMode = CONFIG.GAME_MODES.PLAYHTML;
    currentRoomId = roomId;

    const nickname = userNicknameInput.value.trim() || (isHost ? 'Chủ phòng' : 'Khách');
    resetGameBoard();
    showView('arena');

    // Khởi tạo adapter
    const joinResult = await playhtmlAdapter.init(roomId, nickname, isHost, {
      ...options,
      initialBoard: board.grid
    });

    mySide = joinResult.mySide;
    const roomState = joinResult.roomState;

    // Cập nhật thông tin phòng trên thanh chia sẻ
    const shareInput = document.getElementById('share-room-url');
    const badgeEl = document.getElementById('room-code-badge');
    if (shareInput) shareInput.value = playhtmlAdapter.getShareUrl();
    if (badgeEl) badgeEl.textContent = `Mã: ${roomId}`;

    // Cập nhật tên người chơi
    playerRedName = (roomState.hostName || 'Chủ phòng') + ' (Đỏ)';
    playerBlueName = (roomState.guestName || 'Đang chờ đối thủ...') + ' (Xanh)';
    pRedNameEl.textContent = playerRedName;
    pBlueNameEl.textContent = playerBlueName;

    // Phân quyền tương tác
    const isMyTurn = (currentTurn === mySide) && (mySide !== null);
    controls.setGameState(currentTurn, mySide, isMyTurn);

    if (isHost) {
      showToast(`🎉 Đã tạo phòng #${roomId}! Hãy sao chép link mời gửi cho bạn bè.`, 'success');
    } else {
      showToast(`Đã tham gia phòng #${roomId} (${joinResult.role}: ${mySide || 'Khán giả'})!`, 'success');
    }

    if (roomState.status === 'PLAYING') {
      startLocalTimer(roomState.timePerTurn);
    }
  }

  // 9. LẮNG NGHE SỰ KIỆN TỪ PLAYHTML ADAPTER
  playhtmlAdapter.on('state:updated', ({ roomState, mySide: updatedSide, role }) => {
    if (currentMode !== CONFIG.GAME_MODES.PLAYHTML) return;

    // Cập nhật bàn cờ
    if (roomState.board && roomState.board.length > 0) {
      board.setState(roomState.board);
      renderer.renderBoard(board.grid);
    }

    // Hiển thị highlight nước đi vừa thực hiện
    if (roomState.lastMove) {
      renderer.highlightLastMove(roomState.lastMove.from, roomState.lastMove.to);
      if (roomState.lastMove.capturedPiece) {
        sounds.playCapture();
      } else {
        sounds.playMove();
      }
      if (moveHistoryListEl && moveHistoryListEl.children.length === 0 && roomState.moveHistory) {
        // Tái tạo lịch sử nếu mới vào phòng
        roomState.moveHistory.forEach(m => addMoveToHistory(m.side, m.notation));
      }
    }

    // Cập nhật tên người chơi
    if (roomState.hostName && pRedNameEl) {
      pRedNameEl.textContent = roomState.hostName + ' (Đỏ)';
    }
    if (pBlueNameEl) {
      pBlueNameEl.textContent = (roomState.guestName || 'Đang chờ đối thủ...') + ' (Xanh)';
    }

    // Cập nhật điểm số
    if (roomState.scores) {
      scoreRed = roomState.scores.red || 0;
      scoreBlue = roomState.scores.blue || 0;
      updateScores();
    }

    // Lượt đi
    currentTurn = roomState.currentTurn || GameRules.SIDES.RED;
    updateTurnUI();

    // Đồng hồ
    if (roomState.status === 'PLAYING') {
      startLocalTimer(roomState.timePerTurn);
    } else if (roomState.status === 'FINISHED') {
      stopLocalTimer();
      if (roomState.gameOver) {
        handleGameOver(roomState.gameOver.winner, roomState.gameOver.message);
      }
    }

    // Phân quyền click
    mySide = updatedSide;
    const canMove = (currentTurn === mySide) && (mySide !== null) && (roomState.status === 'PLAYING');
    controls.setGameState(currentTurn, mySide, canMove);
  });

  playhtmlAdapter.on('chat:receive', (data) => {
    if (!chatMessagesEl) return;
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.innerHTML = `<div class="chat-sender ${data.side ? data.side.toLowerCase() : 'spectator'}">${data.sender}</div><div>${data.message}</div>`;
    chatMessagesEl.appendChild(bubble);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  });

  playhtmlAdapter.on('game:reset', (data) => {
    if (data.board) board.setState(data.board);
    currentTurn = data.currentTurn || GameRules.SIDES.RED;
    resetGameBoard();
    gameOverModal.classList.remove('active');
    startLocalTimer(data.timePerTurn);
    const canMove = (currentTurn === mySide) && (mySide !== null);
    controls.setGameState(currentTurn, mySide, canMove);
    showToast('Ván đấu mới đã bắt đầu!', 'success');
  });

  playhtmlAdapter.on('rematch:waiting', (data) => {
    showToast(data.message, 'info');
  });

  // 10. GÁN SỰ KIỆN CHO CÁC NÚT BẤM VÀ FORM

  // Chế độ Offline Pass & Play
  document.getElementById('btn-mode-offline')?.addEventListener('click', startOffline2P);

  // Chế độ AI Bot
  document.getElementById('btn-mode-ai')?.addEventListener('click', startAiMode);

  // Mở modal tạo phòng Online playhtml
  document.getElementById('btn-mode-playhtml')?.addEventListener('click', () => {
    createRoomModal.classList.add('active');
  });

  document.getElementById('btn-close-create-modal')?.addEventListener('click', () => {
    createRoomModal.classList.remove('active');
  });

  // Submit form tạo phòng mới
  document.getElementById('form-create-room')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const roomName = document.getElementById('input-room-name')?.value.trim() || 'Phòng Chiến Thuật';
    const timePerTurn = parseInt(document.getElementById('select-time-turn')?.value, 10) || 30;
    const randomCode = 'ott-' + Math.random().toString(36).substring(2, 8);

    createRoomModal.classList.remove('active');
    startPlayhtmlRoom(randomCode, true, { roomName, timePerTurn });
  });

  // Vào phòng bằng mã hoặc dán link mời
  document.getElementById('btn-join-room-code')?.addEventListener('click', () => {
    const inputVal = document.getElementById('input-join-room-code')?.value.trim();
    if (!inputVal) {
      showToast('Vui lòng nhập mã phòng hoặc dán link mời!', 'warning');
      return;
    }

    let roomId = inputVal;
    if (inputVal.includes('?room=')) {
      try {
        const url = new URL(inputVal.startsWith('http') ? inputVal : `http://${inputVal}`);
        roomId = url.searchParams.get('room') || inputVal;
      } catch (e) {}
    }

    startPlayhtmlRoom(roomId, false);
  });

  // Sao chép link mời bạn bè
  document.getElementById('btn-copy-room-link')?.addEventListener('click', () => {
    const shareInput = document.getElementById('share-room-url');
    if (shareInput && shareInput.value) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareInput.value).then(() => {
          showToast('📋 Đã sao chép link mời vào bộ nhớ tạm!', 'success');
        }).catch(() => {
          shareInput.select();
          document.execCommand('copy');
          showToast('📋 Đã sao chép link mời!', 'success');
        });
      } else {
        shareInput.select();
        document.execCommand('copy');
        showToast('📋 Đã sao chép link mời!', 'success');
      }
    }
  });

  // Đầu hàng
  document.getElementById('btn-surrender')?.addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn đầu hàng ván đấu này?')) {
      if (currentMode === CONFIG.GAME_MODES.PLAYHTML) {
        const winner = mySide === GameRules.SIDES.RED ? GameRules.SIDES.BLUE : GameRules.SIDES.RED;
        const msg = `Phe ${mySide === GameRules.SIDES.RED ? 'Đỏ' : 'Xanh'} đã chủ động đầu hàng!`;
        playhtmlAdapter.notifyGameOver(winner, msg);
        handleGameOver(winner, msg);
      } else {
        const winner = currentTurn === GameRules.SIDES.RED ? GameRules.SIDES.BLUE : GameRules.SIDES.RED;
        handleGameOver(winner, `Phe ${currentTurn === GameRules.SIDES.RED ? 'Đỏ' : 'Xanh'} đã chủ động đầu hàng!`);
      }
    }
  });

  // Rời phòng về sảnh chờ
  document.getElementById('btn-leave-arena')?.addEventListener('click', () => {
    if (confirm('Rời khỏi trận đấu và quay về sảnh chính?')) {
      if (currentMode === CONFIG.GAME_MODES.PLAYHTML) {
        playhtmlAdapter.leaveRoom();
      }
      stopLocalTimer();
      showView('lobby');
    }
  });

  // Đấu lại (Rematch)
  document.getElementById('btn-rematch')?.addEventListener('click', () => {
    if (currentMode === CONFIG.GAME_MODES.PLAYHTML) {
      const freshBoard = new ClientBoard();
      playhtmlAdapter.requestRematch(freshBoard.grid);
    } else {
      gameOverModal.classList.remove('active');
      resetGameBoard();
      startLocalTimer();
    }
  });

  document.getElementById('btn-close-game-over')?.addEventListener('click', () => {
    gameOverModal.classList.remove('active');
    showView('lobby');
  });

  // Bật/tắt âm thanh
  document.getElementById('btn-sound-toggle')?.addEventListener('click', (e) => {
    const isMuted = sounds.toggleMute();
    e.currentTarget.textContent = isMuted ? '🔇 Tắt tiếng' : '🔊 Âm thanh';
  });

  // Hướng dẫn luật chơi
  document.getElementById('btn-rules-modal')?.addEventListener('click', () => {
    rulesModal.classList.add('active');
  });

  document.getElementById('btn-close-rules')?.addEventListener('click', () => {
    rulesModal.classList.remove('active');
  });

  // Gửi tin nhắn Chat
  const sendChatMessage = () => {
    const text = chatInputEl.value.trim();
    if (!text) return;
    if (currentMode === CONFIG.GAME_MODES.PLAYHTML) {
      playhtmlAdapter.sendChat(text);
    } else {
      // Local chat echo
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      bubble.innerHTML = `<div class="chat-sender red">Bạn</div><div>${text}</div>`;
      chatMessagesEl.appendChild(bubble);
      chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }
    chatInputEl.value = '';
  };

  chatSendBtn?.addEventListener('click', sendChatMessage);
  chatInputEl?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });

  // 11. TỰ ĐỘNG THAM GIA PHÒNG NẾU URL CHỨA ?room=
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    setTimeout(() => {
      startPlayhtmlRoom(roomParam, false);
    }, 300);
  }
});

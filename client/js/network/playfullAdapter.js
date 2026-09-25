/**
 * Playfull Adapter: Wrapper hỗ trợ nhúng Iframe hoặc thư viện Playfull
 */
class PlayfullAdapter {
  constructor(gameInstance) {
    this.game = gameInstance;
    this._initIframeListener();
  }

  _initIframeListener() {
    window.addEventListener('message', (event) => {
      try {
        const data = event.data;
        if (!data || typeof data !== 'object') return;

        switch (data.type) {
          case 'PLAYFULL_START_GAME':
            if (this.game) {
              this.game.startOfflineMode();
            }
            break;
          case 'PLAYFULL_RESET':
            if (this.game) {
              this.game.resetGame();
            }
            break;
        }
      } catch (e) {
        console.warn('Playfull message handling error:', e);
      }
    });
  }

  notifyGameOver(winner, reason) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'PLAYFULL_GAME_OVER',
        winner,
        reason
      }, '*');
    }
  }
}

/**
 * Âm thanh tổng hợp bằng Web Audio API — không cần file audio.
 */
(function (global) {
  'use strict';
  const OTT = global.OTT || (global.OTT = {});
  const KEY = 'ottv2_muted';

  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) {}

  function ensureCtx() {
    if (muted) return null;
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freq, durMs, type = 'sine', gain = 0.12) {
    const c = ensureCtx();
    if (!c) return;
    try {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime);
      g.gain.setValueAtTime(gain, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durMs / 1000);
      osc.connect(g); g.connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + durMs / 1000);
    } catch (e) {}
  }

  function seq(steps) {
    steps.forEach(([f, d, t, g], i) => setTimeout(() => tone(f, d, t, g), i * 90));
  }

  OTT.Sound = {
    move()    { tone(420, 70, 'triangle', 0.08); },
    capture() { seq([[660, 70, 'square', 0.10], [330, 130, 'square', 0.10]]); },
    win()     { seq([[523, 130], [659, 130], [784, 220]]); },
    lose()    { seq([[392, 160], [294, 260]]); },
    join()    { seq([[587, 90], [784, 120]]); },
    warn()    { tone(880, 90, 'square', 0.09); },
    isMuted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) {}
      return muted;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

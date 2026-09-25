/**
 * Chế độ sáng / tối. Mặc định theo thiết lập hệ điều hành, người dùng đổi được
 * và lựa chọn đó được ghi nhớ.
 */
(function (global) {
  'use strict';
  const OTT = global.OTT || (global.OTT = {});
  const KEY = 'ottv2_theme';
  const root = document.documentElement;

  function systemPref() {
    return global.matchMedia && global.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  let current = stored() || systemPref();

  function apply(theme) {
    current = theme === 'light' ? 'light' : 'dark';
    root.dataset.theme = current;
    try { localStorage.setItem(KEY, current); } catch (e) {}
    const btn = document.getElementById('btn-theme');
    if (btn) {
      const dark = current === 'dark';
      btn.setAttribute('aria-label', dark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối');
      btn.title = btn.getAttribute('aria-label');
      btn.textContent = dark ? '☀' : '☾';
    }
  }

  function toggle() { apply(current === 'dark' ? 'light' : 'dark'); return current; }

  apply(current);

  OTT.Theme = { apply, toggle, get current() { return current; } };
})(typeof window !== 'undefined' ? window : globalThis);

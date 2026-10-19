let focusHandbackDispose = null;

function weIsWallpaperFrame(el) {
  if (!el || el.tagName !== "IFRAME") return false;
  const cls = typeof el.className === "string" ? el.className : "";
  return /(^|\s)we-iframe(\s|$)/.test(cls);
}

function installFocusHandback() {
  if (typeof document === "undefined" || !document || typeof window === "undefined" || !window) return null;
  if (focusHandbackDispose) return focusHandbackDispose;

  if (typeof document.addEventListener !== "function" || typeof document.removeEventListener !== "function"
    || typeof window.addEventListener !== "function" || typeof window.removeEventListener !== "function") return null;

  const GESTURE_WINDOW_MS = 1000;
  const STALE_MS = 120000;
  const MIN_GAP_MS = 300;

  const state = { lastEl: null, lastAt: 0, gestureAt: 0, handbacks: 0, skipped: 0, lastHandBackAt: 0, active: true, retrying: false };
  let retryTimer = null;

  const onFocusIn = (e) => {
    const el = e.target;

    if (!el || el === document.body || el === document.documentElement) return;
    if (weIsWallpaperFrame(el)) return;
    state.lastEl = el;
    state.lastAt = Date.now();
  };
  const onGesture = () => { state.gestureAt = Date.now(); };
  const handBack = () => {
    if (!state.active) return;
    const el = state.lastEl;
    if (!el) return;
    const active = document.activeElement;
    if (!weIsWallpaperFrame(active) || !active.isConnected) return;
    const now = Date.now();
    if (now - state.gestureAt <= GESTURE_WINDOW_MS) {
      state.skipped += 1;

      if (retryTimer === null) {
        state.retrying = true;
        retryTimer = setTimeout(() => { retryTimer = null; state.retrying = false; handBack(); },
          Math.max(state.gestureAt + GESTURE_WINDOW_MS - now, 0) + 1);
      }
      return;
    }
    if (now - state.lastAt > STALE_MS) { state.skipped += 1; return; }
    if (now - state.lastHandBackAt < MIN_GAP_MS) { state.skipped += 1; return; }
    if (!el.isConnected) { state.skipped += 1; return; }
    state.lastHandBackAt = now;
    state.handbacks += 1;
    try {
      el.focus({ preventScroll: true });
    } catch (err) {
      try { el.focus(); } catch (err2) {   }
    }
  };
  const onFocusOut = (e) => {

    if (!state.lastEl || e.target !== state.lastEl) return;

    setTimeout(handBack, 0);
  };

  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);

  window.addEventListener("pointerdown", onGesture, true);
  window.addEventListener("mousedown", onGesture, true);
  window.addEventListener("touchstart", onGesture, true);
  window.addEventListener("keydown", onGesture, true);
  try { window.__weFocusHandback = state; } catch (err) {   }

  focusHandbackDispose = () => {
    state.active = false;

    if (retryTimer !== null) { clearTimeout(retryTimer); retryTimer = null; state.retrying = false; }
    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("focusout", onFocusOut, true);
    window.removeEventListener("pointerdown", onGesture, true);
    window.removeEventListener("mousedown", onGesture, true);
    window.removeEventListener("touchstart", onGesture, true);
    window.removeEventListener("keydown", onGesture, true);
    focusHandbackDispose = null;
  };
  return focusHandbackDispose;
}

export { installFocusHandback };

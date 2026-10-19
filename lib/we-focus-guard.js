export function weFocusGuardSource() {
  return '(' + weFocusGuardInstall.toString() + ')();';
}
function weFocusGuardInstall() {
  var w = window;
  if (w.__weFocusGuard) return;
  var guard = {
    calls: 0, blocked: 0, allowed: 0, installed: false, allow: false,
    elCalls: 0, elAllowed: 0, elBlocked: 0, elInstalled: false,
    gestureAt: 0, gestureWindowMs: 1000, elLastBlockedAt: 0, elLastBlockedStack: "",
  };
  w.__weFocusGuard = guard;
  var raw = null;
  try { raw = w.focus; } catch { raw = null; }
  if (typeof raw === 'function') {
    var patched = function () {
      guard.calls += 1;
      if (guard.allow) { guard.allowed += 1; return raw.apply(w, arguments); }
      guard.blocked += 1;
      return undefined;
    };
    try { w.focus = patched; } catch {   }
    if (w.focus !== patched) {
      try { Object.defineProperty(w, 'focus', { configurable: true, writable: true, value: patched }); } catch {   }
    }
    guard.installed = w.focus === patched;
  }
  try {
    var doc = w.document;
    var El = w.HTMLElement;
    if (doc && El && El.prototype && typeof El.prototype.focus === 'function') {
      var rawEl = El.prototype.focus;
      var mark = function () { guard.gestureAt = Date.now(); };
      var names = ['pointerdown', 'mousedown', 'touchstart', 'keydown'];
      var i;
      for (i = 0; i < names.length; i++) {
        try { w.addEventListener(names[i], mark, true); } catch {   }
      }
      var elPatched = function () {
        guard.elCalls += 1;
        var win = guard.gestureWindowMs > 0 ? guard.gestureWindowMs : 1000;
        var fresh = guard.gestureAt > 0 && (Date.now() - guard.gestureAt) <= win;
        if (guard.allow || fresh) { guard.elAllowed += 1; return rawEl.apply(this, arguments); }
        guard.elBlocked += 1;
        guard.elLastBlockedAt = Date.now();
        try {
          guard.elLastBlockedStack = String(new Error().stack || '').split('\n').slice(0, 4).join(' | ');
        } catch {   }
        return;
      };
      try { El.prototype.focus = elPatched; } catch {   }
      if (El.prototype.focus !== elPatched) {
        try { Object.defineProperty(El.prototype, 'focus', { configurable: true, writable: true, value: elPatched }); } catch {   }
      }
      guard.elInstalled = El.prototype.focus === elPatched;
    }
  } catch {   }
}
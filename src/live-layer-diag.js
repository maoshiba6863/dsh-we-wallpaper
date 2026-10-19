const LIVE_DIAG_KEY = "weLiveDebug";

const LIVE_DIAG_BUILD = "d8";
const LIVE_PAGE_ID = (function () { try { return Math.random().toString(36).slice(2, 7); } catch { return "?"; } })();

let liveDiagOn = false;
function liveDiagVerbose() {
  if (liveDiagOn) return true;
  try { return typeof localStorage !== "undefined" && localStorage.getItem(LIVE_DIAG_KEY) === "1"; } catch { return false; }
}

const LIVE_LEVELS = ["error", "warn", "info"];
function liveLog(tag, detail, level, verboseOnly) {
  if (verboseOnly && !liveDiagVerbose()) return;

  const text = typeof detail === "function" ? detail() : detail;

  const lvl = LIVE_LEVELS.indexOf(level) >= 0 ? level : "info";
  const line = "[we-live " + LIVE_DIAG_BUILD + "\u00b7p" + LIVE_PAGE_ID + "] " + tag + (text ? " · " + text : "");
  try { if (typeof console !== "undefined" && console.info) console.info(line); } catch {   }

  try {
    if (typeof Image === "function") {
      const img = new Image();
      img.src = "/diag?msg=" + encodeURIComponent(line) + "&lvl=" + lvl;
    }
  } catch {   }
}

function liveStateBrief(extra) {
  const hold = livePauseReason();
  return "playing=" + isEffectivelyPlaying() + (hold ? " hold=" + hold : "")
    + " hidden=" + (typeof document !== "undefined" && document.hidden ? 1 : 0)
    + " focus=" + (typeof document !== "undefined" && typeof document.hasFocus === "function" && document.hasFocus() ? 1 : 0)
    + (extra ? " " + extra : "");
}

let liveDiagUninstall = null;
function installLiveDiagnostics() {
  if (typeof liveDiagUninstall === "function") {
    try { liveDiagUninstall(); } catch {   }
  }
  const cleanups = [];

  const listen = (target, type, fn) => {
    if (!target || typeof target.addEventListener !== "function") return;
    try {
      target.addEventListener(type, fn);
      cleanups.push(function () { try { target.removeEventListener(type, fn); } catch {   } });
    } catch {   }
  };

  try {
    if (typeof setTimeout === "function") {
      const bootTimer = setTimeout(function () {
        try {
          liveLog("client-boot", "build=" + LIVE_DIAG_BUILD + " page=p" + LIVE_PAGE_ID
            + " mode=" + desktopWindowMode() + " extSwap=" + (useExtendedFrameSwap() ? 1 : 0)
            + " " + liveStateBrief());
        } catch {   }
      }, 0);
      cleanups.push(function () { try { clearTimeout(bootTimer); } catch {   } });
    }
  } catch {   }

  const win = typeof window === "undefined" ? null : window;
  const doc = typeof document === "undefined" ? null : document;
  listen(win, "focus", function () { liveLog("play-state", liveStateBrief("window-focus")); });
  listen(win, "blur", function () { liveLog("play-state", liveStateBrief("window-blur")); });
  listen(doc, "visibilitychange", function () {
    liveLog("play-state", liveStateBrief(doc.hidden ? "tab-hidden" : "tab-visible"));
  });

  try {
    if (typeof setInterval === "function") {
      const beatTimer = setInterval(function () {
        const w = liveWatch;
        liveLog("beat", liveStateBrief("id=" + (selection.id || "-")
          + " liveOn=" + (selection.sceneLiveActive ? 1 : 0)
          + (w ? " watch=" + w.wid + " first=" + (w.firstFrame ? 1 : 0) + " held=" + w.heldPaused + " stall=" + w.stall : " watch=-")
          + " fails=" + Object.keys(selection.sceneLiveFailures || {}).length));
      }, 60000);
      cleanups.push(function () { try { clearInterval(beatTimer); } catch {   } });
    }
  } catch {   }
  const dispose = function () {
    if (liveDiagUninstall === dispose) liveDiagUninstall = null;
    for (const fn of cleanups.splice(0)) { try { fn(); } catch {   } }
  };
  liveDiagUninstall = dispose;
  return dispose;
}

export { liveLog, liveStateBrief, liveDiagVerbose, installLiveDiagnostics, liveDiagOn };

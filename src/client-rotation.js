function barsPolygon(dir, p) {
  const horizontal = dir === "left" || dir === "right";
  const fromEnd = dir === "left" || dir === "up";
  const outer = fromEnd ? 1 : 0;
  const inward = fromEnd ? -1 : 1;
  const n = SWITCH_BARS_TEETH;
  const period = 1 / n;
  const depth = p;
  const spine = Math.min(0.004, depth);
  const slat = p / n;

  const pt = (a, t) => (horizontal ? [outer + inward * a, t] : [t, outer + inward * a]);
  const pts = [pt(0, 0)];
  for (let i = 0; i < n; i++) {
    const y0 = i * period;
    pts.push(pt(depth, y0));
    pts.push(pt(depth, y0 + slat));
    if (i < n - 1) {
      pts.push(pt(spine, y0 + slat));
      pts.push(pt(spine, y0 + period));
    }
  }
  pts.push(pt(spine, 1));
  pts.push(pt(0, 1));
  return "polygon(" + pts.map(([x, y]) =>
    (x * 100).toFixed(2) + "% " + (y * 100).toFixed(2) + "%").join(", ") + ")";
}

function switchFrames(id, dir) {
  const inFrom = { left: "translate3d(100%, 0, 0)", right: "translate3d(-100%, 0, 0)", up: "translate3d(0, 100%, 0)", down: "translate3d(0, -100%, 0)" }[dir];
  const outTo = { left: "translate3d(-100%, 0, 0)", right: "translate3d(100%, 0, 0)", up: "translate3d(0, -100%, 0)", down: "translate3d(0, 100%, 0)" }[dir];
  if (id === "push") {
    return { inFrom: { transform: inFrom }, inTo: { transform: "translate3d(0, 0, 0)" }, outTo: { transform: outTo } };
  }
  if (id === "wipe") {
    return { inFrom: { clipPath: wipeInset(dir) }, inTo: { clipPath: "inset(0)" }, outTo: {} };
  }
  if (id === "iris") {

    return { inFrom: { clipPath: "circle(0% at 50% 50%)" }, inTo: { clipPath: "circle(75% at 50% 50%)" }, outTo: {} };
  }
  if (id === "zoom") {
    return {
      inFrom: { transform: "scale(1.06)", opacity: "0" },
      inTo: { transform: "scale(1)", opacity: "1" },

      outTo: { transform: "scale(1.04)" },
    };
  }
  if (id === "bars") {
    return { inFrom: { clipPath: barsPolygon(dir, 0) }, inTo: { clipPath: barsPolygon(dir, 1) }, outTo: {} };
  }
  return { inFrom: { opacity: "0" }, inTo: { opacity: "1" }, outTo: {} };
}

const LIVE_FIRST_FADE_MS = 1800;

function cancelRotationPrepare() {
  const prep = rotationPrep;
  if (!prep) return;
  rotationPrep = null;
  prep.cancelled = true;
  for (const t of prep.timers) {
    try { clearTimeout(t); } catch {   }
  }
  prep.timers = [];
  if (prep.staged) {
    try { prep.staged.div.remove(); } catch {   }
    prep.staged = null;
  }
  releaseProbeMedia(prep);
  if (prep.readyEl) { disposeMediaEl(prep.readyEl); prep.readyEl = null; }
}

function disposeMediaEl(m) {
  if (!m) return;
  try { m.onload = null; m.onerror = null; } catch {   }
  try {
    if (typeof m.removeEventListener === "function") {
      m.removeEventListener("canplay", m.__weCanplay);
      m.removeEventListener("error", m.__weError);
      m.removeEventListener("load", m.__weLoad);
    }
  } catch {   }
  if (m.tagName === "VIDEO") {
    try { m.pause(); m.removeAttribute("src"); m.load(); } catch {   }
  }
  if (m.tagName === "IFRAME") {
    try { m.src = "about:blank"; } catch {   }
  }
}

function releaseProbeMedia(prep) {
  const m = prep && prep.probeMedia;
  if (!m) return;
  prep.probeMedia = null;
  disposeMediaEl(m);
}

function adoptProbe(prep, opts) {
  const m = prep && prep.probeMedia;
  if (!m) return;
  prep.probeMedia = null;
  try { m.onload = null; m.onerror = null; } catch {   }
  try {
    if (typeof m.removeEventListener === "function") {
      m.removeEventListener("canplay", m.__weCanplay);
      m.removeEventListener("error", m.__weError);
      m.removeEventListener("load", m.__weLoad);
    }
  } catch {   }

  if (opts && opts.ready) { try { m.__weReady = true; } catch {   } }
  prep.readyEl = m;
}

function disposePreparedMedia() {
  const el = preparedMediaEl;
  preparedMediaEl = null;
  disposeMediaEl(el);
}

function consumePreparedMedia(tag, wantUrl) {
  const el = preparedMediaEl;
  preparedMediaEl = null;
  if (!el) return null;
  if (el.tagName !== tag) { disposeMediaEl(el); return null; }
  const want = String(wantUrl || "");
  if (want) {
    const src = String((el.attributes && el.attributes.src) || el.src || "");
    if (src !== want) { disposeMediaEl(el); return null; }
  }
  return el;
}

let rotationPendingHidden = false;

let pageHiddenSince = (typeof document !== "undefined" && document.hidden) ? Date.now() : 0;
function deferRotationWhileHidden(tag) {
  rotationPendingHidden = true;
  liveLog(tag, "标签页隐藏 → 本轮轮换推迟到可见时补做（不建 staging 渲染页）");
}
function resumePendingRotation() {
  pageHiddenSince = (typeof document !== "undefined" && document.hidden) ? (pageHiddenSince || Date.now()) : 0;
  if (!rotationPendingHidden) return;
  if (typeof document !== "undefined" && document.hidden) return;
  rotationPendingHidden = false;
  liveLog("rotation-resume-pending", "已恢复可见 → 立即补做被推迟的轮换 " + liveStateBrief());
  if (selection.rotationEnabled && selection.id) beginRotationPrepare(new Set());
}

function installRotationResumeListeners() {
  const doc = typeof document === "undefined" ? null : document;
  const win = typeof window === "undefined" ? null : window;
  const bound = [];
  if (doc && typeof doc.addEventListener === "function") {
    doc.addEventListener("visibilitychange", resumePendingRotation);
    bound.push(["visibilitychange", doc]);
  }
  if (win && typeof win.addEventListener === "function") {
    win.addEventListener("focus", resumePendingRotation);
    bound.push(["focus", win]);
  }
  return function () {
    for (const [type, target] of bound.splice(0)) {
      try { target.removeEventListener(type, resumePendingRotation); } catch {   }
    }
  };
}

let livePointerFrame = null;
let livePointerPending = null;
let livePointerRaf = 0;
let livePointerDownAt = 0;
function livePointerFlush() {
  livePointerRaf = 0;
  const p = livePointerPending;
  const frame = livePointerFrame;
  if (!p || !frame || !frame.isConnected || !selection.sceneLiveActive) return;
  try {
    const wp = frame.contentWindow && frame.contentWindow.__wp;
    if (wp && typeof wp.pushPointer === "function") wp.pushPointer(p.u, p.v, p.buttons);
  } catch {   }
}
function livePointerSample(e, buttons) {
  if (!livePointerFrame || !selection.sceneLiveActive) return;
  const iw = window.innerWidth || 1;
  const ih = window.innerHeight || 1;
  livePointerPending = {
    u: Math.max(0, Math.min(1, e.clientX / iw)),
    v: Math.max(0, Math.min(1, e.clientY / ih)),
    buttons: buttons,
  };
  if (!livePointerRaf) livePointerRaf = requestAnimationFrame(livePointerFlush);
}
function ensureLivePointer(frame) {
  livePointerFrame = frame;
  if (ensureLivePointer.attached) return;
  ensureLivePointer.attached = true;
  const opts = { capture: true, passive: true };
  window.addEventListener("mousemove", (e) => {

    livePointerSample(e, e.buttons & 1);
  }, opts);
  window.addEventListener("mousedown", (e) => {
    livePointerDownAt = Date.now();
    livePointerSample(e, 1);
  }, opts);
  window.addEventListener("mouseup", (e) => {

    if (Date.now() - livePointerDownAt < 16) setTimeout(() => livePointerSample(e, 0), 20);
    else livePointerSample(e, 0);
  }, opts);
  window.addEventListener("blur", () => {
    const f = livePointerFrame;
    if (!f || !f.isConnected || !selection.sceneLiveActive) return;
    try {
      const wp = f.contentWindow && f.contentWindow.__wp;
      if (wp && typeof wp.pointerLeave === "function") wp.pointerLeave();
    } catch {   }
  }, opts);
}
function liveFrameEl() {
  try {
    const layer = document.getElementById(LAYER_ID);
    return layer ? layer.querySelector("iframe.we-live-iframe") : null;
  } catch {
    return null;
  }
}

const FRAME_BYTES_MAX = 8;
const liveFrameBytes = new Map();

if (typeof window !== "undefined") {
  try { window.__weFrameBytes = liveFrameBytes; } catch {   }
}
function revokeFrameBytes(entry) {
  if (!entry || !entry.objectUrl) return;
  try {
    const api = typeof URL !== "undefined" ? URL : null;
    if (api && typeof api.revokeObjectURL === "function") api.revokeObjectURL(entry.objectUrl);
  } catch {   }
  entry.objectUrl = "";
}
function retainFrameBytes(src, img) {
  let api = null;
  try { api = typeof URL !== "undefined" ? URL : null; } catch {   }
  const existing = liveFrameBytes.get(src);
  if (existing) { revokeFrameBytes(existing); liveFrameBytes.delete(src); }
  const entry = { objectUrl: "", img: img || null };
  liveFrameBytes.set(src, entry);
  while (liveFrameBytes.size > FRAME_BYTES_MAX) {
    const oldest = liveFrameBytes.keys().next();
    if (oldest.done) break;
    revokeFrameBytes(liveFrameBytes.get(oldest.value));
    liveFrameBytes.delete(oldest.value);
  }

  if (!img || typeof document === "undefined" || typeof document.createElement !== "function") return;
  if (!api || typeof api.createObjectURL !== "function" || typeof Blob !== "function") return;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width || 0;
    canvas.height = img.naturalHeight || img.height || 0;
    if (!canvas.width || !canvas.height) return;
    const ctx = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
    if (!ctx || typeof ctx.drawImage !== "function") return;
    ctx.drawImage(img, 0, 0);
    const toBlob = canvas.toBlob || canvas.webkitToBlob;
    if (typeof toBlob !== "function") return;
    toBlob.call(canvas, (blob) => {
      if (!blob) return;

      if (liveFrameBytes.get(src) !== entry) return;
      let url;
      try { url = api.createObjectURL(blob); } catch { return; }
      entry.objectUrl = url;
    }, "image/png");
  } catch {   }
}

function releaseFrameBytes(token) {
  const key = String(token || "");
  if (!key) return;
  for (const src of [...liveFrameBytes.keys()]) {
    if (src.indexOf(key) === -1) continue;
    revokeFrameBytes(liveFrameBytes.get(src));
    liveFrameBytes.delete(src);
  }
}

function paintFrame(poster, src) {
  const entry = liveFrameBytes.get(src);
  if (!entry) return false;

  liveFrameBytes.delete(src);
  liveFrameBytes.set(src, entry);
  if (entry.objectUrl) {
    poster.dataset.weFrameSrc = src;
    poster.style.backgroundImage = "url(" + entry.objectUrl + ")";
    return true;
  }
  if (!entry.img || typeof entry.img.cloneNode !== "function") return false;

  const copy = entry.img.cloneNode(false);
  if (copy.style) {
    copy.style.position = "absolute";
    copy.style.inset = "0";
    copy.style.width = "100%";
    copy.style.height = "100%";
    copy.style.objectFit = "cover";
  }
  try { copy.setAttribute("data-we-frame-src", src); } catch {   }
  copy.className = "we-media we-media--fit";
  poster.appendChild(copy);
  poster.dataset.weFrameSrc = src;
  return true;
}
function buildLivePoster(sel) {
  const poster = document.createElement("div");
  poster.className = "we-media we-live-poster";

  poster.style.backgroundColor = sel.schemeColor || "var(--dsw-alias-bg-layer-1, #101418)";

  const candidates = (sel.type === "web" ? [sel.liveFrame, sel.previewUrl] : [sel.url, sel.previewUrl])
    .filter((s) => typeof s === "string" && s);
  if (!candidates.length) return poster;
  poster.dataset.weFrameSrc = candidates[0];

  if (typeof Image !== "function") return poster;

  const frameSrc = sel.type === "web" ? (sel.liveFrame || "") : (sel.url || "");
  const frameRank = frameSrc && candidates[0] === frameSrc ? 0 : -1;

  const loadedRank = candidates.map(() => "");
  const failedRank = candidates.map(() => false);
  const noneAbove = (rank) => {
    for (let i = 0; i < rank; i++) if (!failedRank[i]) return false;
    return true;
  };

  const contentSettled = () => {
    poster.dataset.weContent = "ready";
    noteLayerContent(poster);
  };
  const applyRank = (rank) => {
    const src = loadedRank[rank];
    if (!src || !noneAbove(rank)) return;
    poster.dataset.weFrameSrc = src;
    if (poster.isConnected) poster.style.backgroundImage = "url(" + src + ")";
    contentSettled();
  };
  const probeRank = (rank) => {
    const src = candidates[rank];
    const probe = new Image();
    probe.onload = () => {

      if (rank === frameRank) retainFrameBytes(src, probe);
      loadedRank[rank] = src;
      applyRank(rank);
    };
    probe.onerror = () => {

      failedRank[rank] = true;
      for (let i = rank + 1; i < candidates.length; i++) applyRank(i);

      if (failedRank.every(Boolean) && !loadedRank.some(Boolean)) contentSettled();
    };
    probe.src = src;
  };
  if (frameRank === 0 && paintFrame(poster, frameSrc)) {

  } else {

    poster.dataset.weContent = "pending";

    for (let i = 0; i < candidates.length; i++) probeRank(i);
  }
  return poster;
}

let bootRestore = true;

function installLiveBootRestore() {
  const drop = () => { bootRestore = false; };
  const opts = { capture: true, passive: true, once: true };
  const target = typeof window === "undefined" ? null : window;
  let bound = [];
  if (target && typeof target.addEventListener === "function") {
    for (const ev of ["pointerdown", "keydown"]) {
      try { target.addEventListener(ev, drop, opts); bound.push(ev); } catch {   }
    }
  }
  return function () {
    for (const ev of bound) { try { target.removeEventListener(ev, drop, opts); } catch {   } }
    bound = [];
  };
}

let liveMountPending = null;
const LIVE_MOUNT_POLL_MS = 300;
function cancelLiveMount(reason) {
  const p = liveMountPending;
  if (!p) return;
  liveMountPending = null;
  if (p.timer) { try { clearTimeout(p.timer); } catch {   } }

  try {
    if (p.frame && !p.frame.isConnected) {
      p.frame.style.cssText = "position:fixed;left:-99999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
      (document.body || document.documentElement).appendChild(p.frame);
      p.frame.src = "about:blank";
      setTimeout(() => { try { p.frame.remove(); } catch {   } }, 1000);
    }
  } catch {   }
  if (reason) liveLog("boot-mount-cancel", "wid=" + p.sel.id + " reason=" + reason);
}

function liveFrameReady(frame, sel) {
  if (sel.type === "web") return Boolean(liveStateOf(frame));
  const st = liveStats(frame);
  return Boolean(st && st.running && st.fps > 0);
}

function liveHeartbeatAlive(frame, stats, wstate, isWeb) {
  return isWeb
    ? (wstate ? wstate.iframeLoaded === true : Boolean(stats))
    : Boolean(stats && stats.running && stats.fps > 0);
}

const liveHeartbeatReady = liveHeartbeatAlive;
function scheduleLiveMount(sel, frame, delayMs) {
  cancelLiveMount("replaced");
  const entry = { sel, frame, timer: 0, deadline: Date.now() + delayMs };
  liveMountPending = entry;
  const mount = (viaIdle) => {
    if (liveMountPending !== entry) return;
    const layer = document.getElementById(LAYER_ID);
    if (selection.id !== sel.id || !liveRenderEnabled(selection) || !layer) { cancelLiveMount("stale"); return; }
    if (frame.isConnected) { liveMountPending = null; return; }

    if (layer.querySelector("iframe.we-live-iframe")) { cancelLiveMount("layer-has-live"); return; }
    liveMountPending = null;
    layer.appendChild(frame);

    armDeferredLiveFrame(frame);

    if (!liveFrameDeferred(frame)) { try { startLiveWatch(frame, sel.id); } catch {   } }
    liveLog("boot-mount", "wid=" + sel.id + (viaIdle ? " idle" : " ready"));
  };
  const tick = () => {
    if (liveMountPending !== entry) return;
    if (liveFrameReady(frame, sel)) { mount(false); return; }
    if (Date.now() >= entry.deadline) {

      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => mount(true), { timeout: 2000 });
      } else {
        setTimeout(() => mount(true), 300);
      }
      return;
    }
    entry.timer = setTimeout(tick, LIVE_MOUNT_POLL_MS);
  };
  entry.timer = setTimeout(tick, Math.min(LIVE_MOUNT_POLL_MS, delayMs));
}

function createLiveFrame(sel) {
  const frame = document.createElement("iframe");
  const url = liveRenderUrl(sel);

  if (liveFrameShouldDefer()) {
    frame.dataset.weLiveSrc = url;
    liveLog("live-payload-defer", "wid=" + (sel && sel.id) + " 隐藏/未播放中 → 先不加载载荷（可见时补）", "info", true);
  } else {
    frame.src = url;
  }
  frame.setAttribute("frameborder", "0");
  frame.setAttribute("scrolling", "no");

  frame.setAttribute("allow", "autoplay");
  frame.className = "we-media we-iframe we-live-iframe";
  frame.addEventListener("load", () => {

    if (frame.isConnected && !liveFrameDeferred(frame)) startLiveWatch(frame, sel.id);
  });
  return frame;
}

let liveFrameCapturedFor = "";
function maybeCaptureLiveFrame(frame, sel) {
  if (sel.type !== "web" || !sel.liveFrame) return;
  if (liveFrameCapturedFor === String(sel.id)) return;
  liveFrameCapturedFor = String(sel.id);
  setTimeout(() => {
    if (!frame.isConnected || selection.id !== sel.id) return;
    let dataUrl;
    try {
      const wp = frame.contentWindow && frame.contentWindow.__wp;
      dataUrl = wp && typeof wp.capture === "function" ? wp.capture(1920) : null;
    } catch { return; }
    if (!dataUrl || dataUrl.indexOf("data:image/") !== 0) return;

    themeFollowOnFrameImage(dataUrl);

    apiFetch(dataUrl, { parse: false }).then((r) => r.response.blob()).then((blob) => apiFetch(sel.liveFrame, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: blob,
    })).then(() => {

      releaseFrameBytes(sel.liveFrame);

      const layer = document.getElementById(LAYER_ID);
      const poster = layer && layer.querySelector(".we-live-poster");
      if (poster && poster.style && !poster.dataset.weFrameApplied) {
        poster.dataset.weFrameApplied = "1";
        poster.style.backgroundImage = "url(" + sel.liveFrame + "?t=" + Date.now() + ")";
      }
      reportClientDiag("live-capture", "uploaded");
    }).catch((e) => { reportClientDiag("live-capture-fail", String(e && e.message || e)); });
  }, 3000);
}

export { liveFrameEl, buildLivePoster, scheduleLiveMount, cancelLiveMount, createLiveFrame, installLiveBootRestore, livePointerFrame, bootRestore };

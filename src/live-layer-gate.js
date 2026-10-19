const LAYER_PENDING_CLASS = "we-layer--pending";
let pendingReveal = null;

function noteLayerContent(el) {
  if (el && typeof el.__weContent === "function") el.__weContent();
}

function layerContentReady(node) {
  if (!node || typeof node.querySelector !== "function") return true;

  const poster = node.querySelector("div.we-live-poster");
  if (poster) {
    if (poster.style && String(poster.style.backgroundImage || "")) return true;
    if (poster.dataset && poster.dataset.weContent === "pending") {
      const liveNow = node.querySelector("iframe.we-live-iframe");
      return !!(liveNow && String(liveNow.className).indexOf("we-live-on") !== -1);
    }
    return true;
  }
  const img = node.querySelector("img");
  if (img) {

    if (img.__weReady === true) return true;
    return img.complete === true && Number(img.naturalWidth) > 0;
  }
  const video = node.querySelector("video");
  if (video) {

    const mirror = node.querySelector("canvas.we-media--canvas");
    if (mirror) return !!(mirror.dataset && mirror.dataset.weDrawn === "1");
    return videoContentReady(video);
  }
  const live = node.querySelector("iframe.we-live-iframe");
  if (live) return String(live.className).indexOf("we-live-on") !== -1;

  return true;
}
function forgetPendingReveal() {
  const p = pendingReveal;
  pendingReveal = null;
  if (!p) return p;
  for (const el of p.hooks) { try { el.__weContent = null; } catch {   } }

  try { if (p.stopPosterProbe) p.stopPosterProbe(); } catch {   }
  try { if (p.cancelStall) p.cancelStall(); } catch {   }
  return p;
}
function revealPendingLayer() {
  const p = forgetPendingReveal();
  if (!p) return;
  try { if (p.node.classList) p.node.classList.remove(LAYER_PENDING_CLASS); } catch {   }
  if (p.fade) {

    startLayerTransition(p.node, p.outgoing, p.tr);
  } else {

    retireFadingLayer();
  }

  liveLog("layer-reveal", "wid=" + selection.id + " 新层已有画面 → 放行（held="
    + Math.max(0, Date.now() - (p.armedAt || Date.now())) + "ms）");
}

function armLayerContentReveal(node, outgoing, tr, fade) {
  const recheck = () => { if (layerContentReady(node)) revealPendingLayer(); };

  const giveUp = () => revealPendingLayer();
  const hooks = [];
  const poster = node.querySelector("div.we-live-poster");
  if (poster) hooks.push(poster);
  const canvasEl = node.querySelector("canvas.we-media--canvas");
  if (canvasEl) hooks.push(canvasEl);
  for (const el of hooks) { try { el.__weContent = recheck; } catch {   } }
  const img = node.querySelector("img");
  if (img && typeof img.addEventListener === "function") {
    img.addEventListener("load", recheck);
    img.addEventListener("error", giveUp);
  }

  const video = node.querySelector("video");
  const videoReveal = armVideoChannelReveal(video, recheck, giveUp);
  try { if (node.classList) node.classList.add(LAYER_PENDING_CLASS); } catch {   }

  openRotationAudioGate(node, outgoing);
  pendingReveal = { node, outgoing, tr, fade, hooks, stopPosterProbe: videoReveal.cancelProbe, cancelStall: videoReveal.cancelStall, armedAt: Date.now() };

  const holdKind = weT(fade ? "过场" : "硬切");
  liveLog("layer-hold", "wid=" + selection.id + " 新层还没有画面 → 旧层留在屏上（"
    + holdKind + "延后到有画面）");
}

const LIVE_PIPELINE_KEY = "weLivePipeline";
let livePipelineChecked = false;
function livePipelineNow() {
  return { build: LIVE_DIAG_BUILD, media: (selection.inventory && selection.inventory.sceneMediaBase) ? 1 : 0 };
}

function rememberLivePipeline() {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(LIVE_PIPELINE_KEY, JSON.stringify(livePipelineNow()));
  } catch {   }
}

function livePipelineChanged() {
  let prev = null;
  try {
    if (typeof localStorage !== "undefined") prev = JSON.parse(localStorage.getItem(LIVE_PIPELINE_KEY) || "null");
  } catch { prev = null; }
  if (!prev || typeof prev !== "object") return "unknown";
  const now = livePipelineNow();
  if (String(prev.build || "") !== now.build) return "build";
  if (Number(prev.media) === 0 && now.media === 1) return "media";
  return "";
}

function migrateStaleLiveFailures() {
  if (livePipelineChecked) return;
  if (!selection.hostLoaded) return;
  livePipelineChecked = true;
  const keys = Object.keys(selection.sceneLiveFailures || {});
  if (!keys.length) { rememberLivePipeline(); return; }
  const why = livePipelineChanged();
  if (!why) { rememberLivePipeline(); return; }
  liveSessionFailures.clear();
  liveTransferAttempts.clear();
  prepareLiveTimeouts.clear();
  selection.sceneLiveFailures = {};
  rememberLivePipeline();
  liveLog("live-fail-memory-reset", "管线变了（" + why + "）→ 作废 " + keys.length
    + " 张壁纸的失败记忆（旧断言只对旧管线成立，这张壁纸会重新试一次 live）", "info");
  try { persistSelection(); } catch {   }
}

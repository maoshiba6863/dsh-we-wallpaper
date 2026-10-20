function nudgeWallpaperRepaint() {
  try {
    if (typeof document === "undefined" || !document) return;
    const node = document.getElementById(LAYER_ID);
    if (!node || !node.classList) return;
    node.classList.add("we-layer--repaint");
    const drop = () => { try { node.classList.remove("we-layer--repaint"); } catch {   } };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(drop));
    else if (typeof window !== "undefined" && window.setTimeout) window.setTimeout(drop, 32);
  } catch {   }
}

function onScreenBrief(node) {
  const n = node || (typeof document !== "undefined" && document ? document.getElementById(LAYER_ID) : null);
  if (!n) return "layer=-";
  let rect = "-";
  try {
    const r = n.getBoundingClientRect();
    rect = Math.round(r.width) + "x" + Math.round(r.height) + "@" + Math.round(r.left) + "," + Math.round(r.top);
  } catch {   }
  let leaf = "leaf=-";
  try {
    const el = n.querySelector("video.we-media") || n.querySelector("img.we-media")
      || n.querySelector("canvas.we-media--canvas") || n.querySelector("iframe.we-live-iframe");
    if (el) {
      const kind = String(el.tagName || "").toUpperCase();
      const dim = (w, h) => (Number(w) > 0 && Number(h) > 0 ? Math.round(w) + "x" + Math.round(h) : "-");
      const px = kind === "VIDEO" ? dim(el.videoWidth, el.videoHeight)
        : kind === "IMG" ? dim(el.naturalWidth, el.naturalHeight)
          : dim(el.clientWidth, el.clientHeight);
      leaf = "leaf=" + kind + " " + px + " rs=" + (el.readyState === undefined ? "-" : el.readyState)
        + " paused=" + (el.paused === undefined ? "-" : (el.paused ? 1 : 0));
    }
  } catch {   }
  return "rect=" + rect + " " + leaf + " mediaFrames=" + mediaFramesOf(n);
}

function retireFadingLayer() {
  const node = fadingLayerNode;
  if (!node) return;
  fadingLayerNode = null;
  releaseLayerMedia(node);
  try { node.remove(); } catch {   }

  releaseRotationAudioGateFor(node);
}

function scheduleFadingLayerRemoval(node, ms) {
  const hold = (typeof ms === "number" && ms > 0 ? ms : ROTATION_FADE_MS) + 100;
  if (typeof window === "undefined" || typeof window.setTimeout !== "function") {
    retireFadingLayer();
    return;
  }
  window.setTimeout(() => {
    if (fadingLayerNode !== node) return;
    fadingLayerNode = null;
    releaseLayerMedia(node);
    try { node.remove(); } catch {   }

    releaseRotationAudioGateFor(node);

    if (weDrawCtx && weDrawCtx.canvas && typeof node.contains === "function"
      && node.contains(weDrawCtx.canvas)) weStopDraw();
  }, hold);
}

function applyInlineStyle(node, style) {
  if (!node || !node.style) return;
  for (const k in style) {
    try { node.style[k] = style[k]; } catch {   }
  }
}
function startLayerTransition(node, outgoing, tr) {

  openRotationAudioGate(node, outgoing);

  try { outgoing.style.zIndex = "-3"; } catch {   }
  const frames = switchFrames(tr.id, tr.dir);
  applyInlineStyle(node, frames.inFrom);
  try { node.style.setProperty("--we-switch-ms", tr.ms + "ms"); } catch {   }
  node.className = "we-layer we-layer--switch";

  if (tr.id !== "fade") outgoing.className = "we-layer we-layer--switch we-layer--switch-out";
  void node.offsetWidth;
  applyInlineStyle(node, frames.inTo);
  applyInlineStyle(outgoing, frames.outTo);
  scheduleFadingLayerRemoval(outgoing, tr.ms);
  if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
    window.setTimeout(() => resetLayerSwitchStyles(node), tr.ms + 60);
  }
}
function mediaFramesOf(node) {
  try {
    const v = node && node.querySelector ? node.querySelector("video.we-media") : null;
    if (!v || typeof v.getVideoPlaybackQuality !== "function") return -1;
    const q = v.getVideoPlaybackQuality();
    return q && typeof q.totalVideoFrames === "number" ? q.totalVideoFrames : -1;
  } catch { return -1; }
}
function layerKeyDiff(oldKey, nextKey) {
  const a = String(oldKey || "").split("\u0000"), b = String(nextKey || "").split("\u0000");
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) out.push((LAYER_KEY_FIELDS[i] || "seg" + i) + ":" + keySegBrief(a[i]) + "→" + keySegBrief(b[i]));
  }
  return out.join(" | ") || weT("(同 key)");
}
function switchTransitionOf(selLike) {
  const id = selLike && SWITCH_TRANSITION_VALUES.includes(selLike.switchTransition)
    ? selLike.switchTransition : DEFAULTS.switchTransition;
  const def = SWITCH_TRANSITIONS.find((t) => t.id === id) || SWITCH_TRANSITIONS[0];
  const speed = SWITCH_SPEEDS.find((s) => s.id === (selLike && selLike.switchTransitionSpeed))
    || SWITCH_SPEEDS[1];
  const dir = selLike && SWITCH_DIRS.includes(selLike.switchTransitionDir)
    ? selLike.switchTransitionDir : DEFAULTS.switchTransitionDir;
  return {
    id,
    dir,
    directional: SWITCH_DIRECTIONAL.includes(id),
    ms: def.ms > 0 ? Math.max(60, Math.round(def.ms * speed.factor)) : 0,
  };
}

/* 自动轮播自己的过场：分组里存了 transition / transitionSpeed 就覆盖，
   否则回落到全局「切换过场」——手动切换永远只看全局，互不串台。 */
function rotationTransitionOf(selLike) {
  const group = typeof activeRotationGroup === "function" ? activeRotationGroup() : null;
  const rawId = group && typeof group.transition === "string" ? group.transition : "";
  if (!rawId || SWITCH_TRANSITION_VALUES.indexOf(rawId) < 0) return switchTransitionOf(selLike);
  const def = SWITCH_TRANSITIONS.find((t) => t.id === rawId) || SWITCH_TRANSITIONS[0];
  const rawSpeed = group && typeof group.transitionSpeed === "string" ? group.transitionSpeed : "";
  const speedId = SWITCH_SPEED_VALUES.indexOf(rawSpeed) >= 0 ? rawSpeed : (selLike && selLike.switchTransitionSpeed);
  const speed = SWITCH_SPEEDS.find((s) => s.id === speedId) || SWITCH_SPEEDS[1];
  const dir = selLike && SWITCH_DIRS.includes(selLike.switchTransitionDir)
    ? selLike.switchTransitionDir : DEFAULTS.switchTransitionDir;
  return {
    id: rawId,
    dir,
    directional: SWITCH_DIRECTIONAL.includes(rawId),
    ms: def.ms > 0 ? Math.max(60, Math.round(def.ms * speed.factor)) : 0,
  };
}
function releaseLayerMedia(node) {
  if (!node) return;
  const v = node.querySelector("video");
  if (v) {
    try { v.pause(); v.removeAttribute("src"); v.load(); } catch {   }
  }

  if (typeof node.querySelectorAll !== "function") return;
  for (const f of node.querySelectorAll("iframe")) {
    try { f.src = "about:blank"; } catch {   }
  }
}
function openRotationAudioGate(node, outgoing) {
  if (!node) return;
  rotationAudioGate = { node, outgoing: outgoing || null, released: false };
  muteNodeAudio(node);
  const live = liveFrameOf(node);
  if (live) {

    liveApplied.volume = null;
    setLiveVolumeNow(live, 0);
  }
  if (sceneAudioEl) {
    try { sceneAudioEl.volume = 0; sceneAudioEl.muted = true; sceneAudioEl.pause(); } catch {   }
  }
}

export {
  nudgeWallpaperRepaint,
  onScreenBrief,
  retireFadingLayer,
  startLayerTransition,
  layerKeyDiff,
  switchTransitionOf,
  releaseLayerMedia,
  openRotationAudioGate,
};

function weApplyAudio(video) {
  if (!video) return;
  const v = isAudioGated(video) ? 0 : weAudioVolume();
  try {
    video.volume = v;
    video.muted = v <= 0;
  } catch {   }
}

let rotationAudioGate = null;
function rotationAudioHoldActive() {
  return Boolean(rotationAudioGate && !rotationAudioGate.released);
}

function isAudioGated(el) {
  const gate = rotationAudioGate;
  if (!gate || gate.released || !el || !gate.node) return false;
  try { return gate.node === el || (typeof gate.node.contains === "function" && gate.node.contains(el)); } catch { return false; }
}
function layerMediaEls(node) {
  if (!node || typeof node.querySelectorAll !== "function") return [];
  try { return Array.prototype.slice.call(node.querySelectorAll("video, audio")); } catch { return []; }
}
function muteNodeAudio(node) {
  for (const el of layerMediaEls(node)) {
    try { el.volume = 0; el.muted = true; } catch {   }
  }
}
function liveFrameOf(node) {
  try {
    return (node && typeof node.querySelector === "function") ? node.querySelector("iframe.we-live-iframe") : null;
  } catch { return null; }
}
function setLiveVolumeNow(frame, volume) {
  if (!frame) return false;
  try {
    const wp = frame.contentWindow && frame.contentWindow.__wp;
    if (!wp || typeof wp.setVolume !== "function") return false;
    wp.setVolume(volume);
    liveApplied.volume = volume;
    return true;
  } catch { return false; }
}

function restoreNodeAudio(node) {

  if (node && node.isConnected !== false) {
    for (const el of layerMediaEls(node)) weApplyAudio(el);
    const live = liveFrameOf(node);
    if (live) { liveApplied.volume = null; applyLiveControls(live); }
  }

  try { syncSceneAudio(selection); } catch {   }
}

function releaseRotationAudioGateFor(outgoingNode) {
  const gate = rotationAudioGate;
  if (!gate || gate.released) return;
  if (gate.outgoing !== outgoingNode) return;
  gate.released = true;
  rotationAudioGate = null;
  restoreNodeAudio(gate.node);
}

function releaseRotationAudioGate() {
  const gate = rotationAudioGate;
  if (!gate) return;
  gate.released = true;
  rotationAudioGate = null;
  restoreNodeAudio(gate.node);
}

let sceneAudioEl = null;

function stopSceneAudioEl() {
  if (!sceneAudioEl) return;
  try {
    sceneAudioEl.pause();
    sceneAudioEl.removeAttribute("src");
    sceneAudioEl.load();
    sceneAudioEl.remove();
  } catch {   }
  sceneAudioEl = null;
}
function syncSceneAudio(selLike) {
  const wantUrl = (selLike && selLike.type === "scene" && selLike.sceneAudioUrl
    && !selLike.sceneVideo

    && !selLike.sceneLiveActive)
    ? selLike.sceneAudioUrl : null;
  if (!wantUrl) {
    stopSceneAudioEl();
    return;
  }
  if (!sceneAudioEl) {
    sceneAudioEl = document.createElement("audio");
    sceneAudioEl.loop = true;
    sceneAudioEl.preload = "auto";
    sceneAudioEl.setAttribute("aria-hidden", "true");
    try { document.body.appendChild(sceneAudioEl); } catch { sceneAudioEl = null; return; }
  }
  weApplyAudio(sceneAudioEl);
  if (sceneAudioEl.getAttribute("data-src") !== wantUrl) {
    sceneAudioEl.setAttribute("data-src", wantUrl);
    sceneAudioEl.src = wantUrl;
    weApplyAudio(sceneAudioEl);
  }

  if (rotationAudioHoldActive()) {
    try { sceneAudioEl.volume = 0; sceneAudioEl.muted = true; sceneAudioEl.pause(); } catch {   }
    return;
  }
  if (weAudioVolume() > 0) {
    const p = sceneAudioEl.play();
    if (p && typeof p.catch === "function") p.catch(() => {   });
  } else {
    try { sceneAudioEl.pause(); } catch {   }
  }
}

function applyVideoPlayback(video) {
  if (!video) return;
  watchVideoState(video);
  weApplyAudio(video);
  if (!isEffectivelyPlaying()) {
    try { video.pause(); } catch {   }
    syncVideoState(video);
    return;
  }
  if (!video.paused && !video.ended && !video.error) { syncVideoState(video); return; }
  if (playRefusalBlocks(video)) { syncVideoState(video); return; }
  let p;
  try { p = video.play(); } catch { p = null; }
  if (!p || typeof p.then !== "function") { syncVideoState(video); return; }
  p.then(
    () => {
      if (video.dataset) delete video.dataset.wePlayRefused;
      weApplyAudio(video);
      syncVideoState(video);
    },
    (err) => {

      if (video.dataset) video.dataset.wePlayRefused = (err && err.name) || "1";
      syncVideoState(video);
    },
  );
}

function codecLabel(codec) {
  return { avc1: "H.264", hvc1: "H.265", hev1: "H.265", av01: "AV1", vp09: "VP9", mp4v: "MPEG-4" }[codec] || codec;
}

const LAYER_KEY_FIELDS = ["type", "url", "edge", "sceneVideo", "audio", "live"];
function keySegBrief(v) {
  const t = String(v == null ? "" : v);
  return t ? (t.length > 46 ? "…" + t.slice(-44) : t) : "∅";
}

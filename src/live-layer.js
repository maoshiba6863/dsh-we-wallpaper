function liveRenderEnabled(selLike) {
  return Boolean(selLike && selLike.sceneLive !== false

    && !(selLike.sceneLiveFailures && selLike.sceneLiveFailures[String(selLike.id)])

    && !liveSessionFailures.has(String(selLike.id))
    && ((selLike.type === "scene" && selLike.sceneLiveSrc)
      || (selLike.type === "web" && selLike.webLiveSrc)));
}

const LIVE_FIRST_FRAME_MS = 15000;
const LIVE_STALL_TICKS = 20;

const LIVE_FAIL_LABELS = {
  get timeout() { return weT("首帧超时（{secs} 秒内无画面）", { secs: Math.round(LIVE_FIRST_FRAME_MS / 1000) }); },
  get stall() { return weT("运行中断（{secs} 秒无帧）", { secs: LIVE_STALL_TICKS }); },
  get load() { return weT("壁纸加载失败"); },

  get transfer() { return weT("载荷传输未完成（下载停滞）"); },
};

const liveSessionFailures = new Map();
function liveFailReasonOf(selLike) {
  const m = selLike && selLike.sceneLiveFailures;
  const v = m ? m[String(selLike && selLike.id)] : null;
  if (v) return LIVE_FAIL_LABELS[v] || weT("渲染失败");
  const soft = liveSessionFailures.get(String(selLike && selLike.id));
  return soft ? (LIVE_FAIL_LABELS[soft] || weT("渲染失败")) : "";
}

const SCENE_LIVE_FIT = { cover: "cover", contain: "contain", center: "contain", fill: "stretch" };

const SCENE_FILES_PATH = "/wallpaper-engine/scene-files";

const SCENE_PAYLOAD_PROGRESS_PATH = "/scene-payload-progress";

function originIsRemoteHttp(origin) {
  try {
    const u = new URL(String(origin || ""));
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const h = u.hostname;
    return !(h === "127.0.0.1" || h === "localhost" || h === "[::1]" || h === "::1" || h === "0.0.0.0");
  } catch { return false; }
}

function resolveSceneMediaBase() {
  const hostSceneBase = selection.inventory && selection.inventory.sceneMediaBase;
  if (typeof hostSceneBase === "string" && hostSceneBase && !originIsRemoteHttp(typeof location !== "undefined" ? location.origin : "")) {
    return hostSceneBase;
  }
  return typeof location !== "undefined" && location.origin ? location.origin : "";
}
function liveRenderUrl(selLike) {
  const isWeb = selLike.type === "web";

  const webEntry = String(selLike.webLiveSrc || "");
  const src = isWeb
    ? (/^https?:\/\//i.test(webEntry) ? webEntry : location.origin + webEntry)
    : selLike.sceneLiveSrc;
  const fit = SCENE_LIVE_FIT[selLike.objectFit] || "cover";
  const fps = SCENE_LIVE_FPS_VALUES.includes(selLike.sceneLiveFps) ? selLike.sceneLiveFps : 30;
  const muted = weAudioVolume() > 0 ? "false" : "true";

  const mediaBase = (isWeb ? (typeof location !== "undefined" && location.origin ? location.origin : "") : resolveSceneMediaBase())
    + SCENE_FILES_PATH;
  return "/wallpaper-engine/scene-live/index.html?type=" + (isWeb ? "web" : "scene")

    + (isWeb ? "&webSandbox=strict" : "")
    + "&fit=" + fit + "&sceneFps=" + fps + "&muted=" + muted

    + (selection.inventory && selection.inventory.weAssetsAvailable ? "&localAssets=1" : "")
    + "&src=" + encodeURIComponent(src)
    + "&mediaBase=" + encodeURIComponent(mediaBase);
}

const liveApplied = { frame: null, playing: null, volume: null, fit: null };
function applyLiveControls(frame) {
  if (!frame) return;
  let wp;
  try { wp = frame.contentWindow && frame.contentWindow.__wp; } catch { return; }
  if (!wp) return;

  if (liveApplied.frame !== frame) {
    liveApplied.frame = frame;
    liveApplied.playing = null;
    liveApplied.volume = null;
    liveApplied.fit = null;
  }
  try {
    const playing = isEffectivelyPlaying();
    if (liveApplied.playing !== playing) {
      if (playing) wp.resume(); else wp.pause();
      liveApplied.playing = playing;
    }

    const volume = rotationAudioHoldActive() ? 0 : weAudioVolume();
    if (liveApplied.volume !== volume && typeof wp.setVolume === "function") {
      wp.setVolume(volume);
      liveApplied.volume = volume;
    }
    const fit = SCENE_LIVE_FIT[selection.objectFit] || "cover";
    if (liveApplied.fit !== fit && typeof wp.setFit === "function") {
      wp.setFit(fit);
      liveApplied.fit = fit;
    }
  } catch {   }
}

function layerWantKey(layerLive) {
  return selection.type + "\u0000" + selection.url + "\u0000"
    + (IS_EDGE && selection.edgeCompat !== false ? "canvas" : "video")

    + "\u0000" + (layerLive ? "" : (selection.sceneVideo || ""))
    + "\u0000" + (selection.sceneAudioUrl || "")

    + "\u0000" + ((selection.type === "scene" || selection.type === "web")
      ? (layerLive

        ? "live\u0000" + (selection.sceneLiveSrc || selection.webLiveSrc) + "\u0000" + selection.sceneLiveFps
          + "\u0000" + (selection.inventory && selection.inventory.weAssetsAvailable ? "la1" : "")
          + "\u0000" + ((selection.inventory && selection.inventory.sceneMediaBase) || "")
        : "nolive")
      : "");
}

function obtainLayerNode(wantKey) {
  let node = document.getElementById(LAYER_ID);

  if (node && node.dataset && node.dataset.weFading === "1") node = null;
  if (!node && pendingStagedLayerNode) {

    node = pendingStagedLayerNode;
    pendingStagedLayerNode = null;
    node.id = LAYER_ID;
    node.dataset.weKey = wantKey;
    node.dataset.weWid = String(selection.id || "");
    node.className = "we-layer";
    const adoptedLive = node.querySelector && node.querySelector("iframe.we-live-iframe");
    if (adoptedLive) {

      try { adoptedLive.classList.add("we-live-on"); } catch {   }

      liveLog("adopt-live", "wid=" + selection.id + " 节点级领养（渲染页不重载）");
      if (!liveFrameDeferred(adoptedLive)) { try { startLiveWatch(adoptedLive, selection.id); } catch {   } }
    }
  }
  if (!node) {
    node = document.createElement("div");
    node.id = LAYER_ID;
    node.className = "we-layer";
    node.dataset.weKey = wantKey;
    node.dataset.weWid = String(selection.id || "");
    const built = buildMedia(selection);
    if (Array.isArray(built)) for (const el of built) node.appendChild(el);
    else node.appendChild(built);
    document.body.appendChild(node);
  }
  return node;
}

function disposeOutgoingLayer(node, outgoing, switchTr, startFade) {
  if (outgoing) {
    if (layerContentReady(node)) {
      if (startFade) startLayerTransition(node, outgoing, switchTr);
      else {

        retireFadingLayer();
        weStopDraw();
      }
    } else {
      armLayerContentReveal(node, outgoing, switchTr, startFade);
    }
  }
}

function syncScrimElement() {

  const scrim = document.getElementById(SCRIM_ID);
  if (selection.url) {
    if (!scrim) {
      const s = document.createElement("div");
      s.id = SCRIM_ID;
      s.className = "we-scrim";
      document.body.appendChild(s);
    }
    setWallpaperActive(true);
  } else {
    if (scrim) scrim.remove();
    setWallpaperActive(false);
  }
}

function syncSceneFrameProbe() {

  if (selection.type === "scene" && selection.sceneFrameUrl) {
    try { probeGpuFrameState(selection.sceneFrameUrl, false); } catch {   }
  }
}

function reclaimLayerAdoptionSlot() {

  disposePreparedMedia();
}

function syncLayers() {

  migrateStaleLiveFailures();

  const rotationFade = pendingRotationFade;
  pendingRotationFade = false;

  let existing = document.getElementById(LAYER_ID);
  if (selection.url) {

    const layerLive = (selection.type === "scene" || selection.type === "web") && liveRenderEnabled(selection);

    const switchTr = rotationFade ? rotationTransitionOf(selection) : switchTransitionOf(selection);
    const wantKey = layerWantKey(layerLive);
    let gotKey = existing && existing.dataset.weKey;

    if (pendingReveal && pendingReveal.node === existing && gotKey !== wantKey) {
      const blank = existing;
      existing = pendingReveal.outgoing || null;
      forgetPendingReveal();
      stopLiveWatch();
      releaseLayerMedia(blank);
      try { blank.remove(); } catch {   }
      gotKey = existing && existing.dataset.weKey;
      if (existing) {

        try { existing.dataset.weFading = ""; } catch {   }
        fadingLayerNode = null;
        try { existing.id = LAYER_ID; } catch {   }
        const heldLive = existing.querySelector("iframe.we-live-iframe");

        if (heldLive && !liveFrameDeferred(heldLive)) { try { startLiveWatch(heldLive, selection.id); } catch {   } }
      }
    }
    let startFade = false;
    let outgoing = null;
    if (existing && gotKey !== wantKey) {
      liveLog("layer-rebuild", layerKeyDiff(gotKey, wantKey) + " " + liveStateBrief());

      const widChanged = String(existing.dataset.weWid || "") !== String(selection.id || "");

      startFade = (rotationFade || widChanged) && switchTr.id !== "cut";
      outgoing = existing;

      outgoing.dataset.weFading = "1";
      try { outgoing.id = ""; } catch {   }

      if (fadingLayerNode && fadingLayerNode !== outgoing) retireFadingLayer();
      fadingLayerNode = outgoing;

      stopLiveWatch();
    }
    const node = obtainLayerNode(wantKey);

    disposeOutgoingLayer(node, outgoing, switchTr, startFade);
    const canvas = node.querySelector("canvas.we-media--canvas");
    const video = node.querySelector("video");

    refreshUnderlayColor();
    scheduleUnderlaySample(node);

    const liveFrame = node.querySelector("iframe.we-live-iframe");
    if (liveFrame) {

      armDeferredLiveFrame(liveFrame);
      applyLiveControls(liveFrame);
      ensureLivePointer(liveFrame);

      const watchHere = liveWatch;
      if (!selection.sceneLiveActive && watchHere && watchHere.frame === liveFrame
          && liveFrame.isConnected && !liveFrameDeferred(liveFrame)
          && isEffectivelyPlaying()
          && liveHeartbeatReady(liveFrame, liveStats(liveFrame), liveStateOf(liveFrame), selection.type === "web")) {
        selection.sceneLiveActive = true;
        liveLog("live-rearm", "wid=" + selection.id + " 领养后补挂激活态（指针注入 / 媒体桥恢复）", "info");
      }
    }

    if (canvas && video) {
      const sameDraw = weDrawCtx && weDrawCtx.canvas === canvas && weDrawCtx.video === video;
      if (!sameDraw) weStartDraw(canvas, video, canvas.className.indexOf("we-media--fit") !== -1);
    }
    if (video) {

      applyVideoPlayback(video);

      try { if (video.playbackRate !== selection.playbackRate) video.playbackRate = selection.playbackRate; } catch {   }

      videoChannelAfterLayerBuild(video, selection);
    } else if (selection.videoPlaying === false || selection.videoError) {

      selection.videoPlaying = true;
      selection.videoError = "";
    }
  } else if (existing) {
    weStopDraw();
    stopLiveWatch();

    forgetPendingReveal();
    retireFadingLayer();
    releaseLayerMedia(existing);
    existing.remove();

    clearUnderlayColor();
  }
  if (!selection.url) {
    disposePreparedMedia();
    if (pendingStagedLayerNode) {
      const div = pendingStagedLayerNode;
      pendingStagedLayerNode = null;
      try {
        const f = div.querySelector && div.querySelector("iframe");
        if (f) disposeMediaEl(f);
      } catch {   }
      try { div.remove(); } catch {   }
    }
  }

  syncScrimElement();

  syncSceneFrameProbe();

  reclaimLayerAdoptionSlot();
}

function resetLayerSwitchStyles(node) {
  if (!node) return;
  try { node.className = "we-layer"; } catch {   }
  try {
    node.style.transform = "";
    node.style.opacity = "";
    node.style.clipPath = "";
    node.style.removeProperty("--we-switch-ms");
  } catch {   }
}

function toggleLiveDiag() {
  liveDiagOn = !liveDiagVerbose();
  liveLog("diag-" + (liveDiagOn ? "on" : "off"),
    liveDiagOn ? "逐秒心跳日志已开启（本会话有效，刷新后失效）" : "逐秒心跳日志已关闭");
  return liveDiagOn;
}

export {
  liveRenderEnabled, liveRenderUrl, liveFailReasonOf, applyLiveControls, liveApplied, LIVE_FIRST_FRAME_MS, syncLayers, toggleLiveDiag,
};

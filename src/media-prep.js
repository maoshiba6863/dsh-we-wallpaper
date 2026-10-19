function beginRotationPrepare(excluded) {
  cancelRotationPrepare();

  if (typeof document !== "undefined" && document.hidden) { deferRotationWhileHidden("rotation-defer"); return; }
  const next = rotationNextCandidate(excluded);
  liveLog("rotation-fire", "当前 " + (selection.id || "-") + " → 候选 " + (next ? next.id : weT("无"))
    + " 候选池 " + rotationCandidates().length + " " + liveStateBrief());

  if (!next) { syncRotationTimer(); return; }
  const prep = {
    id: next.id, fromId: selection.id, excluded,
    cancelled: false, settled: false, timers: [], staged: null, probeMedia: null,
  };
  rotationPrep = prep;
  const onReady = () => {
    if (prep.cancelled || prep.settled || rotationPrep !== prep) return;
    prep.settled = true;
    commitRotationSwitch(prep);
  };
  const onFail = () => {
    if (prep.cancelled || prep.settled || rotationPrep !== prep) return;
    prep.settled = true;

    rotationPrep = null;
    prep.cancelled = true;
    for (const t of prep.timers) { try { clearTimeout(t); } catch {   } }
    prep.timers = [];
    releaseProbeMedia(prep);
    excluded.add(next.id);
    beginRotationPrepare(excluded);
  };
  prepareWallpaper(next, prep, onReady, onFail);
}

function prepTimeout(prep, fn, ms) {
  if (typeof window === "undefined" || typeof window.setTimeout !== "function") return null;
  const t = window.setTimeout(() => {
    if (prep.cancelled || prep.settled || rotationPrep !== prep) return;
    fn();
  }, ms || ROTATION_PREP_TIMEOUT_MS);
  prep.timers.push(t);
  return t;
}

function prepareWallpaper(w, prep, onReady, onFail) {
  if (!w) { onFail(); return; }
  if (w.type === "image") {
    prep.kind = "image";

    if (typeof Image !== "function") { onReady(); return; }
    const img = new Image();
    prep.probeMedia = img;
    img.onload = () => { adoptProbe(prep, { ready: true }); onReady(); };
    img.onerror = () => { releaseProbeMedia(prep); onFail(); };
    prepTimeout(prep, () => { adoptProbe(prep); onReady(); });
    img.alt = "";
    img.draggable = false;
    img.className = "we-media we-media--fit";
    img.src = w.media;
    return;
  }
  if (w.type === "video") {
    prep.kind = "video";

    onReady();
    return;
  }
  if (w.type === "scene") {

    const liveSel = {
      type: "scene", id: w.id,
      sceneLiveSrc: w.sceneLiveSrc || null,
      objectFit: selection.objectFit,
      sceneLiveFps: selection.sceneLiveFps,
      sceneLive: selection.sceneLive,
      sceneLiveFailures: selection.sceneLiveFailures,
    };
    if (liveRenderEnabled(liveSel) && !prepareLiveExhausted(w.id)) {
      prepareSceneLiveStage(w, prep, onReady, () => {
        if (w.sceneVideo) {
          prep.kind = "sceneVideo";
          prepareVideoProbe(w.sceneVideo, w.frameUrl || w.preview, prep, onReady,
            () => prepareSceneStaticStage(w, prep, onReady, onFail));
          return;
        }
        prepareSceneStaticStage(w, prep, onReady, onFail);
      });
      return;
    }
    if (w.sceneVideo) {
      prep.kind = "sceneVideo";
      prepareVideoProbe(w.sceneVideo, w.frameUrl || w.preview, prep, onReady,
        () => prepareSceneStaticStage(w, prep, onReady, onFail));
      return;
    }
    prepareSceneStaticStage(w, prep, onReady, onFail);
    return;
  }

  const webLiveSel = {
    type: "web", id: w.id,
    webLiveSrc: w.webLiveSrc || null,
    objectFit: selection.objectFit,
    sceneLiveFps: selection.sceneLiveFps,
    sceneLive: selection.sceneLive,
    sceneLiveFailures: selection.sceneLiveFailures,
  };
  if (liveRenderEnabled(webLiveSel) && !prepareLiveExhausted(w.id)) {
    prepareSceneLiveStage(w, prep, onReady, () => prepareWebProbe(w, prep, onReady));
    return;
  }
  prep.kind = "web";
  prepareWebProbe(w, prep, onReady);
}

function prepareVideoProbe(url, posterUrl, prep, onReady, onFail) {
  if (!url || typeof document === "undefined" || typeof document.createElement !== "function") { onReady(); return; }
  const v = document.createElement("video");

  if (!v || typeof v.addEventListener !== "function") { onReady(); return; }
  prep.probeMedia = v;
  const onCanplay = () => { adoptProbe(prep, { ready: true }); onReady(); };
  const onErr = () => { releaseProbeMedia(prep); onFail(); };
  v.__weCanplay = onCanplay;
  v.__weError = onErr;
  v.addEventListener("canplay", onCanplay, { once: true });
  v.addEventListener("error", onErr, { once: true });
  prepTimeout(prep, () => { adoptProbe(prep); onReady(); });
  try {
    v.muted = true;
    v.loop = true;
    v.autoplay = true;
    v.preload = "auto";
    v.setAttribute("playsinline", "");
    if (posterUrl) v.poster = posterUrl;
    v.className = "we-media we-media--fit";
    v.src = url;
    v.load();

    const p = typeof v.play === "function" ? v.play() : null;
    if (p && typeof p.catch === "function") p.catch(() => {   });
  } catch { adoptProbe(prep); onReady(); }
}

function prepareWebProbe(w, prep, onReady) {
  if (!w.media || typeof document === "undefined" || typeof document.createElement !== "function") { onReady(); return; }
  const f = document.createElement("iframe");
  if (!f || typeof f.addEventListener !== "function") { onReady(); return; }
  prep.probeMedia = f;
  const onLoad = () => { adoptProbe(prep, { ready: true }); onReady(); };
  f.__weLoad = onLoad;
  f.addEventListener("load", onLoad, { once: true });
  prepTimeout(prep, () => { adoptProbe(prep); onReady(); });
  try {
    f.setAttribute("frameborder", "0");
    f.setAttribute("scrolling", "no");

    f.setAttribute("sandbox", "allow-scripts");
    f.className = "we-media we-iframe";
    const div = document.createElement("div");
    div.className = "we-layer we-layer--staging";
    prep.staged = { div };
    div.appendChild(f);
    document.body.appendChild(div);
    f.src = w.media;
  } catch { adoptProbe(prep); onReady(); }
}

const PREPARE_LIVE_TIMEOUT_LIMIT = 2;

const PREPARE_LIVE_HIDDEN_HOLD_MAX_MS = 60000;

const PREPARE_LIVE_HIDDEN_POLL_MS = 2000;
const prepareLiveTimeouts = new Map();
function prepareLiveExhausted(wid) {
  return (prepareLiveTimeouts.get(String(wid || "")) || 0) >= PREPARE_LIVE_TIMEOUT_LIMIT;
}
function notePrepareLiveTimeout(wid) {
  const key = String(wid || "");
  if (!key) return;
  const n = (prepareLiveTimeouts.get(key) || 0) + 1;
  prepareLiveTimeouts.set(key, n);
  if (n === PREPARE_LIVE_TIMEOUT_LIMIT) {

    try {
      liveLog("prep-live-timeout",
        "wid=" + key + " 连续 " + n + " 次超时 → 本会话对该壁纸改用 sceneVideo/静态帧", "warn");
    } catch {   }
  }
}
function clearPrepareLiveTimeout(wid) {
  const key = String(wid || "");
  if (key) prepareLiveTimeouts.delete(key);
}

function prepareSceneLiveStage(w, prep, onReady, onFail) {
  prep.kind = "live";
  if (typeof document === "undefined" || typeof document.createElement !== "function"
    || typeof window === "undefined" || typeof window.setTimeout !== "function") { onFail(); return; }
  const f = document.createElement("iframe");

  if (!f || typeof f.addEventListener !== "function") { onReady(); return; }
  const probeSel = {
    type: w.type, id: w.id,
    sceneLiveSrc: w.sceneLiveSrc || null,
    webLiveSrc: w.webLiveSrc || null,
    objectFit: selection.objectFit,
    sceneLiveFps: selection.sceneLiveFps,
    sceneLive: selection.sceneLive,
    sceneLiveFailures: selection.sceneLiveFailures,
  };
  if (!liveRenderEnabled(probeSel)) { onFail(); return; }
  const div = document.createElement("div");
  div.className = "we-layer we-layer--staging";
  f.setAttribute("frameborder", "0");
  f.setAttribute("scrolling", "no");
  f.setAttribute("allow", "autoplay");
  f.className = "we-media we-iframe we-live-iframe";
  f.src = liveRenderUrl(probeSel);
  prep.staged = { div };
  prep.probeMedia = f;
  div.appendChild(f);
  document.body.appendChild(div);
  let startedAt = Date.now();
  let heldHidden = (typeof document !== "undefined" && document.hidden);
  const bail = (noStrike) => {
    if (prep.staged && prep.staged.div) { try { prep.staged.div.remove(); } catch {   } }
    prep.staged = null;
    releaseProbeMedia(prep);

    if (!noStrike) notePrepareLiveTimeout(w.id);
    onFail();
  };
  const poll = () => {
    const st = liveStats(f);
    if (st && st.running && st.fps > 0) {
      clearPrepareLiveTimeout(w.id);
      liveLog("prep-live-ready", "wid=" + w.id + " 用时 " + (Date.now() - startedAt) + "ms");
      adoptProbe(prep, { ready: true });
      onReady();
      return;
    }

    if (typeof document !== "undefined" && document.hidden) {
      const now = Date.now();
      heldHidden = true;
      const hiddenFor = pageHiddenSince ? (now - pageHiddenSince) : 0;
      if (hiddenFor > PREPARE_LIVE_HIDDEN_HOLD_MAX_MS) {
        liveLog("prep-live-bail-hidden", "wid=" + w.id + " 隐藏已持续 " + hiddenFor + "ms → 释放 staging，转为可见时补做（不计超时）");
        deferRotationWhileHidden("rotation-defer");

        cancelRotationPrepare();
        return;
      }
      startedAt = now;
      prepTimeout(prep, poll, PREPARE_LIVE_HIDDEN_POLL_MS);
      return;
    }
    if (heldHidden) { heldHidden = false; startedAt = Date.now(); }
    if (Date.now() - startedAt > LIVE_FIRST_FRAME_MS) {
      liveLog("prep-live-bail", "wid=" + w.id + " 超时 " + (Date.now() - startedAt) + "ms，回退下一阶段");
      bail();
      return;
    }
    prepTimeout(prep, poll, 500);
  };
  prepTimeout(prep, poll, 300);
}

function prepareSceneStaticStage(w, prep, onReady, onFail) {
  prep.kind = "static";
  if (typeof Image !== "function") { onReady(); return; }
  const tryPreview = () => {
    if (!w.preview) { onFail(); return; }
    const p = new Image();
    prep.probeMedia = p;
    p.onload = () => { adoptProbe(prep, { ready: true }); onReady(); };
    p.onerror = () => { releaseProbeMedia(prep); onFail(); };
    p.alt = "";
    p.draggable = false;
    p.className = "we-media we-media--fit";
    p.src = w.preview;
  };
  if (!w.frameUrl) { tryPreview(); return; }

  const savedVariant = Number(selection.frameVariants && selection.frameVariants[String(w.id)]) || 0;
  const frameSrc = frameUrlWithVariant(w.frameUrl, savedVariant);
  const img = new Image();
  prep.probeMedia = img;
  img.onload = () => { adoptProbe(prep, { ready: true }); onReady(); };
  img.onerror = () => { releaseProbeMedia(prep); tryPreview(); };
  prepTimeout(prep, () => { adoptProbe(prep); onReady(); });
  img.alt = "";
  img.draggable = false;
  img.className = "we-media we-media--fit";
  img.src = frameSrc;
}

function applySelection(id, opts) {

  if (id && opts && opts.fromManual
      && typeof skinYieldActive === "function" && skinYieldActive()) {
    exitSkinYield("manual-pick", { skipRestore: true });
  }
  reportClientDiag("apply", "id=" + String(id || "").slice(0, 40));

  if (!opts || !opts.fromRotation) { cancelRotationPrepare(); disposePreparedMedia(); }

  if (opts && opts.fromManual) clearLiveFailure(id);

  cancelLiveFrameBackfill();

  const idChanged = selection.id !== (id || "");
  if (idChanged) cancelLiveMount("selection");

  if (!opts || !opts.fromRotation) releaseRotationAudioGate();
  selection.id = id || "";
  persistSelection();
  if (!selection.id) {
    selection.blockedNote = "";
    selection.url = null;
    selection.type = null;
    selection.previewUrl = null;
    selection.mediaExt = null;
    selection.liveFrame = null;
    selection.sceneVideo = null;
    selection.sceneLiveSrc = null;
    selection.webLiveSrc = null;
    selection.propsUrl = null;
    selection.sceneLiveActive = false;
    selection.sceneAudioUrl = null;
    selection.sceneHasAudio = false;
    selection.schemeColor = null;
    selection.mediaInfo = null;
    selection.transcodeState = "idle";
    invalidateMediaInfoProbe();
    abortTranscodeUpgrade();
    syncSceneAudio(selection);
    syncRotationTimer();

    themeFollowRelease();
    emit();
    return;
  }
  const w = selection.inventory.wallpapers.find((x) => x.id === selection.id);

  if (!w || !keepPlayingWallpaper(w, selection.contentRatingFilter)) {

    selection.blockedNote = selectionBlockedNote(w);
    selection.url = null;
    selection.type = null;
    selection.previewUrl = null;
    selection.mediaExt = null;
    selection.liveFrame = null;
    selection.sceneVideo = null;
    selection.sceneLiveSrc = null;
    selection.webLiveSrc = null;
    selection.propsUrl = null;
    selection.sceneLiveActive = false;
    selection.sceneAudioUrl = null;
    selection.sceneHasAudio = false;
    selection.schemeColor = null;
    selection.mediaInfo = null;
    selection.transcodeState = "idle";
    invalidateMediaInfoProbe();
    abortTranscodeUpgrade();
    syncSceneAudio(selection);
    syncRotationTimer();
    emit();
    return;
  }
  const savedVariant = Number(selection.frameVariants && selection.frameVariants[String(w.id)]) || 0;
  selection.url = w.type === "scene" ? frameUrlWithVariant(w.frameUrl, savedVariant) : w.media;

  if (w.hasCustomFrame) {
    const cf = Object.assign({}, selection.customFrames || {});
    cf[String(w.id)] = true;
    selection.customFrames = cf;
  }
  selection.type = w.type;

  selection.mediaExt = w.mediaExt || null;
  selection.blockedNote = "";

  selection.sceneFrameUrl = w.type === "scene" ? (w.frameUrl || null) : null;

  selection.sceneVideo = w.type === "scene" ? (w.sceneVideo || null) : null;

  if (opts && opts.fromRotation && w.type === "scene" && opts.kind === "static") {
    selection.sceneVideo = null;
  }

  selection.sceneLiveSrc = w.type === "scene" && w.sceneLive && w.sceneLiveSrc ? w.sceneLiveSrc : null;

  selection.webLiveSrc = w.type === "web" && w.webLive && w.webLiveSrc ? w.webLiveSrc : null;

  selection.propsUrl = (w.type === "scene" || w.type === "web") && w.propsUrl ? w.propsUrl : null;

  if (idChanged) selection.sceneLiveActive = false;

  selection.sceneAudioUrl = w.type === "scene" && w.sceneAudio ? w.sceneAudio : null;
  selection.sceneHasAudio = false;
  if (selection.sceneAudioUrl) {
    const probeUrl = selection.sceneAudioUrl;
    apiHead(probeUrl).then((r) => {
      if (r.ok && selection.sceneAudioUrl === probeUrl) {
        selection.sceneHasAudio = true;
        try { emit(); } catch {   }
      }
    }).catch(() => {   });
  }

  selection.previewUrl = w.preview || null;

  selection.liveFrame = w.type === "web" && w.liveFrame ? w.liveFrame : null;

  selection.schemeColor = w.schemeColor || null;
  selection.transcodeState = "idle";

  selection.mediaInfo = null;
  abortTranscodeUpgrade();
  refreshMediaInfo();
  syncRotationTimer();
  emit();

  themeFollowOnWallpaper(selection, { fromSkinRestore: !!(opts && opts.fromSkinRestore) });
}
function buildMedia(sel) {

  const isLive = (sel.type === "scene" || sel.type === "web") && liveRenderEnabled(sel);
  const isSceneVideo = sel.type === "scene" && Boolean(sel.sceneVideo) && !isLive;
  const isStill = sel.type === "image" || (sel.type === "scene" && !isLive && !isSceneVideo);
  if (isLive) {
    reportClientDiag("live-build", "type=" + sel.type + " delay=" + sel.liveBootDelay + " boot=" + bootRestore);

    liveLog("build-live", "wid=" + sel.id + " 冷启动渲染页（重新加载） " + liveStateBrief());
    const poster = buildLivePoster(sel);
    const frame = createLiveFrame(sel);

    const delaySecs = clampNum(sel.liveBootDelay, 0, 30, 3);
    const delayMs = bootRestore && delaySecs > 0 ? delaySecs * 1000 : 0;
    if (delayMs <= 0) return [poster, frame];
    reportClientDiag("live-delayed", "ms=" + delayMs);
    scheduleLiveMount(sel, frame, delayMs);
    return poster;
  }

  const fitClass = " we-media--fit";
  let media;
  if (sel.type === "video") {

    const builtVideo = buildVideoMedia(sel, fitClass);
    if (Array.isArray(builtVideo)) return builtVideo;
    media = builtVideo;
  } else if (isSceneVideo) {

    const prepared = consumePreparedMedia("VIDEO", sel.sceneVideo);
    media = prepared || document.createElement("video");
    if (!prepared) {
      media.src = sel.sceneVideo;
      media.poster = sel.url;
    }
    media.autoplay = true;
    media.loop = true;
    media.setAttribute("playsinline", "");
    media.className = "we-media" + fitClass;

    media.addEventListener("error", () => {
      if (selection.sceneVideo) {
        selection.sceneVideo = null;
        try { syncLayers(); syncSceneAudio(selection); emit(); } catch {   }
      }
    });
  } else if (isStill) {
    const prepared = consumePreparedMedia("IMG", sel.url);
    media = prepared || document.createElement("img");
    if (!prepared) media.src = sel.url;
    media.alt = "";
    media.draggable = false;
    media.className = "we-media" + fitClass;

    if (sel.type === "scene" && sel.previewUrl) {
      media.onerror = () => {
        if (media.src !== sel.previewUrl) media.src = sel.previewUrl;
      };
    }
  } else {

    media = document.createElement("iframe");
    media.src = sel.url;
    media.setAttribute("frameborder", "0");
    media.setAttribute("scrolling", "no");

    media.setAttribute("sandbox", "allow-scripts");
    media.className = "we-media we-iframe";
  }
  return media;
}

export {
  applySelection, buildMedia, beginRotationPrepare, prepareLiveTimeouts,
  clearPrepareLiveTimeout,
};

const VIDEO_POSTER_BUDGET_MS = 1200;
const VIDEO_STALL_GIVE_UP_MS = 15000;
const VIDEO_WARM_TTL_MS = 20000;
const VIDEO_WARM_HOVER_MS = 120;
let videoWarm = null;
let warmHoverTimer = 0;
function disposeWarmVideo() {
  const w = videoWarm;
  videoWarm = null;
  if (warmHoverTimer && typeof clearTimeout === "function") {
    try { clearTimeout(warmHoverTimer); } catch {   }
    warmHoverTimer = 0;
  }
  if (!w) return;
  if (w.timer && typeof clearTimeout === "function") { try { clearTimeout(w.timer); } catch {   } }
  try { w.el.removeAttribute("src"); w.el.load(); } catch {   }
}
function warmVideoUrl(url) {
  const u = String(url || "");
  if (!u || typeof document === "undefined" || typeof document.createElement !== "function") return;
  if (videoWarm && videoWarm.url === u) return;
  disposeWarmVideo();
  let el;
  try { el = document.createElement("video"); } catch { return; }
  if (!el || typeof el.load !== "function") return;
  try {
    el.preload = "metadata";
    el.muted = true;
    el.loop = true;
    el.autoplay = false;
    el.setAttribute("playsinline", "");
    el.src = u;
  } catch { return; }
  const timer = typeof setTimeout === "function" ? setTimeout(() => {
    if (videoWarm && videoWarm.el === el) disposeWarmVideo();
  }, VIDEO_WARM_TTL_MS) : 0;
  videoWarm = { url: u, el, timer };
  liveLog("video-warm", "预热（仅元数据，不解码） " + u.slice(Math.max(0, u.lastIndexOf("/") + 1)).slice(-24));
}
function consumeWarmVideo(url) {
  const w = videoWarm;
  if (!w || w.url !== String(url || "")) return null;
  videoWarm = null;
  if (w.timer && typeof clearTimeout === "function") { try { clearTimeout(w.timer); } catch {   } }
  liveLog("video-warm", "领养预热元素 " + String(w.el.readyState === undefined ? "-" : w.el.readyState) + " rs");
  return w.el;
}
function warmVideoForPointer(ev, immediate) {
  try {
    const t = ev && ev.target;
    const card = t && typeof t.closest === "function" ? t.closest("[data-we-id]") : null;
    const id = card && typeof card.getAttribute === "function" ? String(card.getAttribute("data-we-id") || "") : "";
    if (warmHoverTimer && typeof clearTimeout === "function") {
      try { clearTimeout(warmHoverTimer); } catch {   }
    }
    warmHoverTimer = 0;
    if (!id) return;
    const list = (selection.inventory && selection.inventory.wallpapers) || [];
    const w = list.find((x) => x && String(x.id) === id);
    if (!w || w.type !== "video" || !w.media) return;
    if (immediate || typeof setTimeout !== "function") { warmVideoUrl(w.media); return; }
    const url = w.media;
    warmHoverTimer = setTimeout(() => { warmHoverTimer = 0; warmVideoUrl(url); }, VIDEO_WARM_HOVER_MS);
  } catch {   }
}
function probeVideoPoster(video, onReady, onFail) {
  const url = video && video.getAttribute ? String(video.getAttribute("poster") || "") : "";
  if (video) { try { video.__wePosterReady = false; } catch {   } }
  if (!url || typeof Image !== "function") {
    if (video) { try { video.__wePosterReady = true; } catch {   } }
    onReady();
    return () => {};
  }
  let done = false;
  const img = new Image();
  img.onload = () => {
    if (done) return;
    done = true;
    try { video.__wePosterReady = true; } catch {   }
    onReady();
  };
  img.onerror = () => { if (!done) { done = true; onFail(); } };
  try { img.src = url; } catch { if (!done) { done = true; onFail(); } }
  return () => { done = true; };
}
function videoContentReady(video) {
  if (!video) return true;
  const hasPoster = !!(video.getAttribute && video.getAttribute("poster"));
  if (hasPoster && video.__wePosterReady === true) return true;
  if (Number(video.readyState) >= 2) return true;
  return false;
}
function layerStillPending() {
  try {
    const n = document.getElementById(LAYER_ID);
    return Boolean(n && n.classList && typeof n.classList.contains === "function"
      && n.classList.contains("we-layer--pending"));
  } catch { return false; }
}
function buildVideoMedia(sel, fitClass) {
  const prepared = consumePreparedMedia("VIDEO", sel.url);
  const warmed = prepared ? null : consumeWarmVideo(sel.url);
  const media = prepared || warmed || document.createElement("video");
  if (!prepared && !warmed) {
    const tok = String(sel.url || "").split("/").pop();
    const rc = selection.transcodeReady;
    const useCached = Boolean(rc && rc.url && rc.fps === selection.fpsCap && rc.token === tok);
    media.src = useCached ? rc.url : sel.url;
    if (useCached) {
      try { media.dataset.weTranscoded = String(rc.fps); } catch {   }
      selection.transcodeState = "ready";
      selection.transcodeProgress = null;
    }
    const stillPreview = !!sel.previewUrl
      && (sel.type !== "video" || /\/video-preview\//.test(sel.previewUrl));
    if (stillPreview) media.poster = sel.previewUrl;
  }
  media.autoplay = true;
  media.loop = true;
  media.preload = "auto";
  media.setAttribute("playsinline", "");
  try { media.playbackRate = sel.playbackRate; } catch {   }
  if (IS_EDGE && sel.edgeCompat !== false) {
    media.setAttribute("disablepictureinpicture", "");
    media.setAttribute("disableremoteplayback", "");
    media.style.cssText = "position:absolute;left:-100000px;top:0;width:320px;height:180px;opacity:0.01;pointer-events:none;";
    const canvas = document.createElement("canvas");
    canvas.className = "we-media we-media--canvas" + fitClass;
    canvas.style.background = "#000";
    return [media, canvas];
  }
  media.className = "we-media" + fitClass;
  return media;
}
let mediaInfoToken = "";
let mediaInfoInFlight = "";
let mediaInfoAbort = null;
function transcodedUrlFor(token, fps) {
  return "/wallpaper-engine/transcoded/" + encodeURIComponent(token) + "?fps=" + fps;
}
async function refreshMediaInfo(force) {
  const token = selection.type === "video" && selection.url
    ? selection.url.split("/").pop()
    : null;
  if (!token || (!force && token === mediaInfoToken)) return;
  if (mediaInfoAbort) { try { mediaInfoAbort.abort(); } catch {   } mediaInfoAbort = null; }
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  mediaInfoAbort = ctrl;
  mediaInfoToken = token;
  mediaInfoInFlight = token;
  try {
    const res = await apiJson(
      "/media-info/" + encodeURIComponent(token) + "?fps=" + encodeURIComponent(String(selection.fpsCap || 0)),
      { signal: ctrl ? ctrl.signal : undefined });
    const data = res.data || {};
    if (mediaInfoToken === token) {
      selection.mediaInfo = (data && data.info) || null;
      const mi = selection.mediaInfo;
      if (capNeedsTranscode(mi, selection.fpsCap) === false) {
        abortTranscodeUpgrade();
        const layer = document.getElementById(LAYER_ID);
        const video = layer && layer.querySelector("video");
        if (video && video.dataset.weTranscoded) revertTranscodedVideo(video);
        selection.transcodeState = "skipped";
      } else if (data.transcode && data.transcode.cached === true
        && Number(data.transcode.fps) === Number(selection.fpsCap)) {
        selection.transcodeReady = { token, fps: selection.fpsCap, url: transcodedUrlFor(token, selection.fpsCap) };
      }
    }
  } catch {
    if (!(ctrl && ctrl.signal.aborted) && mediaInfoToken === token) selection.mediaInfo = null;
  }
  const ownsAbort = mediaInfoAbort === ctrl;
  if (ownsAbort) mediaInfoAbort = null;
  if (ownsAbort && mediaInfoInFlight === token) mediaInfoInFlight = "";
  if (mediaInfoToken === token) emit();
}
let upgradeAbort = null;
let upgradeToken = "";
let upgradeFps = 0;
let upgradeByUser = false;
let capChangedAt = 0;
function noteFpsCapChange() {
  capChangedAt = Date.now();
}
let upgradePollTimer = null;
function clearUpgradePoll() {
  if (upgradePollTimer) { clearInterval(upgradePollTimer); upgradePollTimer = null; }
}
let upgradeMetaTimer = null;
function clearUpgradeMeta() {
  if (upgradeMetaTimer && typeof window !== "undefined" && typeof window.clearTimeout === "function") {
    window.clearTimeout(upgradeMetaTimer);
  }
  upgradeMetaTimer = null;
}
function abortTranscodeUpgrade() {
  clearUpgradePoll();
  clearUpgradeMeta();
  if (upgradeAbort) { upgradeAbort.abort(); upgradeAbort = null; }
  upgradeToken = "";
  upgradeFps = 0;
  upgradeByUser = false;
  selection.transcodeProgress = null;
}
function revertTranscodedVideo(video) {
  if (!video || !video.dataset.weTranscoded) return;
  delete video.dataset.weTranscoded;
  selection.transcodeReady = null;
  try { video.src = selection.url; video.load(); } catch {   }
}
const NATIVE_SRC_EXT = /\.(mp4|m4v|webm)([?#]|$)/i;
const NATIVE_EXT_SET = { mp4: 1, m4v: 1, webm: 1 };
const NATIVE_CODEC_RE = /^(avc1|avc3|h264|vp8|vp09|vp9|av01|av1|theora|opus|vorbis|mp4a)/i;
function isNativelyPlayableSource(mi, url, ext) {
  const e = String(ext || "").toLowerCase();
  const containerOk = e ? Boolean(NATIVE_EXT_SET[e]) : NATIVE_SRC_EXT.test(String(url || ""));
  if (!containerOk) return false;
  const codec = mi && (mi.codec || mi.videoCodec || mi.video_codec || "");
  if (!codec) return true;
  return NATIVE_CODEC_RE.test(String(codec));
}
const FPS_CAP_TOLERANCE = 1;
function capNeedsTranscode(mi, cap) {
  const src = mi && Number(mi.fps) > 0 ? Number(mi.fps) : 0;
  if (!src || !(cap > 0)) return null;
  return src > cap + FPS_CAP_TOLERANCE;
}
function armVideoChannelReveal(video, recheck, giveUp) {
  let cancelPosterProbe = null;
  const stall = { id: 0, dead: false };
  const cancelStall = () => {
    stall.dead = true;
    if (stall.id) { clearTimeout(stall.id); stall.id = 0; }
  };
  if (video && typeof video.addEventListener === "function") {
    const frameReady = () => { try { video.__weReady = true; } catch {   } recheck(); };
    video.addEventListener("loadeddata", frameReady);
    video.addEventListener("canplay", frameReady);
    video.addEventListener("error", giveUp);
    cancelPosterProbe = probeVideoPoster(video, recheck, recheck);
    const startedAt = Date.now();
    const stallGuard = () => {
      if (stall.dead) return;
      if (videoContentReady(video) || video.__weReady === true) {
        recheck();
        if (!stall.dead && Date.now() - startedAt < VIDEO_STALL_GIVE_UP_MS) {
          stall.id = setTimeout(stallGuard, VIDEO_POSTER_BUDGET_MS);
        }
        return;
      }
      const waited = Date.now() - startedAt;
      if (waited >= VIDEO_STALL_GIVE_UP_MS) {
        liveLog("video-stall", "wid=" + selection.id + " " + Math.round(waited / 1000)
          + "s 仍无画面 → 继续留旧壁纸（不放行空层）", "warn");
        return;
      }
      stall.id = setTimeout(stallGuard, VIDEO_POSTER_BUDGET_MS);
    };
    if (typeof setTimeout === "function") stall.id = setTimeout(stallGuard, VIDEO_POSTER_BUDGET_MS);
  }
  return { cancelProbe: cancelPosterProbe, cancelStall };
}
function videoChannelAfterLayerBuild(video, sel) {
  if (!video || !sel || sel.type !== "video" || !sel.url) return;
  maybeUpgradeToTranscoded(video, String(sel.url).split("/").pop());
}
function maybeUpgradeToTranscoded(video, token) {
  if (!video || !video.isConnected) return;
  const cap = selection.fpsCap;
  if (!cap || cap <= 0) {
    abortTranscodeUpgrade();
    selection.transcodeReady = null;
    if (video.dataset.weTranscoded) {
      revertTranscodedVideo(video);
      selection.transcodeState = "idle";
    }
    return;
  }
  const mi = selection.mediaInfo;
  if (!mi && mediaInfoInFlight === token) return;
  const need = capNeedsTranscode(mi, cap);
  if (need === false) {
    if (video.dataset.weTranscoded) revertTranscodedVideo(video);
    selection.transcodeReady = null;
    selection.transcodeState = "skipped";
    return;
  }
  if (need === null && isNativelyPlayableSource(mi, selection.url, selection.mediaExt)) {
    if (video.dataset.weTranscoded) revertTranscodedVideo(video);
    selection.transcodeReady = null;
    selection.transcodeState = "native";
    return;
  }
  if (video.dataset.weTranscoded === String(cap)) return;
  if (upgradeToken === token && upgradeAbort && upgradeFps === cap) return;
  abortTranscodeUpgrade();
  upgradeToken = token;
  upgradeFps = cap;
  upgradeByUser = Date.now() - capChangedAt < 5000;
  const ctrl = new AbortController();
  upgradeAbort = ctrl;
  selection.transcodeState = "working";
  selection.transcodeProgress = null;
  let pollPending = false;
  const pollProgress = () => {
    if (ctrl.signal.aborted) return;
    if (pollPending) return;
    pollPending = true;
    apiJson("/transcode-progress/" + encodeURIComponent(token) + "?fps=" + cap)
      .then((res) => {
        const d = res.data || {};
        if (ctrl.signal.aborted) return;
        if (d && d.phase) {
          const changed = !selection.transcodeProgress
            || selection.transcodeProgress.phase !== d.phase
            || selection.transcodeProgress.percent !== d.percent
            || selection.transcodeProgress.eta !== d.eta;
          if (changed) {
            selection.transcodeProgress = {
              phase: d.phase, percent: d.percent || 0, source: d.source || "",
              finalizing: d.finalizing === true, eta: typeof d.eta === "number" ? d.eta : null,
            };
            emit();
          }
        }
      })
      .catch(() => {   })
      .then(() => { pollPending = false; });
  };
  clearUpgradePoll();
  const pollTimer = setInterval(pollProgress, 500);
  upgradePollTimer = pollTimer;
  pollProgress();
  const transcodedUrl = transcodedUrlFor(token, cap);
  apiFetch(transcodedUrl, { signal: ctrl.signal, headers: { Range: "bytes=0-0" }, parse: false })
    .then(async (res) => {
      if (ctrl.signal.aborted) return;
      if (pollTimer) clearInterval(pollTimer);
      if (!res.ok) { transcodeUpgradeFailed(video, token); return; }
      try { await res.response.arrayBuffer(); } catch {   }
      if (ctrl.signal.aborted) return;
      if (selection.fpsCap !== cap || !video.isConnected) {
        abortTranscodeUpgrade();
        if (video.isConnected && selection.url && token === selection.url.split("/").pop()) {
          const cur = selection.fpsCap;
          if (cur > 0 && video.dataset.weTranscoded === String(cur)) {
            selection.transcodeState = "ready";
            selection.transcodeProgress = null;
            emit();
          } else {
            maybeUpgradeToTranscoded(video, token);
          }
        } else {
          emit();
        }
        return;
      }
      if (selection.url && token === selection.url.split("/").pop()) {
        if (!layerStillPending() && !upgradeByUser) {
          selection.transcodeReady = { token, fps: cap, url: transcodedUrl };
          selection.transcodeState = "cached";
          selection.transcodeProgress = null;
          liveLog("transcode-cached", "wid=" + selection.id + " " + cap + "fps 版已就绪 → 留到下次建层换（不在屏上换源）");
          emit();
          return;
        }
        video.dataset.weTranscoded = String(cap);
        const t = video.currentTime;
        const wasPlaying = isEffectivelyPlaying();
        let metaTimer = null;
        const clearMetaTimer = () => {
          if (metaTimer && typeof window !== "undefined" && typeof window.clearTimeout === "function") {
            window.clearTimeout(metaTimer);
          }
          if (upgradeMetaTimer === metaTimer) upgradeMetaTimer = null;
          metaTimer = null;
        };
        const onErr = () => {
          clearMetaTimer();
          if (video.dataset.weTranscoded) {
            delete video.dataset.weTranscoded;
            try { video.src = selection.url; video.load(); } catch {   }
            selection.transcodeState = "fallback";
            emit();
          }
        };
        video.addEventListener("error", onErr, { once: true });
        video.src = transcodedUrl;
        video.load();
        const onMeta = () => {
          clearMetaTimer();
          try { if (t > 0 && t < video.duration) video.currentTime = t; } catch {   }
          if (wasPlaying) { try { video.play().catch(() => {}); } catch {   } }
          weDrawFrame();
          selection.transcodeState = "ready";
          selection.transcodeProgress = null;
          emit();
        };
        video.addEventListener("loadedmetadata", onMeta, { once: true });
        if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
          metaTimer = window.setTimeout(() => {
            video.removeEventListener("loadedmetadata", onMeta);
            onErr();
          }, 15000);
          upgradeMetaTimer = metaTimer;
        }
      }
    })
    .catch(() => {
      if (ctrl.signal.aborted) return;
      if (pollTimer) clearInterval(pollTimer);
      transcodeUpgradeFailed(video, token);
    });
}
function transcodeUpgradeFailed(video, token) {
  if (video && video.isConnected && video.dataset.weTranscoded) {
    revertTranscodedVideo(video);
  }
  selection.transcodeState = "fallback";
  selection.transcodeProgress = null;
  emit();
}
function invalidateMediaInfoProbe() {
  mediaInfoToken = "";
}
function abortMediaInfoProbe() {
  if (mediaInfoAbort) { try { mediaInfoAbort.abort(); } catch {   } mediaInfoAbort = null; }
}
export {
  refreshMediaInfo, abortTranscodeUpgrade,
  invalidateMediaInfoProbe, abortMediaInfoProbe,
};
let weVfHandle = 0;
let weRafId = 0;
let weResizeObs = null;
let weDrawCtx = null;
function weStopDraw() {
  const v = weDrawCtx && weDrawCtx.video;
  if (weVfHandle && v && v.cancelVideoFrameCallback) {
    try { v.cancelVideoFrameCallback(weVfHandle); } catch {   }
  }
  weVfHandle = 0;
  if (weRafId) { cancelAnimationFrame(weRafId); weRafId = 0; }
  if (weResizeObs) { weResizeObs.disconnect(); weResizeObs = null; }
  weDrawCtx = null;
}

function weDrawFrame() {
  const ctx = weDrawCtx;
  if (!ctx || !ctx.canvas.isConnected) return;
  const video = ctx.video;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return;
  const canvas = ctx.canvas;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const cw = Math.max(1, Math.min(vw, Math.round(canvas.clientWidth * dpr)));
  const ch = Math.max(1, Math.min(vh, Math.round(canvas.clientHeight * dpr)));
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, cw, ch);

  const vr = vw / vh, cr = cw / ch;
  let dx = 0, dy = 0, dw = cw, dh = ch, sx = 0, sy = 0, sw = vw, sh = vh;
  if (ctx.fit === "cover") {
    if (cr > vr) { sw = vh * cr; sx = (vw - sw) / 2; }
    else { sh = vw / cr; sy = (vh - sh) / 2; }
  } else if (ctx.fit === "contain") {
    if (cr > vr) { dh = cw / vr; dy = (ch - dh) / 2; }
    else { dw = ch * vr; dx = (cw - dw) / 2; }
  } else if (ctx.fit === "center") {
    sw = Math.min(vw, cw); sh = Math.min(vh, ch);
    sx = (vw - sw) / 2; sy = (vh - sh) / 2;
    dw = sw; dh = sh; dx = (cw - dw) / 2; dy = (ch - dh) / 2;
  }

  g.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);

  canvas.dataset.weDrawn = "1";
  noteLayerContent(canvas);
}
function weDrawTick() {
  weDrawFrame();
  const ctx = weDrawCtx;
  if (!ctx || !ctx.canvas.isConnected) return;
  const v = ctx.video;
  if (v.requestVideoFrameCallback) { weVfHandle = v.requestVideoFrameCallback(weDrawTick); return; }

  if (!v.paused && !v.ended) { weRafId = requestAnimationFrame(weDrawTick); return; }
  v.addEventListener("play", () => { if (weDrawCtx === ctx) weDrawTick(); }, { once: true });
}
function weStartDraw(canvas, video, customFit) {
  weStopDraw();
  weDrawCtx = {
    canvas,
    video,
    fit: customFit
      ? (getComputedStyle(document.body).getPropertyValue("--we-object-fit").trim() || "cover")
      : "cover",
  };
  weDrawFrame();

  if (!video.dataset.weLoadedOnce) {
    video.dataset.weLoadedOnce = "1";
    video.addEventListener("loadeddata", () => weDrawFrame(), { once: true });
  }
  if (video.requestVideoFrameCallback) weVfHandle = video.requestVideoFrameCallback(weDrawTick);
  else weRafId = requestAnimationFrame(weDrawTick);
  weResizeObs = new ResizeObserver(() => weDrawFrame());
  weResizeObs.observe(canvas);
}

function forgetGpuFramePin(token) {
  const key = String(token || "");
  gpuFramePins.delete(key);
  gpuFramePinInflight.delete(key);
}
function markGpuFramePin(token, pinned) {
  const key = String(token || "");
  if (key) gpuFramePins.set(key, { pinned: Boolean(pinned), at: Date.now() });
}

let mediaTimer = 0;
let mediaSpectrum = null;
let mediaAudioInstalled = false;
let mediaNpKey = "";
let mediaFetchBusy = false;
let mediaNpTick = 0;

const MEDIA_THUMB_MAX = 512;
let mediaArtData = "";
let mediaArtKey = "";
let mediaArtTimer = 0;
let mediaArtTries = 0;

let mediaArtDiag = { fail: "", slow: "", ok: "" };

const MEDIA_ART_MAX_TRIES = 12;

let mediaArtLastErr = "";
async function fetchArtworkDataUrl(url) {

  const r = await apiFetch(url, { parse: false });
  if (!r.ok) { mediaArtLastErr = "http=" + r.status + (r.error ? "/" + r.error : ""); return ""; }
  const blob = await r.response.blob().catch((e) => {
    mediaArtLastErr = "blob:" + String((e && e.name) || e); return null;
  });
  if (!blob) return "";
  if (!/^image\//.test(blob.type || "")) {
    mediaArtLastErr = "ctype=" + (blob.type || "?") + " size=" + blob.size; return "";
  }
  const bitmap = await createImageBitmap(blob).catch((e) => {
    mediaArtLastErr = "bitmap:" + String((e && e.name) || e); return null;
  });
  if (!bitmap) return "";
  try {
    const scale = Math.min(1, MEDIA_THUMB_MAX / Math.max(bitmap.width || 1, bitmap.height || 1));
    const w = Math.max(1, Math.round((bitmap.width || 1) * scale));
    const h = Math.max(1, Math.round((bitmap.height || 1) * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) { mediaArtLastErr = "no-2d-ctx"; return ""; }
    ctx.drawImage(bitmap, 0, 0, w, h);
    mediaArtLastErr = "";
    return c.toDataURL("image/jpeg", 0.88);
  } finally {
    try { bitmap.close(); } catch {   }
  }
}

function pushMediaSnapshot(frame, m) {
  try {
    const wp = frame.contentWindow && frame.contentWindow.__wp;
    if (!wp || typeof wp.setMedia !== "function") return;
    if (!m) { wp.setMedia(null); return; }
    wp.setMedia({
      hasMedia: true,
      title: m.title || "",
      artist: m.artist || "",
      album: m.album || "",
      albumArtist: m.albumArtist || "",
      playing: Boolean(m.playing),

      state: Number.isFinite(Number(m.state)) ? Number(m.state) : (m.playing ? 1 : 2),
      position: Number(m.position) || 0,
      duration: Number(m.duration) || 0,
      thumbnail: mediaArtData || undefined,

      lyrics: Array.isArray(m.lyrics) && m.lyrics.length ? m.lyrics : undefined,
    });
  } catch {   }
}

function syncAudioBridge(frame, running) {
  try {
    const wp = frame.contentWindow && frame.contentWindow.__wp;
    if (!wp || typeof wp.setAudioBridge !== "function") return;
    if (running && !mediaAudioInstalled) {
      wp.setAudioBridge(() => (mediaSpectrum ? { left: mediaSpectrum, right: mediaSpectrum } : null));
      mediaAudioInstalled = true;
    } else if (!running && mediaAudioInstalled) {
      wp.setAudioBridge(null);
      mediaAudioInstalled = false;
    }
  } catch {   }
}

const MEDIA_CONTROL_ACTIONS = ["play", "pause", "playPause", "skipNext", "skipPrevious"];
let mediaControlInstalled = false;
let mediaControlWin = null;
let mediaControlFails = 0;
function hostMediaControl(action) {
  return apiPostJson("/media-control", { action }).then((res) => {
    const d = res && res.data;
    if (d && d.ok === true) { mediaControlFails = 0; return d; }
    mediaControlFails += 1;

    if (mediaControlFails === 1) {
      reportClientDiag("media-control-fail", action + " err=" + ((d && d.error) || res.error || ("http=" + res.status)));
    }
    return null;
  }).catch(() => null);
}
function syncMediaControl(frame) {
  try {
    const win = frame.contentWindow;
    if (!win || (mediaControlInstalled && mediaControlWin === win)) return;
    const wp = win.__wp;
    if (!wp || typeof wp.setMediaControl !== "function") return;
    const controls = {};
    for (const name of MEDIA_CONTROL_ACTIONS) controls[name] = () => hostMediaControl(name);
    wp.setMediaControl(controls);
    mediaControlWin = win;
    mediaControlInstalled = true;
  } catch {   }
}

const MEDIA_ART_SLOW_MS = 45000;

let mediaArtTimerSlow = false;
function scheduleArtworkFetch(frame, m, artKey, hasArt) {
  if (!m || !m.thumbnail) return;
  if (mediaArtTimer) {

    if (!(mediaArtTimerSlow && hasArt !== false)) return;
    try { clearTimeout(mediaArtTimer); } catch {   }
    mediaArtTimer = 0;
    mediaArtTries = 0;
  }
  const diagOnce = (tag, event, detail) => {
    if (mediaArtDiag[tag] === artKey) return;
    mediaArtDiag[tag] = artKey;
    reportClientDiag(event, detail);
  };
  const slow = hasArt === false || mediaArtTries >= MEDIA_ART_MAX_TRIES;
  if (slow) diagOnce("slow", "media-art-slow", "tries=" + mediaArtTries + " thumb=true");
  else mediaArtTries += 1;
  mediaArtTimerSlow = slow;
  mediaArtTimer = setTimeout(() => {
    mediaArtTimer = 0;
    mediaArtTimerSlow = false;
    if (!frame.isConnected || !selection.sceneLiveActive || mediaArtKey !== artKey) return;
    fetchArtworkDataUrl(location.origin + m.thumbnail).then((d) => {
      if (mediaArtKey !== artKey) return;
      if (d) {
        mediaArtData = d;
        pushMediaSnapshot(frame, m);
        diagOnce("ok", "media-art", "ok len=" + d.length + " tries=" + mediaArtTries);
      } else {
        diagOnce("fail", "media-art-try-fail",
          "attempt=" + mediaArtTries + (slow ? "/slow" : "") + " err=" + (mediaArtLastErr || "?"));
        scheduleArtworkFetch(frame, m, artKey, hasArt);
      }
    }).catch(() => { scheduleArtworkFetch(frame, m, artKey, hasArt); });
  }, slow ? MEDIA_ART_SLOW_MS : Math.min(700 * mediaArtTries, 4000));
}
function stopMediaSync(frame) {
  if (mediaTimer) { try { clearInterval(mediaTimer); } catch {   } mediaTimer = 0; }
  if (mediaArtTimer) { try { clearTimeout(mediaArtTimer); } catch {   } mediaArtTimer = 0; }
  mediaArtTimerSlow = false;
  mediaNpKey = "";
  mediaArtKey = "";
  mediaArtData = "";
  mediaArtTries = 0;
  mediaArtDiag = { fail: "", slow: "", ok: "" };
  mediaAudioInstalled = false;
  mediaControlInstalled = false;
  mediaControlWin = null;
  mediaControlFails = 0;
  const f = frame || (liveWatch && liveWatch.frame);
  if (!f || !f.isConnected) return;
  try {
    const wp = f.contentWindow && f.contentWindow.__wp;
    if (!wp) return;
    if (typeof wp.setAudioBridge === "function") wp.setAudioBridge(null);
    if (typeof wp.setMedia === "function") wp.setMedia(null);
    if (typeof wp.setMediaControl === "function") wp.setMediaControl(null);
  } catch {   }
}
function startMediaSync(frame) {
  stopMediaSync(frame);
  if (selection.audioSource === "off" && selection.mediaIntegration === false) return;
  const wantSpectrum = selection.audioSource !== "off";
  const wantNp = selection.mediaIntegration !== false;
  mediaTimer = setInterval(() => {
    if (!frame.isConnected || !selection.sceneLiveActive) return;

    if (wantNp) syncMediaControl(frame);
    if (wantSpectrum && !mediaFetchBusy) {
      mediaFetchBusy = true;
      apiJson("/audio-spectrum")
        .then((res) => {
          const d = res.data;
          if (!d || !d.ok) return;
          if (Array.isArray(d.bands) && d.bands.length) {
            const arr = new Float32Array(d.bands.length);
            for (let i = 0; i < d.bands.length; i++) arr[i] = (d.bands[i] || 0) / 255;
            mediaSpectrum = arr;
          }

          syncAudioBridge(frame, d.running === true);
        })
        .catch(() => {   })
        .finally(() => { mediaFetchBusy = false; });
    }
    if (wantNp && ++mediaNpTick % 20 === 0) {
      apiJson("/now-playing")
        .then((res) => {
          const d = res.data;
          if (!d || !d.ok) return;
          const m = d.media || null;

          const lyr = m && Array.isArray(m.lyrics) ? m.lyrics : [];
          const lyrRev = lyr.length ? lyr.length + ":" + String(lyr[lyr.length - 1][1] || "").length : 0;
          const key = m ? [m.title, m.artist, m.playing ? 1 : 0, Math.floor((m.position || 0) / 5), lyrRev].join("\u0000") : "";
          if (key === mediaNpKey) return;
          mediaNpKey = key;

          const artKey = m ? [m.title, m.artist, m.album].join("\u0000") : "";
          if (artKey !== mediaArtKey) {
            mediaArtKey = artKey;
            mediaArtData = "";
            mediaArtTries = 0;
            if (mediaArtTimer) { try { clearTimeout(mediaArtTimer); } catch {   } mediaArtTimer = 0; }
          }

          pushMediaSnapshot(frame, m);
          if (m && m.playing && !mediaArtData) scheduleArtworkFetch(frame, m, artKey, d.hasArtwork !== false);
        })
        .catch(() => {   });
    }
  }, 50);
}

function refreshStaticFrameNodes(token) {
  try {
    const root = typeof document !== "undefined" && typeof document.getElementById === "function"
      ? document.getElementById(LAYER_ID) : null;
    if (!root || typeof root.querySelectorAll !== "function") return;
    const imgs = root.querySelectorAll("img");
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      const src = String((img.getAttribute && img.getAttribute("src")) || img.src || "");
      if (!src || src.indexOf("/scene-frame/" + token) === -1) continue;
      try { img.src = src + (src.indexOf("?") === -1 ? "?" : "&") + "gpur=" + Date.now(); } catch {   }
    }
  } catch {   }
}

function reportClientDiag(event, detail) {
  try {

    apiPostJson("/client-diag", {
      event,
      type: selection.type || "",
      id: selection.id || "",
      detail: String(detail == null ? "" : detail).slice(0, 300),
      src: String(selection.url || selection.sceneLiveSrc || selection.webLiveSrc || "").slice(0, 200),
    }, { keepalive: true }).catch(() => {   });
  } catch {   }
}

function userPropsPanelOpen() {
  return propsPanelOpen === true;
}

function userPropsStateOf() {
  return {
    open: propsPanelOpen === true,
    token: propsState.token,
    loading: propsState.loading === true,
    error: String(propsState.error || ""),
    count: propsState.props.length,
    heard: !propsState.loading && !propsState.remote,
  };
}

function renderUserPropsPanel() {
  const st = userPropsStateOf();
  const sel = selection;
  return renderPickerPropsPanel({
    open: st.open,

    token: propTokenOf(sel),
    loading: st.loading,
    error: st.error,
    props: propsState.props,
    sceneLiveActive: sel.sceneLiveActive,

    source: st,
    ensureDefs: (token) => {
      if (propsState.token !== token && !propsState.loading) loadUserPropDefs(token, true);
    },
    onPropInput: onUserPropInput,
    onReset: resetUserProps,
  });
}

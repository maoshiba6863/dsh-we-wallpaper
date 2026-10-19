const LIVE_PAYLOAD_FLOOR_BPS = 8000000;

const LIVE_FIRST_FRAME_MAX_MS = 90000;

const LIVE_PAYLOAD_STALL_MS = 10000;

const LIVE_TRANSFER_RETRY_DELAY_MS = 45000;
const LIVE_TRANSFER_RETRY_LIMIT = 2;
let liveWatch = null;
let liveTransferRetryTimer = 0;
const liveTransferAttempts = new Map();
function liveStats(frame) {
  try {
    const st = frame.contentWindow && frame.contentWindow.__wpStats;
    if (!st || typeof st.frame !== "function") return null;
    return st.frame();
  } catch { return null; }
}

function liveInventoryEntry(wid) {
  const list = (selection.inventory && selection.inventory.wallpapers) || [];
  const key = String(wid == null ? selection.id : wid);
  if (!key) return null;
  for (const w of list) if (String(w && w.id) === key) return w;
  return null;
}

function liveFirstFrameBudget(wid) {
  const entry = liveInventoryEntry(wid);
  const bytes = Number(entry && entry.scenePkgBytes) || 0;
  const scaled = LIVE_FIRST_FRAME_MS + Math.ceil(bytes / (LIVE_PAYLOAD_FLOOR_BPS / 1000));
  return Math.max(LIVE_FIRST_FRAME_MS, Math.min(LIVE_FIRST_FRAME_MAX_MS, scaled));
}

function pollLivePayload(watch) {
  if (!watch || watch.payloadPolling) return;

  if (selection.type !== "scene") return;
  const token = String(watch.payloadToken || "");
  if (!token) return;
  watch.payloadPolling = true;
  let pending;
  try {
    pending = apiJson(SCENE_PAYLOAD_PROGRESS_PATH + "?token=" + encodeURIComponent(token));
  } catch { watch.payloadPolling = false; return; }
  if (!pending || typeof pending.then !== "function") { watch.payloadPolling = false; return; }
  pending.then((res) => {
    watch.payloadPolling = false;
    if (!watch || liveWatch !== watch) return;
    const d = res && res.ok && res.data && typeof res.data === "object" ? res.data : null;
    if (!d || d.ok !== true) {

      if (d && d.ok === false) watch.payloadUnseen = true;
      watch.payload = null;
      return;
    }
    watch.payloadUnseen = false;
    const served = Number(d.served) || 0;
    watch.payload = {
      served,
      size: Number(d.size) || 0,
      active: Number(d.active) || 0,
      transfers: Number(d.transfers) || 0,
      completed: Number(d.completed) || 0,
      lastByteAt: Number(d.lastByteAt) || 0,
    };

    watch.payloadGrew = served > (watch.payloadPrev || 0);
    watch.payloadPrev = served;

    if (!watch.payloadStart) watch.payloadStart = { served, completed: watch.payload.completed };
  }).catch(() => { watch.payloadPolling = false; });
}

function livePayloadFlowing(watch) {
  const p = watch && watch.payload;
  if (!p) return false;
  if (watch.payloadGrew) return true;

  if (p.active > 0 && Date.now() - p.lastByteAt < LIVE_PAYLOAD_STALL_MS) return true;
  return false;
}

function liveFailCauseOf(watch) {
  const p = watch && watch.payload;
  if (!p) return watch && watch.payloadUnseen ? "transfer" : "";
  if (p.transfers <= 0) return "transfer";
  if (p.active > 0) return "transfer";
  const s = watch.payloadStart;
  if (s) {
    if (p.completed - s.completed <= 0) {
      const size = p.size > 0 ? p.size : 0;
      if (!(size > 0 && p.served - s.served >= size)) return "transfer";
    }
  }
  return "";
}

function liveStateOf(frame) {
  try {
    const wp = frame.contentWindow && frame.contentWindow.__wp;
    if (!wp || typeof wp.getState !== "function") return null;
    return wp.getState();
  } catch { return null; }
}

let uiFpsFrames = 0;
let uiFpsRaf = 0;
let uiFpsSince = 0;

const uiNow = () => (typeof performance !== "undefined" && performance && typeof performance.now === "function")
  ? performance.now() : 0;
function startUiFpsProbe() {
  if (uiFpsRaf || typeof requestAnimationFrame !== "function") return;
  uiFpsFrames = 0;
  uiFpsSince = uiNow();
  const tick = () => { uiFpsFrames += 1; uiFpsRaf = requestAnimationFrame(tick); };
  uiFpsRaf = requestAnimationFrame(tick);
}
function stopUiFpsProbe() {
  if (uiFpsRaf) { try { cancelAnimationFrame(uiFpsRaf); } catch {   } }
  uiFpsRaf = 0;
  uiFpsFrames = 0;
  uiFpsSince = 0;
}
function takeUiFps() {
  const now = uiNow();
  const seconds = uiFpsSince > 0 ? (now - uiFpsSince) / 1000 : 0;
  const frames = uiFpsFrames;
  uiFpsFrames = 0;
  uiFpsSince = now;
  return seconds > 0.2 ? Math.round(frames / seconds) : -1;
}

function reportLiveFps(watch, frame, stats, wstate) {
  const secs = Math.max(1, Math.round((Date.now() - (watch.fpsAt || watch.startedAt)) / 1000));
  watch.fpsAt = Date.now();
  const ui = takeUiFps();
  const web = wstate && typeof wstate.webFps === "number" ? wstate.webFps : -1;
  const rnd = stats && typeof stats.fps === "number" ? Math.round(stats.fps) : -1;
  reportClientDiag("live-fps",
    `ui=${ui} web=${web} rnd=${rnd} cap=${selection.sceneLiveFps || "-"}`
    + ` win=${secs}s playing=${isEffectivelyPlaying() ? 1 : 0}`);
}

function desktopWindowMode() {
  try {
    const m = new URLSearchParams(window.location.search).get("dsh-desktop-mode");
    return m === "extended" || m === "advanced" ? m : "compatibility";
  } catch { return "compatibility"; }
}

let extendedFrameSwap;
function useExtendedFrameSwap() {
  if (extendedFrameSwap !== undefined) return extendedFrameSwap;
  extendedFrameSwap = false;
  try {
    if (typeof location !== "undefined" && location && typeof location.search === "string") {
      let rawFlag = "";
      if (typeof URLSearchParams === "function") {
        rawFlag = new URLSearchParams(location.search).get("we-ext-swap") || "";
      } else {
        const m = /[?&]we-ext-swap=([^&]*)/.exec(location.search);
        rawFlag = m ? decodeURIComponent(m[1]) : "";
      }
      extendedFrameSwap = String(rawFlag).toLowerCase() === "1";
    }
  } catch {   }
  return extendedFrameSwap;
}

let liveFrameRebuildTimer = 0;
function rebuildLiveFrame(frame, watch) {
  if (desktopWindowMode() !== "extended") return false;
  try {
    if (!frame || frame.dataset.weRebuilt === "1") return false;
    frame.dataset.weRebuilt = "1";
    const fresh = document.createElement("iframe");
    for (const a of frame.attributes) {
      try { fresh.setAttribute(a.name, a.value); } catch {   }
    }
    fresh.classList.remove("we-live-on");
    fresh.dataset.weRebuilt = "1";
    if (frame.parentNode) frame.parentNode.replaceChild(fresh, frame);
    else if (frame.isConnected) frame.replaceWith(fresh);
    else return false;
    watch.frame = fresh;
    watch.firstFrame = false;
    watch.stall = 0;
    watch.startedAt = Date.now();
    ensureLivePointer(fresh);
    startMediaSync(fresh);
    liveLog("live-frame-rebuilt", "wid=" + watch.wid + " mode=extended"
      + " 启动期子框架合成层坏死 → 换新元素重挂同 src（指针/音频已改道）");
    return true;
  } catch { return false; }
}

function startLiveWatch(frame, wid) {
  stopLiveWatch();
  const watch = {
    frame, wid: String(wid || ""), timer: 0,
    startedAt: Date.now(),
    hardAt: Date.now(),
    budget: liveFirstFrameBudget(wid),
    payloadToken: String((selection.type === "scene" ? selection.sceneLiveSrc : selection.webLiveSrc) || ""),
    payload: null,
    payloadUnseen: null,
    payloadStart: null,
    payloadPrev: 0, payloadGrew: false, payloadPolling: false,
    loadingTicks: 0,
    firstFrame: false, stall: 0, resumed: false, heldPaused: 0, rearmed: false,
  };
  liveLog("watch-start", "wid=" + watch.wid + " 预算=" + watch.budget + "ms " + liveStateBrief());
  watch.timer = setInterval(() => {
    if (!frame.isConnected) { liveLog("watch-stop", "iframe 已从文档移除", "info", true); stopLiveWatch(); return; }

    const stats = liveStats(frame);
    applyLiveControls(frame);
    const isWeb = selection.type === "web";
    const wstate = isWeb ? liveStateOf(frame) : null;
    const alive = liveHeartbeatAlive(frame, stats, wstate, isWeb);

    if (isWeb && wstate && wstate.iframeLoaded === false && wstate.webError) {
      liveFail("load");
      return;
    }
    liveLog("tick", () => liveStateBrief("fps=" + (stats ? Math.round(stats.fps * 10) / 10 : "null")
      + " running=" + (stats ? stats.running : "null") + " alive=" + alive
      + " first=" + watch.firstFrame + " stall=" + watch.stall + " held=" + watch.heldPaused
      + " load=" + watch.loadingTicks + " served=" + (watch.payload ? watch.payload.served : "?"))
      , "info", true);
    if (!watch.firstFrame) {
      if (alive) {
        watch.firstFrame = true;
        selection.sceneLiveActive = true;
        frame.classList.add("we-live-on");
        startUiFpsProbe();

        clearPrepareLiveTimeout(watch.wid);

        liveSessionFailures.delete(watch.wid);
        liveTransferAttempts.delete(watch.wid);
        liveLog("first-frame-ok", "wid=" + watch.wid + " 用时 " + (Date.now() - watch.startedAt) + "ms"
          + "（总 " + (Date.now() - watch.hardAt) + "ms，预算 " + watch.budget + "ms"
          + (watch.heldPaused ? weT("，暂停期跳过 {n} tick", { n: watch.heldPaused }) : "")
          + (watch.loadingTicks ? weT("，传输中 {n} tick", { n: watch.loadingTicks }) : "")
          + "，整包 " + ((watch.payload && watch.payload.size) || 0) + "B 完成 " + ((watch.payload && watch.payload.completed) || 0) + " 次）");
        try { syncSceneAudio(selection); emit(); } catch {   }

        maybeCaptureLiveFrame(frame, selection);

        applyStoredUserProps(selection);

        startMediaSync(frame);

        scheduleLiveFrameBackfill(frame);
        reportClientDiag("live-ready", "firstFrame ok");

        if (desktopWindowMode() === "extended" && !liveFrameRebuildTimer && useExtendedFrameSwap()) {
          const cursed = frame;
          liveFrameRebuildTimer = setTimeout(() => {
            liveFrameRebuildTimer = 0;
            try {
              if (cursed.isConnected && watch.frame === cursed) rebuildLiveFrame(cursed, watch);
            } catch {   }
          }, 8000);
        }
      } else if (!isEffectivelyPlaying()) {

        watch.heldPaused += 1;
        watch.startedAt = Date.now();

        suspendLivePayload(frame, watch);
      } else {

        pollLivePayload(watch);
        if (livePayloadFlowing(watch)) {
          watch.loadingTicks += 1;
          watch.startedAt = Date.now();
        }
        if (Date.now() - watch.hardAt > LIVE_FIRST_FRAME_MAX_MS
          || (!livePayloadFlowing(watch) && Date.now() - watch.startedAt > watch.budget)) {
          liveFail("timeout");
        }
      }
      return;
    }

    const responsive = isWeb ? Boolean(wstate || stats) : alive;
    if (responsive) {

      if (alive && isEffectivelyPlaying() && liveHeartbeatReady(frame, stats, wstate) && !selection.sceneLiveActive) {
        selection.sceneLiveActive = true;
        if (!watch.rearmed) {
          watch.rearmed = true;
          liveLog("live-rearm", "wid=" + watch.wid + " 心跳自愈（激活态被清后又恢复）", "info");
        }
      }
      watch.stall = 0;
      watch.resumed = false;

      watch.fpsTick = (watch.fpsTick || 0) + 1;
      if (watch.fpsTick % 5 === 0) reportLiveFps(watch, frame, stats, wstate);
      return;
    }
    if (!isEffectivelyPlaying()) { watch.stall = 0; watch.resumed = false; return; }
    watch.stall += 1;
    if (watch.stall === LIVE_STALL_TICKS && !watch.resumed) {

      watch.resumed = true;
      liveLog("stall-rescue", "wid=" + watch.wid + " 连续 " + watch.stall + "s 无帧 → 试 resume()", "warn");
      try {
        const wp = frame.contentWindow && frame.contentWindow.__wp;
        if (wp) wp.resume();
      } catch {   }
      return;
    }
    if (watch.stall >= LIVE_STALL_TICKS * 2) liveFail("stall");
  }, 1000);
  liveWatch = watch;

  if (selection.type === "scene") startOcclusionPolling(frame);
}
function stopLiveWatch() {
  if (!liveWatch) return;
  try { clearInterval(liveWatch.timer); } catch {   }
  stopUiFpsProbe();
  stopMediaSync(liveWatch.frame);
  stopOcclusionPolling();
  liveWatch = null;

  selection.sceneLiveActive = false;
}

function liveFrameDeferred(frame) {
  return Boolean(frame && frame.dataset && frame.dataset.weLiveSrc);
}

function liveFrameShouldDefer() {
  return !isEffectivelyPlaying();
}

function armDeferredLiveFrame(frame) {
  if (!liveFrameDeferred(frame)) return false;
  if (!isEffectivelyPlaying()) return false;
  const url = frame.dataset.weLiveSrc;
  frame.dataset.weLiveSrc = "";
  try { frame.src = url; } catch { frame.dataset.weLiveSrc = url; return false; }
  liveLog("live-payload-arm", "延迟的渲染页开始加载（可见且应播；载荷 " + livePayloadSizeBrief() + "）", "info");
  return true;
}

function livePayloadSizeBrief() {
  const entry = liveInventoryEntry(selection.id);
  const bytes = Number(entry && entry.scenePkgBytes) || 0;
  return bytes ? (Math.round(bytes / 1048576) + "MB") : "?";
}

function suspendLivePayload(frame, watch) {
  if (!frame || !watch || watch.firstFrame) return false;
  if (typeof document === "undefined" || !document.hidden) return false;
  const url = frame.getAttribute && frame.getAttribute("src");
  if (!url || url === "about:blank") return false;
  frame.dataset.weLiveSrc = url;
  try { frame.src = "about:blank"; } catch { return false; }
  liveLog("live-payload-suspend", "wid=" + watch.wid + " 隐藏中且首帧未出 → 停掉载荷（可见时补回）", "info");
  stopLiveWatch();
  return true;
}

function liveFail(reason) {
  const wid = liveWatch ? liveWatch.wid : String(selection.id || "");

  const watched = liveWatch;
  const cause = reason === "timeout" ? liveFailCauseOf(watched) : "";
  liveLog("liveFail", "reason=" + reason + (cause ? "/" + cause : "") + " wid=" + wid
    + " 运行时长=" + (watched ? Date.now() - watched.startedAt : 0) + "ms"
    + " 总时长=" + (watched ? Date.now() - watched.hardAt : 0) + "ms"
    + " 预算=" + (watched ? watched.budget : 0) + "ms"
    + " stats=" + JSON.stringify(watched ? liveStats(watched.frame) : null)
    + " 已确认首帧=" + Boolean(watched && watched.firstFrame)
    + " 暂停期跳过tick=" + (watched ? watched.heldPaused : 0)
    + " 传输中tick=" + (watched ? watched.loadingTicks : 0)
    + " 载荷=" + JSON.stringify(watched ? watched.payload : null)
    + " 媒体源=" + (resolveSceneMediaBase() || weT("(应用源)"))
    + " " + liveStateBrief()
    + " prepare超时计数=" + (prepareLiveTimeouts.get(String(wid)) || 0)
    + " 帧率档=" + selection.sceneLiveFps, "warn");
  stopLiveWatch();
  if (!wid) return;
  if (cause === "transfer" || reason === "stall") {
    const attempts = (liveTransferAttempts.get(wid) || 0) + 1;
    liveTransferAttempts.set(wid, attempts);
    const softReason = cause === "transfer" ? "transfer" : "stall";
    liveSessionFailures.set(wid, softReason);
    reportClientDiag("live-fail", cause === "transfer" ? "reason=transfer" : "reason=stall-soft");
    liveLog("liveFail-soft", "wid=" + wid + " " + (LIVE_FAIL_LABELS[softReason] || softReason)
      + " → 只记会话内、不写全局记忆"
      + (attempts <= LIVE_TRANSFER_RETRY_LIMIT ? weT("，冷却 {s}s 后自动重试", { s: Math.round(LIVE_TRANSFER_RETRY_DELAY_MS / 1000) }) : weT("，已达重试上限")), "warn");
    scheduleLiveTransferRetry(wid, attempts);
  } else {
    const map = Object.assign({}, selection.sceneLiveFailures || {});

    map[wid] = reason === "stall" ? "stall" : "timeout";
    reportClientDiag("live-fail", "reason=" + reason);
    selection.sceneLiveFailures = map;

    rememberLivePipeline();
    try { persistSelection(); } catch {   }
  }
  try { syncLayers(); } catch {   }
  try { syncSceneAudio(selection); } catch {   }
  try { emit(); } catch {   }
}

function clearLiveSessionFailures() {
  liveSessionFailures.clear();
  liveTransferAttempts.clear();
  if (liveTransferRetryTimer) { try { clearTimeout(liveTransferRetryTimer); } catch {   } }
  liveTransferRetryTimer = 0;

  rememberLivePipeline();
}

function scheduleLiveTransferRetry(wid, attempts) {
  if (attempts > LIVE_TRANSFER_RETRY_LIMIT) return;
  if (liveTransferRetryTimer) return;
  if (typeof setTimeout !== "function") return;
  liveTransferRetryTimer = setTimeout(() => {
    liveTransferRetryTimer = 0;
    if (String(selection.id || "") !== String(wid)) return;
    if (!liveSessionFailures.has(String(wid))) return;
    if (!(selection.inventory && selection.inventory.sceneMediaBase)) {
      try { loadInventory(); } catch {   }
    }
    liveSessionFailures.delete(String(wid));
    liveLog("live-payload-retry", "wid=" + wid + " 第 " + attempts + " 次传输软失败 → 自动重试（清掉软记忆重建 live 层）", "info");
    try { syncLayers(); } catch {   }
    try { emit(); } catch {   }
  }, LIVE_TRANSFER_RETRY_DELAY_MS);
}

const LIVE_FRAME_BACKFILL_DELAY_MS = 2500;

const GPU_FRAME_AREA_TOL = 0.05;
const LIVE_FRAME_BACKFILL_MIN_BYTES = 4096;

const LIVE_FRAME_SAMPLE = 64;
const LIVE_FRAME_LIT_RATIO = 0.02;
const LIVE_FRAME_MIN_VARIANCE = 4;
const LIVE_FRAME_BYTES_PER_PX = 0.02;
function liveFrameLooksUsable(canvas, blob) {
  try {
    const w = Number(canvas.width) || 0;
    const h = Number(canvas.height) || 0;

    if (w > 0 && h > 0 && blob.size < Math.max(LIVE_FRAME_BACKFILL_MIN_BYTES, w * h * LIVE_FRAME_BYTES_PER_PX)) {
      return false;
    }
    if (!w || !h) return true;
    const probe = document.createElement("canvas");
    probe.width = LIVE_FRAME_SAMPLE;
    probe.height = LIVE_FRAME_SAMPLE;
    const ctx = probe.getContext && probe.getContext("2d");
    if (!ctx || typeof ctx.drawImage !== "function" || typeof ctx.getImageData !== "function") return true;
    ctx.drawImage(canvas, 0, 0, LIVE_FRAME_SAMPLE, LIVE_FRAME_SAMPLE);
    const px = ctx.getImageData(0, 0, LIVE_FRAME_SAMPLE, LIVE_FRAME_SAMPLE).data;
    let lit = 0, sum = 0, sumSq = 0, n = 0;
    for (let i = 0; i + 3 < px.length; i += 4) {
      const lum = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
      sum += lum; sumSq += lum * lum; n++;
      if (lum > 12) lit++;
    }
    if (!n) return true;
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    return lit / n >= LIVE_FRAME_LIT_RATIO && variance >= LIVE_FRAME_MIN_VARIANCE;
  } catch {
    return true;
  }
}
let liveFrameBackfill = { token: "", timer: 0 };
function cancelLiveFrameBackfill() {
  if (liveFrameBackfill.timer && typeof window !== "undefined" && typeof window.clearTimeout === "function") {
    try { window.clearTimeout(liveFrameBackfill.timer); } catch {   }
  }
  liveFrameBackfill = { token: "", timer: 0 };
}

function scheduleLiveFrameBackfill(frame, opts) {
  const force = Boolean(opts && opts.force);
  const src = selection.sceneFrameUrl || "";
  if (!src || src.indexOf("/scene-frame/") === -1 || !frame) {
    if (force) { gpuFrameUi.recapturing = false; gpuFrameUi.error = weT("拿不到实时画面（这个壁纸没有实时渲染）"); try { emit(); } catch {   } }
    return;
  }
  if (typeof window === "undefined" || typeof window.setTimeout !== "function") return;
  const token = String(src.split("/scene-frame/").pop() || "").split("?")[0];

  if (!token || (!force && liveFrameBackfill.token === token)) return;
  cancelLiveFrameBackfill();
  liveFrameBackfill.token = token;
  const backfillWid = String(selection.id || "");

  let recaptured = false;
  let recaptureSize = "";

  const forceFail = (msg) => {
    if (!force) return;
    liveLog("gpu-frame-recapture-fail", "wid=" + backfillWid + " " + msg);
    gpuFrameUi.recapturing = false;
    gpuFrameUi.error = msg;
    try { emit(); } catch {   }
  };
  liveFrameBackfill.timer = window.setTimeout(() => {
    liveFrameBackfill.timer = 0;
    (async () => {

      const win = frame.contentWindow;
      const doc = win && win.document;
      const canvas = doc && typeof doc.querySelector === "function"
        ? doc.querySelector("canvas[data-webwallgl-gl]") : null;
      const canvasW = canvas ? Number(canvas.width) || 0 : 0;
      const canvasH = canvas ? Number(canvas.height) || 0 : 0;
      const areaRef = canvasW > 0 && canvasH > 0 ? canvasW * canvasH : 0;
      const head = await apiHead(src);
      const hh = head.response;
      const hasGpu = Boolean(head.ok && hh && hh.headers
        && typeof hh.headers.get === "function" && hh.headers.get("x-we-gpu") === "1");

      let masterArea = 0;
      if (hasGpu) {
        const gw = Number(hh.headers.get("x-we-gpu-w"));
        const gh = Number(hh.headers.get("x-we-gpu-h"));
        masterArea = Number.isFinite(gw) && gw > 0 && Number.isFinite(gh) && gh > 0 ? gw * gh : 0;
      }

      const stale = force || (hasGpu && areaRef > 0
        && (masterArea <= 0 || masterArea < areaRef * (1 - GPU_FRAME_AREA_TOL)));

      if (hasGpu && !stale) return true;
      if (!hasGpu) {

        liveLog("gpu-frame-slot-missing", "wid=" + backfillWid + " 主帧缺失 → 抓帧回填", "info", true);
      } else if (stale && !force) {
        liveLog("gpu-frame-stale", "wid=" + backfillWid + " 主帧 "
          + Math.round(masterArea / 10000) + " 万px < 画布 "
          + Math.round(areaRef / 10000) + " 万px → 升级重抓");
      }
      if (!canvas || typeof canvas.toBlob !== "function") {
        if (force) forceFail(weT("拿不到实时画面（实时渲染没在运行，或渲染页还没画布）"));
        return false;
      }
      const blob = await new Promise((resolveBlob) => {
        try { canvas.toBlob(resolveBlob, "image/png"); } catch { resolveBlob(null); }
      });
      if (!blob || blob.size < LIVE_FRAME_BACKFILL_MIN_BYTES) {
        if (force) forceFail(weT("抓到的画面是空的（实时渲染还在启动中？稍等一两秒再试）"));
        return false;
      }

      if (!liveFrameLooksUsable(canvas, blob)) {
        if (force) forceFail(weT("抓到的画面还没有内容（全黑/纯色）→ 已保留原来那张"));
        return false;
      }

      themeFollowOnFrameCanvas(canvas);

      let clearedOld = true;
      let forceErrorLatched = false;
      if (force) {
        const del = await apiDelete("/scene-frame-cache/" + encodeURIComponent(token), { parse: true });

        clearedOld = Boolean(del && del.ok);
        if (!clearedOld) {
          liveLog("gpu-frame-stale-keep", "wid=" + backfillWid + " 旧帧删除失败 → 仍尝试覆盖写", "info", true);
        }
      }
      const put = await apiFetch("/scene-frame-cache/" + encodeURIComponent(token), {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: blob,
      });

      const ok = Boolean(put && (put.ok || put.status === 409));

      if (ok && force && !clearedOld && put.status === 409) {
        forceErrorLatched = true;
        forceFail(weT("旧实时帧删不掉（被占用或宿主报错）→ 没有换成新抓的这张，可稍后重试"));
      }

      if (ok && put.ok) {
        releaseFrameBytes(token);
        recaptured = true;
        recaptureSize = canvasW + "x" + canvasH;
      }
      if (!ok && force) forceFail(weT("写入失败（宿主返回 {status}）", { status: put && put.status }));
      return ok;
    })().then((settled) => {

      if (settled && force) {
        gpuFrameUi.recapturing = false;
        if (!forceErrorLatched) gpuFrameUi.error = "";
        try { emit(); } catch {   }
      }
      if (String(selection.id || "") !== backfillWid) return;
      if (settled) {

        markGpuFrameProbed(backfillWid, true);
        markGpuFramePin(token, true);
        if (recaptured && !forceErrorLatched) {
          liveLog("gpu-frame-recaptured", "wid=" + backfillWid + " 已按当前视口重抓（" + recaptureSize + "）");

          refreshStaticFrameNodes(token);
        }
        try { emit(); } catch {   }
        return;
      }

      if (liveFrameBackfill.token === token) liveFrameBackfill.token = "";
      if (force) forceFail(weT("这次没抓成（拿不到画面或写入失败）→ 原来那张没动"));
    }).catch(() => {
      if (liveFrameBackfill.token === token) liveFrameBackfill.token = "";
      forceFail(weT("抓帧过程出错 → 原来那张没动"));
    });
  }, LIVE_FRAME_BACKFILL_DELAY_MS);
}

export { startLiveWatch, stopLiveWatch, liveStats, scheduleLiveFrameBackfill, cancelLiveFrameBackfill, clearLiveSessionFailures, liveWatch };

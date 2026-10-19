var OCCLUSION_POLL_MS = 1000;
var OCCLUSION_BACKOFF_MS = 5000;
var OCCLUSION_BACKOFF_AFTER = 3;

var occlusionTimer = 0;
var occlusionFrame = null;
var occlusionInflight = false;
var occlusionFailures = 0;
var occlusionOnVis = null;

function startOcclusionPolling(frame) {
  stopOcclusionPolling();
  occlusionFrame = frame;
  occlusionFailures = 0;
  occlusionOnVis = function () {

    if (document.hidden) return;
    occlusionTick();
  };
  document.addEventListener('visibilitychange', occlusionOnVis);
  occlusionTimer = setInterval(occlusionTick, OCCLUSION_POLL_MS);
  occlusionTick();
}

function stopOcclusionPolling() {
  if (occlusionTimer) {
    clearInterval(occlusionTimer);
    occlusionTimer = 0;
  }
  if (occlusionOnVis) {
    document.removeEventListener('visibilitychange', occlusionOnVis);
    occlusionOnVis = null;
  }
  occlusionFrame = null;
  occlusionInflight = false;

  occlusionLastOp = null;
}

function occlusionTick() {
  const frame = occlusionFrame;
  if (!frame || !frame.isConnected || occlusionInflight) return;
  if (document.hidden) return;
  const src = String(frame.src || '');
  if (!src || src === 'about:blank') return;
  let targetOrigin = '*';
  try {
    const o = new URL(src).origin;
    if (o && o !== 'null') targetOrigin = o;
  } catch (e) {   }
  occlusionInflight = true;
  Promise.resolve(tryOcclusionFetch())
    .catch(function () { return null; })
    .then(function (snap) {
      occlusionInflight = false;

      if (frame !== occlusionFrame) return;
      if (!snap || snap.ok !== 1) {

        occlusionFailures++;
        if (occlusionFailures >= OCCLUSION_BACKOFF_AFTER) {
          if (occlusionFailures === OCCLUSION_BACKOFF_AFTER) {
            clearInterval(occlusionTimer);
            occlusionTimer = setInterval(occlusionTick, OCCLUSION_BACKOFF_MS);
          }
          occlusionRendererPause = false;
        }
        return;
      }

      const wasBacking = occlusionFailures >= OCCLUSION_BACKOFF_AFTER;
      occlusionFailures = 0;
      if (wasBacking && occlusionTimer) {
        clearInterval(occlusionTimer);
        occlusionTimer = setInterval(occlusionTick, OCCLUSION_POLL_MS);
      }
      deliverOcclusionSnapshot(frame, snap, targetOrigin);
    });
}

function tryOcclusionFetch() {
  const opts = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
    ? { signal: AbortSignal.timeout(2000) }
    : {};
  return apiJson('/occlusion', opts).then(function (res) {
    return res && res.ok ? res.data : null;
  });
}

function deliverOcclusionSnapshot(frame, snap, targetOrigin) {

  const hasData = snap.own && snap.own.w > 0
    && Array.isArray(snap.rects);
  if (!hasData) {
    occlusionRendererPause = false;
    deliverOcclusionOp(frame, 'clearOcclusion', null, '', snap.gen, targetOrigin);
    return;
  }
  const scale = (typeof innerWidth === 'number' && innerWidth > 0) ? innerWidth / snap.own.w : 0;
  if (!(scale > 0)) return;
  const occluders = snap.rects.map(function (r) {
    return [r[0] * scale, r[1] * scale, r[2] * scale, r[3] * scale];
  });

  const areaOwn = snap.own.w * snap.own.h;
  let areaOcc = 0;
  for (let i = 0; i < snap.rects.length; i++) {
    areaOcc += snap.rects[i][2] * snap.rects[i][3];
  }
  const visible = areaOwn > 0 ? Math.max(0, 1 - areaOcc / areaOwn) : 1;
  occlusionRendererPause = visible <= 0.05;
  deliverOcclusionOp(frame, 'setOcclusion', occluders, snap.epoch, snap.gen, targetOrigin);
}

let occlusionLastOp = null;

let occlusionRendererPause = false;
function occlusionRendererPaused() {
  return occlusionRendererPause;
}
function deliverOcclusionOp(frame, op, occluders, epoch, gen, targetOrigin) {
  try {
    const payload = op === 'setOcclusion' ? { occluders: occluders, epoch: epoch, gen: gen } : null;
    frame.contentWindow.postMessage({ __weLive: 1, op: op, payload: payload }, targetOrigin);

    if (op !== occlusionLastOp) {
      occlusionLastOp = op;
      if (typeof liveLog === "function") {
        liveLog("occlusion", function () {
          return "op=" + op + " gen=" + gen +
            " rects=" + (occluders ? occluders.length : "clear");
        }, "info");
      }
    }
  } catch (e) {

  }
}

import { isX11CandidateEnv, createX11Adapter } from './x11.js';
const POLL_INTERVAL_MS = 1000;
const EVENT_COALESCE_MS = 200;
const RETRY_START_MS = 30_000;
const POLL_TIMEOUT_MS = 3_000;
export function createOcclusionHub({
  log = () => {},
  diag,
  createAdapter = createX11Adapter,
  isCandidate = isX11CandidateEnv,
  pollMs = POLL_INTERVAL_MS,
  retryStartMs = RETRY_START_MS,
  pollTimeoutMs = POLL_TIMEOUT_MS,
  now = () => Date.now(),
  ownPid,
} = {}) {
  let adapter = null;
  let started = false;
  let disposed = false;
  let pollTimer = null;
  let retryTimer = null;
  let lastEventAt = 0;
  let busy = false;
  let dirty = false;
  let snapshot = degradedSnapshot(0, now());
  let lastContent = '';
  const seenLogs = new Set();
  const safeLog = (msg) => {
    try {
      log(msg);
    } catch {
    }
  };
  function degradedSnapshot(gen, ts) {
    return { ok: 1, backend: 'none', epoch: '', gen, own: null, rects: null, ts };
  }
  function logOnce(key, msg) {
    if (seenLogs.has(key)) return;
    seenLogs.add(key);
    safeLog(`[occlusion] ${msg}`);
  }
  function contentOf(core) {
    return JSON.stringify([core.epoch, core.own, core.rects]);
  }
  async function recompute() {
    if (busy || disposed || !adapter) return;
    busy = true;
    let pollGuard = null;
    try {
      const pollPromise = adapter.poll();
      const result = await (pollTimeoutMs > 0
        ? Promise.race([
            pollPromise,
            new Promise((_, reject) => {
              pollGuard = setTimeout(() => reject(new Error(`x11 poll timeout (${pollTimeoutMs}ms; connection dead?)`)), pollTimeoutMs);
            }),
          ])
        : pollPromise);
      if (!result) throw new Error('adapter returned null (connection dead)');
      const ts = now();
      const own = result.own
        ? { w: result.own.w, h: result.own.h }
        : null;
      const rects = result.own && result.own.w > 0 && result.own.h > 0
        ? result.occluders.map((r) => [r[0] - result.own.x, r[1] - result.own.y, r[2], r[3]])
        : null;
      const nextContent = contentOf({ epoch: result.epoch, own, rects });
      const gen = nextContent !== lastContent ? snapshot.gen + 1 : snapshot.gen;
      const changed = gen !== snapshot.gen;
      lastContent = nextContent;
      snapshot = {
        ok: 1,
        backend: 'x11',
        epoch: result.epoch,
        gen,
        own,
        rects,
        ts,
      };
      if (changed) {
        const areaOwn = own ? own.w * own.h : 0;
        const areaOcc = rects ? rects.reduce((a, r) => a + r[2] * r[3], 0) : 0;
        const visible = areaOwn > 0 ? Math.max(0, 1 - areaOcc / areaOwn) : 1;
        const line = `[occlusion] snapshot gen=${gen} own=${own ? `${own.w}x${own.h}` : 'null'} rects=${rects ? rects.length : 'null'} visible=${visible.toFixed(2)} epoch=${result.epoch}`;
        safeLog(line);
        if (typeof diag === 'function') {
          try {
            diag({ ev: 'snapshot', gen, own, rects: rects ? rects.length : null, visible: Number(visible.toFixed(3)), epoch: result.epoch });
          } catch {   }
        }
      }
    } catch (err) {
      const gen = snapshot.backend === 'none' ? snapshot.gen : snapshot.gen + 1;
      lastContent = 'none';
      snapshot = degradedSnapshot(gen, now());
      logOnce('poll-failed', `x11 poll failed, degraded to backend=none: ${err && err.message}`);
      if (typeof diag === 'function') {
        try {
          diag({ ev: 'degrade', gen, reason: String((err && err.message) || err).slice(0, 160) });
        } catch {   }
      }
      scheduleAdapterRestart();
    } finally {
       
       
      busy = false;
      if (pollGuard) clearTimeout(pollGuard);
      if (dirty && !disposed && adapter) {
        dirty = false;
        recompute().catch(() => {   });
      }
    }
  }
  function scheduleAdapterRestart() {
    if (disposed || retryTimer) return;
    if (adapter) {
      try {
        adapter.stop();
      } catch {
      }
      adapter = null;
    }
    started = false;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      start().catch(() => {   });
    }, retryStartMs);
  }
  async function start() {
    if (started || disposed) return;
    started = true;  
    if (!isCandidate()) {
      logOnce('not-candidate', 'not an X11 session (non-linux, no DISPLAY, or Wayland), backend=none');
      scheduleAdapterRestart();
      return;
    }
    try {
      adapter = createAdapter(ownPid === undefined ? {} : { ownPid });
      await adapter.start();
      if (disposed) return;
      adapter.onChange(onAdapterEvent);
      logOnce('started', `occlusion hub started (${snapshot.epoch || 'x11'})`);
      await recompute();
      pollTimer = setInterval(() => {
        recompute().catch(() => {   });
      }, pollMs);
    } catch (err) {
      snapshot = degradedSnapshot(snapshot.gen + 1, now());
      logOnce('start-failed', `x11 adapter start failed, backend=none: ${err && err.message}`);
      scheduleAdapterRestart();
    }
  }
  function onAdapterEvent() {
    const t = now();
    if (busy) {
      dirty = true;
      return;
    }
    if (t - lastEventAt < EVENT_COALESCE_MS) {
      dirty = true;
      return;
    }
    lastEventAt = t;
    recompute().catch(() => {   });
  }
  return {
    start,
    getSnapshot() {
      const s = snapshot;
      return {
        ...s,
        own: s.own ? { ...s.own } : null,
        rects: s.rects ? s.rects.map((r) => [r[0], r[1], r[2], r[3]]) : null,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (retryTimer) clearTimeout(retryTimer);
      pollTimer = retryTimer = null;
      if (adapter) {
        try {
          adapter.stop();
        } catch {
        }
        adapter = null;
      }
    },
  };
}
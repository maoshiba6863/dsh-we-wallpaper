import { spawn } from 'node:child_process';
const PROTOCOL_VERSION = 1;
const BANDS = 64;
const SPECTRUM_INTERVAL_MS = 50;
const CALL_TIMEOUT_MS = 8000;
const BOOT_CALL_TIMEOUT_MS = 25000;
const SPAWN_TIMEOUT_MS = 15000;
function bootCallTimeoutMs() {
  const raw = process.env.DSH_WE_MEDIA_BOOT_MS;
  if (raw === undefined || raw === '') return BOOT_CALL_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1000 ? n : BOOT_CALL_TIMEOUT_MS;
}
const KILL_GRACE_MS = 3000;
const MAX_RESTARTS = 3;
const RESTART_WINDOW_MS = 5 * 60 * 1000;
const STATUS_REFRESH_MS = 5000;
const IDLE_STOP_MS = (() => {
  const raw = process.env.DSH_WE_MEDIA_IDLE_MS;
  if (raw === undefined || raw === '') return 15 * 60 * 1000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 15 * 60 * 1000;
})();
function stateCode(state) {
  if (state === 'playing') return 1;
  if (state === 'paused') return 2;
  return 0;
}
export const MEDIA_CONTROL_ACTIONS = {
  play: 'play',
  pause: 'pause',
  playPause: 'play-pause',
  skipNext: 'next',
  skipPrevious: 'previous',
};
const CONTROL_TIMEOUT_MS = 5000;
export function lyricsToTuples(lyr) {
  if (!lyr || !Array.isArray(lyr.lines) || !lyr.lines.length) return null;
  const off = Number(lyr.offsetMs) || 0;
  const out = [];
  for (const ln of lyr.lines) {
    const raw = ln && ln.tMs;
    if (raw === null || raw === undefined || typeof raw === 'boolean' || typeof raw === 'object') continue;
    const ms = Number(raw);
    if (!Number.isFinite(ms)) continue;
    out.push([Math.max(0, (ms + off) / 1000), String(ln.text == null ? '' : ln.text)]);
  }
  return out.length ? out : null;
}
export function bridgeServeArgs({ cacheDir = '', audio = true, online = false, mock = false, verbose = false } = {}) {
  const args = ['serve', '--cache-dir', String(cacheDir), '--poll-ms', '1000'];
  if (!audio) args.push('--no-audio');
  args.push(online ? '--online' : '--no-online');
  if (mock) args.push('--provider', 'mock');
  if (verbose) args.push('--verbose');
  return args;
}
export function createBridgeSupervisor({ binPath, cacheDir, log = () => {}, diag = () => {}, onFatal = null }) {
  let child = null;
  let buf = '';
  let seq = 0;
  const pending = new Map();
  const optsRef = { audio: true, online: false, mock: false };
  const lyricsMemo = { key: '', value: null };
  let started = false;
  let stopping = false;
  let booted = false;
  let asleep = false;
  let fatal = '';
  let info = null;
  let snap = null;
  let art = { path: '', mime: '' };
  let spectrum = new Uint8Array(BANDS);
  let sources = [];
  let lastError = '';
  let lastStderr = '';
  let lastStdout = '';
  let spawnVia = '';
  let lastUsedAt = Date.now();
  let lastStatusAt = 0;
  let statusRefreshing = false;
  const restartAt = [];
  let restartTimer = null;
  let idleTimer = null;
  let booting = null;
  function onLine(line) {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.event) { onEvent(msg); return; }
    if (msg.id !== undefined && msg.id !== null && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error((msg.error && (msg.error.code + ': ' + msg.error.message)) || '协议错误'));
    }
  }
  function onEvent(ev) {
    const ts = Number(ev.tsMs) || Date.now();
    switch (ev.event) {
      case 'track':
      case 'playback':
        if (ev.now) applySnapshot(ev.now, ts);
        break;
      case 'artwork':
        if (ev.artwork) {
          art = { path: String(ev.artwork.path || ''), mime: String(ev.artwork.mime || '') };
          if (snap && snap.track) snap.track.artwork = ev.artwork;
          diag('media-artwork', { mime: art.mime, bytes: Number(ev.artwork.bytes) || 0 });
        }
        break;
      case 'lyrics':
        if (snap && snap.track) {
          const cur = snap.track.id;
          if (!ev.trackId || !cur || ev.trackId === cur) snap.track.lyrics = ev.lyrics || null;
        }
        lyricsMemo.key = '';
        break;
      case 'status':
        if (ev.status && Array.isArray(ev.status.sources)) sources = ev.status.sources;
        break;
      case 'spectrum':
        if (ev.frame && Array.isArray(ev.frame.bands)) frameToSpectrum(ev.frame.bands);
        break;
      case 'error':
        lastError = String(ev.message || ev.code || '未知错误');
        log('中间件报错：' + lastError, 'warn');
        diag('media-error', { source: ev.source || '', code: ev.code || '', message: lastError.slice(0, 200) });
        break;
      default:
        break;
    }
  }
  function frameToSpectrum(bands) {
    const out = new Uint8Array(BANDS);
    const n = Math.min(BANDS, bands.length);
    for (let i = 0; i < n; i++) {
      const v = Number(bands[i]);
      out[i] = Number.isFinite(v) ? Math.max(0, Math.min(255, Math.round(v))) : 0;
    }
    spectrum = out;
  }
  function applySnapshot(now, refMs) {
    snap = now;
    const pb = snap && snap.playback;
    if (pb && pb.positionSource === 'interpolated' && refMs) pb.updatedAtMs = refMs;
    const a = snap && snap.track && snap.track.artwork;
    if (a && a.path) art = { path: String(a.path), mime: String(a.mime || '') };
    lyricsMemo.key = '';
  }
  function call(method, params = {}, timeoutMs = CALL_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      if (!child || !child.stdin || child.stdin.destroyed) { reject(new Error('中间件未运行')); return; }
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(method + ' 超时'));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
      } catch (err) {
        clearTimeout(timer);
        pending.delete(id);
        reject(err);
      }
    });
  }
  function drainPending(err) {
    for (const [, p] of pending) { clearTimeout(p.timer); try { p.reject(err); } catch {   } }
    pending.clear();
  }
  function childArgs() {
    return bridgeServeArgs({
      cacheDir,
      audio: optsRef.audio,
      online: optsRef.online,
      mock: optsRef.mock,
      verbose: process.env.DSH_WE_MEDIA_DEBUG === '1',
    });
  }
  function killWhenSpawned(p) {
    if (!p) return;
    if (p.pid !== undefined) { try { p.kill('SIGKILL'); } catch {   } }
    p.once('spawn', () => { try { p.kill('SIGKILL'); } catch {   } });
  }
  function awaitSpawn(p) {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error('spawn 超时'));
      }, SPAWN_TIMEOUT_MS);
      p.once('spawn', () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      });
      p.once('error', (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }
  async function spawnChild() {
    const attempts = process.platform === 'win32'
      ? [{ name: 'detached', opts: { detached: true, windowsHide: true } }, { name: 'plain', opts: { windowsHide: true } }]
      : [{ name: 'plain', opts: { windowsHide: true } }, { name: 'detached', opts: { detached: true, windowsHide: true } }];
    const errors = [];
    for (const a of attempts) {
      let p = null;
      try {
        p = spawn(binPath, childArgs(), { stdio: ['pipe', 'pipe', 'pipe'], ...a.opts });
        await awaitSpawn(p);
        spawnVia = a.name;
        if (a.name !== attempts[0].name) diag('media-spawn', { via: a.name });
        return p;
      } catch (err) {
        const msg = `${a.name}: ${String(err && err.message ? err.message : err)}`;
        errors.push(msg);
        killWhenSpawned(p);
      }
    }
    throw new Error('无法启动中间件（' + errors.join('; ') + '）');
  }
  function attach(p) {
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (line.trim()) {
          if (!lastStdout && line.charCodeAt(0) !== 0x7b) lastStdout = line.slice(0, 200);
          onLine(line);
        }
      }
      if (buf.length > 1 << 20) buf = '';
    });
    p.stderr.setEncoding('utf8');
    p.stderr.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (!text) return;
      lastStderr = text.slice(0, 400);
      if (process.env.DSH_WE_MEDIA_DEBUG === '1') log('中间件: ' + lastStderr, 'info');
    });
    p.on('exit', (code, signal) => {
      if (child !== p) return;
      child = null;
      booted = false;
      drainPending(new Error('中间件已退出'));
      if (stopping || asleep) return;
      onUnexpectedExit(code, signal);
    });
  }
  function onUnexpectedExit(code, signal) {
    const now = Date.now();
    restartAt.push(now);
    while (restartAt.length && now - restartAt[0] > RESTART_WINDOW_MS) restartAt.shift();
    const reason = `中间件退出（code ${code}${signal ? ', ' + signal : ''}）${lastStderr ? '：' + lastStderr : ''}`;
    lastError = reason;
    diag('media-exit', { code, signal, restarts: restartAt.length });
    if (restartAt.length > MAX_RESTARTS) {
      fatal = `${reason} —— 连续失败 ${restartAt.length} 次，本次会话改用内置实现`;
      log(fatal, 'warn');
      diag('media-fatal', { reason: fatal.slice(0, 200) });
      if (typeof onFatal === 'function') { try { onFatal(fatal); } catch {   } }
      return;
    }
    const delay = 500 * Math.pow(2, Math.max(0, restartAt.length - 1));
    log(`中间件退出，${delay}ms 后重启（第 ${restartAt.length} 次）`, 'warn');
    restartTimer = setTimeout(() => {
      restartTimer = null;
      startBoot();
    }, delay);
    if (restartTimer.unref) restartTimer.unref();
  }
  function startBoot() {
    if (booting) return booting;
    if (stopping || fatal) return Promise.resolve(false);
    booting = (async () => {
      const bootMs = bootCallTimeoutMs();
      try {
        buf = '';
        const p = await spawnChild();
        child = p;
        asleep = false;
        attach(p);
        const hello = await call('hello', {}, bootMs);
        if (!hello || Number(hello.protocol) !== PROTOCOL_VERSION) {
          throw new Error(`协议版本不匹配（中间件 protocol=${hello && hello.protocol}，本插件支持 ${PROTOCOL_VERSION}）`);
        }
        info = hello;
        const events = ['track', 'playback', 'artwork', 'lyrics', 'status'];
        if (optsRef.audio) events.push('spectrum');
        await call('subscribe', optsRef.audio
          ? { events, intervalMs: SPECTRUM_INTERVAL_MS }
          : { events }, bootMs);
        const now = await call('now', { interpolate: false }, bootMs);
        if (now) applySnapshot(now, Date.now());
        try {
          const st = await call('status', {}, bootMs);
          if (st && Array.isArray(st.sources)) sources = st.sources;
        } catch {   }
        booted = true;
        lastError = '';
        restartAt.length = 0;
        log(`系统媒体中间件就绪：${hello.provider || ''} ${hello.version || ''}（${hello.platform || ''}/${hello.arch || ''}）`
          + (optsRef.audio ? '，含系统音频' : '，仅元数据'), 'info');
        diag('media-ready', {
          version: hello.version, provider: hello.provider, platform: hello.platform,
          arch: hello.arch, audio: optsRef.audio, online: optsRef.online,
        });
        return true;
      } catch (err) {
        lastError = String(err && err.message ? err.message : err);
        const alive = Boolean(child);
        const spoke = lastStderr ? '，子进程 stderr：' + lastStderr
          : (lastStdout ? '，子进程 stdout：' + lastStdout : '，子进程两路输出都为空');
        log('中间件启动失败：' + lastError + '（预算 ' + bootMs + 'ms，存活=' + alive
          + '，姿势=' + (spawnVia || '?') + spoke + '）', 'warn');
        diag('media-boot-failed', {
          reason: lastError.slice(0, 200), bin: binPath, budgetMs: bootMs, alive,
          via: spawnVia, stderr: lastStderr.slice(0, 200), stdout: lastStdout.slice(0, 200),
        });
        hardStop();
        return false;
      } finally {
        booting = null;
      }
    })();
    return booting;
  }
  function refreshStatusSoon() {
    const now = Date.now();
    if (statusRefreshing || now - lastStatusAt < STATUS_REFRESH_MS) return;
    lastStatusAt = now;
    statusRefreshing = true;
    call('status')
      .then((st) => { if (st && Array.isArray(st.sources)) sources = st.sources; })
      .catch(() => {   })
      .finally(() => { statusRefreshing = false; });
  }
  function touch() {
    lastUsedAt = Date.now();
    if (asleep && !fatal && !stopping) {
      asleep = false;
      startBoot();
    }
  }
  function ensureIdleTimer() {
    if (idleTimer || !IDLE_STOP_MS) return;
    idleTimer = setInterval(() => {
      if (stopping || !child) return;
      if (Date.now() - lastUsedAt < IDLE_STOP_MS) return;
      log('媒体中间件空闲超时，退出（下次被访问时自动拉起）', 'info');
      diag('media-idle-stop', { idleMs: Date.now() - lastUsedAt });
      asleep = true;
      hardStop();
    }, Math.min(60 * 1000, Math.max(5000, Math.floor(IDLE_STOP_MS / 4))));
    if (idleTimer.unref) idleTimer.unref();
  }
  function hardStop() {
    const p = child;
    child = null;
    booted = false;
    drainPending(new Error('中间件已停止'));
    if (!p) return;
    try { p.stdin.end(); } catch {   }
    if (p.pid !== undefined) { try { p.kill('SIGTERM'); } catch {   } }
    const t2 = setTimeout(() => killWhenSpawned(p), KILL_GRACE_MS);
    if (t2.unref) t2.unref();
  }
  function statusOf(name) {
    return sources.find((s) => s && s.name === name) || null;
  }
  function mapSource(name, fallbackStatus) {
    const s = statusOf(name);
    if (!s) return { status: fallbackStatus, hint: '' };
    const st = s.state === 'error' ? 'unavailable' : String(s.state || fallbackStatus);
    return { status: st, hint: String(s.hint || '') };
  }
  function lyricsFor(track) {
    const lyr = track && track.lyrics;
    const key = lyr && Array.isArray(lyr.lines)
      ? `${track.id || ''}|${lyr.lines.length}|${lyr.offsetMs || 0}|${lyr.source || ''}`
      : '';
    if (!key) return null;
    if (lyricsMemo.key === key) return lyricsMemo.value;
    lyricsMemo.key = key;
    lyricsMemo.value = lyricsToTuples(lyr);
    return lyricsMemo.value;
  }
  return {
    async start(opts = {}) {
      if (started) return booted;
      started = true;
      stopping = false;
      Object.assign(optsRef, {
        audio: opts.audio !== false,
        online: opts.online === true,
        mock: opts.mock === true || process.env.DSH_WE_MEDIA_PROVIDER === 'mock',
      });
      ensureIdleTimer();
      lastUsedAt = Date.now();
      return startBoot();
    },
    stop() {
      stopping = true;
      if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
      if (idleTimer) { clearInterval(idleTimer); idleTimer = null; }
      hardStop();
    },
    ready: () => Boolean(child && booted && !fatal),
    fatalReason: () => fatal,
    lastError: () => lastError,
    info: () => (info ? { ...info } : null),
    spectrum: () => { touch(); return spectrum; },
    nowPlaying() {
      touch();
      if (!snap || !snap.hasMedia || !snap.track) return null;
      const t = snap.track;
      const pb = snap.playback || {};
      const durMs = Number(pb.durationMs) || Number(t.durationMs) || 0;
      const playing = pb.state === 'playing';
      let posMs = Number(pb.positionMs) || 0;
      if (playing && pb.positionSource !== 'unavailable') {
        const ref = Number(pb.updatedAtMs) || 0;
        const rate = Number.isFinite(Number(pb.rate)) && Number(pb.rate) > 0 ? Number(pb.rate) : 1;
        if (ref) posMs += Math.max(0, Date.now() - ref) * rate;
        if (durMs > 0) posMs = Math.min(posMs, durMs);
      }
      const hasArt = Boolean(art.path);
      const lyrics = lyricsFor(t);
      return {
        hasMedia: true,
        title: String(t.title || ''),
        artist: String(t.artist || ''),
        album: String(t.album || ''),
        albumArtist: String(t.albumArtist || ''),
        playing,
        state: stateCode(pb.state),
        position: Math.max(0, posMs) / 1000,
        duration: durMs / 1000,
        thumbnail: hasArt ? '/wallpaper-engine/now-playing/artwork' : undefined,
        loopMode: String(pb.loopMode || ''),
        shuffle: pb.shuffle === true,
        appName: String((t.source && t.source.appName) || ''),
        ...(lyrics ? { lyrics } : {}),
      };
    },
    artworkFile: () => (art.path || null),
    artworkMime: () => (art.mime || ''),
    async control(action) {
      const mapped = MEDIA_CONTROL_ACTIONS[action];
      if (!mapped) return { ok: false, error: 'unknown-action' };
      touch();
      try {
        const report = await call('control', { action: mapped }, CONTROL_TIMEOUT_MS);
        if (report && report.now) applySnapshot(report.now, Date.now());
        return { ok: true, action, outcome: (report && report.outcome) || null };
      } catch (err) {
        const msg = String(err && err.message ? err.message : err);
        diag('media-control', { action: mapped, error: msg.slice(0, 120) });
        return { ok: false, error: msg };
      }
    },
    status() {
      touch();
      refreshStatusSoon();
      const audio = optsRef.audio
        ? mapSource('audio', 'idle')
        : { status: 'off', hint: '已在设置中关闭「系统音频反应」' };
      const np = mapSource('metadata', 'idle');
      const lyrics = mapSource('lyrics', 'idle');
      return {
        backend: 'bridge',
        bridge: info ? {
          version: info.version, platform: info.platform, arch: info.arch,
          provider: info.provider, protocol: info.protocol, pid: info.pid,
          features: Array.isArray(info.features) ? info.features : [],
        } : null,
        audio: { status: audio.status, hint: audio.hint },
        nowPlaying: { status: np.status, hint: np.hint },
        lyrics: { status: lyrics.status, hint: lyrics.hint },
        sources: sources.slice(),
      };
    },
  };
}
export { BANDS };
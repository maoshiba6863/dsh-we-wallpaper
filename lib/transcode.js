import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  openSync, readSync, writeSync, closeSync, readFileSync, fsyncSync, chmodSync,
  mkdirSync, existsSync, statSync, renameSync, unlinkSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMediaInfo } from './media-probe.js';
export function createTranscodeKit({ configPath, transcodeCacheDir, ensureDirOnce, atomicTmpPath }) {
  const TRANSCODE_INFLIGHT = new Map();
  const TRANSCODE_TIMEOUT_MS = Number(process.env.DSH_WE_TRANSCODE_TIMEOUT_MS) || 15 * 60 * 1000;
  const ACTIVE_FFMPEG = new Set();
  const TRANSCODE_MAX_CONCURRENT = 2;
  let transcodeActive = 0;
  const transcodeWaiters = [];
  function acquireTranscodeSlot() {
    if (transcodeActive < TRANSCODE_MAX_CONCURRENT) {
      transcodeActive += 1;
      return Promise.resolve();
    }
    return new Promise((resolveSlot) => { transcodeWaiters.push(resolveSlot); });
  }
  function releaseTranscodeSlot() {
    const next = transcodeWaiters.shift();
    if (next) next();
    else transcodeActive -= 1;
  }
  function ensureTranscodeCacheDir() {
    return ensureDirOnce(transcodeCacheDir());
  }
  const FFMPEG_STATIC_TAG = 'b6.0';
  const FFMPEG_STATIC_ASSETS = {
    win32: { x64: 'ffmpeg-win32-x64', ia32: 'ffmpeg-win32-ia32' },
    linux: { x64: 'ffmpeg-linux-x64', ia32: 'ffmpeg-linux-ia32', arm: 'ffmpeg-linux-arm', arm64: 'ffmpeg-linux-arm64' },
    darwin: { x64: 'ffmpeg-darwin-x64', arm64: 'ffmpeg-darwin-arm64' },
  };
  const FFMPEG_STATIC_SHA256 = {
    'ffmpeg-win32-x64': 'e9fd5e711debab9d680955fc1e38a2c1160fd280b144476cc3f62bc43ef49db1',
    'ffmpeg-win32-ia32': 'fb3766af5cc193ca863e15cd4554a33732973209dad5e3c1433b5e291bceb16c',
    'ffmpeg-linux-x64': 'ed652b2f32e0851d1946894fb8333f5b677c1b2ce6b9d187910a67f8b99da028',
    'ffmpeg-linux-ia32': '103500b65ccb78c3c804088d6e17111d85e2bd03f5a0c61c349dc2d05e165f09',
    'ffmpeg-linux-arm': '1a9ddc19d0e071b6e1ff6f8f34dc05ec6dd4d8f3e79a649f5a9ec0e8c929c4cb',
    'ffmpeg-linux-arm64': '237800b37bb65a81ad47871c6c8b7c45c0a3ca62a5b3f9d2a7a9a2dd9a338271',
    'ffmpeg-darwin-x64': 'cfe20936c83ecf5d68e424b87e8cc45b24dd6be81787810123bb964a0df686f9',
    'ffmpeg-darwin-arm64': 'a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584',
  };
  function ffmpegDataDir() {
    const dir = join(dirname(configPath()), 'ffmpeg');
    try { mkdirSync(dir, { recursive: true }); } catch {   }
    return dir;
  }
  function ffmpegExeName() {
    return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  }
  function ffmpegMagicOk(buf) {
    if (buf.length < 4) return false;
    const mz = buf[0] === 0x4d && buf[1] === 0x5a;
    const elf = buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46;
    const mach = buf[0] === 0xcf && buf[1] === 0xfa && buf[2] === 0xed && buf[3] === 0xfe;
    return mz || elf || mach;
  }
  let ffmpegDownloadPromise = null;
  let lastFfmpegDownloadError = null;
  const transcodeJobs = new Map();
  const TRANSCODE_JOBS_MAX = 64;
  function setTranscodeJob(job) {
    transcodeJobs.set(job.key, job);
    if (transcodeJobs.size > TRANSCODE_JOBS_MAX) {
      const first = transcodeJobs.keys().next().value;
      if (first !== undefined) transcodeJobs.delete(first);
    }
  }
  function ffmpegDownloadUrls(asset) {
    const env = process.env.DSH_WE_FFMPEG_URL && process.env.DSH_WE_FFMPEG_URL.trim();
    if (env) return [env];
    return [
      'https://registry.npmmirror.com/-/binary/ffmpeg-static/' + FFMPEG_STATIC_TAG + '/' + asset,
      'https://github.com/eugeneware/ffmpeg-static/releases/download/' + FFMPEG_STATIC_TAG + '/' + asset,
    ];
  }
  async function downloadFfmpegToFile(url, tmp, ctrl, job) {
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': 'dsh-wallpaper-engine' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    if (!res.body) throw new Error('no response body');
    const reader = res.body.getReader();
    const fd = openSync(tmp, 'w');
    let total = 0;
    const totalBytes = Number(res.headers.get('content-length')) || 0;
    if (job && job.phase === 'download') {
      job.total = totalBytes;
      job.source = url;
    }
    const hash = createHash('sha256');
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.length) {
          let off = 0;
          while (off < value.length) {
            off += writeSync(fd, value, off, value.length - off);
          }
          hash.update(value);
          total += value.length;
          if (job && job.phase === 'download') {
            job.downloaded = total;
          }
        }
      }
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (total < 20 * 1024 * 1024) throw new Error('implausible size ' + total);
    const head = Buffer.alloc(8);
    const rfd = openSync(tmp, 'r');
    try {
      let got = 0;
      while (got < 8) { const n = readSync(rfd, head, got, 8 - got, got); if (n <= 0) break; got += n; }
    } finally {
      closeSync(rfd);
    }
    if (!ffmpegMagicOk(head)) throw new Error('unrecognized binary magic');
    return { total, sha256: hash.digest('hex') };
  }
  async function ensureDownloadedFfmpeg(job) {
    const target = join(ffmpegDataDir(), ffmpegExeName());
    if (existsSync(target)) return target;
    const assets = FFMPEG_STATIC_ASSETS[process.platform];
    const asset = assets && assets[process.arch];
    if (!asset) {
      lastFfmpegDownloadError = 'unsupported platform ' + process.platform + '/' + process.arch;
      return null;
    }
    if (typeof fetch !== 'function') {
      lastFfmpegDownloadError = 'fetch unavailable (Node < 18?)';
      return null;
    }
    if (ffmpegDownloadPromise) return ffmpegDownloadPromise;
    ffmpegDownloadPromise = (async () => {
      const urls = ffmpegDownloadUrls(asset);
      const ctrls = urls.map(() => new AbortController());
      const tmpFiles = urls.map((u, i) => target + '.part' + i);
      const timers = ctrls.map((c) => setTimeout(() => c.abort(), 5 * 60 * 1000));
      const errors = [];
      const cleanup = () => timers.forEach(clearTimeout);
      const win = await new Promise((resolve) => {
        let done = false;
        let remaining = urls.length;
        urls.forEach((url, i) => {
          downloadFfmpegToFile(url, tmpFiles[i], ctrls[i], job)
            .then((r) => {
              if (done) return;
              const want = FFMPEG_STATIC_SHA256[asset];
              if (want && r.sha256 !== want) {
                errors.push(url + ' → sha256 mismatch');
                try { unlinkSync(tmpFiles[i]); } catch {   }
                remaining--; if (remaining === 0) { done = true; resolve(-1); }
                return;
              }
              done = true;
              resolve(i);
            })
            .catch((err) => {
              if (done) return;
              errors.push(url + ' → ' + String(err && err.message ? err.message : err));
              remaining--; if (remaining === 0) { done = true; resolve(-1); }
            });
        });
      });
      cleanup();
      if (win < 0) {
        try { tmpFiles.forEach((f) => { try { unlinkSync(f); } catch {   } }); } catch {   }
        lastFfmpegDownloadError = errors.join('; ') || 'all sources failed';
        return null;
      }
      for (let i = 0; i < ctrls.length; i++) {
        if (i !== win) {
          ctrls[i].abort();
          try { unlinkSync(tmpFiles[i]); } catch {   }
        }
      }
      if (process.platform !== 'win32') { try { chmodSync(tmpFiles[win], 0o755); } catch {   } }
      renameSync(tmpFiles[win], target);
      lastFfmpegDownloadError = null;
      return target;
    })().catch((err) => {
      lastFfmpegDownloadError = 'download internal error: ' + String(err && err.message ? err.message : err);
      return null;
    }).finally(() => {
      ffmpegDownloadPromise = null;
    });
    return ffmpegDownloadPromise;
  }
  async function resolveFfmpeg(job) {
    if (process.env.DSH_WE_FFMPEG && process.env.DSH_WE_FFMPEG.trim()) {
      return process.env.DSH_WE_FFMPEG.trim();
    }
    try {
      const local = join(dirname(fileURLToPath(import.meta.url)), '..', 'ffmpeg', ffmpegExeName());
      if (existsSync(local)) return local;
    } catch {   }
    const dl = await ensureDownloadedFfmpeg(job);
    if (dl) return dl;
    return ffmpegExeName();
  }
  function spawnFfmpeg(ff, args, timeoutMs, opts = {}) {
    const limit = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : TRANSCODE_TIMEOUT_MS;
    const signal = (opts && opts.signal) || null;
    return new Promise((resolve, reject) => {
      const errLog = join(ensureTranscodeCacheDir(), 'ffmpeg-err-' + process.pid + '-' + Date.now() + '.log');
      const attempts = [
        { name: 'detached', opts: { detached: true, windowsHide: true } },
        { name: 'plain', opts: { windowsHide: true } },
      ];
      let idx = 0;
      let curProc = null;
      const onAbort = () => {
        if (curProc && curProc.pid !== undefined) { try { curProc.kill(); } catch {   } }
      };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      const errors = [];
      const runNext = () => {
        if (idx >= attempts.length) {
          if (signal) signal.removeEventListener('abort', onAbort);
          let detail = errors.join('; ');
          try {
            const t = readFileSync(errLog, 'utf8').trim();
            if (t) detail += ' | stderr: ' + t.split('\n').slice(-4).join(' | ');
          } catch {   }
          try { unlinkSync(errLog); } catch {   }
          reject(new Error('ffmpeg spawn failed' + (detail ? ': ' + detail : '')));
          return;
        }
        const a = attempts[idx++];
        let errFd = null;
        try { errFd = openSync(errLog, 'w'); } catch {   }
        let proc = null;
        try {
          const spawnCwd = process.env.SystemRoot
            || (process.platform === 'win32' ? 'C:\\' : undefined);
          proc = spawn(a.file || ff, a.args || args,
            { ...a.opts, cwd: spawnCwd, stdio: errFd ? ['ignore', 'ignore', errFd] : 'ignore' });
        } catch (err) {
          if (errFd) { try { closeSync(errFd); } catch {   } }
          errors.push(a.name + ' spawn throw ' + (err && err.code ? err.code : err));
          runNext();
          return;
        }
        curProc = proc;
        ACTIVE_FFMPEG.add(proc);
        if (signal && signal.aborted) {
          if (proc.pid !== undefined) { try { proc.kill(); } catch {   } }
          ACTIVE_FFMPEG.delete(proc);
          curProc = null;
          if (errFd) { try { closeSync(errFd); } catch {   } }
          signal.removeEventListener('abort', onAbort);
          try { unlinkSync(errLog); } catch {   }
          reject(new Error('ffmpeg aborted'));
          return;
        }
        let done = false;
        let timedOut = false;
        const settle = (msg) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          ACTIVE_FFMPEG.delete(proc);
          if (curProc === proc) curProc = null;
          if (errFd) { try { closeSync(errFd); } catch {   } }
          errors.push(msg);
          runNext();
        };
        const timer = setTimeout(() => {
          timedOut = true;
          if (proc.pid !== undefined) { try { proc.kill(); } catch {   } }
          settle(a.name + ' timed out after ' + limit + 'ms');
        }, limit);
        proc.on('error', (err) => {
          settle(a.name + ' spawn error ' + (err && err.code ? err.code + ' ' + err.message : err));
        });
        proc.on('exit', (code) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          ACTIVE_FFMPEG.delete(proc);
          if (curProc === proc) curProc = null;
          if (errFd) { try { closeSync(errFd); } catch {   } }
          if (code === 0) {
            try { unlinkSync(errLog); } catch {   }
            if (signal) signal.removeEventListener('abort', onAbort);
            resolve();
            return;
          }
          errors.push(a.name + ' exit ' + code + (timedOut ? ' (killed by timeout)' : ''));
          runNext();
        });
      };
      runNext();
    });
  }
  async function runFfmpegTranscode(abs, out, fps, signal) {
    const key = abs + '|' + fps;
    const job = { key, phase: 'download', downloaded: 0, total: 0, source: '' };
    setTranscodeJob(job);
    const ff = await resolveFfmpeg(job);
    const mi = getMediaInfo(abs);
    const pixels = mi && mi.width && mi.height ? mi.width * mi.height : 3840 * 2160;
    const bitrate = Math.round(Math.min(20e6, Math.max(4e6, 20e6 * pixels / (3840 * 2160))));
    job.phase = 'transcode';
    job.downloaded = 0;
    job.total = 0;
    job.source = ff;
    job.outFile = out;
    job.expectedBytes = mi && mi.duration ? Math.round((bitrate / 8) * mi.duration) : null;
    job.samples = [];
    const base = ['-y', '-hide_banner', '-loglevel', 'error', '-i', abs,
      '-map', '0:v:0', '-an',
      '-vf', 'fps=' + String(fps), '-g', String(fps * 2)];
    const ENC_TUNE = {
      av1_nvenc: ['-preset', 'p1', '-b:v', String(bitrate), '-maxrate', String(bitrate), '-bufsize', String(bitrate * 2)],
      h264_nvenc: ['-preset', 'p1', '-b:v', String(bitrate), '-maxrate', String(bitrate), '-bufsize', String(bitrate * 2)],
      libx264: ['-preset', 'veryfast', '-crf', '20'],
    };
    if (mi && mi.duration && isFinite(mi.duration) && mi.duration > 0) {
      base.push('-t', String(mi.duration));
    }
    const deadline = Date.now() + TRANSCODE_TIMEOUT_MS;
    let lastErr = null;
    for (const enc of ['av1_nvenc', 'h264_nvenc', 'libx264']) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        lastErr = new Error('transcode deadline exceeded (' + TRANSCODE_TIMEOUT_MS + 'ms total)');
        break;
      }
      try {
        const tune = ENC_TUNE[enc] || [];
        await spawnFfmpeg(ff, [...base, ...tune, '-c:v', enc, '-movflags', '+faststart', '-f', 'mp4', out],
          remaining, { signal });
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    throw new Error('ffmpeg transcode failed (ff=' + ff + ')'
      + (lastErr ? ': ' + lastErr.message : '')
      + (lastFfmpegDownloadError ? ' | download: ' + lastFfmpegDownloadError : ''));
  }
  function transcodeCacheKey(abs, mtimeMs, fps) {
    return createHash('sha256')
      .update(abs + '|' + Math.round(mtimeMs) + '|' + fps)
      .digest('hex').slice(0, 20);
  }
  function transcodeCachePathFor(abs, fps) {
    let st;
    try { st = statSync(abs); } catch { return null; }
    return join(transcodeCacheDir(), 'tc_' + transcodeCacheKey(abs, st.mtimeMs, fps) + '.mp4');
  }
  function transcodeToFps(abs, fps, onEntry) {
    const st = statSync(abs);
    const key = transcodeCacheKey(abs, st.mtimeMs, fps);
    const cachePath = join(ensureTranscodeCacheDir(), 'tc_' + key + '.mp4');
    if (existsSync(cachePath)) return Promise.resolve(cachePath);
    let entry = TRANSCODE_INFLIGHT.get(cachePath);
    if (entry) {
      if (typeof onEntry === 'function') onEntry(entry);
      return entry.promise;
    }
    const ctrl = new AbortController();
    const tmp = atomicTmpPath(cachePath);
    const cancel = () => {
      if (ctrl.signal.aborted) return;
      ctrl.abort();
      try { unlinkSync(tmp); } catch {   }
      TRANSCODE_INFLIGHT.delete(cachePath);
    };
    const p = (async () => {
      const progKey = abs + '|' + fps;
      await acquireTranscodeSlot();
      try {
        await runFfmpegTranscode(abs, tmp, fps, ctrl.signal);
        renameSync(tmp, cachePath);
        const job = transcodeJobs.get(progKey);
        if (job) job.phase = 'done';
        return cachePath;
      } catch (err) {
        try { unlinkSync(tmp); } catch {   }
        const job = transcodeJobs.get(progKey);
        if (job) job.phase = 'error';
        throw err;
      } finally {
        releaseTranscodeSlot();
        if (TRANSCODE_INFLIGHT.get(cachePath) === entry) TRANSCODE_INFLIGHT.delete(cachePath);
      }
    })();
    entry = { promise: p, waiters: 0, cancel };
    TRANSCODE_INFLIGHT.set(cachePath, entry);
    if (typeof onEntry === 'function') onEntry(entry);
    return entry.promise;
  }
  function registerTranscodeWaiter(entry, res) {
    if (!entry) return;
    entry.waiters++;
    const onClose = () => {
      entry.waiters--;
      if (entry.waiters <= 0) entry.cancel();
    };
    res.once('close', onClose);
  }
  function disposeTranscodes() {
    for (const proc of ACTIVE_FFMPEG) {
      if (proc.pid !== undefined) { try { proc.kill(); } catch {   } }
    }
    ACTIVE_FFMPEG.clear();
    for (const job of transcodeJobs.values()) {
      if (job.phase === 'download' || job.phase === 'transcode') job.phase = 'error';
    }
    TRANSCODE_INFLIGHT.clear();
  }
  return {
    transcodeToFps,
    registerTranscodeWaiter,
    transcodeJobs,
    transcodeCacheKey,
    transcodeCachePathFor,
    resolveFfmpeg,
    spawnFfmpeg,
    ffmpegDataDir,
    disposeTranscodes,
  };
}
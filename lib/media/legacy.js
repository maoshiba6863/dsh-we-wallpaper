import { spawn, execFile, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, renameSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const BANDS = 64;
const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const TAP_SWIFT = resolve(SELF_DIR, '..', 'audio-tap.swift');
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1;
      let cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cwr - im[i + k + len / 2] * cwi;
        const vi = re[i + k + len / 2] * cwi + im[i + k + len / 2] * cwr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const nwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr;
        cwr = nwr;
      }
    }
  }
}
function bandsFromPcm(samples, out) {
  const n = samples.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    re[i] = samples[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  fft(re, im);
  const half = n / 2;
  const usable = half * 0.72;
  const lo = 2;
  for (let b = 0; b < BANDS; b++) {
    const f0 = lo + Math.floor(usable * (b / BANDS) ** 2);
    const f1 = Math.max(f0 + 1, lo + Math.floor(usable * ((b + 1) / BANDS) ** 2));
    let peak = 0;
    for (let f = f0; f < f1 && f < half; f++) {
      const mag = Math.sqrt(re[f] * re[f] + im[f] * im[f]) / n;
      if (mag > peak) peak = mag;
    }
    const db = 20 * Math.log10(Math.max(peak, 1e-7));
    const norm = Math.max(0, Math.min(1, (db + 70) / 70));
    out[b] = Math.round(norm * 255);
  }
  return out;
}
function detectFfmpegSource(platform) {
  if (platform === 'linux') {
    let monitor = '@DEFAULT_MONITOR@';
    try {
      const r = spawnSync('pactl', ['info'], { encoding: 'utf8', timeout: 3000, windowsHide: true });
      const sink = r.status === 0 ? (/Default Sink:\s*(\S+)/.exec(r.stdout || '') || [])[1] : null;
      if (sink) monitor = sink + '.monitor';
    } catch {   }
    return {
      args: ['-hide_banner', '-loglevel', 'error', '-f', 'pulse', '-i', monitor,
             '-f', 's16le', '-ac', '1', '-ar', '16000', '-'],
      hint: '需要 ffmpeg 与 PulseAudio/PipeWire（monitor 源）',
    };
  }
  if (platform === 'win32') {
    let dev = null;
    try {
      const r = spawnSync('ffmpeg', ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'],
        { encoding: 'utf8', timeout: 5000, windowsHide: true });
      const text = (r.stdout || '') + (r.stderr || '');
      const m = /"([^"]*(?:Stereo Mix|立体声混音|CABLE Output|VB-Audio)[^"]*)"/i.exec(text);
      if (m) dev = m[1];
    } catch {   }
    if (!dev) {
      return {
        args: null,
        hint: '未检测到系统音频采集设备：请在「声音设置 → 录制」启用「立体声混音」，或安装 VB-Cable 虚拟声卡后重试（未启用时壁纸回落模拟频谱）',
      };
    }
    return {
      args: ['-hide_banner', '-loglevel', 'error', '-f', 'dshow', '-i', `audio=${dev}`,
             '-f', 's16le', '-ac', '1', '-ar', '16000', '-'],
      hint: String(dev),
    };
  }
  return null;
}
export function createMediaBridge({ dataDir, cacheBaseDir = join(dataDir, 'cache'), log = () => {}, audio = true }) {
  const cacheRoot = () => (typeof cacheBaseDir === 'function' ? cacheBaseDir() : cacheBaseDir);
  const state = {
    audio: { status: 'idle', hint: '' },
    nowPlaying: { status: 'idle', hint: '' },
  };
  let spectrum = new Uint8Array(BANDS);
  let np = null;
  let artworkFile = null;
  let artworkMime = '';
  let artworkKey = '';
  const ARTWORK_EXT = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp',
  };
  function writeArtwork(buf, mime) {
    try {
      const ext = ARTWORK_EXT[String(mime || '').toLowerCase()] || 'jpg';
      const dir = join(cacheRoot(), 'artwork');
      mkdirSync(dir, { recursive: true });
      for (const e of new Set(Object.values(ARTWORK_EXT))) {
        if (e !== ext) { try { unlinkSync(join(dir, 'now-playing.' + e)); } catch {   } }
      }
      const f = join(dir, 'now-playing.' + ext);
      writeFileSync(f, buf);
      artworkFile = f;
      artworkMime = mime || 'image/jpeg';
      return true;
    } catch {
      return false;
    }
  }
  let audioProc = null;
  let npTimer = null;
  let started = false;
  let stopped = false;
  const setAudio = (status, hint = '') => { state.audio = { status, hint }; };
  function ensureTapBinary() {
    const src = TAP_SWIFT;
    const bin = join(dataDir, 'bin', 'we-audio-tap');
    try {
      if (existsSync(bin) && statSync(bin).mtimeMs >= statSync(src).mtimeMs) return bin;
    } catch {   }
    mkdirSync(dirname(bin), { recursive: true });
    const r = spawnSync('swiftc', ['-O', src, '-o', bin + '.tmp'], { timeout: 180000, windowsHide: true });
    if (r.error || r.status !== 0) {
      setAudio('unavailable', '未找到 Swift 编译器（Xcode Command Line Tools）—— 安装后重试；当前回落模拟频谱');
      return null;
    }
    try { renameSync(bin + '.tmp', bin); } catch {   }
    return bin;
  }
  function spawnTap(bin) {
    let acc = Buffer.alloc(0);
    audioProc = spawn(bin, [], { stdio: ['ignore', 'pipe', 'pipe'] });
    audioProc.stdout.on('data', (c) => {
      acc = Buffer.concat([acc, c]);
      while (acc.length >= BANDS) {
        spectrum = new Uint8Array(acc.subarray(0, BANDS));
        acc = acc.subarray(BANDS);
      }
    });
    audioProc.stderr.on('data', (c) => {
      const m = String(c);
      if (/tap-create-failed/.test(m)) {
        setAudio('denied', '未获得「音频录制」权限：请在「系统设置 → 隐私与安全性 → 音频录制」中勾选 DSH Desktop（或你的终端/DSH 宿主），然后重试');
      } else if (/ready/.test(m)) {
        setAudio('running');
      } else if (/failed/.test(m)) {
        setAudio('unavailable', m.trim().slice(0, 200));
      }
    });
    audioProc.on('error', (err) => {
      audioProc = null;
      setAudio('unavailable', String((err && err.message) || err));
    });
    audioProc.on('exit', (code) => {
      audioProc = null;
      if (!stopped && state.audio.status === 'running') setAudio('unavailable', `采集进程退出（code ${code}）`);
    });
  }
  function spawnFfmpeg(spec) {
    let carry = Buffer.alloc(0);
    const N = 1024;
    audioProc = spawn('ffmpeg', spec.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    setAudio('running', spec.hint);
    audioProc.stdout.on('data', (c) => {
      carry = Buffer.concat([carry, c]);
      const need = N * 2;
      while (carry.length >= need) {
        const chunk = carry.subarray(0, need);
        carry = carry.subarray(need);
        const f = new Float32Array(N);
        for (let i = 0; i < N; i++) f[i] = chunk.readInt16LE(i * 2) / 32768;
        bandsFromPcm(f, spectrum);
      }
    });
    audioProc.stderr.on('data', (c) => {
      const m = String(c).trim();
      if (m) log('ffmpeg: ' + m.slice(0, 200), 'info');
    });
    audioProc.on('error', (err) => {
      audioProc = null;
      setAudio('unavailable', String((err && err.message) || err));
    });
    audioProc.on('exit', (code) => {
      audioProc = null;
      if (!stopped && state.audio.status === 'running') setAudio('unavailable', `ffmpeg 退出（code ${code}）`);
    });
  }
  function startAudio() {
    const platform = process.platform;
    if (platform === 'darwin') {
      const bin = ensureTapBinary();
      if (!bin) return;
      setAudio('compiling');
      spawnTap(bin);
      return;
    }
    if (platform === 'linux' || platform === 'win32') {
      const spec = detectFfmpegSource(platform);
      if (!spec || !spec.args) {
        setAudio('unavailable', spec ? spec.hint : '当前平台不支持系统音频采集，回落模拟频谱');
        return;
      }
      spawnFfmpeg(spec);
      return;
    }
    setAudio('unavailable', '当前平台不支持系统音频采集，回落模拟频谱');
  }
  let npNoArtwork = true;
  function pollNowPlaying() {
    if (stopped) return;
    if (process.platform === 'darwin') {
      const args = npNoArtwork ? ['get', '--no-artwork'] : ['get'];
      execFile('media-control', args, { timeout: 3000 }, (err, stdout) => {
        if (err && npNoArtwork) {
          npNoArtwork = false;
          return;
        }
        if (stopped) return;
        if (err) {
          state.nowPlaying = { status: 'unavailable', hint: '需要 media-control（brew install media-control）' };
          np = null;
          return;
        }
        try {
          const o = JSON.parse(stdout);
          const has = Boolean(o && (o.title || o.artist));
          np = has ? {
            hasMedia: true,
            title: String(o.title || ''),
            artist: String(o.artist || ''),
            album: String(o.album || ''),
            playing: Boolean(o.playing),
            state: o.playing ? 1 : 2,
            position: Number(o.elapsedTime) || 0,
            duration: Number(o.duration) || 0,
            thumbnail: artworkFile ? '/wallpaper-engine/now-playing/artwork' : undefined,
          } : null;
          state.nowPlaying = { status: 'running', hint: '' };
          if (has) takeArtworkMac(o);
        } catch {   }
      });
      return;
    }
    if (process.platform === 'linux') {
      execFile('playerctl', ['metadata', '--format', '{{title}}\t{{artist}}\t{{album}}\t{{status}}\t{{mpris:artUrl}}'],
        { timeout: 3000 }, (err, stdout) => {
          if (stopped) return;
          if (err) {
            state.nowPlaying = { status: 'unavailable', hint: '需要 playerctl（apt/dnf/pacman 安装后重试）' };
            np = null;
            return;
          }
          const [title, artist, album, status, art] = String(stdout).trim().split('\t');
          const has = Boolean(title);
          const artKey = `${title || ''}|${artist || ''}|${art || ''}`;
          if (has && artKey !== artworkKey) {
            artworkKey = artKey;
            if (/^https?:/i.test(String(art || ''))) {
              fetch(String(art), { signal: AbortSignal.timeout(5000) })
                .then((r) => r.arrayBuffer().then((buf) => ({ buf, type: r.headers.get('content-type') || 'image/jpeg' })))
                .then(({ buf, type }) => { writeArtwork(Buffer.from(buf), type); })
                .catch(() => { artworkFile = null; artworkMime = ''; });
            } else if (/^file:/i.test(String(art || ''))) {
              try { writeArtwork(readFileSync(String(art).replace(/^file:\/\//, '')), 'image/jpeg'); }
              catch { artworkFile = null; artworkMime = ''; }
            }
          }
          np = has ? {
            hasMedia: true, title: title || '', artist: artist || '', album: album || '',
            playing: status === 'Playing', state: status === 'Playing' ? 1 : 2,
            thumbnail: art || undefined,
          } : null;
          state.nowPlaying = { status: 'running', hint: '' };
        });
      return;
    }
    state.nowPlaying = { status: 'unavailable', hint: 'Windows 的媒体集成在二期提供' };
  }
  function takeArtworkMac(o) {
    const key = String(o.contentItemIdentifier || `${o.title || ''}|${o.artist || ''}|${o.album || ''}`);
    if (!key || key === artworkKey) return;
    artworkKey = key;
    if (process.platform !== 'darwin') return;
    execFile('media-control', ['get'], { timeout: 4000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
      if (stopped) return;
      let b64 = '';
      let mime = '';
      if (!err) {
        try {
          const full = JSON.parse(stdout);
          b64 = typeof full.artworkData === 'string' ? full.artworkData : '';
          mime = String(full.artworkMimeType || '');
        } catch {   }
      }
      if (b64 && writeArtwork(Buffer.from(b64, 'base64'), mime)) return;
      fetchSpotifyArtwork();
    });
  }
  function fetchSpotifyArtwork() {
    execFile('osascript', ['-e', 'tell application "Spotify" to if it is running then return artwork url of current track'],
      { timeout: 3000 }, (err, stdout) => {
        const url = !err && /^https?:/.test(String(stdout).trim()) ? String(stdout).trim() : '';
        if (!url) { artworkFile = null; artworkMime = ''; return; }
        fetch(url, { signal: AbortSignal.timeout(5000) })
          .then((r) => r.arrayBuffer().then((buf) => ({ buf, type: r.headers.get('content-type') || 'image/jpeg' })))
          .then(({ buf, type }) => { writeArtwork(Buffer.from(buf), type); })
          .catch(() => { artworkFile = null; artworkMime = ''; });
      });
  }
  return {
    start() {
      if (started || stopped) return;
      started = true;
      log('启动内置媒体实现（音频频谱 + Now Playing）' + (audio ? '' : '（音频已在设置中关闭）'), 'info');
      if (audio) startAudio();
      else setAudio('off', '已在设置中关闭「系统音频反应」');
      pollNowPlaying();
      npTimer = setInterval(pollNowPlaying, 1000);
    },
    stop() {
      stopped = true;
      if (npTimer) { try { clearInterval(npTimer); } catch {   } npTimer = null; }
      if (audioProc && audioProc.pid !== undefined) { try { audioProc.kill(); } catch {   } }
      audioProc = null;
    },
    spectrum: () => spectrum,
    nowPlaying: () => np,
    artworkFile: () => artworkFile,
    artworkMime: () => artworkMime,
    control: () => ({ ok: false, error: 'control-unsupported' }),
    status: () => ({ backend: 'legacy', audio: { ...state.audio }, nowPlaying: { ...state.nowPlaying } }),
  };
}
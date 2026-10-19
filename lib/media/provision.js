import { existsSync, mkdirSync, renameSync, unlinkSync, chmodSync, statSync,
         openSync, closeSync, writeSync, readSync, fsyncSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(SELF_DIR, '..', '..');
export const MEDIA_BRIDGE_TAG = 'v0.1.5';
export const MEDIA_BRIDGE_ASSETS = {
  darwin: {
    arm64: 'media-bridge-darwin-universal',
    x64: 'media-bridge-darwin-universal',
  },
  win32: {
    x64: 'media-bridge-win32-x64.exe',
    arm64: 'media-bridge-win32-arm64.exe',
  },
  linux: {
    x64: 'media-bridge-linux-x64-musl',
    arm64: 'media-bridge-linux-arm64',
  },
};
export const MEDIA_BRIDGE_SHA256 = {
  'media-bridge-darwin-universal': '3b73d368ba49e803dd58587759c6253e2acdf87a34ff046a63ca90303bb0cb1a',
  'media-bridge-win32-x64.exe': '61a7f6dd5d9b012aceebc4180d9b429b17cd519764c92ea217acf3e63407ee0c',
  'media-bridge-linux-x64-musl': 'd97d02ad66f674cca170c9a69148e145baea87dbcceddbf75a3299b54835ebce',
  'media-bridge-linux-x64': 'c88a52d5c45f479be25a00995228d538bfc1ca5d7c7bc144273841e99a079ced',
  'media-bridge-linux-arm64': '40368c1c94dc094fd98b1c7cc8ea08c03181112b8e084d7ec6da6368de430b4a',
};
export const MEDIA_BRIDGE_FALLBACKS = {
  'media-bridge-win32-arm64.exe': ['media-bridge-win32-x64.exe'],
};
const MIN_BYTES = 3 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
export function mediaBridgeAssetFor(platform = process.platform, arch = process.arch) {
  const byArch = MEDIA_BRIDGE_ASSETS[platform];
  return (byArch && byArch[arch]) || null;
}
function mediaBridgeAssetUrls(asset, tag = MEDIA_BRIDGE_TAG) {
  const env = process.env.DSH_WE_MEDIA_BRIDGE_URL && process.env.DSH_WE_MEDIA_BRIDGE_URL.trim();
  if (env) {
    return [{ url: env.includes('{') ? env.replace(/\{tag\}/g, tag).replace(/\{asset\}/g, asset) : env, source: 'env-url' }];
  }
  return [{
    url: `https://github.com/oneincase/media-bridge/releases/download/${tag}/${asset}`,
    source: 'github',
  }];
}
export function binaryMagicOk(buf) {
  if (!buf || buf.length < 4) return false;
  const b = buf;
  const mz = b[0] === 0x4d && b[1] === 0x5a;
  const elf = b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46;
  const machThin = b[0] === 0xcf && b[1] === 0xfa && b[2] === 0xed && b[3] === 0xfe;
  const machThin32 = b[0] === 0xce && b[1] === 0xfa && b[2] === 0xed && b[3] === 0xfe;
  const machFat = b[0] === 0xca && b[1] === 0xfe && b[2] === 0xba && b[3] === 0xbe;
  const machFatLe = b[0] === 0xbe && b[1] === 0xba && b[2] === 0xfe && b[3] === 0xca;
  return mz || elf || machThin || machThin32 || machFat || machFatLe;
}
function cacheDirFor(dataDir, tag) {
  return join(dataDir, 'bin', 'media-bridge', tag);
}
export function mediaBridgeCachePath(dataDir, tag = MEDIA_BRIDGE_TAG, asset = mediaBridgeAssetFor()) {
  if (!asset) return null;
  return join(cacheDirFor(dataDir, tag), asset);
}
function verifyFile(path, wantSha) {
  try {
    const st = statSync(path);
    if (!st.isFile() || st.size < MIN_BYTES) return { ok: false, error: '文件体积异常（' + st.size + ' 字节）' };
    const fd = openSync(path, 'r');
    const head = Buffer.alloc(8);
    try {
      let got = 0;
      while (got < 8) { const n = readSync(fd, head, got, 8 - got, got); if (n <= 0) break; got += n; }
    } finally { closeSync(fd); }
    if (!binaryMagicOk(head)) return { ok: false, error: '不是可执行文件（魔数不符）' };
    if (wantSha) {
      const hash = createHash('sha256');
      const fd2 = openSync(path, 'r');
      const chunk = Buffer.alloc(1 << 20);
      try {
        for (;;) {
          const n = readSync(fd2, chunk, 0, chunk.length, null);
          if (n <= 0) break;
          hash.update(chunk.subarray(0, n));
        }
      } finally { closeSync(fd2); }
      if (hash.digest('hex') !== wantSha) return { ok: false, error: 'sha256 不符' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}
async function downloadToFile(url, tmp) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS);
  let fd = -1;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'dsh-wallpaper-engine' },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    if (!res.body) throw new Error('响应没有 body');
    const reader = res.body.getReader();
    fd = openSync(tmp, 'w');
    const hash = createHash('sha256');
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length) {
        let off = 0;
        while (off < value.length) off += writeSync(fd, value, off, value.length - off);
        hash.update(value);
        total += value.length;
      }
    }
    fsyncSync(fd);
    closeSync(fd);
    fd = -1;
    const head = Buffer.alloc(8);
    const rfd = openSync(tmp, 'r');
    try {
      let got = 0;
      while (got < 8) { const n = readSync(rfd, head, got, 8 - got, got); if (n <= 0) break; got += n; }
    } finally { closeSync(rfd); }
    if (!binaryMagicOk(head)) throw new Error('不是可执行文件（魔数不符）');
    if (total < MIN_BYTES) throw new Error('体积异常（' + total + ' 字节）');
    return { total, sha256: hash.digest('hex') };
  } finally {
    clearTimeout(timer);
    if (fd >= 0) { try { closeSync(fd); } catch {   } }
  }
}
function stripQuarantine(path) {
  if (process.platform !== 'darwin') return;
  try { spawnSync('xattr', ['-d', 'com.apple.quarantine', path], { timeout: 3000 }); } catch {   }
}
let provisionTask = null;
export async function provisionMediaBridge({ dataDir, log = () => {} }) {
  if (provisionTask) return provisionTask;
  provisionTask = (async () => {
    const tag = (process.env.DSH_WE_MEDIA_BRIDGE_TAG && process.env.DSH_WE_MEDIA_BRIDGE_TAG.trim()) || MEDIA_BRIDGE_TAG;
    const envPath = process.env.DSH_WE_MEDIA_BRIDGE && process.env.DSH_WE_MEDIA_BRIDGE.trim();
    if (envPath) {
      const v = verifyFile(resolve(envPath), process.env.DSH_WE_MEDIA_BRIDGE_SHA256 || null);
      if (v.ok) return { path: resolve(envPath), source: 'env', tag };
      return { path: null, source: 'env', tag, error: 'DSH_WE_MEDIA_BRIDGE 指定的文件不可用：' + v.error };
    }
    const asset = mediaBridgeAssetFor();
    if (!asset) {
      return { path: null, source: 'none', tag, error: `当前平台没有预编译产物（${process.platform}/${process.arch}）` };
    }
    const localBin = join(PLUGIN_ROOT, 'bin', asset);
    if (existsSync(localBin)) {
      const v = verifyFile(localBin, null);
      if (v.ok) return { path: localBin, source: 'plugin-bin', tag };
      log('插件目录里的 bin/' + asset + ' 不可用：' + v.error, 'warn');
    }
    const target = join(cacheDirFor(dataDir, tag), asset);
    if (existsSync(target)) {
      const want = MEDIA_BRIDGE_SHA256[asset] || null;
      const v = verifyFile(target, want);
      if (v.ok) return { path: target, source: 'cache', tag };
      log('缓存的中间件不可用（' + v.error + '），重新下载', 'warn');
      try { unlinkSync(target); } catch {   }
    }
    if (typeof fetch !== 'function') {
      return { path: null, source: 'download', tag, error: '当前 Node 没有 fetch（需要 Node 18+）' };
    }
    const errors = [];
    const assets = [asset, ...(MEDIA_BRIDGE_FALLBACKS[asset] || [])];
    for (const tryAsset of assets) {
      const want = MEDIA_BRIDGE_SHA256[tryAsset] || null;
      if (!want) {
        errors.push(tryAsset + ' → 未固定 sha256（自定义版本请同时给 DSH_WE_MEDIA_BRIDGE_SHA256）');
        continue;
      }
      const tryTarget = join(cacheDirFor(dataDir, tag), tryAsset);
      if (existsSync(tryTarget)) {
        const v = verifyFile(tryTarget, want);
        if (v.ok) return { path: tryTarget, source: 'cache', tag, asset: tryAsset };
      }
      try { mkdirSync(dirname(tryTarget), { recursive: true }); } catch {   }
      const urls = mediaBridgeAssetUrls(tryAsset, tag);
      for (const c of urls) {
        const tmp = tryTarget + '.part' + process.pid;
        try {
          log('下载系统媒体中间件：' + c.url, 'info');
          const r = await downloadToFile(c.url, tmp);
          if (r.sha256 !== want) throw new Error('sha256 不符（拿到 ' + r.sha256.slice(0, 12) + '…）');
          if (process.platform !== 'win32') { try { chmodSync(tmp, 0o755); } catch {   } }
          renameSync(tmp, tryTarget);
          stripQuarantine(tryTarget);
          log('系统媒体中间件就绪：' + tryTarget + '（' + Math.round(r.total / 1048576) + 'MB）'
            + (tryAsset === asset ? '' : '（首选 ' + asset + ' 取不到，用了回落产物 ' + tryAsset + '）'), 'info');
          return { path: tryTarget, source: 'download', tag, asset: tryAsset };
        } catch (err) {
          const msg = String(err && err.message ? err.message : err);
          errors.push(c.url + ' → ' + msg);
          try { unlinkSync(tmp); } catch {   }
        }
      }
    }
    return { path: null, source: 'download', tag, error: '中间件下载失败：' + (errors.join('; ') || '未知原因') };
  })().catch((err) => ({
    path: null, source: 'error', tag: MEDIA_BRIDGE_TAG,
    error: '中间件准备出错：' + String(err && err.message ? err.message : err),
  })).finally(() => { provisionTask = null; });
  return provisionTask;
}
import { statSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { extractSceneVideoFromDir, probeSceneVideoFromPkgFile } from './scene-manifest.js';
const SCENE_AUDIO_EXT_RE = /\.(mp3|ogg|oga|wav|m4a|flac|aac)$/i;
const SCENE_VIDEO_PROBE_MAX = 512;
const SCENE_VIDEO_PROBE_CONCURRENCY = 2;
export function createSceneProbeKit({ atomicWriteFileP, ensureFrameCacheDir }) {
  const _sceneAudioState = new Map();
  function sceneAudioCacheKey(abs, mtime) {
    return 'sa1_' + Buffer.from(abs, 'utf8').toString('base64url') + '_' + Math.round(mtime);
  }
  async function ensureSceneAudio(abs) {
    let mtime;
    try { mtime = statSync(abs).mtimeMs; } catch { return null; }
    const sig = String(Math.round(mtime));
    const hit = _sceneAudioState.get(abs);
    if (hit && hit.sig === sig) return hit.file;
    let best = null;
    try {
      const { parsePkg } = await import('./pkg-read.js');
      if (abs.toLowerCase().endsWith('.json')) {
        const { readdirSync: rd } = await import('node:fs');
        const dirAbs = dirname(abs);
        for (const name of rd(dirAbs)) {
          if (!SCENE_AUDIO_EXT_RE.test(name)) continue;
          const p = join(dirAbs, name);
          try {
            const st = statSync(p);
            if (!best || st.size > best.size) best = { path: p, size: st.size, ext: name.split('.').pop().toLowerCase(), loose: true };
          } catch {   }
        }
      } else {
        const data = await readFile(abs);
        const entries = parsePkg(data);
        for (const e of entries) {
          const p = String(e.path || e.p || '');
          if (!SCENE_AUDIO_EXT_RE.test(p)) continue;
          const size = Number(e.size) || 0;
          if (best && size <= best.size) continue;
          best = { entry: e, path: p, size, ext: p.split('.').pop().toLowerCase(), loose: false, data };
        }
      }
    } catch { best = null; }
    let file = null;
    if (best) {
      const key = sceneAudioCacheKey(abs, mtime);
      const target = join(ensureFrameCacheDir(), key + '.' + best.ext);
      try {
        if (!existsSync(target)) {
          if (best.loose) {
            await atomicWriteFileP(target, await readFile(best.path));
          } else {
            const { readPkgEntry } = await import('./pkg-read.js');
            const bytes = readPkgEntry(best.data, best.entry);
            if (!bytes || !bytes.length) throw new Error('empty audio entry');
            await atomicWriteFileP(target, Buffer.from(bytes));
          }
        }
        file = target;
      } catch { file = null; }
    }
    _sceneAudioState.set(abs, { sig, file });
    return file;
  }
  const _sceneVideoProbeCache = new Map();
  const _sceneVideoProbeQueue = [];
  let _sceneVideoProbeActive = 0;
  function sceneVideoProbeKey(abs, mtimeMs) {
    let m = mtimeMs;
    if (m === undefined || m === null) {
      try { m = statSync(abs).mtimeMs; } catch { m = 0; }
    }
    return abs + '|' + Math.round(Number(m) || 0);
  }
  function sceneVideoProbeGet(key) {
    if (!_sceneVideoProbeCache.has(key)) return undefined;
    const v = _sceneVideoProbeCache.get(key);
    _sceneVideoProbeCache.delete(key);
    _sceneVideoProbeCache.set(key, v);
    return v;
  }
  function sceneVideoProbeSet(key, has) {
    if (_sceneVideoProbeCache.has(key)) _sceneVideoProbeCache.delete(key);
    _sceneVideoProbeCache.set(key, !!has);
    while (_sceneVideoProbeCache.size > SCENE_VIDEO_PROBE_MAX) {
      _sceneVideoProbeCache.delete(_sceneVideoProbeCache.keys().next().value);
    }
  }
  function scheduleSceneVideoProbe(abs, key) {
    if (_sceneVideoProbeCache.has(key)) return;
    if (!_sceneVideoProbeQueue.some((j) => j.key === key)) _sceneVideoProbeQueue.push({ key, abs });
    drainSceneVideoProbeQueue();
  }
  function drainSceneVideoProbeQueue() {
    while (_sceneVideoProbeActive < SCENE_VIDEO_PROBE_CONCURRENCY && _sceneVideoProbeQueue.length) {
      const job = _sceneVideoProbeQueue.shift();
      if (_sceneVideoProbeCache.has(job.key)) continue;
      _sceneVideoProbeActive++;
      (async () => {
        await new Promise((r) => { setTimeout(r, 0); });
        let has;
        try {
          if (job.abs.toLowerCase().endsWith('.json')) {
            const bytes = extractSceneVideoFromDir(dirname(job.abs));
            has = !!(bytes && bytes.length);
          } else {
            has = await probeSceneVideoFromPkgFile(job.abs);
          }
        } catch { has = false; }
        sceneVideoProbeSet(job.key, has);
      })().then(
        () => { _sceneVideoProbeActive--; drainSceneVideoProbeQueue(); },
        () => { _sceneVideoProbeActive--; drainSceneVideoProbeQueue(); },
      );
    }
  }
  return { ensureSceneAudio, sceneVideoProbeKey, sceneVideoProbeGet, sceneVideoProbeSet, scheduleSceneVideoProbe };
}
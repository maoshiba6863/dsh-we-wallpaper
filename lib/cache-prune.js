import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
export function createCachePruneKit({ transcodeCacheDir, ffmpegDataDir, videoPreviewCacheDir }) {
  function sweepTranscodeArtifacts() {
    const dirs = [transcodeCacheDir(), ffmpegDataDir(), videoPreviewCacheDir()];
    const ownTmpRe = new RegExp('\\.tmp' + process.pid + '\\d*$');
    for (const dir of dirs) {
      let entries;
      try { entries = readdirSync(dir); } catch { continue; }
      for (const name of entries) {
        if (ownTmpRe.test(name)) continue;
        if (!(/\.tmp\d*$/.test(name) || /\.part\d*$/.test(name)
          || /\.prog$/.test(name) || /^ffmpeg-err-/.test(name))) continue;
        try { unlinkSync(join(dir, name)); } catch {   }
      }
    }
  }
  const CUSTOM_FRAME_TMP_STALE_MS = 10 * 60 * 1000;
  function sweepCustomFrameTmp(dir) {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    const cutoff = Date.now() - CUSTOM_FRAME_TMP_STALE_MS;
    for (const name of entries) {
      if (!name.endsWith('.tmp')) continue;
      const abs = join(dir, name);
      try { if (statSync(abs).mtimeMs > cutoff) continue; } catch { continue; }
      try { unlinkSync(abs); } catch {   }
    }
  }
  const VIDEO_PREVIEW_CACHE_MAX = 512;
  function pruneVideoPreviewCache() {
    let names;
    try { names = readdirSync(videoPreviewCacheDir()); } catch { return; }
    const files = names.filter((n) => n.startsWith('pv_') && n.endsWith('.jpg'));
    if (files.length <= VIDEO_PREVIEW_CACHE_MAX) return;
    const ranked = files.map((n) => {
      const p = join(videoPreviewCacheDir(), n);
      let mtime = 0; try { mtime = statSync(p).mtimeMs; } catch {   }
      return { p, mtime };
    }).sort((a, b) => b.mtime - a.mtime);
    for (const f of ranked.slice(VIDEO_PREVIEW_CACHE_MAX)) {
      try { unlinkSync(f.p); } catch {   }
    }
  }
  const TRANSCODE_CACHE_MAX_BYTES = 4 * 1024 * 1024 * 1024;
  const CACHE_PRUNE_MIN_AGE_MS = 5 * 60 * 1000;
  function pruneCacheDirBySize(dir, maxBytes, matchRe) {
    let names;
    try { names = readdirSync(dir); } catch { return; }
    const ownTmpSuffix = '.tmp' + process.pid;
    const now = Date.now();
    const entries = [];
    let total = 0;
    for (const name of names) {
      if (name.endsWith(ownTmpSuffix) || !matchRe.test(name)) continue;
      const p = join(dir, name);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (!st.isFile()) continue;
      total += st.size;
      entries.push({ p, size: st.size, mtime: st.mtimeMs });
    }
    if (total <= maxBytes) return;
    entries.sort((x, y) => x.mtime - y.mtime);
    for (let i = 0; i < entries.length - 1 && total > maxBytes; i++) {
      const e = entries[i];
      if (now - e.mtime < CACHE_PRUNE_MIN_AGE_MS) continue;
      try { unlinkSync(e.p); total -= e.size; } catch {   }
    }
  }
  return {
    sweepTranscodeArtifacts,
    sweepCustomFrameTmp,
    pruneVideoPreviewCache,
    pruneCacheDirBySize,
    TRANSCODE_CACHE_MAX_BYTES,
  };
}
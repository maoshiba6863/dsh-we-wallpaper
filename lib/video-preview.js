import { existsSync, statSync, unlinkSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
export function createVideoPreviewKit({
  ensureVideoPreviewCacheDir, resolveFfmpeg, spawnFfmpeg,
  VIDEO_PREVIEW_WIDTH, VIDEO_PREVIEW_MAX_CONCURRENT,
}) {
  let videoPreviewActive = 0;
  const videoPreviewWaiters = [];
  function acquireVideoPreviewSlot() {
    if (videoPreviewActive < VIDEO_PREVIEW_MAX_CONCURRENT) {
      videoPreviewActive += 1;
      return Promise.resolve();
    }
    return new Promise((resolveSlot) => { videoPreviewWaiters.push(resolveSlot); });
  }
  function releaseVideoPreviewSlot() {
    const next = videoPreviewWaiters.shift();
    if (next) next();
    else videoPreviewActive -= 1;
  }
  function videoPreviewCachePath(abs) {
    let size = 0, mtime = 0;
    try { const st = statSync(abs); size = st.size; mtime = Math.round(st.mtimeMs); } catch {   }
    const key = createHash('sha256')
      .update(abs + '|' + size + '|' + mtime + '|v1|' + VIDEO_PREVIEW_WIDTH)
      .digest('hex').slice(0, 24);
    return join(ensureVideoPreviewCacheDir(), 'pv_' + key + '.jpg');
  }
  const VIDEO_PREVIEW_INFLIGHT = new Map();
  async function generateVideoPreview(abs) {
    const out = videoPreviewCachePath(abs);
    if (existsSync(out)) return out;
    let entry = VIDEO_PREVIEW_INFLIGHT.get(out);
    if (entry) return entry;
    entry = (async () => {
      await acquireVideoPreviewSlot();
      const tmp = out + '.tmp' + process.pid;
      try {
        if (existsSync(out)) return out;
        const ff = await resolveFfmpeg(null);
        let lastErr = null;
        let produced = false;
        for (const ss of [1, 0]) {
          try { unlinkSync(tmp); } catch {   }
          try {
            await spawnFfmpeg(ff, [
              '-y', '-hide_banner', '-nostdin',
              '-ss', String(ss),
              '-i', abs,
              '-frames:v', '1', '-an',
              '-vf', `scale='min(${VIDEO_PREVIEW_WIDTH},iw)':-2`,
              '-q:v', '3',
              '-update', '1', '-f', 'image2', tmp,
            ], 60 * 1000, {});
            if (existsSync(tmp)) { lastErr = null; produced = true; break; }
            lastErr = new Error('no preview frame produced');
          } catch (e) { lastErr = e; }
        }
        if (!produced) throw lastErr || new Error('no preview frame produced');
        renameSync(tmp, out);
        return out;
      } catch (e) {
        try { unlinkSync(tmp); } catch {   }
        throw e;
      } finally {
        releaseVideoPreviewSlot();
      }
    })();
    VIDEO_PREVIEW_INFLIGHT.set(out, entry);
    entry.then(
      () => { if (VIDEO_PREVIEW_INFLIGHT.get(out) === entry) VIDEO_PREVIEW_INFLIGHT.delete(out); },
      () => { if (VIDEO_PREVIEW_INFLIGHT.get(out) === entry) VIDEO_PREVIEW_INFLIGHT.delete(out); },
    );
    return entry;
  }
  return { acquireVideoPreviewSlot, releaseVideoPreviewSlot, videoPreviewCachePath, generateVideoPreview };
}
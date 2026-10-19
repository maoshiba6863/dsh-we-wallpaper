import { statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { extractSceneVideoFromDir, extractSceneVideoFromPkgFile } from '../scene-manifest.js';
export function registerSceneMediaRoutes(webServer, c) {
  const {
    disposers, base: BASE, mediaMap, serveFile,
    ensureFrameCacheDir, sceneVideoProbeKey, sceneVideoProbeSet,
    atomicWriteFileP, ensureSceneAudio, SCENE_VIDEO_INFLIGHT,
  } = c;
  disposers.push(webServer.register({
    kind: 'prefix',
    path: `${BASE}/scene-video`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET, HEAD');
        res.end('method not allowed');
        return;
      }
      const pathname = new URL(req.url || '/', 'http://x').pathname;
      const token = decodeURIComponent(pathname.slice(`${BASE}/scene-video/`.length));
      const abs = mediaMap.get(token);
      if (!abs) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'unknown-token' }));
        return;
      }
      (async () => {
        let mtime = 0;
        try { mtime = statSync(abs).mtimeMs; } catch {   }
        const key = 'sv1_' + Buffer.from(abs, 'utf8').toString('base64url') + '_' + Math.round(mtime);
        const mp4Path = join(ensureFrameCacheDir(), key + '.mp4');
        const probeKey = sceneVideoProbeKey(abs, mtime);
        const cachedMp4 = existsSync(mp4Path);
        if (cachedMp4) sceneVideoProbeSet(probeKey, true);
        if (!cachedMp4) {
          let inflight = SCENE_VIDEO_INFLIGHT.get(key);
          if (!inflight) {
            inflight = (async () => {
              try {
                const bytes = abs.toLowerCase().endsWith('.json')
                  ? extractSceneVideoFromDir(dirname(abs))
                  : await extractSceneVideoFromPkgFile(abs);
                if (!bytes || bytes.length === 0) { sceneVideoProbeSet(probeKey, false); return null; }
                await atomicWriteFileP(mp4Path, bytes);
                sceneVideoProbeSet(probeKey, true);
                return mp4Path;
              } catch (e) {
                sceneVideoProbeSet(probeKey, false);
                throw e;
              }
            })();
            SCENE_VIDEO_INFLIGHT.set(key, inflight);
            inflight.then(
              () => SCENE_VIDEO_INFLIGHT.delete(key),
              () => SCENE_VIDEO_INFLIGHT.delete(key),
            );
          }
          const produced = await inflight;
          if (!produced) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'no-scene-video' }));
            return;
          }
        }
        serveFile(mp4Path, req, res, method === 'HEAD');
      })().catch((err) => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: String(err && err.message ? err.message : err) }));
      });
    },
  }));
  disposers.push(webServer.register({
    kind: 'prefix',
    path: `${BASE}/scene-audio`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        res.statusCode = 405; res.end('method not allowed'); return;
      }
      const pathname = new URL(req.url || '/', 'http://x').pathname;
      const token = decodeURIComponent(pathname.slice(`${BASE}/scene-audio/`.length));
      const abs = mediaMap.get(token);
      if (!abs) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'unknown-token' }));
        return;
      }
      (async () => {
        const file = await ensureSceneAudio(abs);
        if (!file) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'no-scene-audio' }));
          return;
        }
        serveFile(file, req, res, method === 'HEAD');
      })().catch(() => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'scene-audio failed' }));
      });
    },
  }));
}
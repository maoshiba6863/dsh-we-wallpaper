import { statSync } from 'node:fs';
import { clampNum } from '../settings-schema.js';
export function registerMediaDerivedRoutes(webServer, c) {
  const {
    disposers, base: BASE, mediaMap, serveFile, log,
    getMediaInfo, faststartVariant, transcodeJobs,
    transcodeToFps, registerTranscodeWaiter, generateVideoPreview,
    transcodeCached,
  } = c;
  disposers.push(webServer.register({
    kind: 'prefix',
    path: `${BASE}/media-info`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'GET') { res.statusCode = 405; res.end('method not allowed'); return; }
      const pathname = new URL(req.url || '/', 'http://x').pathname;
      const token = decodeURIComponent(pathname.slice(`${BASE}/media-info/`.length));
      const abs = mediaMap.get(token);
      if (!abs) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'unknown-token' }));
        return;
      }
      let info;
      try { info = getMediaInfo(abs); } catch { info = null; }
      try { faststartVariant(abs, log); } catch {   }
      let transcode = null;
      try {
        const rawFps = Number(new URL(req.url || '/', 'http://x').searchParams.get('fps')) || 0;
        if (rawFps > 0 && typeof transcodeCached === 'function') {
          const fps = clampNum(rawFps, 1, 120, 60);
          transcode = { fps, cached: transcodeCached(abs, fps) === true };
        }
      } catch { transcode = null; }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ ok: !!info, info, transcode }));
    },
  }));
  disposers.push(webServer.register({
    kind: 'prefix',
    path: `${BASE}/transcode-progress`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'GET') { res.statusCode = 405; res.end('method not allowed'); return; }
      const url = new URL(req.url || '/', 'http://x');
      const token = decodeURIComponent(url.pathname.slice(`${BASE}/transcode-progress/`.length));
      const abs = mediaMap.get(token);
      const fps = clampNum(Number(url.searchParams.get('fps')) || 0, 1, 120, 60);
      let phase = 'idle', percent = 0, source = '', finalizing = false, eta = null;
      const p = abs ? transcodeJobs.get(abs + '|' + fps) : null;
      if (p) {
        phase = p.phase;
        source = p.source || '';
        if (phase === 'download') {
          percent = p.total > 0 ? Math.min(99, Math.round((p.downloaded / p.total) * 100)) : 0;
        } else if (phase === 'transcode' && p.outFile) {
          let size = 0;
          try { size = statSync(p.outFile).size; } catch {   }
          if (p.expectedBytes && p.expectedBytes > 0) {
            percent = Math.min(99, Math.round((size / p.expectedBytes) * 100));
          }
          const now = Date.now();
          if (!Array.isArray(p.samples)) p.samples = [];
          p.samples.push({ t: now, size });
          if (p.samples.length > 24) p.samples.shift();
          if (p.samples.length >= 3 && p.expectedBytes && p.expectedBytes > 0) {
            const a = p.samples[0], b = p.samples[p.samples.length - 1];
            const dt = (b.t - a.t) / 1000;
            const rate = dt > 0 ? (b.size - a.size) / dt : 0;
            if (rate > 0) {
              const rem = p.expectedBytes - b.size;
              if (rem > 0) eta = Math.max(1, Math.round(rem / rate));
            }
          }
          if (percent >= 99) finalizing = true;
        } else if (phase === 'done') {
          percent = 100;
        }
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ phase, percent, source, finalizing, eta }));
    },
  }));
  disposers.push(webServer.register({
    kind: 'prefix',
    path: `${BASE}/transcoded`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'GET') { res.statusCode = 405; res.end('method not allowed'); return; }
      const url = new URL(req.url || '/', 'http://x');
      const token = decodeURIComponent(url.pathname.slice(`${BASE}/transcoded/`.length));
      const abs = mediaMap.get(token);
      if (!abs) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'unknown-token' }));
        return;
      }
      if (!/\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(abs)) {
        res.statusCode = 422;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'not-a-video' }));
        return;
      }
      const fps = clampNum(Number(url.searchParams.get('fps')) || 0, 1, 120, 60);
      (async () => {
        let out = null;
        let transcodeErr = null;
        try {
          out = await transcodeToFps(abs, fps, (e) => {
            registerTranscodeWaiter(e, res);
          });
        } catch (err) { transcodeErr = err; }
        if (!out) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({
            error: 'transcode-failed',
            detail: String(transcodeErr && transcodeErr.message ? transcodeErr.message : transcodeErr),
          }));
          return;
        }
        serveFile(out, req, res);
      })().catch((err) => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: String(err && err.message ? err.message : err) }));
      });
    },
  }));
  disposers.push(webServer.register({
    kind: 'prefix',
    path: `${BASE}/video-preview`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET, HEAD');
        res.end('method not allowed');
        return;
      }
      const pathname = new URL(req.url || '/', 'http://x').pathname;
      const token = decodeURIComponent(pathname.slice(`${BASE}/video-preview/`.length));
      const abs = mediaMap.get(token);
      if (!abs || !/\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(abs)) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'unknown-token' }));
        return;
      }
      (async () => {
        const out = await generateVideoPreview(abs);
        res.setHeader('Cache-Control', 'no-store');
        serveFile(out, req, res, method === 'HEAD');
      })().catch((err) => {
        res.statusCode = 422;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: String(err && err.message ? err.message : err) }));
      });
    },
  }));
}
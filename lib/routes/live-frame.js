import { statSync } from 'node:fs';
import { bodyReader } from '../http-body.js';
export function registerLiveFrameRoutes(webServer, c) {
  const {
    disposers, base: BASE, mediaMap, serveFile, traceRequests,
    liveFrameFile, atomicWriteFileSync, lingerClose,
  } = c;
  disposers.push(webServer.register({
    kind: 'prefix',
    path: `${BASE}/live-frame`,
    handler: (req, res) => {
      traceRequests(res, 'live-frame', new URL(req.url || '/', 'http://x').pathname.slice(`${BASE}/live-frame/`.length));
      const method = (req.method || 'GET').toUpperCase();
      let token;
      try {
        token = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname
          .slice(`${BASE}/live-frame/`.length)).replace(/\/+$/, '');
      } catch { res.statusCode = 400; res.end('bad request'); return; }
      const abs = mediaMap.get(token);
      if (!abs) { res.statusCode = 404; res.end('unknown-token'); return; }
      if (method === 'GET' || method === 'HEAD') {
        const file = liveFrameFile(abs);
        let fresh;
        try { fresh = statSync(file).mtimeMs >= statSync(abs).mtimeMs; } catch { fresh = false; }
        if (!fresh) { res.statusCode = 404; res.end('no-frame'); return; }
        res.setHeader('Cache-Control', 'no-store');
        serveFile(file, req, res, method === 'HEAD');
        return;
      }
      if (method !== 'POST') { res.statusCode = 405; res.end('method not allowed'); return; }
      let done = false;
      const fail = (code) => {
        if (done) return;
        done = true;
        res.statusCode = code; res.end();
        lingerClose(req, res);
      };
      const reader = bodyReader(req, {
        maxBytes: 4 * 1024 * 1024,
        shouldStop: () => done,
        onOverflow: () => fail(413),
      });
      req.on('data', reader.onData);
      req.on('end', () => {
        if (done) return;
        done = true;
        try {
          const buf = reader.buf();
          if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) { res.statusCode = 415; res.end('not jpeg'); return; }
          atomicWriteFileSync(liveFrameFile(abs), buf);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: true, bytes: buf.length }));
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err && err.message ? err.message : err));
        }
      });
      req.on('error', () => { done = true; });
    },
  }));
}
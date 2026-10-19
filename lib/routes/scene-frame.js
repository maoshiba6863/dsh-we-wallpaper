import { createReadStream, createWriteStream, existsSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { bodyReader } from '../http-body.js';
import { sendJson } from '../json-response.js';
export function registerSceneFrameRoutes(webServer, c) {
  const {
    disposers, base: BASE, mediaMap, trackStream, serveFile,
    GPU_FRAME_AREA_TOL, GPU_FRAME_MAX_BYTES, GPU_WRITE_INFLIGHT,
    CUSTOM_FRAME_EXT, CUSTOM_FRAME_MAX_BYTES,
    armBodyIdleTimeout, atomicWriteFileP, customFrameDir, customFramePath, customIdFromAbs,
    gpuFrameFileFor, lingerClose, looksLikePng, pngDimsOfBuf, pngSizeOf, sceneFrameSlot,
  } = c;
  disposers.push(webServer.register({
    kind: 'prefix',
    path: `${BASE}/scene-frame`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        res.statusCode = 405; res.end('method not allowed'); return;
      }
      const pathname = new URL(req.url || '/', 'http://x').pathname;
      const token = decodeURIComponent(pathname.slice(`${BASE}/scene-frame/`.length));
      const abs = mediaMap.get(token);
      if (!abs) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'unknown-token' }));
        return;
      }
      const u = new URL(req.url || '/', 'http://x');
      const vRaw = Number(u.searchParams.get('v') || 0);
      const variant = vRaw === 4 ? 4 : 0;
      const slot = variant === 4 ? null : sceneFrameSlot(abs);
      const gpuFile = slot ? gpuFrameFileFor(slot) : null;
      const customFile = () => {
        const p = customFramePath(customIdFromAbs(abs));
        return p && existsSync(p) ? p : null;
      };
      if (method === 'HEAD') {
        const file = gpuFile || customFile();
        if (!file) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'no-frame' }));
          return;
        }
        res.statusCode = 204;
        res.setHeader('X-WE-GPU', gpuFile ? '1' : '0');
        if (gpuFile) {
          const dim = pngSizeOf(gpuFile);
          if (dim) {
            res.setHeader('X-WE-GPU-W', String(dim.width));
            res.setHeader('X-WE-GPU-H', String(dim.height));
            res.setHeader('X-WE-GPU-AR', (dim.width / dim.height).toFixed(4));
          }
        }
        res.end();
        return;
      }
      let servePath = gpuFile;
      if (!servePath) servePath = customFile();
      if (!servePath) {
        res.statusCode = variant === 4 ? 422 : 404;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: variant === 4 ? 'no-custom-frame' : 'no-frame' }));
        return;
      }
      res.setHeader('Content-Type', servePath.endsWith('.jpg') ? 'image/jpeg'
        : servePath.endsWith('.gif') ? 'image/gif'
          : servePath.endsWith('.webp') ? 'image/webp' : 'image/png');
      res.setHeader('Cache-Control', 'no-store');
      trackStream(createReadStream(servePath), res);
    },
  }));
  disposers.push(webServer.register({
    kind: 'prefix',
    path: `${BASE}/scene-frame-cache`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      const url = new URL(req.url || '/', 'http://x');
      const json = (code, payload) => sendJson(res, code, payload, null);
      let token;
      try {
        token = decodeURIComponent(url.pathname.slice(`${BASE}/scene-frame-cache/`.length));
      } catch {
        json(404, { error: 'unknown-token' }); return;
      }
      const wantsClear = method === 'DELETE' || (method === 'POST' && url.searchParams.get('clear') === '1');
      if (wantsClear) {
        const abs = mediaMap.get(token);
        if (!abs) { json(404, { error: 'unknown-token' }); return; }
        const slot = sceneFrameSlot(abs);
        let removed = false;
        const unlinkStep = (p) => {
          try { unlinkSync(p); removed = true; }
          catch (e) {
            if (e && e.code !== 'ENOENT') {
              json(500, { ok: false, removed: false, error: 'unlink-failed', code: (e && e.code) || '' });
              return false;
            }
          }
          return true;
        };
        if (!unlinkStep(slot.gpuPath)) return;
        json(200, { ok: true, removed });
        return;
      }
      if (method !== 'PUT') { json(405, { error: 'method not allowed' }); return; }
      const abs = mediaMap.get(token);
      if (!abs) { json(404, { error: 'unknown-token' }); return; }
      let failed = false;
      const fail = (code, payload) => {
        if (failed) return;
        failed = true;
        json(code, payload);
        lingerClose(req, res);
      };
      armBodyIdleTimeout(req, () => fail(408, { error: 'request timeout' }));
      const reader = bodyReader(req, {
        maxBytes: GPU_FRAME_MAX_BYTES,
        shouldStop: () => failed,
        onOverflow: () => fail(413, { error: 'frame too large' }),
      });
      req.on('data', reader.onData);
      req.on('end', () => {
        if (failed) return;
        const body = reader.buf();
        if (!looksLikePng(body)) { json(415, { error: 'unsupported-format' }); return; }
        const dim = pngDimsOfBuf(body);
        if (!dim) { json(415, { error: 'unsupported-format' }); return; }
        const slot = sceneFrameSlot(abs);
        const ar = dim.width / dim.height;
        const target = slot.gpuPath;
        const prev = GPU_WRITE_INFLIGHT.get(target) || Promise.resolve();
        const write = prev
          .catch(() => {   })
          .then(async () => {
            const incomingArea = dim.width * dim.height;
            const prevDim = existsSync(target) ? pngSizeOf(target) : null;
            if (prevDim && incomingArea < prevDim.width * prevDim.height * (1 - GPU_FRAME_AREA_TOL)) {
              return { code: 409, payload: { error: 'frame-smaller',
                have: { w: prevDim.width, h: prevDim.height },
                got: { w: dim.width, h: dim.height } } };
            }
            await atomicWriteFileP(target, body);
            return { code: 200, payload: { ok: true, bytes: body.length, ar: Number(ar.toFixed(4)),
              upgraded: Boolean(prevDim) && incomingArea > prevDim.width * prevDim.height } };
          });
        GPU_WRITE_INFLIGHT.set(target, write);
        write
          .then((r) => json(r.code, r.payload))
          .catch((err) => json(500, { error: String(err && err.message ? err.message : err) }))
          .finally(() => {
            if (GPU_WRITE_INFLIGHT.get(target) === write) GPU_WRITE_INFLIGHT.delete(target);
          });
      });
    },
  }));
  disposers.push(webServer.register({
    kind: 'prefix',
    path: `${BASE}/custom-frame`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      const pathname = new URL(req.url || '/', 'http://x').pathname;
      const id = decodeURIComponent(pathname.slice(`${BASE}/custom-frame/`.length)).replace(/\/+$/, '');
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'bad-id' }));
        return;
      }
      if (method === 'GET') {
        const p = customFramePath(id);
        if (!p) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'not-set' }));
          return;
        }
        serveFile(p, req, res, false);
        return;
      }
      if (method === 'DELETE') {
        let removed = false;
        for (const e of ['png', 'jpg', 'webp']) {
          try { unlinkSync(join(customFrameDir(), id + '.' + e)); removed = true; } catch {   }
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: true, removed }));
        return;
      }
      if (method !== 'POST') {
        res.statusCode = 405; res.end('method not allowed'); return;
      }
      const ctype = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const ext = CUSTOM_FRAME_EXT[ctype];
      if (!ext) {
        res.statusCode = 415;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: '不支持的格式：' + ctype + '（仅支持 JPG / PNG / WebP）' }));
        return;
      }
      const dir = customFrameDir();
      for (const e of ['png', 'jpg', 'webp']) {
        if (e !== ext) { try { unlinkSync(join(dir, id + '.' + e)); } catch {   } }
      }
      const target = join(dir, id + '.' + ext);
      const tmpAbs = target + '.tmp';
      const ws = createWriteStream(tmpAbs);
      let size = 0;
      let failed = false;
      let completed = false;
      let tmpCleaned = false;
      const cleanupTmp = () => {
        if (tmpCleaned) return;
        tmpCleaned = true;
        try { unlinkSync(tmpAbs); } catch {   }
      };
      const fail = (code, payload) => {
        if (failed) return;
        failed = true;
        try { ws.destroy(); } catch {   }
        res.statusCode = code;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(payload));
        lingerClose(req, res);
      };
      ws.on('error', () => fail(500, { error: 'write failed' }));
      ws.on('close', () => { if (failed) cleanupTmp(); });
      req.once('close', () => {
        if (completed || failed) return;
        failed = true;
        try { ws.destroy(); } catch {   }
        cleanupTmp();
      });
      armBodyIdleTimeout(req, () => fail(408, { error: 'request timeout' }));
      req.on('data', (c) => {
        if (failed) return;
        size += c.length;
        if (size > CUSTOM_FRAME_MAX_BYTES) { fail(413, { error: '图片过大（上限 30MB）' }); return; }
        if (!ws.write(c)) req.pause();
      });
      ws.on('drain', () => { if (!failed) req.resume(); });
      req.on('end', () => {
        if (failed) return;
        completed = true;
        ws.end(() => {
          try { renameSync(tmpAbs, target); } catch { fail(500, { error: 'publish failed' }); return; }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: true, id, bytes: size }));
        });
      });
    },
  }));
}
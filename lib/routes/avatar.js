import { readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { bodyReader } from '../http-body.js';
import { sendJson } from '../json-response.js';
function avatarStamp() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
export function registerAvatarRoutes(webServer, c) {
  const {
    disposers, base: BASE, serveFile,
    avatarDir, avatarPath, AVATAR_SIDES, AVATAR_EXT, AVATAR_MAX_BYTES,
    atomicWriteFileP, armBodyIdleTimeout, lingerClose,
  } = c;
  disposers.push(webServer.register({
    kind: 'prefix',
    path: `${BASE}/avatar`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      const pathname = new URL(req.url || '/', 'http://x').pathname;
      const side = decodeURIComponent(pathname.slice(`${BASE}/avatar/`.length)).replace(/\/+$/, '');
      const json = (code, payload) => sendJson(res, code, payload);
      if (!AVATAR_SIDES.includes(side)) { json(400, { error: 'bad-side' }); return; }
      if (method === 'GET' || method === 'HEAD') {
        const p = avatarPath(side);
        if (!p) { json(404, { error: 'not-set' }); return; }
        res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
        serveFile(p, req, res, method === 'HEAD');
        return;
      }
      if (method === 'DELETE') {
        const p = avatarPath(side);
        let removed = false;
        if (p) {
          try { unlinkSync(p); removed = true; } catch {   }
        }
        json(200, { ok: true, side, removed });
        return;
      }
      if (method !== 'POST') { json(405, { error: 'method not allowed' }); return; }
      const ctype = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const ext = AVATAR_EXT[ctype];
      if (!ext) {
        json(415, { error: '不支持的格式：' + ctype + '（仅支持 JPG / PNG / WebP）' });
        return;
      }
      const dir = avatarDir();
      let timedOut = false;
      let tooLarge = false;
      armBodyIdleTimeout(req, () => {
        timedOut = true;
        json(408, { error: 'request timeout' });
      });
      const reader = bodyReader(req, {
        maxBytes: AVATAR_MAX_BYTES,
        shouldStop: () => timedOut || tooLarge,
        onOverflow: () => {
          tooLarge = true;
          json(413, { error: '图片过大（上限 8MB）' });
        },
      });
      req.on('data', reader.onData);
      req.on('end', () => {
        if (timedOut || tooLarge) return;
        const body = reader.buf();
        if (!body.length) { json(400, { error: 'empty body' }); return; }
        try {
          for (const name of readdirSync(dir)) {
            if (name.slice(0, side.length + 1) !== side + '-') continue;
            try { unlinkSync(join(dir, name)); } catch {   }
          }
        } catch {   }
        const name = side + '-' + avatarStamp() + '.' + ext;
        atomicWriteFileP(join(dir, name), body).then(
          () => json(200, { ok: true, side, name, bytes: body.length }),
          () => {
            json(500, { error: 'write failed' });
            lingerClose(req, res);
          },
        );
      });
      req.on('error', () => { if (!timedOut && !tooLarge) json(400, { error: 'request error' }); });
    },
  }));
}
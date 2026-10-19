import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { bodyReader } from '../http-body.js';
export function registerUploadRoutes(webServer, c) {
  const {
    disposers, base: BASE, tokenFor, UPLOAD_EXT, UPLOAD_MAX_BYTES, CONTROL_JSON_MAX_BYTES,
    ensureUploadDir, readUploadMeta, metaEntry, setUploadMeta, removeUploadMeta,
    resolveUploadFile, setUploadDir, normalizeUserDir, armBodyIdleTimeout, lingerClose,
  } = c;
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/upload`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'POST') {
        res.statusCode = 405; res.end('method not allowed'); return;
      }
      const query = new URL(req.url || '/', 'http://x').searchParams;
      const title = (query.get('title') || '').trim().slice(0, 80);
      const ctype = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const ext = UPLOAD_EXT[ctype];
      if (!ext) {
        res.statusCode = 415;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
          error: '不支持的格式：' + ctype + '（仅支持 JPG / PNG / MP4）',
        }));
        return;
      }
      const dir = ensureUploadDir();
      const id = 'up-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      const fileAbs = join(dir, id + '.' + ext);
      const tmpAbs = fileAbs + '.tmp';
      const hash = createHash('sha256');
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
      ws.on('error', () => fail(500, { error: 'upload write failed' }));
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
        if (size > UPLOAD_MAX_BYTES) {
          fail(413, { error: '文件过大（上限 512MB）' });
          return;
        }
        hash.update(c);
        if (!ws.write(c)) req.pause();
      });
      ws.on('drain', () => { if (!failed) req.resume(); });
      req.on('end', () => {
        if (failed) return;
        completed = true;
        ws.end(async () => {
          try {
            const sha = hash.digest('hex');
            const meta = readUploadMeta();
            let dupId = null;
            for (const metaId of Object.keys(meta)) {
              if (metaEntry(meta, metaId).sha256 === sha) { dupId = metaId; break; }
            }
            if (dupId) {
              const existing = resolveUploadFile(dir, dupId);
              if (existing && existsSync(existing)) {
                failed = true;
                const eext = existing.slice(existing.lastIndexOf('.') + 1).toLowerCase();
                const etype = eext === 'mp4' ? 'video' : 'image';
                const etitle = metaEntry(meta, dupId).title || dupId;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({
                  id: dupId,
                  title: etitle,
                  type: etype,
                  playable: true,
                  duplicate: true,
                  media: `${BASE}/media/${tokenFor(existing)}`,
                  preview: etype === 'image' ? `${BASE}/preview/${tokenFor(existing)}` : null,
                }));
                return;
              }
            }
            renameSync(tmpAbs, fileAbs);
            await setUploadMeta(id, title || id, sha);
            const type = ext === 'mp4' ? 'video' : 'image';
            const payload = {
              id,
              title: title || id,
              type,
              playable: true,
              media: `${BASE}/media/${tokenFor(fileAbs)}`,
              preview: type === 'image' ? `${BASE}/preview/${tokenFor(fileAbs)}` : null,
            };
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(payload));
          } catch (err) {
            failed = true;
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: String(err && err.message ? err.message : err) }));
          }
        });
      });
      req.on('error', () => {
        if (!failed) {
          failed = true;
          try { ws.destroy(); } catch {   }
          res.statusCode = 400; res.end('request error');
        }
      });
    },
  }));
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/remove`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'POST') {
        res.statusCode = 405; res.end('method not allowed'); return;
      }
      let timedOut = false;
      let tooLarge = false;
      armBodyIdleTimeout(req, () => {
        timedOut = true;
        res.statusCode = 408;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'request timeout' }));
      });
      const reader = bodyReader(req, {
        maxBytes: CONTROL_JSON_MAX_BYTES,
        shouldStop: () => timedOut,
        onOverflow: () => {
          tooLarge = true;
          res.statusCode = 413;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'payload too large' }));
        },
      });
      req.on('data', reader.onData);
      req.on('end', async () => {
        if (timedOut || tooLarge) return;
        const body = reader.text();
        let id = null;
        try { id = JSON.parse(body || '{}').id; } catch {   }
        const dir = ensureUploadDir();
        const abs = resolveUploadFile(dir, id);
        if (!abs) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'invalid upload id' }));
          return;
        }
        let removed = false;
        try { unlinkSync(abs); removed = true; } catch {   }
        await removeUploadMeta(id);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ removed }));
      });
      req.on('error', () => { res.statusCode = 400; res.end('request error'); });
    },
  }));
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/upload-dir`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'POST') {
        res.statusCode = 405; res.end('method not allowed'); return;
      }
      let timedOut = false;
      let tooLarge = false;
      armBodyIdleTimeout(req, () => {
        timedOut = true;
        res.statusCode = 408;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'request timeout' }));
      });
      const reader = bodyReader(req, {
        maxBytes: CONTROL_JSON_MAX_BYTES,
        shouldStop: () => timedOut,
        onOverflow: () => {
          tooLarge = true;
          res.statusCode = 413;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'payload too large' }));
        },
      });
      req.on('data', reader.onData);
      req.on('end', () => {
        if (timedOut || tooLarge) return;
        const body = reader.text();
        let dirRaw = null;
        let migrate = true;
        try {
          const o = JSON.parse(body || '{}');
          dirRaw = o.dir;
          migrate = o.migrate !== false;
        } catch {   }
        const dir = normalizeUserDir(dirRaw);
        if (!dir) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({
            error: '请输入有效的绝对路径（如 D:\\MyWallpapers 或 /data/wallpapers）',
          }));
          return;
        }
        try { mkdirSync(dir, { recursive: true }); } catch {   }
        let isDir = false;
        try { isDir = statSync(dir).isDirectory(); } catch {   }
        if (!isDir) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: '无法在该路径创建目录（权限不足或路径被占用）' }));
          return;
        }
        setUploadDir(dir, migrate).then(
          (result) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(result));
          },
          (err) => {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: String(err && err.message ? err.message : err) }));
          },
        );
      });
      req.on('error', () => { res.statusCode = 400; res.end('request error'); });
    },
  }));
}
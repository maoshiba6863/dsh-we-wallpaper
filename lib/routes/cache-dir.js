import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, parse } from 'node:path';
import { bodyReader } from '../http-body.js';
import { sendJson } from '../json-response.js';
export function registerCacheDirRoutes(webServer, c) {
  const {
    disposers, base: BASE, CONTROL_JSON_MAX_BYTES,
    normalizeUserDir, cacheBaseDir, setCacheDir, armBodyIdleTimeout,
  } = c;
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/cache-dir`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'POST') { res.statusCode = 405; res.end('method not allowed'); return; }
      let timedOut = false;
      let tooLarge = false;
      armBodyIdleTimeout(req, () => {
        timedOut = true;
        sendJson(res, 408, { error: 'request timeout' });
      });
      const reader = bodyReader(req, {
        maxBytes: CONTROL_JSON_MAX_BYTES,
        shouldStop: () => timedOut,
        onOverflow: () => {
          tooLarge = true;
          sendJson(res, 413, { error: 'payload too large' });
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
          sendJson(res, 400, { error: '请输入有效的绝对路径（如 D:\\WallpaperEngineCache 或 /data/we-cache）' });
          return;
        }
        try { mkdirSync(dir, { recursive: true }); } catch {   }
        let isDir;
        try { isDir = statSync(dir).isDirectory(); } catch { isDir = false; }
        if (!isDir) {
          sendJson(res, 400, { error: '无法在该路径创建目录（权限不足或路径被占用）' });
          return;
        }
         
         
        setCacheDir(dir, migrate).then((result) => {
          sendJson(res, 200, { ...result, effective: cacheBaseDir() });
        }, (err) => {
          sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        });
      });
      req.on('error', () => { res.statusCode = 400; res.end('request error'); });
    },
  }));
  disposers.push(webServer.register({
    kind: 'prefix',
    path: `${BASE}/cache-dir/browse`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'GET') { res.statusCode = 405; res.end('method not allowed'); return; }
      let raw;
      try { raw = new URL(req.url || '/', 'http://x').searchParams.get('path') || ''; } catch { raw = ''; }
      const dir = normalizeUserDir(raw);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      if (!dir) {
        sendJson(res, 200, { current: '', parent: null, home: homedir(), dirs: listDriveRoots() });
        return;
      }
      let isDir;
      try { isDir = statSync(dir).isDirectory(); } catch { isDir = false; }
      if (!isDir) {
        sendJson(res, 400, { error: '该路径不是目录或不存在' });
        return;
      }
      let names = null;
      let readErr = null;
      try {
        names = readdirSync(dir, { withFileTypes: true })
          .filter((ent) => ent.isDirectory())
          .map((ent) => ent.name);
      } catch (err) {
        readErr = String(err && err.code ? err.code : (err && err.message ? err.message : err));
      }
      if (names === null) {
        sendJson(res, 400, { error: '无法读取该目录：' + readErr });
        return;
      }
      names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
      let truncated = false;
      if (names.length > BROWSE_MAX_ENTRIES) {
        names = names.slice(0, BROWSE_MAX_ENTRIES);
        truncated = true;
      }
      const atRoot = parse(dir).root === dir;
      sendJson(res, 200, {
        current: dir,
        parent: atRoot ? null : dirname(dir),
        dirs: names.map((name) => ({ name, path: join(dir, name) })),
        truncated,
      });
    },
  }));
}
const BROWSE_MAX_ENTRIES = 2000;
function listDriveRoots() {
  if (process.platform !== 'win32') return [{ name: '/', path: '/' }];
  const out = [];
  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i) + ':\\';
    try { if (statSync(letter).isDirectory()) out.push({ name: letter, path: letter }); } catch {   }
  }
  return out;
}
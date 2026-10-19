import { statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { bodyReader } from '../http-body.js';
import { sendJson } from '../json-response.js';
export function registerWeAssetsRoutes(webServer, c) {
  const {
    disposers, base: BASE, serveFile,
    CONTROL_JSON_MAX_BYTES, normalizeUserDir,
    setWeAssetsDir, listWeAssetNames, weAssetsAvailable,
    WE_ASSETS_SOURCE_ID, getWeAssetsDir,
  } = c;
  disposers.push(webServer.register({
    kind: 'prefix',
    path: '/api/local-assets',
    handler: async (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') { res.statusCode = 405; res.end('method not allowed'); return; }
      const jsonOut = (code, payload) => sendJson(res, code, payload);
      let rest;
      try {
        rest = new URL(req.url || '/', 'http://x').pathname.slice('/api/local-assets'.length);
      } catch { jsonOut(400, { error: 'bad request' }); return; }
      if (rest === '' || rest === '/') {
        const ok = weAssetsAvailable();
        jsonOut(200, { ok, roots: ok ? [{ id: WE_ASSETS_SOURCE_ID, dir: getWeAssetsDir() }] : [] });
        return;
      }
      if (!weAssetsAvailable()) { jsonOut(404, { ok: false, error: '素材目录未配置或不可用' }); return; }
      const root = getWeAssetsDir();
      let segs;
      try {
        segs = rest.replace(/^\/+/, '').split('/').filter(Boolean).map(decodeURIComponent);
      } catch { jsonOut(400, { error: '路径非法' }); return; }
      const id = segs.shift() || '';
      if (id !== WE_ASSETS_SOURCE_ID) { jsonOut(404, { error: `未知素材源：${id}` }); return; }
      const rel = segs.join('/');
      if (rel === 'materials/index.json') {
        jsonOut(200, { names: await listWeAssetNames(root) });
        return;
      }
      if (!rel) { jsonOut(400, { error: '路径非法' }); return; }
      const target = resolve(root, rel);
      if (!target.startsWith(root + sep)) { jsonOut(403, { error: 'forbidden' }); return; }
      let isFile = false;
      try { isFile = statSync(target).isFile(); } catch {   }
      if (!isFile) { jsonOut(404, { error: `素材不存在：${rel}` }); return; }
      serveFile(target, req, res, method === 'HEAD');
    },
  }));
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/we-assets-dir`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      const jsonOut = (code, payload) => sendJson(res, code, payload, null);
      if (method === 'GET') {
        jsonOut(200, { dir: getWeAssetsDir(), available: weAssetsAvailable() });
        return;
      }
      if (method !== 'POST') { res.statusCode = 405; res.end('method not allowed'); return; }
      let tooLarge = false;
      const reader = bodyReader(req, {
        maxBytes: CONTROL_JSON_MAX_BYTES,
        onOverflow: () => { tooLarge = true; jsonOut(413, { error: 'payload too large' }); },
      });
      req.on('data', reader.onData);
      req.on('end', () => {
        if (tooLarge) return;
        const body = reader.text();
        let dirRaw = null;
        try { dirRaw = JSON.parse(body || '{}').dir; } catch {   }
        if (dirRaw === '' || dirRaw === null) {
          setWeAssetsDir(null).then(
            () => jsonOut(200, { dir: null, available: false }),
            (err) => jsonOut(500, { error: String(err && err.message ? err.message : err) }),
          );
          return;
        }
        const dir = normalizeUserDir(dirRaw);
        if (!dir) {
          jsonOut(400, { error: '请输入有效的绝对路径（如 D:\\Steam\\steamapps\\common\\wallpaper_engine\\assets 或 ~/WE/assets）' });
          return;
        }
        let hasMaterials = false;
        try { hasMaterials = statSync(join(dir, 'materials')).isDirectory(); } catch {   }
        if (!hasMaterials) {
          jsonOut(400, { error: '该目录下没有 materials/ 子目录 —— 请指向 WE 安装目录的 assets 树（或其拷贝）' });
          return;
        }
        setWeAssetsDir(dir).then(
          async () => jsonOut(200, { dir, available: true, textures: (await listWeAssetNames(dir)).length }),
          (err) => jsonOut(500, { error: String(err && err.message ? err.message : err) }),
        );
      });
      req.on('error', () => {
        if (tooLarge) return;
        res.statusCode = 400; res.end('request error');
      });
    },
  }));
}
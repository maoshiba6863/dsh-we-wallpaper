import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
let occlusionBridgeVersionCache;
function occlusionBridgeVersion() {
  if (occlusionBridgeVersionCache !== undefined) return occlusionBridgeVersionCache;
  try {
    const bridgePath = resolve(dirname(fileURLToPath(import.meta.url)), '../webwallgl/occlusion-bridge.js');
    occlusionBridgeVersionCache = createHash('sha256').update(readFileSync(bridgePath)).digest('hex').slice(0, 12);
  } catch {
    occlusionBridgeVersionCache = '0';
  }
  return occlusionBridgeVersionCache;
}
const ENGINE_PREFIX = 'engine/';
export function registerSceneServeRoutes(webServer, c) {
  const {
    disposers, base: BASE, WEBWALLGL_DIR, WEBWALLGL_PKG_DIR, appendDiagLine, traceRequests, serveFile,
    handleSceneFiles, mediaOriginInfo, payloadProgress, log,
  } = c;
  disposers.push(webServer.register({
    kind: 'prefix',
    path: `${BASE}/scene-live`,
    handler: (req, res) => {
      traceRequests(res, 'scene-live', new URL(req.url || '/', 'http://x').pathname);
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') { res.statusCode = 405; res.end('method not allowed'); return; }
      let rest;
      try {
        rest = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname.slice(`${BASE}/scene-live`.length));
      } catch {
        res.statusCode = 400; res.end('bad request'); return;
      }
      rest = rest.replace(/^\/+/, '');
      if (!rest || rest.endsWith('/')) rest += 'index.html';
      const isEngine = rest.startsWith(ENGINE_PREFIX);
      if (isEngine && !WEBWALLGL_PKG_DIR) {
        log.warn('scene-live engine missing: npm dependency `webwallgl` is not installed');
        res.setHeader('Cache-Control', 'no-store');
        res.statusCode = 404; res.end('webwallgl-not-installed'); return;
      }
      const rootDir = isEngine ? WEBWALLGL_PKG_DIR : WEBWALLGL_DIR;
      const abs = resolve(rootDir, isEngine ? rest.slice(ENGINE_PREFIX.length) : rest);
      if (abs === rootDir || !abs.startsWith(rootDir + sep)) {
        appendDiagLine('fence', { route: 'scene-live', rest: rest.slice(0, 160), referer: String(req.headers.referer || '').slice(0, 120), dest: req.headers['sec-fetch-dest'] || '' });
        log.warn(`scene-live fenced: rest="${rest}" referer="${req.headers.referer || '-'}" ua-iframe=${req.headers['sec-fetch-dest'] || '-'}`);
        res.setHeader('Cache-Control', 'no-store');
        res.statusCode = 403; res.end(`forbidden-scene-live[${rest}]`); return;
      }
      if (rest === 'index.html' || rest === 'default-wallpaper/index.html') {
        res.setHeader('Cache-Control', 'no-store');
        if (method === 'GET' && rest === 'index.html') {
          let html;
          try { html = readFileSync(join(WEBWALLGL_DIR, 'index.html'), 'utf8'); } catch { html = ''; }
          if (html) {
            const tag = `<script src="${BASE}/scene-live/occlusion-bridge.js?v=${occlusionBridgeVersion()}"></script>`;
            const m = /<head[^>]*>/i.exec(html);
            html = m
              ? html.slice(0, m.index + m[0].length) + tag + html.slice(m.index + m[0].length)
              : tag + html;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(html);
            return;
          }
        }
        serveFile(abs, req, res, method === 'HEAD');
        return;
      }
      serveFile(abs, req, res, method === 'HEAD', { revalidate: true });
    },
  }));
  disposers.push(webServer.register({
    kind: 'prefix',
    path: `${BASE}/scene-files`,
    handler: (req, res) => handleSceneFiles(req, res, 'app'),
  }));
  disposers.push(webServer.register({
    kind: 'prefix',
    path: `${BASE}/media-origin`,
    handler: (req, res) => {
      mediaOriginInfo().then((info) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(info));
      });
    },
  }));
  disposers.push(webServer.register({
    kind: 'prefix',
    path: `${BASE}/scene-payload-progress`,
    handler: (req, res) => {
      let token;
      try { token = new URL(req.url || '/', 'http://x').searchParams.get('token') || ''; } catch { token = ''; }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(payloadProgress(token)));
    },
  }));
}
import { createServer } from 'node:http';
import { ADAPTER_TARGET_VALUES } from './settings-schema.js';
export function createMediaOrigin({ base, log, notice, appendDiagLine, disposers, handleSceneFiles, readSettings }) {
  let adapterFenceSeen = false;
  let adapterShellSeen = false;
  let adapterOverride = 'auto';
  function observeAdapter(req) {
    const headers = (req && req.headers) || {};
    if (headers['x-dsh-desktop-renderer'] !== undefined) adapterFenceSeen = true;
    const ua = headers['user-agent'];
    if (typeof ua === 'string' && /Electron\//i.test(ua)) adapterShellSeen = true;
    const s = readSettings();
    const picked = s && typeof s.adapterTarget === 'string' ? s.adapterTarget : 'auto';
    adapterOverride = ADAPTER_TARGET_VALUES.includes(picked) ? picked : 'auto';
  }
  function adapterDetectedTarget() {
    if (adapterFenceSeen) return 'desktop-community';
    if (adapterShellSeen) return 'desktop-official';
    return 'browser';
  }
  function adapterState() {
    return {
      detected: adapterDetectedTarget(),
      fence: adapterFenceSeen,
      target: adapterOverride !== 'auto' ? adapterOverride : adapterDetectedTarget(),
    };
  }
  function mediaOriginNeeded() {
    if (adapterOverride === 'browser') return false;
    if (adapterOverride !== 'auto') return true;
    return adapterFenceSeen || adapterShellSeen;
  }
  let mediaOrigin = null;
  let mediaOriginTask = null;
  let mediaOriginDead = false;
  let mediaDiagHandler = null;
  function mediaOriginBase() {
    if (!mediaOriginNeeded()) return Promise.resolve('');
    return ensureMediaOrigin().then((m) => (m ? m.base : ''));
  }
  function ensureSceneMediaOrigin() {
    return ensureMediaOrigin().then((m) => (m ? m.base : ''));
  }
  function ensureMediaOrigin() {
    if (mediaOrigin) return Promise.resolve(mediaOrigin);
    if (mediaOriginDead) return Promise.resolve(null);
    if (mediaOriginTask) return mediaOriginTask;
    mediaOriginTask = new Promise((done) => {
      const unavailable = (cause) => {
        const msg = cause instanceof Error ? cause.message : String(cause);
        log.error(`壁纸媒体源不可用（网页壁纸回落应用源；Desktop 上会 403）：${msg}`);
        appendDiagLine('media-origin', { base: null, error: msg.slice(0, 160) });
        mediaOriginTask = null;
        mediaOriginDead = true;
        done(null);
      };
      let server;
      try {
        server = createServer((req, res) => {
          let pathname;
          try { pathname = new URL(req.url || '/', 'http://x').pathname; } catch { pathname = ''; }
          if (pathname === '/diag' || pathname === `${base}/diag`) {
            if (mediaDiagHandler) { mediaDiagHandler(req, res); return; }
          }
          if (!pathname.startsWith(`${base}/scene-files/`)) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end('not found');
            return;
          }
          handleSceneFiles(req, res, 'media');
        });
      } catch (cause) { unavailable(cause); return; }
      server.on('clientError', (_err, socket) => { try { socket.destroy(); } catch {   } });
      server.on('error', unavailable);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = addr && typeof addr === 'object' ? addr.port : 0;
        if (!port) { unavailable(new Error('listen 未返回端口')); return; }
        mediaOrigin = { server, port, base: `http://127.0.0.1:${port}` };
        appendDiagLine('media-origin', { base: mediaOrigin.base });
        notice('media-origin', () => `壁纸媒体源已监听 ${mediaOrigin.base}（网页壁纸载荷不再经过插件路由的能力头栅栏）`);
        done(mediaOrigin);
      });
    });
    return mediaOriginTask;
  }
  disposers.push(() => { try { mediaOrigin?.server?.close(); } catch {   } });
  function mediaOriginInfo() {
    return ensureMediaOrigin().then((m) => ({ base: (m && m.base) || null, port: mediaOrigin ? mediaOrigin.port : null }));
  }
  return {
    observeAdapter,
    adapterState,
    mediaOriginBase,
    ensureSceneMediaOrigin,
    mediaOriginInfo,
    setDiagHandler: (fn) => { mediaDiagHandler = fn; },
  };
}
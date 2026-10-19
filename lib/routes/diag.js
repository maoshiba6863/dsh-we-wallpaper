const FAIL_REPORT_RE = /失败(?!\s*[:：]?\s*0)|\bERR|不可用|黑屏|fallback/;
import { bodyReader } from '../http-body.js';
function levelForReport(msg, lvl) {
  if (lvl === 'error' || lvl === 'warn' || lvl === 'info') return lvl;
  return FAIL_REPORT_RE.test(msg) ? 'warn' : 'info';
}
export function registerDiagRoutes(webServer, c) {
  const { disposers, appendDiagLine, log, notice, base: BASE, onHandleDiag } = c;
  const isSceneReady = (body) =>
    String(body.event || '') === 'live-ready' && String(body.type || '') === 'scene';
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/client-diag`,
    handler: (req, res) => {
      if ((req.method || '').toUpperCase() !== 'POST') { res.statusCode = 405; res.end(); return; }
      let done = false;
      const reader = bodyReader(req, {
        maxBytes: 64 * 1024,
        shouldStop: () => done,
        onOverflow: () => { done = true; res.statusCode = 413; res.end(); },
      });
      req.on('data', reader.onData);
      req.on('end', () => {
        if (done) return;
        done = true;
        try {
          const body = JSON.parse(reader.text());
          appendDiagLine('client', {
            event: String(body.event || ''),
            type: String(body.type || ''),
            id: String(body.id || ''),
            detail: String(body.detail || '').slice(0, 300),
            src: String(body.src || '').slice(0, 200),
          });
          if (isSceneReady(body)) notice('scene-ready', '场景壁纸已就绪');
        } catch {   }
        res.statusCode = 204;
        res.end();
      });
    },
  }));
  const diagLog = [];
  const reportLog = log.tag('renderer');
  const handleDiag = (req, res) => {
    try {
      const u = new URL(req.url || '/diag', 'http://x');
      const msg = u.searchParams.get('msg') || '';
      if (msg) {
        diagLog.push({ t: Date.now(), msg });
        if (diagLog.length > 200) diagLog.shift();
        appendDiagLine('renderer', { msg: msg.slice(0, 300) });
        reportLog(msg, levelForReport(msg, u.searchParams.get('lvl')));
      }
    } catch {   }
    res.statusCode = 204;
    res.end();
  };
  disposers.push(webServer.register({ kind: 'exact', path: '/diag', handler: handleDiag }));
  disposers.push(webServer.register({ kind: 'exact', path: `${BASE}/diag`, handler: handleDiag }));
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/diag-log`,
    handler: (req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ entries: diagLog.slice(-80) }));
    },
  }));
  if (onHandleDiag) onHandleDiag(handleDiag);
}
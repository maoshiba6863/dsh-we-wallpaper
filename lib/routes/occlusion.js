import { sendJson } from '../json-response.js';
export function registerOcclusionRoutes(webServer, c) {
  const { disposers, base: BASE, hub, log, diag } = c;
  const tracing = () => process.env.DSH_WE_OCCLUSION_TRACE === '1';
  const traceLog = (line) => {
    if (typeof log === 'function') log(line);
  };
  const traceDiag = (obj) => {
    if (typeof diag === 'function') {
      try {
        diag(obj);
      } catch {   }
    }
  };
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/occlusion`,
    handler: async (req, res) => {
      const trace = tracing();
      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        sendJson(res, 405, { ok: 0, error: 'method not allowed' });
        if (trace) {
          traceLog(`${req.method} ${BASE}/occlusion -> 405 (allow: GET)`);
          traceDiag({ ev: '405', method: String(req.method || '') });
        }
        return;
      }
      const t0 = Date.now();
      const snap = hub.getSnapshot();
      sendJson(res, 200, snap);
      if (trace) {
        const ms = Date.now() - t0;
        traceLog(`GET ${BASE}/occlusion -> 200 gen=${snap.gen} backend=${snap.backend} rects=${snap.rects ? snap.rects.length : 'null'} (${ms}ms)`);
        traceDiag({ ev: 'get', gen: snap.gen, backend: snap.backend, rects: snap.rects ? snap.rects.length : null, ms });
      }
    },
  }));
}
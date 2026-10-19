import { sendJson } from '../json-response.js';
export function registerBillingRoutes(webServer, c) {
  const { disposers, base: BASE, billing } = c;
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/billing`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET, HEAD');
        res.end();
        return;
      }
      let sessionId = '';
      try {
        const url = new URL(req.url || '/', 'http://x');
        const raw = url.searchParams.get('sessionId');
        if (typeof raw === 'string' && raw.length > 0 && raw.length <= 512) sessionId = raw;
      } catch {   }
      try {
        const snapshot = billing.snapshot({ sessionId });
        if (method === 'HEAD') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end();
          return;
        }
        sendJson(res, 200, snapshot);
      } catch (error) {
        sendJson(res, 500, { error: String((error && error.message) || error) });
      }
    },
  }));
}
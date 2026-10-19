import { sendJson } from '../json-response.js';
export function registerBillingBalanceRoutes(webServer, c) {
  const { disposers, base: BASE, balance } = c;
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/billing/balance`,
    handler: async (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET, HEAD');
        res.end();
        return;
      }
      try {
        const snapshot = await balance.snapshot();
        if (method === 'HEAD') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end();
          return;
        }
        sendJson(res, 200, snapshot);
      } catch (error) {
        sendJson(res, 500, { status: 'error', message: String((error && error.message) || error) });
      }
    },
  }));
}
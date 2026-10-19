import { BILLING_CURRENCY, BILLING_PRICES_CNY, turnCostFromEvents } from '../billing.js';
import { sendJson } from '../json-response.js';
const MAX_SEQ = Number.MAX_SAFE_INTEGER;
function seqOf(raw) {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 && n <= MAX_SEQ ? n : NaN;
}
export function registerBillingTurnRoutes(webServer, c) {
  const { disposers, base: BASE, ctx } = c;
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/billing/turn`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET, HEAD');
        res.end();
        return;
      }
      let query;
      try { query = new URL(req.url || '/', 'http://x').searchParams; } catch { query = null; }
      const sessionId = query ? String(query.get('sessionId') || '') : '';
      const start = query ? seqOf(query.get('start')) : NaN;
      const end = query ? seqOf(query.get('end')) : NaN;
      if (!sessionId || sessionId.length > 512 || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
        sendJson(res, 200, { status: 'unavailable' });
        return;
      }
      if (method === 'HEAD') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end();
        return;
      }
      try {
        const sessions = ctx && typeof ctx.get === 'function' ? ctx.get('sessions') : undefined;
        const session = sessions && typeof sessions.get === 'function' ? sessions.get(sessionId) : undefined;
        const events = session && typeof session.snapshotEvents === 'function' ? session.snapshotEvents() : null;
        const result = turnCostFromEvents(events, start, end);
        if (!result) {
          sendJson(res, 200, { status: 'unavailable' });
          return;
        }
        sendJson(res, 200, {
          status: 'ok',
          currency: BILLING_CURRENCY,
          prices: BILLING_PRICES_CNY,
          ...result,
        });
      } catch (error) {
        sendJson(res, 500, { status: 'error', message: String((error && error.message) || error) });
      }
    },
  }));
}
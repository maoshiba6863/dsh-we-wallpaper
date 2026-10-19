import { bodyReader } from '../http-body.js';
import { sendJson } from '../json-response.js';
const SETTINGS_MAX_BYTES = 64 * 1024;
export function registerSettingsRoutes(webServer, c) {
  const {
    disposers, base: BASE, ctx, mediaOriginApi,
    readSettings, isBetterSidebarLoaded, sanitizeSettings, withLegacyFontValues, writeSettings,
    armBodyIdleTimeout, lingerClose,
  } = c;
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/settings`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      const json = (code, payload) => sendJson(res, code, payload);
      if (method === 'GET') {
        mediaOriginApi.observeAdapter(req);
        json(200, {
          settings: readSettings(),
          betterSidebar: isBetterSidebarLoaded(ctx),
          adapter: mediaOriginApi.adapterState(),
        });
        return;
      }
      if (method !== 'PUT') {
        res.statusCode = 405; res.end('method not allowed'); return;
      }
      let tooLarge = false;
      const fail = (code, payload) => {
        if (tooLarge) return;
        tooLarge = true;
        json(code, payload);
        lingerClose(req, res);
      };
      armBodyIdleTimeout(req, () => fail(408, { error: 'request timeout' }));
      const reader = bodyReader(req, {
        maxBytes: SETTINGS_MAX_BYTES,
        onOverflow: () => fail(413, { error: 'settings payload too large' }),
      });
      req.on('data', reader.onData);
      req.on('end', () => {
        if (tooLarge) return;
        const body = reader.text();
        let parsed;
        try { parsed = JSON.parse(body || '{}'); } catch {
          json(400, { error: 'invalid JSON body' }); return;
        }
        const sanitized = sanitizeSettings(parsed);
        if (!sanitized) {
          json(400, { error: 'settings must be a JSON object' }); return;
        }
        const persisted = withLegacyFontValues(sanitized);
        writeSettings(persisted).then(
          () => json(200, { ok: true, settings: persisted }),
          (err) => json(500, { error: String(err && err.message ? err.message : err) }),
        );
      });
      req.on('error', () => { if (!tooLarge) json(400, { error: 'request error' }); });
    },
  }));
}
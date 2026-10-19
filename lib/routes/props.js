import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseUserPropDefs, entryDirPrefix, filterKnownOverrides } from '../we-props.js';
import { sendJson } from '../json-response.js';
export function registerPropsRoutes(webServer, c) {
  const { disposers, base: BASE, mediaMap, userPropsFor } = c;
  disposers.push(webServer.register({
    kind: 'prefix',
    path: `${BASE}/props`,
    handler: (req, res) => {
      const json = (code, payload) => sendJson(res, code, payload);
      if ((req.method || 'GET').toUpperCase() !== 'GET') { json(405, { ok: false, error: 'method-not-allowed' }); return; }
      let token;
      try {
        token = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname.slice(`${BASE}/props/`.length)).replace(/\/+$/, '');
      } catch { json(400, { ok: false, error: 'bad-request' }); return; }
      const abs = token ? mediaMap.get(token) : null;
      if (!abs) { json(404, { ok: false, error: 'unknown-token' }); return; }
      const dir = dirname(abs);
      let pj = null;
      try { pj = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')); } catch {   }
      const overrides = filterKnownOverrides(pj, userPropsFor(token));
      const files = [];
      const dirs = [];
      try {
        for (const ent of readdirSync(dir, { withFileTypes: true })) {
          if (ent.name.startsWith('.')) continue;
          if (ent.isDirectory()) { if (dirs.length < 60) dirs.push(`${ent.name}/`); }
          else if (files.length < 400) files.push(ent.name);
        }
      } catch {   }
      const props = parseUserPropDefs(pj, overrides, {
        filePrefix: entryDirPrefix(String((pj && pj.file) || '')),
        listFiles: files,
      }).map((d) => ((d.ptype === 'directory' && dirs.length) ? { ...d, files: dirs } : d));
      json(200, { ok: true, token, props, overrides, hasProject: Boolean(pj) });
    },
  }));
}
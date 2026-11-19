import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { sendJson } from '../json-response.js';

/* 插件版本检查：读 npm registry 的 latest，24 小时缓存一次，避免频繁请求。 */
const PACKAGE_NAME = 'dsh-we-wallpaper';
const CACHE_MS = 24 * 60 * 60 * 1000;

function cachePath() {
  return join(process.env.DSH_WE_DATA_DIR || join(homedir(), '.dsh-wallpaper-engine'), 'update-check.json');
}

function readCache() {
  try { return JSON.parse(readFileSync(cachePath(), 'utf8')); } catch { return null; }
}

function writeCache(value) {
  try { writeFileSync(cachePath(), JSON.stringify(value)); } catch {   }
}

function currentVersion() {
  try {
    const url = new URL('../../package.json', import.meta.url);
    return JSON.parse(readFileSync(url, 'utf8')).version || '';
  } catch { return ''; }
}

export function registerUpdateCheckRoutes(webServer, c) {
  const { disposers, base: BASE, log } = c;
  const state = { memory: null };
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/update-check`,
    handler: async (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'GET') { res.statusCode = 405; res.end('method not allowed'); return; }
      const now = Date.now();
      let cache = state.memory || readCache();
      if (!cache || !cache.at || now - cache.at > CACHE_MS) {
        try {
          const r = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(8000),
          });
          if (r.ok) {
            const j = await r.json();
            cache = { at: now, latest: String(j.version || '') };
            /* 这里的赋值发生在 await 之后，但状态只用于缓存版本号，不存在并发正确性问题 */
            // eslint-disable-next-line require-atomic-updates
            state.memory = cache;
            writeCache(cache);
          }
        } catch (e) {
          try { log(`update-check failed: ${e && e.message ? e.message : e}`, 'warn'); } catch {   }
        }
      }
      sendJson(res, 200, {
        current: currentVersion(),
        latest: cache && cache.latest ? cache.latest : '',
        checkedAt: cache && cache.at ? cache.at : 0,
      });
    },
  }));
}

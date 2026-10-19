import { mkdirSync, existsSync, statSync, renameSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
export function createHostDiagKit({ configPath }) {
  const DIAG_MAX_BYTES = 8 * 1024 * 1024;
  let diagBytes = -1;
  function appendDiagLine(kind, obj) {
    try {
      const dir = join(dirname(configPath()), 'diag');
      mkdirSync(dir, { recursive: true });
      const file = join(dir, 'http.jsonl');
      if (diagBytes < 0) diagBytes = existsSync(file) ? statSync(file).size : 0;
      if (diagBytes >= DIAG_MAX_BYTES) {
        if (existsSync(file)) {
          try {
            renameSync(file, file + '.1');
          } catch {
          }
        }
        diagBytes = 0;
      }
      const line = JSON.stringify({ t: Date.now(), kind, ...obj }) + '\n';
      appendFileSync(file, line);
      diagBytes += Buffer.byteLength(line);
    } catch {   }
  }
  const REQ_LOG_DEDUP_MS = 10000;
  const REQ_LOG_SEEN_MAX = 2000;
  const reqLogSeen = new Map();
  function reqLogSeenTouch(key, now, ttlMs) {
    const last = reqLogSeen.get(key);
    if (last !== undefined && now - last < ttlMs) return false;
    reqLogSeen.set(key, now);
    while (reqLogSeen.size > REQ_LOG_SEEN_MAX) {
      const oldest = reqLogSeen.keys().next();
      if (oldest.done) break;
      reqLogSeen.delete(oldest.value);
    }
    return true;
  }
  function foldTokenPath(p) {
    const raw = String(p || '');
    const slash = raw.indexOf('/');
    return (slash > 40 ? '<token>/' + raw.slice(slash + 1) : raw).slice(0, 150);
  }
  function traceRequests(res, route, pathKey) {
    try {
      const key = route + '\u0000' + String(pathKey);
      const now = Date.now();
      if (!reqLogSeenTouch(key, now, REQ_LOG_DEDUP_MS)) return;
      res.on('finish', () => {
        appendDiagLine('req', {
          route,
          path: foldTokenPath(pathKey),
          status: res.statusCode || 0,
          dest: String(res.req && res.req.headers ? res.req.headers['sec-fetch-dest'] || '' : ''),
        });
      });
    } catch {   }
  }
  return { appendDiagLine, traceRequests, foldTokenPath };
}
import { gzipSync } from 'node:zlib';
const GZIP_MIN_BYTES = 1024;
const GZIP_LEVEL = 1;
function acceptsGzip(res) {
  const req = res && res.req;
  const header = req && req.headers ? req.headers['accept-encoding'] : undefined;
  if (typeof header !== 'string') return false;
  const m = /(?:^|,)\s*gzip\s*(?:;\s*q=([0-9.]+))?\s*(?=,|$)/i.exec(header);
  return !!m && (m[1] === undefined || Number(m[1]) > 0);
}
export function sendJson(res, code, payload, cacheControl = 'no-store') {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (cacheControl !== null) res.setHeader('Cache-Control', cacheControl);
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const req = res && res.req;
  if (body.length >= GZIP_MIN_BYTES && !(req && req.method === 'HEAD')) {
    res.setHeader('Vary', 'Accept-Encoding');
    if (acceptsGzip(res)) {
      res.setHeader('Content-Encoding', 'gzip');
      res.end(gzipSync(body, { level: GZIP_LEVEL }));
      return;
    }
  }
  res.end(body);
}
import {
  createReadStream, existsSync, lstatSync, readFileSync, realpathSync, statSync,
} from 'node:fs';
import { Readable } from 'node:stream';
import { dirname, resolve, sep } from 'node:path';
import { weFocusGuardSource } from './we-focus-guard.js';
const PAYLOAD_LEDGER_MAX = 64;
const payloadLedger = new Map();
let payloadTransferSeq = 0;
const payloadOpen = new Map();
function payloadEntry(token) {
  let entry = payloadLedger.get(token);
  if (!entry) {
    entry = { served: 0, size: 0, active: 0, transfers: 0, completed: 0, startedAt: 0, lastByteAt: 0, lastEndAt: 0 };
    payloadLedger.set(token, entry);
    while (payloadLedger.size > PAYLOAD_LEDGER_MAX) {
      const oldest = payloadLedger.keys().next();
      if (oldest.done) break;
      payloadLedger.delete(oldest.value);
    }
  } else {
    payloadLedger.delete(token);
    payloadLedger.set(token, entry);
  }
  return entry;
}
function payloadBegin(token, size) {
  const entry = payloadEntry(token);
  const id = ++payloadTransferSeq;
  entry.active += 1;
  entry.transfers += 1;
  entry.size = Math.max(entry.size, Number(size) || 0);
  if (!entry.startedAt) entry.startedAt = Date.now();
  payloadOpen.set(id, { entry, settled: false });
  return id;
}
function payloadBytes(id, n) {
  const open = payloadOpen.get(id);
  if (!open || !n) return;
  open.entry.served += n;
  open.entry.lastByteAt = Date.now();
}
function payloadSettle(id, completed) {
  const open = payloadOpen.get(id);
  if (!open || open.settled) return;
  open.settled = true;
  payloadOpen.delete(id);
  open.entry.active = Math.max(0, open.entry.active - 1);
  open.entry.lastEndAt = Date.now();
  if (completed) open.entry.completed += 1;
}
export function payloadProgress(token) {
  const entry = token ? payloadLedger.get(token) : null;
  if (!entry) return { ok: false, token: String(token || ''), served: 0, size: 0, active: 0, transfers: 0, completed: 0, startedAt: 0, lastByteAt: 0, lastEndAt: 0 };
  return {
    ok: true,
    token: String(token),
    served: entry.served,
    size: entry.size,
    active: entry.active,
    transfers: entry.transfers,
    completed: entry.completed,
    startedAt: entry.startedAt,
    lastByteAt: entry.lastByteAt,
    lastEndAt: entry.lastEndAt,
  };
}
function mimeFor(absPath) {
  const ext = absPath.slice(absPath.lastIndexOf('.') + 1).toLowerCase();
  return {
    mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
    avi: 'video/x-msvideo', mov: 'video/quicktime',
    html: 'text/html', htm: 'text/html', js: 'text/javascript', mjs: 'text/javascript',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    png: 'image/png', webp: 'image/webp', apng: 'image/apng', bmp: 'image/bmp',
    css: 'text/css', json: 'application/json', svg: 'image/svg+xml',
    txt: 'text/plain', xml: 'application/xml', wasm: 'application/wasm',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav',
    m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac',
  }[ext] || 'application/octet-stream';
}
function notModifiedSince(req, etag, mtimeMs) {
  const headers = (req && req.headers) || {};
  const inm = headers['if-none-match'];
  if (typeof inm === 'string' && inm.trim()) {
    const want = inm.split(',').map((s) => s.trim().replace(/^W\//, ''));
    return want.includes('*') || want.includes(String(etag).replace(/^W\//, ''));
  }
  const ims = headers['if-modified-since'];
  if (typeof ims === 'string' && ims.trim()) {
    const t = Date.parse(ims);
    if (Number.isFinite(t)) return Math.floor(Number(mtimeMs) / 1000) * 1000 <= t;
  }
  return false;
}
function layoutRangeStream(layout, absPath, start, end) {
  const parts = [];
  for (const seg of layout.segments) {
    const segEnd = seg.vStart + seg.len - 1;
    if (segEnd < start || seg.vStart > end) continue;
    parts.push({
      seg,
      from: Math.max(start, seg.vStart) - seg.vStart,
      to: Math.min(end, segEnd) - seg.vStart,
    });
  }
  if (!parts.length) return Readable.from([], { objectMode: false });
  if (parts.length === 1) {
    const { seg, from, to } = parts[0];
    if (seg.buf) return Readable.from([seg.buf.subarray(from, to + 1)], { objectMode: false });
    return createReadStream(absPath, { start: seg.srcStart + from, end: seg.srcStart + to });
  }
  return Readable.from((async function* streamParts() {
    for (const { seg, from, to } of parts) {
      if (seg.buf) { yield seg.buf.subarray(from, to + 1); continue; }
      const rs = createReadStream(absPath, { start: seg.srcStart + from, end: seg.srcStart + to });
      try { for await (const chunk of rs) yield chunk; } finally { rs.destroy(); }
    }
  })(), { objectMode: false });
}
export function createServeKit(c) {
  const {
    activeStreams, BASE, mediaMap, log, appendDiagLine,
    traceRequests, traceMediaRequests, readWebShim, buildSeedScript,
  } = c;
  function trackStream(stream, res, payloadId) {
    activeStreams.add(stream);
    const cleanup = () => {
      activeStreams.delete(stream);
      if (!stream.destroyed) { try { stream.destroy(); } catch {   } }
    };
    stream.once('end', cleanup);
    stream.once('error', (err) => {
      cleanup();
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: String(err && err.message ? err.message : err) }));
      } else {
        try { res.destroy(); } catch {   }
      }
    });
    res.once('close', cleanup);
    stream.pipe(res);
    if (payloadId) {
      stream.on('data', (chunk) => {
        try { payloadBytes(payloadId, chunk && chunk.length ? chunk.length : 0); } catch {   }
      });
    }
    return stream;
  }
  function serveBytes(source, req, res, headOnly, opts) {
    const absPath = source.path;
    const layout = source.layout || null;
    if (!absPath || !existsSync(absPath)) {
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = 404; res.end('not found'); return;
    }
    const st = statSync(absPath);
    const size = layout ? layout.size : st.size;
    const payloadToken = opts && opts.payloadToken ? String(opts.payloadToken) : '';
    res.setHeader('Content-Type', mimeFor(absPath));
    res.setHeader('Accept-Ranges', 'bytes');
    if (opts && opts.revalidate) {
      const etag = 'W/"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
      res.setHeader('ETag', etag);
      res.setHeader('Last-Modified', new Date(st.mtimeMs).toUTCString());
      res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
      if (!headOnly && !req.headers.range && notModifiedSince(req, etag, st.mtimeMs)) {
        res.statusCode = 304; res.end(); return;
      }
    }
    const beginPayload = (bytes) => {
      if (headOnly || !payloadToken) return 0;
      const id = payloadBegin(payloadToken, bytes);
      res.once('finish', () => payloadSettle(id, true));
      res.once('close', () => payloadSettle(id, false));
      return id;
    };
    const openStream = (from, to) => (layout
      ? layoutRangeStream(layout, absPath, from, to)
      : createReadStream(absPath, { start: from, end: to }));
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (!m || (!m[1] && !m[2])) {
        res.statusCode = 416;
        res.setHeader('Content-Range', `bytes */${size}`);
        res.end(); return;
      }
      let start;
      let end;
      if (m[1] && m[2]) {
        start = parseInt(m[1], 10);
        end = Math.min(parseInt(m[2], 10), size - 1);
      } else if (m[1]) {
        start = parseInt(m[1], 10);
        end = size - 1;
      } else {
        start = Math.max(0, size - parseInt(m[2], 10));
        end = size - 1;
      }
      if (start > end) {
        res.statusCode = 416;
        res.setHeader('Content-Range', `bytes */${size}`);
        res.end(); return;
      }
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', String(end - start + 1));
      if (headOnly) { res.end(); return; }
      trackStream(openStream(start, end), res, beginPayload(end - start + 1));
      return;
    }
    res.setHeader('Content-Length', String(size));
    if (headOnly) { res.end(); return; }
    trackStream(openStream(0, size - 1), res, beginPayload(size));
  }
  function serveFile(absPath, req, res, headOnly, opts) {
    return serveBytes({ path: absPath, layout: null }, req, res, headOnly, opts);
  }
  function serveLayout(layout, absPath, req, res, headOnly) {
    if (!layout || layout.kind !== 'virtual') return serveFile(absPath, req, res, headOnly);
    return serveBytes({ path: absPath, layout }, req, res, headOnly, null);
  }
  function handleSceneFiles(req, res, mount) {
    const tracePath = () => new URL(req.url || '/', 'http://x').pathname.slice(`${BASE}/scene-files/`.length);
    if (mount === 'app') traceRequests(res, 'scene-files', tracePath());
    else traceMediaRequests(req, res, tracePath());
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'range, content-type',
        'Access-Control-Max-Age': '600',
        'Cache-Control': 'no-store',
      });
      res.end();
      return;
    }
    if (method !== 'GET' && method !== 'HEAD') { res.setHeader('Cache-Control', 'no-store'); res.statusCode = 405; res.end('method not allowed'); return; }
      let rest;
      try {
        rest = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname.slice(`${BASE}/scene-files/`.length));
      } catch {
        res.setHeader('Cache-Control', 'no-store');
        res.statusCode = 400; res.end('bad request'); return;
      }
      const token = rest.split('/')[0] ?? '';
      const abs = mediaMap.get(token);
      if (!abs) { res.setHeader('Cache-Control', 'no-store'); res.statusCode = 404; res.end('unknown-token'); return; }
      const subpath = rest.slice(token.length).replace(/^\/+/, '');
      if (!subpath) { res.setHeader('Cache-Control', 'no-store'); res.statusCode = 404; res.end('missing-subpath'); return; }
      const root = dirname(abs);
      const target = resolve(root, subpath);
      const fenceOut = (why) => {
        appendDiagLine('fence', { route: 'scene-files', why, subpath: subpath.slice(0, 160), referer: String(req.headers.referer || '').slice(0, 120), dest: req.headers['sec-fetch-dest'] || '' });
        log.warn(`scene-files fenced (${why}): subpath="${subpath}" referer="${req.headers.referer || '-'}" dest=${req.headers['sec-fetch-dest'] || '-'}`);
        res.setHeader('Cache-Control', 'no-store');
        res.statusCode = 403; res.end(`forbidden-scene-files[${subpath}]`);
      };
      if (target === root || !target.startsWith(root + sep)) { fenceOut('path'); return; }
      let linked = false;
      let realTarget = '';
      let unresolved = false;
      try {
        linked = lstatSync(target).isSymbolicLink();
        realTarget = realpathSync.native(target);
      } catch (e) {
        const code = e && e.code;
        if (code !== 'ENOENT' && code !== 'ENOTDIR') unresolved = true;
      }
      if (linked) { fenceOut('symlink'); return; }
      if (unresolved) { fenceOut('unresolved'); return; }
      let realRoot;
      try { realRoot = realpathSync.native(root); } catch { realRoot = ''; }
      if (!realRoot) { fenceOut('unresolved-root'); return; }
      if (realTarget && realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) { fenceOut('realpath'); return; }
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (method === 'GET' && /\.html?$/i.test(target)) {
        res.setHeader('Cache-Control', 'no-store');
        if (!existsSync(target)) { res.statusCode = 404; res.end('not found'); return; }
        let html;
        try { html = readFileSync(target, 'utf8'); } catch { res.statusCode = 500; res.end('read failed'); return; }
        const shim = readWebShim();
        if (shim && html.indexOf('data-we-shim') === -1) {
          const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
          const seed = buildSeedScript(target, token);
          const siteRoot = `${BASE}/scene-files/${token}/`;
          const tag = `<script data-we-site-root="host">window.__weSiteRoot=${JSON.stringify(siteRoot)};</script>`
            + `<script data-we-shim="host">${esc(shim)}</script>`
            + `<script data-we-focus-guard="host">${esc(weFocusGuardSource())}</script>`
            + (seed ? `<script data-we-seed="host">${esc(seed)}</script>` : '');
          const m = /<head[^>]*>/i.exec(html);
          html = m
            ? html.slice(0, m.index + m[0].length) + tag + html.slice(m.index + m[0].length)
            : tag + html;
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
        return;
      }
      serveFile(target, req, res, method === 'HEAD', { revalidate: true, payloadToken: token });
  }

  return { trackStream, serveFile, serveLayout, handleSceneFiles };
}
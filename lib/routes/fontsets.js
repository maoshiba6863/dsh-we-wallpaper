import { readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { FONTSET_MIGRATED_ID, FONTSET_SCHEMA_TAG, isFontSetId, sanitizeFontset } from '../settings-schema.js';
import { bodyReader } from '../http-body.js';
import { sendJson } from '../json-response.js';
const FONTSET_MAX_BYTES = 256 * 1024;
const FONTSET_NAME_MAX = 60;
const FONTSET_LIST_MAX = 200;
function fontSetPath(dir, id) { return join(dir, id + '.json'); }
function insideDir(dir, abs) {
  const rel = relative(resolve(dir), resolve(abs));
  return Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel);
}
function userDir(c) { return c.fontSetsDir(); }
function builtinDir(c) { return c.fontSetsBuiltinDir; }
function listFontSetIds(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const ids = [];
  for (const e of entries) {
    if (typeof e.isFile !== 'function' || !e.isFile()) continue;
    if (!e.name.endsWith('.json')) continue;
    const id = e.name.slice(0, -'.json'.length);
    if (!isFontSetId(id)) continue;
    ids.push(id);
    if (ids.length >= FONTSET_LIST_MAX) break;
  }
  return ids.sort();
}
function readFontSetAt(dir, id) {
  const abs = fontSetPath(dir, id);
  if (!insideDir(dir, abs)) return { ok: false, reason: 'unsafe-path' };
  let text;
  try { text = readFileSync(abs, 'utf8'); } catch { return { ok: false, reason: 'missing' }; }
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { ok: false, reason: 'bad-json' }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, reason: 'bad-shape' };
  if (parsed.$schema !== FONTSET_SCHEMA_TAG) return { ok: false, reason: 'bad-version' };
  const name = typeof parsed.name === 'string' && parsed.name.trim()
    ? parsed.name.trim().slice(0, FONTSET_NAME_MAX) : id;
  return { ok: true, doc: { $schema: FONTSET_SCHEMA_TAG, id, name, values: sanitizeFontset(parsed.values) } };
}
function resolveFontSet(c, id) {
  const user = readFontSetAt(userDir(c), id);
  if (user.ok) return { ok: true, doc: user.doc, origin: 'user' };
  if (user.reason !== 'missing') {
    return {
      ok: false, reason: user.reason, origin: 'user',
      shadowsBuiltin: readFontSetAt(builtinDir(c), id).ok,
    };
  }
  const builtin = readFontSetAt(builtinDir(c), id);
  if (builtin.ok) return { ok: true, doc: builtin.doc, origin: 'builtin' };
  return { ok: false, reason: 'missing', origin: null };
}
function listFontSets(c) {
  const userIds = listFontSetIds(userDir(c));
  const builtinIds = listFontSetIds(builtinDir(c));
  const ids = [...new Set([...userIds, ...builtinIds])].sort();
  return ids.slice(0, FONTSET_LIST_MAX).map((id) => {
    const resolved = resolveFontSet(c, id);
    const inUser = userIds.includes(id);
    const row = {
      id,
      name: resolved.ok ? resolved.doc.name : id,
      origin: resolved.ok ? resolved.origin : (inUser ? 'user' : 'builtin'),
    };
    if (inUser && builtinIds.includes(id)) row.overrides = true;
    if (!resolved.ok) row.broken = resolved.reason;
    return row;
  });
}
async function writeFontSet(c, id, name, values) {
  const dir = userDir(c);
  c.ensureDirOnce(dir);
  const doc = {
    $schema: FONTSET_SCHEMA_TAG,
    id,
    name: typeof name === 'string' && name.trim() ? name.trim().slice(0, FONTSET_NAME_MAX) : id,
    values: sanitizeFontset(values),
  };
  await c.atomicWriteFileP(fontSetPath(dir, id), JSON.stringify(doc, null, 2) + '\n');
  return doc;
}
async function migrateLegacyFontSet(c) {
  if (c.readFontSetId()) return { migrated: false };
  const existing = readFontSetAt(userDir(c), FONTSET_MIGRATED_ID);
  if (!existing.ok) await writeFontSet(c, FONTSET_MIGRATED_ID, '默认', c.readSettings() || {});
  await c.commitFontSetMigration(FONTSET_MIGRATED_ID);
  return { migrated: true, adopted: existing.ok };
}
function freeFontSetId(c, wanted) {
  const base = isFontSetId(wanted) ? wanted : 'imported';
  const taken = new Set([...listFontSetIds(userDir(c)), ...listFontSetIds(builtinDir(c)), 'import', 'export']);
  if (!taken.has(base)) return base;
  for (let i = 2; i <= FONTSET_LIST_MAX; i++) {
    const id = (base + '-' + i).slice(0, 64);
    if (isFontSetId(id) && !taken.has(id)) return id;
  }
  return null;
}
export function registerFontsetsRoutes(webServer, c) {
  const { disposers, base: BASE, readFontSetId } = c;
  function withJsonBody(req, res, onBody) {
    let settled = false;
    const fail = (code, payload) => {
      if (settled) return;
      settled = true;
      sendJson(res, code, payload);
      c.lingerClose(req, res);
    };
    c.armBodyIdleTimeout(req, () => fail(408, { error: 'request timeout' }));
    const reader = bodyReader(req, {
      maxBytes: FONTSET_MAX_BYTES,
      shouldStop: () => settled,
      onOverflow: () => fail(413, { error: 'fontset payload too large' }),
    });
    req.on('data', reader.onData);
    req.on('end', () => {
      if (settled) return;
      settled = true;
      const body = reader.text();
      let parsed;
      try { parsed = JSON.parse(body || '{}'); } catch {
        sendJson(res, 400, { error: 'invalid JSON body' });
        return;
      }
      onBody(parsed);
    });
    req.on('error', () => fail(400, { error: 'request error' }));
  }
  disposers.push(webServer.register({
    kind: 'prefix',
    path: `${BASE}/fontsets`,
    handler: async (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      const json = (code, payload) => sendJson(res, code, payload);
      let url;
      try { url = new URL(req.url || '/', 'http://x'); } catch { json(400, { error: 'invalid url' }); return; }
      const rest = url.pathname.slice(`${BASE}/fontsets`.length);
      if (rest.includes('//')) { json(400, { error: 'invalid path' }); return; }
      let segments;
      try {
        segments = rest.split('/').filter((s) => s !== '').map((s) => decodeURIComponent(s));
      } catch { json(400, { error: 'invalid percent-encoding in path' }); return; }
      const [first, second] = segments;
      if (segments.length === 0) {
        if (method !== 'GET') { json(405, { error: 'method not allowed' }); return; }
        let migrated = false;
        let adopted = false;
        try {
          const r = await migrateLegacyFontSet(c);
          migrated = r.migrated;
          adopted = Boolean(r.adopted);
        } catch (err) {
          c.log.warn('fontsets: 一次性迁移失败（' + String(err && err.message ? err.message : err) + '）');
        }
        const active = readFontSetId();
        const fontsets = listFontSets(c).map((row) => Object.assign({ active: row.id === active }, row));
        json(200, { fontsets, active, migrated, adopted });
        return;
      }
      if (segments.length === 1 && first === 'import') {
        if (method !== 'POST') { json(405, { error: 'method not allowed' }); return; }
        withJsonBody(req, res, (body) => {
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            json(400, { error: '字体集文件必须是一个 JSON 对象' }); return;
          }
          if (body.$schema !== FONTSET_SCHEMA_TAG) {
            json(400, { error: '无法读取的字体集版本（需要 ' + FONTSET_SCHEMA_TAG + '）' }); return;
          }
          const id = freeFontSetId(c, body.id);
          if (!id) { json(409, { error: '字体集数量已达上限' }); return; }
          writeFontSet(c, id, body.name, body.values).then(
            (doc) => json(200, { ok: true, id: doc.id, name: doc.name }),
            (err) => json(500, { error: String(err && err.message ? err.message : err) }),
          );
        });
        return;
      }
      if (segments.length === 1) {
        if (!isFontSetId(first)) { json(400, { error: 'invalid fontset id' }); return; }
        if (method === 'GET') {
          const read = resolveFontSet(c, first);
          if (read.ok) { json(200, { ok: true, origin: read.origin, ...read.doc }); return; }
          if (read.reason === 'missing') { json(404, { error: 'unknown fontset' }); return; }
          c.log.warn('fontsets: 读不懂的字体集文件（' + read.reason + '）：' + first);
          json(422, {
            error: 'fontset file is unreadable', reason: read.reason,
            origin: read.origin, shadowsBuiltin: Boolean(read.shadowsBuiltin),
          });
          return;
        }
        if (method === 'PUT') {
          withJsonBody(req, res, (body) => {
            if (!body || typeof body !== 'object' || Array.isArray(body)
              || !body.values || typeof body.values !== 'object' || Array.isArray(body.values)) {
              json(400, { error: 'body 必须是 { name?, values: {…} }（values 必填：清空请显式给 {}）' });
              return;
            }
            const prev = resolveFontSet(c, first);
            const name = typeof body.name === 'string' && body.name.trim()
              ? body.name : (prev.ok ? prev.doc.name : first);
            const overrides = readFontSetAt(builtinDir(c), first).ok;
            writeFontSet(c, first, name, body.values).then(
              (doc) => json(200, {
                ok: true, id: doc.id, name: doc.name, values: doc.values,
                origin: 'user', overrides,
              }),
              (err) => json(500, { error: String(err && err.message ? err.message : err) }),
            );
          });
          return;
        }
        if (method === 'DELETE') {
          if (first === readFontSetId()) {
            json(400, { error: '不能删除正在使用的字体集（先切换到别的集）' });
            return;
          }
          const userAbs = fontSetPath(userDir(c), first);
          const inUser = readFontSetAt(userDir(c), first).reason !== 'missing';
          if (inUser) {
            try { unlinkSync(userAbs); } catch {
              json(500, { error: '删除失败（文件被占用或权限不足）' });
              return;
            }
            const restored = readFontSetAt(builtinDir(c), first);
            json(200, { ok: true, removed: first, origin: 'user', ...(restored.ok ? { restored: 'builtin' } : {}) });
            return;
          }
          if (readFontSetAt(builtinDir(c), first).ok) {
            json(400, {
              error: '随包预设不能删除（可以直接覆盖它；要恢复原样就删掉你的覆盖）',
              origin: 'builtin',
            });
            return;
          }
          json(404, { error: 'unknown fontset' });
          return;
        }
        json(405, { error: 'method not allowed' });
        return;
      }
      if (segments.length === 2 && second === 'activate') {
        if (method !== 'POST') { json(405, { error: 'method not allowed' }); return; }
        if (!isFontSetId(first)) { json(400, { error: 'invalid fontset id' }); return; }
        const read = resolveFontSet(c, first);
        if (!read.ok) {
          json(read.reason === 'missing' ? 404 : 422, { error: 'fontset file is unreadable', reason: read.reason });
          return;
        }
        c.setFontSetId(first).then(
          () => json(200, { ok: true, active: first, origin: read.origin }),
          (err) => json(500, { error: String(err && err.message ? err.message : err) }),
        );
        return;
      }
      if (segments.length === 2 && second === 'export') {
        if (method !== 'GET') { json(405, { error: 'method not allowed' }); return; }
        if (!isFontSetId(first)) { json(400, { error: 'invalid fontset id' }); return; }
        const read = resolveFontSet(c, first);
        if (!read.ok) {
          json(read.reason === 'missing' ? 404 : 422, { error: 'fontset file is unreadable', reason: read.reason });
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Disposition', 'attachment; filename="' + first + '.json"');
        res.end(JSON.stringify(read.doc, null, 2) + '\n');
        return;
      }
      json(404, { error: 'not found' });
    },
  }));
}
import { readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import {
  PROFILE_PRESET_SCHEMA_TAG, GLASS_PRESET_TOMBSTONE_TAG, isGlassPresetId,
  sanitizePresetValues, sanitizePresetAssets, sanitizeFontset,
} from '../settings-schema.js';
import { bodyReader } from '../http-body.js';
import { sendJson } from '../json-response.js';
const PRESET_MAX_BYTES = 128 * 1024;
const PRESET_ASSET_MAX_BYTES = 8 * 1024 * 1024;
const PRESET_IMPORT_MAX_BYTES = PRESET_MAX_BYTES + 3 * (Math.ceil(PRESET_ASSET_MAX_BYTES / 3) * 4);
const PRESET_NAME_MAX = 60;
const PRESET_TOTAL_MAX = 8;
const PRESET_SCAN_MAX = 32;
const ASSET_SEGMENTS = ['font', 'avatar'];
const ASSET_IMAGE_EXT = ['png', 'jpg', 'webp'];
function presetPath(dir, id) { return join(dir, id + '.json'); }
function insideDir(dir, abs) {
  const rel = relative(resolve(dir), resolve(abs));
  return Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel);
}
function userDir(c) { return c.glassPresetsDir(); }
function builtinDir(c) { return c.glassPresetsBuiltinDir; }
function listPresetIds(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const ids = [];
  for (const e of entries) {
    if (typeof e.isFile !== 'function' || !e.isFile()) continue;
    if (!e.name.endsWith('.json')) continue;
    const id = e.name.slice(0, -'.json'.length);
    if (!isGlassPresetId(id)) continue;
    ids.push(id);
    if (ids.length >= PRESET_SCAN_MAX) break;
  }
  return ids.sort();
}
function readPresetAt(dir, id) {
  const abs = presetPath(dir, id);
  if (!insideDir(dir, abs)) return { ok: false, reason: 'unsafe-path' };
  let text;
  try { text = readFileSync(abs, 'utf8'); } catch { return { ok: false, reason: 'missing' }; }
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { ok: false, reason: 'bad-json' }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, reason: 'bad-shape' };
  if (parsed.$schema === GLASS_PRESET_TOMBSTONE_TAG) return { ok: false, reason: 'deleted' };
  if (parsed.$schema !== PROFILE_PRESET_SCHEMA_TAG) return { ok: false, reason: 'version-obsolete' };
  const name = typeof parsed.name === 'string' && parsed.name.trim()
    ? parsed.name.trim().slice(0, PRESET_NAME_MAX) : id;
  const assets = sanitizePresetAssets(parsed.assets);
  return {
    ok: true,
    doc: {
      $schema: PROFILE_PRESET_SCHEMA_TAG,
      id,
      name,
      values: sanitizePresetValues(parsed.values),
      ...(Object.keys(assets).length ? { assets } : {}),
    },
  };
}
function resolvePreset(c, id) {
  const user = readPresetAt(userDir(c), id);
  if (user.ok) return { ok: true, doc: user.doc, origin: 'user' };
  if (user.reason !== 'missing') {
    return {
      ok: false, reason: user.reason, origin: 'user',
      shadowsBuiltin: readPresetAt(builtinDir(c), id).ok,
    };
  }
  const builtin = readPresetAt(builtinDir(c), id);
  if (builtin.ok) return { ok: true, doc: builtin.doc, origin: 'builtin' };
  return {
    ok: false, reason: builtin.reason,
    origin: builtin.reason === 'missing' ? null : 'builtin',
  };
}
function tombstonedIds(c) {
  const set = new Set();
  for (const id of listPresetIds(userDir(c))) {
    if (readPresetAt(userDir(c), id).reason === 'deleted') set.add(id);
  }
  return set;
}
function listPresets(c) {
  const tomb = tombstonedIds(c);
  const builtinIds = listPresetIds(builtinDir(c));
  const userIds = listPresetIds(userDir(c));
  const rows = [];
  for (const id of builtinIds) {
    if (tomb.has(id)) continue;
    const read = readPresetAt(builtinDir(c), id);
    rows.push(read.ok
      ? { id, name: read.doc.name, origin: 'builtin' }
      : { id, name: id, origin: 'builtin', broken: read.reason });
  }
  for (const id of userIds) {
    if (tomb.has(id)) continue;
    const read = readPresetAt(userDir(c), id);
    rows.push(read.ok
      ? { id, name: read.doc.name, origin: 'user' }
      : { id, name: id, origin: 'user', broken: read.reason });
  }
  return rows.slice(0, PRESET_TOTAL_MAX);
}
function normalizeName(name) { return String(name).trim().toLowerCase(); }
function takenNames(c) {
  const taken = new Set();
  for (const row of listPresets(c)) {
    if (!row.broken) taken.add(normalizeName(row.name));
  }
  return taken;
}
function uniqueImportName(c, wanted) {
  const taken = takenNames(c);
  const base = String(wanted || '').trim().slice(0, PRESET_NAME_MAX) || '导入的预设';
  if (!taken.has(normalizeName(base))) return base;
  for (let i = 2; i <= PRESET_TOTAL_MAX * 4; i++) {
    const suffix = ' (' + i + ')';
    const candidate = base.slice(0, PRESET_NAME_MAX - suffix.length) + suffix;
    if (!taken.has(normalizeName(candidate))) return candidate;
  }
  return base.slice(0, PRESET_NAME_MAX - 7) + ' ' + Date.now().toString(36);
}
function extOfFile(name) {
  const s = typeof name === 'string' ? name : '';
  const dot = s.lastIndexOf('.');
  if (dot < 0) return '';
  const ext = s.slice(dot + 1).toLowerCase();
  return ASSET_IMAGE_EXT.includes(ext) ? ext : '';
}
function assetStamp() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function encodeFile(abs) {
  if (!abs) return '';
  try { return readFileSync(abs).toString('base64'); } catch { return ''; }
}
function decodeBase64(data) {
  if (typeof data !== 'string' || !data) return null;
  try {
    const buf = Buffer.from(data, 'base64');
    return buf.length ? buf : null;
  } catch { return null; }
}
function currentFontSegment(c) {
  const id = typeof c.readFontSetId === 'function' ? c.readFontSetId() : '';
  if (id && typeof c.fontSetsDir === 'function') {
    try {
      const parsed = JSON.parse(readFileSync(join(c.fontSetsDir(), id + '.json'), 'utf8'));
      return { name: typeof parsed.name === 'string' ? parsed.name.slice(0, 64) : id, values: sanitizeFontset(parsed.values) };
    } catch {   }
  }
  const settings = typeof c.readSettings === 'function' ? c.readSettings() : null;
  return { name: id || '', values: sanitizeFontset(settings) };
}
function currentAvatarSegment(c) {
  const sides = Array.isArray(c.AVATAR_SIDES) ? c.AVATAR_SIDES : ['user', 'ai'];
  const out = {};
  for (const side of sides) {
    if (side !== 'user' && side !== 'ai') continue;
    const abs = typeof c.avatarPath === 'function' ? c.avatarPath(side) : null;
    if (!abs) continue;
    const file = basename(abs);
    if (!extOfFile(file)) continue;
    const data = encodeFile(abs);
    if (!data) continue;
    out[side] = { file, data };
  }
  return Object.keys(out).length ? out : null;
}
function sanitizePresetPoint(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  return out;
}
function currentSegment(c, seg) {
  if (seg === 'font') return currentFontSegment(c);
  if (seg === 'avatar') return currentAvatarSegment(c);
  return null;
}
async function landImage(c, dir, prefix, ext, buf) {
  const dup = sameFamilyFile(dir, prefix, ext);
  if (dup && Buffer.compare(dup.bytes, buf) === 0) return dup.name;
  try {
    for (const name of readdirSync(dir)) {
      if (name.slice(0, prefix.length) !== prefix) continue;
      try { unlinkSync(join(dir, name)); } catch {   }
    }
  } catch {   }
  const name = prefix + assetStamp() + '.' + ext;
  await c.atomicWriteFileP(join(dir, name), buf);
  return name;
}
function sameFamilyFile(dir, prefix, ext) {
  let hit = null;
  try {
    for (const name of readdirSync(dir)) {
      if (name.slice(0, prefix.length) !== prefix) continue;
      if (name.slice(-(ext.length + 1)) !== '.' + ext) continue;
      if (hit) return null;
      hit = name;
    }
  } catch { return null; }
  if (!hit) return null;
  try { return { name: hit, bytes: readFileSync(join(dir, hit)) }; } catch { return null; }
}
function assetOverBudget(label, buf) {
  if (buf && buf.length > PRESET_ASSET_MAX_BYTES) {
    return '资产「' + label + '」超过单份上限（'
      + Math.round(PRESET_ASSET_MAX_BYTES / (1024 * 1024)) + 'MB）—— 取消勾选它，或换一张小一点的图';
  }
  return null;
}
export function registerGlassPresetsRoutes(webServer, c) {
  const { disposers, base: BASE } = c;
  function withJsonBody(req, res, maxBytes, onBody) {
    let settled = false;
    const fail = (code, payload) => {
      if (settled) return;
      settled = true;
      sendJson(res, code, payload);
      c.lingerClose(req, res);
    };
    c.armBodyIdleTimeout(req, () => fail(408, { error: 'request timeout' }));
    const reader = bodyReader(req, {
      maxBytes,
      shouldStop: () => settled,
      onOverflow: () => fail(413, { error: 'preset payload too large' }),
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
    path: `${BASE}/glass-presets`,
    handler: async (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      const json = (code, payload) => sendJson(res, code, payload);
      let url;
      try { url = new URL(req.url || '/', 'http://x'); } catch { json(400, { error: 'invalid url' }); return; }
      const rest = url.pathname.slice(`${BASE}/glass-presets`.length);
      if (rest.includes('//')) { json(400, { error: 'invalid path' }); return; }
      let segments;
      try {
        segments = rest.split('/').filter((s) => s !== '').map((s) => decodeURIComponent(s));
      } catch { json(400, { error: 'invalid percent-encoding in path' }); return; }
      const [first, second] = segments;
      if (segments.length === 0) {
        if (method !== 'GET') { json(405, { error: 'method not allowed' }); return; }
        json(200, { presets: listPresets(c) });
        return;
      }
      if (segments.length === 1 && first === 'import') {
        if (method !== 'POST') { json(405, { error: 'method not allowed' }); return; }
        withJsonBody(req, res, PRESET_IMPORT_MAX_BYTES, (body) => {
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            json(400, { error: '预设文件必须是一个 JSON 对象' });
            return;
          }
          if (body.$schema !== PROFILE_PRESET_SCHEMA_TAG) {
            json(400, {
              error: '无法读取的预设版本（需要 ' + PROFILE_PRESET_SCHEMA_TAG
                + ' 标记 —— 旧版预设已作废，请从「导出」重新拿一份）',
              reason: 'version-obsolete',
            });
            return;
          }
          const importName = uniqueImportName(c, typeof body.name === 'string' ? body.name : '');
          if (listPresets(c).length >= PRESET_TOTAL_MAX) {
            json(409, { error: '预设数量已达上限（最多 8 个 —— 删除不需要的预设腾位）' });
            return;
          }
          const id = freePresetId(c, typeof body.id === 'string' ? body.id : '');
          if (!id) { json(409, { error: '预设数量已达上限' }); return; }
          writePreset(c, id, importName, body.values, body.assets).then(
            (doc) => json(200, { ok: true, id: doc.id, name: doc.name }),
            (err) => json(500, { error: String(err && err.message ? err.message : err) }),
          );
        });
        return;
      }
      if (segments.length === 1 && first === 'create') {
        if (method !== 'POST') { json(405, { error: 'method not allowed' }); return; }
        withJsonBody(req, res, PRESET_MAX_BYTES, (body) => {
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            json(400, { error: 'body 必须是 { name, values }' });
            return;
          }
          const name = typeof body.name === 'string' ? body.name.trim().slice(0, PRESET_NAME_MAX) : '';
          if (!name) { json(400, { error: '预设名字不能为空' }); return; }
          if (!body.values || typeof body.values !== 'object' || Array.isArray(body.values)) {
            json(400, { error: '预设正文缺失（values 必须是整机配置快照对象）' });
            return;
          }
          if (listPresets(c).length >= PRESET_TOTAL_MAX) {
            json(409, { error: '预设数量已达上限（最多 8 个 —— 删除不需要的预设腾位）' });
            return;
          }
          if (takenNames(c).has(normalizeName(name))) {
            json(409, { error: '已存在同名的预设（换个名字再存）' });
            return;
          }
          const embed = Array.isArray(body.embed)
            ? [...new Set(body.embed.filter((k) => ASSET_SEGMENTS.includes(k)))] : [];
          const point = sanitizePresetPoint(body.point);
          const assets = {};
          for (const seg of embed) {
            const cur = currentSegment(c, seg);
            assets[seg] = cur;
          }
          for (const [seg, form] of Object.entries(point)) assets[seg] = form;
          const id = freePresetId(c, typeof body.id === 'string' ? body.id : '');
          if (!id) { json(409, { error: '预设数量已达上限' }); return; }
          writePreset(c, id, name, body.values, assets).then(
            (doc) => json(200, {
              ok: true, id: doc.id, name: doc.name, values: doc.values,
              ...(doc.assets ? { assets: publicAssets(doc.assets) } : {}),
            }),
            (err) => json(500, { error: String(err && err.message ? err.message : err) }),
          );
        });
        return;
      }
      if (segments.length === 2) {
        if (!isGlassPresetId(first)) { json(400, { error: 'invalid preset id' }); return; }
        if (second === 'install-assets') {
          if (method !== 'POST') { json(405, { error: 'method not allowed' }); return; }
          const read = resolvePreset(c, first);
          if (!read.ok) {
            json(read.reason === 'missing' ? 404 : 422, {
              error: 'preset file is unreadable', reason: read.reason,
            });
            return;
          }
          installAssets(c, read.doc.assets || {}).then(
            (applied) => json(200, { ok: true, applied }),
            (err) => json(500, { error: String(err && err.message ? err.message : err) }),
          );
          return;
        }
        if (second === 'export') {
          if (method !== 'GET') { json(405, { error: 'method not allowed' }); return; }
          const read = resolvePreset(c, first);
          if (!read.ok) {
            json(read.reason === 'missing' ? 404 : 422, {
              error: 'preset file is unreadable', reason: read.reason,
            });
            return;
          }
          const wanted = (url.searchParams.get('assets') || '')
            .split(',').map((s) => s.trim()).filter((s) => ASSET_SEGMENTS.includes(s));
          const pointRaw = {};
          for (const item of (url.searchParams.get('point') || '').split(',')) {
            const [seg, form] = item.split(':').map((s) => (s || '').trim());
            if (seg) pointRaw[seg] = form;
          }
          const point = sanitizePresetPoint(pointRaw);
          const embedded = read.doc.assets || {};
          const assets = {};
          for (const seg of [...new Set(wanted.concat(Object.keys(point)))]) {
            const own = embedded[seg];
            const usable = seg === 'font'
              ? Boolean(own && own.values)
              : Boolean(own && typeof own === 'object'
                && ((own.data && own.data.length) || (own.user && own.user.data) || (own.ai && own.ai.data)));
            if (own === null || typeof own === 'string') assets[seg] = own;
            else if (!usable && point[seg]) assets[seg] = point[seg];
            else assets[seg] = usable ? own : currentSegment(c, seg);
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('Content-Disposition', 'attachment; filename="' + first + '.json"');
          res.end(JSON.stringify({
            $schema: PROFILE_PRESET_SCHEMA_TAG,
            id: read.doc.id,
            name: read.doc.name,
            values: read.doc.values,
            ...(Object.keys(assets).length ? { assets } : {}),
          }, null, 2) + '\n');
          return;
        }
        json(404, { error: 'not found' });
        return;
      }
      if (segments.length === 1) {
        if (!isGlassPresetId(first)) { json(400, { error: 'invalid preset id' }); return; }
        if (method === 'GET') {
          const read = resolvePreset(c, first);
          if (read.ok) {
            const assets = read.doc.assets ? publicAssets(read.doc.assets) : null;
            json(200, {
              ok: true, origin: read.origin, id: read.doc.id, name: read.doc.name,
              values: read.doc.values, ...(assets ? { assets } : {}),
            });
            return;
          }
          if (read.reason === 'missing') {
            json(404, { error: 'unknown preset', reason: 'missing', id: first });
            return;
          }
          c.log.warn('glass-presets: 读不懂的预设文件（' + read.reason + '）：' + first);
          json(422, {
            error: read.reason === 'version-obsolete'
              ? '这份预设的版本已作废（旧格式不再兼容 —— 请重新保存一份）'
              : 'preset file is unreadable',
            reason: read.reason,
            origin: read.origin, shadowsBuiltin: Boolean(read.shadowsBuiltin),
          });
          return;
        }
        if (method === 'DELETE') {
          const userAbs = presetPath(userDir(c), first);
          const userRead = readPresetAt(userDir(c), first);
          if (userRead.reason === 'deleted') {
            json(404, { error: 'unknown preset', reason: 'tombstone', id: first });
            return;
          }
          if (userRead.reason !== 'missing' && userRead.reason !== 'unsafe-path') {
            try { unlinkSync(userAbs); } catch {
              json(500, { error: '删除失败（文件被占用或权限不足）' });
              return;
            }
            json(200, { ok: true, removed: first, origin: 'user' });
            return;
          }
          if (readPresetAt(builtinDir(c), first).ok) {
            writeTombstone(c, first).then(
              () => json(200, { ok: true, removed: first, origin: 'builtin' }),
              (err) => json(500, { error: String(err && err.message ? err.message : err) }),
            );
            return;
          }
          json(404, { error: 'unknown preset', reason: 'missing', id: first });
          return;
        }
        json(405, { error: 'method not allowed' });
        return;
      }
      json(404, { error: 'not found' });
    },
  }));
}
async function writePreset(c, id, name, values, assets) {
  const dir = userDir(c);
  c.ensureDirOnce(dir);
  const assetSegs = sanitizePresetAssets(assets);
  const doc = {
    $schema: PROFILE_PRESET_SCHEMA_TAG,
    id,
    name: String(name).trim().slice(0, PRESET_NAME_MAX),
    values: sanitizePresetValues(values),
    ...(Object.keys(assetSegs).length ? { assets: assetSegs } : {}),
  };
  await c.atomicWriteFileP(presetPath(dir, id), JSON.stringify(doc, null, 2) + '\n');
  return doc;
}
async function writeTombstone(c, id) {
  const dir = userDir(c);
  c.ensureDirOnce(dir);
  const doc = { $schema: GLASS_PRESET_TOMBSTONE_TAG, id };
  await c.atomicWriteFileP(presetPath(dir, id), JSON.stringify(doc, null, 2) + '\n');
  return doc;
}
function freePresetId(c, wanted) {
  const taken = new Set([...listPresetIds(userDir(c)), ...listPresetIds(builtinDir(c))]);
  if (isGlassPresetId(wanted) && !taken.has(wanted)) return wanted;
  const base = isGlassPresetId(wanted) ? wanted : 'preset';
  for (let i = 2; i <= PRESET_TOTAL_MAX * 4; i++) {
    const id = (base + '-' + i).slice(0, 64);
    if (isGlassPresetId(id) && !taken.has(id)) return id;
  }
  return null;
}
function publicAssets(assets) {
  const out = {};
  const f = assets.font;
  if (f === null) out.font = null;
  else if (f && typeof f === 'object') out.font = { name: f.name, values: f.values };
  const a = assets.avatar;
  if (a === null) out.avatar = null;
  else if (a && typeof a === 'object') {
    const av = {};
    if (a.user && typeof a.user === 'object') av.user = { file: a.user.file };
    if (a.ai && typeof a.ai === 'object') av.ai = { file: a.ai.file };
    if (Object.keys(av).length) out.avatar = av;
  }
  return out;
}
function clearFamily(dir, prefix) {
  let removed = 0;
  try {
    for (const name of readdirSync(dir)) {
      if (name.slice(0, prefix.length) !== prefix) continue;
      try { unlinkSync(join(dir, name)); removed += 1; } catch {   }
    }
  } catch {   }
  return removed;
}
async function installAssets(c, assets) {
  const applied = {};
  const font = assets.font;
  if (font === null) {
    applied.font = { name: '', values: sanitizeFontset(null) };
  } else if (font && typeof font === 'object' && font.values) {
    applied.font = { name: typeof font.name === 'string' ? font.name : '', values: sanitizeFontset(font.values) };
  }
  const pending = [];
  const overs = [];
  const clearAvatar = assets.avatar === null;
  const a = assets.avatar;
  if (!clearAvatar && a && typeof a === 'object') {
    for (const side of ['user', 'ai']) {
      const one = a[side];
      if (!one || typeof one !== 'object') continue;
      const buf = decodeBase64(one.data);
      const ext = extOfFile(one.file);
      if (!buf || !ext) continue;
      const over = assetOverBudget('avatar.' + side, buf);
      if (over) overs.push(over);
      else pending.push({ label: 'avatar.' + side, dir: c.avatarDir(), prefix: side + '-', ext, buf });
    }
  }
  if (overs.length) {
    throw new Error(overs.join('；'));
  }
  if (clearAvatar) {
    for (const side of ['user', 'ai']) clearFamily(c.avatarDir(), side + '-');
    applied.avatar = { cleared: true };
  }
  const av = {};
  for (const item of pending) {
    const file = await landImage(c, item.dir, item.prefix, item.ext, item.buf);
    av[item.prefix.slice(0, -1)] = { file };
  }
  if (Object.keys(av).length) applied.avatar = av;
  return applied;
}
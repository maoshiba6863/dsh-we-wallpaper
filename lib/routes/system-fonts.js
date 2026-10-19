import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { systemFontKeyOf } from '../settings-schema.js';
import { sendJson } from '../json-response.js';
const SYSTEM_FONTS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SYSTEM_FONTS_CACHE_VERSION = 2;
const FONT_SCAN_TIMEOUT_MS = 25000;
const FONT_SCAN_MAX_BYTES = 16 * 1024 * 1024;
const SYSTEM_FONTS_MAX = 2000;
const FONT_DIR_MAX_DEPTH = 3;
const FONT_DIR_MAX_FILES = 4000;
const CORETEXT_LIST_ARGS = [
  '-l', 'JavaScript', '-e',
  'ObjC.import("CoreText");'
  + 'const arr=$.CTFontManagerCopyAvailableFontFamilyNames();'
  + 'const n=$.CFArrayGetCount(arr);'
  + 'const out=[];'
  + 'for(let i=0;i<n;i++)out.push(ObjC.unwrap(ObjC.castRefToObject($.CFArrayGetValueAtIndex(arr,i))));'
  + 'out.join("\\n");',
];
function authoritativeSources(platform) {
  if (platform === 'darwin') {
    const bin = existsSync('/usr/sbin/system_profiler') ? '/usr/sbin/system_profiler' : 'system_profiler';
    return [
      { source: 'system_profiler', cmd: bin, args: ['SPFontsDataType', '-json', '-detailLevel', 'mini'], parse: parseMacFonts },
      { source: 'coretext', cmd: 'osascript', args: CORETEXT_LIST_ARGS, parse: parseLineFamilies },
    ];
  }
  if (platform === 'win32') {
    return [{
      source: 'powershell-fonts',
      cmd: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command',
        'Add-Type -AssemblyName System.Drawing; '
        + '(New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }'],
      parse: parseLineFamilies,
    }];
  }
  if (platform === 'linux' || platform === 'freebsd' || platform === 'openbsd') {
    return [{ source: 'fc-list', cmd: 'fc-list', args: ['--format=%{family}\\n'], parse: parseFcList }];
  }
  return [];
}
function fallbackSources(platform) {
  if (platform === 'win32') {
    return [{
      source: 'registry',
      cmd: 'reg.exe',
      args: ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'],
      parse: parseWindowsFontRegistry,
    }];
  }
  return [];
}
function parseMacFonts(text) {
  let doc;
  try { doc = JSON.parse(String(text || '')); } catch { return []; }
  const list = doc && Array.isArray(doc.SPFontsDataType) ? doc.SPFontsDataType : null;
  if (!list) return [];
  const out = [];
  for (const item of list) {
    const faces = item && Array.isArray(item.typefaces) ? item.typefaces : [];
    for (const face of faces) {
      if (face && typeof face.family === 'string') out.push(face.family);
    }
  }
  return out;
}
function parseFcList(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    for (const name of line.split(',')) out.push(name);
  }
  return out;
}
function parseLineFamilies(text) {
  return String(text || '').split(/\r?\n/);
}
function parseWindowsFontRegistry(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^HKEY/i.test(line)) continue;
    const m = line.match(/^(.*?)\s+REG_\w+\s+/);
    if (!m) continue;
    out.push(m[1].replace(/\s*\((?:TrueType|OpenType|Type 1|All res)\)\s*$/i, ''));
  }
  return out;
}
const FONT_STYLE_WORDS = [
  'thin', 'extralight', 'ultralight', 'light', 'book', 'regular', 'normal', 'medium',
  'semibold', 'demibold', 'demib', 'bold', 'extrabold', 'ultrabold', 'black', 'heavy',
  'italic', 'oblique', 'condensed', 'narrow', 'expanded', 'wide', 'retina',
];
const FONT_FILE_RE = /\.(ttf|otf|ttc|dfont)$/i;
function familyFromFileName(fileName) {
  let base = String(fileName || '').replace(FONT_FILE_RE, '');
  const parts = base.split(/[-_,]/);
  while (parts.length > 1 && FONT_STYLE_WORDS.includes(parts[parts.length - 1].toLowerCase())) parts.pop();
  base = parts.join(' ').replace(/\s+/g, ' ').trim();
  return base;
}
function parseFontFileNames(names) {
  const out = [];
  for (const n of Array.isArray(names) ? names : []) {
    const family = familyFromFileName(n);
    if (family) out.push(family);
  }
  return out;
}
function fontDirs(platform, home) {
  const dirs = [];
  if (platform === 'darwin') {
    dirs.push('/System/Library/Fonts', '/System/Library/Fonts/Supplemental', '/Library/Fonts',
      join(home, 'Library', 'Fonts'));
  } else if (platform === 'win32') {
    const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
    dirs.push(join(root, 'Fonts'));
    const local = process.env.LOCALAPPDATA;
    if (local) dirs.push(join(local, 'Microsoft', 'Windows', 'Fonts'));
  } else {
    dirs.push('/usr/share/fonts', '/usr/local/share/fonts', join(home, '.fonts'),
      join(home, '.local', 'share', 'fonts'));
  }
  return dirs;
}
function collectFontFiles(dirs, depth, files) {
  if (depth > FONT_DIR_MAX_DEPTH || files.length >= FONT_DIR_MAX_FILES) return files;
  for (const dir of dirs) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (files.length >= FONT_DIR_MAX_FILES) return files;
      const abs = join(dir, e.name);
      if (typeof e.isDirectory === 'function' && e.isDirectory()) {
        collectFontFiles([abs], depth + 1, files);
      } else if (typeof e.isFile === 'function' && e.isFile() && FONT_FILE_RE.test(e.name)) {
        files.push(e.name);
      }
    }
  }
  return files;
}
function normalizeFamilies(names) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(names) ? names : []) {
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (!name || name.startsWith('.')) continue;
    if (!systemFontKeyOf(name)) continue;
    const dedupe = name.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(name);
    if (out.length >= SYSTEM_FONTS_MAX) break;
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}
function defaultRun(cmd, args) {
  return new Promise((done) => {
    let child = null;
    try {
      child = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (err) {
      done({ ok: false, stdout: '', error: String((err && err.message) || err) });
      return;
    }
    const chunks = [];
    let bytes = 0;
    let settled = false;
    let overflow = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done(result);
    };
    const timer = setTimeout(() => {
      if (child.pid !== undefined) { try { child.kill('SIGKILL'); } catch {   } }
      finish({ ok: false, stdout: '', error: 'timeout' });
    }, FONT_SCAN_TIMEOUT_MS);
    if (timer && typeof timer.unref === 'function') timer.unref();
    child.stdout.on('data', (buf) => {
      if (overflow) return;
      bytes += buf.length;
      if (bytes > FONT_SCAN_MAX_BYTES) { overflow = true; return; }
      chunks.push(buf);
    });
    child.on('error', (err) => finish({ ok: false, stdout: '', error: String((err && err.message) || err) }));
    child.on('close', (code) => {
      if (overflow) { finish({ ok: false, stdout: '', error: 'too-large' }); return; }
      finish({ ok: code === 0, stdout: Buffer.concat(chunks).toString('utf8'), error: code === 0 ? '' : 'exit ' + code });
    });
  });
}
async function runSource(source, run, now) {
  let res;
  try { res = await run(source.cmd, source.args); } catch (err) {
    res = { ok: false, stdout: '', error: String((err && err.message) || err) };
  }
  if (!res || !res.ok || !res.stdout) return null;
  let families;
  try { families = source.parse(res.stdout); } catch { return null; }
  return { source: source.source, families, at: now() };
}
async function collectSystemFonts(deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  const platform = typeof d.platform === 'string' ? d.platform : process.platform;
  const run = typeof d.run === 'function' ? d.run : defaultRun;
  const home = typeof d.home === 'string' && d.home ? d.home : homedir();
  const now = typeof d.now === 'function' ? d.now : Date.now;
  const authoritative = await Promise.all(
    authoritativeSources(platform).map((s) => runSource(s, run, now)));
  const merged = [];
  const used = [];
  let scannedAt = 0;
  for (const r of authoritative) {
    if (!r) continue;
    merged.push(...r.families);
    used.push(r.source);
    if (r.at > scannedAt) scannedAt = r.at;
  }
  const fonts = normalizeFamilies(merged);
  if (fonts.length) {
    return { fonts, source: used.join('+'), approximate: false, scannedAt: scannedAt || now() };
  }
  for (const s of fallbackSources(platform)) {
    const r = await runSource(s, run, now);
    if (!r) continue;
    const f = normalizeFamilies(r.families);
    if (f.length) return { fonts: f, source: r.source, approximate: true, scannedAt: r.at };
  }
  const scanDirs = Array.isArray(d.dirs) ? d.dirs : fontDirs(platform, home);
  const files = collectFontFiles(scanDirs, 0, []);
  return {
    fonts: normalizeFamilies(parseFontFileNames(files)),
    source: 'file-names', approximate: true, scannedAt: now(),
  };
}
export function registerSystemFontsRoutes(webServer, c) {
  const { disposers, base: BASE, cachePath, log, platform, home, fontDirs, runFontCommand } = c;
  const deps = { platform, home, dirs: fontDirs, run: runFontCommand };
  let mem = null;
  let inflight = null;
  const fresh = (v) => Boolean(v) && Array.isArray(v.fonts)
    && Date.now() - Number(v.scannedAt || 0) < SYSTEM_FONTS_TTL_MS;
  function readDisk() {
    try {
      const o = JSON.parse(readFileSync(cachePath(), 'utf8'));
      if (o && o.v === SYSTEM_FONTS_CACHE_VERSION && Array.isArray(o.fonts) && Number.isFinite(o.scannedAt)) return o;
    } catch {   }
    return null;
  }
  function writeDisk(v) {
    try {
      const file = cachePath();
      const tmp = file + '.tmp';
      writeFileSync(tmp, JSON.stringify(Object.assign({ v: SYSTEM_FONTS_CACHE_VERSION }, v)));
      renameSync(tmp, file);
    } catch (err) {
      try { log('system-fonts 缓存写入失败：' + (err && err.message ? err.message : err)); } catch {   }
    }
  }
  function scan() {
    if (!inflight) {
      inflight = collectSystemFonts(deps).then((got) => {
        mem = got;
        if (got.fonts.length) writeDisk(got);
        return got;
      }).catch((err) => {
        const why = String((err && err.message) || err);
        try { log('system-fonts 扫描失败：' + why); } catch {   }
        return { fonts: [], source: 'none', approximate: false, scannedAt: 0, error: why };
      }).finally(() => { inflight = null; });
    }
    return inflight;
  }
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/system-fonts`,
    handler: async (req, res) => {
      const reply = (body) => sendJson(res, 200, body);
      if ((req.method || 'GET').toUpperCase() !== 'GET') { res.statusCode = 405; res.end(); return; }
      let force;
      try { force = new URL(req.url, 'http://localhost').searchParams.get('refresh') === '1'; } catch { force = false; }
      const cached = mem || readDisk();
      if (cached) mem = cached;
      if (!force && fresh(cached)) {
        reply({ ok: true, fonts: cached.fonts, approximate: cached.approximate === true, source: cached.source || '', scannedAt: cached.scannedAt, stale: false });
        return;
      }
      if (cached && Array.isArray(cached.fonts) && cached.fonts.length) {
        scan().catch(() => {   });
        reply({ ok: true, fonts: cached.fonts, approximate: cached.approximate === true, source: cached.source || '', scannedAt: cached.scannedAt, stale: true });
        return;
      }
      const got = await scan();
      reply({
        ok: got.fonts.length > 0,
        fonts: got.fonts,
        approximate: got.approximate === true,
        source: got.source || '',
        scannedAt: got.scannedAt || 0,
        stale: false,
        error: got.fonts.length ? undefined : (got.error || 'no-fonts'),
      });
    },
  }));
}
export {
  collectSystemFonts, normalizeFamilies, familyFromFileName, defaultRun,
  parseMacFonts, parseFcList, parseLineFamilies, parseWindowsFontRegistry, parseFontFileNames,
  authoritativeSources,
  SYSTEM_FONTS_TTL_MS, SYSTEM_FONTS_CACHE_VERSION, FONT_SCAN_TIMEOUT_MS,
};
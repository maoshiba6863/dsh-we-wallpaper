import {
  readFileSync,
  appendFileSync,
  createReadStream,
  existsSync,
  statSync,
  readdirSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
} from 'node:fs';
import {
  access, readdir, stat,
  rename as renameP, unlink as unlinkP, copyFile as copyFileP,
} from 'node:fs/promises';
import { join, resolve, normalize, dirname, relative, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseUserPropDefs, entryDirPrefix } from './we-props.js';
import { sanitizeFromSchema, isFontSetId, sanitizeFontset, FONTSET_KEYS } from './settings-schema.js';
import { createInventoryBuilder } from './inventory.js';
import { createServeKit, payloadProgress } from './serve.js';
import { createMp4VfsKit } from './mp4-vfs.js';
import { createFaststartKit } from './faststart.js';
import { createSceneProbeKit } from './scene-probe.js';
import { getMediaInfo } from './media-probe.js';
import { createWallpaperScanKit } from './wallpaper-scan.js';
import { createCachePruneKit } from './cache-prune.js';
import { createConfigStoreKit } from './config-store.js';
import { createSteamDiscoveryKit } from './steam-discovery.js';
import { createTranscodeKit } from './transcode.js';
import { createVideoPreviewKit } from './video-preview.js';
import { createHostDiagKit } from './host-diag.js';
import { createUploadStoreKit } from './upload-store.js';
import { createAssetPathsKit } from './asset-paths.js';
import { registerDiagRoutes } from './routes/diag.js';
import { registerNowPlayingRoutes } from './routes/now-playing.js';
import { registerSceneFrameRoutes } from './routes/scene-frame.js';
import { registerMediaDerivedRoutes } from './routes/media-derived.js';
import { registerMediaBytesRoutes } from './routes/media-bytes.js';
import { registerWeAssetsRoutes } from './routes/we-assets.js';
import { registerSceneMediaRoutes } from './routes/scene-media.js';
import { registerSceneServeRoutes } from './routes/scene-serve.js';
import { registerOcclusionRoutes } from './routes/occlusion.js';
import { createOcclusionHub } from './occlusion/index.js';
import { registerUploadRoutes } from './routes/upload.js';
import { registerFontsetsRoutes } from './routes/fontsets.js';
import { registerGlassPresetsRoutes } from './routes/presets.js';
import { registerSystemFontsRoutes } from './routes/system-fonts.js';
import { registerBillingRoutes } from './routes/billing.js';
import { registerBillingBalanceRoutes } from './routes/billing-balance.js';
import { registerBillingTurnRoutes } from './routes/billing-turn.js';
import { createBilling } from './billing.js';
import { createBillingStream } from './billing-stream.js';
import { createBillingBalance } from './billing-balance.js';
import { coverChildRunning, coverDesktop, coverDesktopOnStartup } from './desktop-cover.js';
import { createStartupTiming } from './startup-timing.js';
import { registerAvatarRoutes } from './routes/avatar.js';
import { registerPropsRoutes } from './routes/props.js';
import { registerLiveFrameRoutes } from './routes/live-frame.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerCacheDirRoutes } from './routes/cache-dir.js';
import { createLog } from './log.js';
import { createNotice } from './notice.js';
import { createMediaOrigin } from './media-origin.js';
const WE_APPID = '431960';
const BASE = '/wallpaper-engine';
const GREETING_VIDEO_PATH = join(homedir(), 'Documents', 'wallpaper', 'autowork', '欢迎回来.mp4');
const PLUGIN_NAME = 'wallpaper-engine';
const WEBWALLGL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'webwallgl');
const WEBWALLGL_PKG_DIR = (() => {
  try {
    return dirname(createRequire(import.meta.url).resolve('webwallgl'));
  } catch {
    return null;
  }
})();
const FONTSET_BUILTIN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'fontsets');
const GLASS_PRESET_BUILTIN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'glass-presets');
let webShimCache;
function cookTemplateLiteral(raw) {
  const simple = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
  return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])/g, (_, e) => {
    if (e[0] === 'u' && e.length > 1) return String.fromCodePoint(parseInt(e[1] === '{' ? e.slice(2, -1) : e.slice(1), 16));
    if (e[0] === 'x' && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e === '\n' || e === '\r\n' || e === '\r') return '';
    return e in simple ? simple[e] : e;
  });
}
function extractWebShim(bundle) {
  const m = /const shimSource = \x60((?:\\[\s\S]|[^\x60\\])*)\x60;/.exec(bundle);
  return m && !/(^|[^\\])\$\{/.test(m[1]) ? cookTemplateLiteral(m[1]) : '';
}
function readWebShim() {
  if (webShimCache !== undefined) return webShimCache;
  try {
    webShimCache = WEBWALLGL_PKG_DIR ? extractWebShim(readFileSync(join(WEBWALLGL_PKG_DIR, 'webwallgl.mjs'), 'utf8')) : '';
  } catch {
    webShimCache = '';
  }
  return webShimCache;
}
function userPropsFor(token) {
  try {
    const all = readSettings()?.userProps;
    const v = all && typeof all === 'object' ? all[String(token)] : null;
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function buildSeedScript(entryAbs, token) {
  try {
    const pj = JSON.parse(readFileSync(join(dirname(entryAbs), 'project.json'), 'utf8'));
    const overrides = userPropsFor(token);
    const defs = parseUserPropDefs(pj, overrides, {
      filePrefix: entryDirPrefix(String((pj && pj.file) || '')),
    });
    const wire = {};
    for (const d of defs) {
      if (d.value === null) continue;
      wire[d.name] = { value: d.value };
    }
    if (!Object.keys(wire).length) return '';
    return `window.__weSeedProps(${JSON.stringify(wire)});`;
  } catch {
    return '';
  }
}
async function pathExistsP(p) {
  try { await access(p); return true; } catch { return false; }
}
async function isDirectoryP(p) {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}
async function mtimeOrNullP(p) {
  try { return (await stat(p)).mtimeMs; } catch { return null; }
}
async function isFileP(p) {
  try { return (await stat(p)).isFile(); } catch { return false; }
}
const { locateWallpaperEngineP, owningLibrariesP } = createSteamDiscoveryKit({ WE_APPID, pathExistsP });
const {
  extOf, readProjectP, resolveSceneMainFileP, SCAN_CHUNK, scanSignatureP,
  enumerateWallpapersAsync, pathKey, readPlaylistsP, playlistItemId,
} = createWallpaperScanKit({ WE_APPID, pathExistsP, isFileP, isDirectoryP });
function pluginDataDir() {
  const override = process.env.DSH_WE_DATA_DIR;
  return override && override.trim() ? resolve(override.trim()) : join(homedir(), '.dsh-wallpaper-engine');
}
function configPath() { return join(pluginDataDir(), 'config.json'); }
function cacheBaseDir() {
  const env = process.env.DSH_WE_CACHE_DIR;
  if (env && env.trim()) return normalize(env.trim());
  const cfg = readConfig();
  if (typeof cfg.cacheDir === 'string' && cfg.cacheDir.trim()) {
    const dir = normalizeUserDir(cfg.cacheDir);
    if (dir) return dir;
  }
  return join(pluginDataDir(), 'cache');
}
const {
  readConfig, writeConfig, readSettings, writeSettings, SETTINGS_FIELD,
  atomicWriteFileSync, atomicWriteFileP, atomicTmpPath, enqueueConfigWrite,
} = createConfigStoreKit({ configPath });
function fontSetsDir() { return join(pluginDataDir(), 'fontsets'); }
function glassPresetsDir() { return join(pluginDataDir(), 'glass-presets'); }
function readFontSetId() {
  const v = readConfig().fontSetId;
  return isFontSetId(v) ? v : '';
}
function setFontSetId(id) {
  if (!isFontSetId(id)) return Promise.reject(new Error('fontsets: invalid id ' + String(id)));
  return enqueueConfigWrite(() => {
    const cfg = readConfig();
    cfg.fontSetId = id;
    writeConfig(cfg);
    return id;
  });
}
function commitFontSetMigration(id) {
  if (!isFontSetId(id)) return Promise.reject(new Error('fontsets: invalid id ' + String(id)));
  return enqueueConfigWrite(() => {
    const cfg = readConfig();
    cfg.fontSetId = id;
    const prev = cfg[SETTINGS_FIELD];
    if (prev && typeof prev === 'object') {
      cfg[SETTINGS_FIELD] = sanitizeFromSchema(prev, 'host') || prev;
    }
    writeConfig(cfg);
    return id;
  });
}
function withLegacyFontValues(next) {
  if (readFontSetId()) return next;
  const prev = readSettings();
  if (!prev || typeof prev !== 'object') return next;
  const legacy = sanitizeFontset(prev);
  const out = Object.assign({}, next);
  for (const key of FONTSET_KEYS) if (key in prev) out[key] = legacy[key];
  return out;
}
function isBetterSidebarLoaded(ctx) {
  try {
    const loader = ctx && ctx.loader;
    if (!loader || typeof loader.entries !== 'function') return false;
    for (const entry of loader.entries()) {
      const opts = entry && entry.options;
      if (!opts || opts.group) continue;
      const isSidebar = opts.name === 'dsh-better-sidebar'
        || String(opts.id || '').includes('better-sidebar');
      if (isSidebar && !entry.disabled) return true;
    }
  } catch {   }
  return false;
}
function sanitizeSettings(raw) {
  return sanitizeFromSchema(raw, 'host');
}
function transcodeCacheDir() {
  return join(cacheBaseDir(), 'transcodes');
}
const ensuredDirs = new Set();
function ensureDirOnce(dir) {
  if (!ensuredDirs.has(dir)) {
    try { mkdirSync(dir, { recursive: true }); } catch {   }
    ensuredDirs.add(dir);
  }
  return dir;
}
const {
  transcodeToFps, registerTranscodeWaiter, transcodeJobs,
  transcodeCachePathFor, resolveFfmpeg, spawnFfmpeg, ffmpegDataDir, disposeTranscodes,
} = createTranscodeKit({ configPath, transcodeCacheDir, ensureDirOnce, atomicTmpPath });
const {
  resolveUploadDir,
  UPLOAD_EXT, CUSTOM_FRAME_EXT, CUSTOM_FRAME_MAX_BYTES, customFrameDir,
  AVATAR_EXT, AVATAR_MAX_BYTES, AVATAR_SIDES, avatarDir, avatarPath,
  liveFrameDir,
  WE_ASSETS_SOURCE_ID, weAssetsAvailable, getWeAssetsDir, setWeAssetsDir,
  listWeAssetNames,
} = createAssetPathsKit({ pluginDataDir, ensureDirOnce, readConfig, writeConfig, enqueueConfigWrite });
let UPLOAD_DIR = resolveUploadDir();
function getUploadDir() { return UPLOAD_DIR; }
function frameCacheDir() {
  return join(cacheBaseDir(), 'frames');
}
function ensureFrameCacheDir() {
  return ensureDirOnce(frameCacheDir());
}
const LIVE_FRAME_KEY_VERSION = 'lf1';
function sceneFrameCacheKey(abs, mtime) {
  return LIVE_FRAME_KEY_VERSION + '_' + Buffer.from(abs, 'utf8').toString('base64url') + '_' + Math.round(mtime);
}
function sceneFrameSlot(abs) {
  let mtime = 0;
  try { mtime = statSync(abs).mtimeMs; } catch {   }
  const key = sceneFrameCacheKey(abs, mtime);
  const dir = ensureFrameCacheDir();
  return {
    key,
    gpuPath: join(dir, key + '_gpu.png')
  };
}
function gpuFrameFileFor(slot) {
  return existsSync(slot.gpuPath) ? slot.gpuPath : null;
}
const GPU_FRAME_AREA_TOL = 0.05;
const GPU_FRAME_MAX_BYTES = 32 * 1024 * 1024;
const GPU_FRAME_MIN_BYTES = 1024;
function looksLikePng(body) {
  if (body.length < GPU_FRAME_MIN_BYTES) return false;
  const sig = body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47
    && body[4] === 0x0d && body[5] === 0x0a && body[6] === 0x1a && body[7] === 0x0a;
  if (!sig) return false;
  if (body.toString('latin1', 12, 16) !== 'IHDR') return false;
  return body.toString('latin1', body.length - 8, body.length - 4) === 'IEND';
}
const GPU_WRITE_INFLIGHT = new Map();
function pngSizeOf(file) {
  let fd = -1;
  try {
    fd = openSync(file, 'r');
    const headBuf = Buffer.alloc(33);
    if (readSync(fd, headBuf, 0, 33, 0) < 33) return null;
    if (headBuf.toString('latin1', 12, 16) !== 'IHDR') return null;
    const width = headBuf.readUInt32BE(16);
    const height = headBuf.readUInt32BE(20);
    if (!(width > 0) || !(height > 0)) return null;
    return { width, height };
  } catch {
    return null;
  } finally {
    if (fd >= 0) { try { closeSync(fd); } catch {   } }
  }
}
function pngDimsOfBuf(buf) {
  try {
    if (!buf || buf.length < 24) return null;
    if (buf.toString('latin1', 12, 16) !== 'IHDR') return null;
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (!(width > 0) || !(height > 0)) return null;
    return { width, height };
  } catch {
    return null;
  }
}
const VIDEO_PREVIEW_WIDTH = 960;
const VIDEO_PREVIEW_MAX_CONCURRENT = 2;
function videoPreviewCacheDir() {
  return join(cacheBaseDir(), 'video-previews');
}
function ensureVideoPreviewCacheDir() {
  return ensureDirOnce(videoPreviewCacheDir());
}
const { generateVideoPreview } = createVideoPreviewKit({
  ensureVideoPreviewCacheDir, resolveFfmpeg, spawnFfmpeg,
  VIDEO_PREVIEW_WIDTH, VIDEO_PREVIEW_MAX_CONCURRENT,
});
const {
  sweepTranscodeArtifacts, sweepCustomFrameTmp, pruneVideoPreviewCache,
  pruneCacheDirBySize, TRANSCODE_CACHE_MAX_BYTES,
} = createCachePruneKit({ transcodeCacheDir, ffmpegDataDir, videoPreviewCacheDir });
const { appendDiagLine, traceRequests, foldTokenPath } = createHostDiagKit({ configPath });
function traceMediaRequests(req, res, pathKey) {
  try {
    const key = foldTokenPath(pathKey);
    const tail = key.split('/').pop() || '';
    const isDoc = tail === '' || /\.html?$/i.test(tail) || !/\.[a-z0-9]{1,8}$/i.test(tail);
    res.on('finish', () => {
      const status = res.statusCode || 0;
      if (!isDoc && status < 400) return;
      appendDiagLine('req', {
        route: 'scene-files@media',
        path: key,
        status,
        dest: String(req.headers['sec-fetch-dest'] || ''),
      });
    });
  } catch {   }
}
function liveFrameFile(abs) { return join(liveFrameDir(), customIdFromAbs(abs) + '.jpg'); }
function customIdFromAbs(abs) {
  const m = /431960[\\/]([^\\/]+)[\\/]/.exec(String(abs));
  if (m) return m[1];
  return Buffer.from(String(abs), 'utf8').toString('base64url').slice(0, 48);
}
function customFramePath(id) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(id))) return null;
  for (const ext of ['png', 'jpg', 'webp']) {
    const p = join(customFrameDir(), String(id) + '.' + ext);
    if (existsSync(p)) return p;
  }
  return null;
}
function listCustomFrameIds() {
  const ids = new Set();
  try {
    for (const f of readdirSync(customFrameDir())) {
      const m = /^([A-Za-z0-9_-]{1,64})\.(png|jpg|webp)$/.exec(f);
      if (m) ids.add(m[1]);
    }
  } catch {   }
  return ids;
}
const UPLOAD_MAX_BYTES = 512 * 1024 * 1024;
const UPLOAD_FILE_RE = /^(up-[a-z0-9-]+)\.(mp4|jpg|jpeg|png)$/i;
const CONTROL_JSON_MAX_BYTES = 64 * 1024;
const {
  ensureUploadDir, readUploadMeta, metaEntry, setUploadMeta, removeUploadMeta, PREVIEW_CANDIDATES,
} = createUploadStoreKit({
  getUploadDir: () => UPLOAD_DIR, ensureDirOnce, enqueueConfigWrite, atomicWriteFileSync,
});
async function enumerateUploadsP(dir) {
  if (!(await pathExistsP(dir))) return [];
  let entries;
  try { entries = await readdir(dir); } catch { return []; }
  const files = [];
  const dirs = [];
  for (const entry of entries) {
    if (!entry || entry.startsWith('.')) continue;
    const abs = join(dir, entry);
    let st; try { st = await stat(abs); } catch { continue; }
    if (st.isFile()) {
      const m = UPLOAD_FILE_RE.exec(entry);
      if (!m) continue;
      const ext = m[2].toLowerCase();
      const id = m[1];
      const type = ext === 'mp4' ? 'video' : 'image';
      files.push({ id, type, fileAbs: abs, previewAbs: type === 'image' ? abs : null });
    } else if (st.isDirectory()) {
      dirs.push({ name: entry, abs });
    }
  }
  const projects = [];
  for (let i = 0; i < dirs.length; i += SCAN_CHUNK) {
    const chunk = dirs.slice(i, i + SCAN_CHUNK);
    const hits = await Promise.all(chunk.map(async ({ name, abs }) => {
      const proj = await readProjectP(abs);
      if (!proj || proj.type === 'application') return null;
      const fileAbs = proj.type === 'scene'
        ? resolve(abs, (await resolveSceneMainFileP(abs, proj.file)) || proj.file)
        : resolve(abs, proj.file);
      if (!(await pathExistsP(fileAbs))) return null;
      let previewAbs = proj.preview ? resolve(abs, proj.preview) : null;
      if (previewAbs && !(await pathExistsP(previewAbs))) previewAbs = null;
      if (!previewAbs) {
        for (const cand of PREVIEW_CANDIDATES) {
          const p = join(abs, cand);
          if (await pathExistsP(p)) { previewAbs = p; break; }
        }
      }
      return {
        id: `up-dir-${name}`,
        title: proj.title || name,
        type: proj.type,
        fileAbs,
        previewAbs,
        contentrating: proj.contentrating,
        schemeColor: proj.schemeColor,
      };
    }));
    for (const hit of hits) if (hit) projects.push(hit);
  }
  const out = [...files, ...projects];
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}
function resolveUploadFile(dir, id) {
  if (typeof id !== 'string' || !/^up-[a-z0-9-]+$/.test(id)) return null;
  const root = normalize(dir);
  try {
    for (const entry of readdirSync(dir)) {
      const m = UPLOAD_FILE_RE.exec(entry);
      if (m && m[1].toLowerCase() === id.toLowerCase()) {
        const abs = normalize(join(dir, entry));
        const rel = relative(root, abs);
        if (rel && !rel.startsWith('..') && !isAbsolute(rel)) return abs;
      }
    }
  } catch {   }
  return null;
}
function normalizeUserDir(raw) {
  if (typeof raw !== 'string') return null;
  let dir = raw.trim().replace(/^["']|["']$/g, '');
  if (!dir) return null;
  if (dir === '~' || dir.startsWith('~\\') || dir.startsWith('~/')) {
    dir = join(homedir(), dir.slice(1));
  }
  if (/[\u0000-\u001f]/.test(dir)) return null;
  const isAbsolute = /^[a-zA-Z]:[\\/]/.test(dir) || /^\\\\/.test(dir) || /^\//.test(dir);
  if (!isAbsolute) return null;
  return normalize(dir);
}
async function moveFileP(src, dst) {
  try { await renameP(src, dst); return true; } catch {   }
  try {
    await copyFileP(src, dst);
    await unlinkP(src);
    return true;
  } catch { return false; }
}
function setUploadDir(newDir, migrate) {
  return enqueueConfigWrite(async () => {
    const oldDir = normalize(UPLOAD_DIR);
    const target = normalize(newDir);
    const sameDir = oldDir.toLowerCase() === target.toLowerCase();
    if (sameDir) {
      UPLOAD_DIR = target;
      return { uploadDir: target, migrated: 0, skipped: 0, same: true };
    }
    ensureUploadDir();
    let migrated = 0;
    let skipped = 0;
    if (migrate !== false && (await pathExistsP(oldDir))) {
      let entries;
      try { entries = await readdir(oldDir); } catch { entries = []; }
      for (const entry of entries) {
        if (entry === '.meta.json' || UPLOAD_FILE_RE.test(entry)) {
          if (await moveFileP(join(oldDir, entry), join(target, entry))) migrated += 1;
          else skipped += 1;
        }
      }
    }
    UPLOAD_DIR = target;
    const cfg = readConfig();
    cfg.uploadDir = target;
    writeConfig(cfg);
    ensureUploadDir();
    return { uploadDir: target, migrated, skipped, same: false };
  });
}
const CACHE_SUBDIRS = ['transcodes', 'faststart', 'frames', 'video-previews', 'media-bridge', 'artwork'];
async function moveTreeP(src, dst) {
  let moved = 0;
  let skipped = 0;
  let entries;
  try { entries = await readdir(src, { withFileTypes: true }); } catch { return { moved, skipped }; }
  ensureDirOnce(dst);
  for (const entry of entries) {
    const from = join(src, entry.name);
    const to = join(dst, entry.name);
    if (entry.isDirectory()) {
      const sub = await moveTreeP(from, to);
      moved += sub.moved;
      skipped += sub.skipped;
    } else if (entry.isFile()) {
      if (await moveFileP(from, to)) moved += 1;
      else skipped += 1;
    } else {
      skipped += 1;
    }
  }
  return { moved, skipped };
}
function setCacheDir(newDir, migrate) {
  return enqueueConfigWrite(async () => {
    const oldDir = normalize(cacheBaseDir());
    const target = normalize(newDir);
    if (oldDir.toLowerCase() === target.toLowerCase()) {
      return { cacheDir: target, migrated: 0, skipped: 0, same: true };
    }
    ensureDirOnce(target);
    let migrated = 0;
    let skipped = 0;
    if (migrate !== false && (await pathExistsP(oldDir))) {
      for (const name of CACHE_SUBDIRS) {
        const from = join(oldDir, name);
        if (!(await pathExistsP(from))) continue;
        const sub = await moveTreeP(from, join(target, name));
        migrated += sub.moved;
        skipped += sub.skipped;
      }
    }
    const cfg = readConfig();
    cfg.cacheDir = target;
    writeConfig(cfg);
    return { cacheDir: target, migrated, skipped, same: false };
  });
}
const BODY_IDLE_TIMEOUT_MS = 60 * 1000;
function armBodyIdleTimeout(req, onTimeout) {
  let timer = null;
  let fired = false;
  const disarm = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const arm = () => {
    if (fired) return;
    disarm();
    timer = setTimeout(() => {
      fired = true;
      try { onTimeout(); } catch {   }
      try { req.destroy(); } catch {   }
    }, BODY_IDLE_TIMEOUT_MS);
    if (typeof timer.unref === 'function') timer.unref();
  };
  req.on('data', arm);
  req.once('end', disarm);
  req.once('close', disarm);
  arm();
  return disarm;
}
const LINGER_MAX_MS = 5000;
function lingerClose(req, res) {
  let timer = null;
  let armed = false;
  const drop = () => {
    if (timer) { try { clearTimeout(timer); } catch {   } timer = null; }
    try { req.destroy(); } catch {   }
  };
  const armLinger = () => {
    if (armed) return;
    armed = true;
    timer = setTimeout(drop, LINGER_MAX_MS);
    if (typeof timer.unref === 'function') timer.unref();
  };
  const requestDrained = () => req.readableEnded === true || req.complete === true
    || req.destroyed === true || typeof req.once !== 'function';
  const responseFlushed = () => !res || typeof res.once !== 'function' || res.writableFinished === true;
  const dropWhenBothDone = () => {
    if (requestDrained() && responseFlushed()) { drop(); return; }
    if (!requestDrained()) {
      req.once('end', dropWhenBothDone);
      req.once('close', dropWhenBothDone);
    }
    if (!responseFlushed()) {
      res.once('finish', dropWhenBothDone);
      res.once('close', dropWhenBothDone);
    }
    armLinger();
  };
  dropWhenBothDone();
  if (!requestDrained()) { try { req.resume(); } catch {   } }
}
export const inject = ['webServer'];
let applied = false;
export function apply(ctx) {
  if (applied) {
    try { ctx.logger?.warn?.('wallpaper-engine: duplicate activation ignored'); } catch {   }
    return () => {};
  }
  applied = true;
  const startupTiming = createStartupTiming();
function localStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const abs = Math.abs(off);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
    + (off >= 0 ? '+' : '-') + pad(Math.floor(abs / 60)) + ':' + pad(abs % 60);
}
  try {
    const diagFile = join(pluginDataDir(), 'shutdown.log');
    const diag = (line) => {
      try { appendFileSync(diagFile, localStamp() + ' ' + line + '\n'); } catch {   }
    };
    process.on('message', (m) => {
      if (m && typeof m === 'object' && 'type' in m && m.type === 'shutdown') {
        diag('host: received shutdown message');
        if (process.env.DSH_WE_FAST_QUIT !== '0') {
          const timer = setTimeout(() => {
            diag('host: fast-exit after 2000ms (cordis teardown still pending)');
            process.exit(0);
          }, 2000);
          if (typeof timer.unref === 'function') timer.unref();
        }
      }
    });
    process.once('SIGTERM', () => diag('host: received SIGTERM'));
    process.once('SIGINT', () => diag('host: received SIGINT'));
    process.on('exit', (code) => diag('host: exit code=' + code));
    diag('host: instrumentation installed pid=' + process.pid + ' home=' + process.env.HOME);
  } catch {   }
  try {
    const self = fileURLToPath(import.meta.url);
    atomicWriteFileSync(
      join(dirname(configPath()), 'build-stamp.json'),
      JSON.stringify({
        at: new Date().toISOString(),
        hostFile: self,
        hostMtime: statSync(self).mtimeMs,
      }, null, 2) + '\n',
    );
  } catch {   }
  const webServer = ctx.webServer;
  if (!webServer || typeof webServer.register !== 'function') {
    return () => {};
  }
  const log = createLog(
    typeof ctx.logger === 'function' ? ctx.logger(PLUGIN_NAME) : ctx.logger,
    PLUGIN_NAME,
  );
  const notice = createNotice(log, PLUGIN_NAME);
  const mediaMap = new Map();
  const tokenFor = (absPath) => {
    const token = Buffer.from(absPath, 'utf8').toString('base64url');
    mediaMap.set(token, absPath);
    return token;
  };
  const { layoutFor } = createMp4VfsKit({ appendDiagLine });
  const legacyCacheBaseDir = () => join(pluginDataDir(), 'cache');
  const {
    faststartVariant, pinnedFaststartVariant, warmFaststartFavorites, sweepLegacyFaststartVariants,
  } = createFaststartKit({ layoutFor, cacheBaseDir, legacyCacheBaseDir, readConfig, mediaMap });
  const {
    ensureSceneAudio, sceneVideoProbeKey, sceneVideoProbeGet, sceneVideoProbeSet, scheduleSceneVideoProbe,
  } = createSceneProbeKit({ atomicWriteFileP, ensureFrameCacheDir });
  const startupSweepTimer = setTimeout(() => {
    try { sweepTranscodeArtifacts(); } catch {   }
    try { sweepCustomFrameTmp(customFrameDir()); } catch {   }
    try { sweepCustomFrameTmp(avatarDir()); } catch {   }
    try { pruneVideoPreviewCache(); } catch {   }
    try { pruneCacheDirBySize(transcodeCacheDir(), TRANSCODE_CACHE_MAX_BYTES, /^tc_.*\.mp4$/); } catch {   }
    try {
      const swept = sweepLegacyFaststartVariants();
      if (swept.files) {
        log.info('已回收旧版 faststart 副本：' + swept.files + ' 个 / '
          + (swept.bytes / 1048576).toFixed(1) + ' MB（本版起不再落盘）'
          + (swept.capped ? '（本轮达清扫上限，下次启动继续）' : ''));
      }
    } catch {   }
  }, 3000);
  const disposers = [];
  disposers.push(() => { try { clearTimeout(startupSweepTimer); } catch {   } });
  const billing = createBilling({
    dataDir: pluginDataDir(),
    log: (message) => log.warn(message),
  });
  disposers.push(() => billing.dispose());
  const billingBalance = createBillingBalance({ ctx, log: (message) => log.warn(message) });
  disposers.push(() => billingBalance.dispose());
  if (typeof ctx.on === 'function') {
    ctx.on('session/event', (session, event) => billing.noteEvent(session, event), { global: true });
    ctx.on('llm/stream', createBillingStream({ billing }), { global: true });
  }
  const activeStreams = new Set();
  const { trackStream, serveFile, serveLayout, handleSceneFiles } = createServeKit({
    activeStreams, BASE, mediaMap, log, appendDiagLine,
    traceRequests, traceMediaRequests, readWebShim, buildSeedScript,
  });
  const mediaOriginApi = createMediaOrigin({
    base: BASE, log, notice, appendDiagLine, disposers, handleSceneFiles, readSettings,
  });
  const buildInventory = createInventoryBuilder({
    log, BASE, tokenFor, mediaOriginApi, warmFaststart: warmFaststartFavorites,
    locateWallpaperEngineP, owningLibrariesP, enumerateWallpapersAsync,
    scanSignatureP,
    pathKey, listCustomFrameIds, pathExistsP, mtimeOrNullP, extOf,
    ensureUploadDir, readUploadMeta, enumerateUploadsP, metaEntry,
    readPlaylistsP, playlistItemId, weAssetsAvailable,
    sceneVideoProbeKey, sceneVideoProbeGet, scheduleSceneVideoProbe, customIdFromAbs,
    getUploadDir, getWeAssetsDir, cacheBaseDir,
  });
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/inventory`,
    handler: async (req, res) => {
      try {
        mediaOriginApi.observeAdapter(req);
        const payload = JSON.stringify(await buildInventory());
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(payload);
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: String(err && err.message ? err.message : err) }));
      }
    },
  }));
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/greeting.mp4`,
    handler: (req, res) => {
      const cfg = (typeof readSettings === 'function' ? readSettings() : null) || {};
      if (cfg.greetingOn === false) {
        res.statusCode = 404;
        res.end();
        return;
      }
      const configured = String(cfg.greetingPath || '').trim();
      /* 留空 = 用默认启动视频（存在才播）；填了路径就按填的来。 */
      const customPath = !configured
        ? GREETING_VIDEO_PATH
        : (configured === '~' || configured.startsWith('~/') || configured.startsWith('~\\')
          ? join(homedir(), configured.slice(1))
          : configured);
      const dot = customPath.lastIndexOf('.');
      const ext = dot >= 0 ? customPath.slice(dot).toLowerCase() : '';
      const MIME = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' };
      const mime = MIME[ext];
      const source = customPath;
      let size;
      try {
        if (!mime || !existsSync(source)) throw new Error('no greeting video');
        size = statSync(source).size;
      } catch {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.setHeader('Content-Type', mime);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-store');
      const rawRange = req.headers && req.headers.range;
      const m = typeof rawRange === 'string' ? /^bytes=(\d*)-(\d*)$/.exec(rawRange) : null;
      if (m) {
        let start = m[1] === '' ? NaN : Number(m[1]);
        let end = m[2] === '' ? NaN : Number(m[2]);
        if (Number.isNaN(start)) {
          start = Math.max(0, size - (Number.isNaN(end) ? 0 : end));
          end = size - 1;
        } else if (Number.isNaN(end) || end >= size) {
          end = size - 1;
        }
        if (!(start >= 0 && start <= end && start < size)) {
          res.statusCode = 416;
          res.setHeader('Content-Range', `bytes */${size}`);
          res.end();
          return;
        }
        res.statusCode = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        res.setHeader('Content-Length', String(end - start + 1));
        const stream = createReadStream(source, { start, end });
        stream.on('error', () => { try { res.destroy(); } catch {   } });
        stream.pipe(res);
        return;
      }
      res.setHeader('Content-Length', String(size));
      const stream = createReadStream(source);
      stream.on('error', () => { try { res.destroy(); } catch {   } });
      stream.pipe(res);
    },
  }));
  registerMediaDerivedRoutes(webServer, {
    disposers, base: BASE, mediaMap, serveFile, log,
    getMediaInfo, faststartVariant, transcodeJobs,
    transcodeToFps, registerTranscodeWaiter, generateVideoPreview,
    transcodeCached: (abs, fps) => {
      const p = transcodeCachePathFor(abs, fps);
      return Boolean(p && existsSync(p));
    },
  });
  registerMediaBytesRoutes(webServer, {
    disposers, base: BASE, serveFile, serveLayout, mediaMap, log, pinnedFaststartVariant,
  });
  registerSceneFrameRoutes(webServer, {
    disposers, base: BASE, mediaMap, trackStream, serveFile,
    GPU_FRAME_AREA_TOL, GPU_FRAME_MAX_BYTES, GPU_WRITE_INFLIGHT,
    CUSTOM_FRAME_EXT, CUSTOM_FRAME_MAX_BYTES,
    armBodyIdleTimeout, atomicWriteFileP, customFrameDir, customFramePath, customIdFromAbs,
    gpuFrameFileFor, lingerClose, looksLikePng, pngDimsOfBuf, pngSizeOf, sceneFrameSlot,
  });
  registerSceneServeRoutes(webServer, {
    disposers, base: BASE, WEBWALLGL_DIR, WEBWALLGL_PKG_DIR, appendDiagLine, traceRequests, serveFile,
    handleSceneFiles, mediaOriginInfo: mediaOriginApi.mediaOriginInfo, payloadProgress, log,
  });
  registerPropsRoutes(webServer, { disposers, base: BASE, mediaMap, userPropsFor });
  registerLiveFrameRoutes(webServer, {
    disposers, base: BASE, mediaMap, serveFile, traceRequests,
    liveFrameFile, atomicWriteFileSync, lingerClose,
  });
  registerNowPlayingRoutes(webServer, {
    disposers, base: BASE, appendDiagLine, configPath, cacheBaseDir, readConfig, serveFile,
    CONTROL_JSON_MAX_BYTES,
    log: log.tag('media'),
  });
  const occlusionHub = createOcclusionHub({
    log: log.tag('occlusion'),
    diag: (obj) => appendDiagLine('occlusion', obj),
  });
  disposers.push(() => occlusionHub.dispose());
  occlusionHub.start().catch(() => {   });
  registerOcclusionRoutes(webServer, {
    disposers, base: BASE, hub: occlusionHub,
    log: log.tag('occlusion'),
    diag: (obj) => appendDiagLine('occlusion', obj),
  });
  registerDiagRoutes(webServer, {
    disposers, appendDiagLine, base: BASE, log, notice,
    onHandleDiag: mediaOriginApi.setDiagHandler,
  });
  registerWeAssetsRoutes(webServer, {
    disposers, base: BASE, serveFile,
    CONTROL_JSON_MAX_BYTES, normalizeUserDir,
    setWeAssetsDir, listWeAssetNames, weAssetsAvailable,
    WE_ASSETS_SOURCE_ID, getWeAssetsDir,
  });
  const SCENE_VIDEO_INFLIGHT = new Map();
  registerSceneMediaRoutes(webServer, {
    disposers, base: BASE, mediaMap, serveFile,
    ensureFrameCacheDir, sceneVideoProbeKey, sceneVideoProbeSet,
    atomicWriteFileP, ensureSceneAudio, SCENE_VIDEO_INFLIGHT,
  });
  registerUploadRoutes(webServer, {
    disposers, base: BASE, tokenFor, UPLOAD_EXT, UPLOAD_MAX_BYTES, CONTROL_JSON_MAX_BYTES,
    ensureUploadDir, readUploadMeta, metaEntry, setUploadMeta, removeUploadMeta,
    resolveUploadFile, setUploadDir, normalizeUserDir, armBodyIdleTimeout, lingerClose,
  });
  registerFontsetsRoutes(webServer, {
    disposers, base: BASE, fontSetsDir, fontSetsBuiltinDir: FONTSET_BUILTIN_DIR,
    readSettings, readFontSetId, setFontSetId, commitFontSetMigration,
    atomicWriteFileP, ensureDirOnce, armBodyIdleTimeout, lingerClose, log,
  });
  registerGlassPresetsRoutes(webServer, {
    disposers, base: BASE, glassPresetsDir, glassPresetsBuiltinDir: GLASS_PRESET_BUILTIN_DIR,
    readSettings, readFontSetId, fontSetsDir,
    avatarDir, avatarPath, AVATAR_SIDES,
    atomicWriteFileP, ensureDirOnce, armBodyIdleTimeout, lingerClose, log,
  });
  registerSystemFontsRoutes(webServer, {
    disposers, base: BASE,
    cachePath: () => join(pluginDataDir(), 'system-fonts.json'),
    log,
  });
  registerAvatarRoutes(webServer, {
    disposers, base: BASE, serveFile,
    avatarDir, avatarPath, AVATAR_SIDES, AVATAR_EXT, AVATAR_MAX_BYTES,
    atomicWriteFileP, armBodyIdleTimeout, lingerClose,
  });
  registerSettingsRoutes(webServer, {
    disposers, base: BASE, ctx, mediaOriginApi,
    readSettings, isBetterSidebarLoaded, sanitizeSettings, withLegacyFontValues, writeSettings,
    armBodyIdleTimeout, lingerClose,
  });
  registerBillingRoutes(webServer, { disposers, base: BASE, billing });
  registerBillingBalanceRoutes(webServer, { disposers, base: BASE, balance: billingBalance });
  registerBillingTurnRoutes(webServer, { disposers, base: BASE, ctx });
  registerCacheDirRoutes(webServer, {
    disposers, base: BASE, CONTROL_JSON_MAX_BYTES,
    normalizeUserDir, cacheBaseDir, setCacheDir, armBodyIdleTimeout,
  });
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/startup-timing`,
    handler: (req, res) => {
      try {
        const u = new URL(req.url || '/', 'http://x');
        startupTiming(Object.fromEntries(u.searchParams.entries()));
      } catch {   }
      res.statusCode = 204;
      res.end();
    },
  }));
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/cover`,
    handler: async (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'POST') { res.statusCode = 405; res.end(); return; }
      let outcome = 'failed';
      try { outcome = await coverDesktop(log); } catch {   }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ outcome }));
    },
  }));
  /* 今日 AI 资讯：优先 AnySearch（中文、实时），失败回退 Hacker News；10 分钟缓存。 */
  const readAnySearchKey = () => {
    const env = process.env.ANYSEARCH_API_KEY;
    if (typeof env === 'string' && env.trim()) return env.trim();
    try {
      const keyPath = join(homedir(), '.dsh', 'we-anysearch.key');
      if (existsSync(keyPath)) return readFileSync(keyPath, 'utf8').trim();
    } catch {   }
    return '';
  };
  const fetchAnySearchNews = async () => {
    const key = readAnySearchKey();
    if (!key) return [];
    const upstream = await fetch('https://api.anysearch.com/v1/search', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'AI 领域最新新闻与事件', max_results: 10, zone: 'cn', language: 'zh-CN' }),
      signal: AbortSignal.timeout(9000),
    });
    const json = await upstream.json();
    if (!json || json.code !== 0) return [];
    const results = json.data && Array.isArray(json.data.results) ? json.data.results : [];
    const items = [];
    for (const r of results) {
      const snippet = String((r && r.snippet) || '').replace(/\s+/g, ' ');
      const parts = snippet.split(/[·•|；;]/).map((t) => t.replace(/^\s*\d+[、.]\s*/, '').trim())
        .filter((t) => t.length >= 8 && t.length <= 60);
      if (parts.length) items.push(...parts.slice(0, 3));
      else if (r && r.title) items.push(String(r.title).replace(/\s+/g, ' ').trim().slice(0, 60));
      if (items.length >= 14) break;
    }
    return items.slice(0, 14).map((t) => ({ title: t, url: '', at: '' }));
  };
  const fetchHackerNews = async () => {
    const upstream = await fetch('https://hn.algolia.com/api/v1/search_by_date?tags=story&query=AI&hitsPerPage=15', {
      signal: AbortSignal.timeout(8000),
    });
    const json = await upstream.json();
    const hits = json && Array.isArray(json.hits) ? json.hits : [];
    return hits
      .map((h) => ({ title: typeof h.title === 'string' ? h.title : '', url: h.url || '', at: h.created_at || '' }))
      .filter((x) => x.title);
  };
  let aiNewsCache = { at: 0, items: [] };
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/ai-news`,
    handler: async (req, res) => {
      const now = Date.now();
      if (now - aiNewsCache.at > 10 * 60 * 1000) {
        let items = [];
        try { items = await fetchAnySearchNews(); } catch { items = []; }
        if (!items.length) {
          try { items = await fetchHackerNews(); } catch { items = []; }
        }
        if (items.length) aiNewsCache = { at: now, items };
        else aiNewsCache = { at: now, items: aiNewsCache.items || [] };
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ items: aiNewsCache.items }));
    },
  }));
  if ((readSettings() || {}).coverOnStartup !== false) {
    coverDesktopOnStartup((kind, message) => log(message, kind === 'cover-ok' ? 'info' : 'warn'));
  }
  return () => {
    applied = false;
    const disposeStart = Date.now();
    for (const d of disposers) { try { d(); } catch {   } }
    ensuredDirs.clear();
    disposeTranscodes();
    for (const s of activeStreams) {
      if (!s.destroyed) { try { s.destroy(); } catch {   } }
    }
    activeStreams.clear();
    mediaMap.clear();
    try {
      const proc =   (process);
      const handles = typeof proc._getActiveHandles === 'function' ? proc._getActiveHandles() : [];
      const names = handles.map((h) => (h && h.constructor ? h.constructor.name : typeof h));
      appendFileSync(
        join(pluginDataDir(), 'shutdown.log'),
        new Date().toISOString()
          + ' dispose=' + (Date.now() - disposeStart) + 'ms'
          + ' coverChild=' + (coverChildRunning() ? 'running' : 'idle')
          + ' handles=' + names.join(',') + '\n',
      );
    } catch {   }
  };
}
export default { inject, apply };
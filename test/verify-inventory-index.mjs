import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInventoryBuilder } from '../lib/inventory.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ISO = join(root, '.test-cache', 'inventory-index');
const CACHE = join(ISO, 'cache');
const WE = join(ISO, 'we');
const UPLOADS = join(ISO, 'uploads');
rmSync(ISO, { recursive: true, force: true });
mkdirSync(CACHE, { recursive: true });
let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) passed++;
  else failed++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? ' — ' + detail : ''));
}
function section(title) { console.log('\n' + title); }
const INDEX_FILE = join(CACHE, 'inventory-index.json');
const readIndex = () => {
  try { return JSON.parse(readFileSync(INDEX_FILE, 'utf8')); } catch { return null; }
};
let probes = { exists: 0, stat: 0, statPaths: [] };
const resetIoCalls = () => { probes = { exists: 0, stat: 0, statPaths: [] }; };
const installDir = join(WE, 'wallpaper_engine');
function makeProject(id) {
  const dir = join(installDir, 'projects', 'defaultprojects', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'project.json'), '{}');
  writeFileSync(join(dir, 'a.mp4'), '');
  writeFileSync(join(dir, 'preview.jpg'), '');
  return {
    id, title: id, type: 'video', contentrating: 'Everyone', schemeColor: null,
    fileAbs: join(dir, 'a.mp4'), previewAbs: join(dir, 'preview.jpg'), dirAbs: dir,
  };
}
let entries = [];
let sig = 'sig-1';
const dirMtime = new Map();
function makeBuilder() {
  return createInventoryBuilder({
    log: { info() {}, warn() {}, error() {} },
    BASE: '/wallpaper-engine',
    tokenFor: (abs) => 'tok-' + String(abs).split('/').pop(),
    mediaOriginApi: { mediaOriginBase: async () => 'https://media.example', ensureSceneMediaOrigin: async () => '' },
    warmFaststart: async () => {},
    locateWallpaperEngineP: async () => installDir,
    owningLibrariesP: async () => [],
    enumerateWallpapersAsync: async () => entries,
    scanSignatureP: async () => sig,
    pathKey: (p) => String(p).toLowerCase(),
    listCustomFrameIds: () => new Set(),
    pathExistsP: async (p) => { probes.exists += 1; return existsSync(p); },
    mtimeOrNullP: async (p) => {
      probes.stat += 1;
      probes.statPaths.push(String(p));
      if (dirMtime.has(p)) return dirMtime.get(p);
      return existsSync(p) ? 1 : null;
    },
    extOf: (p) => String(p).split('.').pop().toLowerCase(),
    ensureUploadDir: () => UPLOADS,
    readUploadMeta: () => ({}),
    enumerateUploadsP: async () => [],
    metaEntry: () => null,
    readPlaylistsP: async () => [],
    playlistItemId: () => null,
    weAssetsAvailable: () => false,
    sceneVideoProbeKey: (abs, m) => abs + '@' + m,
    sceneVideoProbeGet: () => undefined,
    scheduleSceneVideoProbe: () => {},
    customIdFromAbs: () => '',
    getUploadDir: () => UPLOADS,
    getWeAssetsDir: () => join(ISO, 'we-assets'),
    cacheBaseDir: () => CACHE,
  });
}
const buildFresh = () => makeBuilder()();
section('① 冷启动：真扫一次，索引落盘');
const alpha = makeProject('alpha');
const beta = makeProject('beta');
entries = [alpha, beta];
resetIoCalls();
const p1 = await buildFresh();
check('冷启动返回两张壁纸', p1.wallpapers.length === 2,
  'ids=' + p1.wallpapers.map((w) => w.id).join(','));
check('冷启动每条约 2 次存在性探测（media + preview）', probes.exists === 4, 'exists=' + probes.exists);
const idx1 = readIndex();
check('磁盘索引已落盘（重启后不必再扫）', !!idx1, INDEX_FILE);
check('索引存的是扫描原料（fileAbs + dirAbs 都在）',
  !!idx1 && !!idx1.we?.[0]?.fileAbs && !!idx1.we?.[0]?.dirAbs);
check('索引里没有载荷字段（media / preview URL 不进索引）',
  !!idx1 && !('media' in (idx1.we?.[0] || {})) && !('wallpapers' in idx1));
check('索引里不含任何铸造过的 token（token 只活在进程内）',
  !!idx1 && !JSON.stringify(idx1).includes('/media/tok-'));
check('索引带签名与写入时刻（签名命中靠它）',
  !!idx1 && idx1.sig === 'sig-1' && typeof idx1.builtAt === 'number');
section('② 重启后签名没变：一格 fs 都不发');
resetIoCalls();
const p2 = await buildFresh();
check('签名命中 ⇒ 一次存在性探测都没有', probes.exists === 0, 'exists=' + probes.exists);
check('签名命中 ⇒ 一次 stat 都没有（探测记忆直接复用）', probes.stat === 0, 'stat=' + probes.stat);
check('载荷与冷启动逐字一致', JSON.stringify(p2) === JSON.stringify(p1));
section('③ 库里新增一张：只有新条目被探测');
entries = [...entries, makeProject('gamma')];
sig = 'sig-2';
resetIoCalls();
const p3 = await buildFresh();
check('新增条目进了载荷', p3.wallpapers.some((w) => w.id === 'gamma'));
check('只探测新增的那一条（其余命中探测记忆）', probes.exists === 2, 'exists=' + probes.exists);
check('重扫时逐条核对项目目录 mtime（每存活条目一次）', probes.stat === 3, 'stat=' + probes.stat);
section('④ 只有一个项目目录变了：只有那一条重探');
dirMtime.set(beta.dirAbs, 99);
entries = [...entries, makeProject('delta')];
sig = 'sig-3';
resetIoCalls();
await buildFresh();
check('目录变了的 beta 与新增的 delta 被重探（2 条 × 2 次）', probes.exists === 4, 'exists=' + probes.exists);
check('alpha / gamma 没有被重探（负对照：记忆按条目失效，不是整表作废）',
  probes.statPaths.filter((p) => p.includes('alpha')).length === 1
    && probes.statPaths.filter((p) => p.includes('gamma')).length === 1,
  'stat=' + probes.stat);
section('⑤ 索引坏了 / 版本不符 ⇒ 当成没有索引，不抛');
writeFileSync(INDEX_FILE, '{ 这不是 JSON');
resetIoCalls();
const p5a = await buildFresh();
check('坏索引不抛、照常返回全部 4 条', p5a.wallpapers.length === 4, 'ids=' + p5a.wallpapers.length);
check('坏索引 ⇒ 退回冷启动（全部重探）', probes.exists === 8, 'exists=' + probes.exists);
writeFileSync(INDEX_FILE, JSON.stringify({ v: 1, sig, builtAt: Date.now(), we: entries, probes: {} }));
resetIoCalls();
const p5b = await buildFresh();
check('老版本索引被忽略（形状变了不能当命中的）', probes.exists === 8 && p5b.wallpapers.length === 4,
  'exists=' + probes.exists);
const goodNow = JSON.parse(readFileSync(INDEX_FILE, 'utf8'));
writeFileSync(INDEX_FILE, JSON.stringify(Object.assign({}, goodNow, { we: [null] })));
resetIoCalls();
const p5c = await buildFresh();
check('A3-F3：we:[null] 的索引当"没有索引"（不抛、照常全扫）',
  p5c.wallpapers.length === 4 && probes.exists === 8,
  'wallpapers=' + p5c.wallpapers.length + ' exists=' + probes.exists);
const idx5c = readIndex();
check('A3-F3：重扫后索引自愈（逐元素形状合法、不再含 null）',
  !!idx5c && Array.isArray(idx5c.we) && idx5c.we.length === 4
    && idx5c.we.every((w) => w && typeof w === 'object'),
  'we=' + JSON.stringify((idx5c && idx5c.we) || null));
sig = 'sig-5';
const savedEntries = entries;
entries = [null, ...savedEntries];
resetIoCalls();
const p5d = await buildFresh();
check('A3-F3：扫描原料含 null 元素 ⇒ 跳过它、其余照常返回（不抛）',
  p5d.wallpapers.length === 4, 'wallpapers=' + p5d.wallpapers.length);
entries = savedEntries;
section('⑥ 已删除的项目从索引里消失');
entries = entries.filter((w) => w.id !== 'alpha');
sig = 'sig-4';
resetIoCalls();
await buildFresh();
const idx6 = readIndex();
check('探测记忆里没有已删除条目的键',
  !!idx6 && !Object.keys(idx6.probes).some((k) => k.includes('alpha')),
  'keys=' + Object.keys(idx6?.probes || {}).length);
check('扫描原料也只剩存活的条目',
  !!idx6 && idx6.we.length === 3 && !idx6.we.some((w) => w.id === 'alpha'),
  'we=' + (idx6?.we || []).map((w) => w.id).join(','));
rmSync(ISO, { recursive: true, force: true });
console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
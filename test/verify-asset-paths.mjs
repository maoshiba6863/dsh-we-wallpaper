import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAssetPathsKit } from '../lib/asset-paths.js';
import { createCheck } from './tools/assert-harness.mjs';
import { stripComments } from './tools/js-text.mjs';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ISO = join(ROOT, '.test-cache', 'asset-paths-guard');
const SRC = join(ROOT, 'lib', 'asset-paths.js');
const SOURCE = readFileSync(SRC, 'utf8');
const OWN = readFileSync(fileURLToPath(import.meta.url), 'utf8');
const { check, stats } = createCheck();
let mutants = 0;
let seq = 0;
rmSync(ISO, { recursive: true, force: true });
mkdirSync(ISO, { recursive: true });
function section(title) { console.log('\n' + title); }
function freshDir(label) {
  const d = join(ISO, `${label}-${++seq}`);
  rmSync(d, { recursive: true, force: true });
  mkdirSync(d, { recursive: true });
  return d;
}
function withEnv(name, value, fn) {
  const prev = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  const restore = () => {
    if (prev === undefined) delete process.env[name];
    else process.env[name] = prev;
  };
  return Promise.resolve().then(fn).finally(restore);
}
function makeKit({ dirRef, cfg = {}, factory } = {}) {
  const state = { cfg, written: [], queueCalls: 0, ensured: [] };
  let queue = Promise.resolve();
  const F = factory || createAssetPathsKit;
  const kit = F({
    pluginDataDir: () => dirRef.value,
    ensureDirOnce: (d) => { state.ensured.push(d); mkdirSync(d, { recursive: true }); return d; },
    readConfig: () => state.cfg,
    writeConfig: (next) => { state.cfg = next; state.written.push(JSON.parse(JSON.stringify(next))); },
    enqueueConfigWrite: (fn) => {
      state.queueCalls += 1;
      const p = queue.then(fn);
      queue = p.then(() => {}, () => {});
      return p;
    },
  });
  return { kit, state };
}
function loadMutant(label, transforms) {
  let text = SOURCE;
  for (const [find, replace] of transforms) {
    if (!text.includes(find)) {
      throw new Error(`变异体 ${label} 的锚点没命中：${JSON.stringify(find.slice(0, 70))} —— 源码变了就同步改锚点`);
    }
    text = text.replace(find, () => replace);
  }
  mutants += 1;
  const file = join(ISO, 'mutants', `${mutants}-${label}.mjs`);
  mkdirSync(join(ISO, 'mutants'), { recursive: true });
  writeFileSync(file, text);
  return import(pathToFileURL(file).href);
}
async function pair(name, judge, label, transforms) {
  const pos = await judge({});
  check(name, pos.ok === true, '正向读数：' + pos.detail);
  const mod = await loadMutant(label, transforms);
  const mut = await judge({ factory: mod.createAssetPathsKit });
  check(`${name} —— 负对照（${label}）必须判红`, mut.ok === false, '变异体读数：' + mut.detail);
}
async function judgeUploadPriority(make) {
  const dirRef = { value: freshDir('a-up') };
  const mk = (cfg) => makeKit({ dirRef, cfg, factory: make.factory }).kit;
  const envWins = await withEnv('DSH_WE_UPLOAD_DIR', '/env/upload', async () => mk({ uploadDir: '/cfg/upload' }).resolveUploadDir());
  const cfgWins = await withEnv('DSH_WE_UPLOAD_DIR', undefined, async () => mk({ uploadDir: '  /cfg/upload  ' }).resolveUploadDir());
  const fallback = await withEnv('DSH_WE_UPLOAD_DIR', undefined, async () => {
    const k = mk({});
    return { resolved: k.resolveUploadDir(), expected: k.defaultUploadDir() };
  });
  const blank = await withEnv('DSH_WE_UPLOAD_DIR', undefined, async () => {
    const k = mk({ uploadDir: '   ' });
    return { resolved: k.resolveUploadDir(), expected: k.defaultUploadDir() };
  });
  const wantDefault = join(dirRef.value, 'uploads');
  const ok = envWins === '/env/upload' && cfgWins === '/cfg/upload'
    && fallback.resolved === fallback.expected && fallback.expected === wantDefault
    && blank.resolved === blank.expected;
  return { ok, detail: `env=${envWins} · config='  /cfg/upload  '⇒${cfgWins} · 默认=${fallback.resolved}（期望 ${wantDefault}） · 纯空白⇒${blank.resolved}` };
}
async function judgeDerivedDirs(make) {
  const dirRef = { value: freshDir('b-data1') };
  const { kit } = makeKit({ dirRef, factory: make.factory });
  const subs = { overrides: 'overrides', avatars: 'avatars', liveFrames: 'live-frames', uploads: 'uploads' };
  const cells = {
    overrides: kit.customFrameDir(), avatars: kit.avatarDir(),
    liveFrames: kit.liveFrameDir(), uploads: kit.defaultUploadDir(),
  };
  const notes = [];
  let ok = true;
  for (const [key, sub] of Object.entries(subs)) {
    const want = join(dirRef.value, sub);
    const mustExist = key !== 'uploads';
    if (cells[key] !== want || (mustExist && !existsSync(want))) {
      ok = false;
      notes.push(`${key}=${cells[key]}（期望 ${want}，存在=${existsSync(want)}，要求存在=${mustExist}）`);
    }
  }
  const dir2 = freshDir('b-data2');
  dirRef.value = dir2;
  const after = { overrides: kit.customFrameDir(), avatars: kit.avatarDir(), liveFrames: kit.liveFrameDir() };
  for (const [key, sub] of Object.entries({ overrides: 'overrides', avatars: 'avatars', liveFrames: 'live-frames' })) {
    const want = join(dir2, sub);
    if (after[key] !== want || !existsSync(want)) { ok = false; notes.push(`换目录后 ${key}=${after[key]}（期望 ${want}）`); }
  }
  return { ok, detail: `首批=${JSON.stringify(cells)} · 换目录后=${JSON.stringify(after)}${notes.length ? ' | ' + notes.join(' ; ') : ''}` };
}
async function judgeConstants(make) {
  const { kit } = makeKit({ dirRef: { value: freshDir('c') }, factory: make.factory });
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const ok = eq(kit.UPLOAD_EXT, { 'video/mp4': 'mp4', 'image/jpeg': 'jpg', 'image/png': 'png' })
    && eq(kit.CUSTOM_FRAME_EXT, { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })
    && kit.CUSTOM_FRAME_MAX_BYTES === 30 * 1024 * 1024
    && eq(kit.AVATAR_EXT, { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })
    && kit.AVATAR_MAX_BYTES === 8 * 1024 * 1024
    && eq(kit.AVATAR_SIDES, ['user', 'ai']) && kit.WE_ASSETS_SOURCE_ID === 'local';
  return {
    ok,
    detail: `UPLOAD_EXT=${JSON.stringify(kit.UPLOAD_EXT)} FRAME_MAX=${kit.CUSTOM_FRAME_MAX_BYTES} AVATAR_MAX=${kit.AVATAR_MAX_BYTES} SIDES=${JSON.stringify(kit.AVATAR_SIDES)} SOURCE_ID=${kit.WE_ASSETS_SOURCE_ID}`,
  };
}
async function judgeAvatarPicker(make) {
  const dirRef = { value: freshDir('d-av') };
  const { kit } = makeKit({ dirRef, factory: make.factory });
  const adir = kit.avatarDir();
  writeFileSync(join(adir, 'user-ab12.png'), 'x');
  writeFileSync(join(adir, 'ai-cd34.jpg'), 'x');
  writeFileSync(join(adir, 'bogus.png'), 'x');
  writeFileSync(join(adir, 'user-AB12.png'), 'x');       
  writeFileSync(join(adir, 'user-ab.png'), 'x');
  writeFileSync(join(adir, 'user-ab12.gif'), 'x');
  const dirRef2 = { value: freshDir('d-av2') };
  const { kit: kit2 } = makeKit({ dirRef: dirRef2, factory: make.factory });
  writeFileSync(join(kit2.avatarDir(), 'ai-only1.png'), 'x');
  const out = {
    user: kit.avatarPath('user'), ai: kit.avatarPath('ai'), cross: kit2.avatarPath('user'),
    badSide: kit.avatarPath('x'), emptySide: kit.avatarPath(''), undefSide: kit.avatarPath(undefined),
  };
  const ok = out.user === join(adir, 'user-ab12.png') && out.ai === join(adir, 'ai-cd34.jpg')
    && out.cross === null && out.badSide === null && out.emptySide === null && out.undefSide === null;
  return { ok, detail: `user=${out.user} ai=${out.ai} 跨side=${out.cross} 非法side=${out.badSide}/${out.emptySide}/${out.undefSide}` };
}
async function judgeWeResolve(make) {
  const dirRef = { value: freshDir('e-resolve') };
  const mk = (cfg) => makeKit({ dirRef, cfg, factory: make.factory }).kit;
  const envVal = await withEnv('DSH_WE_ASSETS_DIR', '/env/we/', async () => mk({ weAssetsDir: '/cfg/we' }).resolveWeAssetsDir());
  const cfgVal = await withEnv('DSH_WE_ASSETS_DIR', undefined, async () => mk({ weAssetsDir: '  /cfg/we  ' }).resolveWeAssetsDir());
  const none = await withEnv('DSH_WE_ASSETS_DIR', undefined, async () => {
    const k = mk({});
    return { resolved: k.resolveWeAssetsDir(), get: k.getWeAssetsDir() };
  });
  const blankEnv = await withEnv('DSH_WE_ASSETS_DIR', '   ', async () => {
    const k = mk({ weAssetsDir: '/cfg/we' });
    return k.resolveWeAssetsDir();
  });
  const envWant = normalize('/env/we/');
  const cfgWant = normalize('/cfg/we');
  const ok = envVal === envWant && /[\\/]$/.test(envVal)
    && cfgVal === cfgWant && none.resolved === null && none.get === null && blankEnv === cfgWant;
  return { ok, detail: `env='/env/we/'⇒${envVal}（normalize 不剥尾斜杠） · config='  /cfg/we  '⇒${cfgVal} · 都没有⇒${none.resolved} · 纯空白 env⇒${blankEnv}` };
}
async function judgeWeProbe(make) {
  const dirRef = { value: freshDir('e-probe') };
  const probe = await withEnv('DSH_WE_ASSETS_DIR', undefined, async () => {
    const mk = (cfg) => makeKit({ dirRef, cfg, factory: make.factory }).kit;
    const bare = freshDir('e-bare');
    const asFile = freshDir('e-file');
    writeFileSync(join(asFile, 'materials'), 'x');
    const good = freshDir('e-good');
    mkdirSync(join(good, 'materials'), { recursive: true });
    return {
      none: mk({}).weAssetsAvailable(),
      bare: mk({ weAssetsDir: bare }).weAssetsAvailable(),
      asFile: mk({ weAssetsDir: asFile }).weAssetsAvailable(),
      good: mk({ weAssetsDir: good }).weAssetsAvailable(),
    };
  });
  const ok = probe.none === false && probe.bare === false && probe.asFile === false && probe.good === true;
  return { ok, detail: `未配置=${probe.none} 无 materials=${probe.bare} materials 是文件=${probe.asFile} 真目录=${probe.good}` };
}
async function judgeWeSetter(make) {
  const dirRef = { value: freshDir('e-set') };
  const r = await withEnv('DSH_WE_ASSETS_DIR', undefined, async () => {
    const { kit, state } = makeKit({ dirRef, cfg: { keep: 1 }, factory: make.factory });
    const before = kit.getWeAssetsDir();
    const ret1 = await kit.setWeAssetsDir('/we/one');
    const get1 = kit.getWeAssetsDir();
    const cfg1 = JSON.parse(JSON.stringify(state.cfg));
    const ret2 = await kit.setWeAssetsDir(null);
    const get2 = kit.getWeAssetsDir();
    const cfg2 = JSON.parse(JSON.stringify(state.cfg));
    const realDir = freshDir('e-set-real');
    mkdirSync(join(realDir, 'materials'), { recursive: true });
    writeFileSync(join(realDir, 'materials', 'x.tex'), 'x');
    const retReal = await kit.setWeAssetsDir(realDir);
    const availReal = kit.weAssetsAvailable();
    const retClear = await kit.setWeAssetsDir(null);
    const availCleared = kit.weAssetsAvailable();
    const beforeMany = state.queueCalls;
    const many = await Promise.all(Array.from({ length: 20 }, (_, i) => kit.setWeAssetsDir('/we/' + i)));
    const cfgMany = JSON.parse(JSON.stringify(state.cfg));
    return { before, ret1, get1, cfg1, ret2, get2, cfg2, realDir, retReal, availReal, retClear, availCleared, many, cfgMany, queued: state.queueCalls - beforeMany };
  });
  const ok = r.before === null && r.ret1 === '/we/one' && r.get1 === '/we/one'
    && r.cfg1.weAssetsDir === '/we/one' && r.cfg1.keep === 1
    && r.ret2 === null && r.get2 === null && !('weAssetsDir' in r.cfg2) && r.cfg2.keep === 1
    && r.retReal === r.realDir && r.availReal === true && r.retClear === null && r.availCleared === false
    && r.queued === 20 && r.many.every((v, i) => v === '/we/' + i) && r.cfgMany.weAssetsDir === '/we/19';
  return {
    ok,
    detail: `初值=${r.before} set⇒rets=${r.ret1}/${typeof r.ret1 === 'string' ? '' : '(不是字符串！)'} get=${r.get1} cfg=${JSON.stringify(r.cfg1)} | null⇒ret=${JSON.stringify(r.ret2)} get=${r.get2} cfg=${JSON.stringify(r.cfg2)} | 真目录⇒ret 回显=${r.retReal === r.realDir ? 'ok' : JSON.stringify(r.retReal)} 可用=${r.availReal}；清除后可用=${r.availCleared} | 20 路入队=${r.queued} 末值=${r.cfgMany.weAssetsDir}`,
  };
}
async function judgeWeAssetList(make) {
  const dirRef = { value: freshDir('f-set') };
  const tree = freshDir('f-tree');
  mkdirSync(join(tree, 'materials', 'a'), { recursive: true });
  mkdirSync(join(tree, 'materials', 'b'), { recursive: true });
  writeFileSync(join(tree, 'materials', 'a', 'deep.tex'), 'x');
  writeFileSync(join(tree, 'materials', 'a.tex'), 'x');
  writeFileSync(join(tree, 'materials', 'b', 'b1.tex'), 'x');
  writeFileSync(join(tree, 'materials', 'b.tex'), 'x');
  writeFileSync(join(tree, 'materials', 'z.tex'), 'x');
  writeFileSync(join(tree, 'materials', 'ignore.txt'), 'x');
  const expect = ['a', 'a/deep', 'b', 'b/b1', 'z'];
  const raw = [];
  (function walk (d, prefix) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? prefix + '/' + e.name : e.name;
      if (e.isDirectory()) walk(join(d, e.name), rel);
      else if (e.name.toLowerCase().endsWith('.tex')) raw.push(rel.slice(0, -4));
    }
  })(join(tree, 'materials'), '');
  const { kit } = makeKit({ dirRef, factory: make.factory });
  const first = await kit.listWeAssetNames(tree);
  rmSync(join(tree, 'materials'), { recursive: true, force: true });
  const cached = await kit.listWeAssetNames(tree);
  await kit.setWeAssetsDir('/we/other');
  const afterClear = await kit.listWeAssetNames(tree);
  const ok = JSON.stringify(first) === JSON.stringify(expect)
    && JSON.stringify(cached) === JSON.stringify(expect) && afterClear.length === 0;
  return {
    ok,
    detail: `首次=${JSON.stringify(first)}（期望 ${JSON.stringify(expect)}） · 缓存命中=${JSON.stringify(cached)} · 清表后重扫=${JSON.stringify(afterClear)} · 盘上原始顺序=${JSON.stringify(raw)}${JSON.stringify(raw) === JSON.stringify(expect) ? '（⚠ 与排序相同，排序变异体在此机器上没有牙齿）' : ''}`,
  };
}
const M_HOMEDIR = [
  [`import { readdirSync, statSync } from 'node:fs';`,
    `import { readdirSync, statSync } from 'node:fs';\nimport { homedir } from 'node:os';`],
  [`function defaultUploadDir() { return join(pluginDataDir(), 'uploads'); }`,
    `function defaultUploadDir() { return join(homedir(), '.dsh-wallpaper-engine', 'uploads'); }`],
];
const M_UPLOAD_NO_TRIM = [[
  `    if (typeof cfg.uploadDir === 'string' && cfg.uploadDir.trim()) return cfg.uploadDir.trim();`,
  `    if (typeof cfg.uploadDir === 'string' && cfg.uploadDir) return cfg.uploadDir;`,
]];
const M_ENV_IGNORED = [[
  `    if (process.env.DSH_WE_UPLOAD_DIR) return process.env.DSH_WE_UPLOAD_DIR;`,
  `    if (false) return process.env.DSH_WE_UPLOAD_DIR;`,
]];
const M_FRAME_MAX = [[
  `  const CUSTOM_FRAME_MAX_BYTES = 30 * 1024 * 1024;`,
  `  const CUSTOM_FRAME_MAX_BYTES = 31 * 1024 * 1024;`,
]];
const M_AVATAR_NO_PREFIX = [[
  `      if (!AVATAR_FILE_RE.test(name) || name.slice(0, s.length + 1) !== s + '-') continue;`,
  `      if (!AVATAR_FILE_RE.test(name)) continue;`,
]];
const M_PROBE_LOOSE = [[
  `    try { return statSync(join(WE_ASSETS_DIR, 'materials')).isDirectory(); } catch { return false; }`,
  `    try { statSync(join(WE_ASSETS_DIR, 'materials')); return true; } catch { return false; }`,
]];
const M_WE_ENV_IGNORED = [[
  `    if (process.env.DSH_WE_ASSETS_DIR && process.env.DSH_WE_ASSETS_DIR.trim()) {`,
  `    if (false) {`,
]];
const M_SET_NO_DELETE = [[
  `      else delete cfg.weAssetsDir;`,
  `      else cfg.weAssetsDir = dir;`,
]];
const M_SET_NO_QUEUE = [[
  `    return enqueueConfigWrite(() => {`,
  `    return (() => {`,
]];
const M_READDIR_SYNC = [[
  `import { readdir } from 'node:fs/promises';`,
  `import { readdir } from 'node:fs';`,
]];
const M_CACHE_NO_CLEAR = [[`      weAssetsIndexCache.clear();\n`, ``]];
const M_LIST_UNSORTED = [[`    names.sort();\n`, ``]];
section('A. 上传目录三级优先：env > config（trim）> pluginDataDir()/uploads');
await pair('A1 三级各自独立生效、两侧空白都 trim、纯空白 config 回落默认', judgeUploadPriority, 'homedir-default', M_HOMEDIR);
await pair('A2 config 必须 trim 后才用', judgeUploadPriority, 'upload-no-trim', M_UPLOAD_NO_TRIM);
await pair('A3 env 覆盖优先', judgeUploadPriority, 'env-ignored', M_ENV_IGNORED);
section('B. 四条目录都派生自注入的 pluginDataDir()，且调用即建（活访问器跟随换目录）');
await pair('B1 overrides/avatars/live-frames/uploads 全部落在当前数据目录下并已创建', judgeDerivedDirs, 'homedir-default', M_HOMEDIR);
section('C. 三张 MIME 表、三个上限、side 表、素材源 id 与源码逐字一致');
await pair('C1 常量表与上限逐字', judgeConstants, 'custom-frame-max', M_FRAME_MAX);
section('D. 头像按 side 前缀命中、非法 side 一律 null');
await pair('D1 头像：形状/前缀/跨 side/非法 side 四类', judgeAvatarPicker, 'avatar-no-prefix', M_AVATAR_NO_PREFIX);

section('E. WE 素材目录：解析顺序 / materials 探测门 / setter 串行与清字段');
await pair('E1 resolveWeAssetsDir：env（normalize，不剥尾斜杠）> config（trim）> null', judgeWeResolve, 'we-env-ignored', M_WE_ENV_IGNORED);
await pair('E2 探测门：未配置 / 无 materials / materials 是文件 ⇒ false，真目录 ⇒ true', judgeWeProbe, 'probe-loose', M_PROBE_LOOSE);
await pair('E3 setWeAssetsDir：落 config、传 null 删字段、get 立刻反映', judgeWeSetter, 'set-no-delete', M_SET_NO_DELETE);
await pair('E4 setWeAssetsDir 必须走串行队列（20 路并发全部入队、末值胜出）', judgeWeSetter, 'set-no-queue', M_SET_NO_QUEUE);

section('F. 清单：materials/**/*.tex ⇒ posix 相对名去扩展名 + 排序 + 60s 缓存 + setter 清表');
await pair('F1 扫描结果与排序（读目录用异步 API；非 .tex 忽略）', judgeWeAssetList, 'readdir-import', M_READDIR_SYNC);
await pair('F2 60s 缓存命中 + setter 清表后重扫', judgeWeAssetList, 'cache-no-clear', M_CACHE_NO_CLEAR);
await pair('F3 去掉排序 ⇒ 判红', judgeWeAssetList, 'list-unsorted', M_LIST_UNSORTED);
section('G. 自检与覆盖面地板');
check('G1 本文件确实调用了被测模块（不是只 import）',
  stripComments(OWN).includes('createAssetPathsKit('),
  '剥注释后含 createAssetPathsKit(');
check('G2 模块文本（剥注释）不含 homedir( —— 写死家目录会让 DSH_WE_DATA_DIR 隔离失效',
  !stripComments(SOURCE).includes('homedir('),
  `剥注释后含 homedir( = ${stripComments(SOURCE).includes('homedir(')}`);
const CHECK_FLOOR = 18;
const MUTANT_FLOOR = 8;
const totalChecks = stats.passed + stats.failed;
check(`G3 覆盖面地板：执行的判据 ≥ ${CHECK_FLOOR}`, totalChecks >= CHECK_FLOOR, `实测 ${totalChecks}`);
check(`G4 负对照地板：变异体 ≥ ${MUTANT_FLOOR}`, mutants >= MUTANT_FLOOR, `实测 ${mutants}`);
console.log('');
if (stats.failed > 0) {
  console.log(`ASSET-PATHS CHECKS FAILED — ${stats.failed} failed, ${stats.passed} passed`);
  process.exit(1);
}
console.log(`ALL ASSET-PATHS CHECKS PASSED (${stats.passed})`);
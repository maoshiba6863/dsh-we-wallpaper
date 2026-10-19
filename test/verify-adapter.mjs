import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripComments } from './tools/js-text.mjs';
import { styleText, panelText } from './tools/src-scope.mjs';
import { installWeTShim } from './tools/weT-shim.mjs';
installWeTShim();
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const ISO = join(root, '.test-cache', 'adapter');
rmSync(ISO, { recursive: true, force: true });
const TEST_HOME = join(ISO, 'home');
mkdirSync(TEST_HOME, { recursive: true });
mkdirSync(join(ISO, 'data'), { recursive: true });
mkdirSync(join(ISO, 'uploads'), { recursive: true });
process.env.DSH_WE_CACHE_DIR = join(ISO, 'cache');
process.env.DSH_WE_UPLOAD_DIR = join(ISO, 'uploads');
process.env.DSH_WE_DATA_DIR = join(ISO, 'data');
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;
const steamRoot = join(ISO, 'steamlib');
const webDir = join(steamRoot, 'steamapps', 'workshop', 'content', '431960', '990003');
mkdirSync(webDir, { recursive: true });
mkdirSync(join(steamRoot, 'steamapps', 'common', 'wallpaper_engine'), { recursive: true });
writeFileSync(join(webDir, 'project.json'), JSON.stringify({
  title: 'Adapter Web Fixture', type: 'web', file: 'index.html', preview: 'preview.jpg',
  contentrating: 'Everyone',
}));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><html><body>adapter</body></html>');
writeFileSync(join(webDir, 'preview.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
process.env.DSH_WE_STEAM_ROOT = steamRoot;
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) console.log('  ✓ ' + name + (detail ? ' — ' + detail : ''));
  else { console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); failed++; }
};
const EXPECTED = ['auto', 'browser', 'desktop-community', 'desktop-official'];
const sameTable = (v) => Array.isArray(v) && v.length === EXPECTED.length
  && EXPECTED.every((x, i) => v[i] === x);
console.log('\n① schema：值表 / 默认值 / enum 接线');
const schemaMod = await import(pathToFileURL(join(root, 'lib', 'settings-schema.js')).href);
check('ADAPTER_TARGET_VALUES 四字面量且顺序固定', sameTable(schemaMod.ADAPTER_TARGET_VALUES),
  JSON.stringify(schemaMod.ADAPTER_TARGET_VALUES));
check('默认 auto + KINDS enum 接到同一张表',
  schemaMod.DEFAULTS.adapterTarget === 'auto' && schemaMod.KINDS.adapterTarget
  && schemaMod.KINDS.adapterTarget.kind === 'enum' && sameTable(schemaMod.KINDS.adapterTarget.values),
  'kind=' + (schemaMod.KINDS.adapterTarget && schemaMod.KINDS.adapterTarget.kind));
check('缺键两侧都读作 auto（手选才生效的前提）',
  schemaMod.sanitizeFromSchema({}, 'client').adapterTarget === 'auto'
  && schemaMod.sanitizeFromSchema({}, 'host').adapterTarget === 'auto');
check('越界值回落 auto（enum 白名单真的有牙）',
  schemaMod.sanitizeFromSchema({ adapterTarget: 'chrome' }, 'client').adapterTarget === 'auto');
check('手选值原样通过（非 auto 的三档不被消毒吃掉）',
  schemaMod.sanitizeFromSchema({ adapterTarget: 'desktop-community' }, 'host').adapterTarget === 'desktop-community');
check('负对照：值表改一个字 ⇒ 判据变假',
  sameTable(['auto', 'browser', 'desktop-community', 'desktop-officialx']) === false
  && sameTable(EXPECTED.slice(1)) === false);
check('正对照：判据对真表为真（不是恒假）', sameTable(EXPECTED) === true);
console.log('\n② 客户端判定：手选 > 宿主上报 > 本地信号');
globalThis.ADAPTER_TARGET_VALUES = schemaMod.ADAPTER_TARGET_VALUES;
let importSeq = 0;
async function freshAdapter({ picked = 'auto', host = null, search = '', ua = 'Mozilla/5.0 (Macintosh)' } = {}) {
  globalThis.selection = { adapterTarget: picked };
  Object.defineProperty(globalThis, 'location', { value: { search }, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'document', {
    value: { querySelector: () => null, body: { hasAttribute: () => false } },
    configurable: true, writable: true,
  });
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: ua }, configurable: true, writable: true });
  const mod = await import(pathToFileURL(join(root, 'src', 'adapter.js')).href + '?case=' + (++importSeq));
  if (host) mod.setAdapterFromHost(host);
  return mod;
}
{
  const m = await freshAdapter();
  check('标签表与值表逐键对齐（面板下拉不会出现漏项）',
    sameTable(Object.keys(m.ADAPTER_LABELS)) && EXPECTED.every((k) => typeof m.ADAPTER_LABELS[k] === 'string'
      && m.ADAPTER_LABELS[k].length > 0),
    Object.keys(m.ADAPTER_LABELS).join(','));
  check('无上报 + 无信号 ⇒ 判浏览器（保守初值）', m.resolveAdapterTarget() === 'browser',
    m.resolveAdapterTarget());
}
{
  const m = await freshAdapter({ host: { detected: 'desktop-community', fence: true } });
  check('宿主上报生效（能力头 → 非官方桌面端）', m.resolveAdapterTarget() === 'desktop-community',
    m.resolveAdapterTarget());
  check('能力矩阵：fence=true 且是桌面 ⇒ 失焦档不适用',
    m.adapterCaps().fence === true && m.adapterCaps().desktop === true && m.adapterCaps().blurPause === false);
  check('状态行读到栅栏', /非官方桌面端/.test(m.adapterDetectedLabel()), m.adapterDetectedLabel());
}
{
  const m = await freshAdapter({ picked: 'browser', host: { detected: 'desktop-community', fence: true } });
  check('手选优先于宿主上报', m.resolveAdapterTarget() === 'browser', m.resolveAdapterTarget());
  check('手选浏览器 + 观测到栅栏 ⇒ 给出可执行警示（403）',
    /403/.test(m.adapterMismatchWarning()), m.adapterMismatchWarning());
}
{
  const m = await freshAdapter({ picked: 'desktop-official', host: { detected: 'browser', fence: false } });
  check('手选优先于"观测到浏览器"（反方向同样成立）',
    m.resolveAdapterTarget() === 'desktop-official', m.resolveAdapterTarget());
  check('手选 ≠ 检测 ⇒ 有一句不一致提示', m.adapterMismatchWarning().length > 0, m.adapterMismatchWarning());
}
{
  const m = await freshAdapter({ search: '?dsh-desktop-mode=extended' });
  check('本地信号：壳层查询参数 ⇒ 判桌面（拿不到上报时的兜底）',
    m.resolveAdapterTarget() === 'desktop-official', m.resolveAdapterTarget());
}
{
  const m = await freshAdapter({ ua: 'Mozilla/5.0 Electron/33.2.0' });
  check('本地信号：UA 带 Electron/ ⇒ 判桌面', m.resolveAdapterTarget() === 'desktop-official',
    m.resolveAdapterTarget());
}
{
  const m = await freshAdapter({ picked: 'not-a-target' });
  check('手选值不在表内 ⇒ 当作 auto（回落判定链）',
    m.resolveAdapterTarget() === 'browser', m.resolveAdapterTarget());
}
{
  const m = await freshAdapter();
  m.setAdapterFromHost(undefined);
  m.setAdapterFromHost('nonsense');
  check('宿主没给 adapter 字段时不抛、保持本地判定', m.resolveAdapterTarget() === 'browser');
}
{
  const m = await freshAdapter({ picked: 'browser', host: { detected: 'desktop-official', fence: true } });
  const pickedWins = m.resolveAdapterTarget() === 'browser';
  const hostWins = m.resolveAdapterTarget() === 'desktop-official';
  check('负对照：同一条优先级判据在颠倒实现下会判出差别',
    pickedWins === true && hostWins === false);
}
console.log('\n③④ 宿主判定表与媒体源条件启动（打真路由）');
const hostMod = await import(pathToFileURL(join(root, 'lib', 'index.js')).href);
const host = hostMod.default || hostMod;
const apply = host.apply || (host.inject && host.apply);
function fakeReq(url, headers) {
  return { url, headers: headers || {}, method: 'GET' };
}
function fakeRes() {
  const state = { status: 200, headers: {}, body: Buffer.alloc(0), ended: false };
  const res = new Writable({
    write(chunk, enc, cb) {
      state.body = Buffer.concat([state.body, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]); cb();
    },
    final(cb) { state.ended = true; cb(); },
  });
  res.setHeader = (k, v) => { state.headers[k] = v; };
  res.writeHead = (s, h) => { state.status = s; if (h) Object.assign(state.headers, h); };
  Object.defineProperty(res, 'statusCode', { get: () => state.status, set: (v) => { state.status = v; } });
  res.on('finish', () => {});
  res.__state = state;
  return res;
}
async function runHandler(route, url, headers) {
  const res = fakeRes();
  const done = route.handler(fakeReq(url, headers), res);
  if (done && typeof done.then === 'function') await done;
  if (!res.__state.ended) {
    await new Promise((r) => {
      const t = setTimeout(r, 8000);
      res.on('finish', () => { clearTimeout(t); r(); });
    });
  }
  return res;
}
function freshApply() {
  const routes = [];
  const dispose = apply({
    webServer: {
      register(route) { routes.push(route); return () => {}; },
      tapIndex() { return () => {}; },
    },
  });
  return { routes, dispose, find: (p) => routes.find((r) => r.path === p) };
}
const FENCE = { 'x-dsh-desktop-renderer': '1', 'user-agent': 'Electron/33.2.0' };
const ELECTRON_ONLY = { 'user-agent': 'Electron/33.2.0' };
const CONFIG_PATH = join(ISO, 'data', 'config.json');
const writeAdapterSetting = (value) => {
  mkdirSync(join(ISO, 'data'), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify({ settings: { adapterTarget: value } }));
};
const clearAdapterSetting = () => { writeFileSync(CONFIG_PATH, JSON.stringify({})); };
const settingsAdapter = async (app, headers) => {
  const route = app.find('/wallpaper-engine/settings');
  if (!route) return null;
  const res = await runHandler(route, '/wallpaper-engine/settings', headers);
  try { return JSON.parse(res.__state.body.toString('utf8')).adapter || null; } catch { return null; }
};
const inventoryWebSrc = async (app, headers) => {
  const route = app.find('/wallpaper-engine/inventory');
  if (!route) return null;
  const res = await runHandler(route, '/wallpaper-engine/inventory', headers);
  try {
    const body = JSON.parse(res.__state.body.toString('utf8'));
    const web = (body.wallpapers || []).find((w) => w.id === '990003') || null;
    return web ? String(web.webLiveSrc || '') : null;
  } catch { return null; }
};
clearAdapterSetting();
{
  const app = freshApply();
  const a = await settingsAdapter(app, FENCE);
  check('能力头 ⇒ detected=desktop-community（栅栏属于社区壳）',
    a && a.detected === 'desktop-community' && a.fence === true, JSON.stringify(a));
  const src = await inventoryWebSrc(app, FENCE);
  check('有栅栏 ⇒ 网页壁纸载荷是媒体源绝对 URL（事故闸门）',
    /^http:\/\/127\.0\.0\.1:\d+\/wallpaper-engine\/scene-files\//.test(String(src)), String(src).slice(0, 70));
  app.dispose();
}
{
  const app = freshApply();
  const a = await settingsAdapter(app, ELECTRON_ONLY);
  check('无能力头 + Electron UA ⇒ detected=desktop-official（栅栏 false）',
    a && a.detected === 'desktop-official' && a.fence === false, JSON.stringify(a));
  const src = await inventoryWebSrc(app, ELECTRON_ONLY);
  check('桌面壳（无栅栏）⇒ 仍走媒体源（安全默认，不因判官民而改）',
    /^http:\/\/127\.0\.0\.1:\d+\/wallpaper-engine\/scene-files\//.test(String(src)), String(src).slice(0, 70));
  app.dispose();
}
{
  const app = freshApply();
  const a = await settingsAdapter(app, {});
  check('裸请求（无头无 Electron）⇒ detected=browser',
    a && a.detected === 'browser' && a.fence === false, JSON.stringify(a));
  const src = await inventoryWebSrc(app, {});
  check('浏览器形态 ⇒ 载荷走应用源相对路径（不起第二个监听）',
    /^\/wallpaper-engine\/scene-files\//.test(String(src)) && !/^http/.test(String(src)),
    String(src).slice(0, 70));
  app.dispose();
}
{
  const app = freshApply();
  await settingsAdapter(app, ELECTRON_ONLY);
  const a = await settingsAdapter(app, {});
  check('闩锁：桌面一旦判明，后续裸请求不回退成浏览器',
    a && a.detected === 'desktop-official', JSON.stringify(a));
  app.dispose();
}
{
  const app = freshApply();
  const a = await settingsAdapter(app, FENCE);
  check('能力头优先于 Electron UA（两条同时在 ⇒ 社区端）',
    a && a.detected === 'desktop-community', JSON.stringify(a));
  app.dispose();
}
{
  writeAdapterSetting('browser');
  const app = freshApply();
  const a = await settingsAdapter(app, FENCE);
  check('手选浏览器：adapter.target 取手选值（detected 仍是观测值）',
    a && a.target === 'browser' && a.detected === 'desktop-community', JSON.stringify(a));
  const src = await inventoryWebSrc(app, FENCE);
  check('手选浏览器 ⇒ 强制应用源（逃生口真的生效）',
    /^\/wallpaper-engine\/scene-files\//.test(String(src)), String(src).slice(0, 70));
  app.dispose();
}
{
  writeAdapterSetting('desktop-community');
  const app = freshApply();
  const a = await settingsAdapter(app, {});
  check('手选非官方桌面端：裸请求下 target 仍取手选值',
    a && a.target === 'desktop-community' && a.detected === 'browser', JSON.stringify(a));
  const src = await inventoryWebSrc(app, {});
  check('手选桌面 ⇒ 裸请求也强制媒体源绝对 URL',
    /^http:\/\/127\.0\.0\.1:\d+\/wallpaper-engine\/scene-files\//.test(String(src)),
    String(src).slice(0, 70));
  app.dispose();
}
clearAdapterSetting();
console.log('\n⑤ 客户端落点：body 钩子 / 外壳选择器门控 / 面板行 / 上报');
const effectsSrc = read('src/effects.js');
const stylesSrc = styleText();
const tabsSrc = panelText();
const clientSrc = read('src/client.js');
const persistSrc = read('src/persistence.js');
const adapterSrc = read('src/adapter.js');
function shellSelectorLines(s) {
  return stripComments(s.replace(/`/g, ' ')).split('\n').filter((l) => /data-dsh-desktop-mode=|data-we-mica=/.test(l));
}
const gated = (lines) => lines.length > 0 && lines.every((l) => l.includes('[data-we-adapter^="desktop-"]'));
check('body 钩子成对挂摘（applyEffects 挂 / clearEffects 摘）',
  /setAttribute\("data-we-adapter"/.test(effectsSrc) && /removeAttribute\("data-we-adapter"\)/.test(effectsSrc));
const shellLines = shellSelectorLines(stylesSrc);
check('外壳材质选择器全部带 [data-we-adapter^="desktop-"] 门控', gated(shellLines),
  shellLines.length + ' 行 · 未门控 ' + shellLines.filter((l) => !l.includes('[data-we-adapter^="desktop-"]')).length);
check('覆盖面：扫到的壳层选择器非空（防空表恒真）', shellLines.length >= 3, shellLines.length + ' 行');
check('负对照：去掉门控的合成选择器 ⇒ 同一条判据变假',
  gated(shellLines.map((l) => l.replace('[data-we-adapter^="desktop-"]', ''))) === false);
check('正对照：门控齐全的真表 ⇒ 判据为真', gated(shellLines) === true);
check('面板有「适配」段：下拉 + 检测行 + 不一致警示',
  tabsSrc.includes('ADAPTER_TARGET_VALUES.map(')
  && tabsSrc.includes('adapterDetectedLabel()') && tabsSrc.includes('adapterMismatchWarning()'));
check('状态行三分支齐全（栅栏 / 无栅栏桌面 / 浏览器），与宿主裁决对齐',
  /target:\s*weT\(adapterDetectedLabel\(\)\)[\s\S]{0,400}?\?[\s\S]{0,80}?weT\([\s\S]{0,200}?\?[\s\S]{0,80}?weT\([\s\S]{0,120}?:\s*weT\(/.test(stripComments(tabsSrc)),
  'status-line ternary has 3 weT branches');
check('失焦档按能力矩阵显隐（面板行被 blurPause 门控）',
  /blurPause\s*&&\s*switchRow\(\s*weT\("窗口失焦时暂停"\)/.test(stripComments(tabsSrc)),
  'panel blur gate');
check('渲染层：occlusion 的失焦档也走能力矩阵（面板隐藏 + 判定跳过两腿都在）',
  clientSrc.includes('adapterCaps().blurPause && selection.pauseOnBlur'));
check('persistence 把宿主上报交给 adapter（缺字段不抛）',
  persistSrc.includes('setAdapterFromHost(data && data.adapter)'));
check('判定优先级写在 resolveAdapterTarget 里（手选先返回）',
  /function resolveAdapterTarget\(\) \{[\s\S]{0,200}if \(picked !== 'auto'\) return picked;/.test(adapterSrc));
check('适配目标已注册进内联清单（否则永远不进产物）',
  read('scripts/build-client.mjs').includes("file: 'src/adapter.js'"));
console.log('\n' + (failed ? 'ADAPTER CHECKS FAILED — ' + failed + ' failed' : 'ALL ADAPTER CHECKS PASSED'));
process.exit(failed ? 1 : 0);
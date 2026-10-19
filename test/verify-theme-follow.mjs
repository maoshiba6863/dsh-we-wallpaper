import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripComments } from './tools/js-text.mjs';
import { installWeTShim } from './tools/weT-shim.mjs';
import { panelText, liveText } from './tools/src-scope.mjs';
installWeTShim();
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) console.log('  ✓ ' + name + (detail ? ' — ' + detail : ''));
  else { console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); failed++; }
};
globalThis.ADAPTER_TARGET_VALUES = [];
let diagTraces = [];
let transientWrites = {};
let importSeq = 0;
async function freshThemeFollow({ selection: sel, props = {}, themeFollow = true } = {}) {
  diagTraces = [];
  globalThis.reportClientDiag = (ev, detail) => { diagTraces.push(ev + ':' + String(detail)); };
  transientWrites = {};
  globalThis.setTransient = (field, value) => { transientWrites[field] = value; };
  globalThis.selection = Object.assign({ themeFollow }, sel || { id: "", schemeColor: null, previewUrl: "" });
  globalThis.propTokenOf = (s) => (s && s.propsUrl ? String(s.propsUrl).split("/").pop() : "");
  globalThis.storedUserPropsOf = (token) => (props[token] ? { ...props[token] } : {});
  return import(pathToFileURL(join(root, 'src', 'theme-follow.js')).href + '?case=' + (++importSeq));
}
function makeFake(preference) {
  const calls = [];
  const handlers = [];
  const svc = {
    preference,
    getTheme() { return { preference: svc.preference }; },
    setTheme(v) { calls.push(v); svc.preference = v; },
  };
  const ctx = { on(ev, cb) { handlers.push([ev, cb]); return () => {}; } };
  return { svc, ctx, calls, handlers };
}
function wallpaper(id, schemeColor, extra) {
  return Object.assign({ id, schemeColor, previewUrl: "", propsUrl: "" }, extra || {});
}
function onWallpaper(m, sel) {
  globalThis.selection = Object.assign({}, globalThis.selection, {
    id: sel.id, schemeColor: sel.schemeColor, previewUrl: sel.previewUrl || "", propsUrl: sel.propsUrl || "",
  });
  m.themeFollowOnWallpaper(globalThis.selection);
  return sel;
}
console.log('\n① 颜色解析与 WCAG 亮度判决');
{
  const m = await freshThemeFollow();
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check('宿主写法 rgb(r, g, b) 可解析', eq(m.themeFollowParseColor('rgb(29, 56, 84)'), [29, 56, 84]),
    JSON.stringify(m.themeFollowParseColor('rgb(29, 56, 84)')));
  check('CSS 写法 #rrggbb / #rgb 可解析',
    eq(m.themeFollowParseColor('#1d3854'), [29, 56, 84]) && eq(m.themeFollowParseColor('#fff'), [255, 255, 255]));
  check('WE 属性的 0–1 浮点三元组可解析（面板覆盖值走这条）',
    eq(m.themeFollowParseColor('0.114 0.220 0.329'), [29, 56, 84]),
    JSON.stringify(m.themeFollowParseColor('0.114 0.220 0.329')));
  check('越界值被夹住、而不是溢出（0–1 域与 0–255 域各一条）',
    eq(m.themeFollowParseColor('300 -5 128'), [255, 0, 128])
    && eq(m.themeFollowParseColor('-0.2 0.5 0.9'), [0, 128, 230]),
    JSON.stringify(m.themeFollowParseColor('300 -5 128')) + ' / ' + JSON.stringify(m.themeFollowParseColor('-0.2 0.5 0.9')));
  check('混合域按 0–255 解释（规则显式写死在判据里）',
    eq(m.themeFollowParseColor('1.5 0.5 0.5'), [2, 1, 1]),
    JSON.stringify(m.themeFollowParseColor('1.5 0.5 0.5')));
  check('认不得的形状 ⇒ null（不猜）',
    m.themeFollowParseColor('not-a-color') === null && m.themeFollowParseColor('') === null
    && m.themeFollowParseColor(null) === null && m.themeFollowParseColor('1 2') === null);
  check('负对照：同一条解析判据对坏输入返回 null',
    m.themeFollowParseColor('rgb(29, 56)') === null && m.themeFollowParseColor('#1d385') === null);
  const lumBlack = m.themeFollowLuminance([0, 0, 0]);
  const lumWhite = m.themeFollowLuminance([255, 255, 255]);
  const lumMid = m.themeFollowLuminance([128, 128, 128]);
  check('亮度极值：黑 = 0、白 = 1', lumBlack === 0 && Math.abs(lumWhite - 1) < 1e-9,
    'black=' + lumBlack + ' white=' + lumWhite.toFixed(6));
  check('阈值是 0.40 —— "明显偏亮才浅色"（不再等于中灰）',
    m.THEME_FOLLOW_LIGHT_ABOVE === 0.4 && lumMid < m.THEME_FOLLOW_LIGHT_ABOVE,
    'mid=' + lumMid.toFixed(4) + ' threshold=' + m.THEME_FOLLOW_LIGHT_ABOVE);
  check('颜色规则本身不变：纯黑仍判深色（"没填"是取色链的事，不是判决的事）',
    m.themeFollowVerdict(m.themeFollowParseColor('0 0 0')) === 'dark');
  check('恰好 (0,0,0) 被判为「作者没填」（WE 新建工程的默认值）',
    m.themeFollowIsUnfilledSchemeColor([0, 0, 0]) === true
    && m.themeFollowIsUnfilledSchemeColor([0, 0, 1]) === false
    && m.themeFollowIsUnfilledSchemeColor([1, 0, 0]) === false
    && m.themeFollowIsUnfilledSchemeColor([255, 255, 255]) === false
    && m.themeFollowIsUnfilledSchemeColor(null) === false);
  check('深色方案色（0.114 0.220 0.329）⇒ 深色主题',
    m.themeFollowVerdict(m.themeFollowParseColor('0.114 0.220 0.329')) === 'dark');
  check('浅色方案色（Frieren 那张 0.619… 0.765… 0.910…）⇒ 浅色主题',
    m.themeFollowVerdict(m.themeFollowParseColor('0.6196078431372549 0.7647058823529411 0.9098039215686274')) === 'light');
  check('阈值两侧的判决（灰 169 = 深色，灰 170 = 浅色 —— 边界就在 0.40 上）',
    m.themeFollowVerdict([169, 169, 169]) === 'dark' && m.themeFollowVerdict([170, 170, 170]) === 'light',
    '169=' + m.themeFollowVerdict([169, 169, 169]) + ' 170=' + m.themeFollowVerdict([170, 170, 170]));
  check('报过的两张壁纸在新门槛下都判深色（#00918A 与 88/168/88 的绿）',
    m.themeFollowVerdict([0, 145, 138]) === 'dark' && m.themeFollowVerdict([88, 168, 88]) === 'dark',
    'teal=' + m.themeFollowVerdict([0, 145, 138]) + ' green=' + m.themeFollowVerdict([88, 168, 88]));
  check('没有颜色 ⇒ 空判决（调用方据此"保持当前主题"）',
    m.themeFollowVerdict(null) === '' && m.themeFollowVerdict([1, 2]) === '');
}
console.log('\n② 画面占比最大色（纯函数，供守卫直测）');
{
  const m = await freshThemeFollow();
  const px = (list) => {
    const b = Buffer.alloc(list.length * 4);
    list.forEach(([r, g, b2, a], i) => { b[i * 4] = r; b[i * 4 + 1] = g; b[i * 4 + 2] = b2; b[i * 4 + 3] = a === undefined ? 255 : a; });
    return b;
  };
  const mostlyRed = px([[255, 0, 0], [255, 0, 0], [255, 0, 0], [0, 0, 255]]);
  check('多数派胜出（3 红 1 蓝 ⇒ 红桶中心）',
    JSON.stringify(m.themeFollowModeColorOf(mostlyRed, 2, 2)) === JSON.stringify([248, 8, 8]),
    JSON.stringify(m.themeFollowModeColorOf(mostlyRed, 2, 2)));
  check('透明像素不参与（全透明 ⇒ null）',
    m.themeFollowModeColorOf(px([[255, 0, 0, 0], [255, 0, 0, 0]]), 2, 1) === null);
  check('半透明像素参与（alpha = 128 算在场）',
    JSON.stringify(m.themeFollowModeColorOf(px([[255, 0, 0, 128]]), 1, 1)) === JSON.stringify([248, 8, 8]));
  check('空输入 ⇒ null（不抛）',
    m.themeFollowModeColorOf(null, 0, 0) === null && m.themeFollowModeColorOf(Buffer.alloc(0), 1, 1) === null);
  check('负对照：同一判据把整图改透明后返回 null',
    m.themeFollowModeColorOf(mostlyRed, 2, 2) !== null
    && m.themeFollowModeColorOf(px([[255, 0, 0, 0], [255, 0, 0, 0], [255, 0, 0, 0], [0, 0, 255, 0]]), 2, 2) === null);
  const det = JSON.stringify(m.themeFollowModeColorOf(mostlyRed, 2, 2));
  check('确定性：同一张图两次得到同一个答案',
    det === JSON.stringify(m.themeFollowModeColorOf(mostlyRed, 2, 2)));
}
console.log('\n③ 行为：写入口的三条自我约束');
{
  {
    const m = await freshThemeFollow();
    const f = makeFake('light');
    m.themeFollowAttach(f.svc, f.ctx);
    m.themeFollowOnWallpaper(wallpaper('w1', 'rgb(4, 6, 10)'));
    check('作者配色 ⇒ 写入对应主题（深色方案写 dark）',
      JSON.stringify(f.calls) === JSON.stringify(['dark']), JSON.stringify(f.calls));
  }  {
    const m = await freshThemeFollow();
    const f = makeFake('dark');
    m.themeFollowAttach(f.svc, f.ctx);
    m.themeFollowOnWallpaper(wallpaper('w1', 'rgb(4, 6, 10)'));
    m.themeFollowOnWallpaper(wallpaper('w2', 'rgb(4, 6, 10)'));
    check('结论与当前偏好相同 ⇒ 一次都不写（轮换不写盘）',
      f.calls.length === 0, 'calls=' + JSON.stringify(f.calls));
  }
  {
    const m = await freshThemeFollow();
    const f = makeFake('light');
    m.themeFollowAttach(f.svc, f.ctx);
    m.themeFollowOnWallpaper(wallpaper('w1', 'rgb(4, 6, 10)'));
    const before = f.calls.length;
    f.svc.preference = 'light';
    for (const [ev, cb] of f.handlers) if (ev === 'theme/change') cb();
    m.themeFollowOnWallpaper(wallpaper('w1', 'rgb(4, 6, 10)'));
    check('让位后不再插手（同一张壁纸再评估也被拦下）', f.calls.length === before,
      'before=' + before + ' after=' + f.calls.length);
    m.themeFollowOnWallpaper(wallpaper('w2', 'rgb(4, 6, 10)'));
    check('换下一张壁纸才恢复自动', f.calls.length === before + 1,
      'calls=' + JSON.stringify(f.calls));
  }
  {
    const m = await freshThemeFollow({ props: { tok: { schemecolor: '0.9 0.9 0.9' } } });
    const f = makeFake('dark');
    m.themeFollowAttach(f.svc, f.ctx);
    m.themeFollowOnWallpaper(wallpaper('w1', 'rgb(0, 0, 0)', { propsUrl: '/wallpaper-engine/props/tok' }));
    check('面板覆盖值优先于作者值（覆盖成浅色 ⇒ 写 light）',
      JSON.stringify(f.calls) === JSON.stringify(['light']), JSON.stringify(f.calls));
  }
  {
    const m = await freshThemeFollow();
    const f = makeFake('light');
    m.themeFollowOnWallpaper(wallpaper('w1', 'rgb(4, 6, 10)'));
    check('服务还没就绪时不抛、也不写', f.calls.length === 0);
    m.themeFollowAttach(null, null);
    m.themeFollowAttach({}, null);
    check('形状不对的服务被拒绝（不误当可用）', f.calls.length === 0);
  }
  {
    const m = await freshThemeFollow();
    const f = makeFake('light');
    m.themeFollowAttach(f.svc, f.ctx);
    m.themeFollowOnWallpaper(wallpaper('w1', null, { previewUrl: '' }));
    check('两条取色都拿不到 ⇒ 保持当前主题（一个字节都不写）', f.calls.length === 0);
  }
  {
    const naiveCalls = async () => {
      const f = makeFake('dark');
      const apply = () => { f.svc.setTheme('dark'); };
      apply(); apply();
      return f.calls.slice();
    };
    const dedupedCalls = async () => {
      const m = await freshThemeFollow();
      const f = makeFake('dark');
      m.themeFollowAttach(f.svc, f.ctx);
      m.themeFollowOnWallpaper(wallpaper('w1', 'rgb(4, 6, 10)'));
      m.themeFollowOnWallpaper(wallpaper('w2', 'rgb(4, 6, 10)'));
      return f.calls.slice();
    };
    const deduped = await dedupedCalls();
    const naive = await naiveCalls();
    check('负对照：同一条判据（同判决不重复写）能区分"去重"与"每次都写"',
      deduped.length === 0 && naive.length > 0,
      '去重实现 calls=' + JSON.stringify(deduped) + ' · 不去重实现 calls=' + JSON.stringify(naive));
  }
}
console.log('\n④ 恰好 0 0 0 的作者值视作没填 ⇒ 退回画面主色');
{
  const m = await freshThemeFollow();
  check('作者值恰好纯黑 ⇒ 取色链返回"没有配色"（交给画面主色）',
    m.themeFollowSchemeColorOf({ schemeColor: 'rgb(0, 0, 0)', propsUrl: '' }) === null);
  check('作者值不是纯黑 ⇒ 照用（差一个分量也算填了）',
    JSON.stringify(m.themeFollowSchemeColorOf({ schemeColor: 'rgb(0, 0, 1)', propsUrl: '' })) === JSON.stringify([0, 0, 1])
    && JSON.stringify(m.themeFollowSchemeColorOf({ schemeColor: 'rgb(1, 0, 0)', propsUrl: '' })) === JSON.stringify([1, 0, 0]));
  check('作者值纯白照用（规则只管纯黑）',
    JSON.stringify(m.themeFollowSchemeColorOf({ schemeColor: 'rgb(255, 255, 255)', propsUrl: '' })) === JSON.stringify([255, 255, 255]));
}
{
  const m = await freshThemeFollow({ props: { tok: { schemecolor: '0 0 0' } } });
  check('面板里显式填的纯黑照用（明确意图 ≠ 默认值）',
    JSON.stringify(m.themeFollowSchemeColorOf(
      { schemeColor: 'rgb(0, 0, 0)', propsUrl: '/wallpaper-engine/props/tok' })) === JSON.stringify([0, 0, 0]));
}
{
  const m = await freshThemeFollow();
  const f = makeFake('light');
  m.themeFollowAttach(f.svc, f.ctx);
  m.themeFollowOnWallpaper({ id: 'w1', schemeColor: 'rgb(0, 0, 0)', previewUrl: '', propsUrl: '' });
  check('作者纯黑 + 无图可采样 ⇒ 一个字节都不写（不反手写深色）',
    f.calls.length === 0, JSON.stringify(f.calls));
}
console.log('\n⑤ 两条腿合议：真实帧与预览图不一致时取深色，都说是浅色才浅色');
{
  const m = await freshThemeFollow();
  const f = makeFake('light');
  m.themeFollowAttach(f.svc, f.ctx);
  onWallpaper(m, wallpaper('w1', null));
  m.themeFollowAcceptImageVerdict([40, 45, 50], 1);
  check('预览图结果被采纳（只有一条腿 ⇒ 按它走，写 dark）',
    JSON.stringify(f.calls) === JSON.stringify(['dark']), JSON.stringify(f.calls));
  m.themeFollowAcceptImageVerdict([240, 240, 240], 2);
  check('两条腿不一致 ⇒ 取深色（真实帧不再单方面反转结论）',
    JSON.stringify(f.calls) === JSON.stringify(['dark']), JSON.stringify(f.calls));
  check('不一致这件事留下了痕迹（诊断 + 面板瞬态状态行）',
    diagTraces.length > 0 && String(transientWrites.themeFollowLine || '').trim().length > 0,
    (diagTraces.slice(-1)[0] || '(无)') + ' || ' + String(transientWrites.themeFollowLine || ''));
  m.themeFollowAcceptImageVerdict([40, 45, 50], 1);
  check('迟到的预览图结果不再回头改（rank 1 ≤ 已采纳的 2）',
    f.calls.length === 1, JSON.stringify(f.calls));
}
{
  const m = await freshThemeFollow();
  const f = makeFake('dark');
  m.themeFollowAttach(f.svc, f.ctx);
  onWallpaper(m, wallpaper('w2', null));
  m.themeFollowAcceptImageVerdict([240, 240, 240], 1);
  m.themeFollowAcceptImageVerdict([250, 250, 250], 2);
  check('两条腿都说是浅色 ⇒ 写 light',
    JSON.stringify(f.calls) === JSON.stringify(['light']), JSON.stringify(f.calls));
}
{
  const m = await freshThemeFollow();
  const f = makeFake('dark');
  m.themeFollowAttach(f.svc, f.ctx);
  onWallpaper(m, wallpaper('w3', null));
  m.themeFollowAcceptImageVerdict([240, 240, 240], 2);
  check('只有真实帧一条腿时说浅色也认（唯一证据）',
    JSON.stringify(f.calls) === JSON.stringify(['light']), JSON.stringify(f.calls));
}
{
  const m = await freshThemeFollow();
  const f = makeFake('light');
  m.themeFollowAttach(f.svc, f.ctx);
  onWallpaper(m, wallpaper('w4', 'rgb(10, 12, 16)'));
  const before = f.calls.length;
  m.themeFollowAcceptImageVerdict([240, 240, 240], 2);
  check('作者配色在场 ⇒ 两条腿都不参与（作者说了算）',
    f.calls.length === before, 'calls=' + JSON.stringify(f.calls));
}
{
  const m = await freshThemeFollow();
  const f = makeFake('dark');
  m.themeFollowAttach(f.svc, f.ctx);
  onWallpaper(m, wallpaper('w5', null));
  m.themeFollowAcceptImageVerdict([240, 240, 240], 2);
  onWallpaper(m, wallpaper('w6', null));
  m.themeFollowAcceptImageVerdict([40, 45, 50], 1);
  check('换壁纸后合议状态清零（新壁纸的预览图结论照常生效）',
    JSON.stringify(f.calls) === JSON.stringify(['light', 'dark']), JSON.stringify(f.calls));
}
{
  const m = await freshThemeFollow();
  const f = makeFake('light');
  m.themeFollowAttach(f.svc, f.ctx);
  onWallpaper(m, wallpaper('w7', null));
  const px = Buffer.alloc(4 * 4);
  for (let i = 0; i < 4; i++) { px[i * 4] = 30; px[i * 4 + 1] = 30; px[i * 4 + 2] = 30; px[i * 4 + 3] = 255; }
  const prevDoc = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ drawImage() {}, getImageData: () => ({ data: px }) }),
    }),
  };
  m.themeFollowOnFrameCanvas({});
  globalThis.document = prevDoc;
  check('场景抓帧入口：画布的占比最大色进了合议（唯一证据 ⇒ 写 dark）',
    JSON.stringify(f.calls) === JSON.stringify(['dark']), JSON.stringify(f.calls));
}
{
  const m = await freshThemeFollow();
  const f = makeFake('light');
  m.themeFollowAttach(f.svc, f.ctx);
  transientWrites = {};
  onWallpaper(m, wallpaper('w8', 'rgb(10, 12, 16)'));
  check('状态行会随判决落到瞬态字段（面板据此显示"当前：…"）',
    JSON.stringify(f.calls) === JSON.stringify(['dark'])
    && String(transientWrites.themeFollowLine || '').trim().length > 0,
    String(transientWrites.themeFollowLine || '(无)'));
}
console.log('\n⑥ 开关「主题随壁纸」：默认关 · 关时主题不变 · 开时上游行为 · 键经落盘入口');
{
  const schema = await import(pathToFileURL(join(root, 'lib', 'settings-schema.js')).href);
  const tabsCode = stripComments(panelText());
  const clientCode = stripComments(read('src/client.js'));
  const switchAt = tabsCode.indexOf('switchRow(weT("主题随壁纸")');
  const swatchAt = tabsCode.indexOf('swatchRow(weT("全局配色")');
  const uiCallAt = tabsCode.indexOf('renderAppearanceUiColorSection(ctx),');
  check('开关存在且默认为关（设置模型 DEFAULTS.themeFollow === false，kind = boolFalse）',
    schema.DEFAULTS.themeFollow === false && schema.KINDS.themeFollow
    && schema.KINDS.themeFollow.kind === 'boolFalse',
    'DEFAULTS=' + String(schema.DEFAULTS.themeFollow) + ' kind=' + String((schema.KINDS.themeFollow || {}).kind));
  check('面板「主题」段有这个开关，且文案说明「关 = 不按壁纸自动改深浅主题」（面板面可见）',
    switchAt >= 0 && tabsCode.includes('不按壁纸自动改深浅主题'),
    '开关下标=' + switchAt);
  check('「配色」已迁入「全局 UI 配色」节',
    swatchAt > 0 && uiCallAt > 0,
    '配色行下标=' + swatchAt + ' / UI配色节调用=' + uiCallAt);
  async function themeMovesUnderSwitch(themeFollow, sel, preference) {
    const m = await freshThemeFollow({ themeFollow });
    const f = makeFake(preference);
    m.themeFollowAttach(f.svc, f.ctx);
    onWallpaper(m, sel);
    return { calls: f.calls.slice(), preference: f.svc.preference, line: String(transientWrites.themeFollowLine || '') };
  }
  const offDark = await themeMovesUnderSwitch(false, wallpaper('w1', 'rgb(4, 6, 10)'), 'light');
  const offLight = await themeMovesUnderSwitch(false, wallpaper('w2', 'rgb(240, 244, 250)'), 'dark');
  const mOff = await freshThemeFollow({ themeFollow: true });
  const fOff = makeFake('light');
  mOff.themeFollowAttach(fOff.svc, fOff.ctx);
  onWallpaper(mOff, wallpaper('w3', 'rgb(4, 6, 10)'));
  const wroteWhileOn = fOff.calls.length;
  check('覆盖面：theme/change 订阅在场（否则驱动器静默空转、下面的"清掉让位痕迹"白测）',
    fOff.handlers.some(([ev]) => ev === 'theme/change'),
    '订阅=' + JSON.stringify(fOff.handlers.map(([ev]) => ev)));
  fOff.svc.preference = 'light';
  for (const [ev, cb] of fOff.handlers) if (ev === 'theme/change') cb();
  globalThis.selection.themeFollow = false;
  mOff.themeFollowOnWallpaper(globalThis.selection);
  globalThis.selection.themeFollow = true;
  mOff.themeFollowOnWallpaper(globalThis.selection);
  check('关时：深/浅两向都不改主题（0 次写入、偏好原样、面板不留痕），且清掉让位痕迹（再开即重新判决）',
    offDark.calls.length === 0 && offDark.preference === 'light' && offDark.line === ''
    && offLight.calls.length === 0 && offLight.preference === 'dark' && offLight.line === ''
    && wroteWhileOn === 1 && fOff.calls.length === wroteWhileOn + 1,
    '关(深壁纸)=' + JSON.stringify(offDark.calls) + '/' + offDark.preference
    + ' 关(浅壁纸)=' + JSON.stringify(offLight.calls) + '/' + offLight.preference
    + ' 关→开写入 ' + wroteWhileOn + '→' + fOff.calls.length);
  const onDark = await themeMovesUnderSwitch(true, wallpaper('w1', 'rgb(4, 6, 10)'), 'light');
  const onLight = await themeMovesUnderSwitch(true, wallpaper('w2', 'rgb(240, 244, 250)'), 'dark');
  check('开时：上游行为仍在（深色壁纸写 dark、浅色写 light，并留下状态行）',
    JSON.stringify(onDark.calls) === JSON.stringify(['dark'])
    && JSON.stringify(onLight.calls) === JSON.stringify(['light']) && onDark.line !== '',
    JSON.stringify(onDark.calls) + ' / ' + JSON.stringify(onLight.calls));
  const saved = schema.serializeSettings({ id: 'x', themeFollow: true });
  const rebuilt = (side) => schema.sanitizeFromSchema(JSON.parse(JSON.stringify(saved)), side).themeFollow;
  check('持久化：不在 DEFAULTS_ONLY、经 setSetting 落盘，且序列化→重建往返两侧都仍是该值',
    !schema.DEFAULTS_ONLY.includes('themeFollow') && 'themeFollow' in schema.serializeSettings({})
    && /setSetting\("themeFollow"/.test(clientCode)
    && saved.themeFollow === true && rebuilt('client') === true && rebuilt('host') === true,
    'setSetting=' + /setSetting\("themeFollow"/.test(clientCode)
    + ' 往返 client/host=' + rebuilt('client') + '/' + rebuilt('host'));
}
console.log('\n⑦ 接线：服务句柄 / 切换评估 / 面板开关 / 内联登记');
{
  const clientSrc = read('src/client.js');
  const prepSrc = read('src/media-prep.js');
  const tabsSrc = panelText();
  const buildSrc = read('scripts/build-client.mjs');
  check('主题服务句柄接在既有的 theme 轮询 onReady 上（不新增轮询）',
    /onReady: \(theme\) => \{ themeFollowAttach\(theme, ctx\);/.test(clientSrc));
  check('applySelection 落 schemeColor（垫底图的底色兜底因此不再永远为空）',
    prepSrc.includes('selection.schemeColor = w.schemeColor || null;')
    && liveText().includes('sel.schemeColor ||'));
  const liveAssign = prepSrc.includes('selection.liveFrame = w.type === "web" && w.liveFrame ? w.liveFrame : null;');
  const liveRead = liveText().includes('sel.liveFrame ||');
  check('applySelection 落 liveFrame（web 支的实时帧候选因此才有入口）',
    liveAssign && liveRead, 'assign=' + liveAssign + ' read=' + liveRead);
  check('清空/被过滤两条早退分支也把实时帧清掉（不留上一张的残值）',
    prepSrc.split('selection.liveFrame = null;').length - 1 >= 2);
  check('applySelection 触发评估，并把「皮肤放回」标志透传（放回那次不复位让位标记）',
    prepSrc.includes('themeFollowOnWallpaper(selection, { fromSkinRestore: !!(opts && opts.fromSkinRestore) });'));
  check('清空/被过滤两条早退分支也把配色清掉（不留上一张的残值）',
    prepSrc.split('selection.schemeColor = null;').length - 1 >= 2);
  check('面板开关有文案说明规则与让位条件（关 = 不自动跟随）',
    tabsSrc.includes('主题随壁纸') && tabsSrc.includes('不按壁纸自动改深浅主题'));
  check('模块已登记进内联清单（否则永远不进产物）',
    buildSrc.includes("file: 'src/theme-follow.js'"));
  check('产物里确实带上了判定常量（构建期内联生效）',
    read('lib/client.js').includes('THEME_FOLLOW_LIGHT_ABOVE'));
  const liveSrc = liveText();
  check('两条真实抓帧路径都接上了：场景画布 + 网页 __wp.capture',
    liveSrc.includes('themeFollowOnFrameCanvas(canvas);')
    && liveSrc.includes('themeFollowOnFrameImage(dataUrl);'));
  const themeSrc = read('src/theme-follow.js');
  const releaseThenEmitRe = /themeFollowRelease\(\);\r?\n\s*emit\(\);/;
  const toCrlf = (s) => s.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  check('清空路径调用放回（themeFollowRelease）—— 用户「清除」与皮肤让路两条路都汇到那里',
    releaseThenEmitRe.test(prepSrc));
  check('CRLF 容忍：同一条判据在 CRLF 检出形态上也命中（防"本地绿、CI 红"复发）',
    releaseThenEmitRe.test(toCrlf(prepSrc)));
  check('放回只在 applySelection 的清空路径调（被过滤的早退分支不调 —— 选择还在，主题时代没结束）',
    prepSrc.split('themeFollowRelease()').length - 1 === 1,
    'calls=' + (prepSrc.split('themeFollowRelease()').length - 1));
  check('皮肤退场放回壁纸时带 fromSkinRestore（让位标记随这次放回不复位）',
    clientSrc.includes('applySelection(mem.id, { fromSkinRestore: true });'));
  check('主题的写入口全部带皮肤让路门（评估 / 写 / 图源 / 两条帧腿，共 5 处）',
    (themeSrc.match(/\|\| themeFollowSkinYielded\(\)\)|if \(themeFollowSkinYielded\(\)\)/g) || []).length === 5,
    'gates=' + (themeSrc.match(/\|\| themeFollowSkinYielded\(\)\)|if \(themeFollowSkinYielded\(\)\)/g) || []).length);
}
console.log('\n⑧ 皮肤互操作：退场放回 · 让路态不写 · 外部切换不硬覆盖回去');
{
  {
    const m = await freshThemeFollow();
    const f = makeFake('light');
    m.themeFollowAttach(f.svc, f.ctx);
    m.themeFollowOnWallpaper(wallpaper('w1', 'rgb(4, 6, 10)'));
    const wrote = f.calls.length;
    m.themeFollowRelease();
    check('退场放回：我方改过的那份原样归还（dark → light）并留痕',
      wrote === 1 && JSON.stringify(f.calls) === JSON.stringify(['dark', 'light'])
      && f.svc.preference === 'light'
      && String(transientWrites.themeFollowLine || '').trim().length > 0,
      JSON.stringify(f.calls) + ' pref=' + f.svc.preference
      + ' || ' + String(transientWrites.themeFollowLine || '') + ' || ' + (diagTraces.slice(-1)[0] || '(无)'));
    m.themeFollowRelease();
    check('放回是一次性的（没有改动痕迹后不再写）', f.calls.length === 2, JSON.stringify(f.calls));
  }
  {
    const m = await freshThemeFollow();
    const f = makeFake('dark');
    m.themeFollowAttach(f.svc, f.ctx);
    m.themeFollowOnWallpaper(wallpaper('w1', 'rgb(4, 6, 10)'));
    m.themeFollowRelease();
    check('我方没动过主题 ⇒ 退场不放回（一个字节都不写）', f.calls.length === 0, JSON.stringify(f.calls));
  }
  {
    const m = await freshThemeFollow();
    const f = makeFake('light');
    m.themeFollowAttach(f.svc, f.ctx);
    m.themeFollowOnWallpaper(wallpaper('w1', 'rgb(4, 6, 10)'));
    f.svc.preference = 'light';
    check('覆盖面：theme/change 订阅在场（否则下面的让位通知空转、"不硬覆盖"白测）',
      f.handlers.some(([ev]) => ev === 'theme/change'),
      '订阅=' + JSON.stringify(f.handlers.map(([ev]) => ev)));
    for (const [ev, cb] of f.handlers) if (ev === 'theme/change') cb();
    f.svc.preference = 'dark';
    for (const [ev, cb] of f.handlers) if (ev === 'theme/change') cb();
    m.themeFollowRelease();
    check('别人动过手（让位标记在场）⇒ 退场不硬覆盖回去（哪怕现值恰好等于我方写的值）',
      JSON.stringify(f.calls) === JSON.stringify(['dark']) && f.svc.preference === 'dark',
      JSON.stringify(f.calls) + ' pref=' + f.svc.preference);
  }
  {
    const m = await freshThemeFollow();
    const f = makeFake('light');
    m.themeFollowAttach(f.svc, f.ctx);
    m.themeFollowOnWallpaper(wallpaper('w1', 'rgb(4, 6, 10)'));
    f.svc.preference = 'light';
    m.themeFollowRelease();
    check('现值已经不是我方写的值 ⇒ 退场也不碰（不硬覆盖回去）',
      JSON.stringify(f.calls) === JSON.stringify(['dark']) && f.svc.preference === 'light',
      JSON.stringify(f.calls) + ' pref=' + f.svc.preference);
  }
  {
    const m = await freshThemeFollow();
    const f = makeFake('light');
    m.themeFollowAttach(f.svc, f.ctx);
    m.themeFollowOnWallpaper(wallpaper('w1', 'rgb(4, 6, 10)'));
    globalThis.skinYieldActive = () => true;
    try {
      m.themeFollowOnWallpaper(wallpaper('w2', 'rgb(240, 244, 250)'));
      m.themeFollowAcceptImageVerdict([240, 240, 240], 2);
      const duringYield = f.calls.length;
      m.themeFollowRelease();
      check('让路态：评估与图源腿一律空转；放回照常执行（把环境还给皮肤）',
        duringYield === 1 && JSON.stringify(f.calls) === JSON.stringify(['dark', 'light']),
        'yield 中写入 ' + duringYield + ' → ' + JSON.stringify(f.calls));
    } finally { delete globalThis.skinYieldActive; }
  }
  {
    const restoreCase = async (withFlag) => {
      const m = await freshThemeFollow();
      const f = makeFake('dark');
      m.themeFollowAttach(f.svc, f.ctx);
      f.svc.preference = 'light';
      for (const [ev, cb] of f.handlers) if (ev === 'theme/change') cb();
      m.themeFollowOnWallpaper(wallpaper('w1', 'rgb(4, 6, 10)'),
        withFlag ? { fromSkinRestore: true } : undefined);
      return { calls: f.calls.slice(), pref: f.svc.preference };
    };
    const kept = await restoreCase(true);
    check('放回（fromSkinRestore）不复位让位标记：窗口里改过的主题不被壁纸判决打回',
      kept.calls.length === 0 && kept.pref === 'light', JSON.stringify(kept));
    const naive = await restoreCase(false);
    check('负对照：不带 fromSkinRestore 的普通应用会复位让位标记（同一序列被写回 dark）⇒ 判据能区分',
      naive.calls.length === 1 && naive.pref === 'dark', JSON.stringify(naive));
  }
  {
    const m = await freshThemeFollow();
    const f = makeFake('light');
    m.themeFollowAttach(f.svc, f.ctx);
    m.themeFollowOnWallpaper(wallpaper('w1', 'rgb(4, 6, 10)'), { fromSkinRestore: true });
    check('窗口里没人动过主题 ⇒ 放回照常写入壁纸判决（正对照：别把"不硬覆盖"做成"永远不写"）',
      JSON.stringify(f.calls) === JSON.stringify(['dark']), JSON.stringify(f.calls));
  }
  {
    const m = await freshThemeFollow();
    const f = makeFake('light');
    m.themeFollowAttach(f.svc, f.ctx);
    m.themeFollowOnWallpaper(wallpaper('w1', 'rgb(4, 6, 10)'));
    m.themeFollowRelease();
    m.themeFollowOnWallpaper(wallpaper('w1', 'rgb(4, 6, 10)'));
    check('放回后再选同一张 ⇒ 重新接管（写 dark；before 重新记一份）',
      JSON.stringify(f.calls) === JSON.stringify(['dark', 'light', 'dark']), JSON.stringify(f.calls));
    m.themeFollowRelease();
    check('第二轮退场同样放回（环境每次都能退干净）',
      JSON.stringify(f.calls) === JSON.stringify(['dark', 'light', 'dark', 'light']), JSON.stringify(f.calls));
  }
  {
    const m = await freshThemeFollow();
    const f = makeFake('light');
    m.themeFollowAttach(f.svc, f.ctx);
    m.themeFollowOnWallpaper(wallpaper('w1', 'rgb(4, 6, 10)'));
    m.themeFollowRelease();
    for (const [ev, cb] of f.handlers) if (ev === 'theme/change') cb();
    m.themeFollowOnWallpaper(wallpaper('w1', 'rgb(4, 6, 10)'), { fromSkinRestore: true });
    check('放回自触发的 theme/change 不被读成"别人接管"（先记再写）：同张壁纸的放回照常接管',
      JSON.stringify(f.calls) === JSON.stringify(['dark', 'light', 'dark']), JSON.stringify(f.calls));
  }
}
console.log('\n' + (failed ? 'THEME-FOLLOW CHECKS FAILED — ' + failed + ' failed' : 'ALL THEME-FOLLOW CHECKS PASSED'));
process.exit(failed ? 1 : 0);
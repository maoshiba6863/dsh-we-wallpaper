import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const MOD_URL = pathToFileURL(join(ROOT, 'src', 'glass-extra.js')).href;
const TAG_ID = 'dsh-wallpaper-engine/extra-glass';
const schema = await import(pathToFileURL(join(ROOT, 'lib', 'settings-schema.js')).href);
const effectsSrc = readFileSync(join(ROOT, 'src', 'effects.js'), 'utf8');
const panelSrc = readFileSync(join(ROOT, 'src', 'glass-panel.js'), 'utf8');
const clientSrc = readFileSync(join(ROOT, 'src', 'client.js'), 'utf8');
const quickSrc = readFileSync(join(ROOT, 'src', 'quick-panel.js'), 'utf8');
const buildSrc = readFileSync(join(ROOT, 'scripts', 'build-client.mjs'), 'utf8');
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) console.log('  ✓ ' + name + (detail ? ' — ' + detail : ''));
  else { failed++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
};
function makeDoc() {
  const head = { children: [] };
  head.appendChild = (el) => { head.children.push(el); return el; };
  const doc = {
    head,
    createElement(tag) {
      const el = { tagName: tag, dataset: {}, textContent: '', removed: false };
      el.remove = () => { el.removed = true; const i = head.children.indexOf(el); if (i >= 0) head.children.splice(i, 1); };
      return el;
    },
    querySelector(sel) {
      const m = /^style\[data-plugin-css="(.*)"\]$/.exec(sel);
      if (!m) return null;
      return head.children.find((e) => e.tagName === 'style' && e.dataset.pluginCss === m[1]) || null;
    },
  };
  return doc;
}
let seq = 0;
async function fresh() {
  const doc = makeDoc();
  globalThis.sanitizeExtraGlassSelectors = schema.sanitizeExtraGlassSelectors;
  globalThis.document = doc;
  const mod = await import(MOD_URL + '?v=' + (++seq));
  return { mod, doc };
}
const GOOD = '.dsh-mobile-control__panel, .dim-jh-badgePop';
{
  const { mod } = await fresh();
  check('空清单 ⇒ 空串（一条规则都不生成）', mod.weExtraGlassCss({ extraGlassSelectors: '' }) === '',
    JSON.stringify(mod.weExtraGlassCss({ extraGlassSelectors: '' })));
  check('缺键 ⇒ 空串', mod.weExtraGlassCss({}) === '');
  check('非字符串 ⇒ 空串', mod.weExtraGlassCss({ extraGlassSelectors: 42 }) === '');
  const css = mod.weExtraGlassCss({ extraGlassSelectors: GOOD });
  const n = (css.match(/::before \{/g) || []).length;
  check('两条选择器 ⇒ 两条 ::before 载体', n === 2, 'n=' + n);
  check('载体挂在 ::before 上（**不是**直接给目标元素加 backdrop-filter —— #89 的包含块坑）',
    /\.dsh-mobile-control__panel::before \{/.test(css) && !/\.dsh-mobile-control__panel \{[^}]*backdrop-filter/.test(css));
  for (const decl of ['content: ""', 'position: absolute', 'inset: 0', 'border-radius: inherit',
    'z-index: -1', 'pointer-events: none']) {
    check('载体声明齐：' + decl, css.includes(decl));
  }
  const webkitCount = (css.match(/-webkit-backdrop-filter: blur\(/g) || []).length;
  const stdCount = (css.match(/(?:^|[^-])backdrop-filter: blur\(/g) || []).length;
  check('两个前缀的 backdrop-filter 都在（-webkit- 与标准，逐条规则各一份）',
    webkitCount === 2 && stdCount === 2, 'webkit=' + webkitCount + ' std=' + stdCount);
  const webkitBlur = (css.match(/-webkit-backdrop-filter: blur\(var\(--we-blur, 16px\)\)/g) || []).length;
  const stdBlur = (css.match(/(?:^|[^-])backdrop-filter: blur\(var\(--we-blur, 16px\)\)/g) || []).length;
  check('模糊读全局 `--we-blur`（= 跟随「雾化」滑杆，不是写死半径）',
    webkitBlur === 2 && stdBlur === 2, 'webkit=' + webkitBlur + ' std=' + stdBlur);
  check('门①：整组挂在 data-we-glass-page 下（皮肤让路态跟着一起失效）',
    (css.match(/body\[data-we-glass-page\]:not\(\[data-we-glass-fallback\]\) /g) || []).length === 2);
  check('门②：软渲档整组不匹配（不保留不会生效的 backdrop-filter，同 #95 政策）',
    css.includes(':not([data-we-glass-fallback])'));
}
{
  const { mod } = await fresh();
  const evil = '.evil; } body { display: none }';
  const css = mod.weExtraGlassCss({ extraGlassSelectors: evil });
  check('注入串一个字都进不去（整条作废，不修剪成另一个选择器）', css === '', JSON.stringify(css));
  const css2 = mod.weExtraGlassCss({ extraGlassSelectors: GOOD + ', .x{y}' });
  check('坏条只丢自己，好条照旧',
    (css2.match(/::before \{/g) || []).length === 2 && !css2.includes('.x'));
  const css3 = mod.weExtraGlassCss({ extraGlassSelectors: '[data-dsh-mobile-details]' });
  check('合法属性选择器保留（那是真实面板的锚点形状）', css3.includes('[data-dsh-mobile-details]::before'));
  check('生成结果里不出现任何 `}` 由选择器引入的痕迹（选择器只在 { 之前）',
    css2.split('::before {').every((part, i) => i === 0 || !/\}/.test(part.split('backdrop-filter:')[0])));
}
{
  const { mod } = await fresh();
  const PER_MAX = 120;
  const COUNT_MAX = 8;
  const FULL = Array.from({ length: COUNT_MAX }, (_, i) => ('.p' + i + '-x'.repeat(PER_MAX)).slice(0, PER_MAX));
  const JOINED = FULL.join(', ');
  const TOTAL_MAX = JOINED.length;
  const START_OK = /^[A-Za-z0-9.#_:*>()[\]=+~|\-]/;
  const selOf = (css) => css.split('\n').filter((l) => l.includes('::before'))
    .map((l) => l.replace(/^body\[data-we-glass-page\]:not\(\[data-we-glass-fallback\]\) /, '')
      .replace(/::before \{.*$/, ''));
  const intact = (sels) => sels.length === COUNT_MAX && sels.every((s) =>
    FULL.includes(s) && s.length >= 1 && s.length <= PER_MAX && START_OK.test(s));
  const out = mod.weExtraGlassCss({ extraGlassSelectors: JOINED });
  const got = selOf(out);
  check('②b-1 8 条满长（各 120 字 / 合计 ' + TOTAL_MAX + ' B）全量保留，一条不丢、一句不切',
    intact(got) && out.length >= TOTAL_MAX && schema.sanitizeExtraGlassSelectors(JOINED).length === TOTAL_MAX,
    'n=' + got.length + ' · 规则 ' + got.length + ' · 消毒器直出 ' + schema.sanitizeExtraGlassSelectors(JOINED).length + ' B');
  check('②b-2 消毒器直出 = 输入逐字节（不重排、不丢字、不补分隔符）',
    schema.sanitizeExtraGlassSelectors(JOINED) === JOINED, TOTAL_MAX + ' B');
  check('②b-2b 每条都逐字属于输入、长度 ∈[1,' + PER_MAX + '] 且以合法起始符开头（结构上排除半截）',
    got.length === COUNT_MAX && got.every((s) => FULL.includes(s) && s.length >= 1 && s.length <= PER_MAX && START_OK.test(s)),
    got.map((s) => s.length).join(','));
  const subsetIntact = (sels, inputs) => sels.length <= COUNT_MAX && sels.every((s) =>
    inputs.includes(s) && s.length >= 1 && s.length <= PER_MAX && START_OK.test(s));
  const OVER = FULL.concat(['.z']);
  const OVER9 = Array.from({ length: COUNT_MAX + 1 }, (_, i) => ('.q' + i + '-y'.repeat(PER_MAX)).slice(0, PER_MAX));
  const OVER_STR = OVER.join(', ');
  const OVER9_STR = OVER9.join(', ');
  const over1 = selOf(mod.weExtraGlassCss({ extraGlassSelectors: OVER_STR }));
  const over9 = selOf(mod.weExtraGlassCss({ extraGlassSelectors: OVER9_STR }));
  check('②b-2c 超限输入（' + OVER_STR.length + ' B = 8+1 条 · ' + OVER9_STR.length + ' B = 9 条，含 975 字符这一档）⇒ 多余的条**整条丢**，存活每条逐字属于输入、长度 ≤' + PER_MAX + '、总量 ≤' + TOTAL_MAX + '，绝不半截',
    subsetIntact(over1, FULL) && subsetIntact(over9, OVER9)
    && schema.sanitizeExtraGlassSelectors(OVER_STR).length <= TOTAL_MAX
    && schema.sanitizeExtraGlassSelectors(OVER9_STR).length <= TOTAL_MAX,
    '8+1 条 ⇒ ' + over1.length + ' 条 / ' + schema.sanitizeExtraGlassSelectors(OVER_STR).length + ' B · 9 条 ⇒ ' + over9.length + ' 条 / ' + schema.sanitizeExtraGlassSelectors(OVER9_STR).length + ' B · 上界 ' + TOTAL_MAX + ' B');
  let fuzzBad = 0;
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let t = 0; t < 300; t++) {
    const n = 1 + Math.floor(rnd() * 11);
    const inputs = [];
    const pieces = [];
    for (let i = 0; i < n; i++) {
      const len = 1 + Math.floor(rnd() * (PER_MAX + 3));
      const s = ('.f' + t + '-' + i + '-' + 'z'.repeat(len)).slice(0, len);
      inputs.push(s);
      pieces.push(i === n - 1 && rnd() < 0.25 ? s + '!' : s);
    }
    const san = schema.sanitizeExtraGlassSelectors(pieces.join(', '));
    const sels = selOf(mod.weExtraGlassCss({ extraGlassSelectors: pieces.join(', ') }));
    if (san.length > TOTAL_MAX || sels.length > COUNT_MAX
      || sels.some((s) => !inputs.includes(s) || s.length < 1 || s.length > PER_MAX || !START_OK.test(s))) fuzzBad++;
  }
  check('②b-2d 300 组随机输入（含超长 / 非法字符 / 1–11 条）的产物恒为「整条子集」：无半截、≤' + COUNT_MAX + ' 条、≤' + TOTAL_MAX + ' B',
    fuzzBad === 0, 'violations=' + fuzzBad);
  const OLD_MAX = 400;
  const oldSel = JOINED.slice(0, OLD_MAX).split(', ');
  check('negative control ②b-1: 旧实现 slice(0,' + OLD_MAX + ') 在同一条判据下判红 —— 产出半截选择器',
    !intact(oldSel), '旧输出 ' + OLD_MAX + ' B / ' + oldSel.length + ' 条 · 末段 ' + JSON.stringify(oldSel[oldSel.length - 1]) + ' 长度 ' + oldSel[oldSel.length - 1].length);
  const schemaSrc = readFileSync(join(ROOT, 'lib', 'settings-schema.js'), 'utf8');
  check('②b-3 总量上限由 8×120 推导（不是手写魔数），且结果不再走 slice 截断',
    /const EXTRA_GLASS_SELECTORS_MAX = EXTRA_GLASS_SELECTOR_COUNT \* EXTRA_GLASS_SELECTOR_MAX\s+\+ 2 \* \(EXTRA_GLASS_SELECTOR_COUNT - 1\);/.test(schemaSrc)
    && !/\.slice\(0,\s*EXTRA_GLASS_SELECTORS_MAX\)/.test(schemaSrc));
}
{
  const raw = '.evil; } body { display: none }';
  const bypass = 'body[data-we-glass-page] ' + raw + '::before { content: ""; }';
  check('negative control：同一串**不消毒**直接拼 ⇒ 规则里出现注入用的 `}`（② 有牙）',
    /\} body \{/.test(bypass));
}
{
  const { mod, doc } = await fresh();
  mod.syncExtraGlassCss({ extraGlassSelectors: '' });
  check('空清单 ⇒ 不建标签', doc.head.children.length === 0);
  mod.syncExtraGlassCss({ extraGlassSelectors: GOOD });
  check('有值 ⇒ 建一个本通道的 <style>', doc.head.children.length === 1
    && doc.head.children[0].dataset.pluginCss === TAG_ID);
  const tag = doc.head.children[0];
  const css1 = tag.textContent;
  check('标签内容 = 生成结果', css1 === mod.weExtraGlassCss({ extraGlassSelectors: GOOD }));
  mod.syncExtraGlassCss({ extraGlassSelectors: GOOD });
  check('同值重复同步 ⇒ 不重写（内容比对，逐字符相等即不碰 DOM）', tag.textContent === css1);
  mod.syncExtraGlassCss({ extraGlassSelectors: '.other' });
  check('值变化 ⇒ 重写', tag.textContent !== css1 && tag.textContent.includes('.other::before'));
  mod.syncExtraGlassCss({ extraGlassSelectors: '' });
  check('值变空 ⇒ 撤掉标签（不留空 <style>）', doc.head.children.length === 0);
  mod.syncExtraGlassCss({ extraGlassSelectors: GOOD });
  const t2 = doc.head.children[0];
  mod.disposeExtraGlassCss();
  check('dispose ⇒ 标签移除（卸载路径）', doc.head.children.length === 0 && t2.removed === true);
  mod.disposeExtraGlassCss();
  check('重复 dispose 不抛（幂等）', doc.head.children.length === 0);
}
{
  check('effects.applyEffects 同步这条通道',
    /applyGlass\(selection, s\);\n[^\n]*\n(?:[^\n]*\n)*?\s+syncExtraGlassCss\(selection\);/.test(effectsSrc)
    || /syncExtraGlassCss\(selection\);/.test(effectsSrc));
  check('effects.clearEffects 撤标签（与 body 那批清理成对）', /disposeExtraGlassCss\(\);/.test(effectsSrc));
  check('构建期内联清单已登记 src/glass-extra.js', buildSrc.includes("file: 'src/glass-extra.js'"));
  check('面板渲染了这个控件（走 weT 词条 + 具名处理器）',
    /weT\("额外补雾化的选择器"\)/.test(panelSrc) && /onInput: \(e\) => onExtraGlassSelectors\(e\.target\.value\)/.test(panelSrc));
  check('渲染器解构了这个处理器（否则面板拿到 undefined）', /onExtraGlassSelectors,/.test(panelSrc));
  check('设置页 ctx 给了处理器', /onExtraGlassSelectors,/.test(clientSrc));
  check('侧栏 ctx 也给了处理器（漏一侧 = 侧栏档渲染期 ReferenceError）',
    /onExtraGlassSelectors,/.test(quickSrc));
  check('处理器是模块级（在 WallpaperPicker 之前声明）',
    clientSrc.indexOf('const onExtraGlassSelectors') > 0
    && clientSrc.indexOf('const onExtraGlassSelectors') < clientSrc.indexOf('function WallpaperPicker() {'));
  check('schema：KINDS + DEFAULTS 都有这个键',
    schema.KINDS.extraGlassSelectors && schema.KINDS.extraGlassSelectors.kind === 'extraSelectors'
    && schema.DEFAULTS.extraGlassSelectors === '');
  check('预设段自动携带（PROFILE_PRESET_KEYS 由 KINDS 派生，不是一个手抄清单）',
    schema.PROFILE_PRESET_KEYS.includes('extraGlassSelectors'));
}
{
  const ok = schema.sanitizeFromSchema(
    Object.assign({}, schema.DEFAULTS, { extraGlassSelectors: GOOD }), 'client');
  check('合法清单经 sanitizeFromSchema 逐字保留', ok.extraGlassSelectors === GOOD);
  const bad = schema.sanitizeFromSchema(
    Object.assign({}, schema.DEFAULTS, { extraGlassSelectors: '.a;}x' }), 'client');
  check('非法条经 sanitizeFromSchema 被丢（两侧共用同一份判据）', bad.extraGlassSelectors === '');
}
console.log('\n' + (failed ? 'EXTRA-GLASS CHECKS FAILED — ' + failed + ' failed' : 'ALL EXTRA-GLASS CHECKS PASSED'));
process.exit(failed ? 1 : 0);
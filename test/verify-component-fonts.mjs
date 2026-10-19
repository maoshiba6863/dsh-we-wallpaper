import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './tools/js-text.mjs';
import { installWeTShim } from './tools/weT-shim.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
installWeTShim();
const mod = await import(new URL('../src/font/components.js', import.meta.url).href);
const { COMPONENT_FONT_TARGETS, COMPONENT_FONT_PROPS, probeComponentTargets, buildComponentCss, selectorFor } = mod;
let failed = 0;
let passed = 0;
const check = (name, ok, detail) => {
  if (ok) { console.log('  ✓ ' + name + (detail ? ' — ' + detail : '')); passed++; }
  else { console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); failed++; }
};
const section = (t) => console.log('\n' + t);
const skipNotes = [];
const skip = (name, why) => { skipNotes.push({ name, why }); };
const strip = stripComments;
const ALL = COMPONENT_FONT_TARGETS.map((t) => t.id);
const MARKDOWN = 'markdown';
const SELECTOR_SHAPE = /^body \[class\*="_[A-Za-z][A-Za-z0-9]*_"\] \{$/;
const HASHED_CLASS = /_[A-Za-z0-9]+_[a-z0-9]{5,}_\d+/;
const GENERIC_PREFIXES = ['label', 'tab', 'input', 'content', 'item', 'row', 'block'];
const offendingProps = (css) => [...css.matchAll(/^\s*([a-z-]+):/gm)].map((m) => m[1])
  .filter((p) => !COMPONENT_FONT_PROPS.includes(p));
const genericOnlyInHooks = (list) => list.every((t) => !GENERIC_PREFIXES.includes(t.prefix) || t.route === 'hooks');
const allHaveModuleCssSource = (sources) => sources.every((s) => typeof s === 'string' && s.endsWith('.module.css'));
const hooksAllKnown = (list, hooks) => list.every((h) => hooks.includes(h));
section('① 选择器形态：只许 `body [class*="_前缀_"]`');
{
  const sel = selectorFor(MARKDOWN);
  check('形态正确', sel === 'body [class*="_markdown_"]', sel);
  check('拒绝裸类名形态', (() => { try { selectorFor('.markdown'); return false; } catch { return true; } })());
  check('拒绝不在白名单的前缀', (() => { try { selectorFor('evilTarget'); return false; } catch { return true; } })());
  check('拒绝带特殊字符的前缀', (() => { try { selectorFor('a b'); return false; } catch { return true; } })());
  const css = buildComponentCss({ markdown: { size: 15 } }, ALL);
  check('生成的 CSS 里每个选择器都符合唯一形态',
    css.split('\n').filter((l) => l.includes('{')).every((l) => SELECTOR_SHAPE.test(l.trim())),
    css.split('\n').filter((l) => l.includes('{')).join(' | '));
  check('负对照：形态判据对越界写法有牙',
    ['.markdown {', 'body :has(.markdown) {', 'body .markdown {', 'body [class*="_markdown"] {']
      .every((s) => !SELECTOR_SHAPE.test(s))
    && SELECTOR_SHAPE.test('body [class*="_markdown_"] {'));
}
section('② 白名单与前缀/属性边界');
{
  const css = buildComponentCss(
    { markdown: { size: 15, weight: 600, family: '"KaiTi"' }, evilTarget: { size: 99 } }, ALL);
  check('只出现白名单内前缀', !css.includes('evilTarget'));
  const bad = offendingProps(css);
  check('只写 font-size / font-weight / font-family', bad.length === 0, bad.join(' ') || '（无越界属性）');
  check('负对照：属性判据能抓到越界属性',
    offendingProps('body [class*="_markdown_"] {\n  font-size: 15px;\n  line-height: 1.5;\n}').length === 1
    && offendingProps('body [class*="_markdown_"] {\n  font-size: 15px;\n}').length === 0);
}
section('③ 自探测：未命中整条不启用（按模块名采样，返回组件 id）');
{
  const fake = (hits) => ({ querySelectorAll: (sel) => ({ length: hits.some((h) => sel.includes('_' + h + '_')) ? 1 : 0 }) });
  const hit = probeComponentTargets(fake(['markdown', 'tableScroll']));
  check('只返回命中的组件 id', JSON.stringify(hit.slice().sort()) === JSON.stringify(['markdown', 'table']), hit.join(' '));
  const shared = probeComponentTargets(fake(['block']));
  check('共用模块名的两个组件一起命中', JSON.stringify(shared.slice().sort()) === JSON.stringify(['codeBlock', 'terminal']), shared.join(' '));
  const none = probeComponentTargets(fake([]));
  check('全不命中 ⇒ 空数组（打包器改名时整条降级）', none.length === 0);
  check('没有 document 也不炸', probeComponentTargets(null).length === 0);
  const css = buildComponentCss({ markdown: { size: 15 }, table: { size: 14 } }, ['markdown']);
  check('只给命中的组件生成规则', css.includes('_markdown_') && !css.includes('_tableScroll_'));
  check('负对照：全命中时两个都该生成',
    buildComponentCss({ markdown: { size: 15 }, table: { size: 14 } }, ['markdown', 'table']).includes('_tableScroll_'));
  check('buildComponentCss 绝不写 hooks 通道的组件（否则误伤同名的搜索块 / 网页块）',
    buildComponentCss({ codeBlock: { size: 20 }, terminal: { size: 20 } }, ['codeBlock', 'terminal']) === '');
  check('负对照：同一次调用里非 hooks 组件照常生成（判据有牙）',
    buildComponentCss({ markdown: { size: 20 } }, ['markdown']).includes('font-size: 20px'));
}
section('④ 空 = 回官方（不生成规则）');
{
  check('空配置 ⇒ 空串', buildComponentCss({}, ALL) === '');
  check('缺键 ⇒ 空串', buildComponentCss({ markdown: {} }, ALL) === '');
  check('0 / 空串 ⇒ 不覆盖该项',
    buildComponentCss({ markdown: { size: 0, weight: 0, family: '' } }, ALL) === '');
  const partial = buildComponentCss({ markdown: { size: 15 } }, ALL);
  check('只设字号 ⇒ 只写 font-size（其余保持官方）',
    partial.includes('font-size: 15px') && !partial.includes('font-weight') && !partial.includes('font-family'));
  check('越界值被忽略（字重 50 / 字号 -3）',
    buildComponentCss({ markdown: { weight: 50 } }, ALL) === ''
    && buildComponentCss({ markdown: { size: -3 } }, ALL) === '');
  check('负对照：合法边界值必须被接受（字重 100/900、字号 1）',
    buildComponentCss({ markdown: { weight: 100 } }, ALL).includes('font-weight: 100')
    && buildComponentCss({ markdown: { weight: 900 } }, ALL).includes('font-weight: 900')
    && buildComponentCss({ markdown: { size: 1 } }, ALL).includes('font-size: 1px'));
}
section('⑤ 源码不变量');
{
  const code = strip(readFileSync(join(root, 'src', 'font', 'components.js'), 'utf8'));
  check('零 !important（写死的声明里 315/319 无 !important ⇒ 等特异性即可）', !/!\s*important/.test(code));
  check('零 :has() / 祖先关联选择器（白闪红线 1）',
    !/:has\(/.test(code)
    && !buildComponentCss({ markdown: { size: 15 } }, ALL).includes('>')
    && !buildComponentCss({ markdown: { size: 15 } }, ALL).includes('~'));
  check('**不把哈希写进代码**（写死哈希 = DSH 一升级就静默失效）', !HASHED_CLASS.test(code));
  check('不碰 katex 与 @font-face', !/katex/i.test(code) && !/@font-face/.test(code));
  check('负对照：哈希判据对真实哈希类名有牙',
    HASHED_CLASS.test('_wordmark_u7vgf_31') && !HASHED_CLASS.test('_markdown_plain'));
  check('属性白名单就是三项', JSON.stringify(COMPONENT_FONT_PROPS) === JSON.stringify(['font-size', 'font-weight', 'font-family']));
  check('首期白名单 3–5 个组件（上限即棘轮）',
    COMPONENT_FONT_TARGETS.length >= 3 && COMPONENT_FONT_TARGETS.length <= 5, String(COMPONENT_FONT_TARGETS.length));
  check('组件 id 唯一（id 是设置键：重复 = 两行抢同一份配置）',
    new Set(COMPONENT_FONT_TARGETS.map((t) => t.id)).size === COMPONENT_FONT_TARGETS.length,
    COMPONENT_FONT_TARGETS.map((t) => t.id).join(' '));
  check('每个白名单项都有 id/label/group/prefix 且 route 合法',
    COMPONENT_FONT_TARGETS.every((t) => t.id && t.label && t.group && t.prefix
      && ['tokens', 'hooks', 'props'].includes(t.route)));
  check('泛模块名只许出现在 hooks 通道（写真实属性的通道不得用）',
    genericOnlyInHooks(COMPONENT_FONT_TARGETS),
    COMPONENT_FONT_TARGETS.map((t) => t.id + ':' + t.prefix + '/' + t.route).join(' '));
  check('负对照：把泛模块名挪到非 hooks 通道会被判出',
    !genericOnlyInHooks([{ id: 'x', prefix: 'block', route: 'tokens' }])
    && genericOnlyInHooks([{ id: 'x', prefix: 'block', route: 'hooks' }])
    && genericOnlyInHooks([{ id: 'x', prefix: 'markdown', route: 'tokens' }]));
  {
    const byPrefix = new Map();
    for (const t of COMPONENT_FONT_TARGETS) byPrefix.set(t.prefix, (byPrefix.get(t.prefix) || 0) + 1);
    const worst = Math.max(...byPrefix.values());
    check('同一模块名最多被 2 个组件共用', worst <= 2, '最多的模块名被 ' + worst + ' 条共用');
  }
}
section('⑤b 模块名的实测出处（source）');
{
  const bad = COMPONENT_FONT_TARGETS.filter((t) => !allHaveModuleCssSource([t.source]));
  check('每个组件都登记了 .module.css 出处', bad.length === 0,
    bad.map((t) => t.id).join(' ') || COMPONENT_FONT_TARGETS.map((t) => t.id).join(' '));
  check('负对照：出处判据对缺失/乱填有牙',
    !allHaveModuleCssSource([undefined]) && !allHaveModuleCssSource(['guess.css']) && !allHaveModuleCssSource([''])
    && allHaveModuleCssSource(['block.module.css']));
  const dshCandidates = [
    process.env.DSH_WE_DSH_ROOT,
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'DSH Desktop', 'resources', 'app'),
    'C:\\Program Files\\DSH Desktop\\resources\\app',
    'D:\\DSH Desktop\\resources\\app',
  ].filter(Boolean);
  const dshRoot = dshCandidates.find((c) => existsSync(join(c, 'node_modules'))) || null;
  const nm = dshRoot ? join(dshRoot, 'node_modules') : null;
  if (nm) {
    const wrong = [];
    for (const t of COMPONENT_FONT_TARGETS) {
      const abs = join(nm, String(t.source));
      if (!existsSync(abs)) { wrong.push(t.id + ':缺文件'); continue; }
      const css = readFileSync(abs, 'utf8');
      const re = new RegExp('^\\.' + t.prefix + '(?![A-Za-z0-9_-])', 'm');
      if (!re.test(css)) wrong.push(t.id + ':' + t.prefix);
    }
    check('★ 出处文件真实存在且里面定义了该模块名（本机 DSH 静态核对）', wrong.length === 0,
      wrong.join(' ') || COMPONENT_FONT_TARGETS.length + ' 个组件逐个核对通过（' + dshRoot + '）');
    check('负对照：核对判据对不存在的类名有牙',
      !new RegExp('^\\.' + 'definitelyNotAClass' + '(?![A-Za-z0-9_-])', 'm')
        .test(readFileSync(join(nm, String(COMPONENT_FONT_TARGETS[0].source)), 'utf8')));
  } else {
    skip('⑤b ★ 出处核对 + 它的负对照', '本机没有 DSH 安装（候选路径：'
      + (dshCandidates.length ? dshCandidates.join(' / ') : '一个都没配') + '）；可用 DSH_WE_DSH_ROOT 指定');
  }
}
section('⑥ G3 官方钩子（--dsl-*，作用域 = 钩子的**定义点**）');
{
  const HOOKS = mod.DSL_FONT_HOOKS.map((h) => h.name);
  check('钩子白名单就是官方那三个（不多不少）',
    JSON.stringify(HOOKS.sort()) === JSON.stringify([
      '--dsl-code-block-banner-font', '--dsl-code-block-content-font', '--dsl-terminal-font'].sort()),
    HOOKS.join(' '));
  const declared = COMPONENT_FONT_TARGETS.flatMap((t) => t.dslHooks || []);
  check('所有声明的钩子都在官方白名单内（防漂移）', hooksAllKnown(declared, HOOKS), declared.join(' '));
  check('每个组件都标了 route（tokens/hooks/props）',
    COMPONENT_FONT_TARGETS.every((t) => ['tokens', 'hooks', 'props'].includes(t.route)));
  check('route=hooks 的组件必须声明至少一个钩子',
    COMPONENT_FONT_TARGETS.filter((t) => t.route === 'hooks').every((t) => (t.dslHooks || []).length > 0));
  const SCOPES = {
    '--dsl-code-block-content-font': '._cbHASH_1',
    '--dsl-code-block-banner-font': '._cbHASH_1',
    '--dsl-terminal-font': '._termHASH_2',
  };
  const css = mod.buildDslBlocks({ codeBlock: { size: 14, family: '"KaiTi"' } },
    ['codeBlock', 'terminal'], () => true, SCOPES);
  check('写进**该钩子的定义点**（而不是按模块名生成的泛作用域）',
    css.includes('._cbHASH_1 {') && !css.includes('[class*="_block_"]'), css.split('\n')[0]);
  check('用官方钩子名，且组合式取自 DSH 细粒度令牌',
    css.includes('--dsl-code-block-content-font:') && css.includes('var(--dsw-font-markdown-code-block-font-weight)')
    && css.includes('var(--dsw-font-markdown-code-block-line-height)'), css.split('\n')[1]);
  check('只动用户改的两项（字号/字族），字重与行高沿用 DSH 令牌',
    css.includes('14px') && css.includes('"KaiTi"') && !css.includes('font-weight:'));
  check('零 !important（等特异性即可 —— 简写在组件根作用域上）', !/!\s*important/.test(css));
  const both = mod.buildDslBlocks({ codeBlock: { size: 14 }, terminal: { size: 13 } },
    ['codeBlock', 'terminal'], () => true, SCOPES);
  check('★ 代码块与终端落到**各自**的定义点（改一个不再连带改另一个）',
    both.includes('._cbHASH_1 {') && both.includes('._termHASH_2 {'));
  check('★ 两个组件的钩子各自成块（不混进同一条规则）',
    (both.match(/\{/g) || []).length === 2);
  check('同一组件的多个钩子合并进它自己的定义点',
    (css.match(/\{/g) || []).length === 1
    && css.includes('--dsl-code-block-banner-font:'));
  check('hooks 通道只写自定义属性（共用/精确作用域都安全的前提）',
    !/^\s*font-/m.test(css) && !/^\s*font:/m.test(css));
  check('未命中的组件不生成（自探测降级）',
    mod.buildDslBlocks({ terminal: { size: 13 } }, ['codeBlock'], () => true, SCOPES) === '');
  check('扫不到定义点 ⇒ 不生成（不退回按模块名的泛作用域）',
    mod.buildDslBlocks({ codeBlock: { size: 14 } }, ['codeBlock'], () => true, {}) === '');
  check('定义点形态不合规 ⇒ 拒绝注入（复合/后代/列表选择器）',
    mod.buildDslBlocks({ codeBlock: { size: 14 } }, ['codeBlock'], () => true,
      { '--dsl-code-block-content-font': 'body .x', '--dsl-code-block-banner-font': '.a, .b' }) === '');
  check('负对照：合规定义点必须被接受',
    mod.buildDslBlocks({ codeBlock: { size: 14 } }, ['codeBlock'], () => true, SCOPES)
      .includes('--dsl-code-block-content-font'));
  check('空配置不生成（官方值作初始值）', mod.buildDslBlocks({}, ['codeBlock'], () => true, SCOPES) === '');
  check('四令牌缺一 ⇒ 跳过该钩子（与 F2 同一规则）',
    mod.buildDslBlocks({ codeBlock: { size: 14 } }, ['codeBlock'],
      (t) => t !== '--dsw-font-markdown-code-block-line-height', SCOPES) === '');
  check('负对照：四令牌齐全时必须生成',
    mod.buildDslBlocks({ codeBlock: { size: 14 } }, ['codeBlock'], () => true, SCOPES)
      .includes('--dsl-code-block-content-font'));
  check('负对照：钩子漂移判据能抓到拼错的钩子（防手滑）',
    !hooksAllKnown(['--dsl-codeblock-content-font'], HOOKS)
    && hooksAllKnown(['--dsl-terminal-font'], HOOKS));
}
section('⑥b 扫样式表取钩子定义点（F1 同一口径：样式表是权威来源）');
{
  const sheetOf = (rules) => ({ cssRules: rules });
  const ruleOf = (selectorText, decls) => ({
    selectorText,
    style: { getPropertyValue: (n) => (decls[n] === undefined ? '' : decls[n]) },
  });
  const deps = ruleOf('._block_cbH_1', { '--dsl-code-block-content-font': 'var(--x)' });
  const term = ruleOf('._block_tmH_2', { '--dsl-terminal-font': 'var(--y)' });
  const nested = { selectorText: '', style: null, cssRules: [term] };
  const media = { selectorText: '', style: null, cssRules: [nested] };
  const foreign = { get cssRules() { throw new Error('cross-origin'); } };
  const fakeDoc = { styleSheets: [sheetOf([deps, media]), foreign] };
  const scopes = mod.scanHookScopes(fakeDoc);
  check('从定义该钩子的规则上取选择器（含 @media 嵌套）',
    scopes['--dsl-code-block-content-font'] === '._block_cbH_1' && scopes['--dsl-terminal-font'] === '._block_tmH_2',
    JSON.stringify(scopes));
  check('共用模块名但定义点不同 ⇒ 两条钩子分别落到各自规则',
    scopes['--dsl-code-block-content-font'] !== scopes['--dsl-terminal-font']);
  check('跨域样式表（cssRules 抛）不炸、也不吞掉其它样式表',
    Object.keys(scopes).length === 2);
  check('没有 document 也不炸', Object.keys(mod.scanHookScopes(null)).length === 0);
  check('形态不合规的选择器被丢弃（复合/后代/列表）',
    Object.keys(mod.scanHookScopes({ styleSheets: [sheetOf([
      ruleOf('body .x', { '--dsl-terminal-font': 'v' }),
      ruleOf('.a, .b', { '--dsl-code-block-content-font': 'v' }),
    ])] })).length === 0);
  check('负对照：形态判据对合规单类选择器有牙',
    mod.HOOK_SCOPE_RE.test('._block_9ufs4_4') && !mod.HOOK_SCOPE_RE.test('body .x')
      && !mod.HOOK_SCOPE_RE.test('.a, .b') && !mod.HOOK_SCOPE_RE.test('.a .b'));
}
section('⑦ schema 设置键与模块一致');
{
  const schema = await import(new URL('../lib/settings-schema.js', import.meta.url).href);
  const modIds = COMPONENT_FONT_TARGETS.map((t) => t.id);
  check('组件设置键两份一致（宿主只 import schema，浏览器只带模块）',
    JSON.stringify(modIds) === JSON.stringify(schema.COMPONENT_FONT_KEYS),
    'module=' + modIds.join(',') + ' schema=' + schema.COMPONENT_FONT_KEYS.join(','));
  check('负对照：多塞一个键会被判出',
    JSON.stringify([...modIds, 'ghost']) !== JSON.stringify(schema.COMPONENT_FONT_KEYS));
  check('模块名改而设置键不变 ⇒ 老设置零迁移',
    schema.sanitizeFontset({ componentFonts: { table: { size: 13 } } }).componentFonts.table.size === 13
    && COMPONENT_FONT_TARGETS.find((t) => t.id === 'table').prefix === 'tableScroll');
  check('已退役的 sidebar 设置被丢弃（模块里根本没有可命中的前缀）',
    JSON.stringify(schema.sanitizeFontset({ componentFonts: { sidebar: { size: 12 } } }).componentFonts) === '{}');
  const dirty = schema.sanitizeFontset(
    { componentFonts: { markdown: { size: 15, weight: 600, family: 'KaiTi; } body { display:none' } } });
  check('字族消毒：分号/花括号被剔除',
    !/[;{}]/.test(dirty.componentFonts.markdown.family), JSON.stringify(dirty.componentFonts.markdown.family));
  const bad = schema.sanitizeFontset(
    { componentFonts: { markdown: { size: 999, weight: 42 }, nope: { size: 12 } } });
  check('越界值与未知组件被丢弃', JSON.stringify(bad.componentFonts) === '{}', JSON.stringify(bad.componentFonts));
  check('该键已不在 settings 白名单里、而在字体集正文里（F3 阶段 2 的单一真源）',
    !('componentFonts' in schema.sanitizeFromSchema({}, 'host')) && 'componentFonts' in schema.sanitizeFontset({}));
}
section('⑧ 字体落地点已抽成 src/font/apply.js 并内联');
{
  const applySrc = readFileSync(join(root, 'src', 'font', 'apply.js'), 'utf8');
  const effectsSrc = readFileSync(join(root, 'src', 'effects.js'), 'utf8');
  const clientSrc = readFileSync(join(root, 'src', 'client.js'), 'utf8');
  const bundleSrc = readFileSync(join(root, 'lib', 'client.js'), 'utf8');
  const moved = ['function componentFontAvailability()', 'function componentFontDefaults()',
    'function applyComponentFonts()', 'function removeComponentFonts()',
    'function snapshotHostFontDefaults()', 'function removeFontStyles()'];
  const missing = moved.filter((m) => !applySrc.includes(m));
  check('覆盖面：搬家清单非空（空清单会让下面三条 filter 判据全部空转）', moved.length === 6);
  check('落地点模块在位（六个定义齐全）', missing.length === 0, missing.join(' ') || 'ok');
  const notInlined = moved.filter((m) => !bundleSrc.includes(m));
  check('六个定义都已内联进 lib/client.js', notInlined.length === 0, notInlined.join(' ') || 'ok');
  const stale = moved.filter((m) => clientSrc.includes(m) || effectsSrc.includes(m));
  check('client.js 与 effects.js 都不再自带这些实现（防"两边各留一份"）', stale.length === 0,
    stale.join(' ') || 'ok');
  check('effects.js 里零字体落点（不再引用 #we-font-scope）',
    !effectsSrc.includes('we-font-scope'));
}
const EXECUTED_FLOOR = 75;
{
  const executed = passed + failed;
  check('覆盖面：跑出结论的判据 ≥ ' + EXECUTED_FLOOR + '（跳过项在下面点名，不计入通过）',
    executed >= EXECUTED_FLOOR,
    'passed=' + passed + ' / failed=' + failed + ' / 地板 ' + EXECUTED_FLOOR
    + (skipNotes.length ? ' / 跳过 ' + skipNotes.length : ''));
}
console.log('');
if (skipNotes.length) {
  console.log('  ⚠️ 本次**未执行**的判据（不计入通过）—— ' + skipNotes.length + ' 条：');
  for (const s of skipNotes) console.log('     ○ ' + s.name + ' —— ' + s.why);
}
if (failed) {
  console.log(`COMPONENT FONT CHECKS FAILED — ${failed} failed, ${passed} passed`
    + (skipNotes.length ? `, ${skipNotes.length} skipped` : ''));
  process.exit(1);
}
console.log(`ALL COMPONENT FONT CHECKS PASSED (${passed})`
  + (skipNotes.length ? ` —— ⚠️ ${skipNotes.length} 条未执行（不是通过，见上面的 ○ 行）` : ''));
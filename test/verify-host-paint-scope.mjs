import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cssBodyOf } from './tools/src-scope.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(resolve(ROOT, 'lib/client.js'), 'utf8');
let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log('PASS | ' + name + (detail ? ' | ' + detail : ''));
  else { console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); failed++; }
}
const CSS_BODY = cssBodyOf(SRC);
const num = (re) => Number((SRC.match(re) || [])[1]);
let CSS = '';
try {
  CSS = new Function('READABILITY_FLOOR', 'READABILITY_FLOOR_DARK', 'return `' + CSS_BODY + '`;')(
    num(/const READABILITY_FLOOR = ([\d.]+);/), num(/const READABILITY_FLOOR_DARK = ([\d.]+);/));
} catch { CSS = CSS_BODY; }
const TARGET = '[data-sidebar-right-panel]';
const GATE = '[data-sidebar-right-open]';
function panelSelectors(css) {
  const out = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf(TARGET, from);
    if (at < 0) break;
    from = at + TARGET.length;
    const open = css.indexOf('{', at);
    const close = css.indexOf('}', at);
    if (open < 0 || (close >= 0 && close < open)) continue;
    const start = Math.max(css.lastIndexOf('{', at), css.lastIndexOf('}', at)) + 1;
    out.push(css.slice(start, open));
  }
  return out;
}
const NORM = (s) => s.replace(/\s+/g, ' ').trim();
const rawSels = panelSelectors(CSS);
const sels = rawSels.map(NORM);
const unqualified = sels.filter((s) => !s.includes(GATE));
const qualified = sels.filter((s) => s.includes(GATE));
{
  let region;
  try { region = cssBodyOf(SRC); } catch { region = ''; }
  const CSS_FLOOR = 1000;
  const CSS_CEIL = 400000;
  check('H0 CSS 模板抽取完整（裸反引号 ⇒ 提前截断骤短；结束锚失配 ⇒ 吃到文件尾）',
    region.length > CSS_FLOOR && region.length < CSS_CEIL,
    `模板长度 ${region.length} 字符（应落在 ${CSS_FLOOR}–${CSS_CEIL} 之间）`);
}
const firstRaw = rawSels[sels.findIndex((s) => s.includes(GATE))];
const mutated = firstRaw ? CSS.replace(firstRaw, firstRaw.replace(GATE, '')) : CSS;
const unqualifiedAfterMutation = panelSelectors(mutated).map(NORM).filter((s) => !s.includes(GATE));
check('H1 给宿主右栏面板上色的每条规则都限定在展开态（[data-sidebar-right-open]）',
  sels.length >= 6 && unqualified.length === 0 && qualified.length >= 6
  && firstRaw !== undefined && mutated !== CSS && unqualifiedAfterMutation.length >= 1,
  `命中规则 ${sels.length} 条（已限定 ${qualified.length}）` +
  `${unqualified.length ? ' · 未限定: ' + unqualified.join(' | ') : ''}` +
  ` · 负对照 去掉一条选择器的限定后被抓到 ${unqualifiedAfterMutation.length >= 1 ? 1 : 0}/1`);
const MARKERS = ['[data-dsh-better-sidebar]', '.dshDesktopSidebarSurface', '[data-composer-card]', '[role="dialog"]'];
const audit = MARKERS.map((m) => {
  let n = 0, from = 0;
  for (;;) {
    const at = CSS.indexOf(m, from);
    if (at < 0) break;
    from = at + m.length;
    const open = CSS.indexOf('{', at);
    const close = CSS.indexOf('}', at);
    if (open >= 0 && (close < 0 || open < close)) n++;
  }
  return m + '×' + n;
});
console.log('INFO | H2 其它被上色的宿主容器（需各自核对"关闭态是否留在布局里"）: ' + audit.join(' · '));
{
  const DECL = /-webkit-app-region\s*:\s*initial\s*!important/;
  const ruleOf = (cls) => {
    const i = CSS.indexOf(cls + ' {');
    if (i < 0) return '';
    const open = CSS.indexOf('{', i);
    const close = CSS.indexOf('}', open);
    return open < 0 || close < 0 ? '' : CSS.slice(i, close + 1);
  };
  const LAYER = ruleOf('.we-layer');
  const SCRIM = ruleOf('.we-scrim');
  const isFullViewport = (r) => /inset:\s*0\b/.test(r);
  const ok = (r) => DECL.test(r);
  const stripImportant = (r) => r.replace(/\s*!important/, '');
  const toNone = (r) => r.replace(/initial/, 'none');
  const negValue = LAYER.length > 0 && ok(toNone(LAYER)) === false;
  const negImportant = LAYER.length > 0 && ok(stripImportant(LAYER)) === false;
  check('H3 满屏 body 级浮层放行窗口拖拽（initial 而非 none，且带 !important）',
    LAYER.length > 0 && SCRIM.length > 0 && isFullViewport(LAYER) && isFullViewport(SCRIM)
    && ok(LAYER) && ok(SCRIM) && negValue && negImportant,
    `.we-layer ${ok(LAYER) ? '已放行' : '未放行'} · .we-scrim ${ok(SCRIM) ? '已放行' : '未放行'}` +
    ` · 负对照 值改成 none 被抓到 ${negValue ? 1 : 0}/1 · 去掉 !important 被抓到 ${negImportant ? 1 : 0}/1`);
}
{
  const blurRules = [];
  {
    let from = 0;
    for (;;) {
      const at = CSS.indexOf(TARGET, from);
      if (at < 0) break;
      from = at + TARGET.length;
      const open = CSS.indexOf('{', at);
      const close = CSS.indexOf('}', at);
      if (open < 0 || (close >= 0 && close < open)) continue;
      const selStart = Math.max(CSS.lastIndexOf('{', at), CSS.lastIndexOf('}', at)) + 1;
      const sel = NORM(CSS.slice(selStart, open));
      if (!sel.includes(TARGET) || !sel.includes(GATE)) continue;
      const body = CSS.slice(open + 1, close);
      if (/backdrop-filter\s*:\s*blur/.test(body)) blurRules.push({ sel, body });
    }
  }
  const lifted = (r) => /z-index\s*:\s*var\(--dsh-dockkit-dock-layer/.test(r.body);
  const stripped = blurRules[0]
    ? { sel: blurRules[0].sel, body: blurRules[0].body.replace(/\s*z-index\s*:\s*var\(--dsh-dockkit-dock-layer[^;]*;/, '') }
    : null;
  const negStripped = stripped ? lifted(stripped) === false : false;
  const synthetic = { sel: TARGET, body: 'backdrop-filter: blur(9px);' };
  const negSynthetic = lifted(synthetic) === false;
  check('H4 右栏面板玻璃规则带 backdrop-filter 就必须抬回 dockkit dock 层（z-index: var(--dsh-dockkit-dock-layer)）',
    blurRules.length >= 1 && blurRules.every(lifted) && negStripped && negSynthetic,
    `blur 规则 ${blurRules.length} 条（未抬层 ${blurRules.filter((r) => !lifted(r)).length}）` +
    ` · 负对照 删真规则抬层被抓到 ${negStripped ? 1 : 0}/1 · 合成无抬层规则被抓到 ${negSynthetic ? 1 : 0}/1`);
}
console.log(failed === 0 ? '\nverify-host-paint-scope: OK' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
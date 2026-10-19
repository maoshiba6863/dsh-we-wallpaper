import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const INVENTORY = join(ROOT, 'test', 'fixtures', 'harness-ui-surfaces.json');
const SURFACE_PREFIX = 'dsh-client-ui-';
const HIDE_MARKERS = ['translate(100%)', 'visibility:hidden', 'visibility: hidden'];
const PANEL_ANCHORS = ['data-sidebar-right-panel', 'data-sidebar-right-open'];
const cssBlobsIn = (src) => {
  const blobs = [];
  for (const m of src.matchAll(/=\s*"((?:\\.|[^"\\])*)"/gs)) {
    const text = m[1].replace(/\\(.)/g, '$1');
    if (text.includes('{') && text.includes('}')) blobs.push(text);
  }
  return blobs;
};
const cssRulesIn = (src) => {
  const rules = [];
  for (const text of cssBlobsIn(src)) {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open === -1) break;
      const prelude = text.slice(text.lastIndexOf('}', open) + 1, open);
      const selector = prelude.slice(prelude.lastIndexOf(';') + 1).trim();
      let depth = 1, j = open + 1;
      while (j < text.length && depth > 0) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
      if (selector) rules.push({ selector, body: text.slice(open + 1, j - 1) });
      i = j;
    }
  }
  return rules;
};
const classesIn = (selector) => [...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((c) => c[1]);
const hideMechanismIn = (src, markers) => {
  const rules = cssRulesIn(src);
  const panelClasses = new Set();
  for (const r of rules) {
    if (PANEL_ANCHORS.some((a) => r.selector.includes(a))) for (const c of classesIn(r.selector)) panelClasses.add(c);
  }
  const scoped = rules.filter((r) => PANEL_ANCHORS.some((a) => r.selector.includes(a))
    || classesIn(r.selector).some((c) => panelClasses.has(c)));
  return markers.filter((m) => scoped.some((r) => r.body.includes(m)));
};
const results = [];
function check(name, ok, detail) {
  results.push(Boolean(ok));
  console.log((ok ? '✓ ' : '✗ ') + name + (detail ? ' — ' + detail : ''));
  return Boolean(ok);
}
function walkJs(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walkJs(p, out);
    else if (ent.name.endsWith('.js')) out.push(p);
  }
  return out;
}
function collectSurfaces(searchRoots) {
  const found = new Map();
  const visit = (dir, depth) => {
    if (!existsSync(dir) || depth > 12) return;
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      if (ent.name.startsWith(SURFACE_PREFIX) && !ent.name.startsWith('.')) {
        if (!found.has(ent.name)) found.set(ent.name, join(dir, ent.name));
      } else if (ent.name === 'node_modules' || ent.name === '@deepseek-ai' || !found.size) {
        visit(join(dir, ent.name), depth + 1);
      }
    }
  };
  for (const r of searchRoots) visit(r, 0);
  return found;
}
function resolveHarnessPkg() {
  const explicit = process.env.DSH_WE_HARNESS_ROOT;
  if (explicit) return explicit;
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return join(globalRoot, '@deepseek-ai', 'dsh');
  } catch {
    return null;
  }
}
const harnessPkg = resolveHarnessPkg();
const harnessOk = Boolean(harnessPkg) && existsSync(join(harnessPkg, 'package.json'));
let harnessVersion = '?';
if (harnessOk) {
  try { harnessVersion = JSON.parse(readFileSync(join(harnessPkg, 'package.json'), 'utf8')).version || '?'; } catch {   }
}
if (!check('已装 harness 可定位（DSH_WE_HARNESS_ROOT 或 npm 全局）', harnessOk,
  harnessOk ? `${harnessPkg} @ ${harnessVersion}` : '找不到 @deepseek-ai/dsh —— 装一个或设 DSH_WE_HARNESS_ROOT')) {
  console.log(`\nHARNESS SURFACES FAILED — ${results.filter((ok) => !ok).length}/${results.length} 条判据不成立`);
  process.exit(1);
}
let inventory;
try { inventory = JSON.parse(readFileSync(INVENTORY, 'utf8')); } catch { inventory = null; }
const known = inventory && typeof inventory.known === 'object' && inventory.known ? inventory.known : {};
const inventoryOk = check('提交清单可解析且非空（known 表是裁定的唯一真源）',
  Object.keys(known).length > 0 && inventory.meta && typeof inventory.meta.seededFrom === 'string',
  INVENTORY);
if (inventoryOk) {
  const badKeys = Object.keys(known).filter((k) => !k.startsWith(SURFACE_PREFIX));
  check('清单键全部是 dsh-client-ui-* 表面（命名空间写错 = 那条裁定永不生效）',
    badKeys.length === 0, badKeys.length ? '越界键：' + badKeys.join(', ') : Object.keys(known).length + ' 个键');
  const badVerdicts = Object.entries(known)
    .filter(([, v]) => !v || !['covered', 'native', 'exempt'].includes(v.verdict));
  check('每个裁定都带合法 verdict（covered / native / exempt）',
    badVerdicts.length === 0, badVerdicts.length ? '非法项：' + badVerdicts.map(([k]) => k).join(', ') : '全部合法');
}
const surfaces = collectSurfaces([join(harnessPkg, 'node_modules'), join(harnessPkg, '..')]);
check('已装 harness 里能枚举到 UI 表面（枚举器空转 = 判据失效）',
  surfaces.size >= 10, surfaces.size + ' 个 dsh-client-ui-* 包');
const newSurfaces = [...surfaces.keys()].filter((s) => !(s in known)).sort();
check('没有未登记的新 UI 表面（新表面必须显式裁定：补美化或写豁免）',
  inventoryOk && surfaces.size >= 10 && newSurfaces.length === 0,
  newSurfaces.length ? '未登记：' + newSurfaces.join(', ') : '清单已覆盖全部 ' + surfaces.size + ' 个');
const stale = Object.keys(known).filter((s) => !surfaces.has(s));
if (stale.length) {
  console.log('  ℹ️ 清单里有 ' + stale.length + ' 个表面不在本机已装 harness（版本差集：本机 harness 较旧或上游已删/改名；改名会以「新表面未登记」被抓到）：'
    + stale.slice(0, 6).join(', ') + (stale.length > 6 ? ' …' : ''));
}
const sidebarDir = surfaces.get(SURFACE_PREFIX + 'sidebar-right');
if (check('dsh-client-ui-sidebar-right 在已装 harness 中（我们 25 处选择器依赖它）',
  Boolean(sidebarDir), sidebarDir || '包缺失 —— 右栏美化所依赖的表面不存在了')) {
  const src = walkJs(sidebarDir).map((f) => readFileSync(f, 'utf8')).join('\n');
  check('属性锚点 data-sidebar-right-panel 仍在源码中（CSS 选择器直接钉它）',
    src.includes('data-sidebar-right-panel'));
  check('属性锚点 data-sidebar-right-open 仍在源码中（开合态选择器直接钉它）',
    src.includes('data-sidebar-right-open'));
  const mechanism = hideMechanismIn(src, HIDE_MARKERS);
  check('隐藏机制仍是已知形态之一（translate 滑出 / visibility 切换；都不在 = 机制换代）',
    mechanism.length > 0, mechanism.length ? '命中：' + mechanism.join(' + ')
      : '已知标记全不在 —— 上游换了隐藏机制，美化适配需复核（#107 型回归）');
}
const ifaceLedger = inventory && inventory.interfaces ? inventory.interfaces : null;
const exemptRules = Array.isArray(ifaceLedger && ifaceLedger.exempt) ? ifaceLedger.exempt : [];
const exemptHit = new Set();
const isExempt = (name) => {
  for (const rule of exemptRules) {
    if (!rule || typeof rule.match !== 'string') continue;
    if (new RegExp(rule.match).test(name)) { exemptHit.add(name); return rule; }
  }
  return null;
};
if (check('台账带 interfaces 豁免表（第三方接口不许静默混进棘轮）',
  Boolean(ifaceLedger) && exemptRules.length > 0 && exemptRules.every((r) => r.why && r.why.length > 10),
  ifaceLedger ? exemptRules.length + ' 条豁免（每条都写了理由）' : '缺 interfaces 段')) {
  const ourSrc = walkJs(join(ROOT, 'src')).map((f) => readFileSync(f, 'utf8')).join('\n');
  const OURS_PREFIX = /^data-we-|^data-webwallgl-|^data-plugin-css$/;
  const concrete = (n) => n.length > 4 && !n.endsWith('-') && !/[<>{}]/.test(n);
  const tokens = [...new Set([...ourSrc.matchAll(/--dsw-[a-z0-9-]+/g)].map((m) => m[0]))].filter(concrete).sort();
  const attrs = [...new Set([...ourSrc.matchAll(/\[(data-[a-z0-9-]+)/g)].map((m) => m[1]))]
    .filter((a) => !OURS_PREFIX.test(a) && concrete(a)).sort();
  const suffixes = [...new Set([...ourSrc.matchAll(/\[class\*="(_[A-Za-z0-9]+)"\]/g)].map((m) => m[1]))]
    .filter(concrete).sort();
  const slots = [...new Set([...ourSrc.matchAll(/data-slot="([^"]+)"/g)].map((m) => m[1]))]
    .filter(concrete).sort();
  const harnessSrc = [...surfaces.values()].flatMap((dir) => walkJs(dir))
    .filter((f) => { try { return statSync(f).size < 8 * 1024 * 1024; } catch { return false; } })
    .map((f) => readFileSync(f, 'utf8')).join('\n');
  const hunt = (list, label, needleOf) => {
    const miss = list.filter((n) => !isExempt(n) && !harnessSrc.includes(needleOf(n)));
    return check('我们依赖的' + label + '仍存在于已装 harness（' + list.length + ' 项）',
      list.length >= 3 && miss.length === 0,
      miss.length ? '已消失：' + miss.join(', ') : list.length + ' 项全部命中');
  };
  hunt(tokens, '设计令牌', (n) => n);
  hunt(attrs, '数据属性锚点', (n) => n);
  hunt(suffixes, '类名后缀锚点', (n) => n);
  const slotShapes = (n) => [`renderSlot("${n}")`, `renderSlotChain("${n}")`, `entriesOf("${n}")`,
    `slotKey: "${n}"`, `registerSlot("${n}")`, `slots.register("${n}")`].some((s) => harnessSrc.includes(s));
  const slotMiss = slots.filter((n) => !isExempt(n) && !slotShapes(n));
  check('我们钉的槽名仍是宿主槽（按调用形状判定；' + slots.length + ' 个）',
    slots.length >= 1 && slotMiss.length === 0,
    slotMiss.length ? '不再是槽：' + slotMiss.join(', ') : slots.join(', ') + ' 全部仍是槽名');
  const exemptNames = new Set([...tokens, ...attrs, ...suffixes, ...slots].filter((n) => isExempt(n)));
  check('覆盖面：接口棘轮的非豁免项足够多（防空转）',
    tokens.length + attrs.length + suffixes.length + slots.length - exemptNames.size >= 20,
    '非豁免接口 ' + (tokens.length + attrs.length + suffixes.length + slots.length - exemptNames.size) + ' 项'
      + '（豁免 ' + exemptNames.size + ' 项 / 规则 ' + exemptRules.length + ' 条）');
}
const failed = results.filter((ok) => !ok).length;
if (failed) console.log(`\nHARNESS SURFACES FAILED — ${failed}/${results.length} 条判据不成立`);
else console.log(`\nHARNESS SURFACES PASSED — ${results.length} 条判据全部成立（harness ${harnessVersion}，表面 ${surfaces.size} 个）`);
process.exit(failed ? 1 : 0);
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) console.log('  ✓ ' + name + (detail ? ' — ' + detail : ''));
  else { console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); failed++; }
};
const section = (t) => console.log('\n' + t);
const rel = (abs) => relative(ROOT, abs).split(sep).join('/');
function globRe(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') { re += '.*'; i++; } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('\\^$+.[]{}()|'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp('^' + re + '$');
}
function coveredBy(r, entry) {
  const e = String(entry).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (!e) return false;
  let isDir = String(entry).endsWith('/');
  if (!isDir) {
    try { isDir = statSync(join(ROOT, e)).isDirectory(); } catch {   }
  }
  if (isDir) return r === e || r.startsWith(e + '/');
  if (/[*?]/.test(e)) return globRe(e).test(r);
  return r === e;
}
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const files = Array.isArray(pkg.files) ? pkg.files : [];
const publishSet = (r) => files.some((entry) => coveredBy(r, entry));
const SKIP_DIRS = new Set(['.git', 'node_modules', '.test-cache', '_refs', '.integration-notes']);
const walk = (dir, out = []) => {
  let names;
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    let st;
    try { st = statSync(abs); } catch { continue; }
    if (st.isDirectory()) walk(abs, out);
    else if (st.isFile()) out.push(rel(abs));
  }
  return out;
};
section('① 可达闭包（活的代码所需文件）是否都被 `files` 覆盖');
function resolveRelative(fromAbs, spec) {
  const base = resolve(dirname(fromAbs), spec.split('?')[0]);
  for (const cand of [base, base + '.js', base + '.mjs', base + '.cjs', join(base, 'index.js')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}
const seen = new Set();
const queue = [join(ROOT, 'lib', 'index.js')];
const bare = new Set();
const unresolved = [];
while (queue.length) {
  const abs = queue.pop();
  if (seen.has(abs) || !existsSync(abs) || !/\.(js|mjs|cjs)$/.test(abs)) continue;
  seen.add(abs);
  const text = readFileSync(abs, 'utf8');
  const specs = [];
  for (const m of text.matchAll(/^\s*(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/gm)) specs.push(m[1]);
  for (const m of text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) specs.push(m[1]);
  for (const m of text.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1]);
  for (const m of text.matchAll(/\.resolve\s*\(\s*['"]([^'".][^'"]*)['"]\s*\)/g)) bare.add(m[1]);
  for (const s of specs) {
    if (s.startsWith('node:')) continue;
    if (!s.startsWith('.')) { bare.add(s); continue; }
    const target = resolveRelative(abs, s);
    if (target === null) { unresolved.push(rel(abs) + ' → ' + s); continue; }
    queue.push(target);
  }
}
const closure = [...seen].map(rel).sort();
function usedByClosure(dep, list = bare) {
  return [...list].some((s) => s === dep || s.startsWith(dep + '/'));
}
const uncovered = closure.filter((r) => !publishSet(r));
check('可达闭包里的每个文件都被 `files` 覆盖', uncovered.length === 0,
  uncovered.length ? '未覆盖：' + uncovered.join(', ') : closure.length + ' 个文件');
check('负对照：覆盖判据对包外路径有牙', !publishSet('src/client.js') && publishSet('lib/index.js'));
check('可达闭包里的每个相对导入目标都在磁盘上（指向不存在的文件 = 装上一加载就 ERR_MODULE_NOT_FOUND）',
  unresolved.length === 0,
  unresolved.length ? '找不到：' + unresolved.join(', ') : closure.length + ' 个文件全部解析到实体');
check('负对照：目标解析判据对缺文件返回 null、对在位与省略扩展名的说明符返回路径',
  resolveRelative(join(ROOT, 'lib', 'index.js'), './definitely-absent.js') === null
  && resolveRelative(join(ROOT, 'lib', 'index.js'), './__absent__') === null
  && resolveRelative(join(ROOT, 'lib', 'index.js'), './pkg-read') === join(ROOT, 'lib', 'pkg-read.js')
  && resolveRelative(join(ROOT, 'lib', 'index.js'), './index.js') === join(ROOT, 'lib', 'index.js'));
check('负对照：依赖判据在 Set 与数组两种形态下都成立（防 `.some` 崩）',
  usedByClosure('some-dep', new Set(['some-dep'])) === true
  && usedByClosure('some-dep', ['some-dep/sub']) === true
  && usedByClosure('nope', new Set(['some-dep'])) === false);
section('② 发布集里没有开发目录');
const DEV = /^(src|scripts|test|docs|node_modules|\.test-cache|\.integration-notes|_refs|\.github|\.git)(\/|$)/;
const SHIPPED_DEV_FILES = new Set();
const isDevLeak = (p) => {
  const e = String(p).replace(/^\.\//, '');
  return DEV.test(e) && !SHIPPED_DEV_FILES.has(e);
};
const devEntries = files.filter((e) => isDevLeak(e));
check('`files` 条目本身不指向开发目录（白名单为空）', devEntries.length === 0,
  devEntries.join(', ') || '无');
const published = walk(ROOT).filter(publishSet);
const devLeak = published.filter((r) => isDevLeak(r));
check('展开后的发布集里没有开发目录文件（白名单为空）', devLeak.length === 0,
  devLeak.length ? devLeak.slice(0, 5).join(', ') + (devLeak.length > 5 ? ` … 共 ${devLeak.length}` : '') : published.length + ' 个文件');
check('白名单是棘轮（当前确实为空，回填即红）', SHIPPED_DEV_FILES.size === 0,
  '白名单 ' + SHIPPED_DEV_FILES.size + ' 条：'
    + ([...SHIPPED_DEV_FILES].join(', ') || '（无豁免：安装期不跑任何仓库脚本）'));
check('负对照：开发目录判据对 src/ 与 scripts/ 有牙（含 prepare.mjs —— 它已不随包）',
  isDevLeak('src/client.js') && isDevLeak('scripts/build-client.mjs')
  && isDevLeak('scripts/prepare.mjs') && !isDevLeak('lib/index.js'));
section('③ 发布文本里没有真实的用户目录路径');
const PLACEHOLDER = /^(<.*>|x{2,}|your[-_]?user|yourname|username|user|name|%[A-Za-z_]+%|\$\{?[A-Za-z_]+\}?)$/i;
const USER_PATH_RE = /[A-Za-z]:\\Users\\([^\\\s"']+)|\/Users\/([^/\s"']+)|\/home\/([^/\s"']+)/g;
const userPathHits = (text) => [...String(text).matchAll(USER_PATH_RE)]
  .map((m) => m[1] || m[2] || m[3] || '')
  .filter((who) => who && !PLACEHOLDER.test(who));
const pathHits = [];
for (const r of published) {
  if (!/\.(js|mjs|cjs|json|yml|yaml|md|swift|ts)$/.test(r)) continue;
  if (r === 'package.json') continue;
  for (const who of userPathHits(readFileSync(join(ROOT, r), 'utf8'))) pathHits.push(r + ' → ' + who);
}
check('发布文本里没有真实用户目录路径（占位符不算）', pathHits.length === 0,
  pathHits.length ? [...new Set(pathHits)].join('; ') : '干净');
const pathSampleReal = 'const p = "C:\\Users\\some-real-user\\AppData";';
const pathSamplePlaceholder = 'const p = "C:\\Users\\%USERPROFILE%\\AppData";';
const realSampleHits = userPathHits(pathSampleReal);
const placeholderSampleHits = userPathHits(pathSamplePlaceholder);
check('覆盖面：路径抽取器在正样本上命中、在占位符样本上不命中（抽取器退化 ⇒ 当场红，不静默恒真）',
  realSampleHits.length === 1 && realSampleHits[0] === 'some-real-user' && placeholderSampleHits.length === 0,
  '正样本 ' + realSampleHits.length + ' 命中（' + (realSampleHits.join(',') || '无') + '）/ 占位符样本 '
    + placeholderSampleHits.length + ' 命中（' + (placeholderSampleHits.join(',') || '无') + '）');
check('负对照：路径判据放行占位符、拦住真实用户名',
  PLACEHOLDER.test('<你的用户名>') && PLACEHOLDER.test('xxx') && PLACEHOLDER.test('%USERPROFILE%')
  && !PLACEHOLDER.test('some-real-user'));
section('④ 每个 dependencies 都被**可达闭包**用到');
const DEP_UNUSED_ALLOW = {};
const deps = Object.keys(pkg.dependencies || {});
const unused = deps.filter((d) => !usedByClosure(d));
const unexpected = unused.filter((d) => !(d in DEP_UNUSED_ALLOW));
check('没有"声明了但活代码从不加载"的依赖', unexpected.length === 0,
  unexpected.join(', ') || deps.join(', ') || '（无声明）');
const depAllowKeys = Object.keys(DEP_UNUSED_ALLOW);
check('棘轮只许缩小：白名单当前确实为空（登记项必须仍未被使用；填上即红）',
  depAllowKeys.length === 0
  && depAllowKeys.every((d) => deps.includes(d) && unused.includes(d)),
  '白名单 ' + depAllowKeys.length + ' 条' + (depAllowKeys.length ? '：' + depAllowKeys.join(', ') : '')
    + '（理由：声明了却从不加载的依赖必须当场删掉，不许登记豁免）');
check('负对照：依赖使用判据对合成输入有牙',
  usedByClosure('left-pad', ['left-pad/sub'])
  && !usedByClosure('left-pad', ['left-padx'])
  && !usedByClosure('left-pad', ['node:fs']));
section('⑤ 入口与导出目标都被发布');
const entries = [
  ['main', pkg.main],
  ["exports['.'].default", pkg.exports?.['.']?.default],
  ["exports['.']  .types", pkg.exports?.['.']?.types],
  ["exports['./client'].default", pkg.exports?.['./client']?.default],
  ["exports['./client'].types", pkg.exports?.['./client']?.types],
  ['types', pkg.types],
  ['dsh.bundle.patch', pkg.dsh?.bundle?.patch],
  ['dsh.client 平台/即时加载', pkg.dsh?.client?.platform === 'web' && pkg.dsh?.client?.immediately === true ? 'lib/index.js' : null],
];
const badEntries = entries.filter(([, p]) => !p || !existsSync(join(ROOT, String(p).replace(/^\.\//, '')))
  || !publishSet(String(p).replace(/^\.\//, '')));
check('每个入口/导出目标都真实存在且被发布', badEntries.length === 0,
  badEntries.map(([k, p]) => k + '=' + p).join(', ') || entries.length + ' 项');
check('`files` 里声明的每个条目都存在（否则 npm 会静默少发）',
  files.every((e) => existsSync(join(ROOT, String(e).replace(/\/+$/, '')))),
  files.filter((e) => !existsSync(join(ROOT, String(e).replace(/\/+$/, '')))).join(', ') || files.length + ' 条');
check('type=module（.js 按 ESM 解析）与 publishConfig.access', pkg.type === 'module'
  && pkg.publishConfig?.access === 'public');
section('⑥ 发布出去的客户端产物可解析、是加载器形态');
const clientRel = String(pkg.exports?.['./client']?.default || 'lib/client.js').replace(/^\.\//, '');
const clientSrc = readFileSync(join(ROOT, clientRel), 'utf8');
check('产物是 DSH 客户端加载器形态（自注册 + factory）',
  clientSrc.startsWith('window.__ModuleLoader__.load({') && clientSrc.includes('factory: (require) => {'));
check('产物可解析（vm.Script —— 与构建同一道网）', (() => {
  try { new Script(clientSrc, { filename: clientRel }); return true; } catch { return false; }
})());
check('负对照：语法网对坏产物有牙', (() => {
  try { new Script('window.__ModuleLoader__.load({ factory: (require) => { ) }', { filename: 'bad.js' }); return false; }
  catch { return true; }
})());
section('⑦ 安装期不得跑任何仓库脚本（无构建钩子 + 不引用未随包文件）');
{
  const INSTALL_HOOKS = ['preinstall', 'install', 'postinstall', 'prepare'];
  const DEV_ONLY = ['prepublishOnly', 'prepack', 'postpack', 'prepublish',
    'build', 'verify', 'verify:docs', 'verify:all', 'verify:bridge', 'verify:e2e', 'smoke',
    'verify:static'];
  const unshippedRefs = (cmd) => [...String(cmd)
    .matchAll(/(?:^|\s)((?:scripts|src|test|docs|\.test-cache)\/[\w./-]+)/g)]
    .map((m) => m[1]).filter((p) => !publishSet(p));
  const offending = Object.entries(pkg.scripts || {})
    .filter(([name, cmd]) => unshippedRefs(cmd).length > 0 && !DEV_ONLY.includes(name));
  check('引用未随包发布文件的脚本只能是开发期脚本', offending.length === 0,
    offending.map(([n, c]) => n + ' → ' + unshippedRefs(c).join(',')).join('; ')
    || Object.keys(pkg.scripts || {}).length + ' 个脚本全部合规');
  check('负对照：安装期脚本引用 scripts/ 会被判出',
    unshippedRefs('node scripts/thing.mjs').length === 1
    && unshippedRefs('node lib/index.js').length === 0
    && unshippedRefs('node myscripts/thing.mjs').length === 0);
  check('负对照：安装期钩子不得被 DEV_ONLY 放行（清单非空才算数）',
    INSTALL_HOOKS.length >= 4 && INSTALL_HOOKS.every((h) => !DEV_ONLY.includes(h)),
    '安装期钩子 ' + INSTALL_HOOKS.length + ' 个：' + INSTALL_HOOKS.join(' '));
  const bannedHooks = INSTALL_HOOKS.filter((h) => h in (pkg.scripts || {}));
  check('无安装期构建钩子（prepare / preinstall / install / postinstall）—— git 直装不得要求 allowBuilds（issue #141）',
    bannedHooks.length === 0, bannedHooks.join(', ') || '无');
  check('构建挂在 prepack 上（发布前在发布者工作区跑；装出来的包直接用 lib/client.js）',
    pkg.scripts && pkg.scripts.prepack === 'node scripts/prepare.mjs', String(pkg.scripts && pkg.scripts.prepack));
}
console.log('');
if (failed) { console.log(`PACKAGE PUBLISH CHECKS FAILED — ${failed} failed`); process.exit(1); }
console.log('ALL PACKAGE PUBLISH CHECKS PASSED');
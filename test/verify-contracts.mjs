import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { panelText } from './tools/src-scope.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) console.log('  ✓ ' + name + (detail ? ' — ' + detail : ''));
  else { console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); failed++; }
};
const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');
const uniq = (xs) => [...new Set(xs)];
const quoted = (s) => [...s.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
console.log('\n① 运行时下限（engines 与代码真实用到的 API 对齐）');
const API_FLOORS = [
  { name: 'global fetch', re: /(^|[^.\w$])fetch\s*\(/gm, since: 18 },
  { name: 'AbortSignal.timeout', re: /AbortSignal\.timeout\s*\(/g, since: 17.3 },
];
function requiredFloor(src) {
  let floor = 0;
  for (const api of API_FLOORS) {
    api.re.lastIndex = 0;
    if (api.re.test(src)) floor = Math.max(floor, api.since);
  }
  return floor;
}
function rangeFloor(range) {
  const nums = [...String(range).matchAll(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/g)]
    .map((m) => Number(m[1]) + (m[2] ? Number('0.' + m[2]) : 0));
  return nums.length ? Math.min(...nums) : 0;
}
const pkg = JSON.parse(read('package.json'));
const hasNodeEngine = (p) => Boolean(p && p.engines && p.engines.node);
{
  const hostSrc = ['lib/index.js', 'lib/media/legacy.js', 'lib/media/index.js', 'lib/media/supervisor.js']
    .map((f) => { try { return read(f); } catch { return ''; } }).join('\n');
  const need = requiredFloor(hostSrc);
  const declared = pkg.engines && pkg.engines.node;
  check('宿主代码里确实用到了有版本要求的 API（判据非空转）', need >= 18,
    '推导出的下限 = ' + need);
  check('package.json 声明了 engines.node', hasNodeEngine(pkg), declared ? String(declared) : '缺失');
  check('声明的下限不低于代码真实下限', declared ? rangeFloor(declared) >= need : false,
    '声明 ' + declared + ' → ' + (declared ? rangeFloor(declared) : '?') + ' / 需要 ' + need);
  check('negative control: 过低的声明会被判不合格', rangeFloor('>=16') < need);
  check('negative control: 缺失声明会被判不合格',
    hasNodeEngine({}) === false && hasNodeEngine({ engines: {} }) === false && hasNodeEngine(pkg) === true);
  check('negative control: 不含版本要求的源码推导出 0（证明判据依赖真实命中）',
    requiredFloor('const x = 1; function f() {}') === 0);
}
console.log('\n② 跨半边契约（读两边源码比对，不是 import 一边自己比）');
function baseOf(src) {
  const m = /const\s+BASE\s*=\s*['"]([^'"]+)['"]/.exec(src);
  return m ? m[1] : null;
}
function hostMimeKeys(src, name) {
  const m = new RegExp('const\\s+' + name + '\\s*=\\s*\\{([^}]*)\\}').exec(src);
  if (!m) return null;
  return uniq([...m[1].matchAll(/['"]([^'"]+)['"]\s*:/g)].map((x) => x[1]));
}
function clientMimeList(src, name) {
  const m = new RegExp('const\\s+' + name + '\\s*=\\s*\\[([^\\]]*)\\]').exec(src);
  return m ? uniq(quoted(m[1])) : null;
}
function acceptLists(src) {
  return [...src.matchAll(/accept:\s*['"]([^'"]+)['"]/g)]
    .map((m) => uniq(m[1].split(',').map((s) => s.trim()).filter(Boolean)));
}
function acceptAssignments(src) {
  return [...src.matchAll(/input\.accept\s*=\s*([^;\n]+)/g)].map((m) => m[1].trim());
}
function weakenedAcceptAssignments(src) {
  return String(src).replace(/(input\.accept\s*=\s*)['"]([^'"]+)['"]/g,
    (_, head, list) => head + '"' + list.split(',').slice(0, -1).join(',') + '"');
}
const hostSrc = read('lib/index.js');
const hostAssetsSrc = read('lib/asset-paths.js');
const apiSrc = read('src/api-client.js');
const clientSrc = read('src/client.js');
const tabsSrc = panelText();
{
  const a = baseOf(hostSrc);
  const b = baseOf(apiSrc);
  check('BASE 两边都能解析出字面量（判据非空转）', Boolean(a) && Boolean(b), 'host=' + a + ' client=' + b);
  check('BASE 两侧一致', a !== null && a === b, a + ' vs ' + b);
  check('negative control: BASE 不一致会被判出',
    baseOf("const BASE = '/a';") !== baseOf("const BASE = '/b';"));
}
{
  const clientUp = clientMimeList(clientSrc, 'UPLOAD_TYPES');
  const hostUp = hostMimeKeys(hostAssetsSrc, 'UPLOAD_EXT');
  const clientFrame = acceptLists(tabsSrc);
  const hostFrame = hostMimeKeys(hostAssetsSrc, 'CUSTOM_FRAME_EXT');
  check('上传 MIME：两侧都解析出非空集合（判据非空转）',
    Boolean(clientUp && clientUp.length >= 3) && Boolean(hostUp && hostUp.length >= 3),
    'client=' + (clientUp || []).length + ' host=' + (hostUp || []).length);
  check('上传 MIME：客户端 UPLOAD_TYPES 与宿主 UPLOAD_EXT 键集一致',
    Boolean(clientUp && hostUp) && sameSet(clientUp, hostUp),
    (clientUp || []).join(',') + ' vs ' + (hostUp || []).join(','));
  const match = clientFrame.find((l) => hostFrame && sameSet(l, hostFrame));
  check('自定义画面 MIME：客户端有一个 accept 列表与宿主 CUSTOM_FRAME_EXT 键集一致',
    Boolean(hostFrame && hostFrame.length >= 3) && Boolean(match),
    'host=' + (hostFrame || []).join(',') + ' client=' + clientFrame.map((l) => l.join(',')).join(' | '));
  const clientAccept = acceptAssignments(clientSrc);
  const acceptCovers = (lists, hostTable) =>
    Boolean(hostTable && hostTable.length >= 3) && lists.some((l) => sameSet(l, hostTable));
  check('覆盖面：选图腿确实写下了 input.accept 赋值点（抽取器退化 ⇒ 当场红，不静默恒真）',
    clientAccept.length >= 1, '赋值点=' + (clientAccept.join(' | ') || '(没抽到)'));
  const hostAvatar = hostMimeKeys(hostSrc, 'AVATAR_EXT');
  check('negative control: 上传 MIME 单边加一种类型会被判出',
    !sameSet(['image/jpeg', 'image/png', 'video/mp4', 'image/webp'], ['image/jpeg', 'image/png', 'video/mp4']));
  check('negative control: 自定义画面 accept 少一种会被判出',
    !sameSet(['image/png', 'image/jpeg'], ['image/jpeg', 'image/png', 'image/webp']));
  const weakenedClient = weakenedAcceptAssignments(clientSrc);
  check('negative control: 客户端选图腿少写一种 MIME（或域被抽空）会被判出',
    !acceptCovers(acceptAssignments(weakenedClient), hostAvatar)
    && !acceptCovers([], hostAvatar));
}
{
  const routeSrc = read('lib/routes/avatar.js');
  const hostNow = read('lib/asset-paths.js');
  const THIN_JSON_ALIAS = /=>\s*sendJson\(res,\s*[^,()]+,\s*[^,()]+\)\s*;/;
  check('头像路由：只认两个 side（路径段当白名单查，不拼进文件名）',
    /AVATAR_SIDES\.includes\(side\)/.test(routeSrc) && /AVATAR_SIDES = \['user', 'ai'\]/.test(hostNow));
  check('头像路由：收体走共享读体器 + 原子落盘（不是第三个流式豁免）',
    /import\s*\{[^}]*bodyReader[^}]*\}\s+from\s+['"]\.\.\/http-body\.js['"]/.test(routeSrc)
    && /bodyReader\(req, \{/.test(routeSrc) && /maxBytes: AVATAR_MAX_BYTES/.test(routeSrc)
    && /atomicWriteFileP\(join\(dir, name\), body\)/.test(routeSrc));
  check('头像路由：换图即清兄弟（同 side 的旧文件先删，否则屏上还是旧图）',
    /name\.slice\(0, side\.length \+ 1\) !== side \+ '-'/.test(routeSrc)
    && /unlinkSync\(join\(dir, name\)\)/.test(routeSrc));
  check('头像路由：文件名带时间戳 + 长缓存由文件名担保 · 未导入 404 且 no-store',
    /avatarStamp\(\)/.test(routeSrc)
    && /'Cache-Control', 'private, max-age=31536000, immutable'/.test(routeSrc)
    && /json\(404, \{ error: 'not-set' \}\)/.test(routeSrc)
    && THIN_JSON_ALIAS.test(routeSrc));
  check('头像落在插件数据目录的 avatars/ 且上限 8MB（不进 overrides / uploads）',
    /function avatarDir\(\) \{ return ensureDirOnce\(join\(pluginDataDir\(\), 'avatars'\)\); \}/.test(hostNow)
    && /AVATAR_MAX_BYTES = 8 \* 1024 \* 1024/.test(hostNow));
}
{
  const kernel = read('lib/settings-schema.js');
  const storeSrc = read('src/fontset-store.js');
  const editorSrc = read('src/fontset-editor.js');
  const routeSrc = read('lib/routes/fontsets.js');
  const tag = /const\s+FONTSET_SCHEMA_TAG\s*=\s*'([^']+)'\s*\+\s*FONTSET_SCHEMA_VERSION/.exec(kernel);
  check('版本标记 = 前缀 + 版本常量，且定义在共享内核（判据非空转）',
    Boolean(tag) && /const\s+FONTSET_SCHEMA_VERSION\s*=\s*\d+/.test(kernel), tag ? tag[1] + 'N' : '(没解析到)');
  const literalSites = ['lib/index.js', 'lib/routes/fontsets.js', 'src/fontset-store.js',
    'src/fontset-editor.js', 'src/client.js', 'src/api-client.js']
    .filter((f) => /dsh-we\/fontset@/.test(read(f)));
  check('字体集的版本字面量只出现在共享内核（两半都引用常量名，不手抄）',
    literalSites.length === 0, literalSites.join(',') || '零处手抄');
  check('客户端预检与宿主校验用的是同一个常量名',
    /FONTSET_SCHEMA_TAG/.test(storeSrc) && /FONTSET_SCHEMA_TAG/.test(routeSrc));
  check('导入走宿主那条路由（客户端 POST 到 /fontsets/import）',
    /fontSetsUrl\(\)\s*\+\s*"\/import"/.test(storeSrc),
    '客户端侧路由拼接');
  check('导入入口的 accept 只提示 .json（真正的门是 $schema，不是扩展名）',
    /accept:\s*"\.json,application\/json"/.test(editorSrc) && /\.json/.test(editorSrc));
  check('negative control: 手抄的版本字面量会被判出',
    /dsh-we\/fontset@/.test("const X = 'dsh-we/fontset@1';") && !/dsh-we\/fontset@/.test('const X = FONTSET_SCHEMA_TAG;'));
}
{
  const SCAN = ['test/compat-harness-pages.mjs', 'test/e2e-web-media-origin.mjs',
    'test/tools/diagnose-web-blank.mjs', 'test/tools/underlay-pixel-rig.mjs',
    'test/tools/sidebar-props-scroll-rig.mjs'];
  const launchSites = (src) => {
    const out = [];
    let from = 0;
    for (;;) {
      const at = src.indexOf('--headless=new', from);
      if (at < 0) break;
      from = at + 1;
      const end = src.indexOf(']', at);
      out.push(src.slice(at, end < 0 ? src.length : end));
    }
    return out;
  };
  const missing = [];
  let sites = 0;
  for (const f of SCAN) {
    const found = launchSites(read(f));
    sites += found.length;
    for (const s of found) if (!s.includes('--use-mock-keychain')) missing.push(f + '(' + s.slice(0, 40).replace(/\s+/g, ' ') + '…)');
  }
  check('每个无头浏览器启动点都带 --use-mock-keychain（macOS 弹真钥匙串会打断跑测的人）',
    sites > 0 && missing.length === 0,
    sites + ' 处启动点 · 漏带=' + missing.length + (missing.length ? ' · ' + missing.join(' | ') : ''));
  check('negative control: 漏带开关的启动数组会被判出',
    launchSites("spawn(b, ['--headless=new', '--enable-unsafe-swiftshader', '--no-ping']);")
      .some((s) => !s.includes('--use-mock-keychain'))
    && !launchSites("spawn(b, ['--headless=new', '--use-mock-keychain']);")
      .some((s) => !s.includes('--use-mock-keychain')));
}
console.log('\n④ CI 平台矩阵（平台条件分支的两半都要有覆盖）');
{
  const workflow = read('.github/workflows/verify.yml');
  const runnersOf = (text) => {
    const out = new Set();
    for (const m of text.matchAll(/runs-on:\s*([^\n#]+)/g)) {
      const v = m[1].trim();
      if (!v.includes('matrix.')) out.add(v.split(/\s+/)[0]);
    }
    const mu = /runs-on:\s*\$\{\{\s*matrix\.([\w-]+)\s*\}\}/.exec(text);
    if (mu) {
      const m = new RegExp('\\b' + mu[1] + ':\\s*\\[([^\\]]*)\\]').exec(text);
      if (m) for (const x of m[1].split(',')) if (x.trim()) out.add(x.trim().replace(/['"]/g, ''));
    }
    return [...out];
  };
  const runners = runnersOf(workflow);
  const isWindows = (r) => /^windows/i.test(r);
  const isPosix = (r) => /^(ubuntu|linux)/i.test(r);
  check('覆盖断言非空转：真的解析到了 runner 清单', runners.length >= 2, 'runners=' + runners.join(', '));
  check('verify.yml 同时跑 Windows 与 POSIX（平台条件分支的两半都有覆盖）',
    runners.some(isWindows) && runners.some(isPosix), 'runners=' + runners.join(', '));
  check('negative control: 只跑 windows 的字面量 runner 会被判出',
    (() => { const r = runnersOf('runs-on: windows-latest\n'); return r.some(isWindows) && !r.some(isPosix); })());
  check('negative control: 只列一个平台的矩阵会被判出',
    (() => { const r = runnersOf('runs-on: ${{ matrix.os }}\nos: [windows-latest]\n'); return r.some(isWindows) && !r.some(isPosix); })());
  check('negative control: 矩阵形态必须被解析出全部平台（否则上面的"两平台"会假绿）',
    JSON.stringify(runnersOf('runs-on: ${{ matrix.os }}\nos: [windows-latest, ubuntu-latest]\n').sort())
      === JSON.stringify(['ubuntu-latest', 'windows-latest']));
}
console.log('\n⑤ CI 工作流的工作流级表达式（作业作用域上下文不得越界）');
{
  const wfDir = join(ROOT, '.github', 'workflows');
  const files = readdirSync(wfDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  const JOB_SCOPED = ['matrix', 'strategy', 'steps', 'needs', 'job'];
  const workflowScopeViolations = (text) => {
    const lines = String(text).split(/\r?\n/);
    const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l));
    if (jobsAt < 0) return null;
    const head = lines.slice(0, jobsAt).join('\n');
    const bad = [];
    for (const ctx of JOB_SCOPED) {
      const re = new RegExp('\\$\\{\\{[^}]*\\b' + ctx + '\\.', 'g');
      bad.push(...(head.match(re) || []).map(() => ctx));
    }
    return uniq(bad);
  };
  const offenders = [];
  let matrixAfterJobs = 0;
  for (const f of files) {
    const text = readFileSync(join(wfDir, f), 'utf8');
    const bad = workflowScopeViolations(text);
    if (bad && bad.length) offenders.push(f + '=' + bad.join(','));
    const lines = text.split(/\r?\n/);
    const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l));
    if (jobsAt >= 0 && /\$\{\{[^}]*\bmatrix\./.test(lines.slice(jobsAt).join('\n'))) matrixAfterJobs++;
  }
  check('工作流级表达式不引用作业作用域上下文（matrix / strategy / steps / needs / job）',
    files.length >= 1 && offenders.length === 0,
    offenders.length ? '命中：' + offenders.join(' ')
      : files.length + ' 个工作流干净（扫描面 = .github/workflows/*.yml）');
  check('覆盖断言非空转：至少一个工作流在 `jobs:` 之后真的用了 matrix.',
    matrixAfterJobs >= 1, 'jobs: 之后出现 matrix. 的工作流数 = ' + matrixAfterJobs);
  check('negative control: 工作流级写 matrix.os 会被判出，写在 jobs: 之后不会',
    (workflowScopeViolations('concurrency:\n  group: x-${{ matrix.os }}\njobs:\n  a:\n    runs-on: ubuntu-latest\n') || []).join(',') === 'matrix'
      && (workflowScopeViolations('jobs:\n  a:\n    concurrency:\n      group: x-${{ matrix.os }}\n') || []).length === 0
      && workflowScopeViolations('on:\n  push:\n') === null);
}
console.log('');
if (failed) { console.log('CONTRACT CHECKS FAILED — ' + failed + ' failed'); process.exit(1); }
console.log('ALL CONTRACT CHECKS PASSED');
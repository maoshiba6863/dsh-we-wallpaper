import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stripComments } from './tools/js-text.mjs';
import { liveText } from './tools/src-scope.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const results = [];
function check(name, ok, detail) {
  results.push(Boolean(ok));
  console.log((ok ? '✓ ' : '✗ ') + name + (detail ? ' — ' + detail : ''));
}
const read = (rel) => readFileSync(ROOT + rel, 'utf8');
const SINKS = ['lib/log.js', 'lib/notice.js'];
const NOT_OURS = [
  [/^lib\/client\.js$/, '构建产物（源在 src/**，由 build-client 内联生成）'],
  [/^lib\/webwallgl\//, '浏览器端渲染页（诊断经 `/diag` 像素上报，不经宿主日志）'],
];
function walkLib(dir, out = []) {
  for (const e of readdirSync(ROOT + dir, { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) walkLib(rel, out);
    else if (/\.(js|mjs)$/.test(e.name)) out.push(rel);
  }
  return out;
}
const LIB_FILES = walkLib('lib').sort();
const N1_FILES = LIB_FILES.filter((f) => !SINKS.includes(f) && !NOT_OURS.some(([rx]) => rx.test(f)));
const CONSOLE_CALL = /(?<![\w$.])console\s*(?:\.\s*[A-Za-z_$][\w$]*|\[)/g;
const consoleCalls = (src) => (stripComments(src).match(CONSOLE_CALL) || []).length;
const NOTICE_CALL = /\bnotice\(\s*(['"])([^'"]+)\1/g;
const noticeLiteralKinds = (src) => [...stripComments(src).matchAll(NOTICE_CALL)].map((m) => m[2]);
const noticeCallCount = (src) => (stripComments(src).match(/\bnotice\s*\(/g) || []).length;
const NOTICE_BUDGET = 2;
const noticeBudgetOk = (kinds, calls, nonLiteral = 0) =>
  Array.isArray(kinds) && kinds.length > 0 && kinds.length <= NOTICE_BUDGET
  && calls.length <= NOTICE_BUDGET && nonLiteral === 0
  && calls.every((k) => kinds.includes(k));
function noticeKinds(src) {
  const block = (stripComments(src).match(/const KINDS = \[([^\]]*)\]/) || [])[1];
  return block === undefined ? null : [...block.matchAll(/(['"])([^'"]+)\1/g)].map((m) => m[2]);
}
function functionBody(src, header) {
  const at = src.indexOf(header);
  if (at < 0) return null;
  const open = src.indexOf('{', at + header.length);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  return null;
}
const LEVEL_NAMES = ['error', 'warn', 'info'];
const levelNamesIn = (src) => LEVEL_NAMES.filter((l) => src.includes("'" + l + "'") || src.includes('"' + l + '"'));
{
  const offenders = [];
  for (const f of N1_FILES) {
    const n = consoleCalls(read(f));
    if (n) offenders.push(f + '=' + n);
  }
  check('N1 `lib/**` 里除 log.js / notice.js 外零 console.*（终端只有一个收口）',
    N1_FILES.length >= 12 && offenders.length === 0,
    offenders.length ? '命中：' + offenders.join(' ')
      : N1_FILES.length + ' 个模块干净（扫描面 = lib/**.{js,mjs} 减去 ' + SINKS.length
        + ' 个 sink 与 ' + NOT_OURS.length + ' 类非自研文件）');
  check('N1 negative control: 合成源码里的 console 调用会被判出，注释里的不会',
    consoleCalls("console.log('x')") === 1 && consoleCalls("console['warn']('x')") === 1
    && consoleCalls("x.console.log('x')") === 0
    && consoleCalls('// console.log("x")') === 0 && consoleCalls('/* console.log("x") */') === 0);
}
const KINDS = noticeKinds(read('lib/notice.js'));
const CALLERS = N1_FILES.filter((f) => f !== 'lib/notice.js');
{
  const calls = [];
  let nonLiteral = 0;
  for (const f of CALLERS) {
    const src = read(f);
    nonLiteral += noticeCallCount(src) - noticeLiteralKinds(src).length;
    calls.push(...noticeLiteralKinds(src));
  }
  check('N2 `notice(` 调用点都在编译期白名单里，且总量不超预算（防退化成第二份日志）',
    noticeBudgetOk(KINDS, calls, nonLiteral),
    '白名单=' + JSON.stringify(KINDS) + ' 调用点=' + calls.length + ' 非字面量=' + nonLiteral
      + ' 预算=' + NOTICE_BUDGET);
  check('N2 negative control: 超预算的白名单 / 未登记的 kind / 非字面量调用都会被判出',
    noticeBudgetOk(['a', 'b', 'c'], ['a', 'b', 'c']) === false
    && noticeBudgetOk(['a', 'b'], ['a', 'b', 'z']) === false
    && noticeBudgetOk(['a', 'b'], ['a', 'b'], 1) === false
    && noticeBudgetOk(['a', 'b'], ['a', 'b']) === true);
}
{
  const sources = CALLERS.map((f) => [f, read(f)]);
  const { counts, bad } = kindCounts(KINDS, sources);
  check('N3 每个 kind 在调用点里恰好出现一次（会话内幂等由运行时 Set 负责）',
    counts.size > 0 && bad.length === 0,
    bad.length ? '次数不为 1：' + bad.map(([k, n]) => k + '=' + n).join(' ')
      : [...counts].map(([k, n]) => k + '=' + n).join(' '));
  const sites = sources.flatMap(([f, src]) => noticeLiteralKinds(src).map((k) => ({ f, k })));
  const first = sites[0] || null;
  const healthy = first !== null && counts.get(first.k) === 1;
  const dupSources = first === null ? [] : sources.map(([f, src]) =>
    [f, f === first.f ? src + "\n  notice('" + first.k + "', 'mutant');" : src]);
  const dropSources = first === null ? [] : sources.map(([f, src]) =>
    [f, f === first.f ? withoutNoticeCall(src, first.k) : src]);
  const dup = first === null ? null : kindCounts(KINDS, dupSources);
  const drop = first === null ? null : kindCounts(KINDS, dropSources);
  check('N3 negative control: 复制一份真调用点 / 抹掉一份真调用点，都会被同一个计数判据判出',
    healthy
    && dup.counts.get(first.k) === 2 && dup.bad.some(([k]) => k === first.k)
    && drop.counts.get(first.k) === 0 && drop.bad.some(([k]) => k === first.k)
    && dup.bad.length + drop.bad.length > 0,
    first === null ? '扫描面里没有调用点可变异'
      : '变异对象=' + first.f + ' 的 ' + first.k + '；复制后=' + dup.counts.get(first.k)
        + ' 抹掉后=' + drop.counts.get(first.k));
}
function kindCounts(kinds, sources) {
  const counts = new Map((kinds || []).map((k) => [k, 0]));
  for (const [, src] of sources) {
    for (const k of noticeLiteralKinds(src)) counts.set(k, (counts.get(k) || 0) + 1);
  }
  return { counts, bad: [...counts.entries()].filter(([, n]) => n !== 1) };
}
function withoutNoticeCall(src, kind) {
  return src.split("notice('" + kind + "'").join('(/*removed*/')
    .split('notice("' + kind + '"').join('(/*removed*/');
}
const LOG_CALL = /log\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
function noticeSuccessSilent(src) {
  const s = stripComments(src);
  const body = functionBody(s, 'function reportFailure(kind, err)');
  if (body === null) return false;
  const all = [...s.matchAll(LOG_CALL)];
  return all.length > 0 && all.every((m) => m[1] === 'warn')
    && [...body.matchAll(LOG_CALL)].length === all.length;
}
{
  check('N4 `lib/notice.js` 成功路径不调用日志；唯一的日志出口是失败处理器的 warn',
    noticeSuccessSilent(read('lib/notice.js')),
    '日志调用=' + JSON.stringify([...stripComments(read('lib/notice.js')).matchAll(LOG_CALL)]
      .map((m) => m[1])) + ' 失败处理器=' + (functionBody(stripComments(read('lib/notice.js')), 'function reportFailure(kind, err)') !== null));
  check('N4 negative control: 成功路径上的 warn / info，以及别处的 warn 都会被判出',
    noticeSuccessSilent("process.stdout.write('x'); log.info('ok');\nfunction reportFailure(kind, err) { log.warn('bad'); }") === false
    && noticeSuccessSilent("process.stdout.write('x'); log.warn('ok');\nfunction reportFailure(kind, err) { log.warn('bad'); }") === false
    && noticeSuccessSilent("process.stdout.write('x');\nfunction reportFailure(kind, err) { log.warn('bad'); }") === true);
}
{
  const hot = [
    ['lib/routes/scene-serve.js', read('lib/routes/scene-serve.js')],
    ['src/live-layer.js', liveText()],
    ['lib/serve.js:handleSceneFiles', functionBody(read('lib/serve.js'), 'function handleSceneFiles(req, res, mount)')],
  ];
  const missing = hot.filter(([, body]) => body === null).map(([n]) => n);
  const hits = hot.filter(([, body]) => body !== null && noticeCallCount(body) > 0).map(([n]) => n);
  check('N5 热路径（请求段 / 客户端半边 / 壁纸文件处理器）里零 notice(',
    missing.length === 0 && hits.length === 0,
    missing.length ? '定位不到代码段：' + missing.join(' ') : (hits.length ? '命中：' + hits.join(' ') : '三段都干净'));
  check('N5 negative control: 同一个计数与同一段提取器在合成热路径上都会命中',
    noticeCallCount("function h(){ notice('scene-ready', 'x'); }") === 1
    && functionBody("function h(){ notice('scene-ready', 'x'); }", 'function h(') !== null
    && functionBody("function h(){ return 1; }", 'function h(') !== null);
}
{
  const host = levelNamesIn(read('lib/log.js'));
  const client = levelNamesIn(liveText());
  check('N6 宿主与客户端声明的三个档位名集合相同（两侧不共享内核，靠判据防漂）',
    host.length === LEVEL_NAMES.length && client.length === LEVEL_NAMES.length
    && LEVEL_NAMES.every((l) => host.includes(l) && client.includes(l)),
    'host=[' + host.join(',') + '] client=[' + client.join(',') + ']');
  check('N6 negative control: 少一个档位名的合成文本会被判出',
    levelNamesIn("const X = { 'error': 1, 'warn': 1 };").length !== LEVEL_NAMES.length
    && levelNamesIn("const X = { 'error': 1, 'warn': 1, 'info': 1 };").length === LEVEL_NAMES.length);
}
function rendererDeclaresLevel(src) {
  return src.includes('/diag?msg=') && /&lvl=\$\{[A-Za-z_$][\w$]*\}/.test(src)
    && LEVEL_NAMES.every((l) => src.includes('"' + l + '"'));
}
{
  const page = 'lib/webwallgl/renderer.js';
  check('N7 渲染页的 `/diag` 上报带 `lvl=`，且 error/warn/info 三档字面量齐',
    rendererDeclaresLevel(stripComments(read(page))), page);
  const THREE = ' "error" "warn" "info"';
  const HAS_LVL = 'return `${t}/diag?msg=${x}&lvl=${lv}`}';
  check('N7 negative control: 缺 `lvl=` / 缺档位字面量 两种坏形态都会被判出',
    rendererDeclaresLevel('/diag?msg=x' + THREE) === false
    && rendererDeclaresLevel(HAS_LVL + THREE.slice(0, THREE.lastIndexOf(' "info"'))) === false
    && rendererDeclaresLevel(HAS_LVL + THREE) === true);
}
const HOST_BASE_RE = /\bconst\s+BASE\s*=\s*'([^']*)'/;
const ROUTE_TEMPLATE_RE = /path:\s*`\$\{BASE\}(\/[^`]*)`/g;
const CLIENT_PAGE_RE = /"(\/[^"]*)\/index\.html\?type="/;
const ABS_REF_RE = /(?:src|href)="(\/[^"]*)"|from\s+"(\/[^"]*)"/g;
function prefixAlignment(hostSrc, routeSrc, clientSrc, pageSrc) {
  const problems = [];
  const base = (stripComments(hostSrc).match(HOST_BASE_RE) || [])[1] ?? null;
  const clientPrefix = (stripComments(clientSrc).match(CLIENT_PAGE_RE) || [])[1] ?? null;
  if (base === null) problems.push("抠不到 lib/index.js 的 `const BASE = '…'`");
  if (clientPrefix === null) problems.push('抠不到 src/live-layer.js 请求的渲染页 URL（`…/index.html?type=`）');
  if (base === null || clientPrefix === null) return problems;
  const routes = new Set([...stripComments(routeSrc).matchAll(ROUTE_TEMPLATE_RE)].map((m) => base + m[1]));
  if (routes.size === 0) problems.push('宿主路由里找不到 `${BASE}/…` 模板（判据无从对齐）');
  if (!routes.has(clientPrefix)) problems.push('客户端请求的渲染页前缀 ' + clientPrefix + ' 宿主没有注册');
  const abs = [...stripComments(pageSrc).matchAll(ABS_REF_RE)].map((m) => m[1] || m[2]);
  if (abs.length) problems.push('渲染页用了绝对引用（不随路由前缀走）：' + abs.join(', '));
  return problems;
}
{
  const src = {
    host: read('lib/index.js'),
    route: read('lib/routes/scene-serve.js'),
    client: liveText(),
    page: read('lib/webwallgl/index.html') + '\n' + read('lib/webwallgl/renderer.js'),
  };
  const problems = prefixAlignment(src.host, src.route, src.client, src.page);
  check('N7③ 客户端渲染页 URL / 宿主注册前缀 / 渲染页相对引用三者对齐（分叉 ⇒ 渲染页 404 而判据全绿）',
    problems.length === 0,
    problems.length ? problems.join(' | ')
      : 'BASE=' + ((stripComments(src.host).match(HOST_BASE_RE) || [])[1] || '?')
        + ' · client=' + ((stripComments(src.client).match(CLIENT_PAGE_RE) || [])[1] || '?'));
  const clientBroken = prefixAlignment(src.host, src.route,
    src.client.replace('"/wallpaper-engine/scene-live/index.html?type="', '"/wallpaper-engine/oops/index.html?type="'), src.page);
  const pageBroken = prefixAlignment(src.host, src.route, src.client,
    src.page.replace('src="./renderer.js"', 'src="/wallpaper-engine/scene-live/renderer.js"'));
  const hostBroken = prefixAlignment(
    src.host.replace("const BASE = '/wallpaper-engine'", "const BASE = '/wp'"), src.route, src.client, src.page);
  const hostGone = prefixAlignment(
    src.host.replace("const BASE = '/wallpaper-engine'", 'const BASE = process.env.WE_BASE'),
    src.route, src.client, src.page);
  check('N7③ negative control: 改客户端前缀 / 渲染页绝对引用 / 改宿主 BASE / 字面量抠不到 —— 四种坏形态都被判出',
    clientBroken.length > 0 && pageBroken.length > 0 && hostBroken.length > 0 && hostGone.length > 0,
    [clientBroken, pageBroken, hostBroken, hostGone].map((p) => p.length).join('/') + ' 处问题');
}
const APPLY_HEADERS = ['export function apply(', 'export async function apply(',
  'async function apply(', 'function apply('];
function applyBody(src) {
  for (const h of APPLY_HEADERS) {
    const body = functionBody(src, h);
    if (body !== null) return body;
  }
  return null;
}
function moduleScopeLogRefs(src) {
  const s = stripComments(src);
  const body = applyBody(s);
  if (body === null) return null;
  return [...s.replace(body, '').matchAll(LOG_CALL)].map((m) => m[0]);
}
{
  const refs = moduleScopeLogRefs(read('lib/index.js'));
  check('N8 模块级代码零 `log.<档位>(` 引用（apply 里的 log 在模块级不存在 ⇒ 未处理拒绝会杀掉宿主）',
    refs !== null && refs.length === 0,
    refs === null ? '定位不到 apply 体（判据失效，必须修）'
      : (refs.length ? '命中：' + refs.join(' ') : 'apply 体之外零引用'));
  check('N8 negative control: 模块级的一条 log.warn 会被判出，apply 体之内的一条不会',
    (moduleScopeLogRefs("function f(){ log.warn('x'); }\nexport function apply(ctx){ log.info('y'); }") || []).length === 1
    && (moduleScopeLogRefs("export function apply(ctx){ log.info('y'); }") || []).length === 0
    && moduleScopeLogRefs('// 没有 apply 的文件') === null);
}
const wiredUp = (src) => /from\s*'\.\/log\.js'/.test(src) && /from\s*'\.\/notice\.js'/.test(src)
  && /createNotice\(/.test(src) && consoleCalls(src) === 0;
{
  check('接线在位：lib/index.js 真的 import 并用上了 log.js / notice.js，且自己零 console.*',
    wiredUp(read('lib/index.js')));
  check('接线在位 negative control: 少一个 import 或自己打一行 console 都会被判出',
    wiredUp("import { createLog } from './log.js';\ncreateNotice(") === false
    && wiredUp("import { createLog } from './log.js';\nimport { createNotice } from './notice.js';\ncreateNotice(1);\nconsole.log('x');") === false);
}
{
  const { createLog } = await import('../lib/log.js');
  const { createNotice } = await import('../lib/notice.js');
  function capture(failWith) {
    const out = [];
    const so = process.stdout.write;
    const se = process.stderr.write;
    const patch = (stream, tag) => {
      stream.write = (chunk, ...rest) => {
        out.push(tag + ':' + String(chunk));
        const cb = rest.find((x) => typeof x === 'function');
        if (typeof cb === 'function') cb(failWith || null);
        return true;
      };
    };
    patch(process.stdout, 'out');
    patch(process.stderr, 'err');
    return {
      out,
      restore() { process.stdout.write = so; process.stderr.write = se; },
    };
  }
  function withTTY(value, fn) {
    const had = Object.prototype.hasOwnProperty.call(process.stdout, 'isTTY');
    const before = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true, writable: true });
    try { return fn(); } finally {
      if (had) Object.defineProperty(process.stdout, 'isTTY', { value: before, configurable: true, writable: true });
      else delete process.stdout.isTTY;
    }
  }
  function withEnv(name, value, fn) {
    const before = process.env[name];
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
    try { return fn(); } finally {
      if (before === undefined) delete process.env[name]; else process.env[name] = before;
    }
  }
  function mirrorLines(level) {
    const platform = [];
    const logger = { error: (m) => platform.push('error:' + m), warn: (m) => platform.push('warn:' + m), info: (m) => platform.push('info:' + m) };
    const log = createLog(logger, 'probe');
    const cap = capture();
    try {
      log.error('E'); log.warn('W'); log.info('I');
    } finally { cap.restore(); }
    return { terminal: cap.out, platform, level };
  }
  const defaultGate = withEnv('DSH_WE_LOG_LEVEL', undefined, () => withTTY(false, () => mirrorLines('default')));
  const infoGate = withEnv('DSH_WE_LOG_LEVEL', 'info', () => mirrorLines('info'));
  const errorGate = withEnv('DSH_WE_LOG_LEVEL', 'error', () => mirrorLines('error'));
  const bogusGate = withEnv('DSH_WE_LOG_LEVEL', 'chatty', () => mirrorLines('chatty'));
  const seen = (r) => r.terminal
    .map((l) => l.replace(/^[a-z]+:\[probe\] /, '').trim())
    .sort().join(',');
  check('R1 `DSH_WE_LOG_LEVEL` 三值真的决定终端镜像哪些档位（默认 warn、非法值按默认）',
    seen(defaultGate) === 'E,W' && seen(infoGate) === 'E,I,W' && seen(errorGate) === 'E'
    && seen(bogusGate) === 'E,W'
    && defaultGate.platform.length === 3,
    'default=' + seen(defaultGate) + ' info=' + seen(infoGate) + ' error=' + seen(errorGate)
      + ' 非法=' + seen(bogusGate) + '（平台通道始终三档全收）');
  check('R1 negative control: 同一个判据能区分三档（判据不是恒真）',
    seen(infoGate) !== seen(defaultGate) && seen(errorGate) !== seen(defaultGate) && seen(infoGate) !== seen(errorGate));
  const noticeRun = (gateValue, tty, failWith, calls = 1) => {
    const logs = [];
    const log = { warn: (m) => logs.push(m), error: (m) => logs.push('ERR' + m), info: (m) => logs.push('INF' + m) };
    const notice = createNotice(log, 'wallpaper-engine');
    const cap = capture(failWith);
    try {
      withTTY(tty, () => withEnv('DSH_WE_NOTICE', gateValue, () => {
        for (let i = 0; i < calls; i++) notice('media-origin', () => 'ok' + i);
      }));
    } finally { cap.restore(); }
    return { terminal: cap.out, logs };
  };
  const forced = noticeRun('1', false, null);
  const silentOff = noticeRun('0', true, null);
  const silentPipe = noticeRun(undefined, false, null);
  const ttyOn = noticeRun(undefined, true, null);
  const twice = noticeRun('1', false, null, 3);
  const failedSync = (() => {
    const logs = [];
    const log = { warn: (m) => logs.push(m) };
    const notice = createNotice(log, 'wallpaper-engine');
    const so = process.stdout.write;
    process.stdout.write = () => { throw new Error('EPIPE'); };
    try { withEnv('DSH_WE_NOTICE', '1', () => notice('scene-ready', 'x')); } finally { process.stdout.write = so; }
    return logs;
  })();
  const failedCallback = (() => {
    const logs = [];
    const log = { warn: (m) => logs.push(m) };
    const notice = createNotice(log, 'wallpaper-engine');
    const cap = capture(new Error('EPIPE'));
    try { withEnv('DSH_WE_NOTICE', '1', () => notice('scene-ready', 'x')); } finally { cap.restore(); }
    return logs;
  })();
  const isNotice = (r) => r.terminal.filter((l) => /^\S*\[wallpaper-engine\] .* ✔\n$/.test(l)).length;
  check('R2 一个 kind 每会话至多一条提示（同一实例内重复调用不再投递）',
    isNotice(forced) === 1 && isNotice(twice) === 1 && twice.terminal.length === forced.terminal.length,
    '一次=' + isNotice(forced) + ' 三次=' + isNotice(twice));
  check('R2 negative control: 换个 kind 会照常投递（幂等键是 kind 而不是"发过了"）',
    isNotice((() => {
      const notice = createNotice({ warn: () => {} }, 'wallpaper-engine');
      const cap = capture();
      try { withEnv('DSH_WE_NOTICE', '1', () => { notice('media-origin', 'a'); notice('scene-ready', 'b'); }); } finally { cap.restore(); }
      return { terminal: cap.out };
    })()) === 2);
  check('R3 `DSH_WE_NOTICE` 三态：`0` 与未设+非 TTY 都静默**且不报**，`1` 强制输出',
    isNotice(forced) === 1 && forced.logs.length === 0
    && forced.terminal.some((l) => l.endsWith('ok0 ✔\n'))
    && isNotice(silentOff) === 0 && silentOff.logs.length === 0 && silentOff.terminal.length === 0
    && isNotice(silentPipe) === 0 && silentPipe.logs.length === 0 && silentPipe.terminal.length === 0
    && isNotice(ttyOn) === 1,
    '强制=' + isNotice(forced) + ' 关=' + isNotice(silentOff) + ' 非TTY=' + isNotice(silentPipe) + ' TTY=' + isNotice(ttyOn));
  check('R3 提示行与日志行同形：`[<name>] <文案> ✔`（前缀同名、`✔` 在后）',
    forced.terminal.length === 1 && forced.terminal[0] === 'out:[wallpaper-engine] ok0 ✔\n',
    JSON.stringify(forced.terminal));
  check('R3 negative control: 旧的 `✔ <文案>` 形状不再被认作提示行',
    isNotice({ terminal: ['out:✔ ok0\n'] }) === 0 && isNotice({ terminal: ['out:[wallpaper-engine] ok0 ✔\n'] }) === 1);
  check('R4 投递失败（同步抛错 / 回调 err）恰好一条 warn，成功路径零日志',
    failedSync.length === 1 && failedCallback.length === 1
    && forced.logs.length === 0 && ttyOn.logs.length === 0,
    '同步=' + failedSync.length + ' 回调=' + failedCallback.length + ' 成功路径=' + forced.logs.length);
  check('R4 negative control: 投递成功的三条路径都没有日志（判据不是"只要有日志就算"）',
    forced.logs.length === 0 && silentOff.logs.length === 0 && silentPipe.logs.length === 0
    && failedSync.length > 0);
  {
    const { registerDiagRoutes } = await import('../lib/routes/diag.js');
    const { EventEmitter } = await import('node:events');
    const routes = [];
    const diagLines = [];
    const platformLevels = [];
    const notices = [];
    const logger = {
      error: (m) => platformLevels.push('error:' + m),
      warn: (m) => platformLevels.push('warn:' + m),
      info: (m) => platformLevels.push('info:' + m),
    };
    const log = createLog(logger, 'wallpaper-engine');
    registerDiagRoutes(
      { register: (entry) => { routes.push(entry); return () => {}; } },
      {
        disposers: [],
        appendDiagLine: (kind, obj) => diagLines.push(kind + ':' + JSON.stringify(obj)),
        base: '/wallpaper-engine',
        log,
        notice: (kind) => notices.push(kind),
      },
    );
    const mkRes = () => {
      const res = new EventEmitter();
      res.setHeader = () => {};
      res.end = () => {};
      res.statusCode = 200;
      return res;
    };
    const getDiag = (query) => {
      const route = routes.find((r) => r.path === '/diag');
      getDiagRes = mkRes();
      route.handler({ method: 'GET', url: '/diag?' + query, headers: {} }, getDiagRes);
    };
    let getDiagRes = null;
    const postClientDiag = (body, size = 0) => {
      const route = routes.find((r) => r.path === '/wallpaper-engine/client-diag');
      const req = new EventEmitter();
      req.method = 'POST';
      req.url = '/wallpaper-engine/client-diag';
      req.headers = {};
      const res = mkRes();
      route.handler(req, res);
      if (size > 64 * 1024) req.emit('data', Buffer.alloc(size));
      else req.emit('data', Buffer.from(JSON.stringify(body)));
      req.emit('end');
      return res;
    };
    const shortLvl = () => platformLevels.map((l) => l.slice(0, l.indexOf(':')));
    const cap = capture();
    let rendererLevels;
    let rendererLines;
    let okStatus;
    let noNoticeForWeb;
    let otherEventStatus;
    let badMethod;
    let tooBig;
    let clientLines;
    try {
      withTTY(false, () => withEnv('DSH_WE_LOG_LEVEL', 'warn', () => withEnv('DSH_WE_NOTICE', undefined, () => {
        getDiag('msg=' + encodeURIComponent('reload 失败'));
        getDiag('msg=' + encodeURIComponent('tex 12'));
        getDiag('msg=' + encodeURIComponent('tex 13') + '&lvl=warn');
        getDiag('msg=' + encodeURIComponent('tex 14') + '&lvl=bogus');
        getDiag('msg=' + encodeURIComponent('tex 15') + '&lvl=info');
        getDiag('msg=' + encodeURIComponent('bake: 后台补烘完成 0 张（失败 0，产物 0.0MB，耗时 0ms）'));
        getDiag('msg=' + encodeURIComponent('tex TERRAIN 512'));
        getDiag('msg=' + encodeURIComponent('bake: 后台补烘完成 2 张（失败 1，产物 1.2MB）'));
      })));
      rendererLevels = shortLvl();
      rendererLines = diagLines.slice();
      platformLevels.length = 0;
      diagLines.length = 0;
      okStatus = postClientDiag({ event: 'live-ready', type: 'scene', id: 'w1', detail: 'firstFrame ok' }).statusCode;
      noNoticeForWeb = postClientDiag({ event: 'live-ready', type: 'web', id: 'w2' }).statusCode;
      otherEventStatus = postClientDiag({ event: 'live-build', type: 'scene', id: 'w3' }).statusCode;
      badMethod = (() => {
        const route = routes.find((r) => r.path === '/wallpaper-engine/client-diag');
        const req = new EventEmitter();
        req.method = 'GET';
        req.url = '/wallpaper-engine/client-diag';
        req.headers = {};
        const res = mkRes();
        route.handler(req, res);
        return res.statusCode;
      })();
      tooBig = postClientDiag({ event: 'x' }, 65 * 1024).statusCode;
      clientLines = diagLines.slice();
    } finally { cap.restore(); }
    check('R5 `/diag` 按失败模式表分档：失败类 ⇒ warn，其余 ⇒ info；`&lvl=` 三档优先、未知回落模式表',
      rendererLevels.join(',') === 'warn,info,warn,info,info,info,info,warn'
      && rendererLines.length === 8 && rendererLines.every((l) => l.startsWith('renderer:')),
      '档位=' + rendererLevels.join(',') + ' 落盘=' + rendererLines.length + ' 条（落盘与分级互不影响）');
    check('R5 `/client-diag` 的 `live-ready`+`scene` 走提示通道，且只此一条',
      notices.length === 1 && notices[0] === 'scene-ready' && okStatus === 204
      && noNoticeForWeb === 204 && otherEventStatus === 204
      && clientLines.length === 3 && clientLines.every((l) => l.startsWith('client:')),
      '提示=' + JSON.stringify(notices) + '；落盘 ' + clientLines.length + ' 条（网页类型 / 其它事件都不触发提示）');
    check('R5 三条早退不变：非 POST ⇒ 405、超 64KB ⇒ 413（且都不落盘、不提示）',
      badMethod === 405 && tooBig === 413 && notices.length === 1,
      '405=' + badMethod + ' 413=' + tooBig + ' 提示仍为 ' + notices.length);
  }
}
const failed = results.filter((r) => !r).length;
console.log('\n' + (failed ? 'LOGGING FAIL — ' + failed + ' check(s) failed' : 'ALL LOGGING CHECKS PASSED'));
process.exit(failed ? 1 : 0);
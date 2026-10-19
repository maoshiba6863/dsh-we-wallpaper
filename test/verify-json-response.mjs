import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { stripComments } from './tools/js-text.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(ROOT, 'lib');
const EXCLUDE_DIRS = new Set(['vendor', 'webwallgl']);
const EXCLUDE_FILES = new Set(['client.js']);
const SOLE_IMPLEMENTATION = 'lib/json-response.js';
const CALL_SITE_FLOOR = 12;
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) console.log('  ✓ ' + name + (detail ? ' — ' + detail : ''));
  else { console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); failed++; }
};
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walk(p, out);
    } else if (entry.name.endsWith('.js') && !EXCLUDE_FILES.has(entry.name)) {
      out.push(p);
    }
  }
  return out;
}
function matchBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < text.length) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i] === quote) break;
        i++;
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}
function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}
const BLOCK_HEADS = [
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\([^)]*\)\s*=>\s*\{/g,
  /function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g,
];
const PURE_LINES = [
  /^res\.statusCode\s*=\s*.+;$/,
  /^res\.setHeader\(\s*['"][^'"]+['"]\s*,\s*.+\s*\);$/,
  /^res\.end\(\s*JSON\.stringify\(.+\)\s*\);$/,
  /^res\.end\(.+\);$/,
];
function isPureJsonBody(body) {
  const lines = body.split('\n').map((l) => l.trim()).filter((l) => l !== '' && l !== '{' && l !== '}');
  if (lines.length < 2 || lines.length > 4) return false;
  if (!lines.every((l) => PURE_LINES.some((re) => re.test(l)))) return false;
  if (!lines.some((l) => /^res\.setHeader\(\s*['"]Content-Type['"]\s*,\s*['"]application\/json/.test(l))) return false;
  if (!lines.some((l) => /^res\.end\(\s*JSON\.stringify\(/.test(l))) return false;
  return true;
}
function inlineJsonHelpers(src) {
  const out = [];
  for (const re of BLOCK_HEADS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const braceIdx = src.indexOf('{', m.index + m[0].length - 1);
      if (braceIdx === -1) continue;
      const end = matchBrace(src, braceIdx);
      if (end === -1) continue;
      if (!isPureJsonBody(src.slice(braceIdx, end + 1))) continue;
      out.push({ name: m[1], line: lineAt(src, m.index) });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}
const INLINE_COPY = [
  'const json = (code, payload) => {',
  "  res.statusCode = code;",
  "  res.setHeader('Content-Type', 'application/json; charset=utf-8');",
  "  res.setHeader('Cache-Control', 'no-store');",
  '  res.end(JSON.stringify(payload));',
  '};',
].join('\n');
const THIN_ALIAS = "const json = (code, payload) => sendJson(res, code, payload);";
{
  check('负对照：内联三行样板被判出',
    inlineJsonHelpers(INLINE_COPY).map((h) => h.name).join() === 'json',
    '报出=[' + inlineJsonHelpers(INLINE_COPY).map((h) => h.name).join() + ']');
  check('正对照：薄别名（无块体、委托共享实现）放行', inlineJsonHelpers(THIN_ALIAS).length === 0);
  check('负对照：`function` 形态同样被判出',
    inlineJsonHelpers("function jsonOut(res, code, p) {\n  res.statusCode = code;\n"
      + "  res.setHeader('Content-Type', 'application/json; charset=utf-8');\n"
      + '  res.end(JSON.stringify(p));\n}').length === 1);
  check('负对照：大处理器里顺带发一次 JSON **不**被判出（行数远超 4）',
    inlineJsonHelpers('const handle = (req, res) => {\n'
      + "  const method = (req.method || 'GET').toUpperCase();\n"
      + "  res.setHeader('Content-Type', 'application/json; charset=utf-8');\n"
      + "  res.setHeader('X-A', '1'); res.setHeader('X-B', '2');\n"
      + "  res.statusCode = 200;\n"
      + '  res.end(JSON.stringify({ ok: true }));\n};').length === 0);
  check('负对照：`fail(code, payload)` 那种"先置失败位再应答"的包装**不**被判出（纯字边界）',
    inlineJsonHelpers("const fail = (code, payload) => {\n"
      + '  if (failed) return;\n'
      + '  failed = true;\n'
      + '  res.statusCode = code;\n'
      + "  res.setHeader('Content-Type', 'application/json; charset=utf-8');\n"
      + '  res.end(JSON.stringify(payload));\n'
      + '  lingerClose(req, res);\n};').length === 0);
  check('负对照：字符串/注释里的样板不算（判据先剥注释）',
    inlineJsonHelpers(stripComments('// ' + INLINE_COPY.replace(/\n/g, '\n// '))).length === 0);
}
const files = walk(LIB).sort().filter((f) => relative(ROOT, f).split('\\').join('/') !== SOLE_IMPLEMENTATION);
const hits = [];
for (const file of files) {
  const rel = relative(ROOT, file).split('\\').join('/');
  const text = stripComments(readFileSync(file, 'utf8'));
  for (const h of inlineJsonHelpers(text)) hits.push({ ...h, file: rel });
}
console.log(`\n  扫描面：lib/**/*.js（排除 ${[...EXCLUDE_DIRS].join(' / ')} / ${[...EXCLUDE_FILES].join(' / ')}`
  + ` / ${SOLE_IMPLEMENTATION}） —— ${files.length} 个文件`);
console.log(`  内联 JSON 应答助手：${hits.length} 处`);
for (const h of hits) console.log(`    · ${h.file}:${h.line}（${h.name}）`);
console.log('');
check('覆盖面：lib 下扫到 ≥ 20 个 .js（判据面为空即失败）', files.length >= 20, `实测 ${files.length}`);
check(`唯一实现：${SOLE_IMPLEMENTATION} 之外**零**份内联 JSON 应答助手`,
  hits.length === 0, hits.map((h) => `${h.file}:${h.line}(${h.name})`).join(', ') || '零副本');
{
  const abs = join(ROOT, SOLE_IMPLEMENTATION);
  check(`${SOLE_IMPLEMENTATION} 在磁盘上`, existsSync(abs));
  if (existsSync(abs)) {
    const src = readFileSync(abs, 'utf8');
    check('共享实现导出 `sendJson`', /export\s+function\s+sendJson\s*\(/.test(src));
    check('共享实现真的发 JSON（`Content-Type` + `JSON.stringify(payload)` + `res.end(`）',
      /'Content-Type',\s*'application\/json; charset=utf-8'/.test(src)
      && /JSON\.stringify\(payload\)/.test(src) && /res\.end\(/.test(src));
    check('共享实现的压缩是协商式的（阈值 + `res.req` 协商 + `Vary`）',
      /GZIP_MIN_BYTES\s*=\s*\d+/.test(src) && /res\.req/.test(src)
      && /'Vary',\s*'Accept-Encoding'/.test(src) && /'Content-Encoding',\s*'gzip'/.test(src));
    check('压缩没有改签名（仍是 4 个形参：res / code / payload / cacheControl）',
      /export\s+function\s+sendJson\s*\(\s*res\s*,\s*code\s*,\s*payload\s*,\s*cacheControl\s*=\s*'no-store'\s*\)/.test(src));
    check('共享实现默认 `no-store`，并保留 `null` = 不写该头的出口',
      /no-store/.test(src) && /cacheControl !== null/.test(src));
    check('正对照：共享实现**不**被判据面命中（它多一行 `if (…)` ⇒ 不是"纯"样板，故不在面内）',
      inlineJsonHelpers(stripComments(src)).length === 0);
  }
}
{
  const ROUTES = join(LIB, 'routes');
  const routeFiles = existsSync(ROUTES)
    ? readdirSync(ROUTES).filter((n) => n.endsWith('.js')).sort().map((n) => 'lib/routes/' + n)
    : [];
  const callers = [];
  for (const rel of routeFiles) {
    const raw = readFileSync(join(ROOT, rel), 'utf8');
    const code = stripComments(raw);
    const calls = (code.match(/\bsendJson\s*\(/g) || []).length;
    if (!calls) continue;
    callers.push({ rel, calls, imported: /from\s+['"][^'"]*json-response\.js['"]/.test(code) });
  }
  const callSites = callers.reduce((n, c) => n + c.calls, 0);
  check('覆盖面：路由模块被枚举到（≥ 10 个 .js）', routeFiles.length >= 10, `实测 ${routeFiles.length}`);
  check(`棘轮：\`sendJson(\` 调用点 ≥ ${CALL_SITE_FLOOR}（只许增，防"靠删调用点凑出的假收敛"）`,
    callSites >= CALL_SITE_FLOOR, `实测 ${callSites} 处 / ${callers.length} 个文件`);
  const notImported = callers.filter((c) => !c.imported).map((c) => c.rel);
  check('每个调用 `sendJson(` 的路由文件都 import 自共享实现（否则是另一个同名东西）',
    notImported.length === 0, notImported.join(', ') || '全部已 import');
  const victim = callers.find((c) => /const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*sendJson\(/.test(
    readFileSync(join(ROOT, c.rel), 'utf8')));
  if (victim) {
    const real = readFileSync(join(ROOT, victim.rel), 'utf8');
    const perturbed = stripComments(real).replace(
      /const\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>\s*sendJson\(res,\s*([^;]*)\);/,
      (full, name, args) => 'const ' + name + ' = (' + args + ') => {\n'
        + "  res.setHeader('Content-Type', 'application/json; charset=utf-8');\n"
        + '  res.end(JSON.stringify(' + args.split(',').pop().trim() + '));\n};');
    const found = inlineJsonHelpers(perturbed);
    check('负对照：把真实薄别名换回内联形态，判据精确报出（真实文本确实过了判据）',
      found.length === 1 && perturbed !== stripComments(real),
      victim.rel + ' → ' + (found.map((h) => h.name).join() || '（没报出来）'));
  } else {
    check('负对照：找到一个真实薄别名做扰动', false, '没有形如 `const X = (…) => sendJson(…)` 的别名');
  }
}
{
  const { sendJson } = await import(pathToFileURL(join(ROOT, SOLE_IMPLEMENTATION)).href);
  const call = (payload, accept, method = 'GET') => {
    const headers = {};
    let body = null;
    const res = {
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      end(b) { body = b; },
    };
    if (accept !== undefined) res.req = { method, headers: accept === null ? {} : { 'accept-encoding': accept } };
    sendJson(res, 200, payload);
    return { headers, body };
  };
  const big = { wallpapers: Array.from({ length: 300 }, (_, i) => ({ id: 'p' + i, title: 'x'.repeat(32) })) };
  const bigJson = JSON.stringify(big);
  const small = { ok: true };
  const plain = call(big, undefined);
  check('假 res（无 req）⇒ 不压缩，body 就是 JSON 字节（旧行为逐字节不变）',
    plain.headers['content-encoding'] === undefined && plain.body.toString('utf8') === bigJson);
  const gz = call(big, 'gzip, deflate, br');
  check('accept-encoding: gzip + 大载荷 ⇒ Content-Encoding: gzip，gunzip 后逐字节等于 JSON',
    gz.headers['content-encoding'] === 'gzip' && gz.headers.vary === 'Accept-Encoding'
    && gunzipSync(gz.body).toString('utf8') === bigJson,
    '压缩后 ' + gz.body.length + ' B / 原始 ' + Buffer.byteLength(bigJson) + ' B');
  check('压缩确实变小了（不是"压了但更大"）', gz.body.length < Buffer.byteLength(bigJson));
  const tiny = call(small, 'gzip');
  check('小载荷（< 1 KB）不压：省不下 1 KB 却要多两个头',
    tiny.headers['content-encoding'] === undefined && tiny.body.toString('utf8') === JSON.stringify(small));
  const q0 = call(big, 'gzip;q=0');
  check('`gzip;q=0` = 客户端明确不要 ⇒ 不压（协商不是"看见 gzip 字样就压"）',
    q0.headers['content-encoding'] === undefined);
  const head = call(big, 'gzip', 'HEAD');
  check('HEAD ⇒ 不压（与宿主 compression 中间件同口径：只回头、不回体）',
    head.headers['content-encoding'] === undefined);
  const identity = call(big, 'identity');
  check('负对照：只声明 identity ⇒ 不压（证明上面那条不是恒真）',
    identity.headers['content-encoding'] === undefined);
}
console.log('');
if (failed) {
  console.log(`JSON-RESPONSE CHECKS FAILED — ${failed} 条不合格`);
   
  console.log('修法：删掉那份内联副本，改成薄别名 —— 路由文件里从 `../json-response.js` 引入 '
    + '`sendJson`（例 `const json = (code, payload) => sendJson(res, code, payload);`）；调用点不用改。');
  process.exit(1);
}
console.log('JSON-RESPONSE CHECKS PASSED');
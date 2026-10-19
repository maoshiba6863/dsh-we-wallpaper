import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './tools/js-text.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(ROOT, 'lib');
const EXCLUDE_DIRS = new Set(['vendor', 'webwallgl']);
const EXCLUDE_FILES = new Set(['client.js']);
const CAP_RE = /(?:\.length|\bsize\b|\bbytes\b|\blen\b|\bcount\b)\s*>\s*(?:[A-Za-z_$][\w$]*|\d)/;
const SITE_RE = /req\.(?:on|once)\(\s*['"]data['"]\s*,\s*/g;
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
function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
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
function findBodyReadSites(src) {
  const sites = [];
  SITE_RE.lastIndex = 0;
  let m;
  while ((m = SITE_RE.exec(src)) !== null) {
    const start = m.index + m[0].length;
    const line = lineAt(src, m.index);
    const rest = src.slice(start);
    const bare = /^([A-Za-z_$][\w$]*)\s*\)/.exec(rest);
    if (bare) {
      sites.push({ line, kind: 'non-collector', name: bare[1], callback: '' });
      continue;
    }
    const viaReader = /^([A-Za-z_$][\w$]*)\.onData\s*\)/.exec(rest);
    if (viaReader) {
      sites.push({ line, kind: 'reader', name: viaReader[1], callback: '' });
      continue;
    }
    const braceIdx = src.indexOf('{', start);
    if (braceIdx === -1) {
      sites.push({ line, kind: 'unparsable', callback: '' });
      continue;
    }
    const end = matchBrace(src, braceIdx);
    if (end === -1) {
      sites.push({ line, kind: 'unparsable', callback: '' });
      continue;
    }
    sites.push({ line, kind: 'collector', callback: src.slice(braceIdx, end + 1) });
  }
  return sites;
}
const hasCap = (callback) => CAP_RE.test(callback);
check('负对照：无上限的内联回调被判不合格',
  hasCap('{ body += c; }') === false, 'snippet={ body += c; }');
check('正对照：字节计上限被判合格',
  hasCap('{ size += c.length; if (size > CONTROL_JSON_MAX_BYTES) { return; } chunks.push(c); }') === true,
  'snippet=size > CONTROL_JSON_MAX_BYTES');
check('正对照：`.length` 形式的闸也被认',
  hasCap('{ body += c; if (body.length > SETTINGS_MAX_BYTES) fail(413); }') === true);
{
  const synth = "req.on('data', (c) => { body += c; });\n"
    + "req.on('data', (c) => { size += c.length; if (size > 1024) return; chunks.push(c); });\n"
    + "req.on('data', arm);\n";
  const found = findBodyReadSites(synth);
  check('负对照：抽取器认出内联收集器', found.filter((s) => s.kind === 'collector').length === 2,
    'collectors=' + found.filter((s) => s.kind === 'collector').length);
  check('负对照：裸标识符回调归为非收集器（豁免是结构性的）',
    found.some((s) => s.kind === 'non-collector' && s.name === 'arm'));
  check('负对照：抽取器对合成源码能判出上限的有无',
    hasCap(found[0].callback) === false && hasCap(found[1].callback) === true);
  check('负对照：抽取器返回空表时判据会失败（覆盖面地板有牙）',
    findBodyReadSites('const x = 1;').length === 0);
}
{
  const outside = "req.on('data', (c) => { body += c; });\nconst limit = size > 1024;\n";
  const found = findBodyReadSites(outside);
  check('负对照：上限在回调**外** ⇒ 该站点仍判不合格（作用域 = 回调体内）',
    found.length === 1 && found[0].kind === 'collector'
      && hasCap(found[0].callback) === false && CAP_RE.test(outside) === true,
    '文件级有比较、回调级没有');
}
const files = walk(LIB).sort();
const sites = [];
for (const file of files) {
  const text = stripComments(readFileSync(file, 'utf8'));
  for (const site of findBodyReadSites(text)) {
    sites.push({ ...site, file: relative(ROOT, file).split('\\').join('/') });
  }
}
const collectors = sites.filter((s) => s.kind === 'collector');
const uncapped = collectors.filter((s) => !hasCap(s.callback));
const unparsable = sites.filter((s) => s.kind === 'unparsable');
const readers = sites.filter((s) => s.kind === 'reader');
const INLINE_CEILING = 2;
const READER_FLOOR = 9;
const READER_MODULE = 'lib/http-body.js';
const readerVarsIn = (src) => new Set(
  [...src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*bodyReader\s*\(/g)].map((m) => m[1]));
const readerSource = existsSync(join(ROOT, READER_MODULE)) ? readFileSync(join(ROOT, READER_MODULE), 'utf8') : '';
const srcByFile = new Map();
for (const file of files) srcByFile.set(relative(ROOT, file).split('\\').join('/'), readFileSync(file, 'utf8'));
const bogusReaders = readers.filter((s) => !readerVarsIn(srcByFile.get(s.file) || '').has(s.name));
const readerFiles = new Set(readers.map((s) => s.file));
const notImported = [...readerFiles].filter((f) => !/from\s+['"][^'"]*http-body\.js['"]/.test(srcByFile.get(f) || ''));
console.log(`\n  扫描面：lib/**/*.js（排除 ${[...EXCLUDE_DIRS].join(' / ')} 与 ${[...EXCLUDE_FILES].join(' / ')}）`
  + ` —— ${files.length} 个文件`);
console.log(`  收 body 站点：${sites.length}（内联收集器 ${collectors.length} · 共享读体器 ${readers.length}`
  + ` · 非收集器 ${sites.length - collectors.length - readers.length - unparsable.length}）`);
for (const s of collectors) {
  console.log(`    ${hasCap(s.callback) ? '✓' : '✗'} ${s.file}:${s.line}（内联）`);
}
for (const s of readers) {
  console.log(`    ${bogusReaders.includes(s) ? '✗' : '·'} ${s.file}:${s.line}（共享读体器 ${s.name}）`);
}
console.log('');
check('覆盖面：收 body 站点总数 ≥ 8（空表或解析退化即失败）', sites.length >= 8,
  `实测 ${sites.length}`);
check('判据可判定：没有配对失败的站点（宁可红，不可静默跳过）', unparsable.length === 0,
  unparsable.map((s) => `${s.file}:${s.line}`).join(', ') || '无');
check('每一个**内联**收集器都在回调体内有上限（流式豁免那两处也在这里被逐站点名）',
  uncapped.length === 0,
  uncapped.map((s) => `${s.file}:${s.line}`).join(', ') || '全部有闸');
check('棘轮：内联收集器 ≤ ' + INLINE_CEILING + '（P4-13 的收敛方向：终点 = 2 处流式豁免）',
  collectors.length <= INLINE_CEILING, `实测 ${collectors.length}`);
check('棘轮：共享读体器 `' + READER_MODULE + '` 存在，且自身带字节计闸',
  readerSource !== '' && /(?:\.length|\bsize\b|\bbytes\b)\s*>\s*maxBytes/.test(readerSource),
  readerSource === '' ? '文件不存在'
    : '上限语句=' + (/(?:\.length|\bsize\b|\bbytes\b)\s*>\s*maxBytes/.test(readerSource) ? '在位' : '缺失'));
check('棘轮：共享读体器的调用点 ≥ ' + READER_FLOOR + '（只许增，防"只剩一份"靠删调用点达成）',
  readers.length >= READER_FLOOR, `实测 ${readers.length}`);
check('每个 `X.onData` 都真的来自同一文件里的 `bodyReader(...)`（任意 `foo.onData` 蒙混不过去）',
  bogusReaders.length === 0,
  bogusReaders.map((s) => `${s.file}:${s.line}(${s.name})`).join(', ') || '全部来自 bodyReader');
check('用了共享读体器的文件都 import 了它（没 import 就是另一个同名东西）',
  notImported.length === 0, notImported.join(', ') || '全部已 import');
const FLAG_SET_RE = /(?:^|[^\w.$])([A-Za-z_$][\w$]*)\s*=\s*(?:true|false|\d+)\b/g;
const isDefinition = (code, at) => /function\s+$/.test(code.slice(Math.max(0, at - 12), at));
const undeclaredFlags = [];
for (const [rel, src] of srcByFile) {
  const code = stripComments(src);
  for (const m of code.matchAll(/bodyReader\s*\(/g)) {
    if (isDefinition(code, m.index)) continue;
    const optsStart = code.indexOf('{', m.index);
    if (optsStart < 0) continue;
    const optsEnd = code.indexOf('});', optsStart);
    const opts = code.slice(optsStart, optsEnd < 0 ? code.length : optsEnd + 3);
    const before = code.slice(0, m.index);
    for (const f of new Set([...opts.matchAll(FLAG_SET_RE)].map((x) => x[1]))) {
      if (!new RegExp('(?:let|const|var)\\s+' + f + '\\b').test(before)) {
        undeclaredFlags.push(rel + ':' + f);
      }
    }
  }
}
check('每个共享读体器调用点里被置位的标志，都在**它之前**声明过（闭包捕获不存在的名字 = 一收体就 ReferenceError）',
  undeclaredFlags.length === 0, undeclaredFlags.join(', ') || '全部已声明');
{
  const ok = 'let done = false;\nconst r = bodyReader(req, {\n  shouldStop: () => done,\n  onOverflow: () => { done = true; },\n});';
  const bad = 'const r = bodyReader(req, {\n  onOverflow: () => { done = true; },\n});';
  const probe = (src) => {
    const code = stripComments(src);
    const r = [];
    for (const m of code.matchAll(/bodyReader\s*\(/g)) {
      const s = code.indexOf('{', m.index);
      const e = code.indexOf('});', s);
      for (const f of new Set([...code.slice(s, e + 3).matchAll(FLAG_SET_RE)].map((x) => x[1]))) {
        if (!new RegExp('(?:let|const|var)\\s+' + f + '\\b').test(code.slice(0, m.index))) r.push(f);
      }
    }
    return r;
  };
  check('negative control: 声明在位时判合格', probe(ok).length === 0);
  check('negative control: 声明被挪走时判出来（本轮实测的那个形状）', probe(bad).join(',') === 'done');
  check('negative control: 字符串里的 `charset=utf-8` 不得被当成标志', probe("const r = bodyReader(req, { onOverflow: () => res.setHeader('Content-Type', 'application/json; charset=utf-8') });").length === 0);
}
{
  const fromReader = 'const r = bodyReader(req, { maxBytes: 1 });\nreq.on("data", r.onData);\n';
  const handmade = 'const r = makeReader();\nreq.on("data", r.onData);\n';
  const bogusCount = (src) => findBodyReadSites(src)
    .filter((s) => s.kind === 'reader' && !readerVarsIn(src).has(s.name)).length;
  check('negative control: `reader.onData` 来自 bodyReader 时判合格',
    bogusCount(fromReader) === 0 && findBodyReadSites(fromReader).some((s) => s.kind === 'reader'));
  check('negative control: 自己造的 `X.onData` 被判出来（不是"长得像就放行"）', bogusCount(handmade) === 1);
  check('negative control: 内联回调仍按"回调体内有没有闸"判（不被新分类顺带放过）',
    findBodyReadSites("req.on('data', (c) => { chunks.push(c); });")
      .filter((s) => s.kind === 'collector' && !hasCap(s.callback)).length === 1);
}
console.log('');
if (failed) {
  console.log(`BODY-CAP CHECKS FAILED — ${failed} 条不合格`);
  console.log('修法：按 lib/routes/upload.js 文件头的两条不变量改 —— 边收边计字节（size += chunk.length）、'
    + '超限即 413 早退、收完只 Buffer.concat(...).toString("utf8") 解码一次。');
  process.exit(1);
}
console.log('BODY-CAP CHECKS PASSED');
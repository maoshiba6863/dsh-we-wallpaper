import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './js-text.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const guardFiles = readdirSync(join(ROOT, 'test'), { withFileTypes: true })
  .filter((e) => e.isFile() && /^(verify-.*|.*-smoke)\.mjs$/.test(e.name))
  .map((e) => 'test/' + e.name)
  .sort();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);
const EVAL_METHODS = ['.forEach(', '.every(', '.some('];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function staleControls(src) {
  const lines = src.split('\n');
  const idents = new Map();
  lines.forEach((line, i) => {
    if (isComment(line)) return;
    for (const m of line.matchAll(/([A-Za-z_$][\w$]*)\.push\(/g)) {
      if (!idents.has(m[1])) idents.set(m[1], []);
      const decl = new RegExp('(?:const|let|var)\\s+' + esc(m[1]) + '\\s*=');
      if (decl.test(line)) idents.get(m[1]).push(i + 1);
    }
  });
  const out = [];
  const declared = (id) => new RegExp('(?:const|let|var)\\s+' + esc(id) + '\\b').test(src);
  for (const [id, decls] of idents) {
    if (!declared(id)) continue;
    const pushAt = [];
    const evalAt = [];
    lines.forEach((line, i) => {
      if (isComment(line)) return;
      const n = i + 1;
      if (new RegExp('\\b' + esc(id) + '\\.push\\(').test(line)) pushAt.push(n);
      const ofLoop = new RegExp('for\\s*\\(\\s*const\\s+\\[?[^\\]]*\\]?\\s+of\\s+' + esc(id) + '\\b').test(line);
      const method = EVAL_METHODS.some((m) => new RegExp('\\b' + esc(id) + esc(m)).test(line));
      if (ofLoop || method) evalAt.push(n);
    });
    if (!pushAt.length || !evalAt.length) continue;
    const lastPush = Math.max(...pushAt);
    const lastEval = Math.max(...evalAt);
    if (lastPush > lastEval) {
      out.push({ id, decls, lastEval, orphanPushes: pushAt.filter((n) => n > lastEval) });
    }
  }
  return out.sort((a, b) => a.orphanPushes[0] - b.orphanPushes[0]);
}
function fakeJudgements(src) {
  const hit = (line) => {
    const t = line.trim();
    if (!/^console\.log\(/.test(t)) return false;
    if (/catch|threw|\.message/.test(t)) return false;
    if (!/(===|!==|<=|>=|&&|\|\|)/.test(t)) return false;
    if (/(?:failures|failed|problems|stray|failedCount)(?:\.length)?\s*===\s*0/.test(t)) return false;
    if (/===\s*0\s*\?/.test(t)) return false;
    if (/'(?:ALL[^']*PASSED|[^']*FAILED|OK|PASSED)'/.test(t)) return false;
    return true;
  };
  return src.split('\n').map((line, i) => ({ n: i + 1, line: line.trim() })).filter((x) => hit(x.line));
}
const CAN_FAIL_RES = [
  [/process\.exit\(\s*(?!0\s*\))/, 'process.exit(非 0 字面量)'],
  [/process\.exitCode\s*=/, 'process.exitCode ='],
  [/\bthrow\s+new\b/, 'throw new'],
  [/\bassert\.\w+\(/, 'assert.*'],
];
function cannotFail(src) {
  const code = stripComments(src);
  for (const [re] of CAN_FAIL_RES) if (re.test(code)) return null;
  return '既无 process.exit(1|2) / exitCode，也无 throw / assert';
}
function deadDeclarations(src) {
  const lines = src.split('\n');
  const DECL_RES = [
    /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
    /^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/,
  ];
  const decls = [];
  lines.forEach((line, i) => {
    if (isComment(line)) return;
    for (const re of DECL_RES) {
      const m = re.exec(line);
      if (m) decls.push({ name: m[1], at: i + 1 });
    }
  });
  return decls.filter((d) => (src.match(new RegExp('\\b' + d.name + '\\b', 'g')) || []).length === 1);
}
function stripSwallows(src) {
  const naive = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const squeeze = (s) => s.replace(/\s+/g, '');
  const aware = squeeze(stripComments(src));
  const blunt = squeeze(naive);
  if (blunt === aware) return [];
  return [{ n: 0, to: 0, text: '若换回朴素剥法，这份文本会丢掉 ' + (aware.length - blunt.length) + ' 个非空白字符（吃掉真代码，或删改字符串/模板里的内容）' }];
}
const TAUTOLOGY_RES = [
  [/\.ok\(\s*true\s*[,)]/, 'assert.ok(true)'],
  [/\.equal\(\s*([A-Za-z_$][\w$.]*)\s*,\s*\1\s*[,)]/, 'assert.equal(x, x)'],
  [/\.length\s*>=\s*0\b/, '.length >= 0'],
  [/check\(\s*(['"`])[^'"`]*\1\s*,\s*true\s*\)/, "check('…', true)"],
];
function tautologies(src) {
  const out = [];
  src.split('\n').forEach((line, i) => {
    if (isComment(line)) return;
    for (const [re, what] of TAUTOLOGY_RES) if (re.test(line)) { out.push({ n: i + 1, what, line: line.trim() }); break; }
  });
  return out;
}
const SELF = [
  ['A 能抓到"push 在评估之后"', staleControls([
    'const controls = [];',
    'for (const [w, ok] of controls) { if (!ok) failed++; }',
    'controls.push(["后推的对照", true]);',
  ].join('\n')).length === 1],
  ['A 不误伤"评估在最后"', staleControls([
    'const controls = [];',
    'controls.push(["a", true]);',
    'for (const [w, ok] of controls) { if (!ok) failed++; }',
  ].join('\n')).length === 0],
  ['B 能抓到 log 形式伪判据', fakeJudgements("  console.log('x (expect 1):', n === 1);").length === 1],
  ['B 不误伤真断言与 catch 上报', fakeJudgements([
    "  assert.equal(n, 1, 'x');",
    "  catch (e) { console.log('threw:', e && e.message); }",
  ].join('\n')).length === 0],
  ['C 能抓到零引用声明', deadDeclarations('function neverCalled() {}\n').length === 1],
  ['C 不误伤有引用的声明', deadDeclarations('function used() {}\nused();\n').length === 0],
  ['D 能抓到 assert.ok(true)', tautologies('assert.ok(true);').length === 1],
  ['D 不误伤真判据', tautologies('assert.ok(rows.length === 3);').length === 0],
  ['E 能抓到"只会 log 与 exit(0)"', cannotFail("console.log('ok');\nprocess.exit(0);\n") !== null],
  ['E 不误伤 assert 型守卫', cannotFail("assert.equal(a, b);\nconsole.log('PASSED');\n") === null],
  ['E 不误伤 check+process.exit(1) 型守卫',
    cannotFail("if (failed) process.exit(1);\nconsole.log('PASSED');\n") === null],
  ['E 不误伤 process.exit(failed ? 1 : 0) 型守卫',
    cannotFail("process.exit(failed ? 1 : 0);\n") === null],
  ['E 不误伤"行注释里的 `/*` 与后面的文档注释夹住真出口"',
    cannotFail("// 面 = `test/**`\nif (failed) process.exit(1);\n/** 文档 */\n") === null],
  ['F 能抓到"注释里的 /* 挖出多行空洞"（吃掉真代码）',
    stripSwallows("// 面 = `lib/**`\nconst a = 1;\nconst b = 2;\nconst c = 3;\n/** 正常文档注释 */\n").length === 1],
  ['F 能抓到"正则字面量里的 [/*] 挖出空洞"',
    stripSwallows("const r = /[/*]/g;\nconst a = 1;\n/* 真注释 */\nconst b = 2;\n").length === 1],
  ['F 不误伤纯文档注释（剥了也不丢代码）', stripSwallows("/**\n * 文档\n * 注释\n */\nconst a = 1;\n").length === 0],
  ['F 不误伤"注释只是换了空白"', stripSwallows("const a = 1; // 说明\nconst b = 2;\n").length === 0],
];
let selfFailed = 0;
console.log('自检（四个判据对合成输入都必须有牙）');
for (const [what, ok] of SELF) {
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + what);
  if (!ok) selfFailed++;
}
if (selfFailed) { console.log('\nSELF-CHECK FAILED — 判据本身无牙，候选清单不可信'); process.exit(2); }
const found = { A: [], B: [], C: [], D: [], E: [], F: [] };
for (const file of guardFiles) {
  const src = read(file);
  for (const x of staleControls(src)) found.A.push({ file, ...x, text: '对照「' + x.id + '」最后一次评估在第 ' + x.lastEval + ' 行，之后还有 push：第 ' + x.orphanPushes.join(',') + ' 行（声明行 ' + (x.decls.length ? x.decls.join(',') : '—未按 const/let/var 声明—') + '）' });
  for (const x of fakeJudgements(src)) found.B.push({ file, n: x.n, text: x.line.slice(0, 118) });
  for (const x of deadDeclarations(src)) found.C.push({ file, n: x.at, text: '声明后全文只出现一次：' + x.name });
  for (const x of tautologies(src)) found.D.push({ file, n: x.n, text: x.what + ' —— ' + x.line.slice(0, 100) });
  const why = cannotFail(src);
  if (why) found.E.push({ file, n: 1, text: why });
  for (const x of stripSwallows(src)) found.F.push({ file, n: x.n, text: x.text });
}
console.log(`\n扫描面：${guardFiles.length} 个守卫（verify-* + *-smoke）`);
const sections = [
  ['A. 对照构造了却没被评估', 'A'],
  ['B. log 形式的伪判据（带比较运算的那些）', 'B'],
  ['C. 声明了却零引用的判据/助手', 'C'],
  ['D. 恒真写法的最粗形态', 'D'],
  ['E. 守卫没有"会红"的出口（永远是绿的）', 'E'],
  ['F. 朴素剥注释在这份文本上的代价面（会丢内容：真代码 / 字符串 / 模板）', 'F'],
];
let total = 0;
for (const [title, key] of sections) {
  const list = found[key];
  total += list.length;
  console.log(`\n${title} —— 候选 ${list.length} 处`);
  for (const x of list) console.log(`  ${x.file}:${x.n}  ${x.text}`);
}
console.log(`\n候选合计 ${total} 处。**这只是候选清单**：逐条读代码再决定是不是缺陷 ——`);
console.log('有的是有意的（如"评估在前、末尾再汇总"），有的要人看才知道（见工具头的四条局限）。');
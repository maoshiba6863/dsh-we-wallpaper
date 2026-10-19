import { pathToFileURL } from 'node:url';
const isSpace = (ch) => ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';
function stripComments(src) {
  const text = String(src);
  const n = text.length;
  const out = [];
  const blank = (ch) => out.push(ch === '\n' ? '\n' : ' ');
  let prev = '';
  const isValueEnd = (ch) => ch !== '' && /[\w$)\]}'"`]/.test(ch);
  let i = 0;
  while (i < n) {
    const c = text[i];
    const c2 = text[i + 1];
    if (c === '/' && c2 === '/') {
      while (i < n && text[i] !== '\n') { blank(text[i]); i++; }
      continue;
    }
    if (c === '/' && c2 === '*') {
      blank(c); blank(c2); i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) { blank(text[i]); i++; }
      if (i < n) { blank(text[i]); blank(text[i + 1]); i += 2; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out.push(c); i++;
      while (i < n) {
        const d = text[i];
        if (d === '\\') { out.push(d); if (i + 1 < n) out.push(text[i + 1]); i += 2; continue; }
        out.push(d); i++;
        if (d === quote) break;
      }
      prev = quote;
      continue;
    }
    if (c === '/' && !isValueEnd(prev)) {
      out.push(c); i++;
      let inClass = false;
      while (i < n) {
        const d = text[i];
        if (d === '\\') { out.push(d); if (i + 1 < n) out.push(text[i + 1]); i += 2; continue; }
        if (d === '\n') break;
        out.push(d); i++;
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) break;
      }
      prev = '/';
      continue;
    }
    out.push(c); i++;
    if (!isSpace(c)) prev = c;
  }
  return out.join('');
}
function stripExportBlocks(text) {
  return String(text).replace(/^\s*export\s*\{[\s\S]*?\};?\s*$/gm, '').replace(/^\s*export\s+/gm, '');
}
function splitLinesSafe(text) {
  const eol = String(text).includes('\r\n') ? 'CRLF' : 'LF';
  const lines = String(text).split(/\r\n|\r|\n/);
  return { lines, eol, join: (ls) => ls.join(eol === 'CRLF' ? '\r\n' : '\n') };
}
function selftest() {
  const results = [];
  const ok = (name, cond, detail) => results.push({ name, cond: Boolean(cond), detail });
  const naive = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const caseLine = '// 面 = `scripts/**` 与 `test/**`\nconst a = 1;\n/** 真注释 */\nconst b = 2;\n';
  ok('正判据：行注释里的 `/**` 不吃掉后面的代码',
    stripComments(caseLine).includes('const a = 1;') && stripComments(caseLine).includes('const b = 2;'));
  ok('反面参照：朴素实现会吃掉中间的代码（证明缺陷真实）',
    !naive(caseLine).includes('const a = 1;'), '朴素输出=' + JSON.stringify(naive(caseLine).slice(0, 44)));
  const caseStr = "const p = 'test/tools/*.mjs';\nconst q = 1;\n/* z */\nconst r = 2;\n";
  ok('正判据：字符串里的 `/*` 不吃掉后面的代码',
    stripComments(caseStr).includes("'test/tools/*.mjs'")
    && stripComments(caseStr).includes('const q = 1;') && stripComments(caseStr).includes('const r = 2;'));
  ok('反面参照：朴素实现会吃掉中间的代码',
    !naive(caseStr).includes('const q = 1;'), '朴素输出=' + JSON.stringify(naive(caseStr).slice(0, 44)));
  const caseBlock = '/* c */ const a = 1;';
  ok('正判据：真块注释被剥掉、代码保留',
    !stripComments(caseBlock).includes('/*') && stripComments(caseBlock).includes('const a = 1;'));
  ok('正判据：行注释被剥掉', !stripComments('const a = 1; // hi\n').includes('hi'));
  ok('负对照：字符串里的 URL 不算注释',
    stripComments("const u = 'https://x/y';").includes('https://x/y'));
  const sample = '/* a\nb */ x\n// tail\ny\n';
  const got = stripComments(sample);
  ok('正判据：剥后与原文**等长**', got.length === sample.length, `${got.length} vs ${sample.length}`);
  ok('正判据：行数不变（换行原样保留）', got.split('\n').length === sample.split('\n').length);
  ok('正判据：未被注释的字符原样在', got.includes('x') && got.includes('y'));
  ok('正判据：模板里的 `/*` 不算注释', stripComments('const t = `a/*b`;\nconst z = 1;\n').includes('const z = 1;'));
  ok('正判据：转义引号不会提前结束字符串', stripComments("const s = 'a\\'/*b';\nconst z = 1;\n").includes('const z = 1;'));
  const caseReClass = String.raw`const r = /[/*]/g;` + '\nconst a = 1;\n/* z */\nconst b = 2;\n';
  ok('正判据：正则字符类里的 `/*` 不算注释（后面的代码保留）',
    stripComments(caseReClass).includes('const a = 1;') && stripComments(caseReClass).includes('const b = 2;'));
  ok('反面参照：朴素实现会从正则里那个 `/*` 一路吃到后面的块注释结束',
    !naive(caseReClass).includes('const a = 1;'), '朴素输出=' + JSON.stringify(naive(caseReClass).slice(0, 44)));
  const caseReTail = String.raw`const r = /\/\//g; const a = 1;` + '\nconst b = 2;\n';
  ok('正判据：以 `\\//` 收尾的正则不被当成行注释（该行原样保留）',
    stripComments(caseReTail).includes('const a = 1;') && stripComments(caseReTail).includes(String.raw`/\/\//g`));
  ok('负对照：除号不会被当成正则（`a / b / c` 原样保留）',
    stripComments('const x = a / b / c;\nconst y = 1;\n').includes('a / b / c;'));
  ok('正判据：多行 `export { … }` 块被剥掉、正文保留',
    (() => {
      const out = stripExportBlocks('const a = 1;\nexport {\n  a,\n};\n');
      return out.includes('const a = 1;') && !/^\s*export\b/m.test(out);
    })());
  ok('正判据：缩进的导出块同样被剥掉（本仓 picker-modal / quick-panel 那三个文件的形态）',
    !/^\s*export\b/m.test(stripExportBlocks('  function f() {}\n  export {\n    f,\n  };\n')));
  ok('负对照：`export const` 行内形态也能剥',
    !/^\s*export\b/m.test(stripExportBlocks('export const A = 1;\nexport function g() {}\n')));
  ok('负对照：没有导出块的正文逐字不变（client.js 是正文，传进来必须是恒等）',
    stripExportBlocks('const a = 1;\n') === 'const a = 1;\n');
  ok('负对照：正文里的 `wrapper.export` 之类的词不受影响',
    stripExportBlocks('const x = obj.export;\n').includes('obj.export'));
  ok('正判据：**两个模块拼在一起**时两个导出块都要剥掉（R3b 起 glass.js + effects.js 的沙箱形态）',
    (() => {
      const out = stripExportBlocks('const a = 1;\nexport { a };\nconst b = 2;\nexport {\n  b,\n};\n');
      if (/^\s*export\b/m.test(out)) return false;
      try { new Function(out + '\nreturn [a, b];'); return true; } catch { return false; }
    })());
  ok('正判据：CRLF 原文切行后行尾不带 `\\r`，拼回去仍是 CRLF',
    (() => {
      const s = splitLinesSafe('a\r\nb\r\n');
      return s.eol === 'CRLF' && s.lines.join('|') === 'a|b|' && s.join(s.lines) === 'a\r\nb\r\n';
    })());
  ok('正判据：LF 原文拼回去仍是 LF（不把 LF 升成 CRLF）',
    (() => {
      const s = splitLinesSafe('a\nb\n');
      return s.eol === 'LF' && s.join(s.lines) === 'a\nb\n';
    })());
  let failed = 0;
  for (const r of results) {
    console.log((r.cond ? '✓ ' : '✗ ') + r.name + (r.detail ? ' — ' + r.detail : ''));
    if (!r.cond) failed++;
  }
  console.log('');
  if (failed) {
    console.log(`js-text selftest FAILED — ${failed}/${results.length}`);
    process.exit(1);
  }
  console.log(`js-text selftest PASSED (${results.length})`);
}
export { stripComments, stripExportBlocks, splitLinesSafe, selftest };
const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly && process.argv[2] === 'selftest') selftest();
export function createCheck() {
  const stats = { passed: 0, failed: 0 };
  function check(name, ok, detail) {
    if (ok) stats.passed++;
    else stats.failed++;
    console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? ' — ' + detail : ''));
  }
  return { check, stats };
}
export function normCrlf(s) {
  return String(s).replace(/\r/g, '');
}
export function fnNameBody(source, name) {
  const i = source.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const j = source.indexOf('\n}', i);
  return j < 0 ? source.slice(i) : source.slice(i, j);
}
export function braceBody(source, name) {
  const s = normCrlf(source);
  const start = s.indexOf('function ' + name + '(');
  if (start < 0) return '';
  const open = s.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0, mode = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (mode === 'line') { if (c === '\n') mode = null; continue; }
    if (mode === 'block') { if (c === '*' && n === '/') { mode = null; i++; } continue; }
    if (mode === 'single') { if (c === '\\') { i++; continue; } if (c === "'") mode = null; continue; }
    if (mode === 'double') { if (c === '\\') { i++; continue; } if (c === '"') mode = null; continue; }
    if (mode === 'tpl') { if (c === '\\') { i++; continue; } if (c === '`') mode = null; continue; }
    if (c === '/' && n === '/') { mode = 'line'; i++; continue; }
    if (c === '/' && n === '*') { mode = 'block'; i++; continue; }
    if (c === "'") { mode = 'single'; continue; }
    if (c === '"') { mode = 'double'; continue; }
    if (c === '`') { mode = 'tpl'; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return s.slice(open + 1, i); }
  }
  return '';
}
export function naiveBlockBody(code, needle) {
  const i = code.indexOf(needle);
  if (i < 0) return null;
  const open = code.indexOf('{', i);
  const close = code.indexOf('}', open);
  return open < 0 || close < 0 ? null : code.slice(open + 1, close);
}
export function naiveFuncSlice(text, name) {
  const at = text.indexOf('function ' + name + '(');
  if (at < 0) return '';
  const open = text.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}' && (depth -= 1) === 0) return text.slice(open, i + 1);
  }
  return '';
}
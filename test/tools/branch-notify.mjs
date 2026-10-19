import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripComments } from './js-text.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const inlineModuleFiles = () => [...readFileSync(join(ROOT, 'scripts', 'build-client.mjs'), 'utf8')
  .matchAll(/file:\s*'([^']+)'/g)].map((m) => m[1]);
const FILES = [...new Set(['src/client.js', ...inlineModuleFiles()])];
const NOTIFY_HELPERS = ['busy', 'done', 'armConfirm', 'disarmConfirm'];
const WRITES = /(?:setTransient\(|setSetting\(|setFontValues\(|(?<![\w.$])selection\.[\w$]+\s*=(?!=))/;
export const DEF = /^(\s*)(?:async\s+function\s+([\w$]+)\s*\(|function\s+([\w$]+)\s*\(|const\s+([\w$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|(on[A-Z][\w$]*)\s*:|(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:function\s*)?\([^)]*\)\s*(?:=>|\{)|((?:on[A-Z]|set[A-Z]|change[A-Z]|toggle[A-Z])[\w$]*)\s*\([^)]*\)\s*\{)/;
export const defName = (m) => m[2] || m[3] || m[4] || m[5] || m[6] || m[7];
const MAX_PATHS = 64;
const indentOf = (l) => (l.match(/^\s*/)[0] || '').length;
const callsAny = (text, names) => [...names].some((n) => new RegExp('(?:^|[^\\w$.])' + n + '\\s*\\(').test(text));
export function definitionsOf(text) {
  const ls = stripComments(String(text)).split('\n');
  const out = [];
  ls.forEach((l, i) => {
    const m = DEF.exec(l);
    if (!m) return;
    const name = defName(m);
    const opens = (l.match(/\{/g) || []).length;
    const closes = (l.match(/\}/g) || []).length;
    if (opens === 0 || opens === closes) { out.push({ name, line: i + 1, lines: [l] }); return; }
    const indent = m[1].length;
    let end = ls.length;
    for (let k = i + 1; k < ls.length; k++) {
      if (ls[k].trim() === '') continue;
      const ind = indentOf(ls[k]);
      if (ind < indent) { end = k; break; }
      if (/^\s*\}/.test(ls[k]) && ind === indent) { end = k + 1; break; }
    }
    out.push({ name, line: i + 1, lines: ls.slice(i, end) });
  });
  return out;
}
export function notifyingNames(defs) {
  const names = new Set(['emit', ...NOTIFY_HELPERS]);
  for (let pass = 0; pass < 8; pass++) {
    for (const d of defs) if (!names.has(d.name) && callsAny(d.lines.join('\n'), names)) names.add(d.name);
  }
  return names;
}
function splitStatements(lines, baseIndent) {
  const out = [];
  let cur = [];
  let depth = 0;
  for (const l of lines) {
    if (l.trim() === '') { if (cur.length) cur.push(l); continue; }
    const startsNew = cur.length > 0 && depth === 0 && indentOf(l) <= baseIndent
      && !/^\s*(?:else\b|\}|\))/.test(l);
    if (startsNew) { out.push(cur); cur = []; }
    cur.push(l);
    depth += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length;
    if (depth < 0) depth = 0;
  }
  if (cur.length) out.push(cur);
  return out;
}
function branchesOf(stmt) {
  const first = stmt[0];
  const headIndent = indentOf(first);
  if (first.indexOf('{') < 0) {
    const close = first.indexOf(')');
    const thenText = first.slice(close + 1);
    const rest = stmt.slice(1);
    if (!rest.length) return [thenText];
    const firstElse = rest.findIndex((l) => /^\s*\}?\s*else\b/.test(l));
    if (firstElse < 0) return [[firstText(first), ...rest].join('\n')];
    const elseLines = rest.slice(firstElse).map((l, i) => (i === 0 ? l.replace(/^\s*\}?\s*else\s*/, '') : l));
    if (/^\s*\}?\s*else\s+if\b/.test(rest[firstElse])) return [thenText, ...branchesOf(elseLines)];
    return [thenText, elseLines.join('\n')];
  }
  let end = stmt.length - 1;
  for (let k = 1; k < stmt.length; k++) {
    if (/^\s*\}/.test(stmt[k]) && indentOf(stmt[k]) === headIndent) { end = k; break; }
  }
  const thenLines = stmt.slice(0, end + 1);
  const rest = stmt.slice(end + 1);
  const closeLine = stmt[end] || '';
  const elseOnClose = /\}\s*else\b/.test(closeLine);
  if (!elseOnClose && !(rest[0] && /^\s*\}?\s*else\b/.test(rest[0]))) return [thenLines.join('\n')];
  const elseLines = elseOnClose ? rest : rest.slice(1);
  const elseFirst = elseOnClose ? closeLine.slice(closeLine.indexOf('else')) : rest[0];
  if (/^\s*\}?\s*else\s+if\b/.test(elseFirst)) return [thenLines.join('\n'), ...branchesOf(elseLines)];
  return [thenLines.join('\n'), elseLines.join('\n')];
}
function firstText(line) {
  const close = line.indexOf(')');
  return line.slice(0, close + 1);
}
const isIf = (stmt) => /^\s*\}?\s*if\s*\(/.test(stmt[0]);
export function pathNotifications(text, defsOverride) {
  const defs = defsOverride || definitionsOf(text);
  const names = notifyingNames(defs);
  const flags = [];
  for (const d of defs) {
    if (!/^(?:on[A-Z]|set[A-Z]|change[A-Z]|toggle[A-Z])/.test(d.name)) continue;
    const body = d.lines.slice(1);
    const inner = body.filter((l) => l.trim() !== '' && !/^\s*\}/.test(l));
    if (!inner.length) continue;
    const baseIndent = indentOf(inner[0]);
    const stmts = splitStatements(body, baseIndent);
    if (!stmts.some((s) => WRITES.test(s.join('\n')))) continue;
    let paths = [''];
    let capped = false;
    for (const s of stmts) {
      const piece = isIf(s) ? branchesOf(s) : [s.join('\n')];
      const next = [];
      for (const p of paths) for (const b of piece) next.push(p + '\n' + b);
      if (next.length > 8 && paths.length * piece.length > MAX_PATHS) { capped = true; }
      paths = next.slice(0, MAX_PATHS);
    }
    for (const p of paths) {
      const w = p.search(WRITES);
      if (w < 0) continue;
      let lastWrite = -1;
      const wr = new RegExp(WRITES.source, 'g');
      for (let m = wr.exec(p); m; m = wr.exec(p)) lastWrite = m.index;
      let lastNotify = -1;
      for (const n of names) {
        const re = new RegExp('(?:^|[^\\w$.])' + n + '\\s*\\(', 'g');
        for (let m = re.exec(p); m; m = re.exec(p)) lastNotify = Math.max(lastNotify, m.index);
      }
      if (!(lastNotify > lastWrite)) {
        flags.push(d.name + '@L' + d.line + (capped ? '（路径数触顶）' : ''));
        break;
      }
    }
  }
  return flags;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2];
  if (cmd !== 'audit') {
    console.error('用法：node test/tools/branch-notify.mjs audit');
    process.exit(1);
  }
  let total = 0;
  for (const rel of FILES) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    const flags = pathNotifications(text);
    for (const f of flags) console.log(rel + '  ' + f);
    total += flags.length;
  }
  console.log('\n分支级候选合计 ' + total + ' 处（人读定性）');
}
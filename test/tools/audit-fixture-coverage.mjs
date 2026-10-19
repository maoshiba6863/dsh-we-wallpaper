import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { DEFAULTS } = await import(pathToFileURL(join(ROOT, 'lib', 'settings-schema.js')).href);
const ALL = process.argv.includes('--all');
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) { if (name !== 'tools') walk(abs, out); continue; }
    if (/\.(mjs|js|json)$/.test(name)) out.push(abs);
  }
  return out;
}
const testDir = join(ROOT, 'test');
const behavior = walk(testDir).filter((abs) => /\.(mjs|js)$/.test(abs));
const data = walk(testDir).filter((abs) => abs.endsWith('.json'));
const LITERAL = String.raw`(?:-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|true|false|null)`;
const hitsOf = (text, key) => [
  ...[...text.matchAll(new RegExp(`[{,]\\s*"?${key}"?\\s*:\\s*(${LITERAL})`, 'g'))].map((m) => m[1]),
];
const surfaces = [
  { label: '行为面', files: behavior.map((abs) => ({ abs, text: readFileSync(abs, 'utf8') })) },
  { label: '数据面', files: data.map((abs) => ({ abs, text: readFileSync(abs, 'utf8') })) },
];
const rel = (abs) => abs.slice(ROOT.length + 1).split('\\').join('/');
const rows = [];
for (const [key, def] of Object.entries(DEFAULTS)) {
  const defLit = JSON.stringify(def);
  const collect = (surface) => {
    const seen = new Map();
    for (const f of surface.files) {
      for (const v of hitsOf(f.text, key)) {
        if (!seen.has(v)) seen.set(v, []);
        if (seen.get(v).length < 3) seen.get(v).push(rel(f.abs));
      }
    }
    return seen;
  };
  const inBehavior = collect(surfaces[0]);
  const inData = collect(surfaces[1]);
  const norm = (v) => String(v).replace(/^['"]|['"]$/g, '');
  const values = [...inBehavior.keys()].map(norm);
  let kind = null;
  if (!values.length) kind = inData.size ? 'C 只在数据面出现（行为面零取值）' : 'D 两个面都没出现';
  else if (!values.includes(norm(defLit))) kind = 'A 默认值分支可能零覆盖（行为面都是别的取值）';
  else if (new Set(values).size === 1) kind = 'B 行为面只跑过默认值（其余取值可能零覆盖）';
  if (kind) rows.push({ key, def: defLit, kind, inBehavior, inData });
}
const fmt = (m) => (m.size ? [...m].map(([v, at]) => `${v}@${at.join(',')}`).join(' | ') : '—');
console.log(`行为面 ${behavior.length} 个文件 · 数据面 ${data.length} 个文件 · 设置键 ${Object.keys(DEFAULTS).length} 个`);
console.log('');
for (const p of ['A', 'B', 'C', 'D']) {
  const group = rows.filter((r) => r.kind.startsWith(p));
  const full = ALL || p === 'A' || p === 'B';
  console.log(`── ${p}：${group.length} 个候选 ──`);
  for (const r of (full ? group : group.slice(0, 5))) {
    console.log(`  ${r.key}（默认 ${r.def}）  行为面 ${fmt(r.inBehavior)}   数据面 ${fmt(r.inData)}`);
  }
  if (!full && group.length > 5) console.log(`  …（其余 ${group.length - 5} 个同族，见 docs/… 或直接加 --all）`);
  console.log('');
}
console.log('提示：A 最危险（P3-23 的实例在这里）；C/D 要先确认"是否有守卫直接调函数覆盖"。');
const caught = rows.some((r) => r.key === 'liveBootDelay' && r.kind.startsWith('A'));
console.log('');
console.log(caught
  ? '✓ 自检：已知实例 liveBootDelay 被列为 A 类（P3-23）'
  : '⚠️ 自检失败：已知实例 liveBootDelay 没被列为 A 类 —— 启发式退化了，先查这个工具再看清单');
if (!caught) process.exitCode = 1;
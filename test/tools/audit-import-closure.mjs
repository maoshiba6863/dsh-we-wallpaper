import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const filesList = pkg.files || [];
function expandFiles(list) {
  const out = new Set();
  for (const entry of list) {
    const abs = join(root, entry);
    if (!existsSync(abs)) { console.log(`  [WARN] files 条目不存在: ${entry}`); continue; }
    if (statSync(abs).isDirectory()) {
      const walk = (d) => {
        for (const n of readdirSync(d)) {
          const p = join(d, n);
          if (statSync(p).isDirectory()) walk(p);
          else out.add(relative(root, p).replace(/\\/g, '/'));
        }
      };
      walk(abs);
    } else out.add(entry);
  }
  return out;
}
const packed = expandFiles(filesList);
const libFiles = [];
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|mjs)$/.test(n)) libFiles.push(p);
  }
};
walk(join(root, 'lib'));
import { stripComments } from './js-text.mjs';
const MODULE_RE = /(?:import\s+[^'"]*?from\s*|import\s*|require\s*\(\s*)['"](\.\.?\/[^'"]+)['"]/g;
const DATA_RE = /readFileSync\s*\(\s*new\s+URL\s*\(\s*['"](\.\.?\/[^'"]+)['"]/g;
function resolveTarget(fromFile, spec) {
  const base = dirname(fromFile);
  const abs = resolve(base, spec);
  const candidates = [abs, abs + '.js', abs + '.mjs', join(abs, 'index.js'), join(abs, 'index.mjs')];
  for (const c of candidates) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}
let problems = 0;
const checked = new Set();
const libRoot = resolve(root, 'lib');
for (const f of libFiles) {
  const rel = relative(root, f).replace(/\\/g, '/');
  const src = stripComments(readFileSync(f, 'utf8'));
  let m;
  MODULE_RE.lastIndex = 0;
  while ((m = MODULE_RE.exec(src)) !== null) {
    const spec = m[1];
    if (spec.startsWith('node:')) continue;
    const target = resolveTarget(f, spec);
    if (!target) {
      console.log(`  [UNRESOLVED] ${rel}: ${spec}`);
      problems++;
      continue;
    }
    const trel = relative(root, target).replace(/\\/g, '/');
    if (trel.startsWith('node_modules/')) continue;
    if (!target.startsWith(libRoot)) {
      console.log(`  [OUT-OF-LIB] ${rel} → ${trel}`);
      problems++;
      continue;
    }
    if (!packed.has(trel)) {
      console.log(`  [NOT-PACKED] ${rel} → ${trel}`);
      problems++;
    }
    checked.add(trel);
  }
}
{
  let dataMissing = 0;
  for (const f of libFiles) {
    const rel = relative(root, f).replace(/\\/g, '/');
    const src = stripComments(readFileSync(f, 'utf8'));
    let m;
    DATA_RE.lastIndex = 0;
    while ((m = DATA_RE.exec(src)) !== null) {
      const abs = resolve(dirname(f), m[1]);
      if (!existsSync(abs)) { console.log(`  [DATA-MISSING] ${rel}: ${m[1]}`); dataMissing++; }
    }
  }
  if (dataMissing) problems += dataMissing;
  console.log(`\n数据文件读取核对: ${dataMissing === 0 ? '全部存在于磁盘' : dataMissing + ' 处读不到'}`);
}
if (libFiles.length === 0 || checked.size < 10) {
  console.log(`  [DOMAIN-FLOOR] 覆盖面退化：lib 文件数 ${libFiles.length}（须 > 0）、`
    + `被导入覆盖 ${checked.size}（须 >= 10）—— 域空了，"零问题"不算通过`);
  problems++;
}
console.log(`\nlib 文件数: ${libFiles.length}, 被导入覆盖: ${checked.size}`);
console.log(problems === 0 ? '\n✅ 导入闭包全部被 files 覆盖' : `\n❌ ${problems} 处问题（见上）`);
process.exit(problems === 0 ? 0 : 1);
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, relative, sep, dirname, resolve } from 'node:path';
import { builtinModules } from 'node:module';
import { stripComments } from './tools/js-text.mjs';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}
function assert(cond, name, detail) {
  if (!cond) throw new Error('ASSERTION FAILED: ' + name + (detail ? ' — ' + detail : ''));
}
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BUILTIN_ROOTS = new Set(builtinModules || []);
const specRoot = (spec) => (spec.startsWith('@')
  ? spec.split('/').slice(0, 2).join('/')
  : spec.split('/')[0]);
function bareImportSpecs(src) {
  const out = [];
  for (const m of stripComments(src).matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)[\'"]([^\'"]+)[\'"]/g)) {
    const spec = m[1];
    if (spec.startsWith('.') || spec.startsWith('node:') || spec.startsWith('/')) continue;
    if (BUILTIN_ROOTS.has(specRoot(spec))) continue;
    out.push(spec);
  }
  return out;
}
function walkFiles(dir, out = []) {
  let names;
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    const abs = join(dir, name);
    let st;
    try { st = statSync(abs); } catch { continue; }
    if (st.isDirectory()) walkFiles(abs, out);
    else if (st.isFile()) out.push(relative(ROOT, abs).split(sep).join('/'));
  }
  return out.sort();
}
function globRe(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') { re += '.*'; i++; } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('\\^$+.[]{}()|'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp('^' + re + '$');
}
function coveredBy(rel, entry) {
  const e = String(entry).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (!e) return false;
  let isDir = String(entry).endsWith('/');
  if (!isDir) {
    try { isDir = statSync(join(ROOT, e)).isDirectory(); } catch {   }
  }
  if (isDir) return rel.startsWith(e + '/');
  if (/[*?]/.test(e)) return globRe(e).test(rel);
  return rel === e;
}
async function main() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert(Array.isArray(pkg.files), 'package.json must declare a files allowlist');
  const files = pkg.files;
  const libFiles = walkFiles(join(ROOT, 'lib'));
  const runtime = libFiles.filter((rel) => /\.(js|mjs|cjs)$/.test(rel));
  const uncovered = libFiles.filter((rel) => !files.some((e) => coveredBy(rel, e)));
  check('P1 package.json `files` covers every file under lib/ (' + runtime.length + ' runtime .js/.mjs)',
    libFiles.length > 0 && uncovered.length === 0,
    libFiles.length + ' lib file(s) vs ' + files.length + ' `files` entr(ies)'
      + '; missing=[' + uncovered.join(', ') + ']');
  {
    const controls = [
      [coveredBy('lib/index.js', 'lib/index.js'), 'exact file'],
      [coveredBy('lib/media/index.js', 'lib/media/'), 'dir entry (trailing slash)'],
      [coveredBy('lib/media/index.js', 'lib/media'), 'dir entry (no trailing slash)'],
      [coveredBy('lib/media/legacy.js', 'lib/media/**'), 'glob entry'],
      [!coveredBy('lib/__absent__.js', 'lib/index.js'), 'negative: unlisted file'],
      [!coveredBy('lib/__absent__/x.js', 'lib/index.js'), 'negative: wrong prefix'],
      [!coveredBy('lib/routes/upload.js', 'lib/media'), 'negative: dir must not match sibling'],
      [!coveredBy('lib/__absent__/x.js', 'lib/media/'), 'negative: outside the dir entry'],
    ];
    const bad = controls.filter(([ok]) => !ok).map(([, label]) => label);
    check('P2 coverage resolver separates covered from uncovered (positive + negative controls)',
      bad.length === 0,
      controls.length + ' controls, failed=[' + bad.join(', ') + ']');
  }
  {
    const required = [
      'lib/index.js', 'lib/client.js', 'lib/http-body.js', 'lib/pkg-read.js',
    ];
    const absent = required.filter((rel) => !libFiles.includes(rel));
    const unlisted = required.filter((rel) => libFiles.includes(rel) && !files.some((e) => coveredBy(rel, e)));
    check('P3 named runtime entry points exist under lib/ AND are shipped by `files`',
      absent.length === 0 && unlisted.length === 0,
      'required=' + required.length + ' absent=[' + absent.join(', ') + '] unlisted=[' + unlisted.join(', ') + ']');
  }
  {
    const broken = runtime.filter((rel) => {
      try { execFileSync(process.execPath, ['--check', join(ROOT, rel)], { stdio: 'ignore' }); return false; }
      catch { return true; }
    });
    check('P6 every lib/ module parses (node --check)', broken.length === 0,
      broken.length ? 'broken=[' + broken.join(', ') + ']' : runtime.length + ' module(s) parsed');
    const dir = join(ROOT, '.test-cache');
    const tmp = join(dir, 'syntax-probe.mjs');
    mkdirSync(dir, { recursive: true });
    writeFileSync(tmp, 'export { nope };\n', 'utf8');
    let caught = false;
    try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'ignore' }); } catch { caught = true; }
    try { rmSync(tmp, { force: true }); } catch {   }
    check('P6 negative control: 坏模块会被 --check 判出', caught);
  }
  {
    const resolveRelative = (fromRel, spec) => {
      const base = resolve(ROOT, dirname(fromRel), spec.split('?')[0]);
      for (const cand of [base, base + '.js', base + '.mjs', base + '.cjs', join(base, 'index.js')]) {
        if (existsSync(cand) && statSync(cand).isFile()) return cand;
      }
      return null;
    };
    const missing = [];
    let specs = 0;
    for (const rel of runtime) {
      const src = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
      for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
        specs++;
        if (resolveRelative(rel, m[1]) === null) missing.push(rel + ' -> ' + m[1]);
      }
    }
    check('P7 every relative import target of every lib/ module exists on disk',
      specs > 0 && missing.length === 0,
      missing.length ? 'missing=[' + missing.join(', ') + ']'
        : specs + ' specifier(s) across ' + runtime.length + ' module(s)');
    check('P7 negative control: 目标不存在时报出、省略扩展名时解析到实体',
      resolveRelative('lib/index.js', './definitely-absent.js') === null
      && resolveRelative('lib/index.js', './__absent__') === null
      && resolveRelative('lib/index.js', './pkg-read') === join(ROOT, 'lib', 'pkg-read.js'));
  }
  {
    const deps = Object.keys(pkg.dependencies || {});
    const libSrc = walkFiles(join(ROOT, 'lib'))
      .filter((rel) => /\.(js|mjs|cjs)$/.test(rel))
      .map((rel) => readFileSync(join(ROOT, rel), 'utf8'))
      .join('\n');
    const consumerRe = (dep) => new RegExp(
      '(?:from\\s+|import\\s*\\(\\s*|require\\s*\\(\\s*|\\.resolve\\s*\\(\\s*)[\'"]'
      + dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:/[\'"]|[\'"])');
    const consumes = (dep, src) => !dep.startsWith('.') && !dep.startsWith('/')
      && !(dep.startsWith('node:') || BUILTIN_ROOTS.has(specRoot(dep)))
      && consumerRe(dep).test(src);
    const consumers = deps.filter((d) => consumes(d, libSrc));
    const orphans = deps.filter((d) => !consumers.includes(d));
    check('P4 every declared dependency is imported by lib/ (no dead declaration)',
      orphans.length === 0,
      'deps=' + deps.length + ' consumers=[' + consumers.join(', ') + '] orphans=[' + orphans.join(', ') + ']');
    const fake = ['dsh', 'not-a-real-dep'].join('-');
    const controls = [
      [consumes(fake, 'import x from "' + fake + '"'), 'positive: from'],
      [consumes(fake, 'const x = require("' + fake + '")'), 'positive: require'],
      [consumes(fake, 'const m = await import("' + fake + '")'), 'positive: dynamic import'],
      [consumes(fake, 'createRequire(import.meta.url).resolve("' + fake + '")'), 'positive: require.resolve'],
      [!consumes(fake, 'import x from "' + fake + '-extra"'), 'negative: near-miss name'],
      [!consumes(fake, 'createRequire(import.meta.url).resolve("' + fake + '-extra")'), 'negative: near-miss resolve'],
      [!consumes(fake, 'import x from "./' + fake + '.mjs"'), 'negative: relative specifier'],
      [!consumes('./local.mjs', "import x from './local.mjs'"), 'negative: relative declaration'],
      [!consumes('node:path', 'import p from "node:path"'), 'negative: node: builtin'],
      [!consumes('fs', 'import f from "fs"'), 'negative: bare builtin'],
    ];
    const bad = controls.filter(([ok]) => !ok).map(([, label]) => label);
    check('P4 negative control: the consumer predicate reports a synthetic dependency and rejects builtins/relative/near-miss names',
      bad.length === 0,
      controls.length + ' controls, failed=[' + bad.join(', ') + ']');
  }
  {
    const shapeError = (cmd, key, group) => {
      const m = /^node\s+(\S+)\s+(\S+)$/.exec(String(cmd || '').trim());
      if (!m) return key + ' 不是单步 `node <file> <group>` 形态：' + JSON.stringify(cmd);
      if (m[1] !== 'test/run-guards.mjs') return key + ' 指向 ' + m[1] + '（应为 test/run-guards.mjs）';
      if (m[2] !== group) return key + ' 跑的组是 ' + m[2] + '（应为 ' + group + '）';
      return null;
    };
    const GROUPS = [['verify', 'verify'], ['smoke', 'smoke'], ['verify:all', 'all']];
    const CHAIN_FLOOR = { verify: 24, smoke: 5, all: 30 };
    const floorGaps = (groups, floors) => groups.map(([, g]) => g).filter((g) => !Number.isInteger(floors[g]));
    const problems = floorGaps(GROUPS, CHAIN_FLOOR).map((g) => '地板表缺组 ' + g
      + '（键名要写**组名**：`verify`/`docs`/`smoke`/`all`，不是脚本键名 `verify:docs`/`verify:all`）');
    const scripts = new Set();
    const counts = [];
    for (const [key, group] of GROUPS) {
      const bad = shapeError((pkg.scripts || {})[key], key, group);
      if (bad) { problems.push(bad); continue; }
      let listed;
      try {
        const out = execFileSync(process.execPath, [join(ROOT, 'test/run-guards.mjs'), group, '--list-json'], { cwd: ROOT, encoding: 'utf8' });
        listed = JSON.parse(out);
      } catch (err) {
        problems.push(key + ' ⇒ runner 跑不起来：' + String((err && err.message) || err).split('\n')[0]);
        continue;
      }
      if (listed.chainKey !== key) problems.push(key + ' ⇒ runner 报的 chainKey=' + listed.chainKey);
      const steps = listed.steps || [];
      counts.push(key + '=' + steps.length + '/' + CHAIN_FLOOR[group]);
      if (steps.length < CHAIN_FLOOR[group]) problems.push(key + ' 步数 ' + steps.length + ' < 地板 ' + CHAIN_FLOOR[group]);
      for (const s of steps) if (s.file) scripts.add(s.file);
    }
    for (const key of ['build', 'prepack']) {
      const refs = [...String((pkg.scripts || {})[key] || '').matchAll(/node\s+([\w./-]+\.mjs)/g)].map((m) => m[1]);
      if (refs.length < 1) problems.push(key + ' 没有可扫描的 node 入口：' + JSON.stringify((pkg.scripts || {})[key]));
      for (const rel of refs) scripts.add(rel);
    }
    const offenders = [];
    for (const rel of scripts) {
      let src;
      try { src = readFileSync(join(ROOT, rel), 'utf8'); } catch { offenders.push(rel + '(缺文件)'); continue; }
      for (const spec of bareImportSpecs(src)) offenders.push(rel + ' -> ' + spec);
    }
    check('P5 the chain perimeter is pinned: each script is exactly one `node test/run-guards.mjs <its group>` and every group keeps at least its measured step count',
      problems.length === 0,
      problems.length ? 'problems=[' + problems.join(' · ') + ']'
        : counts.join(' ') + ' · unique scripts=' + scripts.size);
    check('P5 build/verify/smoke/prepack chain has NO bare-package import (CI installs nothing)',
      scripts.size > 0 && offenders.length === 0,
      scripts.size + ' script(s) referenced (from the runner manifests, not from the script strings); offenders=[' + offenders.join(', ') + ']');
    check('P5 negative control: the detector catches a bare import and ignores builtins/relative',
      (() => {
        const fake = ['left', 'pad'].join('-');
        return bareImportSpecs('import x from "' + fake + '"').length === 1
          && bareImportSpecs("const x = require('" + fake + "')").length === 1
          && bareImportSpecs("import fs from 'fs'").length === 0
          && bareImportSpecs("import p from 'node:path'").length === 0
          && bareImportSpecs("import q from './local.mjs'").length === 0
          && bareImportSpecs("// 夹具形如 from '" + fake + "'\nconst ok = 1;").length === 0;
      })());
    check('P5 negative control: the script-shape predicate rejects a wrong group, an extra step and the old inline chain',
      shapeError('node test/run-guards.mjs verify', 'verify', 'verify') === null
      && shapeError('node test/run-guards.mjs docs', 'verify', 'verify') !== null
      && shapeError('node test/run-guards.mjs smoke', 'smoke', 'smoke') === null
      && shapeError('node test/verify-client-sync.mjs && node test/verify-client.mjs', 'verify', 'verify') !== null
      && shapeError('node test/run-guards.mjs verify && node test/verify-about.mjs', 'verify', 'verify') !== null
      && shapeError('node test/other.mjs verify', 'verify', 'verify') !== null);
    check('P5 negative control: a floor table that keys by script name instead of group name is detected',
      floorGaps(GROUPS, { verify: 24, smoke: 5 }).length === 1
      && floorGaps(GROUPS, { verify: 24, smoke: 5, all: 30 }).length === 0
      && floorGaps(GROUPS, CHAIN_FLOOR).length === 0);
  }
  {
    const BOM = [0xEF, 0xBB, 0xBF];
    const PARSED_EXT = ['.js', '.mjs', '.cjs', '.json', '.ts', '.html'];
    const hasBom = (buf) => buf.length >= 3 && buf[0] === BOM[0] && buf[1] === BOM[1] && buf[2] === BOM[2];
    const scanned = libFiles.filter((rel) => PARSED_EXT.some((ext) => rel.toLowerCase().endsWith(ext)));
    const offenders = scanned.filter((rel) => {
      try { return hasBom(readFileSync(join(ROOT, rel))); } catch { return false; }
    });
    check('P8 coverage: the BOM scan actually reached files', scanned.length >= 10,
      scanned.length + ' file(s) with parsed extensions under lib/');
    check('P8 no published file carries a UTF-8 BOM (JSON.parse does not strip it)',
      offenders.length === 0,
      offenders.length ? 'offenders=[' + offenders.join(', ') + ']' : 'clean (' + scanned.length + ' file(s))');
    check('P8 negative control: a BOM-prefixed buffer is detected, a clean one is not',
      hasBom(Buffer.from([0xEF, 0xBB, 0xBF, 0x2F])) === true
      && hasBom(Buffer.from([0x2F, 0x2A, 0x2A])) === false
      && hasBom(Buffer.from('// ok\n')) === false);
  }
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (failed.length === 0
    ? 'ALL PACKAGE FILE CHECKS PASSED'
    : failed.length + ' CHECK(S) FAILED'));
  process.exit(failed.length === 0 ? 0 : 1);
}
main().catch((err) => {
  console.error('TEST ERROR:', err && err.stack ? err.stack : err);
  process.exit(1);
});
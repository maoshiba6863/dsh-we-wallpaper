import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, openSync, closeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BASELINE_REL = '.github/harness-baseline.json';
const HARNESS_PKG = '@deepseek-ai/dsh';
const baselinePath = (root) => join(root, BASELINE_REL);
function parseArgs(argv) {
  const out = { force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') { out.force = true; continue; }
    const key = a.replace(/^--/, '');
    const val = argv[i + 1];
    if (val === undefined || val.startsWith('--')) throw new Error(`参数 ${a} 缺少取值`);
    out[key] = val;
    i++;
  }
  return out;
}
function readBaseline(root = ROOT) {
  try { return JSON.parse(readFileSync(baselinePath(root), 'utf8')); } catch { return null; }
}
function requirePair(args) {
  if (!args.harness || !args.sha) throw new Error('需要 --harness <版本> 与 --sha <插件 commit>');
  return { target: String(args.harness), sha: String(args.sha) };
}
function runCapture(cwd, cmd, argv) {
  const out = join(tmpdir(), `hc-baseline-${process.pid}-${Math.random().toString(36).slice(2)}.txt`);
  let fd = null;
  try {
    fd = openSync(out, 'w');
    execFileSync(cmd, argv, { cwd, stdio: ['ignore', fd, 'ignore'] });
    closeSync(fd);
    fd = null;
    return readFileSync(out, 'utf8');
  } catch {
    return null;
  } finally {
    if (fd !== null) { try { closeSync(fd); } catch {   } }
    try { rmSync(out, { force: true }); } catch {   }
  }
}
function pluginRevision(root, sha) {
  const raw = runCapture(root, 'git', ['ls-tree', '-r', sha]);
  if (raw === null) return null;
  const lines = raw.split('\n').map((s) => s.replace(/\r$/, '')).filter(Boolean)
    .filter((l) => !l.endsWith('\t' + BASELINE_REL));
  if (!lines.length) return null;
  return createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16);
}
function decide({ root = ROOT, target, sha, force = false, baseline } = {}) {
  if (force) return { shouldRun: true, why: '--force 指定强制重跑' };
  const bl = baseline === undefined ? readBaseline(root) : baseline;
  if (!bl) return { shouldRun: true, why: '基线文件不存在（首轮）' };
  if (bl.status !== 'pass') return { shouldRun: true, why: `基线 status=${bl.status}（只认 pass）` };
  if (bl.harness?.version !== target) {
    return { shouldRun: true, why: `harness ${bl.harness?.version ?? '（无）'} → 目标 ${target}` };
  }
  const cur = pluginRevision(root, sha);
  if (bl.plugin?.revision && cur && bl.plugin.revision === cur) {
    return { shouldRun: false, why: `基线已覆盖 ${target}（插件内容身份未变：${cur}）` };
  }
  if (bl.plugin?.commit !== sha) {
    return {
      shouldRun: true,
      why: `插件 ${String(bl.plugin?.commit ?? '').slice(0, 7)} → ${sha.slice(0, 7)}`
        + `（内容身份 ${bl.plugin?.revision ?? '（无）'} → ${cur ?? '（取不到）'}）`,
    };
  }
  return { shouldRun: false, why: `基线已覆盖 ${target} × ${sha.slice(0, 7)}` };
}
function check(args) {
  const { target, sha } = requirePair(args);
  const { shouldRun, why } = decide({ target, sha, force: args.force });
  console.log(`harness-compat check：${why} ⇒ should_run=${shouldRun}`);
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, `should_run=${shouldRun}\n`, { flag: 'a' });
  }
}
function record(args) {
  const { target, sha } = requirePair(args);
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const revision = pluginRevision(ROOT, sha);
  const bl = readBaseline();
  const already = bl && bl.status === 'pass' && bl.harness?.version === target
    && (revision ? bl.plugin?.revision === revision : bl.plugin?.commit === sha);
  if (already) {
    console.log(`harness-compat record：${target} × ${sha.slice(0, 7)} 已在基线，不改动`);
    return;
  }
  const plugin = { commit: sha, version: pkg.version || '' };
  if (revision) plugin.revision = revision;
  const doc = {
    harness: { package: HARNESS_PKG, distTag: args['dist-tag'] || 'latest', version: target },
    plugin,
    node: args.node || '',
    runner: args.runner || '',
    runId: process.env.GITHUB_RUN_ID || '',
    status: 'pass',
    passedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
  writeFileSync(baselinePath(ROOT), JSON.stringify(doc, null, 2) + '\n');
  console.log(`harness-compat record：${target} × ${sha.slice(0, 7)} 写入基线`
    + `（内容身份 ${revision ?? '取不到，只记 sha'}）`);
}
function selftest() {
  const root = mkdtempSync(join(tmpdir(), 'hc-baseline-selftest-'));
  const results = [];
  const ok = (name, cond, detail) => results.push({ name, cond: Boolean(cond), detail });
  const git = (...argv) => (runCapture(root, 'git', argv) || '').trim();
  try {
    git('init', '-q');
    git('config', 'user.email', 'selftest@example.invalid');
    git('config', 'user.name', 'selftest');
    mkdirSync(join(root, '.github'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'selftest', version: '0.0.0' }) + '\n');
    writeFileSync(join(root, 'work.txt'), 'v1\n');
    git('add', '-A');
    git('commit', '-qm', 'work v1');
    const sha1 = git('rev-parse', 'HEAD');
    const rev1 = pluginRevision(root, sha1);
    ok('能算出插件内容身份（16 位）', typeof rev1 === 'string' && rev1.length === 16, rev1);
    const H = '1.2.3';
    ok('负对照：无基线 ⇒ should_run=true',
      decide({ root, target: H, sha: sha1, baseline: null }).shouldRun === true);
    ok('负对照：harness 版本不同 ⇒ should_run=true',
      decide({ root, target: H, sha: sha1, baseline: { status: 'pass', harness: { version: '0.0.1' }, plugin: { commit: sha1, revision: rev1 } } }).shouldRun === true);
    const bl = { status: 'pass', harness: { version: H }, plugin: { commit: sha1, revision: rev1 } };
    writeFileSync(baselinePath(root), '{}\n');
    git('add', '-A');
    git('commit', '-qm', 'ci(baseline): selftest');
    const sha2 = git('rev-parse', 'HEAD');
    ok('只动基线文件 ⇒ 内容身份不变', pluginRevision(root, sha2) === rev1, pluginRevision(root, sha2));
    const d3 = decide({ root, target: H, sha: sha2, baseline: bl });
    ok('正判据：只动基线文件 ⇒ should_run=false（追尾修法）', d3.shouldRun === false, d3.why);
    writeFileSync(join(root, 'work.txt'), 'v2\n');
    git('add', '-A');
    git('commit', '-qm', 'work v2');
    const sha3 = git('rev-parse', 'HEAD');
    ok('正判据：真文件变了 ⇒ 内容身份变了', pluginRevision(root, sha3) !== rev1, pluginRevision(root, sha3));
    const d4 = decide({ root, target: H, sha: sha3, baseline: bl });
    ok('正判据：真文件变了 ⇒ should_run=true', d4.shouldRun === true, d4.why);
    const legacy = { status: 'pass', harness: { version: H }, plugin: { commit: sha3 } };
    ok('回退：无 revision 且 sha 相同 ⇒ should_run=false',
      decide({ root, target: H, sha: sha3, baseline: legacy }).shouldRun === false);
    ok('回退：无 revision 且 sha 不同 ⇒ should_run=true',
      decide({ root, target: H, sha: sha2, baseline: legacy }).shouldRun === true);
  } finally {
    try { rmSync(root, { recursive: true, force: true }); } catch {   }
  }
  let failed = 0;
  for (const r of results) {
    console.log((r.cond ? '✓ ' : '✗ ') + r.name + (r.detail ? ' — ' + r.detail : ''));
    if (!r.cond) failed++;
  }
  console.log('');
  if (failed) {
    console.log(`harness-compat-baseline selftest FAILED — ${failed}/${results.length}`);
    process.exit(1);
  }
  console.log(`harness-compat-baseline selftest PASSED (${results.length})`);
}
const cmd = process.argv[2];
const rest = process.argv.slice(3);
try {
  const args = parseArgs(rest);
  if (cmd === 'check') check(args);
  else if (cmd === 'record') record(args);
  else if (cmd === 'selftest') selftest();
  else throw new Error(`未知子命令：${cmd || '（空）'}（可用：check / record / selftest）`);
} catch (err) {
  console.error(`harness-compat-baseline：${err.message}`);
  process.exit(1);
}
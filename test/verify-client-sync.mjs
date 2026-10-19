import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACT = ROOT + 'lib/client.js';
const BUILD = ROOT + 'scripts/build-client.mjs';
let passed = 0;
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) passed++; else failed++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? ' — ' + detail : ''));
};
const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 12);
if (!existsSync(ARTIFACT) || !existsSync(BUILD)) {
  console.log('  ✗ 前置缺失：' + [ARTIFACT, BUILD].filter((p) => !existsSync(p)).join(' / ')
    + '（产物由 `npm run build` 现场生成；先跑一次构建）');
  process.exit(1);
}
const before = readFileSync(ARTIFACT);
let buildCode = 0;
let buildErr = '';
try {
  execFileSync(process.execPath, [BUILD], { cwd: ROOT, stdio: 'ignore', timeout: 120000, killSignal: 'SIGKILL' });
} catch (e) {
  buildCode = (e && typeof e.status === 'number') ? e.status : 1;
  buildErr = String((e && e.message) || e);
}
const after = readFileSync(ARTIFACT);
if (!after.equals(before)) writeFileSync(ARTIFACT, before);
const lf = (buf) => Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
const staleByLf = (after, before) => !lf(after).equals(lf(before));
check('重建命令成功退出（markers 齐全、产物可解析）', buildCode === 0,
  buildCode === 0 ? 'exit 0' : 'exit ' + buildCode + (buildErr ? ' · ' + buildErr.split('\n')[0] : ''));
const firstDiffLine = (a, b) => {
  const la = lf(a).toString('utf8').split('\n');
  const lb = lf(b).toString('utf8').split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] !== lb[i]) return i + 1;
  return 0;
};
const a0 = lf(after);
const b0 = lf(before);
const agree = !staleByLf(after, before);
const eolOnly = !after.equals(before) && agree;
check('构建产物与重建结果一致（按构建形态 LF 比较）', agree,
  agree ? sha(b0) + ' · ' + b0.length + ' B' + (eolOnly ? '（盘上仅行尾风格不同：检出侧 CRLF，属正常）' : '')
    : '产物 ' + sha(b0) + ' ≠ 重建 ' + sha(a0) + '；首处差异在第 ' + firstDiffLine(before, after)
      + ' 行 ⇒ 跑 `npm run build` 重建（产物不再入库，重建后无需提交它）');
{
  const tampered = Buffer.from(b0);
  tampered[tampered.length - 2] = tampered[tampered.length - 2] ^ 0x01;
  check('negative control: 内容差一个字节会被判出', staleByLf(tampered, b0),
    'len=' + tampered.length + ' · 首处差异第 ' + firstDiffLine(tampered, b0) + ' 行');
}
{
  const crlfAfter = Buffer.from('a\r\nb\r\n', 'utf8');
  const lfBefore = Buffer.from('a\nb\n', 'utf8');
  const changed = Buffer.from('a\nB\n', 'utf8');
  check('positive control: 只有 CRLF/LF 之差不算产物过期',
    staleByLf(crlfAfter, lfBefore) === false, 'CRLF vs LF ⇒ stale=' + staleByLf(crlfAfter, lfBefore));
  check('positive control 咬合：同一函数对"差一个字节"必须判 stale',
    staleByLf(changed, lfBefore) === true, 'a\\nb\\n vs a\\nB\\n ⇒ stale=' + staleByLf(changed, lfBefore));
}
{
  const tracked = (() => {
    try {
      const out = execFileSync('git', ['ls-files', '--', 'lib/client.js', 'docs/images'], { cwd: ROOT, encoding: 'utf8' });
      return out.split('\n').map((s) => s.trim()).filter(Boolean);
    } catch {
      return null;
    }
  })();
  if (tracked === null) {
    console.log('  ⚠ 不在 git 工作树里，跳过「产物不入库」判据（发布 tarball 场景）');
  } else {
    check('产物不入库：lib/client.js 与 docs/images/** 均未被 git 跟踪', tracked.length === 0,
      tracked.length === 0 ? 'ls-files 空' : '被跟踪 ' + tracked.length + ' 条：' + tracked.slice(0, 5).join(', ') + (tracked.length > 5 ? ' …' : ''));
    const probe = (() => {
      try {
        const out = execFileSync('git', ['ls-files', '--', 'test/verify-client-sync.mjs'], { cwd: ROOT, encoding: 'utf8' });
        return out.split('\n').map((s) => s.trim()).filter(Boolean);
      } catch { return []; }
    })();
    check('negative control: 同一判据对已跟踪文件有牙（本守卫自身被列出）', probe.length === 1,
      'probe=' + JSON.stringify(probe));
  }
}
console.log('\n' + (failed ? 'CLIENT SYNC CHECKS FAILED — ' + failed + ' failed' : 'CLIENT SYNC CHECKS PASSED')
  + ' (' + (passed + failed) + ')');
process.exit(failed ? 1 : 0);
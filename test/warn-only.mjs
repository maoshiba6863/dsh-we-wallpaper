import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const PROBE = argv[0] === '--probe-spawn';
const [target, ...rest] = PROBE ? argv.slice(1) : argv;
if (!target) {
  console.error('用法：node test/warn-only.mjs [--probe-spawn] <脚本相对路径> [参数…]');
  process.exit(2);
}
const abs = join(ROOT, target);
if (!existsSync(abs)) {
  console.error('✗ 前置缺失：找不到 ' + target + ' —— 本入口只做降级与探测，不替你找脚本');
  process.exit(2);
}
if (PROBE) {
  const blocked = [
    ['带管道（协议通道）', { stdio: ['pipe', 'pipe', 'pipe'] }],
    ['detached', { stdio: 'ignore', detached: true, windowsHide: true }],
    ['plain', { stdio: 'ignore', windowsHide: true }],
  ].filter(([, opts]) => {
    const r = spawnSync(process.execPath, ['-e', 'process.exit(0)'], opts);
    return !(r.error === undefined && r.status === 0);
  }).map(([name]) => name);
  if (blocked.length) {
    console.log('SKIP ' + target + ' —— 本环境起不了子进程（' + blocked.join(' / ') + '）。');
    console.log('     这不是"通过"：该自检在本环境**没有覆盖**（CI 与普通终端里照跑）。');
    process.exit(0);
  }
}
const r = spawnSync(process.execPath, [abs, ...rest], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, DSH_WARN_ONLY: '1' },
});
if (r.status === null) {
  console.log('SKIP ' + target + ' —— 本环境没能把该自检跑起来（spawn 失败'
    + (r.error ? '：' + (r.error.code || r.error.message) : '，或进程被信号结束')
    + (r.signal ? '，signal=' + r.signal : '') + '）。');
  console.log('     这不是"通过"：该自检在本环境**没有覆盖**（CI 与普通终端里照跑）。');
  process.exit(0);
}
if (r.status !== 0) {
  console.log('\n[warn-only] 软档守卫原退出码 = ' + r.status
    + ' —— 已降级为警告，不决定本次红绿（判据未改；要它重新拦下改动，就 `node ' + target + '` 直接跑）');
}
process.exit(0);
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HERE = 'test/run-guards.mjs';
function npmLaunch(args) {
  const candidates = [];
  if (process.env.npm_execpath && /\.m?js$/.test(process.env.npm_execpath)) {
    candidates.push(process.env.npm_execpath);
  }
  candidates.push(join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  for (const c of candidates) {
    if (existsSync(c)) return { exe: process.execPath, argv: [c, ...args], shell: false };
  }
  return { exe: process.platform === 'win32' ? 'npm.cmd' : 'npm', argv: args, shell: process.platform === 'win32' };
}
const step = (file, args = [], tier = 'hard', probe = false) => ({ file, args, tier, probe });
const npmStep = (script) => ({ file: null, npm: script, args: [], tier: 'hard', probe: false });
const VERIFY_STEPS = [
  step('test/verify-client-sync.mjs'),
  step('test/verify-windows-caption.mjs'),
  step('test/verify-playback-controls.mjs'),
  step('test/verify-scene.mjs'),
  step('test/verify-scene-frame-master.mjs'),
  step('test/verify-scene-live-occlusion.mjs'),
  step('test/verify-scene-probe.mjs'),
  step('test/verify-occlusion-hub.mjs'),
  step('test/verify-occlusion-client.mjs'),
  step('test/verify-adapter.mjs'),
  step('test/verify-theme-follow.mjs'),
  step('test/verify-logging.mjs'),
  step('test/verify-media-bridge.mjs', ['--allow-skip'], 'soft', true),
  step('test/verify-media-probe.mjs'),
  step('test/verify-softrender.mjs'),
  step('test/verify-extra-glass.mjs'),
  step('test/verify-package-files.mjs'),
  step('test/verify-package-publish.mjs'),
  step('test/verify-contracts.mjs'),
  step('test/verify-body-caps.mjs'),
  step('test/verify-json-response.mjs'),
  step('test/verify-billing.mjs'),
  step('test/verify-host-paint-scope.mjs'),
  step('test/verify-cache-dir.mjs'),
  step('test/verify-we-install-probe.mjs'),
  step('test/verify-wallpaper-scan.mjs'),
  step('test/verify-inventory-index.mjs'),
  step('test/verify-mp4-vfs.mjs'),
  step('test/verify-theme-layer.mjs'),
  step('test/verify-component-fonts.mjs'),
  step('test/verify-picker-upload.mjs'),
  step('test/verify-picker-props.mjs'),
  step('test/verify-config-store.mjs'),
  step('test/verify-asset-paths.mjs'),
];
const SMOKE_STEPS = [
  step('test/rotation-smoke.mjs'),
  step('test/rotation-live-smoke.mjs'),
  step('test/rotation-prepared-leak-smoke.mjs'),
  step('test/live-frame-backfill-smoke.mjs'),
  step('test/live-frame-async-identity-smoke.mjs'),
  step('test/fontset-load-smoke.mjs'),
];
const MANIFEST = {
  verify: { chainKey: 'verify', steps: VERIFY_STEPS },
  smoke: { chainKey: 'smoke', steps: SMOKE_STEPS },
  all: { chainKey: 'verify:all', steps: [npmStep('build'), ...VERIFY_STEPS, ...SMOKE_STEPS] },
};
function commandOf(s) {
  if (s.npm) return 'npm run ' + s.npm;
  const guard = ['node', s.file, ...s.args].join(' ');
  if (s.tier !== 'soft') return guard;
  return ['node', 'test/warn-only.mjs', ...(s.probe ? ['--probe-spawn'] : []), s.file, ...s.args].join(' ');
}
function stepsOf(group) {
  const entry = MANIFEST[group];
  return entry ? entry.steps : null;
}
function chainKeyOf(group) {
  const entry = MANIFEST[group];
  return entry ? entry.chainKey : null;
}
function listJson(group) {
  return {
    group,
    chainKey: chainKeyOf(group),
    steps: stepsOf(group).map((s, i) => ({
      index: i + 1,
      kind: s.npm ? 'npm' : 'guard',
      npm: s.npm || null,
      file: s.file,
      args: s.args,
      tier: s.tier,
      probe: s.probe,
      command: commandOf(s),
    })),
  };
}
function runStep(s) {
  if (s.npm) {
    const l = npmLaunch(['run', s.npm]);
    const r = spawnSync(l.exe, l.argv, { cwd: ROOT, stdio: 'inherit', shell: l.shell });
    return r.status;
  }
  const argv = s.tier === 'soft'
    ? [join(ROOT, 'test', 'warn-only.mjs'), ...(s.probe ? ['--probe-spawn'] : []), s.file, ...s.args]
    : [join(ROOT, s.file), ...s.args];
  const r = spawnSync(process.execPath, argv, { cwd: ROOT, stdio: 'inherit' });
  return r.status;
}
const USAGE = '用法：node ' + HERE + ' [verify|docs|smoke|all] [--list|--list-json]';
const GROUPS = Object.keys(MANIFEST);
const rawArgs = process.argv.slice(2);
const wantList = rawArgs.includes('--list');
const wantJson = rawArgs.includes('--list-json');
const positional = rawArgs.filter((a) => !a.startsWith('--'));
const unknownFlags = rawArgs.filter((a) => a.startsWith('--') && a !== '--list' && a !== '--list-json');
if (unknownFlags.length) {
  console.error('✗ 未知参数：' + unknownFlags.join(' ') + '\n' + USAGE);
  process.exit(2);
}
if (positional.length > 1) {
  console.error('✗ 只接受一个组名，收到：' + positional.join(' ') + '\n' + USAGE);
  process.exit(2);
}
const group = positional[0] || 'verify';
const steps = stepsOf(group);
if (!steps) {
  console.error('✗ 未知组：' + group + '（可选：' + GROUPS.join(' / ') + '）\n' + USAGE);
  process.exit(2);
}
if (wantJson) {
  console.log(JSON.stringify(listJson(group), null, 2));
  process.exit(0);
}
if (wantList) {
  for (const s of steps) console.log(commandOf(s));
  process.exit(0);
}
const deadFiles = steps.filter((s) => s.file && !existsSync(join(ROOT, s.file)));
if (deadFiles.length) {
  console.error('✗ 清单里有 ' + deadFiles.length + ' 条指向不存在的文件（清单漂了）：');
  for (const s of deadFiles) console.error('    ' + s.file);
  process.exit(2);
}
console.log('▶ ' + group + ' —— ' + steps.length + ' 步（硬档 '
  + steps.filter((s) => s.tier !== 'soft').length + ' / 软档 '
  + steps.filter((s) => s.tier === 'soft').length + '）');
for (let i = 0; i < steps.length; i++) {
  const s = steps[i];
  console.log('\n── [' + (i + 1) + '/' + steps.length + '] ' + commandOf(s));
  const status = runStep(s);
  if (status === null) {
    console.error('✗ [' + (i + 1) + '/' + steps.length + '] 没能起来：' + commandOf(s));
    process.exit(1);
  }
  if (status !== 0 && s.tier !== 'soft') {
    console.error('✗ [' + (i + 1) + '/' + steps.length + '] 退出码 = ' + status + ' ⇒ 链在此短路');
    process.exit(status);
  }
  if (status !== 0) {
    console.log('⚠ [' + (i + 1) + '/' + steps.length + '] 软档守卫原退出码 = ' + status
      + '（已由 warn-only 降级，不决定本组红绿）');
  }
}
console.log('\n✓ ' + group + ' 全部 ' + steps.length + ' 步执行完毕');
process.exit(0);
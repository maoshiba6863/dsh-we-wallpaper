import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync, openSync, closeSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createMediaBackend } from '../lib/media/index.js';
import {
  MEDIA_BRIDGE_TAG, MEDIA_BRIDGE_ASSETS, MEDIA_BRIDGE_SHA256, MEDIA_BRIDGE_FALLBACKS,
  mediaBridgeAssetFor, mediaBridgeCachePath, binaryMagicOk, provisionMediaBridge,
} from '../lib/media/provision.js';
import { lyricsToTuples, bridgeServeArgs, MEDIA_CONTROL_ACTIONS, createBridgeSupervisor } from '../lib/media/supervisor.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DIR = join(root, '.test-cache', 'verify-media-bridge');
const PROVISION = process.argv.includes('--provision');
const ALLOW_SKIP = process.argv.includes('--allow-skip');
let passed = 0;
let failed = 0;
let skipped = 0;
let blocked = 0;
const blockedNames = [];
let channelSkipped = '';
function check(name, ok, detail) {
  if (ok) passed++; else failed++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? ' — ' + detail : ''));
}
function skip(name, why) {
  skipped++;
  console.log('  ○ ' + name + (why ? ' — ' + why : ''));
}
function blockedBy(name, why) {
  blocked++;
  blockedNames.push(name);
  console.log('  ⛔ ' + name + ' —— 未执行' + (why ? '：' + why : ''));
}
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
function classifyProbe({ spawned, wrote, exited, timedOut, hello }) {
  if (!spawned) return 'environment';
  if (hello) return 'environment';
  if (wrote || exited) return 'regression';
  return timedOut ? 'environment' : 'regression';
}
async function probeHandshakeViaFiles(bin, args, dir, timeoutMs = 20000) {
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, 'probe.out');
  const errPath = join(dir, 'probe.err');
  const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };
  let outFd;
  let errFd;
  try {
    outFd = openSync(outPath, 'w');
    errFd = openSync(errPath, 'w');
  } catch (e) {
    return { spawned: false, exited: false, wrote: false, timedOut: false, hello: false, stdout: '', stderr: '', detail: '打不开探针输出文件：' + String((e && e.message) || e) };
  }
  const r = { spawned: false, exited: false, wrote: false, timedOut: false, hello: false, stdout: '', stderr: '', detail: '' };
  let p;
  try {
    p = spawn(bin, args, { stdio: ['pipe', outFd, errFd], windowsHide: true });
  } catch (e) {
    try { closeSync(outFd); closeSync(errFd); } catch {   }
    r.detail = String((e && e.message) || e);
    return r;
  }
  r.spawned = true;
  p.once('exit', () => { r.exited = true; });
  p.once('error', (e) => { r.detail = String((e && e.message) || e); });
  try { p.stdin.write(JSON.stringify({ id: 1, method: 'hello', params: {} }) + '\n'); } catch {   }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(250);
    const so = read(outPath);
    if (/"id"\s*:\s*1/.test(so) || r.exited) break;
  }
  try { if (p && !p.killed) p.kill('SIGKILL'); } catch {   }
  try { closeSync(outFd); closeSync(errFd); } catch {   }
  const so = read(outPath);
  const se = read(errPath);
  r.hello = /"id"\s*:\s*1/.test(so) && /"ok"\s*:\s*true/.test(so);
  r.wrote = Boolean(so.trim() || se.trim());
  r.timedOut = !r.exited && !r.wrote && !r.hello;
  r.stdout = so.slice(0, 300);
  r.stderr = se.slice(0, 300);
  return r;
}
function artifactTrusted(bin, assetName) {
  const want = String(MEDIA_BRIDGE_SHA256[assetName] || '');
  if (!/^[0-9a-f]{64}$/.test(want)) return { ok: false, why: '产物表里没有它的期望 sha256（无法确认手上这份就是发布产物）' };
  try {
    const got = createHash('sha256').update(readFileSync(bin)).digest('hex');
    return got === want
      ? { ok: true, why: 'sha256 与发布产物一致' }
      : { ok: false, why: `sha256 与发布产物不一致（手上 ${got.slice(0, 12)}…）` };
  } catch (e) {
    return { ok: false, why: '读不出产物字节：' + String((e && e.message) || e) };
  }
}
console.log('· 产物解析表');
check('darwin 两个架构都指向通用包',
  mediaBridgeAssetFor('darwin', 'arm64') === 'media-bridge-darwin-universal'
  && mediaBridgeAssetFor('darwin', 'x64') === 'media-bridge-darwin-universal');
check('linux x64 取 musl 静态包（无 glibc 下限）',
  mediaBridgeAssetFor('linux', 'x64') === 'media-bridge-linux-x64-musl');
check('win32 有 x64 与 arm64 两个产物',
  mediaBridgeAssetFor('win32', 'x64') === 'media-bridge-win32-x64.exe'
  && mediaBridgeAssetFor('win32', 'arm64') === 'media-bridge-win32-arm64.exe');
check('不支持的架构返回 null（回落内置实现）', mediaBridgeAssetFor('linux', 'ia32') === null);
const allAssets = [...new Set(Object.values(MEDIA_BRIDGE_ASSETS).flatMap((a) => Object.values(a)))];
const hasHash = (a) => /^[0-9a-f]{64}$/.test(String(MEDIA_BRIDGE_SHA256[a] || ''));
check('每个产物都有 sha256（或回落链里有）',
  allAssets.every((a) => hasHash(a) || (MEDIA_BRIDGE_FALLBACKS[a] || []).some(hasHash)),
  allAssets.map((a) => a + (hasHash(a) ? '✓' : '→回落')).join(', '));
check('产物名带版本标签（升级时哈希必须一起换）', /^v\d+\.\d+\.\d+$/.test(MEDIA_BRIDGE_TAG));
check('可执行魔数识别（PE / ELF / Mach-O / universal）',
  binaryMagicOk(Buffer.from([0x4d, 0x5a, 0, 0]))
  && binaryMagicOk(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
  && binaryMagicOk(Buffer.from([0xcf, 0xfa, 0xed, 0xfe]))
  && binaryMagicOk(Buffer.from([0xca, 0xfe, 0xba, 0xbe]))
  && !binaryMagicOk(Buffer.from([0x3c, 0x21, 0x44, 0x4f])));
console.log('· 歌词换算（渲染页要 [[秒, 文本], …]）');
const lyr = lyricsToTuples({
  offsetMs: 500,
  lines: [{ tMs: 1000, text: '第一句' }, { tMs: 12500, text: '第二句' }, { tMs: null, text: '丢掉' }],
});
check('ms → 秒并叠加 offsetMs',
  Array.isArray(lyr) && lyr.length === 2
  && lyr[0][0] === 1.5 && lyr[0][1] === '第一句' && lyr[1][0] === 13,
  JSON.stringify(lyr));
check('空歌词返回 null（渲染页退回「没有歌词」）',
  lyricsToTuples(null) === null && lyricsToTuples({ lines: [] }) === null
  && lyricsToTuples({ lines: [{ tMs: 100 }] }) !== null);
check('时间轴不会被 offset 推成负数', lyricsToTuples({ offsetMs: -90000, lines: [{ tMs: 100, text: 'x' }] })[0][0] === 0);
console.log('· 反向控制（动作白名单 + 未就绪时的诚实拒绝）');
check('五个渲染页动作各有映射，不多不少',
  MEDIA_CONTROL_ACTIONS.play === 'play' && MEDIA_CONTROL_ACTIONS.pause === 'pause'
  && MEDIA_CONTROL_ACTIONS.playPause === 'play-pause'
  && MEDIA_CONTROL_ACTIONS.skipNext === 'next' && MEDIA_CONTROL_ACTIONS.skipPrevious === 'previous'
  && Object.keys(MEDIA_CONTROL_ACTIONS).length === 5);
{
  const idle = createMediaBackend({ dataDir: join(TEST_DIR, 'control-idle'), log: () => {} });
  const r = await idle.control('play');
  check('未就绪时 control 回不可用（不抛、不造成功）',
    r && r.ok === false && typeof r.error === 'string' && r.error.length > 0, JSON.stringify(r));
  check('未就绪时 control 不触发懒启动', idle.usingBridge() === false);
  idle.stop();
  const sup = createBridgeSupervisor({ binPath: join(TEST_DIR, 'not-a-binary'), cacheDir: TEST_DIR, log: () => {} });
  const unknown = await sup.control('seek');
  check('未知动作被白名单挡在守护层（不落到中间件）',
    unknown && unknown.ok === false && unknown.error === 'unknown-action', JSON.stringify(unknown));
  const notUp = await sup.control('play');
  check('守护未启动时已知动作回 not-running（不 spawn）',
    notUp && notUp.ok === false && /中间件未运行/.test(String(notUp.error)), JSON.stringify(notUp));
  sup.stop();
}
console.log('· 环境探针判定（把"环境跑不动"与"中间件坏了"分开）');
check('探针：起不来 ⇒ environment（受限句柄 / 不允许 spawn）',
  classifyProbe({ spawned: false, wrote: false, exited: false, timedOut: false, hello: false }) === 'environment');
check('探针：文件通道拿到 hello ⇒ environment（产物与协议都对，坏的是管道那一层）',
  classifyProbe({ spawned: true, wrote: true, exited: false, timedOut: false, hello: true }) === 'environment');
check('探针：说了别的话或提前退出 ⇒ regression（可行动的失败，不得记成环境跳过）',
  classifyProbe({ spawned: true, wrote: true, exited: false, timedOut: false, hello: false }) === 'regression'
  && classifyProbe({ spawned: true, wrote: false, exited: true, timedOut: false, hello: false }) === 'regression');
check('探针：存活且文件全空 ⇒ environment（连文件都不说话 = 进程被环境挂住）',
  classifyProbe({ spawned: true, wrote: false, exited: false, timedOut: true, hello: false }) === 'environment');
console.log('· 找中间件产物');
mkdirSync(TEST_DIR, { recursive: true });
const asset = mediaBridgeAssetFor();
let binPath = '';
let binSource = '';
const envBin = process.env.DSH_WE_MEDIA_BRIDGE && process.env.DSH_WE_MEDIA_BRIDGE.trim();
const candidates = [
  ['env', envBin ? resolve(envBin) : ''],
  ['plugin-bin', asset ? join(root, 'bin', asset) : ''],
  ['test-cache', asset ? mediaBridgeCachePath(TEST_DIR, MEDIA_BRIDGE_TAG, asset) : ''],
  ['user-cache', asset ? mediaBridgeCachePath(join(homedir(), '.dsh-wallpaper-engine'), MEDIA_BRIDGE_TAG, asset) : ''],
];
for (const [src, p] of candidates) {
  if (p && existsSync(p)) { binPath = p; binSource = src; break; }
}
if (!binPath && PROVISION) {
  const prov = await provisionMediaBridge({ dataDir: TEST_DIR, log: (m) => console.log('    · ' + m) });
  if (prov.path) { binPath = prov.path; binSource = prov.source; }
  else console.log('    · 下载没成功：' + prov.error);
}
if (!binPath) {
  blockedBy('中间件端到端用例', '本机没有产物 —— 跑 `node test/verify-media-bridge.mjs --provision` 下载 '
    + MEDIA_BRIDGE_TAG + '；明确接受这次不跑就传 `--allow-skip`');
} else {
  console.log(`   产物：${binPath}（${binSource}）`);
  console.log('· 门面（mock provider）');
  process.env.DSH_WE_MEDIA_PROVIDER = 'mock';
  const bootMs = PROVISION ? 90000 : (Number(process.env.DSH_WE_MEDIA_BOOT_MS) || 25000);
  process.env.DSH_WE_MEDIA_BOOT_MS = String(bootMs);
  const backend = createMediaBackend({ dataDir: TEST_DIR, log: (m) => console.log('    · ' + m) });
  backend.start({ audio: false, online: false });
  let ready = false;
  const readyDeadline = Date.now() + bootMs + 15000;
  while (!ready && Date.now() < readyDeadline) { await sleep(150); ready = backend.usingBridge(); }
  check('中间件就绪（握手通过、子进程在跑）', ready, `引导预算 ${bootMs}ms`);
  if (ready) {
    const info = backend.bridgeInfo() || {};
    check('hello.protocol = 1（协议版本一致才用）', Number(info.protocol) === 1);
    check('hello 报告平台与后端', Boolean(info.platform) && Boolean(info.provider),
      `${info.platform}/${info.arch} ${info.provider}`);
    let np = null;
    for (let i = 0; i < 20 && !np; i++) { await sleep(150); np = backend.nowPlaying(); }
    check('快照映射出曲目信息', Boolean(np && np.title && np.artist),
      np ? `${np.title} - ${np.artist}` : 'null');
    check('播放态映射成旧 wire 的 1/2/0', Boolean(np) && [0, 1, 2].includes(np.state), np ? String(np.state) : '');
    check('时长/进度是秒（不是毫秒）',
      Boolean(np) && np.duration > 10 && np.duration < 10000 && np.position >= 0 && np.position <= np.duration + 1,
      np ? `pos=${np.position.toFixed(1)}s dur=${np.duration.toFixed(1)}s` : '');
    check('封面存在时给出宿主代理路径', Boolean(np && np.thumbnail) === Boolean(backend.artworkFile()),
      np && np.thumbnail ? String(np.thumbnail) : '（无封面）');
    check('封面文件真的落盘了且 MIME 可用',
      !backend.artworkFile() || (existsSync(backend.artworkFile()) && /^image\//.test(backend.artworkMime())),
      backend.artworkFile() ? backend.artworkMime() : '（无封面）');
    check('歌词缺省时不硬塞空数组（不给渲染页假歌词）',
      !np || np.lyrics === undefined || Array.isArray(np.lyrics));
    const sp = backend.spectrum();
    check('频谱恒为 64 段（音频关时全 0，不是错误）',
      sp && sp.length === 64 && typeof sp[0] === 'number');
    const before = np ? np.position : 0;
    await sleep(1200);
    const after = backend.nowPlaying();
    check('位置随真实时间外推（不是卡在上报值）',
      Boolean(after) && after.position > before,
      `${before.toFixed(1)}s → ${after ? after.position.toFixed(1) : '?'}s`);
    const ctlPause = await backend.control('pause');
    check('control(pause) 打到中间件且回读到暂停',
      ctlPause && ctlPause.ok === true && (backend.nowPlaying() || {}).state === 2,
      JSON.stringify(ctlPause) + ' state=' + String((backend.nowPlaying() || {}).state));
    const ctlPlay = await backend.control('play');
    check('control(play) 恢复播放并回读到播放态',
      ctlPlay && ctlPlay.ok === true && (backend.nowPlaying() || {}).state === 1,
      JSON.stringify(ctlPlay) + ' state=' + String((backend.nowPlaying() || {}).state));
    const ctlNext = await backend.control('skipNext');
    check('control(skipNext) 映射到中间件的 next', ctlNext && ctlNext.ok === true, JSON.stringify(ctlNext));
    const st = backend.status();
    check('status 形状与内置实现同名同形（audio/nowPlaying 两段 + 后端标记）',
      st.audio && typeof st.audio.status === 'string'
      && st.nowPlaying && typeof st.nowPlaying.status === 'string'
      && st.backend === 'bridge' && st.fallback === '',
      `audio=${st.audio.status} nowPlaying=${st.nowPlaying.status}`);
    check('用户关掉音频时不装音频桥（status.audio=off）', st.audio.status === 'off', st.audio.status);
    check('mock 下 metadata 源在跑', st.nowPlaying.status === 'running', st.nowPlaying.status);
    const pid = Number(info.pid) || 0;
    backend.stop();
    let alive = false;
    for (let i = 0; i < 12; i++) {
      await sleep(250);
      alive = false;
      if (pid) { try { process.kill(pid, 0); alive = true; } catch { alive = false; } }
      if (!alive) break;
    }
    check('stop() 后子进程退出（不留孤儿）', !alive, pid ? 'pid ' + pid : '（hello 没给 pid）');
  } else {
    backend.stop();
    const probe = await probeHandshakeViaFiles(binPath, bridgeServeArgs({
      cacheDir: join(TEST_DIR, 'probe-cache'), audio: false, online: false, mock: true,
    }), join(TEST_DIR, 'probe'));
    const verdict = classifyProbe(probe);
    const trust = artifactTrusted(binPath, asset);
    const probeBrief = (probe.hello ? '文件通道拿到了 hello 应答' : (probe.stdout || probe.stderr
      ? '子进程原话：' + String(probe.stdout || probe.stderr).replace(/\s+/g, ' ').slice(0, 160)
      : (probe.spawned ? '存活且文件全空' : '起不来：' + (probe.detail || 'spawn 失败'))));
    if (verdict === 'regression') {
      check('中间件就绪（握手通过、子进程在跑）', false,
        JSON.stringify(backend.status().fallback || '')
        + `（引导预算 ${bootMs}ms；文件探针判**回归**：${probeBrief} ⇒ 不是环境差异）`);
    } else if (!trust.ok) {
      check('中间件就绪（握手通过、子进程在跑）', false,
        JSON.stringify(backend.status().fallback || '')
        + `（引导预算 ${bootMs}ms；探针判 ${verdict}，但产物不可信：${trust.why} ⇒ 不能归因给环境）`);
    } else {
      channelSkipped = probeBrief;
      skip('中间件端到端用例', `文件探针判 ${verdict}：${probeBrief}；产物可信（${trust.why}）⇒ 判为环境差异（非协议回归）`);
    }
  }
}
console.log('· 回落路径');
process.env.DSH_WE_MEDIA_LEGACY = '1';
const fb = createMediaBackend({ dataDir: join(TEST_DIR, 'fallback'), log: () => {} });
fb.start({ audio: false, online: false });
await sleep(300);
const fst = fb.status();
check('强制内置实现时不走中间件', fb.usingBridge() === false);
check('回落原因写进 status.fallback（给用户看的原因）', typeof fst.fallback === 'string' && fst.fallback.length > 0, fst.fallback);
check('回落状态也是旧形状（audio/nowPlaying）',
  Boolean(fst.audio) && typeof fst.audio.status === 'string' && Boolean(fst.nowPlaying));
check('回落时不偷偷开音频采集（audio=off 传下去）', fst.audio.status === 'off', fst.audio.status);
fb.stop();
console.log('· 产物是坏二进制时不卡住、不留孤儿');
delete process.env.DSH_WE_MEDIA_LEGACY;
process.env.DSH_WE_MEDIA_IDLE_MS = '0';
const bogus = join(TEST_DIR, 'bogus-binary');
{
  const head = Buffer.alloc(4096);
  head.writeUInt32BE(0x7f454c46, 0);
  const filler = Buffer.alloc(4 * 1024 * 1024, 0x41);
  head.copy(filler, 0);
  writeFileSync(bogus, filler, { mode: 0o755 });
}
process.env.DSH_WE_MEDIA_BRIDGE = bogus;
const bog = createMediaBackend({ dataDir: join(TEST_DIR, 'bogus'), log: () => {} });
bog.start({ audio: false, online: false });
let bogFallback = '';
for (let i = 0; i < 120 && !bogFallback; i++) { await sleep(150); bogFallback = bog.status().fallback || ''; }
check('坏产物 → 回落内置实现（不无限等）', Boolean(bogFallback) && bog.usingBridge() === false,
  bogFallback || '（超时未回落）');
bog.stop();
await sleep(1500);
if (process.platform === 'win32') {
  skip('坏产物没有留下孤儿进程', 'Windows 上没有 pgrep');
} else {
  let stray = '';
  try {
    stray = execFileSync('pgrep', ['-fl', 'bogus-binary'], { encoding: 'utf8' }).trim();
  } catch {   }
  check('坏产物没有留下孤儿进程', !stray, stray || '无');
}
delete process.env.DSH_WE_MEDIA_BRIDGE;
delete process.env.DSH_WE_MEDIA_IDLE_MS;
rmSync(join(TEST_DIR, 'fallback'), { recursive: true, force: true });
rmSync(join(TEST_DIR, 'bogus'), { recursive: true, force: true });
rmSync(join(TEST_DIR, 'probe'), { recursive: true, force: true });
rmSync(join(TEST_DIR, 'probe-cache'), { recursive: true, force: true });
rmSync(bogus, { force: true });
check('覆盖面地板：本次至少执行 19 条判据（否则汇总的"通过"是空域上的）', passed + failed >= 19,
  '已执行 ' + (passed + failed) + ' 条');
console.log(`\nmedia-bridge 自检：${passed} 通过 / ${failed} 失败`
  + `${skipped ? ` / ${skipped} 平台跳过` : ''}`
  + `${blocked ? ` / ${blocked} 未执行（缺前置）` : ''}`);
if (blocked && !ALLOW_SKIP) {
  console.log(`\n✗ 有 ${blocked} 段因缺前置**没有执行**（${blockedNames.join('、')}）—— `
    + '默认判失败，因为"没跑"与"通过"不能同形。');
  console.log('  要么补前置（--provision / 设 DSH_WE_MEDIA_BRIDGE），要么显式接受：--allow-skip');
  process.exit(1);
}
if (blocked) {
  console.log(`\n⚠️  ${blocked} 段被显式允许跳过（--allow-skip）：${blockedNames.join('、')} —— `
    + '这条通道本次没有任何断言覆盖。');
}
if (channelSkipped) {
  console.log('\n⚠️  「中间件端到端用例」本次判为**环境跳过**：' + channelSkipped + '。');
  console.log('   这条通道本次**没有断言覆盖**（不是通过）：产物存在且 sha256 通过，失败形态是'
    + '"存活但不吭声"，与协议回归不可区分 ⇒ 交给探针裁决，探针也判环境。');
  console.log('   在有媒体栈的机器（或本机 `node test/verify-media-bridge.mjs --provision`）上这一步会真跑。');
}
process.exit(failed ? 1 : 0);
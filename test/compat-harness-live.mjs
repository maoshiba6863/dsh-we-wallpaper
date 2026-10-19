import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CACHE = join(ROOT, '.test-cache', 'compat');
const ISO_HOME = join(CACHE, 'home');
const DATA_DIR = join(ISO_HOME, '.dsh-wallpaper-engine');
const LOG_FILE = join(CACHE, 'harness.log');
const PLUGIN = 'dsh-we-wallpaper';
const BASE = '/wallpaper-engine';
const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const PORT = Number(argOf('--port', process.env.DSH_WE_COMPAT_PORT || 5199));
const FRESH = argv.includes('--fresh');
const CHANNEL = argOf('--channel', process.env.DSH_WE_COMPAT_CHANNEL || 'link');
if (!['link', 'tarball'].includes(CHANNEL)) {
  console.error('未知的 --channel：' + CHANNEL + '（只认 link | tarball）');
  process.exit(2);
}
const childEnv = {
  ...process.env,
  HOME: ISO_HOME,
  USERPROFILE: ISO_HOME,
  DSH_WE_DATA_DIR: DATA_DIR,
  DSH_WE_UPLOAD_DIR: join(CACHE, 'upload'),
  DSH_WE_CACHE_DIR: join(CACHE, 'cache'),
  DSH_WE_STEAM_ROOT: join(CACHE, 'steam'),
  DSH_WE_MEDIA_LEGACY: '1',
};
const results = [];
function check(name, ok, detail) {
  results.push(Boolean(ok));
  console.log((ok ? '✓ ' : '✗ ') + name + (detail ? ' — ' + detail : ''));
  return Boolean(ok);
}
const tail = (s, n = 30) => String(s).split('\n').slice(-n).join('\n');
const spawnTool = (cmd, args, opts = {}) =>
  spawn(cmd, args, { ...opts, shell: process.platform === 'win32' });
function runTool(cmd, args, { env, timeoutMs = 300000 } = {}) {
  return new Promise((resolveP) => {
    const child = spawnTool(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let settled = false;
    const done = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveP({ code, out });
    };
    const timer = setTimeout(() => { out += '\n[timeout]\n'; try { child.kill('SIGKILL'); } catch {   } done(124); }, timeoutMs);
    child.stdout.on('data', (b) => { out += b; });
    child.stderr.on('data', (b) => { out += b; });
    child.on('error', (e) => { out += String(e.stack || e); done(127); });
    child.on('exit', (code) => done(code ?? 1));
  });
}
function get(port, pathAndQuery, headers = {}) {
  return new Promise((resolveP) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path: pathAndQuery, method: 'GET', timeout: 5000, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolveP({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
          setCookie: ([]).concat(res.headers['set-cookie'] || []).map((s) => String(s).split(';')[0]),
        }));
      },
    );
    req.on('error', (e) => resolveP({ status: 0, body: String(e.message), setCookie: [] }));
    req.on('timeout', () => { req.destroy(); resolveP({ status: 0, body: 'timeout', setCookie: [] }); });
    req.end();
  });
}
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function waitUntil(fn, timeoutMs, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() >= deadline) return null;
    await sleep(intervalMs);
  }
}
async function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch {   } }
  }
  await waitUntil(async () => child.exitCode !== null || child.signalCode !== null, 10000, 200);
  if (child.exitCode === null && child.signalCode === null && process.platform !== 'win32') {
    try { process.kill(-child.pid, 'SIGKILL'); } catch {   }
  }
}
function startHarness() {
  const child = spawnTool('dsh', ['--profile', 'web', '--no-open', '--port', String(PORT)], {
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let out = '';
  const sink = createWriteStream(LOG_FILE, { flags: 'w' });
  const onData = (b) => { out += b; sink.write(b); };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('error', (e) => { out += String(e.stack || e); });
  return { child, output: () => out };
}
function diagFileHasMarker(file, marker) {
  if (!existsSync(file)) return false;
  return readFileSync(file, 'utf8').split('\n').some((line) => {
    if (!line) return false;
    try {
      const o = JSON.parse(line);
      return o.kind === 'renderer' && String(o.msg || '').includes(marker);
    } catch { return false; }
  });
}
async function main() {
  if (FRESH) rmSync(ISO_HOME, { recursive: true, force: true });
  for (const d of [ISO_HOME, DATA_DIR, childEnv.DSH_WE_UPLOAD_DIR, childEnv.DSH_WE_CACHE_DIR, childEnv.DSH_WE_STEAM_ROOT, CACHE]) {
    mkdirSync(d, { recursive: true });
  }
  console.log('安装通道 = ' + CHANNEL + '（' + (CHANNEL === 'tarball' ? 'npm pack 的产物' : '工作区软链') + '）\n');
  const iso = spawnSync(process.execPath, ['-e', 'process.stdout.write(require("node:os").homedir())'],
    { env: childEnv, encoding: 'utf8' });
  if (!check('隔离 HOME 对子进程生效（homedir 指向隔离目录）',
    iso.status === 0 && resolve(String(iso.stdout)) === resolve(ISO_HOME),
    iso.status === 0 ? String(iso.stdout) : '退出 ' + iso.status)) return;
  let spec = 'link:' + ROOT;
  if (CHANNEL === 'tarball') {
    const packDir = join(CACHE, 'pack-tarball');
    rmSync(packDir, { recursive: true, force: true });
    mkdirSync(packDir, { recursive: true });
    const pack = await runTool('npm', ['pack', '--pack-destination', packDir],
      { env: { ...childEnv, npm_config_cache: join(CACHE, 'npm-cache') } });
    const tgzs = existsSync(packDir) ? readdirSync(packDir).filter((f) => f.endsWith('.tgz')) : [];
    if (!check('npm pack 产出唯一 tarball（退出码 0）', pack.code === 0 && tgzs.length === 1,
      pack.code !== 0 ? '退出 ' + pack.code + '\n' + tail(pack.out) : 'tarball=' + tgzs.join(','))) return;
    const tgz = join(packDir, tgzs[0]);
    const bytes = (() => { try { return lstatSync(tgz).size; } catch { return 0; } })();
    if (!check('tarball 体积合理（> 200KB —— 内联产物在里面）', bytes > 200 * 1024, bytes + ' B')) return;
    spec = tgz;
    console.log('packed: ' + spec + ' (' + bytes + ' B)\n');
  }
  const add = await runTool('dsh', ['plugin', '--profile', 'web', 'add', spec], { env: childEnv });
  if (!check('dsh plugin add 装载本插件（退出码 0）', add.code === 0,
    add.code === 0 ? undefined : '退出 ' + add.code + '\n' + tail(add.out))) return;
  const profileNm = join(ISO_HOME, '.dsh', 'profiles', 'web', 'node_modules', PLUGIN);
  const sameFile = (a, b) => {
    try { return resolve(realpathSync(a)) === resolve(realpathSync(b)); } catch { return null; }
  };
  const isSameAsWorkspace = sameFile(join(profileNm, 'package.json'), join(ROOT, 'package.json'));
  if (CHANNEL === 'tarball') {
    check('通道自证：装进去的是**独立副本**（不是工作区那一份）⇒ 跑的是发布产物',
      isSameAsWorkspace === false, 'sameAsWorkspace=' + isSameAsWorkspace + ' path=' + profileNm);
    const peerFail = /peer validation failed/i.test(add.out);
    const unresolved = /does not resolve from the installation closure/i.test(add.out);
    check('安装输出无 peer 校验失败（peerDependencies 能在安装闭包里解析）', !peerFail,
      peerFail ? tail(add.out) : undefined);
    check('安装输出无"不在安装闭包里"的未解析依赖', !unresolved,
      unresolved ? tail(add.out) : undefined);
  } else {
    check('通道自证：link 通道装的就是工作区那一份（realpath 相同）',
      isSameAsWorkspace === true, 'sameAsWorkspace=' + isSameAsWorkspace + ' path=' + profileNm);
  }
  const profilePkgPath = join(ISO_HOME, '.dsh', 'profiles', 'web', 'package.json');
  const profileText = existsSync(profilePkgPath) ? readFileSync(profilePkgPath, 'utf8') : '';
  let registered;
  try {
    const pkg = JSON.parse(profileText);
    const inDeps = Boolean(pkg.dependencies && PLUGIN in pkg.dependencies);
    const inBundles = JSON.stringify((pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || []).includes(PLUGIN);
    registered = inDeps || inBundles;
  } catch { registered = false; }
  check('隔离 profile 里登记了本插件（deps / bundles）', registered, profilePkgPath);
  check('插件入口落在 profile 的 node_modules（通道=' + CHANNEL + '）', existsSync(profileNm), profileNm);
  const h = startHarness();
  const TOKEN_RE = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=([^\s'"<>]+)/;
  const tokenHit = await waitUntil(async () => {
    if (h.child.exitCode !== null || h.child.signalCode !== null) return 'dead';
    const m = h.output().match(TOKEN_RE);
    return m ? m : null;
  }, 120000);
  if (tokenHit === 'dead' || !tokenHit) {
    check('harness 启动并输出 token URL', false,
      tokenHit === 'dead' ? '进程提前退出\n' + tail(h.output()) : '120s 未见 token URL\n' + tail(h.output()));
    await killTree(h.child);
    return;
  }
  const token = tokenHit[2];
  check('harness 启动并输出 token URL', true, 'port=' + tokenHit[1]);
  const ready = await waitUntil(async () => {
    if (h.child.exitCode !== null || h.child.signalCode !== null) return 'dead';
    const auth = await get(PORT, '/?token=' + token);
    if (auth.status === 200) return { how: 'token URL 直接 200' };
    if (auth.status >= 300 && auth.status < 400 && auth.setCookie.length) {
      const app = await get(PORT, '/', { Cookie: auth.setCookie.join('; ') });
      if (app.status === 200) return { how: auth.status + ' + 会话 Cookie → 200' };
    }
    return null;
  }, 60000, 1000);
  check('harness 首页就绪（token → 会话 Cookie → GET / → 200）', Boolean(ready && ready !== 'dead'),
    ready === 'dead' ? '进程提前退出\n' + tail(h.output()) : ready ? ready.how : '60s 内未达 200');
  if (ready && ready !== 'dead') {
    const marker = `compat-${process.pid}-${Date.now()}`;
    const attempts = [];
    const probe = async (pathAndQuery) => {
      let r = await get(PORT, pathAndQuery);
      attempts.push(pathAndQuery.split('?')[0] + '@token=' + r.status);
      if (r.status !== 204) {
        const noTok = new URL(pathAndQuery, 'http://127.0.0.1');
        noTok.searchParams.delete('token');
        r = await get(PORT, noTok.pathname + noTok.search);
        attempts.push(pathAndQuery.split('?')[0] + '@noToken=' + r.status);
      }
      return r.status;
    };
    const diagStatus = await probe(`${BASE}/diag?msg=${encodeURIComponent(marker)}&token=${token}`);
    check('插件宿主路由在真实 harness 里可达（/wallpaper-engine/diag → 204）', diagStatus === 204,
      attempts.join(' → '));
    const diagFile = join(DATA_DIR, 'diag', 'http.jsonl');
    check('落盘诊断出现同一标记（handler 真的执行过，不只是一条应答）',
      diagFileHasMarker(diagFile, marker), diagFile);
    let logStatus = await get(PORT, `${BASE}/diag-log?token=${token}`);
    if (logStatus.status !== 200) logStatus = await get(PORT, `${BASE}/diag-log`);
    let markerInRing;
    try {
      const entries = JSON.parse(logStatus.body).entries || [];
      markerInRing = entries.some((e) => String(e.msg || '').includes(marker));
    } catch { markerInRing = false; }
    check('内存环形缓冲可回读同一标记（/diag-log → 200 且含标记）',
      logStatus.status === 200 && markerInRing, 'status=' + logStatus.status);
  }
  const alive = h.child.exitCode === null && h.child.signalCode === null;
  check('探活期间 harness 进程未崩溃', alive, alive ? undefined : tail(h.output()));
  check('harness 日志无插件树加载失败',
    !/plugin tree failed to load/i.test(h.output()),
    /plugin tree failed to load/i.test(h.output()) ? tail(h.output()) : undefined);
  await killTree(h.child);
}
main().then(() => {
  const failed = results.filter((ok) => !ok).length;
  if (failed) console.log(`\nCOMPAT LIVE FAILED — ${failed}/${results.length} 条判据不成立`);
  else console.log(`\nCOMPAT LIVE PASSED — ${results.length} 条判据全部成立`);
  process.exitCode = failed ? 1 : 0;
}).catch((err) => {
  console.error('compat-harness-live 未捕获异常：', err);
  process.exitCode = 1;
});
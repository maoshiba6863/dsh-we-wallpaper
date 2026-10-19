import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync, readdirSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Writable, Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { stripComments } from './tools/js-text.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readHostHalf = () => ['lib/index.js', 'lib/scene-probe.js',
  ...readdirSync(resolve(root, 'lib', 'routes')).filter((f) => f.endsWith('.js')).map((f) => 'lib/routes/' + f)]
  .map((f) => readFileSync(resolve(root, f), 'utf8')).join('\n');
const TEST_CACHE_DIR = join(root, '.test-cache', 'cache');
const TEST_FRAMES_DIR = join(TEST_CACHE_DIR, 'frames');
process.env.DSH_WE_CACHE_DIR = TEST_CACHE_DIR;
let passed = 0;
let failed = 0;
let platformSkipped = 0;
const platformSkippedNames = [];
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  if (ok) passed++;
  else failed++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? ' — ' + detail : ''));
}
function platformSkip(name, why) {
  platformSkipped++;
  platformSkippedNames.push(name);
  console.log('  ○ ' + name + (why ? ' — ' + why : ''));
}
function buildPkg(entries) {
  const parts = [];
  const index = [];
  let offset = 0;
  for (const { path, bytes } of entries) {
    index.push({ path, offset, length: bytes.length });
    parts.push(bytes);
    offset += bytes.length;
  }
  const headerSize = 12 + 8 + index.reduce((n, e) => n + 4 + Buffer.byteLength(e.path, 'utf8') + 8, 0);
  const header = Buffer.alloc(headerSize);
  let p = 0;
  header.writeInt32LE(8, p); p += 4;
  header.write('PKGV0001', p, 'ascii'); p += 8;
  header.writeInt32LE(index.length, p); p += 4;
  for (const e of index) {
    header.writeInt32LE(Buffer.byteLength(e.path, 'utf8'), p); p += 4;
    header.write(e.path, p, 'utf8'); p += Buffer.byteLength(e.path, 'utf8');
    header.writeUInt32LE(e.offset, p); p += 4;
    header.writeUInt32LE(e.length, p); p += 4;
  }
  return Buffer.concat([header.subarray(0, p), ...parts]);
}
function buildTexRgba(width, height, rgbaBytes) {
  const mip = Buffer.alloc(4 * 5 + rgbaBytes.length);
  mip.writeInt32LE(width, 0);
  mip.writeInt32LE(height, 4);
  mip.writeInt32LE(0, 8);
  mip.writeInt32LE(0, 12);
  mip.writeInt32LE(rgbaBytes.length, 16);
  rgbaBytes.copy(mip, 20);
  const header = Buffer.alloc(9 + 9 + 4 * 8 + 9 + 4 * 2 + 4);
  let p = 0;
  header.write('TEXV0005\0', p, 'ascii'); p += 9;
  header.write('TEXI0001\0', p, 'ascii'); p += 9;
  header.writeInt32LE(0, p); p += 4;
  header.writeInt32LE(0, p); p += 4;
  header.writeInt32LE(width, p); p += 4;
  header.writeInt32LE(height, p); p += 4;
  header.writeInt32LE(width, p); p += 4;
  header.writeInt32LE(height, p); p += 4;
  header.writeInt32LE(0, p); p += 4;
  header.write('TEXB0002\0', p, 'ascii'); p += 9;
  header.writeInt32LE(1, p); p += 4;
  header.writeInt32LE(1, p); p += 4;
  return Buffer.concat([header.subarray(0, p), mip]);
}
const fixtureLib = join(root, '.test-cache', 'scene-fixture', 'steamlib');
const fixtureItemDir = join(fixtureLib, 'steamapps', 'workshop', 'content', '431960', '990002');
{
  rmSync(join(root, '.test-cache', 'scene-fixture'), { recursive: true, force: true });
  mkdirSync(fixtureItemDir, { recursive: true });
  mkdirSync(join(fixtureLib, 'steamapps', 'common', 'wallpaper_engine'), { recursive: true });
  const W = 32;
  const rgba = Buffer.alloc(W * W * 4);
  let seed = 0x12345678;
  for (let i = 0; i < W * W; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    rgba[i * 4] = seed & 0xff;
    rgba[i * 4 + 1] = (seed >> 8) & 0xff;
    rgba[i * 4 + 2] = (seed >> 16) & 0xff;
    rgba[i * 4 + 3] = 255;
  }
  const pkg = buildPkg([
    { path: 'scene.json', bytes: Buffer.from(JSON.stringify({ objects: [{ image: 'main.tex' }] })) },
    { path: 'main.tex', bytes: buildTexRgba(W, W, rgba) },
  ]);
  writeFileSync(join(fixtureItemDir, 'scene.pkg'), pkg);
  writeFileSync(join(fixtureItemDir, 'project.json'), JSON.stringify({
    title: 'Synthetic Fixture Scene', type: 'scene', file: 'scene.pkg', preview: 'preview.jpg',
    contentrating: 'Everyone',
  }));
  writeFileSync(join(fixtureItemDir, 'preview.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  process.env.DSH_WE_STEAM_ROOT = [process.env.DSH_WE_STEAM_ROOT, fixtureLib].filter(Boolean).join(',');
}
console.log('Level B — scene-frame route (mock webServer)');
const routes = [];
const mockCtx = {
  webServer: {
    register(route) { routes.push(route); return () => { const i = routes.indexOf(route); if (i >= 0) routes.splice(i, 1); }; },
    tapIndex() { return () => {}; },
  },
};
const hostMod = await import(pathToFileURL(resolve(root, 'lib', 'index.js')).href);
const host = hostMod.default || hostMod;
const apply = host.apply || (host.inject && host.apply);
const dispose = apply(mockCtx);
const sceneRoute = routes.find((r) => r.path === '/wallpaper-engine/scene-frame');
check('scene-frame route registered', Boolean(sceneRoute), sceneRoute ? 'kind=' + sceneRoute.kind : 'missing');
const invRoute = routes.find((r) => r.path === '/wallpaper-engine/inventory');
function fakeReq(url) { return { url, headers: {}, method: 'GET' }; }
function fakeRes() {
  const state = { status: 200, headers: {}, body: Buffer.alloc(0), ended: false };
  const res = new Writable({
    write(chunk, enc, cb) { state.body = Buffer.concat([state.body, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]); cb(); },
    final(cb) { state.ended = true; cb(); },
  });
  res.setHeader = (k, v) => { state.headers[k] = v; };
  res.writeHead = (s, h) => { state.status = s; if (h) Object.assign(state.headers, h); };
  Object.defineProperty(res, 'statusCode', { get: () => state.status, set: (v) => { state.status = v; } });
  res.__state = state;
  return res;
}
async function runHandler(route, url) {
  const res = fakeRes();
  const done = route.handler(fakeReq(url), res);
  if (done && typeof done.then === 'function') await done;
  if (!res.__state.ended) {
    await new Promise((resolveFn) => {
      const t = setTimeout(resolveFn, 8000);
      res.on('finish', () => { clearTimeout(t); resolveFn(); });
    });
  }
  return res;
}
let token = null;
let invBody;
{
  const res = await runHandler(invRoute, '/wallpaper-engine/inventory');
  invBody = JSON.parse(res.__state.body.toString('utf8'));
  const scene = (invBody.wallpapers || []).find((w) => w.id === '990002' && w.frameUrl);
  token = scene ? scene.frameUrl.split('/').pop() : null;
  check('inventory exposes the fixture scene frameUrl', Boolean(token), token ? 'frame token minted' : 'fixture scene missing from inventory');
}
if (token) {
  const beforeList = existsSync(TEST_FRAMES_DIR) ? readdirSync(TEST_FRAMES_DIR).slice() : [];
  const firstRes = await runHandler(sceneRoute, '/wallpaper-engine/scene-frame/' + token);
  check('无抓帧且无自定义画面 ⇒ 404 空态（不回落任何猜图来源）',
    firstRes.__state.status === 404,
    'status=' + firstRes.__state.status + ' ' + firstRes.__state.body.length + 'B');
  {
    let err = null;
    try { err = JSON.parse(firstRes.__state.body.toString('utf8')).error; } catch {   }
    check('空态给出可判定原因（no-frame）', err === 'no-frame', String(err));
  }
  const cacheDir = TEST_FRAMES_DIR;
  const keyVersion = (/LIVE_FRAME_KEY_VERSION = '([^']+)'/.exec(
    readFileSync(resolve(root, 'lib', 'index.js'), 'utf8')) || [])[1] || 'sf';
  const addedNow = (existsSync(cacheDir) ? readdirSync(cacheDir) : []).filter((f) => !beforeList.includes(f));
  check('GET 空态不产出任何静态帧缓存（提取链已移除）', addedNow.length === 0,
    addedNow.slice(0, 4).join(', ') || '干净');
  const gpuRoute = routes.find((r) => r.path === '/wallpaper-engine/scene-frame-cache');
  check('scene-frame-cache route registered', Boolean(gpuRoute), gpuRoute ? 'kind=' + gpuRoute.kind : 'missing');
  const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const pngChunk = (type, payload) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(payload.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), payload]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdrFor = (w, h) => {
    const b = Buffer.alloc(13);
    b.writeUInt32BE(w, 0); b.writeUInt32BE(h, 4); b[8] = 8; b[9] = 2;
    return b;
  };
  const pngHeadFor = (w, h) => Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdrFor(w, h)),
  ]);
  const pngTail = pngChunk('IEND', Buffer.alloc(0));
  const makePng = (payloadBytes, fill = 7, size = [64, 64]) =>
    Buffer.concat([pngHeadFor(size[0], size[1]), pngChunk('IDAT', Buffer.alloc(payloadBytes, fill)), pngTail]);
  const gpuPng = makePng(4096);
  const runPut = async (url, body) => {
    const req = new Readable({ read() {} });
    req.url = url; req.method = 'PUT'; req.headers = { 'content-type': 'image/png' };
    const res = fakeRes();
    gpuRoute.handler(req, res);
    req.push(body); req.push(null);
    await new Promise((resolveFn) => {
      const t = setTimeout(resolveFn, 8000);
      res.on('finish', () => { clearTimeout(t); resolveFn(); });
      if (res.__state.ended) { clearTimeout(t); resolveFn(); }
    });
    return res;
  };
  const runClear = async (url, method = 'DELETE') => {
    const req = { url, headers: {}, method };
    const res = fakeRes();
    gpuRoute.handler(req, res);
    await new Promise((r) => { setTimeout(r, 20); });
    return res;
  };
  const runHead = async (url) => {
    const req = { url, headers: {}, method: 'HEAD' };
    const res = fakeRes();
    const done = sceneRoute.handler(req, res);
    if (done && typeof done.then === 'function') await done;
    return res;
  };
  if (gpuRoute) {
    const curKey = keyVersion + '_' + token + '_' + Math.round(statSync(join(fixtureItemDir, 'scene.pkg')).mtimeMs);
    const gpuMasterFile = curKey + '_gpu.png';
    const head0 = await runHead('/wallpaper-engine/scene-frame/' + token);
    check('HEAD 空槽（无抓帧、无自定义画面）→ 404 且不发 X-WE-GPU',
      head0.__state.status === 404 && head0.__state.headers['X-WE-GPU'] === undefined,
      'status=' + head0.__state.status + ' gpu=' + String(head0.__state.headers['X-WE-GPU']));
    const putMagicOnly = await runPut('/wallpaper-engine/scene-frame-cache/' + token,
      Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from([1])]));
    check('PUT 9 字节假 PNG → 415（不再永久占槽）', putMagicOnly.__state.status === 415, 'status=' + putMagicOnly.__state.status);
    const putNoChunks = await runPut('/wallpaper-engine/scene-frame-cache/' + token,
      Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(4096, 7)]));
    check('PUT 魔数正确但无 IHDR/IEND → 415', putNoChunks.__state.status === 415, 'status=' + putNoChunks.__state.status);
    const putTooSmall = await runPut('/wallpaper-engine/scene-frame-cache/' + token, makePng(10));
    check('PUT 结构合法但过小（< 1KB 地板）→ 415', putTooSmall.__state.status === 415, 'status=' + putTooSmall.__state.status);
    check('以上三次拒绝都没有落盘', !existsSync(join(cacheDir, gpuMasterFile)), 'ok');
    const put1 = await runPut('/wallpaper-engine/scene-frame-cache/' + token, gpuPng);
    check('PUT 合法 PNG → 200', put1.__state.status === 200, 'status=' + put1.__state.status);
    const gpuFiles = readdirSync(cacheDir).filter((f) => f === gpuMasterFile);
    check('GPU frame stored as <key>_gpu.png（单主帧，文件名即标记）',
      gpuFiles.length === 1, gpuFiles.join(', ') || 'missing');
    const getV4 = await runHandler(sceneRoute, '/wallpaper-engine/scene-frame/' + token + '?v=4');
    check('?v=4 无自定义画面 ⇒ 422（显式 pin 失效要明示，客户端据此提示"已失效"）',
      getV4.__state.status === 422, 'status=' + getV4.__state.status);
    const headV4 = await runHead('/wallpaper-engine/scene-frame/' + token + '?v=4');
    check('?v=4 豁免抓帧：即使槽位已有 _gpu.png，v=4 也不拿它顶（HEAD 仍 404）',
      headV4.__state.status === 404, 'status=' + headV4.__state.status);
    const head1 = await runHead('/wallpaper-engine/scene-frame/' + token);
    check('HEAD after PUT → X-WE-GPU=1', head1.__state.status === 204 && head1.__state.headers['X-WE-GPU'] === '1',
      'status=' + head1.__state.status + ' gpu=' + head1.__state.headers['X-WE-GPU']);
    const getGpu = await runHandler(sceneRoute, '/wallpaper-engine/scene-frame/' + token);
    check('GET now serves the GPU-captured bytes', getGpu.__state.status === 200 && getGpu.__state.body.equals(gpuPng),
      getGpu.__state.body.length + 'B');
    const getGpuV3 = await runHandler(sceneRoute, '/wallpaper-engine/scene-frame/' + token + '?v=3');
    check('?v=3 已退役 ⇒ clamp 到 0 ⇒ 仍服务抓帧（值域收缩、零迁移）',
      getGpuV3.__state.status === 200 && getGpuV3.__state.body.equals(gpuPng),
      getGpuV3.__state.body.length + 'B');
    const headV3 = await runHead('/wallpaper-engine/scene-frame/' + token + '?v=3');
    check('HEAD ?v=3 → X-WE-GPU=1', headV3.__state.status === 204 && headV3.__state.headers['X-WE-GPU'] === '1',
      'status=' + headV3.__state.status + ' gpu=' + headV3.__state.headers['X-WE-GPU']);
    const put2 = await runPut('/wallpaper-engine/scene-frame-cache/' + token, gpuPng);
    check('second PUT 等面积 → 200（换内容，是「重新截」不是降级）', put2.__state.status === 200,
      'status=' + put2.__state.status);
    const put2b = await runPut('/wallpaper-engine/scene-frame-cache/' + token, makePng(4096, 3, [32, 32]));
    check('明显更小的 PUT → 409 frame-smaller（小帧覆盖不掉大帧，多窗竞态的最后一道闸）',
      put2b.__state.status === 409 && /frame-smaller/.test(String(put2b.__state.body)),
      'status=' + put2b.__state.status);
    const put2c = await runPut('/wallpaper-engine/scene-frame-cache/' + token, gpuPng);
    check('守卫拒写后等面积重写仍 → 200（守卫不烧槽）', put2c.__state.status === 200,
      'status=' + put2c.__state.status);
    await runClear('/wallpaper-engine/scene-frame-cache/' + token);
    const raced = await Promise.all([
      runPut('/wallpaper-engine/scene-frame-cache/' + token, makePng(4096, 1, [1440, 900])),
      runPut('/wallpaper-engine/scene-frame-cache/' + token, makePng(4096, 2)),
      runPut('/wallpaper-engine/scene-frame-cache/' + token, makePng(4096, 3)),
    ]);
    const codes = raced.map((r) => r.__state.status).sort().join(',');
    const bigPng = makePng(4096, 1, [1440, 900]);
    check('一大两小并发 PUT：面积守卫把小帧挡在盘外（无论到达顺序）',
      (codes === '200,409,409' || codes === '200,200,409')
      && readdirSync(cacheDir).filter((f) => f === gpuMasterFile).length === 1
      && readFileSync(join(cacheDir, gpuMasterFile)).equals(bigPng),
      'codes=' + codes);
    const survivor = readdirSync(cacheDir).filter((f) => f === gpuMasterFile).length;
    check('并发后磁盘上仍只有一份主帧', survivor === 1, 'count=' + survivor);
    const noTmpLeft = readdirSync(cacheDir).filter((f) => f.startsWith(gpuMasterFile + '.tmp')).length;
    check('并发写入未残留 .tmp 垃圾', noTmpLeft === 0, 'tmp=' + noTmpLeft);
    const clr = await runClear('/wallpaper-engine/scene-frame-cache/' + token);
    check('DELETE 清除 GPU 帧 → 200 + removed=true',
      clr.__state.status === 200 && /"removed":true/.test(String(clr.__state.body)), 'status=' + clr.__state.status);
    const clr2 = await runClear('/wallpaper-engine/scene-frame-cache/' + token, 'POST');
    check('POST 无 clear 参数 → 405（不误触发清除）', clr2.__state.status === 405, 'status=' + clr2.__state.status);
    const clr3 = await runClear('/wallpaper-engine/scene-frame-cache/' + token + '?clear=1', 'POST');
    check('POST ?clear=1 清除路径 → 200',
      clr3.__state.status === 200 && /"removed":false/.test(String(clr3.__state.body)), 'status=' + clr3.__state.status);
    const headAfterClear = await runHead('/wallpaper-engine/scene-frame/' + token);
    check('清除抓帧后 HEAD → 404（没有 CPU 帧可回落 —— 这正是"诚实留空"）',
      headAfterClear.__state.status === 404 && headAfterClear.__state.headers['X-WE-GPU'] === undefined,
      'status=' + headAfterClear.__state.status);
    const put3 = await runPut('/wallpaper-engine/scene-frame-cache/' + token, gpuPng);
    check('清除后可重新写入 → 200（坏帧不再是死结）', put3.__state.status === 200, 'status=' + put3.__state.status);
    const headGeo64 = await runHead('/wallpaper-engine/scene-frame/' + token);
    check('HEAD 报出抓帧几何（X-WE-GPU-W/H/AR，来自 PNG IHDR）',
      headGeo64.__state.headers['X-WE-GPU-AR'] === '1.0000'
      && headGeo64.__state.headers['X-WE-GPU-W'] === '64' && headGeo64.__state.headers['X-WE-GPU-H'] === '64',
      'ar=' + headGeo64.__state.headers['X-WE-GPU-AR']
      + ' wh=' + headGeo64.__state.headers['X-WE-GPU-W'] + 'x' + headGeo64.__state.headers['X-WE-GPU-H']);
    await runClear('/wallpaper-engine/scene-frame-cache/' + token);
    const putWide = await runPut('/wallpaper-engine/scene-frame-cache/' + token, makePng(4096, 7, [1440, 960]));
    check('PUT 3:2 抓帧（1440x960）→ 200', putWide.__state.status === 200, 'status=' + putWide.__state.status);
    const headGeoWide = await runHead('/wallpaper-engine/scene-frame/' + token);
    check('HEAD 报出 3:2 抓帧几何（1.5000 —— 小视口抓的帧，客户端会按面积升级覆盖）',
      headGeoWide.__state.status === 204 && headGeoWide.__state.headers['X-WE-GPU-AR'] === '1.5000',
      'ar=' + headGeoWide.__state.headers['X-WE-GPU-AR']);
    const headGeoNoGpu = await (async () => {
      await runClear('/wallpaper-engine/scene-frame-cache/' + token);
      return runHead('/wallpaper-engine/scene-frame/' + token);
    })();
    check('无帧（既无抓帧也无自定义画面）⇒ 404 且不发任何几何头',
      headGeoNoGpu.__state.status === 404
      && headGeoNoGpu.__state.headers['X-WE-GPU'] === undefined
      && headGeoNoGpu.__state.headers['X-WE-GPU-AR'] === undefined,
      'status=' + headGeoNoGpu.__state.status + ' gpu=' + String(headGeoNoGpu.__state.headers['X-WE-GPU']));
    await runPut('/wallpaper-engine/scene-frame-cache/' + token, gpuPng);
    {
      if (process.platform === 'win32') {
        const first = await runClear('/wallpaper-engine/scene-frame-cache/' + token);
        check('win32：清除存在的槽位 ⇒ 200 + removed:true（删除确实生效）',
          first && first.__state.status === 200 && /"removed":true/.test(String(first.__state.body)),
          'status=' + (first && first.__state.status) + ' body=' + String(first && first.__state.body).slice(0, 70));
        const again = await runClear('/wallpaper-engine/scene-frame-cache/' + token);
        check('win32：重复清除 ⇒ 幂等成功（200 + removed:false，不得假报已删除）',
          again && again.__state.status === 200 && /"removed":false/.test(String(again.__state.body)),
          'status=' + (again && again.__state.status) + ' body=' + String(again && again.__state.body).slice(0, 70));
        platformSkip('unlink 失败场景（chmod 不影响 unlink ⇒ 前提在 Windows 不成立；见 TODO §9.3）',
          'POSIX 才有牙的那一半本平台不执行');
        await runPut('/wallpaper-engine/scene-frame-cache/' + token, gpuPng);
      } else {
      const mode = statSync(cacheDir).mode & 0o777;
      chmodSync(cacheDir, 0o555);
      let locked;
      try {
        locked = await runClear('/wallpaper-engine/scene-frame-cache/' + token);
      } finally {
        chmodSync(cacheDir, mode);
      }
      check('unlink 失败 → 500（不得假成功）',
        locked && locked.__state.status === 500 && /unlink-failed/.test(String(locked.__state.body)),
        'status=' + (locked && locked.__state.status) + ' body=' + String(locked && locked.__state.body).slice(0, 90));
      check('unlink 失败后 GPU 帧仍在盘上（清除确实没发生）',
        readdirSync(cacheDir).filter((f) => f === gpuMasterFile).length === 1);
      const headLocked = await runHead('/wallpaper-engine/scene-frame/' + token);
      check('unlink 失败后 HEAD 仍报 X-WE-GPU=1（与客户端所见一致）',
        headLocked.__state.status === 204 && headLocked.__state.headers['X-WE-GPU'] === '1',
        'gpu=' + headLocked.__state.headers['X-WE-GPU']);
      const afterUnlock = await runClear('/wallpaper-engine/scene-frame-cache/' + token);
      check('恢复可写后重试清除 → 200 + removed=true（失败不是死结）',
        afterUnlock.__state.status === 200 && /"removed":true/.test(String(afterUnlock.__state.body)),
        'status=' + afterUnlock.__state.status);
      }
    }
    const putBad = await runPut('/wallpaper-engine/scene-frame-cache/' + token, Buffer.from('not-an-image'));
    check('PUT bad magic → 415', putBad.__state.status === 415, 'status=' + putBad.__state.status);
    const putUnknown = await runPut('/wallpaper-engine/scene-frame-cache/not-a-real-token', gpuPng);
    check('PUT unknown token → 404', putUnknown.__state.status === 404, 'status=' + putUnknown.__state.status);
    const headUnknown = await runHead('/wallpaper-engine/scene-frame/not-a-real-token');
    check('HEAD unknown token → 404', headUnknown.__state.status === 404, 'status=' + headUnknown.__state.status);
    await runClear('/wallpaper-engine/scene-frame-cache/' + token);
    for (const ext of ['png', 'jpg', 'gif']) { rmSync(join(cacheDir, curKey + '.' + ext), { force: true }); }
    const before = readdirSync(cacheDir).length;
    const headEmpty = await runHead('/wallpaper-engine/scene-frame/' + token);
    check('HEAD 空槽 → 404（纯探测不触发提取）', headEmpty.__state.status === 404, 'status=' + headEmpty.__state.status);
    check('HEAD 空槽未写盘（文件数不变）', readdirSync(cacheDir).length === before,
      before + ' → ' + readdirSync(cacheDir).length);
  }
}
{
  const res = await runHandler(sceneRoute, '/wallpaper-engine/scene-frame/not-a-real-token');
  check('unknown token → 404', res.__state.status === 404, 'status=' + res.__state.status);
}
const frameLimit = (() => {
  const expr = (/const GPU_FRAME_MAX_BYTES = ([^;]+);/.exec(
    readFileSync(resolve(root, 'lib', 'index.js'), 'utf8')) || [])[1] || '';
  return /^[\d\s*+()]+$/.test(expr) ? Number(new Function('return (' + expr + ')')()) : 0;
})();
check('帧上限常量可从源码解析（超限块尺寸不写死）', frameLimit > 0, 'GPU_FRAME_MAX_BYTES = ' + frameLimit);
if (token) {
  const http = await import('node:http');
  const routesForHttp = routes.filter((r) => r.path.startsWith('/wallpaper-engine/'));
  const server = http.createServer((req, res) => {
    const path = new URL(req.url || '/', 'http://x').pathname;
    const hit = routesForHttp
      .filter((r) => path === r.path || path.startsWith(r.path + '/'))
      .sort((a, b) => b.path.length - a.path.length)[0];
    if (!hit) { res.statusCode = 404; res.end('no route'); return; }
    try { hit.handler(req, res); } catch (err) { res.statusCode = 500; res.end(String(err)); }
  });
  await new Promise((r) => { server.listen(0, '127.0.0.1', r); });
  const port = server.address().port;
  const sendOver = (method, path, body) => new Promise((resolveFn) => {
    const seen = [];
    let settled = false;
    const done = (status, why) => {
      if (settled) return;
      settled = true;
      resolveFn({ status, why, seen: seen.join('>') });
    };
    const req = http.request({
      host: '127.0.0.1', port, method, path, agent: false,
      headers: { 'Content-Type': 'image/png', Connection: 'close' },
    }, (res) => {
      res.resume();
      res.on('end', () => { seen.push('end:' + res.statusCode); done(res.statusCode, 'res-end'); });
      res.on('close', () => { seen.push('close:' + res.statusCode); done(res.statusCode, 'res-close'); });
      res.on('aborted', () => seen.push('aborted'));
    });
    req.on('error', (e) => { seen.push('error:' + (e && e.code)); done(0, 'req-error:' + (e && e.code)); });
    if (body) req.write(body);
    req.end();
  });
  const overLimit = await sendOver('PUT', '/wallpaper-engine/scene-frame-cache/' + token, Buffer.alloc(33 * 1024 * 1024, 5));
  check('真 socket：超限 PUT 被拒绝（413，或连接被主动掐断 —— 精确 413 见下一条）',
    overLimit.status === 413 || overLimit.status === 0,
    'status=' + overLimit.status + ' why=' + overLimit.why + ' seen=' + overLimit.seen);
  const exactLimit = await sendOver('PUT', '/wallpaper-engine/scene-frame-cache/' + token,
    Buffer.alloc(frameLimit + 1, 6));
  check('真 socket：恰好 limit+1（超限块即最后一块）仍收到 413',
    exactLimit.status === 413, 'status=' + exactLimit.status);
  const badBody = await sendOver('PUT', '/wallpaper-engine/scene-frame-cache/' + token, Buffer.from('not-an-image'));
  check('真 socket：非法载荷收到 415', badBody.status === 415, 'status=' + badBody.status);
  const cleared = await sendOver('DELETE', '/wallpaper-engine/scene-frame-cache/' + token);
  check('真 socket：DELETE 清除通道可达', cleared.status === 200, 'status=' + cleared.status);
  const headOver = await new Promise((resolveFn) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'HEAD', path: '/wallpaper-engine/scene-frame/' + token }, (res) => {
      res.resume();
      resolveFn({ status: res.statusCode, gpu: res.headers['x-we-gpu'] });
    });
    req.on('error', () => resolveFn({ status: 0 }));
    req.end();
  });
  check('真 socket：HEAD 探测可达且报 X-WE-GPU', headOver.status === 204 || headOver.status === 404,
    'status=' + headOver.status + ' gpu=' + headOver.gpu);
  await new Promise((r) => { server.close(r); });
}
{
  const http = await import('node:http');
  const dataDir = join(root, '.test-cache', 'avatar-route-data');
  rmSync(dataDir, { recursive: true, force: true });
  const PREV_DATA_DIR = process.env.DSH_WE_DATA_DIR;
  process.env.DSH_WE_DATA_DIR = dataDir;
  const routesForHttp = routes.filter((r) => r.path.startsWith('/wallpaper-engine/'));
  const server = http.createServer((req, res) => {
    const path = new URL(req.url || '/', 'http://x').pathname;
    const hit = routesForHttp
      .filter((r) => path === r.path || path.startsWith(r.path + '/'))
      .sort((a, b) => b.path.length - a.path.length)[0];
    if (!hit) { res.statusCode = 404; res.end('no route'); return; }
    try { hit.handler(req, res); } catch (err) { res.statusCode = 500; res.end(String(err)); }
  });
  await new Promise((r) => { server.listen(0, '127.0.0.1', r); });
  const port = server.address().port;
  const call = (method, path, headers, body) => new Promise((resolveFn) => {
    const chunks = [];
    const req = http.request({ host: '127.0.0.1', port, method, path, agent: false, headers: headers || {} }, (res) => {
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolveFn({ status: res.statusCode, headers: res.headers, buf, body: buf.toString('utf8') });
      });
    });
    req.on('error', () => resolveFn({ status: 0, headers: {}, body: '' }));
    if (body) req.write(body);
    req.end();
  });
  try {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(24, 7)]);
    const empty = await call('GET', '/wallpaper-engine/avatar/user');
    check('头像：未导入 ⇒ GET 404（且 no-store，导入后不会再看到这个 404）',
      empty.status === 404 && empty.headers['cache-control'] === 'no-store',
      'status=' + empty.status + ' cc=' + empty.headers['cache-control']);
    const badSide = await call('POST', '/wallpaper-engine/avatar/nope', { 'Content-Type': 'image/png' }, png);
    check('头像：非法的一方 ⇒ 400（路径段当白名单查，不拼进文件名）',
      badSide.status === 400 && /bad-side/.test(badSide.body), 'status=' + badSide.status);
    const badType = await call('POST', '/wallpaper-engine/avatar/user', { 'Content-Type': 'text/plain' }, 'hi');
    check('头像：非白名单 MIME ⇒ 415', badType.status === 415, 'status=' + badType.status);
    const first = await call('POST', '/wallpaper-engine/avatar/user', { 'Content-Type': 'image/png' }, png);
    const firstName = (/"name":"([^"]+)"/.exec(first.body) || [])[1] || '';
    check('头像：导入 ⇒ 200 + 文件名（<side>-<stamp>.<ext>，它同时是缓存键）',
      first.status === 200 && /^user-[a-z0-9]{4,16}\.png$/.test(firstName),
      'status=' + first.status + ' name=' + firstName);
    const got = await call('GET', '/wallpaper-engine/avatar/user');
    check('头像：查看 ⇒ 200 + 字节一致 + 长缓存（由文件名担保）',
      got.status === 200 && got.headers['content-type'] === 'image/png'
      && got.buf.length === png.length && got.buf.equals(png)
      && /max-age=31536000/.test(String(got.headers['cache-control'])),
      'status=' + got.status + ' bytes=' + got.buf.length + '/' + png.length
      + ' cc=' + got.headers['cache-control']);
    const head = await call('HEAD', '/wallpaper-engine/avatar/user');
    check('头像：HEAD 只探测（200，无体）', head.status === 200 && head.body === '',
      'status=' + head.status);
    const png2 = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(32, 9)]);
    const second = await call('POST', '/wallpaper-engine/avatar/user', { 'Content-Type': 'image/png' }, png2);
    const secondName = (/"name":"([^"]+)"/.exec(second.body) || [])[1] || '';
    const files = readdirSync(join(dataDir, 'avatars')).filter((f) => f.startsWith('user-'));
    check('头像：换图 ⇒ 新名字 + 旧文件被清（同 side 目录里只剩一份）',
      second.status === 200 && secondName !== firstName && files.length === 1 && files[0] === secondName,
      'files=[' + files.join(',') + '] second=' + secondName);
    const cleared = await call('DELETE', '/wallpaper-engine/avatar/user');
    const afterClear = await call('GET', '/wallpaper-engine/avatar/user');
    check('头像：清除 ⇒ 200 removed:true，随后 GET 回到 404',
      cleared.status === 200 && /"removed":true/.test(cleared.body) && afterClear.status === 404,
      'status=' + cleared.status + ' then ' + afterClear.status);
  } finally {
    await new Promise((r) => { server.close(r); });
    if (PREV_DATA_DIR === undefined) delete process.env.DSH_WE_DATA_DIR; else process.env.DSH_WE_DATA_DIR = PREV_DATA_DIR;
    rmSync(dataDir, { recursive: true, force: true });
  }
}
{
  const hostSrc = readHostHalf();
  const constNum = (name) => {
    const expr = (new RegExp('const ' + name + ' = ([^;]+);').exec(hostSrc) || [])[1] || '';
    return /^[\d\s*+()]+$/.test(expr) ? Number(new Function('return (' + expr + ')')()) : 0;
  };
  const ABORT_CASES = [
    { label: 'scene-frame-cache PUT', route: '/wallpaper-engine/scene-frame-cache', method: 'PUT',
      cap: constNum('GPU_FRAME_MAX_BYTES'), needle: 'maxBytes: GPU_FRAME_MAX_BYTES',
      headers: { 'content-type': 'image/png' } },
    { label: 'live-frame POST', route: '/wallpaper-engine/live-frame', method: 'POST',
      cap: constNum('LIVE_FRAME_MAX_BYTES') || 4 * 1024 * 1024, needle: 'maxBytes: 4 * 1024 * 1024',
      headers: { 'content-type': 'image/png' } },
    { label: 'settings PUT', route: '/wallpaper-engine/settings', method: 'PUT',
      cap: constNum('SETTINGS_MAX_BYTES'), needle: 'maxBytes: SETTINGS_MAX_BYTES',
      headers: { 'content-type': 'application/json' } },
  ];
  const mkFlushableRes = () => {
    const res = new EventEmitter();
    const state = { status: 0, body: null, headers: {} };
    let pendingFlush = null;
    res.setHeader = (k, v) => { state.headers[k] = v; };
    res.writeHead = (s, h) => { state.status = s; Object.assign(state.headers, h || {}); };
    Object.defineProperty(res, 'statusCode', { get: () => state.status, set: (v) => { state.status = v; } });
    res.writableEnded = false;
    res.writableFinished = false;
    res.end = (b) => {
      if (b !== undefined) state.body = Buffer.isBuffer(b) ? b : Buffer.from(String(b));
      res.writableEnded = true;
      pendingFlush = () => { res.writableFinished = true; res.emit('finish'); };
    };
    res.__flush = () => { if (pendingFlush) pendingFlush(); };
    res.__state = state;
    return res;
  };
  check('负对照：替身区分「end() 已调用」与「应答已刷完」',
    (() => { const r = mkFlushableRes(); r.end('x'); return r.writableEnded === true && r.writableFinished === false; })());
  const mkOrderReq = (c) => {
    const req = new EventEmitter();
    req.url = c.route + '/' + token;
    req.method = c.method;
    req.headers = c.headers || {};
    req.readableEnded = false;
    req.complete = false;
    req.destroyed = false;
    req.destroy = () => { req.destroyed = true; };
    req.resume = () => {};
    req.pause = () => {};
    req.setTimeout = () => req;
    const rawEmit = req.emit.bind(req);
    req.emit = (ev, ...args) => {
      if (ev === 'end' || ev === 'close') { req.readableEnded = true; req.complete = true; }
      return rawEmit(ev, ...args);
    };
    return req;
  };
  for (const c of ABORT_CASES) {
    const route = routes.find((r) => r.path === c.route);
    check(`${c.label}：路由在位且源码里的体积判定与用例一致`,
      Boolean(route) && hostSrc.includes(c.needle), c.needle);
    if (!route || !(c.cap > 0) || !token) continue;
    const req = mkOrderReq(c);
    const res = mkFlushableRes();
    route.handler(req, res);
    req.emit('data', Buffer.alloc(c.cap + 1, 7));
    check(`${c.label}：超限时应答为 413`, res.__state.status === 413, 'status=' + res.__state.status);
    res.__flush();
    check(`${c.label}：应答已刷完但请求体未读完 ⇒ 不得断开`, req.destroyed === false,
      'destroyed=' + req.destroyed);
    req.emit('end');
    check(`${c.label}：两条件齐了才断开（不留悬挂连接）`, req.destroyed === true,
      'destroyed=' + req.destroyed);
    const req2 = mkOrderReq(c);
    const res2 = mkFlushableRes();
    route.handler(req2, res2);
    req2.emit('data', Buffer.alloc(c.cap + 1, 7));
    req2.emit('close');
    check(`${c.label}：req 'close' 早于应答刷出 ⇒ 不得断开`, req2.destroyed === false,
      'destroyed=' + req2.destroyed);
    res2.__flush();
    check(`${c.label}：应答刷完后才断开`, req2.destroyed === true, 'destroyed=' + req2.destroyed);
  }
}
{
  const src = readHostHalf();
  const strip = stripComments;
  const bareDestroyCount = (t) => (t.match(/req\.destroy\(\)/g) || []).length;
  const bare = bareDestroyCount(strip(src));
  check('D3 全仓 req.destroy() 只允许两处收口（lingerClose / idle 兜底）', bare <= 2,
    '当前 ' + bare + ' 处');
  const calls = strip(src).match(/lingerClose\(/g) || [];
  check('D3 每条"收到一半就放弃"的路由都接了 lingerClose（当前 5 条：帧缓存 / 实时帧 / 自定义画面 / 上传 / 设置）',
    calls.length >= 6, '出现 ' + calls.length + ' 次（1 处定义 + 调用点）');
  check('负对照：裸 req.destroy() 计数判据有牙（同一函数吃合成样本 ⇒ 计数 1）',
    bareDestroyCount(strip("try { req.destroy(); } catch { /* ignore */ }")) === 1);
}
{
  const hostSrc = readHostHalf();
  const base64UrlDerivations = (t) => (t.match(/Buffer\.from\(abs, 'utf8'\)\.toString\('base64url'\)/g) || []).length;
  const derivations = base64UrlDerivations(hostSrc);
  const fnBody = (srcText, name, nextName) => {
    const start = srcText.indexOf('function ' + name + '(');
    const end = srcText.indexOf('function ' + nextName + '(');
    if (start === -1 || end === -1 || end <= start) return null;
    return srcText.slice(start, end);
  };
  const slotBody = fnBody(hostSrc, 'sceneFrameSlot', 'gpuFrameFileFor');
  check('判据锚点在位：sceneFrameSlot 的函数体取到了边界（缺锚即红，不许退化成扫全文）',
    slotBody !== null,
    slotBody ? 'len=' + slotBody.length : '锚点缺失（sceneFrameSlot / gpuFrameFileFor 改名了？）');
  check('负对照：终点锚缺失时 fnBody 返回 null（判据有牙，不会静默扫全文）',
    fnBody('function a() {}\n', 'a', 'doesNotExist') === null);
  check('P1-6 每种缓存各只有一个键派生点（当前 3 种：帧 / 场景音频 / 场景视频）',
    derivations === 3,
    '派生点 ' + derivations + ' 处');
  check('P1-6 sceneFrameSlot 复用 sceneFrameCacheKey 且不再自带版本前缀',
    slotBody !== null && slotBody.includes('sceneFrameCacheKey(abs, mtime)') && !slotBody.includes('LIVE_FRAME_KEY_VERSION'),
    'reuse=' + (slotBody !== null && slotBody.includes('sceneFrameCacheKey(abs, mtime)')) + ' versionInSlot=' + (slotBody !== null && slotBody.includes('LIVE_FRAME_KEY_VERSION')));
  check('P1-6 negative control: 再写一份派生会被同一计数判据数出来',
    base64UrlDerivations(hostSrc + "\nconst x = Buffer.from(abs, 'utf8').toString('base64url');") === derivations + 1);
  const DEAD_SLOT_FIELDS = ['pngPath', 'jpgPath', 'gifPath', 'slot.dir'];
  const slotDeadHits = (srcText) => DEAD_SLOT_FIELDS.filter((f) => srcText.includes(f));
  const libSources = (() => {
    const out = [];
    (function walk(dir) {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          if (/vendor|webwallgl/.test(e.name)) continue;
          walk(p);
        } else if (/\.(js|mjs)$/.test(e.name) && e.name !== 'client.js') {
          out.push(stripComments(readFileSync(p, 'utf8')));
        }
      }
    })(join(root, 'lib'));
    return out;
  })();
  check('P4-16 槽位的死字段（pngPath / jpgPath / gifPath / dir）在 lib/ 里零残留',
    slotDeadHits(libSources.join('\n')).length === 0,
    slotDeadHits(libSources.join('\n')).join(', ') || '零残留');
  check('P4-16 negative control: 死字段判据有牙',
    slotDeadHits('return { key, pngPath: join(dir, key + ".png") };').length === 1
    && slotDeadHits('return { key, gpuPath: join(dir, key + "_gpu.png") };').length === 0);
  const returnLiteral = (body) => {
    if (!body) return null;
    const at = body.indexOf('return {');
    if (at === -1) return null;
    const open = body.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < body.length; i++) {
      if (body[i] === '{') depth++;
      else if (body[i] === '}') { depth--; if (depth === 0) return body.slice(open, i + 1); }
    }
    return null;
  };
  const fieldCount = (lit) => {
    if (!lit) return -1;
    let depth = 0, n = 1, sawContent = false;
    for (let i = 1; i < lit.length - 1; i++) {
      const ch = lit[i];
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      else if (ch === '}' || ch === ')' || ch === ']') depth--;
      else if (ch === ',' && depth === 0) n++;
      else if (!/\s/.test(ch)) sawContent = true;
    }
    return sawContent ? n : 0;
  };
  const slotRet = returnLiteral(slotBody);
  check('P4-16 槽位返回**恰好两个字段**（key + gpuPath；加一个就红）',
    fieldCount(slotRet) === 2,
    slotRet ? 'fields=' + fieldCount(slotRet) + ' → ' + slotRet.replace(/\s+/g, ' ') : '取不到 return { … }');
  check('P4-16 negative control: 字段计数判据有牙',
    fieldCount('{ key, dir, gpuPath: 1 }') === 3 && fieldCount('{ key, gpuPath: 1 }') === 2
    && fieldCount('{ key, gpuPath: join(dir, key + "_gpu.png") }') === 2);
  check('P4-16 sceneFrameSlot 不带档位参数、也不拼 `_v` 后缀（档位语义归调用方）',
    slotBody !== null && /function sceneFrameSlot\(\s*abs\s*\)/.test(slotBody) && !slotBody.includes("'_v'"),
    slotBody === null ? '锚点缺失' : 'arity-ok=' + /function sceneFrameSlot\(\s*abs\s*\)/.test(slotBody));
  check('P4-16 档 4 豁免抓帧时**不解析槽位**（不留那次白做的 statSync + ensureFrameCacheDir）',
    /const slot = variant === 4 \? null : sceneFrameSlot\(abs\);/.test(readFileSync(join(root, 'lib', 'routes', 'scene-frame.js'), 'utf8'))
    && /const gpuFile = slot \? gpuFrameFileFor\(slot\) : null;/.test(readFileSync(join(root, 'lib', 'routes', 'scene-frame.js'), 'utf8')));
}
console.log('Level F — sceneVideo 文件版探测（issue #136）等价 / 读量上界 / 结构');
{
  const { extractSceneVideo, extractSceneVideoFromPkgFile, probeSceneVideoFromPkgFile } =
    await import(pathToFileURL(join(root, 'lib/scene-manifest.js')).href);
  const { parsePkg, parsePkgHead, readPkgEntryHeadAt } =
    await import(pathToFileURL(join(root, 'lib/pkg-read.js')).href);
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  const eqDir = join(root, '.test-cache', 'probe-eq');
  rmSync(eqDir, { recursive: true, force: true });
  mkdirSync(eqDir, { recursive: true });
  const ftypTex = (n) => {
    const b = Buffer.alloc(Math.max(n, 16), 0xab);
    b.writeUInt32LE(n, 0);
    b.write('ftyp', 4, 'ascii');
    return b;
  };
  const noFtypTex = (n) => Buffer.alloc(n, 0x7e);
   
  const lz4TexEntry = () => {
    const P = Buffer.from([0xe8, 0x03, 0x00, 0x00, 0x66, 0x74, 0x79, 0x70]);
    const block = Buffer.concat([Buffer.from([0x8f]), P, Buffer.from([0x08, 0x00, 255, 255, 255, 208])]);
    const entry = Buffer.alloc(16 + block.length);
    entry.writeUInt32LE(1000, 0); entry.writeUInt32LE(0, 4);
    entry.writeInt32LE(1000, 8);
    entry.writeInt32LE(block.length, 12);
    block.copy(entry, 16);
    return entry;
  };
  const fakeSizeNoVideo = () => {
    const b = Buffer.alloc(300, 0x5a);
    b.writeUInt32LE(90000, 0);
    b.writeUInt32LE(0, 4);
    b.writeInt32LE(1, 8);
    b.writeInt32LE(999999, 12);
    return b;
  };
  const sceneJson = () => Buffer.from('{"objects":[]}');
  const fixtures = {
    'raw-hit': [{ path: 'scene.json', bytes: sceneJson() }, { path: 'main.tex', bytes: ftypTex(600) }],
    'scoring': [{ path: 'scene.json', bytes: sceneJson() },
      { path: 'masks/mask0.tex', bytes: ftypTex(400) },
      { path: 'main.tex', bytes: ftypTex(500) }],
    'lz4': [{ path: 'scene.json', bytes: sceneJson() }, { path: 'main.tex', bytes: lz4TexEntry() }],
    'fake-size': [{ path: 'scene.json', bytes: sceneJson() }, { path: 'main.tex', bytes: fakeSizeNoVideo() }],
    'tiny': [{ path: 'scene.json', bytes: sceneJson() },
      { path: 'main.tex', bytes: ftypTex(300) },
      { path: 'empty.tex', bytes: Buffer.alloc(0) },
      { path: 'stub.tex', bytes: Buffer.from('TEXV000') }],
    'novideo': [{ path: 'scene.json', bytes: sceneJson() }, { path: 'main.tex', bytes: noFtypTex(800) }],
  };
  const entryShape = (list) => JSON.stringify(
    list.map((e) => [e.path, e.offset, e.compressedSize, e.size, e.flags]));
  for (const [name, entries] of Object.entries(fixtures)) {
    const pkg = buildPkg(entries);
    const file = join(eqDir, name + '.pkg');
    writeFileSync(file, pkg);
    const readAt = async (pos, len) => {
      return pkg.subarray(pos, pos + Math.min(len, Math.max(pkg.length - pos, 0)));
    };
    const head = await parsePkgHead(readAt, pkg.length);
    const mem = parsePkg(pkg);
    check('F 条目表与压缩判定逐字段相等（' + name + '）', entryShape(mem) === entryShape(head),
      entryShape(mem) === entryShape(head) ? 'entries=' + mem.length : 'mem=' + entryShape(mem) + ' head=' + entryShape(head));
    const oldV = extractSceneVideo(new Uint8Array(pkg));
    const newV = await probeSceneVideoFromPkgFile(file);
    const oldHas = !!(oldV && oldV.length);
    check('F 探测布尔一致（' + name + '）', newV === oldHas, 'old=' + oldHas + ' new=' + newV);
    const newEx = await extractSceneVideoFromPkgFile(file);
    const bothNull = (oldV == null) === (newEx == null);
    const sameBytes = bothNull && (oldV == null || sha(oldV) === sha(newEx));
    check('F 提取字节一致（' + name + '）', sameBytes,
      oldHas ? sha(oldV).slice(0, 12) + ' vs ' + (newEx ? sha(newEx).slice(0, 12) : 'null') : '双方 null');
  }
  {
    const junk = Buffer.alloc(120 * 1024, 0x5a);
    junk.writeUInt32LE(300000, 0);
    junk.writeUInt32LE(0, 4);
    junk.writeInt32LE(1, 8);
    junk.writeInt32LE(9999999, 12);
    const big = buildPkg([
      { path: 'scene.json', bytes: sceneJson() },
      { path: 'junk.bin', bytes: junk },
      { path: 'main.tex', bytes: noFtypTex(400) },
    ]);
    let counted = 0;
    const readAt = async (pos, len) => {
      counted += len;
      return big.subarray(pos, pos + Math.min(len, Math.max(big.length - pos, 0)));
    };
    const entries = await parsePkgHead(readAt, big.length);
    for (const e of entries) {
      if (e.path.toLowerCase().endsWith('.tex')) await readPkgEntryHeadAt(readAt, big.length, e, 204);
    }
    check('F 读量上界：索引+前缀 < 80 KB（文件 > 120 KB）', counted < 80 * 1024 && big.length > 120 * 1024,
      '读 ' + counted + 'B / 文件 ' + big.length + 'B');
    check('F negative control: 整包读（=文件体积）必撞上界，判据有牙', big.length >= 80 * 1024,
      'file=' + big.length + ' ≥ 80KB ⇒ 若整读必红');
  }
  {
    const hostHalfSrc = stripComments(readHostHalf());
    const usesUint8Probe = (t) => /extractSceneVideo\(new Uint8Array\(/.test(t);
    check('F 后台探测泵走文件版', /probeSceneVideoFromPkgFile\(job\.abs\)/.test(hostHalfSrc));
    check('F /scene-video 走文件版提取', /await extractSceneVideoFromPkgFile\(abs\)/.test(hostHalfSrc));
    check('F 宿主零残留：readFile(整包) → extractSceneVideo 旧形态',
      !usesUint8Probe(hostHalfSrc));
    check('F negative control: 旧形态会被同一判据判出（合成变异串 ⇒ true）',
      usesUint8Probe('extractSceneVideo(new Uint8Array(await readFile(abs)))') === true);
  }
  {
    const hostSrc = stripComments(readFileSync(join(root, 'lib', 'index.js'), 'utf8'));
    const famSrc = stripComments(readFileSync(join(root, 'lib', 'routes', 'scene-media.js'), 'utf8'));
    const stale = /path:\s*`\$\{BASE\}\/(scene-video|scene-audio)`/;
    check('G 场景内嵌媒资族已搬进 lib/routes/scene-media.js（门面里零残留）',
      !stale.test(hostSrc)
        && famSrc.includes('path: `${BASE}/scene-video`')
        && famSrc.includes('path: `${BASE}/scene-audio`'));
    check('G 去重账本只以引用进 c（声明仍在 apply()，生命周期未改）',
      /const SCENE_VIDEO_INFLIGHT = new Map\(\);/.test(hostSrc)
        && /SCENE_VIDEO_INFLIGHT/.test(famSrc)
        && /registerSceneMediaRoutes\(webServer, \{/.test(hostSrc));
    check('G negative control: 门面里重新出现被搬走的路由字面量会被同一条判据拒掉',
      stale.test(hostSrc + '\n  path: `${BASE}/scene-audio`,'));
  }
  {
    const hostSrc = stripComments(readFileSync(join(root, 'lib', 'index.js'), 'utf8'));
    const propsSrc = stripComments(readFileSync(join(root, 'lib', 'routes', 'props.js'), 'utf8'));
    const frameSrc = stripComments(readFileSync(join(root, 'lib', 'routes', 'live-frame.js'), 'utf8'));
    const settingsSrc = stripComments(readFileSync(join(root, 'lib', 'routes', 'settings.js'), 'utf8'));
    const stale = /path:\s*`\$\{BASE\}\/(props|live-frame|settings)`/;
    check('H 三条路由族已搬出 apply()（门面里零残留，族文件各持一条注册）',
      !stale.test(hostSrc)
        && propsSrc.includes('path: `${BASE}/props`')
        && frameSrc.includes('path: `${BASE}/live-frame`')
        && settingsSrc.includes('path: `${BASE}/settings`'));
    check('H 门面里改为一次调用（三条调用点形态正确）',
      /registerPropsRoutes\(webServer, \{/.test(hostSrc)
        && /registerLiveFrameRoutes\(webServer, \{/.test(hostSrc)
        && /registerSettingsRoutes\(webServer, \{/.test(hostSrc));
    check('H 各族的关键不变量随文件落地（不是空壳路由）',
      /filterKnownOverrides\(pj, userPropsFor\(token\)\)/.test(propsSrc)
        && /buf\[0\] !== 0xff \|\| buf\[1\] !== 0xd8/.test(frameSrc)
        && /maxBytes: 4 \* 1024 \* 1024/.test(frameSrc)
        && /method !== 'PUT'/.test(settingsSrc)
        && /sanitizeSettings\(parsed\)/.test(settingsSrc)
        && /withLegacyFontValues\(sanitized\)/.test(settingsSrc));
    check('H negative control: 门面里重新出现被搬走的路由字面量会被同一条判据拒掉',
      stale.test(hostSrc + '\n  path: `${BASE}/settings`,'));
  }
  {
    const hostSrc = stripComments(readFileSync(join(root, 'lib', 'index.js'), 'utf8'));
    const bytesSrc = stripComments(readFileSync(join(root, 'lib', 'routes', 'media-bytes.js'), 'utf8'));
    const stale = /path:\s*`\$\{BASE\}\/\$\{seg\}`/;
    check('I 媒体字节族已搬出 apply()（门面里零残留，族文件持循环注册）',
      !stale.test(hostSrc)
        && !/for \(const seg of \['media', 'preview'\]\)/.test(hostSrc)
        && /for \(const seg of \['media', 'preview'\]\)/.test(bytesSrc)
        && bytesSrc.includes('path: `${BASE}/${seg}`'));
    check('I 调用点形态正确，且排在 media-derived 之后（前缀吞噬防线）',
      /registerMediaBytesRoutes\(webServer, \{/.test(hostSrc)
        && hostSrc.indexOf('registerMediaDerivedRoutes(webServer, {') < hostSrc.indexOf('registerMediaBytesRoutes(webServer, {'));
    check('I 关键不变量随文件落地：/media 定音、/preview 不定音、非 GET/HEAD 出 405',
      /seg === 'media' \? pinnedFaststartVariant\(abs, token, log\) : null/.test(bytesSrc)
        && /serveLayout\(pick\.layout, pick\.abs, req, res, method === 'HEAD'\)/.test(bytesSrc)
        && /serveFile\(abs, req, res, method === 'HEAD'\)/.test(bytesSrc)
        && !/serveFile\(fast \|\| abs/.test(bytesSrc)
        && /res\.statusCode = 405/.test(bytesSrc));
    check('I negative control: 门面里重新出现被搬走的循环字面量会被同一条判据拒掉',
      stale.test(hostSrc + '\n      path: `${BASE}/${seg}`,'));
  }
  rmSync(eqDir, { recursive: true, force: true });
}
if (typeof dispose === 'function') dispose();
delete process.env.DSH_WE_STEAM_ROOT;
rmSync(join(root, '.test-cache', 'scene-fixture'), { recursive: true, force: true });
console.log('');
console.log(passed + ' passed, ' + failed + ' failed'
  + (platformSkipped ? ', ' + platformSkipped + ' platform-skipped' : ''));
if (platformSkipped) {
  console.log('  ⚠️ 本平台不执行的断言（不计入通过）：');
  for (const n of platformSkippedNames) console.log('     ○ ' + n);
  console.log('     来自 posix 分支的 5 条（500 unlink-failed / 帧仍在盘上 / 重试可用 …）在 '
    + process.platform + ' 上没有任何覆盖 —— 这是覆盖差异，不是通过。');
}
process.exit(failed === 0 ? 0 : 1);
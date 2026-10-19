import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { Readable, Writable } from 'node:stream';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ISO = join(root, '.test-cache', 'scene-frame-master');
const DATA_DIR = join(ISO, 'data');
const TEST_FRAMES_DIR = join(ISO, 'data', 'cache', 'frames');
rmSync(ISO, { recursive: true, force: true });
mkdirSync(DATA_DIR, { recursive: true });
process.env.DSH_WE_DATA_DIR = DATA_DIR;
delete process.env.DSH_WE_CACHE_DIR;
delete process.env.DSH_WE_UPLOAD_DIR;
let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log('  ✓ ' + name + (detail ? ' — ' + detail : '')); }
  else { failed++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
};
function pngChunkCrc32(type, payload) {
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
  const len = Buffer.alloc(4); len.writeUInt32BE(payload.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), payload]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const pngHeadFor = (w, h) => {
  const b = Buffer.alloc(13);
  b.writeUInt32BE(w, 0); b.writeUInt32BE(h, 4); b[8] = 8; b[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunkCrc32('IHDR', b),
  ]);
};
const makePng = (w, h, fill = 7, payloadBytes = 4096) => Buffer.concat([
  pngHeadFor(w, h),
  pngChunkCrc32('IDAT', Buffer.alloc(payloadBytes, fill)),
  pngChunkCrc32('IEND', Buffer.alloc(0)),
]);
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
const fixtureLib = join(ISO, 'steamlib');
const fixtureItemDir = join(fixtureLib, 'steamapps', 'workshop', 'content', '431960', '990002');
{
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
    title: 'Master Frame Fixture Scene', type: 'scene', file: 'scene.pkg', preview: 'preview.jpg',
    contentrating: 'Everyone',
  }));
  writeFileSync(join(fixtureItemDir, 'preview.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  process.env.DSH_WE_STEAM_ROOT = [process.env.DSH_WE_STEAM_ROOT, fixtureLib].filter(Boolean).join(',');
}
const routes = [];
const mockCtx = {
  webServer: {
    register(route) { routes.push(route); return () => { const i = routes.indexOf(route); if (i >= 0) routes.splice(i, 1); }; },
    tapIndex() { return () => {}; },
  },
};
const hostMod = await import(pathToFileURL(join(root, 'lib', 'index.js')).href);
const host = hostMod.default || hostMod;
const apply = host.apply || (host.inject && host.apply);
apply(mockCtx);
const sceneRoute = routes.find((r) => r.path === '/wallpaper-engine/scene-frame');
const gpuRoute = routes.find((r) => r.path === '/wallpaper-engine/scene-frame-cache');
check('scene-frame / scene-frame-cache 路由已注册', Boolean(sceneRoute && gpuRoute));
{
  const routeSrc = readFileSync(join(root, 'lib', 'routes', 'scene-frame.js'), 'utf8');
  const indexSrc = readFileSync(join(root, 'lib', 'index.js'), 'utf8');
  check('路由源码带着面积守卫不变量（frame-smaller + 容差常量）',
    routeSrc.includes("'frame-smaller'") && routeSrc.includes('GPU_FRAME_AREA_TOL'));
  check('lib 不再携带分桶构造（bucketPath / gpuBucketListFor 已拆除）',
    !indexSrc.includes('bucketPath') && !indexSrc.includes('gpuBucketListFor'));
}
const fakeRes = () => {
  const state = { status: 200, headers: {}, body: Buffer.alloc(0), ended: false };
  const res = new Writable({
    write(chunk, enc, cb) { state.body = Buffer.concat([state.body, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]); cb(); },
    final(cb) { state.ended = true; cb(); },
  });
  res.setHeader = (k, v) => { state.headers[String(k).toLowerCase()] = String(v); };
  res.writeHead = (code, hdrs) => { state.status = code; if (hdrs) for (const [k, v] of Object.entries(hdrs)) state.headers[String(k).toLowerCase()] = String(v); };
  Object.defineProperty(res, 'statusCode', { get: () => state.status, set: (v) => { state.status = v; } });
  res.__state = state;
  return res;
};
const runHandler = async (route, url, method = 'GET', body = null, headers = {}) => {
  const res = fakeRes();
  if (body) {
    const req = new Readable({ read() {} });
    req.url = url; req.method = method;
    req.headers = { 'content-type': 'image/png', ...(headers || {}) };
    route.handler(req, res);
    req.push(Buffer.isBuffer(body) ? body : Buffer.from(body));
    req.push(null);
  } else {
    route.handler({ url, headers: headers || {}, method, on() {}, once() {}, resume() {} }, res);
  }
  await new Promise((resolveFn) => {
    const t = setTimeout(resolveFn, 8000);
    res.on('finish', () => { clearTimeout(t); resolveFn(); });
    if (res.__state.ended) { clearTimeout(t); resolveFn(); }
  });
  return res;
};
const runPut = (url, png) => runHandler(gpuRoute, url, 'PUT', png, { 'content-type': 'image/png' });
const runHead = (url) => runHandler(sceneRoute, url, 'HEAD');
const runGet = (url) => runHandler(sceneRoute, url, 'GET');
const runClear = (url, method = 'DELETE') => runHandler(gpuRoute, url, method);
const invRoute = routes.find((r) => r.path === '/wallpaper-engine/inventory');
const inv = await runHandler(invRoute, '/wallpaper-engine/inventory');
const invJson = JSON.parse(String(inv.__state.body));
const wp = (invJson.wallpapers || []).find((w) => w.type === 'scene' && w.frameUrl);
let token = '';
if (wp) token = wp.frameUrl.split('/').pop();
if (token) {
  const { readdirSync } = await import('node:fs');
  const gpuPathOf = () => {
    const files = readdirSync(TEST_FRAMES_DIR).filter((f) => f.endsWith('_gpu.png'));
    return files.length === 1 ? join(TEST_FRAMES_DIR, files[0]) : null;
  };
  const pngA = makePng(800, 600, 1);
  const put1 = await runPut('/wallpaper-engine/scene-frame-cache/' + token, pngA);
  check('1. 空槽 PUT 800×600 → 200 落盘（单槽文件名 <key>_gpu.png）',
    put1.__state.status === 200 && Boolean(gpuPathOf())
    && readFileSync(gpuPathOf()).equals(pngA),
    'status=' + put1.__state.status);
  const body1 = JSON.parse(String(put1.__state.body));
  check('1b. 响应带 ar（几何自 PNG 推导）', body1 && body1.ar === 1.3333,
    'ar=' + (body1 && body1.ar));
  const head2 = await runHead('/wallpaper-engine/scene-frame/' + token);
  check('2. HEAD → 204 + X-WE-GPU:1 + W/H/AR 几何头',
    head2.__state.status === 204
    && head2.__state.headers['x-we-gpu'] === '1'
    && head2.__state.headers['x-we-gpu-w'] === '800'
    && head2.__state.headers['x-we-gpu-h'] === '600'
    && head2.__state.headers['x-we-gpu-ar'] === '1.3333',
    JSON.stringify(head2.__state.headers));
  const get2 = await runGet('/wallpaper-engine/scene-frame/' + token);
  check('2b. GET → 原字节回放', get2.__state.status === 200 && get2.__state.body.equals(pngA),
    get2.__state.body.length + 'B');
  const pngA2 = makePng(800, 600, 2);
  const put3 = await runPut('/wallpaper-engine/scene-frame-cache/' + token, pngA2);
  check('3. 等面积 PUT → 200 覆盖（换内容，非降级）',
    put3.__state.status === 200 && readFileSync(gpuPathOf()).equals(pngA2),
    'status=' + put3.__state.status);
  const pngSmall = makePng(640, 480, 3);
  const put4 = await runPut('/wallpaper-engine/scene-frame-cache/' + token, pngSmall);
  const body4 = JSON.parse(String(put4.__state.body));
  check('4. 小帧 PUT → 409 frame-smaller（主帧毫发无损）',
    put4.__state.status === 409 && body4.error === 'frame-smaller'
    && body4.have && body4.have.w === 800 && body4.have.h === 600
    && body4.got && body4.got.w === 640
    && readFileSync(gpuPathOf()).equals(pngA2),
    'status=' + put4.__state.status + ' body=' + String(put4.__state.body).slice(0, 80));
  const pngNear = makePng(790, 592, 4);
  const put5 = await runPut('/wallpaper-engine/scene-frame-cache/' + token, pngNear);
  check('5. 容差内略小帧（98%）→ 200 放行',
    put5.__state.status === 200, 'status=' + put5.__state.status);
  const pngBig = makePng(1200, 900, 5);
  const put6 = await runPut('/wallpaper-engine/scene-frame-cache/' + token, pngBig);
  const body6 = JSON.parse(String(put6.__state.body));
  check('6. 大帧 PUT → 200 upgraded:true（单槽内升级覆盖）',
    put6.__state.status === 200 && body6.upgraded === true
    && readFileSync(gpuPathOf()).equals(pngBig),
    'status=' + put6.__state.status);
  const files7 = readdirSync(TEST_FRAMES_DIR).filter((f) => f.endsWith('.png'));
  check('7. 全流程只有一张主帧（无形状桶文件）',
    files7.length === 1 && files7[0].endsWith('_gpu.png'),
    files7.join(', '));
  const clr1 = await runClear('/wallpaper-engine/scene-frame-cache/' + token);
  check('8. DELETE → 200 removed:true，文件消失',
    clr1.__state.status === 200 && /"removed":true/.test(String(clr1.__state.body))
    && gpuPathOf() === null,
    'status=' + clr1.__state.status);
  const head8 = await runHead('/wallpaper-engine/scene-frame/' + token);
  check('8b. 删后 HEAD → 404（X-WE-GPU 无从谈起）', head8.__state.status === 404,
    'status=' + head8.__state.status);
  const clr2 = await runClear('/wallpaper-engine/scene-frame-cache/' + token);
  check('8c. 再删 → 幂等 200 removed:false',
    clr2.__state.status === 200 && /"removed":false/.test(String(clr2.__state.body)),
    'status=' + clr2.__state.status);
  const get9 = await runGet('/wallpaper-engine/scene-frame/' + token + '?v=4');
  check('9. v=4 空自定义画面 → 422（诚实的"pin 来源失效"）',
    get9.__state.status === 422, 'status=' + get9.__state.status);
  const put10a = await runPut('/wallpaper-engine/scene-frame-cache/' + token, Buffer.alloc(2048, 0x41));
  check('10a. 非 PNG 字节 → 415 unsupported-format', put10a.__state.status === 415,
    'status=' + put10a.__state.status);
  const truncatedPng = Buffer.concat([pngHeadFor(100, 100), pngChunkCrc32('IEND', Buffer.alloc(0))]);
  const put10b = await runPut('/wallpaper-engine/scene-frame-cache/' + token, truncatedPng);
  check('10b. 有签名无像素数据（<1KB/缺 IDAT）→ 415', put10b.__state.status === 415,
    'status=' + put10b.__state.status);
} else {
  failed++;
  console.log('  ✗ 无法取得 token，主帧行为断言全部未执行');
}
console.log(failed === 0 ? 'MASTER FRAME PASSED (' + passed + ' checks)' : failed + ' CHECK(S) FAILED');
process.exit(failed === 0 ? 0 : 1);
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { liveText } from './tools/src-scope.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`PASS | ${name}`);
  } catch (err) {
    console.error(`FAIL | ${name}: ${err && err.message}`);
    process.exitCode = 1;
  }
};
const checkAsync = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`PASS | ${name}`);
  } catch (err) {
    console.error(`FAIL | ${name}: ${err && err.message}`);
    process.exitCode = 1;
  }
};
const API_CLIENT_SRC = readFileSync(join(ROOT, 'src/api-client.js'), 'utf8');
const OCCLUSION_SRC = readFileSync(join(ROOT, 'src/occlusion.js'), 'utf8');
const LIVE_SRC = liveText();
const BUILT = readFileSync(join(ROOT, 'lib/client.js'), 'utf8');
function makeSandbox({ occlusionResponse, fetchFailures = 0, innerWidth = 1280, fetchOverride } = {}) {
  const intervals = [];
  const visListeners = [];
  let failuresLeft = fetchFailures;
  const fetchCalls = [];
  const defaultFetch = (url) => {
    fetchCalls.push(String(url));
    if (failuresLeft > 0) {
      failuresLeft--;
      return Promise.reject(new Error('boom'));
    }
    if (!occlusionResponse) return Promise.resolve({ ok: false, status: 500 });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(occlusionResponse) });
  };
  const fetchImpl = fetchOverride || defaultFetch;
  const document = {
    hidden: false,
    addEventListener: (type, fn) => { if (type === 'visibilitychange') visListeners.push(fn); },
    removeEventListener: (type, fn) => {
      const i = visListeners.indexOf(fn);
      if (i !== -1) visListeners.splice(i, 1);
    },
  };
  const sandbox = {
    document,
    fetch: fetchImpl,
    fetchCalls,
    URL,
    innerWidth,
    innerHeight: 800,
    setInterval: (fn, ms) => { const t = { fn, ms }; intervals.push(t); return t; },
    clearInterval: (t) => { const i = intervals.indexOf(t); if (i !== -1) intervals.splice(i, 1); },
    visListeners,
    intervals,
    window: {},
    location: { origin: 'http://localhost' },
  };
  const stripExport = (t) => t.replace(/^\s*export\s+/gm, '');
  vm.createContext(sandbox);
  new vm.Script(stripExport(API_CLIENT_SRC) + '\n' + stripExport(OCCLUSION_SRC),
    { filename: 'occlusion-under-test.js' }).runInContext(sandbox);
  return sandbox;
}
function fakeFrame(src) {
  const frame = {
    isConnected: true,
    src,
    contentWindow: {
      posted: [],
      postMessage(msg, origin) { this.posted.push([msg, origin]); },
    },
  };
  return frame;
}
const X11_SNAP = {
  ok: 1, backend: 'x11', epoch: 'x11::display=:1', gen: 7,
  own: { w: 800, h: 600 },
  rects: [[100, 50, 400, 300]],
  ts: Date.now(),
};
await checkAsync('B1 立即首拍：缩放 + postMessage 形状 + targetOrigin', async () => {
  const sb = makeSandbox({ occlusionResponse: X11_SNAP });
  const frame = fakeFrame('http://127.0.0.1:1234/wallpaper-engine/scene-live/index.html?type=scene');
  sb.startOcclusionPolling(frame);
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(sb.fetchCalls[0], '/wallpaper-engine/occlusion', '必须走 apiJson 统一前缀');
  assert.equal(frame.contentWindow.posted.length, 1);
  const [msg, origin] = frame.contentWindow.posted[0];
  assert.equal(msg.__weLive, 1);
  assert.equal(msg.op, 'setOcclusion');
  assert.equal(JSON.stringify(msg.payload.occluders), JSON.stringify([[160, 80, 640, 480]]));
  assert.equal(msg.payload.epoch, 'x11::display=:1');
  assert.equal(msg.payload.gen, 7);
  assert.equal(origin, 'http://127.0.0.1:1234');
  sb.stopOcclusionPolling();
});
await checkAsync('B2 每拍必投：同内容连发两拍不抑制（渲染器陈旧线契约）', async () => {
  const sb = makeSandbox({ occlusionResponse: X11_SNAP });
  const frame = fakeFrame('http://127.0.0.1:1234/x');
  sb.startOcclusionPolling(frame);
  await new Promise((r) => { setTimeout(r, 5); });
  const n1 = frame.contentWindow.posted.length;
  assert.equal(n1, 1);
  sb.intervals[0].fn();
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(frame.contentWindow.posted.length, 2, '同内容抑制会饿死渲染器 3s 新鲜度');
  sb.stopOcclusionPolling();
});
await checkAsync('B3 降级快照 ⇒ clearOcclusion（payload null）', async () => {
  const sb = makeSandbox({ occlusionResponse: { ok: 1, backend: 'none', epoch: '', gen: 9, own: null, rects: null, ts: Date.now() } });
  const frame = fakeFrame('http://127.0.0.1:1234/x');
  sb.startOcclusionPolling(frame);
  await new Promise((r) => { setTimeout(r, 5); });
  const [msg] = frame.contentWindow.posted[0];
  assert.equal(msg.op, 'clearOcclusion');
  assert.equal(msg.payload, null);
  sb.stopOcclusionPolling();
});
await checkAsync('B4 网络失败退避：3 败后换 5s 周期，成功复原 1s（负对照+复原）', async () => {
  const sb = makeSandbox({ occlusionResponse: X11_SNAP, fetchFailures: 3 });
  const frame = fakeFrame('http://127.0.0.1:1234/x');
  sb.startOcclusionPolling(frame);
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(sb.intervals[0].ms, 1000, '首败未到退避线，仍是 1s');
  sb.intervals[0].fn();
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(sb.intervals[0].ms, 1000, '两败仍未退避');
  sb.intervals[0].fn();
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(sb.intervals[0].ms, 5000, '三连败必须进入 5s 退避');
  sb.intervals[0].fn();
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(sb.intervals[0].ms, 1000, '成功必须复原 1s 常频');
  assert.equal(frame.contentWindow.posted.length, 1);
  sb.stopOcclusionPolling();
});
await checkAsync('B5 document.hidden ⇒ 整拍跳过（不 fetch 不投递）', async () => {
  const sb = makeSandbox({ occlusionResponse: X11_SNAP });
  sb.document.hidden = true;
  const frame = fakeFrame('http://127.0.0.1:1234/x');
  sb.startOcclusionPolling(frame);
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(sb.fetchCalls.length, 0);
  assert.equal(frame.contentWindow.posted.length, 0);
  sb.document.hidden = false;
  sb.visListeners[0]();
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(frame.contentWindow.posted.length, 1, '恢复可见必须补拍');
  sb.stopOcclusionPolling();
});
await checkAsync('B6 about:blank / 视口为 0 ⇒ 不投半成品（负对照×2）', async () => {
  const sb = makeSandbox({ occlusionResponse: X11_SNAP });
  const frame = fakeFrame('about:blank');
  sb.startOcclusionPolling(frame);
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(frame.contentWindow.posted.length, 0, '延迟加载期没有渲染页可投');
  sb.stopOcclusionPolling();
  const sb2 = makeSandbox({ occlusionResponse: X11_SNAP, innerWidth: 0 });
  const frame2 = fakeFrame('http://127.0.0.1:1/x');
  sb2.startOcclusionPolling(frame2);
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(frame2.contentWindow.posted.length, 0, 'innerWidth=0 时缩放无意义，跳过');
  sb2.stopOcclusionPolling();
});
await checkAsync('B7 stop 幂等 + 解绑监听 + 清定时器', async () => {
  const sb = makeSandbox({ occlusionResponse: X11_SNAP });
  const frame = fakeFrame('http://127.0.0.1:1234/x');
  sb.startOcclusionPolling(frame);
  assert.equal(sb.visListeners.length, 1);
  assert.equal(sb.intervals.length, 1);
  sb.stopOcclusionPolling();
  sb.stopOcclusionPolling();
  assert.equal(sb.intervals.length, 0, '定时器必须被清');
  assert.equal(sb.visListeners.length, 0, 'visibilitychange 必须解绑');
  sb.startOcclusionPolling(frame);
  await new Promise((r) => { setTimeout(r, 5); });
  const postedBefore = frame.contentWindow.posted.length;
  frame.isConnected = false;
  sb.intervals[0].fn();
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(frame.contentWindow.posted.length, postedBefore, '断连 iframe 不得投递');
  sb.stopOcclusionPolling();
});
await checkAsync('B7b stop→换帧后旧 tick 不得投递（评审 C4：帧身份校验）', async () => {
  const resolvers = [];
  const sb = makeSandbox({
    fetchOverride: () => new Promise((r) => { resolvers.push(r); }),
  });
  const frameA = fakeFrame('http://127.0.0.1:1234/x');
  const frameB = fakeFrame('http://127.0.0.1:1234/x');
  sb.startOcclusionPolling(frameA);
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(resolvers.length, 1);
  sb.stopOcclusionPolling();
  sb.startOcclusionPolling(frameB);
  assert.equal(resolvers.length, 2);
  resolvers[0]({ ok: true, status: 200, json: () => Promise.resolve(X11_SNAP) });
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(frameA.contentWindow.posted.length, 0, '旧快照不得投给旧帧');
  assert.equal(frameB.contentWindow.posted.length, 0, '也不是新帧的拍，不得错投');
  resolvers[1]({ ok: true, status: 200, json: () => Promise.resolve(X11_SNAP) });
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(frameB.contentWindow.posted.length, 1, '新帧自己的拍照常投递');
  sb.stopOcclusionPolling();
});
await checkAsync('B8 遮挡暂停镜像：全覆盖⇒true / 部分⇒false / clear⇒false（看护契约）', async () => {
  const fullSnap = { ok: 1, backend: 'x11', epoch: 'e', gen: 1, own: { w: 800, h: 600 },
    rects: [[0, 0, 800, 600]], ts: Date.now() };
  const sbFull = makeSandbox({ occlusionResponse: fullSnap });
  const f1 = fakeFrame('http://127.0.0.1:1234/x');
  sbFull.startOcclusionPolling(f1);
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(sbFull.occlusionRendererPaused(), true, '可见率 0（全覆盖）必须置 true');
  sbFull.stopOcclusionPolling();
  const sbPart = makeSandbox({ occlusionResponse: X11_SNAP });
  const f2 = fakeFrame('http://127.0.0.1:1234/x');
  sbPart.startOcclusionPolling(f2);
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(sbPart.occlusionRendererPaused(), false, '可见 75% 不是暂停档');
  const edgeIn = { ok: 1, backend: 'x11', epoch: 'e', gen: 2, own: { w: 800, h: 600 },
    rects: [[0, 0, 800, 576]], ts: Date.now() };
  const sbEdge = makeSandbox({ occlusionResponse: edgeIn });
  const f3 = fakeFrame('http://127.0.0.1:1234/x');
  sbEdge.startOcclusionPolling(f3);
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(sbEdge.occlusionRendererPaused(), true, '可见率 4% 属暂停档');
  sbEdge.stopOcclusionPolling();
  const edgeOut = { ok: 1, backend: 'x11', epoch: 'e', gen: 2, own: { w: 800, h: 600 },
    rects: [[0, 0, 800, 564]], ts: Date.now() };
  const sbOut = makeSandbox({ occlusionResponse: edgeOut });
  const f5 = fakeFrame('http://127.0.0.1:1234/x');
  sbOut.startOcclusionPolling(f5);
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(sbOut.occlusionRendererPaused(), false, '可见率 6% 不是暂停档');
  const noneSnap = { ok: 1, backend: 'none', epoch: '', gen: 3, own: null, rects: null, ts: Date.now() };
  const sbNone = makeSandbox({ occlusionResponse: noneSnap });
  const f4 = fakeFrame('http://127.0.0.1:1234/x');
  sbNone.startOcclusionPolling(f4);
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(sbNone.occlusionRendererPaused(), false, 'clear 必须复位 false');
  sbNone.stopOcclusionPolling();
});
check('S1 live-layer 钩子：scene-only 启动 + stopLiveWatch 必停', () => {
  assert.match(LIVE_SRC, /if \(selection\.type === "scene"\) startOcclusionPolling\(frame\);/);
  assert.match(LIVE_SRC, /stopOcclusionPolling\(\);/);
});
check('S2 build 内联：INLINE_MODULES 登记 + 产物含模块', () => {
  const build = readFileSync(join(ROOT, 'scripts/build-client.mjs'), 'utf8');
  assert.match(build, /file: 'src\/occlusion\.js'/);
  assert.ok(BUILT.includes('function startOcclusionPolling('), '产物必须含投递器');
  assert.ok(BUILT.includes('function stopOcclusionPolling('));
});
check('S3 零裸 fetch 棘轮（网络只走 apiJson）', () => {
  assert.doesNotMatch(OCCLUSION_SRC, /[^a-zA-Z.]fetch\(/);
});
check('S4 浏览器安全纪律：无 import/require/Node API', () => {
  assert.doesNotMatch(OCCLUSION_SRC, /(^|\n)\s*(import |require\(|process\.|Buffer\.)/);
});
check('F1 覆盖面地板：本文件至少 12 项判据', () => {
  assert.ok(passed >= 12, `实际 ${passed} 项`);
});
if (process.exitCode) {
  console.error(`${process.exitCode} OCCLUSION CLIENT CHECK(S) FAILED`);
} else {
  console.log(`ALL OCCLUSION CLIENT CHECKS PASSED (${passed})`);
}
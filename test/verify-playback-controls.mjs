import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}
function assert(cond, name, detail) {
  if (!cond) throw new Error('ASSERTION FAILED: ' + name + (detail ? ' — ' + detail : ''));
}
const React = {
  Fragment: 'Fragment',
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useRef: (v) => ({ current: v }),
  createElement: (type, props, ...children) =>
    typeof type === 'function' ? type(props || {}) : ({ type, props: props || null, children }),
};
const byId = {};
const timers = [];
function makeEl(tag) {
  const handlers = {};
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    dataset: {},
    attributes: {},
    style: { _props: {}, setProperty(k, v) { this._props[k] = v; }, removeProperty(k) { delete this._props[k]; } },
    className: "",
    _parent: null,
    appendChild(c) { c._parent = this; this.children.push(c); if (c.id) byId[c.id] = c; return c; },
    remove() {
      if (this._parent) {
        const i = this._parent.children.indexOf(this);
        if (i >= 0) this._parent.children.splice(i, 1);
      }
      if (this.id) delete byId[this.id];
    },
    setAttribute(k, v) { this.attributes[k] = v; },
    removeAttribute(k) { delete this.attributes[k]; },
    querySelector(sel) {
      if (sel === 'video') return this.children.find((c) => c.tagName === 'VIDEO') || null;
      if (String(sel).includes('canvas')) return null;
      return null;
    },
  };
  if (String(tag).toLowerCase() === 'video') {
    Object.assign(el, {
      isConnected: true,
      src: '',
      currentTime: 0,
      duration: 60,
      playbackRate: 1,
      paused: true,
      ended: false,
      error: null,
      _playCalls: 0,
      _pauseCalls: 0,
      _playRejects: false,
      load() { el._loadCount = (el._loadCount || 0) + 1; },
      play() {
        el._playCalls += 1;
        if (el._playRejects) {
          const name = typeof el._playRejects === 'string' ? el._playRejects : 'NotSupportedError';
          return Promise.reject(Object.assign(new Error('refused'), { name }));
        }
        el.paused = false;
        return Promise.resolve();
      },
      pause() { el._pauseCalls += 1; el.paused = true; },
      addEventListener(type, fn) {
        (handlers[type] = handlers[type] || []).push(fn);
        el['_handler_' + type] = fn;
      },
      removeEventListener(type) { delete el['_handler_' + type]; },
      _handlers: handlers,
      _fire(type) {
        const fns = handlers[type] || [];
        for (const fn of fns) fn({ type });
      },
    });
  }
  return el;
}
const bodyEl = makeEl('body');
const document = {
  createElement: (t) => makeEl(t),
  getElementById: (id) => byId[id] || null,
  querySelector: () => null,
  head: { appendChild: () => {} },
  body: bodyEl,
  hidden: false,
  hasFocus: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};
const seed = {};
const localStorage = {
  getItem(k) { return seed[k] ?? null; },
  setItem(k, v) { seed[k] = v; },
  removeItem(k) { delete seed[k]; },
};
const INVENTORY = {
  installDir: 'D:/we', total: 4, portableCount: 4, playlists: [],
  wallpapers: [
    { id: 'w1', title: 'WE Video', type: 'video', playable: true, media: '/wallpaper-engine/media/w1', preview: null, contentrating: 'Everyone' },
    { id: 'up-v1', title: 'My Upload Video', type: 'video', playable: true, media: '/wallpaper-engine/media/up1', preview: '/wallpaper-engine/video-preview/up1', contentrating: null },
    { id: 'up-m1', title: 'My Mature Upload', type: 'video', playable: true, media: '/wallpaper-engine/media/up2', preview: null, contentrating: 'Mature' },
    { id: 'img1', title: 'WE Image', type: 'image', playable: true, media: '/wallpaper-engine/media/img1', preview: null, contentrating: 'Everyone' },
  ],
};
const fetchMock = (url) => {
  const u = String(url);
  if (u.includes('/wallpaper-engine/inventory')) {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(INVENTORY) });
  }
  if (u.includes('/wallpaper-engine/media-info/')) {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, info: { width: 1920, height: 1080, codec: 'avc1', fps: 30 } }) });
  }
  if (u.includes('/wallpaper-engine/settings')) {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
  }
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
};
const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
const cap = { handoff: null };
const sandbox = {
  window: {
    __ModuleLoader__: { load: (h) => { cap.handoff = h; } },
    setTimeout: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; },
    clearTimeout: () => {},
    setInterval: () => ({ _interval: true }),
    clearInterval: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    innerWidth: 1920, innerHeight: 1080, outerWidth: 1920, outerHeight: 1000,
    devicePixelRatio: 1,
  },
  navigator: { userAgent: 'Mozilla/5.0 Chrome/120.0' },
  AbortController,
  setInterval: () => ({ _interval: true }),
  clearInterval: () => {},
  document, localStorage, fetch: fetchMock, React,
  getComputedStyle: () => ({ getPropertyValue: () => 'cover' }),
};
vm.createContext(sandbox);
new vm.Script(code, { filename: 'client.js' }).runInContext(sandbox);
const { factory } = cap.handoff;
const exportsObj = factory((spec) => {
  if (spec === 'react') return React;
  if (spec === 'react-dom') return { createPortal: (node) => node };
  throw new Error('unexpected require: ' + spec);
});
const pickerRenders = [];
const slots = { inject: (key, cb) => cb(), register: (opts, render) => { pickerRenders.push(render); } };
exportsObj.apply({ slots, effect(fn) { fn(); return fn; } });
function walk(root, visit) {
  if (Array.isArray(root)) { root.forEach((n) => walk(n, visit)); return; }
  if (!root || typeof root !== 'object') return;
  visit(root);
  if (Array.isArray(root.children)) root.children.forEach((n) => walk(n, visit));
}
function findButton(tree, cls, text) {
  let hit = null;
  walk(tree, (n) => {
    if (hit) return;
    const c = typeof n.props?.className === 'string' ? n.props.className : '';
    if (c.includes(cls) && Array.isArray(n.children) && n.children.length === 1 && n.children[0] === text) hit = n;
  });
  return hit;
}
function findWallpaperCard(tree, title) {
  let hit = null;
  walk(tree, (n) => {
    if (hit) return;
    const c = typeof n.props?.className === 'string' ? n.props.className : '';
    if (c.startsWith('we-picker__card') && n.props.title === title) hit = n;
  });
  return hit;
}
function findSelect(tree, ariaLabel) {
  let hit = null;
  walk(tree, (n) => {
    if (hit) return;
    if (n.type === 'select' && n.props && n.props['aria-label'] === ariaLabel) hit = n;
  });
  return hit;
}
const renderTree = () => pickerRenders[0]();
const tick = (ms = 20) => new Promise((r) => { setTimeout(r, ms); });
const treeText = () => JSON.stringify(renderTree());
function layerVideo() {
  const layer = document.getElementById('dsh-wallpaper-engine-layer');
  return layer ? layer.querySelector('video') : null;
}
function toggleButton(tree) {
  return findButton(tree, 'we-picker__btn', '暂停') || findButton(tree, 'we-picker__btn', '播放') || null;
}
function toggleLabel(tree) {
  const b = toggleButton(tree);
  return b ? b.children[0] : '(none)';
}
function openLibrary() {
  const b = findButton(renderTree(), 'we-picker__btn', '选择壁纸');
  if (b) b.props.onClick();
  return renderTree();
}
function closeLibrary() {
  const b = findButton(renderTree(), 'we-picker__btn', '返回');
  if (b) b.props.onClick();
  return renderTree();
}
async function main() {
  await tick(30);
  let tree = renderTree();
  const openBtn = findButton(tree, 'we-picker__btn', '选择壁纸');
  assert(openBtn && typeof openBtn.props.onClick === 'function', 'picker open button found');
  openBtn.props.onClick();
  tree = renderTree();
  const uploadCard = findWallpaperCard(tree, 'My Upload Video');
  check('A1 custom-uploaded video is listed under the default 「Everyone」 filter (#84)', !!uploadCard);
  check('A2 an explicitly Mature upload is still filtered out by default',
    !findWallpaperCard(tree, 'My Mature Upload'));
  assert(uploadCard && typeof uploadCard.props.onClick === 'function', 'upload card clickable');
  uploadCard.props.onClick();
  await tick(30);
  findButton(renderTree(), 'we-picker__btn', '返回').props.onClick();
  renderTree();
  let video = layerVideo();
  check('A3 applying it mounts the wallpaper layer + <video> (no blank background)', !!video);
  assert(video, 'video element mounted for the uploaded wallpaper');
  check('A4 the uploaded media URL is used', video.src === '/wallpaper-engine/media/up1', video.src);
  check('A5 playback actually starts', video.paused === false && video._playCalls > 0);
  tree = renderTree();
  check('A6 the toggle offers 「暂停」 while it really plays', toggleLabel(tree) === '暂停', toggleLabel(tree));
  findButton(tree, 'we-picker__btn', '暂停').props.onClick();
  await tick(20);
  tree = renderTree();
  check('B1 pausing stops the element and flips the control to 「播放」',
    video.paused === true && toggleLabel(tree) === '播放', 'label=' + toggleLabel(tree));
  const playBtn = findButton(tree, 'we-picker__btn', '播放');
  assert(playBtn, '播放 button present while paused');
  playBtn.props.onClick();
  await tick(20);
  tree = renderTree();
  check('B2 「播放」 resumes playback', video.paused === false && toggleLabel(tree) === '暂停', 'label=' + toggleLabel(tree));
  findButton(tree, 'we-picker__btn', '暂停').props.onClick();
  await tick(20);
  video._playRejects = true;
  const retriedAfterRefusal = (before, after) => after - before >= 1;
  const callsBeforeRefusal = video._playCalls;
  findButton(renderTree(), 'we-picker__btn', '播放').props.onClick();
  await tick(30);
  tree = renderTree();
  const callsAfterRefusal = video._playCalls;
  check('B3 a refused play() is retried (not silently swallowed)',
    retriedAfterRefusal(callsBeforeRefusal, callsAfterRefusal),
    'retries after refusal=' + (callsAfterRefusal - callsBeforeRefusal)
      + ' (play() calls ' + callsBeforeRefusal + '→' + callsAfterRefusal + ')');
  check('B3 负对照：同一条判据对「拒绝后一次都没重试」（增量 0）会当场红',
    !retriedAfterRefusal(callsAfterRefusal, callsAfterRefusal));
  check('B4 the element is still paused, so the UI must NOT claim 「播放中」',
    video.paused === true && toggleLabel(tree) === '播放', 'label=' + toggleLabel(tree));
  check('B5 the refusal reason is surfaced to the user',
    treeText().includes('浏览器拒绝了播放请求'));
  check('B6 the control stays enabled so it can be retried', toggleButton(tree).props.disabled === false);
  video._playRejects = false;
  findButton(renderTree(), 'we-picker__btn', '播放').props.onClick();
  await tick(30);
  tree = renderTree();
  check('B7 clicking 播放 retries and resumes playback', video.paused === false && toggleLabel(tree) === '暂停', 'label=' + toggleLabel(tree));
  check('B8 the reason clears once playback recovers', !treeText().includes('浏览器拒绝了播放请求'));
  findButton(renderTree(), 'we-picker__btn', '暂停').props.onClick();
  await tick(20);
  video._playRejects = 'AbortError';
  findButton(renderTree(), 'we-picker__btn', '播放').props.onClick();
  await tick(30);
  check('B9a an aborted start reports 「已暂停」 with a resumable control',
    toggleLabel(renderTree()) === '播放' && video.paused === true);
  video._playRejects = false;
  video._fire('loadeddata');
  await tick(30);
  check('B9b it resumes by itself once the media is ready',
    video.paused === false && toggleLabel(renderTree()) === '暂停', 'paused=' + video.paused);
  video.error = { code: 4 };
  video._fire('error');
  await tick(20);
  tree = renderTree();
  check('C1 an undecodable video reports 「已暂停」, not 「播放中」',
    treeText().includes('已暂停') && toggleLabel(tree) === '播放', 'label=' + toggleLabel(tree));
  check('C2 the reason names the codec problem and suggests H.264',
    treeText().includes('无法解码') && treeText().includes('H.264'));
  video.error = null;
  findButton(renderTree(), 'we-picker__btn', '播放').props.onClick();
  await tick(30);
  tree = renderTree();
  check('C3 recovery clears the error state', !treeText().includes('无法解码') && toggleLabel(tree) === '暂停');
  findButton(tree, 'we-picker__btn', '暂停').props.onClick();
  await tick(20);
  tree = openLibrary();
  const weCard = findWallpaperCard(tree, 'WE Video');
  assert(weCard, 'WE video card present');
  weCard.props.onClick();
  await tick(30);
  closeLibrary();
  video = layerVideo();
  tree = renderTree();
  check('D1 a wallpaper switch while paused mounts the new video paused (not playing)',
    video.paused === true);
  check('D2 …and the control still offers a working 「播放」', toggleLabel(tree) === '播放', toggleLabel(tree));
  findButton(renderTree(), 'we-picker__btn', '播放').props.onClick();
  await tick(30);
  check('D3 that 「播放」 resumes the new wallpaper', layerVideo().paused === false && toggleLabel(renderTree()) === '暂停');
  tree = openLibrary();
  const ratingSelect = findSelect(tree, '内容分级');
  assert(ratingSelect && typeof ratingSelect.props.onChange === 'function', 'rating filter select found');
  ratingSelect.props.onChange({ target: { value: 'mature' } });
  await tick(30);
  closeLibrary();
  check('E1 dropping the active wallpaper via a filter is explained (no silent blank)',
    treeText().includes('被「内容分级」过滤排除了'));
  check('E2 the layer really is gone (the note replaces an unexplained blank)',
    !document.getElementById('dsh-wallpaper-engine-layer'));
  tree = openLibrary();
  const matureCard = findWallpaperCard(tree, 'My Mature Upload');
  check('E3 the filter now offers the explicitly Mature upload', !!matureCard);
  if (matureCard) {
    matureCard.props.onClick();
    await tick(30);
    check('E4 an explicitly rated upload plays like any other', layerVideo() && layerVideo().paused === false);
  }
  findSelect(renderTree(), '内容分级').props.onChange({ target: { value: 'everyone' } });
  await tick(30);
  closeLibrary();
  check('E5 switching the filter back re-explains the drop (never a silent blank)',
    treeText().includes('被「内容分级」过滤排除了'));
  tree = openLibrary();
  const uploadAgain = findWallpaperCard(tree, 'My Upload Video');
  check('E6 the user\'s own upload is selectable again under the default filter', !!uploadAgain);
  if (uploadAgain) {
    uploadAgain.props.onClick();
    await tick(30);
    closeLibrary();
    check('E7 …and it plays, with the explanation cleared',
      layerVideo() && layerVideo().paused === false && !treeText().includes('过滤排除'));
  }
  tree = openLibrary();
  const typeSelect = findSelect(tree, '类型');
  assert(typeSelect && typeof typeSelect.props.onChange === 'function', 'type filter select found');
  typeSelect.props.onChange({ target: { value: 'scene' } });
  await tick(30);
  closeLibrary();
  check('F1 switching the TYPE filter keeps the applied wallpaper mounted',
    !!document.getElementById('dsh-wallpaper-engine-layer'));
  check('F2 …still playing (the switch must not blank or pause it)',
    layerVideo() && layerVideo().paused === false);
  check('F3 …and no note claims the wallpaper was filtered out',
    !treeText().includes('过滤排除'));
  tree = openLibrary();
  check('F4 the filter really applies to the list (the playing card is gone from the grid)',
    !findWallpaperCard(tree, 'My Upload Video'));
  findSelect(renderTree(), '类型').props.onChange({ target: { value: 'all' } });
  await tick(30);
  tree = renderTree();
  check('F5 switching the filter back restores the card without touching playback',
    !!findWallpaperCard(tree, 'My Upload Video')
    && layerVideo() && layerVideo().paused === false && !treeText().includes('过滤排除'));
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (failed.length === 0
    ? 'ALL PLAYBACK CONTROL CHECKS PASSED'
    : failed.length + ' CHECK(S) FAILED'));
  process.exit(failed.length === 0 ? 0 : 1);
}
main().catch((err) => {
  console.error('TEST ERROR:', err && err.stack ? err.stack : err);
  process.exit(1);
});
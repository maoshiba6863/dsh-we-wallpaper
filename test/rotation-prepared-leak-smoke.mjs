function badChild(c) {
  if (c === null || c === undefined || typeof c === 'boolean' || typeof c === 'string' || typeof c === 'number') return null;
  if (Array.isArray(c)) { for (const x of c) { const b = badChild(x); if (b) return b; } return null; }
  if (typeof c === 'object' && c.type) return null;
  return c;
}
function assertChildren(children) {
  for (const c of children) {
    const bad = badChild(c);
    if (bad) throw new Error('React #31：无效子节点（对象不能作为子节点）: ' + JSON.stringify(Object.keys(bad)).slice(0, 80));
  }
}
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const FADE_GRACE_MS = Number(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  .match(/ROTATION_FADE_MS = (\d+)/)[1]) + 100;
const FRAME_BYTES_MAX = Number(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  .match(/FRAME_BYTES_MAX = (\d+)/)[1]);
const React = { Fragment:'Fragment', useState:(i)=>[i,()=>{}], useEffect:()=>{}, useRef:(v)=>({current:v}),
  createElement:(t,p,...c)=>{ assertChildren(c); return typeof t==='function'?t(p||{}):({type:t,props:p||null,children:c}); } };
let failures = 0;
const check = (label, cond, detail = '') => {
  if (cond) console.log('  ✓ ' + label + (detail ? ' — ' + detail : ''));
  else { failures++; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
};
const RealDate = Date;
const clock = { offset: 0 };
class MockDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(RealDate.now() + clock.offset); else super(...a); }
  static now() { return RealDate.now() + clock.offset; }
}
function runScenario(name, opts, body) {
  console.log('\n== ' + name + ' ==');
  clock.offset = 0;
  const timers = [];
  const intervals = [];
  const byId = {};
  const mediaEls = [];
  const iframeEls = [];
  const cleanups = [];
  const effects = [];
  const imageEls = [];
  const loadedWallpapers = opts.wallpapers;
  let liveWindow = null;
  const stats = Object.assign({}, opts.stats || {});
  const setStats = (tok, st) => { stats[tok] = st; };
  const statsFor = (src) => {
    for (const [tok, st] of Object.entries(stats)) if (String(src).includes(tok)) return Object.assign({}, st);
    return { fps: 30, running: true };
  };
  const webStates = Object.assign({}, opts.webStates || {});
  const webStateFor = (src) => {
    for (const [tok, st] of Object.entries(webStates)) if (String(src).includes(tok)) return Object.assign({}, st);
    return null;
  };
  const setWebState = (tok, st) => { webStates[tok] = st; };
  function makeEl(tag) {
    const listeners = {};
    const el = {
      tagName: tag.toUpperCase(), children: [], dataset: {}, attributes: {},
      style: { _props:{}, cssText:'', setProperty(k,v){this._props[k]=v;}, removeProperty(k){delete this._props[k];} },
      className: '',
      appendChild(c){ this.children.push(c); if (c.id) byId[c.id] = c; c._parent = this; return c; },
      remove(){ if (this._parent){ const i = this._parent.children.indexOf(this); if (i>=0) this._parent.children.splice(i,1); this._parent = undefined; } },
      setAttribute(k,v){ this.attributes[k] = v; },
      removeAttribute(k){ delete this.attributes[k]; (this.__removedAttrs ||= []).push(k); },
      getAttribute(k){ return this.attributes[k] ?? null; },
      hasAttribute(k){ return k in this.attributes; },
      querySelector(sel){
        const m = /^([a-z]+)(?:\.(.+))?$/.exec(sel) || [];
        const want = m[1] ? m[1].toUpperCase() : null;
        const wantCls = m[2] || '';
        const walk=(n)=>{ if (!Array.isArray(n.children)) return null; for (const c of n.children){ if (c.tagName===want && (!wantCls || String(c.className).includes(wantCls))) return c; const r=walk(c); if(r)return r; } return null; };
        return walk(this);
      },
      querySelectorAll(sel){
        const want = String(sel).split(',').map(x=>x.trim().toUpperCase());
        const out=[]; const walk=(n)=>{ if (!Array.isArray(n.children)) return; for (const c of n.children){ if (want.includes(c.tagName)) out.push(c); walk(c); } }; walk(this); return out;
      },
      contains(n){ let cur=n; while(cur){ if(cur===this)return true; cur=cur._parent; } return false; },
      get isConnected(){ let cur=this; while (cur) { if (!cur._parent) return cur.tagName === 'BODY'; cur = cur._parent; } return false; },
      addEventListener(ev,fn){ (listeners[ev] ||= []).push(fn); },
      removeEventListener(ev,fn){ const l=listeners[ev]; if(l){const i=l.indexOf(fn); if(i>=0)l.splice(i,1);} },
      __fire(ev){ (listeners[ev]||[]).slice().forEach(f=>f()); },
      play(){ this.__plays = (this.__plays||0)+1; this.__paused = false; this.paused = false; return Promise.resolve(); },
      pause(){ this.__pauses = (this.__pauses||0)+1; this.__paused = true; this.paused = true; },
      load(){ this.__loads = (this.__loads||0)+1; },
      getContext(){ if (this.tagName !== 'CANVAS') return null; if (!this.__ctx) { const c = this; this.__ctx = { drawImage(img){ c.__src = String((img && (img.src || (img.attributes && img.attributes.src))) || ''); } }; } return this.__ctx; },
      toBlob(cb){ if (opts.noFrameBytes || this.tagName !== 'CANVAS') { cb(null); return; } cb(makeBlob(this.__src || '')); },
    };
    if (tag === 'video') { el.__plays = 0; el.__pauses = 0; el.__loads = 0; el.__paused = false; el.__removedAttrs = []; }
    if (tag === 'video' || tag === 'img') {
      Object.defineProperty(el, 'poster', {
        get: () => el.attributes.poster ?? '',
        set: (v) => { el.attributes.poster = v || ''; },
      });
    }
    let _id = '';
    Object.defineProperty(el, 'id', {
      get: () => _id,
      set: (v) => { if (_id) delete byId[_id]; _id = v || ''; if (v) byId[v] = el; },
    });
    el.classList = {
      add(c){ const parts = el.className ? el.className.split(' ') : []; if (!parts.includes(c)) { parts.push(c); el.className = parts.join(' '); } },
      remove(c){ const parts = el.className ? el.className.split(' ') : []; const i = parts.indexOf(c); if (i >= 0) { parts.splice(i, 1); el.className = parts.join(' '); } },
    };
    Object.defineProperty(el, 'src', {
      get: () => el.attributes.src ?? '',
      set: (v) => { el.attributes.src = v || ''; el.__srcSets = (el.__srcSets || 0) + 1; },
    });
    if (tag === 'iframe') {
      el.__volumes = [];
      el.__wpPaused = false;
      el.contentWindow = {
        __wpStats: { frame: () => {
          el.__statsCalls = (el.__statsCalls||0)+1;
          return el.__wpPaused ? { fps: 0, running: false } : statsFor(el.src);
        } },
        __wp: { resume(){ el.__wpPaused = false; }, pause(){ el.__wpPaused = true; },
          setVolume(v){ el.__volumes.push(v); }, setFit(){}, pushPointer(){}, pointerLeave(){},
          getState: () => webStateFor(el.src) },
      };
    }
    return el;
  }
  const blobSources = new Map();
  const revokedObjectUrls = [];
  const makeBlob = (source) => Object.assign(new Blob(['png-bytes:' + source], { type: 'image/png' }), { __source: source });
  class ImageMock {
    constructor() {
      this.tagName = 'IMG'; this.attributes = {}; this.naturalWidth = 1920; this.naturalHeight = 1080;
      this.width = 1920; this.height = 1080;
      this.complete = false;
      this.__listeners = {};
      imageEls.push(this);
    }
    set src(v){ this.attributes.src = v || ''; }
    get src(){ return this.attributes.src || ''; }
    set className(v){ this._cls = v; } get className(){ return this._cls || ''; }
    cloneNode(){ const c = new ImageMock(); c.src = this.src; return c; }
    set alt(v){} set draggable(v){}
    setAttribute(k, v){ this.attributes[k] = v; }
    getAttribute(k){ return this.attributes[k] ?? null; }
    addEventListener(ev, fn){ (this.__listeners[ev] ||= []).push(fn); }
    removeEventListener(ev, fn){ const a = this.__listeners[ev]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
    __fireLoad() {
      this.complete = true;
      if (typeof this.onload === 'function') this.onload();
      for (const fn of [...(this.__listeners.load || [])]) fn();
    }
    toBlob(cb){ cb(opts.noFrameBytes ? null : makeBlob(this.src)); }
  }
  const bodyEl = makeEl('body');
  const docListeners = {}; const winListeners = {};
  const fireOn = (reg, ev) => { for (const fn of (reg[ev] ? [...reg[ev]] : [])) fn({ type: ev }); };
  let docFocus = true;
  const document = {
    createElement: (t) => { const el = makeEl(t); if (t==='iframe') iframeEls.push(el); if (t==='video') mediaEls.push(el); return el; },
    getElementById: (id) => { const el = byId[id]; return el && el.isConnected ? el : null; },
    querySelector: () => null,
    head: { appendChild: () => {} },
    body: bodyEl,
    hidden: false,
    hasFocus: () => docFocus,
    addEventListener(ev, fn){ (docListeners[ev] ||= []).push(fn); },
    removeEventListener(ev, fn){ const a = docListeners[ev]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
    documentElement: makeEl('html'),
  };
  const localStorage = {
    _store: Object.assign({ 'dsh-wallpaper-engine:selection': JSON.stringify(opts.selection), weRotationTestSec: '10' }, opts.localStorageSeed || {}),
    getItem(k){ return this._store[k] ?? null; }, setItem(k,v){ this._store[k]=v; }, removeItem(k){ delete this._store[k]; },
  };
  const fetch = (url) => Promise.resolve({ ok:true, status:200, headers:{ get: () => '0' },
    json: () => Promise.resolve(
      String(url).includes('/settings') ? { ok:true, betterSidebar:false } :
      String(url).includes('/media-info') ? { info:null } :
      { installDir:'D:/we', total:3, portableCount:3, playlists:[], wallpapers: loadedWallpapers }) });
  const themeSubs = [];
  const themeCalls = [];
  const themeSnap = (id) => {
    const layer = byId['dsh-wallpaper-engine-layer'];
    const live = layer && layer.isConnected ? layer : null;
    const video = live ? live.querySelector('video') : null;
    const iframe = live ? live.querySelector('iframe') : null;
    return { id, layer: live, wid: live ? String(live.dataset.weWid || '') : '',
      video, iframe, media: video || iframe || null,
      src: video ? mediaSrc(video) : (iframe ? String(iframe.src) : '') };
  };
  const themeService = {
    preference: opts.themePreference || 'dark',
    getTheme() { return { preference: themeService.preference, revision: 0 }; },
    setTheme(id) {
      if (themeService.preference === id) return;
      themeCalls.push(themeSnap(id));
      themeService.preference = id;
      for (const fn of [...themeSubs]) fn(themeService.getTheme());
    },
    overrideTokens() { return () => {}; },
  };
  const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
  let randomPick = null;
  const setRandomSeq = (vals) => { let i = 0; randomPick = () => vals[Math.min(i++, vals.length - 1)]; };
  const init = (selection) => {
    clock.offset = 0;
    localStorage._store['dsh-wallpaper-engine:selection'] = JSON.stringify(selection);
    const cap = { handoff: null };
    const sandbox = {
      window: {
        __ModuleLoader__: { load:(h)=>{ cap.handoff = h; } },
        setTimeout:(fn,ms)=>{ const t={fn,ms,cleared:false}; timers.push(t); return t; },
        clearTimeout:(t)=>{ if(t)t.cleared=true; },
        setInterval:(fn,ms)=>{ const t={fn,ms,cleared:false}; intervals.push(t); return t; },
        clearInterval:(t)=>{ if(t)t.cleared=true; },
        addEventListener(ev, fn){ (winListeners[ev] ||= []).push(fn); },
        removeEventListener(ev, fn){ const a = winListeners[ev]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
        innerWidth:1920, innerHeight:1080, devicePixelRatio:1,
      },
      document, localStorage, fetch, React, Date: MockDate, Image: ImageMock,
      Math: Object.create(Math, { random: { value: () => (randomPick ? randomPick() : Math.random()) } }),
      Blob,
      URL: {
        createObjectURL(blob){ const u = 'blob:mock/' + (blobSources.size + 1); blobSources.set(u, String((blob && blob.__source) || '')); return u; },
        revokeObjectURL(u){ revokedObjectUrls.push(String(u)); blobSources.delete(String(u)); },
      },
      console,
      location: { origin: 'http://localhost' },
      setTimeout:(fn,ms)=>{ const t={fn,ms,cleared:false}; timers.push(t); return t; },
      clearTimeout:(t)=>{ if(t)t.cleared=true; },
      setInterval:(fn,ms)=>{ const t={fn,ms,cleared:false}; intervals.push(t); return t; },
      clearInterval:(t)=>{ if(t)t.cleared=true; },
    };
    liveWindow = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: 'client.js' });
    const exportsObj = cap.handoff.factory((spec)=> spec==='react' ? React : { createPortal:(n)=>n });
    const pluginCtx = { slots:{ inject:(k,cb)=>cb(), register:()=>{} },
      effect(fn){ effects.push(fn); const c = fn(); if (typeof c === 'function') cleanups.push(c); return fn; } };
    if (opts.theme) {
      pluginCtx.get = (id) => (id === 'theme' ? themeService : undefined);
      pluginCtx.on = (ev, fn) => {
        if (ev === 'theme/change') themeSubs.push(fn);
        return () => { const i = themeSubs.indexOf(fn); if (i >= 0) themeSubs.splice(i, 1); };
      };
    }
    exportsObj.apply(pluginCtx);
  };
  const fire = (t) => { if (t && !t.cleared) { t.cleared = true; t.fn(); } };
  const fireLatest = (ms) => { const t = [...timers].reverse().find(x => !x.cleared && x.ms === ms); if (t) fire(t); return t; };
  const flushPersist = () => timers.filter(t=>!t.cleared && t.ms===200).forEach(fire);
  const stagingDivs = () => bodyEl.children.filter(c => String(c.className).includes('we-layer--staging'));
  const layerEl = () => byId['dsh-wallpaper-engine-layer'];
  const orphans = () => mediaEls.filter(v => !v.isConnected && !v.__paused);
  const mediaSrc = (el) => String((el && el.attributes && el.attributes.src) || '');
  const persistedId = () => JSON.parse(localStorage._store['dsh-wallpaper-engine:selection']).id;
  const ctx = { timers, intervals, byId, mediaEls, iframeEls, cleanups, effects, bodyEl, fire, fireLatest,
    flushPersist, stagingDivs, layerEl, orphans, mediaSrc, persistedId, clock, setStats, setWebState, imageEls,
    localStorage, blobSources, revokedObjectUrls, document, themeCalls, themeService, themeSnap,
    setRandomSeq,
    frameBytes: () => liveWindow && liveWindow.__weFrameBytes };
  const api = Object.assign(ctx, {
    persistedSel: () => JSON.parse(localStorage._store['dsh-wallpaper-engine:selection']),
    setHidden(v){ document.hidden = !!v; fireOn(docListeners, 'visibilitychange'); },
    setFocus(v){ docFocus = !!v; },
    fireDoc(ev){ fireOn(docListeners, ev); },
    fireWin(ev){ fireOn(winListeners, ev); }, failureMemory: () => (JSON.parse(localStorage._store['dsh-wallpaper-engine:selection']).sceneLiveFailures || {}),
    pipelineMarker: () => localStorage._store.weLivePipeline || '' });
  return (async () => {
    init(opts.selection, opts.wallpapers);
    await new Promise((r) => { setTimeout(r, 50); });
    return body(api);
  })();
}
const wallpaperV = { id:'v', title:'V', type:'video', playable:true, media:'/wallpaper-engine/media/vvv', preview:'/wallpaper-engine/preview/vvv', contentrating:'Everyone' };
const scene = (id, tok) => ({ id, title:id.toUpperCase(), type:'scene', playable:false, media:null,
  frameUrl:'/wallpaper-engine/scene-frame/' + id, sceneLive:true, sceneLiveSrc:tok,
  sceneVideo:'/wallpaper-engine/scene-video/' + id, preview:'/wallpaper-engine/preview/' + id, contentrating:'Everyone' });
const selSeed = (ids, cur) => ({ id:cur, rotationGroupId:'g1', rotationEnabled:true, videoVolume:0.6, videoAudioEnabled:true,
  liveBootDelay:0,
  switchTransition:'fade',
  rotationGroups:[{ id:'g1', name:'L', interval:5, order:'sequence', wallpaperIds:ids }] });
await runScenario('H. 卸载停掉场景 BGM 并拆掉 <audio>（不起播）', {
  wallpapers: [wallpaperV,
    { id:'s4', title:'S4', type:'scene', playable:false, media:null,
      frameUrl:'/wallpaper-engine/scene-frame/s4', sceneAudio:'/wallpaper-engine/scene-audio/s4',
      preview:'/wallpaper-engine/preview/s4', contentrating:'Everyone' }],
  selection: selSeed(['v','s4'], 'v'),
}, (t) => {
  const audios = () => t.bodyEl.querySelectorAll('audio');
  t.fireLatest(10000);
  const img = t.imageEls[t.imageEls.length-1];
  if (img && typeof img.onload === 'function') img.onload();
  const el = audios()[0];
  check('静态帧形态提交后场景 BGM 元素已挂上（渐变期被闸压住：volume=0 + pause）',
    audios().length === 1 && !!el && String(el.volume) === '0' && el.__paused === true,
    'audios=' + audios().length + (el ? ' volume=' + el.volume + ' paused=' + el.__paused : ''));
  check('卸载前捕获到 cleanup', t.cleanups.length > 0, 'cleanups=' + t.cleanups.length);
  const playsBefore = el ? (el.__plays || 0) : 0;
  t.cleanups.forEach((c) => c());
  check('卸载过程中不得起播场景 BGM（放行会 restore → syncSceneAudio → play）',
    !!el && (el.__plays || 0) === playsBefore,
    el ? 'plays ' + playsBefore + ' → ' + (el.__plays || 0) : 'no audio');
  check('卸载后 BGM 保持停播', !!el && el.__paused === true, el ? 'paused=' + el.__paused : 'no audio');
  check('卸载后 <audio> 已拆掉且脱离文档',
    audios().length === 0 && !!el && !el.isConnected, 'audios=' + audios().length);
});
await runScenario('A. live 首帧超时回退：探针不得留在领养槽位里', {
  wallpapers: [wallpaperV, scene('s1', 'tok-s1')],
  stats: { 'tok-s1': { fps: 0, running: true } },
  selection: selSeed(['v','s1'], 'v'),
}, (t) => {
  check('轮换定时器已武装（测试钩子 10s）', !!t.timers.find(x=>!x.cleared && x.ms===10000));
  t.fireLatest(10000);
  const probeIframe = t.iframeEls[t.iframeEls.length-1];
  check('准备期先走 live 探测（staging 容器 + scene-live iframe）',
    !!probeIframe && String(probeIframe.src).includes('scene-live/index.html')
      && String(probeIframe.src).includes('tok-s1') && t.stagingDivs().length === 1,
    'src=' + String(probeIframe && probeIframe.src).slice(0, 60));
  check('此时尚未创建视频探针', t.mediaEls.length === 1, 'videos=' + t.mediaEls.length);
  t.fireLatest(300);
  check('首帧未达标 → 探测轮询续跑（500ms）',
    t.mediaEls.length === 1 && !!t.timers.find(x=>!x.cleared && x.ms===500));
  t.clock.offset = 16000;
  t.fireLatest(500);
  check('超时后探测 iframe 被释放（对照项：证明释放检测有效）',
    String(probeIframe && probeIframe.src) === 'about:blank' && t.stagingDivs().length === 0,
    'src=' + String(probeIframe && probeIframe.src) + ' staging=' + t.stagingDivs().length);
  const probe1 = t.mediaEls[t.mediaEls.length-1];
  check('回退创建了 sceneVideo 探针且已在预播（detached 播放 → 泄漏形态）',
    t.mediaEls.length === 2 && t.mediaSrc(probe1).includes('/wallpaper-engine/scene-video/s1')
      && probe1.__plays >= 1 && probe1.__paused === false, 'src=' + t.mediaSrc(probe1));
  const loadsBefore = probe1.__loads;
  probe1.__fire('canplay');
  const layer = t.layerEl();
  check('提交后层是 live iframe + poster（buildMedia 选了 live 分支，不消费槽位）',
    !!layer && !!layer.querySelector('iframe.we-live-iframe') && !!layer.querySelector('div.we-live-poster'),
    layer ? String(layer.dataset.weKey).slice(0, 70) : 'no layer');
  check('回退探针已暂停', probe1.__paused === true, 'paused=' + probe1.__paused);
  check('回退探针已清 src', probe1.__removedAttrs.includes('src') && t.mediaSrc(probe1) === '',
    'removed=' + JSON.stringify(probe1.__removedAttrs) + ' src="' + t.mediaSrc(probe1) + '"');
  check('回退探针额外 load() 一次（真释放而非只改标记）', probe1.__loads === loadsBefore + 1,
    'loads=' + probe1.__loads);
  check('不存在「已脱离文档且仍在播」的 video（无孤儿）', t.orphans().length === 0,
    'orphans=' + t.orphans().length);
  check('body 里只剩旧层那张渐变淡出的 video',
    t.bodyEl.querySelectorAll('video').length === 1, 'bodyVideos=' + t.bodyEl.querySelectorAll('video').length);
  t.flushPersist();
  check('提交已持久化到 s1', t.persistedId() === 's1', 'id=' + t.persistedId());
  const frameProbe = t.imageEls.filter((i) => String(t.mediaSrc(i) || '').split('?')[0] === '/wallpaper-engine/scene-frame/s1').pop() || null;
  if (frameProbe && typeof frameProbe.onload === 'function') frameProbe.onload();
  t.fireLatest(10000);
  const probe2 = t.mediaEls[t.mediaEls.length-1];
  const loads2 = probe2.__loads;
  probe2.__fire('canplay');
  const layer2 = t.layerEl();
  check('正常领养未被误杀（新层 video 就是探针元素）',
    !!layer2 && layer2.querySelector('video') === probe2);
  check('被领养的探针仍在播、保留 src、未额外 load()',
    probe2.__paused === false && t.mediaSrc(probe2).includes('/wallpaper-engine/media/vvv')
      && probe2.__loads === loads2 && !probe2.__removedAttrs.includes('src'),
    'paused=' + probe2.__paused + ' loads=' + probe2.__loads);
  check('仍然没有孤儿 video', t.orphans().length === 0, 'orphans=' + t.orphans().length);
});
await runScenario('B. 陈旧槽位不得被当成当前壁纸的资产领养', {
  wallpapers: [wallpaperV, scene('s1', 'tok-s1'), scene('s2', 'tok-s2')],
  stats: { 'tok-s1': { fps: 0, running: true }, 'tok-s2': { fps: 30, running: true } },
  selection: selSeed(['v','s1','s2'], 'v'),
}, (t) => {
  t.fireLatest(10000);
  t.clock.offset = 16000;
  t.fireLatest(300);
  t.fireLatest(500);
  const probeS1 = t.mediaEls[t.mediaEls.length-1];
  probeS1.__fire('canplay');
  check('第一轮：s1 提交为 live iframe（回退探针不领养）',
    !!t.layerEl() && !!t.layerEl().querySelector('iframe.we-live-iframe'));
  check('第一轮：s1 的回退探针已被释放（不留在槽位）',
    probeS1.__paused === true && t.mediaSrc(probeS1) === '',
    'paused=' + probeS1.__paused + ' src="' + t.mediaSrc(probeS1) + '"');
  t.fireLatest(10000);
  const staged2 = t.iframeEls[t.iframeEls.length-1];
  check('第二轮：s2 探测 iframe 指向 tok-s2', String(staged2.src).includes('tok-s2'),
    'src=' + String(staged2.src).slice(0, 60));
  t.fireLatest(300);
  const layer2 = t.layerEl();
  check('第二轮：节点级领养（staging 容器原地成为层、iframe 未搬动）',
    !!layer2 && layer2.querySelector('iframe.we-live-iframe') === staged2,
    layer2 ? String(layer2.className) : 'no layer');
  t.setStats('tok-s2', { fps: 0, running: true });
  t.clock.offset = 32000;
  const tick = t.intervals.find(x => !x.cleared && x.ms === 1000);
  check('运行期心跳已武装（1s）', !!tick);
  if (tick) tick.fn();
  const layer3 = t.layerEl();
  const v3 = layer3 && layer3.querySelector('video');
  check('重建后层里出现 video（live 失败 → sceneVideo 回退）', !!v3,
    v3 ? 'src=' + t.mediaSrc(v3) : 'no video');
  check('层内 video 属于当前壁纸 s2（画面不串味）',
    !!v3 && t.mediaSrc(v3).includes('/wallpaper-engine/scene-video/s2'),
    v3 ? 'src=' + t.mediaSrc(v3) : 'no video');
  check('s1 的探针未被复活/被领养', probeS1.__paused === true && v3 !== probeS1);
  check('仍然没有孤儿 video', t.orphans().length === 0, 'orphans=' + t.orphans().length);
});
await runScenario('C. 卸载时收掉 staged iframe 与在途准备', {
  wallpapers: [wallpaperV, scene('s1', 'tok-s1')],
  stats: { 'tok-s1': { fps: 0, running: true } },
  selection: selSeed(['v','s1'], 'v'),
}, (t) => {
  t.fireLatest(10000);
  const staged = t.iframeEls[t.iframeEls.length-1];
  check('准备中的 staging iframe 已在 body 上', t.stagingDivs().length === 1 && !!staged);
  check('捕获到插件 cleanup（卸载路径可测）', t.cleanups.length > 0, 'cleanups=' + t.cleanups.length);
  t.cleanups.forEach((c) => c());
  check('卸载后 staged iframe 被释放（导航到 about:blank）',
    String(staged.src) === 'about:blank', 'src=' + staged.src);
  check('卸载后 staging 容器已从 body 移除', t.stagingDivs().length === 0,
    'staging=' + t.stagingDivs().length);
  check('卸载后没有孤儿 video', t.orphans().length === 0, 'orphans=' + t.orphans().length);
});
await runScenario('D. web 壁纸 live 失败后必须重建为旧链', {
  wallpapers: [
    { id:'w1', title:'W1', type:'web', playable:true, media:'/wallpaper-engine/web/w1',
      webLive:true, webLiveSrc:'tok-w1', preview:'/wallpaper-engine/preview/w1', contentrating:'Everyone' },
    wallpaperV,
  ],
  stats: { 'tok-w1': { fps: 30, running: true } },
  selection: selSeed(['w1','v'], 'w1'),
}, (t) => {
  const layer = t.layerEl();
  const liveFrame = layer && layer.querySelector('iframe.we-live-iframe');
  check('web 壁纸初始层是 live iframe', !!liveFrame,
    layer ? String(layer.dataset.weKey).slice(0, 60) : 'no layer');
  const keyBefore = layer ? layer.dataset.weKey : '';
  liveFrame.__fire('load');
  const tick = t.intervals.find(x => !x.cleared && x.ms === 1000);
  check('web live 心跳已武装（1s）', !!tick);
  t.setWebState('tok-w1', { iframeLoaded: false, webError: 'entry-load-failed' });
  t.clock.offset = 16000;
  if (tick) tick.fn();
  const layer2 = t.layerEl();
  const keyAfter = layer2 ? layer2.dataset.weKey : '';
  check('live 失败后层被重建（key 里的 live 段变为 nolive）',
    keyAfter.includes('nolive') && keyAfter !== keyBefore, 'key=' + String(keyAfter).slice(0, 70));
  check('重建后不再是 live iframe（回退旧链裸 iframe）',
    !!layer2 && !layer2.querySelector('iframe.we-live-iframe'));
  check('旧 live iframe 已随旧层退场', !liveFrame.isConnected || layer2 !== layer);
});
await runScenario('E. 静态帧预载按提交档位；不符（preview 回退）不得原样收编', {
  wallpapers: [
    wallpaperV,
    { id:'s3', title:'S3', type:'scene', playable:false, media:null,
      frameUrl:'/wallpaper-engine/scene-frame/s3', preview:'/wallpaper-engine/preview/s3', contentrating:'Everyone' },
  ],
  selection: Object.assign(selSeed(['v','s3'], 'v'), { frameVariants: { s3: 3 } }),
}, (t) => {
  t.fireLatest(10000);
  const probeImg = t.imageEls[t.imageEls.length-1];
  check('静态帧探针按提交档位准备（?v=3，不再是无档位 URL）',
    !!probeImg && t.mediaSrc(probeImg) === '/wallpaper-engine/scene-frame/s3?v=3',
    'src=' + String(probeImg && probeImg.src));
  if (probeImg && typeof probeImg.onload === 'function') probeImg.onload();
  const layer = t.layerEl();
  const img = layer && layer.querySelector('img');
  check('同档位预载被原样收编（零重建：层内 img 就是探针元素）', !!img && img === probeImg,
    img ? ('same=' + (img === probeImg)) : 'no img');
  check('层内静态帧按当前档位加载（?v=3）',
    !!img && String(img.src).includes('/wallpaper-engine/scene-frame/s3?v=3'),
    img ? 'src=' + String(img.src) : 'no img');
  t.flushPersist();
  check('提交已落库到 s3', t.persistedId() === 's3', 'id=' + t.persistedId());
  t.fireLatest(10000);
  const probeV = t.mediaEls[t.mediaEls.length-1];
  if (probeV && typeof probeV.__fire === 'function') probeV.__fire('canplay');
  t.flushPersist();
  check('第二轮回到视频壁纸', t.persistedId() === 'v', 'id=' + t.persistedId());
  t.fireLatest(10000);
  const frameImg = t.imageEls[t.imageEls.length-1];
  check('第二轮 s3 仍按档位 3 预载', t.mediaSrc(frameImg) === '/wallpaper-engine/scene-frame/s3?v=3',
    'src=' + t.mediaSrc(frameImg));
  if (frameImg && typeof frameImg.onerror === 'function') frameImg.onerror();
  const previewImg = t.imageEls[t.imageEls.length-1];
  check('提取失败后回退到 preview 探针',
    previewImg !== frameImg && t.mediaSrc(previewImg) === '/wallpaper-engine/preview/s3',
    'src=' + t.mediaSrc(previewImg));
  if (previewImg && typeof previewImg.onload === 'function') previewImg.onload();
  const layer2 = t.layerEl();
  const img2 = layer2 && layer2.querySelector('img');
  check('不符的 preview 探针未被原样收编（层内 img 按帧 URL 重建）',
    !!img2 && img2 !== previewImg && String(img2.src).includes('/wallpaper-engine/scene-frame/s3?v=3'),
    img2 ? ('src=' + String(img2.src) + ' same=' + (img2 === previewImg)) : 'no img');
  check('重建的 img 带 onerror 兜底（提取失败仍能退回 preview）',
    !!img2 && typeof img2.onerror === 'function');
});
await runScenario('F. 渐变窗口内卸载：旧层随 cleanup 退役（不留屏上残留）', {
  wallpapers: [wallpaperV, scene('s1','tok-s1')],
  stats: { 'tok-s1': { fps: 30, running: true } },
  selection: selSeed(['v','s1'], 'v'),
}, (t) => {
  const layerCount = () => t.bodyEl.children.filter(c => String(c.className).includes('we-layer')).length;
  t.fireLatest(10000);
  t.fireLatest(300);
  check('提交成功并进入渐变（body 里 2 层：淡出的旧层 + 新层）', layerCount() === 2,
    'layers=' + layerCount());
  check('渐变退役定时器已武装（ROTATION_FADE_MS + 100ms）', !!t.timers.find(x=>!x.cleared && x.ms===FADE_GRACE_MS));
  check('卸载前捕获到 cleanup', t.cleanups.length > 0, 'cleanups=' + t.cleanups.length);
  t.cleanups.forEach((c) => c());
  check('卸载后 body 里不再有 we-layer（旧层随 cleanup 退役，而不是等退役定时器）',
    layerCount() === 0, 'layers=' + layerCount());
});
await runScenario('G. 准备期 live 连续超时 → 冷却后跳过 live 阶段', {
  wallpapers: [wallpaperV, scene('s1','tok-s1')],
  stats: { 'tok-s1': { fps: 0, running: true } },
  selection: selSeed(['v','s1'], 'v'),
}, (t) => {
  const staged = () => t.stagingDivs().length;
  const startRound = () => { t.fireLatest(10000); return staged(); };
  const settle = () => { t.fireLatest(300); t.clock.offset += 16000; t.fireLatest(500); };
  const commitProbe = () => {
    const p = t.mediaEls[t.mediaEls.length-1];
    if (p && typeof p.__fire === 'function') p.__fire('canplay');
    t.flushPersist();
    return p;
  };
  let r = startRound(); settle(); commitProbe();
  check('第 1 次准备 s1 仍然尝试 live 探测', r === 1, 'staged=' + r);
  check('第 1 次超时后回退提交到 s1', t.persistedId() === 's1', 'id=' + t.persistedId());
  r = startRound(); commitProbe();
  check('视频候选不经过 live 探测', r === 0 && t.persistedId() === 'v', 'staged=' + r + ' id=' + t.persistedId());
  r = startRound(); settle(); commitProbe();
  check('第 2 次准备仍会再试一次（上限 2，避免一次抖动就永久放弃）', r === 1, 'staged=' + r);
  r = startRound(); commitProbe();
  check('轮换回视频壁纸', r === 0 && t.persistedId() === 'v', 'id=' + t.persistedId());
  r = startRound();
  check('连续超时后不再发起 live 探测（本会话对该壁纸跳过 live 阶段）', r === 0, 'staged=' + r);
  const probe = t.mediaEls[t.mediaEls.length-1];
  check('直接回退到 sceneVideo 探针（准备链仍能就绪）',
    t.mediaSrc(probe).includes('/wallpaper-engine/scene-video/s1'), 'src=' + t.mediaSrc(probe));
  commitProbe();
  check('第 3 轮提交回到 s1', t.persistedId() === 's1', 'id=' + t.persistedId());
  const liveLayer = t.layerEl();
  check('提交后的层里仍是 live iframe（冷却不影响建层路径）',
    !!liveLayer && !!liveLayer.querySelector('iframe.we-live-iframe'));
  const liveFrame = liveLayer && liveLayer.querySelector('iframe.we-live-iframe');
  if (liveFrame) liveFrame.__fire('load');
  const tick2 = t.intervals.find(x => !x.cleared && x.ms === 1000);
  check('live 心跳已武装（1s）', !!tick2);
  t.setStats('tok-s1', { fps: 30, running: true });
  if (tick2) tick2.fn();
  r = startRound(); commitProbe();
  check('轮换回视频壁纸（清冷却前）', r === 0 && t.persistedId() === 'v', 'id=' + t.persistedId());
  r = startRound();
  check('live 真的出过首帧后冷却被清零 → 下轮恢复 live 探测', r === 1, 'staged=' + r);
});
await runScenario('I. 领养后处于暂停/失焦：首帧看护必须暂停计时，不得记超时', {
  wallpapers: [wallpaperV, scene('s1', 'tok-s1')],
  stats: { 'tok-s1': { fps: 30, running: true } },
  selection: Object.assign(selSeed(['v','s1'], 'v'), { pauseOnBlur: true }),
}, (t) => {
  t.document.hasFocus = () => false;
  t.fireLatest(10000);
  t.fireLatest(300);
  const staged = t.iframeEls[t.iframeEls.length-1];
  const layer = t.layerEl();
  check('失焦状态下仍完成 live 准备与领养（准备期不看父页焦点；iframe 未搬动）',
    !!layer && t.stagingDivs().length === 0 && layer.querySelector('iframe.we-live-iframe') === staged
      && staged._parent === layer,
    'layer=' + (layer ? String(layer.className) : 'none') + ' staging=' + t.stagingDivs().length);
  check('领养后渲染页被 applyLiveControls 按「非有效播放」暂停（失焦的真实后果）',
    staged.__wpPaused === true, '__wpPaused=' + staged.__wpPaused);
  const tick = t.intervals.find(x => !x.cleared && x.ms === 1000);
  check('live 心跳已武装（1s）', !!tick);
  t.clock.offset += 20000;
  for (let i = 0; i < 20; i++) if (tick) tick.fn();
  t.flushPersist();
  check('暂停期间不得记入 sceneLiveFailures（那一刻写 timeout 会导致永久降级）',
    !t.failureMemory()['s1'], JSON.stringify(t.failureMemory()));
  const beacons = () => t.imageEls.map((e) => String(e.src || ''))
    .filter((s) => s.indexOf('/diag?msg=') === 0).map((s) => decodeURIComponent(s));
  check('默认就向宿主诊断缓冲上报关键事件（watch-start / adopt-live，无需开关）',
    beacons().some((s) => s.indexOf('watch-start') !== -1) && beacons().some((s) => s.indexOf('adopt-live') !== -1),
    'beacons=' + beacons().length);
  check('暂停期间不上报 liveFail（日志与行为一致）',
    !beacons().some((s) => s.indexOf('liveFail') !== -1),
    beacons().filter((s) => s.indexOf('liveFail') !== -1).join(' | ').slice(0, 120));
  check('暂停期间层不得被重建（仍是领养那个 iframe、渲染页不重载）',
    t.layerEl() === layer && !!layer.querySelector('iframe.we-live-iframe'), 'rebuilt=' + (t.layerEl() !== layer));
  t.document.hasFocus = () => true;
  t.clock.offset += 1000;
  if (tick) tick.fn();
  t.clock.offset += 1000;
  if (tick) tick.fn();
  check('恢复播放后心跳立刻确认首帧（渲染页 resume 后照常出帧）',
    staged.__wpPaused === false && t.timers.some(x => !x.cleared && x.ms === 2500),
    'wpPaused=' + staged.__wpPaused + ' 回填定时器=' + t.timers.filter(x => !x.cleared && x.ms === 2500).length);
  t.flushPersist();
  check('恢复后依然没有失败记忆', !t.failureMemory()['s1'], JSON.stringify(t.failureMemory()));
});
await runScenario('J. 标签页隐藏：本轮轮换推迟（零驻留），可见后立刻补做', {
  wallpapers: [wallpaperV, scene('s1', 'tok-s1')],
  selection: selSeed(['v','s1'], 'v'),
  stats: { 'tok-s1': { fps: 0, running: false } },
}, (t) => {
  t.setHidden(true);
  t.fireLatest(10000);
  check('隐藏期间不建 staging 渲染页（零驻留：不加载 pkg、不占显存）',
    t.stagingDivs().length === 0 && t.persistedId() === 'v',
    'staging=' + t.stagingDivs().length + ' id=' + t.persistedId());
  t.clock.offset += 300000;
  t.fireLatest(10000);
  check('长时间隐藏期间始终不建 staging、不提交、不记失败',
    t.stagingDivs().length === 0 && t.persistedId() === 'v' && !t.failureMemory()['s1'],
    'staging=' + t.stagingDivs().length + ' id=' + t.persistedId());
  t.setStats('tok-s1', { fps: 30, running: true });
  t.setHidden(false);
  const staged = t.iframeEls[t.iframeEls.length - 1];
  check('恢复可见立刻补做：建立 staging 渲染页',
    t.stagingDivs().length === 1 && String(staged.src).includes('tok-s1'),
    'staging=' + t.stagingDivs().length);
  t.fireLatest(300);
  t.flushPersist();
  check('补做完成后提交到 s1', t.persistedId() === 's1', 'id=' + t.persistedId());
  const layer = t.layerEl();
  check('提交走节点级领养（staging 容器原地成为层，iframe 未重载）',
    !!layer && layer.querySelector('iframe.we-live-iframe') === staged && staged._parent === layer);
  t.flushPersist();
  check('隐藏不产生失败记忆（隐藏 ≠ 这张壁纸 live 走不通）',
    !t.failureMemory()['s1'], JSON.stringify(t.failureMemory()));
});
await runScenario('K. 准备中途隐藏：≤60s 继续等，超限释放 staging 且不回退成静态帧', {
  wallpapers: [wallpaperV, scene('s1', 'tok-s1')],
  selection: selSeed(['v','s1'], 'v'),
  stats: { 'tok-s1': { fps: 0, running: false } },
}, (t) => {
  t.fireLatest(10000);
  check('可见时准备立刻建立 staging', t.stagingDivs().length === 1, 'staging=' + t.stagingDivs().length);
  t.fireLatest(300);
  t.setHidden(true);
  t.clock.offset += 30000;
  t.fireLatest(500);
  t.fireLatest(2000);
  check('隐藏未超上限：staging 保留（回来即可看到本轮切换）',
    t.stagingDivs().length === 1 && t.persistedId() === 'v',
    'staging=' + t.stagingDivs().length + ' id=' + t.persistedId());
  t.clock.offset += 40000;
  t.fireLatest(2000);
  check('超过上限：释放 staging、不提交、不回退成静态帧',
    t.stagingDivs().length === 0 && t.persistedId() === 'v',
    'staging=' + t.stagingDivs().length + ' id=' + t.persistedId());
  check('隐藏超限不得记入失败记忆/超时计数（隐藏 ≠ 这张壁纸 live 走不通）',
    !t.failureMemory()['s1'] && t.persistedId() === 'v', JSON.stringify(t.failureMemory()));
  t.setStats('tok-s1', { fps: 30, running: true });
  t.setHidden(false);
  check('恢复可见立刻重新准备（新 staging）', t.stagingDivs().length === 1, 'staging=' + t.stagingDivs().length);
  t.fireLatest(300);
  t.flushPersist();
  check('补做完成后提交到 s1（且是 live 形态）', t.persistedId() === 's1', 'id=' + t.persistedId());
  const layer = t.layerEl();
  check('补做提交后 live 渲染页在位（未被降级成静态帧/内嵌 MP4）',
    !!layer && !!layer.querySelector('iframe.we-live-iframe'));
});
await runScenario('L. 换管线：旧管线的失败记忆作废一次（自己的那半不受影响）', {
  wallpapers: [scene('s1', 'tok-s1')],
  stats: { 'tok-s1': { fps: 30, running: true } },
  selection: Object.assign(selSeed(['s1'], 's1'), { sceneLiveFailures: { s1: 'timeout' } }),
  localStorageSeed: { weLivePipeline: JSON.stringify({ build: 'd7', media: 0 }) },
}, (t) => {
  t.flushPersist();
  check('旧管线的失败记忆被作废（面板那行「实时渲染失败」的唯一来源）',
    !t.failureMemory()['s1'], JSON.stringify(t.failureMemory()));
  const layer = t.layerEl();
  check('作废后这一跳直接建回 live 层（不必手动重开「场景实时渲染」开关）',
    !!layer && !!layer.querySelector('iframe.we-live-iframe'));
  check('管线身份刷新为当前管线（build=d8）',
    /"build":"d8"/.test(String(t.pipelineMarker())), String(t.pipelineMarker()));
});
await runScenario('L2. 同管线：记忆是自己挣来的 ⇒ 不作废（负对照）', {
  wallpapers: [scene('s1', 'tok-s1')],
  stats: { 'tok-s1': { fps: 30, running: true } },
  selection: Object.assign(selSeed(['s1'], 's1'), { sceneLiveFailures: { s1: 'timeout' } }),
  localStorageSeed: { weLivePipeline: JSON.stringify({ build: 'd8', media: 0 }) },
}, (t) => {
  t.flushPersist();
  check('同一管线的失败记忆保留（作废判据不是"凡有记忆就清"）',
    t.failureMemory()['s1'] === 'timeout', JSON.stringify(t.failureMemory()));
  const layer = t.layerEl();
  check('记忆保留 ⇒ 层走回退链、不建 live 渲染页（记忆的语义没被破坏）',
    !(layer && layer.querySelector('iframe.we-live-iframe')));
  check('未发生作废 ⇒ 管线标记原样保留（没有多余的写盘）',
    String(t.pipelineMarker()) === JSON.stringify({ build: 'd8', media: 0 }), String(t.pipelineMarker()));
});
const posterProbeForFrame = (t, src) => t.imageEls.filter((i) => String(t.mediaSrc(i) || '').split('?')[0] === src).pop() || null;
const posterShowsFrame = (t, poster, src) => {
  if (!src) return posterBgSrc(t, poster) === '';
  const m = /url\(["']?([^"')]+)["']?\)/.exec(posterBgSrc(t, poster));
  return Boolean(m) && m[1].split('?')[0] === src;
};
const frameBytesPaths = (t) => {
  const b = t.frameBytes();
  return b ? new Map([...b.entries()].map(([k, v]) => [String(k).split('?')[0], v])) : null;
};
await runScenario('P. 首帧前垫底图：抓帧 → 作者预览图 → 主题色（首次激活不留黑屏）', {
  wallpapers: [scene('s1', 'tok-s1')],
  stats: { 'tok-s1': { fps: 0, running: true } },
  selection: selSeed(['s1'], 's1'),
}, (t) => {
  const layer = t.layerEl();
  const poster = layer && layer.querySelector('div.we-live-poster');
  check('场景 live 层带垫底图（不是空层）', !!poster);
  const frameSrc = '/wallpaper-engine/scene-frame/s1';
  const previewSrc = '/wallpaper-engine/preview/s1';
  const probeFrame = posterProbeForFrame(t, frameSrc);
  check('① 垫底图先试**实时抓帧**（当前视口的真实构图优先于预览图）',
    !!probeFrame, 'probe=' + (probeFrame ? t.mediaSrc(probeFrame) : 'none'));
  check('   来源已记录（诊断能看出退到哪一级）',
    !!poster && String(poster.dataset.weFrameSrc || '').split('?')[0] === frameSrc,
    'weFrameSrc=' + (poster ? poster.dataset.weFrameSrc : 'no poster'));
  if (probeFrame && typeof probeFrame.onerror === 'function') probeFrame.onerror();
  const probePreview = t.imageEls.filter((i) => t.mediaSrc(i) === previewSrc).pop() || null;
  check('② 抓帧 404 ⇒ 退到**作者预览图**（而不是停在近黑主题色）',
    !!probePreview, 'probe=' + (probePreview ? t.mediaSrc(probePreview) : 'none'));
  if (probePreview && typeof probePreview.onload === 'function') probePreview.onload();
  check('③ 预览图就绪 ⇒ 铺上垫底画面（首帧前不再是黑屏）',
    !!poster && String(poster.style.backgroundImage) === 'url(' + previewSrc + ')',
    'bg=' + (poster ? String(poster.style.backgroundImage) : 'no poster'));
  check('   链在首个成功处停（不再产生第三级探针）',
    t.imageEls[t.imageEls.length - 1] === probePreview);
});
await runScenario('P2. 无预览图：垫底图只留主题色兜底，不猜图（负对照）', {
  wallpapers: [Object.assign(scene('s2', 'tok-s2'), { preview: null })],
  stats: { 'tok-s2': { fps: 0, running: true } },
  selection: selSeed(['s2'], 's2'),
}, (t) => {
  const layer = t.layerEl();
  const poster = layer && layer.querySelector('div.we-live-poster');
  const frameSrc = '/wallpaper-engine/scene-frame/s2';
  const probeFrame = posterProbeForFrame(t, frameSrc);
  check('垫底图仍先试实时抓帧', !!probeFrame, 'probe=' + (probeFrame ? t.mediaSrc(probeFrame) : 'none'));
  const imagesBefore = t.imageEls.length;
  if (probeFrame && typeof probeFrame.onerror === 'function') probeFrame.onerror();
  check('抓帧失败且无预览图 ⇒ 不产生第二级探针（不猜图、不回退到别的东西）',
    t.imageEls.length === imagesBefore, 'images=' + imagesBefore + '→' + t.imageEls.length);
  check('垫底图保留主题色兜底（背景图始终没被赋上 —— 判据有牙）',
    !!poster && !poster.style.backgroundImage,
    'bg=' + (poster ? String(poster.style.backgroundImage) : 'no poster'));
});
const posterOf = (t) => {
  const layer = t.layerEl();
  return layer && layer.querySelector('div.we-live-poster');
};
const posterBg = (poster) => (poster && poster.style ? String(poster.style.backgroundImage || '') : '');
const posterBgSrc = (t, poster) => {
  const raw = posterBg(poster);
  const m = /url\(["']?(blob:[^"')]+)["']?\)/.exec(raw);
  if (m) {
    const source = String((t.blobSources && t.blobSources.get(m[1])) || m[1]);
    if (source) return 'url(' + source + ')';
    return raw;
  }
  if (raw) return raw;
  const img = poster && poster.querySelector && poster.querySelector('img');
  const src = img ? t.mediaSrc(img) : '';
  return src ? 'url(' + src + ')' : '';
};
const posterShowsSrc = (t, poster, src) => posterBgSrc(t, poster) === (src ? 'url(' + src + ')' : '');
const posterColor = (poster) => (poster && poster.style ? String(poster.style.backgroundColor || '') : '');
const posterProbeFor = (t, src) => t.imageEls.filter((i) => t.mediaSrc(i) === src).pop() || null;
const fireProbe = (probe, ev) => {
  if (probe && typeof probe[ev] === 'function') { probe[ev](); return true; }
  return false;
};
const markVideoDecoded = (el) => {
  if (!el) return null;
  el.readyState = 3;
  if (typeof el.__fire === 'function') el.__fire('canplay');
  return el;
};
await runScenario('P3. 无缓存实时帧：第 1 级仍在飞行中 ⇒ 缩略图不上屏（存在性闸门）', {
  wallpapers: [scene('s1', 'tok-s1')],
  stats: { 'tok-s1': { fps: 0, running: true } },
  selection: selSeed(['s1'], 's1'),
}, (t) => {
  const poster = posterOf(t);
  const frameSrc = '/wallpaper-engine/scene-frame/s1';
  const previewSrc = '/wallpaper-engine/preview/s1';
  const probeFrame = posterProbeForFrame(t, frameSrc);
  const probePreview = posterProbeFor(t, previewSrc);
  check('① 抓帧未定（既未成功也未失败）时，两张探针**都已发出**（并行请求，不互相门控）',
    !!probePreview && !!probeFrame,
    'frame=' + (probeFrame ? t.mediaSrc(probeFrame) : 'none')
      + ' preview=' + (probePreview ? t.mediaSrc(probePreview) : 'none'));
  check('   负对照（同一条判据，喂空 src）：此刻屏上还没有任何图 —— 判据有牙，不是恒真',
    posterShowsSrc(t, poster, ''), 'bg=' + posterBg(poster));
  fireProbe(probePreview, 'onload');
  check('② 抓帧仍在飞行的同一时刻，屏上**不是**作者预览图（更低权威的级不许先上屏）',
    !posterShowsSrc(t, poster, previewSrc), 'bg=' + posterBg(poster));
  check('   负对照（同一条判据，喂空 src）：屏上仍是"只有主题色"那个状态 —— 判据分得清两张图',
    posterShowsSrc(t, poster, ''), 'bg=' + posterBg(poster));
  fireProbe(probeFrame, 'onerror');
  check('③ 第 1 级判失败（这一级确实不存在）⇒ 已就绪的缩略图**此刻**才上屏',
    posterShowsSrc(t, poster, previewSrc), 'bg=' + posterBg(poster));
});
await runScenario('P4. 无缓存实时帧：第 1 级成功 ⇒ 真帧上屏，缩略图压不回来', {
  wallpapers: [scene('s1', 'tok-s1')],
  stats: { 'tok-s1': { fps: 0, running: true } },
  selection: selSeed(['s1'], 's1'),
}, (t) => {
  const poster = posterOf(t);
  const frameSrc = '/wallpaper-engine/scene-frame/s1';
  const previewSrc = '/wallpaper-engine/preview/s1';
  const probeFrame = posterProbeForFrame(t, frameSrc);
  const probePreview = posterProbeFor(t, previewSrc);
  check('① 两张探针同场竞速（"谁允许上屏"的前提：两张都可能到）',
    !!probeFrame && !!probePreview, 'frame=' + !!probeFrame + ' preview=' + !!probePreview);
  fireProbe(probePreview, 'onload');
  check('② 低权威先到也**不许**上屏（第 1 级尚未判失败）',
    !posterShowsSrc(t, poster, previewSrc) && posterShowsSrc(t, poster, ''),
    'bg=' + posterBg(poster));
  fireProbe(probeFrame, 'onload');
  check('③ 真帧到达 ⇒ 上屏的就是真帧',
    posterShowsFrame(t, poster, frameSrc), 'bg=' + posterBg(poster));
  fireProbe(probePreview, 'onload');
  check('④ 负对照（同一条判据）：真帧定稿后低权威不得压回去（屏上仍是真帧）',
    posterShowsFrame(t, poster, frameSrc) && !posterShowsSrc(t, poster, previewSrc),
    'bg=' + posterBg(poster));
});
await runScenario('P5. 无缓存实时帧：第 1 级判失败 ⇒ 已就绪的缩略图补上（不退回纯色）', {
  wallpapers: [scene('s1', 'tok-s1')],
  stats: { 'tok-s1': { fps: 0, running: true } },
  selection: selSeed(['s1'], 's1'),
}, (t) => {
  const poster = posterOf(t);
  const frameSrc = '/wallpaper-engine/scene-frame/s1';
  const previewSrc = '/wallpaper-engine/preview/s1';
  const probeFrame = posterProbeForFrame(t, frameSrc);
  const probePreview = posterProbeFor(t, previewSrc);
  const colorBefore = posterColor(poster);
  fireProbe(probePreview, 'onload');
  check('① 前置：第 1 级尚未判失败 ⇒ 缩略图还没上屏（闸门关着）',
    !posterShowsSrc(t, poster, previewSrc), 'bg=' + posterBg(poster));
  fireProbe(probeFrame, 'onerror');
  check('② 第 1 级判失败 ⇒ 已就绪的缩略图**补上**（第 2 档语义：不存在 ⇒ 缩略图兜底）',
    posterShowsSrc(t, poster, previewSrc), 'bg=' + posterBg(poster));
  check('   负对照（同一条判据，喂空 src）：屏上**不是**"只剩主题色"那个状态（不被纯色顶掉）',
    !posterShowsSrc(t, poster, ''), 'bg=' + posterBg(poster));
  check('③ 第 0 级主题色兜底始终在同一元素上垫底（失败路径不动它）',
    colorBefore.length > 0 && posterColor(poster) === colorBefore, 'schemeColor=' + posterColor(poster));
});
await runScenario('P6. 缓存实时帧存在：建层那一刻就是实时帧（缩略图不上屏）', {
  wallpapers: [wallpaperV, scene('s1', 'tok-s1')],
  stats: { 'tok-s1': { fps: 0, running: true } },
  selection: selSeed(['v', 's1'], 's1'),
}, (t) => {
  const frameSrc = '/wallpaper-engine/scene-frame/s1';
  const previewSrc = '/wallpaper-engine/preview/s1';
  const frameProbes = () => t.imageEls.filter((i) => String(t.mediaSrc(i) || '').split('?')[0] === frameSrc);
  const previewProbes = () => t.imageEls.filter((i) => t.mediaSrc(i) === previewSrc);
  const cold = posterOf(t);
  check('① 冷（本会话还没见过第 1 级）⇒ 建层那一刻屏上没有任何图 —— 判据有牙，不是恒真',
    !!cold && posterShowsSrc(t, cold, '') && !posterShowsFrame(t, cold, frameSrc),
    'bg=' + posterBg(cold));
  check('   负对照（同一条判据，换 src）：屏上也不是缩略图那张（这一刻谁都还没上屏）',
    !posterShowsSrc(t, cold, previewSrc), 'bg=' + posterBg(cold));
  fireProbe(frameProbes().pop(), 'onload');
  check('② 第 1 级就绪 ⇒ 屏上是实时帧（字节由此进留存）',
    posterShowsFrame(t, cold, frameSrc), 'bg=' + posterBg(cold));
  t.fireLatest(10000);
  const probeV = t.mediaEls[t.mediaEls.length - 1];
  markVideoDecoded(probeV);
  check('③ 前置换出：当前层已不是那张垫底图（"第二次建层"的前提，否则后面量的是同一张）',
    !!t.layerEl() && posterOf(t) === null, 'poster=' + (posterOf(t) ? 'still there' : 'gone'));
  const previewsBefore = previewProbes().length;
  const frameProbesBefore = frameProbes().length;
  t.fireLatest(10000);
  t.fireLatest(300);
  t.clock.offset = 16000;
  t.fireLatest(500);
  const probeBack = t.mediaEls[t.mediaEls.length - 1];
  markVideoDecoded(probeBack);
  const warm = posterOf(t);
  check('④ 缓存命中 ⇒ 第二次建层那一刻屏上**已经是实时帧**（不是缩略图、也不是纯色）',
    !!warm && warm !== cold && posterShowsFrame(t, warm, frameSrc),
    'bg=' + posterBg(warm) + ' layer=' + (t.layerEl() ? String(t.layerEl().dataset.weKey).slice(0, 40) : 'none'));
  check('   负对照（同一条判据，换 src）：缩略图从未成为屏上那张',
    !posterShowsSrc(t, warm, previewSrc), 'bg=' + posterBg(warm));
  check('⑤ 缓存命中 ⇒ 第 2 级连请求都不发（缩略图探针一个都没新增）',
    previewProbes().length === previewsBefore,
    'preview probes ' + previewsBefore + '→' + previewProbes().length);
  check('⑥ 缓存命中 ⇒ 第 1 级也不发请求（帧探针没新增：屏上那张来自留住的字节，不是重新取值）',
    frameProbes().length === frameProbesBefore,
    'frame probes ' + frameProbesBefore + '→' + frameProbes().length);
});
await runScenario('P7. 拿不到 object URL：命中仍同步上帧（插入已解码元素那条通道）', {
  wallpapers: [wallpaperV, scene('s7', 'tok-s7')],
  stats: { 'tok-s7': { fps: 0, running: true } },
  selection: selSeed(['v', 's7'], 's7'),
  noFrameBytes: true,
}, (t) => {
  const frameSrc = '/wallpaper-engine/scene-frame/s7';
  const previewSrc = '/wallpaper-engine/preview/s7';
  const frameMark = (i) => String((i && i.attributes && i.attributes['data-we-frame-src']) || '');
  const frameProbes = () => t.imageEls.filter((i) => String(t.mediaSrc(i) || '').split('?')[0] === frameSrc && !frameMark(i));
  const clonedFrames = () => t.imageEls.filter((i) => String(frameMark(i) || '').split('?')[0] === frameSrc);
  const previewProbes = () => t.imageEls.filter((i) => t.mediaSrc(i) === previewSrc);
  fireProbe(frameProbes().pop(), 'onload');
  const retainedObjectUrls = t.blobSources.size;
  check('① 前置：这一档确实没留下 object URL（判据量的就是另一条通道）',
    retainedObjectUrls === 0, 'object urls=' + retainedObjectUrls);
  t.fireLatest(10000);
  const probeV = t.mediaEls[t.mediaEls.length - 1];
  markVideoDecoded(probeV);
  t.fireLatest(10000);
  t.fireLatest(300);
  t.clock.offset = 16000;
  t.fireLatest(500);
  const probeBack = t.mediaEls[t.mediaEls.length - 1];
  const frameProbesBefore = frameProbes().length;
  const previewsBefore = previewProbes().length;
  markVideoDecoded(probeBack);
  const warm = posterOf(t);
  check('② 命中：第 2 次建层那一刻屏上已是实时帧（插入的是已解码元素，不是纯色也不是缩略图）',
    !!warm && posterShowsFrame(t, warm, frameSrc), 'bg=' + posterBgSrc(t, warm));
  check('③ 命中不为它再发请求：网络探针没新增（屏上那张来自留住的元素，不是重新取值）',
    frameProbes().length === frameProbesBefore,
    'frame probes ' + frameProbesBefore + '→' + frameProbes().length
      + ' cloned=' + clonedFrames().length);
  check('   前置：这一跳确实是**插入已解码元素**那条通道上的屏（不是靠新探针才有的图）',
    clonedFrames().length > 0, 'cloned=' + clonedFrames().length);
  check('   负对照（同一条判据，换 src）：缩略图从未成为屏上那张',
    !posterShowsSrc(t, warm, previewSrc), 'bg=' + posterBgSrc(t, warm));
  check('④ 命中时第 2 级连请求都不发（缩略图探针也没新增）',
    previewProbes().length === previewsBefore,
    'preview probes ' + previewsBefore + '→' + previewProbes().length);
});
await runScenario('P8. 留存帧字节替换：旧 object URL 被撤销（只删记账不撤地址 = 无界增长）', {
  wallpapers: [scene('s1', 'tok-s1')],
  stats: { 'tok-s1': { fps: 0, running: true } },
  selection: selSeed(['s1'], 's1'),
}, (t) => {
  const frameSrc = '/wallpaper-engine/scene-frame/s1';
  const probe = posterProbeForFrame(t, frameSrc);
  check('① 前置：第 1 级探针在场（本轮帧字节的来源）', !!probe, 'src=' + frameSrc);
  fireProbe(probe, 'onload');
  const bytes = frameBytesPaths(t);
  check('② 帧就绪后留存表里就是这一条（诊断面可读出留下的是哪几张）',
    !!bytes && bytes.size === 1 && bytes.has(frameSrc), 'size=' + (bytes ? bytes.size : 'n/a'));
  const urlsAfterFirst = t.blobSources.size;
  fireProbe(posterProbeForFrame(t, frameSrc), 'onload');
  check('③ 同一 URL 再来一次不会越留越多：留存表仍只有这一条（每键一份）',
    t.frameBytes() && t.frameBytes().size === 1, 'size=' + (t.frameBytes() ? t.frameBytes().size : 'n/a'));
  check('④ 旧的 object URL 被 URL.revokeObjectURL 撤掉（不撤 = 那份字节收到页面关闭）',
    t.revokedObjectUrls.length === 1 && t.blobSources.size === urlsAfterFirst,
    'revoked=' + t.revokedObjectUrls.length + ' registered=' + t.blobSources.size);
  check('⑤ 屏上始终是这张帧（换字节不撤图）', posterShowsFrame(t, posterOf(t), frameSrc),
    'bg=' + posterBgSrc(t, posterOf(t)));
});
const webWallpaper = (id, opts) => Object.assign({
  id, title: id.toUpperCase(), type: 'web', playable: true,
  media: '/wallpaper-engine/web/' + id, webLive: true, webLiveSrc: 'tok-' + id,
  preview: '/wallpaper-engine/preview/' + id, contentrating: 'Everyone',
}, (opts && opts.hostSendsLiveFrame === false) ? {} : { liveFrame: '/wallpaper-engine/live-frame/' + id });
const webFrameFacts = (t, frameSrc, previewSrc) => {
  const poster = posterOf(t);
  const probed = t.imageEls.map((i) => t.mediaSrc(i));
  return {
    head: poster ? String(poster.dataset.weFrameSrc || '') : '',
    frameProbed: probed.includes(frameSrc),
    previewProbed: probed.includes(previewSrc),
    captureTimers: t.timers.filter((x) => !x.cleared && x.ms === 3000).length,
  };
};
const fireLiveFirstFrame = (t) => {
  const live = t.layerEl() && t.layerEl().querySelector('iframe.we-live-iframe');
  if (live) live.__fire('load');
  const tick = t.intervals.find((x) => !x.cleared && x.ms === 1000);
  if (tick) tick.fn();
};
await runScenario('X1. web 壁纸：宿主发的 liveFrame 成为垫底图第 1 级，且抽帧定时器会装上', {
  wallpapers: [webWallpaper('w1')],
  selection: selSeed(['w1'], 'w1'),
}, (t) => {
  const frameSrc = '/wallpaper-engine/live-frame/w1';
  const previewSrc = '/wallpaper-engine/preview/w1';
  const cold = webFrameFacts(t, frameSrc, previewSrc);
  check('① web 支的候选表首项是**宿主发的实时帧**（不是作者预览图）',
    cold.head === frameSrc, 'head=' + cold.head);
  check('② 第 1 级（实时帧）确实发了探针：它参与存在性闸门，不是记账里的摆设',
    cold.frameProbed && cold.previewProbed,
    'frame=' + cold.frameProbed + ' preview=' + cold.previewProbed);
  check('   负对照（同一条取用器，换 src）：首项不是预览图 —— 判据分得清两条腿',
    cold.head !== previewSrc, 'head=' + cold.head);
  check('③ 首帧稳定之前没有抽帧定时器（它只在首帧那一跳被武装）',
    cold.captureTimers === 0, 'timers3000=' + cold.captureTimers);
  fireLiveFirstFrame(t);
  const warm = webFrameFacts(t, frameSrc, previewSrc);
  check('④ live 首帧稳定 ⇒ 抽帧定时器（3000ms）已武装 —— 帧腿可达（抽帧上传 + 真实帧参与主题判决）',
    warm.captureTimers > cold.captureTimers,
    'timers3000 ' + cold.captureTimers + '→' + warm.captureTimers);
});
await runScenario('X2. 负对照：宿主没发 liveFrame ⇒ web 支没有帧腿（同一取用器）', {
  wallpapers: [webWallpaper('w1', { hostSendsLiveFrame: false })],
  selection: selSeed(['w1'], 'w1'),
}, (t) => {
  const frameSrc = '/wallpaper-engine/live-frame/w1';
  const previewSrc = '/wallpaper-engine/preview/w1';
  const cold = webFrameFacts(t, frameSrc, previewSrc);
  check('① 首项退到作者预览图（这一档确实没有实时帧候选）',
    cold.head === previewSrc, 'head=' + cold.head);
  check('② 没有为实时帧发探针（候选表里根本没有它）',
    !cold.frameProbed && cold.previewProbed,
    'frame=' + cold.frameProbed + ' preview=' + cold.previewProbed);
  fireLiveFirstFrame(t);
  const warm = webFrameFacts(t, frameSrc, previewSrc);
  check('③ live 首帧稳定也不会武装抽帧定时器（没有帧可抽、没有槽位可回填）',
    warm.captureTimers === cold.captureTimers,
    'timers3000 ' + cold.captureTimers + '→' + warm.captureTimers);
});
const frameKey = (i) => '/wallpaper-engine/scene-frame/s' + i;
const noFpsStats = (ids) => Object.fromEntries(ids.map((id) => ['tok-' + id, { fps: 0, running: true }]));
const lruIds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'];
await runScenario('P9. 留存表 LRU：命中搬到表尾 ⇒ 超上限淘汰的是最久没被用到的那一条', {
  wallpapers: lruIds.map((id) => scene(id, 'tok-' + id)),
  stats: noFpsStats(lruIds),
  selection: Object.assign(selSeed(lruIds, 's1'), {
    rotationGroups: [{ id: 'g1', name: 'L', interval: 5, order: 'random', wallpaperIds: lruIds }],
  }),
}, (t) => {
  const bytes = () => frameBytesPaths(t);
  const keys = () => (bytes() ? [...bytes().keys()] : []);
  const nextRound = () => {
    t.fireLatest(10000);
    t.fireLatest(300);
    t.clock.offset += 16000;
    t.fireLatest(500);
    const probe = t.mediaEls[t.mediaEls.length - 1];
    if (probe) probe.__fire('canplay');
  };
  t.setRandomSeq([0.05, 0.2, 0.3, 0.4, 0.5, 0.7, 0.8, 0.1, 0.95]);
  fireProbe(posterProbeForFrame(t, frameKey(1)), 'onload');
  check('① 前置：启动那一层已把 s1 的帧字节留住（留存表里唯一的一条）',
    !!bytes() && bytes().size === 1 && bytes().has(frameKey(1)),
    'size=' + (bytes() ? bytes().size : 'n/a'));
  for (let i = 2; i <= 8; i++) {
    nextRound();
    const probe = posterProbeForFrame(t, frameKey(i));
    check('   前置：第 ' + (i - 1) + ' 轮落在 s' + i + '（表里还没有它的字节 ⇒ 这一跳是冷建层）',
      !!probe && !keys().includes(frameKey(i)), 'probe=' + !!probe + ' size=' + keys().length);
    fireProbe(probe, 'onload');
  }
  check('② 前置：8 张不同帧刚好把表填到上限（还没触发淘汰）',
    keys().length === FRAME_BYTES_MAX, 'size=' + keys().length + '/' + FRAME_BYTES_MAX);
  const f1ProbesBefore = t.imageEls.filter((i) => String(t.mediaSrc(i) || '').split('?')[0] === frameKey(1)).length;
  nextRound();
  const f1ProbesAfter = t.imageEls.filter((i) => String(t.mediaSrc(i) || '').split('?')[0] === frameKey(1)).length;
  check('③ 前置：回到 s1 的那一跳是**命中**（屏上是帧的字节，且没有为它新建探针）',
    posterShowsFrame(t, posterOf(t), frameKey(1)) && f1ProbesAfter === f1ProbesBefore,
    'bg=' + posterBgSrc(t, posterOf(t)) + ' probes=' + f1ProbesBefore + '→' + f1ProbesAfter);
  const f2Url = (() => { for (const [u, src] of t.blobSources) if (String(src).split('?')[0] === frameKey(2)) return u; return ''; })();
  nextRound();
  fireProbe(posterProbeForFrame(t, frameKey(9)), 'onload');
  check('④ 上限生效：同会话轮换 9 张不同帧之后，表被截到上限（不是无界增长）',
    keys().length === FRAME_BYTES_MAX, 'size=' + keys().length + '/' + FRAME_BYTES_MAX);
  check('⑤ 淘汰的是**最久没被用到**的那一条（s2：最后一次用它是在 7 轮之前）',
    !bytes().has(frameKey(2)), 'has(s2)=' + bytes().has(frameKey(2)));
  check('   正对照（同一条判据，换 key）：刚被画过的那一条（s1）留住了 —— 判据分得清两者',
    bytes().has(frameKey(1)), 'has(s1)=' + bytes().has(frameKey(1)));
  check('⑥ 被淘汰那一条的 object URL 被 URL.revokeObjectURL 撤销（不是只删记账）',
    !!f2Url && t.revokedObjectUrls.includes(f2Url),
    'f2=' + f2Url + ' revoked=' + JSON.stringify(t.revokedObjectUrls));
});
const LAYER_PENDING_CLS = 'we-layer--pending';
const paintedLayerOf = (t) => {
  const shown = t.bodyEl.children.filter((c) => {
    const cls = String(c.className || '');
    return cls.includes('we-layer') && !cls.includes(LAYER_PENDING_CLS) && !cls.includes('we-layer--staging');
  });
  return shown.length ? shown[shown.length - 1] : null;
};
const layerShowsPicture = (layer) => {
  if (!layer || typeof layer.querySelector !== 'function') return false;
  const poster = layer.querySelector('div.we-live-poster');
  if (poster && String(poster.style.backgroundImage || '')) return true;
  const img = layer.querySelector('img');
  if (img && Number(img.naturalWidth) > 0) return true;
  const video = layer.querySelector('video');
  if (video && (video.getAttribute('poster') || Number(video.readyState) >= 2)) return true;
  const live = layer.querySelector('iframe.we-live-iframe');
  if (live && String(live.className).includes('we-live-on')) return true;
  return false;
};
const noBlankFrameInSwitch = (frames) => frames.every((f) => !f.shown || f.showsPicture === true);
const layerIsPending = (layer) => !!layer && String(layer.className || '').includes(LAYER_PENDING_CLS);
const layerPainted = (t, layer) => !!layer && paintedLayerOf(t) === layer;
const imgHasPixels = (img) => !!img && img.complete === true && Number(img.naturalWidth) > 0;
const observeFrame = (t, at) => {
  const shown = paintedLayerOf(t);
  return { at, shown, showsPicture: layerShowsPicture(shown) };
};
const frameLabel = (f) => f.at + ' → ' + (f.shown ? (f.showsPicture ? '有画面' : '**无画面**') : '无层');
await runScenario('T1. 切层内容闸门：垫底图还没有图 ⇒ 旧层留在屏上（无"无画面"中间态）', {
  wallpapers: [wallpaperV, scene('s1', 'tok-s1')],
  stats: { 'tok-s1': { fps: 0, running: true } },
  selection: selSeed(['v', 's1'], 'v'),
}, (t) => {
  const frameSrc = '/wallpaper-engine/scene-frame/s1';
  const oldLayer = t.layerEl();
  const oldVideo = oldLayer && oldLayer.querySelector('video');
  if (oldVideo) oldVideo.readyState = 3;
  const beforeFrame = observeFrame(t, '切换前');
  check('前置：切换前屏上是旧层，且它有画面（判据的分辨力前提）',
    beforeFrame.shown === oldLayer && beforeFrame.showsPicture === true, frameLabel(beforeFrame));
  t.fireLatest(10000);
  t.fireLatest(300);
  t.clock.offset = 16000;
  t.fireLatest(500);
  const probeBack = t.mediaEls[t.mediaEls.length - 1];
  if (probeBack) probeBack.__fire('canplay');
  const newLayer = t.layerEl();
  const pendingFrame = observeFrame(t, '提交后（垫底图还没图）');
  check('① 当前壁纸的层已经是**新层**（LAYER_ID 在它手里）',
    !!newLayer && newLayer !== oldLayer && !!newLayer.querySelector('div.we-live-poster'),
    'new=' + (!!newLayer && newLayer !== oldLayer));
  check('② 但它还没有画面：这一层被闸门挡在绘制之外（we-layer--pending）',
    !!newLayer && String(newLayer.className).includes(LAYER_PENDING_CLS)
      && layerShowsPicture(newLayer) === false,
    'cls=' + (newLayer && newLayer.className) + ' picture=' + (newLayer && layerShowsPicture(newLayer)));
  check('③ 这一刻参与绘制的是**旧层**（屏上是旧壁纸的像素，不是新层的底色）',
    pendingFrame.shown === oldLayer, frameLabel(pendingFrame));
  const frameProbe = t.imageEls.filter((i) => String(t.mediaSrc(i) || '').split('?')[0] === frameSrc).pop() || null;
  check('   前置：这一跳确实发了抓帧探针（垫底图的第 1 级，冷会话里没有字节在手）', !!frameProbe);
  if (frameProbe && typeof frameProbe.onload === 'function') frameProbe.onload();
  const shownFrame = observeFrame(t, '画面到位后');
  check('④ 画面到手 ⇒ 新层被放行，且**同一个元素**此刻已经有画面',
    shownFrame.shown === newLayer && shownFrame.showsPicture === true
      && layerShowsPicture(newLayer) === true, frameLabel(shownFrame));
  check('⑤ 结果型判据：这一跳的每一个可观测中间态里，参与绘制的那一层都有画面',
    noBlankFrameInSwitch([beforeFrame, pendingFrame, shownFrame]),
    [beforeFrame, pendingFrame, shownFrame].map(frameLabel).join(' | '));
  check('   负对照（同一条判据，喂"被绘制了但还没有画面"的合成态）：判不合格 —— 判据有牙',
    !noBlankFrameInSwitch([{ at: '合成态', shown: newLayer, showsPicture: false }]), '合成态被拒');
});
await runScenario('T2. 切层内容闸门：<video> 无帧 / 无 poster ⇒ 旧层留在屏上', {
  wallpapers: [
    { id:'t1', title:'T1', type:'video', playable:true, media:'/wallpaper-engine/media/t1',
      preview:'/wallpaper-engine/preview/t1', contentrating:'Everyone' },
    { id:'t2', title:'T2', type:'video', playable:true, media:'/wallpaper-engine/media/t2',
      preview:'/wallpaper-engine/preview/t2', contentrating:'Everyone' },
  ],
  selection: selSeed(['t1', 't2'], 't1'),
}, (t) => {
  const oldLayer = t.layerEl();
  const oldVideo = oldLayer && oldLayer.querySelector('video');
  if (oldVideo) oldVideo.readyState = 3;
  const beforeFrame = observeFrame(t, '切换前');
  check('前置：切换前屏上是旧层，且它有画面', beforeFrame.shown === oldLayer && beforeFrame.showsPicture,
    frameLabel(beforeFrame));
  t.fireLatest(10000);
  const probe = t.mediaEls[t.mediaEls.length - 1];
  const newLayer = t.layerEl();
  check('   前置：新层的 <video> 是现建的，既没有帧也没有 poster',
    !!probe && probe !== oldVideo && Number(probe.readyState || 0) < 2
      && !probe.getAttribute('poster'),
    'readyState=' + probe.readyState + ' poster=' + JSON.stringify(probe.getAttribute('poster')));
  const pendingFrame = observeFrame(t, '提交后（<video> 还没有帧）');
  check('① 无帧的 <video> 没有被显示：这一刻屏上还是旧层',
    pendingFrame.shown === oldLayer && !!newLayer
      && String(newLayer.className).includes(LAYER_PENDING_CLS),
    frameLabel(pendingFrame) + ' cls=' + (newLayer && newLayer.className));
  probe.readyState = 3;
  probe.__fire('canplay');
  const shownFrame = observeFrame(t, 'canplay 之后');
  check('② 有帧了才放行，且放行那一刻它已经有画面',
    shownFrame.shown === newLayer && shownFrame.showsPicture === true, frameLabel(shownFrame));
  check('③ 结果型判据（同一条函数）：每个中间态里参与绘制的那一层都有画面',
    noBlankFrameInSwitch([beforeFrame, pendingFrame, shownFrame]),
    [beforeFrame, pendingFrame, shownFrame].map(frameLabel).join(' | '));
});
await runScenario('T3. 正对照：内嵌 MP4（poster=静态帧）插入即上屏，不被闸门拦', {
  wallpapers: [wallpaperV, scene('s6', 'tok-s6')],
  selection: Object.assign(selSeed(['v', 's6'], 'v'), { sceneLive: false }),
}, (t) => {
  t.fireLatest(10000);
  const probe = t.mediaEls[t.mediaEls.length - 1];
  check('   前置：sceneVideo 探针带 poster（作者静态帧，真机上与 setAttribute 等价）',
    !!probe && String(probe.getAttribute('poster') || '').includes('/wallpaper-engine/scene-frame/s6'),
    'poster=' + (probe && probe.getAttribute('poster')));
  markVideoDecoded(probe);
  const newLayer = t.layerEl();
  check('① 新层立刻参与绘制（没有被 --pending 挡住）',
    !!newLayer && !String(newLayer.className).includes(LAYER_PENDING_CLS)
      && paintedLayerOf(t) === newLayer, 'cls=' + (newLayer && newLayer.className));
  check('② 且它插入时就已有画面（poster = 静态帧）', layerShowsPicture(newLayer) === true,
    frameLabel(observeFrame(t, '领养后')));
});
await runScenario('T4. 终点语义：抓帧与预览图都不存在 ⇒ 闸门放行，停在主题色兜底', {
  wallpapers: [wallpaperV, Object.assign(scene('s2', 'tok-s2'), { preview: null })],
  stats: { 'tok-s2': { fps: 0, running: true } },
  selection: selSeed(['v', 's2'], 'v'),
}, (t) => {
  const frameSrc = '/wallpaper-engine/scene-frame/s2';
  const oldLayer = t.layerEl();
  const oldVideo = oldLayer && oldLayer.querySelector('video');
  if (oldVideo) oldVideo.readyState = 3;
  t.fireLatest(10000);
  t.fireLatest(300);
  t.clock.offset = 16000;
  t.fireLatest(500);
  const probeBack = t.mediaEls[t.mediaEls.length - 1];
  if (probeBack) probeBack.__fire('canplay');
  const newLayer = t.layerEl();
  const pendingFrame = observeFrame(t, '提交后（抓帧探针在飞）');
  check('① 抓帧还没有结论之前守在旧层上',
    pendingFrame.shown === oldLayer && !!newLayer
      && String(newLayer.className).includes(LAYER_PENDING_CLS), frameLabel(pendingFrame));
  const probeFrame = t.imageEls.filter((i) => String(t.mediaSrc(i) || '').split('?')[0] === frameSrc).pop() || null;
  check('   前置：这一档只有抓帧一级（作者没有发布预览图 ⇒ 不猜图，见 P2）',
    !!probeFrame && !t.imageEls.some((i) => t.mediaSrc(i) === '/wallpaper-engine/preview/s2'),
    'frame=' + !!probeFrame + ' preview=' + t.imageEls.length);
  if (probeFrame && typeof probeFrame.onerror === 'function') probeFrame.onerror();
  const doneFrame = observeFrame(t, '抓帧判失败后');
  check('② 判失败 =「这一张壁纸没有画面」这个结论已确定 ⇒ 闸门放行（不会永远守着旧层）',
    doneFrame.shown === newLayer && !String(newLayer.className).includes(LAYER_PENDING_CLS),
    frameLabel(doneFrame));
  const poster = newLayer && newLayer.querySelector('div.we-live-poster');
  check('③ 此刻停在既有的第 0 级主题色兜底上（终点语义没变）',
    layerShowsPicture(newLayer) === false
      && !!poster && String(poster.style.backgroundColor || '').length > 0,
    'bg=' + (poster ? poster.style.backgroundColor : 'no poster'));
});
await runScenario('T5. 硬切（默认过场）：旧层留到新层有画面，之后一次性退场', {
  wallpapers: [wallpaperV, scene('s1', 'tok-s1')],
  stats: { 'tok-s1': { fps: 0, running: true } },
  selection: Object.assign(selSeed(['v', 's1'], 'v'), { switchTransition: 'cut' }),
}, (t) => {
  const frameSrc = '/wallpaper-engine/scene-frame/s1';
  const layersNow = () => t.bodyEl.children.filter((c) => String(c.className).includes('we-layer'));
  const oldLayer = t.layerEl();
  const oldVideo = oldLayer && oldLayer.querySelector('video');
  if (oldVideo) oldVideo.readyState = 3;
  const beforeFrame = observeFrame(t, '切换前');
  t.fireLatest(10000);
  t.fireLatest(300);
  t.clock.offset = 16000;
  t.fireLatest(500);
  const probeBack = t.mediaEls[t.mediaEls.length - 1];
  if (probeBack) probeBack.__fire('canplay');
  const newLayer = t.layerEl();
  const pendingFrame = observeFrame(t, '硬切提交后（垫底图还没图）');
  check('① 硬切也不许提前拆旧层：这一刻屏上仍是旧壁纸（两张层都在文档里）',
    pendingFrame.shown === oldLayer && layersNow().length === 2
      && String(newLayer.className).includes(LAYER_PENDING_CLS),
    frameLabel(pendingFrame) + ' layers=' + layersNow().length);
  check('② 这一刻新层还没有画面（闸门挡的就是它）', layerShowsPicture(newLayer) === false,
    'picture=' + layerShowsPicture(newLayer));
  const frameProbe = t.imageEls.filter((i) => String(t.mediaSrc(i) || '').split('?')[0] === frameSrc).pop() || null;
  if (frameProbe && typeof frameProbe.onload === 'function') frameProbe.onload();
  const shownFrame = observeFrame(t, '画面到位后');
  check('③ 画面到位 ⇒ 旧层一次性退场（硬切语义：body 里只剩新层），新层已经有画面',
    shownFrame.shown === newLayer && shownFrame.showsPicture === true
      && layersNow().length === 1 && layersNow()[0] === newLayer,
    frameLabel(shownFrame) + ' layers=' + layersNow().length);
  check('④ 结果型判据（同一条函数）：每个中间态里参与绘制的那一层都有画面',
    noBlankFrameInSwitch([beforeFrame, pendingFrame, shownFrame]),
    [beforeFrame, pendingFrame, shownFrame].map(frameLabel).join(' | '));
});
await runScenario('T6. 待显影期间切回原壁纸：空层被拆掉，守着的层回到 LAYER_ID', {
  wallpapers: [wallpaperV, scene('s1', 'tok-s1')],
  stats: { 'tok-s1': { fps: 0, running: true } },
  selection: selSeed(['v', 's1'], 'v'),
}, (t) => {
  const layersNow = () => t.bodyEl.children.filter((c) => String(c.className).includes('we-layer'));
  const original = t.layerEl();
  const oldVideo = original && original.querySelector('video');
  if (oldVideo) oldVideo.readyState = 3;
  t.fireLatest(10000);
  t.fireLatest(300);
  t.clock.offset = 16000;
  t.fireLatest(500);
  const probeBack = t.mediaEls[t.mediaEls.length - 1];
  if (probeBack) probeBack.__fire('canplay');
  const blank = t.layerEl();
  check('   前置：第一跳停在待显影上（新层在文档里但没画面，旧层还在屏上）',
    !!blank && blank !== original && String(blank.className).includes(LAYER_PENDING_CLS)
      && layersNow().length === 2, 'layers=' + layersNow().length);
  t.fireLatest(10000);
  const back = t.layerEl();
  check('① 屏上没离开过的那一层重新成为当前层（LAYER_ID 回到它手上）',
    back === original, 'same=' + (back === original));
  check('② 那个从未上屏的空层已被拆掉（不留重复的壁纸层）',
    layersNow().length === 1 && layersNow()[0] === original && !blank.isConnected,
    'layers=' + layersNow().length + ' blankConnected=' + blank.isConnected);
  check('③ 它不再被当作待退役的旧层（weFading 已清）', !original.dataset.weFading,
    'weFading=' + JSON.stringify(original.dataset.weFading));
  check('④ 落库回到 v，且它的媒体仍是原来那个元素（没有被重建过）',
    t.persistedId() === 'v' && back.querySelector('video') === oldVideo,
    'id=' + t.persistedId() + ' sameVideo=' + (back.querySelector('video') === oldVideo));
});
const imageWallpaper = (id) => ({ id, title: id.toUpperCase(), type: 'image', playable: true,
  media: '/wallpaper-engine/media/' + id, preview: '/wallpaper-engine/preview/' + id, contentrating: 'Everyone' });
await runScenario('T7. 切层内容闸门：20s 兜底领养的元素还没有像素 ⇒ 不得放行', {
  wallpapers: [wallpaperV, imageWallpaper('i1')],
  selection: selSeed(['v', 'i1'], 'v'),
}, (t) => {
  t.fireLatest(10000);
  const probe = t.imageEls[t.imageEls.length - 1];
  check('   前置：image 候选的探针在场，且 20s 兜底定时器已武装（"这一级解码 > 20s"那一档）',
    !!probe && t.mediaSrc(probe) === '/wallpaper-engine/media/i1'
      && t.timers.some((x) => !x.cleared && x.ms === 20000),
    'src=' + t.mediaSrc(probe || {}) + ' timers20s='
      + t.timers.filter((x) => !x.cleared && x.ms === 20000).length);
  t.fireLatest(20000);
  const newLayer = t.layerEl();
  const adopted = newLayer && newLayer.querySelector('img');
  const oldLayer = t.bodyEl.children
    .filter((c) => String(c.className).includes('we-layer') && c !== newLayer)[0] || null;
  check('① 领养的就是那个**从未加载成功**的探针元素（不是新建的）',
    !!adopted && adopted === probe, 'same=' + (adopted === probe));
  check('② 浏览器事实：它还没有像素（判据前提；`complete` 未翻真）',
    !!adopted && !imgHasPixels(adopted),
    'complete=' + (adopted && adopted.complete) + ' naturalWidth=' + (adopted && adopted.naturalWidth));
  check('③ 产品不得把"探针跑完了"标成"这个元素有画面"（__weReady 只许由就绪事件打）',
    !!adopted && adopted.__weReady !== true, '__weReady=' + (adopted && adopted.__weReady));
  check('④ 闸门因此**没有**放行：新层被挡在绘制之外，屏上仍是旧层的像素',
    layerIsPending(newLayer) && layerPainted(t, oldLayer) && !layerPainted(t, newLayer),
    'cls=' + (newLayer && newLayer.className) + ' paintedOld=' + layerPainted(t, oldLayer));
  adopted.__fireLoad();
  check('⑤ 像素到手 ⇒ 同一个元素此刻被放行（闸门看的是浏览器事实，不是"探测结束"）',
    layerPainted(t, newLayer) && !layerIsPending(newLayer),
    frameLabel(observeFrame(t, 'load 之后')) + ' paintedNew=' + layerPainted(t, newLayer));
});
await runScenario('T8. 正对照（同一条闸门判据）：准备期真的 load 过的元素必须放行', {
  wallpapers: [wallpaperV, imageWallpaper('i1')],
  selection: selSeed(['v', 'i1'], 'v'),
}, (t) => {
  t.fireLatest(10000);
  const probe = t.imageEls[t.imageEls.length - 1];
  if (probe) { probe.complete = true; probe.onload(); }
  const newLayer = t.layerEl();
  check('   前置：领养的就是那个已就绪的探针（元素级领养没被 URL 校验打回）',
    !!newLayer && newLayer.querySelector('img') === probe,
    'same=' + (!!newLayer && newLayer.querySelector('img') === probe));
  check('① 就绪档（__weReady 由 onload 打上）⇒ 新层立刻参与绘制，不被闸门拦',
    layerPainted(t, newLayer) && !layerIsPending(newLayer),
    frameLabel(observeFrame(t, '领养后')) + ' paintedNew=' + layerPainted(t, newLayer));
});
const liveIframeOf = (t) => {
  const layer = t.layerEl();
  return layer && layer.querySelector ? layer.querySelector('iframe.we-live-iframe') : null;
};
const pendingLiveIframe = (t) => t.iframeEls.filter((f) => t.mediaSrc(f).includes('/scene-live/')).pop() || null;
const bootDelaySel = (ids, cur, secs) => Object.assign(selSeed(ids, cur), { liveBootDelay: secs });
await runScenario('Q1. 启动等待：上限前首帧就绪 ⇒ 立刻挂载（不白等满上限）', {
  wallpapers: [scene('s1', 'tok-s1')],
  stats: { 'tok-s1': { fps: 0, running: true } },
  selection: bootDelaySel(['s1'], 's1', 3),
}, (t) => {
  const pending = pendingLiveIframe(t);
  check('延迟期：预热 iframe **已在加载**（src 非空）但未上屏',
    !!pending && t.mediaSrc(pending).includes('/scene-live/') && !pending.isConnected,
    'iframes=' + t.iframeEls.length + ' src=' + t.mediaSrc(pending || {}));
  check('延迟期：层里只有垫底图（未挂载 iframe）', !liveIframeOf(t));
  t.setStats('tok-s1', { fps: 30, running: true });
  t.fireLatest(300);
  check('① 首帧就绪 ⇒ **立刻挂载**（不用等满上限）', liveIframeOf(t) === pending,
    'inLayer=' + (liveIframeOf(t) === pending));
  check('   挂载时 src 仍是渲染页（预热成果没被丢弃）',
    t.mediaSrc(pending).includes('/scene-live/'), 'src=' + t.mediaSrc(pending));
});
await runScenario('Q2. 启动等待：到上限仍未出帧 ⇒ 也挂载（最坏情况与固定等待一致）', {
  wallpapers: [scene('s1', 'tok-s1')],
  stats: { 'tok-s1': { fps: 0, running: true } },
  selection: bootDelaySel(['s1'], 's1', 3),
}, (t) => {
  t.fireLatest(300);
  check('② 未就绪且未到上限 ⇒ 不挂载（判据有牙：不是无条件立刻挂）', !liveIframeOf(t));
  t.clock.offset += 3000;
  t.fireLatest(300);
  t.fireLatest(300);
  check('② 到上限仍未出帧 ⇒ 仍挂载（不让壁纸永远停在占位图）',
    liveIframeOf(t) === pendingLiveIframe(t));
});
await runScenario('Q3. 启动等待期切走：预热页被**终止**、零孤儿（卡顿的根因）', {
  wallpapers: [wallpaperV, scene('s1', 'tok-s1')],
  stats: { 'tok-s1': { fps: 0, running: true } },
  selection: bootDelaySel(['v', 's1'], 's1', 3),
}, (t) => {
  const pending = pendingLiveIframe(t);
  check('启动等待期：s1 的预热 iframe 已在加载但未上屏',
    !!pending && !pending.isConnected, 'src=' + t.mediaSrc(pending || {}));
  t.fireLatest(10000);
  t.fireLatest(300);
  t.flushPersist();
  check('切走后预热页被**终止**（src=about:blank ⇒ 中止在途加载并拆掉渲染页）',
    t.mediaSrc(pending) === 'about:blank', 'src=' + t.mediaSrc(pending));
  const orphansNow = t.iframeEls.filter((f) => !f.isConnected && t.mediaSrc(f) && t.mediaSrc(f) !== 'about:blank');
  check('切走那一刻零孤儿（没有「已脱离文档且仍在加载」的预热 iframe）', orphansNow.length === 0,
    'orphans=' + orphansNow.map((f) => t.mediaSrc(f).slice(0, 40)).join(' | '));
  t.clock.offset += 3000;
  for (let i = 0; i < 4; i++) t.fireLatest(300);
  check('到点也不得挂上已作废的预热页（当前壁纸是 v）',
    t.persistedId() === 'v' && !liveIframeOf(t), 'id=' + t.persistedId());
});
await runScenario('R1. 音量映射：默认 0 ⇒ 静音；0.6 ⇒ 0.6；总开关关 ⇒ 0', {
  wallpapers: [wallpaperV],
  selection: Object.assign(selSeed(['v'], 'v'), { videoVolume: 0, videoAudioEnabled: true }),
}, (t) => {
  const vol = () => { const v = t.mediaEls[t.mediaEls.length - 1]; return v ? Number(v.volume) : NaN; };
  check('默认音量 0（静音）⇒ 媒体音量就是 0', vol() === 0, 'volume=' + vol());
});
await runScenario('R1b. 音量映射（非默认值对照）：0.6 ⇒ 0.6', {
  wallpapers: [wallpaperV],
  selection: Object.assign(selSeed(['v'], 'v'), { videoVolume: 0.6, videoAudioEnabled: true }),
}, (t) => {
  const vol = () => { const v = t.mediaEls[t.mediaEls.length - 1]; return v ? Number(v.volume) : NaN; };
  check('音量 0.6 ⇒ 媒体音量 0.6（与默认那条不是同一个数）', vol() === 0.6, 'volume=' + vol());
});
await runScenario('R1c. 音量映射：总开关关 ⇒ 0（保留数值，关掉再开能恢复）', {
  wallpapers: [wallpaperV],
  selection: Object.assign(selSeed(['v'], 'v'), { videoVolume: 0.6, videoAudioEnabled: false }),
}, (t) => {
  const vol = () => { const v = t.mediaEls[t.mediaEls.length - 1]; return v ? Number(v.volume) : NaN; };
  check('总开关关闭 ⇒ 即使 volume 是 0.6 也静音', vol() === 0, 'volume=' + vol());
  check('关闭总开关不动 videoVolume（数值保留）', Number(t.persistedSel().videoVolume) === 0.6,
    'videoVolume=' + t.persistedSel().videoVolume);
});
await runScenario('R2. 轮播关闭（默认值）⇒ 不武装定时器、到点也不换壁纸', {
  wallpapers: [wallpaperV, scene('s1', 'tok-s1')],
  selection: Object.assign(selSeed(['v', 's1'], 'v'), { rotationEnabled: false }),
}, (t) => {
  check('关闭轮播 ⇒ 没有武装中的轮换定时器（10s 那个）',
    !t.timers.some((x) => !x.cleared && x.ms === 10000),
    'timers=' + t.timers.filter((x) => !x.cleared).map((x) => x.ms).join(','));
  t.fireLatest(10000);
  t.flushPersist();
  check('到点也不换壁纸（仍是 v）', t.persistedId() === 'v', 'id=' + t.persistedId());
});
await runScenario('R3. 轮播开着但没选列表 ⇒ 自愈到可用列表；无可用列表 ⇒ 关掉轮播', {
  wallpapers: [wallpaperV, scene('s1', 'tok-s1')],
  selection: Object.assign(selSeed(['v', 's1'], 'v'), { rotationGroupId: '' }),
}, (t) => {
  t.flushPersist();
  const sel = t.persistedSel();
  check('空 rotationGroupId ⇒ 自愈选中可用列表 g1（而不是静默不轮播）',
    sel.rotationGroupId === 'g1' && sel.rotationEnabled === true,
    'group=' + JSON.stringify(sel.rotationGroupId) + ' enabled=' + sel.rotationEnabled);
});
await runScenario('R3b. 轮播开着但列表全不可用 ⇒ 关掉轮播（不是留一个永远不动的开关）', {
  wallpapers: [wallpaperV],
  selection: Object.assign(selSeed([], 'v'), { rotationGroupId: '' }),
}, (t) => {
  t.flushPersist();
  const sel = t.persistedSel();
  check('无可用列表 ⇒ rotationEnabled 被关掉（开关状态与实际能力一致）',
    sel.rotationEnabled === false, 'enabled=' + sel.rotationEnabled);
});
await runScenario('R4. 失焦 + pauseOnBlur=true ⇒ 暂停；夺回焦点 ⇒ 恢复', {
  wallpapers: [wallpaperV],
  selection: Object.assign(selSeed(['v'], 'v'), { pauseOnBlur: true }),
}, (t) => {
  const vid = () => t.mediaEls[t.mediaEls.length - 1];
  check('焦点在时照常播放（前置：确实在播，否则下面的暂停测不出东西）',
    !!vid() && vid().__paused === false, 'paused=' + (vid() && vid().__paused));
  t.setFocus(false);
  t.fireWin('blur');
  check('失焦 + pauseOnBlur=true ⇒ 媒体被暂停（省电档真的生效）',
    !!vid() && vid().__paused === true, 'paused=' + (vid() && vid().__paused));
  t.setFocus(true);
  t.fireWin('focus');
  check('夺回焦点 ⇒ 自动恢复播放（不需要用户手动点）',
    !!vid() && vid().__paused === false, 'paused=' + (vid() && vid().__paused));
});
await runScenario('R4b. 默认 pauseOnBlur=false ⇒ 失焦**不**暂停（负对照：反向就是 R4）', {
  wallpapers: [wallpaperV],
  selection: selSeed(['v'], 'v'),
}, (t) => {
  const vid = () => t.mediaEls[t.mediaEls.length - 1];
  t.setFocus(false);
  t.fireWin('blur');
  check('失焦 + 默认 pauseOnBlur=false ⇒ 仍继续播放（开关关掉就不该被遮挡逻辑管）',
    !!vid() && vid().__paused === false, 'paused=' + (vid() && vid().__paused));
});
await runScenario('R5. 关掉实时渲染（sceneLive=false）⇒ 不挂 live iframe，改走内嵌 MP4', {
  wallpapers: [scene('s1', 'tok-s1')],
  selection: Object.assign(selSeed(['s1'], 's1'), { sceneLive: false }),
}, (t) => {
  const layer = t.layerEl();
  check('关掉实时渲染 ⇒ 层里**没有** live iframe（不会偷偷还在渲染）',
    !!layer && !layer.querySelector('iframe.we-live-iframe'),
    layer ? 'hasLive=' + !!layer.querySelector('iframe.we-live-iframe') : 'no layer');
  check('改走内嵌 MP4 那条路（挂了 <video>，不再建渲染页）',
    t.mediaEls.length >= 1 && t.iframeEls.filter((f) => String(f.src).includes('/scene-live/')).length === 0,
    'videos=' + t.mediaEls.length + ' liveIframes=' + t.iframeEls.length);
});
await runScenario('R6. 倍速：非默认值 1.5 真的落到 <video> 上', {
  wallpapers: [wallpaperV],
  selection: Object.assign(selSeed(['v'], 'v'), { playbackRate: 1.5 }),
}, (t) => {
  const vid = () => t.mediaEls[t.mediaEls.length - 1];
  check('playbackRate 1.5 ⇒ 视频元素 playbackRate=1.5（原生倍速，不是重载）',
    !!vid() && Number(vid().playbackRate) === 1.5,
    'playbackRate=' + (vid() && vid().playbackRate));
});
const videoOf = (id, scheme) => Object.assign({}, wallpaperV, {
  id, title: id.toUpperCase(), media: '/wallpaper-engine/media/' + id,
  preview: '/wallpaper-engine/preview/' + id, schemeColor: scheme,
});
const themeWriteLandsOnLayer = (snap, wantWid, wantSrcPart) =>
  !!snap && !!snap.layer && String(snap.wid) === String(wantWid)
  && !!snap.media && String(snap.src).includes(wantSrcPart);
const mediaLayerSurvives = (snap, layer, video) =>
  !!snap && !!layer && snap.layer === layer && snap.video === video;
const videoSrcSets = (v) => (v && v.__srcSets) || 0;
await runScenario('S1. 主题随壁纸：判决落在媒体层建好之后（不横跨建层边界）', {
  wallpapers: [videoOf('d0', 'rgb(6, 6, 8)'), videoOf('l1', 'rgb(250, 250, 250)')],
  selection: Object.assign(selSeed(['d0', 'l1'], 'd0'), { themeFollow: true }),
  theme: true, themePreference: 'dark',
}, (t) => {
  const darkMedia = '/wallpaper-engine/media/d0';
  const lightMedia = '/wallpaper-engine/media/l1';
  const before = t.themeSnap('d0');
  check('前置：启动即选中暗色壁纸、层与 <video> 在位（判据的分辨力前提）',
    !!before.layer && before.wid === 'd0' && !!before.video && before.src === darkMedia,
    'wid=' + before.wid + ' src=' + before.src);
  check('前置：这一次启动没有写主题（判决与当前偏好同侧 ⇒ 不写）',
    t.themeCalls.length === 0, 'calls=' + t.themeCalls.length);
  t.fireLatest(10000);
  check('① 这一跳真的写了主题（否则下面的判据空转）',
    t.themeCalls.length === 1 && t.themeCalls[0].id === 'light',
    'calls=' + t.themeCalls.length + ' → ' + t.themeCalls.map((c) => c.id).join(','));
  const snap = t.themeCalls[0] || null;
  check('② 写入那一刻屏上已经是**新壁纸**的层（不是被换掉的那一层）',
    !!snap && String(snap.wid) === 'l1', 'wid=' + (snap && snap.wid) + ' want=l1');
  check('③ 写入那一刻新层的媒体节点已经在位、src 已是新壁纸的媒体',
    themeWriteLandsOnLayer(snap, 'l1', lightMedia), 'src=' + (snap && snap.src));
  check('   负对照（同一条判据，喂换壁纸之前的快照）：那一层判不合格 —— 判据分得清两跳',
    !themeWriteLandsOnLayer(before, 'l1', lightMedia), 'wid=' + before.wid);
  const finalLayer = t.layerEl();
  const finalVideo = finalLayer && finalLayer.querySelector('video');
  check('④ 视频侧：写入那一刻的 <video> 就是切换后层里的那个元素（节点身份不变）',
    !!snap && !!snap.video && snap.video === finalVideo,
    'same=' + (!!snap && snap.video === finalVideo));
  check('⑤ 主题写入不得让 <video> 重载：写入那一刻与切换后仍是同一份资源（src 只赋过一次）',
    !!snap && !!snap.video && videoSrcSets(finalVideo) === 1
      && videoSrcSets(snap.video) === videoSrcSets(finalVideo)
      && (finalVideo.__loads || 0) === (snap.video.__loads || 0),
    'srcSets=' + videoSrcSets(snap && snap.video) + '→' + videoSrcSets(finalVideo)
      + ' loads=' + (snap && snap.video && snap.video.__loads) + '→' + (finalVideo && finalVideo.__loads));
  check('   负对照（同一条判据，换 src）：把期望换成那一层里没有的媒体 ⇒ 判不合格',
    !themeWriteLandsOnLayer(snap, 'l1', '/wallpaper-engine/media/nope'), 'src=' + (snap && snap.src));
  const priorVideo = before.video;
  const beforeLayerGone = !!before.layer && before.layer !== finalLayer;
  const beforeVideoGone = !!before.video && before.video !== finalVideo;
  check('   负对照（同一条判据，喂换壁纸之前的真实快照）：层已重建 ⇒ 判不合格 —— 判据分得清节点身份',
    beforeLayerGone && beforeVideoGone && !!priorVideo
      && !mediaLayerSurvives(before, finalLayer, priorVideo),
    'layerBefore!==layerAfter: ' + beforeLayerGone + ' videoBefore!==videoAfter: ' + beforeVideoGone
      + ' ⇐ 判据喂真快照仍判不合格');
});
await runScenario('S2. 纯主题切换不重建媒体层：节点身份同一个 + 不新发媒体请求', {
  wallpapers: [videoOf('p0', null)],
  selection: Object.assign(selSeed(['p0'], 'p0'), { themeFollow: true }),
  theme: true, themePreference: 'dark',
}, (t) => {
  check('前置：启动后主题服务没有被写入过（这一跳的主题切换来自外部）',
    t.themeCalls.length === 0, 'calls=' + t.themeCalls.length);
  const layerBefore = t.layerEl();
  const videoBefore = layerBefore && layerBefore.querySelector('video');
  const imagesBefore = t.imageEls.length, mediaBefore = t.mediaEls.length;
  const loadsBefore = videoBefore ? videoBefore.__loads : -1;
  t.themeService.setTheme('light');
  const layerAfter = t.layerEl();
  const videoAfter = layerAfter && layerAfter.querySelector('video');
  check('① 媒体层节点是同一个（节点身份不变，没有重建）',
    !!layerBefore && layerAfter === layerBefore,
    'same=' + (layerAfter === layerBefore));
  check('② <video> 是同一个元素（换主题不该让播放进度归零）',
    !!videoBefore && videoAfter === videoBefore, 'same=' + (videoAfter === videoBefore));
  check('③ 主题切换不得新发媒体请求（帧探针 / 视频元素都没新增）',
    t.imageEls.length === imagesBefore && t.mediaEls.length === mediaBefore,
    'images=' + imagesBefore + '→' + t.imageEls.length + ' videos=' + mediaBefore + '→' + t.mediaEls.length);
  check('④ 主题切换不得让 <video> 重载：src 没被重赋、也没有额外 load()',
    videoSrcSets(videoBefore) === 1 && videoBefore.__loads === loadsBefore
      && videoSrcSets(t.themeCalls[0] && t.themeCalls[0].video) === 1,
    'srcSets=' + videoSrcSets(videoBefore) + ' loads=' + loadsBefore + '→' + (videoBefore && videoBefore.__loads));
  const priorSnap = t.themeCalls[0] || null;
  check('   （共享判据的正判据）写入那一刻与切换之后是同一个层、同一个 <video>',
    mediaLayerSurvives(priorSnap, layerAfter, videoAfter),
    'layer=' + (priorSnap && priorSnap.layer === layerAfter)
      + ' video=' + (priorSnap && priorSnap.video === videoAfter));
});
console.log('');
console.log(failures === 0 ? 'ROTATION PREPARED-LEAK SMOKE PASSED' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
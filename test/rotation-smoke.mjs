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
const React = { Fragment:'Fragment', useState:(i)=>[i,()=>{}], useEffect:()=>{}, useRef:(v)=>({current:v}),
  createElement:(t,p,...c)=>{ assertChildren(c); return typeof t==='function'?t(p||{}):({type:t,props:p||null,children:c}); } };
const byId = {};
const timers = [];
const mediaEls = [];
const audioEls = [];
function makeEl(tag) {
  const listeners = {};
  return {
    tagName: tag.toUpperCase(), children: [], dataset: {}, attributes: {},
    style: { _props:{}, cssText:'', setProperty(k,v){this._props[k]=v;}, removeProperty(k){delete this._props[k];} },
    className: '',
    appendChild(c){ this.children.push(c); if (c.id) byId[c.id]=c; c._parent=this; return c; },
    remove(){ if (this._parent){ const i=this._parent.children.indexOf(this); if(i>=0)this._parent.children.splice(i,1); this._parent = undefined; } },
    setAttribute(k,v){ this.attributes[k]=v; },
    removeAttribute(k){ delete this.attributes[k]; (this.__removedAttrs ||= []).push(k); },
    getAttribute(k){ return this.attributes[k] ?? null; },
    hasAttribute(k){ return k in this.attributes; },
    querySelector(sel){
      const want = sel === 'video' ? 'VIDEO' : sel.includes('canvas') ? 'CANVAS' : null;
      const walk=(n)=>{ if (!Array.isArray(n.children)) return null; for (const c of n.children){ if (c.tagName===want) return c; const r=walk(c); if(r)return r; } return null; };
      return walk(this);
    },
    contains(n){ let cur=n; while(cur){ if(cur===this)return true; cur=cur._parent; } return false; },
    querySelectorAll(sel){
      const want = String(sel).split(',').map(x=>x.trim().toUpperCase());
      const out=[]; const walk=(n)=>{ if (!Array.isArray(n.children)) return; for (const c of n.children){ if (want.includes(c.tagName)) out.push(c); walk(c); } }; walk(this); return out;
    },
    get isConnected(){ let cur=this; while (cur) { if (!cur._parent) return cur.tagName === 'BODY'; cur = cur._parent; } return false; },
    addEventListener(ev,fn){ (listeners[ev] ||= []).push(fn); },
    removeEventListener(ev,fn){ const l=listeners[ev]; if(l){const i=l.indexOf(fn); if(i>=0)l.splice(i,1);} },
    __fire(ev){ (listeners[ev]||[]).slice().forEach(f=>f()); if (ev==='load'&&this.onload) this.onload(); if(ev==='error'&&this.onerror)this.onerror(); },
    get paused(){ return this.__paused !== false; },
    set paused(v){ this.__paused = !!v; },
    play(){ this.__plays = (this.__plays || 0) + 1; this.__paused = false; return Promise.resolve(); },
    pause(){ this.__paused = true; },
    load(){ this.__loads = (this.__loads || 0) + 1; },
  };
}
const bodyEl = makeEl('body');
const document = {
  createElement: (t) => {
    const el = makeEl(t);
    if (t==='video') mediaEls.push(el);
    if (t==='audio') audioEls.push(el);
    return el;
  },
  getElementById: (id) => { const el = byId[id]; return el && el.isConnected ? el : null; },
  querySelector: () => null,
  head: { appendChild: () => {} },
  body: bodyEl,
  hidden: false,
  hasFocus: () => true,
  addEventListener(){},
  removeEventListener(){},
  documentElement: makeEl('html'),
};
const imageEls = [];
class ImageMock { constructor(){ this.tagName='IMG'; imageEls.push(this); } }
const localStorage = {
  _store: { 'dsh-wallpaper-engine:selection': JSON.stringify({
    id:'a', rotationGroupId:'g1', rotationEnabled:true,
    switchTransition: 'fade',
    videoVolume: 0.6, videoAudioEnabled: true,
    rotationGroups:[{id:'g1',name:'L',interval:5,order:'sequence',wallpaperIds:['a','b','c']}],
  }), weRotationTestSec: '10' },
  getItem(k){ return this._store[k] ?? null; }, setItem(k,v){ this._store[k]=v; }, removeItem(k){ delete this._store[k]; },
};
const fetch = (url) => Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve(
  String(url).includes('/settings') ? { ok:true, betterSidebar:false } :
  String(url).includes('/media-info') ? { info:null } :
  { installDir:'D:/we', total:2, portableCount:2, playlists:[], wallpapers:[
    { id:'a', title:'A', type:'video', playable:true, media:'/wallpaper-engine/media/aaa', preview:'/wallpaper-engine/preview/aaa', contentrating:'Everyone' },
    { id:'b', title:'B', type:'video', playable:true, media:'/wallpaper-engine/media/bbb', preview:'/wallpaper-engine/preview/bbb', contentrating:'Everyone' },
    { id:'c', title:'C', type:'scene', playable:false, media:null, frameUrl:'/wallpaper-engine/scene-frame/ccc',
      sceneAudio:'/wallpaper-engine/scene-audio/ccc', preview:'/wallpaper-engine/preview/ccc', contentrating:'Everyone' },
  ] }) });
const code = readFileSync(new URL('../lib/client.js', import.meta.url),'utf8');
const FADE_GRACE_MS = Number(code.match(/ROTATION_FADE_MS = (\d+)/)[1]) + 100;
const cap = { handoff:null };
const sandbox = {
  window: {
    __ModuleLoader__: { load:(h)=>{ cap.handoff=h; } },
    setTimeout:(fn,ms)=>{ const t={fn,ms,cleared:false}; timers.push(t); return t; },
    clearTimeout:(t)=>{ if(t)t.cleared=true; },
    addEventListener(){}, innerWidth:1920, innerHeight:1080, devicePixelRatio:1,
  },
  document, localStorage, fetch, React, Image: ImageMock,
  setTimeout:(fn,ms)=>{ const t={fn,ms,cleared:false}; timers.push(t); return t; },
  clearTimeout:(t)=>{ if(t)t.cleared=true; },
};
vm.createContext(sandbox);
new vm.Script(code,{filename:'client.js'}).runInContext(sandbox);
const exportsObj = cap.handoff.factory((spec)=> spec==='react'?React:{createPortal:(n)=>n});
const effects = [];
exportsObj.apply({ slots:{inject:(k,cb)=>cb(),register:()=>{}}, effect(fn){ effects.push(fn); fn(); return fn; } });
const fire = (t) => { if (t && !t.cleared) { t.cleared = true; t.fn(); } };
let failures = 0;
const check = (label, cond, detail = '') => {
  if (cond) console.log('  ✓ ' + label + (detail ? ' — ' + detail : ''));
  else { failures++; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
};
const persistedId = () => JSON.parse(localStorage._store['dsh-wallpaper-engine:selection']).id;
setTimeout(async () => {
  await Promise.resolve();
  const rot = timers.find(t=>!t.cleared && t.ms===10000);
  check('轮换定时器已武装（5 分钟组间隔 → 测试钩子 10s）', !!rot);
  if (!rot) { console.log('\n' + failures + ' CHECK(S) FAILED'); process.exit(1); }
  const oldProbe = mediaEls[mediaEls.length-1];
  try { fire(rot); } catch(e){ console.log('EXCEPTION on rotation fire:', e && e.stack || e); process.exit(1); }
  const probe = mediaEls[mediaEls.length-1];
  check('视频目标不预热：层内 video 未被 load() 过（无探测元素）',
    (probe.__loads || 0) === 0, 'loads=' + probe.__loads + ' count=' + mediaEls.length);
  check('层内 video 指向新壁纸且不带 preview 海报（选中即播）',
    String(probe.attributes.src || probe.src).includes('/wallpaper-engine/media/bbb') && !probe.poster,
    'src=' + (probe.attributes.src || probe.src) + ' poster=' + probe.poster);
  probe.readyState = 3;
  try { probe.__fire('canplay'); } catch(e){ console.log('EXCEPTION on canplay 1:', e && e.stack || e); failures++; }
  const layer = byId['dsh-wallpaper-engine-layer'];
  check('提交后新层带过场类（交叉淡化）', !!layer && String(layer.className).includes('we-layer--switch'),
    layer ? String(layer.className) : 'no layer');
  check('新层里的 video 就是刚建的那个元素',
    !!layer && layer.querySelector('video') === probe);
  check('提交后新层音源被压到 0（闸内静音）',
    probe.volume === 0 && probe.muted === true, 'volume=' + probe.volume + ' muted=' + probe.muted);
  check('旧层（正在淡出）仍在出声，未被闸波及', oldProbe.volume === 0.6 && oldProbe.muted === false,
    'volume=' + oldProbe.volume + ' muted=' + oldProbe.muted);
  check('层内 video 未被误释放（保留 src / 未额外 load）',
    String(probe.attributes.src || probe.src).includes('/wallpaper-engine/media/bbb')
      && (probe.__loads || 0) === 0
      && !(probe.__removedAttrs || []).includes('src'),
    'loads=' + probe.__loads);
  check('没有「已脱离文档且仍在播」的 video（无孤儿）',
    mediaEls.filter((v) => !v.isConnected && !v.__paused).length === 0);
  timers.filter(t=>!t.cleared && t.ms===200).forEach(fire);
  check('提交已持久化到下一张（b）', persistedId() === 'b', 'id=' + persistedId());
  check('提交后重新武装轮换定时器', timers.some(t=>!t.cleared && t.ms===10000));
  const fade = timers.find(t=>!t.cleared && t.ms===FADE_GRACE_MS);
  check('渐变退役定时器已武装（ROTATION_FADE_MS + 100ms）', !!fade);
  if (fade) {
    fire(fade);
    const layersLeft = bodyEl.children.filter((c) => String(c.className).includes('we-layer'));
    check('旧层已退场（body 里只剩新层）', layersLeft.length === 1 && layersLeft[0] === layer,
      'layers=' + layersLeft.length + ' oldConnected=' + oldProbe.isConnected);
    check('旧层退场后新层音量恢复为设置值 0.6',
      probe.volume === 0.6 && probe.muted === false, 'volume=' + probe.volume + ' muted=' + probe.muted);
  }
  const rot2 = timers.find(t=>!t.cleared && t.ms===10000);
  fire(rot2);
  const t20 = timers.find(t=>!t.cleared && t.ms===20000);
  check('场景准备超时定时器已武装（20s）', !!t20);
  const bgmBefore = audioEls.length;
  try { fire(t20); } catch(e){ console.log('EXCEPTION on prep timeout:', e && e.stack || e); failures++; }
  const layer2 = byId['dsh-wallpaper-engine-layer'];
  check('超时兜底提交到场景 c（静态帧层）',
    !!layer2 && String(layer2.dataset.weKey).includes('scene-frame/ccc'),
    layer2 ? String(layer2.dataset.weKey) : 'no layer');
  const bgmMid = audioEls.length > bgmBefore ? audioEls[audioEls.length-1] : null;
  check('渐变期间确实创建了场景 BGM 元素',
    bgmMid !== null, bgmMid ? 'audio el @' + (audioEls.length-1) : 'no audio el');
  check('渐变期间场景 BGM 未出声（音量 0 / 未播放）',
    bgmMid !== null && bgmMid.volume === 0 && bgmMid.muted === true && bgmMid.__paused !== false,
    bgmMid ? ('volume=' + bgmMid.volume + ' muted=' + bgmMid.muted + ' paused=' + bgmMid.__paused) : 'no audio el');
  const fade2 = timers.find(t=>!t.cleared && t.ms===FADE_GRACE_MS);
  check('场景提交后渐变退役定时器已武装', !!fade2);
  if (fade2) {
    fire(fade2);
    const bgm = audioEls[audioEls.length-1];
    check('旧层退场后场景 BGM 才起播（音量恢复 + play 调用）',
      !!bgm && bgm.volume === 0.6 && bgm.muted === false && (bgm.__plays || 0) > 0,
      bgm ? ('volume=' + bgm.volume + ' muted=' + bgm.muted + ' plays=' + bgm.__plays) : 'no audio el');
  }
  timers.filter(t=>!t.cleared && t.ms===200).forEach(fire);
  check('第二轮提交持久化到 c', persistedId() === 'c', 'id=' + persistedId());
  const rot3 = timers.find(t=>!t.cleared && t.ms===10000);
  check('第二轮提交后重新武装轮换定时器', !!rot3);
  if (rot3) {
    fire(rot3);
    const probe3 = mediaEls[mediaEls.length-1];
    try { probe3.__fire('canplay'); } catch(e){ console.log('EXCEPTION on canplay 3:', e && e.stack || e); failures++; }
    const layer3 = byId['dsh-wallpaper-engine-layer'];
    check('第三轮提交领养了准备好的 video（回到 a）',
      !!layer3 && layer3.querySelector('video') === probe3);
    check('场景 → 视频：新层同样先静音',
      probe3.volume === 0 && probe3.muted === true, 'volume=' + probe3.volume + ' muted=' + probe3.muted);
    const fade3 = timers.find(t=>!t.cleared && t.ms===FADE_GRACE_MS);
    if (fade3) {
      fire(fade3);
      check('旧层退场后视频音量恢复 0.6',
        probe3.volume === 0.6 && probe3.muted === false, 'volume=' + probe3.volume + ' muted=' + probe3.muted);
    }
    timers.filter(t=>!t.cleared && t.ms===200).forEach(fire);
    check('第三轮回绕持久化到 a', persistedId() === 'a', 'id=' + persistedId());
  }
  console.log('');
  console.log(failures === 0 ? 'SMOKE PASSED' : failures + ' CHECK(S) FAILED');
  process.exit(failures === 0 ? 0 : 1);
}, 50);
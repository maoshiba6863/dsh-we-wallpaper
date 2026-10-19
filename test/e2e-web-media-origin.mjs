import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { styleText, cssBodyOf, panelText } from './tools/src-scope.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEST_ROOT = join(root, '.test-cache', 'e2e-media-origin');
const STEAM_ROOT = join(TEST_ROOT, 'steamlib');
process.env.DSH_WE_STEAM_ROOT = STEAM_ROOT;
process.env.DSH_WE_CACHE_DIR = join(TEST_ROOT, 'cache');
process.env.DSH_WE_UPLOAD_DIR = join(TEST_ROOT, 'uploads');
const DIAG_FILE = join(process.env.HOME || '', '.dsh-wallpaper-engine', 'diag', 'http.jsonl');
const DEBUG = process.env.E2E_DEBUG === '1';
const MARKER = 'E2E-WEB-' + process.pid;
process.env.DSH_WE_MEDIA_PROVIDER = 'mock';
process.env.DSH_WE_MEDIA_NO_AUDIO = '1';
let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) passed++; else failed++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? ' — ' + detail : ''));
}
const webDir = join(STEAM_ROOT, 'steamapps', 'workshop', 'content', '431960', '990101');
rmSync(TEST_ROOT, { recursive: true, force: true });
mkdirSync(webDir, { recursive: true });
mkdirSync(join(STEAM_ROOT, 'steamapps', 'common', 'wallpaper_engine'), { recursive: true });
writeFileSync(join(webDir, 'project.json'), JSON.stringify({
  title: 'E2E Web Wallpaper',
  type: 'web',
  file: 'index.html',
  preview: 'preview.jpg',
  contentrating: 'Everyone',
  general: { properties: { color0: { order: 0, type: 'color', value: '0.2 0.7 0.4' } } },
}));
writeFileSync(join(webDir, 'preview.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
const routes = [];
const ctx = {
  webServer: {
    register(route) { routes.push(route); return () => { const i = routes.indexOf(route); if (i >= 0) routes.splice(i, 1); }; },
    tapIndex() { return () => {}; },
  },
};
const hostMod = await import(pathToFileURL(join(root, 'lib', 'index.js')).href);
const host = hostMod.default || hostMod;
const { MEDIA_BRIDGE_TAG } = await import(pathToFileURL(join(root, 'lib', 'media', 'provision.js')).href);
const WANT_BRIDGE_VERSION = MEDIA_BRIDGE_TAG.replace(/^v/, '');
const dispose = (host.apply || host.inject)(ctx);
const matchRoute = (pathname) => routes.find((r) => (
  r.kind === 'exact' ? r.path === pathname : (pathname === r.path || pathname.startsWith(r.path + '/'))
));
let wrapperHtml = '';
let pluginCss = '';
let cssError = '';
try {
  pluginCss = cssBodyOf(styleText());
} catch (err) {
  cssError = err instanceof Error ? err.message : String(err);
}
check('样式族取文：能拼出插件 CSS 且含布局断言用的选择器',
  pluginCss.includes('.we-picker__current'),
  cssError || (pluginCss.length + ' 字符'
    + (pluginCss.includes('.we-picker__current') ? '，含 .we-picker__current' : '，**不含** .we-picker__current')));
const appServer = createServer((req, res) => {
  const pathname = new URL(req.url || '/', 'http://x').pathname;
  if (DEBUG) console.log(`[host] ${req.method} ${pathname}${req.url.indexOf('?') >= 0 ? '?…' : ''}`);
  if (pathname === '/e2e/host.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(wrapperHtml || '<!doctype html><title>no recipe</title>');
    return;
  }
  if (pathname === '/e2e/base.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(baseWrapperHtml || '<!doctype html><title>no base recipe</title>');
    return;
  }
  const route = matchRoute(pathname);
  if (!route) { res.statusCode = 404; res.end('no route'); return; }
  Promise.resolve(route.handler(req, res)).catch(() => { try { res.statusCode = 500; res.end('handler error'); } catch {   } });
});
await new Promise((r) => { appServer.listen(0, '127.0.0.1', r); });
const appPort = appServer.address().port;
const APP = `http://127.0.0.1:${appPort}`;
console.log(`迷你 host 监听 ${APP}（${routes.length} 条路由）`);
const baseDir = join(STEAM_ROOT, 'steamapps', 'workshop', 'content', '431960', '990102');
mkdirSync(join(baseDir, 'static'), { recursive: true });
writeFileSync(join(baseDir, 'project.json'), JSON.stringify({
  title: 'E2E Base Tag Wallpaper',
  type: 'web',
  file: 'index.html',
  preview: 'preview.jpg',
  contentrating: 'Everyone',
}));
writeFileSync(join(baseDir, 'preview.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
writeFileSync(join(baseDir, 'index.html'), [
  '<!doctype html><html lang="en"><head><meta charset="utf-8">',
  '<base href="./">',
  '<title>base</title>',
  '<script defer="defer" src="./static/app.js"></script>',
  '</head><body><div id="root"></div></body></html>',
].join('\n'));
writeFileSync(join(baseDir, 'static', 'app.js'), [
  'document.body.style.background = "#0b2b1a";',
  'document.getElementById("root").textContent = "APP JS RAN";',
  'var i = new Image();',
  `i.src = ${JSON.stringify(APP)} + '/wallpaper-engine/diag?msg=' + encodeURIComponent(`,
  `  ${JSON.stringify(MARKER + ' BASEFIX ran=1 base=')} + document.baseURI +`,
  `  ${JSON.stringify(' href=')} + String(location.href).slice(0, 40));`,
  'var n = 0; (function loop(){ n++; document.title = "frames " + n; requestAnimationFrame(loop); })();',
].join('\n'));
const FPS_METRIC_JS = [
  '  function pct(a, q) {',
  '    if (!a.length) return 0;',
  '    var c = a.slice().sort(function (x, y) { return x - y; });',
  '    return Math.round(c[Math.min(c.length - 1, Math.floor(c.length * q))]);',
  '  }',
  '  function nSlow(a) {',
  '    var p = pct(a, 0.5), c = 0;',
  '    for (var i = 0; i < a.length; i++) if (a[i] - p > 25) c++;',
  '    return c;',
  '  }',
  '  function maxOf(a) {',
  '    var m = 0;',
  '    for (var i = 0; i < a.length; i++) if (a[i] > m) m = a[i];',
  '    return Math.round(m);',
  '  }',
].join('\n');
writeFileSync(join(webDir, 'index.html'), [
  '<!doctype html><html><head><meta charset="utf-8"><title>e2e</title>',
  '<style>html,body{margin:0;background:#123}</style></head><body>',
  '<script>',
  '  window.__e2e = { propsCalls: 0, fps: null, vol: null, keys: [], frames: 0,',
  '                  mediaTitle: "", mediaThumb: "", mediaImg: "none", mediaState: null,',
  '                  mediaAA: "", mtlPos: null, mtlDur: null, ls: "?" };',
  '  try { window.localStorage.setItem("e2e", "1"); window.__e2e.ls = "ok:" + window.localStorage.getItem("e2e"); }',
  '  catch (e) { window.__e2e.ls = "throw:" + (e && e.name); }',
  '  if (window.wallpaperRegisterMediaPropertiesListener) {',
  '    window.wallpaperRegisterMediaPropertiesListener(function (e) {',
  '      window.__e2e.mediaTitle = ((e && e.title) || "").replace(/\\s+/g, "_");',
  '      window.__e2e.mediaAA = ((e && e.albumArtist) || "").replace(/\\s+/g, "_");',
  '    });',
  '  }',
  '  if (window.wallpaperRegisterMediaThumbnailListener) {',
  '    window.wallpaperRegisterMediaThumbnailListener(function (e) {',
  '      var t = (e && e.thumbnail) || "";',
  '      window.__e2e.mediaThumb = t;',
  '      if (!t) { window.__e2e.mediaImg = "none"; return; }',
  '      window.__e2e.mediaImg = "loading";',
  '      var im = new Image();',
  '      im.onload = function () { window.__e2e.mediaImg = "ok:" + im.naturalWidth + "x" + im.naturalHeight; };',
  '      im.onerror = function () { window.__e2e.mediaImg = "err"; };',
  '      im.src = t;',
  '    });',
  '  }',
  '  if (window.wallpaperRegisterMediaPlaybackListener) {',
  '    window.wallpaperRegisterMediaPlaybackListener(function (e) {',
  '      window.__e2e.mediaState = e && e.state;',
  '    });',
  '  }',
  '  if (window.wallpaperRegisterMediaTimelineListener) {',
  '    window.wallpaperRegisterMediaTimelineListener(function (e) {',
  '      window.__e2e.mtlPos = Math.round(((e && e.position) || 0) * 10) / 10;',
  '      window.__e2e.mtlDur = Math.round(((e && e.duration) || 0) * 10) / 10;',
  '    });',
  '  }',
  '  window.wallpaperPropertyListener = {',
  '    applyUserProperties: function (p) {',
  '      window.__e2e.propsCalls++;',
  '      window.__e2e.keys = Object.keys(p || {});',
  '      if (p && p.color0) window.__e2e.color0 = String(p.color0.value).replace(/\\s+/g, "_");',
  '    },',
  '    applyGeneralProperties: function (p) {',
  '      if (p && typeof p.fps === "number") window.__e2e.fps = p.fps;',
  '      if (p && typeof p.volume === "number") window.__e2e.vol = p.volume;',
  '    },',
  '  };',
  '  window.__e2e.iv = [];',
  '  (function loop() {',
  '    var t = performance.now();',
  '    var iv = window.__e2e.iv;',
  '    if (window.__e2e.last) { iv.push(t - window.__e2e.last); if (iv.length > 60) iv.shift(); }',
  '    window.__e2e.last = t;',
  '    window.__e2e.frames++;',
  '    requestAnimationFrame(loop);',
  '  })();',
  FPS_METRIC_JS,
  '  function beacon(tag) {',
  '    var e = window.__e2e;',
  '    var img = new Image();',
  `    img.src = "${APP}/wallpaper-engine/diag?msg=" + encodeURIComponent(`,
  `      "${MARKER} " + tag`,
  '      + " ran=1 shim=" + (typeof window.__weSeedProps === "function" ? 1 : 0)',
  '      + " propsCalls=" + e.propsCalls + " fps=" + e.fps + " vol=" + e.vol',
  '      + " frames=" + e.frames + " keys=" + e.keys.join(",")',
  '      + " p50=" + pct(e.iv, 0.5) + " p95=" + pct(e.iv, 0.95) + " n=" + e.iv.length',
  '      + " nSlow=" + nSlow(e.iv) + " max=" + maxOf(e.iv)',
  '      + " media=" + e.mediaTitle + " thumb=" + e.mediaThumb.length',
  '      + " aa=" + e.mediaAA + " mtl=" + e.mtlPos + "," + e.mtlDur',
  '      + " img=" + e.mediaImg + " mstate=" + e.mediaState',
  '      + " ls=" + e.ls',
  '      + " prop0=" + (e.color0 || ""));',
  '  }',
  '  window.addEventListener("load", function () {',
  '    setTimeout(function () { beacon("load"); }, 900);',
  '    setTimeout(function () { beacon("late"); }, 3200);',
  '    setTimeout(function () { beacon("media"); }, 6500);',
  '  });',
  '</script></body></html>',
].join('\n'));
const invRes = await fetch(`${APP}/wallpaper-engine/inventory`, {
  cache: 'no-store',
  headers: { 'x-dsh-desktop-renderer': '1' },
});
const inv = await invRes.json();
const web = (inv.wallpapers || []).find((w) => w.id === '990101') || null;
check('inventory 列出网页壁纸且 webLiveSrc 是绝对 URL',
  Boolean(web && web.webLive === true && /^http:\/\/127\.0\.0\.1:\d+\//.test(String(web.webLiveSrc || ''))),
  web ? String(web.webLiveSrc || '').slice(0, 60) : 'not found');
if (!web) { try { if (dispose) dispose(); } catch {   } appServer.close(); process.exit(1); }
const rendererUrl = `${APP}/wallpaper-engine/scene-live/index.html?type=web&webSandbox=strict`
  + `&fit=cover&sceneFps=15&muted=true`
  + `&src=${encodeURIComponent(web.webLiveSrc)}`
  + `&mediaBase=${encodeURIComponent(`${APP}/wallpaper-engine/scene-files`)}`;
console.log(`渲染页 URL: ${rendererUrl.slice(0, 140)}…`);
const baseWall = (inv.wallpapers || []).find((w) => w.id === '990102') || null;
check('inventory 也列出带 <base> 的夹具（否则下面的回归断言无从谈起）', Boolean(baseWall),
  baseWall ? String(baseWall.webLiveSrc || '').slice(0, 60) : 'not found');
const baseRendererUrl = baseWall
  ? `${APP}/wallpaper-engine/scene-live/index.html?type=web&webSandbox=strict`
    + `&fit=cover&sceneFps=15&muted=true`
    + `&src=${encodeURIComponent(baseWall.webLiveSrc)}`
    + `&mediaBase=${encodeURIComponent(`${APP}/wallpaper-engine/scene-files`)}`
  : '';
let baseWrapperHtml = '';
const THUMB_DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
baseWrapperHtml = baseRendererUrl
  ? `<!doctype html><html><head><meta charset="utf-8"><title>e2e base host</title>`
    + `<style>html,body{margin:0;height:100%;background:#111}iframe{position:fixed;inset:0;width:100%;height:100%;border:0}</style>`
    + `</head><body><iframe src=${JSON.stringify(baseRendererUrl)}></iframe></body></html>`
  : '';
function extractScopeText(src, scope) {
  const s = String(src == null ? '' : src);
  const anchor = s.indexOf(scope);
  if (anchor < 0) return null;
  const CALL = 'React.createElement(';
  const brace = s.lastIndexOf('{', anchor);
  if (brace < 0) return null;
  const head = s.slice(Math.max(0, brace - 60), brace);
  const owner = head.lastIndexOf(CALL);
  if (owner < 0 || !/(?:\)|,)\s*$/.test(head.slice(owner + CALL.length))) return null;
  const callAt = Math.max(0, brace - 60) + owner;
  const open = s.indexOf('(', callAt);
  if (open < 0 || open > brace) return null;
  let depth = 1, quote = '', lineC = false, blockC = false, i = open + 1;
  for (; i < s.length; i++) {
    const ch = s[i], nx = s[i + 1];
    if (lineC) { if (ch === '\n') lineC = false; continue; }
    if (blockC) { if (ch === '*' && nx === '/') { blockC = false; i++; } continue; }
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = ''; continue; }
    if (ch === '/' && nx === '/') { lineC = true; i++; continue; }
    if (ch === '/' && nx === '*') { blockC = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '(' || ch === '{') depth++;
    else if (ch === ')' || ch === '}') { depth--; if (depth === 0) break; }
  }
  return depth === 0 ? s.slice(open, i) : null;
}
function elementCallEnd(src, callAt) {
  const open = src.indexOf('(', callAt);
  if (open < 0) return -1;
  let depth = 1, quote = '', lineC = false, blockC = false, i = open + 1;
  for (; i < src.length; i++) {
    const ch = src[i], nx = src[i + 1];
    if (lineC) { if (ch === '\n') lineC = false; continue; }
    if (blockC) { if (ch === '*' && nx === '/') { blockC = false; i++; } continue; }
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = ''; continue; }
    if (ch === '/' && nx === '/') { lineC = true; i++; continue; }
    if (ch === '/' && nx === '*') { blockC = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '(' || ch === '{') depth++;
    else if (ch === ')' || ch === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}
function productPrimaryActions(src, scope, element = 'button') {
  const text = extractScopeText(src, scope);
  if (text === null) return null;
  const want = 'React.createElement("' + element + '"';
  let depth = 0, quote = '', lineC = false, blockC = false, n = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], nx = text[i + 1];
    if (lineC) { if (ch === '\n') lineC = false; continue; }
    if (blockC) { if (ch === '*' && nx === '/') { blockC = false; i++; } continue; }
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = ''; continue; }
    if (ch === '/' && nx === '/') { lineC = true; i++; continue; }
    if (ch === '/' && nx === '*') { blockC = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (depth === 1 && text.startsWith(want, i)) n++;
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth--;
  }
  return n;
}
const PRODUCT_DRAWER_ACTIONS_SCOPE = 'className: "we-picker__current-actions"';
const productDrawerPanelSrc = panelText();
const productDrawerActions = (expected) => productPrimaryActions(productDrawerPanelSrc, PRODUCT_DRAWER_ACTIONS_SCOPE) === expected;
const PRODUCT_QP_ACTIONS_SCOPE = 'className: "we-qp__current-actions"';
const productQuickPanelSrc = readFileSync(join(root, 'src', 'quick-panel.js'), 'utf8');
wrapperHtml = `<!doctype html><html><head><meta charset="utf-8"><title>e2e host</title>`
  + `<style>html,body{margin:0;height:100%;background:#111}iframe.we-live{position:fixed;inset:0;width:100%;height:100%;border:0}</style>`
  + `</head><body><script>`
  + `var f=document.createElement('iframe');f.className='we-live';f.src=${JSON.stringify(rendererUrl)};document.body.appendChild(f);`
  + `var tries=0;var timer=setInterval(function(){tries++;var wp=null,st=null;`
  + `try{wp=f.contentWindow&&f.contentWindow.__wp;}catch(e){}`
  + `try{st=wp&&wp.getState?wp.getState():null;}catch(e){}`
  + `if(st&&st.iframeLoaded){clearInterval(timer);`
  + `var pushErr='';`
  + `try{wp.setMedia({hasMedia:true,title:'E2E Song',artist:'E2E Artist',album:'E2E Album',`
  + `albumArtist:'E2E AlbumArtist',playing:true,state:1,position:5,duration:100,`
  + `lyrics:[[0,'line1'],[8,'line2']],thumbnail:${JSON.stringify(THUMB_DATA_URL)}});}catch(e){pushErr=String(e&&e.message||e);}`
  + `(function(){var im=new Image();im.src='${APP}/wallpaper-engine/diag?msg='+encodeURIComponent('${MARKER} SETMEDIA push='+(pushErr?('err:'+pushErr):'ok')+' hasFn='+(typeof wp.setMedia)+' type='+(st.type||''));})();`
  + `setTimeout(function(){try{wp.updateWebProps({color0:{value:'0 1 0'}});}catch(e){}},1200);return;}`
  + `if(tries>60)clearInterval(timer);},250);`
  + `</script>`
  + `<style>${pluginCss}</style>`
  + `<div class="we-repo-panel" id="e2e-drawer" style="transform:none">`
  + `<div class="we-picker__section"><div class="we-picker__current">`
  + `<div class="we-vinyl"><span class="we-vinyl__hole"></span></div>`
  + `<div class="we-picker__current-info">`
  + `<div class="we-picker__current-title"><span class="we-picker__current-name">一个特别长的壁纸名称用来压出省略号效果</span><span class="we-picker__current-meta">场景壁纸（实时渲染） · 播放中</span></div>`
  + `<div class="we-picker__current-sub"></div>`
  + `</div>`
  + `<div class="we-picker__current-actions">`
  + `<button class="we-picker__btn we-picker__btn--primary">选择壁纸</button>`
  + `</div></div></div></div>`
  + `<div id="e2e-wide" style="position:fixed;left:0;top:0;width:720px">`
  + `<div class="we-picker__section"><div class="we-picker__current">`
  + `<div class="we-vinyl"><span class="we-vinyl__hole"></span></div>`
  + `<div class="we-picker__current-info">`
  + `<div class="we-picker__current-title"><span>音域回响</span><span class="we-picker__current-meta">网页壁纸 · 播放中</span></div>`
  + `<div class="we-picker__current-sub"></div>`
  + `</div>`
  + `<div class="we-picker__current-actions">`
  + `<button class="we-picker__btn we-picker__btn--primary">选择壁纸</button>`
  + `</div></div></div></div>`
  + `<script>`
  + `function measureCard(scope){`
  + `var card=scope.querySelector('.we-picker__current');`
  + `var root=card.getBoundingClientRect();`
  + `var tl=card.querySelector('.we-picker__current-title');`
  + `var wm=document.getElementById('e2e-wide').querySelector('.we-picker__current-meta');`
  + `var t=tl.getBoundingClientRect();`
  + `var v=card.querySelector('.we-vinyl').getBoundingClientRect();`
  + `var bs=card.querySelectorAll('.we-picker__current-actions .we-picker__btn');`
  + `var a=bs[0].getBoundingClientRect();`
  + `var m=card.querySelector('.we-picker__current-meta');`
  + `var ms=getComputedStyle(m), ts=getComputedStyle(tl);`
  + `var parens=(String(ms.content).indexOf('（')>=0||String(getComputedStyle(m,'::before').content).indexOf('（')>=0)?1:0;`
  + `var oneLine=tl.getBoundingClientRect().height<=parseFloat(ts.fontSize)*2.0?1:0;`
  + `var clipped=tl.scrollWidth>tl.clientWidth+1?1:0;`
  + `return {acs:(bs.length===1)?1:0,titleAbove:t.top<v.top?1:0,`
  + `metaDisplay:ms.display,parens:parens,oneLine:oneLine,clipped:clipped,wideMeta:getComputedStyle(wm).display,`
  + `titleAlign:ts.textAlign};`
  + `}`
  + `setTimeout(function(){`
  + `var d=measureCard(document.getElementById('e2e-drawer'));`
  + `var w=measureCard(document.getElementById('e2e-wide'));`
  + `var img=new Image();`
  + `img.src='${APP}/wallpaper-engine/diag?msg='+encodeURIComponent('${MARKER} LAYOUT drawerTitleAbove='+d.titleAbove+' acSingle='+d.acs`
  + `+' metaInline='+(d.metaDisplay==='inline'?1:0)+' parens='+d.parens+' oneLine='+d.oneLine+' clipped='+d.clipped+' wideMetaBlock='+(w.wideMeta==='block'?1:0)`
  + `+' titleCenter='+(d.titleAlign==='center'?1:0)+' wideTitleAlign='+w.titleAlign);`
  + `},1500);`
  + `</script></body></html>`;

 
 
 
 
check('产品源码：抽屉「当前壁纸」卡片主操作区只剩 1 个按钮',
  productDrawerActions(1),
  'panel-tabs.js 卡片主操作按钮 = ' + productPrimaryActions(productDrawerPanelSrc, PRODUCT_DRAWER_ACTIONS_SCOPE)
    + '（期望 1），quick-panel.js 播放控制行 = ' + productPrimaryActions(productQuickPanelSrc, PRODUCT_QP_ACTIONS_SCOPE)
    + '（期望 3，证明计数器按 scope 生效）；镜像 DOM 里的 acSingle 只作几何对照');
 
 
 
 
 
{
  const scopeAt = productDrawerPanelSrc.indexOf(PRODUCT_DRAWER_ACTIONS_SCOPE);
  const brace = productDrawerPanelSrc.lastIndexOf('{', scopeAt);
  let j = brace + 1, bd = 1;
  while (j < productDrawerPanelSrc.length && bd > 0) {
    if (productDrawerPanelSrc[j] === '{') bd++;
    else if (productDrawerPanelSrc[j] === '}') bd--;
    j++;
  }
  const firstChild = productDrawerPanelSrc.indexOf('React.createElement(', j);    
  const firstButton = productDrawerPanelSrc.indexOf('React.createElement("button"', j);
  const ind = firstChild < 0 ? '' : productDrawerPanelSrc.slice(productDrawerPanelSrc.lastIndexOf('\n', firstChild) + 1, firstChild);
   
  const buttonEnd = elementCallEnd(productDrawerPanelSrc, firstButton);
  let afterButton = buttonEnd + 1;
  while (afterButton < productDrawerPanelSrc.length && ', \t\r'.indexOf(productDrawerPanelSrc[afterButton]) >= 0) afterButton++;
  const withoutButton = buttonEnd < 0 ? null : productDrawerPanelSrc.slice(0, firstButton) + productDrawerPanelSrc.slice(afterButton);
  const sibling = productDrawerPanelSrc.slice(0, firstChild) + 'React.createElement("button", { className: "we-picker__btn" }, "合成"),\r\n' + ind + productDrawerPanelSrc.slice(firstChild);
  const nested = productDrawerPanelSrc.slice(0, firstChild)
    + 'React.createElement("i", null, React.createElement("button", { className: "we-picker__btn" }, "合成")),\r\n' + ind
    + productDrawerPanelSrc.slice(firstChild);
  const qp = productPrimaryActions(productQuickPanelSrc, PRODUCT_QP_ACTIONS_SCOPE);
  check('对照：同一判据喂合成源码必须判出（空容器 0 / 兄弟按钮 2 / 子容器按钮仍 1 / 另一 scope 3）',
    productPrimaryActions(withoutButton, PRODUCT_DRAWER_ACTIONS_SCOPE) === 0
      && productPrimaryActions(sibling, PRODUCT_DRAWER_ACTIONS_SCOPE) === 2
      && productPrimaryActions(nested, PRODUCT_DRAWER_ACTIONS_SCOPE) === 1
      && qp === 3,
    '空容器=' + productPrimaryActions(withoutButton, PRODUCT_DRAWER_ACTIONS_SCOPE)
      + '，兄弟按钮=' + productPrimaryActions(sibling, PRODUCT_DRAWER_ACTIONS_SCOPE)
      + '，子容器按钮=' + productPrimaryActions(nested, PRODUCT_DRAWER_ACTIONS_SCOPE)
      + '，播放控制行=' + qp
      + '（期望 0 / 2 / 1 / 3；只有真卡片那份是 1）');
}

 
 
 
console.log('');
console.log('· 宿主媒体路由（mock 播放器，不碰系统音频）');
let mstat = null;
for (let i = 0; i < 80; i++) {
  const r = await fetch(`${APP}/wallpaper-engine/media-status`, { cache: 'no-store' });
  mstat = await r.json();
  if (mstat && mstat.nowPlaying && mstat.nowPlaying.status === 'running') break;
  await new Promise((res) => { setTimeout(res, 250); });
}
check('媒体后端走中间件（backend=bridge，没有回落）',
  Boolean(mstat) && mstat.ok === true && mstat.backend === 'bridge' && !mstat.fallback,
  mstat ? `backend=${mstat.backend} fallback=${mstat.fallback || '-'} note=${mstat.note || '-'}` : '无响应');
check('音频未启用时状态明确为 off（不申请授权、不装音频桥）',
  Boolean(mstat && mstat.audio) && mstat.audio.status === 'off',
  mstat && mstat.audio ? mstat.audio.status : '?');
check('中间件版本/后端可查（排查时能一眼看出跑的是哪个产物）',
  Boolean(mstat && mstat.bridge) && mstat.bridge.version === WANT_BRIDGE_VERSION && mstat.bridge.protocol === 1,
  mstat && mstat.bridge ? `${mstat.bridge.version} ${mstat.bridge.provider}（期望 ${WANT_BRIDGE_VERSION}）` : '?');
 
 
 
 
check('覆盖面：桥版本观测点在场（bridge.version 取得到，不是空对象）',
  Boolean(mstat && mstat.bridge && mstat.bridge.version),
  mstat && mstat.bridge ? 'version=' + mstat.bridge.version : 'mstat.bridge 缺失/为空 ⇒ 版本判据无从谈起');
const npRes = await fetch(`${APP}/wallpaper-engine/now-playing`, { cache: 'no-store' });
const npj = await npRes.json();
const m = (npj && npj.media) || null;
check('now-playing 给出曲目 + 时长（秒，不是毫秒）',
  Boolean(m) && m.title === '示例曲目' && m.albumArtist === '示例歌手'
    && m.duration > 10 && m.duration < 10000 && m.playing === true && m.state === 1,
  m ? `${m.title}/${m.artist} dur=${m.duration}s state=${m.state}` : 'null');
check('进度按真实时间外推（不是卡在上报值）', await (async () => {
  if (!m) return false;
  const before = m.position;
  await new Promise((res) => { setTimeout(res, 1200); });
  const again = await (await fetch(`${APP}/wallpaper-engine/now-playing`, { cache: 'no-store' })).json();
  const after = again && again.media ? again.media.position : 0;
  return after > before;
})(), m ? '两次读取比较（1.2s 间隔）' : '-');
check('封面存在时给宿主代理路径 + hasArtwork', Boolean(m && m.thumbnail) === Boolean(npj.hasArtwork),
  m && m.thumbnail ? String(m.thumbnail) : '（无封面）');
const artUrl = m && m.thumbnail ? APP + m.thumbnail : '';
const artRes = artUrl ? await fetch(artUrl, { cache: 'no-store' }) : null;
check('封面路由直接给图片（宿主代理中间件落盘的封面文件）',
  Boolean(artRes) && artRes.status === 200 && /^image\//.test(String(artRes.headers.get('content-type') || '')),
  artRes ? `${artRes.status} ${artRes.headers.get('content-type')}` : '无封面 URL');
const spRes = await fetch(`${APP}/wallpaper-engine/audio-spectrum`, { cache: 'no-store' });
const spj = await spRes.json();
check('频谱恒 64 段 + running=false（客户端据此不装音频桥）',
  spj && spj.ok === true && Array.isArray(spj.bands) && spj.bands.length === 64 && spj.running === false,
  spj ? `bands=${(spj.bands || []).length} running=${spj.running}` : '无响应');
const NAV_URL = APP + '/e2e/host.html';
const CANDIDATES = process.platform === 'win32' ? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
] : process.platform === 'darwin' ? [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
] : [
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
];
const browser = CANDIDATES.find((p) => existsSync(p));
if (!browser) {
  const PRE_BROWSER_MIN_CHECKS = 12;
  const preBrowserChecks = passed + failed;
  const preBrowserOk = preBrowserChecks >= PRE_BROWSER_MIN_CHECKS && failed === 0;
  check('覆盖面：自动跳过也算执行（跳过前至少 ' + PRE_BROWSER_MIN_CHECKS + ' 条前置判据）',
    preBrowserOk,
    '本轮已执行 ' + preBrowserChecks + ' 条前置判据（其中 ' + failed + ' 条判红）/ 地板 '
    + PRE_BROWSER_MIN_CHECKS + '（不含本判据自己）');
  const skipCode = preBrowserOk ? 0 : 1;
  console.log('  ! SKIP 未找到 Chromium 系浏览器，页面断言未执行（本脚本不进 npm run verify）'
    + ' —— 已执行 ' + preBrowserChecks + ' 条前置判据（' + failed + ' 条判红），页面部分 0 条；退出码 ' + skipCode
    + (skipCode === 0 ? ' 仅表示"显式跳过"，不是"页面断言通过"'
      : '：前置判据不足或已有判红，按**失败**退出（不接受"没跑完"当通过）'));
  try { if (dispose) dispose(); } catch {   }
  appServer.close();
  process.exit(skipCode);
}
console.log(`浏览器: ${browser}`);
const diagStart = existsSync(DIAG_FILE) ? readFileSync(DIAG_FILE, 'utf8').length : 0;
const profileDir = join(TEST_ROOT, 'chromium-profile');
mkdirSync(profileDir, { recursive: true });
const child = spawn(browser, [
  '--headless=new',
  '--enable-unsafe-swiftshader',
  '--disable-extensions', '--no-first-run', '--no-default-browser-check',
  '--disable-features=Translate,MediaRouter',
  '--use-mock-keychain',
  `--user-data-dir=${profileDir}`,
  '--window-size=1280,720',
  NAV_URL,
], { stdio: 'ignore' });
await new Promise((r) => { setTimeout(r, 12000); });
try { child.kill('SIGKILL'); } catch {   }
await new Promise((r) => { setTimeout(r, 400); });
if (baseWrapperHtml) {
  const baseProfile = join(TEST_ROOT, 'chromium-profile-base');
  mkdirSync(baseProfile, { recursive: true });
  const child2 = spawn(browser, [
    '--headless=new',
    '--enable-unsafe-swiftshader',
    '--use-mock-keychain',
    '--disable-extensions', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${baseProfile}`,
    '--window-size=1280,720',
    APP + '/e2e/base.html',
  ], { stdio: 'ignore' });
  await new Promise((r) => { setTimeout(r, 9000); });
  try { child2.kill('SIGKILL'); } catch {   }
  await new Promise((r) => { setTimeout(r, 400); });
}
const lines = existsSync(DIAG_FILE) ? readFileSync(DIAG_FILE, 'utf8').slice(diagStart).split('\n') : [];
const mine = [];
for (const line of lines) {
  if (!line.trim()) continue;
  try { mine.push(JSON.parse(line)); } catch {   }
}
const beacons = mine.filter((d) => d.kind === 'renderer' && String(d.msg || '').indexOf(MARKER) === 0);
const mediaReqs = mine.filter((d) => d.kind === 'req' && d.route === 'scene-files@media');
const rendererDiag = mine.filter((d) => d.kind === 'renderer' && String(d.msg || '').indexOf(MARKER) !== 0);
const baseBeacons = beacons.filter((b) => String(b.msg || '').includes(' BASEFIX '));
const mainBeacons = beacons.filter((b) => !String(b.msg || '').includes(' BASEFIX '));
const lastBeacon = mainBeacons.length ? String(mainBeacons[mainBeacons.length - 1].msg || '') : '';
const baseMsg = baseBeacons.length ? String(baseBeacons[baseBeacons.length - 1].msg || '') : '';
const g = (k) => (new RegExp('(?:^|\\s)' + k + '=([^\\s]+)').exec(lastBeacon) || [])[1] || '';
const gb = (k) => (new RegExp('(?:^|\\s)' + k + '=([^\\s]+)').exec(baseMsg) || [])[1] || '';
console.log('');
if (DEBUG) {
  console.log('本次运行新增的诊断行：');
  for (const line of lines) if (line.trim()) console.log('    | ' + line.slice(0, 200));
}
console.log(`信标 ${beacons.length} 条 / 媒体源文档请求 ${mediaReqs.length} 条`);
for (const b of beacons) console.log('    · ' + String(b.msg || '').slice(0, 160));
for (const r of mediaReqs.slice(0, 6)) console.log(`    · media ${r.status} ${String(r.path || '').slice(0, 70)} dest=${r.dest || '-'}`);
for (const d of rendererDiag.slice(-6)) console.log('    · renderer ' + String(d.msg || '').slice(0, 150));
check('媒体源把壁纸入口 HTML 交给了渲染页', mediaReqs.some((r) => r.status === 200 && /\.html?$/i.test(String(r.path || ''))),
  mediaReqs.map((r) => r.status + ' ' + String(r.path || '')).join(' | ').slice(0, 120) || '无请求');
check('壁纸文档里的脚本真的执行了（信标 ran=1）', g('ran') === '1', lastBeacon.slice(0, 80));
 
 
 
 
check('不透明源里 localStorage 可用（shim 兜底，作者不会首屏崩）',
  String(g('ls') || '').startsWith('ok:'), 'ls=' + (g('ls') || '?'));
check('自带 <base href="./"> 的壁纸同样挂载成功（相对 base 被改写为入口目录）',
  gb('ran') === '1' && String(gb('base') || '').indexOf('/scene-files/') !== -1,
  baseMsg ? baseMsg.slice(0, 130) : '无信标：脚本没跑 = base 解析错（整页白屏）');
check('宿主注入的 shim 在位（shim=1）', g('shim') === '1', 'shim=' + (g('shim') || '?'));
check('属性种子到达作者（propsCalls≥1，含 color0）',
  Number(g('propsCalls') || 0) >= 1 && String(g('keys') || '').indexOf('color0') !== -1,
  'propsCalls=' + (g('propsCalls') || '?') + ' keys=' + (g('keys') || '?'));
check('跨源控制通道活着（渲染页下发的 sceneFps=15 到达作者）', g('fps') === '15',
  'fps=' + (g('fps') || '?'));
const p50 = Number(g('p50') || 0);
const p95 = Number(g('p95') || 0);
const maxIv = Number(g('max') || 0);
const nSlow = Number(g('nSlow') || 0);
const nIv = Number(g('n') || 0);
const FPS_P50_FLOOR = 45, FPS_P50_CEIL = 100;
const FPS_SLOW_FRAC = 0.2, FPS_SLOW_MIN = 2;
const FPS_METRICS = new Function(`${FPS_METRIC_JS}\nreturn { pct: pct, nSlow: nSlow, maxOf: maxOf };`)();
const fpsWithinTarget = (p50v, nSlowv, nIvLen,
  floor = FPS_P50_FLOOR, ceil = FPS_P50_CEIL, frac = FPS_SLOW_FRAC, min = FPS_SLOW_MIN) => {
  const ceilFor = (len) => Math.max(min, Math.round(len * frac));
  return p50v > 0 && p50v >= floor && p50v <= ceil && nSlowv <= ceilFor(nIvLen);
};
const fpsJudge = (intervals) => fpsWithinTarget(FPS_METRICS.pct(intervals, 0.5), FPS_METRICS.nSlow(intervals), intervals.length);
check('帧间隔样本量够（防「三个样本也算均匀」）', nIv >= 40, `n=${nIv}`);
check('15fps 上限下帧间隔落在目标附近（跳帧生效）', fpsWithinTarget(p50, nSlow, nIv),
  `p50=${p50}ms（目标 ${Math.round(1000 / 15)}ms）n=${nIv}`);
check('帧间隔无系统性抖动（掉队帧 ≤20%；紧判据是上一条的 p50）', fpsWithinTarget(p50, nSlow, nIv),
  `p50=${p50} p95=${p95} max=${maxIv} 掉队=${nSlow}/${nIv}`);
{
  const G_FLOOR = FPS_P50_FLOOR, G_SLOW_FRAC = FPS_SLOW_FRAC, G_SLOW_MIN = FPS_SLOW_MIN, G_P50_CEIL = FPS_P50_CEIL;
  const healthy = [67, 67, 67, 83, 67, 67, 67, 67, 67, 67];
  const broken = [17, 33, 50, 17, 33, 50, 17, 33, 50, 17];
  check('对照：健康序列（p50 在目标上、一次 1 vsync 迟到）必须判为合格', fpsJudge(healthy),
    `p50=${FPS_METRICS.pct(healthy, 0.5)} 掉队=${FPS_METRICS.nSlow(healthy)}/${healthy.length} max=${FPS_METRICS.maxOf(healthy)}`
      + `（阈值 ${G_FLOOR}–${G_P50_CEIL}ms、掉队 ≤${G_SLOW_FRAC} 或 ${G_SLOW_MIN}）`);
  check('对照：旧 setTimeout 混排抖动序列必须被判出', !fpsJudge(broken),
    `p50=${FPS_METRICS.pct(broken, 0.5)} 掉队=${FPS_METRICS.nSlow(broken)}/${broken.length} max=${FPS_METRICS.maxOf(broken)}`);
}
check('媒体属性到达壁纸（title）', g('media') === 'E2E_Song', 'media=' + (g('media') || '?'));
check('播放态到达壁纸', g('mstate') === '1', 'mstate=' + (g('mstate') || '?'));
check('albumArtist 到达壁纸（中间件新增字段）', g('aa') === 'E2E_AlbumArtist', 'aa=' + (g('aa') || '?'));
const mtlSeen = beacons
  .map((b) => (/(?:^|\s)mtl=([^\s]+)/.exec(String(b.msg || '')) || [])[1] || '')
  .filter(Boolean);
check('进度/时长到达壁纸，且归宿主（不再被演示源覆盖）',
  mtlSeen.length > 0 && mtlSeen.every((v) => v === '5,100'),
  `mtl 序列: ${mtlSeen.join(' → ') || '无'}`);
const layoutLine = (() => {
  for (const d of mine) {
    const m = String((d && d.msg) || '');
    if (m.indexOf(MARKER) === 0 && m.indexOf('LAYOUT') > 0) return m;
  }
  return '';
})();
const lg = (k) => (new RegExp('(?:^|\\s)' + k + '=([^\\s]+)').exec(layoutLine) || [])[1] || '';
check('抽屉里名称独占顶层第一行', lg('drawerTitleAbove') === '1', layoutLine || '未测到');
check('抽屉里类型/播放态内联加括号、整行不换行且在超长时省略',
  lg('metaInline') === '1' && lg('parens') === '1' && lg('oneLine') === '1' && lg('clipped') === '1',
  `inline=${lg('metaInline')} 括号=${lg('parens')} 单行=${lg('oneLine')} 省略=${lg('clipped')}`);
check('宽卡片里类型/播放态仍在名称下方另起一行', lg('wideMetaBlock') === '1', 'wide=' + (lg('wideMetaBlock') || '?'));
check('抽屉里名称行文字居中（宽卡片保持左对齐）',
  lg('titleCenter') === '1' && (lg('wideTitleAlign') === 'start' || lg('wideTitleAlign') === 'left'),
  `drawer=${lg('titleCenter')} center / wide=${lg('wideTitleAlign')}`);
check('属性热更新到达壁纸（updateWebProps）', g('prop0') === '0_1_0', 'prop0=' + (g('prop0') || '?'));
check('封面 data URL 到达壁纸且能加载显示',
  /^ok:\d+x\d+$/.test(g('img') || '') && Number(g('thumb') || 0) > 100,
  `thumb=${g('thumb') || 0}ch img=${g('img') || '?'}`);
try { if (dispose) dispose(); } catch {   }
try { appServer.close(); } catch {   }
delete process.env.DSH_WE_STEAM_ROOT;
delete process.env.DSH_WE_UPLOAD_DIR;
rmSync(TEST_ROOT, { recursive: true, force: true });
console.log('');
if (failed > 0) {
  console.log(`E2E FAILED — ${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`ALL E2E CHECKS PASSED (${passed})`);
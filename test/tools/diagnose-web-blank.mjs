import { createServer } from 'node:http';
import { mkdirSync, rmSync, readFileSync, existsSync, statSync, createReadStream, openSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WALL_ID = process.env.WALL_ID || '2905017768';
const FPS = process.env.FPS || '30';
const WAIT_MS = Number(process.env.WAIT_MS || 14000);
const RENDERER_DIR = process.env.RENDERER_DIR || '';
const MARKER = 'BLANK-' + process.pid;
const cfgPath = join(process.env.HOME, '.dsh-wallpaper-engine', 'config.json');
const WALL_ROOT = process.env.WALL_ROOT
  || (existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, 'utf8')).uploadDir : '')
  || join(process.env.HOME, 'Library/Application Support/io.github.oneincase.wallpaperem/wallpapers');
const WALL_DIR = join(WALL_ROOT, WALL_ID);
if (!existsSync(join(WALL_DIR, 'index.html'))) {
  console.error(`找不到壁纸入口：${join(WALL_DIR, 'index.html')}`);
  console.error('（custom storage 的网页壁纸目录里应有 index.html；用 WALL_ROOT/WALL_ID 指定）');
  process.exit(2);
}
const TEST_ROOT = join(root, '.test-cache', 'diagnose-web-blank');
rmSync(TEST_ROOT, { recursive: true, force: true });
mkdirSync(TEST_ROOT, { recursive: true });
process.env.DSH_WE_STEAM_ROOT = join(TEST_ROOT, 'steamlib');
mkdirSync(join(process.env.DSH_WE_STEAM_ROOT, 'steamapps', 'common', 'wallpaper_engine'), { recursive: true });
process.env.DSH_WE_CACHE_DIR = join(TEST_ROOT, 'cache');
process.env.DSH_WE_UPLOAD_DIR = WALL_ROOT;
process.env.DSH_WE_MEDIA_PROVIDER = 'mock';
process.env.DSH_WE_MEDIA_NO_AUDIO = '1';
const DIAG_FILE = join(process.env.HOME, '.dsh-wallpaper-engine', 'diag', 'http.jsonl');
const DIAG_START = existsSync(DIAG_FILE) ? statSync(DIAG_FILE).size : 0;
console.log(`壁纸：${WALL_DIR}`);
console.log(`壁纸库：${WALL_ROOT}`);
console.log(`渲染页：${RENDERER_DIR || join(root, 'lib', 'webwallgl')}（cap=${FPS}fps）`);
const routes = [];
const ctx = {
  webServer: {
    register(route) { routes.push(route); return () => { const i = routes.indexOf(route); if (i >= 0) routes.splice(i, 1); }; },
    tapIndex() { return () => {}; },
  },
};
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
};
if (RENDERER_DIR) {
  routes.push({
    kind: 'prefix',
    path: '/wallpaper-engine/scene-live',
    handler(req, res) {
      const p = new URL(req.url || '/', 'http://x').pathname.slice('/wallpaper-engine/scene-live'.length);
      const rest = decodeURIComponent(p).replace(/^\/+/, '') || 'index.html';
      const abs = join(RENDERER_DIR, rest);
      if (!existsSync(abs) || !statSync(abs).isFile()) { res.statusCode = 404; res.end('nope'); return; }
      res.setHeader('Content-Type', MIME[extname(abs)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      createReadStream(abs).pipe(res);
    },
  });
}
const hostMod = await import(pathToFileURL(join(root, 'lib', 'index.js')).href);
const host = hostMod.default || hostMod;
const dispose = (host.apply || host.inject)(ctx);
const matchRoute = (pathname) => routes.find((r) => (
  r.kind === 'exact' ? r.path === pathname : (pathname === r.path || pathname.startsWith(r.path + '/'))
));
let wrapperHtml = '';
const appServer = createServer((req, res) => {
  const pathname = new URL(req.url || '/', 'http://x').pathname;
  if (pathname === '/diag-host.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(wrapperHtml);
    return;
  }
  const route = matchRoute(pathname);
  if (!route) { res.statusCode = 404; res.end('no route'); return; }
  Promise.resolve(route.handler(req, res)).catch(() => { try { res.statusCode = 500; res.end('handler error'); } catch {   } });
});
await new Promise((r) => { appServer.listen(0, '127.0.0.1', r); });
const APP = `http://127.0.0.1:${appServer.address().port}`;
const inv = await (await fetch(`${APP}/wallpaper-engine/inventory`, { cache: 'no-store' })).json();
const target = (inv.wallpapers || []).find((w) => String(w.id) === `up-dir-${WALL_ID}` || String(w.id) === WALL_ID);
if (!target) {
  console.error(`库存里没有 ${WALL_ID}。可用 id 样例：`,
    (inv.wallpapers || []).slice(0, 8).map((w) => w.id).join(', '));
  try { if (dispose) dispose(); } catch {   }
  appServer.close();
  process.exit(2);
}
console.log(`库存条目：id=${target.id} type=${target.type} title=${target.title}`);
console.log(`webLiveSrc=${String(target.webLiveSrc || '').slice(0, 140)}`);
const rendererUrl = `${APP}/wallpaper-engine/scene-live/index.html?type=web&webSandbox=strict`
  + `&fit=cover&sceneFps=${FPS}&muted=true`
  + `&src=${encodeURIComponent(target.webLiveSrc)}`
  + `&mediaBase=${encodeURIComponent(`${APP}/wallpaper-engine/scene-files`)}`;
wrapperHtml = `<!doctype html><html><head><meta charset="utf-8"><title>diagnose</title>`
  + `<style>html,body{margin:0;height:100%;background:#111}iframe{position:fixed;inset:0;width:100%;height:100%;border:0}</style>`
  + `</head><body><script>`
  + `var f=document.createElement('iframe');f.src=${JSON.stringify(rendererUrl)};document.body.appendChild(f);`
  + `function beacon(msg){var i=new Image();i.src=${JSON.stringify(APP + '/wallpaper-engine/diag?msg=')} + encodeURIComponent(${JSON.stringify(MARKER + ' ')} + msg);}`
  + `window.onerror=function(m,s,l,c){beacon('HOSTERR '+m+' @'+l+':'+c);};`
  + `var n=0;var iv=setInterval(function(){n++;`
  + `var wp=null,st=null,stats='';`
  + `try{wp=f.contentWindow&&f.contentWindow.__wp;}catch(e){}`
  + `try{st=wp&&wp.getState?wp.getState():null;}catch(e){st={err:String(e&&e.message||e)};}`
  + `try{stats=JSON.stringify(f.contentWindow.__wpStats&&f.contentWindow.__wpStats.frame?f.contentWindow.__wpStats.frame():null);}catch(e){stats='ERR';}`
  + `var innerSandbox='',innerSrc='';`
  + `try{var inner=f.contentDocument&&f.contentDocument.body.querySelector('iframe');`
  + `if(inner){innerSandbox=String(inner.getAttribute('sandbox'));innerSrc=String(inner.getAttribute('src')||'').slice(0,70);}}catch(e){}`
  + `beacon('T'+n+' iframeLoaded='+(st&&st.iframeLoaded)+' webFps='+(st&&st.webFps)+' webError='+(st&&st.webError)`
  + `+' type='+(st&&st.type)+' stats='+stats+' innerSandbox='+innerSandbox+' innerSrc='+innerSrc);`
  + `if(n>=16)clearInterval(iv);},1000);`
  + `</script></body></html>`;
const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const browser = CANDIDATES.find((p) => existsSync(p));
if (!browser) { console.error('未找到 Chromium 系浏览器（Chrome / Edge / Chromium）'); process.exit(2); }
console.log(`浏览器：${browser}`);

const profile = join(TEST_ROOT, 'profile');
const errLog = join(TEST_ROOT, 'browser-stderr.log');
const shot = process.env.SHOT || join(TEST_ROOT, 'shot.png');
const errFd = openSync(errLog, 'w');
const child = spawn(browser, [
  '--headless=new',
  '--enable-unsafe-swiftshader',    
   
   
  '--use-mock-keychain',
  '--disable-gpu', '--disable-extensions', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${profile}`,
  '--window-size=1280,720',
  '--enable-logging=stderr', '--v=1', '--log-level=0',
  `--screenshot=${shot}`,
   
   
   
  '--virtual-time-budget=9000',
  `${APP}/diag-host.html`,
], { stdio: ['ignore', 'ignore', errFd] });

console.log(`已启动（pid ${child.pid}），等 ${WAIT_MS} ms …`);
await new Promise((r) => { setTimeout(r, WAIT_MS); });
try { child.kill('SIGKILL'); } catch {   }
await new Promise((r) => { setTimeout(r, 300); });

 
console.log('\n· 渲染页实况（每秒一条）');
if (existsSync(DIAG_FILE)) {
  const slice = readFileSync(DIAG_FILE, 'utf8').slice(DIAG_START);
  for (const ln of slice.split('\n')) {
    if (!ln.includes(MARKER)) continue;
    try {
      const d = JSON.parse(ln);
      console.log('   ' + String(d.msg || '').replace(MARKER + ' ', '').slice(0, 300));
    } catch {   }
  }
  console.log('\n· 本次新增的其它诊断（req / fence / renderer / client）');
  let any = false;
  for (const ln of slice.split('\n')) {
    if (!ln.trim() || ln.includes(MARKER)) continue;
    let d; try { d = JSON.parse(ln); } catch { continue; }
    if (!['req', 'fence', 'http', 'renderer', 'client'].includes(d.kind)) continue;
    any = true;
    console.log('   ' + JSON.stringify({
      kind: d.kind, event: d.event, route: d.route, status: d.status, dest: d.dest,
      detail: String(d.detail || '').slice(0, 90), msg: String(d.msg || '').slice(0, 160),
    }));
  }
  if (!any) console.log('   （无）');
}
console.log('\n· 浏览器控制台（只列可疑行）');
if (existsSync(errLog)) {
  const lines = readFileSync(errLog, 'utf8').split('\n');
  const hit = lines.filter((l) => /CONSOLE|SecurityError|Uncaught|NotAllowedError|Failed to (read|set)|Access is denied|insecure/i.test(l));
  for (const l of hit.slice(0, 30)) console.log('   ' + l.slice(0, 320));
  if (!hit.length) console.log(`   （无可疑行；stderr 共 ${lines.length} 行）`);
}
const shotSize = existsSync(shot) ? statSync(shot).size : 0;
console.log(`\n· 截图：${shot}（${Math.round(shotSize / 1024)}KB）`);
if (shotSize) {
  console.log(`  体积判读：${shotSize < 20000 ? '⚠ 很小 —— 大概率白屏/空白' : '正常（有内容）'}`);
  console.log('  注意体积只是粗判：画面本身接近纯色的壁纸也会很小，务必**亲眼看图**。');
}
try { if (dispose) dispose(); } catch {   }
appServer.close();
process.exit(0);

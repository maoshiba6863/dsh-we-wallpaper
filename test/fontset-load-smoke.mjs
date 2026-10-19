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
let failures = 0;
const check = (label, cond, detail = '') => {
  if (cond) console.log('  ✓ ' + label + (detail ? ' — ' + detail : ''));
  else { failures++; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
};
const React = { Fragment: 'Fragment', useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {}, useRef: (v) => ({ current: v }),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  createElement: (t, p, ...c) => { assertChildren(c); return typeof t === 'function' ? t(p || {}, ...c) : { type: t, props: p || null, children: c }; } };
const HOST_VALUES = {
  themeColors: { primary: { light: '#112233', dark: '#aabbcc' } },
  themeDarkSeparate: true,
  themeSize: { 'markdown-h1': 24 },
  themeWeight: { 'markdown-h1': 900 },
  themeFamily: { 'markdown-h1': 'SimSun' },
  globalFamily: 'sys:PingFang SC',
  componentFonts: { markdown: { size: 15 } },
};
const CACHE_KEY = 'we-fontset-active';
function makeEl(tag) {
  const listeners = {};
  const el = {
    tagName: tag.toUpperCase(), children: [], dataset: {}, attributes: {},
    style: { _props: {}, cssText: '', setProperty(k, v) { this._props[k] = v; }, removeProperty(k) { delete this._props[k]; } },
    className: '', textContent: '',
    appendChild(c) { this.children.push(c); c._parent = this; return c; },
    remove() { if (this._parent) { const i = this._parent.children.indexOf(this); if (i >= 0) this._parent.children.splice(i, 1); } },
    setAttribute(k, v) { this.attributes[k] = v; },
    removeAttribute(k) { delete this.attributes[k]; },
    getAttribute(k) { return this.attributes[k] ?? null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return false; },
    get isConnected() { return true; },
    addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
    removeEventListener(ev, fn) { const l = listeners[ev]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } },
    __fire(ev) { (listeners[ev] || []).slice().forEach((f) => f()); },
    play() { return Promise.resolve(); }, pause() {}, load() {},
  };
  el.classList = { add() {}, remove() {} };
  return el;
}
function mount({ fetchImpl, store }) {
  const bodyEl = makeEl('body');
  const document = {
    createElement: (t) => makeEl(t),
    getElementById: () => null,
    querySelector: () => null,
    head: { appendChild: () => {} },
    body: bodyEl,
    hidden: false,
    hasFocus: () => true,
    addEventListener() {},
    removeEventListener() {},
    documentElement: makeEl('html'),
  };
  const localStorage = {
    _store: store,
    getItem(k) { return this._store[k] ?? null; },
    setItem(k, v) { this._store[k] = v; },
    removeItem(k) { delete this._store[k]; },
  };
  const requests = [];
  const fetch = (url, init) => {
    const o = init || {};
    requests.push({ method: (o.method || 'GET').toUpperCase(), url: String(url), body: o.body || null });
    return fetchImpl(String(url), o);
  };
  const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
  const cap = { handoff: null };
  store['dsh-wallpaper-engine:qp-tab'] = 'appearance';
  store['dsh-wallpaper-engine:qp-font-open'] = '1';
  const timers = [];
  const renderers = [];
  const fireTimers = (ms) => timers.filter((t) => !t.cleared && t.ms === ms).forEach((t) => { t.cleared = true; t.fn(); });
  const stubTimeout = (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; };
  const sandbox = {
    window: {
      __ModuleLoader__: { load: (h) => { cap.handoff = h; } },
      setTimeout: stubTimeout,
      clearTimeout: (t) => { if (t) t.cleared = true; },
      addEventListener() {}, removeEventListener() {},
      innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1,
    },
    document, localStorage, fetch, React,
    location: { origin: 'http://localhost' },
    setTimeout: stubTimeout,
    clearTimeout: (t) => { if (t) t.cleared = true; },
  };
  vm.createContext(sandbox);
  new vm.Script(code, { filename: 'client.js' }).runInContext(sandbox);
  const exportsObj = cap.handoff.factory((spec) => (spec === 'react' ? React : { createPortal: (n) => n }));
  exportsObj.apply({
    slots: {
      inject: (k, cb) => { try { cb(); } catch {   } },
      register: (meta, render) => { if (typeof render === 'function') renderers.push(render); return null; },
    },
    get: (name) => (name === 'sidebarRightTabs' ? { register: () => () => {} }
      : name === 'sidebarRight' ? { openTab: () => {} } : null),
    effect(fn) { fn(); return fn; },
  });
  return {
    requests, store: localStorage._store, timers, fireTimers,
    renderPanel: () => renderers.map((r) => r()),
  };
}
function collectTree(root, out = []) {
  if (Array.isArray(root)) { root.forEach((n) => collectTree(n, out)); return out; }
  if (!root || typeof root !== 'object') return out;
  if (root.type) out.push(root);
  if (Array.isArray(root.children)) root.children.forEach((n) => collectTree(n, out));
  return out;
}
const hostWith = (settings) => (url) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(
  String(url).includes('/fontsets/import') ? { ok: true, id: 'imported-1', name: '导入的那份' }
    : url.includes('/fontsets/') ? { ok: true, id: 'compact', name: '紧凑', values: HOST_VALUES }
      : url.includes('/fontsets') ? { fontsets: [{ id: 'compact', name: '紧凑', origin: 'builtin', active: true }], active: 'compact', migrated: false, adopted: false }
        : url.includes('/settings') ? { ok: true, betterSidebar: false, settings }
          : { installDir: 'D:/we', total: 1, portableCount: 1, playlists: [], wallpapers: [
            { id: 'v', title: 'V', type: 'video', playable: true, media: '/wallpaper-engine/media/vvv', preview: null, contentrating: 'Everyone' },
          ] }) });
const goodHost = hostWith({ id: 'v', blur: 7 });
const brokenFontSetHost = (url) => Promise.resolve(
  url.includes('/fontsets/')
    ? { ok: false, status: 422, json: () => Promise.resolve({ error: 'fontset file is unreadable', reason: 'bad-version' }) }
    : goodHost(url));
const noFontSetHost = (url) => Promise.resolve(
  url.includes('/fontsets')
    ? { ok: false, status: 404, json: () => Promise.resolve({ error: 'not found' }) }
    : goodHost(url));
const waitBoot = () => new Promise((r) => { setTimeout(r, 50); });
(async () => {
  console.log('A. 正常宿主：settings → 字体集(list → 活动那份) → 库存');
  const shared = {};
  const a = mount({ fetchImpl: goodHost, store: shared });
  await waitBoot();
  const order = a.requests.map((r) => r.method + ' ' + r.url.replace('http://localhost', ''));
  const iSettings = order.findIndex((x) => x.includes('/settings'));
  const iList = order.findIndex((x) => x.endsWith('/wallpaper-engine/fontsets'));
  const iOne = order.findIndex((x) => x.includes('/fontsets/compact'));
  const iInv = order.findIndex((x) => x.includes('/inventory'));
  check('启动链取了 /fontsets 与活动那份', iList >= 0 && iOne >= 0, order.join(' | '));
  check('顺序 = settings → 字体集清单 → 活动那份 → 库存',
    iSettings >= 0 && iSettings < iList && iList < iOne && iOne < iInv, 'idx=' + [iSettings, iList, iOne, iInv].join(','));
  const cacheA = JSON.parse(shared[CACHE_KEY] || 'null');
  check('宿主那份被整套采用（本地缓存 = 活动 id + 全部字体键，与宿主逐键相同）',
    cacheA && cacheA.id === 'compact'
    && JSON.stringify(Object.keys(cacheA.values).sort()) === JSON.stringify(Object.keys(HOST_VALUES).sort())
    && JSON.stringify(cacheA.values) === JSON.stringify(HOST_VALUES),
    JSON.stringify(cacheA && { id: cacheA.id, size: cacheA.values && cacheA.values.themeSize }));
  check('启动期不发生任何字体集写入（载入 ≠ 落盘）',
    a.requests.every((r) => !(r.method === 'PUT' && r.url.includes('/fontsets'))), order.filter((x) => x.startsWith('PUT')).join(' | '));
  check('启动期的 PUT /settings 体里没有字体键（字体键已不走这条通道）',
    a.requests.filter((r) => r.method === 'PUT' && r.url.includes('/settings'))
      .every((r) => !/themeColors|themeSize|themeWeight|themeFamily|globalFamily|componentFonts|themeDarkSeparate/.test(String(r.body || ''))),
    a.requests.filter((r) => r.method === 'PUT').map((r) => r.url).join(' | ') || '(无 PUT)');
  console.log('B. 字体集读不出来：保留上次那份，不写回、不编造');
  const b = mount({ fetchImpl: brokenFontSetHost, store: shared });
  await waitBoot();
  const cacheB = JSON.parse(shared[CACHE_KEY] || 'null');
  check('读失败后本地缓存**仍是上次那份**（没有被清成默认值）',
    cacheB && cacheB.id === 'compact' && JSON.stringify(cacheB.values) === JSON.stringify(HOST_VALUES),
    JSON.stringify(cacheB && cacheB.id));
  check('读失败也不发起任何字体集写入（不拿默认值去覆盖宿主）',
    b.requests.every((r) => !(r.method === 'PUT' && r.url.includes('/fontsets'))));
  check('失败是"取过、被拒"而不是"没取"（请求记录里看得到那次 422）',
    b.requests.some((r) => r.url.includes('/fontsets/compact')), b.requests.map((r) => r.url.replace('http://localhost', '')).join(' | '));
  console.log('C. 有设置缓存 + 没有字体集缓存 + 清单都拿不到：挂载不抛、不凭空造缓存');
  const fresh = {
    'dsh-wallpaper-engine:selection': JSON.stringify({ id: 'v', fontCustom: true, blur: 9 }),
  };
  let mountThrew = '';
  try { mount({ fetchImpl: noFontSetHost, store: fresh }); } catch (e) { mountThrew = String((e && e.message) || e); }
  await waitBoot();
  check('没有缓存时不写出任何缓存（也就不会把"默认值"伪装成用户的那份）',
    fresh[CACHE_KEY] === undefined, String(fresh[CACHE_KEY]));
  check('挂载/启动不抛（字体键的兜底在位 ⇒ 面板与令牌层的取值路径拿到的都是对象）',
    mountThrew === '', mountThrew || 'fontCustom=true + 无字体集缓存 + 宿主读不出来');
  const openFontSetEditor = (d) => {
    const box = d.renderPanel().flatMap((t) => collectTree(t))
      .find((n) => n.type === 'input' && n.props && n.props['aria-label'] === '字体集预设');
    if (box) box.props.onChange({ target: { checked: true } });
    return Boolean(box);
  };
  const panelText = (d) => d.renderPanel().flatMap((t) => collectTree(t))
    .map((n) => (Array.isArray(n.children) ? n.children.filter((c) => typeof c === 'string').join('') : '')).join(' | ');
  console.log('D. 写路径：改字号 ⇒ PUT 到活动集，且完全不碰 /settings');
  const dStore = {
    'dsh-wallpaper-engine:selection': JSON.stringify({ id: 'v', fontCustom: true }),
    'dsh-wallpaper-engine:picker-tab': 'appearance',
  };
  const d = mount({ fetchImpl: hostWith({ id: 'v', fontCustom: true }), store: dStore });
  await waitBoot();
  const sizeInputs = d.renderPanel()
    .flatMap((tree) => collectTree(tree))
    .filter((n) => n.type === 'input' && /字号 px/.test(String((n.props || {}).title || '')));
  check('「外观」页签里找得到排版角色的字号输入（写路径的前置：UI 可达）',
    sizeInputs.length > 0, sizeInputs.length + ' 个字号输入');
  openFontSetEditor(d);
  await new Promise((r) => { setTimeout(r, 20); });
  const markBefore = panelText(d);
  check('改之前：那一行标「（使用中）」（刚采纳，值一致）',
    markBefore.includes('（使用中）') && !markBefore.includes('（已改）'), markBefore.slice(-64));
  d.fireTimers(200);
  await new Promise((r) => { setTimeout(r, 10); });
  const before = d.requests.length;
  if (sizeInputs.length) sizeInputs[0].props.onChange({ target: { value: '26' } });
  d.fireTimers(200);
  await new Promise((r) => { setTimeout(r, 10); });
  const written = d.requests.slice(before);
  const fontPuts = written.filter((r) => r.method === 'PUT' && r.url.includes('/fontsets/'));
  const settingsPuts = written.filter((r) => r.method === 'PUT' && r.url.includes('/settings'));
  check('改字号 ⇒ PUT 落到**活动集**（/fontsets/compact）',
    fontPuts.length === 1 && fontPuts[0].url.endsWith('/fontsets/compact'),
    fontPuts.map((r) => r.url.replace('http://localhost', '')).join(' | ') || '(没有 PUT)');
  check('该 PUT 的体里带着刚改的值（markdown-h1 = 26）',
    fontPuts.length === 1 && /"markdown-h1":26/.test(String(fontPuts[0].body || '')),
    String(fontPuts[0] && fontPuts[0].body).slice(0, 96));
  check('同期**完全没有**写 /settings（字体值不走那条通道）',
    settingsPuts.length === 0, settingsPuts.map((r) => r.url).join(' | ') || '零次');
  const markAfter = panelText(d);
  check('改之后：标记换成「（已改）」—— 同一套、同一行，只是值被手动改过（不是凭空消失）',
    !markAfter.includes('（使用中）') && markAfter.includes('（已改）'), markAfter.slice(-64));
  const typeRoleRows = () => {
    const nodes = d.renderPanel().flatMap((t) => collectTree(t));
    const table = nodes.find((n) => n.type === 'table'
      && collectTree(n).some((x) => Array.isArray(x.children) && x.children.join('') === '角色'));
    return table ? collectTree(table).filter((n) => n.type === 'tr' && collectTree(n).some((c) => c.type === 'td')).length : -1;
  };
  check('「只看改过的」默认开：表里只列改过的那个角色（默认值为 false 时会铺满 12 行）',
    typeRoleRows() === 1, typeRoleRows() + ' 行');
  console.log('E. 导入：导出字节 ⇒ 读回同一份；三种坏文件各自给可判定文案');
  const eStore = {
    'dsh-wallpaper-engine:selection': JSON.stringify({ id: 'v', fontCustom: true }),
    'dsh-wallpaper-engine:picker-tab': 'appearance',
  };
  const eSets = [{ id: 'compact', name: '紧凑', origin: 'builtin', active: true }];
  let eActive = 'compact';
  const baseHost = hostWith({ id: 'v', fontCustom: true });
  const statefulHost = (url, init) => {
    const u = String(url);
    const method = String((init && init.method) || 'GET').toUpperCase();
    if (u.includes('/fontsets/') && method === 'PUT') {
      const id = decodeURIComponent(/\/fontsets\/([^/?]+)/.exec(u)[1]);
      let name = id;
      try { name = JSON.parse(String(init.body)).name || id; } catch {   }
      const row = eSets.find((r) => r.id === id);
      if (row) row.name = name; else eSets.push({ id, name, origin: 'user', active: false });
      return baseHost(u, init);
    }
    if (u.includes('/activate') && method === 'POST') {
      eActive = decodeURIComponent(/\/fontsets\/([^/]+)\/activate/.exec(u)[1]);
      eSets.forEach((r) => { r.active = r.id === eActive; });
      return baseHost(u, init);
    }
    if (u.includes('/fontsets') && !u.includes('/fontsets/')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
        fontsets: eSets.map((r) => Object.assign({}, r)), active: eActive, migrated: true, adopted: false }) });
    }
    return baseHost(u, init);
  };
  const e = mount({ fetchImpl: statefulHost, store: eStore });
  await waitBoot();
  const editorTree = () => {
    const all = e.renderPanel().flatMap((t) => collectTree(t));
    const isJsonInput = (n) => n.type === 'input' && String((n.props || {}).accept || '').includes('.json');
    const hasImportBtn = (n) => collectTree(n).some((x) => x.type === 'button'
      && Array.isArray(x.children) && x.children.join('') === '导入字体集…');
    const cands = all.filter((n) => hasImportBtn(n) && collectTree(n).some(isJsonInput));
    cands.sort((a, b) => collectTree(a).length - collectTree(b).length);
    const fontsetCtl = cands[0];
    const allJson = all.filter(isJsonInput);
    const fileInput = fontsetCtl
      ? collectTree(fontsetCtl).find(isJsonInput)
      : (allJson.length === 1 ? allJson[0] : undefined);
    return {
      all,
      text: panelText(e),
      fileInput,
    };
  };
  check('「字体集预设」开关可驱动（面板上真的有这个 checkbox）', openFontSetEditor(e));
  await new Promise((r) => { setTimeout(r, 20); });
  const opened = editorTree();
  check('点开后编辑器与导入入口都出现', Boolean(opened.fileInput) && opened.text.includes('导入字体集…'));
  if (opened.fileInput) {
    const rowOf = opened.all.filter((n) => collectTree(n).some((x) => x === opened.fileInput)
      && collectTree(n).some((x) => x.type === 'button'));
    rowOf.sort((a, b) => collectTree(a).length - collectTree(b).length);
    const row = rowOf[0];
    check('定位自证：拿到的 .json input 属于**字体集编辑器**那一行（不是玻璃预设那枚）',
      Boolean(row) && collectTree(row).some((x) => x.type === 'button'
        && Array.isArray(x.children) && x.children.join('') === '新建（以当前外观）'),
      '同行按钮=' + (row ? collectTree(row).filter((x) => x.type === 'button')
        .map((x) => (Array.isArray(x.children) ? x.children.join('') : '')).filter(Boolean).join(' / ') : '找不到行'));
  }
  const EXPORTED = JSON.stringify({
    $schema: 'dsh-we/fontset@1', id: 'compact', name: '紧凑', values: HOST_VALUES,
  }, null, 2) + '\n';
  const feed = async (file) => {
    const at = e.requests.length;
    const input = editorTree().fileInput;
    if (input) input.props.onChange({ target: { files: [file], value: 'x.json' } });
    await new Promise((r) => { setTimeout(r, 20); });
    return { posted: e.requests.slice(at), text: editorTree().text };
  };
  const good = await feed({ name: 'compact.json', text: () => Promise.resolve(EXPORTED) });
  const importPosts = good.posted.filter((r) => r.method === 'POST' && r.url.includes('/fontsets/import'));
  check('导入成功 ⇒ POST 到 /fontsets/import，且体就是**导出的那份字节**（客户端这一半的往返闭合）',
    importPosts.length === 1 && importPosts[0].body === EXPORTED,
    importPosts.length ? ('body 长度 ' + String(importPosts[0].body).length) : '(没有 POST)');
  check('往返：宿主收到的体解析回来与导出前逐键相同（不比对时间戳这类不稳定字段）',
    importPosts.length === 1
    && JSON.stringify(JSON.parse(String(importPosts[0].body)).values) === JSON.stringify(HOST_VALUES));
  check('导入成功后清单被回读一次（新那一行就是反馈）',
    good.posted.some((r) => r.method === 'GET' && r.url.endsWith('/fontsets'))
    && !good.text.includes('字体集不可用'));
  const noRead = await feed({ name: 'x.json', text: () => Promise.reject(new Error('boom')) });
  check('文件读不出来 ⇒ 文案点明"读不出这个文件"，且**不发请求**',
    noRead.posted.length === 0 && noRead.text.includes('读不出这个文件'), noRead.text.slice(0, 60));
  const badJson = await feed({ name: 'x.json', text: () => Promise.resolve('这不是 JSON') });
  check('不是 JSON ⇒ 文案点明，且不发请求',
    badJson.posted.length === 0 && badJson.text.includes('这不是 JSON 文件'));
  const badTag = await feed({ name: 'x.json', text: () => Promise.resolve('{"$schema":"dsh-we/fontset@99","values":{}}') });
  check('版本不符 ⇒ 文案点明**要哪个标记**，且不发请求（笼统的"导入失败"等于什么都没说）',
    badTag.posted.length === 0 && badTag.text.includes('这不是字体集文件')
    && badTag.text.includes('dsh-we/fontset@1'), badTag.text.slice(0, 80));
  console.log('F. 新建：不问名字，客户端生成并立刻切过去');
  {
    const at = e.requests.length;
    const createBtn = editorTree().all.find((n) => n.type === 'button'
      && Array.isArray(n.children) && n.children.join('') === '新建（以当前外观）');
    check('「新建（以当前外观）」按钮在（面板上点得到）', Boolean(createBtn));
    if (createBtn) createBtn.props.onClick();
    await new Promise((r) => { setTimeout(r, 30); });
    const round = e.requests.slice(at);
    const created = round.filter((r) => r.method === 'PUT' && /\/fontsets\/set-/.test(r.url));
    check('新建 ⇒ PUT 一份新 id 的集，且名字是客户端生成的（面板没问过）',
      created.length === 1 && /"name":"我的字体集/.test(String(created[0].body)),
      created.length ? String(created[0].url).split('/').pop() + ' body 名字=' + (/"name":"([^"]*)"/.exec(String(created[0].body)) || [])[1] : '(没有 PUT)');
    const newId = created.length ? String(created[0].url).split('/').pop() : '';
    check('建完立刻切过去（activate 指向那个新 id）—— 用户的下一步一定是调它',
      Boolean(newId) && round.some((r) => r.method === 'POST' && r.url.endsWith('/fontsets/' + newId + '/activate')),
      'id=' + newId);
    await new Promise((r) => { setTimeout(r, 20); });
    const afterCreate = panelText(e);
    check('新建/切换之后马上又是「（使用中）」（激活确实采用了那一份，而不是只挪指针）',
      afterCreate.includes('（使用中）') && !afterCreate.includes('（已改）'), afterCreate.slice(-64));
    check('新建之后新那一行**立刻**出现在面板里（列表跟着刷新，不必重载）',
      afterCreate.includes('我的字体集'), afterCreate.slice(-70));
  }
  console.log('G. 宿主没有这条路由（裸 404）⇒ 文案自己说出去重启 DSH');
  {
    const bareFontsets = (body) => (url, init) => (String(url).includes('/fontsets')
      ? Promise.resolve({ ok: false, status: 404, json: body })
      : hostWith({ id: 'v', fontCustom: true })(url, init));
    const staleHost = bareFontsets(() => Promise.reject(new Error('empty body')));
    const g = mount({ fetchImpl: staleHost, store: {
      'dsh-wallpaper-engine:selection': JSON.stringify({ id: 'v' }),
      'dsh-wallpaper-engine:picker-tab': 'appearance',
    } });
    await waitBoot();
    openFontSetEditor(g);
    await new Promise((r) => { setTimeout(r, 20); });
    const staleText = panelText(g);
    check('裸 404（无 { error } 信封）⇒ 文案说"宿主里没有字体集路由：重启 DSH 后再试"',
      staleText.includes('重启 DSH 后再试') && staleText.includes('重启 DSH'), staleText.slice(0, 70));
    const enveloppedHost = bareFontsets(() => Promise.resolve({ error: 'not found' }));
    const h = mount({ fetchImpl: enveloppedHost, store: {
      'dsh-wallpaper-engine:selection': JSON.stringify({ id: 'v' }),
      'dsh-wallpaper-engine:picker-tab': 'appearance',
    } });
    await waitBoot();
    openFontSetEditor(h);
    await new Promise((r) => { setTimeout(r, 20); });
    const envText = panelText(h);
    check('成对项：带 `{ error }` 的 404 ⇒ 原话照搬（"not found"），**不**出现"重启 DSH"那句',
      envText.includes('not found') && !envText.includes('重启 DSH 后再试'), envText.slice(0, 70));
  }
  console.log('H. 切换：点「使用」⇒ 值真的换成那一份（不是只挪指针）');
  {
    const WIDE_VALUES = {
      themeColors: { primary: { light: '#ff0000', dark: '#00ff00' } },
      themeDarkSeparate: false,
      themeSize: { 'markdown-h1': 30 },
      themeWeight: {},
      themeFamily: {},
      globalFamily: '',
      componentFonts: {},
    };
    let active = 'compact';
    const twoSets = (url, init) => {
      const u = String(url);
      if (u.includes('/activate')) {
        const m = /\/fontsets\/([^/]+)\/activate/.exec(u);
        if (m) active = decodeURIComponent(m[1]);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
      }
      if (u.includes('/fontsets/')) {
        const m = /\/fontsets\/([^/?]+)/.exec(u);
        const id = m ? decodeURIComponent(m[1]) : 'compact';
        const values = id === 'wide' ? WIDE_VALUES : HOST_VALUES;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, id, name: id, values }) });
      }
      if (u.includes('/fontsets')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
          fontsets: [
            { id: 'compact', name: '紧凑', origin: 'builtin', active: active === 'compact' },
            { id: 'wide', name: '宽敞', origin: 'user', active: active === 'wide' },
          ], active, migrated: true, adopted: false,
        }) });
      }
      return hostWith({ id: 'v', fontCustom: true })(url, init);
    };
    const h = mount({ fetchImpl: twoSets, store: {
      'dsh-wallpaper-engine:selection': JSON.stringify({ id: 'v', fontCustom: true }),
      'dsh-wallpaper-engine:picker-tab': 'appearance',
    } });
    await waitBoot();
    openFontSetEditor(h);
    await new Promise((r) => { setTimeout(r, 20); });
    const before = panelText(h);
    check('切换前：活动那一份是「（使用中）」、另一份不是',
      before.includes('（使用中）') && !before.includes('（已改）'));
    const sizeOf = () => (h.renderPanel().flatMap((t) => collectTree(t))
      .find((n) => n.type === 'input' && /：字号 px/.test(String((n.props || {}).title || ''))) || {}).props;
    const rowText = (name) => {
      const rows = h.renderPanel().flatMap((t) => collectTree(t)).filter((n) => n.type === 'tr');
      const row = rows.map((r) => collectTree(r)).find((cells) => cells.some((c) => c.type === 'td'
        && collectTree(c).some((x) => Array.isArray(x.children) && x.children.join('') === name)));
      return row ? row.map((c) => collectTree(c).map((x) => (Array.isArray(x.children) ? x.children.filter((y) => typeof y === 'string').join('') : '')).join('')).join('') : '';
    };
    check('切换前：字号输入显示的是活动那份的值（24）', (sizeOf() || {}).value === 24, String((sizeOf() || {}).value));
    const at = h.requests.length;
    const useBtn = h.renderPanel().flatMap((t) => collectTree(t))
      .find((n) => n.type === 'button' && Array.isArray(n.children) && n.children.join('') === '使用');
    check('待切换那一行点得到「使用」', Boolean(useBtn));
    if (useBtn) useBtn.props.onClick();
    await new Promise((r) => { setTimeout(r, 30); });
    const round = h.requests.slice(at);
    check('「使用」⇒ POST activate 到那一份',
      round.some((r) => r.method === 'POST' && r.url.endsWith('/fontsets/wide/activate')),
      round.map((r) => r.method + ' ' + r.url.split('/').slice(-2).join('/')).join(' | '));
    check('并且真的**读了那一份的值**（GET /fontsets/wide）', round.some((r) => r.method === 'GET' && r.url.endsWith('/fontsets/wide')),
      round.filter((r) => r.method === 'GET').map((r) => r.url.split('/').pop()).join(','));
    check('值真的换了：字号输入从 24 变成 30（只挪指针的话这里纹丝不动）',
      (sizeOf() || {}).value === 30, String((sizeOf() || {}).value));
    const after = panelText(h);
    check('切换后：「（使用中）」搬到了**宽敞**那一行，紧凑那一行不再有它',
      after.includes('（使用中）') && !after.includes('（已改）')
      && rowText('宽敞').includes('（使用中）') && !rowText('紧凑').includes('（使用中）'),
      '宽敞=' + rowText('宽敞').slice(0, 40) + ' | 紧凑=' + rowText('紧凑').slice(0, 40));
    {
      const back = h.renderPanel().flatMap((t) => collectTree(t))
        .find((n) => n.type === 'button' && Array.isArray(n.children) && n.children.join('') === '使用');
      check('I 前置：可切回「紧凑」，让「宽敞」重新变成可删的一行', Boolean(back));
      if (back) back.props.onClick();
      await new Promise((r) => { setTimeout(r, 30); });
      const btnByText = (label) => h.renderPanel().flatMap((t) => collectTree(t))
        .find((n) => n.type === 'button' && Array.isArray(n.children) && n.children.join('') === label);
      const delBtn = btnByText('删除');
      check('I 前置：非活动那一行点得到「删除」', Boolean(delBtn));
      const at = h.requests.length;
      if (delBtn) delBtn.props.onClick();
      await new Promise((r) => { setTimeout(r, 20); });
      const asked = panelText(h).includes('删除「宽敞」？');
      check('I 第一下只置令牌：出现问句行，且**一个字节都不发**',
        asked && h.requests.length === at,
        'requests=' + (h.requests.length - at) + ' · 问句在=' + asked);
      const yes = btnByText('确认');
      check('I 问句行的「确认」在场（正路可达，不是死按钮）', Boolean(yes));
      if (yes) yes.props.onClick();
      await new Promise((r) => { setTimeout(r, 30); });
      const del = h.requests.slice(at).filter((r) => r.method === 'DELETE');
      check('I 「确认」⇒ DELETE 落在**正确的那一份**', del.some((r) => r.url.endsWith('/fontsets/wide')),
        h.requests.slice(at).map((r) => r.method + ' ' + r.url.split('/').pop()).join(' | ') || '(无请求)');
    }
  }
  console.log('J. 收起「字体集预设」：这条路径可达，且收起后视图与状态一致');
  {
    const j = mount({
      fetchImpl: hostWith({ id: 'v', fontCustom: true }),
      store: {
        'dsh-wallpaper-engine:selection': JSON.stringify({ id: 'v', fontCustom: true }),
        'dsh-wallpaper-engine:picker-tab': 'appearance',
      },
    });
    await waitBoot();
    const boxOf = () => j.renderPanel().flatMap((t) => collectTree(t))
      .find((n) => n.type === 'input' && n.props && n.props['aria-label'] === '字体集预设');
    const b0 = boxOf();
    check('J 前置：面板上有「字体集预设」开关（驱动的是真面板，不是替身）', Boolean(b0));
    if (b0) {
      b0.props.onChange({ target: { checked: true } });
      await new Promise((r) => { setTimeout(r, 20); });
      check('J 打开后编辑器真的渲染出来（「重命名」在场）', /重命名/.test(panelText(j)));
      const opened = boxOf();
      check('J 打开后开关处于开态（checked=true 可由面板读回）',
        Boolean(opened && opened.props.checked === true), 'checked=' + String(opened && opened.props.checked));
      if (opened) opened.props.onChange({ target: { checked: false } });
      await new Promise((r) => { setTimeout(r, 5); });
      check('J 收起后编辑器不在面板里（视图与状态一致）', !/重命名/.test(panelText(j)));
      const closed = boxOf();
      check('J 收起后开关回到关态', Boolean(closed && closed.props.checked === false),
        'checked=' + String(closed && closed.props.checked));
    }
  }
  console.log('');
  if (failures) { console.log('FONTSET LOAD SMOKE FAILED — ' + failures + ' failed'); process.exit(1); }
  console.log('FONTSET LOAD SMOKE PASSED');
})();
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const treeText = (root) => JSON.stringify(root);
function stringsUnder(root, clsPart) {
  const out = [];
  (function walk(node) {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    const cls = typeof (node.props && node.props.className) === 'string' ? node.props.className : '';
    const kids = Array.isArray(node.children) ? node.children : [];
    for (const kid of kids) {
      if (typeof kid === 'string') { if (cls.includes(clsPart)) out.push(kid); }
      else walk(kid);
    }
  })(root);
  return out;
}
function findNode(root, pred) {
  let hit = null;
  (function walk(node) {
    if (hit) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    if (pred(node)) { hit = node; return; }
    if (Array.isArray(node.children)) node.children.forEach(walk);
  })(root);
  return hit;
}
function findRow(root, needle) {
  return findNode(root, (n) => {
    const cls = typeof (n.props && n.props.className) === 'string' ? n.props.className : '';
    return cls.split(' ').includes('we-picker__row') && treeText(n).includes(needle);
  });
}
const isFileInput = (n) => n.type === 'input' && n.props && n.props.type === 'file';
const buttonIn = (row, text) => (row ? findNode(row, (n) => n.type === 'button'
  && Array.isArray(n.children) && n.children.length === 1 && n.children[0] === text) : null);
const uploadInFlight = (root) => stringsUnder(root, 'we-picker__hint').includes('上传中…');
const uploadedCount = (root) => {
  const line = stringsUnder(root, 'we-picker__hint').find((t) => /^已上传 \d+ 个$/.test(t));
  return line ? Number(line.replace(/\D/g, '')) : -1;
};
const errorLines = (root) => stringsUnder(root, 'we-picker__error');
const uploadErrorLines = (root) => errorLines(root).filter((t) => t.startsWith('上传失败：'));
const saveErrorLines = (root) => errorLines(root).filter((t) => t.startsWith('保存失败：'));
const uploadInputDisabled = (root) => {
  const input = findNode(root, isFileInput);
  return input ? input.props.disabled === true : null;
};
const uploadRequestOf = (calls) => calls[0] || null;
function uploadRequestCarries(req, file) {
  if (!req) return false;
  const title = file.name.replace(/\.[^.]+$/, '');
  return req.body === file
    && (req.headers || {})['Content-Type'] === file.type
    && req.url.includes('title=' + encodeURIComponent(title));
}
const weAssetsEditorOpen = (root) => findRow(root, 'WE assets') !== null;
const weAssetsDraftOf = (root) => {
  const input = findNode(root, (n) => n.type === 'input' && n.props
    && typeof n.props.placeholder === 'string' && n.props.placeholder.startsWith('WE assets'));
  return input ? input.props.value : null;
};
const weAssetsShown = (root) => {
  const row = findRow(root, '官方资源路径');
  const shown = row ? stringsUnder(row, 'we-picker__uploads-path') : [];
  return shown.length ? shown[0] : null;
};
const inventoryRefetchDelta = (before, after) => after - before;
const exactlyOneInventoryRefetch = (before, after) => inventoryRefetchDelta(before, after) === 1;
const weAssetsSaveDirOf = (call) => (call && call.body && typeof call.body.dir === 'string' ? call.body.dir : null);
const hasPickerRender = (renders) => renders.length > 0;
function mutateText(node, from, to) {
  if (typeof node === 'string') return node === from ? to : node;
  if (Array.isArray(node)) return node.map((n) => mutateText(n, from, to));
  if (!node || typeof node !== 'object') return node;
  const copy = Object.assign({}, node);
  if (Array.isArray(node.children)) copy.children = node.children.map((n) => mutateText(n, from, to));
  return copy;
}
function mutateProps(node, pred, patch) {
  if (Array.isArray(node)) return node.map((n) => mutateProps(n, pred, patch));
  if (!node || typeof node !== 'object') return node;
  const copy = Object.assign({}, node);
  if (pred(node)) copy.props = Object.assign({}, node.props || {}, patch);
  if (Array.isArray(node.children)) copy.children = node.children.map((n) => mutateProps(n, pred, patch));
  return copy;
}
const code = readFileSync(process.env.DSH_MUT_LIB || new URL('../lib/client.js', import.meta.url), 'utf8');
const React = {
  Fragment: 'Fragment',
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useRef: (v) => ({ current: v }),
  createElement: (type, props, ...children) =>
    (typeof type === 'function' ? type(props || {}) : ({ type, props: props || null, children })),
};
const byId = {};
const sandboxTimers = [];
function makeEl(tag) {
  return {
    tagName: String(tag).toUpperCase(),
    children: [],
    dataset: {},
    attributes: {},
    style: { _props: {}, setProperty(k, v) { this._props[k] = v; }, removeProperty(k) { delete this._props[k]; } },
    className: '',
    _parent: null,
    appendChild(c) { this.children.push(c); c._parent = this; if (c.id) byId[c.id] = c; return c; },
    remove() {
      if (this._parent) { const i = this._parent.children.indexOf(this); if (i >= 0) this._parent.children.splice(i, 1); }
      if (this.id) delete byId[this.id];
    },
    setAttribute(k, v) { this.attributes[k] = v; },
    removeAttribute(k) { delete this.attributes[k]; },
    querySelector() { return null; },
  };
}
const bodyEl = makeEl('body');
const document = {
  createElement: (t) => {
    const el = makeEl(t);
    if (t === 'img') {
      let _src = '';
      Object.defineProperty(el, 'src', {
        get: () => _src,
        set: (v) => { _src = String(v || ''); },
      });
    }
    return el;
  },
  getElementById: (id) => byId[id] || null,
  querySelector: () => null,
  head: makeEl('head'),
  body: bodyEl,
};
const localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = v; },
  removeItem(k) { delete this._store[k]; },
};
const inventoryCalls = [];
const uploadCalls = [];
const weAssetsCalls = [];
let uploadedOnce = false;
let weAssetsDirValue = null;
let weAssetsSaveStatus = 200;
let weAssetsSaveError = '';
let pendingUpload = null;
const assertState = (cond, msg) => { if (!cond) throw new Error('harness: ' + msg); };
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
const settleUpload = (status, body) => {
  const p = pendingUpload;
  assertState(!!p, 'settleUpload 必须在有在途上传时调用');
  pendingUpload = null;
  p.resolve({ status, json: () => Promise.resolve(body) });
};
function inventoryPayload() {
  const wallpapers = [
    { id: 'w1', title: '视频一', type: 'video', playable: true, media: '/wallpaper-engine/media/w1', preview: null, contentrating: 'Everyone' },
    { id: 'w2', title: '图片二', type: 'image', playable: true, media: '/wallpaper-engine/media/w2', preview: null, contentrating: 'Everyone' },
  ];
  if (uploadedOnce) {
    wallpapers.push({ id: 'up-1', title: '刚上传', type: 'image', playable: true, media: '/wallpaper-engine/media/up-1', preview: null });
    wallpapers.push({ id: 'up-dir-2', title: '目录项目', type: 'image', playable: false, media: null, preview: null });
  }
  return {
    installDir: 'D:/we', uploadDir: 'D:/we/uploads', weAssetsDir: weAssetsDirValue,
    weAssetsAvailable: false, total: wallpapers.length, portableCount: wallpapers.length,
    playlists: [], wallpapers,
  };
}
const fetch = (url, opts) => {
  const u = String(url);
  const method = String((opts && opts.method) || 'GET').toUpperCase();
  const headers = (opts && opts.headers) || {};
  if (u.includes('/wallpaper-engine/inventory')) {
    inventoryCalls.push(u);
    return Promise.resolve({ status: 200, json: () => Promise.resolve(inventoryPayload()) });
  }
  if (method === 'POST' && u.includes('/wallpaper-engine/upload?') && !u.includes('upload-dir')) {
    uploadCalls.push({ url: u, headers, body: opts && opts.body });
    pendingUpload = deferred();
    return pendingUpload.promise;
  }
  if (method === 'POST' && u.includes('/wallpaper-engine/we-assets-dir')) {
    let body;
    try { body = JSON.parse((opts && opts.body) || '{}'); } catch { body = null; }
    weAssetsCalls.push({ url: u, body });
    const ok = weAssetsSaveStatus >= 200 && weAssetsSaveStatus < 300;
    if (ok) weAssetsDirValue = (body && typeof body.dir === 'string' && body.dir) ? body.dir : null;
    return Promise.resolve({
      status: weAssetsSaveStatus,
      json: () => Promise.resolve(ok ? { ok: true, weAssetsDir: weAssetsDirValue } : { error: weAssetsSaveError }),
    });
  }
  if (u.includes('/wallpaper-engine/settings')) {
    return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true }) });
  }
  return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true }) });
};
const cap = { handoff: null };
const sandbox = {
  window: {
    __ModuleLoader__: { load: (h) => { cap.handoff = h; } },
    setTimeout: (fn, ms) => { const t = { fn, ms, cleared: false }; sandboxTimers.push(t); return t; },
    clearTimeout: (t) => { if (t) t.cleared = true; },
  },
  document, localStorage, fetch, React,
  setTimeout: (fn, ms) => { const t = { fn, ms, cleared: false }; sandboxTimers.push(t); return t; },
  clearTimeout: (t) => { if (t) t.cleared = true; },
  setInterval: (fn, ms) => { const t = { fn, ms, cleared: false, interval: true }; sandboxTimers.push(t); return t; },
  clearInterval: (t) => { if (t) t.cleared = true; },
};
vm.createContext(sandbox);
new vm.Script(code, { filename: 'client.js' }).runInContext(sandbox);
const { factory } = cap.handoff;
const requireMock = (spec) => {
  if (spec === 'react') return React;
  if (spec === 'react-dom') return { createPortal: (node) => node };
  throw new Error('unexpected require: ' + spec);
};
const exportsObj = factory(requireMock);
const pickerRenders = [];
const slots = {
  inject: (key, cb) => cb(),
  register: (opts, render) => { pickerRenders.push(render); },
};
const ctx = { slots, effect(fn) { fn(); return fn; } };
exportsObj.apply(ctx);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const render = () => pickerRenders[0]();
await sleep(80);
let failures = 0;
const check = (label, cond, detail) => {
  if (cond) console.log('  ✓ ' + label + (detail ? ' — ' + detail : ''));
  else { failures++; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
};
const UPLOAD_OK_FILE = { name: 'wall.png', type: 'image/png' };
const UPLOAD_BAD_FILE = { name: 'wall-again.png', type: 'image/png' };
const UPLOAD_FAIL_REASON = '磁盘已满（测试）';
const WE_ASSETS_OK_DIR = 'D:/we-assets';
const WE_ASSETS_FAIL_DIR = 'Z:/no-such-drive';
const WE_ASSETS_FAIL_REASON = '无法在该路径创建目录（权限不足或路径被占用）';
const pickFileInput = (root) => findNode(root, isFileInput);
const pickFile = (root, file) => pickFileInput(root).props.onChange({ target: { files: [file], value: '' } });
console.log('0. 挂载台自检');
{
  check('挂载：settings.section 注册了 picker 渲染回调（否则以下判据全部空转）',
    hasPickerRender(pickerRenders), 'render 回调 ' + pickerRenders.length + ' 个');
  check('负对照：空渲染回调列表被同一条判据判为未注册',
    !hasPickerRender([]));
}
const initialTree = render();
console.log('1. 上传：选中 File → 上传中 → 成功计数');
{
  check('上传前：「已上传 0 个」（up-dir- 目录项目此时也不在库里）',
    uploadedCount(initialTree) === 0, 'N=' + uploadedCount(initialTree));
  check('负对照：变异文案（已上传 3 个）被同一条判据读成 3（判据读的是渲染值，不是常量）',
    uploadedCount(mutateText(initialTree, '已上传 0 个', '已上传 3 个')) === 3);
  check('空闲：file input 未禁用（sel.uploading === false）',
    uploadInputDisabled(initialTree) === false);
  check('负对照：把同一棵树的 file input 变异成 disabled 后，同一条判据判为已禁用',
    uploadInputDisabled(mutateProps(initialTree, isFileInput, { disabled: true })) === true);
  const beforeUpload = inventoryCalls.length;
  pickFile(initialTree, UPLOAD_OK_FILE);
  const pendingTree = render();
  check('上传：选中的 File 原样进 POST 体，MIME 用文件声明值，标题进 query',
    uploadRequestCarries(uploadRequestOf(uploadCalls), UPLOAD_OK_FILE),
    uploadRequestOf(uploadCalls) ? uploadRequestOf(uploadCalls).url : '(无请求)');
  check('负对照：没有请求 / 换成别的 body 时，同一条判据判为「不是这个 File」',
    !uploadRequestCarries(uploadRequestOf([]), UPLOAD_OK_FILE)
    && !uploadRequestCarries({ url: uploadRequestOf(uploadCalls).url, headers: { 'Content-Type': 'image/png' }, body: { name: 'other.png' } }, UPLOAD_OK_FILE));
  check('上传中：出现「上传中…」提示行',
    uploadInFlight(pendingTree));
  check('负对照：把「上传中…」变异成其它文案后，同一条判据判为没有在途提示',
    !uploadInFlight(mutateText(pendingTree, '上传中…', '上传完成')));
  check('上传中：file input 被禁用（不能并发选第二个文件）',
    uploadInputDisabled(pendingTree) === true);
  check('负对照：上传前的同一棵树上，同一条判据判为未禁用（判据能区分两个状态）',
    uploadInputDisabled(initialTree) === false);
  uploadedOnce = true;
  settleUpload(200, { id: 'up-1' });
  await sleep(30);
  const successTree = render();
  check('上传成功：「已上传 1 个」（up-1 计入，up-dir-2 目录项目不计入）',
    uploadedCount(successTree) === 1, 'N=' + uploadedCount(successTree));
  check('负对照：把该行变异成「已上传 7 个」后，同一条判据读成 7（计数不是写死的 1）',
    uploadedCount(mutateText(successTree, '已上传 1 个', '已上传 7 个')) === 7);
  check('上传成功：在途提示消失',
    !uploadInFlight(successTree));
  check('上传成功：恰好一次 /inventory 重拉（新条目靠这次重拉进库存）',
    exactlyOneInventoryRefetch(beforeUpload, inventoryCalls.length),
    'delta=' + inventoryRefetchDelta(beforeUpload, inventoryCalls.length));
  check('负对照：改成 +2 次重拉的计数实参，同一条判据判为不满足「恰好一次」',
    !exactlyOneInventoryRefetch(beforeUpload, beforeUpload + 2));
  const beforeFailedUpload = inventoryCalls.length;
  pickFile(successTree, UPLOAD_BAD_FILE);
  const failPendingTree = render();
  check('上传失败腿：请求在途时同样处于「上传中…」（先清掉上一次的错误行）',
    uploadInFlight(failPendingTree) && uploadErrorLines(failPendingTree).length === 0);
  check('负对照：上一腿成功结算后的树上，同一条判据判为没有在途提示',
    !uploadInFlight(successTree));
  settleUpload(500, { error: UPLOAD_FAIL_REASON });
  await sleep(30);
  const uploadFailTree = render();
  const expectedUploadError = '上传失败：' + UPLOAD_FAIL_REASON;
  check('上传失败：错误行逐字显示 uploadError（宿主给的原因）',
    uploadErrorLines(uploadFailTree).includes(expectedUploadError),
    uploadErrorLines(uploadFailTree).join(' | ') || '(无错误行)');
  check('负对照：把该错误行变异成别的原因后，同一条判据不再命中（文案不是恒真）',
    !uploadErrorLines(mutateText(uploadFailTree, expectedUploadError, '上传失败：其它原因')).includes(expectedUploadError));
  check('负对照：成功结算后的树上该通道没有任何错误行（同一条判据在两个状态上结论相反）',
    uploadErrorLines(successTree).length === 0);
  check('上传失败：不重拉库存（没有新条目要合并）',
    inventoryRefetchDelta(beforeFailedUpload, inventoryCalls.length) === 0,
    'delta=' + inventoryRefetchDelta(beforeFailedUpload, inventoryCalls.length));
  check('负对照：同一条「恰好一次」判据在失败腿上为假（成功腿的 +1 不是计数器噪声）',
    !exactlyOneInventoryRefetch(beforeFailedUpload, inventoryCalls.length));
  check('上传失败：计数不变（失败不会凭空多出一条）',
    uploadedCount(uploadFailTree) === 1, 'N=' + uploadedCount(uploadFailTree));
}
console.log('2. 目录编辑器（官方资源路径）：保存 ⇒ 恰好一次 /inventory 重拉');
{
  check('目录编辑器：初始关闭',
    !weAssetsEditorOpen(initialTree));
  check('目录编辑器：未配置时该行显示占位符「—」',
    weAssetsShown(initialTree) === '—', 'shown=' + JSON.stringify(weAssetsShown(initialTree)));
  check('负对照：把该行的显示值变异成目标路径后，同一条判据读成目标路径',
    weAssetsShown(mutateText(initialTree, '—', WE_ASSETS_OK_DIR)) === WE_ASSETS_OK_DIR);
  const row = findRow(render(), '官方资源路径');
  const openBtn = buttonIn(row, weAssetsDirValue ? '更改' : '设置');
  assertState(!!openBtn, '「官方资源路径」行必须有打开编辑器的按钮');
  openBtn.props.onClick();
  const openTree = render();
  check('目录编辑器：点「设置」后草稿输入行打开且预填宿主当前值',
    weAssetsEditorOpen(openTree) && weAssetsDraftOf(openTree) === '');
  check('负对照：同一棵初始树上，同一条「编辑器打开」判据判为关闭',
    !weAssetsEditorOpen(initialTree));
  const editorRow = findRow(openTree, 'WE assets');
  const draftInput = findNode(editorRow, (n) => n.type === 'input' && n.props
    && typeof n.props.placeholder === 'string' && n.props.placeholder.startsWith('WE assets'));
  assertState(!!draftInput, '编辑器里必须有草稿输入框');
  draftInput.props.onInput({ target: { value: WE_ASSETS_OK_DIR } });
  const beforeSave = inventoryCalls.length;
  buttonIn(findRow(render(), 'WE assets'), '保存').props.onClick();
  await sleep(30);
  const savedTree = render();
  check('目录保存：POST 体携带草稿路径',
    weAssetsSaveDirOf(weAssetsCalls[0]) === WE_ASSETS_OK_DIR,
    JSON.stringify(weAssetsCalls[0] ? weAssetsCalls[0].body : null));
  check('负对照：换成别的目录的请求体，同一条判据判为不匹配',
    weAssetsSaveDirOf({ body: { dir: 'D:/elsewhere' } }) !== WE_ASSETS_OK_DIR);
  check('目录保存成功：恰好一次 /inventory 重拉',
    exactlyOneInventoryRefetch(beforeSave, inventoryCalls.length),
    'delta=' + inventoryRefetchDelta(beforeSave, inventoryCalls.length));
  check('负对照：+2 次重拉的计数实参被同一条判据判为不满足「恰好一次」',
    !exactlyOneInventoryRefetch(beforeSave, beforeSave + 2));
  check('目录保存成功：行上显示宿主重拉回来的新路径（inventory 是真源）且编辑器关闭',
    weAssetsShown(savedTree) === WE_ASSETS_OK_DIR && !weAssetsEditorOpen(savedTree),
    'shown=' + JSON.stringify(weAssetsShown(savedTree)));
  check('负对照：把该行显示值变异回占位符后，同一条判据不再等于新路径',
    weAssetsShown(mutateText(savedTree, WE_ASSETS_OK_DIR, '—')) !== WE_ASSETS_OK_DIR);
  check('目录保存成功：没有「保存失败：」错误行（同一次会话里上传失败的残留行不算）',
    saveErrorLines(savedTree).length === 0,
    saveErrorLines(savedTree).join(' | ') || '(空)');
  check('负对照：同一判据能把「保存失败：」那一行点出来（成功腿的空集不是判据失灵）',
    saveErrorLines({ props: { className: 'we-picker__error' }, children: ['保存失败：宿主拒绝'] })
      .includes('保存失败：宿主拒绝'));
  const reopenRow = findRow(savedTree, '官方资源路径');
  const changeBtn = buttonIn(reopenRow, '更改');
  assertState(!!changeBtn, '已配置后按钮文案必须是「更改」');
  changeBtn.props.onClick();
  const reopenedTree = render();
  const failInput = findNode(findRow(reopenedTree, 'WE assets'), (n) => n.type === 'input' && n.props
    && typeof n.props.placeholder === 'string' && n.props.placeholder.startsWith('WE assets'));
  failInput.props.onInput({ target: { value: WE_ASSETS_FAIL_DIR } });
  weAssetsSaveStatus = 400;
  weAssetsSaveError = WE_ASSETS_FAIL_REASON;
  const beforeFailSave = inventoryCalls.length;
  buttonIn(findRow(render(), 'WE assets'), '保存').props.onClick();
  await sleep(30);
  const saveFailTree = render();
  const expectedSaveError = '保存失败：' + WE_ASSETS_FAIL_REASON;
  check('目录保存失败：错误行逐字显示 weAssetsError（宿主给的原因）',
    saveErrorLines(saveFailTree).includes(expectedSaveError),
    saveErrorLines(saveFailTree).join(' | ') || '(无错误行)');
  check('负对照：改写成别的原因后同一条判据不再命中，且成功腿上该通道为空（两腿结论相反）',
    !saveErrorLines(mutateText(saveFailTree, expectedSaveError, '保存失败：其它原因')).includes(expectedSaveError)
    && saveErrorLines(savedTree).length === 0);
  check('目录保存失败：不重拉库存（宿主没改，重拉只会白跑）',
    !exactlyOneInventoryRefetch(beforeFailSave, inventoryCalls.length),
    'delta=' + inventoryRefetchDelta(beforeFailSave, inventoryCalls.length));
  check('负对照：同一条判据在成功腿上为真（+1 确实来自保存动作）',
    exactlyOneInventoryRefetch(beforeSave, beforeSave + 1));
  check('目录保存失败：编辑器保持打开且草稿保留（用户能改一改再存）',
    weAssetsEditorOpen(saveFailTree) && weAssetsDraftOf(saveFailTree) === WE_ASSETS_FAIL_DIR,
    'draft=' + JSON.stringify(weAssetsDraftOf(saveFailTree)));
  check('负对照：成功关闭后的同一棵树上，同一条判据判为关闭且无草稿',
    !weAssetsEditorOpen(savedTree) && weAssetsDraftOf(savedTree) === null);
}
console.log('');
console.log(failures === 0 ? 'ALL PICKER UPLOAD CHECKS PASSED' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
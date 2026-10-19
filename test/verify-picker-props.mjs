import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const classTokens = (n) => {
  const c = n && n.props && n.props.className;
  return typeof c === 'string' ? c.split(/\s+/).filter(Boolean) : [];
};
const hasClass = (n, cls) => classTokens(n).includes(cls);
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
function findAllNodes(root, pred) {
  const out = [];
  (function walk(node) {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    if (pred(node)) out.push(node);
    if (Array.isArray(node.children)) node.children.forEach(walk);
  })(root);
  return out;
}
const findByClass = (root, cls) => findNode(root, (n) => hasClass(n, cls));
const findAllByClass = (root, cls) => findAllNodes(root, (n) => hasClass(n, cls));
function textUnder(node) {
  let out = '';
  (function walk(n) {
    if (typeof n === 'string') { out += n; return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n.children)) n.children.forEach(walk);
  })(node);
  return out;
}
const treeText = (root) => JSON.stringify(root);
const propsEntry = (root) => findNode(root, (n) => hasClass(n, 'we-picker__btn') && textUnder(n) === '壁纸属性');
const propsPanel = (root) => findByClass(root, 'we-picker__props');
const propsNote = (root) => {
  const head = findByClass(root, 'we-picker__props-head');
  const note = head ? findByClass(head, 'we-picker__props-note') : null;
  return note ? textUnder(note) : null;
};
const propsStamp = (root) => {
  const raw = propsNote(root);
  if (raw === null) return null;
  return raw.indexOf('·') === -1 ? null : raw;
};
const propRows = (root) => findAllByClass(root, 'we-picker__props-row');
const rowByLabel = (root, label) =>
  findNode(root, (n) => hasClass(n, 'we-picker__props-row') && treeText(n).includes(label));
const rowVisible = (root, label) => rowByLabel(root, label) !== null;
const controlIn = (row, cls) => (row ? findByClass(row, cls) : null);
const optionList = (selectNode) => (selectNode && Array.isArray(selectNode.children)
  ? selectNode.children.flat().filter(Boolean)
  : []);
const overriddenRows = (root) => propRows(root).filter((r) => findByClass(r, 'we-picker__props-dot')).length;
const resetButton = (root) => {
  const head = findByClass(root, 'we-picker__props-head');
  return head ? findNode(head, (n) => n.type === 'button') : null;
};
function propsClassNodes(root) {
  const panel = propsPanel(root);
  if (!panel) return [];
  const nodes = [];
  (function walk(node, depth) {
    if (Array.isArray(node)) { node.forEach((c) => walk(c, depth)); return; }
    if (!node || typeof node !== 'object') return;
    const toks = classTokens(node).map((t) => depth + ':' + t);
    if (toks.length) nodes.push(toks);
    if (Array.isArray(node.children)) node.children.forEach((c) => walk(c, depth + 1));
  })(panel, 0);
  return nodes;
}
const propsClassSequence = (root) => propsClassNodes(root).flat();
const sequenceMatches = (seq, golden) =>
  seq.length === golden.length && seq.every((t, i) => t === golden[i]);
function mutateText(node, from, to) {
  if (typeof node === 'string') return node.includes(from) ? node.split(from).join(to) : node;
  if (Array.isArray(node)) return node.map((n) => mutateText(n, from, to));
  if (!node || typeof node !== 'object') return node;
  const copy = Object.assign({}, node);
  if (Array.isArray(node.children)) copy.children = node.children.map((n) => mutateText(n, from, to));
  return copy;
}
function withoutClass(node, cls) {
  if (Array.isArray(node)) return node.map((n) => withoutClass(n, cls));
  if (!node || typeof node !== 'object') return node;
  if (hasClass(node, cls)) return null;
  const copy = Object.assign({}, node);
  if (Array.isArray(node.children)) {
    copy.children = node.children.map((n) => withoutClass(n, cls)).filter((n) => n !== null);
  }
  return copy;
}
function bumpFirstRowDepth(seq) {
  const out = seq.slice();
  const i = out.findIndex((t) => t.endsWith(':we-picker__props-row'));
  if (i >= 0) {
    const cls = out[i].slice(out[i].indexOf(':') + 1);
    out[i] = (Number(out[i].slice(0, out[i].indexOf(':'))) + 1) + ':' + cls;
  }
  return out;
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
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    blur() {},
    querySelector() { return null; },
  };
}
const bodyEl = makeEl('body');
const document = {
  createElement: (t) => {
    const el = makeEl(t);
    if (t === 'img' || t === 'iframe') {
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
const SELECTION_KEY = 'dsh-wallpaper-engine:selection';
const PICKER_TAB_KEY = 'dsh-wallpaper-engine:picker-tab';
const localStorage = {
  _store: {
    [SELECTION_KEY]: JSON.stringify({ id: 'webA' }),
    [PICKER_TAB_KEY]: 'wallpaper',
  },
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = v; },
  removeItem(k) { delete this._store[k]; },
};
const PROPS_TOKEN = 'tokA';
const PROPS_PATH = '/wallpaper-engine/props/' + PROPS_TOKEN;
const PROPS_TOKEN_B = 'tokB';
const PROPS_PATH_B = '/wallpaper-engine/props/' + PROPS_TOKEN_B;
const PROPS_FAIL_REASON = 'project.json 读不出来（测试）';
const WALLPAPERS = [
  { id: 'img1', title: '图片壁纸一', type: 'image', playable: true, media: '/wallpaper-engine/media/img1', preview: null, contentrating: 'Everyone' },
  { id: 'scn1', title: '场景壁纸一', type: 'scene', playable: true, media: null, frameUrl: '/wallpaper-engine/scene-frame/scn1', preview: null, contentrating: 'Everyone' },
  { id: 'webA', title: '网页壁纸 A', type: 'web', playable: true, media: '/wallpaper-engine/media/webA', preview: null, contentrating: 'Everyone', propsUrl: PROPS_PATH },
  { id: 'webB', title: '网页壁纸 B', type: 'web', playable: true, media: '/wallpaper-engine/media/webB', preview: null, contentrating: 'Everyone', propsUrl: PROPS_PATH_B },
];
const inventoryCalls = [];
const propsCalls = [];
const inventoryPayload = () => ({
  installDir: 'D:/we', uploadDir: 'D:/we/uploads', weAssetsDir: null, weAssetsAvailable: false,
  total: WALLPAPERS.length, portableCount: WALLPAPERS.length, playlists: [], wallpapers: WALLPAPERS,
});
const PROPS_DEFS = [
  { name: 'look', ptype: 'text', text: '外观', order: 0, value: null, default: null, overridden: false },
  { name: 'bgcolor', ptype: 'color', text: '背景颜色', order: 1, value: '0.1 0.2 0.3', default: '0 0 0', overridden: false },
  { name: 'speed', ptype: 'slider', text: '速度', order: 2, value: 1.5, default: 1, overridden: true, min: 0, max: 4, step: 0.1, precision: 1 },
  { name: 'glow', ptype: 'bool', text: '发光', order: 3, value: false, default: false, overridden: false },
  { name: 'mode', ptype: 'combo', text: '模式', order: 4, value: 2, default: 1, overridden: false,
    options: [{ label: '慢', value: 1 }, { label: '快', value: 2 }] },
  { name: 'customImage', ptype: 'file', text: '自定义图片', order: 5, value: '', default: '', overridden: false,
    files: ['a.png', 'b.jpg'] },
  { name: 'note', ptype: 'textinput', text: '备注', order: 6, value: 'hi', default: '', overridden: false },
  { name: 'extra', ptype: 'bool', text: '仅在发光时可见', order: 7, value: false, default: false, overridden: false,
    condition: 'glow == true' },
];
const propsPayload = (props, token) => ({ ok: true, token: token || PROPS_TOKEN, props, overrides: {}, hasProject: true });
let pendingProps = null;
let propsStatus = 200;
let propsBody = null;
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
function settleProps(status, body) {
  if (!pendingProps) throw new Error('harness: settleProps 必须在有在途请求时调用');
  const p = pendingProps;
  pendingProps = null;
  p.resolve({ status, json: () => Promise.resolve(body) });
}
const fetch = (url, opts) => {
  const u = String(url);
  const method = String((opts && opts.method) || 'GET').toUpperCase();
  if (u.includes('/wallpaper-engine/inventory')) {
    inventoryCalls.push(u);
    return Promise.resolve({ status: 200, json: () => Promise.resolve(inventoryPayload()) });
  }
  if (u.includes('/wallpaper-engine/props/')) {
    propsCalls.push({ url: u, method });
    if (propsStatus !== 200) {
      return Promise.resolve({ status: propsStatus, json: () => Promise.resolve({ ok: false, error: PROPS_FAIL_REASON }) });
    }
    if (propsBody) return Promise.resolve({ status: 200, json: () => Promise.resolve(propsBody) });
    pendingProps = deferred();
    return pendingProps.promise;
  }
  if (u.includes('/wallpaper-engine/settings')) {
    return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true }) });
  }
  return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true }) });
};
const winListeners = {};
const docListeners = {};
const addTo = (reg) => (ev, fn) => { (reg[ev] ||= []).push(fn); };
const removeFrom = (reg) => (ev, fn) => {
  const a = reg[ev]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
};
const cap = { handoff: null };
const sandbox = {
  window: {
    __ModuleLoader__: { load: (h) => { cap.handoff = h; } },
    setTimeout: (fn, ms) => { const t = { fn, ms, cleared: false }; sandboxTimers.push(t); return t; },
    clearTimeout: (t) => { if (t) t.cleared = true; },
    addEventListener: addTo(winListeners),
    removeEventListener: removeFrom(winListeners),
  },
  document, localStorage, fetch, React,
  setTimeout: (fn, ms) => { const t = { fn, ms, cleared: false }; sandboxTimers.push(t); return t; },
  clearTimeout: (t) => { if (t) t.cleared = true; },
  setInterval: (fn, ms) => { const t = { fn, ms, cleared: false, interval: true }; sandboxTimers.push(t); return t; },
  clearInterval: (t) => { if (t) t.cleared = true; },
};
document.addEventListener = addTo(docListeners);
document.removeEventListener = removeFrom(docListeners);
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
await sleep(80);
const EXPECTED_PROPS_GOLDEN = [
  '0:we-picker__props',
  '1:we-picker__props-head',
  '2:we-picker__props-title',
  '2:we-picker__props-note',
  '2:we-picker__btn 2:we-picker__btn--mini',
  '1:we-picker__props-hint',
  '1:we-picker__props-section',
  '1:we-picker__props-row',
  '2:we-picker__props-label',
  '2:we-picker__props-color',
  '1:we-picker__props-row',
  '2:we-picker__props-label',
  '3:we-picker__slider',
  '3:we-picker__props-value',
  '1:we-picker__props-row',
  '2:we-picker__props-label',
  '2:we-picker__props-check',
  '1:we-picker__props-row',
  '2:we-picker__props-label',
  '2:we-picker__props-select',
  '1:we-picker__props-row',
  '2:we-picker__props-label',
  '2:we-picker__props-select',
  '1:we-picker__props-row',
  '2:we-picker__props-label',
  '2:we-picker__props-text',
].join(' ').split(' ');
const EXPECTED_PROPS_LENGTH = 27;
let failures = 0;
const check = (label, cond, detail) => {
  if (cond) console.log('  ✓ ' + label + (detail ? ' — ' + detail : ''));
  else { failures++; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
};
const hasPickerRender = (renders) => renders.length > 0;
const render = () => pickerRenders[0]();
const flushPersist = () => {
  for (const t of sandboxTimers.filter((x) => !x.cleared && !x.fired && x.ms === 200)) {
    t.fired = true;
    t.fn();
  }
};
const persisted = () => JSON.parse(localStorage._store[SELECTION_KEY] || '{}');
const persistedUserProps = () => persisted().userProps || {};
function openModal(root) {
  const btn = findNode(root, (n) => hasClass(n, 'we-picker__btn')
    && Array.isArray(n.children) && n.children.length === 1 && n.children[0] === '选择壁纸');
  if (!btn) throw new Error('harness: 找不到「选择壁纸」入口');
  btn.props.onClick();
}
function closeModal(root) {
  const btn = findNode(root, (n) => hasClass(n, 'we-picker__btn')
    && Array.isArray(n.children) && n.children.length === 1 && n.children[0] === '返回');
  if (!btn) throw new Error('harness: 找不到库视图的「返回」入口');
  btn.props.onClick();
}
function pickCard(root, title) {
  const card = findNode(root, (n) => hasClass(n, 'we-picker__card') && n.props && n.props.title === title);
  if (!card) throw new Error('harness: 网格里没有这张卡：' + title);
  card.props.onClick();
}
console.log('0. 挂载台自检');
{
  check('挂载：settings.section 注册了 picker 渲染回调（否则后面每条判据都在空跑）',
    hasPickerRender(pickerRenders), 'render 回调 ' + pickerRenders.length + ' 个');
  check('夹具：启动链确实拉过库存（判据读的是真渲染，不是空树）',
    inventoryCalls.length >= 1, inventoryCalls.length + ' 次 /inventory');
}
console.log('\n1. 入口可达：只有「场景/网页 + propsUrl」才出「壁纸属性」');
let tree = render();
{
  check('网页壁纸（有 propsUrl）⇒ 出「壁纸属性」按钮',
    !!propsEntry(tree) && textUnder(propsEntry(tree)) === '壁纸属性');
  openModal(tree);
  tree = render();
  pickCard(tree, '图片壁纸一');
  tree = render();
  closeModal(tree);
  tree = render();
  check('图片壁纸 ⇒ 不出（同一条判据，换输入）', propsEntry(tree) === null);
  openModal(tree);
  tree = render();
  pickCard(tree, '场景壁纸一');
  tree = render();
  closeModal(tree);
  tree = render();
  check('场景壁纸（无 propsUrl）⇒ 不出（类型对也拦得住）', propsEntry(tree) === null);
  openModal(tree);
  tree = render();
  pickCard(tree, '网页壁纸 A');
  tree = render();
  closeModal(tree);
  tree = render();
  check('切回网页壁纸 ⇒ 按钮回来（判据对输入敏感，不是恒假）', propsEntry(tree) !== null);
  check('负对照：文案不符或类不符的按钮树，同一条判据判为"不出"',
    propsEntry({ props: { className: 'we-picker__btn' }, children: ['别的按钮'] }) === null
      && propsEntry({ props: { className: 'we-picker__card' }, children: ['壁纸属性'] }) === null);
}
console.log('\n2. 面板本体：在途 → 落地（先证明它真的渲染出来了）');
{
  propsEntry(tree).props.onClick();
  tree = render();
  check('点「壁纸属性」⇒ 真的发出一次 /props/<token> 请求（面板不是靠假状态画出来的）',
    propsCalls.length === 1 && propsCalls[0].url.endsWith('/props/' + PROPS_TOKEN),
    propsCalls.map((c) => c.url).join(' ') || '（一次都没发）');
  check('应答未落定 ⇒ 面板已渲染，头部说明是「读取中…」',
    !!propsPanel(tree) && propsNote(tree) === '读取中…');
  check('读取中不得先把行画出来（此时宿主还没给属性表）', propRows(tree).length === 0);
  check('负对照：把「读取中…」换成别的文案后，同一条判据判为假',
    propsNote(mutateText(tree, '读取中…', '读取完毕')) !== '读取中…');
  check('负对照：删掉头部后同一条判据给 null（不是"恰好也算读取中"）',
    propsNote(withoutClass(tree, 'we-picker__props-head')) === null);
  settleProps(200, propsPayload(PROPS_DEFS));
  await sleep(0);
  tree = render();
  const panel = propsPanel(tree);
  check('属性表落地 ⇒ 面板渲染出来（防空跑锚点：根 + 头部都在）',
    !!panel && !!findByClass(tree, 'we-picker__props-head') && !!findByClass(tree, 'we-picker__props-title'));
  check('绝对锚点：可见属性行 = 6（8 条属性 − 1 分组标题 − 1 条件不满足）',
    propRows(tree).length === 6, propRows(tree).length + ' 行');
  check('分组标题（ptype=text）渲染成 section，不占行',
    !!findByClass(tree, 'we-picker__props-section')
      && textUnder(findByClass(tree, 'we-picker__props-section')).includes('外观'));
  check('落地后头部说明清空（不再声称读取中）', propsNote(tree) === '');
  check('实时渲染未接管 ⇒ 明说改动何时生效（sel.sceneLiveActive 为假）',
    textUnder(findByClass(tree, 'we-picker__props-hint')).includes('实时渲染当前未接管'));
  check('已改过的属性带「已改」圆点（本夹具恰好 1 条 overridden）',
    overriddenRows(tree) === 1, overriddenRows(tree) + ' 条');
  check('负对照：空面板不得算作「行数达标」',
    propRows(withoutClass(tree, 'we-picker__props-row')).length === 0
      && propRows(withoutClass(tree, 'we-picker__props-row')).length !== 6);
}
console.log('\n3. 每个 ptype 出对得上的控件（renderUserPropRow 的各分支）');
{
  const boolRow = rowByLabel(tree, '发光');
  const boolInput = controlIn(boolRow, 'we-picker__props-check');
  check('bool ⇒ checkbox（且未勾选时 checked === false）',
    !!boolInput && boolInput.type === 'input' && boolInput.props.type === 'checkbox'
      && boolInput.props.checked === false);
  const colorInput = controlIn(rowByLabel(tree, '背景颜色'), 'we-picker__props-color');
  check('color ⇒ type=color，WE 的 "r g b" 浮点串换算成 #rrggbb（0.1/0.2/0.3 ⇒ #1a334d）',
    !!colorInput && colorInput.props.type === 'color' && colorInput.props.value === '#1a334d',
    colorInput ? String(colorInput.props.value) : '（没有颜色控件）');
  const sliderRow = rowByLabel(tree, '速度');
  const sliderInput = controlIn(sliderRow, 'we-picker__slider');
  check('slider ⇒ range，min/max/step 来自属性声明',
    !!sliderInput && sliderInput.props.min === 0 && sliderInput.props.max === 4 && sliderInput.props.step === 0.1);
  const shownValue = findByClass(sliderRow, 'we-picker__props-value');
  check('slider 的数值回显按 precision 格式化（1.5 ⇒ "1.5"）',
    !!shownValue && textUnder(shownValue) === '1.5', shownValue ? textUnder(shownValue) : '（没有回显）');
  const comboSelect = controlIn(rowByLabel(tree, '模式'), 'we-picker__props-select');
  const comboLabels = optionList(comboSelect).map((o) => textUnder(o));
  check('combo ⇒ select，值用**下标**（声明值 2 ⇒ "1"），选项文案来自宿主',
    !!comboSelect && comboSelect.props.value === '1'
      && JSON.stringify(comboLabels) === JSON.stringify(['慢', '快']),
    JSON.stringify(comboLabels));
  const fileSelect = controlIn(rowByLabel(tree, '自定义图片'), 'we-picker__props-select');
  const fileValues = optionList(fileSelect).map((o) => o.props && o.props.value);
  check('file ⇒ select：首项是「（默认）」空值，候选文件来自宿主',
    !!fileSelect && fileSelect.props.value === ''
      && JSON.stringify(fileValues) === JSON.stringify(['', 'a.png', 'b.jpg']),
    JSON.stringify(fileValues));
  const textInput = controlIn(rowByLabel(tree, '备注'), 'we-picker__props-text');
  check('兜底分支（textinput）⇒ 文本输入，默认值是宿主给的值',
    !!textInput && textInput.props.type === 'text' && textInput.props.defaultValue === 'hi');
  check('负对照：颜色行里没有 checkbox（同一条控件判据对别的行判为 null）',
    controlIn(rowByLabel(tree, '背景颜色'), 'we-picker__props-check') === null);
  check('负对照：滑块行里没有文本输入（分支没被张冠李戴）',
    controlIn(rowByLabel(tree, '速度'), 'we-picker__props-text') === null);
}
console.log('\n4. condition 显隐：条件属性按当前值进出（不是一次性渲染）');
{
  check('glow == false ⇒ 「仅在发光时可见」那一行不渲染', !rowVisible(tree, '仅在发光时可见'));
  const boolInput = controlIn(rowByLabel(tree, '发光'), 'we-picker__props-check');
  boolInput.props.onChange({ target: { checked: true } });
  tree = render();
  check('勾上 glow ⇒ 条件成立，那一行出现（行数 6 → 7）',
    rowVisible(tree, '仅在发光时可见') && propRows(tree).length === 7,
    propRows(tree).length + ' 行');
  check('负对照：把标签文案改掉后同一条判据判为不可见',
    !rowVisible(mutateText(tree, '仅在发光时可见', '改过的标签'), '仅在发光时可见'));
  check('负对照：空渲染树对同一条判据一律不可见', !rowVisible({}, '仅在发光时可见'));
}
console.log('\n5. 改动落地：写进设置（按 token 存）+ 拖动中不重渲染 + 恢复默认');
{
  flushPersist();
  check('勾选 ⇒ 落进设置的 userProps[token]（200ms 去抖后写进 localStorage）',
    persistedUserProps()[PROPS_TOKEN] && persistedUserProps()[PROPS_TOKEN].glow === true,
    JSON.stringify(persistedUserProps()));
  check('负对照：换个 token 读同一条判据 ⇒ 读不到（判据真的按 token 取）',
    !(persistedUserProps()['other-token'] && persistedUserProps()['other-token'].glow === true));
  const comboSelect = controlIn(rowByLabel(tree, '模式'), 'we-picker__props-select');
  comboSelect.props.onChange({ target: { value: '1' } });
  tree = render();
  flushPersist();
  check('combo 改动按**声明类型**回写（下标 1 ⇒ 数字 2，不是字符串 "2"）',
    persistedUserProps()[PROPS_TOKEN].mode === 2, JSON.stringify(persistedUserProps()[PROPS_TOKEN]));
  const fileSelect = controlIn(rowByLabel(tree, '自定义图片'), 'we-picker__props-select');
  fileSelect.props.onChange({ target: { value: 'b.jpg' } });
  tree = render();
  flushPersist();
  check('file 改动回写相对路径', persistedUserProps()[PROPS_TOKEN].customImage === 'b.jpg');
  const colorInput = controlIn(rowByLabel(tree, '背景颜色'), 'we-picker__props-color');
  colorInput.props.onChange({ target: { value: '#ff0000' } });
  tree = render();
  flushPersist();
  check('color 改动回写成 WE 的 "r g b" 浮点串',
    persistedUserProps()[PROPS_TOKEN].bgcolor === '1 0 0', String(persistedUserProps()[PROPS_TOKEN].bgcolor));
  const sliderInput = controlIn(rowByLabel(tree, '速度'), 'we-picker__slider');
  sliderInput.props.onInput({ target: { value: '3' } });
  flushPersist();
  check('滑块拖动（silent）⇒ 设置里已是新值',
    Number(persistedUserProps()[PROPS_TOKEN].speed) === 3);
  check('滑块拖动（silent）⇒ 旧渲染树里的回显**没变**（拖动中不 emit）',
    textUnder(findByClass(rowByLabel(tree, '速度'), 'we-picker__props-value')) === '1.5');
  controlIn(rowByLabel(tree, '速度'), 'we-picker__slider').props.onChange({ target: { value: '3' } });
  tree = render();
  check('滑块 change ⇒ 重渲染后回显跟上（precision=1 ⇒ "3.0"）',
    textUnder(findByClass(rowByLabel(tree, '速度'), 'we-picker__props-value')) === '3.0');
  const reset = resetButton(tree);
  check('「恢复默认」在**有覆盖**时可用', !!reset && reset.props.disabled === false);
  reset.props.onClick();
  tree = render();
  flushPersist();
  check('恢复默认 ⇒ 该 token 的覆盖整条消失（不是留一个空对象）',
    !(PROPS_TOKEN in persistedUserProps()), JSON.stringify(persistedUserProps()));
  check('恢复默认 ⇒ 没有任何行再带「已改」圆点', overriddenRows(tree) === 0);
  check('恢复默认 ⇒ 按钮自己变成不可用（没有可恢复的东西了）',
    resetButton(tree).props.disabled === true);
  check('恢复默认 ⇒ 回显回到宿主给的默认值（3.0 ⇒ 1.0）',
    textUnder(findByClass(rowByLabel(tree, '速度'), 'we-picker__props-value')) === '1.0');
}
console.log('\n6. 标记等价：面板子树的 class 序列与搬迁前逐字一致');
{
  const glowInput = controlIn(rowByLabel(tree, '发光'), 'we-picker__props-check');
  if (glowInput) { glowInput.props.onChange({ target: { checked: false } }); tree = render(); }
  const nodes = propsClassNodes(tree);
  const seq = propsClassSequence(tree);
  check('绝对锚点：面板 class 令牌数（空序列不得算通过）', seq.length === EXPECTED_PROPS_LENGTH,
    seq.length + ' 个令牌');
  check('绝对锚点：面板里确实有 6 行（防"两边都空"也算等价）', propRows(tree).length === 6);
  check('面板标记序列与搬迁前录下的 golden 逐字一致', sequenceMatches(seq, EXPECTED_PROPS_GOLDEN));
  check('负对照：删掉一个类名 ⇒ 判据变假',
    !sequenceMatches(seq.filter((_, i) => i !== 4), EXPECTED_PROPS_GOLDEN));
  check('负对照：插入一个类名 ⇒ 判据变假',
    !sequenceMatches(seq.concat(['0:we-picker__props-fake']), EXPECTED_PROPS_GOLDEN));
  check('负对照：只把一个节点的层级挪一格（长度不变）⇒ 判据变假',
    !sequenceMatches(bumpFirstRowDepth(seq), EXPECTED_PROPS_GOLDEN));
  check('负对照：空序列不得算作"一致"', !sequenceMatches([], EXPECTED_PROPS_GOLDEN));
  check('负对照：删掉整棵面板（root 为 null）⇒ 序列为空、判据变假',
    !sequenceMatches(propsClassSequence(withoutClass(tree, 'we-picker__props')), EXPECTED_PROPS_GOLDEN));
  check('判据非空转：节点分组数与序列非空', nodes.length > 10 && seq.length > 0);
}
console.log('\n7. 失败腿：宿主非 2xx / 2xx 但体说 not-ok ⇒ 头部给出可读原因（不假装成"没有属性"）');
{
  const togglePanel = () => { propsEntry(tree).props.onClick(); tree = render(); };
  togglePanel();
  propsStatus = 503;
  togglePanel();
  await sleep(0);
  tree = render();
  check('宿主 503 ⇒ 面板头部显示「读取失败」，且不画任何属性行',
    propsNote(tree) === '读取失败' && propRows(tree).length === 0,
    String(propsNote(tree)));
  check('失败态下「恢复默认」不可用（没有属性可恢复）',
    resetButton(tree).props.disabled === true);
  check('负对照：把「读取失败」换成别的文案后，同一条判据判为假',
    propsNote(mutateText(tree, '读取失败', '读取成功')) !== '读取失败');
  propsStatus = 200;
  propsBody = { ok: false, error: PROPS_FAIL_REASON };
  togglePanel();
  togglePanel();
  await sleep(0);
  tree = render();
  check('2xx + {ok:false,error} ⇒ 头部显示宿主给的原因（不是客户端兜底文案）',
    propsNote(tree) === PROPS_FAIL_REASON, String(propsNote(tree)));
  check('负对照：换成客户端兜底文案后同一条判据判为假', propsNote(tree) !== '读取失败');
  propsBody = null;
  togglePanel();
  togglePanel();
  settleProps(200, propsPayload(PROPS_DEFS));
  await sleep(0);
  tree = render();
  check('重拉成功 ⇒ 属性行回来（失败是可恢复的）', propRows(tree).length === 6,
    propRows(tree).length + ' 行');
}
console.log('\n8. 说明句按**成因**自陈（空表的三种成因必须能分辨；排查期的读数已撤除）');
{
  check('成功态：说明句为空，且头部**没有**任何读数（排查期的 token/条数已撤除）',
    propsNote(tree) === '' && propsStamp(tree) === null, JSON.stringify(propsNote(tree)));
  check('负对照：把读数加回来会被同一条判据判出',
    propsStamp({ type: 'div', props: { className: 'we-picker__props-head' }, children: [
      { type: 'span', props: { className: 'we-picker__props-note' }, children: [' · tokA · 8'] },
    ] }) !== null);
  const toggle = () => { propsEntry(tree).props.onClick(); tree = render(); };
  propsBody = propsPayload([], PROPS_TOKEN);
  toggle(); toggle();
  await sleep(0);
  tree = render();
  check('宿主回空表 ⇒ 头部说明「这张壁纸没有用户属性…」（且没有读数）',
    propsNote(tree) === '这张壁纸没有用户属性（project.json 的 general.properties）'
      && propsStamp(tree) === null, String(propsNote(tree)));
  check('负对照：空表不得被说成「当前条件下没有可调项」（两种成因分开写）',
    propsNote(tree) !== '当前条件下没有可调项');
  check('负对照：空表也不得显示「读取中…」', propsNote(tree) !== '读取中…');
  const ALL_HIDDEN = [
    { name: 'bgcolor', ptype: 'color', text: '背景颜色', value: '0 0 0', default: '0 0 0', overridden: false, condition: 'glow == true' },
    { name: 'glow', ptype: 'bool', text: '发光', value: false, default: false, overridden: false, condition: 'bgcolor != "0 0 0"' },
  ];
  propsBody = propsPayload(ALL_HIDDEN, PROPS_TOKEN);
  toggle(); toggle();
  await sleep(0);
  tree = render();
  check('属性都被 condition 挡住 ⇒ 头部说明「当前条件下没有可调项」（读数不存在）',
    propsNote(tree) === '当前条件下没有可调项' && propsStamp(tree) === null
      && propRows(tree).length === 0, String(propsNote(tree)));
  check('负对照：这种成因不得被说成「这张壁纸没有用户属性」',
    propsNote(tree) !== '这张壁纸没有用户属性（project.json 的 general.properties）');
  propsBody = null;
  toggle(); toggle();
  settleProps(200, propsPayload(PROPS_DEFS, PROPS_TOKEN));
  await sleep(0);
  tree = render();
  check('回到 A 的成功态（换壁纸判据的前置）', propRows(tree).length === 6);
  openModal(tree); tree = render();
  pickCard(tree, '网页壁纸 B');
  tree = render();
  closeModal(tree); tree = render();
  check('开着的面板切到另一张壁纸：不画上一张的属性行，并明说正在取这张的',
    propRows(tree).length === 0 && propsNote(tree) === '正在取这张壁纸的属性…',
    String(propsNote(tree)) + ' / ' + propRows(tree).length + ' 行');
  check('换壁纸途中不画上一张的行（说明句 = 正在取这张的，且没有残留行）',
    propRows(tree).length === 0 && propsNote(tree) === '正在取这张壁纸的属性…',
    String(propsNote(tree)));
  settleProps(200, propsPayload(PROPS_DEFS, PROPS_TOKEN_B));
  await sleep(0);
  tree = render();
  check('B 的属性到达 ⇒ 行回来（切换不是单向门）', propRows(tree).length === 6,
    propRows(tree).length + ' 行');
}
console.log('\n9. 清掉壁纸 ⇒ 面板收起（不留一个挂在开关上的空面板）');
{
  const clearBtn = () => findNode(tree, (n) => hasClass(n, 'we-picker__btn') && textUnder(n) === '清除');
  check('前置：面板开着、且有「清除」按钮可点', !!propsPanel(tree) && !!clearBtn());
  clearBtn().props.onClick();
  tree = render();
  check('清掉壁纸后：面板收起（不再画面板），头部文案与读数一并消失',
    !propsPanel(tree) && propsNote(tree) === null && propsStamp(tree) === null,
    '面板=' + Boolean(propsPanel(tree)));
  const staleShell = { type: 'div', props: { className: 'we-picker__props' }, children: [] };
  check('负对照：残留一个空面板壳会被同一条判据判出（判据不是"反正都没有"）',
    !!propsPanel(staleShell) && !propsPanel(tree));
  const entry = propsEntry(tree);
  check('清掉壁纸后入口本身也不在了（没有可调对象）', entry === null);
}
console.log('');
if (failures) {
  console.log('PICKER PROPS CHECKS FAILED — ' + failures + ' failed');
  process.exit(1);
}
console.log('ALL PICKER PROPS CHECKS PASSED');
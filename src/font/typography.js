const THEME_TYPE_SOURCE = 'wallpaper-engine-typography';

const GLOBAL_FAMILY_TOKEN = '--dsw-font-family';

const THEME_SIZE_MIN = 8;
const THEME_SIZE_MAX = 48;

const DELTA = 'var(--dsh-content-font-delta)';
const BODY_SIZE = 'var(--dsh-content-font-size,14px)';
const BODY_SIZE_2 = 'var(--dsh-content-font-size-secondary,13px)';

const THEME_TYPE_ROLES = [

  { id: 'markdown-h1', get label() { return weT('标题 1'); }, prefix: '700', size: `calc(21px + ${DELTA})`, defaultPx: 21 },
  { id: 'markdown-h2', get label() { return weT('标题 2'); }, prefix: '700', size: `calc(19px + ${DELTA})`, defaultPx: 19 },
  { id: 'markdown-h3', get label() { return weT('标题 3'); }, prefix: '700', size: `calc(18px + ${DELTA})`, defaultPx: 18 },
  { id: 'markdown-h4', get label() { return weT('标题 4'); }, prefix: '600', size: BODY_SIZE, defaultPx: 14 },
  { id: 'markdown-base', get label() { return weT('对话正文'); }, prefix: '', size: BODY_SIZE, defaultPx: 14 },
  { id: 'markdown-small', get label() { return weT('小字说明'); }, prefix: '', size: '12px', defaultPx: 12 },
  { id: 'markdown-code', get label() { return weT('行内代码'); }, prefix: '', size: '12px', defaultPx: 12 },
  { id: 'markdown-code-block', get label() { return weT('代码块'); }, prefix: '', size: '11px', defaultPx: 11 },
  { id: 'markdown-table', get label() { return weT('表格'); }, prefix: '', size: BODY_SIZE_2, defaultPx: 13 },
  { id: 'markdown-table-head', get label() { return weT('表头'); }, prefix: '500', size: BODY_SIZE_2, defaultPx: 13 },

  { id: 'xs-13', get label() { return weT('界面小字'); }, prefix: '', size: '13px', defaultPx: 13 },
  { id: 'xxs-12', get label() { return weT('界面极小字'); }, prefix: '', size: '12px', defaultPx: 12 },
];

const typeTokenNames = (role) => ({
  size: `--dsw-font-${role}-font-size`,
  lineHeight: `--dsw-font-${role}-line-height`,
  family: `--dsw-font-${role}-font-family`,
  weight: `--dsw-font-${role}-font-weight`,
  shorthand: `--dsw-font-${role}`,
});

function isTypeSize(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= THEME_SIZE_MIN && v <= THEME_SIZE_MAX;
}

function buildTypePayload(sizes, isAvailable, weights, families, resolveFamily, globalFamily) {
  const szs = sizes && typeof sizes === 'object' ? sizes : {};
  const wts = weights && typeof weights === 'object' ? weights : {};
  const fams = families && typeof families === 'object' ? families : {};
  const ok = typeof isAvailable === 'function' ? isAvailable : () => true;
  const resolve = typeof resolveFamily === 'function' ? resolveFamily : (() => '');

  const globalKey = typeof globalFamily === 'string' ? globalFamily.trim() : '';
  const globalStack = globalKey ? resolve(globalKey) : '';
  const useGlobal = typeof globalStack === 'string' && globalStack.length > 0 && globalStack !== 'inherit';
  const payload = {};
  const roles = [];

  if (useGlobal && ok(GLOBAL_FAMILY_TOKEN)) {
    payload[GLOBAL_FAMILY_TOKEN] = { light: globalStack, dark: globalStack };
  }
  for (const role of THEME_TYPE_ROLES) {
    const sz = szs[role.id];
    const useSize = isTypeSize(sz);
    const w = wts[role.id];
    const useWeight = typeof w === 'number' && Number.isInteger(w) && w >= 100 && w <= 900;
    const famKey = typeof fams[role.id] === 'string' && fams[role.id] ? fams[role.id] : '';

    const famStack = famKey ? resolve(famKey)
      : (useGlobal && (useSize || useWeight) ? globalStack : '');
    const useFamily = typeof famStack === 'string' && famStack.length > 0;
    if (!useSize && !useWeight && !useFamily) continue;
    const t = typeTokenNames(role.id);

    const need = [t.size, t.lineHeight, t.family, t.shorthand];
    if (useWeight) need.push(t.weight);
    if (!need.every((n) => ok(n))) continue;
    let prefix = role.prefix ? role.prefix + ' ' : '';
    if (useWeight) {
      payload[t.weight] = { light: String(Math.round(w)), dark: String(Math.round(w)) };
      prefix = `var(${t.weight}) `;
    }
    if (useFamily) {

      payload[t.family] = { light: famStack, dark: famStack };
    }

    if (useSize) payload[t.size] = { light: sz + 'px', dark: sz + 'px' };
    const sizeExpr = useSize ? sz + 'px' : `var(${t.size})`;

    const shorthand = `${prefix}${sizeExpr} / var(${t.lineHeight}) var(${t.family})`;
    payload[t.shorthand] = { light: shorthand, dark: shorthand };
    roles.push(role.id);
  }
  return { payload, roles };
}

export {
  THEME_TYPE_SOURCE, THEME_TYPE_ROLES,
  THEME_SIZE_MIN, THEME_SIZE_MAX,
  buildTypePayload,
};

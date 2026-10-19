const THEME_LAYER_SOURCE = 'wallpaper-engine';

const THEME_COLOR_ROLES = [
  { id: 'primary', get label() { return weT('正文'); }, tokens: ['--dsw-alias-label-primary'] },
  { id: 'secondary', get label() { return weT('次要文字'); }, tokens: ['--dsw-alias-label-secondary'] },
  { id: 'tertiary', get label() { return weT('弱化说明'); }, tokens: ['--dsw-alias-label-tertiary'] },
  { id: 'caption', get label() { return weT('极小说明'); }, tokens: ['--dsw-alias-label-caption'] },
  { id: 'dimmed', get label() { return weT('禁用 / 更弱'); }, tokens: ['--dsw-alias-label-dimmed', '--dsw-alias-label-primary-dimmed'] },
];

const THEME_HEX_RE = /^#[0-9a-f]{6}$/i;

function isThemeHex(v) {
  return typeof v === 'string' && THEME_HEX_RE.test(v.trim());
}

const themeLayerRolesBySource = Object.create(null);
function themeLayerOwnedRoles() { return (themeLayerRolesBySource[THEME_LAYER_SOURCE] || []).slice(); }

function scanThemeTokens(doc) {
  const found = new Set();
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || !d.styleSheets) return found;
  const visit = (rules) => {
    for (const rule of rules || []) {
      const style = rule && rule.style;
      if (!style) {
        if (rule && rule.cssRules) visit(rule.cssRules);
        continue;
      }
      for (let i = 0; i < style.length; i++) {
        const prop = style.item ? style.item(i) : style[i];
        if (typeof prop === 'string' && prop.startsWith('--dsw-')) found.add(prop);
      }
      if (rule.cssRules) visit(rule.cssRules);
    }
  };
  for (const sheet of d.styleSheets) {
    try { visit(sheet.cssRules); } catch {   }
  }
  return found;
}

function buildTokenPayload(colors, isAvailable) {
  const payload = {};
  const roles = [];
  const src = colors && typeof colors === 'object' ? colors : {};
  for (const role of THEME_COLOR_ROLES) {
    const v = src[role.id];
    if (!v || typeof v !== 'object') continue;
    const light = isThemeHex(v.light) ? v.light.trim() : null;
    const dark = isThemeHex(v.dark) ? v.dark.trim() : null;
    if (!light || !dark) continue;
    const usable = role.tokens.filter((t) => (typeof isAvailable === 'function' ? isAvailable(t) : true));
    if (!usable.length) continue;
    for (const t of usable) payload[t] = { light, dark };
    roles.push(role.id);
  }
  return { payload, roles };
}

function pollThemeService(ctx, opts) {
  const o = opts || {};
  const intervalMs = o.intervalMs || 250;
  const timeoutMs = o.timeoutMs === undefined ? 6000 : o.timeoutMs;
  const setT = o.setTimeoutFn || (typeof setTimeout === 'function' ? setTimeout : null);
  const clearT = o.clearTimeoutFn || (typeof clearTimeout === 'function' ? clearTimeout : null);
  if (!setT) { if (o.onGiveUp) o.onGiveUp('no-timer'); return () => {}; }
  let cancelled = false;
  let waited = 0;
  let handle = null;
  const lookup = () => {
    if (typeof ctx.get !== 'function') return null;
    try { return ctx.get('theme') || null; } catch { return null; }
  };
  const tick = () => {
    if (cancelled) return;
    const theme = lookup();
    if (theme) { if (o.onReady) o.onReady(theme); return; }
    waited += intervalMs;
    if (waited >= timeoutMs) { if (o.onGiveUp) o.onGiveUp('timeout'); return; }
    handle = setT(tick, intervalMs);
  };
  tick();
  return () => { cancelled = true; if (handle !== null && clearT) clearT(handle); };
}

function createThemeLayer(opts) {
  const o = opts || {};
  const theme = o.theme;

  const source = o.source || THEME_LAYER_SOURCE;
  const getColors = o.getColors || (() => ({}));
  const isAvailable = o.isAvailable || (() => true);

  const build = o.buildPayload || (() => buildTokenPayload(getColors(), isAvailable));
  let dispose = null;
  let owned = [];
  let firstWriteDone = false;
  let applies = 0, disposes = 0, attempts = 0;

  function releaseLayer() {
    if (dispose) {
      try { dispose(); } catch {   }
      dispose = null;
      disposes++;
    }
    owned = [];
    themeLayerRolesBySource[source] = [];
  }

  function sync() {
    attempts++;
    if (!theme || typeof theme.overrideTokens !== 'function') return { ok: false, reason: 'no-theme' };
    const { payload, roles } = build();
    if (!Object.keys(payload).length) {

      releaseLayer();
      return { ok: false, reason: 'empty' };
    }

    if (!firstWriteDone) {
      firstWriteDone = true;
      try { if (o.onBeforeFirstWrite) o.onBeforeFirstWrite(); } catch {   }
    }
    try {

      dispose = theme.overrideTokens(source, payload);
      applies++;
    } catch (e) {
      dispose = null;
      releaseLayer();
      return { ok: false, reason: 'throw', error: String((e && e.message) || e).slice(0, 120) };
    }
    owned = roles;
    themeLayerRolesBySource[source] = roles.slice();
    return { ok: true, roles };
  }

  return {
    sync,
    dispose: releaseLayer,
    ownedRoles: () => owned.slice(),
    stats: () => ({ applies, disposes, attempts, roles: owned.length }),
  };
}

export {
  THEME_LAYER_SOURCE, THEME_COLOR_ROLES,
  isThemeHex, themeLayerOwnedRoles, scanThemeTokens, buildTokenPayload,
  pollThemeService, createThemeLayer,
};

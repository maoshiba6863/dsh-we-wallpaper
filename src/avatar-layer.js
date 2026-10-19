const AVATAR_FLOW_SIDES = { user: 'user', steering: 'user', 'assistant-step': 'ai' };

const AVATAR_ROW_SELECTOR = '[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"], [data-chat-flow-kind="assistant-step"]';

const AVATAR_ROW_ATTR = 'data-we-avatar-row';
const AVATAR_NODE_CLASS = 'we-avatar';
const AVATAR_NODE_ATTR = 'data-we-avatar-node';

const AVATAR_CONT_CLASS = 'we-avatar--cont';

const AVATAR_ATTR = 'data-we-avatar';
const AVATAR_VAR_SIZE = '--we-avatar-size';
const AVATAR_VAR_ROUND = '--we-avatar-round';

const AVATAR_IMAGE_KEYS = { user: 'avatarUserImage', ai: 'avatarAiImage' };

const AVATAR_CLAMP_SIZE = { min: 24, max: 72, def: 40 };
const AVATAR_CLAMP_RADIUS = { min: 0, max: 100, def: 100 };

const AVATAR_GLYPH_PARTS = {
  user: [
    ['circle', { cx: '8', cy: '5.6', r: '2.5' }],
    ['path', { d: 'M3.4 13.2c0-2.3 2.1-3.8 4.6-3.8s4.6 1.5 4.6 3.8' }],
  ],
  ai: [
    ['path', { d: 'M8 2.2l1.35 3.9a1.6 1.6 0 0 0 1 1l3.9 1.35-3.9 1.35a1.6 1.6 0 0 0-1 1L8 14.7l-1.35-3.9a1.6 1.6 0 0 0-1-1L1.75 8.45l3.9-1.35a1.6 1.6 0 0 0 1-1z' }],
  ],
};
const AVATAR_GLYPH_VIEW_BOX = '0 0 16 16';

let avatarObserver = null;
let avatarActive = false;

let avatarGroupRaf = 0;

function avatarImageUrl(side, selLike) {
  const sel = selLike || selection;
  const key = AVATAR_IMAGE_KEYS[side];
  const name = key && sel ? String(sel[key] || '') : '';
  if (!name) return '';
  return apiUrl('/avatar/' + side + '?v=' + encodeURIComponent(name));
}

function avatarGlyphSvgString(side, size) {
  const parts = AVATAR_GLYPH_PARTS[side] || AVATAR_GLYPH_PARTS.user;
  const px = (Number(size) > 0 ? Number(size) : 16);
  const attrs = 'viewBox="' + AVATAR_GLYPH_VIEW_BOX + '" width="' + px + '" height="' + px
    + '" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"'
    + ' stroke-linejoin="round" aria-hidden="true" focusable="false"';
  const inner = parts.map(([tag, a]) => '<' + tag + ' '
    + Object.keys(a).map((k) => k + '="' + a[k] + '"').join(' ') + '/>').join('');
  return '<svg ' + attrs + '>' + inner + '</svg>';
}

function renderAvatarGlyph(side, size) {
  const parts = AVATAR_GLYPH_PARTS[side] || AVATAR_GLYPH_PARTS.user;
  const px = (Number(size) > 0 ? Number(size) : 16);
  return React.createElement("svg", {
    viewBox: AVATAR_GLYPH_VIEW_BOX,
    width: px,
    height: px,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.4",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
  }, parts.map(([tag, a]) => React.createElement(tag, a)));
}

function avatarFillNode(node, side) {
  const url = avatarImageUrl(side);
  const want = url ? 'img' : 'glyph';
  if (node.getAttribute('data-we-avatar-kind') === want) {
    if (want === 'img') {
      const img = node.firstElementChild;
      const src = img ? img.getAttribute('src') : '';
      if (src !== url) { try { img.setAttribute('src', url); } catch {   } }
    }
    return;
  }
  node.setAttribute('data-we-avatar-kind', want);
  try { node.textContent = ''; } catch {   }
  if (want === 'img') {
    const img = document.createElement('img');
    img.className = AVATAR_NODE_CLASS + '__img';
    img.setAttribute('alt', '');
    img.setAttribute('draggable', 'false');
    img.setAttribute('src', url);
    node.appendChild(img);
  } else {
    const glyph = document.createElement('span');
    glyph.className = AVATAR_NODE_CLASS + '__glyph';
    glyph.innerHTML = avatarGlyphSvgString(side, 16);
    node.appendChild(glyph);
  }
}

function avatarDecorateRow(row) {
  if (!row || typeof row.getAttribute !== 'function') return false;
  const side = AVATAR_FLOW_SIDES[row.getAttribute('data-chat-flow-kind')];
  if (!side) return false;
  const marked = row.getAttribute(AVATAR_ROW_ATTR);
  if (marked === side) {
    const node = row.firstElementChild;
    if (node && node.classList && node.classList.contains(AVATAR_NODE_CLASS)) {
      avatarFillNode(node, side);
      return false;
    }

    row.removeAttribute(AVATAR_ROW_ATTR);
  } else if (marked) {

    const old = row.firstElementChild;
    if (old && old.classList && old.classList.contains(AVATAR_NODE_CLASS)) {
      try { old.remove(); } catch {   }
    }
    row.removeAttribute(AVATAR_ROW_ATTR);
  }
  const node = document.createElement('div');
  node.className = AVATAR_NODE_CLASS + ' ' + AVATAR_NODE_CLASS + '--' + side;
  node.setAttribute(AVATAR_NODE_ATTR, side);
  node.setAttribute('aria-hidden', 'true');
  avatarFillNode(node, side);

  row.setAttribute(AVATAR_ROW_ATTR, side);
  try { row.insertBefore(node, row.firstChild); } catch {   }
  return true;
}

function avatarSweep() {
  if (typeof document.querySelectorAll !== 'function') return;
  let rows;
  try { rows = document.querySelectorAll(AVATAR_ROW_SELECTOR); } catch { return; }
  for (const row of rows) avatarDecorateRow(row);

  avatarApplyGrouping();
}

function avatarApplyGrouping() {
  if (!avatarActive || typeof document.querySelectorAll !== 'function') return;
  let rows;
  try { rows = document.querySelectorAll(AVATAR_ROW_SELECTOR); } catch { return; }
  let prev = '';
  for (const row of rows) {
    const side = AVATAR_FLOW_SIDES[row.getAttribute('data-chat-flow-kind')];
    if (!side) continue;
    const node = row.firstElementChild;
    if (node && node.classList && node.classList.contains(AVATAR_NODE_CLASS)) {
      try { node.classList.toggle(AVATAR_CONT_CLASS, side === prev); } catch {   }
    }
    prev = side;
  }
}

function avatarScheduleGrouping() {
  if (avatarGroupRaf) return;
  if (typeof requestAnimationFrame !== 'function') { avatarApplyGrouping(); return; }
  avatarGroupRaf = requestAnimationFrame(() => {
    avatarGroupRaf = 0;
    avatarApplyGrouping();
  });
}

function avatarOnMutations(records) {
  if (!avatarActive) return;
  let decorated = false;
  for (const r of records) {
    const added = r.addedNodes;
    if (!added || !added.length) continue;
    for (const n of added) {
      if (!n || n.nodeType !== 1) continue;
      try {
        if (n.matches && n.matches(AVATAR_ROW_SELECTOR)) {
          if (avatarDecorateRow(n)) decorated = true;
          continue;
        }
        if (n.closest && n.closest('[' + AVATAR_ROW_ATTR + ']')) continue;
      } catch { continue; }
      let inner;
      try { inner = n.querySelectorAll ? n.querySelectorAll(AVATAR_ROW_SELECTOR) : []; } catch { inner = []; }
      for (const row of inner) { if (avatarDecorateRow(row)) decorated = true; }
    }
  }

  if (decorated) avatarScheduleGrouping();
}

function avatarStop() {
  avatarActive = false;
  if (avatarObserver) {
    try { avatarObserver.disconnect(); } catch {   }
    avatarObserver = null;
  }

  if (avatarGroupRaf) {
    try { if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(avatarGroupRaf); } catch {   }
    avatarGroupRaf = 0;
  }
  if (typeof document === 'undefined' || !document) return;
  const body = weBody();
  if (body) {
    body.removeAttribute(AVATAR_ATTR);
    body.style.removeProperty(AVATAR_VAR_SIZE);
    body.style.removeProperty(AVATAR_VAR_ROUND);
  }

  if (typeof document.querySelectorAll !== 'function') return;
  let nodes = [];
  try { nodes = document.querySelectorAll('[' + AVATAR_NODE_ATTR + ']'); } catch {   }
  for (const n of nodes) { try { n.remove(); } catch {   } }
  let rows = [];
  try { rows = document.querySelectorAll('[' + AVATAR_ROW_ATTR + ']'); } catch {   }
  for (const row of rows) { try { row.removeAttribute(AVATAR_ROW_ATTR); } catch {   } }
}

function syncAvatarLayer() {
  const on = selection.avatarEnabled === true;
  const body = weBody();
  if (!on || !body || typeof MutationObserver !== 'function') {
    if (avatarActive || avatarObserver) avatarStop();
    else if (body) { body.removeAttribute(AVATAR_ATTR); body.style.removeProperty(AVATAR_VAR_SIZE); body.style.removeProperty(AVATAR_VAR_ROUND); }
    return;
  }
  const size = weClampTo(selection.avatarSize, AVATAR_CLAMP_SIZE.min, AVATAR_CLAMP_SIZE.max, AVATAR_CLAMP_SIZE.def);
  const round = weClampTo(selection.avatarRadius, AVATAR_CLAMP_RADIUS.min, AVATAR_CLAMP_RADIUS.max, AVATAR_CLAMP_RADIUS.def);
  body.setAttribute(AVATAR_ATTR, 'on');
  body.style.setProperty(AVATAR_VAR_SIZE, Math.round(size) + 'px');
  body.style.setProperty(AVATAR_VAR_ROUND, String(Math.round(round)));
  if (!avatarObserver) {
    try {
      avatarObserver = new MutationObserver(avatarOnMutations);
      avatarObserver.observe(body, { childList: true, subtree: true });
    } catch { avatarObserver = null; }
  }
  avatarActive = true;
  avatarSweep();
}

function disposeAvatarLayer() {
  avatarStop();
}

export {
  syncAvatarLayer, disposeAvatarLayer,
  avatarImageUrl, renderAvatarGlyph,
};

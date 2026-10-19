const COMPONENT_FONT_PROPS = ['font-size', 'font-weight', 'font-family'];

const COMPONENT_FONT_TARGETS = [
  { id: 'markdown', get label() { return weT('对话正文'); }, get group() { return weT('markdown 容器'); }, prefix: 'markdown',
    source: '@deepseek-ai/dsh-client-ui-primitives/lib/markdown/MarkdownText.module.css',

    route: 'tokens' },
  { id: 'codeBlock', get label() { return weT('代码块'); }, get group() { return weT('代码'); }, prefix: 'block',
    source: '@deepseek-ai/dsh-client-ui-primitives/lib/markdown/CodeBlock.module.css',

    route: 'hooks', dslHooks: ['--dsl-code-block-content-font', '--dsl-code-block-banner-font'] },
  { id: 'terminal', get label() { return weT('终端块'); }, get group() { return weT('代码'); }, prefix: 'block',
    source: '@deepseek-ai/dsh-client-ui-primitives/lib/TerminalBlock.module.css',
    route: 'hooks', dslHooks: ['--dsl-terminal-font'] },
  { id: 'table', get label() { return weT('表格'); }, get group() { return weT('对话'); }, prefix: 'tableScroll',
    source: '@deepseek-ai/dsh-client-ui-primitives/lib/markdown/MarkdownText.module.css',
    route: 'tokens' },

];

const PREFIX_RE = /^[A-Za-z][A-Za-z0-9]*$/;

const HOOK_SCOPE_RE = /^\.[A-Za-z0-9_-]+$/;

function targetById(id) {
  return COMPONENT_FONT_TARGETS.find((t) => t.id === id) || null;
}

function scanHookScopes(doc, hooks) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  const out = {};
  if (!d || !d.styleSheets) return out;
  const want = hooks && hooks.length ? hooks : DSL_HOOK_NAMES;
  const visit = (rules) => {
    for (const rule of rules || []) {
      const st = rule && rule.style;
      if (st) {
        for (const hook of want) {
          if (out[hook]) continue;
          let v;
          try { v = st.getPropertyValue(hook); } catch { v = ''; }
          const sel = typeof rule.selectorText === 'string' ? rule.selectorText.trim() : '';
          if (v && v.trim() && HOOK_SCOPE_RE.test(sel)) out[hook] = sel;
        }
      }
      if (rule && rule.cssRules) visit(rule.cssRules);
    }
  };
  for (const sheet of d.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    try { visit(rules); } catch {   }
  }
  return out;
}

function componentScopeSelector(id, hookScopes) {
  const t = targetById(id);
  if (!t) return null;
  if (t.dslHooks) {
    const scopes = hookScopes && typeof hookScopes === 'object' ? hookScopes : null;
    for (const hook of t.dslHooks) {
      if (scopes && scopes[hook] && HOOK_SCOPE_RE.test(scopes[hook])) return scopes[hook];
    }
    return null;
  }
  if (!PREFIX_RE.test(t.prefix)) return null;
  return 'body [class*="_' + t.prefix + '_"]';
}

function selectorFor(id) {
  const t = targetById(id);
  if (!t) throw new Error('component-fonts: 未知组件 ' + id);
  if (!PREFIX_RE.test(t.prefix)) throw new Error('component-fonts: 非法模块前缀 ' + t.prefix);
  return 'body [class*="_' + t.prefix + '_"]';
}

function probeComponentTargets(doc, targets) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  const list = targets || COMPONENT_FONT_TARGETS;
  if (!d || typeof d.querySelectorAll !== 'function') return [];
  const byPrefix = new Map();
  const hit = [];
  for (const t of list) {
    if (!byPrefix.has(t.prefix)) {
      let found;
      try { found = d.querySelectorAll('[class*="_' + t.prefix + '_"]').length > 0; } catch { found = false; }
      byPrefix.set(t.prefix, found);
    }
    if (byPrefix.get(t.prefix)) hit.push(t.id);
  }
  return hit;
}

function buildComponentCss(config, available, resolveFamily) {
  const cfg = config && typeof config === 'object' ? config : {};
  const avail = Array.isArray(available) ? available : [];
  const resolve = typeof resolveFamily === 'function' ? resolveFamily : (v) => v;
  const blocks = [];
  for (const target of COMPONENT_FONT_TARGETS) {

    if (target.route === 'hooks') continue;
    if (!avail.includes(target.id)) continue;
    const c = cfg[target.id];
    if (!c || typeof c !== 'object') continue;
    const decls = [];
    if (typeof c.size === 'number' && Number.isFinite(c.size) && c.size > 0) {
      decls.push('  font-size: ' + Math.round(c.size) + 'px;');
    }
    if (typeof c.weight === 'number' && Number.isFinite(c.weight) && c.weight >= 100 && c.weight <= 900) {
      decls.push('  font-weight: ' + Math.round(c.weight) + ';');
    }
    if (typeof c.family === 'string' && c.family.trim()) {

      decls.push('  font-family: ' + resolve(c.family.trim()) + ';');
    }
    if (!decls.length) continue;
    blocks.push(selectorFor(target.id) + ' {\n' + decls.join('\n') + '\n}');
  }
  return blocks.length ? blocks.join('\n') + '\n' : '';
}

const DSL_FONT_HOOKS = [
  { name: '--dsl-code-block-content-font', get label() { return weT('代码块正文'); }, role: 'markdown-code-block' },
  { name: '--dsl-code-block-banner-font', get label() { return weT('代码块标题条'); }, role: 'markdown-code-block' },
  { name: '--dsl-terminal-font', get label() { return weT('终端'); }, role: 'markdown-code-block' },
];
const DSL_HOOK_NAMES = DSL_FONT_HOOKS.map((h) => h.name);

function buildDslBlocks(config, available, isAvailable, hookScopes, resolveFamily) {
  const cfg = config && typeof config === 'object' ? config : {};
  const avail = Array.isArray(available) ? available : [];
  const ok = typeof isAvailable === 'function' ? isAvailable : () => true;
  const scopes = hookScopes && typeof hookScopes === 'object' ? hookScopes : {};
  const resolve = typeof resolveFamily === 'function' ? resolveFamily : (v) => v;
  const blocks = [];
  for (const target of COMPONENT_FONT_TARGETS) {
    if (!target.dslHooks || !avail.includes(target.id)) continue;
    const c = cfg[target.id];
    if (!c || typeof c !== 'object') continue;
    const decls = [];
    let scope = null;
    for (const hook of target.dslHooks) {
      const meta = DSL_FONT_HOOKS.find((h) => h.name === hook);
      if (!meta) continue;
      const sel = scopes[hook];

      if (!sel || !HOOK_SCOPE_RE.test(sel)) continue;
      const t = (n) => '--dsw-font-' + meta.role + '-' + n;

      if (![t('font-size'), t('line-height'), t('font-family'), t('font-weight')].every((n) => ok(n))) continue;
      const size = typeof c.size === 'number' && Number.isFinite(c.size) && c.size > 0
        ? Math.round(c.size) + 'px' : 'var(' + t('font-size') + ')';
      const family = typeof c.family === 'string' && c.family.trim()
        ? resolve(c.family.trim()) : 'var(' + t('font-family') + ')';

      decls.push('  ' + hook + ': var(' + t('font-weight') + ') ' + size
        + ' / var(' + t('line-height') + ') ' + family + ';');
      if (!scope) scope = sel;
    }
    if (!decls.length || !scope) continue;
    blocks.push(scope + ' {\n' + decls.join('\n') + '\n}');
  }
  return blocks.length ? blocks.join('\n') + '\n' : '';
}

export {
  COMPONENT_FONT_TARGETS, COMPONENT_FONT_PROPS, DSL_FONT_HOOKS, HOOK_SCOPE_RE,
  componentScopeSelector, probeComponentTargets, scanHookScopes,
  buildComponentCss, buildDslBlocks, selectorFor,
};

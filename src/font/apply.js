const WE_HOST_TOKENS = [
  "--dsw-alias-label-primary",
  "--dsw-alias-label-secondary",
  "--dsw-alias-label-tertiary",
  "--dsw-alias-label-dimmed",
];

const WE_HOST_FAMILY_TOKEN = "--we-host-font-family";
const WE_HOST_FAMILY_SOURCE = "--dsw-font-family";

let componentFontProbe = null;
let componentFontProbeAt = 0;
function componentFontAvailability() {
  const stale = componentFontProbe !== null
    && componentFontProbe.ids.length < COMPONENT_FONT_TARGETS.length
    && Date.now() - componentFontProbeAt > 2000;
  if (componentFontProbe === null || stale) {
    const ids = probeComponentTargets(document);

    const hookScopes = scanHookScopes(document);

    const defaults = {};
    for (const id of ids) {
      try {
        const scope = componentScopeSelector(id, hookScopes);
        const el = scope ? document.querySelector(scope) : null;
        if (!el) continue;
        const cs = getComputedStyle(el);
        defaults[id] = {
          size: Math.round(parseFloat(cs.fontSize) || 0) || 0,
          weight: parseInt(cs.fontWeight, 10) || 0,
          family: cs.fontFamily || "",
        };
      } catch {   }
    }
    componentFontProbeAt = Date.now();
    componentFontProbe = {
      ids,
      hookScopes,
      defaults,
      hasToken: (t) => {
        try { return getComputedStyle(document.body).getPropertyValue(t).trim() !== ""; } catch { return false; }
      },
    };
  }
  return componentFontProbe;
}

function componentFontDefaults() {
  return componentFontAvailability().defaults;
}
function fontScopeEl() {
  let st = document.getElementById("we-font-scope");
  if (!st) {
    st = document.createElement("style");
    st.id = "we-font-scope";
    (document.head || document.documentElement).appendChild(st);
  }
  return st;
}

function applyTerminalHostVar() {
  try {
    if (typeof document === "undefined" || !document.body || !document.body.style) return;
    const cfg = selection && selection.componentFonts && typeof selection.componentFonts === "object"
      ? selection.componentFonts : null;
    const key = cfg && cfg.terminal && typeof cfg.terminal.family === "string" ? cfg.terminal.family.trim() : "";
    const stack = selection && selection.fontCustom === true && key ? fontFamilyStackConcrete(key) : "";
    if (stack && stack !== "inherit") document.body.style.setProperty("--dsh-ssh-terminal-font", stack);
    else document.body.style.removeProperty("--dsh-ssh-terminal-font");
  } catch {   }
}
function applyComponentFonts() {
  try {
    const cfg = selection.componentFonts && typeof selection.componentFonts === "object"
      ? selection.componentFonts : {};
    const { ids, hookScopes, hasToken } = componentFontAvailability();

    const css = buildComponentCss(cfg, ids, fontFamilyStack)
      + buildDslBlocks(cfg, ids, hasToken, hookScopes, fontFamilyStack);
    const st = fontScopeEl();
    if (st.textContent !== css) st.textContent = css;

    applyTerminalHostVar();
  } catch {   }
}
function removeComponentFonts() {
  try {
    const st = document.getElementById("we-font-scope");
    if (st) st.textContent = "";
    applyTerminalHostVar();
  } catch {   }
}

function snapshotHostFontDefaults() {

  try {
    const es = document.documentElement.style;
    let need = false;
    for (const t of WE_HOST_TOKENS) {
      if (!es.getPropertyValue("--we-host-" + t.slice(2))) { need = true; break; }
    }
    if (!need && es.getPropertyValue(WE_HOST_FAMILY_TOKEN)) return;
    const bodyCs = getComputedStyle(document.body);
    for (const t of WE_HOST_TOKENS) {
      const v = bodyCs.getPropertyValue(t).trim();
      if (v) es.setProperty("--we-host-" + t.slice(2), v);
    }

    if (!es.getPropertyValue(WE_HOST_FAMILY_TOKEN)) {
      const fam = bodyCs.getPropertyValue(WE_HOST_FAMILY_SOURCE).trim();
      if (fam) es.setProperty(WE_HOST_FAMILY_TOKEN, fam);
    }
  } catch {   }
}

function removeFontStyles() {

  try {
    const es = document.documentElement.style;
    for (const t of WE_HOST_TOKENS) es.removeProperty("--we-host-" + t.slice(2));
    es.removeProperty(WE_HOST_FAMILY_TOKEN);
  } catch {   }
}

export {
  componentFontDefaults,
  applyComponentFonts, removeComponentFonts, snapshotHostFontDefaults, removeFontStyles,
  applyTerminalHostVar,
};

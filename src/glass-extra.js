const EXTRA_GLASS_TAG_ID = "dsh-wallpaper-engine/extra-glass";

function weExtraGlassCss(selection) {
  const list = typeof sanitizeExtraGlassSelectors === "function"
    ? sanitizeExtraGlassSelectors(selection && selection.extraGlassSelectors)
    : "";
  if (!list) return "";
  const gate = "body[data-we-glass-page]:not([data-we-glass-fallback]) ";
  const body = " content: \"\"; position: absolute; inset: 0; border-radius: inherit;"
    + " z-index: -1; pointer-events: none;"
    + " -webkit-backdrop-filter: blur(var(--we-blur, 16px)) saturate(var(--we-saturate, 1.8))"
    + " brightness(var(--we-glass-brightness, 1.04)) contrast(1.01);"
    + " backdrop-filter: blur(var(--we-blur, 16px)) saturate(var(--we-saturate, 1.8))"
    + " brightness(var(--we-glass-brightness, 1.04)) contrast(1.01); }";

  const rules = list.split(", ").map((sel) => gate + sel + "::before {" + body);

  return "/* extra frost targets for user-named selectors (upstream #200) */\n" + rules.join("\n") + "\n";
}

function syncExtraGlassCss(selection) {
  if (typeof document === "undefined") return;
  const css = weExtraGlassCss(selection);
  let tag = document.querySelector("style[data-plugin-css=" + JSON.stringify(EXTRA_GLASS_TAG_ID) + "]");
  if (!css) {
    if (tag) tag.remove();
    return;
  }
  if (tag === null) {
    tag = document.createElement("style");
    tag.dataset.plugin = "dsh-wallpaper-engine";
    tag.dataset.pluginCss = EXTRA_GLASS_TAG_ID;
    document.head.appendChild(tag);
  }

  if (tag.textContent !== css) tag.textContent = css;
}

function disposeExtraGlassCss() {
  if (typeof document === "undefined") return;
  const tag = document.querySelector("style[data-plugin-css=" + JSON.stringify(EXTRA_GLASS_TAG_ID) + "]");
  if (tag) tag.remove();
}

export { weExtraGlassCss, syncExtraGlassCss, disposeExtraGlassCss };

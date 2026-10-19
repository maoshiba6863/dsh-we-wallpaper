let lastScrimCss = "";

let lastFadeBg = "";

let fadeBgThemeWatch = null;

function applyCaretStyles() {
  try {
    let st = document.getElementById("we-caret-patch");
    if (!st) {
      st = document.createElement("style");
      st.id = "we-caret-patch";
      (document.head || document.documentElement).appendChild(st);
    }
    st.textContent = [
      'body textarea,',
      'body input,',
      'body [contenteditable="true"],',
      'body [contenteditable="plaintext-only"],',
      'body [contenteditable=""] {',
      '  caret-color: var(--we-caret-color) !important;',
      '}',
    ].join('\n');
  } catch {   }
}

function removeCaretStyles() {
  const st = document.getElementById("we-caret-patch");
  if (st) st.remove();
}

function resolveWallpaperFadeBg() {
  try {
    const t = getComputedStyle(document.body).getPropertyValue("--dsw-alias-bg-base").trim();
    if (t && t !== "transparent" && t !== "rgba(0, 0, 0, 0)" && t !== "#00000000") return t;
  } catch {   }
  try {
    return document.body.hasAttribute("data-ds-dark-theme") ? "#000000" : "#ffffff";
  } catch { return "#000000"; }
}

function writeWallpaperFadeBg() {
  const using = Number(selection.wallpaperOpacity) > 0;
  lastFadeBg = using ? resolveWallpaperFadeBg() : "";
  if (using) document.body.style.setProperty("--we-wallpaper-fade-bg", lastFadeBg);
  return lastFadeBg;
}

function armFadeBgThemeWatch() {
  if (fadeBgThemeWatch || typeof MutationObserver !== "function") return;
  try {
    fadeBgThemeWatch = new MutationObserver(() => {
      lastFadeBg = "";

      try {
        if (writeWallpaperFadeBg() && document.body) {

          void document.body.offsetHeight;
        }
      } catch {   }
    });
    fadeBgThemeWatch.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
  } catch {

    try { if (fadeBgThemeWatch) fadeBgThemeWatch.disconnect(); } catch {   }
    fadeBgThemeWatch = null;
  }
}

function disarmFadeBgThemeWatch() {
  if (!fadeBgThemeWatch) return;
  try { fadeBgThemeWatch.disconnect(); } catch {   }
  fadeBgThemeWatch = null;
}

function weAccentInk(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ""));
  if (!m) return "#ffffff";
  const s2l = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const rgb = [0, 2, 4].map((i) => s2l(parseInt(m[1].slice(i, i + 2), 16)));
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return lum > 0.45 ? "#0f1115" : "#ffffff";
}

function weCheckedRowInk(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ""));
  if (!m) return null;
  const s2l = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * s2l(c[0]) + 0.7152 * s2l(c[1]) + 0.0722 * s2l(c[2]);
  const contrast = (a, b) => (a > b ? (a + 0.05) / (b + 0.05) : (b + 0.05) / (a + 0.05));
  const accLum = lum([0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)));
  return contrast(1, accLum) >= contrast(0, accLum) ? "#ffffff" : "#000000";
}

function wePopupRowPair(inkHex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(inkHex || ""));
  if (!m) return null;
  const s2l = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * s2l(c[0]) + 0.7152 * s2l(c[1]) + 0.0722 * s2l(c[2]);
  const contrast = (a, b) => (a > b ? (a + 0.05) / (b + 0.05) : (b + 0.05) / (a + 0.05));
  const toHex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const ink = "#" + m[1].toLowerCase();
  const inkLum = lum([0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)));
  const PIVOT = 0.1791;
  const arms = inkLum > PIVOT
    ? [[[0x1e, 0x1f, 0x26], [0, 0, 0]], [[0xff, 0xff, 0xff], [0xff, 0xff, 0xff]]]
    : [[[0xff, 0xff, 0xff], [0xff, 0xff, 0xff]], [[0x1e, 0x1f, 0x26], [0, 0, 0]]];
  let best = null;
  for (const [base, extreme] of arms) {
    const baseLum = lum(base);
    if (contrast(baseLum, inkLum) >= 4.6) return { bg: toHex(base), ink };
    if (contrast(lum(extreme), inkLum) < 4.6) {
      if (!best || contrast(lum(extreme), inkLum) > best.c) {
        best = { c: contrast(lum(extreme), inkLum), bg: toHex(extreme) };
      }
      continue;
    }
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 12; i++) {
      const t = (lo + hi) / 2;
      const c = base.map((v, j) => v * (1 - t) + extreme[j] * t);
      if (contrast(lum(c), inkLum) >= 4.6) hi = t; else lo = t;
    }
    return { bg: toHex(base.map((v, j) => v * (1 - hi) + extreme[j] * hi)), ink };
  }
  return { bg: best.bg, ink };
}

function weClampSurfaceColor(hex, theme, fidelity) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ""));
  if (!m) return theme === "dark" ? "#0d1524" : "#ffffff";
  const fidNum = Number(fidelity);
  const f = (fidelity === undefined || fidelity === null) ? 1
    : (Number.isFinite(fidNum) ? Math.min(1, Math.max(0, fidNum)) : 1);
  const rgb = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const s2l = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * s2l(c[0]) + 0.7152 * s2l(c[1]) + 0.0722 * s2l(c[2]);

  const F = theme === "dark" ? 0.59 : 0.45;

  const darkFactor = theme === "dark" ? 0.4 : 1;
  const aMin = F + 0.10 * darkFactor * (1 - F);

  const passes = (c) => {
    const comp = c.map((v) => v * aMin + (theme === "dark" ? 255 : 0) * (1 - aMin));
    const contrast = theme === "dark"
      ? 1.05 / (lum(comp) + 0.05)
      : (lum(comp) + 0.05) / 0.05;
    return contrast >= 4.6;
  };
  const toHex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  let clamped = rgb;
  if (!passes(rgb)) {
    const target = theme === "dark" ? [0, 0, 0] : [255, 255, 255];
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 12; i++) {
      const t = (lo + hi) / 2;
      const c = rgb.map((v, j) => v * (1 - t) + target[j] * t);
      if (passes(c)) hi = t; else lo = t;
    }
    clamped = rgb.map((v, j) => v * (1 - hi) + target[j] * hi);
  }

  if (f >= 1) return toHex(clamped);
  return toHex(clamped.map((v, j) => v * f + rgb[j] * (1 - f)));
}

function glassColorOf(selection, theme) {
  const raw = selection && selection.glassColor;
  if (typeof raw === "string") return raw;
  if (!raw || typeof raw !== "object") return "";
  const own = theme === "dark" ? raw.dark : raw.light;
  if (typeof own === "string") return own;

  const other = theme === "dark" ? raw.light : raw.dark;
  return typeof other === "string" ? other : "";
}

function applyEffects(opts) {

  const live = Boolean(opts && opts.live);
  const s = document.body.style;
  s.setProperty("--we-scrim-color", "rgba(0,0,0," + selection.scrim + ")");

  s.setProperty("--we-border-alpha", String(selection.border));

  s.setProperty("--we-blur", selection.blur + "px");

  s.setProperty("--we-saturate", useLegacySaturateCoupling()
    ? String(1.15 + selection.blur * 0.028)
    : String(GLASS_SATURATE));
  s.setProperty("--we-glass-brightness", "1.04");

  const filterTerms = [];
  if (selection.wallpaperBlur > 0) filterTerms.push("blur(" + selection.wallpaperBlur + "px)");
  if (selection.backgroundBrightness !== 100) filterTerms.push("brightness(" + selection.backgroundBrightness + "%)");
  if (selection.backgroundContrast !== 100) filterTerms.push("contrast(" + selection.backgroundContrast + "%)");
  if (selection.backgroundSaturate !== 100) filterTerms.push("saturate(" + selection.backgroundSaturate + "%)");
  s.setProperty("--we-media-filter", filterTerms.length ? filterTerms.join(" ") : "none");

  const scale = (1 + selection.wallpaperBlur * 0.006).toFixed(4);

  s.setProperty("--we-wallpaper-transform",
    (selection.wallpaperBlur > 0 || selection.flip)
      ? ("scale(" + scale + ") scaleX(" + (selection.flip ? "-1" : "1") + ")")
      : "none");

  s.setProperty("--we-object-fit", selection.objectFit);

  {
    const lpx = Number(selection.layerPositionX);
    const lpy = Number(selection.layerPositionY);
    const lsc = Number(selection.layerScale);
    const offX = Number.isFinite(lpx) && lpx !== 50;
    const offY = Number.isFinite(lpy) && lpy !== 50;
    const zoomed = Number.isFinite(lsc) && lsc !== 100;
    if (offX) s.setProperty("--we-layer-x", ((lpx - 50) / 2).toFixed(4) + "%");
    else s.removeProperty("--we-layer-x");
    if (offY) s.setProperty("--we-layer-y", ((lpy - 50) / 2).toFixed(4) + "%");
    else s.removeProperty("--we-layer-y");
    if (zoomed) s.setProperty("--we-layer-scale", String(lsc / 100));
    else s.removeProperty("--we-layer-scale");
  }

  if (selection.wallpaperOpacity > 0) {
    s.setProperty("--we-wallpaper-opacity", String((100 - selection.wallpaperOpacity) / 100));

    armFadeBgThemeWatch();
    if (live && lastFadeBg) s.setProperty("--we-wallpaper-fade-bg", lastFadeBg);
    else writeWallpaperFadeBg();
  } else {
    s.removeProperty("--we-wallpaper-opacity");
    s.removeProperty("--we-wallpaper-fade-bg");
    disarmFadeBgThemeWatch();
    lastFadeBg = "";
  }

  s.setProperty("--we-accent", selection.accent);
  s.setProperty("--we-accent-src", selection.accent);

  s.setProperty("--we-accent-ink", weAccentInk(selection.accent));

  const uiColor = (key) => selection[key] || selection.accent;
  s.setProperty("--we-ui-send", uiColor("uiColorSend"));
  s.setProperty("--we-ui-link", uiColor("uiColorLink"));
  s.setProperty("--we-ui-file-icon", uiColor("uiColorFileIcon"));
  s.setProperty("--we-ui-tab", uiColor("uiColorTab"));
  s.setProperty("--we-ui-deep-diving", uiColor("uiColorDeepDiving"));

  const glassAlpha = Math.max(0.10, 0.25 - (selection.glassAlpha / 100) * 0.15);
  s.setProperty("--we-glass-alpha", String(glassAlpha));

  s.setProperty("--we-glass-color", glassColorOf(selection, "light"));

  const fidNum = Number(selection.glassFidelity);
  const glassFidelity = Number.isFinite(fidNum) ? Math.min(1, Math.max(0, fidNum / 100)) : 1;
  s.setProperty("--we-glass-fidelity", String(glassFidelity));

  const glassTintLight = glassColorOf(selection, "light");
  const glassTintDark = glassColorOf(selection, "dark");
  s.setProperty("--we-surface-tint-light", weClampSurfaceColor(glassTintLight, "light", glassFidelity));
  s.setProperty("--we-surface-tint-dark", weClampSurfaceColor(glassTintDark, "dark", glassFidelity));

  const popupInk = (selection.fontCustom && selection.themeColors && selection.themeColors.primary)
    ? selection.themeColors.primary : null;
  for (const theme of ["light", "dark"]) {
    const suffix = theme === "dark" ? "-dark" : "-light";
    const pair = wePopupRowPair(popupInk ? popupInk[theme] : "");
    if (pair) {
      s.setProperty("--we-popup-row-bg" + suffix, pair.bg);
      s.setProperty("--we-popup-row-ink" + suffix, pair.ink);
    } else {
      s.removeProperty("--we-popup-row-bg" + suffix);
      s.removeProperty("--we-popup-row-ink" + suffix);
    }
  }

  const checkedInk = weCheckedRowInk(selection.accent);
  if (checkedInk) s.setProperty("--we-popup-row-checked-ink", checkedInk);
  else s.removeProperty("--we-popup-row-checked-ink");

  s.setProperty("--we-surface-tint-rgb-light", toRgbTriple(weClampSurfaceColor(glassTintLight, "light", glassFidelity)));
  s.setProperty("--we-surface-tint-rgb-dark", toRgbTriple(weClampSurfaceColor(glassTintDark, "dark", glassFidelity)));

  applyGlass(selection, s);

  syncExtraGlassCss(selection);

  const skinYield = typeof skinYieldActive === "function" && skinYieldActive();

  if (selection.thinkingNative && !skinYield) document.body.setAttribute("data-we-thinking-native", "on");
  else document.body.removeAttribute("data-we-thinking-native");
  if (selection.thinkingGlass && !selection.thinkingNative && !skinYield) document.body.setAttribute("data-we-thinking-glass", "on");
  else document.body.removeAttribute("data-we-thinking-glass");

  if (selection.chatLayout === "spread") document.body.setAttribute("data-we-chat-layout", "spread");
  else document.body.removeAttribute("data-we-chat-layout");

  const capBlurNum = Number(selection.capsuleBlur);
  s.setProperty("--we-inline-code-blur", String(Number.isFinite(capBlurNum) ? capBlurNum : 8) + "px");

  s.setProperty("--we-capsule-tint-rgb", toRgbTriple(
    /^#[0-9a-f]{6}$/i.test(String(selection.capsuleColor)) ? selection.capsuleColor : "#ffffff"));

  if (selection.sidebarFollowGlobal) {
    s.setProperty("--we-sidebar-blur", "var(--we-blur)");
    s.setProperty("--we-sidebar-saturate", "var(--we-saturate)");
    s.setProperty("--we-sidebar-tint", "calc(var(--we-glass-alpha) * 100%)");
    s.setProperty("--we-sidebar-color", "var(--we-follow-tint)");
    s.setProperty("--we-sidebar-sheen", "1");
  }

  if (selection.sidebarGlass && selection.sidebarFollowGlobal && !skinYield) document.body.setAttribute("data-we-sidebar-follow", "on");
  else document.body.removeAttribute("data-we-sidebar-follow");

  document.body.setAttribute("data-we-adapter", adapterCaps().target);

  if (detectMicaSupport() === false) document.body.setAttribute("data-we-mica", "off");
  else document.body.removeAttribute("data-we-mica");

  if (detectSoftwareRender()) document.body.setAttribute("data-we-glass-fallback", "1");
  else document.body.removeAttribute("data-we-glass-fallback");

  if (!live) {

    if (selection.fontCustom) {
      snapshotHostFontDefaults();
      applyComponentFonts();
    } else {
      removeFontStyles();
      removeComponentFonts();
    }
  }

  if (selection.caretColor) {
    s.setProperty("--we-caret-color", selection.caretColor);
    applyCaretStyles();
  } else {
    s.removeProperty("--we-caret-color");
    removeCaretStyles();
  }

  if (!live) syncSceneAudio(selection);

  const scrimCss = "rgba(0,0,0," + selection.scrim + ")";
  if (scrimCss !== lastScrimCss) {
    lastScrimCss = scrimCss;
    const scrim = document.getElementById(SCRIM_ID);
    if (scrim) {
      scrim.style.background = scrimCss;
    }

    if (!live && document.body) {
      void document.body.offsetHeight;
    }
  }
}

function clearEffects() {
  const s = document.body.style;

  disarmFadeBgThemeWatch();
  lastFadeBg = "";
  s.removeProperty("--we-scrim-color");
  s.removeProperty("--we-border-alpha");
  s.removeProperty("--we-blur");
  s.removeProperty("--we-saturate");
  s.removeProperty("--we-glass-brightness");
  s.removeProperty("--we-media-filter");
  s.removeProperty("--we-object-fit");

  s.removeProperty("--we-layer-x");
  s.removeProperty("--we-layer-y");
  s.removeProperty("--we-layer-scale");
  s.removeProperty("--we-wallpaper-opacity");
  s.removeProperty("--we-wallpaper-fade-bg");
  s.removeProperty("--we-accent");
  s.removeProperty("--we-accent-src");
  s.removeProperty("--we-accent-ink");
  s.removeProperty("--we-popup-row-checked-ink");

  s.removeProperty("--we-ui-send");
  s.removeProperty("--we-ui-link");
  s.removeProperty("--we-ui-file-icon");
  s.removeProperty("--we-ui-tab");
  s.removeProperty("--we-ui-deep-diving");
  s.removeProperty("--we-glass-alpha");
  s.removeProperty("--we-glass-color");
  s.removeProperty("--we-surface-tint-light");
  s.removeProperty("--we-surface-tint-dark");
  s.removeProperty("--we-surface-tint-rgb-light");
  s.removeProperty("--we-surface-tint-rgb-dark");
  document.body.removeAttribute("data-we-glass-window");

  document.body.removeAttribute("data-we-glass-page");
  document.body.removeAttribute("data-we-chat-layout");
  document.body.removeAttribute("data-we-left-sidebar");

  document.body.removeAttribute("data-we-left-sidebar-radius");
  document.body.removeAttribute("data-we-right-sidebar-radius");
  document.body.removeAttribute("data-we-left-sidebar-square");
  document.body.removeAttribute("data-we-right-sidebar-square");
  s.removeProperty("--we-left-sidebar-radius");
  s.removeProperty("--we-right-sidebar-radius");

  document.body.removeAttribute("data-we-titlebar-glass");

  document.body.removeAttribute("data-we-thinking-glass");
  document.body.removeAttribute("data-we-thinking-native");

  document.body.removeAttribute("data-we-glass-chat");
  document.body.removeAttribute("data-we-glass-floaters");
  document.body.removeAttribute("data-we-sidebar-follow");
  s.removeProperty("--we-sidebar-blur");
  s.removeProperty("--we-sidebar-saturate");
  s.removeProperty("--we-sidebar-sheen");
  s.removeProperty("--we-sidebar-color");
  s.removeProperty("--we-sidebar-tint");
  document.body.removeAttribute("data-we-sidebar-glass");
  document.body.removeAttribute("data-we-sidebar-fullclear");
  document.body.removeAttribute("data-we-adapter");
  document.body.removeAttribute("data-we-mica");
  document.body.removeAttribute("data-we-glass-fallback");
  s.removeProperty("--we-content-surface-alpha");
  s.removeProperty("--we-content-surface-color");

  for (const v of [
    "--we-settings-window-blur", "--we-settings-window-alpha",
    "--we-left-sidebar-blur", "--we-left-sidebar-alpha",
    "--we-titlebar-blur", "--we-titlebar-alpha",
    "--we-floaters-blur", "--we-floaters-alpha",

    "--we-chat-glass-fidelity", "--we-chat-surface-tint-light", "--we-chat-surface-tint-dark",
    "--we-chat-surface-tint-rgb-light", "--we-chat-surface-tint-rgb-dark",
  ]) s.removeProperty(v);

  clearUnderlayColor();
  removeFontStyles();
  s.removeProperty("--we-caret-color");
  removeCaretStyles();

  disposeExtraGlassCss();
  selection.sceneAudioUrl = null;
  selection.sceneHasAudio = false;
  syncSceneAudio(selection);
  const scrim = document.getElementById(SCRIM_ID);
  if (scrim) scrim.style.background = "";
  lastScrimCss = "";

  selection.videoPlaying = true;
  selection.videoError = "";
  selection.blockedNote = "";
}

export {
  applyEffects, clearEffects,
};

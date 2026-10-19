const toRgbTriple = (hex) => {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ""));
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).join(", ") : "255, 255, 255";
};

function applyGlass(selection, s) {

  if (typeof skinYieldActive === "function" && skinYieldActive()) {
    for (const attr of ["data-we-glass-page", "data-we-glass-chat", "data-we-glass-window",
      "data-we-left-sidebar", "data-we-titlebar-glass", "data-we-sidebar-glass", "data-we-sidebar-fullclear", "data-we-glass-floaters"]) {
      document.body.removeAttribute(attr);
    }
    return;
  }

  document.body.setAttribute("data-we-glass-page", "on");

  const glassModeOn = (surface) => {
    const rec = selection.glassMode;
    return !!(rec && typeof rec === 'object' && rec[surface] === 'custom');
  };

  const glassValue = (surface, param, profileValue, globalValue) =>
    (glassModeOn(surface) ? profileValue : globalValue);

  {

    const pct = Number(glassValue("settingsWindow", "transparency", selection.settingsWindowTransparency, selection.glassAlpha)) || 0;
    s.setProperty("--we-settings-window-blur",
      glassValue("settingsWindow", "blur", selection.settingsWindowBlur, selection.blur) + "px");
    s.setProperty("--we-settings-window-alpha", String(Math.max(0.10, 0.25 - pct / 100 * 0.15)));
  }

  const chatFidRaw = glassValue("conversation", "fidelity", selection.chatGlassFidelity, selection.glassFidelity);
  const chatFidNum = Number(chatFidRaw);
  const chatGlassFidelity = Number.isFinite(chatFidNum) ? Math.min(1, Math.max(0, chatFidNum / 100)) : 1;
  s.setProperty("--we-chat-glass-fidelity", String(chatGlassFidelity));

  const chatColorLight = glassValue("conversation", "color", selection.conversationColor, glassColorOf(selection, "light"));
  const chatColorDark = glassValue("conversation", "color", selection.conversationColor, glassColorOf(selection, "dark"));
  s.setProperty("--we-chat-surface-tint-light", weClampSurfaceColor(chatColorLight, "light", chatGlassFidelity));
  s.setProperty("--we-chat-surface-tint-dark", weClampSurfaceColor(chatColorDark, "dark", chatGlassFidelity));
  s.setProperty("--we-chat-surface-tint-rgb-light", toRgbTriple(weClampSurfaceColor(chatColorLight, "light", chatGlassFidelity)));
  s.setProperty("--we-chat-surface-tint-rgb-dark", toRgbTriple(weClampSurfaceColor(chatColorDark, "dark", chatGlassFidelity)));

  {
    const pct = Number(glassValue("thinkingTrigger", "transparency", selection.thinkingTriggerTransparency, selection.glassAlpha)) || 0;
    s.setProperty("--we-thinking-trigger-blur",
      String(glassValue("thinkingTrigger", "blur", selection.thinkingTriggerBlur, selection.blur)) + "px");
    s.setProperty("--we-thinking-trigger-alpha", String(Math.max(0.10, 0.25 - pct / 100 * 0.15)));
  }

  document.body.setAttribute("data-we-glass-chat", "on");

  document.body.setAttribute("data-we-glass-window", "on");

  if (selection.leftSidebarGlass) document.body.setAttribute("data-we-left-sidebar", "on");
  else document.body.removeAttribute("data-we-left-sidebar");

  {
    const px = (v) => (v === "6" || v === "12" || v === "20") ? v + "px" : "";
    const tokens = (tl, tr, br, bl) => [tl && "tl", tr && "tr", br && "br", bl && "bl"].filter(Boolean).join(" ");
    const leftR = px(selection.leftSidebarCornerRadius);
    const rightR = px(selection.rightSidebarCornerRadius);
    if (leftR) { s.setProperty("--we-left-sidebar-radius", leftR); document.body.setAttribute("data-we-left-sidebar-radius", "on"); }
    else document.body.removeAttribute("data-we-left-sidebar-radius");
    if (rightR) { s.setProperty("--we-right-sidebar-radius", rightR); document.body.setAttribute("data-we-right-sidebar-radius", "on"); }
    else document.body.removeAttribute("data-we-right-sidebar-radius");
    const leftSq = tokens(selection.leftSidebarSquareTL, selection.leftSidebarSquareTR, selection.leftSidebarSquareBR, selection.leftSidebarSquareBL);
    const rightSq = tokens(selection.rightSidebarSquareTL, selection.rightSidebarSquareTR, selection.rightSidebarSquareBR, selection.rightSidebarSquareBL);
    if (leftSq) document.body.setAttribute("data-we-left-sidebar-square", leftSq);
    else document.body.removeAttribute("data-we-left-sidebar-square");
    if (rightSq) document.body.setAttribute("data-we-right-sidebar-square", rightSq);
    else document.body.removeAttribute("data-we-right-sidebar-square");
  }

  {
    const pct = Number(glassValue("leftSidebar", "transparency", selection.leftSidebarTransparency, selection.glassAlpha)) || 0;
    s.setProperty("--we-left-sidebar-blur",
      String(glassValue("leftSidebar", "blur", selection.leftSidebarBlur, selection.blur)) + "px");
    s.setProperty("--we-left-sidebar-alpha", String(Math.max(0.10, 0.25 - pct / 100 * 0.15)));
  }

  if (selection.titlebarGlass) document.body.setAttribute("data-we-titlebar-glass", "on");
  else document.body.removeAttribute("data-we-titlebar-glass");

  {
    const pct = Number(glassValue("titlebar", "transparency", selection.titlebarTransparency, selection.glassAlpha)) || 0;
    s.setProperty("--we-titlebar-blur",
      String(glassValue("titlebar", "blur", selection.titlebarBlur, selection.blur)) + "px");
    s.setProperty("--we-titlebar-alpha", String(Math.max(0.10, 0.25 - pct / 100 * 0.15)));
  }

  const sidebarBlur = Number(glassValue("sidebar", "blur", selection.sidebarBlur, selection.blur)) || 0;
  s.setProperty("--we-sidebar-blur", sidebarBlur + "px");

  s.setProperty("--we-sidebar-saturate", String(1.15 + sidebarBlur * 0.028));

  const sidebarAlphaPct = Number(glassValue("sidebar", "transparency", selection.sidebarAlpha, selection.glassAlpha)) || 0;
  const sidebarAlpha = Math.max(0.015, 0.32 - (sidebarAlphaPct / 100) * 0.305);

  s.setProperty("--we-sidebar-sheen", String(Math.min(1, sidebarAlpha / 0.2236)));

  s.setProperty("--we-sidebar-color", glassValue("sidebar", "color", selection.sidebarColor, glassColorOf(selection, "light")));

  const sidebarTint = 20 + (100 - Math.min(Math.max(sidebarAlphaPct, 0), 100)) / 100 * 28;
  s.setProperty("--we-sidebar-tint", sidebarTint.toFixed(1) + "%");
  if (selection.sidebarGlass) document.body.setAttribute("data-we-sidebar-glass", "on");
  else document.body.removeAttribute("data-we-sidebar-glass");

  if (selection.sidebarFullClear) document.body.setAttribute("data-we-sidebar-fullclear", "on");
  else document.body.removeAttribute("data-we-sidebar-fullclear");

  document.body.setAttribute("data-we-glass-floaters", "on");

  {
    const pct = Number(glassValue("floaters", "transparency", selection.floatersTransparency, selection.glassAlpha)) || 0;
    s.setProperty("--we-floaters-blur",
      String(glassValue("floaters", "blur", selection.floatersBlur, selection.blur)) + "px");
    s.setProperty("--we-floaters-alpha", String(Math.max(0.10, 0.25 - pct / 100 * 0.15)));
  }

  const contentAlphaPct = Number(glassValue("sidebarContent", "transparency", selection.sidebarContentAlpha, selection.glassAlpha)) || 0;
  s.setProperty("--we-content-surface-alpha", Math.max(20, 100 - contentAlphaPct * 0.8) + "%");

  const contentColor = glassValue("sidebarContent", "color", selection.sidebarContentColor, "");
  if (contentColor) s.setProperty("--we-content-surface-color", contentColor);
  else s.removeProperty("--we-content-surface-color");
}

export { applyGlass, toRgbTriple };

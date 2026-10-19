let weSidebarMode = "drawer";
let weSidebarOpenFn = null;
let weSidebarCtrl = null;
const WE_SIDEBAR_KIND = "wallpaper-library";
const WE_SIDEBAR_ID = "dsh-we-wallpaper/library";

function sidebarRightMode() {
  return weSidebarMode;
}

function sidebarRightOpen() {
  if (weSidebarMode !== "official" || !weSidebarOpenFn) return false;
  try { weSidebarOpenFn(); return true; } catch { return false; }
}

function sidebarRightOursActive() {
  try {
    const a = weSidebarCtrl && typeof weSidebarCtrl.active === "function" ? weSidebarCtrl.active() : null;
    return Boolean(a && a.kind === WE_SIDEBAR_KIND);
  } catch { return false; }
}

function sidebarRightToggle() {
  if (weSidebarMode !== "official" || !weSidebarCtrl) return false;
  try {
    if (typeof weSidebarCtrl.toggleExpanded === "function" && typeof weSidebarCtrl.isExpanded === "function"
      && weSidebarCtrl.isExpanded() && sidebarRightOursActive()) {
      weSidebarCtrl.toggleExpanded();
      return true;
    }
    return sidebarRightOpen();
  } catch { return false; }
}

function sidebarRightClose() {
  if (weSidebarMode !== "official" || !weSidebarCtrl) return false;
  try {
    if (typeof weSidebarCtrl.toggleExpanded === "function" && typeof weSidebarCtrl.isExpanded === "function"
      && weSidebarCtrl.isExpanded() && sidebarRightOursActive()) {
      weSidebarCtrl.toggleExpanded();
    }
    return true;
  } catch { return false; }
}

let ropeDrawerControl = null;

function wallSidebarOpen() {
  if (sidebarRightOpen()) return true;
  if (ropeDrawerControl) { ropeDrawerControl.open(); return true; }
  return false;
}

function wallSidebarClose() {
  if (sidebarRightClose()) return true;
  if (ropeDrawerControl) { ropeDrawerControl.close(); return true; }
  return false;
}

function wallSidebarToggle() {
  if (sidebarRightToggle()) return true;
  if (ropeDrawerControl) { ropeDrawerControl.toggle(); return true; }
  return false;
}

function wallSidebarAvailable() {
  return weSidebarMode === "official" || Boolean(ropeDrawerControl);
}

function sidebarForcedDrawer() {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("weSidebarTest") === "drawer") return true;
  } catch {   }
  try {
    return typeof location !== "undefined"
      && /(?:\?|&)we-sidebar=drawer(?:&|$)/.test(String(location.search || ""));
  } catch { return false; }
}

function scheduleWeTimeout(fn, ms) {
  if (typeof window === "undefined" || typeof window.setTimeout !== "function") return 0;
  return window.setTimeout(fn, ms);
}
function clearWeTimeout(id) {
  if (!id) return;
  if (typeof window === "undefined" || typeof window.clearTimeout !== "function") return;
  window.clearTimeout(id);
}

function installSidebarRight(ctx) {
  if (sidebarForcedDrawer()) return null;
  if (!ctx || !ctx.slots || typeof ctx.slots.inject !== "function") return null;
  return ctx.slots.inject("sidebar.right.pane.tab", () => {
    let disposed = false;
    let poll = 0;
    let off = null;
    const cleanup = () => {
      disposed = true;
      if (poll) { try { clearWeTimeout(poll); } catch {   } poll = 0; }
      if (off) { try { off(); } catch {   } off = null; }
      if (weSidebarMode === "official") {
        weSidebarMode = "drawer";
        weSidebarOpenFn = null;
        weSidebarCtrl = null;
        emit();
      }
    };

    const attempt = () => {
      if (disposed) return;
      const tabs = typeof ctx.get === "function" ? ctx.get("sidebarRightTabs") : null;
      const ctrl = typeof ctx.get === "function" ? ctx.get("sidebarRight") : null;
      if (!tabs || typeof tabs.register !== "function"
        || !ctrl || typeof ctrl.openTab !== "function") {
        poll = scheduleWeTimeout(attempt, 250);
        return;
      }
      let disposeTabs = null;
      let disposeBody = null;
      try {
        disposeTabs = tabs.register({
          id: WE_SIDEBAR_ID,
          kind: WE_SIDEBAR_KIND,
          keepMounted: true,
          title: () => weT("壁纸"),
          guide: [{
            id: "library",
            order: 100,
            title: () => weT("壁纸引擎"),
            description: () => weT("本地 Wallpaper Engine 壁纸库与播放控制"),
            icon: renderWeIcon,
          }],
        });
        disposeBody = ctx.slots.register(
          { name: "sidebar.right.pane.tab", key: WE_SIDEBAR_ID },
          () => React.createElement(QuickPanel, { dock: "official" }),
        );
      } catch {

        try { if (disposeTabs) disposeTabs(); } catch {   }
        try { if (disposeBody) disposeBody(); } catch {   }
        return;
      }
      weSidebarMode = "official";
      weSidebarCtrl = ctrl;
      weSidebarOpenFn = () => ctrl.openTab(WE_SIDEBAR_KIND);
      emit();
      off = () => {
        try { disposeBody(); } catch {   }
        try { disposeTabs(); } catch {   }
      };
    };
    attempt();
    return cleanup;
  });
}

function installWallSidebarShortcut(ctx) {
  if (!ctx || typeof ctx.get !== "function") return null;
  if (typeof document === "undefined") return null;
  let disposed = false;
  let poll = 0;
  let off = null;
  const attempt = () => {
    if (disposed) return;
    const shortcuts = ctx.get("shortcuts");
    if (!shortcuts || typeof shortcuts.register !== "function") {
      poll = scheduleWeTimeout(attempt, 250);
      return;
    }
    try {
      off = shortcuts.register({
        id: "wallpaper.sidebar.toggle",
        label: () => weT("壁纸侧栏（呼出 / 关闭）"),

        aliases: ["wallpaper sidebar", "toggle wallpaper panel", weT("壁纸侧栏"), weT("壁纸库")],
        defaults: {
          "desktop:macos": { code: "KeyW", modifiers: ["primary", "alt"] },
          "desktop:windows": { code: "KeyW", modifiers: ["primary", "alt"] },
          "desktop:linux": { code: "KeyW", modifiers: ["primary", "alt"] },
        },
        regions: ["page", "editable", "terminal"],
        modals: [],
        resolve: () => (wallSidebarAvailable()
          ? { status: "handled", run: () => { wallSidebarToggle(); } }
          : { status: "pass" }),
      });
    } catch { off = null; }
  };
  attempt();
  return () => {
    disposed = true;
    if (poll) { try { clearWeTimeout(poll); } catch {   } poll = 0; }
    if (off) { try { off(); } catch {   } off = null; }
  };
}

function findAccountMenuTrigger() {
  try {
    return document.body.querySelector(
      'button[aria-haspopup="menu"][data-collapsed], button[aria-haspopup="menu"][data-signed-out]',
    ) || null;
  } catch { return null; }
}

function settingsLabelCandidates() {
  const out = [];
  const push = (s) => { const v = String(s || "").trim(); if (v && !out.includes(v)) out.push(v); };
  push(weT("设置"));
  push("设置");
  push("Settings");
  push("設定");
  push("全局设置");
  push("Global settings");
  return out;
}

function isSettingsText(text) {
  const t = String(text || "").trim();
  if (!t) return false;

  return settingsLabelCandidates()
    .slice()
    .sort((a, b) => b.length - a.length)
    .some((c) => t.includes(c));
}

function findSettingsMenuItem() {
  try {
    const items = [...document.body.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')];
    return items.find((el) => isSettingsText(el.textContent)) || null;
  } catch { return null; }
}
function findSettingsTrigger() {
  const labelOf = (el) => {
    try {
      return ((el.getAttribute("aria-label") || "") + " " + ((el.textContent || "").trim())).trim();
    } catch { return ""; }
  };
  const isSettingsLabel = (el) => {

    try { if (el.getAttribute && el.getAttribute('data-we-qp-entry') === '1') return false; } catch {   }

    return isSettingsText(labelOf(el));
  };
  const leftmost = (list) => list
    .slice()
    .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0] || null;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  try {
    const dialogTriggers = [...document.body.querySelectorAll('button[aria-haspopup="dialog"], [role="button"][aria-haspopup="dialog"]')]
      .filter(visible);
    const named = dialogTriggers.filter(isSettingsLabel);
    if (named.length) return leftmost(named);

    const texted = [...document.body.querySelectorAll('button, [role="button"]')]
      .filter((b) => visible(b) && isSettingsLabel(b));
    const inLeft = texted.filter((b) => b.getBoundingClientRect().left < 220);
    if (inLeft.length) return leftmost(inLeft);
    if (texted.length) return leftmost(texted);

    return null;
  } catch { return null; }
}
let openSettingsBusy = false;

function openSettingsSection(tabId) {
  if (typeof document === "undefined" || openSettingsBusy) return;
  openSettingsBusy = true;
  const release = () => { openSettingsBusy = false; };
  if (tabId) setTransient("settingsTabRequest", String(tabId));

  const clickOurNavRow = () => {
    let rows;
    try { rows = document.body.querySelectorAll("nav button"); } catch { return false; }

    const want = weT("壁纸引擎");
    for (const btn of rows) {
      if ((btn.textContent || "").trim() === want) {
        try { btn.click(); return true; } catch { return false; }
      }
    }
    return false;
  };

  if (clickOurNavRow()) { release(); return; }

  const menuBtnEarly = findAccountMenuTrigger();
  const trigger = menuBtnEarly ? null : findSettingsTrigger();

  let menuMode = false;
  if (trigger) {
    try { trigger.click(); } catch { release(); return; }
  } else {
    const menuBtn = menuBtnEarly || findAccountMenuTrigger();
    if (menuBtn) {
      menuMode = true;
      try { menuBtn.click(); } catch { release(); return; }
    } else {

      try {
        const primary = (typeof navigator !== "undefined" && /Mac/i.test(String(navigator.platform || navigator.userAgent || "")))
          ? { metaKey: true } : { ctrlKey: true };
        document.dispatchEvent(new KeyboardEvent("keydown", {
          key: ",", code: "Comma", bubbles: true, cancelable: true, ...primary,
        }));
      } catch { release(); return; }
    }
  }

  let clickedNav = false;
  const started = Date.now();
  const tick = () => {
    if (clickedNav) return;
    if (menuMode) {
      const item = findSettingsMenuItem();
      if (item) { try { item.click(); } catch {   } menuMode = false; }
    }
    if (clickOurNavRow()) { clickedNav = true; release(); return; }
    if (Date.now() - started > 2500) {
      reportClientDiag("settings-entry-timeout", "dialog=" + Boolean([...document.querySelectorAll('[role="dialog"]')].length));

      if (tabId) setTransient("settingsTabRequest", "");

      try {
        const entry = document.querySelector('button[data-we-qp-entry]');
        if (entry) entry.title = weT("自动打开未成功：请按 Cmd/Ctrl+, 或点左栏的设置入口");
      } catch {   }
      release();
      return;
    }
    scheduleWeTimeout(tick, 16);
  };
  scheduleWeTimeout(tick, 0);
}

export {
  sidebarRightMode,
  ropeDrawerControl,
  wallSidebarOpen,
  wallSidebarClose,
  wallSidebarToggle,
  installSidebarRight,
  installWallSidebarShortcut,
  openSettingsSection,
};

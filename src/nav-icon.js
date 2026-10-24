const WE_ICON_GUIDE_INK = "#A797FC";
/* 齿轮（设置）图标：24×24 视图盒，描边 1.4。 */
const WE_ICON_PARTS = [
  ["circle", { cx: "12", cy: "12", r: "3.2" }],
  ["path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" }],
];
const WE_ICON_VIEW_BOX = "0 0 24 24";

function renderWeIcon(props) {
  const size = (props && Number(props.size)) || 16;
  return React.createElement("svg", {
    viewBox: WE_ICON_VIEW_BOX,
    width: size,
    height: size,
    fill: "none",
    stroke: WE_ICON_GUIDE_INK,
    "stroke-width": "1.4",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    className: (props && props.className) || undefined,
    "aria-hidden": "true",
    focusable: "false",
  }, WE_ICON_PARTS.map(([tag, attrs]) => React.createElement(tag, attrs)));
}

function weIconSvgString(size) {
  const attrs = 'viewBox="' + WE_ICON_VIEW_BOX + '" width="' + size + '" height="' + size
    + '" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"'
    + ' stroke-linejoin="round" aria-hidden="true" focusable="false"';
  const inner = WE_ICON_PARTS.map(([tag, attrs2]) => "<" + tag + " "
    + Object.keys(attrs2).map((k) => k + '="' + attrs2[k] + '"').join(" ") + "/>").join("");
  return "<svg " + attrs + ">" + inner + "</svg>";
}

function installWeNavIcon() {
  if (typeof document === "undefined" || !document.body) return null;
  if (typeof MutationObserver !== "function") return null;
  let patched = new WeakSet();
  const patchIn = (root) => {
    if (!root || typeof root.querySelectorAll !== "function") return;
    let buttons;
    try { buttons = root.querySelectorAll("nav button"); } catch { return; }
    const want = weT("个性设置");
    for (const btn of buttons) {
      try {
        if (patched.has(btn)) continue;
        if ((btn.textContent || "").trim() !== want) continue;
        const iconEl = btn.firstElementChild;

        if (!iconEl || iconEl === btn.lastElementChild && btn.childElementCount < 2) continue;

        try { if (iconEl.getAttribute("data-we-nav-icon") === "1") { patched.add(btn); continue; } } catch {   }

        const holder = document.createElement("div");
        holder.innerHTML = weIconSvgString(16);
        const icon = holder.firstElementChild;
        if (!icon) continue;
        const cls = iconEl.getAttribute ? iconEl.getAttribute("class") : "";
        if (cls) icon.setAttribute("class", cls);
        icon.setAttribute("data-we-nav-icon", "1");
        btn.replaceChild(icon, iconEl);
        patched.add(btn);
      } catch {   }
    }
  };

  patchIn(document.body);

  const obs = new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n && n.nodeType === 1) { patchIn(n); }
      }
    }
  });
  try { obs.observe(document.body, { childList: true }); } catch { return null; }

  const offLocale = weOnLocaleChange(() => {
    patched = new WeakSet();
    patchIn(document.body);
  });
  return () => {
    try { obs.disconnect(); } catch {   }
    try { offLocale(); } catch {   }
  };
}

export {
  renderWeIcon,
  installWeNavIcon,
};

const WE_ICON_GUIDE_INK = "#A797FC";
const WE_ICON_PARTS = [
  ["rect", { x: "1.7", y: "2.7", width: "12.6", height: "10.6", rx: "2.2" }],
  ["circle", { cx: "5.4", cy: "6.1", r: "1.05" }],
  ["path", { d: "M2.2 11.5l3-2.8 2.2 1.7 2.8-3 3.6 3.9" }],
];
const WE_ICON_VIEW_BOX = "0 0 16 16";

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
    const want = weT("壁纸引擎");
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

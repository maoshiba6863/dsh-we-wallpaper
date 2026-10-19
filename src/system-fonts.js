const SYSTEM_FONTS_CACHE_KEY = "we-system-fonts";
const SYSTEM_FONTS_TTL_MS = 10 * 60 * 1000;
function systemFontsFailureReason(res) {
  const bare = !res || !res.data || typeof res.data !== "object" || !res.data.error;
  if (bare && (res.status === 404 || res.status === 405)) {
    return weT("宿主里没有本机字体路由：重启 DSH 后再试（改过宿主代码要重挂，刷新页面不够）");
  }
  return hostFailureReason(res);
}
function systemFontsUrl() { return BASE + "/system-fonts"; }
function readCachedSystemFonts() {
  try {
    const raw = localStorage.getItem(SYSTEM_FONTS_CACHE_KEY);
    if (!raw) return [];
    const doc = JSON.parse(raw);
    if (!doc || !Array.isArray(doc.fonts)) return [];
    return systemFontKeyList(doc.fonts);
  } catch {
    return [];
  }
}
function writeSystemFontsCache(fonts, approximate) {
  try {
    localStorage.setItem(SYSTEM_FONTS_CACHE_KEY, JSON.stringify({ fonts, approximate: approximate === true }));
  } catch {   }
}
function systemFontKeyList(names) {
  return (Array.isArray(names) ? names : [])
    .filter((n) => typeof n === "string" && !n.trim().startsWith(".") && systemFontKeyOf(n) !== "");
}
async function ensureSystemFonts(force) {
  if (selection.systemFontsLoading) return;
  if (!force && selection.systemFontsAt && Date.now() - selection.systemFontsAt < SYSTEM_FONTS_TTL_MS) return;
  selection.systemFontsLoading = true;
  selection.systemFontsError = "";
  emit();
  try {
    const res = await apiFetch(systemFontsUrl() + (force ? "?refresh=1" : ""), { parse: "always" });
    if (res.ok && res.data && Array.isArray(res.data.fonts)) {
      const fonts = systemFontKeyList(res.data.fonts);
      selection.systemFonts = fonts;
      selection.systemFontsAt = Date.now();
      selection.systemFontsApproximate = res.data.approximate === true;
      selection.systemFontsError = "";
      writeSystemFontsCache(fonts, res.data.approximate === true);
    } else {
      selection.systemFontsError = res.ok
        ? weT("没读到本机字体清单")
        : systemFontsFailureReason(res);
    }
  } catch {
    selection.systemFontsError = weT("宿主不可达（请求未完成）");
  } finally {
    selection.systemFontsLoading = false;
    emit();
  }
}
const FONT_PROBE_TEXT = 'Hamburgefonstiv 0123456789';
let sysFontProbeFor = null;
let sysFontProbeResult = { fonts: [], skipped: 0, measured: false };
function probeUsableFamilies(doc, list) {
  const none = { fonts: list, skipped: 0, measured: false };
  if (!doc || typeof doc.createElement !== 'function') return none;
  try {
    const host = doc.body || doc.documentElement;
    if (!host || typeof host.appendChild !== 'function') return none;
    const box = doc.createElement('div');
    box.style.position = 'absolute';
    box.style.left = '-99999px';
    box.style.top = '0';
    box.style.visibility = 'hidden';
    box.style.whiteSpace = 'pre';
    box.style.fontSize = '32px';
    const rows = [];
    for (const name of list) {
      const a = doc.createElement('span');
      a.style.fontFamily = '"' + name + '", monospace';
      a.textContent = FONT_PROBE_TEXT;
      const b = doc.createElement('span');
      b.style.fontFamily = '"' + name + '", serif';
      b.textContent = FONT_PROBE_TEXT;
      box.appendChild(a);
      box.appendChild(b);
      rows.push([name, a, b]);
    }
    host.appendChild(box);
    const fonts = [];
    let skipped = 0;
    let measured = false;
    for (const [name, a, b] of rows) {
      const wa = a.getBoundingClientRect ? a.getBoundingClientRect().width : 0;
      const wb = b.getBoundingClientRect ? b.getBoundingClientRect().width : 0;
      if (!(wa > 0) || !(wb > 0)) { fonts.push(name); continue; }
      measured = true;
      if (Math.abs(wa - wb) < 0.01) fonts.push(name); else skipped++;
    }
    if (typeof box.remove === 'function') box.remove();
    else if (typeof host.removeChild === 'function') host.removeChild(box);
    return { fonts, skipped, measured };
  } catch {
    return none;
  }
}
function filterUsableSystemFonts(names) {
  const list = Array.isArray(names) ? names : [];
  if (sysFontProbeFor === list) return sysFontProbeResult;
  sysFontProbeResult = probeUsableFamilies(typeof document !== "undefined" ? document : null, list);
  sysFontProbeFor = list;
  return sysFontProbeResult;
}
export {
  readCachedSystemFonts, ensureSystemFonts,
  filterUsableSystemFonts,
};
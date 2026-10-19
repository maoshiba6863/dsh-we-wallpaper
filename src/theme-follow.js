const THEME_FOLLOW_LIGHT_ABOVE = 0.40;
const THEME_FOLLOW_SAMPLE_PX = 64;
let themeFollowService = null;
let themeFollowUnsub = null;
let themeFollowWritten = "";
let themeFollowYield = false;
let themeFollowWallpaperId = "";
let themeFollowSeq = 0;
let themeFollowBefore = "";
let themeFollowRank = 0;
let themeFollowPreviewVerdict = "";
let themeFollowFrameVerdict = "";
let themeFollowSchemeProvided = false;
let themeFollowLastLine = "";
function themeFollowEnabled() {
  try {
    return typeof selection !== "undefined" && !!selection && selection.themeFollow === true;
  } catch { return false; }
}
function themeFollowSkinYielded() {
  try { return typeof skinYieldActive === "function" && skinYieldActive() === true; } catch { return false; }
}
function themeFollowClearState() {
  const hadLine = !!themeFollowLastLine;
  themeFollowYield = false;
  themeFollowRank = 0;
  themeFollowPreviewVerdict = "";
  themeFollowFrameVerdict = "";
  themeFollowSchemeProvided = false;
  themeFollowLastLine = "";
  if (hadLine) {
    try { setTransient("themeFollowLine", ""); } catch {   }
  }
}
function themeFollowLinear(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function themeFollowLuminance(rgb) {
  return 0.2126 * themeFollowLinear(rgb[0]) + 0.7152 * themeFollowLinear(rgb[1]) + 0.0722 * themeFollowLinear(rgb[2]);
}
function themeFollowParseColor(value) {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  let m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(s);
  if (m) return [m[1], m[2], m[3]].map((x) => Math.max(0, Math.min(255, Math.round(Number(x)))));
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return m[1].split("").map((c) => parseInt(c + c, 16));
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)$/.exec(s);
  if (m) {
    const f = [m[1], m[2], m[3]].map(Number);
    if (f.some((x) => !Number.isFinite(x))) return null;
    const scale = f.every((x) => x <= 1) ? 255 : 1;
    return f.map((x) => Math.max(0, Math.min(255, Math.round(x * scale))));
  }
  return null;
}
function themeFollowVerdict(rgb) {
  if (!Array.isArray(rgb) || rgb.length < 3) return "";
  return themeFollowLuminance(rgb) > THEME_FOLLOW_LIGHT_ABOVE ? "light" : "dark";
}
function themeFollowModeColorOf(px, w, h) {
  if (!px || !w || !h) return null;
  const bins = new Map();
  let counted = 0;
  for (let i = 0; i + 3 < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    counted++;
    const key = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
    bins.set(key, (bins.get(key) || 0) + 1);
  }
  if (!counted) return null;
  let bestKey = -1;
  let bestCount = -1;
  for (const [key, count] of bins) {
    if (count > bestCount || (count === bestCount && key < bestKey)) { bestCount = count; bestKey = key; }
  }
  const r = (bestKey >> 8) & 0xf;
  const g = (bestKey >> 4) & 0xf;
  const b = bestKey & 0xf;
  return [r * 16 + 8, g * 16 + 8, b * 16 + 8];
}
function themeFollowDominantColorOf(url) {
  return new Promise((resolve) => {
    const done = (v) => { try { resolve(v); } catch {   } };
    try {
      if (!url || typeof document === "undefined" || typeof Image === "undefined") return done(null);
      const img = new Image();
      if (/^https?:\/\//i.test(url)) img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = THEME_FOLLOW_SAMPLE_PX;
          canvas.height = THEME_FOLLOW_SAMPLE_PX;
          const g = canvas.getContext && canvas.getContext("2d");
          if (!g) return done(null);
          g.drawImage(img, 0, 0, THEME_FOLLOW_SAMPLE_PX, THEME_FOLLOW_SAMPLE_PX);
          const data = g.getImageData(0, 0, THEME_FOLLOW_SAMPLE_PX, THEME_FOLLOW_SAMPLE_PX).data;
          done(themeFollowModeColorOf(data, THEME_FOLLOW_SAMPLE_PX, THEME_FOLLOW_SAMPLE_PX));
        } catch { done(null); }
      };
      img.onerror = () => done(null);
      img.src = url;
    } catch { done(null); }
  });
}
function themeFollowCurrentPreference() {
  try {
    const snap = themeFollowService && themeFollowService.getTheme && themeFollowService.getTheme();
    const p = snap && snap.preference;
    return typeof p === "string" ? p : "";
  } catch { return ""; }
}
function themeFollowIsUnfilledSchemeColor(rgb) {
  return Array.isArray(rgb) && rgb.length >= 3 && rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0;
}
function themeFollowSchemeColorOf(sel) {
  try {
    const token = typeof propTokenOf === "function" ? propTokenOf(sel) : "";
    if (token && typeof storedUserPropsOf === "function") {
      const over = storedUserPropsOf(token);
      const fromPanel = over && over.schemecolor;
      const parsed = themeFollowParseColor(fromPanel);
      if (parsed) return parsed;
    }
  } catch {   }
  const author = themeFollowParseColor(sel && sel.schemeColor);
  return themeFollowIsUnfilledSchemeColor(author) ? null : author;
}
function themeFollowImageUrlOf(sel) {
  const s = sel || {};
  return String(s.previewUrl || s.sceneFrameUrl || "");
}
function themeFollowApply(verdict) {
  if (!themeFollowEnabled()) return;
  if (!verdict || !themeFollowService || themeFollowYield || themeFollowSkinYielded()) return;
  const current = themeFollowCurrentPreference();
  if (current === verdict) {
    themeFollowWritten = verdict;
    themeFollowTrace(weT("保持 {verdict}（已是这个偏好，不重复写）", { verdict }));
    return;
  }
  if (!themeFollowBefore && current) themeFollowBefore = current;
  try {
    themeFollowWritten = verdict;
    themeFollowService.setTheme(verdict);
    themeFollowTrace(weT("切换为 {verdict}", { verdict }));
  } catch {   }
}
function themeFollowTrace(action) {
  try { reportClientDiag("theme-follow", action + "｜" + (themeFollowLastLine || weT("无取色结果"))); }
  catch {   }
  try { setTransient("themeFollowLine", themeFollowLastLine ? weT("{line}｜{action}", { line: themeFollowLastLine, action }) : action); }
  catch {   }
}
function themeFollowOnWallpaper(sel, opts) {
  if (!themeFollowEnabled()) return themeFollowClearState();
  if (themeFollowSkinYielded()) return;
  if (!themeFollowService) return;
  const id = String((sel && sel.id) || "");
  if (id !== themeFollowWallpaperId) {
    themeFollowWallpaperId = id;
    if (!(opts && opts.fromSkinRestore)) {
      themeFollowYield = false;
      themeFollowRank = 0;
    }
  }
  const seq = ++themeFollowSeq;
  themeFollowPreviewVerdict = "";
  themeFollowFrameVerdict = "";
  themeFollowLastLine = "";
  const scheme = themeFollowSchemeColorOf(sel);
  if (scheme) {
    themeFollowSchemeProvided = true;
    const verdict = themeFollowVerdict(scheme);
    themeFollowLastLine = themeFollowDescribe(weT("作者配色"), scheme, verdict);
    themeFollowApply(verdict);
    themeFollowTrace(weT(themeFollowCurrentPreference() === verdict ? "已生效" : "等待取色"));
    return;
  }
  themeFollowSchemeProvided = false;
  const url = themeFollowImageUrlOf(sel);
  if (!url) return;
  themeFollowDominantColorOf(url).then((rgb) => {
    if (seq !== themeFollowSeq) return;
    themeFollowAcceptImageVerdict(rgb, 1);
  });
}
function themeFollowRelease() {
  if (!themeFollowEnabled()) return;
  if (!themeFollowService) return;
  if (themeFollowYield) return;
  if (!themeFollowBefore) return;
  const current = themeFollowCurrentPreference();
  if (current && current !== themeFollowWritten) return;
  const back = themeFollowBefore;
  themeFollowBefore = "";
  themeFollowWritten = back;
  try {
    themeFollowService.setTheme(back);
    themeFollowTrace(weT("放回 {verdict}（随壁纸退场归还）", { verdict: back }));
  } catch {   }
}
function themeFollowResolveImageVerdict() {
  const p = themeFollowPreviewVerdict;
  const f = themeFollowFrameVerdict;
  if (!p) return f;
  if (!f) return p;
  return (p === "light" && f === "light") ? "light" : "dark";
}
function themeFollowAcceptImageVerdict(rgb, rank) {
  if (!themeFollowEnabled()) return;
  if (!themeFollowService || themeFollowYield || themeFollowSkinYielded()) return;
  if (themeFollowSchemeProvided) return;
  if (themeFollowWallpaperId !== String((typeof selection !== "undefined" && selection && selection.id) || "")) return;
  if (rank <= themeFollowRank) return;
  const verdict = themeFollowVerdict(rgb);
  if (!verdict) return;
  if (rank >= 2) themeFollowFrameVerdict = verdict; else themeFollowPreviewVerdict = verdict;
  themeFollowRank = rank;
  const resolved = themeFollowResolveImageVerdict();
  themeFollowLastLine = themeFollowDescribe(weT(rank >= 2 ? "帧" : "预览"), rgb, verdict)
    + (themeFollowPreviewVerdict && themeFollowFrameVerdict && themeFollowPreviewVerdict !== themeFollowFrameVerdict
      ? weT("｜两条腿不一致 ⇒ 取深色") : "");
  themeFollowApply(resolved);
}
function themeFollowDescribe(source, rgb, verdict) {
  const L = Array.isArray(rgb) ? themeFollowLuminance(rgb) : -1;
  const label = weT(verdict === "light" ? "浅色" : "深色");
  return L >= 0
    ? weT("{label} · 来源：{source}（亮度 {lum}）", { label, source, lum: L.toFixed(3) })
    : weT("{label} · 来源：{source}", { label, source });
}
function themeFollowOnFrameCanvas(canvas) {
  if (!themeFollowEnabled()) return;
  if (themeFollowSkinYielded()) return;
  try {
    if (!canvas || typeof document === "undefined") return;
    const probe = document.createElement("canvas");
    probe.width = THEME_FOLLOW_SAMPLE_PX;
    probe.height = THEME_FOLLOW_SAMPLE_PX;
    const g = probe.getContext && probe.getContext("2d");
    if (!g) return;
    g.drawImage(canvas, 0, 0, THEME_FOLLOW_SAMPLE_PX, THEME_FOLLOW_SAMPLE_PX);
    const px = g.getImageData(0, 0, THEME_FOLLOW_SAMPLE_PX, THEME_FOLLOW_SAMPLE_PX).data;
    themeFollowAcceptImageVerdict(themeFollowModeColorOf(px, THEME_FOLLOW_SAMPLE_PX, THEME_FOLLOW_SAMPLE_PX), 2);
  } catch {   }
}
function themeFollowOnFrameImage(url) {
  if (!themeFollowEnabled()) return;
  if (themeFollowSkinYielded()) return;
  themeFollowDominantColorOf(url).then((rgb) => themeFollowAcceptImageVerdict(rgb, 2));
}
function themeFollowAttach(theme, ctx) {
  try {
    if (!theme || typeof theme.setTheme !== "function") return;
    themeFollowService = theme;
    if (!themeFollowUnsub && ctx && typeof ctx.on === "function") {
      themeFollowUnsub = ctx.on("theme/change", () => {
        if (!themeFollowEnabled()) return;
        const now = themeFollowCurrentPreference();
        if (now && now !== themeFollowWritten) themeFollowYield = true;
      });
    }
    if (typeof selection !== "undefined" && selection && selection.id) themeFollowOnWallpaper(selection);
  } catch {   }
}
export {
  THEME_FOLLOW_LIGHT_ABOVE, THEME_FOLLOW_SAMPLE_PX,
  themeFollowParseColor, themeFollowLuminance, themeFollowVerdict, themeFollowModeColorOf,
  themeFollowIsUnfilledSchemeColor, themeFollowSchemeColorOf, themeFollowOnWallpaper, themeFollowAttach,
  themeFollowAcceptImageVerdict, themeFollowOnFrameCanvas, themeFollowOnFrameImage, themeFollowRelease,
};
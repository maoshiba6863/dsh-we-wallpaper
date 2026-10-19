const UNDERLAY_SAMPLE_DELAY_MS = 6000;
let underlayScheme = "";
let underlaySampled = "";
let underlaySampledFor = "";
let underlayResampleTimer = 0;
let underlayWritten = "";

function underlayRgbText(rgb) {
  return Array.isArray(rgb) && rgb.length >= 3
    ? "rgb(" + rgb[0] + ", " + rgb[1] + ", " + rgb[2] + ")"
    : "";
}

function writeUnderlayColor(reason) {
  if (typeof document === "undefined" || !document || !document.documentElement) return;
  const color = underlaySampled || underlayScheme;
  if (!color && !underlayWritten) return;
  try {
    const st = document.documentElement.style;
    if (color) st.setProperty("--we-wallpaper-underlay", color);
    else st.removeProperty("--we-wallpaper-underlay");
  } catch {   }
  if (color === underlayWritten) return;
  underlayWritten = color;
  liveLog("underlay", "色=" + (color || "-") + " 源=" + reason + " wid=" + (selection.id || "-"));
}

function refreshUnderlayColor() {
  let next;
  try { next = underlayRgbText(themeFollowSchemeColorOf(selection)); } catch { next = ""; }
  if (next === underlayScheme) return;
  underlayScheme = next;
  writeUnderlayColor(weT("作者配色"));
}

function clearUnderlayColor() {
  underlayScheme = "";
  underlaySampled = "";
  underlaySampledFor = "";
  underlayWritten = "";
  scrubUnderlayResample();
  if (typeof document === "undefined" || !document || !document.documentElement) return;
  try { document.documentElement.style.removeProperty("--we-wallpaper-underlay"); } catch {   }
}

function scrubUnderlayResample() {
  if (!underlayResampleTimer) return;
  try { if (typeof window !== "undefined" && window.clearTimeout) window.clearTimeout(underlayResampleTimer); } catch {   }
  underlayResampleTimer = 0;
}

function sampleUnderlayOnce(el, wid) {
  try {
    if (!el || typeof document === "undefined" || !document) return false;
    const probe = document.createElement("canvas");
    if (!probe || typeof probe.getContext !== "function") return false;
    probe.width = THEME_FOLLOW_SAMPLE_PX;
    probe.height = THEME_FOLLOW_SAMPLE_PX;
    const g = probe.getContext("2d");
    if (!g) return false;
    g.drawImage(el, 0, 0, THEME_FOLLOW_SAMPLE_PX, THEME_FOLLOW_SAMPLE_PX);
    const px = g.getImageData(0, 0, THEME_FOLLOW_SAMPLE_PX, THEME_FOLLOW_SAMPLE_PX).data;
    const text = underlayRgbText(themeFollowModeColorOf(px, THEME_FOLLOW_SAMPLE_PX, THEME_FOLLOW_SAMPLE_PX));
    if (!text) return false;
    if (underlaySampledFor !== wid) return false;
    if (text === underlaySampled) return true;
    underlaySampled = text;
    writeUnderlayColor(weT("画面取样"));
    return true;
  } catch { return false; }
}

function scheduleUnderlaySample(node) {
  try {
    if (!node || typeof document === "undefined" || !document) return;
    const wid = String(selection.id || "");
    if (!wid) return;
    if (underlaySampledFor !== wid) {
      underlaySampledFor = wid;
      underlaySampled = "";
      scrubUnderlayResample();
      writeUnderlayColor(weT("换壁纸"));
    }
    const el = node.querySelector("canvas.we-media--canvas")
      || node.querySelector("video.we-media")
      || node.querySelector("img.we-media");
    if (!el) return;
    const armed = el.dataset ? el.dataset.weUnderlayWid : "";
    if (armed === wid) return;
    if (el.dataset) el.dataset.weUnderlayWid = wid;
    const kind = String(el.tagName || "").toUpperCase();
    const ready = kind === "CANVAS"
      || (kind === "VIDEO" && Number(el.readyState) >= 2 && Number(el.videoWidth) > 0)
      || (kind === "IMG" && el.complete && Number(el.naturalWidth) > 0);
    const take = (again) => {
      try {
        if (String(selection.id || "") !== wid) return;
        if (!sampleUnderlayOnce(el, wid)) return;
        if (!again) {
          scrubUnderlayResample();
          underlayResampleTimer = window.setTimeout(() => {
            underlayResampleTimer = 0;
            try { if (String(selection.id || "") === wid) sampleUnderlayOnce(el, wid); } catch {   }
          }, UNDERLAY_SAMPLE_DELAY_MS);
        }
      } catch {   }
    };
    if (ready) take(false);
    else if (typeof el.addEventListener === "function") {

      const ev = kind === "VIDEO" ? "loadeddata" : "load";
      try { el.addEventListener(ev, () => take(false), { once: true }); } catch {   }
    }
  } catch {   }
}

function probeWallpaperOnScreen(source) {
  try {
    const node = document.getElementById(LAYER_ID);
    liveLog("onscreen", source + " · " + onScreenBrief(node));
    const v = node && node.querySelector ? node.querySelector("video.we-media") : null;
    if (!v || typeof v.requestVideoFrameCallback !== "function") return;
    const t0 = Date.now();
    v.requestVideoFrameCallback(() => {
      try {
        liveLog("onscreen", source + " · 画面呈现于 +" + Math.round(Date.now() - t0) + "ms · "
          + onScreenBrief(document.getElementById(LAYER_ID)));
      } catch {   }
    });
  } catch {   }
}

function setWallpaperActive(active) {
  const body = document.body;
  if (active) body.setAttribute(ACTIVE_ATTR, "on");
  else body.removeAttribute(ACTIVE_ATTR);
  if (document.documentElement?.dataset?.windowsTitlebar === undefined) return;
  const marker = "--we-caption-active";
  if (active) {
    if (body.style.getPropertyValue(marker) !== "1") body.style.setProperty(marker, "1");
  } else if (body.style.getPropertyValue(marker)) {
    body.style.removeProperty(marker);
  }
}

export { refreshUnderlayColor, clearUnderlayColor, probeWallpaperOnScreen };

const FONTSET_CACHE_KEY = "we-fontset-active";

const fsFetch = (path, options) => apiFetch(path, Object.assign({ parse: "always" }, options || {}));
const fsJson = (path, options) => fsFetch(path, Object.assign({ method: "GET" }, options || {}));

function fontSetFailureReason(res) {
  const bare = !res || !res.data || typeof res.data !== "object" || !res.data.error;
  if (bare && (res.status === 404 || res.status === 405)) {
    return weT("宿主里没有字体集路由：重启 DSH 后再试（改过宿主代码要重挂，刷新页面不够）");
  }
  return hostFailureReason(res);
}

function fontSetsUrl() { return BASE + "/fontsets"; }
function fontSetUrl(id) { return fontSetsUrl() + "/" + encodeURIComponent(id); }

function readCachedFontSet() {
  try {
    const raw = localStorage.getItem(FONTSET_CACHE_KEY);
    if (!raw) return null;
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== "object" || !isFontSetId(doc.id)) return null;
    return { id: doc.id, values: sanitizeFontset(doc.values), dirty: doc.dirty === true };
  } catch {
    return null;
  }
}

function fontValueDefaults() { return sanitizeFontset({}); }

function readCachedFontSetValues() {
  const doc = readCachedFontSet();
  return doc ? doc.values : fontValueDefaults();
}
function writeFontSetCache(id, values, dirty) {

  try { localStorage.setItem(FONTSET_CACHE_KEY, JSON.stringify({ id, values, dirty: dirty === true })); } catch {   }
}

let activeFontSetId = "";

let activeFontSetValues = "";
let fontSetTimer = null;

let fontSetDirty = false;

let fontSetWrites = 0;

function pickFontValues() {
  const out = {};
  for (const key of FONTSET_KEYS) out[key] = selection[key];
  return sanitizeFontset(out);
}

function cacheFontValues() {
  writeFontSetCache(activeFontSetId || FONTSET_MIGRATED_ID, pickFontValues(), true);
}

async function pushFontSet() {
  const id = activeFontSetId || FONTSET_MIGRATED_ID;
  const values = pickFontValues();
  try {
    const res = await fsFetch(fontSetUrl(id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
      keepalive: true,
    });
    fontSetDirty = !res.ok;
    if (res.ok) {
      activeFontSetId = id;
      writeFontSetCache(id, values, false);
      selection.fontSetError = "";
    } else {
      selection.fontSetError = fontSetFailureReason(res);
    }
  } catch {
    fontSetDirty = true;
  }
}
function flushFontSet() {
  fontSetTimer = null;
  cacheFontValues();
  pushFontSet();
}
function scheduleFontSet() {
  if (fontSetTimer) return;
  if (typeof window === "undefined" || typeof window.setTimeout !== "function") {
    flushFontSet();
    return;
  }
  fontSetTimer = window.setTimeout(flushFontSet, 200);
}

function setFontValues(patch) {
  if (patch && typeof patch === "object") {
    for (const key of FONTSET_KEYS) if (key in patch) selection[key] = patch[key];
  }
  fontSetWrites++;
  scheduleFontSet();
}

const PRESET_FONTSET_ID = "preset-font";

async function landPresetFontSet(values, name) {
  try {
    const res = await fsFetch(fontSetUrl(PRESET_FONTSET_ID), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: typeof name === "string" && name.trim() ? name.trim() : weT("预设字体"),
        values,
      }),
    });
    if (!res.ok) { selection.fontSetError = fontSetFailureReason(res); return false; }
  } catch {
    selection.fontSetError = weT("宿主不可达（请求未完成）");
    return false;
  }
  return activateFontSet(PRESET_FONTSET_ID);
}

function persistFontSet() {
  fontSetWrites++;
  scheduleFontSet();
}

function onPageHideFlushFontSet() {
  if (fontSetTimer && typeof window.clearTimeout === "function") {
    window.clearTimeout(fontSetTimer);
    flushFontSet();
  }
}
function onVisibilityResyncFontSet() {
  if (!document.hidden && fontSetDirty && !fontSetTimer) scheduleFontSet();
}

async function loadFontSet() {
  const writesAtStart = fontSetWrites;
  const before = JSON.stringify(pickFontValues());
  let values = null;
  let id = "";
  let why = "";
  try {
    const listRes = await fsJson(fontSetsUrl());
    const listData = (listRes.ok && !listRes.error && listRes.data) ? listRes.data : null;

    if (listData && Array.isArray(listData.fontsets)) selection.fontSets = listData.fontsets;
    const active = listData ? listData.active : null;
    if (!listRes.ok || listRes.error) {
      why = fontSetFailureReason(listRes);
    } else if (!isFontSetId(active)) {
      why = weT("宿主没有活动字体集");
    } else {
      id = active;
      const oneRes = await fsJson(fontSetUrl(active));
      if (oneRes.ok && !oneRes.error && oneRes.data && oneRes.data.values) {
        values = sanitizeFontset(oneRes.data.values);
      } else {
        why = fontSetFailureReason(oneRes);
      }
    }
  } catch {
    why = weT("宿主不可达（请求未完成）");
  }

  if (values) {
    activeFontSetId = id;
    selection.fontSetActive = id;

    if (fontSetWrites === writesAtStart) {

      const cached = readCachedFontSet();
      const cachedNewer = Boolean(cached && cached.dirty && cached.id === id
        && canonicalFontValues(cached.values) !== canonicalFontValues(values));
      if (cachedNewer) {
        Object.assign(selection, cached.values);
        activeFontSetValues = canonicalFontValues(cached.values);
        scheduleFontSet();
      } else {
        Object.assign(selection, values);
        writeFontSetCache(id, values);
        activeFontSetValues = canonicalFontValues(values);
      }
    } else {

      activeFontSetValues = canonicalFontValues(values);
    }
    selection.fontSetError = "";
  } else {

    if (isFontSetId(id)) { activeFontSetId = id; selection.fontSetActive = id; }
    selection.fontSetError = why || weT("字体集不可用");
  }
  if (values && JSON.stringify(pickFontValues()) !== before) applyEffects();
  emit();
  return Boolean(values);
}

async function refreshFontSets() {
  try {
    const res = await fsJson(fontSetsUrl());
    if (!res.ok || res.error) {
      selection.fontSetError = fontSetFailureReason(res);
      return false;
    }
    const data = res.data || {};
    selection.fontSets = Array.isArray(data.fontsets) ? data.fontsets : [];
    if (isFontSetId(data.active)) activeFontSetId = data.active;
    selection.fontSetActive = isFontSetId(data.active) ? data.active : "";
    selection.fontSetError = "";
    return true;
  } catch {
    selection.fontSetError = weT("宿主不可达（请求未完成）");
    return false;
  }
}

function canonicalFontValues(values) {
  return JSON.stringify(sanitizeFontset(values || {}));
}

function fontSetDrifted() {
  return activeFontSetValues !== "" && canonicalFontValues(pickFontValues()) !== activeFontSetValues;
}

async function activateFontSet(id) {
  if (!isFontSetId(id)) return false;
  try {
    const res = await fsFetch(fontSetUrl(id) + "/activate", { method: "POST" });
    if (!res.ok) { selection.fontSetError = fontSetFailureReason(res); return false; }
    activeFontSetId = id;
    selection.fontSetActive = id;
    selection.fontSetError = "";
    await loadFontSet();
    return true;
  } catch {
    selection.fontSetError = weT("宿主不可达（请求未完成）");
    return false;
  }
}

function newFontSetId() {
  return "set-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}

async function createFontSet(name) {
  const id = newFontSetId();
  const values = pickFontValues();
  try {
    const res = await fsFetch(fontSetUrl(id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: typeof name === "string" && name.trim() ? name.trim() : id, values }),
    });
    if (!res.ok) { selection.fontSetError = fontSetFailureReason(res); return ""; }
    await activateFontSet(id);
    return id;
  } catch {
    selection.fontSetError = weT("宿主不可达（请求未完成）");
    return "";
  }
}

async function renameFontSet(id, name) {
  if (!isFontSetId(id) || typeof name !== "string" || !name.trim()) return false;
  try {
    const one = await fsJson(fontSetUrl(id));
    if (!one.ok || !one.data) { selection.fontSetError = fontSetFailureReason(one); return false; }
    const res = await fsFetch(fontSetUrl(id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), values: one.data.values }),
    });
    if (!res.ok) { selection.fontSetError = fontSetFailureReason(res); return false; }
    selection.fontSetError = "";
    await refreshFontSets();
    return true;
  } catch {
    selection.fontSetError = weT("宿主不可达（请求未完成）");
    return false;
  }
}

async function deleteFontSet(id) {
  if (!isFontSetId(id)) return false;
  try {
    const res = await fsFetch(fontSetUrl(id), { method: "DELETE" });
    if (!res.ok) { selection.fontSetError = fontSetFailureReason(res); return false; }
    selection.fontSetError = "";
    await refreshFontSets();
    return true;
  } catch {
    selection.fontSetError = weT("宿主不可达（请求未完成）");
    return false;
  }
}

function exportFontSetUrl(id) {
  return isFontSetId(id) ? fontSetUrl(id) + "/export" : "";
}

function readFileText(file) {
  if (file && typeof file.text === "function") return Promise.resolve(file.text());
  return new Promise((resolve, reject) => {
    try {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result == null ? "" : fr.result));
      fr.onerror = () => reject(new Error("read-failed"));
      fr.readAsText(file);
    } catch (e) {
      reject(e);
    }
  });
}

async function importFontSet(file) {
  selection.fontSetError = "";
  let text;
  try {
    text = await readFileText(file);
  } catch {
    selection.fontSetError = weT("读不出这个文件（换一个 .json 再试）");
    return "";
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    selection.fontSetError = weT("这不是 JSON 文件（字体集是导出出来的 .json）");
    return "";
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc) || doc.$schema !== FONTSET_SCHEMA_TAG) {
    selection.fontSetError = weT("这不是字体集文件（需要 {tag} 标记 —— 只有从「导出」拿到的文件才有）", { tag: FONTSET_SCHEMA_TAG });
    return "";
  }
  try {
    const res = await fsFetch(fontSetsUrl() + "/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: text,

      parse: "always",
    });
    if (!res.ok) {
      selection.fontSetError = fontSetFailureReason(res);
      return "";
    }
    const data = res.data || {};
    selection.fontSetError = "";
    await refreshFontSets();
    return typeof data.id === "string" ? data.id : "";
  } catch {
    selection.fontSetError = weT("宿主不可达（请求未完成）");
    return "";
  }
}

async function flushFontSetNow() {
  if (fontSetTimer && typeof window !== "undefined" && typeof window.clearTimeout === "function") {
    window.clearTimeout(fontSetTimer);
  }
  fontSetTimer = null;
  cacheFontValues();
  await pushFontSet();
}

function cancelPendingFontSet() {
  if (fontSetTimer && typeof window !== "undefined" && typeof window.clearTimeout === "function") {
    window.clearTimeout(fontSetTimer);
  }
  fontSetTimer = null;
}

export {
  fontValueDefaults, readCachedFontSetValues, loadFontSet, setFontValues, persistFontSet,
  onPageHideFlushFontSet, onVisibilityResyncFontSet, cancelPendingFontSet,
  landPresetFontSet,
  refreshFontSets, activateFontSet, createFontSet, renameFontSet, deleteFontSet,
  exportFontSetUrl, importFontSet, flushFontSetNow, fontSetDrifted,
};

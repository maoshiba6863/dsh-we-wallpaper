const gpFetch = (path, options) => apiFetch(path, Object.assign({ parse: "always" }, options || {}));
const gpJson = (path, options) => gpFetch(path, Object.assign({ method: "GET" }, options || {}));

function glassPresetFailureReason(res) {
  const bare = !res || !res.data || typeof res.data !== "object" || !res.data.error;
  if (bare && (res.status === 404 || res.status === 405)) {
    return weT("宿主里没有玻璃预设路由：重启 DSH 后再试（改过宿主代码要重挂，刷新页面不够）");
  }

  if (res.status === 404 && res.data && res.data.error === "unknown preset") {
    if (res.data.reason === "tombstone") {
      return weT("这份出厂预设已被删除 —— 刷新清单后会从列表里消失");
    }
    if (res.data.reason === "missing") {
      return weT("这份预设不存在了 —— 可能已被删掉，刷新清单后再选一份");
    }
    return weT("宿主里没有玻璃预设路由：重启 DSH 后再试（改过宿主代码要重挂，刷新页面不够）");
  }
  return hostFailureReason(res);
}

function setPresetError(why) {
  setTransient("glassPresetNote", "");
  selection.glassPresetError = why;
  emit();
}

function glassPresetsUrl() { return BASE + "/glass-presets"; }
function glassPresetCreateUrl() { return glassPresetsUrl() + "/create"; }
function glassPresetUrl(id) { return glassPresetsUrl() + "/" + encodeURIComponent(id); }

function pickPresetValues() {
  const out = {};
  for (const key of PROFILE_PRESET_KEYS) out[key] = selection[key];
  return sanitizePresetValues(out);
}

function pickPresetFontValues() {
  const out = {};
  for (const key of FONTSET_KEYS) out[key] = selection[key];
  return sanitizeFontset(out);
}

async function loadGlassPresets() {
  try {
    const res = await gpJson(glassPresetsUrl());
    if (!res.ok || res.error) {
      setPresetError(glassPresetFailureReason(res));
      return false;
    }
    const data = res.data || {};
    selection.glassPresets = Array.isArray(data.presets) ? data.presets : [];
    setPresetError("");
    return true;
  } catch {
    setPresetError(weT("宿主不可达（请求未完成）"));
    return false;
  }
}

async function refreshGlassPresets() { return loadGlassPresets(); }

async function applyPresetAssets(applied) {
  if (!applied || typeof applied !== "object" || Array.isArray(applied)) {
    return weT("预设的资产应用失败：{reason}", { reason: weT("宿主回包里没有 applied 形状") });
  }
  const font = applied.font;
  if (font && typeof font === "object" && font.values && typeof font.values === "object") {

    if (!(await landPresetFontSet(sanitizeFontset(font.values), font.name))) {
      return weT(selection.fontSetError || "宿主不可达（请求未完成）");
    }
  }
  const avatar = applied.avatar;
  if (avatar && typeof avatar === "object" && !Array.isArray(avatar)) {
    if (avatar.cleared === true) {

      setSetting("avatarUserImage", "");
      setSetting("avatarAiImage", "");
    } else {

      if (avatar.user && typeof avatar.user === "object") {
        setSetting("avatarUserImage", typeof avatar.user.file === "string" ? avatar.user.file : "");
      }
      if (avatar.ai && typeof avatar.ai === "object") {
        setSetting("avatarAiImage", typeof avatar.ai.file === "string" ? avatar.ai.file : "");
      }
    }
  }
  return "";
}

function reapplyAll() {
  syncLayers();
  syncRotationTimer();
  syncSceneAudio(selection);
}

async function applyPreset(id) {
  if (!isGlassPresetId(id)) return false;
  try {
    const res = await gpJson(glassPresetUrl(id));
    if (!res.ok || res.error) {
      setPresetError(glassPresetFailureReason(res));
      return false;
    }

    const values = sanitizePresetValues(res.data && res.data.values);

    const before = {};
    for (const key of PROFILE_PRESET_KEYS) before[key] = selection[key];
    Object.assign(selection, values);

    const rawAssets = res.data && res.data.assets;
    if (rawAssets && typeof rawAssets === "object" && !Array.isArray(rawAssets)) {
      const assetRes = await gpFetch(glassPresetUrl(id) + "/install-assets", { method: "POST" });
      const applied = assetRes.ok && !assetRes.error ? assetRes.data && assetRes.data.applied : null;
      const why = applied ? (await applyPresetAssets(applied)) : glassPresetFailureReason(assetRes);
      if (why) {

        for (const key of PROFILE_PRESET_KEYS) selection[key] = before[key];
        setPresetError(weT("预设的资产应用失败：{reason}", { reason: weT(why) }));
        return false;
      }
    }
    setPresetError("");
    persistSelection();
    reapplyAll();
    emit();
    return true;
  } catch {
    setPresetError(weT("宿主不可达（请求未完成）"));
    return false;
  }
}

async function applyGlassPreset(id) { return applyPreset(id); }

function newGlassPresetId() {
  return "preset-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}

function presetSaveChecks(checks) {
  const c = checks && typeof checks === "object" ? checks : {};
  const notes = [];
  if (c.font === true) {
    const f = pickPresetFontValues();
    const hasFontTweaks = f.themeColors && typeof f.themeColors === "object"
      && Object.keys(f.themeColors).length > 0;
    if (!hasFontTweaks) {
      notes.push(weT("字体这一族会按本机现状存成「无」（当前字体集还是全默认）—— 套用它的人回到内置字体；想带上自己的就先在字体页调好，或取消勾选「字体」（不勾 = 不动对方的字体）"));
    }
  }
  if (c.avatar === true && !selection.avatarUserImage && !selection.avatarAiImage) {
    notes.push(weT("头像这一族会按本机现状存成「无」（本机没有自定义会话头像）—— 套用它的人回到内置默认头像；想带上自己的就先在「扩展」页签导入，或取消勾选「头像」（不勾 = 不动对方的头像）"));
  }
  return notes.join(" ");
}

async function saveGlassPreset(name) {
  const checks = (selection.glassPresetAssetChecks && typeof selection.glassPresetAssetChecks === "object")
    ? selection.glassPresetAssetChecks : {};
  const embeds = ["font", "avatar"].filter((k) => checks[k] === true);
  return savePresetWithEmbeds(name, embeds);
}

async function savePresetWithEmbeds(name, embeds) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) {
    setPresetError(weT("先给预设起个名字"));
    return "";
  }
  const list = Array.isArray(embeds) ? embeds.filter((k) => k === "font" || k === "avatar") : [];
  const assetNote = presetSaveChecks({ font: list.includes("font"), avatar: list.includes("avatar") });

  const values = pickPresetValues();
  try {
    const res = await gpFetch(glassPresetCreateUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmed, values, id: newGlassPresetId(), embed: list,
      }),
    });
    if (!res.ok) {
      setPresetError(glassPresetFailureReason(res));
      return "";
    }
    setPresetError("");
    if (assetNote) setTransient("glassPresetNote", assetNote);
    await refreshGlassPresets();
    emit();
    const data = res.data || {};
    return typeof data.id === "string" ? data.id : "";
  } catch {
    setPresetError(weT("宿主不可达（请求未完成）"));
    return "";
  }
}

function exportGlassPresetUrl(id, embeds) {
  if (!isGlassPresetId(id)) return "";
  const list = Array.isArray(embeds) ? embeds.filter((k) => k === "font" || k === "avatar") : [];
  const q = [];
  if (list.length) q.push("assets=" + encodeURIComponent(list.join(",")));
  return glassPresetUrl(id) + "/export" + (q.length ? "?" + q.join("&") : "");
}

async function importGlassPreset(file) {
  setPresetError("");
  let text;
  try {
    text = await gpReadFileText(file);
  } catch {
    setPresetError(weT("读不出这个文件（换一个 .json 再试）"));
    return "";
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    setPresetError(weT("这不是 JSON 文件（预设是导出出来的 .json）"));
    return "";
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc) || doc.$schema !== PROFILE_PRESET_SCHEMA_TAG) {
    setPresetError(weT("这不是预设文件（需要 {tag} 标记 —— 只有从「导出」拿到的文件才有）", { tag: PROFILE_PRESET_SCHEMA_TAG }));
    return "";
  }
  try {
    const res = await gpFetch(glassPresetsUrl() + "/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: text,
    });
    if (!res.ok) {
      setPresetError(glassPresetFailureReason(res));
      return "";
    }
    const data = res.data || {};
    const name = typeof data.name === "string" && data.name ? data.name : (typeof data.id === "string" ? data.id : "");
    setTransient("glassPresetNote", weT("已导入：{name}（在上面列表里点它才会应用）", { name }));
    setPresetError("");
    await refreshGlassPresets();
    emit();
    return typeof data.id === "string" ? data.id : "";
  } catch {
    setPresetError(weT("宿主不可达（请求未完成）"));
    return "";
  }
}

function gpReadFileText(file) {
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

async function deleteGlassPreset(id) {
  if (!isGlassPresetId(id)) return false;
  try {
    const res = await gpFetch(glassPresetUrl(id), { method: "DELETE" });
    if (!res.ok) {
      setPresetError(glassPresetFailureReason(res));
      return false;
    }
    setPresetError("");
    await refreshGlassPresets();
    emit();
    return true;
  } catch {
    setPresetError(weT("宿主不可达（请求未完成）"));
    return false;
  }
}

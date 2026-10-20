const React = require("react");

const ReactDOM = require("react-dom");

const SETTINGS_KEY = "dsh-wallpaper-engine:selection";

const SETTINGS_URL = "/wallpaper-engine/settings";

const PROPS_URL = "/wallpaper-engine/props";
const INVENTORY_URL = "/wallpaper-engine/inventory";

const ACTIVE_ATTR = "data-we-wallpaper";
const LAYER_ID = "dsh-wallpaper-engine-layer";
const SCRIM_ID = "dsh-wallpaper-engine-scrim";

const FONT_FAMILY_STACKS = {
  inherit: "inherit",
  "Microsoft YaHei": '"Microsoft YaHei", sans-serif',
  KaiTi: 'KaiTi, serif',
  SimSun: 'SimSun, serif',
  SimHei: 'SimHei, sans-serif',
  STXingkai: '"STXingkai", "Xingkai SC", KaiTi, serif',
  monospace: 'ui-monospace, Consolas, "Courier New", monospace',
};
const FONT_FAMILY_LABELS = [
  { v: "inherit", get label() { return weT("默认"); } },
  { v: "Microsoft YaHei", get label() { return weT("雅黑"); } },
  { v: "KaiTi", get label() { return weT("楷体"); } },
  { v: "SimSun", get label() { return weT("宋体"); } },
  { v: "SimHei", get label() { return weT("黑体"); } },
  { v: "STXingkai", get label() { return weT("行楷"); } },
  { v: "monospace", get label() { return weT("等宽"); } },
];

const FONT_FAMILY_BY_STACK = Object.create(null);
for (const [key, stack] of Object.entries(FONT_FAMILY_STACKS)) FONT_FAMILY_BY_STACK[stack] = key;

const FONT_STACK_FALLBACK = 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif';

const FONT_STACK_TAIL = ', var(--we-host-font-family, ' + FONT_STACK_FALLBACK + ')';

function systemFontStack(key) {
  const name = systemFontNameOf(key);
  return name ? '"' + name + '"' : "";
}

function fontFamilyStack(v) {
  const key = typeof v === "string" ? v.trim() : "";
  if (!key || key === "inherit") return "inherit";
  const base = FONT_FAMILY_STACKS[key] || (isSystemFontKey(key) ? systemFontStack(key) : (FONT_FAMILY_BY_STACK[key] || ""));
  if (!base || base === "inherit") return "inherit";
  return base + FONT_STACK_TAIL;
}

function fontFamilyKeyOf(v) {
  const key = typeof v === "string" ? v.trim() : "";
  if (!key) return "";
  if (FONT_FAMILY_STACKS[key] || isSystemFontKey(key)) return key;
  return FONT_FAMILY_BY_STACK[key] || "";
}

function fontFamilyStackConcrete(v) {
  const stack = fontFamilyStack(v);
  if (stack.indexOf("var(") < 0) return stack;
  let snapshot = "";

  try { snapshot = document.documentElement.style.getPropertyValue("--we-host-font-family").trim(); } catch {   }
  return stack.replace(/var\(--we-host-font-family,\s*([^)]*)\)/, snapshot || "$1");
}

const ACCENT_PRESETS = [
  "#4f8cff",
  "#67DCE7",
  "#DD8FAC",
  "#F3B75F",
  "#F1717F",
  "#CBE77D",
];

const GLASS_COLOR_PRESETS = [
  "#ffffff",
  "#0d1524",
  "#67DCE7",
  "#DD8FAC",
  "#F3B75F",
  "#F1717F",
];

const CARET_COLOR_PRESETS = [
  "#ffffff",
  "#000000",
  "#4f8cff",
  "#67DCE7",
  "#DD8FAC",
  "#F1717F",
];

function sanitizeSettings(o) {
  return sanitizeFromSchema(o, "client");
}

const selection = {

  ...panelDefaults(),
  ...readPersisted(),

  ...fontValueDefaults(),
  ...readCachedFontSetValues(),

  systemFonts: readCachedSystemFonts(),

  hostLoaded: false,

  systemFontsAt: 0,
  systemFontsApproximate: false,
  systemFontsLoading: false,
  systemFontsError: "",

  fontSetError: "",

  fontSetOpen: false,
  fontSets: [],
  fontSetActive: "",
  fontSetLoading: false,
  fontSetEditing: "",
  fontSetDraftName: "",

  glassPresets: [],
  glassPresetError: "",
  glassPresetBusy: false,
  glassPresetSaving: false,
  glassPresetDraftName: "",
  glassPresetNote: "",

  glassPresetSaveTarget: "",
  glassPresetTargetId: "",
  glassPresetAssetChecks: { font: true, avatar: false, fontAvailable: false, avatarAvailable: false },
  url: null,
  type: null,
  previewUrl: null,

  mediaExt: null,

  sceneVideo: null,

  sceneLiveSrc: null,
  webLiveSrc: null,

  propsUrl: null,

  sceneLiveActive: false,

  sceneAudioUrl: null,
  sceneHasAudio: false,

  mediaInfo: null,

  sidebarPresent: false,

  transcodeState: "idle",

  transcodeProgress: null,
  playing: true,

  videoPlaying: true,

  videoError: "",

  blockedNote: "",
  loading: false,
  rotationTimer: null,

  editing: null,

  batchMode: false,
  batchSelected: [],
  page: 0,
  hiddenPage: 0,
  editorPage: 0,
  hiddenOpen: false,
  pickerOpen: false,

  pickerDraft: false,
  modalView: "normal",

  search: "",

  qpSearch: "",

  settingsTabRequest: "",

  armedConfirm: "",

  uploading: false,
  uploadError: "",
  uploadNote: "",

  avatarBusy: "",
  avatarError: "",
  avatarCompressing: false,



  editingUploadDir: false,
  uploadDirDraft: "",

  editingCacheDir: false,
  cacheDirDraft: "",
  cacheDirBusy: false,
  cacheDirError: "",
  cacheDirNote: "",

  cacheDirBrowse: null,

  editingWeAssetsDir: false,
  weAssetsDirDraft: "",
  weAssetsError: "",
  inventory: { installDir: null, uploadDir: null, cacheDir: null, weAssetsDir: null, weAssetsAvailable: false, sceneMediaBase: "", wallpapers: [], total: 0, portableCount: 0, playlists: [], error: null },
  loaded: false,
};

const listeners = new Set();
function emit() { for (const fn of [...listeners]) fn(); }
function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

const SKIN_YIELD_EXIT_GRACE_MS = 2600;
const SKIN_YIELD_ENTER_GRACE_MS = 450;

let skinYielded = false;
let skinYieldMemory = null;
let skinYieldExitTimer = null;
let skinYieldEnterTimer = null;

function skinYieldActive() {
  try { return skinYielded === true; } catch { return false; }
}

function enterSkinYield(reason) {
  if (skinYielded) return;
  skinYielded = true;
  skinYieldMemory = { id: String(selection.id || ""), rotationEnabled: selection.rotationEnabled === true };

  setSetting("skinYieldRestoreId", skinYieldMemory.id);
  setSetting("skinYieldRestoreRotation", skinYieldMemory.rotationEnabled);
  if (selection.rotationEnabled) setSetting("rotationEnabled", false);
  applySelection("");
  persistSelection();
  applyEffects();
  emit();
  reportClientDiag("skin-yield", "enter · " + reason + " · restore=" + (skinYieldMemory.id || "-"));
}

function exitSkinYield(reason, opts) {
  if (!skinYielded) return;
  const skipRestore = !!(opts && opts.skipRestore);
  skinYielded = false;
  const mem = skinYieldMemory || {};
  skinYieldMemory = null;
  if (!skipRestore && !selection.id && mem.id) {

    applySelection(mem.id, { fromSkinRestore: true });
  }
  if (mem.rotationEnabled && selection.rotationEnabled !== true) setSetting("rotationEnabled", true);

  setSetting("skinYieldRestoreId", "");
  setSetting("skinYieldRestoreRotation", false);
  persistSelection();
  applyEffects();
  emit();
  reportClientDiag("skin-yield", "exit · " + reason);
}

function scheduleSkinYieldEnter(reason) {
  if (skinYieldEnterTimer !== null || skinYielded) return;
  const fire = () => {
    skinYieldEnterTimer = null;
    try {
      if (!document.documentElement.hasAttribute("data-dsh-skin")) return;

      const wallMarkerOn = !!(document.body && document.body.hasAttribute("data-we-wallpaper"));
      if (!wallMarkerOn && (selection.id || !selection.loaded)) return;
      enterSkinYield(reason + "/dom");
    } catch {   }
  };
  try {
    if (typeof window === "undefined" || typeof window.setTimeout !== "function") { fire(); return; }
    skinYieldEnterTimer = window.setTimeout(fire, SKIN_YIELD_ENTER_GRACE_MS);
  } catch { fire(); }
}

function cancelSkinYieldEnter() {
  if (skinYieldEnterTimer === null) return;
  try { if (typeof window !== "undefined" && typeof window.clearTimeout === "function") window.clearTimeout(skinYieldEnterTimer); } catch {   }
  skinYieldEnterTimer = null;
}

function cancelSkinYieldExit() {
  if (skinYieldExitTimer === null) return;
  try { if (typeof window !== "undefined" && typeof window.clearTimeout === "function") window.clearTimeout(skinYieldExitTimer); } catch {   }
  skinYieldExitTimer = null;
}

function scheduleSkinYieldExit(reason) {
  if (skinYieldExitTimer !== null) return;
  const fire = () => {
    skinYieldExitTimer = null;
    try {
      if (document.documentElement.hasAttribute("data-dsh-skin")) return;
      exitSkinYield(reason + "/cleared");
    } catch {   }
  };
  try {
    if (typeof window === "undefined" || typeof window.setTimeout !== "function") { fire(); return; }
    skinYieldExitTimer = window.setTimeout(fire, SKIN_YIELD_EXIT_GRACE_MS);
  } catch { fire(); }
}

function syncSkinYield(reason) {
  try {
    if (document.documentElement.hasAttribute("data-dsh-skin")) {
      cancelSkinYieldExit();

      scheduleSkinYieldEnter(reason);
      return;
    }
    cancelSkinYieldEnter();
    if (skinYielded) scheduleSkinYieldExit(reason);
  } catch {   }
}

function installSkinInterop() {
  if (typeof document === "undefined" || !document.documentElement) return () => {};
  let observer = null;
  try {
    observer = new MutationObserver(() => syncSkinYield("dom"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-dsh-skin"] });
  } catch { observer = null; }

  let adoptPending = true;
  const adoptOnLoaded = () => {
    if (!adoptPending || !selection.loaded) return;
    adoptPending = false;
    try {
      if (document.documentElement.hasAttribute("data-dsh-skin") && !selection.id) {
        const rid = String(selection.skinYieldRestoreId || "");
        skinYielded = true;
        skinYieldMemory = {
          id: rid,
          rotationEnabled: rid ? selection.skinYieldRestoreRotation === true : selection.rotationEnabled === true,
        };
        applyEffects();
        reportClientDiag("skin-yield", "adopt · install/dom");
      } else if (!document.documentElement.hasAttribute("data-dsh-skin") && !selection.id
        && String(selection.skinYieldRestoreId || "")) {
        skinYielded = true;
        skinYieldMemory = {
          id: String(selection.skinYieldRestoreId || ""),
          rotationEnabled: selection.skinYieldRestoreRotation === true,
        };
        exitSkinYield("boot-restore");
      }
    } catch {   }
  };
  const unsubAdopt = subscribe(adoptOnLoaded);
  adoptOnLoaded();
  return () => {
    try { if (observer) observer.disconnect(); } catch {   }
    cancelSkinYieldExit();
    cancelSkinYieldEnter();
    try { unsubAdopt(); } catch {   }
    skinYielded = false;
    skinYieldMemory = null;
  };
}

applyTerminalHostVar();

const FRAME_VARIANTS = [
  { id: 0, get label() { return weT("实时画面"); } },
  { id: 4, get label() { return weT("自定义画面"); } },
];

const CARD_TYPE_LABELS = {
  get video() { return weT("视频"); },
  get web() { return weT("网页"); },
  get image() { return weT("图片"); },
  get scene() { return weT("场景"); },
};

const DEFAULT_AUDIO_VOLUME = 0.5;

function frameVariantCount(selLike, wid) {
  const cf = selLike.customFrames || {};
  const inv = (selLike.inventory && selLike.inventory.wallpapers) || [];
  const wp = inv.find((w) => String(w.id) === wid);
  return (cf[wid] === true || (wp && wp.hasCustomFrame)) ? FRAME_VARIANTS.length : 1;
}
function frameUrlWithVariant(frameUrl, v) {
  if (!frameUrl) return frameUrl;
  const base = String(frameUrl).split("?")[0];
  return v > 0 ? base + "?v=" + v : base;
}

function useStore() {
  const [, setTick] = React.useState(0);
  React.useEffect(() => subscribe(() => setTick((n) => n + 1)), []);
  return selection;
}

function setSetting(field, value) {
  selection[field] = value;
  persistSelection();
  return value;
}
function setTransient(field, value) {
  selection[field] = value;
  return value;
}

function commitLiveSetting(field, value, live) {
  setSetting(field, value);
  if (live) applyEffects({ live: true });
  else emit();
}

function commitLiveTransient(field, value, live) {
  setTransient(field, value);
  if (live) applyEffects({ live: true });
  else emit();
}

const schemaRange = (key) => {
  const m = KINDS[key] || {};
  const lo = m.min;
  const hi = m.max;
  return [lo, hi];
};

const armConfirm = (token) => { setTransient("armedConfirm", token); emit(); };

const disarmConfirm = () => { setTransient("armedConfirm", ""); emit(); };

const armedIdOf = (family) => {
  const t = typeof selection.armedConfirm === "string" ? selection.armedConfirm : "";
  return t.indexOf(family + ":") === 0 ? t.slice(family.length + 1) : "";
};

function renderConfirmRow(armed, token, question, onConfirm, onDisarm) {
  if (!token || armed !== token) return null;
  return React.createElement("div", { className: "we-picker__row we-picker__confirm-row" },
    React.createElement("span", { className: "we-picker__hint we-picker__confirm-ask" }, question),
    React.createElement("button", {
      className: "we-picker__btn", type: "button", onClick: onConfirm,
      title: weT("就这么办（不可撤销）"),
    }, weT("确认")),
    React.createElement("button", {
      className: "we-picker__btn", type: "button", onClick: onDisarm,
      title: weT("算了"),
    }, weT("取消")),
  );
}

function hostFailureReason(res) {
  if (!res || !res.status) return weT("宿主不可达（请求未完成）");
  const data = res.data;
  return (data && data.error) || weT("宿主返回 {status}", { status: res.status });
}
let inventorySeq = 0;
async function loadInventory() {
  const seq = ++inventorySeq;
  setTransient("loading", true);
  emit();
  let next;
  try {
    const res = await apiJson(INVENTORY_URL);

    if (!res.ok) throw new Error(hostFailureReason(res));
    const data = res.data || {};
    next = {
      installDir: data.installDir,
      uploadDir: data.uploadDir || null,
      cacheDir: data.cacheDir || null,
      weAssetsDir: data.weAssetsDir || null,
      weAssetsAvailable: Boolean(data.weAssetsAvailable),

      sceneMediaBase: typeof data.sceneMediaBase === "string" ? data.sceneMediaBase : "",
      wallpapers: data.wallpapers || [],
      total: data.total || 0,
      portableCount: data.portableCount || 0,
      playlists: Array.isArray(data.playlists) ? data.playlists : [],
      error: null,
    };
  } catch (err) {
    next = {
      installDir: null,
      uploadDir: null,
      cacheDir: null,
      weAssetsDir: null,
      weAssetsAvailable: false,
      sceneMediaBase: "",
      wallpapers: [],
      total: 0,
      portableCount: 0,
      playlists: [],
      error: String(err && err.message ? err.message : err),
    };
  }
  if (seq !== inventorySeq) return;
  setTransient("inventory", next);
  setTransient("loading", false);
  setTransient("loaded", true);

  const prevIds = selection._invIds || "";
  const nextIds = next.wallpapers.map((w) => w.id).join("\u0001");
  if (prevIds !== nextIds) {
    setTransient("_invIds", nextIds);
    setTransient("editorPage", 0);
  }

  if (!selection.rotationGroups.length && !selection.rotationSeeded) {
    selection.rotationSeeded = true;
    seedGroupsFromPlaylists();
    persistSelection();
  }
  if (selection.rotationGroupId && !activeRotationGroup()) {
    setSetting("rotationGroupId", "");
  }
  if (selection.rotationEnabled) {
    if (!selection.rotationGroupId) {
      const usable = firstUsableGroup();
      if (usable) selection.rotationGroupId = usable.id;
      else selection.rotationEnabled = false;
    } else if (rotationCandidates().length < 2) {
      const usable = firstUsableGroup();
      if (usable && usable.id !== selection.rotationGroupId) selection.rotationGroupId = usable.id;
      else if (!usable) selection.rotationEnabled = false;
    }
    persistSelection();
  }

  revalidateSelection();
  scheduleSceneVideoResync();
}

const SCENE_VIDEO_RESYNC_MS = 3000;
let sceneVideoResyncTimer = null;
let sceneVideoResyncedKey = "";
function sceneVideoResyncKey() {
  const list = (selection.inventory && selection.inventory.wallpapers) || [];
  const ids = [];
  for (const w of list) if (w.type === "scene") ids.push(String(w.id));
  return ids.sort().join(",");
}
function scheduleSceneVideoResync() {
  if (typeof window === "undefined" || typeof window.setTimeout !== "function") return;
  const key = sceneVideoResyncKey();
  if (!key || key === sceneVideoResyncedKey) return;
  if (sceneVideoResyncTimer) return;
  sceneVideoResyncTimer = window.setTimeout(() => {
    sceneVideoResyncTimer = null;
    sceneVideoResyncedKey = key;
    loadInventory().catch(() => {   });
  }, SCENE_VIDEO_RESYNC_MS);
}

function selectionBlockedNote(w) {
  if (!w) return weT("当前壁纸已不在列表里（可能已被移除或隐藏）");
  if (!isPlayableType(w)) return weT("这张壁纸没有可播放的媒体文件");
  if (!matchesRatingFilter(w, selection.contentRatingFilter)) return weT("这张壁纸被「内容分级」过滤排除了 —— 把内容分级切回「全部」即可播放");
  return "";
}

function playableInventory() {
  return playableWallpapers(
    selection.inventory.wallpapers, selection.contentRatingFilter, selection.typeFilter, selection.hiddenIds,
  );
}

function revalidateSelection() {

  let droppedNote = "";
  const cur = selection.id ? selection.inventory.wallpapers.find((w) => w.id === selection.id) : null;
  const keepCurrent = keepPlayingWallpaper(cur, selection.contentRatingFilter);
  if (selection.id && !keepCurrent) {
    droppedNote = selectionBlockedNote(cur);
    setSetting("id", "");
  }

  const typeOnlyExcluded = keepCurrent && Boolean(selection.id)
    && !isHiddenWallpaper(selection.id, selection.hiddenIds)
    && Boolean(activeRotationGroup()) && activeRotationGroup().wallpaperIds.indexOf(selection.id) >= 0;
  if (selection.rotationEnabled && selection.id && !typeOnlyExcluded
    && !rotationCandidates().some((w) => w.id === selection.id)) {
    const first = rotationCandidates()[0];
    setSetting("id", first ? first.id : "");
  }
  if (!selection.id && selection.rotationEnabled) {
    const first = rotationCandidates()[0];
    if (first) selection.id = first.id;
  }
  applySelection(selection.id);

  if (droppedNote && !selection.id) setTransient("blockedNote", droppedNote);
  emit();
}

function activeRotationGroup() {
  return selection.rotationGroups.find((g) => g.id === selection.rotationGroupId) || null;
}

let byIdCache = null;
let byIdRef = null;
function wallpaperById() {
  const list = selection.inventory.wallpapers;
  if (byIdRef !== list) {
    byIdRef = list;
    byIdCache = new Map(list.map((w) => [w.id, w]));
  }
  return byIdCache;
}

function groupWallpapers(group) {
  if (!group || !Array.isArray(group.wallpaperIds)) return [];
  const byId = wallpaperById();
  return group.wallpaperIds
    .map((id) => byId.get(id))
    .filter((w) => w
      && isRotatableWallpaper(w, selection.contentRatingFilter, selection.typeFilter)
      && !isHiddenWallpaper(w.id, selection.hiddenIds));
}

/* 视频轮播列表固定在 rotationGroups 里的这个 id 上：选视频、调间隔都不新增设置项。
   注意：这个文件只允许开头那一个 /** 头注释 —— stripHeader 会把第一个 /** 当文件头切掉，
   正文里再写 /** 会把前面的代码整段吃掉（实测踩过）。 */
const VIDEO_ROTATION_GROUP_ID = "video-rotation";

function rotationCandidates() {
  const group = activeRotationGroup();
  if (group && group.id === VIDEO_ROTATION_GROUP_ID) {
    /* 视频轮播只认「视频」这一类：不走 typeFilter（用户可能正把列表筛成图片），
       但仍尊重隐藏名单 —— 隐藏掉的就是明确不想要。 */
    const byId = wallpaperById();
    return (group.wallpaperIds || [])
      .map((id) => byId.get(id))
      .filter((w) => w && w.type === "video" && !isHiddenWallpaper(w.id, selection.hiddenIds));
  }
  return groupWallpapers(group);
}

function videoWallpapers() {
  return selection.inventory.wallpapers.filter((w) => w
    && w.type === "video"
    && !isHiddenWallpaper(w.id, selection.hiddenIds));
}

/* 轮播能否接受这张壁纸：必须和 rotationCandidates() 用同一口径。
   视频轮播只认「视频」且不受列表的类型/分级筛选影响 —— 否则候选里有、提交时又被
   isRotatableWallpaper 用 typeFilter 拒掉，表现为「开着轮播但永远不切」。 */
function rotationAcceptsWallpaper(w) {
  const group = activeRotationGroup();
  if (group && group.id === VIDEO_ROTATION_GROUP_ID) {
    return Boolean(w) && w.type === "video" && !isHiddenWallpaper(w.id, selection.hiddenIds);
  }
  return Boolean(w)
    && isRotatableWallpaper(w, selection.contentRatingFilter, selection.typeFilter)
    && !isHiddenWallpaper(w.id, selection.hiddenIds);
}

function videoRotationGroup(create) {
  let group = selection.rotationGroups.find((g) => g.id === VIDEO_ROTATION_GROUP_ID);
  if (!group && create) {
    group = {
      id: VIDEO_ROTATION_GROUP_ID,
      name: weT("视频轮播"),
      interval: clampNum(selection.rotationInterval, 1, 1440, 5),
      order: "sequence",
      wallpaperIds: [],
    };
    selection.rotationGroups.push(group);
  }
  return group || null;
}

function toggleVideoRotation() {
  const group = videoRotationGroup(true);
  const on = selection.rotationEnabled && selection.rotationGroupId === group.id;
  if (on) {
    selection.rotationEnabled = false;
    setTransient("rotationConfigOpen", false);
    cancelRotationPrepare();
    persistSelection();
    syncRotationTimer();
    emit();
    return;
  }
  selection.rotationGroupId = group.id;
  /* 第一次开轮播时把当前这张视频自动选进来，省掉「开了但不知道要选」的空转。 */
  if (!Array.isArray(group.wallpaperIds) || group.wallpaperIds.length === 0) {
    group.wallpaperIds = selection.type === "video" && selection.id ? [selection.id] : [];
  }
  /* 少于 2 个不点亮轮播：轮播本质是「在这几张之间切」，1 张没有下一张。
     此时按钮退化成「展开 / 收起配置面板」的开关 —— 点第一次摊开，点第二次收回，
     不能只开不合。够 2 个时按钮仍旧是真正的开关（点亮轮播）。 */
  if (rotationCandidates().length < 2) {
    const open = selection.rotationConfigOpen === true;
    selection.rotationEnabled = false;
    setTransient("rotationConfigOpen", !open);
    persistSelection();
    syncRotationTimer();
    emit();
    return;
  }
  selection.rotationEnabled = true;
  setTransient("rotationConfigOpen", true);
  /* 硬切没有过场可看：轮播默认给交叉淡化，用户之后可在同一面板里换。 */
  if (selection.switchTransition === "cut") selection.switchTransition = "fade";
  if (!rotationCandidates().some((w) => w.id === selection.id)) {
    const first = rotationCandidates()[0];
    if (first) applySelection(first.id);
  }
  persistSelection();
  syncRotationTimer();
  emit();
}

function onToggleRotationVideo(id) {
  const group = videoRotationGroup(true);
  const ids = Array.isArray(group.wallpaperIds) ? group.wallpaperIds.slice() : [];
  const at = ids.indexOf(id);
  if (at >= 0) ids.splice(at, 1);
  else ids.push(id);
  group.wallpaperIds = ids;
  /* 勾到只剩 1 个（或 0 个）时自动停：不允许「已开启但永远不会切」的状态。 */
  if (ids.length < 2 && selection.rotationEnabled && selection.rotationGroupId === group.id) {
    selection.rotationEnabled = false;
    cancelRotationPrepare();
    setTransient("rotationConfigOpen", true);
  }
  persistSelection();
  syncRotationTimer();
  emit();
}

function onVideoRotationInterval(minutes) {
  const group = videoRotationGroup(true);
  group.interval = clampNum(Number(minutes), 1, 1440, 5);
  selection.rotationInterval = group.interval;
  persistSelection();
  syncRotationTimer();
  emit();
}

/* 轮播面板里的过场既写进轮播分组，也同步到全局那份：关掉轮播后手动切换不会突然没动画。 */
function onVideoRotationTransition(id) {
  const group = videoRotationGroup(true);
  const next = SWITCH_TRANSITION_VALUES.includes(id) ? id : "";
  group.transition = next;
  if (next) selection.switchTransition = next;
  persistSelection();
  emit();
}

function onVideoRotationTransitionSpeed(id) {
  const group = videoRotationGroup(true);
  const next = SWITCH_SPEED_VALUES.includes(id) ? id : "";
  group.transitionSpeed = next;
  if (next) selection.switchTransitionSpeed = next;
  persistSelection();
  emit();
}

function onVideoRotationTransitionDir(dir) {
  const group = videoRotationGroup(true);
  const next = SWITCH_DIRS.includes(dir) ? dir : "";
  group.transitionDir = next;
  if (next) selection.switchTransitionDir = next;
  persistSelection();
  emit();
}


function firstUsableGroup() {
  return selection.rotationGroups.find((g) => groupWallpapers(g).length >= 2) || null;
}

function seedGroupsFromPlaylists() {
  const playable = selection.inventory.playlists.filter((p) => (p.portableCount || 0) >= 2);
  const source = playable[0];
  if (!source) return false;
  const ids = Array.isArray(source.wallpaperIds) ? source.wallpaperIds.slice() : [];
  if (!ids.length) return false;
  selection.rotationGroups.push({
    id: nextGroupId(),
    name: typeof source.name === "string" && source.name.trim() ? source.name.trim() : weT("轮播列表"),
    interval: DEFAULTS.rotationInterval,
    order: source.order === "random" ? "random" : "sequence",
    wallpaperIds: ids,
  });
  selection.rotationGroupId = selection.rotationGroups[selection.rotationGroups.length - 1].id;
  return true;
}

function nextGroupId() {
  return "grp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function rotationAnchorWallpaper() {
  const byId = wallpaperById();
  const sel = byId.get(selection.id);
  const matches = (w) => {
    if (!w) return false;
    if (w.media && w.media === selection.url) return true;
    if (w.frameUrl && (w.frameUrl === selection.url
      || (selection.type === "scene" && w.frameUrl === selection.sceneFrameUrl))) return true;
    return false;
  };
  if (matches(sel)) return sel;
  const displayed = selection.inventory.wallpapers.find(matches);
  return displayed || sel || null;
}

function rotationNextCandidate(excluded) {
  const full = rotationCandidates();
  const anchor = rotationAnchorWallpaper();
  const anchorId = anchor ? anchor.id : selection.id;
  const usable = full.filter((w) => w.id !== anchorId && !(excluded && excluded.has(w.id)));
  if (!usable.length) return null;
  const group = activeRotationGroup();
  let pick = null;
  if (group && group.order === "random") {
    pick = usable[Math.floor(Math.random() * usable.length)] || null;
  } else {
    const cur = full.findIndex((w) => w.id === anchorId);
    for (let i = 1; i <= full.length; i++) {
      const w = full[(cur + i + full.length) % full.length];
      if (w && usable.indexOf(w) !== -1) { pick = w; break; }
    }
    if (!pick) pick = usable[0];
  }
  return pick;
}

function clearRotationTimer() {
  if (selection.rotationTimer === null) return;
  if (typeof window !== "undefined" && typeof window.clearTimeout === "function") {
    window.clearTimeout(selection.rotationTimer);
  }
  setTransient("rotationTimer", null);
}

function syncRotationTimer() {
  clearRotationTimer();
  if (!selection.rotationEnabled || !selection.id) return;
  if (rotationCandidates().length < 2) return;
  if (typeof window === "undefined" || typeof window.setTimeout !== "function") return;
  const group = activeRotationGroup();
  const minutes = group ? group.interval : DEFAULTS.rotationInterval;

  let delayMs = minutes * 60 * 1000;
  try {
    const testSec = Number(localStorage.getItem("weRotationTestSec"));
    if (testSec > 0) delayMs = Math.max(1000, Math.round(testSec * 1000));
  } catch {   }
  setTransient("rotationTimer", window.setTimeout(() => {
    setTransient("rotationTimer", null);
    if (!selection.rotationEnabled || !selection.id) return;

    beginRotationPrepare(new Set());
  }, delayMs));
  liveLog("rotation-arm", Math.round(delayMs / 1000) + "s 后（候选 " + rotationCandidates().length + " 张）");
}

let rotationPrep = null;
let pendingRotationFade = false;

let fadingLayerNode = null;

let pendingStagedLayerNode = null;

let preparedMediaEl = null;
const ROTATION_PREP_TIMEOUT_MS = 20000;

const ROTATION_FADE_MS = 1800;

const SWITCH_TRANSITIONS = [
  { id: "cut", get label() { return weT("硬切"); }, ms: 0 },
  { id: "fade", get label() { return weT("交叉淡化"); }, ms: ROTATION_FADE_MS },
  { id: "push", get label() { return weT("推移"); }, ms: 700 },
  { id: "wipe", get label() { return weT("擦除"); }, ms: 700 },
  { id: "iris", get label() { return weT("光圈"); }, ms: 800 },
  { id: "zoom", get label() { return weT("缩放"); }, ms: 900 },
  { id: "bars", get label() { return weT("条带"); }, ms: 800 },
];
const SWITCH_SPEEDS = [
  { id: "fast", get label() { return weT("快"); }, factor: 0.6 },
  { id: "normal", get label() { return weT("标准"); }, factor: 1 },
  { id: "slow", get label() { return weT("慢"); }, factor: 1.6 },
];
const SWITCH_DIR_LABELS = {
  get left() { return weT("左"); },
  get right() { return weT("右"); },
  get up() { return weT("上"); },
  get down() { return weT("下"); },
};

const SWITCH_DIRECTIONAL = ["push", "wipe", "bars"];

const SWITCH_BARS_TEETH = 7;

function wipeInset(dir) {
  if (dir === "right") return "inset(0 100% 0 0)";
  if (dir === "up") return "inset(100% 0 0 0)";
  if (dir === "down") return "inset(0 0 100% 0)";
  return "inset(0 0 0 100%)";
}

function commitRotationSwitch(prep) {
  rotationPrep = null;
  for (const t of prep.timers) { try { clearTimeout(t); } catch {   } }
  prep.timers = [];
  releaseProbeMedia(prep);
  const staged = prep.staged;
  prep.staged = null;
  const w = wallpaperById().get(prep.id);
  const valid = selection.rotationEnabled && selection.id === prep.fromId
    && rotationAcceptsWallpaper(w);
  liveLog("rotation-commit", "wid=" + prep.id + " from=" + prep.fromId + " kind=" + (prep.kind || "-")
    + " valid=" + valid + " " + liveStateBrief());
  if (!valid) {
    if (staged) { try { staged.div.remove(); } catch {   } }
    if (prep.readyEl) disposeMediaEl(prep.readyEl);
    syncRotationTimer();
    return;
  }

  if ((prep.kind === "live" || prep.kind === "web") && staged && staged.div && prep.readyEl) {
    pendingStagedLayerNode = staged.div;
    prep.readyEl = null;
  } else {
    preparedMediaEl = prep.readyEl || null;
    prep.readyEl = null;
    if (staged) { try { staged.div.remove(); } catch {   } }
  }
  pendingRotationFade = true;
  applySelection(prep.id, { fromRotation: true, kind: prep.kind });

  if (pendingStagedLayerNode) {
    const div = pendingStagedLayerNode;
    pendingStagedLayerNode = null;
    try {
      const f = div.querySelector && div.querySelector("iframe");
      if (f) disposeMediaEl(f);
    } catch {   }
    try { div.remove(); } catch {   }
  }
}

function deleteGroup(id) {
  const idx = selection.rotationGroups.findIndex((g) => g.id === id);
  if (idx < 0) return;
  selection.rotationGroups.splice(idx, 1);

  cancelRotationPrepare();
  if (selection.rotationGroupId === id) {
    selection.rotationGroupId = "";
    if (selection.rotationEnabled) {
      const fallback = firstUsableGroup();
      if (fallback) selection.rotationGroupId = fallback.id;
      else selection.rotationEnabled = false;
    }
  }
  if (selection.editing && selection.editing.id === id) setSetting("editing", null);
  syncRotationTimer();
  emit();
}

function hideWallpapers(ids) {
  const added = ids.filter((id) => id && !selection.hiddenIds.includes(id));
  if (!added.length) return;
  for (const id of added) selection.hiddenIds.push(id);
  persistSelection();
  syncRotationTimer();
  emit();
}

function restoreWallpapers(ids) {
  const set = new Set(ids.filter(Boolean));
  if (!set.size) return;
  const before = selection.hiddenIds.length;
  selection.hiddenIds = selection.hiddenIds.filter((id) => !set.has(id));
  if (selection.hiddenIds.length !== before) {
    persistSelection();
    syncRotationTimer();
    emit();
  }
}

const UPLOAD_URL = "/wallpaper-engine/upload";
const REMOVE_URL = "/wallpaper-engine/remove";
const UPLOAD_TYPES = ["image/jpeg", "image/png", "video/mp4"];

async function uploadWallpaperFile(file) {
  const ctype = (file.type || "").toLowerCase();
  if (!UPLOAD_TYPES.includes(ctype)) {
    setTransient("uploadError", weT("仅支持 JPG / PNG 图片与 MP4 视频"));
    emit();
    return;
  }
  if (!/\.(jpe?g|png|mp4)$/i.test(file.name)) {
    setTransient("uploadError", weT("文件扩展名需为 .jpg / .png / .mp4"));
    emit();
    return;
  }
  setTransient("uploading", true);
  setTransient("uploadError", "");
  setTransient("uploadNote", "");
  emit();
  try {
    const title = file.name.replace(/\.[^.]+$/, "").slice(0, 80);
    const res = await apiFetch(UPLOAD_URL + "?title=" + encodeURIComponent(title), {
      method: "POST",
      headers: { "Content-Type": ctype },
      body: file,
      parse: "always",
    });
    const data = res.data || {};
    if (!res.ok) throw new Error(hostFailureReason(res));

    if (data.duplicate) {
      setTransient("uploadNote", weT("已存在相同内容的壁纸，已直接选择原有的那张"));
    }
    await loadInventory();
    applySelection(data.id);
  } catch (err) {
    setTransient("uploadError", weT("上传失败：{error}", { error: weT(err && err.message ? err.message : err) }));
  }
  setTransient("uploading", false);
  emit();
}

async function removeUploadWallpaper(id) {
  if (!id) return;
  setTransient("uploading", true);
  setTransient("uploadError", "");
  emit();
  try {
    const res = await apiPostJson(REMOVE_URL, { id }, { parse: "always" });
    if (!res.ok) throw new Error(hostFailureReason(res));
    if (selection.id === id) applySelection("");
    await loadInventory();
  } catch (err) {
    setTransient("uploadError", weT("移除失败：{error}", { error: weT(err && err.message ? err.message : err) }));
  }
  setTransient("uploading", false);
  emit();
}

const UPLOAD_DIR_URL = "/wallpaper-engine/upload-dir";

async function changeUploadDir(dir, migrate) {
  if (!dir || !String(dir).trim()) {
    setTransient("uploadError", weT("请输入存储位置路径"));
    emit();
    return;
  }
  setTransient("uploading", true);
  setTransient("uploadError", "");
  emit();
  try {
    const res = await apiPostJson(UPLOAD_DIR_URL,
      { dir: String(dir).trim(), migrate: migrate !== false }, { parse: "always" });
    if (!res.ok) throw new Error(hostFailureReason(res));
    setTransient("editingUploadDir", false);
    setTransient("uploadDirDraft", "");
    await loadInventory();
  } catch (err) {
    setTransient("uploadError", weT("更改失败：{error}", { error: weT(err && err.message ? err.message : err) }));
  }
  setTransient("uploading", false);
  emit();
}

const CACHE_DIR_URL = "/wallpaper-engine/cache-dir";
const CACHE_DIR_BROWSE_URL = "/wallpaper-engine/cache-dir/browse";

async function changeCacheDir(dir, migrate) {
  if (!dir || !String(dir).trim()) {
    setTransient("cacheDirError", weT("请输入缓存位置路径"));
    emit();
    return;
  }
  setTransient("cacheDirError", "");
  setTransient("cacheDirNote", "");
  setTransient("cacheDirBusy", true);
  emit();
  try {
    const res = await apiPostJson(CACHE_DIR_URL,
      { dir: String(dir).trim(), migrate: migrate !== false }, { parse: "always" });
    if (!res.ok) throw new Error(hostFailureReason(res));
    const moved = Number((res.data && res.data.migrated) || 0);
    const skipped = Number((res.data && res.data.skipped) || 0);
    setTransient("editingCacheDir", false);
    setTransient("cacheDirDraft", "");
    setTransient("cacheDirBrowse", null);

    setTransient("cacheDirNote", skipped > 0
      ? weT("已迁移 {moved} 个缓存文件，{skipped} 个跳过", { moved, skipped })
      : weT("已迁移 {moved} 个缓存文件", { moved }));
    await loadInventory();
  } catch (err) {
    setTransient("cacheDirError", weT("更改失败：{error}", { error: weT(err && err.message ? err.message : err) }));
  }
  setTransient("cacheDirBusy", false);
  emit();
}

const WE_ASSETS_DIR_URL = "/wallpaper-engine/we-assets-dir";

async function changeWeAssetsDir(dir) {
  setTransient("weAssetsError", "");
  emit();
  try {
    const res = await apiPostJson(WE_ASSETS_DIR_URL,
      { dir: String(dir || "").trim() }, { parse: "always" });
    if (!res.ok) throw new Error(hostFailureReason(res));
    setTransient("editingWeAssetsDir", false);
    setTransient("weAssetsDirDraft", "");
    await loadInventory();
    syncLayers();
  } catch (err) {
    setTransient("weAssetsError", weT("保存失败：{error}", { error: weT(err && err.message ? err.message : err) }));
  }
  emit();
}

const IS_EDGE = typeof navigator !== "undefined" && /Edg\//.test(navigator.userAgent);

let propsPanelOpen = false;
let propsState = { token: "", loading: false, error: "", props: [], remote: false };

function openUserPropsPanel() {
  propsPanelOpen = true;
  loadUserPropDefs(propTokenOf(selection), true);
  emit();
}

function closeUserPropsPanel() {
  propsPanelOpen = false;
  emit();
}

function propTokenOf(selLike) {
  const url = String((selLike && selLike.propsUrl) || "");
  const i = url.lastIndexOf("/");
  return i >= 0 ? url.slice(i + 1) : "";
}

function storedUserPropsOf(token) {
  const all = selection.userProps;
  const v = all && typeof all === "object" ? all[token] : null;
  return v && typeof v === "object" && !Array.isArray(v) ? { ...v } : {};
}

function saveUserProp(token, name, value, isDefault) {
  if (!token) return;
  const all = { ...(selection.userProps || {}) };
  const cur = { ...(all[token] || {}) };
  if (isDefault) delete cur[name];
  else cur[name] = value;
  if (Object.keys(cur).length) all[token] = cur;
  else delete all[token];
  setSetting("userProps", all);
}

function applyUserProps(wire) {
  const frame = liveFrameEl();
  if (!frame) return false;
  try {
    const wp = frame.contentWindow && frame.contentWindow.__wp;
    if (!wp || typeof wp.updateWebProps !== "function") return false;
    wp.updateWebProps(wire);
    return true;
  } catch {
    return false;
  }
}

function loadUserPropDefs(token, force) {
  if (!token) return;
  if (!force && (propsState.token === token && (propsState.props.length || propsState.loading))) return;
  const url = PROPS_URL + "/" + encodeURIComponent(token);
  propsState = { token, loading: true, error: "", props: propsState.token === token ? propsState.props : [], remote: true };
  apiJson(url)
    .then((res) => {
      const d = res.data;

      if (!d || !d.ok) throw new Error((d && d.error) || weT("读取失败"));
      if (propsState.token !== token) return;

      let live = null;
      try {
        const frame = liveFrameEl();
        const wp = frame && frame.contentWindow && frame.contentWindow.__wp;
        live = wp && typeof wp.getProperties === "function" ? wp.getProperties() : null;
      } catch { live = null; }
      const props = (d.props || []).map((p) => {
        if (!live || !(p.name in live)) return p;
        return { ...p, value: live[p.name], overridden: Boolean(d.overrides && p.name in d.overrides) };
      });
      propsState = { token, loading: false, error: "", props, remote: false };
      emit();
    })
    .catch((e) => {
      if (propsState.token !== token) return;
      propsState = { token, loading: false, error: String((e && e.message) || e), props: [], remote: false };
      emit();
    });
}

function onUserPropInput(def, value, silent) {
  def.value = value;
  def.overridden = !sameUserPropValue(value, def.default);
  applyUserProps({ [def.name]: { value } });
  saveUserProp(propsState.token, def.name, value, !def.overridden);
  if (!silent) emit();
}

function sameUserPropValue(a, b) {
  if (a === b) return true;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return false;
}

function resetUserProps() {
  const token = propsState.token;
  if (!token) return;
  const wire = {};
  for (const p of propsState.props) {
    p.value = p.default;
    p.overridden = false;
    if (p.default !== null) wire[p.name] = { value: p.default };
  }
  applyUserProps(wire);
  const all = { ...(selection.userProps || {}) };
  delete all[token];
  setSetting("userProps", all);
  emit();
}

function applyStoredUserProps(selLike) {
  if (!selLike) return;
  const token = propTokenOf(selLike);
  if (!token) return;
  const ov = storedUserPropsOf(token);
  const names = Object.keys(ov);
  if (!names.length) return;
  const wire = {};
  for (const [k, v] of Object.entries(ov)) wire[k] = { value: v };
  applyUserProps(wire);
}

function weColorToHex(v) {
  if (typeof v !== "string") return "#000000";
  const parts = v.trim().split(/\s+/).map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return "#000000";
  const hex = parts.slice(0, 3)
    .map((n) => Math.max(0, Math.min(255, Math.round(n * 255))).toString(16).padStart(2, "0"))
    .join("");
  return "#" + hex;
}
function weHexToColor(hex) {
  const h = String(hex || "").replace(/^#/, "");
  if (h.length !== 6) return "0 0 0";
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b].map((n) => Math.round(n * 1000) / 1000).join(" ");
}

let weBattery = null;

function occlusionReason() {
  if (selection.pauseOnHidden && typeof document !== "undefined" && document.hidden) return weT("标签页隐藏(pauseOnHidden)");
  if (adapterCaps().blurPause && selection.pauseOnBlur && typeof document !== "undefined"
    && typeof document.hasFocus === "function" && !document.hasFocus()) return weT("窗口失焦(pauseOnBlur)");
  if (selection.pauseOnBattery && weBattery && !weBattery.charging) return weT("电池供电(pauseOnBattery)");
  return "";
}
function occlusionActive() {
  return occlusionReason() !== "";
}

const OCCLUSION_RECHECK_MS = 3000;

function livePauseReason() {
  if (selection.playing) {

    if (occlusionRendererPaused()) return weT("窗口被完全遮挡(pauseOnOcclusion)");
    return occlusionReason();
  }
  return weT("用户暂停");
}
function isEffectivelyPlaying() {
  return selection.playing && !occlusionActive() && !occlusionRendererPaused();
}

function videoPlaybackError(video) {
  const err = video && video.error;
  if (!err) return "";

  if (err.code === 4) return weT("浏览器无法解码这段视频（自上传建议改用 H.264 编码的 MP4）");
  if (err.code === 3) return weT("视频解码失败（文件可能已损坏）");
  if (err.code === 2) return weT("视频读取失败（文件可能已被移动或删除）");
  return weT("视频加载失败");
}

function playRefusalBlocks(video) {
  const r = video && video.dataset ? video.dataset.wePlayRefused : "";
  return Boolean(r) && r !== "AbortError";
}

function syncVideoState(video) {
  const playing = Boolean(video) && !video.paused && !video.ended && !video.error;

  const reason = videoPlaybackError(video)
    || (!playing && playRefusalBlocks(video) ? weT("浏览器拒绝了播放请求") : "");
  if (selection.videoPlaying === playing && selection.videoError === reason) return;
  setTransient("videoPlaying", playing);
  setTransient("videoError", reason);
  emit();
}

function watchVideoState(video) {
  if (!video || !video.dataset || video.dataset.weStateWatched === "1") return;
  video.dataset.weStateWatched = "1";
  for (const t of ["play", "playing", "pause", "ended", "error", "emptied"]) {
    try { video.addEventListener(t, () => syncVideoState(video)); } catch {   }
  }

  for (const t of ["loadeddata", "canplay"]) {
    try { video.addEventListener(t, () => applyVideoPlayback(video)); } catch {   }
  }
}

function weAudioVolume() {
  try {
    if (selection.videoAudioEnabled === false) return 0;
    return clampNum(selection.videoVolume, 0, 1, 0);
  } catch { return 0; }
}

const PICKER_TAB_KEY = "dsh-wallpaper-engine:picker-tab";
const PICKER_TABS = [
  { id: "library", get label() { return weT("壁纸库"); } },
  { id: "appearance", get label() { return weT("外观"); } },
  { id: "playback", get label() { return weT("播放"); } },
  { id: "system", get label() { return weT("系统"); } },
  { id: "extensions", get label() { return weT("扩展"); } },
];

const PICKER_TAB_LEGACY = {
  wallpaper: "library", font: "appearance", effects: "playback",
  audio: "playback", advanced: "system", about: "library",
};
function readSavedPickerTab() {
  try {
    let v = localStorage.getItem(PICKER_TAB_KEY);
    if (v && PICKER_TAB_LEGACY[v]) v = PICKER_TAB_LEGACY[v];
    if (v && PICKER_TABS.some((t) => t.id === v)) return v;
  } catch {   }
  return "library";
}

const PICKER_FONT_OPEN_KEY = "dsh-wallpaper-engine:picker-font-open";
function readSavedPickerFontOpen() {
  try {
    const v = localStorage.getItem(PICKER_FONT_OPEN_KEY);
    if (v === null) return true;
    return v === "1";
  } catch {   }
  return true;
}
function writeSavedPickerFontOpen(on) {
  try { localStorage.setItem(PICKER_FONT_OPEN_KEY, on ? "1" : "0"); } catch {   }
}

const PICKER_UI_COLOR_OPEN_KEY = "dsh-wallpaper-engine:picker-ui-color-open";
function readSavedPickerUiColorOpen() {
  try {
    const v = localStorage.getItem(PICKER_UI_COLOR_OPEN_KEY);
    if (v === null) return true;
    return v === "1";
  } catch {   }
  return true;
}
function writeSavedPickerUiColorOpen(on) {
  try { localStorage.setItem(PICKER_UI_COLOR_OPEN_KEY, on ? "1" : "0"); } catch {   }
}

const PICKER_DETAIL_OPEN_KEY = "dsh-wallpaper-engine:picker-detail-open";
const PICKER_GLASS_UI_OPEN_KEY = "dsh-wallpaper-engine:picker-glass-ui-open";
const PICKER_CORNERS_OPEN_KEY = "dsh-wallpaper-engine:picker-corners-open";
const PICKER_PRESETS_OPEN_KEY = "dsh-wallpaper-engine:picker-presets-open";

function readSavedPickerOpen(key) {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return true;
    return v === "1";
  } catch {   }
  return true;
}
function writeSavedPickerOpen(key, on) {
  try { localStorage.setItem(key, on ? "1" : "0"); } catch {   }
}

function NumberValueInput(props) {
  const { label, min, max, step, unit, value, onCommit, title } = props;
  const [draft, setDraft] = React.useState(null);
  const editing = draft !== null;
  const commit = (raw) => {
    setDraft(null);
    const s = String(raw == null ? "" : raw).trim();
    if (s === "") return;
    const n = Number(s);
    if (!Number.isFinite(n)) return;
    onCommit(Math.max(Number(min), Math.min(Number(max), n)));
  };
  return React.createElement("input", {
    className: "we-picker__value-input", type: "number",
    min: String(min), max: String(max), step: String(step),
    title: title || undefined,
    "aria-label": label + " " + unit,
    ...(editing ? { defaultValue: draft } : { value: String(value) }),
    onFocus: () => { if (!editing) setDraft(String(value)); },
    onInput: (e) => setDraft(e.currentTarget.value),
    onBlur: (e) => commit(e.currentTarget.value),
    onKeyDown: (e) => {
      if (e.key === "Enter") { commit(e.currentTarget.value); e.currentTarget.blur(); }
    },
  });
}

function SliderRow(label, min, max, step, value, onInput, suffix, key, opts) {
  opts = opts || {};
  const unit = suffix == null ? "" : String(suffix);

  const preformatted = /\d/.test(unit);
  const readout = (v) => (v == null || v === ""
    ? ""
    : (preformatted ? unit : String(v) + unit));

  const numberEdit = Boolean(opts.numberEdit) && !preformatted;

  const liveFill = (el) => {
    try {
      const lo = Number(el.min); const hi = Number(el.max); const v = Number(el.value);
      const pct = hi > lo ? Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)) : 0;
      el.style.setProperty("--we-fill", pct + "%");
      const row = el.parentNode;
      const out = row && typeof row.querySelector === "function" ? row.querySelector(".we-picker__value") : null;

      if (out && !preformatted) out.textContent = readout(el.value);
      else return;

      if (typeof out.value === "string") out.value = String(el.value);
    } catch {   }
  };

  return React.createElement("div", { className: "we-picker__row we-picker__slider-row", key: key },
    React.createElement("span", {
      className: "we-picker__hint we-picker__label",

      onDoubleClick: opts.onLabelDoubleClick || undefined,
      style: opts.onLabelDoubleClick ? { userSelect: "none" } : undefined,
    }, label),
    React.createElement("input", {
      className: "we-picker__slider", type: "range",
      min: String(min), max: String(max), step: String(step),
      value: String(value),

      style: { "--we-fill": Math.max(0, Math.min(100, ((Number(value) - min) / (max - min)) * 100)) + "%" },

      "aria-label": label,

      onInput: (e) => { liveFill(e.currentTarget); onInput(Number(e.target.value), true); },

      onChange: (e) => onInput(Number(e.target.value), false),
    }),

    numberEdit
      ? React.createElement("span", { className: "we-picker__hint we-picker__value" },
        React.createElement(NumberValueInput, {
          label, min, max, step, unit,
          value,
          title: opts.valueTooltip || undefined,

          onCommit: (n) => onInput(n, false),
        }),
        React.createElement("span", { className: "we-picker__value-unit" }, unit),
      )
      : React.createElement("span", { className: "we-picker__hint we-picker__value" }, readout(value)),
  );
}

function ctlText(label) {
  return React.createElement("div", { className: "we-picker__ctl-text" },
    React.createElement("span", { className: "we-picker__ctl-label" }, label),
  );
}

function Toggle(props) {
  return React.createElement("label", { className: "we-picker__switch" },
    React.createElement("input", {
      type: "checkbox",
      checked: props.checked,
      disabled: props.disabled === true,
      onChange: props.onChange,
      "aria-label": props.label,
    }),
    React.createElement("span", { className: "we-picker__switch-track" },
      React.createElement("span", { className: "we-picker__switch-thumb" }),
    ),
  );
}

function switchRow(label, checked, onChange, opts) {
  opts = opts || {};
  return React.createElement("div", { className: "we-picker__ctl", key: opts.key },
    ctlText(label, opts.hint, opts.tooltip),
    Toggle({ checked: checked, onChange: onChange, label: label, disabled: opts.disabled }),
  );
}

function swatchRow(label, presets, value, onPick, opts) {
  opts = opts || {};
  return React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap", key: opts.key },
    ctlText(label, opts.hint, opts.tooltip),
    React.createElement("div", { className: "we-picker__swatches", role: "group", "aria-label": label },
      opts.auto || null,
      presets.map((hex) => React.createElement("button", {
        key: hex,
        className: "we-picker__swatch" + (value === hex ? " we-picker__swatch--active" : ""),
        type: "button",
        style: { background: hex },
        title: hex,
        onClick: () => onPick(hex),
        "aria-label": label + " " + hex,
      })),
      React.createElement("label", { className: "we-picker__swatch-custom" },
        React.createElement("input", {
          type: "color",
          value: opts.colorValue || value || "#ffffff",

          onInput: (e) => onPick(e.target.value, true),
          onChange: (e) => onPick(e.target.value, false),
          title: weT("自定义{label}", { label: weT(label) }),
        }),
        React.createElement("span", { className: "we-picker__hint" }, weT("自定义")),
      ),
    ),
  );
}

function vinylSpinVisible() {
  return typeof document === "undefined" || document.hidden !== true;
}
function VinylRecord(props) {
  const cover = props.cover;
  const title = props.title || weT("未选择壁纸");
  const playing = props.playing === true;
  const sm = props.sm === true;
  return React.createElement("div", {
    className: "we-vinyl" +
      (playing ? " we-vinyl--playing" : "") +
      (sm ? " we-vinyl--sm" : ""),
    title: title,
  },
    React.createElement("div", { className: "we-vinyl__cover" },
      cover
        ? React.createElement("img", {
            src: cover, alt: "", loading: "lazy",
            onError: (e) => { e.target.style.display = "none"; },
                            onLoad: (e) => { e.target.style.opacity = "1"; },
          })
        : React.createElement("span", { className: "we-vinyl__empty" }, "▦"),
    ),
    React.createElement("span", { className: "we-vinyl__hole" }),
  );
}

let pickerOpener = null;

let customFrameInput = null;
let pickerFocusPending = false;

const gpuFrameUi = {
  wid: "", pinned: false, busy: false, probedAt: 0, error: "",

  w: 0, h: 0, recapturing: false,
};
const GPU_FRAME_PROBE_TTL_MS = 30000;
function gpuFrameToken(frameUrl) {
  const src = String(frameUrl || "");
  if (src.indexOf("/scene-frame/") === -1) return "";
  return String(src.split("/scene-frame/").pop() || "").split("?")[0];
}
function markGpuFrameProbed(wid, pinned) {
  gpuFrameUi.wid = String(wid || "");
  gpuFrameUi.pinned = Boolean(pinned);
  gpuFrameUi.probedAt = Date.now();
}

function setPickerOpener(el) { pickerOpener = el; }
function onTogglePropsPanel() {
  propsPanelOpen = !propsPanelOpen;
  if (propsPanelOpen) loadUserPropDefs(propTokenOf(selection), true);
  emit();
}

function openPicker(draft) {
  setTransient("pickerOpen", true);
  setTransient("pickerDraft", draft);
  setTransient("modalView", "normal");
  pickerFocusPending = true;
  emit();
}
function onOpenPicker() { openPicker(false); }
function onOpenPickerDraft() { openPicker(true); }

function onEditName(e) {
  if (selection.editing) { selection.editing.name = e.target.value; emit(); }
}
function onEditInterval(e) {
  if (!selection.editing) return;
  selection.editing.interval = clampNum(Number(e.target.value), ...schemaRange("rotationInterval"), DEFAULTS.rotationInterval);
  emit();
}
function onEditOrder(e) {
  if (selection.editing) { selection.editing.order = e.target.value; emit(); }
}

function onStartEditUploadDir() {
  setTransient("editingUploadDir", true);
  setTransient("uploadDirDraft", selection.inventory.uploadDir || "");
  emit();
}
function onUploadDirDraft(e) { setTransient("uploadDirDraft", e.target.value); emit(); }
function onCancelEditUploadDir() { setTransient("editingUploadDir", false); emit(); }
function onCacheDirDraft(e) { setTransient("cacheDirDraft", e.target.value); emit(); }

function onStartEditCacheDir() {
  setTransient("editingCacheDir", true);
  setTransient("cacheDirDraft", selection.inventory.cacheDir || "");
  setTransient("cacheDirError", "");
  setTransient("cacheDirNote", "");
  openCacheDirBrowse(selection.inventory.cacheDir || "");
  emit();
}
function openCacheDirBrowse(path) {
  setTransient("cacheDirBrowse", {
    path: path || "", display: path || "", dirs: [], parent: null,
    home: "", truncated: false, loading: true, error: "",
  });
  browseCacheDir(path);
}
function onCloseCacheDirBrowse() { setTransient("cacheDirBrowse", null); emit(); }
function onCacheDirBrowseInput(e) {
  const b = selection.cacheDirBrowse;
  if (b) setTransient("cacheDirBrowse", { ...b, display: e.target.value });
  emit();
}
function onCacheDirBrowseGo() {
  const b = selection.cacheDirBrowse;
  if (b) browseCacheDir(b.display);
}
function onCacheDirBrowseEnter(entryPath) { browseCacheDir(entryPath); }
function onCacheDirBrowseUp() {
  const b = selection.cacheDirBrowse;
  if (b && b.parent) browseCacheDir(b.parent);
}

function onPickCacheDir() {
  const b = selection.cacheDirBrowse;
  const picked = b ? String(b.display || b.path || "").trim() : "";
  if (picked) setTransient("cacheDirDraft", picked);
  setTransient("cacheDirBrowse", null);
  setTransient("editingCacheDir", true);
  emit();
}

async function browseCacheDir(path) {
  const prev = selection.cacheDirBrowse || {};
  setTransient("cacheDirBrowse", { ...prev, path: path || "", loading: true, error: "" });
  emit();
  try {
    const q = path ? "?path=" + encodeURIComponent(path) : "";
    const res = await apiJson(CACHE_DIR_BROWSE_URL + q, { parse: "always" });
    if (!res.ok) throw new Error(hostFailureReason(res));
    const d = res.data || {};
    setTransient("cacheDirBrowse", {
      path: d.current || "",
      display: d.current || "",
      home: d.home || "",
      dirs: Array.isArray(d.dirs) ? d.dirs : [],
      parent: d.parent || null,
      truncated: d.truncated === true,
      loading: false,
      error: "",
    });
  } catch (err) {
    setTransient("cacheDirBrowse", {
      ...prev,
      loading: false,
      error: weT("无法读取该目录：{error}", { error: weT(err && err.message ? err.message : err) }),
    });
  }
  emit();
}
function onCancelEditCacheDir() {
  setTransient("editingCacheDir", false);
  setTransient("cacheDirBrowse", null);
  setTransient("cacheDirError", "");
  emit();
}
function onStartEditWeAssetsDir() {
  setTransient("editingWeAssetsDir", true);
  setTransient("weAssetsDirDraft", selection.inventory.weAssetsDir || "");
  setTransient("weAssetsError", "");
  emit();
}
function onWeAssetsDirDraft(e) { setTransient("weAssetsDirDraft", e.target.value); emit(); }
function onCancelEditWeAssetsDir() {
  setTransient("editingWeAssetsDir", false);
  setTransient("weAssetsError", "");
  emit();
}

function onLeftSidebarGlass(e) { setSetting("leftSidebarGlass", e.target.checked); emit(); }

const SIDEBAR_CORNER_KEYS = {
  left: { tl: "leftSidebarSquareTL", tr: "leftSidebarSquareTR", br: "leftSidebarSquareBR", bl: "leftSidebarSquareBL" },
  right: { tl: "rightSidebarSquareTL", tr: "rightSidebarSquareTR", br: "rightSidebarSquareBR", bl: "rightSidebarSquareBL" },
};
const SIDEBAR_RADIUS_KEYS = { left: "leftSidebarCornerRadius", right: "rightSidebarCornerRadius" };

function onSidebarCornerRadius(side, value) {
  const key = SIDEBAR_RADIUS_KEYS[side];
  if (key) setSetting(key, value);
  emit();
}

function onSidebarCornerSquare(side, corner, square) {
  const key = SIDEBAR_CORNER_KEYS[side] && SIDEBAR_CORNER_KEYS[side][corner];
  if (key) setSetting(key, square === true);
  emit();
}

function onSidebarAllCorners(side, square) {
  const table = SIDEBAR_CORNER_KEYS[side];
  if (table) for (const key of Object.values(table)) setSetting(key, square === true);
  emit();
}

function onTitlebarGlass(e) { setSetting("titlebarGlass", e.target.checked); emit(); }

function onThinkingMode(mode) {
  setSetting("thinkingGlass", mode === "glass");
  setSetting("thinkingNative", mode === "native");
  emit();
}

const onCapsuleBlur = (px, live) =>
  commitLiveSetting("capsuleBlur", clampNum(px, ...schemaRange("capsuleBlur"), DEFAULTS.capsuleBlur), live);

const onCapsuleColor = (hex, live) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
  commitLiveSetting("capsuleColor", hex, live);
};

const onSidebarBlur = (px, live) =>
  commitLiveSetting("sidebarBlur", clampNum(px, ...schemaRange("sidebarBlur"), DEFAULTS.sidebarBlur), live);

function onSidebarFollowGlobal(e) { setSetting("sidebarFollowGlobal", e.target.checked); emit(); }
const onSidebarAlpha = (pct, live) =>
  commitLiveSetting("sidebarAlpha", clampNum(pct, ...schemaRange("sidebarAlpha"), DEFAULTS.sidebarAlpha), live);
const onSidebarColor = (hex, live) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
  commitLiveSetting("sidebarColor", hex, live);
};

const onSidebarContentAlpha = (pct, live) =>
  commitLiveSetting("sidebarContentAlpha", clampNum(pct, ...schemaRange("sidebarContentAlpha"), DEFAULTS.sidebarContentAlpha), live);
const onSidebarContentColor = (hex, live) => {
  if (hex === "") {

    selection.sidebarContentColor = "";
    persistSelection();
    if (live) applyEffects({ live: true }); else emit();
    return;
  }
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
  commitLiveSetting("sidebarContentColor", hex, live);
};

const onCaretColor = (hex, live) => {
  if (hex === "") {
    commitLiveSetting("caretColor", "", live);
    return;
  }
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
  commitLiveSetting("caretColor", hex, live);
};

const onBillingEnabled = (v) => { setSetting("billingEnabled", !!v); emit(); };
const onGreetingOn = (v) => { setSetting("greetingOn", !!v); emit(); };
const onGreetingPath = (v) => { setSetting("greetingPath", String(v || "")); emit(); };
const onCoverOnStartup = (v) => {
  setSetting("coverOnStartup", !!v);
  emit();
  if (v) apiFetch("/cover", { method: "POST" }).catch(() => {   });
};
function onSidebarGlass(e) { setSetting("sidebarGlass", e.target.checked); emit(); }

function onSidebarFullClear(e) { setSetting("sidebarFullClear", e.target.checked); emit(); }

function onToggleChildIndependent(id, on) {
  const next = Object.assign({}, selection.glassMode);
  if (on) next[id] = "custom"; else delete next[id];
  setSetting("glassMode", next);
  emit();
}

function childIndependentOn(id) {
  return !!(selection.glassMode && selection.glassMode[id] === "custom");
}

function onGlassChildParam(id, param, value) { setSetting(childGlassKey(id, param), value); emit(); }

function onToggleSceneLive(e) {
  setSetting("sceneLive", e.target.checked);
  setSetting("sceneLiveFailures", {});
  prepareLiveTimeouts.clear();
  clearLiveSessionFailures();
  syncLayers();
  syncSceneAudio(selection);
  emit();
}
function onLiveBootDelay(secs) { setSetting("liveBootDelay", secs); emit(); }
function onSceneLiveFps(f) { setSetting("sceneLiveFps", f); syncLayers(); emit(); }
function onPlaybackRate(rate) { setSetting("playbackRate", rate); emit(); }
function onFpsCap(cap) {

  try { noteFpsCapChange(); } catch {   }
  setSetting("fpsCap", cap);
  refreshMediaInfo(true);
  emit();
}
function onFlip(e) { setSetting("flip", e.target.checked); emit(); }
function onAdapterTarget(e) { setSetting("adapterTarget", e.target.value); emit(); }
function onPauseOnHidden(e) { setSetting("pauseOnHidden", e.target.checked); emit(); }
function onPauseOnBlur(e) { setSetting("pauseOnBlur", e.target.checked); emit(); }
function onPauseOnBattery(e) { setSetting("pauseOnBattery", e.target.checked); emit(); }
const IMAGE_IMPORT_MAX_EDGE = 512;

function pickImageFile(onFile, accept) {
  if (typeof document === "undefined" || typeof document.createElement !== "function") return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept || IMAGE_DIRECT_ACCEPT;
  input.style.display = "none";
  try { document.body.appendChild(input); } catch {   }
  const done = () => { try { input.remove(); } catch {   } };
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    done();
    if (file) onFile(file);
  });

  input.addEventListener("cancel", done);
  if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
    window.setTimeout(done, 60000);
  }
  try { input.click(); } catch {   }
}

async function decodeImageFile(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file); } catch {   }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });
  } finally {

    try { URL.revokeObjectURL(url); } catch {   }
  }
}

async function downscaleImageFile(file, maxEdge) {
  const src = await decodeImageFile(file);
  return await downscaleDecoded(src, maxEdge, file);
}

async function downscaleImageBlob(blob, maxEdge) {
  const src = await decodeImageFile(blob);
  return await downscaleDecoded(src, maxEdge, blob);
}

async function downscaleDecoded(src, maxEdge, fallback, losslessFirst) {
  const w = Number(src.width) || 0;
  const h = Number(src.height) || 0;
  if (!w || !h) throw new Error("bad image");
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("no canvas");
  g.drawImage(src, 0, 0, tw, th);
  if (src.close) { try { src.close(); } catch {   } }
  const toBlob = (type, quality) => new Promise((resolve) => {
    try { canvas.toBlob((b) => resolve(b), type, quality); } catch { resolve(null); }
  });

  if (losslessFirst) {
    const png = await toBlob("image/png");
    if (png && png.type === "image/png") return { blob: png, width: tw, height: th };
    const lossy = await toBlob("image/webp", 0.92);
    return { blob: (lossy && lossy.type === "image/webp") ? lossy : ((await toBlob("image/png")) || fallback), width: tw, height: th };
  }
  const webp = await toBlob("image/webp", 0.92);
  const blob = (webp && webp.type === "image/webp") ? webp : (await toBlob("image/png")) || fallback;
  return { blob, width: tw, height: th };
}

function assetRouteFailure(res, what) {
  const bare = !res || !res.data || typeof res.data !== "object" || !res.data.error;
  if (bare && (res.status === 404 || res.status === 405)) {
    return weT("宿主里没有{what}路由：重启 DSH 后再试（改过宿主代码要重挂，刷新页面不够）",
      { what: what });
  }
  return (res && res.data && res.data.error) || weT("宿主返回 {status}", { status: res ? res.status : 0 });
}

async function postImageAsset(path, blob, what) {
  const res = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": blob.type },
    body: blob,
    parse: "always",
  });
  const name = res.data && typeof res.data.name === "string" ? res.data.name : "";
  if (!res.ok || !name) return { ok: false, error: assetRouteFailure(res, what) };
  return { ok: true, name: name };
}

function onAvatarEnabled(e) { setSetting("avatarEnabled", e.target.checked); emit(); }
function onAvatarSize(v, live) { commitLiveSetting("avatarSize", v, live); if (live) syncAvatarLayer(); }
function onAvatarRadius(v, live) { commitLiveSetting("avatarRadius", v, live); if (live) syncAvatarLayer(); }

const AVATAR_CROP_VIEW = 260;

let avatarCropPending = null;

let avatarOverflowPending = null;

function onAvatarPick(side) {

  pickImageFile((file) => onAvatarFileChosen(side, file), AVATAR_PICK_ACCEPT);
}

async function onAvatarFileChosen(side, file) {
  if (!file) return;
  const type = String(file.type || "").toLowerCase();

  const known = (IMAGE_DIRECT_ACCEPT + "," + IMAGE_RASTER_ACCEPT).split(",");
  if (type && !known.includes(type)) {
    setTransient("avatarOverflow", null);
    setTransient("avatarError", weT("仅支持 JPG / PNG / WebP / SVG / GIF / BMP / AVIF 图片"));
    emit();
    return;
  }
  const size = await probeImageSize(file);
  const verdict = avatarImportLimit(file, size);
  if (verdict.ok) {
    avatarOverflowPending = null;
    setTransient("avatarOverflow", null);
    await openAvatarCrop(side, file);
    return;
  }

  avatarOverflowPending = { side: side, file: file };
  setTransient("avatarError", "");
  setTransient("avatarOverflow", {
    side: side,
    bytes: verdict.bytes,
    width: verdict.width,
    height: verdict.height,
    overBytes: verdict.overBytes,
    overEdge: verdict.overEdge,

    compressible: true,
  });
  emit();
}

async function onAvatarAutoCompress() {
  const pending = avatarOverflowPending;
  if (!pending) return;
  setTransient("avatarCompressing", true);
  setTransient("avatarError", "");
  emit();
  try {
    const src = await decodeImageFile(pending.file);
    const shrunk = await downscaleDecoded(src, AVATAR_IMPORT_MAX_EDGE, pending.file, true);

    const name = "avatar-compressed." + (shrunk.blob.type === "image/png" ? "png" : "webp");
    const compressed = (typeof File === "function")
      ? new File([shrunk.blob], name, { type: shrunk.blob.type })
      : shrunk.blob;
    setTransient("avatarCompressing", false);
    avatarOverflowPending = null;
    setTransient("avatarOverflow", null);
    await openAvatarCrop(pending.side, compressed);
  } catch (err) {
    setTransient("avatarCompressing", false);
    setTransient("avatarError", weT("压缩失败：{error}", { error: err && err.message ? err.message : String(err) }));
    emit();
  }
}

async function openAvatarCrop(side, file) {
  if (!file || !/^image\//.test(String(file.type || ""))) {
    setTransient("avatarError", weT("仅支持 JPG / PNG / WebP / SVG / GIF / BMP / AVIF 图片"));
    emit();
    return;
  }
  let url;
  try {
    const src = await decodeImageFile(file);
    const w = Number(src.width) || 0;
    const h = Number(src.height) || 0;
    if (src.close) { try { src.close(); } catch {   } }
    if (!w || !h) throw new Error(weT("读不出图片尺寸"));
    url = URL.createObjectURL(file);
  } catch (err) {
    setTransient("avatarError", weT("导入失败：{error}", { error: err && err.message ? err.message : String(err) }));
    emit();
    return;
  }

  avatarCropPending = { side: side, file: file };
  setTransient("avatarError", "");  setTransient("avatarCropSide", side);
  setTransient("avatarCropUrl", url);
  setTransient("avatarCropW", w);
  setTransient("avatarCropH", h);
  setTransient("avatarCropZoom", 1);
  setTransient("avatarCropX", 0);
  setTransient("avatarCropY", 0);
  emit();
}

function closeAvatarCrop() {
  const url = selection.avatarCropUrl;
  if (url) { try { URL.revokeObjectURL(url); } catch {   } }
  avatarCropPending = null;
  setTransient("avatarCropSide", "");
  setTransient("avatarCropUrl", "");
  setTransient("avatarCropW", 0);
  setTransient("avatarCropH", 0);
  setTransient("avatarCropZoom", 1);
  setTransient("avatarCropX", 0);
  setTransient("avatarCropY", 0);
  emit();
}

function avatarCropGeometry() {
  const w = Number(selection.avatarCropW) || 0;
  const h = Number(selection.avatarCropH) || 0;
  const zoom = Math.max(1, Number(selection.avatarCropZoom) || 1);
  if (!w || !h) return { dw: 0, dh: 0, dx: 0, dy: 0, base: 1 };
  const base = AVATAR_CROP_VIEW / Math.min(w, h);
  const dw = w * base * zoom;
  const dh = h * base * zoom;
  const slackX = Math.max(0, (dw - AVATAR_CROP_VIEW) / 2);
  const slackY = Math.max(0, (dh - AVATAR_CROP_VIEW) / 2);
  const nx = Math.max(-1, Math.min(1, Number(selection.avatarCropX) || 0));
  const ny = Math.max(-1, Math.min(1, Number(selection.avatarCropY) || 0));
  return {
    dw: dw, dh: dh, base: base,
    dx: -slackX * nx,
    dy: -slackY * ny,
  };
}

function onAvatarCropDrag(dxPx, dyPx) {
  const geo = avatarCropGeometry();
  const slackX = Math.max(0, (geo.dw - AVATAR_CROP_VIEW) / 2);
  const slackY = Math.max(0, (geo.dh - AVATAR_CROP_VIEW) / 2);
  const nx = slackX > 0 ? (Number(selection.avatarCropX) || 0) - dxPx / slackX : 0;
  const ny = slackY > 0 ? (Number(selection.avatarCropY) || 0) - dyPx / slackY : 0;

  commitLiveTransient("avatarCropX", Math.max(-1, Math.min(1, nx)), true);
  commitLiveTransient("avatarCropY", Math.max(-1, Math.min(1, ny)), true);
}

function onAvatarCropZoom(z, live) {
  const v = Math.max(1, Math.min(4, Number(z) || 1));
  commitLiveTransient("avatarCropZoom", v, live);
}

async function cropAvatarToBlob() {
  const pending = avatarCropPending;
  if (!pending) throw new Error(weT("没有待裁的图片"));
  const src = await decodeImageFile(pending.file);
  const w = Number(src.width) || 0;
  const h = Number(src.height) || 0;
  const geo = avatarCropGeometry();

  const perSrc = 1 / (geo.base * Math.max(1, Number(selection.avatarCropZoom) || 1));
  const side = AVATAR_CROP_VIEW * perSrc;

  const cx = w / 2 - geo.dx * perSrc;
  const cy = h / 2 - geo.dy * perSrc;
  const sx = Math.max(0, Math.min(w - side, cx - side / 2));
  const sy = Math.max(0, Math.min(h - side, cy - side / 2));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(side));
  out.height = Math.max(1, Math.round(side));
  const g = out.getContext("2d");
  if (!g) throw new Error(weT("没有可用的画布"));
  g.drawImage(src, sx, sy, side, side, 0, 0, out.width, out.height);
  if (src.close) { try { src.close(); } catch {   } }
  const toBlob = (type, quality) => new Promise((resolve) => {
    try { out.toBlob((b) => resolve(b), type, quality); } catch { resolve(null); }
  });
  const webp = await toBlob("image/webp", 0.92);
  return (webp && webp.type === "image/webp") ? webp : (await toBlob("image/png"));
}

async function onAvatarCropConfirm() {
  const pending = avatarCropPending;
  if (!pending) { closeAvatarCrop(); return; }
  const side = pending.side;
  setTransient("avatarBusy", side);
  emit();
  try {
    const cut = await cropAvatarToBlob();
    if (!cut) throw new Error(weT("裁切失败"));
    const img = await downscaleImageBlob(cut, AVATAR_IMPORT_MAX_EDGE);
    const posted = await postImageAsset("/avatar/" + side, img.blob, weT("头像"));
    if (!posted.ok) throw new Error(posted.error);

    setSetting(side === "ai" ? "avatarAiImage" : "avatarUserImage", posted.name);
    setTransient("avatarBusy", "");
    closeAvatarCrop();
  } catch (err) {
    setTransient("avatarBusy", "");
    setTransient("avatarError", weT("导入失败：{error}", { error: err && err.message ? err.message : String(err) }));
    closeAvatarCrop();
  }
}
function onAvatarClear(side) {
  setTransient("avatarError", "");
  apiDelete("/avatar/" + side, { parse: "always" }).then((r) => {
    if (!r.ok) throw new Error(assetRouteFailure(r, weT("头像")));
    setSetting(side === "ai" ? "avatarAiImage" : "avatarUserImage", "");
    emit();
  }).catch((err) => {
    setTransient("avatarError", weT("清除失败：{error}", { error: err && err.message ? err.message : String(err) }));
    emit();
  });
}

function onObjectFit(mode) {
  setSetting("objectFit", mode);
  emit();
  if (weDrawCtx) {
    weDrawCtx.fit = mode;
    weDrawFrame();
  }
}

function framePreviewSrc(selLike) {
  const v = Number(selLike && selLike.frameVariants && selLike.frameVariants[String(selLike && selLike.id)]) || 0;
  const base = frameUrlWithVariant(selLike && selLike.sceneFrameUrl, v);
  if (!base) return "";
  return base + (base.indexOf("?") === -1 ? "?" : "&") + "we-prev=" + (gpuFrameUi.probedAt || 0);
}

function probeGpuFrameState(frameUrl, force) {
  const wid = String(selection.id || "");
  const token = gpuFrameToken(frameUrl);
  if (!wid || !token) return;
  if (!force && gpuFrameUi.wid === wid && Date.now() - gpuFrameUi.probedAt < GPU_FRAME_PROBE_TTL_MS) return;
  const at = Date.now();
  gpuFrameUi.wid = wid;
  gpuFrameUi.probedAt = at;
  const wasPinned = gpuFrameUi.pinned;

  apiHead("/scene-frame/" + encodeURIComponent(token))
    .then((res) => {
      if (gpuFrameUi.wid !== wid || gpuFrameUi.probedAt !== at) return;
      const rh = res.response;
      const pinned = Boolean(res.ok && rh && rh.headers && typeof rh.headers.get === "function"
        && rh.headers.get("x-we-gpu") === "1");
      gpuFrameUi.pinned = pinned;

      const gw = pinned ? Number(rh.headers.get("x-we-gpu-w")) : 0;
      const gh = pinned ? Number(rh.headers.get("x-we-gpu-h")) : 0;
      gpuFrameUi.w = Number.isFinite(gw) && gw > 0 ? gw : 0;
      gpuFrameUi.h = Number.isFinite(gh) && gh > 0 ? gh : 0;
      gpuFrameUi.busy = false;
      if (pinned !== wasPinned) { try { emit(); } catch {   } }
    })
    .catch(() => {   });
}
function modalInitialFocus(el) {
  if (el && pickerFocusPending) {
    pickerFocusPending = false;
    try { el.focus(); } catch {   }
  }
}

function cardKeyDown(e) {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); }
}

function playbackIsVideoLike(selLike) {
  const isLiveScene = (selLike.type === "scene" || selLike.type === "web") && liveRenderEnabled(selLike);
  return !isLiveScene && (selLike.type === "video"
    || (selLike.type === "scene" && Boolean(selLike.sceneVideo)));
}

function onTogglePlay() {
  if (selection.playing && playbackIsVideoLike(selection) && !selection.videoPlaying) {
    const layer = document.getElementById(LAYER_ID);
    const v = layer && layer.querySelector("video");
    if (v && v.dataset) delete v.dataset.wePlayRefused;
    setTransient("videoError", "");
    emit();
    return;
  }
  setTransient("playing", !selection.playing);
  emit();
}

function onToggleAudio() {
  const enabling = selection.videoAudioEnabled === false;
  selection.videoAudioEnabled = enabling;
  if (enabling && clampNum(selection.videoVolume, 0, 1, 0) <= 0) {
    selection.videoVolume = DEFAULT_AUDIO_VOLUME;
  }
  const layer = document.getElementById(LAYER_ID);
  const v = layer && layer.querySelector("video");
  if (v) weApplyAudio(v);
  syncSceneAudio(selection);
  if (sceneAudioEl && selection.videoAudioEnabled !== false && weAudioVolume() > 0) {
    const p = sceneAudioEl.play();
    if (p && typeof p.catch === "function") p.catch(() => {   });
  }
  persistSelection();
  emit();
}

function onVideoVolume(pct, live) {
  selection.videoVolume = clampNum(Number(pct) / 100, 0, 1, 0);
  const layer = document.getElementById(LAYER_ID);
  const vid = layer && layer.querySelector("video");
  if (vid) weApplyAudio(vid);
  syncSceneAudio(selection);
  if (sceneAudioEl && selection.videoAudioEnabled !== false && weAudioVolume() > 0) {
    const p = sceneAudioEl.play();
    if (p && typeof p.catch === "function") p.catch(() => {   });
  }
  persistSelection();
  if (!live) emit();
}
function onClear() {

  propsPanelOpen = false;
  applySelection("");
}

function clearLiveFailure(id) {
  const k = String(id || "");
  const m = selection.sceneLiveFailures;
  if (!k || !m || !m[k]) return;
  const next = Object.assign({}, m);
  delete next[k];
  setSetting("sceneLiveFailures", next);
}
function onGroupChange(e) {

  disarmConfirm();
  selection.rotationGroupId = e.target.value;
  if (selection.rotationEnabled) {
    const first = rotationCandidates()[0];
    if (first) applySelection(first.id);
    else applySelection("");
    return;
  }
  persistSelection();
  syncRotationTimer();
  emit();
}
function onToggleRotation() {
  selection.rotationEnabled = !selection.rotationEnabled;

  if (!selection.rotationEnabled) cancelRotationPrepare();
  if (selection.rotationEnabled) {
    if (!selection.rotationGroupId) {
      const usable = firstUsableGroup();
      if (usable) selection.rotationGroupId = usable.id;
    }
    if (!rotationCandidates().some((w) => w.id === selection.id)) {
      const first = rotationCandidates()[0];
      if (first) {
        applySelection(first.id);
        return;
      }
    }
  }
  persistSelection();
  syncRotationTimer();
  emit();
}

function onNextWallpaper() {
  const list = selection.rotationEnabled ? rotationCandidates() : playableInventory();
  if (list.length < 2) return;
  const anchor = rotationAnchorWallpaper();
  const anchorId = anchor ? anchor.id : selection.id;
  const cur = list.findIndex((w) => w.id === anchorId);
  const next = list[(cur + 1 + list.length) % list.length];
  if (next && next.id !== anchorId) applySelection(next.id, { fromManual: true });
}

const onScrim = (pct, live) => commitLiveSetting("scrim", pct / 100, live);

const onWallpaperOpacity = (pct, live) =>
  commitLiveSetting("wallpaperOpacity", clampNum(pct, ...schemaRange("wallpaperOpacity"), DEFAULTS.wallpaperOpacity), live);
const onBorder = (pct, live) => commitLiveSetting("border", pct / 100, live);
const onBlur = (px, live) => commitLiveSetting("blur", px, live);
const onWallpaperBlur = (px, live) => commitLiveSetting("wallpaperBlur", px, live);
const onBackgroundBrightness = (pct, live) => commitLiveSetting("backgroundBrightness", pct, live);
const onBackgroundContrast = (pct, live) => commitLiveSetting("backgroundContrast", pct, live);
const onBackgroundSaturate = (pct, live) => commitLiveSetting("backgroundSaturate", pct, live);

const onLayerPositionX = (pct, live) =>
  commitLiveSetting("layerPositionX", clampNum(pct, ...schemaRange("layerPositionX"), DEFAULTS.layerPositionX), live);
const onLayerPositionY = (pct, live) =>
  commitLiveSetting("layerPositionY", clampNum(pct, ...schemaRange("layerPositionY"), DEFAULTS.layerPositionY), live);
const onLayerScale = (pct, live) =>
  commitLiveSetting("layerScale", clampNum(pct, ...schemaRange("layerScale"), DEFAULTS.layerScale), live);

const onLayerReset = (key) => {
  const field = key === "x" ? "layerPositionX" : key === "y" ? "layerPositionY" : "layerScale";
  setSetting(field, DEFAULTS[field]);
  emit();
};

function resetKeysToDefault(keys) {
  let touched = 0;
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i];
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, k)) continue;
    if (selection[k] === DEFAULTS[k]) continue;
    selection[k] = DEFAULTS[k];
    touched += 1;
  }
  if (touched) persistSelection();
  return touched;
}

const onResetModule = (groupName) => {
  const keys = (typeof RESET_MODULES === "object" && RESET_MODULES && RESET_MODULES[groupName]) || [];
  if (!keys.length) return;
  resetKeysToDefault(keys);
  emit();
};

const onResetTab = (tabId) => {
  const keys = (typeof RESET_TABS === "object" && RESET_TABS && RESET_TABS[tabId]) || [];
  resetKeysToDefault(keys);
  disarmConfirm();
};

const onResetAll = () => {
  resetKeysToDefault(PROFILE_PRESET_KEYS);
  disarmConfirm();
};

const onAccent = (hex, live) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
  commitLiveSetting("accent", hex, live);
};

const onToggleUiColorCustom = (v) => {
  setSetting("uiColorCustom", !!v);
  applyEffects();
  emit();
};

const onUiColorElement = (field, hex, live) => {
  if (hex !== "" && !/^#[0-9a-f]{6}$/i.test(hex)) return;
  if (UI_COLOR_KEYS.indexOf(field) < 0) return;
  commitLiveSetting(field, hex, live);
};

const onGlassColor = (mode, hex, live) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
  const cur = panelGlassPair(selection);

  const next = { light: cur.light || hex, dark: cur.dark || hex };
  if (selection.glassDarkSeparate === true) next[mode === "dark" ? "dark" : "light"] = hex;
  else { next.light = hex; next.dark = hex; }
  commitLiveSetting("glassColor", next, live);
};

const onGlassDarkSeparate = (v) => {
  const on = v === true;
  setSetting("glassDarkSeparate", on);
  if (!on) {
    const cur = panelGlassPair(selection);
    const light = cur.light || cur.dark;
    if (light) setSetting("glassColor", { light, dark: light });
  }
  applyEffects(); emit();
};
const onGlassAlpha = (pct, live) =>
  commitLiveSetting("glassAlpha", clampNum(pct, ...schemaRange("glassAlpha"), DEFAULTS.glassAlpha), live);

const onGlassFidelity = (pct, live) =>
  commitLiveSetting("glassFidelity", clampNum(pct, ...schemaRange("glassFidelity"), DEFAULTS.glassFidelity), live);

const onExtraGlassSelectors = (text) => {
  setSetting("extraGlassSelectors", text == null ? "" : String(text));
  applyEffects();
  emit();
};

const onChatGlassFidelity = (pct, live) =>
  commitLiveSetting("chatGlassFidelity", clampNum(pct, ...schemaRange("chatGlassFidelity"), DEFAULTS.chatGlassFidelity), live);

const onToggleThemeFollow = (v) => {
  setSetting("themeFollow", !!v); themeFollowOnWallpaper(selection); emit();
};

const onChatLayout = (v) => { setSetting("chatLayout", v === "spread" ? "spread" : "center"); emit(); };


function nextFontSetName() {
  const base = weT("我的字体集");
  const taken = new Set((selection.fontSets || []).map((r) => r && r.name).filter(Boolean));
  if (!taken.has(base)) return base;
  for (let i = 2; i <= 999; i++) {
    const name = base + " " + i;
    if (!taken.has(name)) return name;
  }
  return base + " " + Date.now().toString(36);
}

function fontSetCtx() {
  const rowOf = (id) => (selection.fontSets || []).find((r) => r && r.id === id) || { id };
  const done = () => { setTransient("fontSetLoading", false); emit(); };
  const busy = (promise) => { setTransient("fontSetLoading", true); emit(); promise.then(done, done); };
  return {
    open: selection.fontSetOpen === true,
    onOpen: (v) => {
      setTransient("fontSetOpen", v === true);
      if (selection.fontSetOpen) busy(refreshFontSets());
      else disarmConfirm();
    },
    fontSets: selection.fontSets,
    activeId: selection.fontSetActive,

    inUseId: fontSetDrifted() ? "" : selection.fontSetActive,
    loading: selection.fontSetLoading === true,
    error: selection.fontSetError,
    editingId: selection.fontSetEditing,
    draftName: selection.fontSetDraftName,
    armedId: armedIdOf("fontset"),
    exportUrl: (id) => exportFontSetUrl(id),
    onImport: (file) => busy(importFontSet(file)),
    onActivate: (id) => busy(activateFontSet(id)),
    onRefresh: () => busy(refreshFontSets()),
    onDelete: (id) => { disarmConfirm(); busy(deleteFontSet(id)); },

    onArm: (id) => armConfirm("fontset:" + id),
    onDisarm: () => disarmConfirm(),
    onEdit: (id) => {
      setTransient("fontSetEditing", id);
      setTransient("fontSetDraftName", rowOf(id).name || "");
      emit();
    },
    onDraftName: (v) => { setTransient("fontSetDraftName", String(v == null ? "" : v)); emit(); },
    onRenameCommit: (id) => busy(renameFontSet(id, selection.fontSetDraftName).then((ok) => {
      if (ok) { setTransient("fontSetEditing", ""); setTransient("fontSetDraftName", ""); }
    })),
    onCancelEdit: () => { setTransient("fontSetEditing", ""); setTransient("fontSetDraftName", ""); emit(); },

    onCreate: () => busy(flushFontSetNow()
      .then(() => createFontSet(nextFontSetName()))
      .then(() => { emit(); })),
  };
}

function presetAssetChecksNow() {
  const fontValues = (() => {
    const out = {};
    for (const key of FONTSET_KEYS) out[key] = selection[key];
    return sanitizeFontset(out);
  })();
  const fontAvailable = Boolean(fontValues.themeColors
    && typeof fontValues.themeColors === "object"
    && Object.keys(fontValues.themeColors).length > 0);
  const avatarAvailable = Boolean(selection.avatarUserImage || selection.avatarAiImage);
  const prev = (selection.glassPresetAssetChecks && typeof selection.glassPresetAssetChecks === "object")
    ? selection.glassPresetAssetChecks : {};
  return {

    font: prev.font !== false,
    avatar: prev.avatar === true,

    fontAvailable,
    avatarAvailable,
  };
}

function glassPresetCtx() {
  const done = () => { setTransient("glassPresetBusy", false); emit(); };
  const busy = (promise) => { setTransient("glassPresetBusy", true); emit(); promise.then(done, done); };

  return {
    presets: selection.glassPresets,
    loading: selection.glassPresetBusy === true,
    error: selection.glassPresetError,
    note: selection.glassPresetNote,
    saving: selection.glassPresetSaving === true,

    saveTarget: selection.glassPresetSaveTarget,

    exportTargetId: selection.glassPresetTargetId,
    draftName: selection.glassPresetDraftName,
    armedId: armedIdOf("gpreset"),
    assetChecks: selection.glassPresetAssetChecks,

    onAssetToggle: (kind, on) => {
      const next = Object.assign({}, selection.glassPresetAssetChecks);
      next[kind] = on === true;
      setTransient("glassPresetAssetChecks", next);
      emit();
    },

    onApply: (id) => {
      disarmConfirm();
      busy(applyPreset(id));
    },
    onOpenSave: () => {
      setTransient("glassPresetSaving", true);
      setTransient("glassPresetSaveTarget", "save");
      setTransient("glassPresetTargetId", "");
      setTransient("glassPresetDraftName", "");
      setTransient("glassPresetError", "");
      setTransient("glassPresetNote", "");

      setTransient("glassPresetAssetChecks", presetAssetChecksNow());
      disarmConfirm();
      emit();
    },

    onOpenExport: () => {
      const first = (Array.isArray(selection.glassPresets) ? selection.glassPresets : [])
        .find((r) => !r.broken);
      setTransient("glassPresetSaving", true);
      setTransient("glassPresetSaveTarget", "export");
      setTransient("glassPresetTargetId", first ? first.id : "");
      setTransient("glassPresetError", "");
      setTransient("glassPresetNote", "");

      setTransient("glassPresetAssetChecks", Object.assign(presetAssetChecksNow(), { font: true, avatar: false }));
      disarmConfirm();
      emit();
    },

    onExportTargetChange: (id) => {
      setTransient("glassPresetTargetId", String(id == null ? "" : id));
      emit();
    },

    onExportCommit: () => {
      const id = selection.glassPresetTargetId;
      if (!isGlassPresetId(id)) return;
      const checks = selection.glassPresetAssetChecks || {};
      const embeds = ["font", "avatar"].filter((k) => checks[k] === true);
      setTransient("glassPresetSaving", false);
      setTransient("glassPresetSaveTarget", "");
      setTransient("glassPresetTargetId", "");
      emit();
      const a = document.createElement("a");
      a.href = exportGlassPresetUrl(id, embeds);
      a.download = id + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    onDraftName: (v) => { setTransient("glassPresetDraftName", String(v == null ? "" : v)); emit(); },

    onSaveCommit: () => {
      if (!String(selection.glassPresetDraftName || "").trim()) {
        setPresetError(weT("先给预设起个名字"));
        return;
      }
      emit();
    },

    onSaveCommit2: () => {
      const checks = selection.glassPresetAssetChecks || {};
      const embeds = ["font", "avatar"].filter((k) => checks[k] === true);
      busy(saveGlassPreset(selection.glassPresetDraftName, embeds).then((id) => {
        if (id) { setTransient("glassPresetSaving", false); setTransient("glassPresetDraftName", ""); }
        emit();
      }));
    },
    onCancelSave: () => {
      setTransient("glassPresetSaving", false);
      setTransient("glassPresetSaveTarget", "");
      setTransient("glassPresetTargetId", "");
      setTransient("glassPresetDraftName", "");
      emit();
    },
    onArmDelete: (id) => armConfirm("gpreset:" + id),
    onDisarm: () => disarmConfirm(),
    onDelete: (id) => { disarmConfirm(); busy(deleteGlassPreset(id)); },

    onImportFile: (file) => { disarmConfirm(); busy(importGlassPreset(file)); },
  };
}

const onThemeFamily = (role, key) => {
  const next = Object.assign({}, selection.themeFamily);
  if (!key) delete next[role];
  else next[role] = key;
  setFontValues({ themeFamily: next }); applyEffects(); emit();
};

const onGlobalFamily = (key) => {
  setFontValues({ globalFamily: sanitizeFamilyKey(key) });
  applyEffects(); emit();
};

const onRefreshSystemFonts = () => { ensureSystemFonts(true); };

const onThemeSize = (role, raw) => {
  const next = Object.assign({}, selection.themeSize);
  const num = raw === "" ? NaN : Number(raw);
  if (!Number.isFinite(num)) delete next[role];
  else next[role] = Math.round(num);
  setFontValues({ themeSize: next }); applyEffects(); emit();
};

const onThemeWeight = (role, raw) => {
  const next = Object.assign({}, selection.themeWeight);
  const num = raw === "" ? NaN : Number(raw);
  if (!Number.isFinite(num)) delete next[role];
  else next[role] = Math.round(num);
  setFontValues({ themeWeight: next }); applyEffects(); emit();
};

const onComponentFont = (prefix, prop, raw) => {
  const next = Object.assign({}, selection.componentFonts);
  const one = Object.assign({}, next[prefix]);
  const num = raw === "" ? NaN : Number(raw);
  if (!Number.isFinite(num)) delete one[prop];
  else one[prop] = Math.round(num);
  if (Object.keys(one).length) next[prefix] = one;
  else delete next[prefix];
  setFontValues({ componentFonts: next }); applyEffects(); emit();
};

const onThemeColor = (role, mode, hex, separate) => {
  const cur = selection.themeColors[role] || { light: "", dark: "" };
  const next = { light: cur.light || "", dark: cur.dark || "" };
  if (separate) next[mode] = hex;
  else { next.light = hex; next.dark = hex; }

  if (separate) {
    const other = mode === "light" ? "dark" : "light";
    if (!next[other]) {
      const tokens = (THEME_COLOR_ROLES.find((r) => r.id === role) || {}).tokens;
      next[other] = (tokens && officialColorOf(tokens)) || hex;
    }
  }
  setFontValues({ themeColors: Object.assign({}, selection.themeColors, { [role]: next }) }); applyEffects(); emit();
};
const onThemeColorClear = (role) => {
  const next = Object.assign({}, selection.themeColors);
  delete next[role];
  setFontValues({ themeColors: next }); applyEffects(); emit();
};

const onThemeTypeOnly = (v) => {
  setTransient("themeTypeOnly", v);
  emit();
};

const onThemeDarkSeparate = (v) => {
  setFontValues({ themeDarkSeparate: v }); applyEffects(); emit();
};

const toHexColor = (v) => {
  const s = String(v || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  const m = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!m) return "";
  const h = (n) => Number(n).toString(16).padStart(2, "0");
  return "#" + h(m[1]) + h(m[2]) + h(m[3]);
};
const officialColorOf = (tokens) => {
  try {
    const es = document.documentElement.style;
    for (const t of tokens || []) {
      const hex = toHexColor(es.getPropertyValue("--we-host-" + t.slice(2)));
      if (hex) return hex;
    }
  } catch {   }
  return "";
};

const onToggleFontCustom = (v) => {
  setSetting("fontCustom", !!v); applyEffects(); emit();
  if (v) ensureSystemFonts(false);
};

const onFontAdvanced = (v) => {
  setTransient("fontAdvanced", v);
  emit();
};

const onComponentFamily = (prefix, key) => {
  const next = Object.assign({}, selection.componentFonts);
  const one = Object.assign({}, next[prefix]);
  const family = sanitizeFamilyValue(key);
  if (!family) delete one.family;
  else one.family = family;
  if (Object.keys(one).length) next[prefix] = one;
  else delete next[prefix];
  setFontValues({ componentFonts: next }); applyEffects(); emit();
};

const onFontResetAll = () => {
  selection.themeColors = {};
  selection.themeSize = {};
  selection.themeWeight = {};
  selection.themeFamily = {};
  selection.globalFamily = "";
  selection.componentFonts = {};
  selection.themeDarkSeparate = false;

  persistFontSet();

  setTransient("fontAdvanced", false); applyEffects(); emit();
};

const onRefresh = () => loadInventory();

const onRatingFilterChange = (e) => {
  setSetting("contentRatingFilter", e.target.value);
  revalidateSelection();
};
const onTypeFilterChange = (e) => {
  setSetting("typeFilter", e.target.value);
  revalidateSelection();
};

const onLayoutChange = (value) => {
  setSetting("pickerLayout", value);
  emit();
};

const onEdgeCompatChange = (checked) => {
  setSetting("edgeCompat", checked);
  emit();
};

const onGroupInterval = (e) => {
  const group = activeRotationGroup();
  if (!group) return;
  group.interval = clampNum(Number(e.target.value), ...schemaRange("rotationInterval"), DEFAULTS.rotationInterval);
  persistSelection();
  syncRotationTimer();
  emit();
};

const onArmDeleteGroup = () => {
  const group = activeRotationGroup();
  if (!group) return;
  armConfirm("group:" + group.id);
};
const onDeleteGroup = () => {
  const group = activeRotationGroup();
  if (!group) return;
  disarmConfirm();
  deleteGroup(group.id);
};

const onSwitchTransition = (id) => {
  if (!SWITCH_TRANSITION_VALUES.includes(id)) return;
  setSetting("switchTransition", id); emit();
};
const onSwitchTransitionDir = (dir) => {
  if (!SWITCH_DIRS.includes(dir)) return;
  setSetting("switchTransitionDir", dir); emit();
};
const onSwitchTransitionSpeed = (id) => {
  if (!SWITCH_SPEED_VALUES.includes(id)) return;
  setSetting("switchTransitionSpeed", id); emit();
};

const currentLiveFrame = () => {
  const ref = livePointerFrame;
  if (ref && (!("isConnected" in ref) || ref.isConnected)) return ref;
  try {
    const node = document.getElementById(LAYER_ID);
    const f = node && typeof node.querySelector === "function" ? node.querySelector("iframe.we-live-iframe") : null;
    if (f) return f;
  } catch {   }
  return null;
};

const setCustomFrameLocal = (wid, on) => {
  const m = Object.assign({}, selection.customFrames || {});
  if (on) m[wid] = true; else delete m[wid];
  selection.customFrames = m;
};

const closePicker = () => {

  disarmConfirm();
  setTransient("pickerOpen", false);
  setTransient("pickerDraft", false);
  setTransient("batchMode", false);
  setTransient("batchSelected", []);
  emit();

  if (pickerOpener && pickerOpener.isConnected) {
    try { pickerOpener.focus(); } catch {   }
  }
};

const INTERVALS = [1, 5, 10, 30, 60, 120];

const pagerRow = (count, page, pages, onPrev, onNext) =>
  React.createElement("div", { className: "we-picker__pager" },
    React.createElement("span", { className: "we-picker__hint" },
      weT("共 {count} 个 · 第 {page} / {pages} 页", { count, page: page + 1, pages })),
    React.createElement("button", {
      className: "we-picker__btn", type: "button",
      disabled: page <= 0,
      onClick: onPrev,
    }, weT("‹ 上一页")),
    React.createElement("button", {
      className: "we-picker__btn", type: "button",
      disabled: page >= pages - 1,
      onClick: onNext,
    }, weT("下一页 ›")),
  );

const onShowNormalView = () => { disarmConfirm(); setTransient("modalView", "normal"); emit(); };
const onShowHiddenView = () => { disarmConfirm(); setTransient("modalView", "hidden"); setTransient("batchMode", false); setTransient("batchSelected", []); emit(); };
const onToggleBatchMode = () => { disarmConfirm(); setTransient("batchMode", !selection.batchMode); setTransient("batchSelected", []); emit(); };

const onArmBatchHide = () => armConfirm("batchHide");
const onBatchHide = () => {
  disarmConfirm();
  hideWallpapers(selection.batchSelected.slice());
  setTransient("batchMode", false);
  setTransient("batchSelected", []);
  emit();
};
const onBatchCancel = () => { disarmConfirm(); setTransient("batchMode", false); setTransient("batchSelected", []); emit(); };
const onSearchInput = (e) => { setTransient("search", e.target.value); emit(); };
const onPickCard = (w) => {

  if (selection.pickerDraft && selection.editing) {
    const ids = selection.editing.wallpaperIds;
    const i = ids.indexOf(w.id);
    if (i >= 0) ids.splice(i, 1);
    else ids.push(w.id);
    emit();
    return;
  }
  if (selection.batchMode) {
    const i = selection.batchSelected.indexOf(w.id);
    if (i >= 0) selection.batchSelected.splice(i, 1);
    else selection.batchSelected.push(w.id);
    emit();
  } else {
    applySelection(w.id, { fromManual: true });
  }
};

function WallpaperPicker() {
  useWeLocale();
  const sel = useStore();

  const isLiveScene = (sel.type === "scene" || sel.type === "web") && liveRenderEnabled(sel);
  const isVideoLike = !isLiveScene && (sel.type === "video"
    || (sel.type === "scene" && Boolean(sel.sceneVideo)));

  const playbackLive = isVideoLike ? sel.videoPlaying : sel.playing;

  const onRefreshFrame = () => {
    if (sel.type !== "scene" || !sel.sceneFrameUrl) return;
    const wid = String(sel.id);
    const total = frameVariantCount(sel, wid);
    if (total < 2) return;

    const cur = Number(sel.frameVariants && sel.frameVariants[wid]) || 0;
    const idx = Math.max(0, FRAME_VARIANTS.findIndex((f) => f.id === cur));
    const next = FRAME_VARIANTS[(idx + 1) % total].id;
    const map = Object.assign({}, selection.frameVariants || {});
    map[wid] = next;
    selection.frameVariants = map;

    setSetting("url", frameUrlWithVariant(sel.sceneFrameUrl, next)); syncLayers(); emit();
  };

  const onClearGpuFrame = () => {
    if (sel.type !== "scene" || !sel.sceneFrameUrl || gpuFrameUi.busy) return;
    const wid = String(sel.id || "");
    const token = gpuFrameToken(sel.sceneFrameUrl);
    if (!wid || !token) return;
    gpuFrameUi.wid = wid;
    gpuFrameUi.busy = true;
    emit();

    apiDelete("/scene-frame-cache/" + encodeURIComponent(token), { parse: true })
      .then((r) => {

        if (!r.ok) {
          gpuFrameUi.busy = false;
          gpuFrameUi.error = weT("清除失败：宿主返回 {status}", { status: r.status });
          emit();
          return;
        }
        gpuFrameUi.error = "";
        markGpuFrameProbed(wid, false);
        forgetGpuFramePin(token);

        if (String(selection.id || "") !== wid) { gpuFrameUi.busy = false; emit(); return; }
        gpuFrameUi.busy = false;
        const variant = Number(selection.frameVariants && selection.frameVariants[wid]) || 0;
        setSetting("url", frameUrlWithVariant(sel.sceneFrameUrl, variant)); syncLayers(); emit();
      })
      .catch(() => {
        gpuFrameUi.busy = false;
        gpuFrameUi.error = weT("清除失败：请求未完成");
        emit();
      });
  };

  const onRecaptureGpuFrame = () => {
    if (sel.type !== "scene" || !sel.sceneFrameUrl || gpuFrameUi.recapturing) return;
    const live = currentLiveFrame();
    if (!live) {
      gpuFrameUi.error = weT("拿不到实时画面（实时渲染没在运行）→ 想抓实时帧请先开「场景实时渲染」");
      emit();
      return;
    }
    gpuFrameUi.recapturing = true;
    gpuFrameUi.error = "";
    emit();

    scheduleLiveFrameBackfill(live, { force: true });
  };
  const onCustomFrameFile = (e) => {
    const file = e.target.files && e.target.files[0];
    try { e.target.value = ""; } catch {   }
    if (!file || sel.type !== "scene" || !sel.id) return;
    const wid = String(sel.id);
    const ctype = (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp")
      ? file.type : "image/png";
    apiFetch("/custom-frame/" + encodeURIComponent(wid), {
      method: "POST",
      headers: { "Content-Type": ctype },
      body: file,
    }).then((r) => {
      if (!r.ok) throw new Error("宿主返回 " + r.status);
      setCustomFrameLocal(wid, true);
      const map = Object.assign({}, selection.frameVariants || {});
      map[wid] = 4;
      selection.frameVariants = map;

      if (String(selection.id || "") !== wid) { persistSelection(); emit(); return; }

      if (sel.sceneFrameUrl) setSetting("url", frameUrlWithVariant(sel.sceneFrameUrl, 4));
      else persistSelection();
      syncLayers(); emit();
    }).catch(() => {   });
  };
  const onClearCustomFrame = () => {
    if (!sel.id) return;
    const wid = String(sel.id);
    apiDelete("/custom-frame/" + encodeURIComponent(wid))
      .then((r) => {
        if (!r.ok) throw new Error("宿主返回 " + r.status);
        setCustomFrameLocal(wid, false);
        const map = Object.assign({}, selection.frameVariants || {});
        const cur = Number(map[wid]) || 0;
        if (cur === 4) map[wid] = 0;
        selection.frameVariants = map;
        if (String(selection.id || "") !== wid) { persistSelection(); emit(); return; }
        if (cur === 4 && sel.sceneFrameUrl) {
          setTransient("url", frameUrlWithVariant(sel.sceneFrameUrl, 0));
          syncLayers();
        }
        persistSelection(); emit();
      }).catch(() => {   });
  };

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && selection.pickerOpen) {
        e.stopPropagation();
        closePicker();
      }
    };
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("keydown", onKey, true);
      return () => { window.removeEventListener("keydown", onKey, true); };
    }
  }, []);

  const [activeTab, setActiveTab] = React.useState(readSavedPickerTab);
  const switchTab = (id) => {
    if (!PICKER_TABS.some((t) => t.id === id) || id === activeTab) return;

    disarmConfirm();

    if (selection.pickerOpen) setTransient("pickerOpen", false);
    setTransient("pickerDraft", false);
    setActiveTab(id);
    try { localStorage.setItem(PICKER_TAB_KEY, id); } catch {   }
  };

  const [pickerFontOpen, setPickerFontOpen] = React.useState(readSavedPickerFontOpen);
  const togglePickerFontSection = () => {
    setPickerFontOpen((prev) => {
      const next = !prev;
      writeSavedPickerFontOpen(next);
      return next;
    });
  };
  const [pickerUiColorOpen, setPickerUiColorOpen] = React.useState(readSavedPickerUiColorOpen);
  const togglePickerUiColorSection = () => {
    setPickerUiColorOpen((prev) => {
      const next = !prev;
      writeSavedPickerUiColorOpen(next);
      return next;
    });
  };

  const usePickerSectionOpen = (key) => {
    const [open, setOpen] = React.useState(() => readSavedPickerOpen(key));
    const toggle = () => setOpen((prev) => {
      const next = !prev;
      writeSavedPickerOpen(key, next);
      return next;
    });
    return [open, toggle];
  };
  const [pickerDetailOpen, togglePickerDetailSection] = usePickerSectionOpen(PICKER_DETAIL_OPEN_KEY);
  const [pickerGlassUiOpen, togglePickerGlassUiSection] = usePickerSectionOpen(PICKER_GLASS_UI_OPEN_KEY);
  const [pickerCornersOpen, togglePickerCornersSection] = usePickerSectionOpen(PICKER_CORNERS_OPEN_KEY);
  const [pickerPresetsOpen, togglePickerPresetsSection] = usePickerSectionOpen(PICKER_PRESETS_OPEN_KEY);

  React.useEffect(() => {
    if (activeTab === "appearance" && pickerFontOpen && sel.fontCustom) ensureSystemFonts(false);
  }, [activeTab, pickerFontOpen, sel.fontCustom]);

  React.useEffect(() => {
    const req = selection.settingsTabRequest;
    if (!req) return;
    if (req === activeTab || !PICKER_TABS.some((t) => t.id === req)) {
      setTransient("settingsTabRequest", "");
      return;
    }
    switchTab(req);
  }, [sel.settingsTabRequest, activeTab]);

  const pickerGridRef = React.useRef(null);
  const pickerRootRef = React.useRef(null);

  const pickerViewTag = sel.pickerOpen
    ? (sel.modalView === "hidden" ? "hidden" : (sel.pickerDraft ? "draft" : "normal"))
    : "closed";
  const pickerVwin = qpVirtWindow(pickerGridRef, (sel.inventory.wallpapers || []).length + 1,
    PICKER_CARD_H, PICKER_CARD_GAP, true, pickerViewTag);

  if (!sel.loaded) {
    return React.createElement("div", { className: "we-picker" },
      React.createElement("span", { className: "we-picker__hint" }, weT("扫描 Wallpaper Engine…")));
  }
  if (sel.inventory.error) {
    return React.createElement("div", { className: "we-picker" },
      React.createElement("div", { className: "we-picker__error" },
        weT("未检测到 Wallpaper Engine：{error}", { error: weT(sel.inventory.error) })),
      React.createElement("button", {
        className: "we-picker__btn", type: "button", onClick: onRefresh, disabled: sel.loading,
      }, sel.loading ? weT("刷新中…") : weT("重试")));
  }

  const list = sel.inventory.wallpapers;

  const {
    query, playableList, basePlayable, ratingCounts, typeCounts, hiddenList,
    editorPageView,
  } = pickerModel({
    wallpapers: list,
    hiddenIds: selection.hiddenIds,
    search: sel.search,
    ratingFilter: sel.contentRatingFilter,
    typeFilter: sel.typeFilter,
    editorPage: sel.editorPage,
  });

  const cdMode = sel.pickerLayout === "classic";
  const current = list.find((w) => w.id === sel.id) || null;
  const uploadedList = list.filter((w) => isUploadedWallpaper(w) && !isDirWallpaper(w));
  const groups = sel.rotationGroups;
  const group = activeRotationGroup();
  const candidates = rotationCandidates();
  const playableCount = candidates.length;
  const editing = sel.editing;

  const extensionCtx = () => ({
    sel: selection,
    onAvatarEnabled, onAvatarSize, onAvatarRadius, onAvatarPick, onAvatarClear,

    onAvatarCropZoom, onAvatarCropDrag, onAvatarCropConfirm, onAvatarCropCancel: closeAvatarCrop,
    avatarCropGeo: avatarCropGeometry(), avatarCropView: AVATAR_CROP_VIEW,

    onAvatarAutoCompress,

    onResetModule,
  });
  const renderActiveTab = () => {
    if (activeTab === "extensions") return renderExtensionsTab(extensionCtx());
    if (activeTab === "appearance") return renderAppearanceTab({
      setSetting, setTransient,
      fontSet: fontSetCtx(),
      glassPresets: glassPresetCtx(),

      fontOpen: pickerFontOpen, onToggleFontSection: togglePickerFontSection,

      uiColorOpen: pickerUiColorOpen, onToggleUiColorSection: togglePickerUiColorSection,
      onToggleUiColorCustom, onUiColorElement,
      officialColorOf, onAccent, onCapsuleBlur, onCapsuleColor, onBlur, onBorder, onCaretColor, onBillingEnabled, onChatGlassFidelity, onChatLayout, onComponentFamily, onComponentFont, onExtraGlassSelectors, onFontAdvanced, onFontResetAll, onGlassAlpha, onGlassColor, onGlassDarkSeparate, onGlassFidelity, onGlobalFamily, onLeftSidebarGlass, onTitlebarGlass, onRefreshSystemFonts, onSidebarAllCorners, onSidebarAlpha, onSidebarBlur, onSidebarColor, onSidebarContentAlpha, onSidebarContentColor, onSidebarCornerRadius, onSidebarCornerSquare, onSidebarFollowGlobal, onSidebarGlass, onSidebarFullClear, onThemeColor, onThemeColorClear, onThemeDarkSeparate, onThemeFamily, onThemeSize, onThemeTypeOnly, onThemeWeight, onThinkingMode, onToggleFontCustom, onToggleThemeFollow, sel,

      onToggleChildIndependent, onGlassChildParam, childIndependentOn,

      detailOpen: pickerDetailOpen, onToggleDetailSection: togglePickerDetailSection,
      glassUiOpen: pickerGlassUiOpen, onToggleGlassUiSection: togglePickerGlassUiSection,
      cornersOpen: pickerCornersOpen, onToggleCornersSection: togglePickerCornersSection,

      onResetModule,
      presetsOpen: pickerPresetsOpen, onTogglePresetsSection: togglePickerPresetsSection,
    });
    if (activeTab === "playback") return React.createElement(React.Fragment, null,
      renderEffectsTab({
        setSetting, setTransient,
        onBackgroundBrightness, onBackgroundContrast, onBackgroundSaturate, onClearCustomFrame, onClearGpuFrame, onCustomFrameFile, onFlip, onFpsCap, onLayerPositionX, onLayerPositionY, onLayerReset, onLayerScale, onLiveBootDelay, onObjectFit, onOpenPicker, onPlaybackRate, onRecaptureGpuFrame, onRefreshFrame, onSceneLiveFps, onScrim, onToggleSceneLive, onWallpaperBlur, onWallpaperOpacity, sel, setPickerOpener,
      }),
      renderAudioTab({
        setSetting, setTransient,
        onToggleAudio, onVideoVolume, sel,
      }),
    );
    if (activeTab === "system") return React.createElement(React.Fragment, null,

      renderGreetingSection({ onGreetingOn, onGreetingPath, onCoverOnStartup, sel }),
      renderSessionLayoutSection({ onChatLayout, sel }),
      renderBillingSection({ onBillingEnabled, sel }),
      renderAdvancedTab({
        setSetting, setTransient,
        onAdapterTarget, onEdgeCompatChange, onLayoutChange, onPauseOnBattery, onPauseOnBlur, onPauseOnHidden, sel,
        onStartEditCacheDir, onCancelEditCacheDir, onCacheDirDraft,
        onCacheDirBrowseInput, onCacheDirBrowseGo, onCacheDirBrowseEnter, onCacheDirBrowseUp, onPickCacheDir, onCloseCacheDirBrowse,
      }),
    );
    return renderWallpaperTab({
      setSetting, setTransient,
      INTERVALS, armedConfirm: sel.armedConfirm, cdMode, current, editing, editorPageView, group, groups, isLiveScene, onArmConfirm: armConfirm, onArmDeleteGroup, onCancelEditUploadDir, onCancelEditWeAssetsDir, onClear, onDeleteGroup, onDisarmConfirm: disarmConfirm, onEditInterval, onEditName, onEditOrder, onGroupChange, onGroupInterval, onOpenPicker, onOpenPickerDraft, onRefresh, onStartEditUploadDir, onStartEditWeAssetsDir, onSwitchTransition, onSwitchTransitionDir, onSwitchTransitionSpeed, onToggleAudio, onTogglePlay, onTogglePropsPanel, onToggleRotation, onUploadDirDraft, onWeAssetsDirDraft, pagerRow, playableCount, playableList, playbackLive, propsPanelOpen, renderUserPropsPanel, sel, setPickerOpener, uploadedList,
    });
  };
  const tabIdx = Math.max(0, PICKER_TABS.findIndex((t) => t.id === activeTab));

  return React.createElement("div", { className: "we-picker", "data-we-cards": sel.pickerLayout, ref: pickerRootRef },

    React.createElement("div", { className: "we-picker__card-head" },
      React.createElement("span", { className: "we-picker__card-name" }, weT("壁纸引擎")),
      React.createElement("span", { className: "we-picker__card-badge" }, String(playableList.length)),
      React.createElement("span", { className: "we-picker__card-desc" }, weT("本地 Wallpaper Engine 壁纸 · 液态玻璃主题")),
    ),

    React.createElement("div", { className: "we-tabs", role: "tablist", "aria-label": weT("壁纸引擎设置分区") },
      React.createElement("span", {
        className: "we-tabs__pill",
        "aria-hidden": "true",
        style: {
          width: "calc((100% - 6px) / " + PICKER_TABS.length + ")",
          transform: "translateX(" + tabIdx * 100 + "%)",
        },
      }),
      PICKER_TABS.map((t) => React.createElement("button", {
        key: t.id,
        type: "button",
        role: "tab",
        "aria-selected": activeTab === t.id ? "true" : "false",
        className: "we-tabs__tab" + (activeTab === t.id ? " we-tabs__tab--active" : ""),
        onClick: () => switchTab(t.id),
      }, t.label)),
    ),
    React.createElement("div", { className: "we-tabpanel", role: "tabpanel" },

      sel.pickerOpen ? renderPickerModal({
        sel, closePicker, current, playbackLive, playableList, hiddenList,
        cdMode, query, basePlayable, ratingCounts, typeCounts,
        gridRef: pickerGridRef, vwin: pickerVwin,
        armedConfirm: sel.armedConfirm, onArmConfirm: armConfirm, onDisarmConfirm: disarmConfirm,
        onClear, onRatingFilterChange, onTypeFilterChange,
        onShowNormalView, onShowHiddenView,
        onToggleBatchMode, onArmBatchHide, onBatchHide, onBatchCancel, onSearchInput, onPickCard,
      }) : React.createElement(React.Fragment, null,

        renderActiveTab(),
        renderTabReset({
          armedConfirm: sel.armedConfirm, onArmConfirm: armConfirm,
          onDisarmConfirm: disarmConfirm, onResetTab,
        }, activeTab),
        activeTab === "system"
          ? renderResetSection({
              armedConfirm: sel.armedConfirm, onArmConfirm: armConfirm,
              onDisarmConfirm: disarmConfirm, onResetAll,
            })
          : null,
      )),
  );
}

function WallpaperPickerSection() {

  useWeLocale();
  return React.createElement("ul", { className: "we-picker__section-list" },
    React.createElement("li", { className: "we-picker__card-shell" },
      React.createElement(WallpaperPicker, null),
    ),
  );
}




const CHAT_LAYOUT_CSS = `
/* Spread mode (body[data-we-chat-layout="spread"]): the default "center" mode emits no rule. */
/* Conversation column: drop the width cap and centering. :has first; .icaHSq_column as fallback. */
body[data-we-chat-layout="spread"] *:has(> [data-slot="conversation.chat.flow"]),
body[data-we-chat-layout="spread"] .icaHSq_column { max-width: none !important; margin-left: 0 !important; margin-right: 0 !important; }
/* Assistant replies: left-aligned bubble (user messages keep the native right-side userRow). Node kind is assistant-step. */
body[data-we-chat-layout="spread"] [data-chat-flow-kind="assistant"],
body[data-we-chat-layout="spread"] [data-chat-flow-kind="assistant-step"] {
  background: var(--dsw-specific-bubble, rgba(127, 127, 127, 0.12));
  border-radius: var(--dsw-radius-xl, 14px);
  padding: 12px 16px;
  width: fit-content;
  max-width: 100%;
  margin-right: auto;
}
/* Bottom composer: DSH already pins it absolute to the bottom; width follows the mode.
   Spread = full available width; center = narrow column comparable to the message column. */
body[data-we-chat-layout="spread"] *:has(> [data-composer-card]) { width: 100% !important; max-width: 100% !important; }
body[data-we-chat-layout="spread"] [data-composer-card] {
  /* 20px on each side, aligned with the left edge; auto keeps it off a single edge. */
  max-width: calc(100% - 40px) !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
/* No horizontal scrolling: one extra pixel of width would start a horizontal scroll and clip glyphs. */
body[data-we-chat-layout="spread"] [data-conversation-scroll] { overflow-x: hidden !important; }
body[data-we-chat-layout="center"] *:has(> [data-composer-card]) { width: 100% !important; max-width: 100% !important; }
body[data-we-chat-layout="center"] [data-composer-card] { max-width: min(780px, calc(100% - 48px)) !important; margin-left: auto !important; margin-right: auto !important; }
/* Approval / upgrade cards hard-code max-width: var(--dsh-chat-content-width); widen them in spread mode.
   The card has no stable attribute, so look through its body (data-approval-scroll) to the parent. */
body[data-we-chat-layout="spread"] *:has(> [data-approval-scroll]) { max-width: none !important; }
`;

const TAG_ID = "dsh-wallpaper-engine/styles-v3";

const CSS_GEN = Date.now() + ":" + Math.random().toString(36).slice(2);

function ensurePluginCss() {
  if (typeof document === "undefined") return null;
  let tag = document.querySelector("style[data-plugin-css=" + JSON.stringify(TAG_ID) + "]");
  if (tag === null) {
    tag = document.createElement("style");
    tag.dataset.plugin = "dsh-wallpaper-engine";
    tag.dataset.pluginCss = TAG_ID;
    document.head.appendChild(tag);
  }

  const full = CSS + CHAT_LAYOUT_CSS;
  if (tag.textContent !== full) tag.textContent = full;
  tag.dataset.pluginCssGen = CSS_GEN;
  return tag;
}
ensurePluginCss();

const inject = ["slots"];

const MICA_MIN_BUILD = 22621;
let micaSupport;
function detectMicaSupport() {
  if (micaSupport !== undefined) return micaSupport;
  micaSupport = null;
  try {
    let marker = null;
    if (typeof location !== "undefined" && location && typeof location.search === "string") {
      marker = new URLSearchParams(location.search).get("dsh-desktop-mica");
    }
    if (marker === "1") {
      micaSupport = true;
    } else if (marker === "0") {
      micaSupport = false;
    } else {
      const ua = (typeof navigator !== "undefined" && navigator && navigator.userAgent) || "";
      if (/Windows/i.test(ua)) {
        const build = /Windows NT 10\.0\.(\d+)/.exec(ua);
        micaSupport = !!build && Number(build[1]) >= MICA_MIN_BUILD;
      }
    }
  } catch {   }
  return micaSupport;
}

const GLASS_SATURATE = 1.3;
let legacySaturateCoupling;
function useLegacySaturateCoupling() {
  if (legacySaturateCoupling !== undefined) return legacySaturateCoupling;
  legacySaturateCoupling = false;
  try {
    if (typeof location !== "undefined" && location && typeof location.search === "string") {
      let raw = "";
      if (typeof URLSearchParams === "function") {
        raw = new URLSearchParams(location.search).get("we-saturate") || "";
      } else {
        const m = /[?&]we-saturate=([^&]*)/.exec(location.search);
        raw = m ? decodeURIComponent(m[1]) : "";
      }
      legacySaturateCoupling = String(raw).toLowerCase() === "legacy";
    }
  } catch {   }
  return legacySaturateCoupling;
}

const SOFT_RENDER_RE = /swiftshader|software|llvmpipe|softpipe|microsoft basic render|angle \(software|stack-gl/i;
let softRenderFallback;
function detectSoftwareRender() {
  if (softRenderFallback !== undefined) return softRenderFallback;
  softRenderFallback = false;
  try {

    if (typeof location !== "undefined" && location && typeof location.search === "string") {
      let raw = "";
      if (typeof URLSearchParams === "function") {
        raw = new URLSearchParams(location.search).get("we-glassfallback") || "";
      } else {
        const m = /[?&]we-glassfallback=([^&]*)/.exec(location.search);
        raw = m ? decodeURIComponent(m[1]) : "";
      }
      const flag = String(raw).toLowerCase();
      if (flag === "on" || flag === "1") return (softRenderFallback = true);
      if (flag === "off" || flag === "0") return (softRenderFallback = false);
    }
    if (typeof document === "undefined" || !document
        || typeof document.createElement !== "function") return softRenderFallback;
    const canvas = document.createElement("canvas");
    if (!canvas || typeof canvas.getContext !== "function") return (softRenderFallback = true);
    let gl = null;
    try { gl = canvas.getContext("webgl"); } catch {   }
    if (!gl) { try { gl = canvas.getContext("experimental-webgl"); } catch {   } }

    if (!gl) return (softRenderFallback = true);
    let renderer = "";
    let vendor = "";
    try {
      const dbg = typeof gl.getExtension === "function" && gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg && typeof gl.getParameter === "function") {
        renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "";
        vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || "";
      }

      if (!renderer && typeof gl.getParameter === "function" && gl.RENDERER !== undefined) {
        renderer = gl.getParameter(gl.RENDERER) || "";
      }

      if (!vendor && typeof gl.getParameter === "function" && gl.VENDOR !== undefined) {
        vendor = gl.getParameter(gl.VENDOR) || "";
      }
    } catch {   }
    softRenderFallback = SOFT_RENDER_RE.test(String(renderer) + " " + String(vendor));

    try {
      const lose = typeof gl.getExtension === "function" && gl.getExtension("WEBGL_lose_context");
      if (lose && typeof lose.loseContext === "function") lose.loseContext();
    } catch {   }
  } catch {   }
  return softRenderFallback;
}

const GREETING_FLAG = 'we-startup-greeting-v1';

function mountStartupGreeting() {
  try {
    return mountStartupGreetingInner();
  } catch {

    return undefined;
  }
}

function mountStartupGreetingInner() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (selection.greetingOn === false) return;
  try {
    if (window.sessionStorage.getItem(GREETING_FLAG) === '1') return;
    window.sessionStorage.setItem(GREETING_FLAG, '1');
  } catch {   }

  const video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.autoplay = true;
  video.preload = 'auto';
  video.volume = 0.9;
  video.src = apiUrl('/greeting.mp4');
  video.style.cssText = [
    'position:fixed', 'inset:0', 'width:100vw', 'height:100vh',
    'object-fit:cover', 'background:#000', 'z-index:2147483647',

    'opacity:1', 'transition:opacity .35s ease', 'outline:none', 'border:0',
  ].join(';');

  let closed = false;
  const onKey = (ev) => { if (ev.key === 'Escape') close(); };
  const cleanup = () => {
    if (closed) return;
    closed = true;
    try { video.pause(); } catch {   }
    try { video.removeAttribute('src'); video.load(); } catch {   }
    try { video.remove(); } catch {   }
    try { window.removeEventListener('keydown', onKey); } catch {   }
  };
  const close = () => {
    if (closed) return;
    video.style.opacity = '0';
    setTimeout(cleanup, 360);
  };

  video.addEventListener('ended', close, { once: true });
  video.addEventListener('error', close, { once: true });
  video.addEventListener('click', close);

  video.addEventListener('playing', () => reportStartup("greeting"), { once: true });
  window.addEventListener('keydown', onKey);

  const tryPlay = () => {
    const p = video.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {

        video.muted = true;
        const q = video.play();
        if (q && typeof q.catch === 'function') q.catch(close);
        window.addEventListener('pointerdown', () => { try { video.muted = false; } catch {   } }, { once: true });
      });
    }
  };
  const mount = () => {
    try {
      if (!document.body) { setTimeout(mount, 50); return; }
      document.body.appendChild(video);
      tryPlay();
    } catch { cleanup(); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();

  return cleanup;
}

function reportStartup(phase) {
  try {
    if (typeof performance === "undefined") return;
    const origin = Math.round(performance.timeOrigin || (Date.now() - performance.now()));
    const params = new URLSearchParams({
      phase,
      timeOrigin: String(origin),
      at: String(Math.round(origin + performance.now())),
    });
    const nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
    if (nav) {
      if (nav.domContentLoadedEventEnd) params.set("dcl", String(Math.round(origin + nav.domContentLoadedEventEnd)));
      if (nav.loadEventEnd) params.set("load", String(Math.round(origin + nav.loadEventEnd)));
    }
    const fcp = performance.getEntriesByName && performance.getEntriesByName("first-contentful-paint")[0];
    if (fcp) params.set("fcp", String(Math.round(origin + fcp.startTime)));
    apiFetch("/startup-timing?" + params.toString()).catch(() => {   });
  } catch {   }
}

function apply(ctx) {

  if (ctx.effect) ctx.effect(() => weI18nAttach(ctx) || undefined);

  if (ctx.effect) ctx.effect(() => mountStartupGreeting());

  reportStartup("ready");

  if (ctx.effect) {
    ctx.effect(() => {
      const unsub = subscribe(syncLayers);
      const unsubEffects = subscribe(applyEffects);

      const unsubAvatar = subscribe(syncAvatarLayer);

      try { reapplyAll(); } catch {   }

      const onOcclusionChange = () => emit();
      const ocListeners = [];
      if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        for (const t of ["visibilitychange", "blur", "focus"]) {
          window.addEventListener(t, onOcclusionChange);
          ocListeners.push(t);
        }
      }

      const onWarmPointerDown = (ev) => { try { warmVideoForPointer(ev, true); } catch {   } };
      const onWarmPointerOver = (ev) => { try { warmVideoForPointer(ev, false); } catch {   } };
      let warmBound = false;
      if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
        document.addEventListener("pointerdown", onWarmPointerDown, { capture: true, passive: true });
        document.addEventListener("pointerover", onWarmPointerOver, { capture: true, passive: true });
        warmBound = true;
      }

      const onBackVisible = () => {
        if (typeof document !== "undefined" && document.hidden) return;
        try { nudgeWallpaperRepaint(); } catch {   }
        try { probeWallpaperOnScreen("back-visible"); } catch {   }
      };
      let backVisBound = false, pageShowBound = false;
      if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
        document.addEventListener("visibilitychange", onBackVisible);
        backVisBound = true;
      }
      if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener("pageshow", onBackVisible);
        pageShowBound = true;
      }

      const onClientError = (ev) => {
        try {
          const err = ev && (ev.error || ev.reason);
          const type = (ev && ev.type) ? ev.type : "error";
          const msg = String((err && err.message) || (ev && ev.message) || err || ev || "").slice(0, 240);
          const where = (err && err.stack) ? " @ " + String(err.stack).split("\n").slice(0, 3).join(" <- ") : "";
          liveLog("client-error", type + ": " + msg + where);
        } catch {   }
      };
      if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener("error", onClientError);
        window.addEventListener("unhandledrejection", onClientError);
      }

      let lastOcclusion = occlusionReason();
      let ocWatch = 0;
      if (typeof setInterval === "function") {
        ocWatch = setInterval(() => {
          const now = occlusionReason();
          if (now === lastOcclusion) return;
          lastOcclusion = now;

          try { liveLog("play-state", liveStateBrief("occlusion-recheck")); } catch {   }
          emit();
        }, OCCLUSION_RECHECK_MS);
      }

      let pageHideBound = false, visBound = false;
      let fontPageHideBound = false, fontVisBound = false;
      if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener("pagehide", onPageHideFlush);
        pageHideBound = true;
        window.addEventListener("pagehide", onPageHideFlushFontSet);
        fontPageHideBound = true;
      }
      if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
        document.addEventListener("visibilitychange", onVisibilityResyncPersist);
        visBound = true;
        document.addEventListener("visibilitychange", onVisibilityResyncFontSet);
        fontVisBound = true;
      }

      ensurePluginCss();

      let batteryCleanup = null;
      let disposed = false;
      if (typeof navigator !== "undefined" && typeof navigator.getBattery === "function") {
        navigator.getBattery().then((bm) => {

          if (disposed) return;
          weBattery = bm;
          bm.addEventListener("chargingchange", onOcclusionChange);
          batteryCleanup = () => bm.removeEventListener("chargingchange", onOcclusionChange);
          emit();
        }).catch(() => {   });
      }
      syncLayers();
      applyEffects();
      syncAvatarLayer();
      return () => {
        disposed = true;
        unsub();
        unsubEffects();
        unsubAvatar();
        if (ocWatch) { try { clearInterval(ocWatch); } catch {   } ocWatch = 0; }
        if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
          for (const t of ocListeners) window.removeEventListener(t, onOcclusionChange);
          if (pageShowBound) window.removeEventListener("pageshow", onBackVisible);
          window.removeEventListener("error", onClientError);
          window.removeEventListener("unhandledrejection", onClientError);
          if (pageHideBound) window.removeEventListener("pagehide", onPageHideFlush);
          if (fontPageHideBound) window.removeEventListener("pagehide", onPageHideFlushFontSet);
        }
        if (backVisBound && typeof document !== "undefined" && typeof document.removeEventListener === "function") {
          document.removeEventListener("visibilitychange", onBackVisible);
        }
        if (warmBound && typeof document !== "undefined" && typeof document.removeEventListener === "function") {
          document.removeEventListener("pointerdown", onWarmPointerDown, { capture: true });
          document.removeEventListener("pointerover", onWarmPointerOver, { capture: true });
        }
        if (visBound && typeof document !== "undefined" && typeof document.removeEventListener === "function") {
          document.removeEventListener("visibilitychange", onVisibilityResyncPersist);
        }
        if (fontVisBound && typeof document !== "undefined" && typeof document.removeEventListener === "function") {
          document.removeEventListener("visibilitychange", onVisibilityResyncFontSet);
        }
        if (batteryCleanup) { batteryCleanup(); batteryCleanup = null; }
        weBattery = null;
        clearRotationTimer();

        cancelRotationPrepare();
        disposePreparedMedia();

        disposeWarmVideo();

        disposeAvatarLayer();

        rotationAudioGate = null;
        retireFadingLayer();
        stopSceneAudioEl();
        cancelLiveFrameBackfill();
        stopLiveWatch();
        cancelLiveMount("unload");
        abortTranscodeUpgrade();
        cancelPendingPersist();
        cancelPendingFontSet();

        abortMediaInfoProbe();

        if (sceneVideoResyncTimer && typeof window !== "undefined" && typeof window.clearTimeout === "function") {
          window.clearTimeout(sceneVideoResyncTimer);
        }
        sceneVideoResyncTimer = null;
        weStopDraw();
        const node = document.getElementById(LAYER_ID);
        if (node) { releaseLayerMedia(node); node.remove(); }
        const scrim = document.getElementById(SCRIM_ID);
        if (scrim) scrim.remove();
        clearEffects();
        setWallpaperActive(false);

        if (typeof document !== "undefined" && typeof document.querySelector === "function") {
          const cssTag = document.querySelector("style[data-plugin-css=" + JSON.stringify(TAG_ID) + "]");
          if (cssTag && cssTag.dataset && cssTag.dataset.pluginCssGen === CSS_GEN
              && typeof cssTag.remove === "function") cssTag.remove();
        }
      };
    });
  }

  if (ctx.effect && typeof ctx.get === "function" && typeof document !== "undefined") {
    ctx.effect(() => {
      let layer = null;

      let typeLayer = null;
      let unsub = null;
      const cancelPoll = pollThemeService(ctx, {
        intervalMs: 250,
        timeoutMs: 6000,
        onReady: (theme) => { themeFollowAttach(theme, ctx);
          try {
            const available = scanThemeTokens(document);

            const hasToken = (t) => available.has(t)
              || (typeof getComputedStyle === "function"
                && getComputedStyle(document.body).getPropertyValue(t).trim() !== "");
            layer = createThemeLayer({
              theme,

              getColors: () => (selection.fontCustom ? (selection.themeColors || {}) : {}),
              isAvailable: hasToken,
              onBeforeFirstWrite: () => { try { snapshotHostFontDefaults(); } catch {   } },
            });
            typeLayer = createThemeLayer({
              theme,
              source: THEME_TYPE_SOURCE,

              onBeforeFirstWrite: () => { try { snapshotHostFontDefaults(); } catch {   } },
              buildPayload: () => buildTypePayload(
                selection.fontCustom ? (selection.themeSize || {}) : {},
                hasToken,
                selection.fontCustom ? (selection.themeWeight || {}) : {},
                selection.fontCustom ? (selection.themeFamily || {}) : {},
                fontFamilyStack,
                selection.fontCustom ? (selection.globalFamily || "") : ""),
            });
            layer.sync();
            typeLayer.sync();

            unsub = subscribe(() => {
              try { if (layer) layer.sync(); if (typeLayer) typeLayer.sync(); } catch {   }
            });
          } catch {   }
        },
      });
      return () => {
        try { if (unsub) unsub(); } catch {   }
        try { if (cancelPoll) cancelPoll(); } catch {   }

        try { if (layer) layer.dispose(); } catch {   }
        try { if (typeLayer) typeLayer.dispose(); } catch {   }
      };
    });
  }

  if (ctx.slots) {
    ctx.slots.inject("settings.section", () =>
      ctx.slots.register(
        { name: "settings.section", id: "wallpaper-engine", order: 500, label: () => weT("壁纸引擎") },
        () => React.createElement(WallpaperPickerSection),
      ),
    );

    ctx.slots.inject("sidebar.footer.action", () =>
      ctx.slots.register(
        { name: "sidebar.footer.action", id: "wallpaper-billing", order: 20 },
        () => React.createElement(BillingSidebarFooter),
      ),
    );
    ctx.slots.inject("conversation.chat.turnTail", () =>
      ctx.slots.register(
        { name: "conversation.chat.turnTail", id: "wallpaper-billing-turn", order: 20, inject: () => ({}) },
        (props) => React.createElement(BillingTurnTail, props),
      ),
    );

  }

  if (ctx.effect && typeof document !== "undefined") {
    ctx.effect(() => installWeNavIcon() || undefined);
  }

  if (ctx.effect && typeof document !== "undefined") {
    ctx.effect(() => installSidebarRight(ctx) || undefined);
  }

  if (ctx.effect && typeof document !== "undefined") {
    ctx.effect(() => installWallSidebarShortcut(ctx) || undefined);
  }

  if (ctx.effect && typeof document !== "undefined") {
    ctx.effect(() => installLiveDiagnostics() || undefined);
    ctx.effect(() => installLiveBootRestore() || undefined);
    ctx.effect(() => installRotationResumeListeners() || undefined);
    ctx.effect(() => installFocusHandback() || undefined);
  }

  if (ctx.effect && typeof document !== "undefined") {
    ctx.effect(() => installSkinInterop() || undefined);
  }

  loadPersisted().then(loadFontSet).then(loadInventory).then(loadGlassPresets).catch((err) => {
    try { reportClientDiag("boot-chain-failed", String((err && err.message) || err)); } catch {   }
  });
}

exports.apply = apply;
exports.inject = inject;
return module.exports;

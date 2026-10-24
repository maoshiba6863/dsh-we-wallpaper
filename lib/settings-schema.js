const RATING_VALUES = ['all', 'everyone', 'pg13', 'mature', 'unrated'];
const TYPE_VALUES = ['all', 'video', 'web', 'image', 'scene'];
const OBJECT_FIT_VALUES = ['cover', 'contain', 'center', 'fill'];
const PICKER_LAYOUT_VALUES = ['classic', 'fixed'];
const CHAT_LAYOUT_VALUES = ['center', 'spread'];
const SIDEBAR_CORNER_RADIUS_VALUES = ['native', '6', '12', '20'];
const FONT_FAMILY_VALUES = ['inherit', 'Microsoft YaHei', 'KaiTi', 'SimSun', 'SimHei', 'STXingkai', 'monospace'];
const SYSTEM_FONT_KEY_PREFIX = 'sys:';
const SYSTEM_FONT_NAME_MAX = 64;
const SYSTEM_FONT_NAME_RE = new RegExp('^[^;{}<>"\'\\\\\\u0000-\\u001f\\u007f]{1,' + SYSTEM_FONT_NAME_MAX + '}$');
const FAMILY_STACK_MAX = 80;
const FAMILY_UNSAFE_RE = /[;{}<>"'\\\u0000-\u001f\u007f]/g;
function systemFontKeyOf(name) {
  const s = typeof name === 'string' ? name.trim() : '';
  if (!s) return '';
  if (isSystemFontKey(s)) return s;
  return SYSTEM_FONT_NAME_RE.test(s) ? SYSTEM_FONT_KEY_PREFIX + s : '';
}
function isSystemFontKey(v) {
  return typeof v === 'string'
    && v.startsWith(SYSTEM_FONT_KEY_PREFIX)
    && SYSTEM_FONT_NAME_RE.test(v.slice(SYSTEM_FONT_KEY_PREFIX.length));
}
function systemFontNameOf(key) {
  return isSystemFontKey(key) ? key.slice(SYSTEM_FONT_KEY_PREFIX.length) : '';
}
function sanitizeFamilyKey(v) {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (!s) return '';
  if (s.startsWith(SYSTEM_FONT_KEY_PREFIX)) return isSystemFontKey(s) ? s : '';
  return FONT_FAMILY_VALUES.includes(s) ? s : '';
}
function sanitizeFamilyValue(v) {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (!s) return '';
  if (s.startsWith(SYSTEM_FONT_KEY_PREFIX)) return isSystemFontKey(s) ? s : '';
  return s.replace(FAMILY_UNSAFE_RE, '').trim().slice(0, FAMILY_STACK_MAX);
}
const EXTRA_GLASS_SELECTOR_MAX = 120;
const EXTRA_GLASS_SELECTOR_COUNT = 8;
const EXTRA_GLASS_SELECTORS_MAX = EXTRA_GLASS_SELECTOR_COUNT * EXTRA_GLASS_SELECTOR_MAX
  + 2 * (EXTRA_GLASS_SELECTOR_COUNT - 1);
const EXTRA_GLASS_SELECTOR_RE = new RegExp('^[A-Za-z0-9\\s.#_:*>()\\[\\]=+~|\\-]{1,'
  + EXTRA_GLASS_SELECTOR_MAX + '}$');
function sanitizeExtraGlassSelectors(v) {
  if (typeof v !== 'string') return '';
  const parts = [];
  for (const raw of v.split(/[,\n]/)) {
    const s = raw.trim();
    if (!s || s.length > EXTRA_GLASS_SELECTOR_MAX) continue;
    if (!EXTRA_GLASS_SELECTOR_RE.test(s)) continue;
    if (parts.includes(s)) continue;
    parts.push(s);
    if (parts.length >= EXTRA_GLASS_SELECTOR_COUNT) break;
  }
  const joined = parts.join(', ');
  return joined.length > EXTRA_GLASS_SELECTORS_MAX ? '' : joined;
}
const FPS_CAP_VALUES = [0, 60, 30];
const SCENE_LIVE_FPS_VALUES = [15, 30, 60];
const SWITCH_TRANSITION_VALUES = ['cut', 'fade', 'push', 'wipe', 'iris', 'zoom', 'bars'];
const SWITCH_DIRS = ['left', 'right', 'up', 'down'];
const SWITCH_SPEED_VALUES = ['fast', 'normal', 'slow'];
const ADAPTER_TARGET_VALUES = ['auto', 'browser', 'desktop-community', 'desktop-official'];
const AVATAR_SIZE_MIN = 24, AVATAR_SIZE_MAX = 72;
const AVATAR_RADIUS_MIN = 0, AVATAR_RADIUS_MAX = 100;
const AVATAR_FILE_RE = /^(user|ai)-[a-z0-9]{4,16}\.(png|jpg|webp)$/;
const GLASS_COLOR_DEFAULT = '#ffffff';
const GLASS_COLOR_DEFAULTS = { light: GLASS_COLOR_DEFAULT, dark: GLASS_COLOR_DEFAULT };
const GLASS_CHILDREN = [
  {
    id: 'settingsWindow', label: '设置窗口玻璃',
    hint: '整个设置窗口（含全部原生分区）',
    params: { transparency: 100, blur: 60 },
  },
  {
    id: 'conversation', label: '对话框玻璃',
    hint: '输入卡片 / 消息气泡 / 工具弹卡',
    params: { color: 0, fidelity: 100 },
    keyOverrides: { fidelity: 'chatGlassFidelity' },
  },
  {
    id: 'thinkingTrigger', label: '思考触发条玻璃',
    hint: '对话里「思考过程」那一行的入口条',
    master: 'thinkingGlass',
    params: { transparency: 100, blur: 60 },
  },
  {
    id: 'floaters', label: '浮层玻璃',
    hint: '插件自己的更新提示 / 壁纸仓库抽屉',
    params: { transparency: 100, blur: 60 },
  },
  {
    id: 'leftSidebar', label: '左侧栏玻璃',
    hint: '宿主原生左栏（会话列表 / 工作区那一列）',
    panelOff: true,
    params: { transparency: 100, blur: 60 },
  },
  {
    id: 'titlebar', label: '标题栏玻璃',
    hint: '桌面壳顶栏（拖拽区 / 窗口按钮那一行）',
    panelOff: true,
    params: { transparency: 100, blur: 60 },
  },
];
const GLASS_CHILD_BY_ID = Object.fromEntries(GLASS_CHILDREN.map((c) => [c.id, c]));
const childGlassKey = (id, param) => {
  const ov = GLASS_CHILD_BY_ID[id] && GLASS_CHILD_BY_ID[id].keyOverrides;
  if (ov && ov[param]) return ov[param];
  return id + param.charAt(0).toUpperCase() + param.slice(1);
};
const PROFILE_PRESET_SCHEMA_TAG = 'dsh-we/profile-preset@1';
const GLASS_PRESET_TOMBSTONE_TAG = 'dsh-we/glass-preset-tombstone@1';
const PRESET_ASSET_KEYS = [
  'themeColors',
  'themeDarkSeparate',
  'themeSize',
  'themeWeight',
  'themeFamily',
  'globalFamily',
  'componentFonts',
  'avatarUserImage',
  'avatarAiImage',
];
const UI_COLOR_KEYS = [
  'uiColorSend',
  'uiColorLink',
  'uiColorFileIcon',
  'uiColorTab',
  'uiColorDeepDiving',
];
const PRESET_EXCLUDED_KEYS = [
  'id',
  'hiddenIds',
  'rotationGroups',
  'rotationGroupId',
  'rotationSeeded',
  'userProps',
  'sceneLiveFailures',
  'skinYieldRestoreId',
  'skinYieldRestoreRotation',
  'settingsVersion',
];
const isGlassPresetId = isFontSetId;
const GLASS_MODE_DEFAULTS = Object.fromEntries([
  ['sidebar', 'inherit'], ['sidebarContent', 'inherit'],
  ...GLASS_CHILDREN.filter((c) => !c.panelOff).map((c) => [c.id, 'inherit']),
]);
const SETTINGS_VERSION = 6;
const DEFAULTS = {
  scrim: 0.25,
  border: 0.35,
  blur: 16,
  wallpaperBlur: 0,
  backgroundBrightness: 100,
  backgroundContrast: 100,
  backgroundSaturate: 100,
  wallpaperOpacity: 0,
  rotationEnabled: false,
  rotationInterval: 30,
  switchTransition: "cut",
  switchTransitionDir: "left",
  switchTransitionSpeed: "normal",
  chatLayout: "center",
  rotationGroupId: "",
  rotationGroups: [],
  rotationSeeded: false,
  hiddenIds: [],
  playbackRate: 1,
  fpsCap: 0,
  sceneFrameUrl: null,
  sceneLive: true,
  sceneLiveFps: 30,
  liveBootDelay: 3,
  audioSource: "auto",
  mediaIntegration: true,
  adapterTarget: 'auto',
  mediaLyricsOnline: true,
  userProps: {},
  pauseOnHidden: true,
  pauseOnBlur: false,
  pauseOnBattery: false,
  flip: false,
  objectFit: "cover",
  contentRatingFilter: "everyone",
  typeFilter: "all",
  pickerLayout: "fixed",
  edgeCompat: true,
  billingEnabled: true,
  billingFlip: true,
  billingFlipX: true,
  billingFlipY: true,
  greetingOn: true,
  greetingPath: "",
  coverOnStartup: true,
  accent: "#4f8cff",
  glassAlpha: 20,
  glassColor: GLASS_COLOR_DEFAULTS,
  glassDarkSeparate: false,
  glassFidelity: 100,
  chatGlassFidelity: 100,
  extraGlassSelectors: "",
  capsuleBlur: 8,
  capsuleColor: '#ffffff',
  leftSidebarGlass: false,
  leftSidebarCornerRadius: '20',
  leftSidebarSquareTL: true,
  leftSidebarSquareTR: false,
  leftSidebarSquareBR: false,
  leftSidebarSquareBL: true,
  rightSidebarCornerRadius: '20',
  rightSidebarSquareTL: false,
  rightSidebarSquareTR: true,
  rightSidebarSquareBR: true,
  rightSidebarSquareBL: false,
  titlebarGlass: false,
  thinkingGlass: false,
  thinkingNative: false,
  glassMode: GLASS_MODE_DEFAULTS,
  settingsVersion: SETTINGS_VERSION,
  ...Object.fromEntries(GLASS_CHILDREN.flatMap((c) => Object.entries(c.params).map(([p, fallback]) => [
    childGlassKey(c.id, p),
    p === 'color' ? GLASS_COLOR_DEFAULT : p === 'fidelity' ? 100 : fallback,
  ]))),
  sidebarGlass: true,
  sidebarFullClear: false,
  sidebarFollowGlobal: true,
  sidebarBlur: 16,
  sidebarAlpha: 60,
  sidebarColor: "#ffffff",
  sidebarContentAlpha: 38,
  sidebarContentColor: "",
  frameVariants: {},
  sceneLiveFailures: {},
  customFrames: {},
  caretColor: "",
  uiColorCustom: false,
  uiColorSend: "",
  uiColorLink: "",
  uiColorFileIcon: "",
  uiColorTab: "",
  uiColorDeepDiving: "",
  videoVolume: 0,
  videoAudioEnabled: true,
  themeColors: {},
  themeDarkSeparate: false,
  themeFollow: false,
  themeSize: {},
  themeWeight: {},
  themeFamily: {},
  globalFamily: '',
  componentFonts: {},
  fontAdvanced: false,
  fontSetOpen: false,
  themeTypeOnly: true,
  layerPositionX: 50,
  layerPositionY: 50,
  layerScale: 100,
  avatarEnabled: false,
  avatarSize: 40,
  avatarRadius: 100,
  avatarUserImage: '',
  avatarAiImage: '',
  skinYieldRestoreId: '',
  skinYieldRestoreRotation: false,
};
const DEFAULTS_ONLY = ['rotationInterval', 'sceneFrameUrl', 'themeTypeOnly', 'fontAdvanced', 'fontSetOpen'];
function panelDefaults() {
  const out = {};
  for (const key of DEFAULTS_ONLY) out[key] = DEFAULTS[key];
  return out;
}
const CLIENT_ONLY = ['frameVariants', 'customFrames'];
const KINDS = {
  id: { kind: 'str' },
  scrim: { kind: 'num', min: 0, max: 1 },
  border: { kind: 'num', min: 0, max: 1 },
  blur: { kind: 'num', min: 0, max: 60 },
  wallpaperBlur: { kind: 'num', min: 0, max: 60 },
  backgroundBrightness: { kind: 'num', min: 40, max: 160 },
  backgroundContrast: { kind: 'num', min: 40, max: 200 },
  backgroundSaturate: { kind: 'num', min: 0, max: 200 },
  wallpaperOpacity: { kind: 'num', min: 0, max: 90 },
  switchTransition: { kind: 'enum', values: SWITCH_TRANSITION_VALUES },
  switchTransitionDir: { kind: 'enum', values: SWITCH_DIRS },
  switchTransitionSpeed: { kind: 'enum', values: SWITCH_SPEED_VALUES },
  chatLayout: { kind: 'enum', values: CHAT_LAYOUT_VALUES },
  rotationEnabled: { kind: 'boolFalse' },
  rotationGroupId: { kind: 'str' },
  rotationGroups: { kind: 'groups' },
  rotationSeeded: { kind: 'boolFalse' },
  hiddenIds: { kind: 'strArray' },
  playbackRate: { kind: 'num', min: 0.5, max: 2 },
  videoVolume: { kind: 'num', min: 0, max: 1 },
  videoAudioEnabled: { kind: 'boolTrue' },
  fpsCap: { kind: 'enum', values: FPS_CAP_VALUES },
  sceneLive: { kind: 'boolTrue' },
  sceneLiveFps: { kind: 'enum', values: SCENE_LIVE_FPS_VALUES },
  liveBootDelay: { kind: 'num', min: 0, max: 30 },
  audioSource: { kind: 'const' },
  adapterTarget: { kind: 'enum', values: ADAPTER_TARGET_VALUES },
  mediaIntegration: { kind: 'const' },
  mediaLyricsOnline: { kind: 'const' },
  userProps: { kind: 'props' },
  pauseOnHidden: { kind: 'boolTrue' },
  pauseOnBlur: { kind: 'boolFalse' },
  pauseOnBattery: { kind: 'boolFalse' },
  flip: { kind: 'boolFalse' },
  objectFit: { kind: 'enum', values: OBJECT_FIT_VALUES },
  contentRatingFilter: { kind: 'enum', values: RATING_VALUES },
  typeFilter: { kind: 'enum', values: TYPE_VALUES },
  pickerLayout: { kind: 'enum', values: PICKER_LAYOUT_VALUES },
  edgeCompat: { kind: 'boolTrue' },
  billingEnabled: { kind: 'boolTrue' },
  billingFlip: { kind: 'boolTrue' },
  billingFlipX: { kind: 'boolTrue' },
  billingFlipY: { kind: 'boolTrue' },
  greetingOn: { kind: 'boolTrue' },
  greetingPath: { kind: 'str' },
  coverOnStartup: { kind: 'boolTrue' },
  accent: { kind: 'hex' },
  glassAlpha: { kind: 'num', min: 0, max: 100 },
  glassColor: { kind: 'glassColors' },
  glassDarkSeparate: { kind: 'boolFalse' },
  glassFidelity: { kind: 'num', min: 0, max: 100 },
  capsuleBlur: { kind: 'num', min: 0, max: 60 },
  capsuleColor: { kind: 'hex' },
  chatGlassFidelity: { kind: 'num', min: 0, max: 100 },
  extraGlassSelectors: { kind: 'extraSelectors' },
  leftSidebarGlass: { kind: 'boolFalse' },
  leftSidebarCornerRadius: { kind: 'enum', values: SIDEBAR_CORNER_RADIUS_VALUES },
  leftSidebarSquareTL: { kind: 'boolTrue' },
  leftSidebarSquareTR: { kind: 'boolFalse' },
  leftSidebarSquareBR: { kind: 'boolFalse' },
  leftSidebarSquareBL: { kind: 'boolTrue' },
  rightSidebarCornerRadius: { kind: 'enum', values: SIDEBAR_CORNER_RADIUS_VALUES },
  rightSidebarSquareTL: { kind: 'boolFalse' },
  rightSidebarSquareTR: { kind: 'boolTrue' },
  rightSidebarSquareBR: { kind: 'boolTrue' },
  rightSidebarSquareBL: { kind: 'boolFalse' },
  titlebarGlass: { kind: 'boolFalse' },
  thinkingGlass: { kind: 'boolFalse' },
  thinkingNative: { kind: 'boolFalse' },
  settingsVersion: { kind: 'const' },
  glassMode: { kind: 'modeMap' },
  ...Object.fromEntries(GLASS_CHILDREN.flatMap((c) => Object.entries(c.params).map(([p, max]) => {
    const key = childGlassKey(c.id, p);
    if (p === 'color') return [key, { kind: 'hex' }];
    if (p === 'fidelity') return [key, { kind: 'num', min: 0, max: 100 }];
    return [key, { kind: 'num', min: 0, max }];
  }))),
  sidebarGlass: { kind: 'boolTrue' },
  sidebarFullClear: { kind: 'boolFalse' },
  sidebarFollowGlobal: { kind: 'boolTrue' },
  sidebarBlur: { kind: 'num', min: 0, max: 60 },
  sidebarAlpha: { kind: 'num', min: 0, max: 100 },
  sidebarColor: { kind: 'hex' },
  sidebarContentAlpha: { kind: 'num', min: 0, max: 100 },
  sidebarContentColor: { kind: 'hex' },
  frameVariants: { kind: 'map' },
  sceneLiveFailures: { kind: 'failures' },
  customFrames: { kind: 'map' },
  caretColor: { kind: 'hex' },
  uiColorCustom: { kind: 'boolFalse' },
  uiColorSend: { kind: 'hex' },
  uiColorLink: { kind: 'hex' },
  uiColorFileIcon: { kind: 'hex' },
  uiColorTab: { kind: 'hex' },
  uiColorDeepDiving: { kind: 'hex' },
  themeColors: { kind: 'themeColors' },
  themeDarkSeparate: { kind: 'boolFalse' },
  themeFollow: { kind: 'boolFalse' },
  themeSize: { kind: 'typeSizes' },
  themeWeight: { kind: 'typeWeights' },
  themeFamily: { kind: 'typeFamily' },
  globalFamily: { kind: 'familyKey' },
  componentFonts: { kind: 'componentFonts' },
  layerPositionX: { kind: 'num', min: 0, max: 100 },
  layerPositionY: { kind: 'num', min: 0, max: 100 },
  layerScale: { kind: 'num', min: 50, max: 150 },
  avatarEnabled: { kind: 'boolFalse' },
  avatarSize: { kind: 'num', min: AVATAR_SIZE_MIN, max: AVATAR_SIZE_MAX },
  avatarRadius: { kind: 'num', min: AVATAR_RADIUS_MIN, max: AVATAR_RADIUS_MAX },
  avatarUserImage: { kind: 'avatarFile' },
  avatarAiImage: { kind: 'avatarFile' },
  skinYieldRestoreId: { kind: 'str' },
  skinYieldRestoreRotation: { kind: 'boolFalse' },
};
const PROFILE_PRESET_KEYS = Object.keys(KINDS).filter((k) => !DEFAULTS_ONLY.includes(k)
  && !CLIENT_ONLY.includes(k) && !PRESET_ASSET_KEYS.includes(k) && !PRESET_EXCLUDED_KEYS.includes(k));
const RESET_MODULES = {
  avatar: Object.keys(KINDS).filter((k) => k.indexOf('avatar') === 0
    && !DEFAULTS_ONLY.includes(k) && !CLIENT_ONLY.includes(k)),
  theme: ['themeFollow', 'chatLayout'],
  detail: ['border'],
  glass: [
    'blur', 'glassAlpha', 'glassColor', 'glassDarkSeparate', 'glassFidelity', 'glassMode',
    'extraGlassSelectors',
    'capsuleBlur', 'capsuleColor', 'chatGlassFidelity', 'conversationColor',
    'settingsWindowTransparency', 'settingsWindowBlur',
    'leftSidebarGlass', 'leftSidebarTransparency', 'leftSidebarBlur',
    'titlebarGlass', 'titlebarTransparency', 'titlebarBlur',
    'thinkingGlass', 'thinkingNative', 'thinkingTriggerTransparency', 'thinkingTriggerBlur',
    'floatersTransparency', 'floatersBlur',
    'sidebarGlass', 'sidebarFullClear', 'sidebarFollowGlobal',
    'sidebarBlur', 'sidebarAlpha', 'sidebarColor', 'sidebarContentAlpha', 'sidebarContentColor',
  ],
  corners: [
    'leftSidebarCornerRadius',
    'leftSidebarSquareTL', 'leftSidebarSquareTR', 'leftSidebarSquareBR', 'leftSidebarSquareBL',
    'rightSidebarCornerRadius',
    'rightSidebarSquareTL', 'rightSidebarSquareTR', 'rightSidebarSquareBR', 'rightSidebarSquareBL',
  ],
  uiColor: [
    'accent', 'caretColor', 'uiColorCustom',
    'uiColorSend', 'uiColorLink', 'uiColorFileIcon', 'uiColorTab', 'uiColorDeepDiving',
  ],
  font: [
    'fontCustom', 'themeColors', 'themeDarkSeparate',
    'themeSize', 'themeWeight', 'themeFamily', 'globalFamily', 'componentFonts',
  ],
};
const RESET_TABS = {
  library: [
    'switchTransition', 'switchTransitionDir', 'switchTransitionSpeed',
    'rotationEnabled', 'rotationGroupId', 'rotationGroups', 'rotationSeeded',
    'contentRatingFilter', 'typeFilter', 'pickerLayout',
  ],
  appearance: [
    'border', 'blur',
    'accent', 'glassAlpha', 'glassColor', 'glassDarkSeparate', 'glassFidelity', 'glassMode',
    'extraGlassSelectors',
    'capsuleBlur', 'capsuleColor', 'chatGlassFidelity',
    'settingsWindowTransparency', 'settingsWindowBlur',
    'leftSidebarGlass', 'leftSidebarCornerRadius',
    'leftSidebarSquareTL', 'leftSidebarSquareTR', 'leftSidebarSquareBR', 'leftSidebarSquareBL',
    'leftSidebarTransparency', 'leftSidebarBlur',
    'rightSidebarCornerRadius',
    'rightSidebarSquareTL', 'rightSidebarSquareTR', 'rightSidebarSquareBR', 'rightSidebarSquareBL',
    'titlebarGlass', 'titlebarTransparency', 'titlebarBlur',
    'thinkingGlass', 'thinkingNative', 'thinkingTriggerTransparency', 'thinkingTriggerBlur',
    'conversationColor', 'caretColor',
    'floatersTransparency', 'floatersBlur',
    'sidebarGlass', 'sidebarFullClear', 'sidebarFollowGlobal',
    'sidebarBlur', 'sidebarAlpha', 'sidebarColor', 'sidebarContentAlpha', 'sidebarContentColor',
    'fontCustom', 'themeColors', 'themeDarkSeparate', 'themeFollow',
    'chatLayout',
    'themeSize', 'themeWeight', 'themeFamily', 'globalFamily', 'componentFonts',
    'uiColorCustom', 'uiColorSend', 'uiColorLink', 'uiColorFileIcon', 'uiColorTab', 'uiColorDeepDiving',
  ],
  playback: [
    'scrim', 'wallpaperBlur', 'wallpaperOpacity',
    'backgroundBrightness', 'backgroundContrast', 'backgroundSaturate',
    'flip', 'objectFit', 'layerPositionX', 'layerPositionY', 'layerScale',
    'playbackRate', 'fpsCap', 'sceneLive', 'sceneLiveFps', 'liveBootDelay',
    'videoVolume', 'videoAudioEnabled', 'audioSource',
    'mediaIntegration', 'mediaLyricsOnline',
  ],
  system: [
    'adapterTarget', 'edgeCompat',
    'billingEnabled',
    'billingFlip',
    'billingFlipX',
    'billingFlipY',
    'greetingOn', 'greetingPath', 'coverOnStartup',
    'pauseOnHidden', 'pauseOnBlur', 'pauseOnBattery',
  ],
  extensions: Object.keys(KINDS).filter((k) => k.indexOf('avatar') === 0
    && !DEFAULTS_ONLY.includes(k) && !CLIENT_ONLY.includes(k)),
};
const RESET_TABS_EXCLUDED = [
  'id',
  'hiddenIds',
  'userProps',
  'settingsVersion',
  'skinYieldRestoreId',
  'skinYieldRestoreRotation',
  'sceneLiveFailures',
];
function sanitizePresetValues(raw) {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const full = sanitizeFromSchema(Object.assign({}, src, { settingsVersion: SETTINGS_VERSION }), 'host');
  const out = {};
  for (const key of PROFILE_PRESET_KEYS) out[key] = full[key];
  return out;
}
function sanitizePresetAssets(raw) {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const out = {};
  const dataOf = (v) => (typeof v === 'string' ? v : '');
  const f = src.font;
  if (f === null) out.font = null;
  else if (f && typeof f === 'object' && !Array.isArray(f)) {
    const inner = (f.values && typeof f.values === 'object' && !Array.isArray(f.values)) ? f.values : f;
    out.font = {
      name: typeof f.name === 'string' ? f.name.slice(0, 64) : '',
      values: sanitizeFontset(inner),
    };
  }
  const a = src.avatar;
  if (a === null) out.avatar = null;
  else if (a && typeof a === 'object' && !Array.isArray(a)) {
    const one = (side, fileDef) => {
      const v = a[side];
      if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
      return { file: readOne(KINDS[fileDef], v, 'file', DEFAULTS[fileDef]), data: dataOf(v.data) };
    };
    const avatar = {};
    const user = one('user', 'avatarUserImage');
    const ai = one('ai', 'avatarAiImage');
    if (user) avatar.user = user;
    if (ai) avatar.ai = ai;
    if (user || ai) out.avatar = avatar;
  }
  return out;
}
const HEX_RE = /^#[0-9a-f]{6}$/i;
const THEME_COLOR_ROLE_IDS = ["primary", "secondary", "tertiary", "caption", "dimmed"];
function readThemeColors(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const role of THEME_COLOR_ROLE_IDS) {
    const v = raw[role];
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const light = typeof v.light === 'string' && HEX_RE.test(v.light.trim()) ? v.light.trim() : null;
    const dark = typeof v.dark === 'string' && HEX_RE.test(v.dark.trim()) ? v.dark.trim() : null;
    if (light && dark) out[role] = { light, dark };
  }
  return out;
}
function readGlassColors(raw) {
  const out = { light: GLASS_COLOR_DEFAULT, dark: GLASS_COLOR_DEFAULT };
  if (typeof raw === 'string') {
    const v = raw.trim();
    if (HEX_RE.test(v)) { out.light = v; out.dark = v; }
    return out;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const light = typeof raw.light === 'string' && HEX_RE.test(raw.light.trim()) ? raw.light.trim() : null;
  const dark = typeof raw.dark === 'string' && HEX_RE.test(raw.dark.trim()) ? raw.dark.trim() : null;
  out.light = light || dark || out.light;
  out.dark = dark || light || out.dark;
  return out;
}
const THEME_TYPE_ROLE_IDS = ["markdown-h1", "markdown-h2", "markdown-h3", "markdown-h4",
  "markdown-base", "markdown-small", "markdown-code", "markdown-code-block",
  "markdown-table", "markdown-table-head", "xs-13", "xxs-12"];
function readTypeSizes(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const role of THEME_TYPE_ROLE_IDS) {
    const v = raw[role];
    if (typeof v !== 'number' || !Number.isInteger(v) || v === 0) continue;
    if (v < 8 || v > 48) continue;
    out[role] = v;
  }
  return out;
}
function readTypeWeights(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const role of THEME_TYPE_ROLE_IDS) {
    const v = raw[role];
    if (typeof v !== 'number' || !Number.isInteger(v)) continue;
    if (v < 100 || v > 900) continue;
    out[role] = v;
  }
  return out;
}
function readTypeFamily(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const role of THEME_TYPE_ROLE_IDS) {
    const key = sanitizeFamilyKey(raw[role]);
    if (!key) continue;
    out[role] = key;
  }
  return out;
}
const COMPONENT_FONT_KEYS = ["markdown", "codeBlock", "terminal", "table"];
const COMPONENT_FONT_SIZE_MIN = 6, COMPONENT_FONT_SIZE_MAX = 40;
const COMPONENT_FONT_WEIGHT_MIN = 100, COMPONENT_FONT_WEIGHT_MAX = 900;
function readComponentFonts(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const key of COMPONENT_FONT_KEYS) {
    const v = raw[key];
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const one = {};
    if (typeof v.size === 'number' && Number.isInteger(v.size)
      && v.size >= COMPONENT_FONT_SIZE_MIN && v.size <= COMPONENT_FONT_SIZE_MAX) one.size = v.size;
    if (typeof v.weight === 'number' && Number.isInteger(v.weight)
      && v.weight >= COMPONENT_FONT_WEIGHT_MIN && v.weight <= COMPONENT_FONT_WEIGHT_MAX) one.weight = v.weight;
    const family = sanitizeFamilyValue(v.family);
    if (family) one.family = family;
    if (Object.keys(one).length) out[key] = one;
  }
  return out;
}
function clampNum(v, lo, hi, fallback) {
  return typeof v === 'number' && v >= lo && v <= hi ? v : fallback;
}
function readRotationGroups(raw, fallbackInterval) {
  if (!Array.isArray(raw)) return [];
  const groups = [];
  for (const g of raw) {
    if (!g || typeof g !== 'object') continue;
    const id = typeof g.id === 'string' && g.id ? g.id : '';
    if (!id) continue;
    groups.push({
      id,
      name: typeof g.name === 'string' && g.name.trim() ? g.name.trim() : '轮播列表',
      interval: clampNum(g.interval, 1, 1440, fallbackInterval),
      order: g.order === 'random' ? 'random' : 'sequence',
      wallpaperIds: Array.isArray(g.wallpaperIds)
        ? g.wallpaperIds.filter((x) => typeof x === 'string' && x)
        : [],
    });
  }
  return groups;
}
function readModeMap(raw, def) {
  const base = (def && typeof def === 'object' && !Array.isArray(def)) ? Object.assign({}, def) : {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== 'string' || !k || k.length > 64) continue;
    if (v === 'inherit' || v === 'custom') base[k] = v;
  }
  return base;
}
function readUserProps(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== 'string' || !k || !v || typeof v !== 'object' || Array.isArray(v)) continue;
    const inner = {};
    for (const [n, val] of Object.entries(v)) {
      if (typeof n !== 'string' || !n) continue;
      if (typeof val === 'string') inner[n] = val.slice(0, 2000);
      else if (typeof val === 'number' || typeof val === 'boolean') inner[n] = val;
    }
    out[k] = inner;
  }
  return out;
}
function readLiveFailures(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k === 'string' && k && (v === true || v === 'timeout' || v === 'stall')) out[k] = v;
  }
  return out;
}
function readOne(meta, raw, key, def) {
  const v = raw ? raw[key] : undefined;
  switch (meta.kind) {
    case 'num': {
      const lo = meta.min;
      const hi = meta.max;
      return clampNum(v, lo, hi, def);
    }
    case 'enum': return meta.values.includes(v) ? v : def;
    case 'boolTrue': return v !== false;
    case 'boolFalse': return v === true;
    case 'const': return def;
    case 'hex': return typeof v === 'string' && HEX_RE.test(v) ? v : def;
    case 'themeColors': return readThemeColors(v);
    case 'glassColors': return readGlassColors(v);
    case 'typeSizes': return readTypeSizes(v);
    case 'typeWeights': return readTypeWeights(v);
    case 'typeFamily': return readTypeFamily(v);
    case 'familyKey': return sanitizeFamilyKey(v) || def;
    case 'componentFonts': return readComponentFonts(v);
    case 'str': return typeof v === 'string' ? v : def;
    case 'extraSelectors': return sanitizeExtraGlassSelectors(v);
    case 'strArray': return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : def;
    case 'avatarFile': return typeof v === 'string' && AVATAR_FILE_RE.test(v) ? v : def;
    case 'map': return (v && typeof v === 'object' && !Array.isArray(v)) ? Object.assign({}, v) : {};
    case 'modeMap': return readModeMap(v, def);
    case 'props': return readUserProps(v);
    case 'failures': return readLiveFailures(v);
    case 'groups': return readRotationGroups(v, DEFAULTS.rotationInterval);
    default: throw new Error('settings-schema: 未知 kind ' + meta.kind + '（键 ' + key + '）');
  }
}
const FONTSET_KEYS = ['themeColors', 'themeDarkSeparate', 'themeSize', 'themeWeight', 'themeFamily', 'globalFamily', 'componentFonts'];
const FONTSET_SCHEMA_VERSION = 1;
const FONTSET_SCHEMA_TAG = 'dsh-we/fontset@' + FONTSET_SCHEMA_VERSION;
const FONTSET_MIGRATED_ID = 'default';
const FONTSET_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const FONTSET_RESERVED_IDS = ['import', 'export'];
function isFontSetId(v) {
  return typeof v === 'string' && FONTSET_ID_RE.test(v) && !FONTSET_RESERVED_IDS.includes(v);
}
function sanitizeFontset(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const key of FONTSET_KEYS) out[key] = readOne(KINDS[key], src, key, DEFAULTS[key]);
  return out;
}
function migrateSettings(raw) {
  const v = Number(raw && raw.settingsVersion);
  if (Number.isFinite(v) && v >= SETTINGS_VERSION) return raw;
  const out = Object.assign({}, raw);
  const legacy = out.glassIndependent;
  if (v >= 2 && legacy && typeof legacy === 'object') {
    const mode = Object.assign({}, GLASS_MODE_DEFAULTS);
    for (const [k, on] of Object.entries(legacy)) if (on === true) mode[k] = 'custom';
    out.glassMode = mode;
  }
  delete out.glassIndependent;
  delete out.glassOverrides;
  delete out.glassWindow;
  delete out.glassChildren;
  const asNum = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
  const rescale = (key, factor, max) => {
    const x = asNum(out[key]);
    if (x === null) return;
    out[key] = Math.min(max, Math.round(x * factor));
  };
  rescale('glassAlpha', 100 / 60, 100);
  rescale('sidebarAlpha', 1 / 2, 100);
  rescale('sidebarContentAlpha', 100 / 80, 100);
  for (const k of ['settingsWindowTransparency', 'floatersTransparency', 'leftSidebarTransparency']) {
    rescale(k, 100 / 60, 100);
  }
  const sb = asNum(out.sidebarBlur);
  if (sb !== null) out.sidebarBlur = Math.min(60, Math.round(sb));
  if (typeof out.glassColor === 'string') {
    out.glassColor = { light: out.glassColor, dark: out.glassColor };
  }
  return out;
}
function sanitizeFromSchema(raw, side) {
  if (!raw || typeof raw !== 'object') {
    return side === 'host' ? null : Object.assign({ id: '' }, DEFAULTS);
  }
  const src = migrateSettings(raw);
  const out = {};
  for (const [key, meta] of Object.entries(KINDS)) {
    if (side === 'host' && CLIENT_ONLY.includes(key)) continue;
    if (FONTSET_KEYS.includes(key)) continue;
    const def = key === 'id' ? '' : DEFAULTS[key];
    out[key] = readOne(meta, src, key, def);
  }
  return out;
}
function serializeSettings(sel) {
  const s = sel && typeof sel === 'object' ? sel : {};
  const out = { id: typeof s.id === 'string' ? s.id : '' };
  for (const key of Object.keys(KINDS)) {
    if (key === 'id') continue;
    if (FONTSET_KEYS.includes(key)) continue;
    out[key] = s[key];
  }
  return out;
}
export {
  DEFAULTS, KINDS, DEFAULTS_ONLY, CLIENT_ONLY, RESET_MODULES, RESET_TABS, RESET_TABS_EXCLUDED, THEME_COLOR_ROLE_IDS, THEME_TYPE_ROLE_IDS,
  UI_COLOR_KEYS,
  COMPONENT_FONT_KEYS,
  FONTSET_KEYS, FONTSET_SCHEMA_TAG,
  FONTSET_MIGRATED_ID, isFontSetId, sanitizeFontset,
  SIDEBAR_CORNER_RADIUS_VALUES,
  ADAPTER_TARGET_VALUES,
  systemFontKeyOf, isSystemFontKey,
  sanitizeExtraGlassSelectors,
  systemFontNameOf, sanitizeFamilyKey, sanitizeFamilyValue,
  FPS_CAP_VALUES, SCENE_LIVE_FPS_VALUES,
  SWITCH_TRANSITION_VALUES, SWITCH_DIRS, SWITCH_SPEED_VALUES,
  clampNum,
  sanitizeFromSchema, serializeSettings, panelDefaults,
  GLASS_CHILDREN, childGlassKey, GLASS_MODE_DEFAULTS,
  PROFILE_PRESET_SCHEMA_TAG, GLASS_PRESET_TOMBSTONE_TAG,
  PROFILE_PRESET_KEYS, PRESET_ASSET_KEYS, PRESET_EXCLUDED_KEYS,
  sanitizePresetValues, sanitizePresetAssets, isGlassPresetId,
};
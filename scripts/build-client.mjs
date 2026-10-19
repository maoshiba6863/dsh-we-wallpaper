import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const id = pkg.name;
const INLINE_MODULES = [
  {
    file: 'src/we-base.js',
    why: '浏览器半边的最小地基：三枚到处都用的纯工具（唯一实现）—— 钳位 `weClampTo` · 单调时钟 `weNow` · body 根 `weBody`；零依赖 + 零顶层可执行语句，故可排在内联清单最前',
    markers: ['function weClampTo(', 'function weNow(', 'function weBody('],
  },
  {
    file: 'src/i18n.js',
    why: 'i18n 运行时：跟随宿主 locale 服务的取词层（语言种类与 dsh web 同一份目录；含 ?we-lang 逃生舱）',
    markers: ['const WE_I18N_NS = ', 'function weT(', 'function weI18nAttach(',
      'function useWeLocale()', 'function weOnLocaleChange('],
  },
  {
    file: 'src/styles-base.js',
    why: '样式域 base（原 styles.js 61–592）：画布兜底 · 玻璃总锚点与表面令牌 · markdown 底 · 对比度 · 全局 UI 配色 · 可读性下限常量（与消费它的 CSS 同处一文件）',
    markers: ['const CSS_BASE = `', 'const READABILITY_FLOOR = ', 'const READABILITY_FLOOR_DARK = ', '/* ── 画布兜底色'],
  },
  {
    file: 'src/styles-shell.js',
    why: '样式域 shell（原 styles.js 593–1134）：iOS liquid glass · 思考触发条 · 输入座位 · composer card · 轨迹霜 · 吸顶条 · 原生左栏底 · 外壳画布底',
    markers: ['const CSS_SHELL = `', '/* ── iOS liquid glass'],
  },
  {
    file: 'src/styles-sidebar.js',
    why: '样式域 sidebar（原 styles.js 1135–1622）：左侧栏液态玻璃 · 四角圆角 · 标题栏玻璃与模糊层 · better-sidebar glass · 官方右侧栏 · 内容面',
    markers: ['const CSS_SIDEBAR = `', '/* ── 左侧栏液态玻璃'],
  },
  {
    file: 'src/styles-chrome.js',
    why: '样式域 chrome（原 styles.js 1623–1915）：统一控件 token · 原生设置整窗玻璃 · 插件源浮层 · corner-shape 兼容(#74)',
    markers: ['const CSS_CHROME = `', '/* ── 统一控件 token'],
  },
  {
    file: 'src/styles-settings.js',
    why: '样式域 settings（原 styles.js 1916–2167）：预设圆角表格 · 原生下拉弹层 · 视觉分组 divider · 可折叠节头 · 窄栏兜底 · 页签栏 · 统一设置行 32px',
    markers: ['const CSS_SETTINGS = `', '/* ── 预设方案'],
  },
  {
    file: 'src/styles-panel.js',
    why: '样式域 panel：效果空态 · 黑胶 · 当前壁纸卡 · 壁纸属性面板 · 库下钻 · 目录浏览器',
    markers: ['const CSS_PANEL = `', '/* ── 效果页签空态'],
  },
  {
    file: 'src/styles-quick.js',
    why: '样式域 quick：快捷播放面板 QuickPanel',
    markers: ['const CSS_QUICK = `', '/* ── 快捷播放面板（QuickPanel）'],
  },
  {
    file: 'src/styles-ext.js',
    why: '样式域 ext（原 styles.js 3358–3742）：软件渲染回退(#95) · 「关于」页签 · 扩展槽位与三号模块 · 侧栏全透明(#137)',
    markers: ['const CSS_EXT = `', '/* ── 软件渲染回退'],
  },
  {
    file: 'src/styles.js',
    why: '样式族**组装点**（8 个域模块按本清单顺序相加 ⇒ 与原单模板逐字节相同；可读性下限由 styles-base.js 声明并导出）',
    markers: ['const CSS = CSS_BASE + CSS_SHELL + CSS_SIDEBAR + CSS_CHROME + CSS_SETTINGS + CSS_PANEL + CSS_QUICK + CSS_EXT;',
      'export { CSS };'],
  },
  {
    file: 'src/nav-icon.js',
    why: '「壁纸引擎」SVG 图标（几何唯一真源）+ 设置导航图标 DOM 补丁（官方 nav 硬编码兜底齿轮）',
    markers: ['const WE_ICON_PARTS = [', 'function renderWeIcon(',
      'function weIconSvgString(', 'function installWeNavIcon('],
  },
  {
    file: 'src/sidebar-right.js',
    why: '官方右侧栏接入（能力门 + 两段注册）+ 侧边栏触达模式真源 + 「壁纸引擎设置」DOM 入口',
    markers: ['function sidebarRightMode(', 'function sidebarRightOpen(',
      'function installSidebarRight(', 'function openSettingsSection('],
  },
  {
    file: 'src/font/components.js',
    why: 'G3/G4 组件级字体：模块前缀白名单 + 启动自探测 + 官方 --dsl-* 钩子生成',
    markers: ['const COMPONENT_FONT_TARGETS = [', 'function probeComponentTargets(',
      'function buildComponentCss(', 'const DSL_FONT_HOOKS = ['],
  },
  {
    file: 'lib/settings-schema.js',
    why: '设置唯一真源（宿主也 import 同一文件，见 P1-5）',
    markers: ['const KINDS = {', 'function sanitizeFromSchema(', 'function sanitizePresetValues(',
      'function serializeSettings(', 'const DEFAULTS = {'],
  },
  {
    file: 'src/adapter.js',
    why: '适配器模式：宿主形态判定（手选 > 宿主上报 > 本地信号）与能力矩阵',
    markers: ['const ADAPTER_LABELS = {', 'function setAdapterFromHost(',
      'function resolveAdapterTarget(', 'function adapterCaps('],
  },
  {
    file: 'src/theme-follow.js',
    why: '主题随壁纸：作者配色 → 画面主色 → 不动，按相对亮度自动切全局深/浅',
    markers: ['const THEME_FOLLOW_LIGHT_ABOVE = ', 'function themeFollowParseColor(',
      'function themeFollowModeColorOf(', 'function themeFollowAttach('],
  },
  {
    file: 'src/we-cond.js',
    why: 'WE 条件求值器（纯计算、零外界依赖，独立可测，见 P1-7）',
    markers: ['const WE_COND_OPS = [', 'function weEvalCondition(', 'function weCondTokenize('],
  },
  {
    file: 'src/font/color-roles.js',
    why: 'F1 令牌层：给文字颜色角色分角色上色（纯逻辑 + feature-detect，契约见文件头）',
    markers: ['const THEME_COLOR_ROLES = [', 'function createThemeLayer(', 'function pollThemeService(',
      'function buildTokenPayload('],
  },
  {
    file: 'src/font/typography.js',
    why: 'F2 排版角色：按角色调整字号（绝对值 px）/字重/字族（基准表达式照抄 DSH，见文件头）',
    markers: ['const THEME_TYPE_ROLES = [', 'function buildTypePayload(', 'const THEME_TYPE_SOURCE ='],
  },
  {
    file: 'src/font/apply.js',
    why: '字体自定义的落地点（宿主默认值快照 + 组件作用域样式表；设置 → DOM 的唯一字体出口）',
    markers: ['const WE_HOST_TOKENS = [', 'function componentFontAvailability()',
      'function applyComponentFonts()', 'function snapshotHostFontDefaults()',
      'function removeFontStyles()'],
  },
  {
    file: 'src/persistence.js',
    why: '设置持久化层：debounce 写 / 脏标记重试 / 宿主→本地迁移 / 在途 GET 竞态守卫',
    markers: ['function readPersisted()', 'function serializeSelection()', 'function pushPersisted()',
      'function schedulePersist()', 'async function loadPersisted()', 'function cancelPendingPersist()'],
  },
  {
    file: 'src/fontset-store.js',
    why: '字体集通道（F3 阶段 2）：活动集正文的加载 / 原子采用 / debounce 落盘 / 本地缓存（与设置平行但另一条真源）',
    markers: ['const FONTSET_CACHE_KEY = ', 'function readCachedFontSet()', 'function setFontValues(patch)',
      'async function loadFontSet()', 'function scheduleFontSet()', 'function cancelPendingFontSet()'],
  },
  {
    file: 'src/preset-store.js',
    why: '玻璃预设通道：清单加载 / 整快照应用（走设置通道落效）/ 保存 / 删除（重名由宿主裁决）',
    markers: ['const gpFetch = ', 'function glassPresetFailureReason(res)', 'async function applyGlassPreset(id)',
      'async function saveGlassPreset(name)', 'async function deleteGlassPreset(id)'],
  },
  {
    file: 'src/fontset-editor.js',
    why: '字体集编辑器面板（F3 阶段 3）：纯渲染 + 意图回调（网络与状态由 client 侧经显式 ctx 给）',
    markers: ['function deleteLabel(row)', 'function renderFontSetEditor(ctx)'],
  },
  {
    file: 'src/section-head.js',
    why: '节头构件（可折叠）：panel-tabs 与 glass-panel 共用的那一份，抽出来是为了让挂载台能 import 真实现',
    markers: ['function sectionHead(label, open, onToggle, action) {',
      'className: "we-picker__section-head we-picker__section-head--toggle"'],
  },
  {
    file: 'src/module-reset.js',
    why: '模块级重置按钮（↺）：panel-tabs 与 glass-panel 共用；模块名查 RESET_MODULES 取键集',
    markers: ['function moduleResetButtonNode(moduleName, onResetModule, labels) {',
      'className: "we-mod-reset"'],
  },
  {
    file: 'src/glass-panel.js',
    why: '「玻璃 UI」节渲染器（注册表驱动：GLASS_CHILDREN + childGlassKey；只读 ctx、动作经 on* 处理器）',
    markers: ['function renderAppearanceGlassSection(ctx) {', 'renderGlassPresetsBlock(ctx.glassPresets)'],
  },
  {
    file: 'src/billing-layer.js',
    why: '计费界面出口：sidebar.footer.action（今日/本会话）+ conversation.chat.turnTail（本轮 ≈¥）；共享缓存与 5s 轮询',
    markers: ['const BILLING_POLL_MS = ', 'function useBilling(', 'function BillingSidebarFooter(',
      'function BillingTurnTail('],
  },
  {
    file: 'src/avatar-import.js',
    why: '头像导入的两道闸（边长 1024 / 体积 4 MiB）、零解码的文件头尺寸探针（PNG/JPEG/GIF/BMP/WebP/SVG）与两层 MIME 清单（直传 / 仅光栅化）',
    markers: ['const AVATAR_IMPORT_MAX_EDGE = ', 'const AVATAR_IMPORT_MAX_BYTES = ',
      'const IMAGE_DIRECT_ACCEPT = ', 'const IMAGE_RASTER_ACCEPT = ',
      'function parseBitmapHeaderSize(', 'function parseSvgSize(',
      'async function probeImageSize(', 'function avatarImportLimit('],
  },
  {
    file: 'src/avatar-layer.js',
    why: '「自定义会话头像」的装饰层：按 data-chat-flow-kind 给消息行补头像节点（观察者 + 就地更新；基座模块：只读 selection、零 ctx），并供面板预览复用同一条 URL 与同一张默认头像零件表',
    markers: ['const AVATAR_FLOW_SIDES = ', 'const AVATAR_GLYPH_PARTS = ',
      'function syncAvatarLayer()', 'function disposeAvatarLayer()'],
  },
  {
    file: 'src/ext-avatar.js',
    why: '「扩展」页签第一个模块的描述符（渲染该扩展岛；动作一律经 ctx 里的具名 on* 处理器）',
    markers: ['const AVATAR_EXTENSION_MODULE = {', 'function renderAvatarIsland(ctx)'],
  },
  {
    file: 'src/system-fonts.js',
    why: '本机字体清单的客户端通道：宿主那次进程扫描的唯一读者（清单 / 缓存 / 失败文案 / 本浏览器能否匹配的探针），与字体集通道同形',
    markers: ['const SYSTEM_FONTS_CACHE_KEY = ', 'function readCachedSystemFonts()',
      'async function ensureSystemFonts(', 'function systemFontKeyList(',
      'function filterUsableSystemFonts('],
  },
  {
    file: 'src/panel-tabs-wallpaper.js',
    why: '「壁纸库」页签的四个节渲染器（原 src/panel-tabs.js 的 38–508 行原样搬移）',
    markers: ['function renderWallpaperCurrentSection(ctx) {',
      '    const { current, isLiveScene, onClear, onOpenPicker, onRefresh, onToggleAudio, onTogglePlay, onTogglePropsPanel, playbackLive, propsPanelOpen, renderUserPropsPanel, sel, setPickerOpener } = ctx;'],
  },
  {
    file: 'src/panel-tabs-appearance.js',
    why: '「外观」页签的节渲染器与字体一族（原 src/panel-tabs.js 的 520–1125 行原样搬移）',
    markers: ['function renderAppearanceThemeSection(ctx) {', '    const { onResetModule, onToggleThemeFollow, sel } = ctx;'],
  },
  {
    file: 'src/panel-tabs-effects.js',
    why: '「播放」页签的六个节渲染器（原 src/panel-tabs.js 的 1618–1913 行原样搬移）',
    markers: ['function renderEffectsSlidersSection(ctx) {',
      '    const { onBackgroundBrightness, onBackgroundContrast, onBackgroundSaturate, onLayerPositionX, onLayerPositionY, onLayerReset, onLayerScale, onScrim, onWallpaperBlur, onWallpaperOpacity, sel } = ctx;'],
  },
  {
    file: 'src/panel-tabs-advanced.js',
    why: '「系统」页签的六个节渲染器（原 src/panel-tabs.js 的 1943–2211 行原样搬移）',
    markers: ['function renderAdvancedBrowsingSection(ctx) {', '    const { onLayoutChange, sel } = ctx;'],
  },
  {
    file: 'src/panel-tabs.js',
    why: '面板页签**组装点**：只留一个页签一个 render*Tab（其中「扩展」页签只画 extensionModules() 里登记的模块）；五个域的节渲染器在 panel-tabs-*.js 里 —— 显式 ctx 取外界',
    markers: ['function renderWallpaperTab(ctx) {',
      'function renderExtensionsTab(ctx) {',
      'renderWallpaperTab, renderAppearanceTab, renderAudioTab, renderEffectsTab, renderAdvancedTab,'],
  },
  {
    file: 'src/picker-model.js',
    why: '选择器模型层：过滤判定 + 派生数据 + 分页切片（纯函数 / 显式入参 / 零 DOM）',
    markers: ['function ratingOf(w)', 'function isPlayableType(w)',
      'function isRotatableWallpaper(w, ratingFilter, typeFilter)',
      'function isHiddenWallpaper(id, hiddenIds)', 'const PICKER_PAGE_SIZE = 24',
      'function pageSlice(list, page)', 'function pickerModel(input)'],
  },
  {
    file: 'src/picker-modal.js',
    why: '选择器库视图的渲染器（整棵 we-picker__modal 子树；页内下钻，不再是弹框）—— 显式 ctx 取外界，标记逐字搬',
    markers: ['function renderPickerModal(ctx)',
      'className: "we-picker__modal"',
      'className: "we-picker__modal-head"', 'className: "we-picker__grid"'],
  },
  {
    file: 'src/picker-props-panel.js',
    why: '选择器「壁纸属性」面板的渲染器（整棵 we-picker__props 子树 + 每个 ptype 的控件分支）—— 显式 ctx 取外界，标记逐字搬',
    markers: ['function renderPickerPropsPanel(ctx)', 'function renderUserPropRow(p, onPropInput)',
      'className: "we-picker__props"', 'className: "we-picker__props-row"',
      'className: "we-picker__props-section"'],
  },
  {
    file: 'src/quick-panel.js',
    why: '快捷播放面板（官方侧栏 tab 与低版本抽屉共用同一份内容）：当前壁纸 + 轮播 + 列表快切 + 声音 + 设置入口。列表虚拟滚动（spacer + 可视窗口）',
    markers: ['function qpFindScroller(', 'function qpVirtWindow(', 'function qpTypeLabel(', 'function QuickPanel(props)'],
  },
  {
    file: 'src/video-layer.js',
    why: '视频壁纸通道：海报已加载/首帧/预算的就绪判据（实测：一律等首帧会把切换推到十几秒）',
    markers: ['function probeVideoPoster(', 'function videoContentReady(', 'VIDEO_POSTER_BUDGET_MS', 'let mediaInfoToken = ', 'function clearUpgradePoll(', 'async function refreshMediaInfo(', 'function abortTranscodeUpgrade(', 'function maybeUpgradeToTranscoded(', 'function invalidateMediaInfoProbe('],
  },
  {
    file: 'src/media-prep.js',
    why: '选中项落地：预准备（预挂载 + 探测 + 超时记账）→ buildMedia → applySelection',
    markers: ['function beginRotationPrepare(', 'function prepareWallpaper(', 'const prepareLiveTimeouts = ',
      'function prepareSceneLiveStage(', 'function applySelection(', 'function buildMedia('],
  },
  {
    file: 'src/layer-core.js',
    why: '两条通道共用的切换核心：层退役/延迟移除、过场内联样式、可见性复推（不得引用实时符号）',
    markers: ['function retireFadingLayer(', 'function scheduleFadingLayerRemoval(', 'function nudgeWallpaperRepaint('],
  },
  {
    file: 'src/focus-handback.js',
    why: '#148 宿主侧：焦点被（无手势地）搬进壁纸帧时交还给用户本来在用的元素 —— 与 lib/we-focus-guard.js 分工的另一半',
    markers: ['function installFocusHandback(', 'function weIsWallpaperFrame(', 'GESTURE_WINDOW_MS', 'window.__weFocusHandback'],
  },
  {
    file: 'src/live-layer-diag.js',
    why: '实时渲染管线·诊断与日志域：分级日志 / 状态摘要 / 诊断留痕的安装',
    markers: ['function liveLog(', 'const LIVE_DIAG_KEY = '],
  },
  {
    file: 'src/live-layer-watch.js',
    why: '实时渲染管线·心跳与载荷域：看护 tick / 判失败 / 转移重试 / 抓帧回填',
    markers: ['function startLiveWatch(', 'function scheduleLiveFrameBackfill('],
  },
  {
    file: 'src/live-layer-pointer.js',
    why: '实时渲染管线·指针与帧域：指针注入 / 帧字节簿记 / poster 与挂载',
    markers: ['function livePointerFlush(', 'function liveFrameEl('],
  },
  {
    file: 'src/live-layer-gate.js',
    why: '实时渲染管线·内容闸门域：待显层的揭示闸门与失败记忆的管线身份',
    markers: ['function armLayerContentReveal(', 'function livePipelineNow('],
  },
  {
    file: 'src/live-layer-underlay.js',
    why: '实时渲染管线·兜底色域：画布兜底色采样与可见性恢复',
    markers: ['function writeUnderlayColor(', 'function refreshUnderlayColor('],
  },
  {
    file: 'src/live-layer.js',
    why: '实时渲染管线的组装点（syncLayers 编排收尾 / toggleLiveDiag）；上面五个域按本清单顺序内联在本文件之前',
    markers: ['const LIVE_FIRST_FRAME_MS = ', 'function syncLayers()', 'function toggleLiveDiag('],
  },
  {
    file: 'src/api-client.js',
    why: '宿主 API 的唯一出入口（P2-9）：前缀 / 默认 no-store / 不吞错的结构化结果',
    markers: ['const BASE = ', 'function apiUrl(', 'function pickFetch(', 'async function apiFetch(',
      'const apiJson = ', 'const apiHead = '],
  },
  {
    file: 'src/occlusion.js',
    why: '遮挡投递：/occlusion 轮询 + 缩放 + postMessage（1Hz，含退避与可见性暂停）',
    markers: ['var OCCLUSION_POLL_MS = ', 'function startOcclusionPolling(', 'function stopOcclusionPolling(',
      'function occlusionTick(', 'function deliverOcclusionSnapshot('],
  },
  {
    file: 'src/glass.js',
    why: '玻璃后端：取值解析 / 各面釉层变量 / 门控属性（无条件写，值槽位与开关正交）',
    markers: ['const toRgbTriple = (hex) => {', 'function applyGlass(selection, s) {',
      'const glassValue = (surface, param, profileValue, globalValue) =>'],
  },
  {
    file: 'src/glass-extra.js',
    why: '「额外补雾化的选择器」（#200）：把用户点名的选择器编译成 ::before 载体规则，写进本通道自己的 <style>',
    markers: ['const EXTRA_GLASS_TAG_ID = ', 'function weExtraGlassCss(',
      'function syncExtraGlassCss(', 'function disposeExtraGlassCss('],
  },
  {
    file: 'src/effects.js',
    why: '效果应用层（设置 → DOM；契约见文件头，见 P1-7 后半）—— 玻璃那一段已抽到 src/glass.js',
    markers: ['let lastScrimCss = "";', 'function applyEffects(', 'applyGlass(selection, s);',
      'function clearEffects()', 'function resolveWallpaperFadeBg()'],
  },
  {
    file: 'src/client-media-frame.js',
    why: 'src/client.js 正文的媒体/帧渲染助手（画布绘制、GPU 帧钉、音频桥与封面、属性面板装配；含其模块级状态变量）—— 构建期内联在正文之前，同处一个扁平作用域',
    markers: ['function weStopDraw()', 'function forgetGpuFramePin(token) {',
      'function renderUserPropsPanel()'],
  },
  {
    file: 'src/client-rotation.js',
    why: 'src/client.js 正文的轮换/媒体生命周期助手（过场几何、探测元素领养与释放、隐藏期轮换推迟；含其顶层状态）—— 构建期内联在正文之前，同处一个扁平作用域',
    markers: ['function barsPolygon(dir, p) {', 'const LIVE_FIRST_FADE_MS = 1800;',
      'function installRotationResumeListeners() {'],
  },
  {
    file: 'src/client-audio-playback.js',
    why: 'src/client.js 正文的音频/播放桥助手（期望音量与元素音量写入、轮换音频闸、层内媒体元素枚举、live iframe 音量与场景包 BGM 起停、播放状态应用；含其顶层状态）—— 构建期内联在正文之前，同处一个扁平作用域',
    markers: ['function weApplyAudio(video) {', 'let rotationAudioGate = null;',
      'const LAYER_KEY_FIELDS = ["type", "url", "edge", "sceneVideo", "audio", "live"];'],
  },
];
function readNormalized(abs) {
  const text = readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
  if (/\r/.test(text)) {
    console.error(`[build-client] ${abs} 含孤立回车（常见形态 \\r\\r\\n 或行内 CR）：`
      + '产物会变成平台相关，另一条 CI 腿的「产物与源码同步」判据将变红。'
      + '请先把该文件的行尾归一化成 LF（每行只留 \\n）。');
    process.exit(1);
  }
  return text;
}
const DECL_RE = /^([ \t]*)(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
const src = readNormalized(resolve(root, 'src', 'client.js'));
const { body: bodyText, codeStart } = stripHeader(src);
const body = injectRopeArt(bodyText.replace(/\n+$/, ''));
const prelude = readInlinedPrelude();
assertNoShadowedScopeDecls();
const outline = [
  'window.__ModuleLoader__.load({',
  `\tid: ${JSON.stringify(id)},`,
  '\tfactory: (require) => {',
  '\t\tvar module = { exports: {} };',
  '\t\tvar exports = module.exports;',
  '\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
  indent(prelude),
  '\t\t// ── 客户端正文（src/client.js）────────────────────────────────────────',
];
outline.push(indent(body));
outline.push('\t},');
outline.push('});');
outline.push('');
const output = outline.join('\n');
try {
  new Script(output, { filename: 'lib/client.js' });
} catch (err) {
  console.error(`[build-client] 产物语法错误：${err && err.message}`);
  process.exit(1);
}
const target = resolve(root, 'lib', 'client.js');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, output);
const inlined = INLINE_MODULES.map((m) => m.file).join(' + ');
console.error(`built ${target} (${Buffer.byteLength(output)} bytes; inlined: ${inlined})`);
function indent(text) {
  return text.split('\n').map((line) => (line.trim() === '' ? '' : '\t\t' + line)).join('\n');
}
function readInlinedPrelude() {
  const parts = [];
  const injected = new Map();
  for (const mod of INLINE_MODULES) {
    const abs = resolve(root, mod.file);
    const text = readNormalized(abs);
    const code = text
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    const browserSafetyChecks = [
      [/^\s*import\s/m, 'import 语句'],
      [/\brequire\s*\(/, 'require()'],
      [/^\s*export\s+default/m, 'export default'],
      [/\bprocess\.\w/, 'process.*'],
      [/\b__dirname\b|\b__filename\b/, 'CommonJS 路径全局量'],
    ];
    for (const [re, what] of browserSafetyChecks) {
      if (re.test(code)) {
        console.error(`[build-client] ${mod.file} 必须浏览器安全，但含${what}`);
        process.exit(1);
      }
    }
    for (const marker of mod.markers) {
      if (!text.includes(marker)) {
        console.error(`[build-client] ${mod.file} 缺少预期标记：${marker}（结构变了？请同步本脚本）`);
        process.exit(1);
      }
    }
    const decls = [...text.matchAll(DECL_RE)];
    const minIndent = decls.length ? Math.min(...decls.map((m) => m[1].length)) : 0;
    for (const m of decls) if (m[1].length === minIndent) injected.set(m[2], mod.file);
    const EXPORT_BLOCK = /^\s*export\s*\{[\s\S]*?\};?\s*$/m;
    const exp = text.match(EXPORT_BLOCK);
    if (exp) for (const n of exp[0].replace(/^\s*export\s*\{|\};?\s*$/g, '').split(',').map((s) => s.trim()).filter(Boolean)) injected.set(n, mod.file);
    const stripped = text.replace(EXPORT_BLOCK, '').replace(/^\s*export\s+/gm, '');
    if (/^\s*export\b/m.test(stripped)) {
      console.error(`[build-client] ${mod.file} 剥除 export 后仍有残留（导出块不止一块？本仓约定每文件恰好一块）`);
      process.exit(1);
    }
    parts.push(indent(stripped.trim()) + '\n');
  }
  const bodyDecls = new Set([...body.matchAll(/^([ \t]*)(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)]
    .filter((m) => m[1].length === 0)
    .map((m) => m[2]));
  const clashes = [...injected.keys()].filter((name) => bodyDecls.has(name));
  if (clashes.length) {
    console.error('[build-client] src/client.js 重复声明了内联模块提供的常量/函数：' + clashes.join(', '));
    process.exit(1);
  }
  return parts.join('\n');
}
function injectRopeArt(text) {
  const dir = resolve(root, 'assets', 'rope');
  const declRe = /^const (ROPE_IMG_([A-Z0-9_]+)) = "data:image\/png;base64,__ROPE_ART_([A-Z0-9_]+)__";$/gm;
  const hits = [...text.matchAll(declRe)];
  const declared = (text.match(/^const ROPE_IMG_/gm) || []).length;
  if (!hits.length) return text;
  let out = text;
  for (const m of hits) {
    const [, decl, declName, phName] = m;
    if (declName !== phName) {
      console.error(`[build-client] src/client.js 的 ${decl} 与占位符 __ROPE_ART_${phName}__ 名字不一致`
        + '（文件名 = 占位符名的小写形式，改名必须同时动源码与 assets/rope/）');
      process.exit(1);
    }
    const ph = `__ROPE_ART_${phName}__`;
    const anchor = `const ${decl} = "data:image/png;base64,${ph}";`;
    if (text.split(anchor).length !== 2) {
      console.error(`[build-client] 占位符 ${ph} 在正文里不是恰好命中一次 —— `
        + '写重或写漏都会让注入结果不可预测');
      process.exit(1);
    }
    const asset = resolve(dir, `${phName.toLowerCase()}.png`);
    let bytes;
    try {
      bytes = readFileSync(asset);
    } catch {
      console.error(`[build-client] 找不到立绘载荷 ${asset} —— 占位符 ${ph} 没有对应文件`);
      process.exit(1);
    }
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      console.error(`[build-client] ${asset} 不是 PNG（magic 不符）—— data URI 声明的是 image/png，`
        + '载荷就必须真是 PNG');
      process.exit(1);
    }
    out = out.replace(anchor, `const ${decl} = "data:image/png;base64,${bytes.toString('base64')}";`);
  }
  if (declared !== hits.length) {
    console.error(`[build-client] src/client.js 里 const ROPE_IMG_ 声明有 ${declared} 条，`
      + `符合占位符形态的只有 ${hits.length} 条 —— 有一条既没内联字节也没占位符`
      + '（构建期注入是唯一真源，不要手写 base64）');
    process.exit(1);
  }
  if (/__ROPE_ART_[A-Z0-9_]+__/.test(out)) {
    console.error('[build-client] 注入后仍残留 __ROPE_ART_ 占位符 —— 漏了文件或名字对不上');
    process.exit(1);
  }
  return out;
}
function assertNoShadowedScopeDecls() {
  const seen = new Map();
  const dups = [];
  const scan = (file, text, lineOffset) => {
    const decls = [...text.matchAll(DECL_RE)];
    if (!decls.length) return;
    const minIndent = Math.min(...decls.map((m) => m[1].length));
    for (const m of decls) {
      if (m[1].length !== minIndent) continue;
      const at = `${file}:${text.slice(0, m.index).split('\n').length + lineOffset}`;
      const prev = seen.get(m[2]);
      if (prev) dups.push(`${m[2]} —— ${prev} 与 ${at}（后者胜出，前者永不执行）`);
      else seen.set(m[2], at);
    }
  };
  scan('src/client.js', body, codeStart);
  for (const mod of INLINE_MODULES) scan(mod.file, readNormalized(resolve(root, mod.file)), 0);
  if (dups.length) {
    console.error('[build-client] 平铺后同一作用域里有同名顶层声明（后声明静默胜出 ⇒ 前者是死代码；'
      + '反过来删掉后者会让前者无声复活，行为改变而语法层无感）：\n  ' + dups.join('\n  '));
    process.exit(1);
  }
}
function stripHeader(srcText) {
  const lines = srcText.split('\n');
  let codeStart = 0;
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inBlock && /^\s*\/\*\*/.test(line)) inBlock = true;
    else if (inBlock && /\*\/\s*$/.test(line)) { codeStart = i + 1; break; }
  }
  return { body: lines.slice(codeStart).join('\n'), codeStart };
}
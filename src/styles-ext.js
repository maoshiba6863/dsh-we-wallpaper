const CSS_EXT = `  /* ── 软件渲染回退（upstream #95，运行时探测）───────────────────────────────
     有些第三方桌面外壳（增强 / 扩展窗口模式，通常走软件合成）根本不执行
     backdrop-filter，但属性语法是认的 —— 所以上面那些
     @supports not ((backdrop-filter: blur(1px)) or (…)) 回退永远为真、永不启用，
     玻璃面板只剩全透明（「过透」）。detectSoftwareRender() 在运行时探测软件光栅器
     并把结果挂到 body[data-we-glass-fallback]，下面把同一批回退配方原样再挂一次：
     相同的 --we-* token、相同的 color-mix 近不透明声明（不新增任何 token /
     机制），只多一条显式的 backdrop-filter: none（语法检查通过时 @supports
     做不到这件事）。选择器与上面 @supports 回退逐条对应，并保留各自的总开关
     (data-we-sidebar-glass / data-we-glass-window)，所以关掉开关仍然是原生外观。
     输入框卡片按上游 #94 的 ::before 载体单独覆盖（见下方规则）。
     手动覆盖：?we-glassfallback=on|off（见 detectSoftwareRender）。 ── */
  body[data-we-glass-fallback][data-we-sidebar-glass] [data-dsh-better-sidebar] [class*="_boundaryError"],
  body[data-we-glass-fallback][data-we-sidebar-glass] [data-dsh-better-sidebar] [class*="_panel"],
  body[data-we-glass-fallback][data-we-sidebar-glass] [data-dsh-better-sidebar] [class*="_pane"],
  body[data-we-glass-fallback][data-we-sidebar-glass] [data-dsh-better-sidebar] [class*="_tabBar"],
  body[data-we-glass-fallback][data-we-sidebar-glass] [data-dsh-better-sidebar] [class*="_paneCard"],
  body[data-we-glass-fallback][data-we-sidebar-glass] [data-dsh-better-sidebar] [class*="_editorHeader"],
  body[data-we-glass-fallback][data-we-sidebar-glass] [data-dsh-better-sidebar] [class*="_explorerHeader"],
  body[data-we-glass-fallback][data-we-sidebar-glass] [data-dsh-better-sidebar] [class*="_gitHeader"],
  body[data-we-glass-fallback][data-we-sidebar-glass] [data-dsh-better-sidebar] [class*="_browserBar"],
  body[data-we-glass-fallback][data-we-sidebar-glass] [data-dsh-better-sidebar] [class*="_terminalWrap"] {
    background-color: color-mix(in srgb, var(--we-sidebar-color) 92%, transparent) !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  body[data-we-glass-fallback][data-we-sidebar-glass] [data-sidebar-right-panel][data-sidebar-right-open] {
    background-color: color-mix(in srgb, var(--we-sidebar-color) 92%, transparent) !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  /* 左侧栏液态玻璃（leftSidebarGlass）：软件光栅器下模糊被静默忽略 ⇒ 与上面各条同一配方，
     钉成 92% 近不透明玻璃并把不会生效的 backdrop-filter 显式关掉。深色那条多一层
     [data-ds-dark-theme]，与浅色声明同特异度时后写者赢（顺序即优先级）。 */
  body[data-we-glass-fallback][data-we-glass-page][data-we-left-sidebar] div:has(> [data-slot="sidebar"]) {
    background-color: color-mix(in srgb, var(--we-surface-tint-light, #ffffff) 92%, transparent) !important;
    background-image: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  /* issue #131：模糊已搬到列自身的 ::before 上；软件光栅器下同样要显式关掉
     （同一政策：不会生效的 backdrop-filter 不留着）。一条覆盖深浅两色。 */
  body[data-we-glass-fallback][data-we-glass-page][data-we-left-sidebar] div:has(> [data-slot="sidebar"])::before {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  body[data-ds-dark-theme][data-we-glass-fallback][data-we-glass-page][data-we-left-sidebar] div:has(> [data-slot="sidebar"]) {
    background-color: color-mix(in srgb, var(--we-surface-tint-dark, #0d1524) 92%, transparent) !important;
  }
  /* 标题栏液态玻璃（titlebarGlass）：与上面左栏那两条**同一政策** —— 软件光栅器下模糊被
     静默忽略，钉成 92% 近不透明玻璃并把不会生效的 backdrop-filter 显式关掉；深色那条多
     一层 [data-ds-dark-theme]，与浅色声明同特异度时后写者赢（顺序即优先级）。
     ⚠️ 锚点与主块同口径（含 html[data-windows-titlebar] 那道门）：软件渲染时壁纸层
        往往没走 GPU 合成，这条是那批形态唯一的兜底。 */
  html[data-windows-titlebar] body[data-we-glass-fallback][data-we-glass-page][data-we-titlebar-glass][data-we-adapter^="desktop-"] div[class*="pI_x6G_frame"]::before {
    background: color-mix(in srgb, var(--we-surface-tint-light, #ffffff) 92%, transparent) !important;
  }
  /* ⚠️ 模糊现在住在 ::after 上（见主块的两条规则）⇒ 软件光栅器下要关的是**它**，
     不是 ::before —— 关错对象就等于没关（不留不会生效的声明）。 */
  html[data-windows-titlebar] body[data-we-glass-fallback][data-we-glass-page][data-we-titlebar-glass][data-we-adapter^="desktop-"] div[class*="pI_x6G_frame"]::after {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  html[data-windows-titlebar] body[data-ds-dark-theme][data-we-glass-fallback][data-we-glass-page][data-we-titlebar-glass][data-we-adapter^="desktop-"] div[class*="pI_x6G_frame"]::before {
    background: color-mix(in srgb, var(--we-surface-tint-dark, #0d1524) 92%, transparent) !important;
  }
  /* 内容面（编辑器/终端）本来就是近不透明底板（--we-content-surface-alpha，默认
     88%），这里把同一条声明再挂一遍，让软件渲染下三块侧栏区域落在同一个规则块里。 */
  body[data-we-glass-fallback][data-we-sidebar-glass] [data-dsh-better-sidebar] .cm-editor,
  body[data-we-glass-fallback][data-we-sidebar-glass] [data-dsh-better-sidebar] .xterm,
  body[data-we-glass-fallback][data-we-sidebar-glass] [data-sidebar-right-panel][data-sidebar-right-open] .cm-editor,
  body[data-we-glass-fallback][data-we-sidebar-glass] [data-sidebar-right-panel][data-sidebar-right-open] .xterm {
    background-color: color-mix(in srgb, var(--we-content-surface-color, var(--we-panel-color, #1e1f26)) max(calc(var(--we-readability-floor) * 100%), var(--we-content-surface-alpha, 88%)), transparent) !important;
  }
  /* 设置窗口：把三层面板 token 钉回实色（@supports 回退里的同一条 token 覆写），
     并显式关掉不会生效的 backdrop-filter。 */
  body[data-we-glass-fallback][data-we-glass-window] [role="dialog"]:has([data-slot="settings.section"]) {
    --dsw-alias-bg-layer-1: var(--we-surface-tint-light, #ffffff);
    --dsw-alias-bg-layer-2: var(--we-surface-tint-light, #ffffff);
    --dsw-alias-bg-layer-3: var(--we-surface-tint-light, #ffffff);
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  body[data-ds-dark-theme][data-we-glass-fallback][data-we-glass-window] [role="dialog"]:has([data-slot="settings.section"]) {
    --dsw-alias-bg-layer-1: var(--we-surface-tint-dark, #0d1524);
    --dsw-alias-bg-layer-2: var(--we-surface-tint-dark, #0d1524);
    --dsw-alias-bg-layer-3: var(--we-surface-tint-dark, #0d1524);
  }
  /* 软件光栅器（data-we-glass-fallback）下同样把**整窗**的表面令牌钉回实色：
     玻璃配方在这一档等于「半透明 + 无霜」（模糊被下面的回退规则关掉），
     宿主的面板/对话框/按钮面必须回到不透明面板色，否则文字压在壁纸上。
     深色那条选择器多一层 (0,3,1)，才能顶掉 body[data-ds-dark-theme][data-we-glass-page]
     上的玻璃映射。 */
  body[data-we-glass-fallback][data-we-glass-page],
  body[data-ds-dark-theme][data-we-glass-fallback][data-we-glass-page] {
    --dsw-alias-bg-layer-1: var(--we-panel-color, #ffffff);
    --dsw-alias-bg-layer-2: var(--we-panel-color, #ffffff);
    --dsw-alias-bg-layer-3: var(--we-panel-color, #ffffff);
    --dsw-alias-button-elevated-fill: var(--we-panel-color, #ffffff);
    --dsw-specific-selector: var(--we-panel-color, #ffffff);
  }
  /* 思考触发条（本仓新增面，见上面「思考触发条」那一节）：它的底色**本来就**由宿主读那个
     专属令牌 ⇒ 回退档把令牌钉回不透明面板色（--we-panel-color 是主题感知的：浅 #ffffff /
     深 #1e1f26），模糊没了也不会"过透"。hover 档一并钉回同色 —— 与上面三个 layer 令牌在
     回退档统一成同一色的口径一致（降级档不保留悬停反馈，优先保可读）。
     ⚠️ 与主规则同门（data-we-thinking-glass）+ 多一层 fallback 属性：特异性 (0,3,1) 高于
     主规则的 (0,2,1)（深色档 (0,4,1) 高于深色主规则 (0,3,1)）⇒ 覆盖成立。 */
  body[data-we-glass-fallback][data-we-thinking-glass][data-we-glass-page],
  body[data-ds-dark-theme][data-we-glass-fallback][data-we-thinking-glass][data-we-glass-page] {
    --dsw-alias-turn-trigger-bg: var(--we-panel-color, #ffffff);
    --dsw-alias-turn-trigger-bg-hover: var(--we-panel-color, #ffffff);
  }
  /* 输入框卡片（issue #95 报「过透」的那块界面）：上游 #94 已把模糊从卡片本体搬到
     [data-composer-card]::before 载体（卡片上的 backdrop-filter 会成为 fixed 后代的
     包含块，#89）——载体上没有背景，卡片自身的底色只有 --we-glass-alpha（默认 15%），
     所以只关掉 backdrop-filter 仍然过透。这里让 ::before 自己变成近不透明底板：
     载体是同一块表面，模糊没了就由它兜住底色，配方与上面 .we-repo-panel 逐字相同
     （同一个 --we-surface-tint-light/dark / 92%，未新增 token 或机制）。 */
  body[data-we-glass-fallback][data-we-glass-page] [data-composer-card]::before {
    background-color: color-mix(in srgb, var(--we-surface-tint-light, #ffffff) 92%, transparent);
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  /* A near-opaque canvas is only the no-frost fallback, never normal chat. */
  body[data-we-glass-fallback][data-we-glass-page],
  body[data-ds-dark-theme][data-we-glass-fallback][data-we-glass-page] {
    --we-chat-glass-fill: color-mix(in srgb, var(--we-readability-base) 92%, transparent);
    --we-tool-glass-fill: var(--we-chat-glass-fill);
    --we-capsule-glass-fill: var(--we-chat-glass-fill);
  }
  /* ⚠️ 这条与上面 92% 不透明的思考玻璃填充配套，挂同一道门 —— 否则关着思考玻璃的
     fallback 模式也会被摘掉气泡的 backdrop-filter。
     带 :not([role="tooltip"]) 与上面三条同办（#161）：宿主 Tooltip 从来不吃插件霜釉，
     清它不是修 bug 而是保持「一条规则只谈气泡」的可读性 + 让守卫按同一判据数。 */
  body[data-we-glass-fallback][data-we-glass-page][data-we-thinking-glass] [class*="_bubble"]:not([role="tooltip"]) {
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }
  body[data-we-glass-fallback][data-we-glass-page][data-we-thinking-glass] [data-turn-trigger],
  body[data-we-glass-fallback][data-we-glass-page][data-we-thinking-glass] [data-vcp-reasoning],
  body[data-we-glass-fallback][data-we-glass-page][data-we-thinking-glass] [data-changed-files],
  body[data-we-glass-fallback][data-we-glass-page][data-we-thinking-glass] [data-presented-file],
  body[data-we-glass-fallback][data-we-glass-page][data-we-thinking-glass] [data-chat-flow] .md-code-block,
  body[data-we-glass-fallback][data-we-glass-page][data-we-thinking-glass] [data-vcp-rawhtml] > div > div:has(> pre > code):has(> div > button[title="复制代码"]) {
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }
  /* 仓库抽屉：与 @supports 回退逐字相同的 92% 近不透明配方。 */
  body[data-we-glass-fallback] .we-repo-panel {
    background-color: color-mix(in srgb, var(--we-surface-tint-light, #ffffff) 92%, transparent);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .we-rope--settle, .we-repo-panel { transition: none !important; }
  }

  /* ── 「扩展」页签：模块槽位（注册表见 panel-tabs.js 的 extensionModules()）──
     每个模块一张卡：极薄的玻璃底衬 + 圆角，与「关于」页的卡片同一口径
     （不新造颜色，只取主题墨色 / 边框 token）。表里一张模块都没有时只画空态，
     所以下面这几条在没有模块的版本里没有渲染对象。 */
  .we-ext { display: flex; flex-direction: column; gap: 10px; }
  .we-ext__module {
    display: flex; flex-direction: column; gap: 6px; padding: 10px;
    border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.28));
    border-radius: 12px; background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.08));
  }
  .we-ext__module-head { display: flex; align-items: center; gap: 8px; }
  .we-ext__module-title { font-size: 0.85em; font-weight: 600; color: var(--we-ink, inherit); }
  /* 模块级重置按钮（issue #192）↺：外观各节的节头与扩展模块头**共用同一枚**。
     margin-left: auto 把它推到行尾（两者都是 flex 行）。
     ⚠️ 与折叠三角同排时**必须让位**（见下面那条相邻选择器）：三角也靠 margin-left: auto
     推右，两个 auto 在同一 flex 行里会**均分**剩余空间 —— ↺ 于是停在行中间，而"主题"
     （那个节头没有 caret）的 ↺ 贴在最右端，同一批模块两种位置（用户 2026-10-13 报的正是
     这个）。现在的次序是 标签 → 三角 → ↺，三角吃掉剩余空间、↺ 紧跟其后贴在最右一列。
     ⚠️ 本段注释不许出现反引号：整套样式文本是模板字符串，一个反引号就拼断 JS。 */
  .we-mod-reset {
    margin-left: auto; flex: 0 0 auto;
    width: 24px; height: 24px; padding: 0; line-height: 1;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 1em; cursor: pointer;
    border-radius: 999px; corner-shape: round;
    border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.28));
    background: transparent; color: var(--dsw-alias-label-secondary, inherit);
  }
  /* 有折叠三角同排 ⇒ 由三角独占那个 auto（它已是 margin-left: auto），↺ 只留一段间距。
     两者因此成组贴在行尾：…… [▾] [↺]。 */
  .we-picker__section-caret + .we-mod-reset { margin-left: 8px; }
  .we-mod-reset:hover { color: var(--dsw-alias-label-primary, inherit); }
  /* 破坏性动作的用色（「全部重置」）：与别的按钮同形，只在描边与文字上给警示色
     （不填底色 —— 填了在浅色主题下会压过旁边的说明文字）。 */
  .we-picker__btn--danger {
    border-color: color-mix(in srgb, #e5534b 55%, transparent);
    color: #e5534b;
  }
  /* 重置节的标题（页签级「重置本页」/ 全局「重置」）—— 与设置分组卡同字形，但用**独立类名**：
     它是**操作区**不是分组卡（语义更准），同时那些按"分组卡位置"取窗口的判据不会被它干扰
     （3D 效果那一页正好有三张分组卡 + 本节排在末尾，用同名类名会挤掉「背景」）。 */
  .we-picker__section-reset-label {
    font-size: 0.85em; font-weight: 600; color: var(--we-ink, inherit);
  }


  /* ── 「扩展」页签一号模块：自定义会话头像（装饰层见 src/avatar-layer.js）──
     这一层是**宿主会话 DOM 的补丁**：给三类消息行（data-chat-flow-kind = user / steering /
     assistant-step）在最前面插一个 .we-avatar，行本身改横向 flex ⇒ 头像与消息并排；
     用户行反过来（row-reverse）⇒ 先插的那个节点落在最右，于是"你的消息在右、助手在左"。
     关掉开关时节点与属性都被装饰层撤掉 ⇒ 屏上一点痕迹都没有（下面每条规则都挂在开关属性下，
     与思考块玻璃 / 视差同一条门控纪律）。
     尺寸与圆角来自 body 上的两个变量（装饰层按设置写）⇒ 拖滑块只是**变量替换**，不重建节点；
     头像是**一个圆脸**（没导入图就画内置的默认头像 SVG），宽度固定为边长 ⇒ 长消息不会被挤。
     ⚠️ **没有自定义名字行**（用户口径）：这里不要再加名字。

     ⚠️⚠️ 内容那一格必须**穿透槽出口锚点**（issue #154）：宿主把节点渲染包在
     div[data-slot="conversation.chat.node"] 里，并给它写死内联 style="display: contents"
     （宿主 renderer 的 ANCHOR_STYLE，注释明说要让 flex/grid 父级"看见槽自己的孩子"）⇒ 这层
     **没有盒子**：它既不是 flex item，也不接受 flex 属性。所以只写 > :not(.we-avatar) 是
     **打在空气上**——真正成为 flex item 的是锚点的孩子（助手消息的内容根 div.v5IAXa_root），
     它会退回默认 flex: 0 1 auto、主轴尺寸按自身 max-content 算，不再"填满行"；而宿主给
     **收起**状态的思考行写死 contain: size layout（固有尺寸 = 0）⇒ 一行可见内容只剩
     "思考"折叠行时 max-content = 0 ⇒ 该 item 宽 0px，整条消息连着入口一起消失（展开时
     contain:size 失效才可见，再收起又归零 = "关掉后找不到重新打开位置"）。
     故两条选择器都写：直挂内容 + 锚点后面那一层；flex-grow: 1 是这里的要害
     （固有宽为 0 的内容也靠 grow 撑满行）。判据见 test/verify-scene-live.mjs（头像段 CSS 钉法
     + 假 DOM 照宿主真实形态造锚点）。**这一段不许出现反引号**：整套样式文本是被塞进产物里的
     模板字符串，一个反引号就能把 JS 拼断（build-client 会当场报"产物语法错误"）。 */
  body[data-we-avatar="on"] [data-we-avatar-row] { display: flex; align-items: flex-start; gap: 8px; }
  body[data-we-avatar="on"] [data-we-avatar-row="user"] { flex-direction: row-reverse; }
  body[data-we-avatar="on"] [data-we-avatar-row] > :not(.we-avatar),
  body[data-we-avatar="on"] [data-we-avatar-row] > [data-slot] > :not(.we-avatar) { flex: 1 1 auto; min-width: 0; }
  .we-avatar {
    box-sizing: border-box; flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
    width: var(--we-avatar-size, 40px); height: var(--we-avatar-size, 40px);
    border-radius: calc(var(--we-avatar-round, 100) * 0.5%);
    overflow: hidden;
    color: var(--dsw-alias-label-secondary, currentColor);
    background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.16));
    border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.28));
  }
  /* 连续同侧消息的后续行（issue #191 问题 2）：头像**只显示在第一条**。
     ⚠️ 只做 visibility: hidden —— 节点与它的框都还在，缩进对齐与 flex 几何逐字节不变。
     绝不写 display: none / 摘节点：那会让宿主 display:contents 锚点下的内容退回
     flex: 0 1 auto，收起的思考行固有宽为 0 ⇒ 整条消息连入口一起消失（issue #154）。 */
  .we-avatar--cont { visibility: hidden; }
  /* 面板里的预览：固定框（不随滑块长高），里头那张脸按当前大小 / 圆角现画。
     预览用的是自己的一对类名（不是 .we-avatar）—— 那些节点由装饰层建在会话里，
     面板这一份是 React 画的，两边共用的是"零件表与 URL"而不是 DOM 结构。 */
  .we-avatar-preview {
    box-sizing: border-box; flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
    border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.28));
    border-radius: 10px;
  }
  .we-avatar-preview__face {
    box-sizing: border-box; display: flex; align-items: center; justify-content: center;
    overflow: hidden;
    color: var(--dsw-alias-label-secondary, currentColor);
    background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.16));
    border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.28));
  }
  .we-avatar-preview__img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .we-avatar-preview__glyph { display: flex; align-items: center; justify-content: center; }
  .we-avatar-preview__glyph svg { width: 62%; height: 62%; }
  .we-avatar-error { font-size: 0.82em; opacity: 0.9; color: #e5534b; }
  /* 上传裁切弹窗（issue #191 问题 1）：居中模态 + 方形取景框。
     取景框 overflow: hidden 是"框外不显示"的唯一手段；框内那张图由 client.js 现算的
     几何定位（left/top 负偏移），**不用 transform** —— transform 会建合成层，
     而这里每拖一下都改值（见 styles.js 里"不常驻合成层"那条纪律）。 */
  .we-crop {
    position: fixed; inset: 0; z-index: 40;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.45);
  }
  .we-crop__card {
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    padding: 16px; border-radius: 14px; corner-shape: round;
    background: var(--dsw-alias-bg-layer-1, #101418);
    border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.28));
    max-width: min(92vw, 360px);
  }
  .we-crop__title { font-size: 0.95em; font-weight: 600; color: var(--we-ink, inherit); }
  .we-crop__view {
    position: relative; overflow: hidden; flex: 0 0 auto;
    border-radius: 8px; corner-shape: round;
    background: rgba(128, 128, 128, 0.16);
    cursor: grab; touch-action: none;
  }
  .we-crop__img { position: absolute; display: block; pointer-events: none; user-select: none; }
  /* 框线：纯装饰（拖拽由整格接管），压在图上但吃不到指针。 */
  .we-crop__frame {
    position: absolute; inset: 0; pointer-events: none;
    border: 2px solid rgba(255, 255, 255, 0.85);
    border-radius: 8px; corner-shape: round;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
  }
  .we-crop__actions { display: flex; gap: 8px; align-self: stretch; justify-content: flex-end; }
  /* ⚠️ 这里曾有一条**未限定作用域**的 .we-picker__btn--primary 覆盖（PR #202 随裁切弹窗
     加入）：本意应只服务弹窗按钮，实际把**全局**主按钮的文字色改写成 accent，与实心 accent
     底逐像素同色 ⇒ v1.3.2 之后所有主按钮（选择壁纸 / 关于页 Star / 确认并导入…）文字隐形。
     已移除 —— 裁切弹窗的「确认并导入」用标准主按钮款式（styles-panel.js 那条）。
     今后若确需按钮变体：必须带作用域前缀（如 .we-crop__actions 后代），且 background /
     color / border 三类属性写全 —— 只改 color/border 会留下"同色隐形"这种半截状态。 */

  /* ── 侧栏全透明（issue #137，设置键 sidebarFullClear，默认关）──────────────
     用户口径：其他面都能调透，唯独侧栏被可读性下限锁死 —— 地板（浅 0.45 / 深 0.59）
     以带 !important 的 color-mix 恒定掺入，侧栏透明度拉满也绕不过。本组规则在
     **壁纸激活**时把插件画在侧栏上的底色层整块撤掉，让用户主动放弃下限换全透：
       · 第一条按**容器**就地归零六个变量（地板 / 色染 / 釉光三组）：面板规则里的
         color-mix 与白釉渐变在元素上解析时取到的就是 0 ⇒ 玻璃开着时的全部侧栏上色
         规则（深浅两色、@supports 无霜兜底、软件渲染兜底 —— 这些都读这几个变量）
         一起透掉；**以后新增读这些变量的侧栏规则也自动被接管**。自定义属性沿 DOM
         继承 ⇒ 生效与规则书写顺序无关。
       · 右栏第二条与左列第三条是**显式接管**：玻璃关着时右栏兜底读插件面板色、左列
         的浅深与兜底写死 92% 釉色（都不走上面的变量）⇒ 把这两处的底色与釉光直接画
         透。落盘位置晚于全部既有侧栏规则 ⇒ 同特异度后写者赢（含软件渲染深色那档）。
     保留：backdrop-filter 照旧 —— 模糊 / 饱和仍由侧栏模糊与全局雾化旋钮管（要彻底
     清晰就把模糊调 0）；内容面（编辑器 / 终端底板）不归本开关管，仍有自己的透明度
     旋钮。只在壁纸下生效：无壁纸时侧栏压着的是聊天界面，全透不可读。 */
  body[data-we-wallpaper][data-we-sidebar-fullclear] [data-dsh-better-sidebar],
  body[data-we-wallpaper][data-we-sidebar-fullclear] [data-sidebar-right-panel][data-sidebar-right-open] {
    --we-readability-floor: 0;
    --we-sidebar-tint: 0%;
    --we-sidebar-color: transparent;
    --we-sidebar-sheen: 0;
    --we-sidebar-sheen-a: 0;
    --we-sidebar-sheen-b: 0;
    --we-sidebar-sheen-c: 0;
  }
  body[data-we-wallpaper][data-we-sidebar-fullclear] [data-sidebar-right-panel][data-sidebar-right-open] {
    background-color: transparent !important;
    background-image: none !important;
  }
  body[data-we-wallpaper][data-we-sidebar-fullclear][data-we-left-sidebar] div:has(> [data-slot="sidebar"]),
  body[data-ds-dark-theme][data-we-wallpaper][data-we-sidebar-fullclear][data-we-left-sidebar] div:has(> [data-slot="sidebar"]) {
    background-color: transparent !important;
    background-image: none !important;
  }


  /* ── 计费（壁纸插件自带；行为见 src/billing-layer.js 与 lib/billing.js）──
     两个出口都只画一行小字：侧栏底部「今日 ≈¥x · 本会话 ≈¥y」、每轮回复底部
     「本轮 ≈¥x」。金额用等宽数字（tabular-nums），刷新时宽度不跳；颜色走宿主的
     标签令牌，深浅两套主题自动跟随。宿主不可达时组件不渲染，这里不准备错误态。 */
  /* 侧栏底部卡片：逐条照抄 dsh-cost-meter 1.9.7 的 simple 模式口径 ——
     · .cm-footer-stack.simple → 容器：gap:0 · border:1px solid var(--dsw-alias-border-l1)
       · border-radius:10px · background:var(--dsw-alias-bg-layer-1) · overflow 裁角
     · .cm-simple-summary     → 行：flex · space-between · gap:8px · padding:5px 8px
       · 12px/600 · border-bottom:1px solid var(--dsw-alias-border-l1)
     · .cm-num                → 金额等宽数字
     （原文见 1.9.7 src/client/01-open-styles-i18n.js 的 354/369 两条与 .cm-foot 那条） */
  .we-billing-foot {
    display: flex;
    flex-direction: column;
    gap: 0;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.14));
    border-radius: 10px;
    background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.04));
    overflow: hidden;
    /* 3D：A 静态浮雕 —— 顶部内高光、底部内压暗、落地投影；B/C 的变量由 billing-layer.js 写入。
       静态时不写 transform、也不挂 will-change：这卡片在设置窗玻璃的 backdrop 里，
       常驻 3D 合成层会让设置窗滚动时频闪（实测）。3D 只在悬停时上。 */
    position: relative;
    transform-style: preserve-3d;
    transform: none;
    transition: transform 320ms cubic-bezier(0.2, 0.7, 0.2, 1), box-shadow 240ms ease;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      inset 0 -1px 0 rgba(0, 0, 0, 0.28),
      0 1px 2px rgba(0, 0, 0, 0.28),
      0 12px 28px -14px rgba(0, 0, 0, 0.6);
  }
  /* 指针在卡片上时不加缓动，跟手；离开后回弹走上面的 320ms。 */
  .we-billing-foot:hover,
  .we-billing-foot.is-tilting {
    transform:
      perspective(720px)
      rotateX(var(--we-tilt-x, 0deg))
      rotateY(var(--we-tilt-y, 0deg))
      translateZ(var(--we-lift, 0px));
  }
  .we-billing-foot.is-tilting {
    transition: transform 90ms linear, box-shadow 240ms ease;
  }
  .we-billing-foot:hover {
    --we-lift: 6px;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.16),
      inset 0 -1px 0 rgba(0, 0, 0, 0.32),
      0 2px 4px rgba(0, 0, 0, 0.3),
      0 20px 40px -18px rgba(0, 0, 0, 0.7);
  }
  /* C 光斑：跟着指针走的径向高光，不拦鼠标事件。 */
  .we-billing-foot::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    z-index: 3;
    background: radial-gradient(
      160px 120px at var(--we-glare-x, 50%) var(--we-glare-y, 50%),
      rgba(255, 255, 255, 0.14),
      rgba(255, 255, 255, 0.04) 38%,
      transparent 62%);
    opacity: 0;
    transition: opacity 220ms ease;
  }
  .we-billing-foot:hover::after { opacity: 1; }
  @media (prefers-reduced-motion: reduce) {
    .we-billing-foot,
    .we-billing-foot:hover {
      transform: none;
      transition: none;
    }
    .we-billing-foot::after { display: none; }
  }
  .we-billing-foot__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 5px 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--dsw-alias-label-primary, #e6eaf2);
    border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.14));
  }
  .we-billing-foot__row:last-child { border-bottom: 0; }
  .we-billing-foot__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .we-billing-foot__amount {
    flex-shrink: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .we-billing-peak {
    --we-peak-low: #4ade80;
    --we-peak-high: #ff5f5f;
    --we-peak-color: var(--we-peak-low);
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 5px 8px 6px;
    border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.14));
    font-size: 11px;
    line-height: 14px;
    font-variant-numeric: tabular-nums;
  }
  .we-billing-peak--peak { --we-peak-color: var(--we-peak-high); }
  .we-billing-peak__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }
  .we-billing-peak__legend {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
  }
  .we-billing-peak__key {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .we-billing-peak__key::before {
    content: "";
    width: 7px;
    height: 7px;
    border-radius: 2px;
    background: currentColor;
  }
  .we-billing-peak__key--low { color: var(--we-peak-low); }
  .we-billing-peak__key--peak { color: var(--we-peak-high); }
  .we-billing-peak__timeline {
    position: relative;
    padding: 20px 0 3px;
  }
  .we-billing-peak__bar {
    display: flex;
    height: 6px;
    border-radius: 99px;
    overflow: hidden;
    background: color-mix(in srgb, currentColor 12%, var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.1)));
  }
  .we-billing-peak__seg { display: block; height: 100%; }
  .we-billing-peak__seg--low { background: var(--we-peak-low); }
  .we-billing-peak__seg--peak { background: var(--we-peak-high); }
  .we-billing-peak__seg + .we-billing-peak__seg { box-shadow: inset 1px 0 0 rgba(0, 0, 0, 0.22); }
  /* 当前时刻的指针：鲸鱼线稿（横向拉长、尾巴朝左）、头深尾浅的渐变；
     平价=绿、高峰=红，随阶段切换。脚本驱动沿时间线来回游，停下才摆尾。 */
  .we-billing-peak__needle {
    position: absolute;
    top: auto;
    bottom: 9px;
    width: 30px;
    height: 17px;
    margin-left: -15px;
    z-index: 2;
    border-radius: 0;
    background: none;
    pointer-events: none;
    /* 固定初始姿态，避免第一轮从 none 过渡到带透视的姿态（看起来像在原地翻转）。 */
    transform: perspective(260px) rotateY(0deg);
    transform-style: preserve-3d;
    transition: transform 900ms cubic-bezier(0.4, 0, 0.2, 1);   /* 缓慢转身 */
  }
  .we-billing-peak__needle-icon {
    display: block;
    width: 100%;
    height: 100%;
    background: url("data:image/png;base64,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") center bottom / contain no-repeat;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.55));
    /* 停下时只做轻微的上下浮动：旋转会让整条鱼看起来像在原地掉头，去掉。 */
    animation: we-whale-idle-bob 1.8s ease-in-out infinite;
  }
  @keyframes we-whale-idle-bob {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-1.5px); }
  }
  /* 游动中不摆尾；停下（停在真实当前时间点）才摆。 */
  .we-billing-peak__needle[data-we-swim="1"] .we-billing-peak__needle-icon { animation: none; }
  @media (prefers-reduced-motion: reduce) {
    .we-billing-peak__needle-icon { animation: none; }
  }
  .we-billing-peak__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }
  .we-billing-peak__now {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--dsw-alias-label-secondary, #b6bdc9);
    white-space: nowrap;
  }
  .we-billing-peak__now::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--we-peak-color);
  }
  .we-billing-peak__time {
    font-size: 11px;
    color: var(--dsw-alias-label-secondary, #b6bdc9);
    white-space: nowrap;
    margin-left: auto;   /* 无论 head 行怎么排，剩余时间始终贴右 */
    text-align: right;
  }
  .we-billing-peak__meta {
    font-size: 11px;
    line-height: 12px;
    text-align: right;
    color: var(--dsw-alias-label-tertiary, #8b95a7);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* 距转高峰不足 60 秒：切换说明改用高峰红，提示马上涨价。 */
  .we-billing-peak__meta--soon {
    color: var(--we-peak-high, #ff5f5f);
  }
  /* 模型汇总行：对照 1.9.7 简单模式底部的「今日 ¥x · N 模型」。 */
  .we-billing-foot__models {
    padding: 5px 8px;
    font-size: 11px;
    line-height: 15px;
    color: var(--dsw-alias-label-tertiary, #8b95a7);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* 每轮页脚：宿主把 tail 槽放在 div[data-turn-tail] 里、操作行是它的兄弟节点，
     且 tail 在**前**。用 order 把这一行排到操作行**之后**（红框位置）——容器本身就是
     flex 列时生效；不是的话它仍在上方，不会丢内容。 */
  /* 实测父级链：.we-billing-turn ← div（槽位出口，display:contents）← div[data-turn-tail].root。
     出口是 contents ⇒ 我们的节点就是 root 的 flex item，用后代选择器给 order 即可排到
     操作行（MessageIconActions，order 默认 0）**之后**。 */
  [data-turn-tail] .we-billing-turn { order: 2; }
  /* 每轮页脚：跟着操作行的左边缘走（不右对齐），一行内「本轮 + 用量 + ≈金额」。 */
  .we-billing-turn {
    /* 宿主容器（.d1vkyW_root）是 gap:16px 的 flex 列；我们排到操作行之后时，
       16px 会变成一大段空白 —— 用负外边距收回，最终离按钮约 4px。 */
    margin-top: -12px;
    font-size: 11.5px;
    line-height: 18px;
    color: var(--dsw-alias-label-tertiary, #8b95a7);
    text-align: left;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* 查不到轮次时的那一问号：弱化成更淡的提示，不与真实金额混淆。 */
  .we-billing-turn { pointer-events: auto; }
  .we-billing-turn summary {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    list-style: none;
    user-select: none;
  }
  .we-billing-turn summary::-webkit-details-marker { display: none; }
  .we-billing-turn summary::before {
    content: "";
    flex: 0 0 14px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: radial-gradient(circle at center,
      var(--we-billing-target-color, var(--we-accent, #4f8cff)) 0 2px,
      transparent 2.5px 4px,
      var(--we-billing-target-color, var(--we-accent, #4f8cff)) 4.5px 5.5px,
      transparent 6px);
    animation: we-billing-target-breathe 1.8s ease-in-out infinite;
  }
  @keyframes we-billing-target-breathe {
    0%, 100% { transform: scale(1); opacity: 0.55; }
    50% { transform: scale(1.15); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .we-billing-turn summary::before { animation: none; opacity: 0.9; }
  }
  .we-billing-turn__summary {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    /* 本轮费用整行跟着靶心同色、同节拍呼吸：靶心 1.8s 的 0.55↔1，颜色取当前时段色。 */
    color: var(--we-billing-target-color, var(--we-accent, #4f8cff));
    animation: we-billing-summary-breathe 1.8s ease-in-out infinite;
  }
  @keyframes we-billing-summary-breathe {
    0%, 100% { opacity: 0.55; }
    50% { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .we-billing-turn__summary { animation: none; opacity: 0.9; }
  }
  .we-billing-turn__head {
    margin-top: 6px;
    font-size: 11px;
    line-height: 16px;
    font-weight: 600;
    color: var(--dsw-alias-label-secondary, #b6bdc9);
  }
  .we-billing-turn__note {
    margin: 4px 0 2px;
    font-size: 11px;
    line-height: 15px;
    color: var(--dsw-alias-label-tertiary, #8b95a7);
  }
  .we-billing-turn__row {
    font-size: 11px;
    line-height: 16px;
    color: var(--dsw-alias-label-secondary, #b6bdc9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .we-billing-turn--low { --we-billing-target-color: #4ade80; }
  .we-billing-turn--peak { --we-billing-target-color: #ff5f5f; }

`;

export { CSS_EXT };

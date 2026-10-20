const CSS_PANEL = `  /* ── 效果页签空态：不摆一列无效滑块，引导去选壁纸。 ── */
  .we-picker__empty {
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    padding: 36px 16px; text-align: center;
  }
  .we-picker__empty-title { font-size: 0.95em; font-weight: 600; color: var(--we-ink, inherit); }

  /* ── Vinyl record (黑胶唱片): rotating disc with the selected wallpaper's
     cover as the label. Spins while the wallpaper is playing; pauses
     otherwise. Shown in both settings layouts and in the modal head. ── */
  .we-vinyl {
    position: relative; width: 128px; height: 128px; flex: 0 0 auto;
    border-radius: 50%;
    background:
      repeating-radial-gradient(circle at center, #191920 0 2px, #23232c 2px 4px);
    box-shadow:
      0 6px 18px rgba(0, 0, 0, 0.55),
      inset 0 0 0 1px rgba(255, 255, 255, 0.07);
    animation: we-vinyl-spin 8s linear infinite;
    animation-play-state: paused;
  }
  .we-vinyl--playing { animation-play-state: running; }
  .we-vinyl--sm { width: 56px; height: 56px; }
  .we-vinyl__cover {
    position: absolute; inset: 24%; border-radius: 50%; overflow: hidden;
    background: rgba(128, 128, 128, 0.25);
    border: 2px solid rgba(0, 0, 0, 0.85);
    box-shadow:
      0 0 0 2px rgba(255, 255, 255, 0.1),
      inset 0 0 8px rgba(0, 0, 0, 0.6);
  }
  .we-vinyl__cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .we-vinyl__empty {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    color: rgba(255, 255, 255, 0.45); font-size: 1.3em;
  }
  .we-vinyl__hole {
    position: absolute; left: 50%; top: 50%;
    width: 12px; height: 12px; margin: -6px 0 0 -6px;
    border-radius: 50%; background: #0b0b0e;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.9);
  }
  .we-vinyl--sm .we-vinyl__hole { width: 6px; height: 6px; margin: -3px 0 0 -3px; }
  @keyframes we-vinyl-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .we-vinyl { animation: none; }
  }
  .we-picker__modal-head-left { display: flex; align-items: center; gap: 8px; min-width: 0; }

  /* ── Current-wallpaper card: thumbnail + title + type + primary action. ── */
  .we-picker__current {
    display: flex; align-items: center; gap: 10px;
    padding: 10px; border-radius: 12px;
    border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.28));
    background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.06));
  }
  .we-picker__current-info { flex: 1; min-width: 0; }
  .we-picker__current-title {
    font-size: 0.9em; font-weight: 500;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  /* 类型 + 播放态：宽卡片里是标题下的独立一行（普通块级）。 */
  .we-picker__current-meta { display: block; font-size: 0.75em; opacity: 0.55; margin-top: 2px; }
  /* 播放失败 / 选择被过滤排除的原因（#84）: 紧跟在 meta 行下的一句可读说明，
     这两种情况都表现为「壁纸一片空白且无从下手」，故必须可见但克制。 */
  .we-picker__current-error { font-size: 0.75em; opacity: 0.9; margin-top: 2px; color: #e5534b; }
  /* 视频轮播（当前壁纸下方）：视频多选列表限高自滚，勾选行整行可点。 */
  .we-picker__rotation { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
  .we-picker__rotation-list {
    display: flex; flex-direction: column; gap: 2px;
    max-height: 220px; overflow-y: auto; overscroll-behavior: contain;
    padding: 4px; border-radius: var(--we-ui-radius, 8px);
    border: 1px solid var(--dsw-alias-border-l1, rgba(128, 128, 128, 0.2));
    background: rgba(128, 128, 128, 0.06);
  }
  .we-picker__rotation-item {
    display: flex; align-items: center; gap: 8px;
    padding: 4px 6px; border-radius: 6px; cursor: pointer;
    font-size: 0.82em;
  }
  .we-picker__rotation-item:hover { background: var(--we-hover-bg, rgba(128, 128, 128, 0.16)); }
  .we-picker__rotation-item.is-on { background: rgba(128, 128, 128, 0.1); }
  .we-picker__rotation-name {
    flex: 1; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  /* Primary action (选择壁纸): the ONE solid-accent control per view — accent
     is reserved for primary action + selection states, never decoration.
     墨色不写死 #fff：accent 可以是任意亮度（用户配色），亮 accent（黄）上的
     白字就是 issue #127 的「文字与背景同色」—— 按 accent 亮度选墨。 */
  .we-picker__btn--primary {
    color: var(--we-accent-ink, #fff);
    background: var(--we-accent, #4f8cff);
    border-color: transparent;
    font-weight: 600;
  }
  .we-picker__btn--primary:hover {
    background: color-mix(in srgb, var(--we-accent, #4f8cff) 86%, var(--we-accent-ink, #000));
    color: var(--we-accent-ink, #fff);
  }

  /* 壁纸属性入口已并入播放控制行（普通 .we-picker__btn，开着时 is-on）——
     专门的 --props 绿色次级按钮样式随之退役。 */
  .we-picker__btn--mini { padding: 2px 8px; font-size: 0.75em; }

  /* 主操作区（选择壁纸）：宽卡片里并排；抽屉里上下排列（间距 8px）。 */
  .we-picker__current-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
  .we-picker__current-sub { min-width: 0; }

  /* ── 壁纸属性面板 ─────────────────────────────────────────────────────── */
  .we-picker__props {
    margin-top: 8px; padding: 10px; border-radius: 12px;
    border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.28));
    background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.06));
    display: flex; flex-direction: column; gap: 6px;
  }
  .we-picker__props-head { display: flex; align-items: center; gap: 8px; }
  .we-picker__props-title { font-size: 0.85em; font-weight: 600; }
  .we-picker__props-note { flex: 1; min-width: 0; font-size: 0.75em; opacity: 0.6; }
  .we-picker__props-hint { font-size: 0.75em; opacity: 0.85; color: #d29922; }
  .we-picker__props-section { font-size: 0.78em; opacity: 0.6; margin-top: 6px; }
  .we-picker__props-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .we-picker__props-label {
    flex: 1; min-width: 0; font-size: 0.8em;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .we-picker__props-dot { margin-left: 4px; color: #2ea043; font-weight: 700; }
  .we-picker__props-value { flex: 0 0 auto; min-width: 3.2em; text-align: right; font-size: 0.75em; opacity: 0.7; }
  .we-picker__props-check { flex: 0 0 auto; }
  .we-picker__props-color {
    flex: 0 0 auto; width: 46px; height: 22px; padding: 0; cursor: pointer;
    border-radius: 6px; background: transparent;
    border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35));
  }
  .we-picker__props-select, .we-picker__props-text {
    flex: 0 1 52%; min-width: 0; font-size: 0.8em; padding: 3px 6px; border-radius: 8px;
    border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35));
    background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.18)); color: inherit;
  }

  /* Refined range sliders: thin track + circular brand ring thumb. */
  .we-picker__slider {
    -webkit-appearance: none; appearance: none;
    flex: 1; height: 18px; background: transparent; cursor: pointer;
  }
  .we-picker__slider::-webkit-slider-runnable-track {
    height: 4px; border-radius: 2px;
    /* accent 填充段（0 → --we-fill）+ 灰色剩余段 */
    background: linear-gradient(to right,
      var(--we-accent, #4f8cff) var(--we-fill, 0%),
      var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.4)) var(--we-fill, 0%));
  }
  .we-picker__slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 16px; height: 16px; margin-top: -6px; border-radius: 50%;
    background: #fff;
    border: 2px solid var(--we-accent, #4f8cff);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
    transition: transform var(--we-dur-fast, 120ms) var(--we-ease, ease);
  }
  .we-picker__slider:hover::-webkit-slider-thumb { transform: scale(1.12); }
  .we-picker__slider:active::-webkit-slider-thumb { transform: scale(1.2); }
  .we-picker__slider::-moz-range-track {
    height: 4px; border-radius: 2px;
    background: var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.4));
  }
  /* Firefox 的填充段走专用伪元素（不认 webkit 的渐变轨道方案）。 */
  .we-picker__slider::-moz-range-progress {
    height: 4px; border-radius: 2px;
    background: var(--we-accent, #4f8cff);
  }
  .we-picker__slider::-moz-range-thumb {
    width: 16px; height: 16px; border-radius: 50%;
    background: #fff;
    border: 2px solid var(--we-accent, #4f8cff);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  }
  /* （设置行的原生 checkbox 已全部换成胶囊开关 .we-picker__switch；壁纸属性面板的 bool 项仍是原生 checkbox。） */

  /* Sliding toggle switch (紧凑布局). Track + thumb slide left/right with a
     snappy 120ms transition; pinned accent so light themes stay readable. */
  .we-picker__switch {
    position: relative; display: inline-flex; cursor: pointer;
  }
  .we-picker__switch input {
    position: absolute; opacity: 0; width: 0; height: 0;
  }
  .we-picker__switch-track {
    position: relative; width: 36px; height: 20px; border-radius: 999px;
    background: var(--dsw-alias-bg-layer-3, rgba(128, 128, 128, 0.4));
    border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.25));
    box-sizing: border-box;
    transition: background-color 180ms var(--we-ease, ease), border-color 180ms var(--we-ease, ease);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.16);
  }
  .we-picker__switch:hover .we-picker__switch-track { border-color: var(--dsw-alias-label-dimmed, rgba(128, 128, 128, 0.5)); }
  /* 键盘焦点环：input 视觉隐藏但可聚焦，焦点环落在 track 上。 */
  .we-picker__switch input:focus-visible + .we-picker__switch-track {
    outline: 2px solid var(--we-accent, #4f8cff);
    outline-offset: 2px;
  }
  .we-picker__switch input:checked + .we-picker__switch-track {
    background: var(--we-accent, #4f8cff); /* 跟随「配色」设置，不再硬编码 */
  }
  .we-picker__switch-thumb {
    position: absolute; left: 2px; top: 2px;
    width: 14px; height: 14px; border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
    transition: transform 180ms var(--we-ease, ease);
  }
  .we-picker__switch input:checked + .we-picker__switch-track .we-picker__switch-thumb {
    transform: translateX(16px);
  }

  /* Custom chevron for the flat selects (appearance: none removed the native
     arrow; heights stay pinned at 26px so rows can never shift). */
  .we-picker select {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M1 1l3 3 3-3' fill='none' stroke='%23888' stroke-width='1.4' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 8px center;
    padding-right: 24px;
  }

  /* Motion tokens: one shared ease (expo-out) + two durations. */
  .we-picker, .we-picker__modal {
    --we-ease: cubic-bezier(0.16, 1, 0.3, 1);
    --we-dur-fast: 120ms;
    --we-dur: 200ms;
  }
  /* Motion: state-only transitions (background/color/border/transform — never
     layout), token-driven; disabled entirely under prefers-reduced-motion. */
  .we-picker__btn, .we-picker select, .we-picker__card,
  .we-picker__tab, .we-picker__rate, .we-picker__card-hide {
    transition:
      background-color var(--we-dur-fast, 120ms) var(--we-ease, ease),
      border-color var(--we-dur-fast, 120ms) var(--we-ease, ease),
      color var(--we-dur-fast, 120ms) var(--we-ease, ease),
      box-shadow var(--we-dur-fast, 120ms) var(--we-ease, ease),
      transform var(--we-dur-fast, 120ms) var(--we-ease, ease);
  }
  /* 按压反馈：点击即缩，松手回弹（transform = 合成器属性，不引发布局）。 */
  .we-picker__btn:active, .we-picker__rate:active, .we-picker__tab:active {
    transform: scale(0.96);
  }
  @media (prefers-reduced-motion: reduce) {
    .we-picker *, .we-picker__modal, .we-picker__modal * {
      transition: none !important;
      animation: none !important;
    }
  }
  .we-picker__slider-row { display: flex; align-items: center; gap: 10px; }
  .we-picker__label { min-width: 28px; flex: 0 0 auto; color: var(--we-ink, inherit); font-size: 0.88em; }
  /* 滑杆行左侧那个标签可能是**第三方自填的槽名**（别的插件注册进来的元素组，槽名就是 data-slot，
     见 src/parallax-layer.js 的插件组）：超长时不许把滑块与右侧数值挤出卡片 —— 可收缩 + 省略号。
     只作用于滑杆行内部，其它地方的 .we-picker__label（都是宿主自己的短标签）保持原样。 */
  .we-picker__slider-row .we-picker__label {
    flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .we-picker__value {
    min-width: 48px; text-align: right; flex: 0 0 auto;
    padding: 2px 8px; border-radius: 999px; font-size: 0.72em;
    background: var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.14));
    color: var(--we-ink-2, rgba(128, 128, 128, 0.9));
  }
  /* 可取数的数值区（SliderRow 的 numberEdit 行）：数值框与单位共用一个胶囊 ——
     框本身去边框/底色、宽度按内容、去掉 spinner，数值与单位同色同字号；
     键盘可达（回车 / 失焦提交）。 */
  .we-picker__value-input {
    width: 3.6em; min-width: 0; padding: 0 2px; margin: 0;
    border: 0; background: transparent; text-align: right;
    color: inherit; font: inherit; line-height: 1.2;
  }
  .we-picker__value-input:focus { outline: none; }
  .we-picker__value-input::-webkit-inner-spin-button,
  .we-picker__value-input::-webkit-outer-spin-button { -webkit-appearance: none; appearance: none; margin: 0; }
  .we-picker__value-unit { opacity: 0.9; }
  .we-picker__text { flex: 1; min-width: 0; }
  /* Wallpaper thumbnail grid (main picker).
     Cards use a FIXED height + absolutely-positioned filling <img>, never
     aspect-ratio: some browsers (old Chromium/WebView) ignore aspect-ratio on
     cards and let percentage-height images resolve to their intrinsic size,
     which made previews bleed over the row above. inset:0 + overflow:hidden
     pins the image inside the card in every engine. */
  .we-picker__grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px; max-height: 280px; overflow-y: auto; padding: 2px;
    /* hover 放大（CD 架 scale 1.12）不得撑出水平滚动条：clip 裁掉溢出且不
       产生滚动条（hidden 仍可被程序滚动，clip 才是纯裁剪），scrollbar-gutter
       让垂直滚动条的出现/消失也不再挤压内容 —— 两者一起消除「hover 最后一列
       → 溢出 → 滚动条 → 宽度变化 → unhover → 回缩」的震荡循环。 */
    overflow-x: hidden; /* fallback：老旧内核不认识 clip 时的平替 */
    overflow-x: clip;
    scrollbar-gutter: stable;
  }
  .we-picker__card {
    position: relative; height: 92px; padding: 0; cursor: pointer;
    display: block; overflow: hidden;
    border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35));
    border-radius: 8px;
    background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.15));
  }
  .we-picker__card img {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover; display: block;
    /* 加载淡入（onLoad 置 opacity:1）+ hover 微放大（合成器属性）。 */
    opacity: 0;
    transition:
      opacity var(--we-dur, 200ms) ease,
      transform 300ms var(--we-ease, ease);
  }
  /* hover 缩略图缓放大 —— 仅非 CD 架模式（CD 架是卡片整体 scale，叠加会双重放大）。 */
  .we-picker:not([data-we-cards="classic"]) .we-picker__card:hover img,
  .we-picker__modal:not([data-we-cards="classic"]) .we-picker__card:hover img {
    transform: scale(1.06);
  }
  /* 黑胶封面加载淡入。 */
  .we-vinyl__cover img {
    opacity: 0;
    transition: opacity var(--we-dur, 200ms) ease;
  }
  /* Classic — "CD 架" (CD-rack) card style: cards stack like CD jewel cases
     on a rack. Each row strongly overlaps the row ABOVE it (the lower card's
     top covers roughly half of the upper card's bottom — vertical only, never
     horizontal), with a soft drop shadow for shelf depth. Hovering scales the
     card up and brings it to the front. Opt-in via the 卡片样式 switch. The
     modal is PORTALLED onto <body>, so the attribute is scoped on BOTH the
     settings root and the modal element. The grid gets extra bottom padding
     so the last row's overlap is not clipped. */
  .we-picker[data-we-cards="classic"] .we-picker__grid,
  .we-picker__modal[data-we-cards="classic"] .we-picker__grid {
    /* Compact CD-rack columns: ~7 cards per row at modal width. 两侧留出
       8px 让位列：最左/最右列 hover 放大 12%（≈6px/侧）时在让位区内展开，
       不触碰溢出边界、不被 clip 裁掉。 */
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    padding: 2px 8px 42px;
  }
  .we-picker[data-we-cards="classic"] .we-picker__card,
  .we-picker__modal[data-we-cards="classic"] .we-picker__card {
    position: relative; width: 100%; padding: 0; cursor: pointer;
    height: auto; aspect-ratio: 16 / 9; display: block; overflow: hidden;
    margin-bottom: -36px;
    border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35));
    border-radius: 8px;
    background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.15));
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
    transition: transform 120ms ease, box-shadow 120ms ease;
  }
  .we-picker[data-we-cards="classic"] .we-picker__card:hover,
  .we-picker__modal[data-we-cards="classic"] .we-picker__card:hover {
    transform: scale(1.12);
    z-index: 10;
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.5);
  }
  .we-picker[data-we-cards="classic"] .we-picker__card img,
  .we-picker__modal[data-we-cards="classic"] .we-picker__card img {
    position: static; width: 100%; height: 100%; object-fit: cover; display: block;
  }
  .we-picker__card--selected {
    outline: 2px solid var(--we-accent, #4f8cff);
    outline-offset: -2px;
    /* 选中即"发光"：accent 色柔光晕，比裸描边更读得出"当前"。 */
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--we-accent, #4f8cff) 45%, transparent),
      0 4px 16px color-mix(in srgb, var(--we-accent, #4f8cff) 30%, transparent);
  }
  .we-picker__card-close {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.8em; color: var(--dsw-alias-label-secondary, #888);
  }
  .we-picker__card-title {
    position: absolute; left: 0; right: 0; bottom: 0; padding: 3px 6px;
    font-size: 0.7em; line-height: 1.2; color: #fff;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
    text-overflow: ellipsis; white-space: nowrap; overflow: hidden;
  }
  /* Scene-wallpaper "实时帧" badge — top-right under the hide button.
     作用域钉在**缩略图卡片**里：卡头的可播放计数徽标（.we-picker__card-head 下）
     同名，不能被这条 absolute 角标规则盖掉（那一枚走 .we-picker__card-badge 的基样式，行内计数）。 */
  .we-picker__card .we-picker__card-badge {
    position: absolute; top: 4px; right: 4px; z-index: 1;
    padding: 1px 6px; font-size: 0.62em; line-height: 1.6;
    border-radius: 4px; color: #fff;
    background: rgba(30, 90, 160, 0.85);
  }
  .we-picker__card-placeholder {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.72em; opacity: 0.55;
  }
  /* Per-card wallpaper-type badge (视频 / 网页 / 图片 / 场景) — top-left
     overlay, always visible (the type filter's own labels). In batch mode the
     selection checkbox (.we-picker__card-check) owns the same corner, so the
     badge is not rendered at all then. */
  .we-picker__card-type {
    position: absolute; top: 4px; left: 4px; z-index: 2;
    padding: 2px 7px; font-size: 0.68em; line-height: 1.5;
    border-radius: 4px; color: #fff;
    background: rgba(0, 0, 0, 0.6);
    pointer-events: none;
  }
  /* Per-card "hide" button (soft delete) — top-right overlay. 默认隐去，
     hover / 键盘聚焦（focus-within）时浮现：网格不常驻一层噪声按钮。 */
  .we-picker__card-hide {
    position: absolute; top: 4px; right: 4px; z-index: 2;
    padding: 2px 7px; font-size: 0.68em; line-height: 1.5;
    border: 0; border-radius: 4px; cursor: pointer;
    background: rgba(0, 0, 0, 0.6); color: #fff;
    opacity: 0;
  }
  .we-picker__card:hover .we-picker__card-hide,
  .we-picker__card:focus-within .we-picker__card-hide { opacity: 1; }
  .we-picker__card-hide:hover { background: rgba(190, 50, 50, 0.9); }
  /* Batch-mode selection check — top-left overlay. */
  .we-picker__card-check {
    position: absolute; top: 4px; left: 4px; z-index: 2;
    width: 18px; height: 18px; border-radius: 4px;
    background: rgba(0, 0, 0, 0.6); color: #fff;
    font-size: 12px; line-height: 18px; text-align: center;
  }
  /* 批量勾选高亮：独立的 --checked class（勾选 ≠ 当前播放的 --selected）。 */
  .we-picker__card--checked {
    outline: 2px solid var(--we-accent, #4f8cff);
    outline-offset: -2px;
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--we-accent, #4f8cff) 45%, transparent),
      0 4px 16px color-mix(in srgb, var(--we-accent, #4f8cff) 30%, transparent);
  }
  .we-picker__card--checked .we-picker__card-check {
    background: var(--we-accent, #4f8cff);
  }
  /* Hidden wallpapers view: dimmed cards. */
  .we-picker__card--hidden { opacity: 0.78; }
  .we-picker__card--hidden .we-picker__card-title {
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.78));
  }
  /* Batch-action bar. */
  .we-picker__batch-bar {
    padding: 4px 6px; border-radius: 6px;
    border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35));
  }
  /* ── 壁纸库下钻视图 ────────────────────────────────────────────────────────
     116 个按层级/相邻关系绑定的 .we-picker__* 选择器不许漂，「modal」只剩类名。
     视觉上就是页签面板的就地内容：无自身边框/底色/阴影/滚动 —— 整页由设置对话框的
     内容列滚动。 */
  .we-picker__modal {
    display: flex; flex-direction: column; gap: 10px;
    /* 换入动画与页签一致（该节点在 pickerOpen 翻转时新挂载，动画自然会跑）。 */
    animation: we-tab-in 180ms var(--we-ease, cubic-bezier(0.16, 1, 0.3, 1));
  }
  .we-picker__modal-head {
    display: flex; align-items: center; justify-content: space-between;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.22));
  }
  .we-picker__modal-title { font-weight: 600; font-size: 0.95em; }
  .we-picker__modal-tabs { display: flex; gap: 6px; }
  .we-picker__tab {
    flex: 1; padding: 0; text-align: center; font-size: 0.82em; cursor: pointer;
    border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35));
    border-radius: 6px; background: transparent;
    color: var(--dsw-alias-label-secondary, #888);
  }
  .we-picker__tab--active {
    background: var(--we-accent, #4f8cff);
    border-color: var(--we-accent, #4f8cff);
    /* 墨随 accent 亮度选（issue #127 同款：亮 accent 上写死白字不可读）。 */
    color: var(--we-accent-ink, #fff);
  }
  .we-picker__modal-body {
    display: flex; flex-direction: column; gap: 8px;
    /* 卡片 hover 放大的横向溢出裁切；纵向滚动交给设置页内容列（本层只裁横轴）。 */
    overflow-x: hidden; /* fallback：老旧内核不认识 clip 时的平替 */
    overflow-x: clip;
  }
  /* 网格高度放开（沿用弹框时代的规则：不设内部 280px 滚动，随内容生长）。 */
  .we-picker__modal-body .we-picker__grid { max-height: none; }
  /* 库视图虚拟滚动的占位行（picker-modal 的 renderVSpacer）：撑出未渲染部分的高度。
     网格里必须 grid-column 全跨整行，否则会占一个卡位把可见卡片挤错行。行高常量
     PICKER_CARD_H / PICKER_CARD_GAP 在 src/picker-modal.js 顶层，两边必须同步改。 */
  .we-picker__vspacer { width: 100%; pointer-events: none; }
  .we-picker__grid .we-picker__vspacer { grid-column: 1 / -1; }
  .we-picker__modal-foot { display: flex; align-items: center; justify-content: space-between; }
  /* Custom-upload section. */
  .we-picker__uploads {
    display: flex; flex-direction: column; gap: 6px;
    padding: 10px; border-radius: 10px;
    border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.26));
    background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.05));
  }
  .we-picker__file { flex: 1; min-width: 0; max-width: 260px; font-size: 0.8em; }
  .we-picker__uploads-list {
    display: flex; flex-direction: column; gap: 4px; max-height: 150px; overflow-y: auto;
  }
  .we-picker__uploads-item {
    display: flex; align-items: center; gap: 8px;
    padding: 3px 6px; border-radius: 6px;
    background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.12));
  }
  .we-picker__uploads-name {
    flex: 1; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: 0.82em;
  }
  .we-picker__uploads-path {
    flex: 1; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: 0.8em; opacity: 0.85;
  }
  /* ── 目录浏览器（缓存位置「更改」弹出的面板）：宿主列目录，点行进入、地址栏可手输。
     只读既有令牌（本块不声明任何 --dsw-* 变量，令牌契约白名单不动）。 ── */
  .we-dirpick {
    display: flex; flex-direction: column; gap: 6px;
    padding: 8px; border-radius: 10px;
    border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.26));
    background: var(--dsw-alias-bg-layer-1, rgba(128, 128, 128, 0.05));
  }
  .we-dirpick__bar { display: flex; gap: 6px; }
  .we-dirpick__path { flex: 1; min-width: 0; font-size: 0.8em; }
  .we-dirpick__chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .we-dirpick__chip { height: 24px; padding: 0 10px; font-size: 0.78em; }
  .we-dirpick__list {
    display: flex; flex-direction: column; gap: 2px;
    max-height: 180px; overflow-y: auto;
    border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.18));
    border-radius: 8px; padding: 3px;
  }
  .we-dirpick__item {
    /* **flex: none** 是这条规则里最重要的一句：列表是纵向 flex 容器且 max-height 180px，
       目录一多（D:\ 实测 119 项）默认的 flex-shrink 会把每行压到只剩上下 padding
       （8px 高），13px 的文字被 overflow:hidden 裁成一条细缝 —— 用户看到的正是
       「列表看着有内容、每一行却什么都读不到」。行高必须钉死为内容高。 */
    flex: none;
    display: block; width: 100%; text-align: left; cursor: pointer;
    padding: 4px 8px; border: 0; border-radius: 6px;
    /* 墨色**直接吃宿主系统令牌**（用户口径：跟随 DSH 的系统设置）—— 与同一面板里
       可见的 chips / 标签同族，条目永远跟面板其它文字同色，不单走一条会变黑的链。
       字体也用 font 简写从面板继承（button 的 UA 字体不继承，chips 同款做法）。 */
    color: var(--dsw-alias-label-primary, var(--we-ink, inherit));
    font: inherit; font-size: 0.82em;
    /* 行底淡染：任何令牌环境下「行」本身都找得到（文字若仍异常，行不会整体隐形）。 */
    background: rgba(128, 128, 128, 0.08);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .we-dirpick__item:hover { background: var(--we-hover-bg, rgba(128, 128, 128, 0.16)); }
  .we-dirpick__empty { font-size: 0.8em; opacity: 0.7; padding: 6px 8px; }
  .we-dirpick__foot { display: flex; align-items: center; gap: 6px; }
  .we-dirpick__sel {
    flex: 1; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  /* Segmented-control family: the playback-rate control (video wallpapers only) and the
     frame-rate-cap tier row in the 效果 tab both wrap their buttons in .we-picker__seg. */
  .we-picker__seg { display: flex; gap: 4px; flex: 1; min-width: 0; }
  .we-picker__rate {
    flex: 1; height: var(--we-ui-h, 30px); padding: 0; text-align: center; font-size: 0.78em;
    border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35));
    border-radius: var(--we-ui-radius, 8px); background: transparent; cursor: pointer;
    color: var(--we-ink-2, rgba(128, 128, 128, 0.9));
  }
  .we-picker__rate + .we-picker__rate { margin-left: 0; }
  .we-picker__rate--active {
    background: var(--we-accent, #4f8cff);
    border-color: var(--we-accent, #4f8cff);
    color: #fff;
  }
  /* 会话布局：两段并成一颗按钮（左居中 / 右铺开），中间共用一条描边，选中段整段强调色高亮。 */
  .we-picker__seg--joined { gap: 0; border-radius: var(--we-ui-radius, 8px); }
  .we-picker__seg--joined .we-picker__rate { border-radius: 0; }
  .we-picker__seg--joined .we-picker__rate:first-child {
    border-top-left-radius: var(--we-ui-radius, 8px);
    border-bottom-left-radius: var(--we-ui-radius, 8px);
  }
  .we-picker__seg--joined .we-picker__rate:last-child {
    margin-left: -1px;
    border-top-right-radius: var(--we-ui-radius, 8px);
    border-bottom-right-radius: var(--we-ui-radius, 8px);
  }

`;

export { CSS_PANEL };

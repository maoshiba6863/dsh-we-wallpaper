  const QP_ROW_H = 34;
  const QP_ROW_GAP = 2;
  const QP_CARD_H = 92;
  const QP_CARD_GAP = 8;
  const QP_CARD_MIN = 130;
  const QP_VP_OVERSCAN = 6;
  const QP_VP_FIRST = 30;

  function qpFindScroller(el) {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      let oy = "";
      try { oy = getComputedStyle(node).overflowY; } catch {   }
      if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight + 1) return node;
    }
    return null;
  }

  function qpVirtWindow(ref, count, itemH, gap, cards, tag) {
    const [win, setWin] = React.useState(() => ({ start: 0, end: QP_VP_FIRST, cols: 0, cards: false, tag }));
    const metaRef = React.useRef(null);
    metaRef.current = { count, itemH, gap, cards };
    React.useEffect(() => {
      const el = ref.current;
      if (!el) return undefined;
      let raf = 0;
      const measure = () => {
        raf = 0;
        const meta = metaRef.current || { count: 0, itemH: QP_ROW_H, gap: QP_ROW_GAP, cards: false };
        const pitch = meta.itemH + meta.gap;

        let cols = 1;
        if (meta.cards) {
          const W = el.clientWidth;
          const card = el.querySelector(".we-qp__card");
          const cw = card ? card.offsetWidth : 0;
          cols = cw > 0
            ? Math.max(1, Math.round((W + meta.gap) / (cw + meta.gap)))
            : Math.max(1, Math.floor((W + meta.gap) / (QP_CARD_MIN + meta.gap)));
        }
        const sc = qpFindScroller(el);
        let hidden = 0; let view = Infinity;
        if (sc === el) { hidden = el.scrollTop; view = el.clientHeight; }
        else if (sc) {
          const a = sc.getBoundingClientRect();
          const b = el.getBoundingClientRect();
          hidden = Math.max(0, a.top - b.top);
          view = a.height;
        }
        const rowsTotal = Math.max(1, Math.ceil(meta.count / cols));
        const r0 = Math.max(0, Math.floor(hidden / pitch) - QP_VP_OVERSCAN);
        const r1 = view === Infinity
          ? rowsTotal
          : Math.min(rowsTotal, Math.ceil((hidden + view) / pitch) + QP_VP_OVERSCAN);
        const start = r0 * cols;
        const end = Math.min(meta.count, r1 * cols);
        setWin((w) => (w.start === start && w.end === end && w.cols === cols && w.cards === meta.cards && w.tag === tag
          ? w : { start, end, cols, cards: meta.cards, tag }));
      };
      const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };
      el.scrollTop = 0;
      measure();
      const sc = qpFindScroller(el);
      if (sc) sc.addEventListener("scroll", schedule, { passive: true });

      const ro = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
      if (ro) ro.observe(el);
      window.addEventListener("resize", schedule);
      return () => {
        if (raf) cancelAnimationFrame(raf);
        if (sc) sc.removeEventListener("scroll", schedule);
        if (ro) ro.disconnect();
        window.removeEventListener("resize", schedule);
      };
    }, [ref, count, itemH, gap, cards, tag]);
    return win;
  }

  function qpTypes() {
    return [
      { id: "all", label: weT("全部") },
      { id: "scene", label: weT("场景") },
      { id: "web", label: weT("网页") },
      { id: "video", label: weT("视频") },
      { id: "image", label: weT("图片") },
    ];
  }

  function qpTypeLabelOf(id) {
    const hit = qpTypes().find((t) => t.id === id);
    return hit ? hit.label : String(id || "");
  }

  function qpRatings() {
    return [
      { id: "all", label: weT("全部") },
      { id: "everyone", label: weT("全年龄") },

      { id: "pg13", label: "PG13" },
      { id: "mature", label: weT("成人") },
      { id: "unrated", label: weT("未分级") },
    ];
  }

  function qpRatingLabelOf(id) {
    const hit = qpRatings().find((r) => r.id === id);
    return hit ? hit.label : String(id || "");
  }

  const QP_TABS = [
    { id: "wallpaper", get label() { return weT("壁纸"); } },
    { id: "appearance", get label() { return weT("外观"); } },
    { id: "playback", get label() { return weT("播放"); } },
  ];

  const QP_TAB_KEY = "dsh-wallpaper-engine:qp-tab";

  function readQpTab() {
    try {
      const v = localStorage.getItem(QP_TAB_KEY);
      if (v && QP_TABS.some((t) => t.id === v)) return v;
    } catch {   }
    return "wallpaper";
  }

  function sidebarCtxStub(name) {
    const boom = () => { throw new Error("[we-sidebar] ctx." + name + " 属于设置页，侧栏档不提供"); };
    return new Proxy(function () {}, { get: boom, apply: boom });
  }
  const QP_CTX_SETTINGS_ONLY = [

    "onGlassDarkSeparate",

    "glassPresets",

    "onClearCustomFrame", "onClearGpuFrame", "onCustomFrameFile",
    "onRecaptureGpuFrame", "onRefreshFrame",

    "onFpsCap",
  ];

  let qpSettingsOnlyCtx = null;
  function sidebarRenderCtx(provided) {
    if (!qpSettingsOnlyCtx) {
      qpSettingsOnlyCtx = {};
      for (const k of QP_CTX_SETTINGS_ONLY) qpSettingsOnlyCtx[k] = sidebarCtxStub(k);
    }
    return Object.assign({ surface: "sidebar" }, qpSettingsOnlyCtx, provided);
  }

  const QP_VIEW_KEY = "dsh-wallpaper-engine:qp-view";

  function readQpView() {
    try {
      return localStorage.getItem(QP_VIEW_KEY) === "list" ? "list" : "cards";
    } catch { return "cards"; }
  }

  const QP_FONT_OPEN_KEY = "dsh-wallpaper-engine:qp-font-open";
  const QP_GLASS_DETAIL_KEY = "dsh-wallpaper-engine:qp-glass-detail";
  const QP_UI_COLOR_OPEN_KEY = "dsh-wallpaper-engine:qp-ui-color-open";
  const QP_DETAIL_OPEN_KEY = "dsh-wallpaper-engine:qp-detail-open";
  const QP_GLASS_UI_OPEN_KEY = "dsh-wallpaper-engine:qp-glass-ui-open";
  const QP_CORNERS_OPEN_KEY = "dsh-wallpaper-engine:qp-corners-open";

  function readQpOpen(key, defaultOpen) {
    try {
      const v = localStorage.getItem(key);
      if (v === null) return defaultOpen === true;
      return v === "1";
    } catch { return defaultOpen === true; }
  }

  function writeQpOpen(key, open) {
    try { localStorage.setItem(key, open ? "1" : "0"); } catch {   }
  }

  function qpTypeLabel(w, sel) {
    if (!w) return "";
    const live = (w.type === "scene" || w.type === "web") && liveRenderEnabled(sel);
    if (w.type === "scene") return weT(live ? "场景 · 实时渲染" : "场景 · 静态帧");
    if (w.type === "web") return weT(live ? "网页 · 实时渲染" : "网页 · 兼容模式");
    return CARD_TYPE_LABELS[w.type] || weT("壁纸");
  }

  function qpRenderRow(w, sel) {

    return React.createElement("div", {
      key: w.id,

      "data-we-id": String(w.id),
      className: "we-qp__item" + (w.id === sel.id ? " we-qp__item--current" : ""),
      role: "option",
      tabIndex: 0,
      "aria-selected": w.id === sel.id ? "true" : "false",
      title: w.title,
      onClick: () => applySelection(w.id, { fromManual: true }),
      onKeyDown: cardKeyDown,
    },
      React.createElement("span", { className: "we-qp__item-thumb" },
        w.preview
          ? React.createElement("img", {
              src: w.preview, alt: "", loading: "lazy",
              onError: (e) => { e.target.style.display = "none"; },
              onLoad: (e) => { e.target.style.opacity = "1"; },
            })
          : null),
      React.createElement("span", { className: "we-qp__item-title" }, w.title),
      w.id === sel.id
        ? React.createElement("span", { className: "we-qp__item-badge" }, weT("当前"))
        : React.createElement("span", { className: "we-qp__item-type" }, CARD_TYPE_LABELS[w.type] || weT("壁纸")),
    );
  }

  function qpRenderCard(w, sel) {

    return React.createElement("div", {
      key: w.id,

      "data-we-id": String(w.id),
      className: "we-qp__card" + (w.id === sel.id ? " we-qp__card--current" : ""),
      role: "option",
      tabIndex: 0,
      "aria-selected": w.id === sel.id ? "true" : "false",
      title: w.title,
      onClick: () => applySelection(w.id, { fromManual: true }),
      onKeyDown: cardKeyDown,
    },
      w.preview
        ? React.createElement("img", {
            src: w.preview, alt: "", loading: "lazy",
            onError: (e) => { e.target.style.display = "none"; },
            onLoad: (e) => { e.target.style.opacity = "1"; },
          })
        : React.createElement("span", { className: "we-qp__card-empty" }, weT("无预览")),
      React.createElement("span", { className: "we-qp__card-type" }, CARD_TYPE_LABELS[w.type] || weT("壁纸")),
      w.id === sel.id && React.createElement("span", { className: "we-qp__card-badge" }, weT("当前")),
      React.createElement("span", { className: "we-qp__card-title" }, w.title),
    );
  }

  function qpRenderSpacer(key, h) {

    return React.createElement("div", {
      key,
      className: "we-qp__vspacer",
      style: { height: Math.max(0, h) + "px" },
      "aria-hidden": "true",
    });
  }

  function qpRenderCurrent(sel, current, playbackLive) {

    return React.createElement("div", {
      className: "we-qp__current" + (playbackLive ? " we-qp__current--playing" : ""),
    },
      React.createElement("span", { className: "we-qp__thumb" },
        current && current.preview
          ? React.createElement("img", {
              src: current.preview, alt: "", loading: "lazy",
              onError: (e) => { e.target.style.display = "none"; },
              onLoad: (e) => { e.target.style.opacity = "1"; },
            })
          : null),
      React.createElement("div", { className: "we-qp__current-info" },
        React.createElement("div", { className: "we-qp__title", title: current ? current.title : "" },
          sel.id && current ? current.title : weT("未选择壁纸")),
        React.createElement("div", { className: "we-qp__meta" },
          current
            ? qpTypeLabel(current, sel) + weT(playbackLive ? " · 播放中" : " · 已暂停")
            : weT("从下面列表挑一张")),
        sel.videoError && React.createElement("div", { className: "we-picker__current-error" }, sel.videoError),
      ),
      React.createElement("div", { className: "we-qp__current-actions" },
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onTogglePlay, disabled: !sel.url,
        }, playbackLive ? weT("暂停") : weT("播放", null, "play")),

        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: () => loadInventory(), disabled: sel.loading,
          title: weT("重新扫描 Wallpaper Engine 壁纸库（新装 / 已删除的壁纸立即出现）"),
        }, sel.loading ? weT("刷新中…") : weT("刷新")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onClear, disabled: !sel.id,
          title: weT("清除当前壁纸（停止播放，回到无壁纸状态）"),
        }, weT("清除")),
      ),
    );
  }

  function qpRenderRotation(sel, groups, playable) {
    return React.createElement("div", { className: "we-qp__section" },
      React.createElement("div", { className: "we-qp__row" },
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onNextWallpaper,
          disabled: playable.length < 2,
          title: weT("切到下一张"),
        }, weT("下一张")),
      ),
    );
  }

  function qpRenderTabs(qpTab, switchQpTab) {

    return React.createElement("div", {
      className: "we-tabs we-qp__tabs", role: "tablist", "aria-label": weT("壁纸面板分区"),
    },
      React.createElement("span", {
        className: "we-tabs__pill",
        "aria-hidden": "true",
        style: {
          width: "calc((100% - 6px) / " + QP_TABS.length + ")",
          transform: "translateX(" + Math.max(0, QP_TABS.findIndex((t) => t.id === qpTab)) * 100 + "%)",
        },
      }),
      QP_TABS.map((t) => React.createElement("button", {
        key: t.id,
        type: "button",
        role: "tab",
        "aria-selected": qpTab === t.id ? "true" : "false",
        className: "we-tabs__tab" + (qpTab === t.id ? " we-tabs__tab--active" : ""),
        onClick: () => switchQpTab(t.id),
      }, t.label)),
    );
  }

  function qpRenderPropsButton(qpTab, switchQpTab) {

    return React.createElement("button", {
      className: "we-picker__btn we-qp__propsbtn" + (userPropsPanelOpen() ? " is-on" : ""),
      type: "button",
      "aria-expanded": userPropsPanelOpen() ? "true" : "false",
      title: weT("壁纸作者提供的可调属性（改动立即生效）"),
      onClick: () => {
        if (qpTab === "wallpaper") {
          if (userPropsPanelOpen()) closeUserPropsPanel(); else openUserPropsPanel();
          return;
        }
        switchQpTab("wallpaper");
        openUserPropsPanel();
      },
    }, userPropsPanelOpen() ? weT("收起壁纸属性") : weT("壁纸属性"));
  }

  function qpRenderAppearancePane(sel, ui) {

    return renderAppearanceTab(sidebarRenderCtx({
      setSetting, setTransient, sel,

      onResetModule,
      onAccent, onBlur, onBorder, onChatGlassFidelity, onChatLayout, onExtraGlassSelectors, onGlassAlpha, onGlassColor, onGlassFidelity, onLeftSidebarGlass, onTitlebarGlass, onSidebarGlass, onSidebarFullClear, onToggleThemeFollow,

      onSidebarAllCorners, onSidebarCornerRadius, onSidebarCornerSquare,
      onCaretColor, onSidebarFollowGlobal, onThinkingMode,

      uiColorOpen: ui.uiColorOpen, onToggleUiColorSection: ui.onToggleUiColorSection,
      onToggleUiColorCustom, onUiColorElement,

      detailOpen: ui.detailOpen, onToggleDetailSection: ui.onToggleDetailSection,
      glassUiOpen: ui.glassUiOpen, onToggleGlassUiSection: ui.onToggleGlassUiSection,
      cornersOpen: ui.cornersOpen, onToggleCornersSection: ui.onToggleCornersSection,

      paneWidth: ui.paneWidth,

      fontOpen: ui.fontOpen, onToggleFontSection: ui.onToggleFontSection,
      fontSet: fontSetCtx(), officialColorOf,
      onComponentFamily, onComponentFont, onFontAdvanced, onFontResetAll, onGlobalFamily,
      onRefreshSystemFonts, onToggleFontCustom, onThemeColor, onThemeColorClear,
      onThemeDarkSeparate, onThemeFamily, onThemeSize, onThemeTypeOnly, onThemeWeight,

      glassDetailOpen: ui.glassDetailOpen, onToggleGlassDetail: ui.onToggleGlassDetail,
      onToggleChildIndependent, onGlassChildParam, childIndependentOn,
      onSidebarAlpha, onSidebarBlur, onSidebarColor,
      onSidebarContentAlpha, onSidebarContentColor, onCapsuleBlur, onCapsuleColor,
    }));
  }

  function qpRenderPlaybackPane(sel, switchQpTab) {
    return React.createElement(React.Fragment, null,
        renderEffectsTab(sidebarRenderCtx({
          setSetting, sel,
          onScrim, onWallpaperBlur, onWallpaperOpacity,
          onBackgroundBrightness, onBackgroundContrast, onBackgroundSaturate,

          onLayerPositionX, onLayerPositionY, onLayerScale, onLayerReset,

          onToggleSceneLive, onLiveBootDelay, onSceneLiveFps, onPlaybackRate, onObjectFit, onFlip,
          onOpenPicker, setPickerOpener,

          onPickWallpaper: () => switchQpTab("wallpaper"),
        })),
        renderAudioTab(sidebarRenderCtx({ sel, onToggleAudio, onVideoVolume })),
      );
  }

  function qpRenderViewBar(sel, view, typeFilter, ratingFilter, switchView) {
    return React.createElement("div", { className: "we-qp__viewbar" },
      React.createElement("input", {
        className: "we-picker__text we-qp__search", type: "text",
        value: sel.qpSearch || "",
        placeholder: weT("搜索壁纸标题…"),
        "aria-label": weT("搜索壁纸标题"),
        onInput: (e) => { setTransient("qpSearch", e.target.value); emit(); },
      }),

      React.createElement("select", {
        className: "we-picker__select we-qp__rating",
        value: ratingFilter,
        onChange: (e) => { setSetting("contentRatingFilter", e.target.value); emit(); },
        "aria-label": weT("内容分级"),
        title: weT("对应 Wallpaper Engine 的内容分级（project.json contentrating）"),
      },
      ...qpRatings().map((r) => React.createElement("option", { key: r.id, value: r.id }, r.label)),
      ),

      React.createElement("select", {
        className: "we-picker__select we-qp__type",
        value: typeFilter,
        onChange: (e) => { setSetting("typeFilter", e.target.value); emit(); },
        "aria-label": weT("类型筛选"),
        title: weT("按类型筛选壁纸列表（与设置页同一档）"),
      },
      ...qpTypes().map((t) => React.createElement("option", { key: t.id, value: t.id }, t.label)),
      ),

      React.createElement("div", { className: "we-tabs we-qp__viewtabs", role: "group", "aria-label": weT("视图") },
        React.createElement("span", {
          className: "we-tabs__pill",
          "aria-hidden": "true",
          style: {
            width: "calc((100% - 6px) / 2)",
            transform: "translateX(" + (view === "cards" ? 100 : 0) + "%)",
          },
        }),
        React.createElement("button", {
          type: "button",

          className: "we-tabs__tab we-qp__viewtab" + (view !== "cards" ? " we-tabs__tab--active" : ""),
          "aria-pressed": view !== "cards" ? "true" : "false",
          onClick: () => switchView("list"),
        }, weT("列表")),
        React.createElement("button", {
          type: "button",
          className: "we-tabs__tab we-qp__viewtab" + (view === "cards" ? " we-tabs__tab--active" : ""),
          "aria-pressed": view === "cards" ? "true" : "false",
          onClick: () => switchView("cards"),
        }, weT("卡片")),
      ),
    );
  }

  function qpRenderList(listRef, rows, view, cardsView, vTopH, vBtmH, q, ratingFilter, typeFilter, sel) {
    return React.createElement("div", {
      ref: listRef,
      className: "we-qp__list" + (view === "cards" ? " we-qp__list--cards" : ""),
      role: "listbox", "aria-label": weT("壁纸列表"),
    },
      rows.length
        ? React.createElement(React.Fragment, null,
            vTopH > 0 ? qpRenderSpacer("we-qp-vtop", vTopH) : null,
            rows.map(cardsView ? qpRenderCard : qpRenderRow),
            vBtmH > 0 ? qpRenderSpacer("we-qp-vbtm", vBtmH) : null,
          )
        : React.createElement(React.Fragment, null,
            React.createElement("span", { className: "we-picker__hint" },
              q ? weT("没有匹配「{query}」的壁纸", { query: sel.qpSearch })
                  : weT(ratingFilter !== "all" ? "「{name}」分级下没有可播放的壁纸"
                      : typeFilter !== "all" ? "「{name}」类型下没有可播放的壁纸" : "没有可播放的壁纸",
                      { name: qpRatingLabelOf(ratingFilter) })),
          ),
    );
  }

  function qpRenderFoot(foot) {

    return React.createElement("div", { className: "we-qp__foot" },
      React.createElement("button", {
        className: "we-picker__btn we-qp__settings", type: "button",
        "data-we-qp-entry": "1",
        onClick: () => openSettingsSection(foot.target),
        title: foot.title,
      }, foot.label),
    );
  }

  function qpRenderLibrarySection(sel, view, typeFilter, ratingFilter, listRef, rows, cardsView, vTopH, vBtmH, q, switchView) {
    return React.createElement("div", { className: "we-qp__section we-qp__library" },
      !sel.loaded
        ? React.createElement("span", { className: "we-picker__hint" }, weT("扫描 Wallpaper Engine…"))
        : sel.inventory.error
          ? React.createElement(React.Fragment, null,
              React.createElement("div", { className: "we-picker__error" },
                weT("未检测到 Wallpaper Engine：{error}", { error: weT(sel.inventory.error) })),
              React.createElement("button", {
                className: "we-picker__btn", type: "button",
                onClick: () => loadInventory(), disabled: sel.loading,
              }, weT(sel.loading ? "刷新中…" : "重试")),
            )
          : React.createElement(React.Fragment, null,
      qpRenderViewBar(sel, view, typeFilter, ratingFilter, switchView),
      qpRenderList(listRef, rows, view, cardsView, vTopH, vBtmH, q, ratingFilter, typeFilter, sel),
    ),
  );
  }

  function QuickPanel(props) {

    useWeLocale();
    const sel = useStore();
    const dock = (props && props.dock) || "drawer";

    const [view, setView] = React.useState(readQpView);
    const [qpTab, setQpTab] = React.useState(readQpTab);

    const [fontOpen, setFontOpen] = React.useState(() => readQpOpen(QP_FONT_OPEN_KEY, false));
    const [glassDetailOpen, setGlassDetailOpen] = React.useState(() => readQpOpen(QP_GLASS_DETAIL_KEY, false));
    const [uiColorOpen, setUiColorOpen] = React.useState(() => readQpOpen(QP_UI_COLOR_OPEN_KEY, false));
    const [detailOpen, setDetailOpen] = React.useState(() => readQpOpen(QP_DETAIL_OPEN_KEY, true));
    const [glassUiOpen, setGlassUiOpen] = React.useState(() => readQpOpen(QP_GLASS_UI_OPEN_KEY, true));
    const [cornersOpen, setCornersOpen] = React.useState(() => readQpOpen(QP_CORNERS_OPEN_KEY, false));
    const toggleFontSection = () => {
      setFontOpen((prev) => { const next = !prev; writeQpOpen(QP_FONT_OPEN_KEY, next); return next; });
    };
    const toggleUiColorSection = () => {
      setUiColorOpen((prev) => { const next = !prev; writeQpOpen(QP_UI_COLOR_OPEN_KEY, next); return next; });
    };
    const toggleDetailSection = () => {
      setDetailOpen((prev) => { const next = !prev; writeQpOpen(QP_DETAIL_OPEN_KEY, next); return next; });
    };
    const toggleGlassUiSection = () => {
      setGlassUiOpen((prev) => { const next = !prev; writeQpOpen(QP_GLASS_UI_OPEN_KEY, next); return next; });
    };
    const toggleCornersSection = () => {
      setCornersOpen((prev) => { const next = !prev; writeQpOpen(QP_CORNERS_OPEN_KEY, next); return next; });
    };
    const toggleGlassDetail = (open) => {
      const next = open === true;
      setGlassDetailOpen(next);
      writeQpOpen(QP_GLASS_DETAIL_KEY, next);
    };

    React.useEffect(() => {
      if (qpTab === "appearance" && fontOpen && sel.fontCustom) ensureSystemFonts(false);
    }, [qpTab, fontOpen, sel.fontCustom]);
    const switchView = (v) => {
      if (v === view) return;
      setView(v);
      try { localStorage.setItem(QP_VIEW_KEY, v); } catch {   }
    };
    const switchQpTab = (id) => {
      if (!QP_TABS.some((t) => t.id === id) || id === qpTab) return;

      setQpTab(id);
      try { localStorage.setItem(QP_TAB_KEY, id); } catch {   }
    };

    const listRef = React.useRef(null);

    const list = sel.inventory.wallpapers;
    const current = list.find((w) => w.id === sel.id) || null;
    const playbackLive = playbackIsVideoLike(sel) ? sel.videoPlaying : sel.playing;

    const propsAvailable = Boolean(current && (current.type === "scene" || current.type === "web") && sel.propsUrl);

    const q = String(sel.qpSearch || "").trim().toLowerCase();
    const typeFilter = qpTypes().some((t) => t.id === sel.typeFilter) ? sel.typeFilter : "all";

    const ratingFilter = qpRatings().some((r) => r.id === sel.contentRatingFilter)
      ? sel.contentRatingFilter : "all";
    const playable = playableInventory();
    const filtered = playable.filter((w) => {
      if (typeFilter !== "all" && w.type !== typeFilter) return false;
      if (q && String(w.title || "").toLowerCase().indexOf(q) === -1) return false;
      return true;
    });

    const cardsView = view === "cards";
    const vGap = cardsView ? QP_CARD_GAP : QP_ROW_GAP;
    const vItemH = cardsView ? QP_CARD_H : QP_ROW_H;
    const vwin = qpVirtWindow(listRef, filtered.length, vItemH, vGap, cardsView);
    const vMeasured = vwin.cards === cardsView && vwin.cols > 0;
    const vStart = vMeasured ? Math.min(vwin.start, filtered.length) : 0;
    const vEnd = vMeasured
      ? Math.max(vStart, Math.min(vwin.end, filtered.length))
      : Math.min(QP_VP_FIRST, filtered.length);
    const rows = filtered.slice(vStart, vEnd);
    const rowsAfter = filtered.length - vStart - rows.length;

    const vTopH = vMeasured && vStart > 0
      ? Math.floor(vStart / vwin.cols) * (vItemH + vGap) - vGap : 0;
    const vBtmH = vMeasured && rowsAfter > 0
      ? Math.ceil(rowsAfter / vwin.cols) * (vItemH + vGap) - vGap : 0;
    const groups = sel.rotationGroups;

    const tabBodyClass = "we-qp__tabbody" + (qpTab === "wallpaper" ? " we-qp__tabbody--library" : "");

    const foot = qpTab === "appearance"
      ? {
        label: weT("更多外观设置 ›"),
        target: "appearance",
        title: weT("在设置页打开「外观」页签 —— 玻璃预设与全部外观配置在那里"),
      }
      : qpTab === "playback"
        ? {
          label: weT("更多播放设置 ›"),
          target: "playback",
          title: weT("在设置页打开「播放」页签 —— 出图来源 / 实时帧 / 帧率上限在那里"),
        }
        : {
          label: weT("个性设置 ›"),
          target: "",
          title: weT("打开设置对话框的「个性设置」分区（外观 / 播放 / 系统与全部配置）"),
        };

    return React.createElement("div", { className: "we-qp we-qp--" + dock },
      qpRenderCurrent(sel, current, playbackLive),
      qpRenderRotation(sel, groups, playable),
      qpRenderTabs(qpTab, switchQpTab),
      propsAvailable && qpRenderPropsButton(qpTab, switchQpTab),

      React.createElement("div", { className: tabBodyClass },
        qpTab === "wallpaper" && userPropsPanelOpen() && propsAvailable
          && React.createElement("div", { className: "we-qp__propsview we-qp__propsview--drill" }, renderUserPropsPanel()),
        !(qpTab === "wallpaper" && userPropsPanelOpen() && propsAvailable) && (qpTab === "appearance"
          ? qpRenderAppearancePane(sel, {
            fontOpen, onToggleFontSection: toggleFontSection,
            uiColorOpen, onToggleUiColorSection: toggleUiColorSection,
            glassDetailOpen, onToggleGlassDetail: toggleGlassDetail,
            detailOpen, onToggleDetailSection: toggleDetailSection,
            glassUiOpen, onToggleGlassUiSection: toggleGlassUiSection,
            cornersOpen, onToggleCornersSection: toggleCornersSection,

          })
          : qpTab === "playback"
            ? qpRenderPlaybackPane(sel, switchQpTab)
            : null),
        !(qpTab === "wallpaper" && userPropsPanelOpen() && propsAvailable) && qpTab === "wallpaper" && React.createElement(React.Fragment, null,

                qpRenderLibrarySection(sel, view, typeFilter, ratingFilter, listRef, rows, cardsView, vTopH, vBtmH, q, switchView),

                React.createElement("div", { className: "we-qp__section" },
                  renderAudioTab(sidebarRenderCtx({ sel, onToggleAudio, onVideoVolume })),
                ),
        ),
      ),
      qpRenderFoot(foot),
    );
  }

  export {
    QP_TABS,
    QP_CTX_SETTINGS_ONLY,
    sidebarRenderCtx,
    QuickPanel,
  };

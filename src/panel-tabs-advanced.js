  function renderAdvancedBrowsingSection(ctx) {
    const { onLayoutChange, sel } = ctx;
    return React.createElement(React.Fragment, null,

    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: "we-picker__section-label" }, weT("浏览方式")),
      ),

      switchRow(weT("紧凑布局"), sel.pickerLayout === "classic", (e) => onLayoutChange(e.target.checked ? "classic" : "fixed"), {
        hint: sel.pickerLayout === "classic" ? weT("CD 架：层叠 + 一页到底") : weT("常规网格 · 分页"),
        tooltip: weT("紧凑 CD 架：层叠 + 一页到底"),
      }),
    ),
    );
  }

  function renderGreetingSection(ctx) {
    const { onGreetingOn, onGreetingPath, onCoverOnStartup, sel } = ctx;
    return React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: "we-picker__section-label" }, weT("启动画面")),
      ),
      switchRow(weT("启动动画"), sel.greetingOn !== false, (e) => onGreetingOn(e.target.checked), { key: "greeting-on" }),
      sel.greetingOn !== false && React.createElement("div", {
        className: "we-picker__ctl we-picker__ctl--wrap", key: "greeting-path",
      },
        ctlText(weT("视频路径（置空无画面）")),
        React.createElement("input", {
          className: "we-picker__text", type: "text",
          value: sel.greetingPath || "",
          placeholder: "~/Movies/welcome.mp4",
          spellCheck: false,
          onInput: (e) => onGreetingPath(e.target.value),
        })),
      switchRow(weT("启动时铺满屏幕"), sel.coverOnStartup !== false, (e) => onCoverOnStartup(e.target.checked), { key: "cover-on-startup" }),
      sel.coverOnStartup !== false && React.createElement("div", {
        className: "we-picker__hint we-picker__hint--cover",
      },
        weT("需要 macOS 一次性授权（没给授权时窗口不会被铺满）：\n1. 系统设置 → 隐私与安全性 → 辅助功能 → 勾选「osascript」和「DeepSeek Harness」；列表里没有 osascript 就点 +，按 ⌘⇧G 输入 /usr/bin/osascript\n2. 系统设置 → 隐私与安全性 → 自动化 → 允许「DeepSeek Harness」控制「System Events」\n授权后 Cmd+Q 重开。"))
    );
  }

  function renderSessionLayoutSection(ctx) {
    const { onChatLayout, sel } = ctx;
    const current = sel.chatLayout === "spread" ? "spread" : "center";
    return React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: "we-picker__section-label" }, weT("会话布局")),
      ),
      React.createElement("div", { className: "we-picker__ctl" },
        React.createElement("div", {
          className: "we-picker__seg we-picker__seg--joined",
          role: "group",
          "aria-label": weT("会话布局"),
        },
          [["center", weT("居中")], ["spread", weT("铺开")]].map(([id, label]) =>
            React.createElement("button", {
              key: id,
              type: "button",
              className: "we-picker__rate" + (current === id ? " we-picker__rate--active" : ""),
              "aria-pressed": current === id,
              onClick: () => onChatLayout(id),
            }, label)),
        ),
      ),
    );
  }

  function renderBillingSection(ctx) {
    const { onBillingEnabled, sel } = ctx;
    return React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: "we-picker__section-label" }, weT("费用统计")),
      ),
      switchRow(weT("显示费用"), sel.billingEnabled !== false, (e) => onBillingEnabled(e.target.checked)),
    );
  }

  function renderAdvancedCompatSection(ctx) {
    const { onEdgeCompatChange, sel } = ctx;
    return React.createElement(React.Fragment, null,

    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: "we-picker__section-label" }, weT("兼容性")),
      ),

      switchRow(weT("Edge 兼容"), sel.edgeCompat !== false, (e) => onEdgeCompatChange(e.target.checked), {
        hint: weT("Edge 下视频壁纸走 canvas 渲染"),
        tooltip: weT("Edge 兼容：视频壁纸改用 canvas 渲染，避免浏览器自带的「下载 / 投屏」悬浮工具栏；关闭则始终使用原生 <video>"),
      }),
    ),
    );
  }

  function renderAdvancedAdapterSection(ctx) {
    const { onAdapterTarget, sel } = ctx;
    return React.createElement(React.Fragment, null,

    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", {
          className: "we-picker__section-label",
          title: weT("适配目标决定四件事：网页壁纸载荷走哪个源（有无能力头栅栏）、桌面壳材质规则是否生效、窗口失焦暂停是否适用、面板哪些行可用。默认自动检测，检测不准时可手选覆盖（手选优先）。"),
        }, weT("适配", null, "adapter")),
      ),
      React.createElement("div", { className: "we-picker__ctl" },
        ctlText(weT("适配目标"), weT("自动检测 · 手选可覆盖")),
        React.createElement("select", {
          className: "we-picker__select",
          value: ADAPTER_TARGET_VALUES.includes(sel.adapterTarget) ? sel.adapterTarget : "auto",
          onChange: onAdapterTarget,
          "aria-label": weT("适配目标"),
        },
          ADAPTER_TARGET_VALUES.map((t) =>
            React.createElement("option", { key: t, value: t }, ADAPTER_LABELS[t] || t)),
        ),
      ),

      React.createElement("div", { className: "we-picker__hint", key: "adapter-detected" },
        weT("检测到：{target}{suffix}", {
          target: weT(adapterDetectedLabel()),
          suffix: adapterCaps().fence
            ? weT(" · 有能力头栅栏（网页壁纸走独立媒体源）")
            : adapterCaps().desktop
              ? weT(" · 无栅栏的桌面形态（网页壁纸仍走独立媒体源）")
              : weT(" · 无栅栏（网页壁纸走应用源）"),
        })),
      adapterMismatchWarning() && React.createElement("div", { className: "we-picker__hint", key: "adapter-warn" },
        adapterMismatchWarning()),
    ),
    );
  }

  function renderAdvancedPowerSection(ctx) {
    const { onPauseOnBattery, onPauseOnBlur, onPauseOnHidden, sel } = ctx;
    return React.createElement(React.Fragment, null,

    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", {
          className: "we-picker__section-label",
          title: weT("类似 WE 的遮挡暂停：最小化、切到其它应用或使用电池供电时视频暂停、GPU 解码归零；回到界面 / 接通电源自动继续（网页壁纸仅随页面隐藏被浏览器节流）"),
        }, weT("省电")),
      ),
      switchRow(weT("最小化/切页时暂停"), sel.pauseOnHidden, onPauseOnHidden, { key: "pause-hidden" }),

      adapterCaps().blurPause
        && switchRow(weT("窗口失焦时暂停"), sel.pauseOnBlur, onPauseOnBlur, { key: "pause-blur" }),
      !adapterCaps().blurPause && React.createElement("div", { className: "we-picker__hint", key: "pause-blur-note" },
        weT("「窗口失焦时暂停」只在原生浏览器目标下提供 —— 桌面壳失焦时壁纸仍可见，暂停会定格可见画面{note}", {
          note: sel.pauseOnBlur ? weT("（当前已开启，本目标下不生效，切到浏览器目标后恢复）") : "",
        })),
      switchRow(weT("使用电池时暂停"), sel.pauseOnBattery, onPauseOnBattery, { key: "pause-battery" }),
    ),
    );
  }

  function renderAdvancedCacheSection(ctx) {
    const { onCacheDirDraft, onCancelEditCacheDir, onStartEditCacheDir, sel,
      onCacheDirBrowseInput, onCacheDirBrowseGo, onCacheDirBrowseEnter, onCacheDirBrowseUp, onPickCacheDir, onCloseCacheDirBrowse } = ctx;
    const browse = sel.cacheDirBrowse;
    return React.createElement(React.Fragment, null,

    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: "we-picker__section-label" }, weT("缓存位置")),
      ),
      React.createElement("div", { className: "we-picker__uploads" },
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint we-picker__label" }, weT("缓存目录")),
        React.createElement("span", {
          className: "we-picker__uploads-path",
        }, sel.inventory.cacheDir || "—"),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          disabled: sel.cacheDirBusy,
          onClick: onStartEditCacheDir,
        }, weT("更改")),
      ),

      sel.editingCacheDir && !browse && React.createElement("div", { className: "we-picker__row" },
        React.createElement("input", {
          className: "we-picker__text", type: "text",
          value: sel.cacheDirDraft,
          placeholder: weT("绝对路径，如 D:\\WallpaperEngineCache"),
          onInput: onCacheDirDraft,
          onKeyDown: (e) => {
            if (e.key === "Enter") changeCacheDir(sel.cacheDirDraft, true);
            if (e.key === "Escape") onCancelEditCacheDir();
          },
        }),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          disabled: sel.cacheDirBusy,
          onClick: () => changeCacheDir(sel.cacheDirDraft, true),
        }, weT("保存")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onCancelEditCacheDir,
        }, weT("取消")),
      ),

      browse && React.createElement("div", { className: "we-dirpick" },
        React.createElement("div", { className: "we-dirpick__bar" },
          React.createElement("input", {
            className: "we-picker__text we-dirpick__path", type: "text",
            value: browse.display || "",
            placeholder: weT("绝对路径，如 D:\\WallpaperEngineCache"),
            onInput: onCacheDirBrowseInput,
            onKeyDown: (e) => {
              if (e.key === "Enter") onCacheDirBrowseGo();
              if (e.key === "Escape") onCloseCacheDirBrowse();
            },
          }),
          React.createElement("button", {
            className: "we-picker__btn", type: "button",
            disabled: !browse.parent || browse.loading,
            title: weT("上一级"),
            onClick: onCacheDirBrowseUp,
          }, weT("上一级")),
        ),
        React.createElement("div", { className: "we-dirpick__chips" },
          React.createElement("button", {
            className: "we-picker__btn we-dirpick__chip", type: "button",
            disabled: browse.loading,
            onClick: () => onCacheDirBrowseEnter(""),
          }, weT("此电脑")),
          browse.home && React.createElement("button", {
            className: "we-picker__btn we-dirpick__chip", type: "button",
            disabled: browse.loading,
            onClick: () => onCacheDirBrowseEnter(browse.home),
          }, weT("主目录")),
          sel.inventory.cacheDir && React.createElement("button", {
            className: "we-picker__btn we-dirpick__chip", type: "button",
            disabled: browse.loading,
            onClick: () => onCacheDirBrowseEnter(sel.inventory.cacheDir),
          }, weT("当前缓存位置")),
        ),
        React.createElement("div", { className: "we-dirpick__list" },
          browse.loading && React.createElement("div", { className: "we-dirpick__empty" },
            weT("正在读取目录…")),
          !browse.loading && browse.error && React.createElement("div", { className: "we-picker__error" },
            browse.error),
          !browse.loading && !browse.error && !browse.dirs.length && React.createElement("div", { className: "we-dirpick__empty" },
            weT("没有子目录")),
          !browse.loading && browse.dirs.map((d, i) => {

            const label = typeof d === "string" ? d : String((d && d.name) || (d && d.path) || "");
            const path = typeof d === "string" ? d : String((d && d.path) || "");
            return React.createElement("button", {
              key: path || label || i, type: "button", className: "we-dirpick__item",
              title: path,
              onClick: () => onCacheDirBrowseEnter(path),
            }, label || "—");
          }),
        ),
        browse.truncated && React.createElement("div", { className: "we-picker__hint" },
          weT("目录项过多，仅显示部分")),
        React.createElement("div", { className: "we-dirpick__foot" },
          React.createElement("span", {
            className: "we-picker__hint we-dirpick__sel", title: browse.display || "",
          }, browse.display || "—"),
          React.createElement("button", {
            className: "we-picker__btn", type: "button",
            disabled: browse.loading || !(String(browse.display || "").trim() || browse.path),
            onClick: onPickCacheDir,
          }, weT("选择此目录")),
          React.createElement("button", {
            className: "we-picker__btn", type: "button",
            onClick: onCloseCacheDirBrowse,
          }, weT("取消")),
        ),
      ),
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint" },
          weT("已有缓存会迁移到新位置")),
        React.createElement("span", { className: "we-picker__hint" },
          weT("缓存可再生，随时可删")),
      ),
      sel.cacheDirNote && React.createElement("div", { className: "we-picker__hint" },
        sel.cacheDirNote),
      sel.cacheDirError && React.createElement("div", { className: "we-picker__error" },
        sel.cacheDirError),
      ),
    ),
    );
  }

export { renderGreetingSection, renderSessionLayoutSection, renderBillingSection, renderAdvancedBrowsingSection, renderAdvancedCompatSection, renderAdvancedAdapterSection, renderAdvancedPowerSection, renderAdvancedCacheSection };

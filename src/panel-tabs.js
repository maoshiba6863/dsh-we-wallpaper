  function renderWallpaperTab(ctx) {
    const { } = ctx;
    return React.createElement(React.Fragment, null,
      renderWallpaperCurrentSection(ctx),
      renderWallpaperUploadsSection(ctx),
    );
  }

  function renderAppearanceTab(ctx) {
    const { } = ctx;
    return React.createElement(React.Fragment, null,
      renderAppearanceThemeSection(ctx),
      renderAppearanceDetailSection(ctx),
      renderAppearanceFontSection(ctx),
      renderAppearanceGlassSection(ctx),
      renderAppearanceSidebarCornersSection(ctx),

      renderAppearanceUiColorSection(ctx),
    );
  }

  function moduleResetButton(moduleName, onResetModule) {
    return moduleResetButtonNode(moduleName, onResetModule, {
      title: weT("把这一块的参数恢复为默认值（不需要确认）"),
      aria: weT("重置本模块"),
    });
  }

  function renderAudioTab(ctx) {
    const { onToggleAudio, onVideoVolume, sel } = ctx;

    return React.createElement(React.Fragment, null,
      React.createElement("div", { className: "we-picker__section" },
        React.createElement("div", { className: "we-picker__section-head" },
          React.createElement("span", { className: "we-picker__section-label" }, weT("声音")),
        ),
        SliderRow(weT("音量"), 0, 100, 5,
          Math.round((Number(sel.videoVolume) || 0) * 100), onVideoVolume,
          Math.round((Number(sel.videoVolume) || 0) * 100) + "%"),
        switchRow(weT("壁纸音轨"), sel.videoAudioEnabled !== false, () => onToggleAudio(), {
          hint: weT("关闭=静音（保留音量数值）· 开启时音量 0 自动 50%"),
          tooltip: weT("视频壁纸与场景壁纸（内嵌 MP4 音轨 / 包内独立音频）共用；默认静音，开启时若音量为 0 会自动提到 50%"),
        }),
      ),
    );
  }



  function renderEffectsTab(ctx) {
    const { sel, setPickerOpener, onOpenPicker, onPickWallpaper, surface } = ctx;
    const sidebarSurface = surface === "sidebar";
    if (!sel.id) {
      return React.createElement("div", { className: "we-picker__empty" },
        React.createElement("span", { className: "we-picker__empty-title" }, weT("还没有启用壁纸")),
        React.createElement("span", { className: "we-picker__hint" },
          weT("选择一款壁纸后，可在这里调整模糊、亮度、适配、倍速等效果")),
        React.createElement("button", {
          className: "we-picker__btn we-picker__btn--primary", type: "button",
          ref: sidebarSurface ? undefined : setPickerOpener,
          onClick: sidebarSurface ? onPickWallpaper : onOpenPicker,
        }, sidebarSurface ? weT("去挑一张 ›") : weT("选择壁纸")),
      );
    }
    return React.createElement(React.Fragment, null,
      React.createElement("div", { className: "we-picker__section" },
        React.createElement("div", { className: "we-picker__section-head" },
          React.createElement("span", { className: "we-picker__section-label" }, weT("背景画面调整")),
        ),
        renderEffectsSlidersSection(ctx),
        renderEffectsLiveSection(ctx),
        renderEffectsSourceSection(ctx),
        renderEffectsPlaybackSection(ctx),
        renderEffectsFitSection(ctx),
      ),
    );
  }

  function renderAdvancedTab(ctx) {
    const { } = ctx;
    return React.createElement(React.Fragment, null,
      renderAdvancedBrowsingSection(ctx),
      renderAdvancedCompatSection(ctx),
      renderAdvancedAdapterSection(ctx),
      renderAdvancedPowerSection(ctx),
      renderAdvancedCacheSection(ctx),
    );
  }

  function extensionModules() {
    return [AVATAR_EXTENSION_MODULE];
  }

  function renderExtensionsTab(ctx) {
    const { onResetModule } = ctx;
    const modules = extensionModules();
    return React.createElement(React.Fragment, null,
      React.createElement("div", { className: "we-picker__section" },
        React.createElement("div", { className: "we-picker__section-head" },
          React.createElement("span", { className: "we-picker__section-label" }, weT("扩展模块")),
        ),
        React.createElement("div", { className: "we-ext" },
          modules.length === 0
            ? React.createElement("div", { className: "we-picker__empty" },
                React.createElement("span", { className: "we-picker__empty-title" },
                  weT("还没有可用的扩展模块")),
                React.createElement("span", { className: "we-picker__hint" },
                  weT("后续新增的功能会以模块形式收在这里，每个模块自带它的控件")),
              )
            : modules.map((mod) => React.createElement("div", {
                key: mod.id, className: "we-ext__module",
              },
                React.createElement("div", { className: "we-ext__module-head" },
                  React.createElement("span", { className: "we-ext__module-title" }, mod.title),
                  moduleResetButton(mod.resetGroup, onResetModule),
                ),
                mod.desc ? React.createElement("span", { className: "we-picker__hint" }, mod.desc) : null,
                mod.render ? mod.render(ctx) : null,
              )),
        ),
      ),
    );
  }

  function renderTabReset(ctx, tabId) {
    const { armedConfirm, onArmConfirm, onDisarmConfirm, onResetTab } = ctx;
    const token = "tab:" + tabId;

    const cls = "we-picker__section-reset-label";
    return React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: cls }, weT("重置本页")),
      ),
      React.createElement("span", { className: "we-picker__hint" },
        weT("把这一页的设置恢复为默认值；其他页签与导入的图片不受影响。")),
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("button", {
          className: "we-picker__btn",
          type: "button",
          disabled: armedConfirm === token,
          onClick: () => onArmConfirm(token),
        }, weT("重置本页")),
      ),
      renderConfirmRow(armedConfirm, token,
        weT("确定要把这一页的设置恢复为默认吗？此操作不可撤销。"),
        () => onResetTab(tabId), onDisarmConfirm),
    );
  }

  function renderResetSection(ctx) {
    const { armedConfirm, onArmConfirm, onDisarmConfirm, onResetAll } = ctx;
    const token = "resetAll";
    return React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },

        React.createElement("span", { className: "we-picker__section-reset-label" }, weT("重置")),
      ),
      React.createElement("span", { className: "we-picker__hint" },
        weT("把全部设置恢复为出厂默认值；导入的头像与吉祥物图片、字体集不受影响。此操作不可撤销。")),
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("button", {
          className: "we-picker__btn we-picker__btn--danger",
          type: "button",
          disabled: armedConfirm === token,
          onClick: () => onArmConfirm(token),
        }, weT("全部重置")),
      ),
      renderConfirmRow(armedConfirm, token,
        weT("确定要将所有设置恢复为默认吗？此操作不可撤销。"),
        onResetAll, onDisarmConfirm),
    );
  }

export {
  renderWallpaperTab, renderAppearanceTab, renderAudioTab, renderEffectsTab, renderAdvancedTab,
  renderExtensionsTab, renderResetSection, renderTabReset,

  moduleResetButton,
};

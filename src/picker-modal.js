  const PICKER_CARD_H = 92;
  const PICKER_CARD_GAP = 8;
  const PICKER_VP_FIRST = 30;

  function renderPickerModal(ctx) {
    const { sel, playableList, hiddenList, cdMode, vwin } = ctx;

  const PICKER_CLOSE_ITEM = { __closeCard: true };

  const draft = sel.pickerDraft === true;
  const draftIdSet = new Set((sel.editing && sel.editing.wallpaperIds) || []);
  const viewTag = sel.modalView === "hidden" ? "hidden" : (draft ? "draft" : "normal");

  const pickerWindow = (gridItems) => {
    const meas = !cdMode && vwin && vwin.tag === viewTag && vwin.cols > 0;
    const start = meas ? Math.min(vwin.start, gridItems.length) : 0;
    const end = meas
      ? Math.max(start, Math.min(vwin.end, gridItems.length))
      : (cdMode ? gridItems.length : Math.min(PICKER_VP_FIRST, gridItems.length));
    const items = gridItems.slice(start, end);
    const after = gridItems.length - start - items.length;
    const pitch = PICKER_CARD_H + PICKER_CARD_GAP;
    return {
      items,
      topH: meas && start > 0 ? Math.floor(start / vwin.cols) * pitch - PICKER_CARD_GAP : 0,
      btmH: meas && after > 0 ? Math.ceil(after / vwin.cols) * pitch - PICKER_CARD_GAP : 0,
    };
  };

  const closePlus = draft ? playableList : [PICKER_CLOSE_ITEM].concat(playableList);
  const normalWin = pickerWindow(closePlus);
  const hiddenWin = pickerWindow(hiddenList);

  return React.createElement("div", {
          className: "we-picker__modal",
          "data-we-cards": sel.pickerLayout,
          "aria-label": weT("选择壁纸"),
        },
          renderPickerModalHead(ctx),
          !draft && renderPickerModalTabs(ctx, draft),
          sel.modalView === "hidden" && !draft
            ? renderPickerHiddenBody(ctx, hiddenWin)
            : renderPickerNormalBody(ctx, draft, draftIdSet, normalWin),

          renderPickerModalFoot(draft),
    );
}

  function renderPickerVSpacer(key, h) {
    return React.createElement("div", {
      key,
      className: "we-picker__vspacer",
      style: { height: Math.max(0, h) + "px" },
      "aria-hidden": "true",
    });
  }

  function renderPickerCloseCard(ctx) {
    const { sel, onClear } = ctx;
    return React.createElement("div", {
      className: "we-picker__card" + (sel.id ? "" : " we-picker__card--selected"),
      role: "button",
      tabIndex: 0,
      onClick: onClear,
      title: weT("关闭壁纸"),
      onKeyDown: cardKeyDown,
    },
    React.createElement("span", { className: "we-picker__card-close" }, weT("✕ 关闭")),
    );
  }

  function renderPickerPickCard(ctx, w, draft, draftIdSet) {
    const { sel, onPickCard } = ctx;
    return React.createElement("div", {
      key: w.id,

      "data-we-id": String(w.id),
      className: "we-picker__card" + (w.id === sel.id ? " we-picker__card--selected" : "")

        + ((draft ? draftIdSet.has(w.id) : sel.batchMode && sel.batchSelected.indexOf(w.id) >= 0) ? " we-picker__card--checked" : ""),
      role: "button",
      tabIndex: 0,
      title: w.title,
      onClick: () => onPickCard(w),
      onKeyDown: cardKeyDown,
    },
    w.preview
      ? React.createElement("img", {
          src: w.preview, alt: w.title, loading: "lazy",
          onError: (e) => { e.target.style.display = "none"; },
          onLoad: (e) => { e.target.style.opacity = "1"; },
        })
      : React.createElement("span", { className: "we-picker__card-placeholder" }, weT("无预览")),

    !sel.batchMode && !draft && CARD_TYPE_LABELS[w.type]
      && React.createElement("span", { className: "we-picker__card-type" }, CARD_TYPE_LABELS[w.type]),
    React.createElement("span", { className: "we-picker__card-title" }, w.title),
    w.type === "scene" && React.createElement("span", { className: "we-picker__card-badge" }, w.sceneLive ? weT("实时渲染") : weT("静态帧")),
    w.type === "web" && React.createElement("span", { className: "we-picker__card-badge" }, w.webLive ? weT("实时渲染") : weT("兼容模式")),
    (draft || sel.batchMode)
      ? React.createElement("span", { className: "we-picker__card-check" },
          (draft ? draftIdSet.has(w.id) : sel.batchSelected.indexOf(w.id) >= 0) ? "✓" : "")
      : React.createElement("button", {
          className: "we-picker__card-hide", type: "button",
          title: weT("隐藏此壁纸（可在「已隐藏」中恢复）"),
          onClick: (e) => { e.stopPropagation(); hideWallpapers([w.id]); },
        }, weT("隐藏")),
    );
  }

  function renderPickerHiddenBody(ctx, hiddenWin) {
    const { hiddenList, armedConfirm, onArmConfirm, onDisarmConfirm, cdMode, gridRef } = ctx;
    return React.createElement("div", { className: "we-picker__modal-body" },
        hiddenList.length === 0
          ? React.createElement("span", { className: "we-picker__hint" }, weT("没有已隐藏的壁纸"))
          : React.createElement(React.Fragment, null,

              React.createElement("div", { className: "we-picker__row" },
                React.createElement("span", { className: "we-picker__hint" },
                  weT("已隐藏 {n} 张（仅从列表隐藏，不删除源文件）", { n: hiddenList.length })),
                React.createElement("button", {
                  className: "we-picker__btn", type: "button",

                  onClick: () => onArmConfirm("restoreAll"),
                  disabled: armedConfirm === "restoreAll",
                  title: armedConfirm === "restoreAll"
                    ? weT("已经问过你了 —— 在下面那一行选「确认」或「取消」")
                    : weT("把已隐藏的全部恢复（会再问一次）"),
                }, weT("全部恢复")),
              ),
              renderConfirmRow(armedConfirm, "restoreAll",
                weT("恢复全部 {n} 张已隐藏壁纸？", { n: hiddenList.length }),
                () => restoreWallpapers(hiddenList.map((w) => w.id)), onDisarmConfirm),
              React.createElement("div", { ref: cdMode ? undefined : gridRef, className: "we-picker__grid" },
                hiddenWin.topH > 0 ? renderPickerVSpacer("we-picker-vtop", hiddenWin.topH) : null,
                hiddenWin.items.map((w) => React.createElement("div", {
                  key: w.id,
                  className: "we-picker__card we-picker__card--hidden",

                  "data-we-id": String(w.id),
                  role: "button",
                  tabIndex: 0,
                  title: w.title,
                  "aria-label": weT("恢复并应用 {name}", { name: w.title }),
                  onClick: () => applySelection(w.id),

                  onKeyDown: cardKeyDown,
                },
                w.preview
                  ? React.createElement("img", {
                      src: w.preview, alt: w.title, loading: "lazy",
                      onError: (e) => { e.target.style.display = "none"; },
                      onLoad: (e) => { e.target.style.opacity = "1"; },
                    })
                  : React.createElement("span", { className: "we-picker__card-placeholder" }, weT("无预览")),
                CARD_TYPE_LABELS[w.type]
                  && React.createElement("span", { className: "we-picker__card-type" }, CARD_TYPE_LABELS[w.type]),
                React.createElement("span", { className: "we-picker__card-title" }, w.title),
                w.type === "scene" && React.createElement("span", { className: "we-picker__card-badge" }, w.sceneLive ? weT("实时渲染") : weT("静态帧")),
                w.type === "web" && React.createElement("span", { className: "we-picker__card-badge" }, w.webLive ? weT("实时渲染") : weT("兼容模式")),
                React.createElement("button", {
                  className: "we-picker__card-hide", type: "button",
                  title: weT("恢复此壁纸"),
                  onClick: (e) => { e.stopPropagation(); restoreWallpapers([w.id]); },
                }, weT("恢复")),
                )),
                hiddenWin.btmH > 0 ? renderPickerVSpacer("we-picker-vbtm", hiddenWin.btmH) : null,
              ),
            ),
      );
  }

  function renderPickerNormalBody(ctx, draft, draftIdSet, normalWin) {
    const { sel, playableList, onToggleBatchMode, armedConfirm, onBatchHide, onDisarmConfirm, cdMode, gridRef, query } = ctx;
    return React.createElement("div", { className: "we-picker__modal-body" },
        draft
          ? React.createElement("div", { className: "we-picker__row" },
              React.createElement("span", { className: "we-picker__hint" },
                weT("已选 {n} 个 · 点卡片加入 / 移出", { n: draftIdSet.size })),
            )
          : React.createElement("div", { className: "we-picker__row" },
            React.createElement("span", { className: "we-picker__hint" },
              weT("{n} 个可播放壁纸 · 点击卡片即应用", { n: playableList.length })),
            React.createElement("button", {
              className: "we-picker__btn", type: "button",
              onClick: onToggleBatchMode,
              disabled: playableList.length === 0,
              title: weT("多选后批量隐藏"),
            }, sel.batchMode ? weT("退出批量") : weT("批量")),
          ),
        sel.batchMode && renderPickerBatchBar(ctx),

        renderConfirmRow(armedConfirm, "batchHide",
          weT("隐藏选中的 {n} 张壁纸？可在「已隐藏」中随时恢复。", { n: sel.batchSelected.length }),
          onBatchHide, onDisarmConfirm),
        renderPickerFilterRow(ctx),
        React.createElement("div", { ref: cdMode ? undefined : gridRef, className: "we-picker__grid" },

          playableList.length === 0
            ? React.createElement(React.Fragment, null,
                !draft && renderPickerCloseCard(ctx),
                React.createElement("span", { className: "we-picker__hint" },
                  query
                    ? weT("没有匹配「{q}」的壁纸 · 试试缩短关键词或清除过滤", { q: sel.search })
                    : weT("没有可播放的壁纸")),
              )
            : React.createElement(React.Fragment, null,
                normalWin.topH > 0 ? renderPickerVSpacer("we-picker-vtop", normalWin.topH) : null,
                normalWin.items.map((w) => (w && w.__closeCard) ? renderPickerCloseCard(ctx) : renderPickerPickCard(ctx, w, draft, draftIdSet)),
                normalWin.btmH > 0 ? renderPickerVSpacer("we-picker-vbtm", normalWin.btmH) : null,
              ),
        ),
      );
  }

  function renderPickerModalHead(ctx) {
    const { current, playbackLive, sel, closePicker } = ctx;
    return React.createElement("div", { className: "we-picker__modal-head" },
      React.createElement("div", { className: "we-picker__modal-head-left" },
        React.createElement(VinylRecord, {
          cover: current && current.preview, title: current ? current.title : "",
          playing: playbackLive && Boolean(sel.url) && vinylSpinVisible(), sm: true,
        }),
        React.createElement("span", { className: "we-picker__modal-title" }, weT("选择壁纸")),
      ),
      React.createElement("button", {
        className: "we-picker__btn", type: "button", onClick: closePicker,

        ref: modalInitialFocus,
      }, weT("返回")),
    );
  }

  function renderPickerModalTabs(ctx, draft) {
    const { sel, onShowNormalView, onShowHiddenView, playableList, hiddenList } = ctx;
    return React.createElement("div", { className: "we-picker__modal-tabs", role: "tablist" },
      React.createElement("button", {
        className: "we-picker__btn we-picker__tab" + (sel.modalView === "hidden" ? "" : " we-picker__tab--active"),
        type: "button",
        role: "tab",
        "aria-selected": sel.modalView !== "hidden",
        onClick: onShowNormalView,
      }, weT("正常列表（{n}）", { n: playableList.length })),
      React.createElement("button", {
        className: "we-picker__btn we-picker__tab" + (sel.modalView === "hidden" ? " we-picker__tab--active" : ""),
        type: "button",
        role: "tab",
        "aria-selected": sel.modalView === "hidden",
        onClick: onShowHiddenView,
      }, weT("已隐藏（{n}）", { n: hiddenList.length })),
    );
  }

  function renderPickerModalFoot(draft) {
    return React.createElement("div", { className: "we-picker__modal-foot" },
      React.createElement("span", { className: "we-picker__hint" },
        draft ? weT("点卡片加入 / 移出 · ESC 返回") : weT("ESC 返回 · 点击卡片即应用")),
    );
  }

  function renderPickerBatchBar(ctx) {
    const { sel, armedConfirm, onArmBatchHide, onBatchCancel } = ctx;
    return React.createElement("div", { className: "we-picker__row we-picker__batch-bar" },
      React.createElement("span", { className: "we-picker__hint" }, weT("已选 {n} 张", { n: sel.batchSelected.length })),
      React.createElement("button", {
        className: "we-picker__btn", type: "button",

        onClick: onArmBatchHide,
        disabled: sel.batchSelected.length === 0 || armedConfirm === "batchHide",
        title: armedConfirm === "batchHide"
          ? weT("已经问过你了 —— 在下面那一行选「确认」或「取消」")
          : weT("隐藏选中的这些壁纸（会再问一次）"),
      }, weT("批量隐藏")),
      React.createElement("button", {
        className: "we-picker__btn", type: "button",
        onClick: onBatchCancel,
      }, weT("取消")),
    );
  }

  function renderPickerFilterRow(ctx) {
    const { sel, basePlayable, ratingCounts, typeCounts, onSearchInput, onRatingFilterChange, onTypeFilterChange } = ctx;
    return React.createElement("div", { className: "we-picker__row we-picker__filter-row" },

      React.createElement("input", {
        className: "we-picker__text we-picker__search", type: "text",
        value: sel.search,
        placeholder: weT("搜索壁纸标题…"),
        "aria-label": weT("搜索壁纸标题"),
        onInput: onSearchInput,
      }),
      React.createElement("span", { className: "we-picker__hint we-picker__label" }, weT("内容分级")),
      React.createElement("select", {
        className: "we-picker__playlist-select",
        value: sel.contentRatingFilter,
        onChange: onRatingFilterChange,
        "aria-label": weT("内容分级"),
        title: weT("对应 Wallpaper Engine 的内容分级（project.json contentrating）"),
      },
      React.createElement("option", { value: "all" }, weT("全部（{n}）", { n: basePlayable.length })),
      React.createElement("option", { value: "everyone" }, weT("Everyone / G（{n}）", { n: ratingCounts.everyone })),
      React.createElement("option", { value: "pg13" }, weT("PG13（{n}）", { n: ratingCounts.pg13 })),
      React.createElement("option", { value: "mature" }, weT("Mature / R（{n}）", { n: ratingCounts.mature })),
      React.createElement("option", { value: "unrated" }, weT("未分级（{n}）", { n: ratingCounts.unrated })),
      ),
      React.createElement("span", { className: "we-picker__hint we-picker__label" }, weT("类型")),
      React.createElement("select", {
        className: "we-picker__playlist-select",
        value: sel.typeFilter,
        onChange: onTypeFilterChange,
        "aria-label": weT("类型"),
        title: weT("按壁纸类型过滤（只筛列表与轮播候选，不打断正在应用的壁纸）"),
      },
      React.createElement("option", { value: "all" }, weT("全部（{n}）", { n: basePlayable.length })),
      React.createElement("option", { value: "video" }, weT("视频（{n}）", { n: typeCounts.video || 0 })),
      React.createElement("option", { value: "web" }, weT("网页（{n}）", { n: typeCounts.web || 0 })),
      React.createElement("option", { value: "image" }, weT("图片（{n}）", { n: typeCounts.image || 0 })),
      React.createElement("option", { value: "scene" }, weT("场景（{n}）", { n: typeCounts.scene || 0 })),
      ),
    );
  }

  export {
    renderPickerModal,
  };

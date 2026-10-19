let gpImportInput = null;

function renderGlassPresetsBlock(gp) {
  const {
    presets, loading, error, note, saving, draftName, armedId,
    saveTarget, exportTargetId, assetChecks, onAssetToggle, onExportCommit, onSaveCommit2,
    onApply, onOpenSave, onOpenExport, onExportTargetChange, onDraftName, onSaveCommit, onCancelSave,
    onArmDelete, onDisarm, onDelete,
    onImportFile,
  } = gp || {};
  if (!presets) return null;
  const rows = Array.isArray(presets) ? presets : [];

  const exportable = rows.filter((r) => !(typeof r.broken === "string" && r.broken));

  const FACTORY_PRESET_CN = {
    "factory-default": weT("黑客绿(Fish)"),
    "purple-mood": weT("紫色心情"),
    "factory-frosted": weT("重磨砂"),
    "factory-night": weT("暗夜釉色"),
    "factory-vivid": weT("原色直出"),
    "factory-readable": weT("可读优先"),
    "factory-author": weT("作者自用"),
  };
  const labelOf = (row) => (row.origin === "builtin" && FACTORY_PRESET_CN[row.id])
    ? FACTORY_PRESET_CN[row.id]
    : (row.name || row.id);
  const checks = assetChecks || {};
  const has = (k) => checks[k] === true;

  const fontAvailable = checks.fontAvailable === true;
  const avatarAvailable = checks.avatarAvailable === true;

  const assetRows = React.createElement(React.Fragment, null,
    switchRow(weT("字体"), has("font"), (e) => onAssetToggle("font", e.target.checked), {
      key: "pa-font",
      hint: fontAvailable
        ? weT("勾上：把当前字体带进预设（不勾 = 不动对方的字体，保持它当前那份）")
        : weT("本机字体还是全默认 —— 勾着存 = 声明「无」，套用它的人回到内置字体（不勾 = 不动对方的字体）"),
      tooltip: weT("把当前活动字体集的颜色角色 / 排版 / 字族 / 组件字体一并存进预设"),
    }),
    switchRow(weT("会话头像"), has("avatar"), (e) => onAssetToggle("avatar", e.target.checked), {
      key: "pa-avatar",
      hint: avatarAvailable
        ? weT("勾上：把两张自定义头像带进预设（不勾 = 不动对方的头像；头像体积翻倍，默认不勾）")
        : weT("本机没有自定义头像 —— 勾着存 = 声明「无」，套用它的人回到内置默认头像（不勾 = 不动对方的头像）"),
      tooltip: weT("把自定义会话头像的两张图一并存进预设（默认不勾：体积翻倍，与分享一份外观配置关系最弱）"),
    }),
    React.createElement("div", { className: "we-picker__hint", key: "pa-note" },
      weT("数值配置（开关 / 尺寸 / 圆角 / 颜色等）总是完整保存，不受勾选影响 —— 勾选只决定图片与字体要不要一并带走；不勾的那一族一个字都不动对方，勾了而本机没有 = 声明「无」（对方回到内置）。")),
  );

  const cells = [];
  for (let i = 0; i < 8; i++) {
    const row = rows[i];
    if (!row) {
      cells.push(React.createElement("div", {
        key: "empty-" + i, className: "we-picker__preset-cell we-picker__preset-cell--empty",
      }, React.createElement("span", { className: "we-picker__hint" }, weT("空预设位"))));
      continue;
    }
    const broken = typeof row.broken === "string" && row.broken;
    const isUser = row.origin === "user";
    const armed = armedId === row.id;

    const brokenTitle = isUser
      ? weT("这份预设读不出来：{reason}（删掉它，重新保存一份）", { reason: broken })
      : weT("这份出厂预设的版本已作废：{reason}（旧格式不再兼容 —— 从预设栏重新保存一份即可）", { reason: broken });
    cells.push(React.createElement("div", {
      key: row.id,
      className: "we-picker__preset-cell" + (armed ? " we-picker__preset-cell--armed" : ""),
    },
      React.createElement("button", {
        className: "we-picker__btn", type: "button",
        disabled: Boolean(broken) || loading === true,
        title: broken
          ? brokenTitle
          : weT("应用「{name}」：整机配置快照立即生效（观感 / 行为 / 勾选的字体与图片），之后可以继续微调", { name: labelOf(row) }),
        onClick: () => onApply(row.id),
      }, labelOf(row)),

      React.createElement("button", {
        className: "we-picker__btn we-picker__preset-del", type: "button",
        disabled: loading === true,
        title: armed
          ? weT("已经问过你了 —— 在下面那一行选「确认」或「取消」")
          : (isUser
            ? weT("删除这个预设（会再问一次）")
            : weT("删除这个出厂预设（不可恢复）")),
        onClick: () => { if (!armed) onArmDelete(row.id); },
      }, "×"),
    ));
  }
  const chipRow = React.createElement("div", { className: "we-picker__preset-grid", key: "gp-grid" }, cells);

  const openSaveRow = saving
    ? null
    : React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap", key: "gp-save-open" },
      React.createElement("button", {
        className: "we-picker__btn", type: "button",
        disabled: loading === true || rows.length >= 8,
        title: rows.length >= 8
          ? weT("已达预设上限（8 个）—— 删除不需要的预设后再存")
          : weT("把当前这套整机配置存成一份你自己的预设（之后从预设行一键取回）"),
        onClick: () => onOpenSave(),
      }, weT("保存当前为预设…")),
      React.createElement("button", {
        className: "we-picker__btn", type: "button", key: "gp-export-open",
        disabled: loading === true || exportable.length === 0,
        title: exportable.length === 0
          ? weT("没有可导出的预设 —— 先保存一份，或先删掉读不出来的那份")
          : weT("把已有预设导出成 .json（可分享 / 可再导入）—— 先选导出哪一份，再选带哪些资产"),
        onClick: () => onOpenExport(),
      }, weT("导出预设…")),

      React.createElement("input", {
        className: "we-picker__file", type: "file", key: "gp-import-input",
        accept: ".json,application/json",
        style: { display: "none" },
        ref: (el) => { gpImportInput = el; },
        onChange: (e) => {
          const f = e.target.files && e.target.files[0];
          try { e.target.value = ""; } catch {   }
          if (f) onImportFile(f);
        },
      }),
      React.createElement("button", {
        className: "we-picker__btn", type: "button", key: "gp-import-btn",
        disabled: loading === true,
        title: weT("从「导出」得到的 .json 导入一份预设（导入后不会立刻应用 —— 去列表里点它）"),
        onClick: () => { if (gpImportInput && typeof gpImportInput.click === "function") gpImportInput.click(); },
      }, weT("导入预设…")),
    );

  const armedRow = armedId ? rows.find((r) => r.id === armedId) : null;
  const armedQuestion = armedRow && (armedRow.origin === "user"
    ? weT("删除预设「{name}」？此操作不可恢复。", { name: labelOf(armedRow) })
    : weT("删除出厂预设「{name}」？此操作不可恢复。", { name: labelOf(armedRow) }));
  const confirmRow = armedRow
    ? renderConfirmRow(armedId, armedId, armedQuestion, () => onDelete(armedRow.id), () => onDisarm())
    : null;

  const exportRow = saving && saveTarget === "export"
    ? React.createElement(React.Fragment, { key: "gp-export" },
      React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap", key: "gp-export-target" },
        ctlText(weT("导出哪一份"), weT("从当前已有的预设里选一份（正文由宿主按读到的值重建，不是照抄磁盘字节）")),
        React.createElement("select", {
          className: "we-picker__select",
          value: exportTargetId || "",
          disabled: loading === true || exportable.length === 0,
          onChange: (e) => onExportTargetChange(e.target.value),
          "aria-label": weT("导出哪一份"),
        },
          exportable.length === 0
            ? React.createElement("option", { key: "__none", value: "" }, weT("没有可导出的预设"))
            : exportable.map((r) => React.createElement("option", { key: r.id, value: r.id }, labelOf(r))),
        ),
      ),
      assetRows,
      React.createElement("div", { className: "we-picker__ctl", key: "gp-export-commit" },
        React.createElement("button", {
          className: "we-picker__btn", type: "button",

          disabled: loading === true || !exportTargetId,
          title: weT("按上面勾选的资产，把这份预设下载成 .json（可分享 / 可再导入）"),
          onClick: () => onExportCommit(),
        }, weT("下载 .json")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button", onClick: () => onCancelSave(),
        }, weT("取消")),
      ),
    )
    : null;

  const saveRow = saving && saveTarget === "save"
    ? React.createElement(React.Fragment, { key: "gp-save" },
      React.createElement("div", { className: "we-picker__ctl" },
        React.createElement("input", {
          className: "we-picker__file", type: "text", value: draftName || "",
          placeholder: weT("预设名字，回车进入下一步"),
          onChange: (e) => onDraftName(e.target.value),
          onKeyDown: (e) => { if (e && e.key === "Enter") onSaveCommit(); },
        }),
        React.createElement("button", {
          className: "we-picker__btn", type: "button", disabled: loading === true,
          onClick: () => onSaveCommit(),
        }, weT("下一步")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button", onClick: () => onCancelSave(),
        }, weT("取消")),
      ),
      assetRows,
      React.createElement("div", { className: "we-picker__ctl", key: "gp-save-commit" },
        React.createElement("button", {
          className: "we-picker__btn", type: "button", disabled: loading === true,
          title: weT("以当前整机配置 + 上面勾选的资产，保存为一份新预设"),
          onClick: () => onSaveCommit2(),
        }, weT("保存预设")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button", onClick: () => onCancelSave(),
        }, weT("取消")),
      ),
    )
    : null;
  return React.createElement(React.Fragment, null,
    React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
      ctlText(weT("预设方案"), weT("一键套用整套配置（出厂七套 + 你自己存的，上限 8 个）：观感、行为与勾选的字体 / 立绘 / 头像一起生效，应用后可继续微调")),
    ),
    loading ? React.createElement("div", { className: "we-picker__hint" }, weT("正在处理…")) : null,

    error ? React.createElement("div", { className: "we-picker__hint" }, weT("预设不可用：{reason}", { reason: weT(error) })) : null,
    note ? React.createElement("div", { className: "we-picker__hint" }, weT(note)) : null,
    rows.length === 0 && !loading
      ? React.createElement("div", { className: "we-picker__hint" }, weT("还没有任何预设 —— 出厂那几套加载失败或宿主未重挂。"))
      : null,
    chipRow,
    confirmRow,
    openSaveRow,
    saveRow,
    exportRow,
  );
}

function panelGlassPair(sel) {
  const clean = (v) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim() : "");
  const raw = sel && sel.glassColor;
  if (typeof raw === "string") { const v = clean(raw); return { light: v, dark: v }; }
  if (!raw || typeof raw !== "object") return { light: "", dark: "" };
  const light = clean(raw.light) || clean(raw.dark);
  const dark = clean(raw.dark) || light;
  return { light, dark };
}

function renderAppearanceGlassSection(ctx) {
  const { onBlur, onGlassAlpha, onGlassColor, onGlassDarkSeparate, onExtraGlassSelectors, onGlassFidelity,
    sel, surface, onResetModule, glassUiOpen, onToggleGlassUiSection, presetsOpen, onTogglePresetsSection } = ctx;
  const open = glassUiOpen === true;
  const glassPair = panelGlassPair(sel);
  const presetSectionOpen = presetsOpen === true;
  const presetSection = (!surface && ctx.glassPresets)
    ? React.createElement("div", { className: "we-picker__section", key: "gp-section" },
        sectionHead(weT("主题预设"), presetSectionOpen, onTogglePresetsSection),
        presetSectionOpen && renderGlassPresetsBlock(ctx.glassPresets))
    : null;
  return React.createElement(React.Fragment, null,
    presetSection,
    React.createElement("div", { className: "we-picker__section" },
      sectionHead(weT("玻璃 UI"), open, onToggleGlassUiSection,
        moduleResetButtonNode("glass", onResetModule, {
          title: weT("把这一块的参数恢复为默认值（不需要确认）"),
          aria: weT("重置本模块"),
        })),
      open && React.createElement(React.Fragment, null,
        switchRow(weT("深色单独设置"), sel.glassDarkSeparate === true, (e) => onGlassDarkSeparate(e.target.checked), { key: "glass-dark-separate" }),
        swatchRow(weT("玻璃颜色"), GLASS_COLOR_PRESETS, glassPair.light,
          (hex, live) => onGlassColor("light", hex, live), { key: "glass-color" }),
        sel.glassDarkSeparate === true && swatchRow(weT("玻璃颜色 · 深色"), GLASS_COLOR_PRESETS, glassPair.dark,
          (hex, live) => onGlassColor("dark", hex, live), { key: "glass-color-dark" }),
        SliderRow(weT("玻璃透明度"), 0, 100, 5, sel.glassAlpha, onGlassAlpha, sel.glassAlpha + "%"),
        SliderRow(weT("雾化"), 0, 60, 1, sel.blur, onBlur, sel.blur + "px", "glass-frost"),
        React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap", key: "extra-glass-selectors" },
          ctlText(weT("额外补雾化的选择器")),
          React.createElement("input", {
            className: "we-picker__text", type: "text",
            value: sel.extraGlassSelectors || "",
            placeholder: weT("例如 .dsh-mobile-control__panel, .dim-jh-badgePop"),
            spellCheck: false,
            onInput: (e) => onExtraGlassSelectors(e.target.value),
          })),
        SliderRow(weT("玻璃保真度"), 0, 100, 5, sel.glassFidelity, onGlassFidelity, sel.glassFidelity + "%", "glass-fidelity"),
      )));
}

export { renderAppearanceGlassSection };

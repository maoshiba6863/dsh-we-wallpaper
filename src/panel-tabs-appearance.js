  function appearanceSegRow(key, label, hint, items, value, onPick) {
    return React.createElement("div", { className: "we-picker__ctl", key: key },
      ctlText(label, hint),
      React.createElement("div", { className: "we-picker__seg" },
        items.map((m) => React.createElement("button", {
          key: m.id,
          className: "we-picker__btn we-picker__rate" + (value === m.id ? " we-picker__rate--active" : ""),
          type: "button",
          title: m.hint,
          onClick: () => onPick(m.id),
        }, m.label)),
      ),
    );
  }

  function renderAppearanceThemeSection(ctx) {
    const { onResetModule, onToggleThemeFollow, sel } = ctx;
    return React.createElement(React.Fragment, null,

    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: "we-picker__section-label" }, weT("主题")),
        moduleResetButton("theme", onResetModule),
      ),

      switchRow(weT("主题随壁纸"), sel.themeFollow === true, (e) => onToggleThemeFollow(e.target.checked), {
        key: "theme-follow",
        hint: weT("试验性功能 · 关 = 不按壁纸自动改深浅主题（默认关）"),
        tooltip: weT("试验性功能：开着时按当前壁纸自动切全局深/浅：作者配色 → 画面主色，两条腿不一致时取深色；在 DSH 设置里手动改过主题后，本张壁纸不再自动。关（默认）时这个功能整体不生效：不取色、不判决、不改主题；切换开关立刻生效。"),
      }),
      sel.themeFollow === true && sel.themeFollowLine
        && React.createElement("div", { className: "we-picker__hint", key: "theme-follow-line" },
          weT("当前：{line}", { line: weT(sel.themeFollowLine) })),
    ),
    );
  }

  function renderAppearanceDetailSection(ctx) {
    const { onBorder, onResetModule, sel, detailOpen, onToggleDetailSection } = ctx;

    const open = detailOpen === true;
    return React.createElement(React.Fragment, null,

    React.createElement("div", { className: "we-picker__section" },
      sectionHead(weT("细节"), open, onToggleDetailSection, moduleResetButton("detail", onResetModule)),
      open && SliderRow(weT("边框"), 0, 90, 5, Math.round(sel.border * 100), onBorder, Math.round(sel.border * 100) + "%", "border-emphasis", {
        tooltip: weT("提高边框 / 分割线的对比度（浅色与深色主题通用）"),
      }),

    ),
    );
  }

  function familyOptions(sel, opts) {
    const o = opts || {};
    const builtin = o.skipInherit
      ? FONT_FAMILY_LABELS.filter((f) => f.v !== "inherit") : FONT_FAMILY_LABELS;
    const nodes = builtin.map((f) => React.createElement("option", { key: f.v, value: f.v }, f.label));
    const sys = filterUsableSystemFonts(sel.systemFonts).fonts
      .map((name) => ({ v: systemFontKeyOf(name), label: name }))
      .filter((x) => x.v);

    const curKey = typeof o.current === "string" ? o.current : "";
    if (curKey && !builtin.some((f) => f.v === curKey) && !sys.some((x) => x.v === curKey)) {
      const name = systemFontNameOf(curKey);
      if (name) sys.unshift({ v: curKey, label: name });
    }
    if (sys.length) {
      nodes.push(React.createElement("optgroup", { key: "__sys", label: weT("本机字体") },
        sys.map((x) => React.createElement("option", { key: x.v, value: x.v }, x.label))));
    }
    return nodes;
  }

  function sysFontNote(sel) {
    if (sel.systemFontsLoading) return weT("正在读取本机字体…");
    if (sel.systemFontsError) return weT("本机字体读不到：{why}", { why: sel.systemFontsError });
    if (sel.systemFontsApproximate && (sel.systemFonts || []).length) {
      return weT("本机字体是按文件名推测的（没拿到系统字体清单）");
    }
    const probe = filterUsableSystemFonts(sel.systemFonts);
    if (probe.skipped > 0) {
      return weT("已略过 {count} 个本浏览器取不到的字体名（选了也不会生效）", { count: probe.skipped });
    }
    return "";
  }

  function sysFontRefresh(sel, onRefresh) {
    return React.createElement("button", {
      key: "sys-font-refresh",
      type: "button",
      className: "we-picker__chip",
      disabled: sel.systemFontsLoading === true,
      onClick: () => onRefresh(),
      title: weT("重新读取本机已安装的字体（装了新字体之后用）"),
    }, weT("重新扫描"));
  }

  function renderFontGlobalFamily(sel, onGlobalFamily, onComponentFamily, onRefreshSystemFonts) {
    return React.createElement(React.Fragment, null,

    React.createElement("div", { className: "we-picker__ctl", key: "global-family" },
      ctlText(weT("默认字体"), weT("整套界面的默认字族（全局）；角色 / 组件里单独设过的仍以那里为准")),
      React.createElement("select", {
        value: sanitizeFamilyKey(sel.globalFamily),
        style: { width: "150px" },
        onChange: (e) => onGlobalFamily(e.target.value),
        title: weT("整套界面（含角色表覆盖不到的文字）的默认字体；任意角色 / 组件单独设了字族，那里优先"),
      },
        React.createElement("option", { value: "" }, weT("跟随 DSH")),
        familyOptions(sel, { skipInherit: true, current: sanitizeFamilyKey(sel.globalFamily) }),
      ),
    ),
    React.createElement("div", { className: "we-picker__ctl", key: "terminal-family" },
      ctlText(weT("终端字体"), weT("对话里的终端块 + 侧栏终端面板（dsh-ssh）；与「高级字体设置 → 终端」同一项")),
      React.createElement("select", {
        value: fontFamilyKeyOf((sel.componentFonts.terminal || {}).family),
        style: { width: "150px" },
        onChange: (e) => onComponentFamily("terminal", e.target.value),
        title: weT("终端字体：① 对话里的终端块（走官方 --dsl-terminal-font 钩子）② 侧栏 / SSH 终端面板（走 dsh-ssh 给皮肤留的 --dsh-ssh-terminal-font 钩子）；「跟随」= 都不覆盖，各用它们自己的默认。⚠️ 若在 dsh-ssh 的设置里填过 terminalFontFamily，那个值优先级更高"),
      },
        React.createElement("option", { value: "" }, weT("跟随")),
        familyOptions(sel, { current: fontFamilyKeyOf((sel.componentFonts.terminal || {}).family) }),
      ),
    ),

    React.createElement("div", { className: "we-picker__row", key: "sys-font-note" },
      React.createElement("span", { className: "we-picker__hint" }, sysFontNote(sel)),
      sysFontRefresh(sel, onRefreshSystemFonts),
    ),
    );
  }

  function renderFontColorRoles(sel, officialColorOf, onThemeDarkSeparate, onThemeColor, onThemeColorClear) {
    return React.createElement(React.Fragment, null,

    React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
      ctlText(weT("文字颜色角色"), weT("未设置 = 用 DSH 默认色（色块显示当前值）")),
    ),
    switchRow(weT("深色单独设置"), sel.themeDarkSeparate, (e) => onThemeDarkSeparate(e.target.checked), {
      tooltip: weT("关闭时一个颜色同时用于浅色与深色两套（内部仍存两套值）；开启后浅色/深色分别设置"),
    }),
    THEME_COLOR_ROLES.map((role) => {
      const v = sel.themeColors[role.id] || { light: "", dark: "" };
      return React.createElement("div", { className: "we-picker__ctl", key: role.id },
        ctlText(role.label),
        React.createElement("label", { className: "we-picker__swatch-custom" },
          React.createElement("input", {
            type: "color",
            value: v.light || officialColorOf(role.tokens) || "#ffffff",
            onInput: (e) => onThemeColor(role.id, "light", e.target.value, sel.themeDarkSeparate),
            onChange: (e) => onThemeColor(role.id, "light", e.target.value, sel.themeDarkSeparate),
            title: weT("{role} · 浅色配色", { role: weT(role.label) }),
          }),
          React.createElement("span", { className: "we-picker__hint we-picker__value" },
            v.light ? weT("浅 {color}", { color: v.light }) : (officialColorOf(role.tokens) || weT("跟随"))),
        ),
        sel.themeDarkSeparate && React.createElement("label", { className: "we-picker__swatch-custom" },
          React.createElement("input", {
            type: "color",
            value: v.dark || officialColorOf(role.tokens) || "#000000",
            onInput: (e) => onThemeColor(role.id, "dark", e.target.value, true),
            onChange: (e) => onThemeColor(role.id, "dark", e.target.value, true),
            title: weT("{role} · 深色配色", { role: weT(role.label) }),
          }),
          React.createElement("span", { className: "we-picker__hint we-picker__value" },
            v.dark ? weT("深 {color}", { color: v.dark }) : (officialColorOf(role.tokens) || weT("跟随"))),
        ),
        (v.light || v.dark) && React.createElement("button", {
          type: "button",
          className: "we-picker__chip",
          onClick: () => onThemeColorClear(role.id),
          title: weT("清除该角色，回到原生层次"),
        }, weT("清除")),
      );
    }),
    );
  }

  function renderFontTypeRoles(sel, typeRoles, onThemeTypeOnly, onThemeSize, onThemeWeight, onThemeFamily) {
    return React.createElement(React.Fragment, null,

    React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
      ctlText(weT("排版角色"), weT("字号 px；留空 = 不改（字号/字重显示 DSH 当前值，字族选「跟随」）")),
    ),
    switchRow(weT("只看改过的"), sel.themeTypeOnly, (e) => onThemeTypeOnly(e.target.checked), {
      tooltip: weT("只列出改过字号/字重/字族的角色，便于收尾核对"),
    }),

    typeRoles.length === 0
      ? React.createElement("div", { className: "we-picker__hint" },
        weT("没有改过的角色 —— 「只看改过的」正开着（共 {count} 个角色）。关掉它就能看到全部。", { count: THEME_TYPE_ROLES.length }))
      : null,
    React.createElement("table", { className: "we-picker__font-table" },
      React.createElement("thead", null,
        React.createElement("tr", null,
          React.createElement("th", null, weT("角色")),
          React.createElement("th", null, weT("字号")),
          React.createElement("th", null, weT("字重")),
          React.createElement("th", null, weT("字体")),
        ),
      ),
      React.createElement("tbody", null,
    typeRoles
      .map((role) => {
        const size = sel.themeSize[role.id];
        return React.createElement("tr", { key: role.id },
          React.createElement("td", null, ctlText(role.label)),
          React.createElement("td", null, React.createElement("input", {
            type: "number",
            value: size === undefined ? role.defaultPx : size,
            min: THEME_SIZE_MIN,
            max: THEME_SIZE_MAX,
            step: 1,
            style: { width: "46px" },
            onChange: (e) => onThemeSize(role.id, e.target.value),
            title: weT("{role}：字号 px（清空即回 DSH 默认 {px}px）", { role: weT(role.label), px: role.defaultPx }),
          })),
          React.createElement("td", null, React.createElement("input", {
            type: "number",
            value: sel.themeWeight[role.id] === undefined
              ? (role.prefix ? Number(role.prefix) : 400)
              : sel.themeWeight[role.id],
            min: 100,
            max: 900,
            step: 100,
            style: { width: "54px" },
            onChange: (e) => onThemeWeight(role.id, e.target.value),
            title: weT("{role}：字重 100–900（清空即回默认）", { role: weT(role.label) }),
          })),
          React.createElement("td", null, React.createElement("select", {
            value: sel.themeFamily[role.id] === undefined ? "" : sel.themeFamily[role.id],
            style: { width: "92px" },
            onChange: (e) => onThemeFamily(role.id, e.target.value),
            title: weT("{role}：字族（跟随 = 不覆盖，用 DSH 该角色的字族）", { role: weT(role.label) }),
          },
            React.createElement("option", { value: "" }, weT("跟随")),
            familyOptions(sel, { current: sel.themeFamily[role.id] || "" }),
          )),
        );
      }),
      ),
    ),
    );
  }

  function renderFontComponents(sel, onFontAdvanced, onComponentFont, onComponentFamily) {
    return React.createElement(React.Fragment, null,

    switchRow(weT("高级字体设置"), sel.fontAdvanced, (e) => onFontAdvanced(e.target.checked), {
      tooltip: weT("按组件细化（模块前缀通道 + 官方 --dsl-* 钩子）：只对探测到的组件生效；不填即用 DSH 默认值"),
    }),
    sel.fontAdvanced && React.createElement(React.Fragment, null,
      React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
        ctlText(weT("组件字体"), weT("未填时显示该组件当前的 DSH 默认值（— = 此刻不在页面上）；清空即回默认")),
      ),

      React.createElement("table", { className: "we-picker__font-table" },
        React.createElement("thead", null,
          React.createElement("tr", null,
            React.createElement("th", null, weT("组件")),
            React.createElement("th", null, weT("字号")),
            React.createElement("th", null, weT("字重")),
            React.createElement("th", null, weT("字体")),
          ),
        ),
        React.createElement("tbody", null,
      COMPONENT_FONT_TARGETS.map((target) => {
        const c = sel.componentFonts[target.id] || {};

        const d = (typeof componentFontDefaults === "function"
          ? componentFontDefaults()[target.id] : null) || {};
        const famKey = fontFamilyKeyOf(c.family);
        return React.createElement("tr", { key: target.id },
          React.createElement("td", null, ctlText(weT(target.label), weT("{group} · 走 {route}", { group: weT(target.group), route: target.route }))),
          React.createElement("td", null, React.createElement("input", {
            type: "number",
            value: c.size === undefined ? (d.size || "") : c.size,
            placeholder: d.size ? "" : "—",
            min: 6,
            max: 40,
            style: { width: "44px" },
            onChange: (e) => onComponentFont(target.id, "size", e.target.value),
            title: weT("{target}：字号 px（清空即回 DSH 默认{suffix}）", { target: weT(target.label), suffix: d.size ? " " + d.size + "px" : "" }),
          })),
          React.createElement("td", null, React.createElement("input", {
            type: "number",
            value: c.weight === undefined ? (d.weight || "") : c.weight,
            placeholder: d.weight ? "" : "—",
            min: 100,
            max: 900,
            step: 100,
            style: { width: "54px" },
            onChange: (e) => onComponentFont(target.id, "weight", e.target.value),
            title: weT("{target}：字重 100–900（清空即回 DSH 默认{suffix}）", { target: weT(target.label), suffix: d.weight ? " " + d.weight : "" }),
          })),
          React.createElement("td", null, React.createElement("select", {
            value: famKey,
            style: { width: "96px" },
            onChange: (e) => onComponentFamily(target.id, e.target.value),
            title: weT("{target}：字体族（跟随 = 不覆盖，用 DSH 默认）", { target: weT(target.label) }),
          },
            React.createElement("option", { value: "" }, weT("跟随")),
            familyOptions(sel, { current: famKey }),
          )),
        );
      }),
        ),
      ),
    ),
    );
  }

  function renderFontSet(fontSet) {
    return React.createElement(React.Fragment, null,

    switchRow(weT("字体集预设"), fontSet.open, (e) => fontSet.onOpen(e.target.checked), {
      tooltip: weT("预设 = 一整套字体外观；改动只落到当前这一套，随时可以恢复原样"),
    }),
    fontSet.open && renderFontSetEditor(fontSet),
    );
  }

  function sidebarCornerGroup(side, sideLabel, sel, onSidebarCornerRadius, onSidebarCornerSquare, onSidebarAllCorners) {
    const radiusLabels = { native: weT("跟随原生"), 6: weT("小 6px"), 12: weT("中 12px"), 20: weT("大 20px") };
    const corners = [["tl", weT("左上")], ["tr", weT("右上")], ["br", weT("右下")], ["bl", weT("左下")]];
    const radiusKey = side + "SidebarCornerRadius";
    const isSquare = (c) => sel[side + "SidebarSquare" + c.toUpperCase()] === true;
    return React.createElement(React.Fragment, null,
      React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
        ctlText(weT("{side} · 统一圆角", { side: sideLabel }), weT("四角都按这个值；单独标「直角」的角覆盖它")),
        React.createElement("div", { className: "we-picker__seg" },
          SIDEBAR_CORNER_RADIUS_VALUES.map((v) =>
            React.createElement("button", {
              key: v,
              className: "we-picker__btn we-picker__rate" + (sel[radiusKey] === v ? " we-picker__rate--active" : ""),
              type: "button",
              onClick: () => onSidebarCornerRadius(side, v),
              "aria-pressed": sel[radiusKey] === v ? "true" : "false",
              "aria-label": weT("{side}统一圆角 {value}", { side: sideLabel, value: radiusLabels[v] }),
            }, radiusLabels[v]),
          ),
        ),
      ),
      React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
        ctlText(weT("{side} · 四角单独", { side: sideLabel }), weT("点一下就切换：圆角（用统一值）/ 直角（0px）")),
        React.createElement("div", { className: "we-picker__seg" },
          corners.map(([c, cornerLabel]) =>
            React.createElement("button", {
              key: c,
              className: "we-picker__btn we-picker__rate" + (isSquare(c) ? " we-picker__rate--active" : ""),
              type: "button",
              onClick: () => onSidebarCornerSquare(side, c, !isSquare(c)),
              "aria-pressed": isSquare(c) ? "true" : "false",
              "aria-label": weT("{side}{corner}：{state}", { side: sideLabel, corner: cornerLabel, state: weT(isSquare(c) ? "直角" : "圆角") }),
            }, weT("{corner}角 {state}", { corner: cornerLabel, state: weT(isSquare(c) ? "直角" : "圆角") })),
          ),
        ),
      ),
      React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
        React.createElement("div", { className: "we-picker__seg" },
          React.createElement("button", { className: "we-picker__btn", type: "button", onClick: () => onSidebarAllCorners(side, true) }, weT("四角全直角")),
          React.createElement("button", { className: "we-picker__btn", type: "button", onClick: () => onSidebarAllCorners(side, false) }, weT("四角全圆角")),
        ),
      ),
    );
  }

  function renderAppearanceSidebarCornersSection(ctx) {
    const { onResetModule, onSidebarAllCorners, onSidebarCornerRadius, onSidebarCornerSquare, sel, cornersOpen, onToggleCornersSection } = ctx;

    const open = cornersOpen === true;
    return React.createElement(React.Fragment, null,
      React.createElement("div", { className: "we-picker__section" },
        sectionHead(weT("侧边栏圆角"), open, onToggleCornersSection, moduleResetButton("corners", onResetModule)),
        open && sidebarCornerGroup("left", weT("左侧栏"), sel, onSidebarCornerRadius, onSidebarCornerSquare, onSidebarAllCorners),
        open && sidebarCornerGroup("right", weT("右侧栏"), sel, onSidebarCornerRadius, onSidebarCornerSquare, onSidebarAllCorners),
      ),
    );
  }

  function renderAppearanceUiColorSection(ctx) {
    const { onAccent, onCaretColor, onResetModule, onToggleUiColorCustom, onUiColorElement, sel, uiColorOpen, onToggleUiColorSection } = ctx;
    const open = uiColorOpen === true;
    const custom = sel.uiColorCustom === true;

    const rows = [
      { key: "uiColorSend", label: weT("发送键"), hint: weT("输入框右侧那个圆形箭头按钮（它的箭头固定白色，建议选中间调）") },
      { key: "uiColorLink", label: weT("链接文字"), hint: weT("会话与面板里的链接、强调文字") },
      { key: "uiColorFileIcon", label: weT("文件图标"), hint: weT("交付物卡片里 `</>` 那个文件图标（与链接共用令牌，这里单独覆盖）") },
      { key: "uiColorTab", label: weT("页签 / 焦点环"), hint: weT("会话的「对话 / 轨迹」页签与下划线；焦点环与状态点同源，一并跟色") },
      { key: "uiColorDeepDiving", label: weT("深度求索状态"), hint: weT("「深度求索中，用时 …」那行文字与它的微光") }
    ];

    const followSwatch = (key) => React.createElement("button", {
      key: "follow",
      className: "we-picker__swatch we-picker__swatch--auto" + (sel[key] === "" ? " we-picker__swatch--active" : ""),
      type: "button",
      title: weT("跟随「全局配色」"),
      onClick: () => onUiColorElement(key, ""),
      "aria-label": weT("跟随全局配色"),
    }, weT("跟随"));
    return React.createElement(React.Fragment, null,
    React.createElement("div", { className: "we-picker__section" },

      sectionHead(weT("全局 UI 配色"), open, onToggleUiColorSection, moduleResetButton("uiColor", onResetModule)),
      open && React.createElement(React.Fragment, null,

        React.createElement("div", { key: "global-accent", className: custom ? "we-picker__ctl we-picker__ctl--disabled" : "" },
          swatchRow(weT("全局配色"), ACCENT_PRESETS, sel.accent, custom ? () => {} : onAccent, {
            key: "accent",
            hint: custom
              ? weT("已开启「UI 配色自定义」—— 此刻由下面五项分别决定，本行暂不生效")
              : weT("一处调全部：界面强调色、按钮、选中态与下面那几处都会跟着变"),
            tooltip: custom
              ? weT("关闭「UI 配色自定义」后本行重新生效")
              : weT("调它等于一次性改全部；想给某几处单独指定颜色，打开下面的「UI 配色自定义」"),
          }),
        ),

        switchRow(weT("UI 配色自定义"), custom, (e) => onToggleUiColorCustom(e.target.checked), {
          key: "ui-color-custom",
          tooltip: weT("开启后「全局配色」不再生效，改由下面五项分别决定；每一项留「跟随」即回到全局配色"),
        }),
        custom && React.createElement(React.Fragment, null,
          ...rows.map((r) => swatchRow(weT(r.label), ACCENT_PRESETS, sel[r.key], (hex, live) => onUiColorElement(r.key, hex, live), {
            key: r.key,
            hint: weT(r.hint),
            auto: followSwatch(r.key),
            colorValue: sel[r.key] || sel.accent || "#4f8cff",
          })),
        ),

        swatchRow(weT("光标颜色"), CARET_COLOR_PRESETS, sel.caretColor, onCaretColor, {
          key: "caret-color",
          hint: weT("输入框光标看不清时换个颜色（与上面的总开关无关，始终可调）"),
          auto: React.createElement("button", {
            key: "auto",
            className: "we-picker__swatch we-picker__swatch--auto" + (sel.caretColor === "" ? " we-picker__swatch--active" : ""),
            type: "button",
            title: weT("跟随 dsh 原生光标颜色"),
            onClick: () => onCaretColor(""),
            "aria-label": weT("光标颜色 自动"),
          }, weT("自动")),
          colorValue: sel.caretColor || "#4f8cff",
        }),
      ),
    ),
    );
  }

export { renderAppearanceThemeSection, renderAppearanceDetailSection, renderAppearanceSidebarCornersSection, renderAppearanceUiColorSection };

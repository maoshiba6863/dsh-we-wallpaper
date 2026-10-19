  function renderPickerPropsPanel(ctx) {
    const { open, token, loading, error, props, sceneLiveActive, source, ensureDefs, onPropInput, onReset } = ctx;
    if (!open) return null;

    if (!token) return null;

    ensureDefs(token);
    const values = {};
    for (const p of props) {
      if (p.ptype !== "text" && p.ptype !== "group") values[p.name] = p.value;
    }

    const stale = Boolean(source && source.token && source.token !== token);
    const defs = stale ? [] : props;
    const rows = defs
      .filter((p) => !p.condition || weEvalCondition(p.condition, values))
      .map((p) => renderUserPropRow(p, onPropInput));

    const note = stale
      ? weT("正在取这张壁纸的属性…")
      : loading
        ? weT("读取中…")
        : error
          ? weT(error)
          : !source || source.heard
            ? rows.length
              ? ""
              : defs.length
                ? weT("当前条件下没有可调项")
                : weT("这张壁纸没有用户属性（project.json 的 general.properties）")
            : weT("等待壁纸属性…（宿主尚未答复）");
    return React.createElement("div", { className: "we-picker__props" },
      React.createElement("div", { className: "we-picker__props-head" },
        React.createElement("span", { className: "we-picker__props-title" }, weT("壁纸属性")),
        React.createElement("span", { className: "we-picker__props-note" }, note),
        React.createElement("button", {
          className: "we-picker__btn we-picker__btn--mini", type: "button",
          onClick: onReset,
          disabled: !props.some((p) => p.overridden),
        }, weT("恢复默认")),
      ),

      !sceneLiveActive && React.createElement("div", { className: "we-picker__props-hint" },
        weT("实时渲染当前未接管（静态帧 / 兼容模式），改动会在下次实时渲染时生效。")),
      rows,
    );
  }

  function renderUserPropRow(p, onPropInput) {
    if (p.ptype === "text" || p.ptype === "group") {
      return React.createElement("div", {
        key: p.name, className: "we-picker__props-section",
      }, p.text);
    }
    const label = React.createElement("span", { className: "we-picker__props-label", title: p.name },
      p.text,
      p.overridden && React.createElement("span", { className: "we-picker__props-dot", title: weT("已改（点「恢复默认」还原）") }, "•"),
    );
    let control;
    if (p.ptype === "bool") {
      control = React.createElement("input", {
        type: "checkbox", className: "we-picker__props-check",
        checked: p.value === true,
        onChange: (e) => onPropInput(p, e.target.checked, false),
      });
    } else if (p.ptype === "color") {
      control = React.createElement("input", {
        type: "color", className: "we-picker__props-color",
        value: weColorToHex(p.value),
        onInput: (e) => onPropInput(p, weHexToColor(e.target.value), true),
        onChange: (e) => onPropInput(p, weHexToColor(e.target.value), false),
      });
    } else if (p.ptype === "slider") {
      const min = typeof p.min === "number" ? p.min : 0;
      const max = typeof p.max === "number" ? p.max : 1;
      const step = typeof p.step === "number" && p.step > 0 ? p.step : (max - min) / 100;
      const digits = typeof p.precision === "number" ? Math.max(0, Math.min(6, p.precision)) : 2;
      const shown = typeof p.value === "number" ? p.value.toFixed(digits) : String(p.value === null ? "" : p.value);
      control = React.createElement(React.Fragment, null,
        React.createElement("input", {
          type: "range", className: "we-picker__slider",
          min, max, step,
          value: typeof p.value === "number" ? p.value : min,
          onInput: (e) => onPropInput(p, Number(e.target.value), true),
          onChange: (e) => onPropInput(p, Number(e.target.value), false),
        }),
        React.createElement("span", { className: "we-picker__props-value" }, shown),
      );
    } else if (p.ptype === "combo" && Array.isArray(p.options)) {

      const idx = Math.max(0, p.options.findIndex((o) => sameUserPropValue(o.value, p.value)));
      control = React.createElement("select", {
        className: "we-picker__props-select",
        value: String(idx),
        onChange: (e) => {
          const opt = p.options[Number(e.target.value)];
          if (opt) onPropInput(p, opt.value, false);
        },
      }, p.options.map((o, i) => React.createElement("option", {
        key: i, value: String(i),
      }, o.label)));
    } else if ((p.ptype === "file" || p.ptype === "directory") && Array.isArray(p.files)) {
      const cur = typeof p.value === "string" ? p.value : "";
      const list = p.files.includes(cur) || !cur ? p.files : [cur].concat(p.files);
      control = React.createElement("select", {
        className: "we-picker__props-select",
        value: cur,
        onChange: (e) => onPropInput(p, e.target.value, false),
      }, [{ label: weT("（默认）"), value: "" }].concat(list.map((f) => ({ label: f, value: f })))
        .map((o, i) => React.createElement("option", { key: i, value: o.value }, o.label)));
    } else {
      control = React.createElement("input", {
        type: "text", className: "we-picker__props-text",
        defaultValue: typeof p.value === "string" ? p.value : "",

        onChange: (e) => onPropInput(p, e.target.value, false),
      });
    }
    return React.createElement("div", { key: p.name, className: "we-picker__props-row" }, label, control);
  }

  export {
    renderPickerPropsPanel,
  };

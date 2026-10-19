let importInput = null;

function deleteLabel(row) {
  return row.overrides ? weT("恢复原样") : weT("删除");
}

function renderFontSetEditor(ctx) {
  const {
    fontSets, activeId, inUseId, loading, error, editingId, draftName, armedId,
    onActivate, onRefresh, onDelete, onArm, onDisarm, exportUrl, onImport,
    onEdit, onDraftName, onRenameCommit, onCancelEdit, onCreate,
  } = ctx;
  const rows = Array.isArray(fontSets) ? fontSets : [];
  const btn = (key, label, onClick, extra) => React.createElement("button",
    Object.assign({ key, className: "we-picker__btn", type: "button", onClick }, extra || {}), label);

  const exportLink = (id) => React.createElement("a", {
    key: "exp", className: "we-picker__btn", href: exportUrl(id), download: id + ".json",
    title: weT("下载这个字体集（可分享 / 可再导入）"),
  }, weT("导出"));

  const answerText = (row) => (row.overrides === true
    ? weT("把「{name}」恢复成它原本的样子？你在这份上的改动会丢掉。", { name: row.name || row.id })
    : weT("删除「{name}」？此操作不可恢复。", { name: row.name || row.id }));

  const cells = [];
  for (const row of rows) {
    const isActive = row.id === activeId || row.active === true;
    const broken = typeof row.broken === "string" && row.broken;
    const overrides = row.overrides === true;

    const canDelete = row.origin === "user" && !isActive;
    const actions = [];
    if (!broken) {
      if (!isActive) actions.push(btn("use", weT("使用"), () => onActivate(row.id),
        { title: weT("切换到这个字体集（立即生效）") }));
      if (editingId !== row.id) {
        actions.push(btn("ren", weT("重命名"), () => onEdit(row.id)));
      }
    }
    if (canDelete) {

      const armed = armedId === row.id;
      actions.push(btn("del", deleteLabel(row), () => { if (!armed) onArm(row.id); }, {
        disabled: armed,
        title: armed
          ? weT("已经问过你了 —— 在下面那一行选「确认」或「取消」")
          : (overrides ? weT("删掉你在这份上的改动，恢复它原本的样子") : weT("删除这个字体集（会再问一次）")),
      }));
    }
    actions.push(exportLink(row.id));

    cells.push(React.createElement("tr", { key: row.id, className: "we-picker__fontset-row" },
      React.createElement("td", null,
        React.createElement("span", { className: "we-picker__fontset-name" }, row.name || row.id),

        row.id === inUseId
          ? React.createElement("span", { className: "we-picker__hint" }, weT("（使用中）"))
          : (row.id === activeId
            ? React.createElement("span", { className: "we-picker__hint", title: weT("当前外观在这套的基础上被手动改过；点「使用」把它整份读回来") }, weT("（已改）"))
            : null),
        broken ? React.createElement("span", { className: "we-picker__hint" }, weT("无法读取：{msg}", { msg: broken })) : null,
      ),
      React.createElement("td", null,
        editingId === row.id
          ? React.createElement(React.Fragment, null,
            React.createElement("input", {
              className: "we-picker__file",
              type: "text",
              value: draftName,
              placeholder: row.name || row.id,
              onChange: (e) => onDraftName(e.target.value),
              onKeyDown: (e) => { if (e && e.key === "Enter") onRenameCommit(row.id); },
            }),
            btn("ok", weT("保存"), () => onRenameCommit(row.id)),
            btn("cancel", weT("取消"), () => onCancelEdit()),
          )
          : actions,
      ),
    ));

    if (canDelete && armedId === row.id) {
      cells.push(React.createElement("tr", { key: row.id + "-ask", className: "we-picker__fontset-confirm" },
        React.createElement("td", { colSpan: 2 },
          React.createElement("span", { className: "we-picker__hint" }, answerText(row)),
          btn("yes", weT("确认"), () => onDelete(row.id), { title: weT("就这么办") }),
          btn("no", weT("取消"), () => onDisarm(), { title: weT("算了") }),
        ),
      ));
    }
  }

  return React.createElement(React.Fragment, null,
    React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
      ctlText(weT("字体集"), weT("一份集 = 整套字体外观（颜色角色 / 排版 / 字重 / 字族 / 组件）。改动只落到当前这一份、随时可以恢复原样；导入导出按整份文件走。")),
    ),
    loading ? React.createElement("div", { className: "we-picker__hint" }, weT("正在读取字体集…")) : null,

    error ? React.createElement("div", { className: "we-picker__hint" }, weT("字体集不可用：{reason}", { reason: weT(error) })) : null,
    rows.length === 0 && !loading
      ? React.createElement("div", { className: "we-picker__hint" }, weT("还没有任何字体集 —— 下面可以新建一份。"))
      : null,
    rows.length
      ? React.createElement("table", { className: "we-picker__font-table" },
        React.createElement("thead", null,
          React.createElement("tr", null,
            React.createElement("th", null, weT("字体集")),
            React.createElement("th", null, weT("操作")),
          ),
        ),
        React.createElement("tbody", null, cells),
      )
      : null,
    React.createElement("div", { className: "we-picker__ctl" },
      React.createElement("input", {
        className: "we-picker__file",
        type: "file",

        accept: ".json,application/json",
        style: { display: "none" },
        ref: (el) => { importInput = el; },
        onChange: (e) => {
          const f = e.target.files && e.target.files[0];
          try { e.target.value = ""; } catch {   }
          if (f) onImport(f);
        },
      }),
      btn("import", weT("导入字体集…"), () => {
        if (importInput && typeof importInput.click === "function") importInput.click();
      }, { title: weT("从「导出」得到的 .json 导入一份字体集") }),

      btn("new", weT("新建（以当前外观）"), () => onCreate(),
        { title: weT("把当前这套字体外观存成一份新的集，并切换过去（名字之后可以改）") }),
      btn("refresh", weT("刷新"), () => onRefresh()),
    ),
  );
}

export { renderFontSetEditor };

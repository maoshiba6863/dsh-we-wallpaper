function moduleResetButtonNode(moduleName, onResetModule, labels) {
  if (!moduleName) return null;
  const say = labels && typeof labels === 'object' ? labels : { title: '', aria: '' };
  const stop = (e) => { if (e && typeof e.stopPropagation === 'function') e.stopPropagation(); };
  return React.createElement("button", {
    className: "we-mod-reset",
    type: "button",
    title: say.title || '',
    "aria-label": say.aria || '',
    onClick: (e) => { stop(e); if (typeof onResetModule === 'function') onResetModule(moduleName); },
    onKeyDown: stop,
  }, "↺");
}

export { moduleResetButtonNode };

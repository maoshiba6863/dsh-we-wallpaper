function sectionHead(label, open, onToggle, action) {
  return React.createElement("div", {
    className: "we-picker__section-head we-picker__section-head--toggle",
    role: "button",
    tabIndex: 0,
    "aria-expanded": open ? "true" : "false",
    onClick: () => onToggle && onToggle(),
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (onToggle) onToggle();
      }
    },
  },
    React.createElement("span", { className: "we-picker__section-label" }, label),
    React.createElement("span", {
      className: "we-picker__section-caret" + (open ? " is-open" : ""),
      "aria-hidden": "true",
    }, "▾"),

    action || null,
  );
}

export { sectionHead };

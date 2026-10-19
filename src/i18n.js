const WE_I18N_NS = "wallpaper-engine";

function weI18nInterpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

function weT(key, params) {
  const text = String(key);
  const at = text.indexOf("\u0000");
  return weI18nInterpolate(at < 0 ? text : text.slice(at + 1), params);
}

function weI18nAttach() {
  return null;
}

function weOnLocaleChange() {
  return () => {};
}

function useWeLocale() {
  return 0;
}


export {
  weOnLocaleChange,
  weT,
  weI18nAttach,
  useWeLocale,
};

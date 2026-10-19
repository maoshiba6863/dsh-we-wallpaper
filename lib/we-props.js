const LANG_ORDER = ['zh-chs', 'zh-cht', 'en-us'];
const KNOWN_TYPES = new Set([
  'color', 'bool', 'slider', 'combo', 'text', 'textinput',
  'file', 'directory', 'group', 'other',
]);
const FILE_EXT = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.apng', '.svg'],
  video: ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v'],
  audio: ['.mp3', '.ogg', '.oga', '.wav', '.m4a', '.flac', '.aac'],
};
function orderOf(def) {
  const n = Number(def && def.order);
  return Number.isFinite(n) ? n : 0;
}
function strField(v, key) {
  const s = v && v[key];
  if (typeof s !== 'string') return undefined;
  const t = s.trim();
  return t === '' ? undefined : t;
}
function stripHtml(raw) {
  if (typeof raw !== 'string' || raw === '') return '';
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
function lookupLocalization(project, key) {
  const table = project && project.general && project.general.localization;
  if (!table || typeof table !== 'object') return undefined;
  const byLang = {};
  for (const k of Object.keys(table)) byLang[k.toLowerCase()] = table[k];
  for (const lang of LANG_ORDER) {
    const entry = byLang[lang];
    if (entry && typeof entry === 'object' && typeof entry[key] === 'string') return entry[key];
  }
  return undefined;
}
function resolveText(project, raw, key, fallback) {
  const loc = lookupLocalization(project, key);
  const src = typeof loc === 'string' && loc.trim() !== '' ? loc : raw;
  const clean = stripHtml(src);
  return clean !== '' ? clean : fallback;
}
function wireValue(ptype, def) {
  if (!def || !('value' in def)) return undefined;
  const raw = def.value;
  if (raw === null || raw === undefined) return undefined;
  switch (ptype) {
    case 'color':
      return typeof raw === 'string' ? raw : undefined;
    case 'bool':
      return typeof raw === 'boolean' ? raw : undefined;
    case 'slider': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'combo':
      return raw;
    default:
      return typeof raw === 'string' ? raw : JSON.stringify(raw);
  }
}
function rawProps(project) {
  const props = project && project.general && project.general.properties;
  if (!props || typeof props !== 'object') return [];
  const out = Object.entries(props).filter(([, v]) => v && typeof v === 'object' && typeof v.type === 'string');
  out.sort((a, b) => orderOf(a[1]) - orderOf(b[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return out;
}
export function parseUserPropDefs(project, overrides, opts = {}) {
  const ov = overrides && typeof overrides === 'object' ? overrides : {};
  const filePrefix = typeof opts.filePrefix === 'string' ? opts.filePrefix : '';
  const out = [];
  for (const [name, def] of rawProps(project)) {
    if (def.editable === false) continue;
    const ptype = String(def.type || 'other');
    const kind = KNOWN_TYPES.has(ptype) ? ptype : 'other';
    const dflt = wireValue(kind, def);
    const overridden = Object.prototype.hasOwnProperty.call(ov, name);
    let value = overridden ? ov[name] : dflt;
    if (kind === 'file' && typeof value === 'string' && value !== '' && filePrefix) value = `${filePrefix}${value}`;
    const entry = {
      name,
      ptype: kind,
      text: resolveText(project, typeof def.text === 'string' ? def.text : '', name, name),
      order: orderOf(def),
      value: value === undefined ? null : value,
      default: dflt === undefined ? null : dflt,
      overridden,
    };
    const cond = strField(def, 'condition');
    if (cond) entry.condition = cond;
    if (Array.isArray(def.options)) {
      const options = def.options
        .filter((o) => o && typeof o.label === 'string' && 'value' in o)
        .map((o) => {
          const opt = {
            label: resolveText(project, o.label, o.label,
              typeof o.value === 'string' ? o.value : JSON.stringify(o.value)),
            value: o.value,
          };
          const oc = strField(o, 'condition');
          if (oc) opt.condition = oc;
          return opt;
        });
      if (options.length) entry.options = options;
    }
    if (Number.isFinite(Number(def.min))) entry.min = Number(def.min);
    if (Number.isFinite(Number(def.max))) entry.max = Number(def.max);
    if (Number.isFinite(Number(def.step))) entry.step = Number(def.step);
    if (Number.isFinite(Number(def.precision))) entry.precision = Number(def.precision);
    const ft = strField(def, 'fileType');
    if (ft) entry.fileType = ft;
    if ((kind === 'file' || kind === 'directory') && Array.isArray(opts.listFiles)) {
      const exts = FILE_EXT[ft] || null;
      const files = opts.listFiles.filter((f) => {
        if (exts === null) return true;
        const lower = f.toLowerCase();
        return exts.some((e) => lower.endsWith(e));
      });
      if (files.length) entry.files = files.slice(0, 200);
    }
    out.push(entry);
  }
  return out;
}
export function entryDirPrefix(entryRel) {
  if (typeof entryRel !== 'string') return '';
  const rel = entryRel.trim().replace(/\\/g, '/');
  if (rel === '' || rel.startsWith('/') || rel.split('/').includes('..')) return '';
  const i = rel.lastIndexOf('/');
  return i < 0 ? '' : rel.slice(0, i + 1);
}
export function filterKnownOverrides(project, overrides) {
  const ov = overrides && typeof overrides === 'object' ? overrides : {};
  const declared = new Set(rawProps(project).map(([name]) => name));
  const out = {};
  for (const [name, v] of Object.entries(ov)) if (declared.has(name)) out[name] = v;
  return out;
}
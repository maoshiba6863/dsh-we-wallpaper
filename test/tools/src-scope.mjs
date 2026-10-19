import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BUILD_SCRIPT = join(ROOT, 'scripts', 'build-client.mjs');
export function parseInlineModules() {
  const src = readFileSync(BUILD_SCRIPT, 'utf8');
  const at = src.indexOf('const INLINE_MODULES = [');
  if (at < 0) throw new Error('src-scope: scripts/build-client.mjs 里找不到 `const INLINE_MODULES = [`');
  const end = src.indexOf('\n];', at);
  if (end < 0) throw new Error('src-scope: INLINE_MODULES 清单没有收尾 `\\n];`');
  const entries = [];
  for (const chunk of src.slice(at, end).split(/\n {2}\{/).slice(1)) {
    const file = chunk.match(/file:\s*'([^']+)'/);
    if (!file) continue;
    const mk = chunk.match(/markers:\s*\[([\s\S]*?)\]/);
    entries.push({
      file: file[1],
      markers: mk ? [...mk[1].matchAll(/'([^']*)'/g)].map((m) => m[1]) : [],
    });
  }
  if (entries.length === 0) throw new Error('src-scope: INLINE_MODULES 解析出 0 条');
  return entries;
}
export function scopeFiles(prefix) {
  const files = parseInlineModules().map((e) => e.file).filter((f) => f.startsWith(prefix));
  if (files.length === 0) throw new Error('src-scope: 前缀 ' + prefix + ' 在 INLINE_MODULES 里没有命中任何文件');
  return files;
}
export function scopeText(prefix, sep = '\n;\n') {
  return scopeFiles(prefix).map((f) => readFileSync(join(ROOT, f), 'utf8')).join(sep);
}
export function styleSources() {
  return scopeFiles('src/styles');
}
export function styleText(sep = '\n;\n') {
  return scopeText('src/styles', sep);
}
export function panelSources() {
  return scopeFiles('src/panel-tabs');
}
export function panelText(sep = '\n;\n') {
  return scopeText('src/panel-tabs', sep);
}
export function liveSources() { return scopeFiles('src/live-layer'); }
export function liveText(sep = '\n;\n') { return scopeText('src/live-layer', sep); }
export function clientSources() {
  const mods = scopeFiles('src/client');
  return ['src/client.js', ...mods.filter((rel) => rel !== 'src/client.js')];
}
export function clientText(sep = '\n;\n') {
  const mods = scopeFiles('src/client');
  const files = ['src/client.js', ...mods.filter((rel) => rel !== 'src/client.js')];
  return files.map((rel) => readFileSync(join(ROOT, rel), 'utf8')).join(sep);
}
const CSS_DECL_RE = /^[ \t]*const CSS(?:_[A-Z][A-Z0-9_]*)? = `([^`]*)`;/gm;
export function cssPartsOf(text) {
  return [...text.matchAll(CSS_DECL_RE)].map((m) => m[1]);
}
export function cssBodyOf(text) {
  const parts = cssPartsOf(text);
  if (!parts.length) {
    throw new Error('cssBodyOf: 一个样式域模板都没取到（锚点漂了？—— 这一格曾经会静默返回空串让判据恒真）');
  }
  return parts.join('');
}
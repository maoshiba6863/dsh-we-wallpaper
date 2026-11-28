import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  DEFAULTS, sanitizeFromSchema, serializeSettings, sanitizePresetValues,
  RESET_MODULES, RESET_TABS,
} from '../lib/settings-schema.js';

// Old profiles gain the default; an explicit opt-out survives host/client and
// preset round trips instead of being mistaken for a missing value.
for (const side of ['host', 'client']) {
  assert.equal(sanitizeFromSchema({}, side).readabilityBoost, true);
  const off = sanitizeFromSchema({ readabilityBoost: false }, side);
  assert.equal(sanitizeFromSchema(serializeSettings(off), side).readabilityBoost, false);
}
assert.equal(sanitizePresetValues({ readabilityBoost: false }).readabilityBoost, false);
assert.ok(RESET_MODULES.detail.includes('readabilityBoost'));
assert.ok(RESET_TABS.appearance.includes('readabilityBoost'));

const attrs = new Map();
const style = { setProperty() {}, removeProperty() {} };
let yielding = false;
const context = {
  document: { body: {
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k),
  } },
  skinYieldActive: () => yielding,
  glassColorOf: () => '#ffffff',
  weClampSurfaceColor: (v) => v,
};
const source = readFileSync(new URL('../src/glass.js', import.meta.url), 'utf8');
runInNewContext(source.replace(/^export \{[^}]+\};?\s*$/m, ''), context);
const selection = { ...DEFAULTS };
context.applyGlass(selection, style);
assert.equal(attrs.get('data-we-readability'), 'on');
selection.readabilityBoost = false;
context.applyGlass(selection, style);
assert.equal(attrs.has('data-we-readability'), false);
selection.readabilityBoost = true;
context.applyGlass(selection, style);
assert.equal(attrs.get('data-we-readability'), 'on');
yielding = true;
context.applyGlass(selection, style);
assert.equal(attrs.has('data-we-readability'), false);
assert.equal(attrs.has('data-we-glass-page'), false);

// Exercise the actual detail-row event, including the quick panel's context
// forwarding. A missing sidebar callback otherwise fails only when clicked.
const panelSource = readFileSync(new URL('../src/panel-tabs-appearance.js', import.meta.url), 'utf8');
const quickSource = readFileSync(new URL('../src/quick-panel.js', import.meta.url), 'utf8');
const pane = quickSource.slice(quickSource.indexOf('  function qpRenderAppearancePane('),
  quickSource.indexOf('  function qpRenderViewBar('));
let toggle;
const ui = {
  React: { Fragment: 'fragment', createElement: () => null },
  weT: (s) => s,
  sectionHead() {}, moduleResetButton() {}, SliderRow() {},
  switchRow: (label, checked, onChange) => { toggle = { checked, onChange }; },
  sidebarRenderCtx: (ctx) => ctx,
  fontSetCtx: () => ({}), officialColorOf() {}, setSetting() {}, setTransient() {},
};
for (const [name] of pane.matchAll(/\bon[A-Z]\w*\b|\bchildIndependentOn\b/g)) ui[name] = () => {};
const clicks = [];
ui.onReadabilityBoost = (v) => clicks.push(v);
ui.renderAppearanceTab = (ctx) => ui.renderAppearanceDetailSection(ctx);
runInNewContext(panelSource.replace(/^export \{[^}]+\};?\s*$/m, '') + '\n' + pane, ui);
for (const sidebar of [false, true]) {
  const sel = { ...DEFAULTS };
  if (sidebar) ui.qpRenderAppearancePane(sel, { detailOpen: true });
  else ui.renderAppearanceDetailSection({ sel, detailOpen: true, onReadabilityBoost: ui.onReadabilityBoost });
  assert.equal(toggle.checked, true);
  toggle.onChange({ target: { checked: false } });
}
assert.deepEqual(clicks, [false, false]);
console.log('PASS | Readability persistence, presets, resets, lifecycle and settings/sidebar toggle events');

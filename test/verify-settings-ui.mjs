import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { DEFAULTS } from '../lib/settings-schema.js';

function makeEl(tag) {
  return {
    tagName: tag.toUpperCase(), dataset: {}, style: { setProperty() {}, removeProperty() {} },
    children: [], classList: { add() {}, remove() {} },
    appendChild(node) { this.children.push(node); return node; }, remove() {},
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; }, contains() { return false; },
    addEventListener() {}, removeEventListener() {},
  };
}
const compiled = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
const tabKey = 'dsh-wallpaper-engine:picker-tab';
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function textOf(node) { return typeof node === 'string' ? node : (node.children || []).map(textOf).join(''); }

async function scenario(startTab, reproduceOldCall = false) {
  const store = { [tabKey]: startTab };
  const requests = [];
  const settings = { ...DEFAULTS, id: 'cycle', themeFollow: true, wallpaperThemes: { cycle: 'time' } };
  const document = {
    body: makeEl('body'), documentElement: makeEl('html'), head: makeEl('head'), hidden: false,
    createElement: makeEl, getElementById: () => null, querySelector: () => null,
    querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
  };
  let entry;
  const sandbox = {
    React, document, location: { origin: 'http://localhost' },
    setTimeout: () => 1, clearTimeout() {},
    window: {
      __ModuleLoader__: { load: (value) => { entry = value; } },
      setTimeout: () => 1, clearTimeout() {}, addEventListener() {}, removeEventListener() {},
      innerWidth: 1440, innerHeight: 900,
    },
    localStorage: { getItem: (key) => store[key] ?? null, setItem: (key, value) => { store[key] = value; }, removeItem: (key) => { delete store[key]; } },
    fetch: async (url, init = {}) => {
      requests.push({ url: String(url), method: init.method || 'GET' });
      const data = String(url).endsWith('/settings') ? { settings }
        : String(url).includes('/fontsets') ? { fontsets: [], active: '' }
          : String(url).includes('/update-check') ? { current: '2.1.2', latest: '2.1.2' }
            : String(url).includes('/inventory') ? { wallpapers: [
              { id: 'cycle', title: 'Clock wallpaper', type: 'video', playable: true, media: '/media/cycle', contentrating: 'Everyone' },
            ], total: 1, playlists: [] } : {};
      return { ok: true, status: 200, json: async () => data };
    },
  };
  const code = reproduceOldCall ? compiled.replace('React.createElement(VersionSection, null)', 'VersionSection()') : compiled;
  if (reproduceOldCall) assert.notEqual(code, compiled, 'The negative control must replace the real component call');
  vm.runInNewContext(code, sandbox, { filename: 'client.js' });
  const plugin = entry.factory((name) => name === 'react' ? React : { createPortal: (node) => node });
  let renderSettings;
  plugin.apply({ slots: {
    inject: (name, cb) => cb(),
    register: (meta, render) => { if (meta.name === 'settings.section') renderSettings = render; },
  } });
  await flush();
  let renderer;
  try {
    await act(async () => { renderer = TestRenderer.create(React.createElement(renderSettings), { createNodeMock: () => makeEl('div') }); await flush(); });
    for (const label of ['系统', '外观', '壁纸库', '系统', '扩展', '系统', '外观']) {
      const tab = renderer.root.findAllByProps({ role: 'tab' }).find((node) => textOf(node) === label);
      assert.ok(tab, 'Settings tabs must remain mounted');
      await act(async () => { tab.props.onClick(); await flush(); });
      assert.equal(store[tabKey], { 系统: 'system', 外观: 'appearance', 壁纸库: 'library', 扩展: 'extensions' }[label]);
      assert.equal(renderer.root.findAllByProps({ role: 'tabpanel' }).length, 1);
      if (label === '系统') assert.ok(textOf(renderer.root).includes('当前版本2.1.2'), 'Version response must be rendered');
    }
    // Exercise the schedule inputs, then other controls after all transitions.
    const clock = renderer.root.findByProps({ 'aria-label': '夜间开始' });
    await act(async () => { clock.props.onChange({ target: { value: '20:30' } }); await flush(); });
    assert.equal(renderer.root.findByProps({ 'aria-label': '夜间开始' }).props.value, '20:30');
    for (const label of ['深色壁纸', '浅色壁纸', '随时间']) {
      const button = renderer.root.findAllByType('button').find((node) => textOf(node) === label);
      await act(async () => { button.props.onClick(); await flush(); });
      assert.ok(renderer.toJSON(), 'A theme-mode change must not blank the settings page');
    }
    return requests;
  } finally {
    if (renderer) await act(async () => renderer.unmount());
  }
}

for (const tab of ['library', 'system', 'appearance']) await scenario(tab);
const originalError = console.error;
let oldFailure;
try {
  console.error = () => {};
  await scenario('library', true);
} catch (error) { oldFailure = error; }
finally { console.error = originalError; }
assert.match(String(oldFailure), /Rendered more hooks|Rendered fewer hooks|order of Hooks/,
  'The same test must reject the old direct-call implementation');
console.log('PASS | Real React: saved tabs, repeated tab switches, version data, schedule edits, theme controls and direct-call negative control');

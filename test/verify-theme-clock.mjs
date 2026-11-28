import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { DEFAULTS, sanitizeFromSchema, serializeSettings, sanitizePresetValues, RESET_MODULES, RESET_TABS } from '../lib/settings-schema.js';

const raw = { themeFollow: true, themeDayStart: 480, themeNightStart: 1200,
  wallpaperThemes: { night: 'dark', day: 'light', cycle: 'time', invalid: 'blue' } };
for (const side of ['host', 'client']) {
  const out = sanitizeFromSchema(raw, side);
  assert.deepEqual(out.wallpaperThemes, { night: 'dark', day: 'light', cycle: 'time' });
  const saved = sanitizeFromSchema(serializeSettings(out), side);
  assert.deepEqual(saved.wallpaperThemes, out.wallpaperThemes);
  assert.equal(saved.themeDayStart, 480); assert.equal(saved.themeNightStart, 1200);
}
assert.deepEqual(sanitizePresetValues(raw).wallpaperThemes, { night: 'dark', day: 'light', cycle: 'time' });
assert.ok(RESET_MODULES.theme.includes('wallpaperThemes'));
assert.ok(RESET_TABS.appearance.includes('themeDayStart'));

const source = readFileSync(new URL('../src/theme-follow.js', import.meta.url), 'utf8');
function harness(mode = 'time', preference = 'light') {
  let clock = new Date(2026, 10, 28, 6, 59, 59).getTime();
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } }
  const timers = new Map(); const events = new Map(); const handlers = [];
  const calls = []; let timerId = 0; let imageReads = 0; let yielding = false;
  const ctx = {
    Date: ClockDate,
    selection: { ...DEFAULTS, id: 'cycle', themeFollow: true, wallpaperThemes: { cycle: mode } },
    weT: (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => p && k in p ? p[k] : m),
    reportClientDiag() {}, setTransient() {}, propTokenOf: () => '',
    skinYieldActive: () => yielding,
    window: {
      setTimeout: (cb, ms) => { timers.set(++timerId, { cb, ms }); return timerId; },
      clearTimeout: (id) => timers.delete(id),
      addEventListener: (name, cb) => events.set(name, cb),
      removeEventListener: (name) => events.delete(name),
    },
    document: {
      hidden: false,
      createElement() { imageReads++; throw new Error('Time mode must never inspect a frame'); },
      addEventListener: (name, cb) => events.set(name, cb),
      removeEventListener: (name) => events.delete(name),
    },
    Image: class { constructor() { imageReads++; throw new Error('Time mode must never load a preview'); } },
  };
  runInNewContext(source.replace(/^export \{[\s\S]*?\};?\s*$/m, ''), ctx);
  const service = { getTheme: () => ({ preference }), setTheme(v) { preference = v; calls.push(v); handlers.forEach((cb) => cb()); } };
  ctx.themeFollowAttach(service, { on: (name, cb) => { handlers.push(cb); return () => {}; } });
  return { ctx, calls, timers, events, get imageReads() { return imageReads; },
    at(hour, minute = 0, second = 0) { clock = new Date(2026, 10, 28, hour, minute, second).getTime(); },
    tick() { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.cb(); },
    manual(v) { preference = v; handlers.forEach((cb) => cb()); },
    yield(v) { yielding = v; },
  };
}
{
  const h = harness();
  assert.deepEqual(h.calls, ['dark']);
  assert.equal(h.timers.size, 1);
  assert.equal([...h.timers.values()][0].ms, 1000); // Exact next boundary.
  h.ctx.themeFollowOnFrameCanvas({}); h.ctx.themeFollowOnFrameImage('unused.png');
  assert.equal(h.imageReads, 0);
  h.at(7); h.tick(); assert.deepEqual(h.calls, ['dark', 'light']);
  assert.equal([...h.timers.values()][0].ms, 3600000); // Only clock checks between boundaries.
  h.at(12); h.tick(); assert.deepEqual(h.calls, ['dark', 'light']); // No duplicate writes.
  h.at(20); h.events.get('visibilitychange')(); // Sleep/resume or clock adjustment.
  assert.deepEqual(h.calls, ['dark', 'light', 'dark']);
  h.manual('light'); h.ctx.themeFollowSyncClock();
  assert.equal(h.timers.size, 0); assert.equal(h.events.size, 0);
  assert.deepEqual(h.calls, ['dark', 'light', 'dark']);
  h.ctx.themeFollowOnWallpaper(h.ctx.selection, { userChoice: true });
  assert.deepEqual(h.calls, ['dark', 'light', 'dark', 'dark']);
  h.yield(true); h.ctx.themeFollowSyncClock(); assert.equal(h.timers.size, 0);
  assert.equal(h.imageReads, 0);
}
{
  const h = harness('dark');
  assert.deepEqual(h.calls, ['dark']); assert.equal(h.timers.size, 0);
  h.ctx.selection.wallpaperThemes.cycle = 'light';
  h.ctx.themeFollowOnWallpaper(h.ctx.selection, { userChoice: true });
  assert.deepEqual(h.calls, ['dark', 'light']);
  h.ctx.selection.wallpaperThemes.cycle = 'time';
  h.ctx.themeFollowOnWallpaper(h.ctx.selection, { userChoice: true });
  assert.equal(h.timers.size, 1);
  h.ctx.selection.themeFollow = false; h.ctx.themeFollowSyncClock();
  assert.equal(h.timers.size, 0); assert.equal(h.events.size, 0);
}
{
  const h = harness();
  const sel = { themeDayStart: 1200, themeNightStart: 360 };
  assert.equal(h.ctx.themeFollowClockVerdict(sel, new Date(2026, 10, 28, 23)), 'light');
  assert.equal(h.ctx.themeFollowClockVerdict(sel, new Date(2026, 10, 28, 5)), 'light');
  assert.equal(h.ctx.themeFollowClockVerdict(sel, new Date(2026, 10, 28, 6)), 'dark');
  assert.equal(h.ctx.themeFollowClockVerdict(sel, new Date(2026, 10, 28, 19)), 'dark');
  assert.equal(h.ctx.themeFollowClockVerdict(sel, new Date(2026, 10, 28, 20)), 'light');
  h.ctx.themeFollowRelease();
  assert.equal(h.timers.size, 0); assert.equal(h.events.size, 0);
  assert.deepEqual(h.calls, ['dark', 'light']); // Original preference returned.
}
console.log('PASS | Per-wallpaper modes, schedule boundaries, midnight range, persistence, no image reads, resume, manual priority and cleanup');

import { join } from 'node:path';
import { createMediaBridge as createLegacy } from './legacy.js';
import { createBridgeSupervisor } from './supervisor.js';
import { provisionMediaBridge } from './provision.js';
export function createMediaBackend({ dataDir, cacheBaseDir = join(dataDir, 'cache'), log = () => {}, diag = () => {} }) {
  const cacheRoot = () => (typeof cacheBaseDir === 'function' ? cacheBaseDir() : cacheBaseDir);
  let started = false;
  let useBridge = false;
  let fallback = '';
  let note = '';
  let booting = null;
  let sup = null;
  let legacy = null;
  const optsRef = { audio: true, online: false };
  const forceLegacy = String(process.env.DSH_WE_MEDIA_LEGACY || '').trim() === '1';
  function legacyBackend() {
    if (!legacy) legacy = createLegacy({ dataDir, cacheBaseDir: cacheRoot, log, audio: optsRef.audio });
    return legacy;
  }
  function active() {
    if (useBridge && sup && sup.ready()) return sup;
    return legacyBackend();
  }
  function fallBackTo(reason) {
    if (fallback) return;
    fallback = reason || '中间件不可用';
    useBridge = false;
    note = '';
    log('回落到内置媒体实现：' + fallback, 'warn');
    diag('media-fallback', { reason: String(fallback).slice(0, 200) });
    try { legacyBackend().start(); } catch (err) { log('内置媒体实现启动失败：' + err, 'warn'); }
  }
  function bootBridge() {
    if (booting) return booting;
    booting = (async () => {
      note = '正在准备系统媒体中间件…';
      const prov = await provisionMediaBridge({ dataDir, log });
      if (!prov.path) { fallBackTo(prov.error || '中间件产物不可用'); return; }
      sup = createBridgeSupervisor({
        binPath: prov.path,
        cacheDir: join(cacheRoot(), 'media-bridge'),
        log,
        diag,
        onFatal: (why) => fallBackTo(why),
      });
      const ok = await sup.start({ audio: optsRef.audio, online: optsRef.online });
      if (!ok) { fallBackTo(sup.lastError() || '中间件启动失败'); return; }
      useBridge = true;
      note = '';
      log(`媒体数据源：系统媒体中间件（${prov.source}${prov.tag ? ', ' + prov.tag : ''}）`, 'info');
    })().catch((err) => {
      fallBackTo('中间件准备出错：' + String(err && err.message ? err.message : err));
    }).finally(() => { booting = null; });
    return booting;
  }
  return {
    start(opts = {}) {
      if (started) return;
      started = true;
      Object.assign(optsRef, { audio: opts.audio !== false, online: opts.online === true });
      if (forceLegacy) {
        fallback = '按 DSH_WE_MEDIA_LEGACY=1 使用内置实现';
        log('媒体数据源：内置实现（DSH_WE_MEDIA_LEGACY=1）', 'info');
        legacyBackend().start();
        return;
      }
      bootBridge();
    },
    stop() {
      try { if (sup) sup.stop(); } catch {   }
      try { if (legacy) legacy.stop(); } catch {   }
    },
    spectrum: () => active().spectrum(),
    nowPlaying: () => active().nowPlaying(),
    artworkFile: () => active().artworkFile(),
    artworkMime: () => active().artworkMime(),
    async control(action) {
      if (useBridge && sup && sup.ready()) return sup.control(action);
      return { ok: false, error: fallback ? 'control-unsupported' : 'media-backend-not-ready' };
    },
    status() {
      const live = useBridge && sup && sup.ready();
      const st = active().status();
      return {
        ...st,
        backend: live ? 'bridge' : st.backend,
        fallback,
        note,
      };
    },
    usingBridge: () => Boolean(useBridge && sup && sup.ready()),
    bridgeInfo: () => (sup ? sup.info() : null),
  };
}
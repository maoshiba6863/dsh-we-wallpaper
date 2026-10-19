import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
const LEGACY_SWEEP_MAX_FILES = 512;
const WARM_MAX_SOURCES = 12;
const MEDIA_CHOICE_PIN = new Map();
const MEDIA_PIN_TTL_MS = 10 * 60 * 1000;
export function createFaststartKit(c) {
  const { layoutFor, cacheBaseDir, legacyCacheBaseDir, readConfig, mediaMap } = c;
  function legacyFaststartDirs() {
    const dirs = [join(cacheBaseDir(), 'faststart')];
    try {
      const old = typeof legacyCacheBaseDir === 'function' ? legacyCacheBaseDir() : '';
      if (old) {
        const dir = join(old, 'faststart');
        if (!dirs.some((d) => resolve(d).toLowerCase() === resolve(dir).toLowerCase())) dirs.push(dir);
      }
    } catch {   }
    return dirs;
  }
  function sweepLegacyFaststartVariants() {
    const out = { files: 0, bytes: 0, capped: false };
    for (const dir of legacyFaststartDirs()) {
      if (out.capped) break;
      let names;
      try { names = readdirSync(dir); } catch { continue; }
      for (const name of names) {
        if (out.files >= LEGACY_SWEEP_MAX_FILES) { out.capped = true; break; }
        if (!/^fs_.*\.mp4(\.tmp\d*)?$/.test(name)) continue;
        const file = join(dir, name);
        try {
          const st = statSync(file);
          if (!st.isFile()) continue;
          unlinkSync(file);
          out.files += 1;
          out.bytes += st.size;
        } catch {   }
      }
    }
    return out;
  }
  function faststartVariant(abs, logFn) {
    if (!abs) return null;
    let res;
    try { res = layoutFor(abs, logFn); } catch { return null; }
    if (!res || res.kind !== 'virtual') return null;
    return { abs, layout: res };
  }
  function pinnedFaststartVariant(abs, token, logFn) {
    if (!abs) return null;
    const key = String(token || abs);
    const now = Date.now();
    const pin = MEDIA_CHOICE_PIN.get(key);
    if (pin && now - pin.at < MEDIA_PIN_TTL_MS) {
      pin.at = now;
      if (!pin.virtual) return null;
      const again = faststartVariant(abs, logFn);
      if (again) return again;
      pin.virtual = false;
      return null;
    }
    const pick = faststartVariant(abs, logFn);
    MEDIA_CHOICE_PIN.set(key, { virtual: Boolean(pick), at: now });
    if (MEDIA_CHOICE_PIN.size > 200) {
      const oldest = [...MEDIA_CHOICE_PIN.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) MEDIA_CHOICE_PIN.delete(oldest[0]);
    }
    return pick;
  }
  let started = false;
  async function warmFaststartFavorites(wallpapers, logFn) {
    if (started) return;
    started = true;
    let favIds = [];
    try {
      const cfg = readConfig();
      const groups = (cfg && cfg.settings && Array.isArray(cfg.settings.rotationGroups))
        ? cfg.settings.rotationGroups : [];
      favIds = groups.flatMap((g) => (g && Array.isArray(g.wallpaperIds) ? g.wallpaperIds : [])).map(String);
    } catch {   }
    const videos = (Array.isArray(wallpapers) ? wallpapers : [])
      .filter((w) => w.type === 'video' && w.media);
    const picked = [
      ...videos.filter((w) => favIds.includes(String(w.id))),
      ...videos.filter((w) => !favIds.includes(String(w.id))),
    ].slice(0, WARM_MAX_SOURCES);
    for (const w of picked) {
      try {
        const abs = mediaMap.get(String(w.media).split('/').pop());
        if (abs) faststartVariant(abs, logFn);
      } catch {   }
    }
  }
  return { faststartVariant, pinnedFaststartVariant, warmFaststartFavorites, sweepLegacyFaststartVariants };
}
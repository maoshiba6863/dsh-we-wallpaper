import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
export function createSteamDiscoveryKit({ WE_APPID, pathExistsP }) {
  const STEAM_PROBE_DIRS = [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    'D:\\Steam',
    'D:\\SteamLibrary',
    'E:\\SteamLibrary',
  ];
  async function resolveRegExeP() {
    if (process.platform === 'win32') {
      return join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
    }
    if (process.platform !== 'linux') return null;
    let letters;
    try { letters = (await readdir('/mnt')).filter((n) => /^[a-zA-Z]$/.test(n)); } catch { return null; }
    for (const letter of letters) {
      const p = join('/mnt', letter, 'Windows', 'System32', 'reg.exe');
      if (await pathExistsP(p)) return p;
    }
    return null;
  }
  function steamPathFromRegistryP() {
    return resolveRegExeP().then((reg) => {
      if (!reg) return null;
      return new Promise((resolvePromise) => {
        try {
          execFile(
            reg,
            ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
            { encoding: 'utf8', windowsHide: true, timeout: 5000 },
            (err, stdout) => {
              if (err) { resolvePromise(null); return; }
              const m = /SteamPath\s+REG_SZ\s+(.+)/i.exec(stdout || '');
              const p = m ? normalize(m[1].trim()) : null;
              resolvePromise(p ? wslPath(p) : null);
            },
          );
        } catch { resolvePromise(null); }
      });
    });
  }
  function steamRootsFromEnv() {
    const raw = process.env.DSH_WE_STEAM_ROOT && process.env.DSH_WE_STEAM_ROOT.trim();
    if (!raw) return [];
    return raw
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map(wslPath);
  }
  async function wslSteamRootsP() {
    if (process.platform !== 'linux') return [];
    let letters;
    try { letters = (await readdir('/mnt')).filter((n) => /^[a-zA-Z]$/.test(n)); } catch { return []; }
    const roots = [];
    for (const letter of letters) {
      const base = join('/mnt', letter);
      for (const c of [
        join(base, 'Program Files (x86)', 'Steam'),
        join(base, 'Program Files', 'Steam'),
        join(base, 'Steam'),
        join(base, 'SteamLibrary'),
      ]) {
        if (await pathExistsP(join(c, 'steamapps', 'libraryfolders.vdf'))) roots.push(c);
      }
    }
    return roots;
  }
  const STEAM_PROBE_TTL_MS = 60 * 1000;
  let steamProbeCache = null;
  let steamProbeInflight = null;
  async function steamProbeDirsP() {
    const envKey = process.env.DSH_WE_STEAM_ROOT || '';
    if (steamProbeCache && steamProbeCache.key === envKey
        && Date.now() - steamProbeCache.t < STEAM_PROBE_TTL_MS) {
      return steamProbeCache.dirs;
    }
    if (steamProbeInflight) return steamProbeInflight;
    steamProbeInflight = (async () => {
      const env = steamRootsFromEnv();
      const reg = await steamPathFromRegistryP();
      const wsl = await wslSteamRootsP();
      return [...env, ...(reg ? [reg] : []), ...STEAM_PROBE_DIRS, ...wsl];
    })();
    try {
      const dirs = await steamProbeInflight;
      steamProbeCache = { t: Date.now(), key: envKey, dirs };
      return dirs;
    } finally {
      steamProbeInflight = null;
    }
  }
  function wslPath(p) {
    if (process.platform !== 'linux' || typeof p !== 'string') return p;
    const m = /^([a-zA-Z]):[\\/](.*)$/.exec(p);
    if (!m) return p;
    return join('/mnt', m[1].toLowerCase(), m[2].replace(/\\/g, '/'));
  }
  async function librariesFromVdfP(vdfPath) {
    let text;
    try { text = await readFile(vdfPath, 'utf8'); } catch { return []; }
    const libs = [];
    let current = null;
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*"path"\s+"([^"]+)"\s*$/.exec(line);
      if (m) { current = m[1].replace(/\\\\/g, '\\'); continue; }
      if (current && line.includes(WE_APPID)) {
        const t = wslPath(current);
        if (t && !libs.includes(t)) libs.push(t);
      }
    }
    return libs;
  }
  const WE_INSTALL_MARKERS = [
    'wallpaper32.exe',
    'wallpaper64.exe',
    join('distribution', 'wallpaper32.exe'),
    join('distribution', 'wallpaper64.exe'),
    join('distribution', 'version.json'),
  ];
  async function isWallpaperEngineRootP(dir) {
    for (const marker of WE_INSTALL_MARKERS) {
      if (await pathExistsP(join(dir, marker))) return true;
    }
    return false;
  }
  async function locateWallpaperEngineP() {
    const candidates = [];
    const libraries = [];
    const probes = await steamProbeDirsP();
    for (const probe of probes) {
      const vdf = join(probe, 'steamapps', 'libraryfolders.vdf');
      if (await pathExistsP(vdf)) {
        try { libraries.push(...await librariesFromVdfP(vdf)); } catch {   }
      }
    }
    const roots = [...probes, ...libraries];
    for (const root of roots) candidates.push(join(root, 'steamapps', 'common', 'wallpaper_engine'));
    candidates.push(wslPath('C:\\Program Files (x86)\\Wallpaper Engine'));
    const seen = new Set();
    for (const raw of candidates) {
      const dir = normalize(raw);
      if (seen.has(dir)) continue;
      seen.add(dir);
      if (await isWallpaperEngineRootP(dir)) return dir;
    }
    return null;
  }
  async function owningLibrariesP() {
    const libs = [];
    for (const probe of await steamProbeDirsP()) {
      const vdf = join(probe, 'steamapps', 'libraryfolders.vdf');
      if (await pathExistsP(vdf)) {
        try { libs.push(...await librariesFromVdfP(vdf)); } catch {   }
      }
      if (await pathExistsP(join(probe, 'steamapps', 'workshop', 'content', WE_APPID))) libs.push(probe);
    }
    return [...new Set(libs)];
  }
  return { locateWallpaperEngineP, owningLibrariesP };
}
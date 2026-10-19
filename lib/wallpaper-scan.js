import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join, normalize, resolve } from 'node:path';
export function createWallpaperScanKit({ WE_APPID, pathExistsP, isFileP, isDirectoryP }) {
  function inferType(file) {
    if (/\.(mp4|webm|mkv|avi|mov)$/i.test(file)) return 'video';
    if (/\.(html?|js)$/i.test(file)) return 'web';
    return 'scene';
  }
  function extOf(p) {
    const s = String(p || '');
    const dot = s.lastIndexOf('.');
    const sepAt = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
    return dot > sepAt + 1 ? s.slice(dot + 1).toLowerCase() : '';
  }
  const KINDS = ['scene', 'video', 'web', 'application'];
  function schemeToCss(v) {
    if (typeof v !== 'string') return null;
    const parts = v.trim().split(/\s+/).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some((x) => !Number.isFinite(x))) return null;
    const c = parts.slice(0, 3).map((x) => Math.max(0, Math.min(255, Math.round(x * 255))));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }
  async function readProjectP(dir) {
    const pj = join(dir, 'project.json');
    if (!(await pathExistsP(pj))) return null;
    try {
      const o = JSON.parse(await readFile(pj, 'utf8'));
      if (!o || typeof o !== 'object' || !o.file) return null;
      let type = typeof o.type === 'string' ? o.type.toLowerCase() : inferType(o.file);
      if (!KINDS.includes(type)) type = 'scene';
      return {
        id: basename(dir),
        title: typeof o.title === 'string' ? o.title : basename(dir),
        type,
        file: o.file,
        preview: typeof o.preview === 'string' ? o.preview : null,
        contentrating: typeof o.contentrating === 'string' ? o.contentrating : null,
        schemeColor: schemeToCss(o.general && o.general.properties
          && o.general.properties.schemecolor && o.general.properties.schemecolor.value),
      };
    } catch { return null; }
  }
  async function resolveSceneMainFileP(dir, declared) {
    for (const candidate of [declared, 'scene.pkg', 'scene.json']) {
      if (!candidate) continue;
      if (await isFileP(resolve(dir, candidate))) return candidate;
    }
    let pkgs;
    try {
      pkgs = (await readdir(dir)).filter((name) => name.toLowerCase().endsWith('.pkg'));
    } catch {
      return null;
    }
    return pkgs.length === 1 ? pkgs[0] : null;
  }
  const SCAN_CHUNK = 24;
  async function scanRootsP(installDir, libraryDirs) {
    const roots = [];
    if (installDir) {
      for (const sub of ['defaultprojects', 'myprojects']) {
        const p = join(installDir, 'projects', sub);
        if (await pathExistsP(p)) roots.push(p);
      }
    }
    for (const lib of libraryDirs) {
      const ws = join(lib, 'steamapps', 'workshop', 'content', WE_APPID);
      if (await pathExistsP(ws)) roots.push(ws);
    }
    return roots;
  }
  async function scanSignatureP(installDir, libraryDirs) {
    const h = createHash('sha1');
    h.update('we-scan-v1\0');
    h.update(String(installDir || ''));
    h.update('\0');
    h.update([...libraryDirs].join('\0'));
    h.update('\0');
    for (const root of await scanRootsP(installDir, libraryDirs)) {
      let stamp = 'missing';
      try {
        const st = await stat(root);
        stamp = `${Math.round(st.mtimeMs)}:${st.size}`;
      } catch {   }
      h.update(root + '\0' + stamp + '\0');
    }
    return h.digest('hex');
  }
  async function enumerateWallpapersAsync(installDir, libraryDirs) {
    const found = new Map();
    const roots = await scanRootsP(installDir, libraryDirs);
    const projectDirs = [];
    for (const root of roots) {
      let entries;
      try { entries = await readdir(root); } catch { continue; }
      for (const entry of entries) {
        const dir = join(root, entry);
        if (await isDirectoryP(dir)) projectDirs.push(dir);
      }
    }
    for (let i = 0; i < projectDirs.length; i += SCAN_CHUNK) {
      const chunk = projectDirs.slice(i, i + SCAN_CHUNK);
      const results = await Promise.all(chunk.map((dir) => readProjectP(dir).then((p) => p ? { dir, p } : null)));
      for (const hit of results) {
        if (!hit || found.has(hit.p.id)) continue;
        const { dir, p: proj } = hit;
        proj.fileAbs = proj.type === 'scene'
          ? resolve(dir, (await resolveSceneMainFileP(dir, proj.file)) || proj.file)
          : resolve(dir, proj.file);
        proj.previewAbs = proj.preview ? resolve(dir, proj.preview) : null;
        proj.dirAbs = dir;
        found.set(proj.id, proj);
      }
    }
    return [...found.values()].sort((a, b) =>
      (a.title || '').localeCompare(b.title || ''));
  }
  function pathKey(file) {
    return normalize(String(file).replace(/\//g, '\\')).toLowerCase();
  }
  function playlistId(profileName, index, name) {
    return Buffer.from(`${profileName}\0${index}\0${name}`, 'utf8').toString('base64url');
  }
  function playlistRows(profile) {
    const general = profile && typeof profile === 'object' ? profile.general : null;
    if (!general || typeof general !== 'object') return [];
    if (Array.isArray(general.playlists) && general.playlists.length) return general.playlists;
    const selected = general.wallpaperconfig && general.wallpaperconfig.selectedwallpapers;
    if (!selected || typeof selected !== 'object') return [];
    return Object.values(selected)
      .map((monitor) => monitor && monitor.playlist)
      .filter((playlist) => playlist && typeof playlist === 'object');
  }
  async function readPlaylistsP(installDir) {
    if (!installDir) return [];
    const configPath = join(installDir, 'config.json');
    if (!(await pathExistsP(configPath))) return [];
    let config;
    try { config = JSON.parse(await readFile(configPath, 'utf8')); } catch { return []; }
    const result = [];
    const seen = new Set();
    for (const [profileName, profile] of Object.entries(config || {})) {
      for (const [index, row] of playlistRows(profile).entries()) {
        const items = Array.isArray(row.items)
          ? row.items.filter((item) => typeof item === 'string' && item.trim())
          : [];
        if (!items.length) continue;
        const name = typeof row.name === 'string' && row.name.trim()
          ? row.name.trim() : `Playlist ${index + 1}`;
        const signature = `${name}\0${items.join('\0')}`;
        if (seen.has(signature)) continue;
        seen.add(signature);
        const settings = row.settings && typeof row.settings === 'object' ? row.settings : {};
        result.push({
          id: playlistId(profileName, index, name),
          name,
          items,
          order: settings.order === 'random' ? 'random' : 'sequence',
          delay: typeof settings.delay === 'number' ? settings.delay : null,
        });
      }
    }
    return result;
  }
  function playlistItemId(item, byPath, byId) {
    const exact = byPath.get(pathKey(item));
    if (exact) return exact;
    const match = /[\\/]431960[\\/]([^\\/]+)(?:[\\/]|$)/i.exec(item);
    const project = match ? byId.get(match[1]) : null;
    if (project) return project.id;
    const folder = /[\\/]([^\\/]+)[\\/][^\\/]+$/i.exec(item);
    if (folder && byId.has(folder[1])) return folder[1];
    return null;
  }
  return {
    extOf,
    readProjectP,
    resolveSceneMainFileP,
    SCAN_CHUNK,
    scanSignatureP,
    enumerateWallpapersAsync,
    pathKey,
    readPlaylistsP,
    playlistItemId,
  };
}
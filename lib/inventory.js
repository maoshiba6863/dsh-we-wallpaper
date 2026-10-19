import { statSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
export function createInventoryBuilder(c) {
  const {
    log, BASE, tokenFor, mediaOriginApi, warmFaststart,
    locateWallpaperEngineP, owningLibrariesP, enumerateWallpapersAsync, scanSignatureP,
    pathKey, listCustomFrameIds, pathExistsP, mtimeOrNullP, extOf,
    ensureUploadDir, readUploadMeta, enumerateUploadsP, metaEntry,
    readPlaylistsP, playlistItemId, weAssetsAvailable,
    sceneVideoProbeKey, sceneVideoProbeGet, scheduleSceneVideoProbe, customIdFromAbs,
    getUploadDir, getWeAssetsDir, cacheBaseDir,
  } = c;
  function sceneFieldsFor(w, hasFrame, customIds, sceneMtime) {
    const isScene = Boolean(w.type === 'scene' && hasFrame && w.fileAbs);
    const isPkg = isScene && !w.fileAbs.toLowerCase().endsWith('.json');
    const svKey = isScene ? sceneVideoProbeKey(w.fileAbs, sceneMtime) : null;
    const svKnown = svKey === null ? undefined : sceneVideoProbeGet(svKey);
    if (svKey !== null && svKnown === undefined) scheduleSceneVideoProbe(w.fileAbs, svKey);
    let scenePkgBytes = 0;
    if (isPkg) {
      try { scenePkgBytes = statSync(w.fileAbs).size || 0; } catch { scenePkgBytes = 0; }
    }
    return {
      sceneLive: isScene,
      sceneLiveSrc: isScene ? tokenFor(w.fileAbs) : null,
      scenePkgBytes,
      sceneVideo: svKnown === true ? `${BASE}/scene-video/${tokenFor(w.fileAbs)}` : null,
      sceneAudio: isScene ? `${BASE}/scene-audio/${tokenFor(w.fileAbs)}` : null,
      hasCustomFrame: isScene ? customIds.has(customIdFromAbs(w.fileAbs)) : false,
    };
  }
  function webFieldsFor(w, entryOk, mediaBase) {
    const isWeb = Boolean(w.type === 'web' && entryOk && w.fileAbs);
    return {
      webLive: isWeb,
      webLiveSrc: isWeb
        ? `${mediaBase || ''}${BASE}/scene-files/${tokenFor(w.fileAbs)}/${basename(w.fileAbs)}`
        : null,
    };
  }
  const INVENTORY_TTL_MS = 3000;
  const INDEX_VERSION = 2;
  const INDEX_FILE = 'inventory-index.json';
  const INVENTORY_REVALIDATE_MS = 30000;
  const PROBE_CHUNK = 24;
  let inventoryCache = null;
  let indexLoaded = false;
  let indexState = null;
  let rebuildInFlight = null;
  function indexPath() {
    try {
      const dir = cacheBaseDir();
      return dir ? join(dir, INDEX_FILE) : '';
    } catch { return ''; }
  }
  async function loadIndex() {
    if (indexLoaded) return indexState;
    indexLoaded = true;
    const file = indexPath();
    if (!file) return null;
    try {
      const raw = JSON.parse(await readFile(file, 'utf8'));
      if (!raw || raw.v !== INDEX_VERSION || typeof raw.sig !== 'string'
        || !Array.isArray(raw.we) || !raw.probes || typeof raw.probes !== 'object') return null;
      if (!raw.we.every((w) => w && typeof w === 'object')) return null;
      indexState = {
        builtAt: Number(raw.builtAt) || 0,
        sig: raw.sig,
        installDir: typeof raw.installDir === 'string' ? raw.installDir : null,
        libraryDirs: Array.isArray(raw.libraryDirs) ? raw.libraryDirs : [],
        we: raw.we,
        probes: raw.probes,
      };
      return indexState;
    } catch { return null; }
  }
  async function saveIndex(entry) {
    indexState = entry;
    indexLoaded = true;
    const file = indexPath();
    if (!file) return;
    try {
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify({
        v: INDEX_VERSION,
        builtAt: entry.builtAt,
        sig: entry.sig,
        installDir: entry.installDir,
        libraryDirs: entry.libraryDirs,
        we: entry.we,
        probes: entry.probes,
      }), 'utf8');
      await rename(tmp, file);
    } catch {   }
  }
  function liveEntries(list) {
    return (Array.isArray(list) ? list : []).filter((w) => w && typeof w === 'object');
  }
  async function assembleInventory(we, probes, installDir, libraryDirs, revalidate) {
    const items = liveEntries(we);
    const byPath = new Map(items.map((w) => [pathKey(w.fileAbs), w.id]));
    const byId = new Map(items.map((w) => [w.id, w]));
    const customIds = listCustomFrameIds();
    const wallpapers = [];
    for (let i = 0; i < items.length; i += PROBE_CHUNK) {
      const rows = await Promise.all(items.slice(i, i + PROBE_CHUNK).map(async (w) => {
        const probeKey = w.fileAbs ? pathKey(w.fileAbs) : '';
        const stamp = revalidate && w.dirAbs ? await mtimeOrNullP(w.dirAbs) : undefined;
        const known = probeKey ? probes[probeKey] : undefined;
        let reused = null;
        if (known && Array.isArray(known.v) && known.v.length === 3) {
          if (!revalidate) reused = known;
          else if (stamp !== undefined && known.m === stamp) reused = known;
        }
        const [hasMedia, hasPreview, sceneMtime] = reused ? reused.v : await Promise.all([
          w.type === 'video' || w.type === 'web' ? pathExistsP(w.fileAbs) : Promise.resolve(false),
          w.previewAbs ? pathExistsP(w.previewAbs) : Promise.resolve(false),
          w.type === 'scene' && w.fileAbs ? mtimeOrNullP(w.fileAbs) : Promise.resolve(null),
        ]);
        if (probeKey && !reused) {
          probes[probeKey] = { m: stamp === undefined ? null : stamp, v: [hasMedia, hasPreview, sceneMtime] };
        }
        const hasFrame = sceneMtime !== null;
        const webMediaBase = w.type === 'web' && hasMedia ? await mediaOriginApi.mediaOriginBase() : '';
        return {
          id: w.id,
          title: w.title,
          type: w.type,
          contentrating: w.contentrating,
          playable: hasMedia,
          media: hasMedia ? `${BASE}/media/${tokenFor(w.fileAbs)}` : null,
           
           
          mediaExt: w.fileAbs ? extOf(w.fileAbs) : null,
          preview: hasPreview ? `${BASE}/preview/${tokenFor(w.previewAbs)}` : null,
          frameUrl: hasFrame ? `${BASE}/scene-frame/${tokenFor(w.fileAbs)}` : null,
          schemeColor: w.schemeColor || null,
          ...sceneFieldsFor(w, hasFrame, customIds, sceneMtime),
          ...webFieldsFor(w, hasMedia, webMediaBase),
          propsUrl: (w.type === 'scene' || w.type === 'web') && w.fileAbs
            ? `${BASE}/props/${tokenFor(w.fileAbs)}`
            : null,
          liveFrame: w.type === 'web' && hasMedia ? `${BASE}/live-frame/${tokenFor(w.fileAbs)}` : null,
        };
      }));
      wallpapers.push(...rows);
    }
    const uploadsDir = ensureUploadDir();
    const uploadMeta = readUploadMeta();
    const uploads = await Promise.all((await enumerateUploadsP(uploadsDir)).map(async (w) => {
      const isDirProject = w.id.startsWith('up-dir-');
      const me = metaEntry(uploadMeta, w.id);
      const [hasMedia, hasPreview, sceneMtime] = await Promise.all([
        (w.type === 'video' || w.type === 'web') && w.fileAbs
          ? pathExistsP(w.fileAbs) : Promise.resolve(false),
        w.previewAbs ? pathExistsP(w.previewAbs) : Promise.resolve(false),
        w.type === 'scene' && w.fileAbs ? mtimeOrNullP(w.fileAbs) : Promise.resolve(null),
      ]);
      const hasFrame = sceneMtime !== null;
      const webMediaBase = w.type === 'web' && hasMedia ? await mediaOriginApi.mediaOriginBase() : '';
      return {
        id: w.id,
        title: isDirProject ? (w.title || w.id) : (me.title || w.id),
        contentrating: isDirProject ? (w.contentrating || null) : me.contentrating,
        type: w.type,
        playable: isDirProject ? hasMedia : true,
        media: w.type === 'scene' ? null : `${BASE}/media/${tokenFor(w.fileAbs)}`,
        mediaExt: w.fileAbs ? extOf(w.fileAbs) : null,
        preview: hasPreview
          ? `${BASE}/preview/${tokenFor(w.previewAbs)}`
          : w.type === 'video'
            ? `${BASE}/video-preview/${tokenFor(w.fileAbs)}`
            : null,
        frameUrl: hasFrame ? `${BASE}/scene-frame/${tokenFor(w.fileAbs)}` : null,
        schemeColor: w.schemeColor || null,
        ...sceneFieldsFor(w, hasFrame, customIds, sceneMtime),
        ...webFieldsFor(w, hasMedia, webMediaBase),
        propsUrl: (w.type === 'scene' || w.type === 'web') && w.fileAbs
          ? `${BASE}/props/${tokenFor(w.fileAbs)}`
          : null,
        liveFrame: w.type === 'web' && hasMedia ? `${BASE}/live-frame/${tokenFor(w.fileAbs)}` : null,
      };
    }));
    wallpapers.push(...uploads);
    const playableIds = new Set(wallpapers.filter((w) => w.playable).map((w) => w.id));
    const playlists = (await readPlaylistsP(installDir)).map((playlist) => {
      const ids = [];
      const seenIds = new Set();
      for (const item of playlist.items) {
        const id = playlistItemId(item, byPath, byId);
        if (id && !seenIds.has(id)) { seenIds.add(id); ids.push(id); }
      }
      return {
        id: playlist.id,
        name: playlist.name,
        order: playlist.order,
        delay: playlist.delay,
        wallpaperIds: ids,
        total: ids.length,
        portableCount: ids.filter((id) => playableIds.has(id)).length,
        unresolvedCount: Math.max(0, playlist.items.length - ids.length),
      };
    });
    const sceneMediaBase = wallpapers.some((w) => w.sceneLive) ? await mediaOriginApi.ensureSceneMediaOrigin() : '';
    return {
      installDir,
      uploadDir: getUploadDir(),
      cacheDir: cacheBaseDir(),
      weAssetsDir: getWeAssetsDir(),
      weAssetsAvailable: weAssetsAvailable(),
      sceneMediaBase,
      total: wallpapers.length,
      portableCount: wallpapers.filter((w) => w.playable).length,
      wallpapers,
      playlists,
    };
  }
  async function rescan() {
    const installDir = await locateWallpaperEngineP();
    const libraryDirs = await owningLibrariesP();
    const sig = await scanSignatureP(installDir, libraryDirs);
    const we = liveEntries(await enumerateWallpapersAsync(installDir, libraryDirs));
    const prev = (await loadIndex())?.probes;
    const probes = prev && typeof prev === 'object' ? { ...prev } : {};
    const payload = await assembleInventory(we, probes, installDir, libraryDirs, true);
    const live = new Set(we.map((w) => (w.fileAbs ? pathKey(w.fileAbs) : '')).filter(Boolean));
    for (const key of Object.keys(probes)) {
      if (!live.has(key)) delete probes[key];
    }
    await saveIndex({ builtAt: Date.now(), sig, installDir, libraryDirs, we, probes });
    warmFaststart(payload.wallpapers, log).catch(() => {   });
    return payload;
  }
  function rescanOnce() {
    if (rebuildInFlight) return rebuildInFlight;
    const p = rescan()
      .then((payload) => { inventoryCache = { t: Date.now(), payload }; return payload; })
      .finally(() => { if (rebuildInFlight === p) rebuildInFlight = null; });
    rebuildInFlight = p;
    return p;
  }
  function scheduleRescan() {
    rescanOnce().catch(() => null);
  }
  async function buildInventory() {
    if (inventoryCache && Date.now() - inventoryCache.t < INVENTORY_TTL_MS) {
      return inventoryCache.payload;
    }
    const installDir = await locateWallpaperEngineP();
    const libraryDirs = await owningLibrariesP();
    const sig = await scanSignatureP(installDir, libraryDirs);
    const index = await loadIndex();
    if (index && sig && index.sig === sig) {
      const payload = await assembleInventory(index.we, index.probes, installDir, libraryDirs, false);
      inventoryCache = { t: Date.now(), payload };
      if (Date.now() - index.builtAt > INVENTORY_REVALIDATE_MS) scheduleRescan();
      return payload;
    }
    return rescanOnce();
  }
  return buildInventory;
}
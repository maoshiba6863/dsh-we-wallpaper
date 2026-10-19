import { readdirSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, normalize } from 'node:path';
export function createAssetPathsKit({
  pluginDataDir, ensureDirOnce, readConfig, writeConfig, enqueueConfigWrite,
}) {
  function defaultUploadDir() { return join(pluginDataDir(), 'uploads'); }
  function resolveUploadDir() {
    if (process.env.DSH_WE_UPLOAD_DIR) return process.env.DSH_WE_UPLOAD_DIR;
    const cfg = readConfig();
    if (typeof cfg.uploadDir === 'string' && cfg.uploadDir.trim()) return cfg.uploadDir.trim();
    return defaultUploadDir();
  }
  const WE_ASSETS_SOURCE_ID = 'local';
  function resolveWeAssetsDir() {
    if (process.env.DSH_WE_ASSETS_DIR && process.env.DSH_WE_ASSETS_DIR.trim()) {
      return normalize(process.env.DSH_WE_ASSETS_DIR.trim());
    }
    const cfg = readConfig();
    if (typeof cfg.weAssetsDir === 'string' && cfg.weAssetsDir.trim()) {
      return normalize(cfg.weAssetsDir.trim());
    }
    return null;
  }
  let WE_ASSETS_DIR = resolveWeAssetsDir();
  function weAssetsAvailable() {
    if (!WE_ASSETS_DIR) return false;
    try { return statSync(join(WE_ASSETS_DIR, 'materials')).isDirectory(); } catch { return false; }
  }
  function getWeAssetsDir() { return WE_ASSETS_DIR; }
  function setWeAssetsDir(dir) {
    return enqueueConfigWrite(() => {
      WE_ASSETS_DIR = dir;
      weAssetsIndexCache.clear();
      const cfg = readConfig();
      if (dir) cfg.weAssetsDir = dir;
      else delete cfg.weAssetsDir;
      writeConfig(cfg);
      return dir;
    });
  }
  const weAssetsIndexCache = new Map();
  async function listWeAssetNames(dir) {
    const hit = weAssetsIndexCache.get(dir);
    if (hit && Date.now() - hit.at < 60_000) return hit.names;
    const names = [];
    const walk = async (d, prefix) => {
      let entries;
      try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const rel = prefix ? prefix + '/' + e.name : e.name;
        if (e.isDirectory()) await walk(join(d, e.name), rel);
        else if (e.isFile() && e.name.toLowerCase().endsWith('.tex')) names.push(rel.slice(0, -4));
      }
    };
    await walk(join(dir, 'materials'), '');
    names.sort();
    weAssetsIndexCache.set(dir, { names, at: Date.now() });
    return names;
  }
  const UPLOAD_EXT = { 'video/mp4': 'mp4', 'image/jpeg': 'jpg', 'image/png': 'png' };
  const CUSTOM_FRAME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const CUSTOM_FRAME_MAX_BYTES = 30 * 1024 * 1024;
  function customFrameDir() { return ensureDirOnce(join(pluginDataDir(), 'overrides')); }
  const AVATAR_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const AVATAR_MAX_BYTES = 8 * 1024 * 1024;
  const AVATAR_SIDES = ['user', 'ai'];
  const AVATAR_FILE_RE = /^(user|ai)-[a-z0-9]{4,16}\.(png|jpg|webp)$/;
  function avatarDir() { return ensureDirOnce(join(pluginDataDir(), 'avatars')); }

  function avatarPath(side) {
    const s = String(side || '');
    if (!AVATAR_SIDES.includes(s)) return null;
    let entries;
    try { entries = readdirSync(avatarDir()); } catch { return null; }
    for (const name of entries) {
      if (!AVATAR_FILE_RE.test(name) || name.slice(0, s.length + 1) !== s + '-') continue;
      return join(avatarDir(), name);
    }
    return null;
  }
  function liveFrameDir() { return ensureDirOnce(join(pluginDataDir(), 'live-frames')); }
  return {
    defaultUploadDir, resolveUploadDir,
    UPLOAD_EXT, CUSTOM_FRAME_EXT, CUSTOM_FRAME_MAX_BYTES, customFrameDir,
    AVATAR_EXT, AVATAR_MAX_BYTES, AVATAR_SIDES, AVATAR_FILE_RE, avatarDir, avatarPath,
    liveFrameDir,
    WE_ASSETS_SOURCE_ID, resolveWeAssetsDir, weAssetsAvailable, getWeAssetsDir, setWeAssetsDir,
    listWeAssetNames,
  };
}
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
export function createUploadStoreKit({ getUploadDir, ensureDirOnce, enqueueConfigWrite, atomicWriteFileSync }) {
  function ensureUploadDir() {
    return ensureDirOnce(getUploadDir());
  }
  function uploadMetaPath() { return join(getUploadDir(), '.meta.json'); }
  function readUploadMeta() {
    const p = uploadMetaPath();
    if (!existsSync(p)) return {};
    try {
      const o = JSON.parse(readFileSync(p, 'utf8'));
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch { return {}; }
  }
  function metaEntry(meta, id) {
    const v = meta[id];
    if (typeof v === 'string') return { title: v, sha256: null, contentrating: null };
    if (v && typeof v === 'object') return {
      title: typeof v.title === 'string' && v.title.trim() ? v.title : id,
      sha256: typeof v.sha256 === 'string' ? v.sha256 : null,
      contentrating: typeof v.contentrating === 'string' && v.contentrating.trim()
        ? v.contentrating.trim() : null,
    };
    return { title: id, sha256: null, contentrating: null };
  }
  function setUploadMeta(id, title, sha256) {
    return enqueueConfigWrite(() => {
      try {
        const m = readUploadMeta();
        m[id] = { title: title || id, sha256: sha256 || null };
        atomicWriteFileSync(uploadMetaPath(), JSON.stringify(m));
      } catch {   }
    });
  }
  function removeUploadMeta(id) {
    return enqueueConfigWrite(() => {
      try {
        const m = readUploadMeta();
        if (id in m) { delete m[id]; atomicWriteFileSync(uploadMetaPath(), JSON.stringify(m)); }
      } catch {   }
    });
  }
  const PREVIEW_CANDIDATES = ['preview.jpg', 'preview.png', 'preview.gif', 'preview.webp'];
  return {
    ensureUploadDir, uploadMetaPath, readUploadMeta, metaEntry, setUploadMeta, removeUploadMeta,
    PREVIEW_CANDIDATES,
  };
}
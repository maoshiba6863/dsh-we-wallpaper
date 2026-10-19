import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
const MP4_VFS_MAX_MOOV_BYTES = 8 * 1024 * 1024;
const VFS_CACHE_MAX_ENTRIES = 32;
const VFS_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const TOP_BOX_MAX = 64;
const BAIL_MARKERS = ['moof', 'mvex', 'traf', 'tfhd', 'tfdt', 'trun', 'saio', 'senc', 'mfra', 'tfra']
  .map((t) => Buffer.from(t, 'latin1'));
const VFS_EXTS = new Set(['mp4', 'm4v', 'mov']);
const HEADER_PROBE = 16;
function boxAt(buf, off, limit) {
  if (off + 8 > limit) return null;
  const size32 = buf.readUInt32BE(off);
  const type = buf.toString('latin1', off + 4, off + 8);
  let size = size32;
  let header = 8;
  if (size32 === 1) {
    if (off + 16 > limit) return null;
    size = Number(buf.readBigUInt64BE(off + 8));
    header = 16;
  } else if (size32 === 0) {
    size = limit - off;
  }
  if (!Number.isSafeInteger(size) || size < header || off + size > limit) return null;
  return { start: off, size, header, type, end: off + size };
}
function listBoxes(buf, start, end) {
  const out = [];
  let off = start;
  while (off < end) {
    const b = boxAt(buf, off, end);
    if (!b) return null;
    out.push(b);
    off = b.end;
  }
  return off === end ? out : null;
}
function childBox(buf, parent, type) {
  const kids = listBoxes(buf, parent.start + parent.header, parent.end);
  if (!kids) return null;
  return kids.find((b) => b.type === type) || null;
}
function listTopBoxes(fd, size) {
  const head = Buffer.alloc(HEADER_PROBE);
  const out = [];
  let off = 0;
  while (off < size) {
    const n = readSync(fd, head, 0, HEADER_PROBE, off);
    if (n < 8) return null;
    const size32 = head.readUInt32BE(0);
    const type = head.toString('latin1', 4, 8);
    let boxSize = size32;
    let header = 8;
    if (size32 === 1) {
      if (n < 16) return null;
      boxSize = Number(head.readBigUInt64BE(8));
      header = 16;
    } else if (size32 === 0) {
      boxSize = size - off;
    }
    if (!Number.isSafeInteger(boxSize) || boxSize < header || off + boxSize > size) return null;
    out.push({ start: off, size: boxSize, end: off + boxSize, type });
    off += boxSize;
    if (out.length > TOP_BOX_MAX) return null;
  }
  return off === size ? out : null;
}
function chunkOffsetTables(moovBuf) {
  const moov = boxAt(moovBuf, 0, moovBuf.length);
  if (!moov || moov.type !== 'moov') return null;
  const top = listBoxes(moovBuf, moov.start + moov.header, moov.end);
  if (!top) return null;
  const tables = [];
  for (const trak of top.filter((b) => b.type === 'trak')) {
    const mdia = childBox(moovBuf, trak, 'mdia');
    const minf = mdia ? childBox(moovBuf, mdia, 'minf') : null;
    const stbl = minf ? childBox(moovBuf, minf, 'stbl') : null;
    if (!stbl) return null;
    const kids = listBoxes(moovBuf, stbl.start + stbl.header, stbl.end);
    if (!kids) return null;
    for (const box of kids) {
      if (box.type !== 'stco' && box.type !== 'co64') continue;
      const wide = box.type === 'co64';
      if (box.size < box.header + 8) return null;
      const count = moovBuf.readUInt32BE(box.start + 12);
      const entriesStart = box.start + 16;
      if (entriesStart + count * (wide ? 8 : 4) > box.end) return null;
      tables.push({ box, wide, count, entriesStart });
    }
  }
  return tables;
}
function patchMoov(moovBuf, tables, delta, mdat) {
  const out = Buffer.from(moovBuf);
  let patched = 0;
  for (const t of tables) {
    const step = t.wide ? 8 : 4;
    for (let i = 0; i < t.count; i += 1) {
      const at = t.entriesStart + i * step;
      const old = t.wide ? Number(out.readBigUInt64BE(at)) : out.readUInt32BE(at);
      if (!(old >= mdat.start && old < mdat.end)) return null;
      const next = old + delta;
      if (t.wide) {
        if (!Number.isSafeInteger(next)) return null;
        out.writeBigUInt64BE(BigInt(next), at);
      } else {
        if (next > 0xffffffff) return null;
        out.writeUInt32BE(next, at);
      }
      patched += 1;
    }
  }
  return { buf: out, patched };
}
export function analyzeMp4Layout(abs, st) {
  const ext = extname(abs).replace(/^\./, '').toLowerCase();
  if (!VFS_EXTS.has(ext)) return { kind: 'none', reason: 'ext' };
  let fd = -1;
  try {
    if (!st) st = statSync(abs);
    if (!st.isFile()) return { kind: 'none', reason: 'not-file' };
    if (st.size < HEADER_PROBE) return { kind: 'none', reason: 'too-small' };
    fd = openSync(abs, 'r');
    const boxes = listTopBoxes(fd, st.size);
    if (!boxes) return { kind: 'none', reason: 'top-boxes' };
    const moov = boxes.find((b) => b.type === 'moov');
    const mdats = boxes.filter((b) => b.type === 'mdat');
    if (!moov || mdats.length !== 1) return { kind: 'none', reason: 'no-moov-or-mdat' };
    const mdat = mdats[0];
    if (moov.start < mdat.start) return { kind: 'plain', reason: 'moov-first' };
    if (moov.size > MP4_VFS_MAX_MOOV_BYTES) return { kind: 'none', reason: 'moov-too-big' };
    const moovBuf = Buffer.alloc(moov.size);
    if (readSync(fd, moovBuf, 0, moov.size, moov.start) !== moov.size) return { kind: 'none', reason: 'moov-read' };
    const head = boxAt(moovBuf, 0, moovBuf.length);
    if (!head || head.type !== 'moov' || head.size !== moov.size) return { kind: 'none', reason: 'moov-header' };
    for (const marker of BAIL_MARKERS) {
      if (moovBuf.includes(marker)) return { kind: 'none', reason: 'fragmented-or-aux' };
    }
    const tables = chunkOffsetTables(moovBuf);
    if (!tables || !tables.length) return { kind: 'none', reason: 'no-chunk-offsets' };
    const delta = moov.size;
    const patchedMoov = patchMoov(moovBuf, tables, delta, mdat);
    if (!patchedMoov) return { kind: 'none', reason: 'offsets-outside-mdat' };
    const segments = [];
    let v = 0;
    for (const b of boxes) {
      if (b === moov) continue;
      if (b === mdat) {
        segments.push({ vStart: v, len: moov.size, srcStart: -1, buf: patchedMoov.buf });
        v += moov.size;
      }
      segments.push({ vStart: v, len: b.size, srcStart: b.start, buf: null });
      v += b.size;
    }
    if (v !== st.size) return { kind: 'none', reason: 'size-mismatch' };
    return {
      kind: 'virtual',
      size: st.size,
      ext,
      mdat: { start: mdat.start, end: mdat.end },
      moov: { start: moov.start, size: moov.size, buf: patchedMoov.buf },
      segments,
      delta,
      patched: patchedMoov.patched,
      tracks: tables.length,
    };
  } catch {
    return { kind: 'none', reason: 'io' };
  } finally {
    if (fd >= 0) { try { closeSync(fd); } catch {   } }
  }
}
export function createMp4VfsKit(c) {
  const appendDiagLine = c && c.appendDiagLine;
  const cache = new Map();
  let cacheBytes = 0;
  function dropOldest() {
    while (cache.size > VFS_CACHE_MAX_ENTRIES || cacheBytes > VFS_CACHE_MAX_BYTES) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      const res = cache.get(oldest.value);
      cacheBytes -= res && res.moov ? res.moov.buf.length : 0;
      cache.delete(oldest.value);
    }
  }
  function layoutFor(abs, logFn) {
    if (!abs) return null;
    let st;
    try { st = statSync(abs); } catch { return null; }
    const key = abs + '|' + st.size + '|' + Math.round(st.mtimeMs) + '|v1';
    const hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
    const res = analyzeMp4Layout(abs, st);
    if (res.kind === 'none') return res;
    cache.set(key, res);
    cacheBytes += res.moov ? res.moov.buf.length : 0;
    dropOldest();
    if (res.kind === 'virtual') {
      const say = (level, msg) => {
        try { if (logFn && typeof logFn[level] === 'function') logFn[level](msg); } catch {   }
      };
      say('info', '视频壁纸 faststart 虚拟布局已就绪（磁盘 0）：' + basename(abs));
      try {
        if (typeof appendDiagLine === 'function') {
          appendDiagLine('faststart', {
            file: basename(abs), size: st.size, moovSize: res.moov.size, delta: res.delta,
            patches: res.patched, tracks: res.tracks, virtual: true,
          });
        }
      } catch {   }
    }
    return res;
  }
  return { layoutFor };
}
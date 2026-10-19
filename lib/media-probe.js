import { openSync, readSync, fstatSync, closeSync, existsSync, statSync } from 'node:fs';
const MEDIA_INFO_CACHE = new Map();
const VIDEO_CODECS = new Set(['avc1', 'hvc1', 'hev1', 'av01', 'vp09', 'mp4v']);
function readBoxes(buf, start, end, onBox) {
  let off = start;
  while (off + 8 <= end) {
    let size = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    let header = 8;
    if (size === 1) {
      if (off + 16 > end) break;
      size = Number(buf.readBigUInt64BE(off + 8));
      header = 16;
    } else if (size === 0) {
      size = end - off;
    }
    if (size < header || off + size > end) break;
    if (onBox(type, off, size, header)) return;
    off += size;
  }
}
function boxChild(buf, container, type) {
  let found = null;
  readBoxes(buf, container.off + container.header, container.off + container.size,
    (t, o, s, h) => { if (t === type) { found = { off: o, size: s, header: h }; return true; } return false; });
  return found;
}
function probeMp4(abs) {
  const fd = openSync(abs, 'r');
  try {
    const fileSize = fstatSync(fd).size;
    if (fileSize < 64) return null;
    const headLen = Math.min(fileSize, 8 * 1024 * 1024);
    const tailLen = Math.min(fileSize, 8 * 1024 * 1024);
    const head = Buffer.alloc(headLen);
    const tail = Buffer.alloc(tailLen);
    let read = 0;
    while (read < headLen) {
      const n = readSync(fd, head, read, headLen - read, read);
      if (n <= 0) break;
      read += n;
    }
    read = 0;
    while (read < tailLen) {
      const n = readSync(fd, tail, read, tailLen - read, fileSize - tailLen + read);
      if (n <= 0) break;
      read += n;
    }
    const findMoov = (buf, bufStart, anchoredToEof, limit) => {
      const scanEnd = Math.min(buf.length - 4, limit || buf.length);
      for (let i = scanEnd; i >= 4; i--) {
        if (buf[i] === 0x6d && buf[i + 1] === 0x6f && buf[i + 2] === 0x6f && buf[i + 3] === 0x76) {
          const s = buf.readUInt32BE(i - 4);
          const start = bufStart + i - 4;
          if (s >= 8 && start >= 0 && start + s <= fileSize + 8) {
            if (!anchoredToEof || (start + s >= fileSize - 128)) return { start, size: s };
          }
        }
      }
      return null;
    };
    const moov = findMoov(head, 0, false, 1024 * 1024)
      || findMoov(tail, fileSize - tailLen, true, tailLen);
    if (!moov) return null;
    const moovBuf = Buffer.alloc(moov.size);
    read = 0;
    while (read < moov.size) {
      const n = readSync(fd, moovBuf, read, moov.size - read, moov.start + read);
      if (n <= 0) break;
      read += n;
    }
    const moovEnd = moov.size;
    const traks = [];
    readBoxes(moovBuf, 8, moovEnd, (t, o, s, h) => { if (t === 'trak') traks.push({ off: o, size: s, header: h }); return false; });
    let best = null;
    for (const trak of traks) {
      const mdia = boxChild(moovBuf, trak, 'mdia');
      if (!mdia) continue;
      const hdlr = boxChild(moovBuf, mdia, 'hdlr');
      if (hdlr && moovBuf.toString('latin1', hdlr.off + hdlr.header + 8, hdlr.off + hdlr.header + 12) !== 'vide') continue;
      const mdhd = boxChild(moovBuf, mdia, 'mdhd');
      const minf = boxChild(moovBuf, mdia, 'minf');
      const stbl = minf ? boxChild(moovBuf, minf, 'stbl') : null;
      const stsd = stbl ? boxChild(moovBuf, stbl, 'stsd') : null;
      const stts = stbl ? boxChild(moovBuf, stbl, 'stts') : null;
      const info = { width: 0, height: 0, codec: null, fps: null };
      if (stsd) {
        const entryStart = stsd.off + stsd.header + 8;
        if (entryStart + 52 <= moovEnd) {
          const codec = moovBuf.toString('latin1', entryStart + 4, entryStart + 8);
          if (VIDEO_CODECS.has(codec)) {
            info.codec = codec;
            info.width = moovBuf.readUInt16BE(entryStart + 32);
            info.height = moovBuf.readUInt16BE(entryStart + 34);
          }
        }
      }
      if (mdhd && info.codec) {
        const ver = moovBuf.readUInt8(mdhd.off + mdhd.header);
        const timescale = ver === 1
          ? moovBuf.readUInt32BE(mdhd.off + mdhd.header + 20)
          : moovBuf.readUInt32BE(mdhd.off + mdhd.header + 12);
        const duration = ver === 1
          ? Number(moovBuf.readBigUInt64BE(mdhd.off + mdhd.header + 24))
          : moovBuf.readUInt32BE(mdhd.off + mdhd.header + 16);
        if (timescale > 0 && duration > 0) {
          info.duration = Math.round((duration / timescale) * 100) / 100;
          if (stts) {
            const entryCount = moovBuf.readUInt32BE(stts.off + stts.header + 4);
            let samples = 0, ticks = 0;
            for (let i = 0; i < entryCount; i++) {
              const e = stts.off + stts.header + 8 + i * 8;
              if (e + 8 > moovEnd) break;
              const cnt = moovBuf.readUInt32BE(e);
              const delta = moovBuf.readUInt32BE(e + 4);
              samples += cnt; ticks += cnt * delta;
            }
            if (ticks > 0) info.fps = Math.round((samples * timescale / ticks) * 100) / 100;
          }
        }
      }
      if (info.codec) { best = info; break; }
    }
    if (best && (best.fps || best.width)) {
      best.moovStart = moov.start;
      best.moovSize = moov.size;
      return best;
    }
    return null;
  } finally {
    closeSync(fd);
  }
}
function getMediaInfo(abs) {
  if (!abs || !existsSync(abs)) return null;
  const st = statSync(abs);
  const key = abs + '|' + st.size + '|' + Math.round(st.mtimeMs);
  if (MEDIA_INFO_CACHE.has(key)) return MEDIA_INFO_CACHE.get(key);
  let info = null;
  try { info = probeMp4(abs); } catch {   }
  if (MEDIA_INFO_CACHE.size > 500) {
    const first = MEDIA_INFO_CACHE.keys().next().value;
    if (first !== undefined) MEDIA_INFO_CACHE.delete(first);
  }
  MEDIA_INFO_CACHE.set(key, info);
  return info;
}
export { getMediaInfo };
const AVATAR_IMPORT_MAX_EDGE = 1024;

const AVATAR_IMPORT_MAX_BYTES = 4 * 1024 * 1024;

const IMAGE_DIRECT_ACCEPT = "image/png,image/jpeg,image/webp";

const IMAGE_RASTER_ACCEPT = "image/svg+xml,image/gif,image/bmp,image/avif";

const AVATAR_PICK_ACCEPT = IMAGE_DIRECT_ACCEPT + "," + IMAGE_RASTER_ACCEPT;

function readU32BE(b, at) {
  return ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
}

function readU32LE(b, at) {
  return (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
}

function isoBoxAt(b, at, limit) {
  if (at + 8 > limit) return null;
  let size = readU32BE(b, at);
  const type = String.fromCharCode(b[at + 4], b[at + 5], b[at + 6], b[at + 7]);
  let head = 8;
  if (size === 1) {
    if (at + 16 > limit) return null;

    size = readU32BE(b, at + 8) * 0x100000000 + readU32BE(b, at + 12);
    head = 16;
  } else if (size === 0) {
    size = limit - at;
  }
  if (size < head) return null;
  const end = Math.min(at + size, limit);
  if (end <= at) return null;
  return { type: type, start: at + head, end: end };
}

function isoChildren(b, from, to) {
  const out = [];
  let at = from;
  while (at + 8 <= to && out.length < 4096) {
    const child = isoBoxAt(b, at, to);
    if (!child || child.end <= at) break;
    out.push(child);
    at = child.end;
  }
  return out;
}

function isoFind(b, type, from, to) {
  const kids = isoChildren(b, from, to);
  for (let i = 0; i < kids.length; i++) {
    if (kids[i].type === type) return kids[i];
  }
  return null;
}

function ipmaProperty(b, box, itemId) {
  const ver = b[box.start];
  const flags = (b[box.start + 1] << 16) | (b[box.start + 2] << 8) | b[box.start + 3];
  let at = box.start + 4;
  if (at + 4 > box.end) return 0;
  const count = readU32BE(b, at);
  at += 4;
  for (let i = 0; i < count; i++) {
    if (at >= box.end) return 0;
    let id;
    if (ver === 0) {
      if (at + 2 > box.end) return 0;
      id = (b[at] << 8) | b[at + 1];
      at += 2;
    } else {
      if (at + 4 > box.end) return 0;
      id = readU32BE(b, at);
      at += 4;
    }
    if (at >= box.end) return 0;
    const n = b[at];
    at += 1;
    const wide = (flags & 1) !== 0;
    const step = wide ? 2 : 1;
    for (let k = 0; k < n; k++) {
      if (at + step > box.end) return 0;
      const idx = wide ? (((b[at] << 8) | b[at + 1]) & 0x7fff) : (b[at] & 0x7f);
      at += step;
      if (id === itemId && idx > 0) return idx;
    }
  }
  return 0;
}

function avifKind(brand) {
  return brand === "avif" || brand === "avis" ? "avif" : "heif";
}

function avifSizeInMeta(b, meta) {
  const metaStart = meta.start + 4;
  const iprp = isoFind(b, "iprp", metaStart, meta.end);
  if (!iprp) return null;
  const ipco = isoFind(b, "ipco", iprp.start, iprp.end);
  if (!ipco) return null;
  const props = isoChildren(b, ipco.start, ipco.end);
  if (!props.length) return null;

  let hit = null;
  const pitm = isoFind(b, "pitm", metaStart, meta.end);
  const ipma = isoFind(b, "ipma", iprp.start, iprp.end);
  if (pitm && ipma && pitm.start + 4 + (b[pitm.start] === 0 ? 2 : 4) <= pitm.end) {
    const itemId = b[pitm.start] === 0
      ? ((b[pitm.start + 4] << 8) | b[pitm.start + 5])
      : readU32BE(b, pitm.start + 4);
    const idx = ipmaProperty(b, ipma, itemId);
    if (idx > 0 && idx <= props.length && props[idx - 1].type === "ispe") hit = props[idx - 1];
  }
  if (!hit) {
    for (let i = 0; i < props.length; i++) {
      if (props[i].type === "ispe") { hit = props[i]; break; }
    }
  }
  if (!hit || hit.end - hit.start < 12) return null;
  const width = readU32BE(b, hit.start + 4);
  const height = readU32BE(b, hit.start + 8);
  if (!width || !height) return null;
  return { width: width, height: height };
}

function avifBrandIn(b, ftyp) {
  for (let at = ftyp.start; at + 4 <= ftyp.end; at += 4) {
    const one = String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
    if (one === "avif" || one === "avis" || one === "heic" || one === "heif"
      || one === "mif1" || one === "msf1") return one;
  }
  return "";
}

function isAvifFamilyHead(b) {
  const ftyp = isoBoxAt(b, 0, b.length);
  return !!(ftyp && ftyp.type === "ftyp" && avifBrandIn(b, ftyp));
}

function parseAvifSize(b) {
  const ftyp = isoBoxAt(b, 0, b.length);
  if (!ftyp || ftyp.type !== "ftyp") return null;

  const brand = avifBrandIn(b, ftyp);
  if (!brand) return null;
  const chained = isoFind(b, "meta", ftyp.end, b.length);
  if (chained) {
    const got = avifSizeInMeta(b, chained);
    if (got) return { width: got.width, height: got.height, kind: avifKind(brand) };
  }
  for (let at = ftyp.start; at + 8 <= b.length; at++) {
    if (b[at + 4] !== 0x6d || b[at + 5] !== 0x65 || b[at + 6] !== 0x74 || b[at + 7] !== 0x61) continue;
    const cand = isoBoxAt(b, at, b.length);
    if (!cand || cand.type !== "meta" || cand.end - cand.start < 4) continue;
    if (chained && cand.start === chained.start) continue;
    const got = avifSizeInMeta(b, cand);
    if (got) return { width: got.width, height: got.height, kind: avifKind(brand) };
  }
  return null;
}

function parseBitmapHeaderSize(buffer) {
  if (!buffer) return null;
  const b = new Uint8Array(buffer);
  if (b.length < 16) return null;

  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b.length >= 24) {
    return { width: readU32BE(b, 16), height: readU32BE(b, 20), kind: "png" };
  }

  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b.length >= 10) {
    return { width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8), kind: "gif" };
  }

  if (b[0] === 0x42 && b[1] === 0x4d && b.length >= 26) {
    const dw = readU32LE(b, 18); const dh = readU32LE(b, 22);
    const w = dw > 0x7fffffff ? dw - 0x100000000 : dw;
    const h = dh > 0x7fffffff ? dh - 0x100000000 : dh;
    return { width: Math.abs(w), height: Math.abs(h), kind: "bmp" };
  }

  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 && b.length >= 30) {
    const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (fourcc === "VP8X") {

      const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
      const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
      return { width: w, height: h, kind: "webp" };
    }
    if (fourcc === "VP8 ") {

      const at = 26;
      if (b.length >= at + 4) {
        return {
          width: (b[at] | (b[at + 1] << 8)) & 0x3fff,
          height: (b[at + 2] | (b[at + 3] << 8)) & 0x3fff,
          kind: "webp",
        };
      }
    }
    if (fourcc === "VP8L" && b.length >= 25 && b[20] === 0x2f) {

      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff), kind: "webp" };
    }
  }

  if (b[0] === 0xff && b[1] === 0xd8) {
    let at = 2;
    while (at + 9 < b.length) {
      if (b[at] !== 0xff) { at++; continue; }
      const marker = b[at + 1];

      if (marker === 0xff) { at++; continue; }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) { at += 2; continue; }
      if (marker === 0xda) break;
      const len = (b[at + 2] << 8) | b[at + 3];
      if (len < 2) break;
      const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
      if (isSof && at + 9 <= b.length) {
        return { width: (b[at + 7] << 8) | b[at + 8], height: (b[at + 5] << 8) | b[at + 6], kind: "jpeg" };
      }
      at += 2 + len;
    }
  }

  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    return parseAvifSize(b);
  }
  return null;
}

function parseSvgSize(text) {
  if (typeof text !== "string" || !text) return null;
  const head = text.slice(0, 4096);
  if (!/<svg[\s>]/i.test(head)) return null;

  const attr = (name) => {
    const m = new RegExp(name + '\\s*=\\s*["\']?\\s*([0-9]+(?:\\.[0-9]+)?)').exec(head);
    return m ? Number(m[1]) : NaN;
  };
  const w = attr("width"); const h = attr("height");
  if (isFinite(w) && isFinite(h) && w > 0 && h > 0) {
    return { width: Math.round(w), height: Math.round(h), kind: "svg" };
  }
  const vb = /viewBox\s*=\s*["'][\s,]*([-0-9.eE]+)[\s,]+([-0-9.eE]+)[\s,]+([0-9.eE]+)[\s,]+([0-9.eE]+)/i.exec(head);
  if (vb) {
    const vw = Number(vb[3]); const vh = Number(vb[4]);
    if (isFinite(vw) && isFinite(vh) && vw > 0 && vh > 0) {
      return { width: Math.round(vw), height: Math.round(vh), kind: "svg" };
    }
  }
  return null;
}

const AVATAR_SVG_HEAD_BYTES = 4096;

const AVATAR_BITMAP_HEAD_BYTES = 262144;

const AVATAR_AVIF_HEAD_BYTES = AVATAR_IMPORT_MAX_BYTES;

async function probeImageSize(file) {
  const type = String((file && file.type) || "").toLowerCase();
  try {
    if (type === "image/svg+xml") {

      const head = await file.slice(0, AVATAR_SVG_HEAD_BYTES).text();
      return parseSvgSize(head);
    }
    const head = await file.slice(0, AVATAR_BITMAP_HEAD_BYTES).arrayBuffer();
    const got = parseBitmapHeaderSize(head);
    if (got) return got;

    if (!isAvifFamilyHead(new Uint8Array(head))) return null;

    const cap = typeof file.size === "number" ? Math.min(file.size, AVATAR_AVIF_HEAD_BYTES)
      : AVATAR_AVIF_HEAD_BYTES;
    if (cap <= head.byteLength) return null;
    return parseBitmapHeaderSize(await file.slice(0, cap).arrayBuffer());
  } catch {
    return null;
  }
}

function avatarImportLimit(file, size) {
  const bytes = Number(file && file.size) || 0;
  const overBytes = bytes > AVATAR_IMPORT_MAX_BYTES;
  const w = size ? Number(size.width) || 0 : 0;
  const h = size ? Number(size.height) || 0 : 0;
  const overEdge = w > AVATAR_IMPORT_MAX_EDGE || h > AVATAR_IMPORT_MAX_EDGE;
  if (!overBytes && !overEdge) return { ok: true };
  return { ok: false, overBytes: overBytes, overEdge: overEdge, bytes: bytes, width: w, height: h };
}

function humanMb(bytes) {
  return (Math.round(((Number(bytes) || 0) / (1024 * 1024)) * 10) / 10) + " MB";
}

export {
  AVATAR_IMPORT_MAX_EDGE,
  IMAGE_DIRECT_ACCEPT, IMAGE_RASTER_ACCEPT, AVATAR_PICK_ACCEPT,
  parseBitmapHeaderSize, parseSvgSize, probeImageSize,
  avatarImportLimit, humanMb,
};

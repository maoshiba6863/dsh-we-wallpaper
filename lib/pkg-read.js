const MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024;
const MAX_PKG_ENTRY_BYTES = 512 * 1024 * 1024;
const PKG_ENTRY_FLAG_LZ4 = 1;
const textDecoder = new TextDecoder('utf-8');
class Reader {
    data;
    label;
    view;
    pos = 0;
    constructor(data, label) {
        this.data = data;
        this.label = label;
        this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    }
    get remaining() {
        return this.view.byteLength - this.pos;
    }
    need(n) {
        if (n < 0 || this.pos + n > this.view.byteLength) {
            throw new Error(this.label + ': unexpected end of data');
        }
    }
    u8() {
        this.need(1);
        return this.view.getUint8(this.pos++);
    }
    i32() {
        this.need(4);
        const v = this.view.getInt32(this.pos, true);
        this.pos += 4;
        return v;
    }
    u32() {
        this.need(4);
        const v = this.view.getUint32(this.pos, true);
        this.pos += 4;
        return v;
    }
    u64() {
        const lo = this.u32();
        const hi = this.u32();
        return hi * 0x100000000 + lo;
    }
    f32() {
        this.need(4);
        const v = this.view.getFloat32(this.pos, true);
        this.pos += 4;
        return v;
    }
    bytes(n) {
        this.need(n);
        const out = this.data.subarray(this.pos, this.pos + n);
        this.pos += n;
        return out;
    }
    sizedString(maxLength) {
        const length = this.i32();
        if (length < 0 || length > maxLength) {
            throw new Error(this.label + ': invalid string length ' + length);
        }
        return textDecoder.decode(this.bytes(length));
    }
    nstring(maxLength) {
        const start = this.pos;
        let end = start;
        const limit = Math.min(this.view.byteLength, start + maxLength);
        while (end < limit && this.view.getUint8(end) !== 0)
            end++;
        if (end >= limit) {
            throw new Error(this.label + ': unterminated string');
        }
        const out = textDecoder.decode(this.data.subarray(start, end));
        this.pos = end + 1;
        return out;
    }
}
function lz4DecompressBlock(src, dstSize) {
    if (dstSize < 0 || dstSize > MAX_DECOMPRESSED_BYTES) {
        throw new Error('lz4: decompressed size out of bounds (' + String(dstSize) + ')');
    }
    const dst = new Uint8Array(dstSize);
    let ip = 0;
    let op = 0;
    while (ip < src.length) {
        const token = src[ip++];
        let literalLength = token >> 4;
        if (literalLength === 15) {
            let s;
            do {
                if (ip >= src.length)
                    throw new Error('lz4: truncated literal length');
                s = src[ip++];
                literalLength += s;
            } while (s === 255);
        }
        if (ip + literalLength > src.length || op + literalLength > dstSize) {
            throw new Error('lz4: literal run out of bounds');
        }
        dst.set(src.subarray(ip, ip + literalLength), op);
        ip += literalLength;
        op += literalLength;
        if (ip >= src.length)
            break;
        if (ip + 2 > src.length)
            throw new Error('lz4: truncated match offset');
        const offset = src[ip] | (src[ip + 1] << 8);
        ip += 2;
        if (offset === 0 || offset > op)
            throw new Error('lz4: invalid match offset ' + offset);
        let matchLength = token & 0x0f;
        if (matchLength === 15) {
            let s;
            do {
                if (ip >= src.length)
                    throw new Error('lz4: truncated match length');
                s = src[ip++];
                matchLength += s;
            } while (s === 255);
        }
        matchLength += 4;
        if (op + matchLength > dstSize)
            throw new Error('lz4: match run out of bounds');
        for (let i = 0; i < matchLength; i++) {
            dst[op] = dst[op - offset];
            op++;
        }
    }
    if (op !== dstSize) {
        throw new Error('lz4: decompressed size mismatch (got ' + op + ', expected ' + dstSize + ')');
    }
    return dst;
}
function probeCompressedEntry(data, abs, length) {
    if (length < 8)
        return null;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const originalSize = view.getUint32(abs, true) + view.getUint32(abs + 4, true) * 0x100000000;
    if (originalSize <= length || originalSize > 0x7fffffff)
        return null;
    let pos = abs + 8;
    let total = 0;
    while (total < originalSize) {
        if (pos + 8 > abs + length)
            return null;
        const uncomp = view.getInt32(pos, true);
        const comp = view.getInt32(pos + 4, true);
        if (uncomp <= 0 || comp <= 0 || pos + 8 + comp > abs + length)
            return null;
        total += uncomp;
        pos += 8 + comp;
    }
    return total === originalSize && pos === abs + length ? originalSize : null;
}
function parsePkgIndexHead(head) {
    const r = new Reader(head, 'pkg');
    const magic = r.sizedString(32);
    if (!/^PKGV\d{4}$/.test(magic)) {
        throw new Error("pkg: bad magic '" + magic + "'");
    }
    const count = r.i32();
    if (count < 0 || count > 0x100000) {
        throw new Error('pkg: invalid entry count ' + count);
    }
    const index = [];
    for (let i = 0; i < count; i++) {
        index.push({ path: r.sizedString(1024), offset: r.u32(), length: r.u32() });
    }
    return { index, dataStart: r.pos };
}
async function probeCompressedEntryAt(readAt, abs, length) {
    if (length < 8)
        return null;
    const head = await readAt(abs, 8);
    if (head.byteLength < 8)
        throw new Error('pkg: unexpected end of data');
    const headView = new DataView(head.buffer, head.byteOffset, head.byteLength);
    const originalSize = headView.getUint32(0, true) + headView.getUint32(4, true) * 0x100000000;
    if (originalSize <= length || originalSize > 0x7fffffff)
        return null;
    let pos = abs + 8;
    let total = 0;
    while (total < originalSize) {
        if (pos + 8 > abs + length)
            return null;
        const hdr = await readAt(pos, 8);
        if (hdr.byteLength < 8)
            throw new Error('pkg: unexpected end of data');
        const hdrView = new DataView(hdr.buffer, hdr.byteOffset, hdr.byteLength);
        const uncomp = hdrView.getInt32(0, true);
        const comp = hdrView.getInt32(4, true);
        if (uncomp <= 0 || comp <= 0 || pos + 8 + comp > abs + length)
            return null;
        total += uncomp;
        pos += 8 + comp;
    }
    return total === originalSize && pos === abs + length ? originalSize : null;
}
function parsePkg(data) {
    const { index, dataStart } = parsePkgIndexHead(data);
    return index.map(({ path, offset, length }) => {
        const abs = dataStart + offset;
        if (abs + length > data.byteLength) {
            throw new Error("pkg: entry '" + path + "' out of bounds");
        }
        const originalSize = probeCompressedEntry(data, abs, length);
        return originalSize === null
            ? { path, offset: abs, compressedSize: length, size: length, flags: 0 }
            : { path, offset: abs, compressedSize: length, size: originalSize, flags: PKG_ENTRY_FLAG_LZ4 };
    });
}
async function parsePkgHead(readAt, fileSize) {
    const size = Number(fileSize) || 0;
    const attempts = [64 * 1024, 1024 * 1024, 8 * 1024 * 1024];
    if (attempts[attempts.length - 1] < size)
        attempts.push(size);
    let lastErr = null;
    for (const want of attempts) {
        const take = Math.min(want, size);
        let head;
        try {
            head = await readAt(0, take);
        }
        catch (e) {
            lastErr = e;
            continue;
        }
        let index, dataStart;
        try {
            ({ index, dataStart } = parsePkgIndexHead(head));
        }
        catch (e) {
            if (e && typeof e.message === 'string' && e.message.endsWith('unexpected end of data')) {
                lastErr = e;
                continue;
            }
            throw e;
        }
        const entries = [];
        for (const { path, offset, length } of index) {
            const abs = dataStart + offset;
            if (abs + length > size) {
                throw new Error("pkg: entry '" + path + "' out of bounds");
            }
            const originalSize = await probeCompressedEntryAt(readAt, abs, length);
            entries.push(originalSize === null
                ? { path, offset: abs, compressedSize: length, size: length, flags: 0 }
                : { path, offset: abs, compressedSize: length, size: originalSize, flags: PKG_ENTRY_FLAG_LZ4 });
        }
        return entries;
    }
    throw lastErr || new Error('pkg: unexpected end of data');
}
function decompressLz4Entry(compressed, entry) {
    if (entry.size > MAX_PKG_ENTRY_BYTES) {
        throw new Error("pkg: entry '" + entry.path + "' too large (" + entry.size + ' bytes)');
    }
    const r = new Reader(compressed, 'pkg');
    const originalSize = r.u64();
    if (originalSize !== entry.size) {
        throw new Error("pkg: entry '" + entry.path + "' size mismatch");
    }
    const out = new Uint8Array(entry.size);
    let written = 0;
    while (written < entry.size) {
        const uncomp = r.i32();
        const comp = r.i32();
        if (uncomp <= 0 || comp <= 0 || written + uncomp > entry.size) {
            throw new Error("pkg: corrupt compressed entry '" + entry.path + "'");
        }
        out.set(lz4DecompressBlock(r.bytes(comp), uncomp), written);
        written += uncomp;
    }
    if (r.remaining !== 0) {
        throw new Error("pkg: corrupt compressed entry '" + entry.path + "'");
    }
    return out;
}
function readPkgEntry(data, entry) {
    const abs = entry.offset;
    if (abs < 0 || abs + entry.compressedSize > data.byteLength) {
        throw new Error("pkg: entry '" + entry.path + "' out of bounds");
    }
    if ((entry.flags & PKG_ENTRY_FLAG_LZ4) === 0) {
        return data.slice(abs, abs + entry.compressedSize);
    }
    return decompressLz4Entry(data.subarray(abs, abs + entry.compressedSize), entry);
}
async function readPkgEntryAt(readAt, fileSize, entry) {
    const abs = entry.offset;
    if (abs < 0 || abs + entry.compressedSize > Number(fileSize)) {
        throw new Error("pkg: entry '" + entry.path + "' out of bounds");
    }
    if ((entry.flags & PKG_ENTRY_FLAG_LZ4) === 0) {
        return readAt(abs, entry.compressedSize);
    }
    const compressed = await readAt(abs, entry.compressedSize);
    if (compressed.byteLength < entry.compressedSize) {
        throw new Error('pkg: unexpected end of data');
    }
    return decompressLz4Entry(compressed, entry);
}
async function readPkgEntryHeadAt(readAt, fileSize, entry, n) {
    const want = Math.max(0, Math.min(Number(n) || 0, entry.size));
    if (want === 0) return new Uint8Array(0);
    if ((entry.flags & PKG_ENTRY_FLAG_LZ4) === 0) {
        const abs = entry.offset;
        if (abs < 0 || abs + want > Number(fileSize)) {
            throw new Error("pkg: entry '" + entry.path + "' out of bounds");
        }
        const head = await readAt(abs, want);
        if (head.byteLength < want) {
            throw new Error('pkg: unexpected end of data');
        }
        return head;
    }
    const full = await readPkgEntryAt(readAt, fileSize, entry);
    return full.subarray(0, want);
}
export { parsePkg, parsePkgHead, readPkgEntry, readPkgEntryAt, readPkgEntryHeadAt };
import { Buffer } from 'node:buffer';
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join as joinPath, resolve as resolvePath, sep } from 'node:path';
import { parsePkg, parsePkgHead, readPkgEntry, readPkgEntryAt, readPkgEntryHeadAt } from './pkg-read.js';
function pkgSceneAccess(pkgData) {
    const entries = parsePkg(pkgData);
    const byPath = new Map(entries.map((entry) => [entry.path.toLowerCase(), entry]));
    const readFile = (path) => {
        const entry = byPath.get(path.toLowerCase());
        if (!entry)
            return null;
        return { path: entry.path, bytes: readPkgEntry(pkgData, entry) };
    };
    return {
        readFile,
        listTexPaths: () => entries.filter((entry) => entry.path.toLowerCase().endsWith('.tex')).map((entry) => entry.path),
    };
}
function dirSceneAccess(dir) {
    const normDir = resolvePath(dir);
    const realDir = (() => { try {
        return realpathSync(normDir);
    }
    catch {
        return normDir;
    } })();
    const readFile = (path) => {
        const abs = resolvePath(normDir, path);
        if (abs !== normDir && !abs.startsWith(normDir + sep))
            return null;
        try {
            if (lstatSync(abs).isSymbolicLink())
                return null;
            if (!statSync(abs).isFile())
                return null;
            const real = realpathSync(abs);
            if (real !== realDir && !real.startsWith(realDir + sep))
                return null;
            return { path, bytes: new Uint8Array(readFileSync(real)) };
        }
        catch {
            return null;
        }
    };
    const listTexPaths = () => {
        const out = [];
        const walk = (sub, depth) => {
            if (depth > 4)
                return;
            let names;
            try {
                names = readdirSync(sub === '' ? normDir : joinPath(normDir, sub));
            }
            catch {
                return;
            }
            for (const name of names) {
                const rel = sub === '' ? name : sub + '/' + name;
                let isDir;
                let isFile;
                try {
                    const lst = lstatSync(joinPath(normDir, rel));
                    if (lst.isSymbolicLink())
                        continue;
                    isDir = lst.isDirectory();
                    isFile = lst.isFile();
                }
                catch {
                    continue;
                }
                if (isDir)
                    walk(rel, depth + 1);
                else if (isFile && name.toLowerCase().endsWith('.tex'))
                    out.push(rel);
            }
        };
        walk('', 0);
        return out;
    };
    return {
        readFile,
        listTexPaths,
    };
}
function isLikelyMaskOrHelper(path) {
    const lower = path.toLowerCase();
    return (lower.includes('/masks/') ||
        lower.includes('_mask') ||
        lower.includes('mask') ||
        lower.includes('flow') ||
        lower.includes('wave') ||
        lower.includes('noise') ||
        lower.includes('lut') ||
        lower.includes('distort') ||
        lower.includes('warp') ||
        lower.includes('vortex') ||
        lower.includes('glow') ||
        lower.includes('neon') ||
        lower.includes('strip') ||
        lower.includes('bulb') ||
        lower.includes('led') ||
        lower.includes('combined') ||
        lower.includes('isometric') ||
        lower.includes('razer') ||
        lower.includes('len') ||
        lower.includes('lens') ||
        lower.includes('flare') ||
        lower.includes('prism') ||
        lower.includes('diffract') ||
        lower.includes('black') ||
        lower.includes('overlay') ||
        lower === 'sun' ||
        lower.endsWith('/sun.tex') ||
        lower.endsWith('/sun.json') ||
        lower.endsWith('/sun') ||
        lower.includes('waterripple') ||
        lower.includes('waterflow') ||
        lower.includes('phase') ||
        lower.includes('normal') ||
        lower.includes('foliagesway') ||
        lower.includes('cursorripple') ||
        lower.includes('赞助') ||
        lower.includes('sponsor') ||
        lower.includes('donate') ||
        lower.includes('qrcode') ||
        lower.includes('qr_code') ||
        lower.includes('audio_bar') ||
        lower.includes('audiobar') ||
        lower.includes('simple_audio') ||
        lower.includes('提示框') ||
        lower.includes('tip') ||
        lower.includes('watermark') ||
        lower.includes('logo') ||
        lower.includes('particle') ||
        lower.includes('audio') ||
        lower.includes('lightmap') ||
        lower.includes('light_map') ||
        lower.includes('visso') ||
        lower.includes('font') ||
        lower.includes('text_'));
}
function getTextureScore(path) {
    const lower = path.toLowerCase();
    if (isLikelyMaskOrHelper(path))
        return -100;
    let score = 0;
    if (lower.includes('白天') || lower.includes('day') || lower.includes('main') || lower.includes('background') || lower.includes('wallpaper')) {
        score += 50;
    }
    if (lower.includes('清晨') || lower.includes('morning') || lower.includes('黄昏') || lower.includes('dusk')) {
        score += 20;
    }
    if (lower.includes('昼夜变化') || lower.includes('mddn') || lower.includes('transition')) {
        score -= 30;
    }
    return score;
}
function findFtypOffset(bytes, length) {
    for (let i = 0; i < 200 && i + 8 <= length; i++) {
        if (bytes[i] === 0x66 && bytes[i + 1] === 0x74 && bytes[i + 2] === 0x79 && bytes[i + 3] === 0x70) {
            const ftypOffset = i - 4;
            if (ftypOffset >= 0 && ftypOffset < length)
                return ftypOffset;
        }
    }
    return -1;
}
function extractSceneVideoVia(access) {
    const candidates = [];
    for (const path of access.listTexPaths()) {
        const file = access.readFile(path);
        if (!file)
            continue;
        const raw = file.bytes;
        const ftypOffset = findFtypOffset(raw, raw.length);
        if (ftypOffset >= 0) {
            candidates.push({
                path,
                score: getTextureScore(path),
                bytes: raw.slice(ftypOffset),
            });
        }
    }
    if (candidates.length === 0)
        return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].bytes;
}
export function extractSceneVideo(pkgData) {
    return extractSceneVideoVia(pkgSceneAccess(pkgData));
}
export function extractSceneVideoFromDir(dir) {
    return extractSceneVideoVia(dirSceneAccess(dir));
}
const SCENE_VIDEO_PREFIX_BYTES = 204;
function readAtOf(fh) {
    return async (pos, len) => {
        if (!(len > 0)) return new Uint8Array(0);
        if (pos < 0) throw new Error('pkg: unexpected end of data');
        const buf = Buffer.allocUnsafe(len);
        const { bytesRead } = await fh.read(buf, 0, len, pos);
        if (bytesRead < len)
            throw new Error('pkg: unexpected end of data');
        return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead);
    };
}
export async function probeSceneVideoFromPkgFile(abs) {
    const fh = await open(abs, 'r');
    try {
        const size = (await fh.stat()).size;
        const readAt = readAtOf(fh);
        const entries = await parsePkgHead(readAt, size);
        for (const entry of entries) {
            if (!entry.path.toLowerCase().endsWith('.tex'))
                continue;
            const head = await readPkgEntryHeadAt(readAt, size, entry, SCENE_VIDEO_PREFIX_BYTES);
            if (head.byteLength > 0 && findFtypOffset(head, entry.size) >= 0)
                return true;
        }
        return false;
    }
    finally {
        await fh.close();
    }
}
export async function extractSceneVideoFromPkgFile(abs) {
    const fh = await open(abs, 'r');
    try {
        const size = (await fh.stat()).size;
        const readAt = readAtOf(fh);
        const entries = await parsePkgHead(readAt, size);
        const tex = entries.filter((entry) => entry.path.toLowerCase().endsWith('.tex'));
        const files = new Map();
        for (const entry of tex) {
            const head = await readPkgEntryHeadAt(readAt, size, entry, SCENE_VIDEO_PREFIX_BYTES);
            if (head.byteLength > 0 && findFtypOffset(head, entry.size) >= 0) {
                files.set(entry.path.toLowerCase(), await readPkgEntryAt(readAt, size, entry));
            }
        }
        if (files.size === 0)
            return null;
        return extractSceneVideoVia(partialTexAccess(tex, files));
    }
    finally {
        await fh.close();
    }
}
function partialTexAccess(texEntries, files) {
    return {
        readFile: (path) => {
            const bytes = files.get(path.toLowerCase());
            return bytes === undefined ? null : { path, bytes };
        },
        listTexPaths: () => texEntries.map((entry) => entry.path),
    };
}
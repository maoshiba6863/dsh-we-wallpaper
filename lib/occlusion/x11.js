import process from 'node:process';
import { cleanOccluders } from './rects.js';
export function isX11CandidateEnv(env = process.env, platform = process.platform) {
  if (platform !== 'linux') return false;
  if (!env.DISPLAY) return false;
  if (env.WAYLAND_DISPLAY) return false;
  return true;
}
const LAYOUT_EVENT_TYPES = new Set([
  16,
  17,
  18,
  19,
  22,
  28,
]);
const MAP_STATE_VIEWABLE = 2;
const EWmh_ATOMS = [
  '_NET_CLIENT_LIST_STACKING',
  '_NET_WM_PID',
  '_NET_WM_STATE',
  '_NET_WM_STATE_HIDDEN',
  '_NET_FRAME_EXTENTS',
];
export function createX11Adapter({ ownPid } = {}) {
  let X = null;
  let root = 0;
  let epoch = '';
  let atoms = null;
  const changeListeners = new Set();
  let eventBound = null;
  let errorBound = null;
  let stopped = false;
  const call = (fn, ...args) =>
    new Promise((resolve, reject) => {
      fn(...args, (err, result) => (err ? reject(err) : resolve(result)));
    });
  const internAtoms = async () => {
    atoms = {};
    for (const name of EWmh_ATOMS) {
      atoms[name] = await call(X.InternAtom.bind(X), false, name);
    }
  };
  const bindEvents = () => {
    eventBound = (ev) => {
      if (stopped || !LAYOUT_EVENT_TYPES.has(ev.type)) return;
      for (const fn of changeListeners) {
        try {
          fn();
        } catch {
        }
      }
    };
    X.on('event', eventBound);
    errorBound = () => {};
    X.on('error', errorBound);
  };
  return {
    async start() {
      const x11 = (await import('x11')).default ?? (await import('x11'));
      const display = await new Promise((resolve, reject) => {
        x11.createClient((err, d) => (err ? reject(err) : resolve(d)));
      });
      X = display.client;
      root = display.screen[0].root;
      X.ChangeWindowAttributes(root, {
        eventMask: x11.eventMask.PropertyChange | x11.eventMask.SubstructureNotify,
      });
      epoch = `x11::display=${process.env.DISPLAY || ':0'}`;
      await internAtoms();
      bindEvents();
      const stacking = await this._readStacking();
      if (stacking === null) {
        throw new Error('_NET_CLIENT_LIST_STACKING unavailable (no EWMH window manager?)');
      }
    },
    async _readStacking() {
      const prop = await call(
        X.GetProperty.bind(X), 0, root, atoms._NET_CLIENT_LIST_STACKING, 0  , 0, 10000000,
      );
      if (!prop || prop.format !== 32 || !prop.data || prop.data.length < 4) return null;
      const n = prop.data.length >> 2;
      const out = new Array(n);
      for (let i = 0; i < n; i++) out[i] = prop.data.readUInt32LE(i * 4);
      return out;
    },
    async _attrs(wid) {
      try {
        const a = await call(X.GetWindowAttributes.bind(X), wid);
        return { viewable: a.mapState === MAP_STATE_VIEWABLE, overrideRedirect: a.overrideRedirect === 1 };
      } catch {
        return { viewable: false, overrideRedirect: false };
      }
    },
    async _pidOf(wid) {
      try {
        const prop = await call(X.GetProperty.bind(X), 0, wid, atoms._NET_WM_PID, 0, 0, 10000000);
        if (!prop || prop.format !== 32 || !prop.data || prop.data.length < 4) return 0;
        return prop.data.readUInt32LE(0);
      } catch {
        return 0;
      }
    },
    async _isHidden(wid) {
      try {
        const prop = await call(X.GetProperty.bind(X), 0, wid, atoms._NET_WM_STATE, 0, 0, 10000000);
        if (!prop || prop.format !== 32 || !prop.data) return false;
        const n = prop.data.length >> 2;
        for (let i = 0; i < n; i++) {
          if (prop.data.readUInt32LE(i * 4) === atoms._NET_WM_STATE_HIDDEN) return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    async _clientScreenRect(wid, expandFrame) {
      try {
        const geom = await call(X.GetGeometry.bind(X), wid);
        const pos = await call(X.TranslateCoordinates.bind(X), wid, root, 0, 0);
        let [x, y, w, h] = [pos.destX, pos.destY, geom.width, geom.height];
        if (expandFrame) {
          const prop = await call(X.GetProperty.bind(X), 0, wid, atoms._NET_FRAME_EXTENTS, 0, 0, 10000000);
          if (prop && prop.format === 32 && prop.data && prop.data.length >= 16) {
            const left = prop.data.readUInt32LE(0);
            const right = prop.data.readUInt32LE(4);
            const top = prop.data.readUInt32LE(8);
            const bottom = prop.data.readUInt32LE(12);
            x -= left; y -= top; w += left + right; h += top + bottom;
          }
        }
        return [x, y, w, h];
      } catch {
        return null;
      }
    },
    async poll() {
      if (stopped || !X) return null;
      const stacking = await this._readStacking();
      if (stacking === null) return null;
      const alive = [];
      for (const wid of stacking) {
        const attrs = await this._attrs(wid);
        if (!attrs.viewable || attrs.overrideRedirect) continue;
        if (await this._isHidden(wid)) continue;
        const pid = await this._pidOf(wid);
        alive.push({ wid, pid: pid === 0 ? 0 : pid });
      }
      const ownSet = ownPid !== undefined
        ? new Set([ownPid])
        : new Set([process.pid, process.ppid].filter((p) => Number.isInteger(p) && p > 1));
      const mine = [];
      for (const w of alive) {
        if (ownSet.has(w.pid)) mine.push(w);
      }
      if (mine.length === 0) return { own: null, occluders: [], epoch };
      let own = null;
      for (const w of mine) {
        const rect = await this._clientScreenRect(w.wid, false);
        if (!rect) continue;
        const area = rect[2] * rect[3];
        if (!own || area > own.area) {
          own = { wid: w.wid, rect, area };
        }
      }
      if (!own) return { own: null, occluders: [], epoch };
      const ownIndex = stacking.indexOf(own.wid);
      const occluders = [];
      for (let i = ownIndex + 1; i < stacking.length; i++) {
        const entry = alive.find((a) => a.wid === stacking[i]);
        if (!entry || entry.pid === ownPid) continue;
        const rect = await this._clientScreenRect(entry.wid, true);
        if (rect) occluders.push(rect);
      }
      const cleaned = cleanOccluders(occluders, own.rect);
      return {
        own: { x: own.rect[0], y: own.rect[1], w: own.rect[2], h: own.rect[3] },
        occluders: cleaned,
        epoch,
      };
    },
    onChange(fn) {
      changeListeners.add(fn);
      return () => changeListeners.delete(fn);
    },
    stop() {
      stopped = true;
      if (eventBound && X) {
        try {
          X.removeListener('event', eventBound);
        } catch {
        }
        eventBound = null;
      }
      if (errorBound && X) {
        try {
          X.removeListener('error', errorBound);
        } catch {
        }
        errorBound = null;
      }
      if (X) {
        try {
          X.terminate();
        } catch {
        }
        X = null;
      }
    },
  };
}
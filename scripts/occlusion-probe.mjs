import process from 'node:process';
import { createOcclusionHub } from '../lib/occlusion/index.js';
const intervalIdx = process.argv.indexOf('--interval-ms');
const pollMs = intervalIdx !== -1 ? Number(process.argv[intervalIdx + 1]) || 1000 : 1000;
const ownPidIdx = process.argv.indexOf('--own-pid');
const ownPid = ownPidIdx !== -1 ? Number(process.argv[ownPidIdx + 1]) : undefined;
const probeLog = (msg) => console.log(`# ${msg}`);
const hub = createOcclusionHub({
  log: probeLog,
  pollMs,
  ...(ownPid ? { ownPid } : {}),
});
process.on('SIGINT', () => {
  hub.dispose();
  process.exit(0);
});
await hub.start();
console.log('# occlusion-probe: Ctrl-C 退出；拖窗遮挡观察 rects 变化');
let last = '';
setInterval(() => {
  const s = hub.getSnapshot();
  const line = JSON.stringify(s);
  if (line === last) return;
  last = line;
  const secs = Math.round((s.own ? s.own.w * s.own.h : 0) / 1000) / 1000;
  const ratio = s.own && s.rects
    ? `visible≈${Math.max(0, 1 - s.rects.reduce((a, r) => a + r[2] * r[3], 0) / (s.own.w * s.own.h)).toFixed(2)}`
    : 'visible=1';
  console.log(`[${new Date().toISOString().slice(11, 23)}] backend=${s.backend} gen=${s.gen} own=${s.own ? `${s.own.w}x${s.own.h}(${secs}MP)` : 'null'} ${ratio} rects=${JSON.stringify(s.rects)}`);
}, 250);
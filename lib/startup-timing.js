import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
function localStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const abs = Math.abs(off);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
    + (off >= 0 ? '+' : '-') + pad(Math.floor(abs / 60)) + ':' + pad(abs % 60);
}
function parseEtime(raw) {
  const text = String(raw || '').trim();
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(text);
  if (!m) return null;
  const days = Number(m[1] || 0);
  const hours = Number(m[2] || 0);
  const minutes = Number(m[3]);
  const seconds = Number(m[4]);
  return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
}
export function createStartupTiming() {
  const now = Date.now();
  const hostStart = now - Math.round(process.uptime() * 1000);
  let electronStart = hostStart;
  try {
    const raw = execFileSync('/bin/ps', ['-o', 'etime=', '-p', String(process.ppid)], {
      encoding: 'utf8',
      timeout: 2000,
    });
    const elapsed = parseEtime(raw);
    if (elapsed !== null && elapsed > 0) electronStart = now - elapsed;
  } catch {   }
  const write = (line) => {
    try {
      const dir = join(homedir(), '.dsh-wallpaper-engine');
      mkdirSync(dir, { recursive: true });
      appendFileSync(join(dir, 'startup.log'), localStamp() + ' ' + line + '\n');
    } catch {   }
  };
  write('electron-start=' + new Date(electronStart).toLocaleTimeString('zh-CN', { hour12: false })
    + ' host-start=+' + (hostStart - electronStart) + 'ms');
  return (params) => {
    try {
      const num = (k) => {
        const v = Number(params[k]);
        return Number.isFinite(v) && v > 0 ? v : null;
      };
      const page = num('timeOrigin');
      const at = num('at');
      const parts = [
        'phase=' + String(params.phase || '?'),
        'electron→host=' + (hostStart - electronStart) + 'ms',
      ];
      if (page !== null) parts.push('electron→page=' + (page - electronStart) + 'ms');
      if (page !== null && at !== null) parts.push('page→ready=' + (at - page) + 'ms');
      if (at !== null) parts.push('electron→ready=' + (at - electronStart) + 'ms');
      const dcl = num('dcl');
      const load = num('load');
      const fcp = num('fcp');
      if (dcl !== null) parts.push('dcl=' + (dcl - page) + 'ms');
      if (load !== null) parts.push('load=' + (load - page) + 'ms');
      if (fcp !== null) parts.push('fcp=' + (fcp - page) + 'ms');
      write(parts.join(' '));
    } catch {   }
  };
}
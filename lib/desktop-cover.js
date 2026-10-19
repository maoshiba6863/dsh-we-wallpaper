import { execFile } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const APP_NAME = 'DeepSeek Harness';
let coverChild = null;
export function coverChildRunning() {
  return coverChild !== null && coverChild.exitCode === null && coverChild.signalCode === null;
}
function localStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const abs = Math.abs(off);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
    + (off >= 0 ? '+' : '-') + pad(Math.floor(abs / 60)) + ':' + pad(abs % 60);
}
const WAIT_SECONDS = 60;
const JXA = `
ObjC.import('AppKit');
const se = Application('System Events');
const own = Application.currentApplication();
own.includeStandardAdditions = true;

function rect() {
  const s = $.NSScreen.mainScreen;
  const f = s.frame;
  const v = s.visibleFrame;
  // AppKit 原点在左下、AX 原点在左上：y 需要翻转。
  return [
    Math.round(v.origin.x),
    Math.round(f.size.height - (v.origin.y + v.size.height)),
    Math.round(v.size.width),
    Math.round(v.size.height),
  ];
}

let outcome = 'no-window';
let lastError = '';
const DENIED = /-1743|not allowed assistive access|不允许辅助访问|权限违例|-10004/;
for (let i = 0; i < ${Math.round(WAIT_SECONDS * 4)}; i++) {
  try {
    const proc = se.processes.byName(${JSON.stringify(APP_NAME)});
    if (proc.windows.length > 0) {
      const win = proc.windows[0];
      const r = rect();
      win.position = [r[0], r[1]];
      win.size = [r[2], r[3]];
      outcome = 'ok';
      break;
    }
  } catch (err) {
    lastError = String((err && err.message) || err);
    // 明确的授权问题直接收工；-1708「信息无法识别」这类是 System Events 刚启动的
    // 瞬时错误（实测第一次必现、第二次就好），继续重试。
    if (DENIED.test(lastError)) { outcome = 'denied:' + lastError; break; }
  }
  own.delay(0.25);
}
if (outcome !== 'ok' && outcome !== 'no-window') { /* denied 已定 */ }
else if (outcome !== 'ok') outcome = lastError ? ('failed:' + lastError) : 'no-window';
outcome;
`;
export function coverDesktopOnStartup(log) {
  coverDesktop(log).catch(() => {   });
}
export function coverDesktop(log) {
  const report = typeof log === 'function' ? log : () => {};
  const note = (line) => {
    try {
      const dir = join(homedir(), '.dsh-wallpaper-engine');
      mkdirSync(dir, { recursive: true });
      appendFileSync(join(dir, 'cover.log'), localStamp() + ' ' + line + '\n');
    } catch {   }
  };
  if (process.platform !== 'darwin') { note('skip: platform=' + process.platform); return Promise.resolve('skip'); }
  if (process.versions.electron === undefined) {
    note('skip: not-electron (node=' + process.versions.node + ')');
    return Promise.resolve('skip');
  }
  note('start: pid=' + process.pid + ' electron=' + process.versions.electron);
  return new Promise((resolve) => {
    coverChild = execFile(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '-e', JXA],
      { timeout: (WAIT_SECONDS + 10) * 1000 },
      (error, stdout, stderr) => {
        coverChild = null;
        const outcome = String(stdout || '').trim();
        if (error) {
          const why = 'failed:' + String(error.message || error).slice(0, 200);
          note(why + ' stderr=' + String(stderr || '').slice(0, 200));
          report('cover-failed', why);
          resolve(why);
          return;
        }
        note('outcome: ' + outcome);
        if (outcome === 'ok') report('cover-ok', '主窗口已铺满当前显示器');
        else if (outcome.startsWith('denied:')) {
          report('cover-denied', '没有辅助功能 / 自动化授权，窗口未调整（系统设置 → 隐私与安全性 → 辅助功能 勾选 DeepSeek Harness）');
        } else {
          report('cover-timeout', '等待主窗口超时，未调整窗口');
        }
        resolve(outcome);
      },
    );
    try { coverChild.unref(); } catch {   }
  });
}
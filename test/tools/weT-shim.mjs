export function installWeTShim() {
  if (typeof globalThis.weT === 'function') return false;
  globalThis.weT = (key, params) => {
    const text = String(key);
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
  };
  return true;
}
if (process.argv[1] && process.argv[1].endsWith('weT-shim.mjs')) {
  let failed = 0;
  const ok = (name, cond, detail) => {
    console.log((cond ? '  ✓ ' : '  ✗ ') + name + (detail ? ' — ' + detail : ''));
    if (!cond) failed++;
  };
  const fresh = () => { delete globalThis.weT; };
  fresh();
  ok('装上：返回 true', installWeTShim() === true);
  ok('身份：原文即译文', globalThis.weT('壁纸模糊') === '壁纸模糊');
  ok('插值：{n} 照插', globalThis.weT('共 {n} 张', { n: 3 }) === '共 3 张');
  ok('缺参：占位符原样留', globalThis.weT('共 {n} 张', {}) === '共 {n} 张');
  ok('幂等：已有实现时返回 false 且不覆盖', installWeTShim() === false);
  fresh();
  globalThis.weT = (k) => 'CUSTOM:' + k;
  ok('不覆盖调用方自己的实现（负对照）', installWeTShim() === false && globalThis.weT('x') === 'CUSTOM:x');
  fresh();
  console.log(failed ? 'selftest FAILED（' + failed + '）' : 'selftest ok');
  process.exit(failed ? 1 : 0);
}
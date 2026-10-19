function weClampTo(v, lo, hi, fallback) {
  const n = typeof v === 'number' && isFinite(v) ? v : Number(v);
  if (!isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}
function weNow() {
  return window.performance && typeof window.performance.now === 'function'
    ? window.performance.now() : Date.now();
}
function weBody() {
  if (typeof document === 'undefined' || !document || !document.body) return null;
  return document.body;
}
export { weClampTo, weNow, weBody };
const KINDS = ['media-origin', 'scene-ready'];
export function createNotice(log, name) {
  const seen = new Set();
  const prefix = '[' + name + '] ';
  function reportFailure(kind, err) {
    const msg = err instanceof Error ? err.message : String(err);
    try { log.warn('notice 投递失败（' + kind + '）：' + msg); } catch {   }
  }
  return function notice(kind, text) {
    if (!KINDS.includes(kind)) return;
    if (seen.has(kind)) return;
    seen.add(kind);
    const gate = String(process.env.DSH_WE_NOTICE || '').trim();
    if (gate === '0') return;
    if (gate !== '1' && process.stdout.isTTY !== true) return;
    try {
      const body = typeof text === 'function' ? text() : text;
      process.stdout.write(prefix + body + ' ✔\n', (err) => { if (err) reportFailure(kind, err); });
    } catch (err) {
      reportFailure(kind, err);
    }
  };
}
const LEVELS = ['error', 'warn', 'info'];
const RANK = { error: 0, warn: 1, info: 2 };
const DEFAULT_LEVEL = 'warn';
function gateRank() {
  const raw = String(process.env.DSH_WE_LOG_LEVEL || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(RANK, raw) ? RANK[raw] : RANK[DEFAULT_LEVEL];
}
export function createLog(logger, name, tag = '') {
  const prefix = '[' + name + ']' + (tag ? '[' + tag + ']' : '');
  function write(level, text) {
    const line = prefix + ' ' + String(text == null ? '' : text);
    try {
      const method = logger && logger[level];
      if (typeof method === 'function') method.call(logger, line);
    } catch {   }
    if (RANK[level] <= gateRank()) {
      try { console[level](line); } catch {   }
    }
  }
  const levelOf = (level) => (LEVELS.includes(level) ? level : 'info');
  const log = (text, level) => write(levelOf(level), text);
  log.error = (text) => write('error', text);
  log.warn = (text) => write('warn', text);
  log.info = (text) => write('info', text);
  log.tag = (child) => createLog(logger, name, child);
  return log;
}
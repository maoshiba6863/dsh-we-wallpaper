import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
export const BILLING_CURRENCY = 'CNY';
export const BILLING_PRICES_CNY = Object.freeze({ cacheHit: 0.02, cacheMiss: 1, output: 4 });
export const PEAK_MULTIPLIER = 2;
const PEAK_WINDOWS_UTC = [[1, 4], [6, 10]];
const WEEKEND_OFFPEAK_START_MS = Date.parse('2026-08-22T16:00:00Z');
const PEAK_HOLIDAYS = new Set([
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  '2026-10-05', '2026-10-06', '2026-10-07',
]);
const BEIJING_OFFSET_MS = 8 * 3600 * 1000;
const MAX_TURNS_PER_SESSION = 200;
const MAX_CALLS_PER_TURN = 100;
const MAX_SESSIONS = 100;
const WRITE_DEBOUNCE_MS = 1000;
export function beijingDayKey(atMs) {
  const n = Number(atMs);
  if (!Number.isFinite(n)) return '';
  return new Date(n + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}
function beijingWeekday(atMs) {
  return new Date(Number(atMs) + BEIJING_OFFSET_MS).getUTCDay();
}
export function isPeakAt(atMs, holidays = PEAK_HOLIDAYS) {
  const n = Number(atMs);
  if (!Number.isFinite(n) || !(holidays instanceof Set)) return false;
  if (n >= WEEKEND_OFFPEAK_START_MS) {
    const weekday = beijingWeekday(n);
    if (weekday === 0 || weekday === 6) return false;
    if (holidays.has(beijingDayKey(n))) return false;
  }
  const hour = new Date(n).getUTCHours();
  for (const [start, end] of PEAK_WINDOWS_UTC) {
    if (hour >= start && hour < end) return true;
  }
  return false;
}
export function priceTierFor() {
  return BILLING_PRICES_CNY;
}
export function peakViewAt(atMs) {
  const n = Number(atMs);
  if (!Number.isFinite(n)) return null;
  const inPeak = isPeakAt(n);
  const dayStart = Math.floor(n / 86400000) * 86400000;
  const boundaries = [];
  for (let d = -2; d <= 2; d += 1) {
    for (const hour of [0, 1, 4, 6, 10, 16]) boundaries.push(dayStart + d * 86400000 + hour * 3600000);
  }
  boundaries.sort((a, b) => a - b);
  const transitions = [];
  for (const b of boundaries) {
    if (isPeakAt(b - 1) !== isPeakAt(b)) transitions.push(b);
  }
  let prevAtMs = null;
  let nextAtMs = null;
  for (const t of transitions) {
    if (t <= n) prevAtMs = t;
    else if (nextAtMs === null) nextAtMs = t;
  }
  if (prevAtMs === null) prevAtMs = n - 3600000;
  if (nextAtMs === null) nextAtMs = n + 3600000;
  const day = beijingDayKey(n);
  const [yy, mm, dd] = day.split('-').map(Number);
  const utcMidnight = Date.UTC(yy, mm - 1, dd);
  const bjDayStart = utcMidnight - BEIJING_OFFSET_MS;
  const bjWeekday = new Date(utcMidnight).getUTCDay();
  const weekendOff = n >= WEEKEND_OFFPEAK_START_MS && (bjWeekday === 0 || bjWeekday === 6);
  const holidayOff = n >= WEEKEND_OFFPEAK_START_MS && PEAK_HOLIDAYS.has(day);
  let segments;
  if (weekendOff || holidayOff) {
    segments = [{ startMs: bjDayStart, endMs: bjDayStart + 86400000, peak: false }];
  } else {
    const hourMs = 3600000;
    const edges = [0, 9, 12, 14, 18, 24];
    segments = edges.slice(0, -1).map((hour, i) => ({
      startMs: bjDayStart + hour * hourMs,
      endMs: bjDayStart + edges[i + 1] * hourMs,
      peak: i === 1 || i === 3,
    }));
  }
  return {
    inPeak,
    prevAtMs,
    nextAtMs,
    weekend: weekendOff,
    holiday: holidayOff,
    dayStartMs: bjDayStart,
    dayEndMs: bjDayStart + 86400000,
    segments,
  };
}
const positive = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
export function costOf(usage, model, atMs, holidays = PEAK_HOLIDAYS) {
  if (usage === null || typeof usage !== 'object') return 0;
  const tier = priceTierFor(model);
  const cacheMiss = positive(usage.inputTokens);
  const cacheHit = positive(usage.cacheReadTokens) + positive(usage.cacheWriteTokens);
  const output = positive(usage.outputTokens);
  const peak = isPeakAt(atMs, holidays);
  const factor = peak ? PEAK_MULTIPLIER : 1;
  return ((cacheMiss * tier.cacheMiss) + (cacheHit * tier.cacheHit) + (output * tier.output)) * factor / 1e6;
}
function tokenBucketsOf(usage) {
  return {
    input: positive(usage.inputTokens),
    cacheRead: positive(usage.cacheReadTokens),
    cacheWrite: positive(usage.cacheWriteTokens),
    output: positive(usage.outputTokens),
  };
}
function addTokens(target, buckets) {
  target.input += buckets.input;
  target.cacheRead += buckets.cacheRead;
  target.cacheWrite += buckets.cacheWrite;
  target.output += buckets.output;
}
const emptyTokens = () => ({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0 });
function sanitizeTokens(raw) {
  const tokens = emptyTokens();
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return tokens;
  for (const key of Object.keys(tokens)) {
    const n = Number(raw[key]);
    if (Number.isFinite(n) && n > 0) tokens[key] = n;
  }
  return tokens;
}
const round6 = (n) => {
  const value = Number(n);
  return Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : 0;
};
function emptyState(day) {
  return { version: 1, day, today: 0, todayTokens: emptyTokens(), models: Object.create(null), updatedAt: 0, lastSessionId: '', sessions: Object.create(null) };
}
function sessionIdOf(session) {
  if (session === null || typeof session !== 'object') return '';
  if (typeof session.id === 'string' && session.id) return session.id;
  const header = session.header;
  if (header && typeof header.id === 'string' && header.id) return header.id;
  return '';
}
function sanitizeTurn(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  const cost = Number(raw.cost);
  const turn = Number.isSafeInteger(raw.turn) ? raw.turn : null;
  const endSeq = Number.isSafeInteger(raw.endSeq) ? raw.endSeq : null;
  const tokens = sanitizeTokens(raw.tokens);
  const atMs = Number(raw.atMs);
  const factor = Number(raw.factor);
  const calls = [];
  if (Array.isArray(raw.calls)) {
    for (const item of raw.calls) {
      if (item === null || typeof item !== 'object') continue;
      const callAt = Number(item.atMs);
      const callCost = Number(item.cost);
      calls.push({
        atMs: Number.isFinite(callAt) && callAt > 0 ? callAt : 0,
        model: typeof item.model === 'string' ? item.model : 'unknown',
        tokens: sanitizeTokens(item.tokens),
        cost: Number.isFinite(callCost) && callCost > 0 ? callCost : 0,
      });
      if (calls.length >= MAX_CALLS_PER_TURN) break;
    }
  }
  return {
    turn,
    cost: Number.isFinite(cost) && cost > 0 ? cost : 0,
    endSeq,
    tokens,
    atMs: Number.isFinite(atMs) && atMs > 0 ? atMs : null,
    factor: factor === 2 ? 2 : 1,
    calls,
  };
}
function sanitizeSession(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  const total = Number(raw.total);
  const turns = Object.create(null);
  if (raw.turns !== null && typeof raw.turns === 'object' && !Array.isArray(raw.turns)) {
    for (const [key, value] of Object.entries(raw.turns)) {
      const seq = Number(key);
      if (!Number.isSafeInteger(seq) || seq < 0) continue;
      const turn = sanitizeTurn(value);
      if (turn) turns[seq] = turn;
    }
  }
  const contextTokens = Number(raw.contextTokens);
  return {
    total: Number.isFinite(total) && total > 0 ? total : 0,
    tokens: sanitizeTokens(raw.tokens),
    contextTokens: Number.isFinite(contextTokens) && contextTokens > 0 ? contextTokens : 0,
    turns,
    updatedAt: Number(raw.updatedAt) || 0,
  };
}
function sanitizeModels(raw) {
  const models = Object.create(null);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return models;
  for (const [model, value] of Object.entries(raw)) {
    if (typeof model !== 'string' || !model || model.length > 200) continue;
    const cost = Number(value);
    if (Number.isFinite(cost) && cost > 0) models[model] = cost;
  }
  return models;
}
function pruneTurns(session) {
  const keys = Object.keys(session.turns).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length - MAX_TURNS_PER_SESSION; i += 1) delete session.turns[keys[i]];
}
function pruneSessions(state) {
  const rows = Object.entries(state.sessions);
  if (rows.length <= MAX_SESSIONS) return;
  rows.sort((a, b) => (Number(b[1].updatedAt) || 0) - (Number(a[1].updatedAt) || 0));
  for (let i = MAX_SESSIONS; i < rows.length; i += 1) delete state.sessions[rows[i][0]];
}
function usageOfEvent(event) {
  if (event === null || typeof event !== 'object') return null;
  const data = event.data;
  if (event.type === 'assistant/chunk' && data && data.chunk && data.chunk.type === 'usage' && data.chunk.usage != null) {
    return data.chunk.usage;
  }
  if (event.type === 'assistant/message' && data && data.usage != null) return data.usage;
  if (event.type === 'compaction/summary' && data && data.usage != null) return data.usage;
  return null;
}
export function turnCostFromEvents(events, startSeq, endSeq) {
  if (!Array.isArray(events) || !Number.isSafeInteger(startSeq) || !Number.isSafeInteger(endSeq)) return null;
  if (endSeq < startSeq) return null;
  let started = false;
  let model = '';
  const calls = [];
  const tokens = emptyTokens();
  let cost = 0;
  for (const event of events) {
    const seq = Number(event && event.seq);
    if (!Number.isFinite(seq)) continue;
    if (seq < startSeq) {
      if (event.type === 'request/header' && event.data && typeof event.data.model === 'string') model = event.data.model;
      continue;
    }
    if (seq > endSeq) break;
    if (event.type === 'turn/start') { started = true; continue; }
    if (event.type === 'request/header' && event.data && typeof event.data.model === 'string') {
      model = event.data.model;
      continue;
    }
    if (event.type === 'turn/end') break;
    const usage = usageOfEvent(event);
    if (!usage) continue;
    const buckets = tokenBucketsOf(usage);
    const at = Number(event.time);
    const costOfCall = costOf(usage, model, Number.isFinite(at) ? at : Date.now());
    addTokens(tokens, buckets);
    cost += costOfCall;
    calls.push({ atMs: Number.isFinite(at) ? at : 0, model: model || 'deepseek', tokens: buckets, cost: round6(costOfCall) });
  }
  if (!started) return null;
  return {
    cost: round6(cost),
    tokens,
    calls,
    factor: (() => {
      const start = events.find((e) => Number(e && e.seq) === startSeq);
      const at = Number(start && start.time);
      return Number.isFinite(at) && isPeakAt(at) ? PEAK_MULTIPLIER : 1;
    })(),
  };
}
export function createBilling(options = {}) {
  const { dataDir, now = Date.now, log = () => {} } = options;
  const file = join(String(dataDir || '.'), 'billing.json');
  const clock = typeof now === 'function' ? now : Date.now;
  const warn = typeof log === 'function' ? log : () => {};
  const currentDay = () => beijingDayKey(clock());
  let state = emptyState(currentDay());
  let dirty = false;
  let timer = null;
  const activeTurns = new Map();
  const lastTurns = new Map();
  function load() {
    try {
      if (!existsSync(file)) return;
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return;
      const sessions = Object.create(null);
      if (raw.sessions !== null && typeof raw.sessions === 'object' && !Array.isArray(raw.sessions)) {
        for (const [id, value] of Object.entries(raw.sessions)) {
          if (typeof id !== 'string' || id.length === 0 || id.length > 512) continue;
          const session = sanitizeSession(value);
          if (session) sessions[id] = session;
        }
      }
      const today = Number(raw.today);
      state = {
        version: 1,
        day: typeof raw.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.day) ? raw.day : currentDay(),
        today: Number.isFinite(today) && today > 0 ? today : 0,
        todayTokens: sanitizeTokens(raw.todayTokens),
        models: sanitizeModels(raw.models),
        updatedAt: Number(raw.updatedAt) || 0,
        lastSessionId: typeof raw.lastSessionId === 'string' ? raw.lastSessionId : '',
        sessions,
      };
    } catch (error) {
      warn('billing.json 读取失败，今日费用从 0 重新累计：' + String((error && error.message) || error));
    }
  }
  function ensureDay() {
    const day = currentDay();
    if (state.day === day) return;
    state.day = day;
    state.today = 0;
    state.todayTokens = emptyTokens();
    state.models = Object.create(null);
    state.updatedAt = clock();
    dirty = true;
    schedule();
  }
  function writeNow() {
    if (!dirty) return;
    try {
      mkdirSync(dirname(file), { recursive: true });
      const tmp = file + '.tmp';
      writeFileSync(tmp, JSON.stringify(state));
      renameSync(tmp, file);
      dirty = false;
    } catch (error) {
      warn('billing.json 写入失败：' + String((error && error.message) || error));
    }
  }
  function schedule() {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      writeNow();
    }, WRITE_DEBOUNCE_MS);
    if (typeof timer.unref === 'function') timer.unref();
  }
  function touch() {
    state.updatedAt = clock();
    dirty = true;
    schedule();
  }
  function ensureSession(sessionId) {
    let session = state.sessions[sessionId];
    if (!session) {
      session = { total: 0, tokens: emptyTokens(), contextTokens: 0, turns: Object.create(null), updatedAt: clock() };
      state.sessions[sessionId] = session;
      pruneSessions(state);
    }
    return session;
  }
  function account(usage, options, startedAtMs, turnInfo) {
    const cost = costOf(usage, options && options.model, startedAtMs);
    if (!(cost > 0)) return 0;
    ensureDay();
    state.today += cost;
    const buckets = tokenBucketsOf(usage);
    addTokens(state.todayTokens, buckets);
    const modelKey = options && typeof options.model === 'string' && options.model ? options.model : 'unknown';
    state.models[modelKey] = (state.models[modelKey] || 0) + cost;
    const sessionId = options && typeof options.sessionId === 'string' ? options.sessionId : '';
    if (sessionId) {
      const session = ensureSession(sessionId);
      session.total += cost;
      addTokens(session.tokens, buckets);
      session.contextTokens = buckets.input + buckets.cacheRead + buckets.cacheWrite;
      session.updatedAt = clock();
      const startSeq = turnInfo && Number.isSafeInteger(turnInfo.startSeq) ? turnInfo.startSeq : null;
      if (startSeq !== null && startSeq >= 0) {
        const turn = session.turns[startSeq] || (session.turns[startSeq] = { turn: turnInfo.turn ?? null, cost: 0, endSeq: turnInfo.endSeq ?? null, tokens: emptyTokens() });
        turn.cost += cost;
        if (!turn.tokens) turn.tokens = emptyTokens();
        if (!Number.isFinite(Number(turn.atMs)) && Number.isFinite(Number(startedAtMs))) {
          turn.atMs = Number(startedAtMs);
          turn.factor = isPeakAt(Number(startedAtMs)) ? PEAK_MULTIPLIER : 1;
        }
        addTokens(turn.tokens, buckets);
        if (!Array.isArray(turn.calls)) turn.calls = [];
        turn.calls.push({
          atMs: Number.isFinite(Number(startedAtMs)) ? Number(startedAtMs) : clock(),
          model: modelKey,
          tokens: { ...buckets },
          cost: round6(cost),
        });
        if (turn.calls.length > MAX_CALLS_PER_TURN) turn.calls.shift();
        if (turn.turn === null && turnInfo.turn !== null && turnInfo.turn !== undefined) turn.turn = turnInfo.turn;
        pruneTurns(session);
      }
      state.lastSessionId = sessionId;
    }
    touch();
    return cost;
  }
  function noteEvent(session, event) {
    const sessionId = sessionIdOf(session);
    if (!sessionId || event === null || typeof event !== 'object') return;
    if (!Number.isSafeInteger(event.seq) || event.seq < 0) return;
    const type = event.type;
    if (type === 'turn/start') {
      const turn = Number.isSafeInteger(event.data && event.data.turn) ? event.data.turn : null;
      const info = { turn, startSeq: event.seq, endSeq: null };
      activeTurns.set(sessionId, info);
      lastTurns.set(sessionId, info);
      const record = ensureSession(sessionId);
      if (!record.turns[event.seq]) {
        const at = Number(event.time);
        record.turns[event.seq] = {
          turn, cost: 0, endSeq: null, tokens: emptyTokens(),
          atMs: Number.isFinite(at) && at > 0 ? at : clock(),
          factor: isPeakAt(Number.isFinite(at) && at > 0 ? at : clock()) ? PEAK_MULTIPLIER : 1,
        };
      }
      state.lastSessionId = sessionId;
      touch();
      return;
    }
    if (type === 'turn/end') {
      const info = activeTurns.get(sessionId);
      if (!info) return;
      const turn = event.data && Number.isSafeInteger(event.data.turn) ? event.data.turn : null;
      if (info.turn !== null && turn !== null && info.turn !== turn) return;
      info.endSeq = event.seq;
      activeTurns.delete(sessionId);
      const record = state.sessions[sessionId];
      if (record && record.turns[info.startSeq]) record.turns[info.startSeq].endSeq = event.seq;
      touch();
      return;
    }
    if (state.lastSessionId !== sessionId) {
      state.lastSessionId = sessionId;
      touch();
    }
  }
  function turnAt(sessionId) {
    if (typeof sessionId !== 'string' || !sessionId) return null;
    const info = activeTurns.get(sessionId);
    return info ? { ...info } : null;
  }
  function snapshot(query = {}) {
    const sessionId = query && typeof query.sessionId === 'string' ? query.sessionId : '';
    ensureDay();
    const sid = typeof sessionId === 'string' && sessionId ? sessionId : state.lastSessionId;
    const session = sid ? state.sessions[sid] : null;
    const info = sid ? (activeTurns.get(sid) || lastTurns.get(sid) || null) : null;
    let turn = null;
    if (info && session && session.turns[info.startSeq]) {
      const row = session.turns[info.startSeq];
      turn = {
        turn: row.turn ?? info.turn ?? null,
        startSeq: info.startSeq,
        endSeq: row.endSeq ?? info.endSeq ?? null,
        cost: round6(row.cost),
        tokens: sanitizeTokens(row.tokens),
        atMs: Number.isFinite(Number(row.atMs)) ? Number(row.atMs) : null,
        factor: Number(row.factor) === 2 ? 2 : 1,
        calls: Array.isArray(row.calls) ? row.calls : [],
      };
    }
    const turns = session
      ? Object.entries(session.turns)
        .map(([seq, row]) => ({
          startSeq: Number(seq),
          turn: row.turn ?? null,
          endSeq: row.endSeq ?? null,
          cost: round6(row.cost),
          tokens: sanitizeTokens(row.tokens),
          atMs: Number.isFinite(Number(row.atMs)) ? Number(row.atMs) : null,
          factor: Number(row.factor) === 2 ? 2 : 1,
          calls: Array.isArray(row.calls) ? row.calls : [],
        }))
        .sort((a, b) => a.startSeq - b.startSeq)
      : [];
    return {
      currency: BILLING_CURRENCY,
      approx: true,
      sessionId: sid || '',
      today: round6(state.today),
      todayTokens: state.todayTokens,
      session: round6(session ? session.total : 0),
      sessionTokens: session ? session.tokens : emptyTokens(),
      contextTokens: session ? round6(session.contextTokens) : 0,
      turn,
      turns,
      models: Object.entries(state.models)
        .map(([model, cost]) => ({ model, cost: round6(cost) }))
        .sort((a, b) => b.cost - a.cost),
      peak: peakViewAt(clock()),
      prices: BILLING_PRICES_CNY,
      updatedAt: state.updatedAt || 0,
    };
  }
  function flush() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    writeNow();
  }
  function dispose() {
    flush();
    activeTurns.clear();
    lastTurns.clear();
  }
  load();
  ensureDay();
  return { account, noteEvent, snapshot, turnAt, flush, dispose, file };
}
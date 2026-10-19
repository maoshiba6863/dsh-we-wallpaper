import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BILLING_CURRENCY,
  BILLING_PRICES_CNY,
  PEAK_MULTIPLIER,
  beijingDayKey,
  costOf,
  createBilling,
  isPeakAt,
  peakViewAt,
  priceTierFor,
} from '../lib/billing.js';
import { createBillingBalance } from '../lib/billing-balance.js';
import { registerBillingBalanceRoutes } from '../lib/routes/billing-balance.js';
import { createBillingStream } from '../lib/billing-stream.js';
import { registerBillingRoutes } from '../lib/routes/billing.js';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ISO = join(ROOT, '.test-cache', 'billing-guard');
const DAY_MS = 86400000;
const OFF_PEAK_AT = Date.parse('2026-10-20T05:00:00Z');
const PEAK_AT = Date.parse('2026-10-20T02:00:00Z');
const SATURDAY_AT = Date.parse('2026-10-24T02:00:00Z');
const SUNDAY_AT = Date.parse('2026-10-25T02:00:00Z');
const HOLIDAY_AT = Date.parse('2026-10-01T02:00:00Z');
const OLD_SATURDAY_AT = Date.parse('2026-08-15T02:00:00Z');
let passed = 0;
let failed = 0;
let mutantSeq = 0;
function check (name, ok, detail) {
  if (ok) passed++;
  else failed++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? ' — ' + detail : ''));
}
function section (t) { console.log('\n' + t); }
const close = (a, b, eps = 1e-9) => Number.isFinite(a) && Math.abs(a - b) <= eps;
rmSync(ISO, { recursive: true, force: true });
mkdirSync(ISO, { recursive: true });
let dirSeq = 0;
function dir (label) {
  const p = join(ISO, String(dirSeq++) + '-' + label);
  mkdirSync(p, { recursive: true });
  return p;
}
section('A. 计价数学（人民币元 / 1M tokens）');
check('A1 谷价：未命中输入 ¥1 / 缓存读 ¥0.02 / 输出 ¥4（各 1M）',
  close(costOf({ inputTokens: 1e6 }, 'deepseek-v4-flash', OFF_PEAK_AT), 1)
  && close(costOf({ cacheReadTokens: 1e6 }, 'deepseek-v4-flash', OFF_PEAK_AT), 0.02)
  && close(costOf({ outputTokens: 1e6 }, 'deepseek-v4-flash', OFF_PEAK_AT), 4));
check('A2 峰时价 = 谷价 × 2（PEAK_MULTIPLIER = 2）',
  PEAK_MULTIPLIER === 2
  && close(costOf({ inputTokens: 1e6 }, 'deepseek-v4-flash', PEAK_AT), 2)
  && close(costOf({ outputTokens: 1e6 }, 'deepseek-v4-flash', PEAK_AT), 8));
check('A3 峰窗是半开区间：[1,4) 的 04:00Z 已回谷价、[6,10) 的 06:00Z 进峰价、10:00Z 回谷价',
  close(costOf({ inputTokens: 1e6 }, 'm', Date.parse('2026-10-20T03:59:59Z')), 2)
  && close(costOf({ inputTokens: 1e6 }, 'm', Date.parse('2026-10-20T04:00:00Z')), 1)
  && close(costOf({ inputTokens: 1e6 }, 'm', Date.parse('2026-10-20T06:00:00Z')), 2)
  && close(costOf({ inputTokens: 1e6 }, 'm', Date.parse('2026-10-20T10:00:00Z')), 1));
check('A4 周末（周六 / 周日）全天谷价，不套峰窗',
  isPeakAt(SATURDAY_AT) === false && isPeakAt(SUNDAY_AT) === false
  && close(costOf({ inputTokens: 1e6 }, 'm', SATURDAY_AT), 1));
check('A5 法定假日（国庆 2026-10-01 周四）全天谷价',
  isPeakAt(HOLIDAY_AT) === false
  && close(costOf({ inputTokens: 1e6 }, 'm', HOLIDAY_AT), 1));
check('A6 周末新规生效前（2026-08-15 周六 02:00Z）仍按峰窗计',
  isPeakAt(OLD_SATURDAY_AT) === true
  && close(costOf({ inputTokens: 1e6 }, 'm', OLD_SATURDAY_AT), 2));
check('A7 reasoning tokens 不单独计费（只算 outputTokens）',
  close(costOf({ reasoningTokens: 1e6 }, 'm', OFF_PEAK_AT), 0)
  && close(costOf({ outputTokens: 1e6, reasoningTokens: 1e6 }, 'm', OFF_PEAK_AT), 4));
check('A8 Pro 与 Flash 同价（2026-09-14 起官方把 Pro 转到 Flash 路由价）',
  priceTierFor('deepseek-v4-pro') === BILLING_PRICES_CNY
  && close(costOf({ inputTokens: 1e6 }, 'deepseek-v4-pro', OFF_PEAK_AT), 1)
  && close(costOf({ inputTokens: 1e6 }, 'deepseek-v4-pro', OFF_PEAK_AT),
    costOf({ inputTokens: 1e6 }, 'deepseek-v4-flash', OFF_PEAK_AT)));
check('A9 未知模型 / 别名按官方价近似（宁可给近似值，也不显示 0）',
  close(costOf({ inputTokens: 1e6 }, 'qwen3.5-plus', OFF_PEAK_AT), 1)
  && close(costOf({ inputTokens: 1e6 }, 'deepseek-v4.1-flash', OFF_PEAK_AT), 1));
check('A10 缓存写按命中价计（官方历史规则）',
  close(costOf({ cacheWriteTokens: 1e6 }, 'm', OFF_PEAK_AT), 0.02));
check('A11 坏输入（null / 缺桶 / 负数 / 非数字）一律 0，不抛',
  costOf(null, 'm', OFF_PEAK_AT) === 0
  && costOf({}, 'm', OFF_PEAK_AT) === 0
  && costOf({ inputTokens: -5, outputTokens: 'x', cacheReadTokens: NaN }, 'm', OFF_PEAK_AT) === 0);
check('A12 北京时间日历日口径（16:00Z 之后算次日）',
  beijingDayKey(Date.parse('2026-10-19T15:59:00Z')) === '2026-10-19'
  && beijingDayKey(Date.parse('2026-10-19T16:00:00Z')) === '2026-10-20');
check('A13 币种常量是 CNY（界面只显示 ¥）', BILLING_CURRENCY === 'CNY');
section('B. 轮次归属（session/event + usage）');
let clockMs = OFF_PEAK_AT;
const now = () => clockMs;
const dataDir = dir('turn');
const billing = createBilling({ dataDir, now, log: () => {} });
const session1 = { header: { id: 's1' } };
const session2 = { header: { id: 's2' }, id: 's2' };
billing.noteEvent(session1, { seq: 4, type: 'turn/start', data: { turn: 1 } });
const turnInfo = billing.turnAt('s1');
check('B1 turn/start 记下 startSeq，turnAt() 交回同一轮',
  turnInfo && turnInfo.startSeq === 4 && turnInfo.turn === 1);
billing.account({ inputTokens: 1e6 }, { sessionId: 's1', model: 'deepseek-v4-flash' }, clockMs, turnInfo);
let snap = billing.snapshot({ sessionId: 's1' });
check('B2 轮内 usage 同时进「今日 / 本会话 / 本轮」三个数',
  close(snap.today, 1) && close(snap.session, 1)
  && snap.turn && snap.turn.startSeq === 4 && close(snap.turn.cost, 1));
billing.account({ cacheReadTokens: 1e6 }, { sessionId: 's1', model: 'deepseek-v4-flash' }, clockMs, turnInfo);
snap = billing.snapshot({ sessionId: 's1' });
check('B3 同一轮多次调用累加进同一个桶',
  close(snap.session, 1.02) && close(snap.turn.cost, 1.02));
billing.noteEvent(session1, { seq: 12, type: 'turn/end', data: { turn: 1 } });
snap = billing.snapshot({ sessionId: 's1' });
check('B4 turn/end 补上 endSeq，且不另开一轮',
  snap.turn && snap.turn.endSeq === 12 && close(snap.turn.cost, 1.02));
billing.noteEvent(session2, { seq: 2, type: 'turn/start', data: { turn: 1 } });
const turn2 = billing.turnAt('s2');
billing.account({ inputTokens: 1e6 }, { sessionId: 's2', model: 'deepseek-v4-pro' }, clockMs, turn2);
check('B5 会话隔离：另一会话的用量不进 s1 的本会话',
  close(billing.snapshot({ sessionId: 's2' }).session, 1)
  && close(billing.snapshot({ sessionId: 's1' }).session, 1.02));
billing.account({ inputTokens: 250000 }, { sessionId: 's2', model: 'm' }, clockMs, null);
snap = billing.snapshot({ sessionId: 's2' });
check('B6 未挂轮次的用量只进「本会话」，不改「本轮」',
  close(snap.session, 1.25) && close(snap.turn.cost, 1));
snap = billing.snapshot({ sessionId: 's1' });
check('B7 今日 = 全部会话之和（跨会话累加）',
  close(snap.today, 1.02 + 1.25));
check('B8 非法事件（seq 负数 / 缺字段 / null）静默跳过，不抛',
  (() => {
    try {
      billing.noteEvent(session1, { seq: -1, type: 'turn/start' });
      billing.noteEvent(session1, { type: 'turn/start' });
      billing.noteEvent(null, { seq: 1, type: 'turn/start' });
      billing.noteEvent(session1, null);
      return true;
    } catch { return false; }
  })());
snap = billing.snapshot();
check('B9 不带 sessionId 的快照回落到「最近活跃会话」',
  snap.sessionId === 's2' && close(snap.session, 1.25));
clockMs += DAY_MS;
snap = billing.snapshot({ sessionId: 's1' });
check('B10 跨日：今日清零，本会话保留',
  close(snap.today, 0) && close(snap.session, 1.02));
section('C. 持久化（billing.json）');
billing.flush();
const filePath = join(dataDir, 'billing.json');
const persisted = JSON.parse(readFileSync(filePath, 'utf8'));
check('C1 flush() 落盘：sessions 里有本轮与两个会话',
  persisted && persisted.sessions
  && persisted.sessions.s1 && persisted.sessions.s2
  && close(persisted.sessions.s1.total, 1.02)
  && close(persisted.sessions.s2.total, 1.25));
const reloaded = createBilling({ dataDir, now, log: () => {} });
const reSnap = reloaded.snapshot({ sessionId: 's1' });
check('C2 重载后三个数与落盘前一致（今日按日切后为 0）',
  close(reSnap.today, 0) && close(reSnap.session, 1.02)
  && reSnap.turns.some((row) => row.startSeq === 4 && close(row.cost, 1.02)));
const badDir = dir('corrupt');
writeFileSync(join(badDir, 'billing.json'), '{ not json');
const warnings = [];
let badThrew = false;
let badBilling = null;
try {
  badBilling = createBilling({ dataDir: badDir, now, log: (m) => warnings.push(m) });
} catch { badThrew = true; }
check('C3 坏账本：不抛、今日从 0 开始、只留一行警告',
  badThrew === false && badBilling !== null
  && close(badBilling.snapshot().today, 0)
  && warnings.length === 1 && warnings[0].includes('billing.json'));
check('C4 原子写：目录里没有留下 .tmp 残留',
  !readFileSync(filePath, 'utf8').includes('.tmp')
  && !(await import('node:fs')).readdirSync(dataDir).some((name) => name.endsWith('.tmp')));
section('D. GET /wallpaper-engine/billing');
const registered = [];
const disposers = [];
const snapshotQueries = [];
const routeBilling = {
  snapshot (query) {
    snapshotQueries.push(query);
    if (query && query.sessionId === 'boom') throw new Error('snapshot failed');
    return {
      currency: 'CNY', approx: true, sessionId: (query && query.sessionId) || 'recent',
      today: 1.5, session: 0.5, turn: null, turns: [], updatedAt: 1,
    };
  },
};
registerBillingRoutes({ register (opts) { registered.push(opts); return () => {}; } },
  { disposers, base: '/wallpaper-engine', billing: routeBilling });
function fakeRes () {
  return {
    statusCode: 200,
    headers: Object.create(null),
    body: '',
    setHeader (k, v) { this.headers[String(k).toLowerCase()] = v; },
    end (s) { if (s !== undefined) this.body += s; },
  };
}
const handler = registered.length === 1 ? registered[0].handler : null;
const getRes = fakeRes();
handler({ method: 'GET', url: '/wallpaper-engine/billing?sessionId=s1' }, getRes);
let getBody;
try { getBody = JSON.parse(getRes.body); } catch { getBody = null; }
check('D1 GET 200 + JSON 形状 {today, session, turn, currency}',
  getRes.statusCode === 200
  && String(getRes.headers['content-type'] || '').includes('application/json')
  && getBody !== null
  && getBody.currency === 'CNY' && typeof getBody.today === 'number'
  && typeof getBody.session === 'number' && 'turn' in getBody);
check('D2 sessionId 原样交给 snapshot（缺省 = 最近活跃会话）',
  snapshotQueries[0] && snapshotQueries[0].sessionId === 's1');
const headRes = fakeRes();
handler({ method: 'HEAD', url: '/wallpaper-engine/billing' }, headRes);
check('D3 HEAD 200 + 空体（不发两次 JSON）',
  headRes.statusCode === 200 && headRes.body === '');
const postRes = fakeRes();
handler({ method: 'POST', url: '/wallpaper-engine/billing' }, postRes);
check('D4 非 GET/HEAD ⇒ 405 + Allow 头',
  postRes.statusCode === 405 && postRes.headers.allow === 'GET, HEAD');
const longRes = fakeRes();
handler({ method: 'GET', url: '/wallpaper-engine/billing?sessionId=' + 'x'.repeat(600) }, longRes);
check('D5 超长 sessionId 被丢弃（按缺省处理）',
  longRes.statusCode === 200 && snapshotQueries[snapshotQueries.length - 1].sessionId === '');
const boomRes = fakeRes();
handler({ method: 'GET', url: '/wallpaper-engine/billing?sessionId=boom' }, boomRes);
let boomBody;
try { boomBody = JSON.parse(boomRes.body); } catch { boomBody = null; }
check('D6 snapshot 抛错 ⇒ 500 且错误不进日志栈（只回消息）',
  boomRes.statusCode === 500 && boomBody && boomBody.error === 'snapshot failed');
check('D7 路由注册一次，并把 disposer 交回',
  registered.length === 1 && disposers.length === 1 && typeof disposers[0] === 'function');
section('E. llm/stream 包装与去重');
function stubBilling () {
  const calls = [];
  return {
    calls,
    billing: {
      account (usage, options, startedAtMs, turnInfo) {
        calls.push({ usage, options, startedAtMs, turnInfo });
      },
      turnAt (sessionId) { return sessionId === 's1' ? { turn: 1, startSeq: 4, endSeq: null } : null; },
    },
  };
}
async function drain (iterable) {
  const out = [];
  for await (const chunk of iterable) out.push(chunk);
  return out;
}
const stub1 = stubBilling();
const listener1 = createBillingStream({ billing: stub1.billing, now: () => 1000 });
const downstream1 = async function* () {
  yield { type: 'text', text: 'a' };
  yield { type: 'usage', usage: { inputTokens: 1e6 } };
  yield { type: 'text', text: 'b' };
};
const chunks1 = await drain(listener1({ sessionId: 's1', model: 'deepseek-v4-flash' }, () => downstream1()));
check('E1 usage 块被捕获，记账一次；其余 chunk 原样透传',
  chunks1.length === 3 && stub1.calls.length === 1
  && close(stub1.calls[0].usage.inputTokens, 1e6)
  && stub1.calls[0].startedAtMs === 1000
  && stub1.calls[0].turnInfo && stub1.calls[0].turnInfo.startSeq === 4);
const stub2 = stubBilling();
const listener2 = createBillingStream({ billing: stub2.billing, now: () => 2000 });
const innerGen = async function* () {
  yield { type: 'usage', usage: { inputTokens: 5e5 } };
  yield { type: 'text', text: 'inner' };
};
const nestedDownstream = async function* () {
  yield { type: 'text', text: 'outer' };
  const inner = listener2({ sessionId: 's1', model: 'm' }, () => innerGen());
  for await (const _chunk of inner) {   }
  yield { type: 'usage', usage: { inputTokens: 1e6 } };
};
await drain(listener2({ sessionId: 's1', model: 'm' }, () => nestedDownstream()));
check('E2 嵌套包装路由：同一笔只记一次（外层），内层不记账',
  stub2.calls.length === 1 && close(stub2.calls[0].usage.inputTokens, 1e6));
const stub3 = stubBilling();
const listener3 = createBillingStream({ billing: stub3.billing, now: () => 3000 });
await drain(listener3({ sessionId: 's1' }, () => (async function* () { yield { type: 'text' }; })()));
check('E3 没有 usage 块 ⇒ 不记账（不凭空造 0 元调用）', stub3.calls.length === 0);
const stub4 = stubBilling();
const listener4 = createBillingStream({ billing: stub4.billing, now: () => 4000 });
let returnCalled = false;
const earlyDownstream = {
  [Symbol.asyncIterator] () {
    let step = 0;
    return {
      async next () {
        step++;
        return step === 1
          ? { value: { type: 'usage', usage: { outputTokens: 1e6 } }, done: false }
          : { value: { type: 'text' }, done: false };
      },
      async return () { returnCalled = true; return { done: true, value: undefined }; },
    };
  },
};
for await (const _chunk of listener4({ sessionId: 's1' }, () => earlyDownstream)) break;
check('E4 消费方提前 break ⇒ 显式向下游传播 return()，已捕获的 usage 照常记账',
  returnCalled === true && stub4.calls.length === 1);
const stub5 = stubBilling();
const listener5 = createBillingStream({ billing: stub5.billing, now: () => 5000 });
let caught = '';
const failingDownstream = {
  [Symbol.asyncIterator] () {
    return { async next () { throw new Error('upstream boom'); } };
  },
};
try {
  for await (const _chunk of listener5({ sessionId: 's1' }, () => failingDownstream)) {   }
} catch (error) { caught = String(error && error.message); }
check('E5 下游异常原样上抛（计费是观测，不吞聊天的错）',
  caught === 'upstream boom' && stub5.calls.length === 0);
section('F. 客户端接线（src/billing-layer.js / client.js / schema / CSS）');
const layerSrc = readFileSync(join(ROOT, 'src', 'billing-layer.js'), 'utf8');
const clientSrc = readFileSync(join(ROOT, 'src', 'client.js'), 'utf8');
const schemaSrc = readFileSync(join(ROOT, 'lib', 'settings-schema.js'), 'utf8');
const extCssSrc = readFileSync(join(ROOT, 'src', 'styles-ext.js'), 'utf8');
check('F1 浏览器安全：billing-layer 无 import / require / process / Node API',
  !/^\s*import\s/m.test(layerSrc) && !/\brequire\s*\(/.test(layerSrc)
  && !/\bprocess\./.test(layerSrc) && !/from\s+['"]node:/.test(layerSrc));
check('F2 取数只走 apiJson 的 /billing（不自己拼 fetch；HANDOFF 踩过的坑）',
  /apiJson\(billingPath\(/.test(layerSrc) && !/\bfetch\s*\(/.test(layerSrc)
  && /["']\/billing\?sessionId=/.test(layerSrc));
check('F3 两个出口都受 billingEnabled 门控（关掉就返回 null、不建节点）',
  /selection\.billingEnabled\s*!==\s*false/.test(layerSrc)
  && /if\s*\(!enabled\)\s*return null;/.test(layerSrc)
  && /function BillingSidebarFooter/.test(layerSrc)
  && /function BillingTurnTail/.test(layerSrc));
check('F4 文案：侧栏「今日」+ 每轮「本轮费用 ≈{amount}」（本会话已移出侧栏）',
  layerSrc.includes('weT("今日")')
  && !layerSrc.includes('row("session"')
  && layerSrc.includes('weT("本轮费用 ≈{amount}"'));
check('F5 两个槽都在 client.js 里注册（与 cost-meter 同一对官方座位）',
  /inject\("sidebar\.footer\.action"/.test(clientSrc)
  && /inject\("conversation\.chat\.turnTail"/.test(clientSrc)
  && clientSrc.includes('id: "wallpaper-billing"')
  && clientSrc.includes('id: "wallpaper-billing-turn"'));
const systemAt = clientSrc.indexOf('if (activeTab === "system")');
const billingSectionAt = clientSrc.indexOf('renderBillingSection({', systemAt);
check('F6 设置分区在「系统」页签里：renderBillingSection 位于 system 页签内',
  systemAt > -1 && billingSectionAt > systemAt);
check('F7 schema：billingEnabled 默认开、清洗时按 boolTrue（缺省即真）',
  /billingEnabled:\s*true/.test(schemaSrc)
  && /billingEnabled:\s*\{\s*kind:\s*'boolTrue'\s*\}/.test(schemaSrc));
check('F8 CSS：侧栏卡与每轮小字两个类名都在（金额等宽数字不跳宽）',
  extCssSrc.includes('.we-billing-foot') && extCssSrc.includes('.we-billing-turn')
  && /\.we-billing-turn\s*\{[^}]*tabular-nums/s.test(extCssSrc));
section('H. 峰谷视图 · 模型聚合 · 账号余额');
const peakView = peakViewAt(PEAK_AT);
check('H1 峰时视图：本段 01:00Z 起、下一段边界 04:00Z 止',
  peakView && peakView.inPeak === true
  && peakView.prevAtMs === Date.parse('2026-10-20T01:00:00Z')
  && peakView.nextAtMs === Date.parse('2026-10-20T04:00:00Z'));
const offView = peakViewAt(OFF_PEAK_AT);
check('H2 谷时视图：本段 04:00Z 起、下一段 06:00Z 止，且不是周末/假日',
  offView && offView.inPeak === false
  && offView.prevAtMs === Date.parse('2026-10-20T04:00:00Z')
  && offView.nextAtMs === Date.parse('2026-10-20T06:00:00Z')
  && offView.weekend === false && offView.holiday === false);
const weekendView = peakViewAt(SATURDAY_AT);
check('H3 周末视图：全天谷价，下一段边界是周一 01:00Z 的高峰起点',
  weekendView && weekendView.inPeak === false && weekendView.weekend === true
  && weekendView.nextAtMs === Date.parse('2026-10-26T01:00:00Z')
  && weekendView.prevAtMs === Date.parse('2026-10-23T10:00:00Z'));
const agg = createBilling({ dataDir: dir('models'), now: () => OFF_PEAK_AT, log: () => {} });
agg.account({ inputTokens: 1e6 }, { sessionId: 'm1', model: 'deepseek-v4-flash' }, OFF_PEAK_AT, null);
agg.account({ outputTokens: 1e6 }, { sessionId: 'm1', model: 'deepseek-v4-pro' }, OFF_PEAK_AT, null);
const aggSnap = agg.snapshot({ sessionId: 'm1' });
check('H4 今日按模型聚合：两条模型、按金额降序、合计等于 today',
  aggSnap.models.length === 2
  && aggSnap.models[0].model === 'deepseek-v4-pro' && close(aggSnap.models[0].cost, 4)
  && aggSnap.models[1].model === 'deepseek-v4-flash' && close(aggSnap.models[1].cost, 1)
  && close(aggSnap.models.reduce((n, row) => n + row.cost, 0), aggSnap.today));
check('H5 用量四桶：本会话与今日都按 input/cacheRead/cacheWrite/output 累计',
  aggSnap.sessionTokens.input === 1e6 && aggSnap.sessionTokens.output === 1e6
  && aggSnap.sessionTokens.cacheRead === 0
  && aggSnap.todayTokens.input === 1e6 && aggSnap.todayTokens.output === 1e6);
const tokBilling = createBilling({ dataDir: dir('tokens'), now: () => OFF_PEAK_AT, log: () => {} });
tokBilling.noteEvent({ id: 't1' }, { seq: 10, type: 'turn/start', data: { turn: 1 } });
const tokTurn = tokBilling.turnAt('t1');
tokBilling.account({ inputTokens: 2000, cacheReadTokens: 3000, outputTokens: 500 }, { sessionId: 't1', model: 'm' }, OFF_PEAK_AT, tokTurn);
tokBilling.account({ inputTokens: 1000, cacheWriteTokens: 400, outputTokens: 200 }, { sessionId: 't1', model: 'm' }, OFF_PEAK_AT, tokTurn);
const tokSnap = tokBilling.snapshot({ sessionId: 't1' });
check('H6 轮次用量：同一轮两次调用合并（input 3000 / cache 3400 / output 700）',
  tokSnap.turn && tokSnap.turn.tokens.input === 3000
  && tokSnap.turn.tokens.cacheRead === 3000 && tokSnap.turn.tokens.cacheWrite === 400
  && tokSnap.turn.tokens.output === 700);
const fakeAccount = (details) => ({
  get: (name) => (name === 'deepseekAccount'
    ? { getBalance: async () => details }
    : undefined),
});
const balanceReady = createBillingBalance({
  ctx: fakeAccount({
    status: 'ready',
    value: [{ currency: 'CNY', balance: '4.0000' }],
    bonusWallets: [{ currency: 'CNY', balance: '0.3027' }],
  }),
  now: () => OFF_PEAK_AT,
});
const balance = await balanceReady.snapshot();
check('H7 账号余额：充值 + 赠送同币种相加，保留 4 位小数口径',
  balance.status === 'ok' && balance.currency === 'CNY'
  && close(balance.total, 4.3027) && close(balance.toppedUp, 4) && close(balance.granted, 0.3027));
const noService = createBillingBalance({ ctx: { get: () => undefined }, now: () => OFF_PEAK_AT });
const noServiceSnap = await noService.snapshot();
check('H8 没有账号服务（纯 Web / 未登录）⇒ unavailable，不抛错',
  noServiceSnap.status === 'unavailable' && typeof noServiceSnap.message === 'string');
const warnings2 = [];
const broken = createBillingBalance({
  ctx: { get: () => ({ getBalance: async () => { throw new Error('account boom'); } }) },
  now: () => OFF_PEAK_AT,
  log: (m) => warnings2.push(m),
});
const brokenSnap = await broken.snapshot();
check('H9 账号服务抛错 ⇒ error 且只留一行脱敏警告',
  brokenSnap.status === 'error' && warnings2.length === 1
  && warnings2[0].includes('account boom'));
const balanceRoutes = [];
const balanceDisposers = [];
registerBillingBalanceRoutes({ register (opts) { balanceRoutes.push(opts); return () => {}; } },
  { disposers: balanceDisposers, base: '/wallpaper-engine', balance: balanceReady });
const balRes = fakeRes();
await balanceRoutes[0].handler({ method: 'GET', url: '/wallpaper-engine/billing/balance' }, balRes);
let balBody;
try { balBody = JSON.parse(balRes.body); } catch { balBody = null; }
check('H10 GET /billing/balance 200 + 形状（status/currency/total）',
  balRes.statusCode === 200 && balBody && balBody.status === 'ok'
  && balBody.currency === 'CNY' && close(balBody.total, 4.3027)
  && balanceDisposers.length === 1);
const balPost = fakeRes();
await balanceRoutes[0].handler({ method: 'POST', url: '/wallpaper-engine/billing/balance' }, balPost);
check('H11 余额路由只认 GET/HEAD（POST 405）', balPost.statusCode === 405);
check('H12 客户端画了峰谷条 / 模型行 / 余额行（源码口径）',
  layerSrc.includes('function BillingPeakStrip')
  && layerSrc.includes('we-billing-peak__timeline') && layerSrc.includes('we-billing-peak__needle')
  && layerSrc.includes('we-billing-foot__models')
  && layerSrc.includes('billingBalanceEnsure')
  && extCssSrc.includes('.we-billing-peak')
  && extCssSrc.includes('.we-billing-foot__models'));
section('G. 变异体负对照（同一段判据跑在改写过的源码上）');
async function loadMutant (label, patch) {
  const source = readFileSync(join(ROOT, 'lib', 'billing.js'), 'utf8');
  const patched = patch(source);
  if (patched === source) throw new Error('变异体补丁没打上：' + label);
  mutantSeq++;
  const target = join(ISO, 'mutant-' + mutantSeq + '-' + label + '.js');
  writeFileSync(target, patched);
  return import(pathToFileURL(target).href + '?v=' + mutantSeq);
}
const peakIsDouble = (mod) => close(mod.costOf({ inputTokens: 1e6 }, 'm', PEAK_AT), 2);
const weekendIsOffPeak = (mod) => close(mod.costOf({ inputTokens: 1e6 }, 'm', SATURDAY_AT), 1);
const cacheWriteIsHit = (mod) => close(mod.costOf({ cacheWriteTokens: 1e6 }, 'm', OFF_PEAK_AT), 0.02);
check('G0 正向判据在真模块上为真（负对照的前提）',
  peakIsDouble({ costOf }) === true
  && weekendIsOffPeak({ costOf }) === true
  && cacheWriteIsHit({ costOf }) === true);
const noPeak = await loadMutant('peak-flat', (s) => s.replace('const factor = peak ? PEAK_MULTIPLIER : 1;', 'const factor = 1;'));
check('G1 负对照：去掉峰价倍率 ⇒ 峰时判据判红', peakIsDouble(noPeak) === false);
const noWeekend = await loadMutant('weekend-gone', (s) => s.replace('    if (weekday === 0 || weekday === 6) return false;\n', ''));
check('G2 负对照：删掉周末全谷价 ⇒ 周末判据判红', weekendIsOffPeak(noWeekend) === false);
const writeAsMiss = await loadMutant('cachewrite-miss', (s) => s.replace('positive(usage.cacheReadTokens) + positive(usage.cacheWriteTokens)', 'positive(usage.cacheReadTokens)'));
check('G3 负对照：缓存写改按未命中价 ⇒ 命中价判据判红', cacheWriteIsHit(writeAsMiss) === false);
section('G4. 覆盖面地板（防判据在空域上恒真）');
check('G4a 正向判据数 ≥ 55', passed >= 55, 'passed=' + passed);
check('G4b 变异体负对照数 ≥ 3', mutantSeq >= 3, 'mutants=' + mutantSeq);
check('G4c 本文件直读被测模块（guard-map 的覆盖认定靠这个路径字面量）',
  readFileSync(join(ROOT, 'lib', 'billing.js'), 'utf8').includes('export function createBilling')
  && readFileSync(join(ROOT, 'lib', 'billing-stream.js'), 'utf8').includes('export function createBillingStream')
  && readFileSync(join(ROOT, 'lib', 'routes', 'billing.js'), 'utf8').includes('export function registerBillingRoutes')
  && typeof createBilling === 'function');
console.log('');
if (failed) {
  console.log(`BILLING CHECKS FAILED — ${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`ALL BILLING CHECKS PASSED (${passed})`);
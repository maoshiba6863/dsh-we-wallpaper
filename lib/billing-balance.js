const CACHE_TTL_MS = 60000;
function sumWallets(list) {
  const totals = new Map();
  if (!Array.isArray(list)) return totals;
  for (const entry of list) {
    if (entry === null || typeof entry !== 'object') continue;
    const currency = String(entry.currency || '').toUpperCase();
    if (!['CNY', 'USD'].includes(currency)) continue;
    const amount = Number(entry.balance);
    if (!Number.isFinite(amount)) continue;
    totals.set(currency, (totals.get(currency) || 0) + amount);
  }
  return totals;
}
function pickCurrency(totals) {
  if (totals.has('CNY')) return 'CNY';
  let best = '';
  let bestAmount = -Infinity;
  for (const [currency, amount] of totals) {
    if (amount > bestAmount) { best = currency; bestAmount = amount; }
  }
  return best;
}
export function createBillingBalance({ ctx, now = Date.now, log = () => {} } = {}) {
  const clock = typeof now === 'function' ? now : Date.now;
  const warn = typeof log === 'function' ? log : () => {};
  let cache = null;
  let inflight = null;
  async function query() {
    const account = ctx && typeof ctx.get === 'function' ? ctx.get('deepseekAccount') : null;
    if (!account || typeof account.getBalance !== 'function') {
      return {
        status: 'unavailable',
        message: '宿主没有账号余额服务（未登录官方账号，或当前是纯 Web 版）',
        at: clock(),
      };
    }
    const details = await account.getBalance({
      version: '',
      locale: 'zh',
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    });
    if (!details || typeof details !== 'object' || details.status !== 'ready') {
      return { status: 'unavailable', message: '账号余额暂不可用', at: clock() };
    }
    const toppedUp = sumWallets(details.value);
    const granted = sumWallets(details.bonusWallets);
    const totals = new Map(toppedUp);
    for (const [currency, amount] of granted) totals.set(currency, (totals.get(currency) || 0) + amount);
    const currency = pickCurrency(totals);
    if (!currency) return { status: 'unavailable', message: '账号余额格式不认识', at: clock() };
    return {
      status: 'ok',
      currency,
      total: Math.round(totals.get(currency) * 1e6) / 1e6,
      toppedUp: Math.round((toppedUp.get(currency) || 0) * 1e6) / 1e6,
      granted: Math.round((granted.get(currency) || 0) * 1e6) / 1e6,
      at: clock(),
    };
  }
  async function snapshot() {
    if (cache && clock() - cache.at < CACHE_TTL_MS) return cache.payload;
    if (inflight) return inflight;
    inflight = query()
      .catch((error) => {
        const message = String((error && error.message) || error);
        warn('余额查询失败：' + message);
        return { status: 'error', message: '余额查询失败', at: clock() };
      })
      .then((payload) => {
        cache = { at: clock(), payload };
        return payload;
      })
      .finally(() => { inflight = null; });
    return inflight;
  }
  function dispose() {
    cache = null;
    inflight = null;
  }
  return { snapshot, dispose };
}
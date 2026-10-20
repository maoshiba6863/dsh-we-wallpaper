const BILLING_BALANCE_POLL_MS = 60000;

const billingBalance = { data: null, at: 0 };
let billingBalanceInflight = null;

function billingBalanceEnsure(force) {
  if (billingBalanceInflight) return billingBalanceInflight;
  if (!force && billingBalance.data && Date.now() - billingBalance.at < BILLING_BALANCE_POLL_MS) return Promise.resolve(billingBalance);
  billingBalanceInflight = apiJson("/billing/balance")
    .then((res) => {
      if (res && res.ok && res.data && typeof res.data === "object") {
        billingBalance.data = res.data;
        billingBalance.at = Date.now();
      }
      return billingBalance;
    })
    .catch(() => billingBalance)
    .finally(() => {
      billingBalanceInflight = null;
      billingNotify();
    });
  return billingBalanceInflight;
}

const BILLING_POLL_MS = 5000;

const BILLING_EMPTY = Object.freeze({ data: null, error: '', at: 0 });

const billingCache = new Map();

const billingInflight = new Map();

const billingListeners = new Set();
let billingTimer = null;

function billingEnabledNow() {
  return selection.billingEnabled !== false;
}

function billingNotify() {
  for (const fn of [...billingListeners]) {
    try { fn(); } catch {   }
  }
}

function billingPath(sessionId) {
  const id = typeof sessionId === "string" ? sessionId : "";
  return id ? "/billing?sessionId=" + encodeURIComponent(id) : "/billing";
}

function billingEnsure(sessionId) {
  const key = typeof sessionId === "string" ? sessionId : "";
  if (billingInflight.has(key)) return billingInflight.get(key);
  const cached = billingCache.get(key);

  if (cached && Date.now() - cached.at < 2000) return Promise.resolve(cached);
  const pending = apiJson(billingPath(key))
    .then((res) => {
      const previous = billingCache.get(key);
      const next = res && res.ok && res.data && typeof res.data === "object"
        ? { data: res.data, error: "", at: Date.now() }
        : { data: previous ? previous.data : null, error: hostFailureReason(res), at: Date.now() };
      billingCache.set(key, next);
      billingNotify();
      return next;
    })
    .catch((error) => {
      const previous = billingCache.get(key);
      const next = { data: previous ? previous.data : null, error: String((error && error.message) || error), at: Date.now() };
      billingCache.set(key, next);
      billingNotify();
      return next;
    })
    .finally(() => { billingInflight.delete(key); });
  billingInflight.set(key, pending);
  return pending;
}

function billingRefreshAll() {
  if (typeof document !== "undefined" && document && document.hidden) return;
  billingEnsure("");

  const keys = [...billingCache.keys()].filter((key) => key !== "").slice(0, 6);
  for (const key of keys) billingEnsure(key);

  billingBalanceEnsure(false);
}

function billingSubscribe(fn) {
  billingListeners.add(fn);
  if (billingTimer === null && typeof setInterval === "function") {
    billingTimer = setInterval(billingRefreshAll, BILLING_POLL_MS);
  }
  return () => {
    billingListeners.delete(fn);
    if (billingListeners.size === 0 && billingTimer !== null) {
      try { clearInterval(billingTimer); } catch {   }
      billingTimer = null;
    }
  };
}

function useBilling(sessionId) {
  const key = typeof sessionId === "string" ? sessionId : "";
  const entry = React.useSyncExternalStore(
    billingSubscribe,
    () => billingCache.get(key) || BILLING_EMPTY,
    () => BILLING_EMPTY,
  );
  React.useEffect(() => {

    billingEnsure(key);
  }, [key]);
  return entry;
}

function useBillingEnabled() {
  return React.useSyncExternalStore(subscribe, billingEnabledNow, () => true);
}

function billingTokens(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "k";
  return String(Math.round(n));
}

function billingTokensText(tokens) {
  if (!tokens || typeof tokens !== "object") return "";
  const cache = (Number(tokens.cacheRead) || 0) + (Number(tokens.cacheWrite) || 0);
  const parts = [];
  if (tokens.input > 0) parts.push(weT("输入 {n}", { n: billingTokens(tokens.input) }));
  if (cache > 0) parts.push(weT("缓存 {n}", { n: billingTokens(cache) }));
  if (tokens.output > 0) parts.push(weT("输出 {n}", { n: billingTokens(tokens.output) }));
  return parts.join(" · ");
}

function billingTokensTotal(tokens) {
  if (!tokens || typeof tokens !== "object") return 0;
  return (Number(tokens.input) || 0) + (Number(tokens.cacheRead) || 0)
    + (Number(tokens.cacheWrite) || 0) + (Number(tokens.output) || 0);
}

function billingMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "¥0";
  return "¥" + n.toFixed(n < 0.01 ? 4 : 2);
}

function billingBalanceMoney(value, currency) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const symbol = currency === "USD" ? "$" : "¥";
  return symbol + n.toFixed(n < 0.01 ? 4 : 2);
}

function billingClockText(atMs) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(new Date(atMs));
  } catch {
    const d = new Date(atMs + 8 * 3600 * 1000);
    return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
  }
}

function billingDuration(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  const parts = [];
  if (days > 0) parts.push(weT("{n}天", { n: days }));
  if (hours > 0) parts.push(weT("{n}小时", { n: hours }));
  if (hours > 0 || days > 0 || mins > 0) parts.push(weT("{n}分", { n: mins }));
  return parts.join("");
}

function BillingPeakStrip(props) {
  const peak = props.peak;
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    if (typeof setInterval !== "function") return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { if (typeof clearInterval === "function") clearInterval(timer); };
  }, []);
  if (!peak || !Number.isFinite(Number(peak.nextAtMs)) || !Number.isFinite(Number(peak.prevAtMs))) return null;
  const nextAt = Number(peak.nextAtMs);
  const prevAt = Number(peak.prevAtMs);
  const progress = Math.max(0, Math.min(100, ((now - prevAt) / Math.max(1, nextAt - prevAt)) * 100));
  const crossed = now >= nextAt;
  const inPeakNow = crossed ? !(peak.inPeak === true) : peak.inPeak === true;
  const phase = inPeakNow ? weT("高峰") : peak.holiday ? weT("假日 · 谷价") : peak.weekend ? weT("周末 · 谷价") : weT("平价");
  const nextPhase = inPeakNow ? weT("转平价") : weT("转高峰");
  /** 距下一次转高峰不足 60 秒：切换说明提前变红，提示马上进入高峰价。 */
  const peakSoon = !crossed && !inPeakNow && nextAt - now > 0 && nextAt - now <= 60000;
  const switchText = crossed ? weT("计价时段切换中…") : billingClockText(nextAt) + nextPhase;

  const BJ_OFFSET = 8 * 3600000;
  let segs = Array.isArray(peak.segments) && peak.segments.length ? peak.segments : null;
  let dayStart = Number(peak.dayStartMs);
  let dayEnd = Number(peak.dayEndMs);
  if (!segs) {
    const bj = new Date(now + BJ_OFFSET);
    dayStart = Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate()) - BJ_OFFSET;
    dayEnd = dayStart + 86400000;
    if (peak.weekend === true || peak.holiday === true) {
      segs = [{ startMs: dayStart, endMs: dayEnd, peak: false }];
    } else {
      const edges = [0, 9, 12, 14, 18, 24];
      segs = edges.slice(0, -1).map((hour, i) => ({
        startMs: dayStart + hour * 3600000,
        endMs: dayStart + edges[i + 1] * 3600000,
        peak: i === 1 || i === 3,
      }));
    }
  }
  const daySpan = Math.max(1, dayEnd - dayStart);
  const needlePct = Math.max(0, Math.min(100, ((now - dayStart) / daySpan) * 100));
  const bars = segs.map((seg, i) => {
    const width = Math.max(0, Math.min(100, ((Number(seg.endMs) - Number(seg.startMs)) / daySpan) * 100));
    return React.createElement("span", {
      key: "seg-" + i,
      className: "we-billing-peak__seg " + (seg.peak ? "we-billing-peak__seg--peak" : "we-billing-peak__seg--low"),
      style: { width: width + "%" },
      title: billingClockText(Number(seg.startMs)) + "–" + billingClockText(Number(seg.endMs)) + (seg.peak ? " 高峰" : " 平价"),
    });
  });
  const timeline = React.createElement("div", {
    className: "we-billing-peak__timeline",
    role: "img",
    "aria-label": weT("今日计价时段：绿色平价、红色高峰，指针为当前时刻"),
  },
    React.createElement("span", { className: "we-billing-peak__bar" }, bars),
    React.createElement("span", {
      className: "we-billing-peak__needle",
      style: { left: needlePct + "%" },
      "aria-hidden": "true",
    }),
  );

  return React.createElement("div", { className: "we-billing-peak" + (inPeakNow ? " we-billing-peak--peak" : "") },
    timeline,
    React.createElement("div", { className: "we-billing-peak__head" },
      React.createElement("span", { className: "we-billing-peak__now", title: phase }, weT("当前")),
      React.createElement("span", { className: "we-billing-peak__time" }, weT("剩余 {time}", { time: billingDuration(Math.max(0, nextAt - now)) })),
    ),
    React.createElement("div", { className: "we-billing-peak__legend" },
      React.createElement("span", { className: "we-billing-peak__key we-billing-peak__key--low" }, weT("平价")),
      React.createElement("span", { className: "we-billing-peak__key we-billing-peak__key--peak" }, weT("高峰")),
    ),
    React.createElement("div", {
      className: "we-billing-peak__meta" + (peakSoon ? " we-billing-peak__meta--soon" : ""),
    }, switchText),
  );
}

function BillingSidebarFooter() {
  const enabled = useBillingEnabled();
  const entry = useBilling("");
  const balance = React.useSyncExternalStore(
    billingSubscribe,
    () => billingBalance.data,
    () => null,
  );
  const cardRef = React.useRef(null);
  /* 侧栏计费卡 3D：A 静态浮雕（CSS 阴影/高光）＋ B 指针视差（±10°）＋ C 光斑跟随。
     每帧只改 CSS 变量，transform 走合成层；指针离开回弹，系统“减少动态效果”时整段不挂载。 */
  React.useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof window === "undefined" || typeof el.addEventListener !== "function") return undefined;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let frame = 0;
    let px = 0.5;
    let py = 0.5;
    const paint = () => {
      frame = 0;
      el.style.setProperty("--we-tilt-x", ((0.5 - py) * 20).toFixed(2) + "deg");
      el.style.setProperty("--we-tilt-y", ((px - 0.5) * 20).toFixed(2) + "deg");
      el.style.setProperty("--we-glare-x", (px * 100).toFixed(1) + "%");
      el.style.setProperty("--we-glare-y", (py * 100).toFixed(1) + "%");
    };
    const onEnter = (event) => {
      if (event.pointerType !== "mouse") return;
      el.classList.add("is-tilting");
    };
    const onMove = (event) => {
      if (event.pointerType !== "mouse") return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      px = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      py = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      if (frame) return;
      if (typeof requestAnimationFrame === "function") frame = requestAnimationFrame(paint);
      else paint();
    };
    const onLeave = () => {
      if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      frame = 0;
      el.classList.remove("is-tilting");
      el.style.setProperty("--we-tilt-x", "0deg");
      el.style.setProperty("--we-tilt-y", "0deg");
      el.style.setProperty("--we-glare-x", "50%");
      el.style.setProperty("--we-glare-y", "50%");
    };
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [enabled]);
  if (!enabled) return null;
  const data = entry && entry.data;
  const today = data ? data.today : 0;
  const session = data ? data.session : 0;
  const models = data && Array.isArray(data.models) ? data.models : [];
  const row = (key, label, value, title) => React.createElement("div", {
    className: "we-billing-foot__row",
    key,
    title,
  },
    React.createElement("span", { className: "we-billing-foot__label" }, label),
    React.createElement("span", { className: "we-billing-foot__amount" }, value),
  );

  const rows = [
    row("today", weT("今日"), "≈" + billingMoney(today)),
  ];
  if (balance && balance.status === "ok" && Number.isFinite(Number(balance.total))) {
    rows.push(row("balance", weT("余额"), billingBalanceMoney(balance.total, balance.currency),
      weT("账号余额（充值 {toppedUp} · 赠送 {granted}）", {
        toppedUp: billingBalanceMoney(balance.toppedUp, balance.currency),
        granted: billingBalanceMoney(balance.granted, balance.currency),
      })));
  }
  const nodes = rows.slice();
  if (data && data.peak) nodes.push(React.createElement(BillingPeakStrip, { key: "peak", peak: data.peak }));
  if (models.length > 0) {

    nodes.push(React.createElement("div", { className: "we-billing-foot__models", key: "models" },
      weT("{count} 模型", { count: String(models.length) })));
  }
  return React.createElement("div", {
    className: "we-billing-foot",
    ref: cardRef,
    title: weT("今日与本会话按宿主导出的 usage × 官方单价估算（含峰谷）；余额取官方账号；金额仅供参考"),
  }, ...nodes);
}

function turnTailStartSeq(props) {
  if (!props || typeof props !== "object") return NaN;
  const turn = props.turn;
  const candidates = [
    turn && turn.start && turn.start.seq,
    turn && turn.startSeq,
    turn && typeof turn.start === "number" ? turn.start : undefined,
    props.startSeq,
  ];
  for (const raw of candidates) {
    const n = Number(raw);
    if (Number.isSafeInteger(n) && n >= 0) return n;
  }
  return NaN;
}

function turnTailStartTime(props) {
  if (!props || typeof props !== "object") return NaN;
  const turn = props.turn;
  const candidates = [turn && turn.start && turn.start.time, turn && turn.startTime, props.startTime];
  for (const raw of candidates) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return NaN;
}

function turnByStartTime(turns, atMs) {
  if (!Array.isArray(turns) || !Number.isFinite(atMs)) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const row of turns) {
    const at = Number(row && row.atMs);
    if (!Number.isFinite(at)) continue;
    const diff = Math.abs(at - atMs);
    if (diff < bestDiff) { bestDiff = diff; best = row; }
  }
  return best && bestDiff <= 10 * 60 * 1000 ? best : null;
}

function turnTailEndSeq(props) {
  if (!props || typeof props !== "object") return NaN;
  const turn = props.turn;
  const candidates = [turn && turn.end && turn.end.seq, turn && turn.endSeq, props.endSeq];
  for (const raw of candidates) {
    const n = Number(raw);
    if (Number.isSafeInteger(n) && n >= 0) return n;
  }
  return NaN;
}

const billingTurnCache = new Map();

function billingTurnEnsure(sessionId, start, end) {
  const key = String(sessionId) + ":" + start + ":" + end;
  const hit = billingTurnCache.get(key);
  if (hit && Date.now() - hit.at < 15000) return hit.promise;
  const promise = apiJson("/billing/turn?sessionId=" + encodeURIComponent(sessionId)
    + "&start=" + encodeURIComponent(start) + "&end=" + encodeURIComponent(end))
    .then((res) => (res && res.ok && res.data && res.data.status === "ok" ? res.data : null))
    .catch(() => null);
  billingTurnCache.set(key, { at: Date.now(), promise });
  return promise;
}

function turnTailSessionId(props) {
  if (!props || typeof props !== "object") return "";
  if (typeof props.sessionId === "string" && props.sessionId) return props.sessionId;
  if (props.session && typeof props.session.id === "string" && props.session.id) return props.session.id;
  return "";
}

function BillingTurnTail(props) {

  try {
    return renderTurnTail(props);
  } catch (error) {
    return null;
  }
}

function renderTurnTail(props) {
  const enabled = useBillingEnabled();
  const startSeq = turnTailStartSeq(props);
  const endSeq = turnTailEndSeq(props);
  const sessionId = turnTailSessionId(props);
  const [remote, setRemote] = React.useState(null);
  React.useEffect(() => {
    if (!Number.isSafeInteger(startSeq) || !Number.isSafeInteger(endSeq) || endSeq < startSeq) return undefined;
    let alive = true;
    billingTurnEnsure(sessionId, startSeq, endSeq).then((value) => { if (alive) setRemote(value); });
    return () => { alive = false; };
  }, [sessionId, startSeq, endSeq]);
  const entry = useBilling(sessionId);

  const lastEntry = useBilling("");
  if (!enabled) {
    return null;
  }
  const own = entry && entry.data;
  const last = lastEntry && lastEntry.data;
  const snapshotData = (own && Array.isArray(own.turns) && own.turns.length ? own : null) || last || own || null;

  const data = remote || snapshotData;
  if (!data) {
    return null;
  }
  const turns = Array.isArray(data.turns) ? data.turns : [];

  const matched = remote ? null : (turns.find((item) => item && item.startSeq === startSeq)
    || turnByStartTime(turns, turnTailStartTime(props)));
  const value = remote ? remote.cost : (matched ? matched.cost : (data.turn ? data.turn.cost : null));
  if (value !== null && value !== undefined) {
    const tokens = remote ? remote.tokens
      : (matched && matched.tokens ? matched.tokens : (data.turn && data.turn.tokens ? data.turn.tokens : null));
    const detail = billingTokensText(tokens);
    const factor = Number(remote ? remote.factor : (matched && matched.factor ? matched.factor : data.turn && data.turn.factor)) === 2 ? 2 : 1;
    const prices = (remote && remote.prices) || (data.prices && typeof data.prices === "object" ? data.prices : null);
    const contextTokens = Number(data.contextTokens) > 0 ? data.contextTokens : billingTokensTotal(tokens);
    const modelName = Array.isArray(data.models) && data.models[0] && data.models[0].model
      ? String(data.models[0].model).replace(/^deepseek-account:/, "")
      : "deepseek";
    const money6 = (n) => "¥" + (Number(n) || 0).toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
    const bucketRows = [];
    if (prices && tokens) {
      const push = (label, count, rate) => {
        const n = Number(count) || 0;
        if (n <= 0 || !Number.isFinite(Number(rate))) return;
        const effective = Number(rate) * factor;
        bucketRows.push(React.createElement("div", { className: "we-billing-turn__row", key: label },
          weT("{label} {tokens} tokens × {rate} / 百万 ≈ {cost}", {
            label,
            tokens: n.toLocaleString("en-US"),
            rate: "¥" + effective.toFixed(5).replace(/0+$/, "").replace(/\.$/, ""),
            cost: money6((n * effective) / 1e6),
          })));
      };
      push(weT("输入"), tokens.input, prices.cacheMiss);
      push(weT("缓存读取"), tokens.cacheRead, prices.cacheHit);
      push(weT("缓存写入"), tokens.cacheWrite, prices.cacheHit);
      push(weT("输出"), tokens.output, prices.output);
    }

    const amount = billingMoney(value);
    let summary;
    if (contextTokens > 0 && factor === 2) {
      summary = weT("本轮费用 ≈{amount} · 上下文 {context} tokens · 高峰价", { amount, context: billingTokens(contextTokens) });
    } else if (contextTokens > 0) {
      summary = weT("本轮费用 ≈{amount} · 上下文 {context} tokens", { amount, context: billingTokens(contextTokens) });
    } else {
      summary = weT("本轮费用 ≈{amount}", { amount });
    }
    const tip = detail
      ? weT("按宿主导出的 usage × 官方单价估算（含峰谷），金额仅供参考 · {detail}", { detail })
      : weT("按宿主导出的 usage × 官方单价估算（含峰谷），金额仅供参考");

    const calls = remote && Array.isArray(remote.calls) ? remote.calls
      : (matched && Array.isArray(matched.calls) ? matched.calls : []);
    if (calls.length) {
      bucketRows.push(React.createElement("div", { className: "we-billing-turn__head", key: "calls-head" },
        weT("逐次调用明细（{count}）", { count: String(calls.length) })));
      calls.forEach((call, i) => {
        const tokensOfCall = call && call.tokens ? call.tokens : {};
        const cache = (Number(tokensOfCall.cacheRead) || 0) + (Number(tokensOfCall.cacheWrite) || 0);
        let clockText;
        try {
          clockText = new Intl.DateTimeFormat("zh-CN", {
            hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
          }).format(new Date(Number(call.atMs) || Date.now()));
        } catch { clockText = ""; }
        bucketRows.push(React.createElement("div", { className: "we-billing-turn__row", key: "call-" + i },
          weT("#{index} {time} · {model} · 输入 {input} / 缓存 {cache} / 输出 {output} ≈{cost}", {
            index: String(i + 1),
            time: clockText,
            model: String(call.model || "deepseek"),
            input: billingTokens(tokensOfCall.input),
            cache: billingTokens(cache),
            output: billingTokens(tokensOfCall.output),
            cost: money6(call.cost),
          })));
      });
    }

    const peakState = (data && data.peak) || (lastEntry && lastEntry.data && lastEntry.data.peak) || null;
    const peakNow = peakState ? peakState.inPeak === true : factor === 2;
    return React.createElement("details", {
      className: "we-billing-turn" + (peakNow ? " we-billing-turn--peak" : " we-billing-turn--low"),
      title: tip,
    },
      React.createElement("summary", null,
        React.createElement("span", { className: "we-billing-turn__summary" }, summary)),
      React.createElement("div", { className: "we-billing-turn__note" },
        weT("按已记录用量和官方单价估算；单价单位为每百万 Token。")),
      ...bucketRows,
    );
  }
  return null;
}

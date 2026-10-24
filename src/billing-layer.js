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

/* 跨天时给切换时间加星期前缀（如「周一 09:00」），避免误读成今天。 */
function billingBeijingDay(atMs) {
  const d = new Date(Number(atMs) + 8 * 3600 * 1000);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}
function billingWeekdayPrefix(atMs, nowMs) {
  if (billingBeijingDay(atMs) === billingBeijingDay(nowMs)) return "";
  try {
    return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short" }).format(new Date(atMs)) + " ";
  } catch {
    const d = new Date(Number(atMs) + 8 * 3600 * 1000);
    return "周" + "日一二三四五六"[d.getUTCDay()] + " ";
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
  const needleRef = React.useRef(null);
  const iconRef = React.useRef(null);
  const dotsRef = React.useRef(null);
  const particleTimers = React.useRef([]);
  const dotCount = React.useRef(0);
  React.useEffect(() => {
    if (typeof setInterval !== "function") return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { if (typeof clearInterval === "function") clearInterval(timer); };
  }, []);
  const needlePctRef = React.useRef(0);
  const swimmingRef = React.useRef(false);
  const segsRef = React.useRef([]);
  /* 停靠时位置跟着真实时间走；游动时由动画接管，避免两边打架。
     注意：这里只能用 ref（needlePct 在提前 return 之后才计算，依赖它会抛错）。 */
  React.useEffect(() => {
    const el = needleRef.current;
    if (!el) return;
    try {
      const track = el.parentElement;
      /* 光带始终按真实时间推进，与鲸鱼游到哪里无关。 */
      if (track) track.style.setProperty("--we-now-pct", needlePctRef.current + "%");
      if (!swimmingRef.current) el.style.left = needlePctRef.current + "%";
    } catch {   }
  }, [now]);
  React.useEffect(() => {
    const el = needleRef.current;
    if (!el || typeof el.animate !== "function" || typeof window === "undefined") return undefined;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const iconEl = iconRef.current;
    const dotsEl = dotsRef.current;
    const trackEl = el.parentElement;
    /* 游动只移动鲸鱼，不动光带（光带只跟真实时间）。 */
    const syncNow = (pct) => {
      try { el.style.left = pct + "%"; } catch {   }
    };
    let stopped = false;
    let timer = 0;
    let anim = null;
    const SLOTS = [[0, -4], [0, -2], [0, 0], [0, 2], [0, 4]];
    const clearParticles = () => {
      dotCount.current = 0;
      const list = particleTimers.current;
      for (let i = 0; i < list.length; i += 1) { try { window.clearTimeout(list[i]); } catch {   } }
      particleTimers.current = [];
      if (dotsEl) { try { dotsEl.textContent = ""; } catch {   } }
      if (trackEl) { try { trackEl.style.setProperty("--we-fill", "1"); } catch {   } }
    };
    /* 停稳后 1 / 3 / 5 三批发射：离得近的更快；到达后堆成 10px 高的竖线。 */
    const spawnParticles = () => {
      if (!dotsEl || typeof document === "undefined") return;
      const track = el.parentElement;
      const trackW = track ? track.clientWidth : 0;
      const dist = Math.max(0, (needlePctRef.current / 100) * trackW);
      /* 极端情况（00:00 附近）：没有飞行距离，直接显示竖线，避免标记消失。 */
      if (!(dist > 4)) {
        if (trackEl) { try { trackEl.style.setProperty("--we-fill", "1"); } catch {   } }
        const line = document.createElement("i");
        line.className = "we-billing-peak__line";
        dotsEl.appendChild(line);
        return;
      }
      clearParticles();
      /* 只发刚好填满竖线的那几颗，填完就停，不再撒一堆。 */
      const waves = [[0, 1], [320, 1], [640, 1], [960, 1], [1280, 1]];
      for (let w = 0; w < waves.length; w += 1) {
        const delay = waves[w][0];
        const count = waves[w][1];
        for (let k = 0; k < count; k += 1) {
          const tid = window.setTimeout(() => {
            if (stopped || swimmingRef.current || !dotsEl) return;
            const d0 = dist * (0.65 + Math.random() * 0.35);
            const speed = 60 + 120 * (1 - d0 / Math.max(1, dist));
            const duration = Math.max(600, (d0 / speed) * 1000);
            const jitter = (Math.random() - 0.5) * 6;
            const fly = document.createElement("i");
            fly.className = "we-billing-peak__particle";
            dotsEl.appendChild(fly);
            let fa = null;
            try {
              fa = fly.animate([
                { transform: "translate(" + (-d0).toFixed(1) + "px," + jitter.toFixed(1) + "px)", opacity: 0.12, filter: "brightness(0.25)" },
                { transform: "translate(0px,0px)", opacity: 1, filter: "brightness(1)" },
              ], { duration, easing: "ease-in", fill: "forwards" });
            } catch {   }
            const land = () => {
              try { if (fa) fa.cancel(); } catch {   }
              try { fly.remove(); } catch {   }
              if (!dotsEl || stopped) return;
              const slot = SLOTS[dotCount.current % SLOTS.length];
              dotCount.current += 1;
              if (trackEl) {
                try {
                  trackEl.style.setProperty("--we-fill", String(Math.min(1, dotCount.current / SLOTS.length)));
                } catch {   }
              }
              const solid = document.createElement("i");
              solid.className = "we-billing-peak__dot";
              solid.style.left = slot[0] + "px";
              solid.style.top = slot[1] + "px";
              solid.style.animationDelay = (dotCount.current * 130) + "ms";
              dotsEl.appendChild(solid);
              /* 填满后收成一条完整竖线，只保留呼吸。 */
              if (dotCount.current >= SLOTS.length) {
                try { dotsEl.textContent = ""; } catch {   }
                const line = document.createElement("i");
                line.className = "we-billing-peak__line";
                dotsEl.appendChild(line);
              }
            };
            if (fa) fa.onfinish = land; else window.setTimeout(land, duration);
          }, delay + k * 90);
          particleTimers.current.push(tid);
        }
      }
    };
    const wait = (ms) => new Promise((resolve) => {
      timer = window.setTimeout(resolve, ms);
    });
    const glide = (from, to, duration) => new Promise((resolve) => {
      if (stopped) { resolve(); return; }
      try {
        anim = el.animate([{ left: from.toFixed(2) + "%" }, { left: to.toFixed(2) + "%" }],
          { duration, easing: "linear", fill: "forwards" });
      } catch { resolve(); return; }
      anim.onfinish = () => {
        syncNow(to);
        try { anim.cancel(); } catch {   }
        anim = null;
        resolve();
      };
    });
    /* 按时间条的分段变速：红段维持 12s/整条，绿段提速一倍（6s/整条）。 */
    const isPeakAt = (pct) => {
      const list = segsRef.current;
      for (let i = 0; i < list.length; i += 1) {
        const seg = list[i];
        if (pct >= seg.a && pct <= seg.b) return seg.peak;
      }
      return false;
    };
    const glideSmart = async (from, to) => {
      const dir = to >= from ? 1 : -1;
      const cuts = [from, to];
      const list = segsRef.current;
      for (let i = 0; i < list.length; i += 1) {
        const seg = list[i];
        const bounds = [seg.a, seg.b];
        for (let j = 0; j < bounds.length; j += 1) {
          const b = bounds[j];
          if ((b - from) * dir > 0.01 && (to - b) * dir > 0.01) cuts.push(b);
        }
      }
      cuts.sort((x, y) => (dir === 1 ? x - y : y - x));
      for (let i = 0; i < cuts.length - 1; i += 1) {
        if (stopped) return;
        const a = cuts[i];
        const b = cuts[i + 1];
        const peak = isPeakAt((a + b) / 2);
        const width = Math.abs(b - a) / 100;
        const dur = Math.max(140, width * (peak ? 12000 : 6000));
        await glide(a, b, dur);
      }
    };
    const setSwimming = (on) => {
      try {
        if (on) el.dataset.weSwim = "1";
        else delete el.dataset.weSwim;
      } catch {   }
    };
    (async () => {
      let round = 1;                             // 停顿按轮递增：1→2→3→4→5 分钟后回到 1
      while (!stopped) {
        swimmingRef.current = false;             // 停靠：位置跟真实时间
        setSwimming(false);                      // 停靠：上下浮动
        spawnParticles();                        // 停稳后粒子逐批撞向鲸鱼
        await wait(Math.min(5, round) * 60000);
        round = round >= 5 ? 1 : round + 1;
        if (stopped) break;
        clearParticles();                        // 游动：清掉粒子与竖线
        swimmingRef.current = true;              // 游动：动画接管位置
        setSwimming(true);
        el.style.transform = "perspective(260px) rotateY(0deg)";
        /* 轨道的 0% / 100% 就是 00:00 / 24:00，鲸鱼到端点时允许探出轨道（卡片内有空间）。 */
        const lowPct = 0;
        const highPct = 100;
        await glideSmart(needlePctRef.current, highPct);
        await wait(400);                         // 到右端停稳
        el.style.transform = "perspective(260px) rotateY(180deg)";
        await wait(900);                         // 缓慢掉头
        await glideSmart(highPct, lowPct);
        await wait(400);                         // 到左端停稳
        el.style.transform = "perspective(260px) rotateY(0deg)";
        await wait(900);
        await glideSmart(lowPct, needlePctRef.current);   // 掉头后游回当前时间点
      }
    })();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      if (anim) { try { anim.cancel(); } catch {   } }
      clearParticles();
      try { el.style.transform = ""; } catch {   }
    };
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
  const switchText = crossed ? weT("计价时段切换中…") : billingWeekdayPrefix(nextAt, now) + billingClockText(nextAt) + nextPhase;

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
  segsRef.current = segs.map((seg) => ({
    a: ((Number(seg.startMs) - dayStart) / daySpan) * 100,
    b: ((Number(seg.endMs) - dayStart) / daySpan) * 100,
    peak: seg.peak === true,
  }));
  const needlePct = Math.max(0, Math.min(100, ((now - dayStart) / daySpan) * 100));
  needlePctRef.current = needlePct;
  const timeline = React.createElement("div", {
    className: "we-billing-peak__timeline",
    role: "img",
    "aria-label": weT("今日计价时段：00:00 至 24:00，竖条为当前时刻，绿色平价、红色高峰"),
  },
    React.createElement("span", { className: "we-billing-peak__tick" }, "00:00"),
    React.createElement("div", { className: "we-billing-peak__track" },
      React.createElement("span", { className: "we-billing-peak__band", "aria-hidden": "true" }),
      /* 竖条在轨道内部定位：left 百分比直接对应轨道宽度，0% = 00:00，100% = 24:00。 */
      /* 外层只负责位置；鲸鱼单独翻转；粒子与竖线在独立层，不随掉头镜像。 */
      React.createElement("span", {
        className: "we-billing-peak__needle",
        ref: needleRef,
        "aria-hidden": "true",
      },
        React.createElement("span", { className: "we-billing-peak__needle-icon", ref: iconRef }),
        React.createElement("span", { className: "we-billing-peak__dots", ref: dotsRef })),
    ),
    React.createElement("span", { className: "we-billing-peak__tick we-billing-peak__tick--end" }, "24:00"),
  );

  return React.createElement("div", { className: "we-billing-peak" + (inPeakNow ? " we-billing-peak--peak" : "") },
    timeline,
    React.createElement("div", { className: "we-billing-peak__head" },
      React.createElement("span", { className: "we-billing-peak__now", title: phase }, weT("当前：{phase}", { phase })),
      React.createElement("span", { className: "we-billing-peak__time" }, weT("剩余 {time}", { time: billingDuration(Math.max(0, nextAt - now)) })),
    ),
    /* 图例和「09:00 转高峰」并到同一行：左图例、右切换说明。 */
    React.createElement("div", { className: "we-billing-peak__footer" },
      React.createElement("div", { className: "we-billing-peak__legend" },
        React.createElement("span", { className: "we-billing-peak__key we-billing-peak__key--low" }, weT("平价")),
        React.createElement("span", { className: "we-billing-peak__key we-billing-peak__key--peak" }, weT("高峰")),
      ),
      React.createElement("div", {
        className: "we-billing-peak__meta" + (peakSoon ? " we-billing-peak__meta--soon" : ""),
      }, switchText),
    ),
  );
}

/* 今日 AI 资讯：每 10 分钟拉一次，横向滚动。 */
function AiNewsRow() {
  const [items, setItems] = React.useState([]);
  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const json = await apiJson("/ai-news");
        if (alive && Array.isArray(json.items)) setItems(json.items.slice(0, 12));
      } catch {   }
    };
    load();
    const timer = setInterval(load, 10 * 60 * 1000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  const list = items.length ? items.concat(items) : [];
  return React.createElement("div", { className: "we-billing-foot__news", title: weT("今日 AI 资讯（来源：Hacker News，每 10 分钟刷新）") },
    React.createElement("span", { className: "we-billing-foot__news-label" }, weT("今日 AI")),
    React.createElement("div", { className: "we-billing-foot__news-view" },
      items.length
        ? React.createElement("div", { className: "we-billing-foot__news-track" },
          list.map((it, i) => React.createElement("span", { className: "we-billing-foot__news-item", key: "news-" + i }, it && it.title ? it.title : "")))
        : React.createElement("span", { className: "we-billing-foot__news-item" }, weT("正在获取今日 AI 资讯…")),
    ),
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
    /* 触边翻转：指针把卡片压到 ±10°（左/右 = rotateY、上/下 = rotateX）时翻 180°，
       停 1 秒再转正；连续 3 次触发改成转 3 圈（1080°）后复原。 */
    let edgeLatched = false;
    let chain = 0;
    let chainAt = 0;
    let flipBusy = false;
    let flipAnim = null;
    const compose = (rx, ry) => "perspective(720px) rotateX(" + rx + "deg) rotateY(" + ry + "deg)";
    const triggerFlip = (axis, dir) => {
      if (flipBusy || typeof el.animate !== "function") return;
      const tx = Number(((0.5 - py) * 20).toFixed(2));
      const ty = Number(((px - 0.5) * 20).toFixed(2));
      const now = Date.now();
      chain = now - chainAt < 5000 ? chain + 1 : 1;
      chainAt = now;
      const triple = chain >= 3;
      if (triple) chain = 0;
      const delta = dir * (triple ? 1080 : 180);
      const endX = axis === "x" ? tx + delta : tx;
      const endY = axis === "y" ? ty + delta : ty;
      const from = compose(tx, ty);
      const to = compose(endX, endY);
      flipBusy = true;
      edgeLatched = true;
      const frames = triple
        ? [
          { transform: from, offset: 0 },
          { transform: to, offset: 0.82 },
          { transform: from, offset: 1 },
        ]
        : [
          { transform: from, offset: 0 },
          { transform: to, offset: 0.22 },
          { transform: to, offset: 0.78 },
          { transform: from, offset: 1 },
        ];
      try {
        flipAnim = el.animate(frames, {
          duration: 1800,
          easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
          fill: "forwards",
        });
      } catch { flipBusy = false; return; }
      flipAnim.onfinish = () => {
        try { flipAnim.cancel(); } catch {   }
        flipAnim = null;
        flipBusy = false;
      };
    };
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
      if (flipBusy) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      px = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      py = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      const tx = (0.5 - py) * 20;
      const ty = (px - 0.5) * 20;
      const ax = Math.abs(tx);
      const ay = Math.abs(ty);
      if (!edgeLatched && (ax >= 9.5 || ay >= 9.5)) {
        if (ay >= ax) triggerFlip("y", ty >= 0 ? 1 : -1);
        else triggerFlip("x", tx >= 0 ? 1 : -1);
      } else if (edgeLatched && ax < 5 && ay < 5) {
        edgeLatched = false;
      }
      if (frame) return;
      if (typeof requestAnimationFrame === "function") frame = requestAnimationFrame(paint);
      else paint();
    };
    const onLeave = () => {
      if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      frame = 0;
      edgeLatched = false;
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
      if (flipAnim) { try { flipAnim.cancel(); } catch {   } flipAnim = null; }
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
  /* 「今日 AI」滚动条：数据来自 /wallpaper-engine/ai-news（服务端拉取并缓存）。 */
  nodes.push(React.createElement(AiNewsRow, { key: "ai-news" }));
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

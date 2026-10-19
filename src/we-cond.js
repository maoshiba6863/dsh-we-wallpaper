const WE_COND_OPS = ["===", "!==", "&&", "||", "==", "!=", ">=", "<=", ">", "<", "!", "(", ")", ".", "-"];
const weCondCache = new Map();
function weCondTokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new Error("unterminated string");
      out.push({ k: "str", v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ k: "num", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
      out.push({ k: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    const op = WE_COND_OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new Error("bad char " + c);
    out.push({ k: "op", v: op });
    i += op.length;
  }
  return out;
}
function weCondLooseEq(a, b) {
  if (a === b) return true;
  if (a === undefined || a === null || b === undefined || b === null) {
    return (a === undefined || a === null) && (b === undefined || b === null);
  }
  if (typeof a === typeof b) return false;
  const na = Number(a);
  const nb = Number(b);
  return !Number.isNaN(na) && !Number.isNaN(nb) && na === nb;
}
function weCondNumCmp(a, b, op) {
  const x = Number(a);
  const y = Number(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return false;
  if (op === ">") return x > y;
  if (op === "<") return x < y;
  if (op === ">=") return x >= y;
  return x <= y;
}
function weCondParse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (v) => {
    const t = peek();
    if (!t || t.k !== "op" || t.v !== v) throw new Error("expect " + v);
    pos++;
  };
  function or() {
    let left = and();
    while (peek() && peek().k === "op" && peek().v === "||") {
      pos++;
      const right = and();
      const l = left;
      left = (v) => Boolean(l(v)) || Boolean(right(v));
    }
    return left;
  }
  function and() {
    let left = cmp();
    while (peek() && peek().k === "op" && peek().v === "&&") {
      pos++;
      const right = cmp();
      const l = left;
      left = (v) => Boolean(l(v)) && Boolean(right(v));
    }
    return left;
  }
  function cmp() {
    const left = unary();
    const t = peek();
    if (t && t.k === "op" && ["==", "!=", "===", "!==", ">", "<", ">=", "<="].includes(t.v)) {
      pos++;
      const right = unary();
      const op = t.v;
      if (op === "==" || op === "===") return (v) => weCondLooseEq(left(v), right(v));
      if (op === "!=" || op === "!==") return (v) => !weCondLooseEq(left(v), right(v));
      return (v) => weCondNumCmp(left(v), right(v), op);
    }
    return left;
  }
  function unary() {
    const t = peek();
    if (t && t.k === "op" && t.v === "!") { pos++; const inner = unary(); return (v) => !inner(v); }
    if (t && t.k === "op" && t.v === "-") { pos++; const inner = unary(); return (v) => -Number(inner(v)); }
    return primary();
  }
  function primary() {
    const t = peek();
    if (!t) throw new Error("unexpected end");
    if (t.k === "op" && t.v === "(") { pos++; const inner = or(); eat(")"); return inner; }
    if (t.k === "num") { pos++; const n = Number(t.v); if (Number.isNaN(n)) throw new Error("bad num"); return () => n; }
    if (t.k === "str") { pos++; const s = t.v; return () => s; }
    if (t.k === "id") {
      pos++;
      if (t.v === "true") return () => true;
      if (t.v === "false") return () => false;
      const name = t.v;
      if (peek() && peek().k === "op" && peek().v === ".") {
        pos++;
        const m = peek();
        if (!m || m.k !== "id" || m.v !== "value") throw new Error("only .value");
        pos++;
      }
      return (v) => v[name];
    }
    throw new Error("unexpected token");
  }
  const root = or();
  if (pos !== tokens.length) throw new Error("trailing tokens");
  return root;
}
function weEvalCondition(expr, values) {
  if (!expr || !String(expr).trim()) return true;
  let fn = weCondCache.get(expr);
  if (fn === undefined) {
    try {
      const node = weCondParse(weCondTokenize(String(expr)));
      fn = (v) => Boolean(node(v));
    } catch {
      fn = null;
    }
    weCondCache.set(expr, fn);
  }
  if (!fn) return true;
  try {
    return fn(values);
  } catch {
    return true;
  }
}
export { weEvalCondition, weCondTokenize, weCondParse };
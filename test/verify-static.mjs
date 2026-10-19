import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BASELINE = join(ROOT, 'test/fixtures/static-baseline.json');
const TOOLS = {
  lint: { tool: 'eslint', entry: 'node_modules/eslint/bin/eslint.js' },
  typecheck: { tool: 'tsc', entry: 'node_modules/typescript/bin/tsc' },
};
function toolInvocation(pkg, key) {
  const spec = TOOLS[key];
  const cmd = String((pkg.scripts || {})[key] || '').trim();
  const m = /^(\S+)(?:\s+([\s\S]*))?$/.exec(cmd);
  if (!m || m[1] !== spec.tool) {
    return { error: '`' + key + '` 脚本为 ' + JSON.stringify(cmd) + '，期望以 `' + spec.tool + ' ` 开头' };
  }
  const entry = join(ROOT, spec.entry);
  if (!existsSync(entry)) return { missing: entry };
  return { entry, args: m[2] ? m[2].split(/\s+/).filter(Boolean) : [] };
}
function runTool(inv) {
  try {
    return { out: execFileSync(process.execPath, [inv.entry, ...inv.args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) };
  } catch (err) {
    if (err && typeof err.stdout === 'string' && err.stdout.trim()) return { out: err.stdout };
    return { err: String((err && err.message) || err) };
  }
}
function summarizeEslint(json) {
  const reports = JSON.parse(json);
  const byRule = {};
  let fatal = 0;
  for (const f of reports) {
    for (const m of f.messages) {
      if (m.fatal) { fatal++; continue; }
      byRule[m.ruleId || 'unknown'] = (byRule[m.ruleId || 'unknown'] || 0) + 1;
    }
  }
  return { filesLinted: reports.length, byRule, fatal };
}
function summarizeTsc(text) {
  const byCode = {};
  for (const m of text.matchAll(/error (TS\d+)/g)) byCode[m[1]] = (byCode[m[1]] || 0) + 1;
  return { byCode };
}
function overBudget(base, cur) {
  const over = [];
  for (const [k, v] of Object.entries(cur)) {
    const b = Object.prototype.hasOwnProperty.call(base, k) ? base[k] : 0;
    if (v > b) over.push(k + ' ' + v + ' > ' + b);
  }
  return over;
}
function improvements(base, cur) {
  const down = [];
  for (const [k, b] of Object.entries(base)) {
    const v = Object.prototype.hasOwnProperty.call(cur, k) ? cur[k] : 0;
    if (v < b) down.push(k + ' ' + b + ' → ' + v);
  }
  return down;
}
function main() {
  const writeBaseline = process.argv.includes('--write-baseline');
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const eslintInv = toolInvocation(pkg, 'lint');
  const tscInv = toolInvocation(pkg, 'typecheck');
  if (eslintInv.error || tscInv.error) {
    check('脚本与门禁同一入口：`lint` / `typecheck` 仍是 eslint / tsc', false, eslintInv.error || tscInv.error);
    console.log('\n1 CHECK(S) FAILED');
    process.exit(1);
  }
  if (eslintInv.missing || tscInv.missing) {
    console.log('SKIP | 静态门禁未运行：devDependencies 未安装（' + (eslintInv.missing || tscInv.missing) + '）');
    console.log('SKIP | 这不是通过 —— 跑 `npm ci` 后重试（CI 会装全量 devDependencies）');
    console.log('\nSTATIC GATE SKIPPED (tools missing)');
    process.exit(0);
  }
  const eslintRun = runTool({ ...eslintInv, args: [...eslintInv.args, '-f', 'json'] });
  if (eslintRun.err) { check('ESLint 跑得起来并产出 JSON', false, eslintRun.err); console.log('\n1 CHECK(S) FAILED'); process.exit(1); }
  let lint;
  try { lint = summarizeEslint(eslintRun.out); } catch (err) {
    check('ESLint JSON 可解析', false, String((err && err.message) || err)); console.log('\n1 CHECK(S) FAILED'); process.exit(1);
  }
  const tscRun = runTool(tscInv);
  if (tscRun.err) { check('tsc 跑得起来', false, tscRun.err); console.log('\n1 CHECK(S) FAILED'); process.exit(1); }
  const types = summarizeTsc(tscRun.out);
  if (writeBaseline) {
    const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
    const payload = {
      eslint: { filesLinted: lint.filesLinted, byRule: sorted(lint.byRule) },
      tsc: { byCode: sorted(types.byCode) },
    };
    writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + '\n');
    console.log('已写入 test/fixtures/static-baseline.json：ESLint ' + Object.keys(payload.eslint.byRule).length
      + ' 规则 / ' + payload.eslint.filesLinted + ' 文件 · tsc ' + Object.keys(payload.tsc.byCode).length + ' 错误码');
    process.exit(0);
  }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  check('ESLint 无致命解析错误（有解析错误的文件等于没被门禁看见）', lint.fatal === 0,
    lint.fatal === 0 ? '0 条' : lint.fatal + ' 条 fatal');
  const overRules = overBudget(base.eslint.byRule, lint.byRule);
  check('ESLint 每条规则的违规数都不超过基线', overRules.length === 0,
    overRules.length ? '超限=[' + overRules.join(' · ') + ']' : Object.keys(lint.byRule).length + ' 规则，全部 ≤ 基线');
  const overCodes = overBudget(base.tsc.byCode, types.byCode);
  check('tsc 每个错误码的条数都不超过基线', overCodes.length === 0,
    overCodes.length ? '超限=[' + overCodes.join(' · ') + ']' : Object.keys(types.byCode).length + ' 错误码，全部 ≤ 基线');
  check('ESLint 确实扫到了文件（判据不为空集）', lint.filesLinted > 0, lint.filesLinted + ' file(s)');
  check('ESLint 的扫描面不低于基线（禁止用 ignores 缩小被检查的文件集）',
    lint.filesLinted >= base.eslint.filesLinted,
    lint.filesLinted + ' / ' + base.eslint.filesLinted);
  check('负对照：计数超限 / 新出现的规则名 / 扫描面缩小 都必须被判红',
    overBudget({ a: 1 }, { a: 2 }).length === 1
    && overBudget({ a: 1 }, { a: 1 }).length === 0
    && overBudget({ a: 1 }, { a: 1, brand_new_rule: 1 }).length === 1
    && overBudget({ a: 3 }, { a: 1 }).length === 0);
  const downRules = improvements(base.eslint.byRule, lint.byRule);
  const downCodes = improvements(base.tsc.byCode, types.byCode);
  if (downRules.length || downCodes.length) {
    console.log('NOTE | 已有改善但基线未收紧（跑 `node test/verify-static.mjs --write-baseline` 冻住它）：');
    for (const d of [...downRules, ...downCodes]) console.log('       ' + d);
  }
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (failed.length === 0 ? 'ALL STATIC GATE CHECKS PASSED' : failed.length + ' CHECK(S) FAILED'));
  process.exit(failed.length === 0 ? 0 : 1);
}
main();
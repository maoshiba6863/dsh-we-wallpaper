import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CANDIDATE_DIRS = [join(ROOT, 'test')];
const READ_FACE_DIRS = [join(ROOT, 'test'), join(ROOT, 'lib'), join(ROOT, 'src'), join(ROOT, 'scripts')];
const SKIP_DIR = /(?:^|[\\/])(?:node_modules|\.git|\.test-cache|docs|types)(?:[\\/]|$)/;
const CODE_EXT = /\.(?:mjs|cjs|js|jsx|ts|tsx)$/;
const SHOW_ALL = process.argv.includes('--all');
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (SKIP_DIR.test(p)) continue;
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && CODE_EXT.test(e.name)) out.push(p);
  }
  return out;
}
function keyName(node) {
  if (node.key.type === 'Identifier') return node.key.name;
  if (node.key.type === 'Literal' && typeof node.key.value === 'string') return node.key.value;
  return null;
}
function declNames(node, out) {
  if (!node) return;
  if (node.type === 'VariableDeclaration') for (const d of node.declarations) collectPattern(d.id, out);
  else if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') { if (node.id) out.add(node.id.name); }
}
function collectPattern(node, out) {
  if (!node) return;
  if (node.type === 'Identifier') out.add(node.name);
  else if (node.type === 'ObjectPattern') for (const p of node.properties) collectPattern(p.value || p.argument, out);
  else if (node.type === 'ArrayPattern') for (const el of node.elements) collectPattern(el, out);
  else if (node.type === 'AssignmentPattern') collectPattern(node.left, out);
  else if (node.type === 'RestElement') collectPattern(node.argument, out);
}
function isDeclarationId(node) {
  const p = node.parent;
  if (!p) return true;
  if (p.type === 'VariableDeclarator') return p.id === node;
  if (p.type === 'FunctionDeclaration' || p.type === 'FunctionExpression' || p.type === 'ArrowFunctionExpression') {
    return p.id === node || p.params.includes(node);
  }
  if (p.type === 'ClassDeclaration' || p.type === 'ClassExpression') return p.id === node;
  if (p.type === 'ImportSpecifier' || p.type === 'ImportDefaultSpecifier' || p.type === 'ImportNamespaceSpecifier') return true;
  if (p.type === 'CatchClause') return p.param === node;
  if (p.type === 'RestElement' || p.type === 'AssignmentPattern') return isDeclarationId(p);
  return false;
}
function makeRule(out) {
  return {
    create(ctx) {
      const sc = ctx.sourceCode;
      return {
        Identifier(node) {
          const p = node.parent;
          if (!p) return;
          if (p.type === 'MemberExpression' && p.property === node && !p.computed) return;
          if (p.type === 'Property' && p.key === node) return;
          if (p.type === 'MemberExpression' && p.property === node && p.computed) { out.bare.add(node.name); return; }
          if (isDeclarationId(node)) return;
          if (p.type === 'Property' && p.shorthand && p.value === node) out.bare.add(node.name);
          else out.bare.add(node.name);
        },
        MemberExpression(node) {
          if (!node.computed && node.property.type === 'Identifier') out.member.add(node.property.name);
          if (node.computed && node.property.type === 'Literal' && typeof node.property.value === 'string') out.member.add(node.property.value);
        },
        Property(node) {
          const name = keyName(node);
          if (!name) return;
          if (node.parent.type === 'ObjectExpression' && !node.computed) {
            out.props.push({ name, line: node.loc.start.line, dyn: dynamicReason(node.parent, ctx.sourceCode) });
          } else if (node.parent.type === 'ObjectPattern' && !node.computed) {
            out.patKey.add(name);
          }
        },
        BinaryExpression(node) {
          if (node.operator === 'in' && node.left.type === 'Literal' && typeof node.left.value === 'string') out.inKey.add(node.left.value);
        },
        ExportNamedDeclaration(node) {
          for (const s of node.specifiers) out.exported.add(s.local.name);
          declNames(node.declaration, out.exported);
        },
        'Program:exit'() {
          const { scopeManager } = sc;
          if (!scopeManager) return;
          for (const scope of scopeManager.scopes) {
            for (const v of scope.variables) {
              if (out.exported.has(v.name)) continue;
              if (v.defs.some((d) => d.type === 'ImportBinding')) continue;
              const refs = v.references;
              if (!refs.length || refs.some((r) => r.isRead()) || !refs.some((r) => r.isWrite())) continue;
              const def = v.defs[0];
              if (!def || def.type === 'Parameter' || def.type === 'CatchClause') continue;
              out.writeOnly.push({
                name: v.name,
                line: def.name && def.name.loc ? def.name.loc.start.line : 0,
                kind: def.type,
                writes: refs.filter((r) => r.isWrite()).map((r) => r.identifier.loc.start.line),
              });
            }
          }
        },
      };
    },
  };
}
function parseFile(linter, code) {
  const out = { bare: new Set(), member: new Set(), patKey: new Set(), inKey: new Set(), props: [], writeOnly: [], exported: new Set(), parsed: false, crash: null };
  const rule = { rules: { collect: makeRule(out) } };
  for (const sourceType of ['module', 'commonjs']) {
    const config = [{ plugins: { audit: rule }, rules: { 'audit/collect': 'error' }, languageOptions: { ecmaVersion: 'latest', sourceType } }];
    let messages;
    try { messages = linter.verify(code, config); } catch (e) { out.crash = (e && e.message) || String(e); return out; }
    if (messages.some((m) => m.fatal)) continue;
    out.parsed = true;
    return out;
  }
  return out;
}
const GLOBAL_ROOTS = new Set(['globalThis', 'window', 'global', 'self']);
const GLOBAL_CONTAINERS = new Set(['process', 'globalThis']);
const WHOLE_OBJECT_CALLEES = new Set(['Object.keys', 'Object.values', 'Object.entries', 'Object.fromEntries',
  'Object.assign', 'Object.freeze', 'Object.getOwnPropertyNames', 'JSON.stringify',
  'assert.deepEqual', 'assert.deepStrictEqual']);
function calleeName(callee) {
  if (!callee) return '';
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && !callee.computed && callee.object.type === 'Identifier'
    && callee.property.type === 'Identifier') return callee.object.name + '.' + callee.property.name;
  return '';
}
function isFunctionValue(node) {
  return node && (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression');
}
function isHandlerMap(obj) {
  if (obj.type !== 'ObjectExpression' || !obj.properties.length) return false;
  if (!obj.properties.every((p) => p.type === 'Property' && !p.computed)) return false;
  if (!obj.properties.some((p) => isFunctionValue(p.value))) return false;
  return obj.properties.every((p) => isFunctionValue(p.value) || p.value.type === 'Identifier' || p.value.type === 'Literal');
}
function refsByName(sourceCode, name) {
  const out = [];
  const manager = sourceCode.scopeManager;
  if (!manager) return out;
  for (const scope of manager.scopes) {
    for (const v of scope.variables) {
      if (v.name !== name) continue;
      for (const ref of v.references) out.push(ref.identifier);
    }
  }
  return out;
}
function isGlobalTarget(left) {
  if (!left || left.type !== 'MemberExpression') return false;
  const obj = left.object;
  if (obj.type === 'Identifier') return GLOBAL_ROOTS.has(obj.name);
  if (obj.type === 'MemberExpression' && !obj.computed && obj.object.type === 'Identifier'
    && obj.property.type === 'Identifier') return GLOBAL_CONTAINERS.has(obj.object.name);
  return false;
}
function followVariable(name, sourceCode, seen, depth) {
  if (depth > 2) return null;
  for (const id of refsByName(sourceCode, name)) {
    const p = id.parent;
    if (!p) continue;
    if ((p.type === 'CallExpression' || p.type === 'NewExpression') && p.callee === id) {
      const r = consumptionReason(p, sourceCode, seen, depth);
      if (r) return r;
      continue;
    }
    if (p.type === 'ForOfStatement' && p.right === id) return 'array-collection';
    const r = consumptionReason(id, sourceCode, seen, depth);
    if (r) return r;
  }
  return null;
}
function consumptionReason(node, sourceCode, seen, depth) {
  let cur = node;
  for (let hop = 0; cur && hop < 5; hop += 1) {
    if (seen.has(cur)) return null;
    seen.add(cur);
    const p = cur.parent;
    if (!p) return null;
    if (p.type === 'ConditionalExpression' && (p.consequent === cur || p.alternate === cur)) { cur = p; continue; }
    if (p.type === 'LogicalExpression' && (p.left === cur || p.right === cur)) { cur = p; continue; }
    if (p.type === 'SequenceExpression') { cur = p; continue; }
    if (p.type === 'Property' && p.value === cur) { cur = p.parent; continue; }
    if (p.type === 'ArrayExpression') { cur = p; continue; }
    if (p.type === 'CallExpression' || p.type === 'NewExpression') {
      if (!p.arguments.includes(cur)) return null;
      return WHOLE_OBJECT_CALLEES.has(calleeName(p.callee)) ? 'whole-object-call' : 'call-arg';
    }
    if (p.type === 'SpreadElement') return 'spread';
    if (p.type === 'MemberExpression' && p.object === cur && p.computed) return 'computed-key-member';
    if (p.type === 'VariableDeclarator' && p.init === cur && p.id.type === 'Identifier') {
      return depth >= 2 ? null : followVariable(p.id.name, sourceCode, seen, depth + 1);
    }
    if (p.type === 'AssignmentExpression' && p.right === cur && p.left.type === 'Identifier') {
      return depth >= 2 ? null : followVariable(p.left.name, sourceCode, seen, depth + 1);
    }
    return null;
  }
  return null;
}
function returnedReason(node, sourceCode, seen, root) {
  for (let fn = node.parent; fn; fn = fn.parent) {
    if (fn.type === 'FunctionDeclaration' || fn.type === 'FunctionExpression' || fn.type === 'ArrowFunctionExpression') {
      const name = functionName(fn);
      if (!name) break;
      for (const id of refsByName(sourceCode, name)) {
        const p = id.parent;
        if (!p) continue;
        if ((p.type === 'CallExpression' || p.type === 'NewExpression') && p.callee === id) {
          const r = consumptionReason(p, sourceCode, seen, 1);
          if (r) return r;
        }
      }
      break;
    }
  }
  return isHandlerMap(root || node) ? 'handler-map' : null;
}
function functionName(fn) {
  if (fn.id && fn.id.name) return fn.id.name;
  const p = fn.parent;
  if (!p) return null;
  if (p.type === 'VariableDeclarator' && p.init === fn && p.id.type === 'Identifier') return p.id.name;
  if (p.type === 'Property' && p.value === fn && p.key.type === 'Identifier') return p.key.name;
  if (p.type === 'AssignmentExpression' && p.right === fn && p.left.type === 'Identifier') return p.left.name;
  return null;
}
function dynamicReason(node, sourceCode, seen = new Set()) {
  const root = node;
  let cur = node;
  for (let hop = 0; cur && hop < 8; hop += 1) {
    if (seen.has(cur)) return null;
    seen.add(cur);
    const p = cur.parent;
    if (!p) return null;
    if (p.type === 'Property' && p.value === cur) { cur = p.parent; continue; }
    if (p.type === 'SpreadElement') return 'spread';
    if (p.type === 'ConditionalExpression' && (p.consequent === cur || p.alternate === cur)) { cur = p; continue; }
    if (p.type === 'LogicalExpression' && (p.left === cur || p.right === cur)) { cur = p; continue; }
    if (p.type === 'SequenceExpression') { cur = p; continue; }
    if (p.type === 'ArrayExpression') {
      const ap = p.parent;
      const handedOver = ap && (ap.type === 'CallExpression' || ap.type === 'NewExpression' || ap.type === 'ForOfStatement'
        || (ap.type === 'MemberExpression' && ap.parent
          && (ap.parent.type === 'CallExpression' || ap.parent.type === 'NewExpression')));
      if (handedOver) return 'array-collection';
      cur = p; continue;
    }
    if (p.type === 'ObjectExpression') { cur = p; continue; }
    if (p.type === 'CallExpression' || p.type === 'NewExpression') {
      if (p.arguments.includes(cur)) {
        return WHOLE_OBJECT_CALLEES.has(calleeName(p.callee)) ? 'whole-object-call' : 'call-arg';
      }
      cur = p; continue;
    }
    if (p.type === 'ReturnStatement' || (p.type === 'ArrowFunctionExpression' && p.body === cur)) {
      return returnedReason(cur, sourceCode, seen, root);
    }
    if (p.type === 'AssignmentExpression' && p.right === cur) {
      if (p.left.type === 'MemberExpression') return isGlobalTarget(p.left) ? 'global-assign' : null;
      if (p.left.type === 'Identifier') {
        return followVariable(p.left.name, sourceCode, seen, 1) || (isHandlerMap(root) ? 'handler-map' : null);
      }
      return null;
    }
    if (p.type === 'VariableDeclarator' && p.init === cur && p.id.type === 'Identifier') {
      return followVariable(p.id.name, sourceCode, seen, 1) || (isHandlerMap(root) ? 'handler-map' : null);
    }
    if (p.type === 'MemberExpression' && p.object === cur && p.computed) return 'computed-key-member';
    return null;
  }
  return null;
}
const linter = new Linter();
const candidates = [];
const reads = { bare: new Set(), member: new Set(), patKey: new Set(), inKey: new Set() };
const perFile = new Map();
const unparsed = [];
const crashed = [];
for (const dir of READ_FACE_DIRS) {
  for (const file of walk(dir)) {
    if (perFile.has(file)) continue;
    const info = parseFile(linter, readFileSync(file, 'utf8'));
    if (info.crash) { crashed.push(relative(ROOT, file) + ' :: ' + info.crash); continue; }
    if (!info.parsed) { unparsed.push(relative(ROOT, file)); continue; }
    perFile.set(file, info);
    for (const k of Object.keys(reads)) for (const n of info[k]) reads[k].add(n);
    if (CANDIDATE_DIRS.some((d) => file.startsWith(d + sep))) {
      for (const w of info.writeOnly) candidates.push({ file, ...w });
      for (const p of info.props) candidates.push({ file, name: p.name, line: p.line, dyn: p.dyn, prop: true });
    }
  }
}
const isRead = (name) => reads.bare.has(name) || reads.member.has(name) || reads.patKey.has(name) || reads.inKey.has(name);
const vars = candidates.filter((c) => !c.prop);
const props = candidates.filter((c) => c.prop && !isRead(c.name));
const propsNonDynamic = props.filter((p) => !p.dyn);
const dyn = props.filter((p) => p.dyn);
console.log('write-only state audit（只读；候选须人工判，本工具不判红）');
console.log(`扫描面：候选 ${CANDIDATE_DIRS.length} 个目录 / 读面 ${perFile.size} 个文件${unparsed.length ? ` / 解析失败 ${unparsed.length}（${unparsed.slice(0, 3).join(', ')}）` : ''}${crashed.length ? ` / ⚠ 规则抛错 ${crashed.length}（读面有洞，须先修工具）` : ''}`);
for (const c of crashed) console.log('  ⚠ ' + c);
console.log(`\n【A】只被写、从不被读的局部变量（${vars.length}）`);
for (const v of vars) console.log(`  ${relative(ROOT, v.file)}:${v.line}  ${v.kind} ${v.name}  (writes@${v.writes.join(',')})`);
console.log(`\n【B1】对象字段只声明不被读、且所在对象非动态消费（${propsNonDynamic.length}）`);
for (const p of propsNonDynamic) console.log(`  ${relative(ROOT, p.file)}:${p.line}  ${p.name}`);
const reasonTally = new Map();
for (const p of dyn) reasonTally.set(p.dyn, (reasonTally.get(p.dyn) || 0) + 1);
console.log(`\n【B2】对象字段只声明不被读，但所在对象被整体消费（${dyn.length}${SHOW_ALL ? '，下面列出' : '，默认不列'}）`);
console.log('  按边界分类：' + [...reasonTally].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' · '));
if (SHOW_ALL) for (const p of dyn) console.log(`  ${relative(ROOT, p.file)}:${p.line}  ${p.name}  ← ${p.dyn}`);
else console.log('  （多数是 assert.deepEqual 期望值 / spawn 参数 / 桩字段 —— 需人工判，--all 查看）');
console.log(`\n合计候选：A ${vars.length} + B1 ${propsNonDynamic.length} + B2 ${dyn.length} = ${vars.length + propsNonDynamic.length + dyn.length}`);
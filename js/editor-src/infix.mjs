import { parser } from './beluga-parser.js';
import { developmentForFile } from './semantic/development.mjs';

const APP_SPINE = new Set(['LFAppTerm', 'LFAppType', 'AppExpression']);
const ATOMIC_WRAP = new Set([
  'LFAtomicTerm', 'LFAtomicType', 'AtomicExpression', 'CompTypeArg',
]);
const ASSOC_KW = new Set(['NoneKeyword', 'LeftKeyword', 'RightKeyword']);
const STOP_EXPR = new Set([
  'LFConstructor', 'LFDeclaration', 'CaseBranch', 'Pattern', 'RecBody',
  'LetDeclaration', 'ProofDeclaration', 'FnExpression', 'MLamExpression',
  'LFLambda', 'ContextualObject', 'ContextualType',
]);

const _textPragmaCache = new Map();
const _stateCache = new WeakMap();
const TEXT_CACHE_CAP = 48;

function slice(doc, from, to) {
  return doc.sliceString(from, to);
}

function assocOf(node) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LeftKeyword') return 'left';
    if (c.name === 'RightKeyword') return 'right';
    if (c.name === 'NoneKeyword') return 'none';
    if (c.name === 'Associativity') {
      for (let g = c.firstChild; g; g = g.nextSibling) {
        if (g.name === 'LeftKeyword') return 'left';
        if (g.name === 'RightKeyword') return 'right';
        if (g.name === 'NoneKeyword') return 'none';
      }
    }
  }
  return 'none';
}

function parseInfixPragma(node, doc, defaultAssoc) {
  let op = null;
  let prec = 0;
  let assoc = defaultAssoc;
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LowerIdentifier') op = slice(doc, c.from, c.to);
    else if (c.name === 'Number') prec = parseInt(slice(doc, c.from, c.to), 10) || 0;
    else if (c.name === 'Associativity') assoc = assocOf(c);
    else if (ASSOC_KW.has(c.name)) {
      assoc = c.name === 'LeftKeyword' ? 'left' : c.name === 'RightKeyword' ? 'right' : 'none';
    }
  }
  if (!op) return null;
  return { op, precedence: prec, associativity: assoc };
}

function applyPragmaEvents(events, ops, defaultAssocRef) {
  for (const ev of events) {
    if (ev.kind === 'assoc') defaultAssocRef.value = ev.assoc;
    else if (ev.kind === 'infix') {
      ops.set(ev.op, { precedence: ev.precedence, associativity: ev.associativity });
    }
  }
}

function collectPragmaEvents(tree, doc, beforePos) {
  const events = [];
  let defaultAssoc = 'none';
  tree.iterate({
    enter(ref) {
      if (beforePos != null && ref.from >= beforePos) return false;
      if (ref.name === 'AssocPragma') {
        defaultAssoc = assocOf(ref.node);
        events.push({ kind: 'assoc', assoc: defaultAssoc, from: ref.from });
      } else if (ref.name === 'InfixPragma') {
        const p = parseInfixPragma(ref.node, doc, defaultAssoc);
        if (p) events.push({ kind: 'infix', ...p, from: ref.from });
      }
    },
  });
  return events;
}

function pragmasFromText(text) {
  const hit = _textPragmaCache.get(text);
  if (hit) return hit;
  let events = [];
  try {
    const doc = { sliceString: (f, t) => text.slice(f, t) };
    events = collectPragmaEvents(parser.parse(text), doc, null);
  } catch (_) {
    events = [];
  }
  if (_textPragmaCache.size >= TEXT_CACHE_CAP) _textPragmaCache.clear();
  _textPragmaCache.set(text, events);
  return events;
}

function preludePragmaEvents() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.Persist;
  if (!P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function') {
    return [];
  }
  try {
    const files = P.listFiles();
    const activeId = P.getActiveFileId();
    const dev = developmentForFile(files, activeId, (id) => P.getFileText(id));
    const out = [];
    for (const path of dev.preludePaths) {
      const f = files.find((x) => x.name === path);
      if (f) out.push(...pragmasFromText(String(P.getFileText(f.id) ?? '')));
    }
    return out;
  } catch (_) {
    return [];
  }
}

export function buildInfixState(tree, doc, pos) {
  const key = pos;
  let perTree = _stateCache.get(tree);
  if (perTree && perTree.has(key)) return perTree.get(key);

  const ops = new Map();
  const defaultAssocRef = { value: 'none' };
  applyPragmaEvents(preludePragmaEvents(), ops, defaultAssocRef);
  applyPragmaEvents(collectPragmaEvents(tree, doc, pos), ops, defaultAssocRef);

  const state = { ops, defaultAssoc: defaultAssocRef.value };
  if (!perTree) { perTree = new Map(); _stateCache.set(tree, perTree); }
  perTree.set(key, state);
  return state;
}

function hasNestedApp(app, family) {
  const fam = typeof family === 'string' ? family : null;
  for (let c = app.firstChild; c; c = c.nextSibling) {
    if (fam ? c.name === fam : family.has(c.name)) return true;
  }
  return false;
}

function firstIdentIn(node) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LowerIdentifier' || c.name === 'UpperIdentifier') return c;
  }
  return null;
}

function isParenAtom(node) {
  if (!ATOMIC_WRAP.has(node.name)) return false;
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === '(') return true;
  }
  return false;
}

function innerExprOfParen(atom) {
  for (let c = atom.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LFTerm' || c.name === 'LFType' || c.name === 'Expression') return c;
    if (c.name === 'TupleOrParenExpression') {
      for (let g = c.firstChild; g; g = g.nextSibling) {
        if (g.name === 'Expression') return g;
      }
    }
  }
  return null;
}

function atomFromNode(node, doc, state) {
  if (node.name === 'LowerIdentifier' || node.name === 'UpperIdentifier') {
    return {
      from: node.from,
      to: node.to,
      name: slice(doc, node.from, node.to),
      ident: node,
    };
  }
  const inner = isParenAtom(node) ? innerExprOfParen(node) : null;
  if (inner) {
    const sub = parseAppExpr(inner, doc, state);
    return { from: node.from, to: node.to, sub };
  }
  const id = firstIdentIn(node);
  return {
    from: node.from,
    to: node.to,
    name: id ? slice(doc, id.from, id.to) : null,
    ident: id,
  };
}

function flattenJuxtapositional(root, family) {
  const out = [];
  function spine(n) {
    let nested = null;
    let right = null;
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.name === family) nested = c;
      else right = c;
    }
    if (nested && hasNestedApp(n, family)) {
      spine(nested);
      if (right) out.push(right);
    } else if (right) {
      out.push(right);
    } else {
      out.push(n);
    }
  }
  if (root.name === family) spine(root);
  else out.push(root);
  return out;
}

function isInfixOp(atom, state) {
  return !!(atom.name && state.ops.has(atom.name));
}

function containsIdent(ast, from, to) {
  if (!ast) return false;
  if (ast.kind === 'atom') return ast.from <= from && ast.to >= to;
  if (ast.kind === 'prefix') return containsIdent(ast.head, from, to) || containsIdent(ast.arg, from, to);
  if (ast.kind === 'infix') {
    return containsIdent(ast.left, from, to) || containsIdent(ast.right, from, to);
  }
  return false;
}

function parseInfixFlat(atoms, doc, state) {
  let i = 0;

  function spanOf(a, b) {
    return { from: Math.min(a.from, b.from), to: Math.max(a.to, b.to) };
  }

  function parseAtom() {
    if (i >= atoms.length) return { kind: 'atom', from: 0, to: 0, name: null };
    const raw = atoms[i++];
    if (raw.sub) return raw.sub;
    return { kind: 'atom', from: raw.from, to: raw.to, name: raw.name };
  }

  function parsePrefixExpr() {
    let left = parseAtom();
    while (i < atoms.length && !isInfixOp(atoms[i], state)) {
      const arg = parseAtom();
      const sp = spanOf(left, arg);
      left = { kind: 'prefix', head: left, arg, from: sp.from, to: sp.to };
    }
    return left;
  }

  function parseExpr(minPrec) {
    let left = parsePrefixExpr();
    while (i < atoms.length && isInfixOp(atoms[i], state)) {
      const opAtom = atoms[i];
      const info = state.ops.get(opAtom.name);
      if (!info || info.precedence < minPrec) break;
      i += 1;
      let right;
      if (info.associativity === 'right') {
        right = parseExpr(info.precedence);
      } else if (info.associativity === 'left') {
        right = parseExpr(info.precedence + 1);
      } else {
        right = parsePrefixExpr();
      }
      const sp = spanOf(left, right);
      left = { kind: 'infix', op: opAtom.name, left, right, from: sp.from, to: sp.to };
    }
    return left;
  }

  if (!atoms.length) return null;
  return parseExpr(0);
}

function appFamilyOf(node) {
  if (node.name === 'LFAppTerm') return 'LFAppTerm';
  if (node.name === 'LFAppType') return 'LFAppType';
  if (node.name === 'AppExpression') return 'AppExpression';
  if (node.name === 'LFTerm') {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.name === 'LFAppTerm') return 'LFAppTerm';
    }
  }
  if (node.name === 'LFType') {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.name === 'LFAppType') return 'LFAppType';
    }
  }
  return null;
}

function isPureAppRoot(node) {
  const fam = appFamilyOf(node);
  if (!fam) return false;
  if (node.name === 'LFTerm' || node.name === 'LFType' || node.name === 'AppExpression') return true;
  return APP_SPINE.has(node.name);
}

function infixExprRoot(ident) {
  let best = null;
  for (let p = ident.parent; p; p = p.parent) {
    if (STOP_EXPR.has(p.name)) break;
    if (isPureAppRoot(p)) best = p;
    else if (best) break;
  }
  return best;
}

function parseAppExpr(root, doc, state) {
  const fam = appFamilyOf(root);
  if (!fam) return null;
  let spineRoot = root;
  if (root.name === 'LFTerm' || root.name === 'LFType') {
    for (let c = root.firstChild; c; c = c.nextSibling) {
      if (c.name === fam) { spineRoot = c; break; }
    }
  }
  const chunks = flattenJuxtapositional(spineRoot, fam);
  const atoms = chunks.map((n) => {
    const wrap = ATOMIC_WRAP.has(n.name) ? n : n;
    return atomFromNode(wrap, doc, state);
  });
  if (!atoms.some((a) => isInfixOp(a, state))) return null;
  return parseInfixFlat(atoms, doc, state);
}

function slotInAst(ast, from, to) {
  if (!ast) return null;
  if (ast.kind === 'infix') {
    if (containsIdent(ast.left, from, to)) {
      return { headName: ast.op, argIndex: 0, arg: ast.left, from: ast.left.from, to: ast.left.to };
    }
    if (containsIdent(ast.right, from, to)) {
      return { headName: ast.op, argIndex: 1, arg: ast.right, from: ast.right.from, to: ast.right.to };
    }
    const deep = slotInAst(ast.left, from, to) || slotInAst(ast.right, from, to);
    if (deep) return deep;
    return null;
  }
  if (ast.kind === 'prefix') {
    return slotInAst(ast.head, from, to) || slotInAst(ast.arg, from, to);
  }
  return null;
}

export function infixSlotForIdent(tree, doc, ident, state) {
  if (!state || !state.ops.size) return null;
  const root = infixExprRoot(ident);
  if (!root) return null;
  const ast = parseAppExpr(root, doc, state);
  if (!ast) return null;
  return slotInAst(ast, ident.from, ident.to);
}

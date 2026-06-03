// Hover resolution for Beluga identifiers.
//
// Beluga's typeinfo store only records granular annotations for LF *terms*
// (Lam/Tuple/Root); LF *type* sub-expressions get no annotation. As a result,
// `%:get-type LINE COL` at any identifier inside a constructor body returns
// the wrapping declaration's Sgn annotation (the whole constructor type),
// not the identifier's own type/kind.
//
// To fix this without modifying the OCaml engine, we resolve the hovered
// identifier on the JS side via the Lezer tree, then either:
//   - query Beluga at the *declaring* identifier's position (which always
//     has a Sgn/Comp annotation matching the declared type/kind), or
//   - synthesize the answer from local binder syntax for in-scope variables.

import { syntaxTree } from '@codemirror/language';
import { walkTree } from './bel-walk.mjs';

const IDENT = new Set(['LowerIdentifier', 'UpperIdentifier']);

// Named nodes that represent a type/kind RHS sitting next to a binder.
const TYPE_RHS = new Set([
  'LFType', 'LFKind', 'CompType', 'CompKind',
  'ContextualType', 'LFBlock',
]);

// Top-level (global) declarations whose first identifier child names the
// declared entity. Beluga records a Sgn (or, for theorems, Comp) annotation
// at these positions, so `%:get-type` at the identifier returns the
// correct kind/type for LF declarations and LF datatype headers.
const GLOBAL_DECL_PARENT = new Set([
  'LFDeclaration',           // `foo : K.` / `foo : T.`
  'LFDatatypeDeclaration',   // `LF foo : K = | ...;`  (header id)
  'LFConstructor',           // `ctor : T`             (datatype body)
  'SchemaDeclaration',       // `schema s = ...;`
  'TypedefDeclaration',      // `typedef ... ;`
  'LetDeclaration',          // `let x = ... ;`
  'ModuleDeclaration',       // `module M = struct ... end;`
  'InductiveBody',           // `inductive T : K = ...`
  'CompConstructor',         // `C : T`
  'RecBody',                 // `f : T = ...`
]);

// Local binders whose RHS type is the binder's own next type-like sibling.
const LOCAL_BINDER_INLINE_TYPE = new Set([
  'CompTypeBinder',          // `{A : T}` or `(A : T)`
  'LFBlockField',            // `x : A`
  'ContextEntry',            // `x : A`
  'SchemaSomeBindings',      // `x : A, y : B, ...`
]);

// Local binders whose RHS type lives one level up (in the enclosing LFKind /
// LFType, after the closing `}`). PiBinder itself is a bare identifier; the
// `{ ... : T }` shell is anonymous tokens in its parent.
const LOCAL_BINDER_OUTER_TYPE = new Set([
  'PiBinder',
]);

// Local binders that introduce a name with no syntactic type annotation.
const LOCAL_BINDER_BARE = new Set([
  'LFLambdaBinder',
  'FnParam',
  'MLamParam',
  'ContextHat',
  'ContextHead',
  'ContextTailEntry',
]);

function firstIdentChild(node) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (IDENT.has(c.name)) return c;
  }
  return null;
}

// Short title-case labels used in the tooltip head ("LF Constant", "Pi
// Binder", etc.). null = no header for this resolution.

const LOCAL_BINDER_LABEL = {
  PiBinder:           'Pi Binder',
  CompTypeBinder:     'Meta Binder',
  LFBlockField:       'Block Field',
  ContextEntry:       'Context Variable',
  ContextHead:        'Context Variable',
  ContextTailEntry:   'Context Variable',
  ContextHat:         'Context Variable',
  LFLambdaBinder:     'Lambda Binder',
  FnParam:            'Parameter',
  MLamParam:          'Meta Parameter',
  SchemaSomeBindings: 'Schema Binder',
};

function globalLabel(declParent) {
  const n = declParent.name;
  if (n === 'LFDeclaration') {
    // Distinguish kind-RHS (type family) from type-RHS (constant).
    for (let c = declParent.firstChild; c; c = c.nextSibling) {
      if (c.name === 'LFKind') return 'LF Type Family';
      if (c.name === 'LFType') return 'LF Constant';
    }
    return 'LF Declaration';
  }
  if (n === 'LFDatatypeDeclaration')   return 'LF Type Family';
  if (n === 'LFConstructor')           return 'LF Constructor';
  if (n === 'InductiveBody')           return 'Inductive Type';
  if (n === 'CompConstructor')         return 'Constructor';
  if (n === 'RecBody')                 return 'Recursive Function';
  if (n === 'TypedefDeclaration')      return 'Type Alias';
  if (n === 'SchemaDeclaration')       return 'Schema';
  if (n === 'LetDeclaration')          return 'Let Binding';
  if (n === 'ModuleDeclaration')       return 'Module';
  return null;
}

function localLabel(binderParent) {
  return LOCAL_BINDER_LABEL[binderParent.name] || 'Local Binding';
}

function nextTypeSibling(node) {
  for (let s = node.nextSibling; s; s = s.nextSibling) {
    if (TYPE_RHS.has(s.name)) return s;
  }
  return null;
}

function identAt(tree, pos) {
  let n = tree.resolveInner(pos, 1);
  if (n && IDENT.has(n.name)) return n;
  // Tagged parameter/substitution variables: hovering at the `#` or `$`
  // lands on a punctuation token whose next sibling is the identifier.
  if (n && (n.name === '#' || n.name === '$')) {
    const sib = n.nextSibling;
    if (sib && IDENT.has(sib.name)) return sib;
  }
  n = tree.resolveInner(pos, -1);
  if (n && IDENT.has(n.name)) return n;
  if (n && (n.name === '#' || n.name === '$')) {
    const sib = n.nextSibling;
    if (sib && IDENT.has(sib.name)) return sib;
  }
  return null;
}

// Compute the source-visible name including any `#`/`$` prefix.  Used for
// tooltip display so hovering `#p` shows `#p`, not just `p`.  Look-up
// keys elsewhere still use the bare identifier text — defMap and binder
// frames index by short name.
function extendedNameOf(ident, doc) {
  const p = ident.parent;
  if (!p) return doc.sliceString(ident.from, ident.to);
  // Direct parent is the tag wrapper.
  if (p.name === 'ParameterVariable' || p.name === 'SubstitutionVariable') {
    const h = p.firstChild;
    if (h && (h.name === '#' || h.name === '$')) {
      return doc.sliceString(h.from, ident.to);
    }
  }
  // Tagged binders (MLamParam, CompTypeBinder) — ident is the second
  // child after a `#`/`$` token.
  if (p.name === 'MLamParam' || p.name === 'CompTypeBinder') {
    const first = p.firstChild;
    if (first && (first.name === '#' || first.name === '$') && first.nextSibling === ident) {
      return doc.sliceString(first.from, ident.to);
    }
  }
  return doc.sliceString(ident.from, ident.to);
}

// (1-indexed line, 0-indexed col) for a doc offset — matches what Beluga's
// `type_of_position` expects: it computes column as
// `start_offset - start_bol` (0-indexed), and lines are 1-indexed via lexing.
function lineColAt(doc, pos) {
  const line = doc.lineAt(pos);
  return { line: line.number, col: pos - line.from };
}

// Slice the binder's surrounding source, widening to nearby `{`/`(` and
// matching closer, so the user sees `{A : o}` rather than just `A : o`.
function widenToBracket(doc, from, to) {
  const text = doc.toString();
  let s = from;
  while (s > 0) {
    const ch = text.charAt(s - 1);
    if (ch === '{' || ch === '(') { s -= 1; break; }
    if (!/\s/.test(ch)) break;
    s -= 1;
  }
  let e = to;
  while (e < text.length) {
    const ch = text.charAt(e);
    if (ch === '}' || ch === ')') { e += 1; break; }
    if (!/\s/.test(ch)) break;
    e += 1;
  }
  return text.slice(s, e).replace(/\s+/g, ' ').trim();
}

function sliceText(doc, from, to) {
  return doc.sliceString(from, to).replace(/\s+/g, ' ').trim();
}

// Explicit signatures are syntax-local facts. Even when Beluga cannot
// currently reconstruct a richer type for a position (because a dependency is
// broken, or because that AST node has no backend annotation), the Lezer tree
// can still provide the declaration's written `: ...` type/kind instantly.
function sourceSignatureForGlobal(declParent, ident, doc) {
  if (!declParent || !ident) return null;
  const dname = declParent.name;
  if (dname === 'ModuleDeclaration' || dname === 'SchemaDeclaration') return null;
  if (dname === 'LetDeclaration') return null;

  const ty = nextTypeSibling(ident);
  if (!ty) return null;
  const text = sliceText(doc, ty.from, ty.to);
  return text || null;
}

// Walk up from `ident` until we find an ancestor that introduces a binding
// for `name`. Returns { text, binderKind } or null. `text` is the binder's
// annotated type, or '' for bare-name binders without a syntactic type.
function findEnclosingLocalBinder(ident, doc, name) {
  for (let p = ident.parent; p; p = p.parent) {
    const matched = scanFrameForName(p, doc, name);
    if (matched) return matched;
  }
  return null;
}

function hit(text, binderKind) { return { text, binderKind }; }

// Within a single ancestor node, look for binders that scope over the
// caller's identifier. Returns { text, binderKind } or null.
function scanFrameForName(frame, doc, name) {
  const fname = frame.name;

  // `{ PiBinder : LFType } LFKind/LFType` — the PiBinder sits as a named
  // sibling of LFType inside the parent LFKind / LFType.
  if (fname === 'LFKind' || fname === 'LFType') {
    const pi = firstChildNamed(frame, 'PiBinder');
    if (pi) {
      const id = firstIdentChild(pi);
      if (id && doc.sliceString(id.from, id.to) === name) {
        const ty = nextTypeSibling(pi);
        if (ty) return hit(sliceText(doc, ty.from, ty.to), 'PiBinder');
      }
    }
  }

  // `{ CompTypeBinder } CompType/CompKind` (also the `( ... )` variant).
  if (fname === 'CompType' || fname === 'CompKind') {
    const ctb = firstChildNamed(frame, 'CompTypeBinder');
    if (ctb) {
      const id = firstIdentChild(ctb);
      if (id && doc.sliceString(id.from, id.to) === name) {
        const ty = nextTypeSibling(id);
        if (ty) return hit(sliceText(doc, ty.from, ty.to), 'CompTypeBinder');
      }
    }
  }

  // `case ... of` branches quantify implicit binders before the pattern.
  if (fname === 'CaseBranch') {
    for (let c = frame.firstChild; c; c = c.nextSibling) {
      if (c.name !== 'QuantifiedBinder') continue;
      const ctb = firstChildNamed(c, 'CompTypeBinder');
      if (!ctb) continue;
      const id = firstIdentChild(ctb);
      if (id && doc.sliceString(id.from, id.to) === name) {
        const ty = nextTypeSibling(id);
        if (ty) return hit(sliceText(doc, ty.from, ty.to), 'CompTypeBinder');
      }
    }
  }

  // `λx. M` — bare-name lambda binder, no syntactic type.
  if (fname === 'LFLambda') {
    const binder = firstChildNamed(frame, 'LFLambdaBinder');
    if (binder) {
      const id = firstIdentChild(binder);
      if (id && doc.sliceString(id.from, id.to) === name) return hit('', 'LFLambdaBinder');
    }
  }

  // `fn x, y => ...` / `mlam X, Y => ...` — bare-name binders.
  if (fname === 'FnExpression' || fname === 'MLamExpression') {
    const childKind = fname === 'FnExpression' ? 'FnParam' : 'MLamParam';
    for (let c = frame.firstChild; c; c = c.nextSibling) {
      if (c.name !== childKind) continue;
      const id = firstIdentChild(c);
      if (id && doc.sliceString(id.from, id.to) === name) return hit('', childKind);
    }
  }

  // Schema `some [x : A, y : B] block ...` binds x, y over the block.
  if (fname === 'SchemaElement') {
    const some = firstChildNamed(frame, 'SchemaSomeBlock');
    if (some) {
      const wrap = firstChildNamed(some, 'SchemaSomeBindings');
      if (wrap) {
        for (let c = wrap.firstChild; c; c = c.nextSibling) {
          if (c.name !== 'LowerIdentifier') continue;
          if (doc.sliceString(c.from, c.to) !== name) continue;
          const ty = nextTypeSibling(c);
          if (ty) return hit(sliceText(doc, ty.from, ty.to), 'SchemaSomeBindings');
        }
      }
    }
  }

  // `[ x : A, y : B |- ... ]` — context-quantified scope. Each ContextEntry
  // names a binder with an explicit LFType.
  if (fname === 'ContextualType' || fname === 'ContextualObject') {
    const part = firstChildNamed(frame, 'ContextPart');
    if (part) {
      const found = scanContextPartForName(part, doc, name);
      if (found) return found;
    }
  }

  // `block (x : A, y : B)` inside a schema — fields are local bindings
  // within sibling LFType nodes of the same block.
  if (fname === 'LFBlock') {
    for (let c = frame.firstChild; c; c = c.nextSibling) {
      if (c.name !== 'LFBlockField') continue;
      const id = firstIdentChild(c);
      if (id && doc.sliceString(id.from, id.to) === name) {
        const ty = nextTypeSibling(id);
        if (ty) return hit(sliceText(doc, ty.from, ty.to), 'LFBlockField');
      }
    }
  }

  return null;
}

function scanContextPartForName(part, doc, name) {
  const stack = [part];
  while (stack.length) {
    const node = stack.pop();
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.name === 'ContextEntry' || c.name === 'LFBlockField') {
        const id = firstIdentChild(c);
        if (id && doc.sliceString(id.from, id.to) === name) {
          const ty = nextTypeSibling(id);
          if (ty) return hit(sliceText(doc, ty.from, ty.to), c.name);
        }
      }
      stack.push(c);
    }
  }
  return null;
}

function firstChildNamed(node, name) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === name) return c;
  }
  return null;
}

// Name → [{ident, declParent, isUpper}, ...] map comes from the unified
// walker (bel-walk.mjs). The walker memoizes per Lezer tree, so every
// hover hits an O(1) lookup; a fresh tree (user edited) rebuilds.
function findGlobalDeclarationIdent(tree, doc, name, isUpper) {
  const entries = walkTree(tree, doc).defMap.get(name);
  if (!entries) return null;
  for (const e of entries) {
    if (e.isUpper === isUpper) return { ident: e.ident, declParent: e.declParent };
  }
  return null;
}

const TYPE_APP = new Set(['LFAppType', 'CompAppType']);
const TERM_APP = new Set(['LFAppTerm']);

function typeAppArgChild(app) {
  let arg = null;
  for (let c = app.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LFAtomicTerm' || c.name === 'CompTypeArg') arg = c;
  }
  return arg;
}

function termAppArgChild(app) {
  let arg = null;
  for (let c = app.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LFAtomicTerm') arg = c;
  }
  return arg;
}

function headIdentOfTypeApp(app) {
  let node = app.firstChild;
  while (node && TYPE_APP.has(node.name)) node = node.firstChild;
  if (!node) return null;
  return firstIdentChild(node);
}

function headIdentOfTermApp(app) {
  let node = app.firstChild;
  while (node && TERM_APP.has(node.name)) node = node.firstChild;
  if (!node) return null;
  return firstIdentChild(node);
}

function innermostTypeAppForIdent(ident) {
  let app = null;
  for (let p = ident.parent; p; p = p.parent) {
    if (!TYPE_APP.has(p.name)) continue;
    const arg = typeAppArgChild(p);
    if (arg && ident.from >= arg.from && ident.to <= arg.to) app = p;
  }
  return app;
}

function innermostTermAppForIdent(ident) {
  let app = null;
  for (let p = ident.parent; p; p = p.parent) {
    if (!TERM_APP.has(p.name)) continue;
    const arg = termAppArgChild(p);
    if (!arg || ident.from < arg.from || ident.to > arg.to) continue;
    app = p;
  }
  return app;
}

function isHeadOnlyTypeApp(app) {
  return TYPE_APP.has(app.name) && !typeAppArgChild(app);
}

function isHeadOnlyTermApp(app) {
  return TERM_APP.has(app.name) && !termAppArgChild(app);
}

function argIndexInTypeApp(ident) {
  const app = innermostTypeAppForIdent(ident);
  if (!app) return null;

  let index = 0;
  let node = app.firstChild;
  while (node) {
    if (!TYPE_APP.has(node.name)) break;
    if (!isHeadOnlyTypeApp(node)) index += 1;
    node = node.firstChild;
  }
  return index;
}

function argIndexInTermApp(ident) {
  const app = innermostTermAppForIdent(ident);
  if (!app) return null;

  let index = 0;
  let node = app.firstChild;
  while (node) {
    if (!TERM_APP.has(node.name)) break;
    if (!isHeadOnlyTermApp(node)) index += 1;
    node = node.firstChild;
  }
  return index;
}

function splitArrowType(typeStr) {
  const s = typeStr.trim();
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{' || ch === '(' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      if (s[i] === '→') {
        return { domain: s.slice(0, i).trim(), codomain: s.slice(i + 1).trim() };
      }
      if (s.startsWith('->', i)) {
        return { domain: s.slice(0, i).trim(), codomain: s.slice(i + 2).trim() };
      }
      if (s.startsWith('<-', i)) {
        return { domain: s.slice(i + 2).trim(), codomain: s.slice(0, i).trim() };
      }
    }
  }
  return null;
}

function unwrapParens(typeStr) {
  const s = typeStr.trim();
  if (!s.startsWith('(')) return s;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth += 1;
    else if (s[i] === ')') {
      depth -= 1;
      if (depth === 0) {
        if (i === s.length - 1) return s.slice(1, -1).trim();
        break;
      }
    }
  }
  return s;
}

// Peel one parameter from a curried LF/computation signature. Handles:
//   `{x:tm m/q A} neu x → T`   (Beluga dependent function types, userguide §Functions)
//   `(Ψ:nctx) T -> U`         (implicit computation binders in rec signatures)
//   `tm K A → T` / `->` / `→` (plain arrows)
function splitParameterType(typeStr) {
  const s = typeStr.trim();
  if (!s.length) return null;

  if (s[0] === '{') {
    let depth = 0;
    let i = 0;
    for (; i < s.length; i++) {
      if (s[i] === '{') depth += 1;
      else if (s[i] === '}') {
        depth -= 1;
        if (depth === 0) { i += 1; break; }
      }
    }
    const rest = s.slice(i).trim();
    const arrow = splitArrowType(rest);
    if (!arrow) return null;
    return {
      domain: `${s.slice(0, i).trim()} ${arrow.domain}`.trim(),
      codomain: arrow.codomain,
    };
  }

  if (s[0] === '(') {
    let depth = 0;
    let i = 0;
    for (; i < s.length; i++) {
      if (s[i] === '(') depth += 1;
      else if (s[i] === ')') {
        depth -= 1;
        if (depth === 0) { i += 1; break; }
      }
    }
    let rest = s.slice(i).trim();
    if (rest.startsWith('->')) rest = rest.slice(2).trim();
    else if (rest.startsWith('→')) rest = rest.slice(1).trim();
    else if (rest.startsWith('<-')) rest = rest.slice(2).trim();
    if (!rest.length) return splitParameterType(s.slice(1, i - 1).trim());
    return { domain: s.slice(0, i).trim(), codomain: rest };
  }

  return splitArrowType(s);
}

function domainAtArrowIndex(typeStr, index) {
  let cur = unwrapParens(typeStr.trim());
  for (let i = 0; i < index; i++) {
    const split = splitParameterType(cur);
    if (!split) return null;
    cur = unwrapParens(split.codomain);
  }
  const split = splitParameterType(cur);
  return split ? split.domain : cur;
}

function peelDependentArrows(typeStr, count) {
  let cur = unwrapParens(typeStr.trim());
  for (let i = 0; i < count; i++) {
    if (cur.startsWith('↦')) return cur;
    const split = splitParameterType(cur);
    if (!split) break;
    cur = unwrapParens(split.codomain);
    if (cur.startsWith('↦')) return cur;
  }
  return cur || null;
}

function stripContextualWrapper(typeStr) {
  const s = typeStr.trim();
  if (!s.startsWith('[') || !s.endsWith(']')) return s;
  const inner = s.slice(1, -1).trim();
  const turn = inner.search(/[|⊢\-]/);
  if (turn < 0) return inner;
  const after = inner.slice(turn + 1).replace(/^[\s|⊢\-]+/, '').trim();
  return after || inner;
}

function patternAnnotationType(ident, doc) {
  for (let p = ident.parent; p; p = p.parent) {
    if (p.name !== 'CaseBranch') continue;
    let patternNode = null;
    let annType = null;
    for (let c = p.firstChild; c; c = c.nextSibling) {
      if (c.name !== 'Pattern') continue;
      patternNode = c;
      let pastColon = false;
      for (let pc = c.firstChild; pc; pc = pc.nextSibling) {
        if (pc.name === ':') { pastColon = true; continue; }
        if (pastColon && (pc.name === 'CompType' || pc.name === 'ContextualType' || pc.name === 'LFType')) {
          annType = pc;
        }
      }
    }
    if (!patternNode || !annType) continue;
    if (ident.from < patternNode.from || ident.to > patternNode.to) continue;
    // Must be in the object term, not the context prefix (Ψ, etc.)
    let inObjectTerm = false;
    for (let q = ident.parent; q && q.from >= patternNode.from && q.to <= patternNode.to; q = q.parent) {
      if (q.name === 'ContextPart' || q.name === 'ContextHead') break;
      if (q.name === 'LFTerm' || q.name === 'ContextualObject') { inObjectTerm = true; break; }
    }
    if (!inObjectTerm) continue;
    return stripContextualWrapper(sliceText(doc, annType.from, annType.to));
  }
  return null;
}

function lambdaDepthInSpan(span, ident) {
  let depth = 0;
  for (let p = ident.parent; p && p.from >= span.from && p.to <= span.to; p = p.parent) {
    if (p.name !== 'LFLambda') continue;
    const binder = p.firstChild;
    const body = binder && binder.nextSibling;
    if (body && ident.from >= body.from && ident.to <= body.to) depth += 1;
  }
  return depth;
}

// Leading `(name : T)` / `{name : T}` binders in a declaration signature.
function implicitBinderInTypePrefix(typeStr, name) {
  let rest = typeStr.trim();
  while (rest.length) {
    const open = rest[0];
    if (open !== '(' && open !== '{') break;
    const close = open === '(' ? ')' : '}';
    let i = 1;
    while (i < rest.length && /\s/.test(rest[i])) i += 1;
    const nameStart = i;
    while (i < rest.length && rest[i] !== ':' && rest[i] !== close) i += 1;
    const binderName = rest.slice(nameStart, i).trim();
    if (!binderName || rest[i] !== ':') break;
    i += 1;
    while (i < rest.length && /\s/.test(rest[i])) i += 1;
    const typeStart = i;
    let depth = 1;
    while (i < rest.length && depth > 0) {
      const ch = rest[i];
      if (ch === open) depth += 1;
      else if (ch === close) depth -= 1;
      i += 1;
    }
    if (depth !== 0) break;
    const binderType = rest.slice(typeStart, i - 1).trim();
    if (binderName === name) return binderType;
    rest = rest.slice(i).trim();
  }
  return null;
}

function implicitTypeFromDeclSignature(tree, doc, ident) {
  const encl = findEnclosingGlobalDecl(ident);
  if (!encl) return null;
  const enclIdent = firstIdentChild(encl);
  if (!enclIdent || enclIdent === ident) return null;
  const sig = sourceSignatureForGlobal(encl, enclIdent, doc);
  if (!sig) return null;
  const name = doc.sliceString(ident.from, ident.to);
  return implicitBinderInTypePrefix(sig, name);
}

function inferImplicitFromTypeApp(tree, doc, ident) {
  const app = innermostTypeAppForIdent(ident);
  if (!app) return null;
  const argIndex = argIndexInTypeApp(ident);
  if (argIndex == null) return null;

  const head = headIdentOfTypeApp(app);
  if (!head) return null;
  const headName = doc.sliceString(head.from, head.to);
  const decl = findGlobalDeclarationIdent(tree, doc, headName, head.name === 'UpperIdentifier');
  if (!decl) return null;

  const sig = sourceSignatureForGlobal(decl.declParent, decl.ident, doc);
  if (!sig) return null;

  return domainAtArrowIndex(sig, argIndex) || null;
}

function inferImplicitFromTermApp(tree, doc, ident) {
  const app = innermostTermAppForIdent(ident);
  if (!app) return null;
  const argIndex = argIndexInTermApp(ident);
  if (argIndex == null) return null;

  const head = headIdentOfTermApp(app);
  if (!head) return null;
  const headName = doc.sliceString(head.from, head.to);
  const headDecl = findGlobalDeclarationIdent(tree, doc, headName, head.name === 'UpperIdentifier');
  if (!headDecl) return null;

  const sig = sourceSignatureForGlobal(headDecl.declParent, headDecl.ident, doc);
  if (!sig) return null;

  const domain = domainAtArrowIndex(sig, argIndex);
  if (!domain) return null;

  const arg = termAppArgChild(app);
  const depth = arg ? lambdaDepthInSpan(arg, ident) : 0;
  return depth > 0 ? peelDependentArrows(domain, depth) : domain;
}

// Infer an implicit binder's type from its syntactic position — no Beluga.
//
// Beluga implicit arguments (userguide §LF, §Functions; all.bel throughout):
//   1. LF index metas (K, A, P, Q) in type/kind apps — domain of the head
//   2. LF term constructor args (stepP'Q', stepPP', …) — domain of the LF
//      constructor at arg index, minus enclosing `\x.` lambdas
//   3. Case-pattern `: Type` annotations on contextual patterns
//   4. Leading `(name : T)` / `(Ψ:nctx)` in rec/mlam signatures
function inferImplicitArgType(tree, doc, ident) {
  return inferImplicitFromTypeApp(tree, doc, ident)
    || inferImplicitFromTermApp(tree, doc, ident)
    || patternAnnotationType(ident, doc)
    || implicitTypeFromDeclSignature(tree, doc, ident);
}

// True when `term` (an LFTerm node) is a single bare identifier — i.e. not an
// application `f x` — so an enclosing `(term : T)` ascription types exactly it.
function lfTermIsBareIdent(termNode) {
  let app = null;
  for (let c = termNode.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LFAppTerm') app = c;
  }
  if (!app) return false;
  for (let c = app.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LFAppTerm') return false;  // nested application → compound
  }
  return true;
}

// `( TERM : TYPE )` ascription. When the hovered identifier IS the bare ascribed
// term (e.g. `stepPW` in `(stepPW : ↦ (P : tm K A) W)`, or `P` in `(P : tm K A)`),
// the annotation IS its type — read it from source, no Beluga. Generalises to
// arbitrarily nested ascriptions. Returns the type text or null.
function ascribedTypeForIdent(ident, doc) {
  for (let p = ident.parent; p; p = p.parent) {
    if (p.name !== 'LFAtomicTerm') continue;
    let termPart = null, typePart = null, hasColon = false;
    for (let c = p.firstChild; c; c = c.nextSibling) {
      if (c.name === 'LFTerm' && !termPart) termPart = c;
      else if (c.name === ':') hasColon = true;
      else if (c.name === 'LFType') typePart = c;
    }
    if (!hasColon || !termPart || !typePart) continue;
    // Hovered identifier must sit on the TERM side and be the whole ascribed
    // term — not a sub-part of a compound term (whose pieces have other types).
    if (ident.from < termPart.from || ident.to > termPart.to) continue;
    if (!lfTermIsBareIdent(termPart)) return null;
    return sliceText(doc, typePart.from, typePart.to) || null;
  }
  return null;
}

// Walk up from a node to its containing top-level declaration node, so we
// can ask Beluga for that declaration's reconstructed type (which carries
// the implicit-binder prefix `(A : o) (B : o) ...`).
function findEnclosingGlobalDecl(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (GLOBAL_DECL_PARENT.has(p.name)) return p;
  }
  return null;
}

// Determine whether the identifier sits at a binder/declaration site, and
// return a classification.
function classifyAsBinderSite(ident) {
  const p = ident.parent;
  if (!p) return null;
  const pname = p.name;

  if (GLOBAL_DECL_PARENT.has(pname) && firstIdentChild(p) === ident) {
    return { kind: 'decl-global', declParent: p };
  }

  if (LOCAL_BINDER_INLINE_TYPE.has(pname)) {
    // SchemaSomeBindings has many `LowerIdentifier ":" LFType` triples; any
    // identifier in it is a binder site (with type from its own next type
    // sibling). The other inline-type binders have a single first id.
    if (pname === 'SchemaSomeBindings' || firstIdentChild(p) === ident) {
      return { kind: 'binder-inline', binderParent: p };
    }
  }

  if (LOCAL_BINDER_OUTER_TYPE.has(pname)) {
    return { kind: 'binder-outer', binderParent: p };
  }

  if (LOCAL_BINDER_BARE.has(pname)) {
    return { kind: 'binder-bare', binderParent: p };
  }

  return null;
}

// Decide whether — and how — to fall back when %:get-type returns no info.
// Beluga only records Sgn annotations for LF type/term constants; comp
// types, comp constructors, and rec functions have no annotation, so the
// primary query will return "no type info" for them. We pick the right
// interactive command per decl kind.
function fallbackForGlobal(declParent, ident, doc) {
  const dname = declParent.name;
  const name = doc.sliceString(ident.from, ident.to);
  if (!name) return null;

  if (dname === 'RecBody') {
    return { kind: 'fsig', name };
  }
  if (dname === 'CompConstructor') {
    const body = declParent.parent;
    if (!body || body.name !== 'InductiveBody') return null;
    const parentId = firstIdentChild(body);
    if (!parentId) return null;
    const parentName = doc.sliceString(parentId.from, parentId.to);
    if (!parentName) return null;
    return { kind: 'comp-ctor', parent: parentName, ctor: name };
  }
  if (dname === 'InductiveBody') {
    // Comp type constant — there's no command for the kind. The kind is
    // visible in source, however. Synthesize from the syntax.
    const kindNode = nextTypeSibling(ident);
    if (!kindNode) return null;
    return { kind: 'inline-kind', text: sliceText(doc, kindNode.from, kindNode.to) };
  }
  if (dname === 'TypedefDeclaration') {
    // Same: no command. Show the RHS CompType from source.
    const ty = nextTypeSibling(ident);
    if (!ty) return null;
    return { kind: 'inline-kind', text: sliceText(doc, ty.from, ty.to) };
  }
  return null;
}

// Public API: resolve a hovered identifier.
//
// Returns one of:
//   { kind: 'global', line, col, declParent, fallback? }
//                                  — call %:get-type at (line, col) first;
//                                    if that returns null, try `fallback`
//   { kind: 'local',  text }       — render this text directly
//   { kind: 'implicit', line, col, name }
//                                  — free identifier reconstructed as an
//                                    implicit binder; query the enclosing
//                                    decl's type and parse out (name : T)
//   null                           — no resolution; suppress tooltip
//
// `from` is the doc offset of (any character inside) the identifier.
export function resolveHoverDoc(tree, doc, from) {
  const ident = identAt(tree, from);
  if (!ident) return null;

  // `name` is the bare identifier text — used everywhere lookups happen
  // (defMap, binder frames, parseImplicitBinder). `displayName` is the
  // source-visible form including any `#`/`$` prefix, used only for
  // tooltip rendering so `#p` shows as `#p` instead of `p`.
  const name = doc.sliceString(ident.from, ident.to);
  if (!name) return null;
  const displayName = extendedNameOf(ident, doc);

  const cls = classifyAsBinderSite(ident);

  if (cls && cls.kind === 'decl-global') {
    const { line, col } = lineColAt(doc, ident.from);
    const sourceText = sourceSignatureForGlobal(cls.declParent, ident, doc);
    return {
      kind: 'global',
      line, col,
      name, displayName,
      declParent: cls.declParent.name,
      label: globalLabel(cls.declParent),
      sourceText,
      sourceType: sourceText,  // Type from explicit `: T` annotation
      fallback: fallbackForGlobal(cls.declParent, ident, doc),
    };
  }

  if (cls && cls.kind === 'binder-inline') {
    const ty = nextTypeSibling(ident);
    const innerTo = ty ? ty.to : cls.binderParent.to;
    const innerFrom = cls.binderParent.from;
    const text = widenToBracket(doc, innerFrom, innerTo);
    const sourceType = ty ? sliceText(doc, ty.from, ty.to) : null;
    return { kind: 'local', text, name, displayName, label: localLabel(cls.binderParent), sourceType };
  }

  if (cls && cls.kind === 'binder-outer') {
    const ty = nextTypeSibling(cls.binderParent);
    const innerFrom = cls.binderParent.from;
    const innerTo = ty ? ty.to : cls.binderParent.to;
    const text = widenToBracket(doc, innerFrom, innerTo);
    const sourceType = ty ? sliceText(doc, ty.from, ty.to) : null;
    return { kind: 'local', text, name, displayName, label: localLabel(cls.binderParent), sourceType };
  }

  if (cls && cls.kind === 'binder-bare') {
    // No syntactic type annotation; emit text: null so the tooltip renders
    // head-only ("PARAMETER StepsPQ") instead of redundantly showing the
    // name as its own type.
    return { kind: 'local', text: null, name, displayName, label: localLabel(cls.binderParent) };
  }

  // `( x : T )` ascription — the annotation types the bare ascribed term
  // instantly. Covers heavily-annotated proof pattern binders (e.g. `stepPW`
  // in `↦*/step (stepPW : ↦ (P : tm K A) W) …`) that would otherwise spin on
  // a Beluga query Beluga cannot answer at a case-pattern subterm.
  const ascribed = ascribedTypeForIdent(ident, doc);
  if (ascribed) {
    return {
      kind: 'local',
      text: ascribed,
      sourceType: ascribed,
      name, displayName,
      label: 'Binding',
    };
  }

  // Reference: try local binders first, then globals.
  const local = findEnclosingLocalBinder(ident, doc, name);
  if (local !== null) {
    // local.text is '' for bare-name binder kinds (LFLambdaBinder, FnParam,
    // MLamParam, etc.) — pass that through as null so the tooltip omits
    // the body row. Don't fall back to displayName, which would just
    // re-render the head name.
    return {
      kind: 'local',
      text: local.text ? local.text : null,
      sourceType: local.text ? local.text : null,
      name, displayName,
      label: LOCAL_BINDER_LABEL[local.binderKind] || 'Local Binding',
    };
  }

  const isUpper = ident.name === 'UpperIdentifier';
  const decl = findGlobalDeclarationIdent(tree, doc, name, isUpper);
  if (decl) {
    // Query Beluga at the hovered occurrence, not the defining site — otherwise
    // term uses inside bodies get the whole declaration type (or a reload miss).
    const { line, col } = lineColAt(doc, ident.from);
    const sourceText = sourceSignatureForGlobal(decl.declParent, decl.ident, doc);
    return {
      kind: 'global',
      line, col,
      name, displayName,
      declParent: decl.declParent.name,
      label: globalLabel(decl.declParent),
      sourceText,
      sourceType: sourceText,  // Type from the declaration's explicit annotation
      fallback: fallbackForGlobal(decl.declParent, decl.ident, doc),
    };
  }

  const encl = findEnclosingGlobalDecl(ident);
  if (encl) {
    const enclIdent = firstIdentChild(encl);
    if (enclIdent && enclIdent !== ident) {
      const { line, col } = lineColAt(doc, ident.from);
      const enclDeclName = doc.sliceString(enclIdent.from, enclIdent.to);
      const sourceType = inferImplicitArgType(tree, doc, ident);
      return {
        kind: 'implicit',
        line, col,
        name, displayName,
        label: 'Implicit Binder',
        sourceType,
        needsElaboration: !sourceType,
        owningDeclaration: enclDeclName,
        owningDeclNode: encl,
      };
    }
  }

  return null;
}

export function resolveHover(state, from) {
  return resolveHoverDoc(syntaxTree(state), state.doc, from);
}

// True when `pos` is on an identifier the hover system should consider.
export function isHoverableIdent(state, pos) {
  return identAt(syntaxTree(state), pos) != null;
}

import { syntaxTree } from '@codemirror/language';
import { walkTree } from './tree-walk.mjs';
import {
  GLOBAL_DECL_PARENT,
  firstChildNamed,
  firstIdentChild,
  isLFDatatypeHead,
} from './tree-helpers.mjs';
import { findGroupSignature, groupDefinesName } from './semantic/project-prelude.mjs';
import { buildInfixState, infixSlotForIdent } from './infix.mjs';

// The project group's answer for a name this document does not define: kind
// label + source signature from the defining file. The document is a CHILD of
// the project tree — a name defined by an earlier sibling is a global
// reference, never an "implicit binder" guess.
function externalSignatureFor(name) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.Persist;
  if (!name || !P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function') {
    return null;
  }
  try {
    return findGroupSignature(P.listFiles(), P.getActiveFileId(), name, (id) => P.getFileText(id));
  } catch (_) {
    return null;
  }
}

// Is `name` defined by an earlier suite file even though no syntactic signature
// could be extracted for it (e.g. a datatype constructor)? Such a name is still
// a real cross-file reference — its type just needs the checker, not a guess.
function externalDefinedName(name) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.Persist;
  if (!name || !P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function') {
    return false;
  }
  try {
    return groupDefinesName(P.listFiles(), P.getActiveFileId(), name, (id) => P.getFileText(id));
  } catch (_) {
    return false;
  }
}

const IDENT = new Set(['LowerIdentifier', 'UpperIdentifier']);

const TYPE_RHS = new Set([
  'LFType', 'LFKind', 'CompType', 'CompKind',
  'ContextualType', 'LFBlock',
]);

const LOCAL_BINDER_INLINE_TYPE = new Set([
  'CompTypeBinder',
  'LFBlockField',
  'ContextEntry',
  'SchemaSomeBindings',
]);

const LOCAL_BINDER_OUTER_TYPE = new Set(['PiBinder']);

const LOCAL_BINDER_BARE = new Set([
  'LFLambdaBinder',
  'FnParam',
  'MLamParam',
  'ContextHat',
  'ContextHead',
  'ContextTailEntry',
]);

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
  AtomicPattern:      'Pattern Variable',
};

function globalLabel(declParent) {
  const n = declParent.name;
  if (n === 'LFDeclaration') {
    for (let c = declParent.firstChild; c; c = c.nextSibling) {
      if (c.name === 'LFKind') return 'LF Type Family';
      if (c.name === 'LFType') return 'LF Constant';
    }
    return 'LF Declaration';
  }
  if (n === 'LFDatatypeDeclaration')   return 'LF Type Family';
  if (n === 'LFConstructor')           return 'LF Constructor';
  if (n === 'InductiveBody')           return declParent.parent && declParent.parent.name === 'StratifiedDeclaration'
    ? 'Stratified Type' : 'Inductive Type';
  if (n === 'CoinductiveBody')         return 'Coinductive Type';
  if (n === 'CompConstructor')         return 'Constructor';
  if (n === 'CompDestructor')          return 'Destructor';
  if (n === 'RecBody')                 return 'Recursive Function';
  if (n === 'ProofDeclaration')        return 'Proof';
  if (n === 'TypedefDeclaration')      return 'Type Alias';
  if (n === 'SchemaDeclaration')       return 'Schema';
  if (n === 'LetDeclaration')          return 'Let Binding';
  if (n === 'ModuleDeclaration')       return 'Module';
  return null;
}

function localLabel(binderParent) {
  return LOCAL_BINDER_LABEL[binderParent.name] || 'Local Binding';
}

// An implicit (reconstruction-introduced) variable, named by its own kind. A
// substitution variable ($S / #S) has no position-typeable classifier: the
// checker's annotation oracle records only LF, computation, and kind types —
// never a substitution type — so there is provably nothing to display. We label
// it honestly and flag the type as unavailable so the tooltip settles head-only
// instead of spinning on an elaboration that can never produce a result.
function implicitVariableLabel(ident) {
  const p = ident.parent;
  if (p && p.name === 'SubstitutionVariable') return 'Substitution Variable';
  if (p && p.name === 'ParameterVariable') return 'Parameter Variable';
  return 'Implicit Binder';
}

function isSubstitutionVariable(ident) {
  return !!(ident.parent && ident.parent.name === 'SubstitutionVariable');
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
  if (n && (n.name === '#' || n.name === '$')) {
    const p = n.parent;
    if (p && (p.name === 'ParameterVariable' || p.name === 'SubstitutionVariable')) {
      const id = n.nextSibling;
      if (id && IDENT.has(id.name)) return id;
    }
    const sib = n.nextSibling;
    if (sib && IDENT.has(sib.name)) return sib;
  }
  n = tree.resolveInner(pos, -1);
  if (n && IDENT.has(n.name)) return n;
  if (n && (n.name === '#' || n.name === '$')) {
    const p = n.parent;
    if (p && (p.name === 'ParameterVariable' || p.name === 'SubstitutionVariable')) {
      const id = n.nextSibling;
      if (id && IDENT.has(id.name)) return id;
    }
    const sib = n.nextSibling;
    if (sib && IDENT.has(sib.name)) return sib;
  }
  return null;
}

// The projection tail (the ".2" of "#p.2" or "b2.2"), if this identifier is
// projected. The grammar attaches ProjectionTail as the identifier's immediate
// next sibling in both LFAtomicTerm (bound variable x.k) and ParameterVariable
// (#p.k). The tail selects a block field, so the projected entity has that
// field's type — not the whole block's.
function projectionTailOf(ident) {
  const sib = ident.nextSibling;
  return sib && sib.name === 'ProjectionTail' ? sib : null;
}

function projectionIndexOf(ident, doc) {
  const proj = projectionTailOf(ident);
  if (!proj) return null;
  const n = parseInt(doc.sliceString(proj.from + 1, proj.to), 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

// Split on commas that sit at bracket depth 0. Only ()[]{} count as nesting —
// not <>, since ">" also occurs in the "->" arrow and must not be read as a
// closing bracket.
function splitTopLevelCommas(s) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) { parts.push(s.slice(start, i)); start = i + 1; }
  }
  parts.push(s.slice(start));
  return parts;
}

function stripOuterParens(s) {
  if (s[0] !== '(') return s;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth += 1;
    else if (s[i] === ')') {
      depth -= 1;
      if (depth === 0) return i === s.length - 1 ? s.slice(1, i).trim() : s;
    }
  }
  return s;
}

// The type of the k-th field (1-indexed) of a "block (f1:T1, f2:T2, ...)" type.
// null when the text is not a block or the index is out of range.
function projectBlockField(typeText, index) {
  if (!typeText || !Number.isInteger(index) || index < 1) return null;
  const m = /^block\b/.exec(typeText.trim());
  if (!m) return null;
  const body = stripOuterParens(typeText.trim().slice(m[0].length).trim());
  const fields = splitTopLevelCommas(body);
  if (index > fields.length) return null;
  const field = fields[index - 1].trim();
  const colon = field.indexOf(':');
  if (colon < 0) return null;
  return field.slice(colon + 1).trim() || null;
}

// Apply a projection (if present) to a local binder's block type. Falls back to
// the whole type when the text isn't a projectable block, so we never lose the
// information we already had.
function projectLocalType(typeText, ident, doc) {
  const base = typeText || null;
  const index = projectionIndexOf(ident, doc);
  if (!base || index == null) return base;
  return projectBlockField(base, index) || base;
}

function extendedNameOf(ident, doc) {
  const p = ident.parent;
  const proj = projectionTailOf(ident);
  if (p && (p.name === 'ParameterVariable' || p.name === 'SubstitutionVariable')) {
    const h = p.firstChild;
    if (h && (h.name === '#' || h.name === '$')) {
      // Carry the projection (#p.2) into the displayed name: it IS the hovered
      // entity, and its projected type is what we report here.
      return doc.sliceString(h.from, proj ? proj.to : ident.to);
    }
  }
  return doc.sliceString(ident.from, proj ? proj.to : ident.to);
}

function lineColAt(doc, pos) {
  const line = doc.lineAt(pos);
  return { line: line.number, col: pos - line.from };
}

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

// A schema has no ":"-type; its "type" is the body after "=" (the blocks). The
// SchemaBody node already isolates it, so slice that rather than string-hunting
// for "=" (the body itself contains ":" and "+").
function schemaBodyText(declParent, doc) {
  const body = firstChildNamed(declParent, 'SchemaBody');
  if (!body) return null;
  return sliceText(doc, body.from, body.to) || null;
}

const MODULE_MEMBER_CAP = 8;

// The head name of a declaration: a direct identifier child, else the one nested
// in its *Body node (RecBody, InductiveBody, …).
function declHeadName(declNode, doc) {
  let id = firstIdentChild(declNode);
  if (id) return doc.sliceString(id.from, id.to);
  for (let c = declNode.firstChild; c; c = c.nextSibling) {
    if (!/Body$/.test(c.name)) continue;
    id = firstIdentChild(c);
    if (id) return doc.sliceString(id.from, id.to);
  }
  return null;
}

// A module is a namespace, not a typed value. The most useful "type" row is a
// summary of what it exports: the head names of its top-level declarations.
function moduleSummaryText(declParent, doc) {
  const names = [];
  for (let c = declParent.firstChild; c; c = c.nextSibling) {
    if (c.name !== 'Declaration' || !c.firstChild) continue;
    const n = declHeadName(c.firstChild, doc);
    if (n && !names.includes(n)) names.push(n);
  }
  if (!names.length) return null;
  const shown = names.slice(0, MODULE_MEMBER_CAP);
  const tail = names.length > shown.length ? `, …(+${names.length - shown.length})` : '';
  return `{ ${shown.join(', ')}${tail} }`;
}

function sourceSignatureForGlobal(declParent, ident, doc) {
  if (!declParent || !ident) return null;
  const dname = declParent.name;
  if (dname === 'SchemaDeclaration') return schemaBodyText(declParent, doc);
  if (dname === 'ModuleDeclaration') return moduleSummaryText(declParent, doc);
  if (dname === 'LetDeclaration') return null; // computation type is checker-inferred

  const ty = nextTypeSibling(ident);
  if (!ty) return null;
  const text = sliceText(doc, ty.from, ty.to);
  return text || null;
}

// Per-pass memo: within one lint pass a deeply-nested application re-asks the
// SAME head node's enclosing binder at every nesting level (measured ~12k calls
// for the same handful of positions). The answer depends only on (node position,
// doc), both fixed within a synchronous pass, so key by position. Cleared at each
// collectUndefinedApplicationDiags entry (every keystroke), alongside the external
// name memo.
let _localBinderMemo = new Map();
function resetLocalBinderMemo() { _localBinderMemo = new Map(); }

function findEnclosingLocalBinder(ident, doc, name) {
  const memoKey = `${ident.from}:${ident.to}`;
  if (_localBinderMemo.has(memoKey)) return _localBinderMemo.get(memoKey);
  let result = null;
  for (let p = ident.parent; p; p = p.parent) {
    const matched = scanFrameForName(p, doc, name);
    if (matched) { result = matched; break; }
  }
  _localBinderMemo.set(memoKey, result);
  return result;
}

function hit(text, binderKind) { return { text, binderKind }; }

function scanFrameForName(frame, doc, name) {
  const fname = frame.name;

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

  if (fname === 'CaseBranch' || fname === 'LetExpression') {
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

  // Pattern-bound variables scope over their branch/let body. A use elsewhere in
  // the body (`sim_trans s3 s4`) resolves to its binding here — head-only, since
  // the variable's type is a refinement the source does not spell out.
  if (fname === 'CaseBranch' || fname === 'LetExpression' || fname === 'CofunctionBranch') {
    const found = scanFramePatternsForName(frame, doc, name);
    if (found) return found;
  }

  if (fname === 'LFLambda') {
    const binder = firstChildNamed(frame, 'LFLambdaBinder');
    if (binder) {
      const id = firstIdentChild(binder);
      if (id && doc.sliceString(id.from, id.to) === name) return hit('', 'LFLambdaBinder');
    }
  }

  if (fname === 'FnExpression' || fname === 'MLamExpression') {
    const childKind = fname === 'FnExpression' ? 'FnParam' : 'MLamParam';
    for (let c = frame.firstChild; c; c = c.nextSibling) {
      if (c.name !== childKind) continue;
      const id = firstIdentChild(c);
      if (id && doc.sliceString(id.from, id.to) === name) return hit('', childKind);
    }
  }

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

  if (fname === 'ContextualType' || fname === 'ContextualObject') {
    const part = firstChildNamed(frame, 'ContextPart');
    if (part) {
      const found = scanContextPartForName(part, doc, name);
      if (found) return found;
    }
  }

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

// Scan a branch/let frame's pattern(s) for a bare lowercase variable. The frame
// carries Pattern children (case/let) or Copattern children (fun); within each,
// any `AtomicPattern > LowerIdentifier` is a binding occurrence.
function scanFramePatternsForName(frame, doc, name) {
  for (let c = frame.firstChild; c; c = c.nextSibling) {
    if (c.name !== 'Pattern' && c.name !== 'Copattern') continue;
    const found = scanPatternSubtreeForName(c, doc, name);
    if (found) return found;
  }
  return null;
}

function scanPatternSubtreeForName(node, doc, name) {
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    if (n.name === 'AtomicPattern') {
      const id = n.firstChild;
      if (id && id.name === 'LowerIdentifier' && doc.sliceString(id.from, id.to) === name) {
        return hit('', 'AtomicPattern');
      }
    }
    for (let c = n.firstChild; c; c = c.nextSibling) stack.push(c);
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

// The application that types `ident`: its NEAREST enclosing application, and
// only when `ident` sits in that app's argument slot. Two things matter:
//   - Nearest wins. Type- and term-level apps nest (`red (pcomp P)`), and the
//     inner head is the one that types the ident — never climb past it.
//   - Argument, not head. In `red (P Y)`, P heads the inner application `P Y`;
//     it is NOT an argument of anything, so it has no slot type. The old check
//     only tested span-containment and so wrongly climbed to `red`, typing P as
//     red's domain. Reaching the nearest app with ident in head position means
//     "no arg type", full stop.
function nearestArgApp(ident) {
  for (let p = ident.parent; p; p = p.parent) {
    const isType = TYPE_APP.has(p.name);
    const isTerm = TERM_APP.has(p.name);
    if (!isType && !isTerm) continue;
    // A head-only app (bare atom spine) is not a real application — skip it so
    // `linR` in `l_pcomp2 (\y. linR)` reaches the outer head, not the atom wrap.
    if (isType ? isHeadOnlyTypeApp(p) : isHeadOnlyTermApp(p)) continue;
    const arg = isType ? typeAppArgChild(p) : termAppArgChild(p);
    if (arg && ident.from >= arg.from && ident.to <= arg.to) {
      return { app: p, kind: isType ? 'type' : 'term' };
    }
    return null; // nearest app, but ident is its head (or no arg) → untypeable here
  }
  return null;
}

function innermostTypeAppForIdent(ident) {
  const hit = nearestArgApp(ident);
  return hit && hit.kind === 'type' ? hit.app : null;
}

function innermostTermAppForIdent(ident) {
  const hit = nearestArgApp(ident);
  return hit && hit.kind === 'term' ? hit.app : null;
}

// A spine node carries an argument iff it nests a further application of the
// same family (the grammar's `App !app Atomic` rule). The base case — an app
// node wrapping a lone atom — is just the head and adds no argument. (Testing
// for an atomic CHILD is wrong for terms: a term head IS an LFAtomicTerm, so
// `pcomp` in `pcomp P` would be miscounted, shifting every arg index by one.)
function hasNestedApp(app, family) {
  for (let c = app.firstChild; c; c = c.nextSibling) {
    if (family.has(c.name)) return true;
  }
  return false;
}

function isHeadOnlyTypeApp(app) {
  return TYPE_APP.has(app.name) && !hasNestedApp(app, TYPE_APP);
}

function isHeadOnlyTermApp(app) {
  return TERM_APP.has(app.name) && !hasNestedApp(app, TERM_APP);
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

// Per-name memo for the EXTERNAL (prelude/group) half of the answer. The lint
// pass asks the same ~36 names ~250× each per keystroke (deeply-nested apps
// re-ask the same head at every nesting level) — measured 9,451 external-prelude
// scans collapsing to just 36 distinct names. The external answer depends only
// on (name, prelude contents), and the prelude is fixed within a synchronous
// lint pass, so a pass-scoped memo (cleared at collectUndefinedApplicationDiags
// entry) turns those thousands of prelude scans into ~36. The local half
// (findGlobalDeclarationIdent) is tree-dependent and stays direct.
let _extKnownMemo = new Map();      // name -> boolean, valid within the current lint pass

function resetExternalKnownMemo() { _extKnownMemo = new Map(); }

function externalKnownName(name) {
  const hit = _extKnownMemo.get(name);
  if (hit !== undefined) return hit;
  const known = !!externalSignatureFor(name) || externalDefinedName(name);
  _extKnownMemo.set(name, known);
  return known;
}

function isKnownGlobalName(tree, doc, name, isUpper) {
  if (findGlobalDeclarationIdent(tree, doc, name, isUpper)) return true;
  return externalKnownName(name);
}

function plainLowerName(name) {
  return /^[a-z][a-z0-9']*$/.test(name);
}

// A juxtaposed pair of plain lowercase atoms (`t p` for `tp`) is almost never a
// genuine type application. Infix heads like `↦*` fail plainLowerName, so
// `t ↦* t` still reads as an implicit binder.
function looksLikeTypoJuxtaposition(app, isType, doc) {
  const headChild = app.firstChild;
  if (!headChild) return false;
  if (isType ? !isHeadOnlyTypeApp(headChild) : !isHeadOnlyTermApp(headChild)) return false;
  const head = isType ? headIdentOfTypeApp(app) : headIdentOfTermApp(app);
  const arg = isType ? typeAppArgChild(app) : termAppArgChild(app);
  if (!head || !arg) return false;
  const headName = doc.sliceString(head.from, head.to);
  const argId = firstIdentChild(arg);
  if (!argId || argId.name !== 'LowerIdentifier') return false;
  const argName = doc.sliceString(argId.from, argId.to);
  return plainLowerName(headName) && plainLowerName(argName);
}

function typoJuxtapositionSite(tree, doc, app, isType) {
  if (!looksLikeTypoJuxtaposition(app, isType, doc)) return null;
  const head = isType ? headIdentOfTypeApp(app) : headIdentOfTermApp(app);
  if (projectionTailOf(head)) return null;
  const arg = isType ? typeAppArgChild(app) : termAppArgChild(app);
  const headName = doc.sliceString(head.from, head.to);
  const argName = doc.sliceString(firstIdentChild(arg).from, firstIdentChild(arg).to);
  const merged = headName + argName;
  if (isKnownGlobalName(tree, doc, merged, false)) {
    return { headName, merged };
  }
  return null;
}

function identInMetaVar(ident) {
  for (let q = ident; q; q = q.parent) {
    if (q.name === 'ParameterVariable' || q.name === 'SubstitutionVariable') return true;
  }
  return false;
}

function applicationHeadIsBound(tree, doc, app, isType) {
  const head = isType ? headIdentOfTypeApp(app) : headIdentOfTermApp(app);
  if (!head || identInMetaVar(head)) return true;
  const name = doc.sliceString(head.from, head.to);
  if (findEnclosingLocalBinder(head, doc, name) !== null) return true;
  return isKnownGlobalName(tree, doc, name, head.name === 'UpperIdentifier');
}

// Juxtaposed application (`t p`, `dual A`) is valid only when the head names a
// defined constant. A typo like `t p` for `tp` parses as application but must
// not fall through to the implicit-binder guess — neither atom is reconstructible.
//
// The site (head + optional typo-merge) for ONE application node. Extracted so
// the lint pass can visit application nodes directly, instead of probing every
// identifier in the file (which called findEnclosingLocalBinder thousands of
// times per keystroke — O(idents × depth) on large proofs).
function siteForApp(tree, doc, app, isType) {
  const family = isType ? TYPE_APP : TERM_APP;
  if (!hasNestedApp(app, family)) return null;
  const head = isType ? headIdentOfTypeApp(app) : headIdentOfTermApp(app);
  if (!head) return null;
  if (projectionTailOf(head)) return null;
  if (isSubstitutionVariable(head)) return null;
  for (let q = head.parent; q; q = q.parent) {
    if (q.name === 'ParameterVariable' || q.name === 'SubstitutionVariable') return null;
  }
  if (ascribedTypeForIdent(head, doc)) return null;
  if (applicationHeadIsBound(tree, doc, app, isType)) return null;
  const typo = typoJuxtapositionSite(tree, doc, app, isType);
  if (!typo) return null;
  return {
    ident: head,
    role: 'head',
    headName: typo.headName,
    merged: typo.merged,
  };
}

// Per-ident probe (hover / implicit typing). The hot lint path uses siteForApp
// over application nodes only — see collectUndefinedApplicationDiags.
function undefinedApplicationSite(tree, doc, ident) {
  const name = doc.sliceString(ident.from, ident.to);
  if (projectionTailOf(ident)) return null;
  if (isSubstitutionVariable(ident)) return null;
  for (let q = ident.parent; q; q = q.parent) {
    if (q.name === 'ParameterVariable' || q.name === 'SubstitutionVariable') return null;
  }
  if (findEnclosingLocalBinder(ident, doc, name) !== null) return null;
  if (ascribedTypeForIdent(ident, doc)) return null;
  for (let p = ident.parent; p; p = p.parent) {
    const isType = TYPE_APP.has(p.name);
    const isTerm = TERM_APP.has(p.name);
    if (!isType && !isTerm) continue;
    const site = siteForApp(tree, doc, p, isType);
    if (!site) continue;
    const head = site.ident;
    const arg = isType ? typeAppArgChild(p) : termAppArgChild(p);
    const isHead = head.from === ident.from && head.to === ident.to;
    const isArg = arg && ident.from >= arg.from && ident.to <= arg.to;
    if (!isHead && !isArg) continue;
    return {
      role: isHead ? 'head' : 'arg',
      headName: site.headName,
      merged: site.merged,
    };
  }
  return null;
}

function undefinedApplicationMessage(name, site) {
  if (site.role === 'head') return `Type family '${name}' is not defined`;
  return `Type family '${site.headName}' is not defined`;
}

export function collectUndefinedApplicationDiags(tree, doc) {
  // Prelude + doc positions are fixed for this synchronous pass; memoize the
  // external name lookups and local-binder scans so a deeply-nested app that
  // re-asks the same head at every nesting level pays each lookup once.
  resetExternalKnownMemo();
  resetLocalBinderMemo();
  const diags = [];
  const seen = new Set();
  // Only visit application nodes — never every identifier in the file.
  // The old per-ident walk called findEnclosingLocalBinder ~thousands of times
  // per keystroke (O(idents × depth) on large proofs).
  tree.iterate({
    enter(ref) {
      const isType = TYPE_APP.has(ref.name);
      const isTerm = TERM_APP.has(ref.name);
      if (!isType && !isTerm) return;
      const site = siteForApp(tree, doc, ref.node, isType);
      if (!site) return;
      const head = site.ident;
      const arg = isType ? typeAppArgChild(ref.node) : termAppArgChild(ref.node);
      const argIdent = arg ? firstIdentChild(arg) : null;
      const targets = [head];
      if (argIdent) targets.push(argIdent);
      for (const ident of targets) {
        const key = `${ident.from}:${ident.to}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const name = doc.sliceString(ident.from, ident.to);
        const role = ident.from === head.from && ident.to === head.to ? 'head' : 'arg';
        diags.push({
          from: ident.from,
          to: ident.to,
          severity: 'error',
          message: undefinedApplicationMessage(name, { role, headName: site.headName }),
        });
      }
    },
  });
  return diags;
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

// The declared type signature of an application head, whether it lives in this
// file or an earlier file of the project group. An implicit binder is typed by
// the slot it fills under such a head (`A` in `dual A A'` ← dual's domain), so
// when the head is `dual`/`linear`/… imported from another module, the group
// signature must be consulted too — otherwise the binder reads as untyped.
function headTypeSignature(tree, doc, headName, isUpper) {
  const decl = findGlobalDeclarationIdent(tree, doc, headName, isUpper);
  if (decl) {
    const sig = sourceSignatureForGlobal(decl.declParent, decl.ident, doc);
    if (sig) return sig;
  }
  const ext = externalSignatureFor(headName);
  return ext && ext.type ? ext.type : null;
}

function inferImplicitFromInfix(tree, doc, ident) {
  const state = buildInfixState(tree, doc, ident.from);
  const slot = infixSlotForIdent(tree, doc, ident, state);
  if (!slot) return null;

  const sig = headTypeSignature(tree, doc, slot.headName, false);
  if (!sig) return null;

  const domain = domainAtArrowIndex(sig, slot.argIndex);
  if (!domain) return null;

  const span = { from: slot.from, to: slot.to };
  const depth = lambdaDepthInSpan(span, ident);
  return depth > 0 ? peelDependentArrows(domain, depth) : domain;
}

function inferImplicitFromTypeApp(tree, doc, ident) {
  const app = innermostTypeAppForIdent(ident);
  if (!app) return null;
  const argIndex = argIndexInTypeApp(ident);
  if (argIndex == null) return null;

  const head = headIdentOfTypeApp(app);
  if (!head) return null;
  const headName = doc.sliceString(head.from, head.to);
  const sig = headTypeSignature(tree, doc, headName, head.name === 'UpperIdentifier');
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
  const sig = headTypeSignature(tree, doc, headName, head.name === 'UpperIdentifier');
  if (!sig) return null;

  const domain = domainAtArrowIndex(sig, argIndex);
  if (!domain) return null;

  const arg = termAppArgChild(app);
  const depth = arg ? lambdaDepthInSpan(arg, ident) : 0;
  return depth > 0 ? peelDependentArrows(domain, depth) : domain;
}

// Every free occurrence of an implicit binder in one declaration denotes the
// same reconstruction-introduced variable, hence shares one type. Collect the
// other free occurrences of this name within the enclosing declaration so an
// untypeable spot can borrow from a typed one.
function siblingOccurrences(encl, doc, name, isUpper, self) {
  const out = [];
  const stack = [encl];
  while (stack.length) {
    const n = stack.pop();
    if (IDENT.has(n.name)
      && (n.name === 'UpperIdentifier') === isUpper
      && n.from !== self.from
      && doc.sliceString(n.from, n.to) === name) {
      out.push(n);
    }
    for (let c = n.firstChild; c; c = c.nextSibling) stack.push(c);
  }
  return out;
}

// Borrow this implicit binder's type from a sibling occurrence sitting in a
// typed argument slot — e.g. `P` as the head of `(P Y)` has no local type, but
// `P` in `pcomp A _ P` does, and they are the same binder.
function inferImplicitFromSibling(tree, doc, ident) {
  const encl = findEnclosingGlobalDecl(ident);
  if (!encl) return null;
  const name = doc.sliceString(ident.from, ident.to);
  if (!name) return null;
  const isUpper = ident.name === 'UpperIdentifier';
  for (const cand of siblingOccurrences(encl, doc, name, isUpper, ident)) {
    // A locally-bound occurrence (lambda/pi shadow) is a different variable.
    if (findEnclosingLocalBinder(cand, doc, name)) continue;
    const t = inferImplicitFromInfix(tree, doc, cand)
      || inferImplicitFromTypeApp(tree, doc, cand)
      || inferImplicitFromTermApp(tree, doc, cand);
    if (t) return t;
  }
  return null;
}

function inferImplicitArgType(tree, doc, ident) {
  // An explicit pattern annotation is the declared type — authoritative over any
  // application-slot inference, so it is consulted first.
  return patternAnnotationType(ident, doc)
    || inferImplicitFromInfix(tree, doc, ident)
    || inferImplicitFromTypeApp(tree, doc, ident)
    || inferImplicitFromTermApp(tree, doc, ident)
    || implicitTypeFromDeclSignature(tree, doc, ident)
    || inferImplicitFromSibling(tree, doc, ident);
}

function lfTermIsBareIdent(termNode) {
  let app = null;
  for (let c = termNode.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LFAppTerm') app = c;
  }
  if (!app) return false;
  for (let c = app.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LFAppTerm') return false;
  }
  return true;
}

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
    if (ident.from < termPart.from || ident.to > termPart.to) continue;
    if (!lfTermIsBareIdent(termPart)) return null;
    return sliceText(doc, typePart.from, typePart.to) || null;
  }
  return null;
}

function findEnclosingGlobalDecl(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (GLOBAL_DECL_PARENT.has(p.name)) return p;
  }
  return null;
}

function classifyAsBinderSite(ident) {
  const p = ident.parent;
  if (!p) return null;
  const pname = p.name;

  if (GLOBAL_DECL_PARENT.has(pname) && firstIdentChild(p) === ident) {
    return { kind: 'decl-global', declParent: p };
  }

  // A mutual LF block flattens `LF n … and a … and p …` into one
  // LFDatatypeDeclaration; every head after the first still names a type family,
  // so classify it global rather than letting it fall through to the
  // implicit-binder guess below.
  if (pname === 'LFDatatypeDeclaration' && isLFDatatypeHead(ident)) {
    return { kind: 'decl-global', declParent: p };
  }

  if (LOCAL_BINDER_INLINE_TYPE.has(pname)) {
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

  // A computation pattern variable: the bare lowercase atom of a `case` / `let` /
  // `fun` pattern (`let MakeTransSimf t1 s3 = …` binds t1, s3). The constructor
  // head is uppercase and resolves globally, so only LowerIdentifier counts.
  if (pname === 'AtomicPattern' && ident.name === 'LowerIdentifier' && p.firstChild === ident) {
    return { kind: 'binder-bare', binderParent: p };
  }

  return null;
}

function fallbackForGlobal(declParent, ident, doc) {
  const dname = declParent.name;
  const name = doc.sliceString(ident.from, ident.to);
  if (!name) return null;

  if (dname === 'RecBody' || dname === 'ProofDeclaration') {
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
  if (dname === 'InductiveBody' || dname === 'CoinductiveBody') {
    const kindNode = nextTypeSibling(ident);
    if (!kindNode) return null;
    return { kind: 'inline-kind', text: sliceText(doc, kindNode.from, kindNode.to) };
  }
  if (dname === 'TypedefDeclaration') {
    const ty = nextTypeSibling(ident);
    if (!ty) return null;
    return { kind: 'inline-kind', text: sliceText(doc, ty.from, ty.to) };
  }
  return null;
}

export function referenceKind(tree, doc, from) {
  const ident = identAt(tree, from);
  if (!ident) return null;

  const name = doc.sliceString(ident.from, ident.to);
  if (!name) return null;

  const cls = classifyAsBinderSite(ident);
  if (cls?.kind === 'decl-global') return 'global';
  if (cls?.kind === 'binder-inline' || cls?.kind === 'binder-outer' || cls?.kind === 'binder-bare') {
    return 'local';
  }
  if (ascribedTypeForIdent(ident, doc)) return 'local';
  if (findEnclosingLocalBinder(ident, doc, name) !== null) return 'local';

  const isUpper = ident.name === 'UpperIdentifier';
  if (findGlobalDeclarationIdent(tree, doc, name, isUpper)) return 'global';

  // Defined by an earlier file in the project group → a global reference.
  if (externalSignatureFor(name)) return 'global';

  if (undefinedApplicationSite(tree, doc, ident)) return 'unbound';

  const encl = findEnclosingGlobalDecl(ident);
  if (encl) {
    const enclIdent = firstIdentChild(encl);
    if (enclIdent && enclIdent !== ident) return 'implicit';
  }

  return 'unbound';
}

// Type of a named binder in a signature prefix: `(g : nctx) …` / `{g:ctx} …`.
export function signatureBinderType(sig, name) {
  return implicitBinderInTypePrefix(String(sig || '').trim(), name);
}

function codomainAfterArgCount(sig, n) {
  let cur = String(sig || '').trim();
  for (let i = 0; i < n; i += 1) {
    const split = splitArrowType(cur);
    if (!split) return cur;
    cur = split.codomain;
  }
  return cur;
}

// Expected type of an LF/comp application slot at `pos` (not the bound type of
// the ident being completed). Used by autocomplete J3 filtering.
export function slotExpectedType(tree, doc, pos) {
  const ident = identAt(tree, pos);
  if (!ident) return null;
  return ascribedTypeForIdent(ident, doc)
    || inferImplicitArgType(tree, doc, ident);
}

// Result type of a fully-applied LF term application spanning [exprFrom, exprTo].
export function applicationExprType(tree, doc, exprFrom, exprTo) {
  const id = identAt(tree, exprFrom);
  if (!id) return null;
  let app = null;
  for (let p = id; p && p.from >= exprFrom && p.to <= exprTo; p = p.parent) {
    if (p.name === 'LFAppTerm') app = p;
  }
  if (!app) return null;
  const head = headIdentOfTermApp(app);
  if (!head) return null;
  const headName = doc.sliceString(head.from, head.to);
  const sig = headTypeSignature(tree, doc, headName, head.name === 'UpperIdentifier');
  if (!sig) return null;
  let count = 0;
  let node = app.firstChild;
  while (node) {
    if (!TERM_APP.has(node.name)) break;
    if (!isHeadOnlyTermApp(node)) count += 1;
    node = node.firstChild;
  }
  return codomainAfterArgCount(sig, count);
}

export function resolveHoverDoc(tree, doc, from) {
  const ident = identAt(tree, from);
  if (!ident) return null;

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
      sourceType: sourceText,
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
    return { kind: 'local', text: null, name, displayName, label: localLabel(cls.binderParent) };
  }

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

  const local = findEnclosingLocalBinder(ident, doc, name);
  if (local !== null) {
    // A projected block variable (b2.2) shows the field's type, not the block's.
    const projected = projectLocalType(local.text || null, ident, doc);
    return {
      kind: 'local',
      text: projected,
      sourceType: projected,
      name, displayName,
      label: LOCAL_BINDER_LABEL[local.binderKind] || 'Local Binding',
    };
  }

  const isUpper = ident.name === 'UpperIdentifier';
  const decl = findGlobalDeclarationIdent(tree, doc, name, isUpper);
  if (decl) {
    const { line, col } = lineColAt(doc, ident.from);
    const sourceText = sourceSignatureForGlobal(decl.declParent, decl.ident, doc);
    return {
      kind: 'global',
      line, col,
      name, displayName,
      declParent: decl.declParent.name,
      label: globalLabel(decl.declParent),
      sourceText,
      sourceType: sourceText,
      fallback: fallbackForGlobal(decl.declParent, decl.ident, doc),
    };
  }

  // Defined by an earlier file in the project group: a real global reference
  // with its source signature — NOT an implicit-binder guess. Checked before
  // the implicit branch because missing context must be PROVIDED, not guessed
  // around.
  const ext = externalSignatureFor(name);
  if (ext) {
    const { line, col } = lineColAt(doc, ident.from);
    return {
      kind: 'external',
      line, col,
      name, displayName,
      label: ext.label,
      sourceText: ext.type,
      sourceType: ext.type,
      externalFile: ext.fileName,
    };
  }

  // Defined by an earlier suite file but with no extractable syntactic signature
  // (e.g. a datatype constructor). It is still a genuine cross-file reference —
  // classify it external (not an implicit-binder guess) and let the checker,
  // which has the assembled prelude+active code loaded, supply the real type.
  if (externalDefinedName(name)) {
    const { line, col } = lineColAt(doc, ident.from);
    return {
      kind: 'external',
      line, col,
      name, displayName,
      label: 'declaration',
      sourceText: null,
      sourceType: null,
      needsElaboration: true,
    };
  }

  const badApp = undefinedApplicationSite(tree, doc, ident);
  if (badApp) {
    const { line, col } = lineColAt(doc, ident.from);
    return {
      kind: 'unbound',
      line, col,
      name, displayName,
      label: 'Unbound Identifier',
      sourceType: null,
      message: undefinedApplicationMessage(name, badApp),
    };
  }

  const encl = findEnclosingGlobalDecl(ident);
  if (encl) {
    const enclIdent = firstIdentChild(encl);
    if (enclIdent && enclIdent !== ident) {
      const { line, col } = lineColAt(doc, ident.from);
      const enclDeclName = doc.sliceString(enclIdent.from, enclIdent.to);
      // A projection (#p.2) selects a block field — source inference would only
      // recover #p's whole type, so defer to the checker, which annotates the
      // projected field type at this position.
      const sourceType = projectionTailOf(ident) ? null : inferImplicitArgType(tree, doc, ident);
      const typeUnavailable = isSubstitutionVariable(ident);
      return {
        kind: 'implicit',
        line, col,
        name, displayName,
        label: implicitVariableLabel(ident),
        sourceType,
        typeUnavailable,
        needsElaboration: !sourceType && !typeUnavailable,
        owningDeclaration: enclDeclName,
        owningDeclNode: encl,
      };
    }
  }

  return null;
}

// When the checker (or cache) reports a whole block schema for b1, project it to
// the k-th field type for a hover on b1.k — matching projectLocalType for binders.
export function projectHoverType(typeText, tree, doc, from) {
  const ident = identAt(tree, from);
  if (!ident || typeText == null) return typeText;
  return projectLocalType(typeText, ident, doc);
}

export function hasTypeProjection(tree, doc, from) {
  const ident = identAt(tree, from);
  if (!ident) return false;
  return projectionIndexOf(ident, doc) != null;
}

export function resolveHover(state, from) {
  return resolveHoverDoc(syntaxTree(state), state.doc, from);
}

export function isHoverableIdent(state, pos) {
  return identAt(syntaxTree(state), pos) != null;
}

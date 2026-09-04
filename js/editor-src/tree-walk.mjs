import {
  GAP_PRAGMA_LINE,
  lfDeclarationHasColon,
  lineSyntaxMessage,
  computeLintBlocks,
} from './lint-units.mjs';
import {
  GLOBAL_DECL_PARENT,
  firstChildNamed,
  firstIdentChild,
  isLFDatatypeHead,
  metaVarIdent,
} from './tree-helpers.mjs';

const PARSE_ERROR = '⚠';
const BAD_DOUBLE_DASH_LINE = /^\s*--/;

const _summaryCache = new WeakMap();

// The walk is split so the keystroke path pays only for what it reads:
//  - lint blocks (eager): top-level decls, O(#decls). No binder stacks.
//  - parse diagnostics (lazy): error-node iterate; syntax-store remaps
//    untouched blocks and re-walks only the dirty range when it can.
//  - names walk (lazy): definedNames / defMap / uses — binder-stack pass,
//    computed on FIRST access (hover, scope tint, settlement masking).
export function walkTree(tree, doc) {
  let s = _summaryCache.get(tree);
  if (s) return s;
  const { blocks, blockAt } = computeLintBlocks(tree, doc);
  let parseDiags = null;
  let names = null;
  const getNames = () => names || (names = doNamesWalk(tree, doc, blockAt));
  s = {
    blocks,
    blockAt,
    get parseDiags() {
      return parseDiags || (parseDiags = collectParseDiagnostics(tree, doc, { blocks, blockAt }));
    },
    get definedNames() { return getNames().definedNames; },
    get defMap() { return getNames().defMap; },
    get uses() { return getNames().uses; },
  };
  _summaryCache.set(tree, s);
  return s;
}

function lastChildNamed(node, name) {
  for (let c = node.lastChild; c; c = c.prevSibling) {
    if (c.name === name) return c;
  }
  return null;
}

function txt(node, doc) { return doc.sliceString(node.from, node.to); }
function binding(doc, node) { return { name: txt(node, doc), bindFrom: node.from, bindTo: node.to }; }

function messageAt(from, doc) {
  try {
    return lineSyntaxMessage(doc.lineAt(from).text);
  } catch (_) {
    return 'Syntax error';
  }
}

function lineIsBadPragma(doc, from) {
  try {
    const t = doc.lineAt(from).text.trimStart();
    return BAD_DOUBLE_DASH_LINE.test(t) && !GAP_PRAGMA_LINE.test(t);
  } catch (_) {
    return false;
  }
}

function inParseErrorContext(node, blockFrom, blockTo) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.from < blockFrom || p.to > blockTo) return false;
    if (p.name === PARSE_ERROR) return true;
    if (p.name === 'LFDeclaration' && !lfDeclarationHasColon(p)) return true;
    if (p.name === 'Program') break;
  }
  return false;
}

function collectBadPragmaLineDiags(blocks, doc) {
  const diags = [];
  const seen = new Set();
  for (const b of blocks) {
    const l0 = doc.lineAt(b.from).number;
    const l1 = doc.lineAt(Math.max(b.from, b.to - 1)).number;
    for (let n = l0; n <= l1; n++) {
      const line = doc.line(n);
      const t = line.text.trimStart();
      if (!BAD_DOUBLE_DASH_LINE.test(t) || GAP_PRAGMA_LINE.test(t)) continue;
      const lead = line.text.search(/\S/);
      const from = line.from + (lead >= 0 ? lead : 0);
      const key = String(n);
      if (seen.has(key)) continue;
      seen.add(key);
      diags.push({ from, to: line.to, severity: 'error', message: 'Unknown pragma' });
    }
  }
  return diags;
}

function rangesOverlap(a, b) { return a.from < b.to && b.from < a.to; }

function mergeDiagsByOverlap(primary, secondary) {
  const merged = primary.slice();
  for (const d of secondary) {
    if (!primary.some((e) => rangesOverlap(e, d))) merged.push(d);
  }
  merged.sort((a, b) => a.from - b.from);
  return merged;
}

function metaVarBinding(node, doc) {
  if (node.name !== 'ParameterVariable' && node.name !== 'SubstitutionVariable') return null;
  const id = metaVarIdent(node);
  if (!id) return null;
  return {
    name: doc.sliceString(node.from, id.to),
    bindFrom: node.from,
    bindTo: id.to,
    skipFrom: id.from,
    skipTo: id.to,
  };
}

function collectCompTypeBinderIds(binder, doc) {
  const out = [];
  const a = binder.firstChild;
  if (!a) return out;
  if (a.name === 'LowerIdentifier' || a.name === 'UpperIdentifier') {
    out.push(binding(doc, a));
    return out;
  }
  const mv = metaVarBinding(a, doc);
  if (mv) {
    out.push(mv);
    return out;
  }
  return out;
}

function collectPiBinderIds(piBinder, doc) {
  const id = firstIdentChild(piBinder);
  return id ? [binding(doc, id)] : [];
}

function collectLfDependent(node, doc) {
  const open = node.firstChild;
  if (!open || open.name !== '{') return null;
  const pi = open.nextSibling;
  if (!pi || pi.name !== 'PiBinder') return null;
  const bindings = collectPiBinderIds(pi, doc);
  if (!bindings.length) return null;
  let p = pi.nextSibling;
  while (p && p.name !== '}') p = p.nextSibling;
  if (!p || p.name !== '}') return null;
  const rhs = p.nextSibling;
  if (!rhs) return null;
  return { bindings, scopeFrom: rhs.from, scopeTo: node.to };
}

function collectWrappedBinderDependent(node, doc, rhsKind) {
  const open = node.firstChild;
  if (!open || (open.name !== '{' && open.name !== '(')) return null;
  const closer = open.name === '{' ? '}' : ')';
  const binder = open.nextSibling;
  if (!binder || binder.name !== 'CompTypeBinder') return null;
  const bindings = collectCompTypeBinderIds(binder, doc);
  if (!bindings.length) return null;
  let p = binder.nextSibling;
  while (p && p.name !== closer) p = p.nextSibling;
  if (!p || p.name !== closer) return null;
  const rhs = p.nextSibling;
  if (!rhs || rhs.name !== rhsKind) return null;
  return { bindings, scopeFrom: rhs.from, scopeTo: node.to };
}

function collectCompDependent(node, doc) { return collectWrappedBinderDependent(node, doc, 'CompType'); }
function collectCompKindDependent(node, doc) { return collectWrappedBinderDependent(node, doc, 'CompKind'); }

function collectSchemaSomeBindings(bindingsRoot, doc, acc) {
  for (let c = bindingsRoot.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LowerIdentifier') {
      const name = txt(c, doc);
      acc.push(binding(doc, c));
      acc.push({ name: `#${name}`, bindFrom: null, bindTo: null });
    }
  }
}

function schemaSomeFrame(schemaElement, doc) {
  const some = firstChildNamed(schemaElement, 'SchemaSomeBlock');
  const block = firstChildNamed(schemaElement, 'LFBlock');
  if (!some || !block) return null;
  const wrap = firstChildNamed(some, 'SchemaSomeBindings');
  const bindings = [];
  if (wrap) collectSchemaSomeBindings(wrap, doc, bindings);
  if (!bindings.length) return null;
  return { bindings, scopeFrom: block.from, scopeTo: block.to };
}

function contextHatBindings(hatNode, doc) {
  const bindings = [];
  for (let c = hatNode.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LowerIdentifier') bindings.push(binding(doc, c));
  }
  return bindings;
}

function firstLFTermChild(node) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LFTerm') return c;
  }
  return null;
}

function angleHatFrame(angleHat, doc) {
  const hat = firstChildNamed(angleHat, 'ContextHat');
  const term = firstLFTermChild(angleHat);
  if (!hat || !term) return null;
  const bindings = contextHatBindings(hat, doc);
  if (!bindings.length) return null;
  return { bindings, scopeFrom: term.from, scopeTo: term.to };
}

function collectContextBindings(partRoot, doc, acc) {
  partRoot.cursor().iterate(ref => {
    if (ref.name === 'ContextEntry' || ref.name === 'LFBlockField') {
      const id = firstChildNamed(ref.node, 'LowerIdentifier');
      if (id) acc.push(binding(doc, id));
    }
  });
}

function collectContextHeadBindings(partRoot, doc, acc) {
  const head = firstChildNamed(partRoot, 'ContextHead');
  if (!head) return;
  const id = firstChildNamed(head, 'LowerIdentifier');
  if (id) acc.push(binding(doc, id));
}

function collectAtomicPatternUpperBinder(patternSubtree, doc, acc) {
  patternSubtree.cursor().iterate(ref => {
    if (ref.name !== 'AtomicPattern') return;
    const leaf = ref.node.firstChild;
    if (leaf && leaf.name === 'UpperIdentifier') acc.push(binding(doc, leaf));
  });
}

function quantifiedBinders(parent, doc, acc) {
  for (let c = parent.firstChild; c; c = c.nextSibling) {
    if (c.name !== 'QuantifiedBinder') break;
    const wrapped = firstChildNamed(c, 'CompTypeBinder');
    if (wrapped) {
      for (const b of collectCompTypeBinderIds(wrapped, doc)) acc.push(b);
    }
  }
}

function caseBranchBindings(branch, doc) {
  const bindings = [];
  quantifiedBinders(branch, doc, bindings);
  const pat = firstChildNamed(branch, 'Pattern');
  if (pat) collectAtomicPatternUpperBinder(pat, doc, bindings);
  return bindings;
}

function letExpressionBindings(node, doc) {
  const quantified = [];
  quantifiedBinders(node, doc, quantified);
  const pat = firstChildNamed(node, 'Pattern');
  const pattern = [];
  if (pat) collectAtomicPatternUpperBinder(pat, doc, pattern);
  const body = lastChildNamed(node, 'Expression');
  return { quantified, pattern, pat, body };
}

function fnParams(fnExpr, doc) {
  const bindings = [];
  for (let c = fnExpr.firstChild; c; c = c.nextSibling) {
    if (c.name === 'FnParam') {
      const id = firstChildNamed(c, 'LowerIdentifier');
      if (id) bindings.push(binding(doc, id));
    }
  }
  return bindings;
}

function mlamParams(mlam, doc) {
  const bindings = [];
  for (let c = mlam.firstChild; c; c = c.nextSibling) {
    if (c.name !== 'MLamParam') continue;
    const first = c.firstChild;
    if (!first) continue;
    const mv = metaVarBinding(first, doc);
    if (mv) {
      bindings.push(mv);
      continue;
    }
    const id = firstChildNamed(c, 'LowerIdentifier') || firstChildNamed(c, 'UpperIdentifier');
    if (id) bindings.push(binding(doc, id));
  }
  return bindings;
}

function recBindings(recDecl, doc) {
  const bindings = [];
  for (let c = recDecl.firstChild; c; c = c.nextSibling) {
    if (c.name === 'RecBody') {
      const id = firstChildNamed(c, 'LowerIdentifier');
      if (id) bindings.push(binding(doc, id));
    }
  }
  return bindings;
}

function declLowerBindings(decl, doc) {
  const id = firstChildNamed(decl, 'LowerIdentifier');
  if (!id) return [];
  return [binding(doc, id)];
}

function lfDeclBindings(decl, doc) {
  const id = firstIdentChild(decl);
  if (!id) return [];
  return [binding(doc, id)];
}

function lfDatatypeBindings(decl, doc) {
  const bindings = [];
  for (let c = decl.firstChild; c; c = c.nextSibling) {
    // Every mutual family head (`LF n … and a … and p …`) binds a type family,
    // not just the first — isLFDatatypeHead recognises the post-`and` heads too.
    if ((c.name === 'LowerIdentifier' || c.name === 'UpperIdentifier') && isLFDatatypeHead(c)) {
      bindings.push(binding(doc, c));
      continue;
    }
    if (c.name === 'LFConstructor') {
      const id = firstIdentChild(c);
      if (id) bindings.push(binding(doc, id));
    }
  }
  return bindings;
}

function typedefBindings(decl, doc) {
  for (let c = decl.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LowerIdentifier' || c.name === 'UpperIdentifier') return [binding(doc, c)];
  }
  return [];
}

function schemaDeclBindings(decl, doc) {
  const id = firstChildNamed(decl, 'LowerIdentifier');
  if (!id) return [];
  return [binding(doc, id)];
}

// Type-family name + its constructors/destructors. Names may be lower- or
// upper-case (the grammar accepts both), so use firstIdentChild rather than a
// fixed case.
function inductiveFamilyBindings(body, doc) {
  const bindings = [];
  const tid = firstIdentChild(body);
  if (tid) bindings.push(binding(doc, tid));
  for (let c = body.firstChild; c; c = c.nextSibling) {
    if (c.name === 'CompConstructor' || c.name === 'CompDestructor') {
      const id = firstIdentChild(c);
      if (id) bindings.push(binding(doc, id));
    }
  }
  return bindings;
}

function inductiveDeclBindings(decl, doc) {
  const bindings = [];
  for (let c = decl.firstChild; c; c = c.nextSibling) {
    if (c.name === 'InductiveBody')
      bindings.push(...inductiveFamilyBindings(c, doc));
  }
  return bindings;
}

function stratifiedDeclBindings(decl, doc) {
  const body = firstChildNamed(decl, 'InductiveBody');
  return body ? inductiveFamilyBindings(body, doc) : [];
}

function coinductiveDeclBindings(decl, doc) {
  const bindings = [];
  for (let c = decl.firstChild; c; c = c.nextSibling) {
    if (c.name === 'CoinductiveBody')
      bindings.push(...inductiveFamilyBindings(c, doc));
  }
  return bindings;
}

const MODULE_TAIL_COLLECTORS = {
  LetDeclaration: declLowerBindings,
  ProofDeclaration: declLowerBindings,
  LFDeclaration: lfDeclBindings,
  LFDatatypeDeclaration: lfDatatypeBindings,
  TypedefDeclaration: typedefBindings,
  SchemaDeclaration: schemaDeclBindings,
  InductiveDeclaration: inductiveDeclBindings,
  StratifiedDeclaration: stratifiedDeclBindings,
  CoinductiveDeclaration: coinductiveDeclBindings,
};

function moduleTailTo(moduleEndStack, declNode) {
  const modEnd = moduleEndStack[moduleEndStack.length - 1];
  if (modEnd != null) return modEnd;
  const parent = declNode.parent;
  return parent ? parent.to : declNode.to;
}

function bindingDefinesSite(b, from, to) {
  if (b.bindFrom != null && b.bindTo != null && b.bindFrom === from && b.bindTo === to) return true;
  if (b.skipFrom != null && b.skipFrom === from && b.skipTo === to) return true;
  return false;
}

function resolveUseBound(stack, moduleLets, from, to, name) {
  for (let si = stack.length - 1; si >= 0; si--) {
    const frame = stack[si];
    if (from < frame.scopeFrom || to > frame.scopeTo) continue;
    for (const b of frame.bindings) {
      if (b.name !== name) continue;
      if (bindingDefinesSite(b, from, to)) return false;
      return true;
    }
  }
  for (let i = moduleLets.length - 1; i >= 0; i--) {
    const frame = moduleLets[i];
    if (from < frame.scopeFrom || to > frame.scopeTo) continue;
    for (const b of frame.bindings) {
      if (b.name !== name) continue;
      if (bindingDefinesSite(b, from, to)) return false;
      return true;
    }
  }
  return false;
}

function lowerExtent(node, doc, refFrom, refTo) {
  const p = node.parent;
  if (p?.name === 'ParameterVariable') {
    const h = p.firstChild;
    if (h?.name === '#') return { from: h.from, to: refTo, name: doc.sliceString(h.from, refTo) };
  }
  if (p?.name === 'SubstitutionVariable') {
    const h = p.firstChild;
    if (h?.name === '$') return { from: h.from, to: refTo, name: doc.sliceString(h.from, refTo) };
  }
  return { from: refFrom, to: refTo, name: doc.sliceString(refFrom, refTo) };
}

function upperExtent(node, doc, refFrom, refTo) {
  const p = node.parent;
  if (p?.name === 'SubstitutionVariable') {
    const h = p.firstChild;
    if (h?.name === '#' || h?.name === '$') {
      return { from: h.from, to: refTo, name: doc.sliceString(h.from, refTo) };
    }
  }
  return { from: refFrom, to: refTo, name: doc.sliceString(refFrom, refTo) };
}

// Parse-fault diagnostics: error nodes + unknown-pragma lines. Optional
// `range` bounds the tree iterate (last-block remap in the syntax store).
export function collectParseDiagnostics(tree, doc, opts = {}) {
  const { blocks, blockAt } = opts.blocks && opts.blockAt
    ? opts
    : computeLintBlocks(tree, doc);
  const range = opts.range || null;

  const parseDiags = [];
  const parseDiagSeen = new Set();
  // Blocks that received a real (non-zero-width) parse diagnostic, and the
  // first zero-width (missing-token) error seen per block. Zero-width errors
  // only surface when the block has no spanning error — otherwise they're
  // recovery echoes of the same fault.
  const realDiagBlocks = new Set();
  const zeroWidthByBlock = new Map();

  function pushParseDiag(from, to, message, blockFrom, blockTo) {
    if (from >= to) return;
    const cf = Math.max(from, blockFrom);
    const ct = Math.min(to, blockTo);
    if (cf >= ct) return;
    const key = `${cf}:${ct}`;
    if (parseDiagSeen.has(key)) return;
    parseDiagSeen.add(key);
    const hit = blockAt(cf);
    if (hit) realDiagBlocks.add(hit.index);
    parseDiags.push({ from: cf, to: ct, severity: 'error', message });
  }

  // A zero-width error node marks where the parser expected a token that never
  // came (unclosed paren, missing colon). Anchor the squiggle on the last real
  // token before that point so the user sees WHERE the construct broke off.
  function zeroWidthAnchor(pos, blockFrom, blockTo) {
    let end = Math.min(Math.max(pos, blockFrom), blockTo);
    while (end > blockFrom && /\s/.test(doc.sliceString(end - 1, end))) end -= 1;
    let start = end;
    while (start > blockFrom && !/[\s([{:.,;|]/.test(doc.sliceString(start - 1, start))) start -= 1;
    if (start === end) {
      start = Math.max(blockFrom, Math.min(pos, blockTo - 1));
      end = Math.min(blockTo, start + 1);
    }
    if (start >= end) return null;
    return { from: start, to: end };
  }

  const iterateSpec = {
    enter(ref) {
      const hit = blockAt(ref.from);
      if (!hit) return;
      if (range && (hit.block.to <= range.from || hit.block.from >= range.to)) return;
      const node = ref.node;
      const n = node.name;
      const { from: bFrom, to: bTo } = hit.block;
      if (lineIsBadPragma(doc, ref.from)) return;
      if (n === PARSE_ERROR && node.from < node.to) {
        if (node.from >= bFrom && node.to <= bTo) {
          pushParseDiag(node.from, node.to, messageAt(ref.from, doc), bFrom, bTo);
        }
      } else if (node.type.isError && node.from < node.to && n !== PARSE_ERROR) {
        if (!node.firstChild && node.from >= bFrom && node.to <= bTo) {
          pushParseDiag(node.from, node.to, messageAt(ref.from, doc), bFrom, bTo);
        }
      } else if (node.type.isError && node.from === node.to) {
        if (!zeroWidthByBlock.has(hit.index)) {
          zeroWidthByBlock.set(hit.index, { pos: node.from, bFrom, bTo });
        }
      } else if (
        node.firstChild == null &&
        node.from < node.to &&
        n !== 'LineComment' &&
        n !== 'BlockComment' &&
        inParseErrorContext(node, bFrom, bTo)
      ) {
        pushParseDiag(ref.from, ref.to, messageAt(ref.from, doc), bFrom, bTo);
      }
    },
  };
  if (range) {
    iterateSpec.from = range.from;
    iterateSpec.to = range.to;
  }
  tree.iterate(iterateSpec);

  // Surface missing-token faults in blocks that produced no spanning error —
  // without this, an unclosed paren in one block shows NOTHING here while a
  // different block's error shows, reading as "only one error at a time".
  for (const [blockIndex, zw] of zeroWidthByBlock) {
    if (realDiagBlocks.has(blockIndex)) continue;
    const anchor = zeroWidthAnchor(zw.pos, zw.bFrom, zw.bTo);
    if (!anchor) continue;
    pushParseDiag(anchor.from, anchor.to, 'Syntax error: incomplete declaration', zw.bFrom, zw.bTo);
  }

  const pragmaBlocks = range
    ? blocks.filter((b) => b.to > range.from && b.from < range.to)
    : blocks;
  const pragmaDiags = collectBadPragmaLineDiags(pragmaBlocks, doc);
  return mergeDiagsByOverlap(parseDiags, pragmaDiags);
}

// Name pass: binder-stack scope resolution → definedNames / defMap / uses.
// Deferred until a consumer actually asks (hover, scope tint, settlement
// masking); never on the raw keystroke path.
function doNamesWalk(tree, doc, blockAt) {
  const definedNames = [];
  const defMap = new Map();
  const uses = [];

  let inLFDatatype = false;
  let lfDatatypeKeywordSeen = false;

  const stack = [];
  const moduleLets = [];
  const moduleEndStack = [];

  function noteDefinedName(from, to) {
    const hit = blockAt(from);
    definedNames.push({
      name: doc.sliceString(from, to),
      from,
      blockIndex: hit ? hit.index : -1,
    });
  }

  function addDefMapEntryFor(id, node) {
    if (!id) return;
    const name = doc.sliceString(id.from, id.to);
    const entry = {
      ident: id,
      declParent: node,
      isUpper: id.name === 'UpperIdentifier',
    };
    const list = defMap.get(name);
    if (list) list.push(entry); else defMap.set(name, [entry]);
  }

  function addDefMapEntry(node) {
    // A mutual LF block (`LF n … and a … and p …`) is ONE LFDatatypeDeclaration
    // with several type-family heads. Each head must be navigable / resolvable,
    // not just the first — otherwise references to `a`/`p` fall through to the
    // implicit-binder guess.
    if (node.name === 'LFDatatypeDeclaration') {
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if ((c.name === 'LowerIdentifier' || c.name === 'UpperIdentifier') && isLFDatatypeHead(c)) {
          addDefMapEntryFor(c, node);
        }
      }
      return;
    }
    addDefMapEntryFor(firstIdentChild(node), node);
  }

  tree.iterate({
    enter(ref) {
      const node = ref.node;
      const n = node.name;

      if (n === 'ModuleDeclaration') moduleEndStack.push(node.to);

      switch (n) {
        case 'LFLambda': {
          const binder = firstChildNamed(node, 'LFLambdaBinder');
          const id = binder && firstChildNamed(binder, 'LowerIdentifier');
          const bindings = id ? [binding(doc, id)] : [];
          stack.push({ bindings, scopeFrom: node.from, scopeTo: node.to });
          break;
        }
        case 'FnExpression':
          stack.push({ bindings: fnParams(node, doc), scopeFrom: node.from, scopeTo: node.to });
          break;
        case 'MLamExpression':
          stack.push({ bindings: mlamParams(node, doc), scopeFrom: node.from, scopeTo: node.to });
          break;
        case 'ContextualType':
        case 'ContextualObject': {
          const bindings = [];
          const part = firstChildNamed(node, 'ContextPart');
          if (part) {
            collectContextBindings(part, doc, bindings);
            collectContextHeadBindings(part, doc, bindings);
          }
          stack.push({ bindings, scopeFrom: node.from, scopeTo: node.to });
          break;
        }
        case 'LetExpression': {
          const { quantified, pattern, pat, body } = letExpressionBindings(node, doc);
          if (quantified.length && pat) {
            stack.push({ bindings: quantified, scopeFrom: pat.from, scopeTo: node.to });
          }
          if (pattern.length && body) {
            stack.push({ bindings: pattern, scopeFrom: body.from, scopeTo: body.to });
          }
          break;
        }
        case 'CaseBranch':
          stack.push({ bindings: caseBranchBindings(node, doc), scopeFrom: node.from, scopeTo: node.to });
          break;
        case 'RecDeclaration':
          stack.push({ bindings: recBindings(node, doc), scopeFrom: node.from, scopeTo: node.to });
          break;
        case 'SchemaElement': {
          const sf = schemaSomeFrame(node, doc);
          if (sf) stack.push(sf);
          break;
        }
        case 'AngleHatTerm': {
          const af = angleHatFrame(node, doc);
          if (af) stack.push(af);
          break;
        }
        default: {
          const lfDep = (n === 'LFType' || n === 'LFKind') ? collectLfDependent(node, doc) : null;
          if (lfDep) stack.push(lfDep);
          const ctDep = n === 'CompType' ? collectCompDependent(node, doc) : null;
          if (ctDep) stack.push(ctDep);
          const ckDep = n === 'CompKind' ? collectCompKindDependent(node, doc) : null;
          if (ckDep) stack.push(ckDep);
        }
      }

      if (GLOBAL_DECL_PARENT.has(n)) addDefMapEntry(node);

      if (n === 'LFDatatypeDeclaration') {
        inLFDatatype = true;
        lfDatatypeKeywordSeen = false;
      }
      if (inLFDatatype) {
        // `and` opens another mutual family whose head is also a defined name.
        if (n === 'LFKeyword' || n === 'DatatypeKeyword' || n === 'AndKeyword') {
          lfDatatypeKeywordSeen = true;
        } else if ((n === 'LowerIdentifier' || n === 'UpperIdentifier') && lfDatatypeKeywordSeen) {
          noteDefinedName(ref.from, ref.to);
          lfDatatypeKeywordSeen = false;
        }
      }

      if (n === 'LowerIdentifier') {
        const parent = node.parent;
        if (parent) {
          const p = parent.name;
          if (p === 'LFConstructor' ||
              p === 'SchemaDeclaration' ||
              p === 'TypedefDeclaration' ||
              p === 'RecBody' ||
              p === 'ProofDeclaration' ||
              p === 'InductiveBody' ||
              p === 'CoinductiveBody' ||
              p === 'CompConstructor' ||
              p === 'CompDestructor' ||
              p === 'LetDeclaration') {
            noteDefinedName(ref.from, ref.to);
          } else if (p === 'LFDeclaration') {
            let hasDot = false, hasError = false;
            for (let c = parent.firstChild; c; c = c.nextSibling) {
              if (c.name === '.') hasDot = true;
              if (c.type.isError) hasError = true;
            }
            if (hasDot && !hasError) noteDefinedName(ref.from, ref.to);
          }
        }

        const ext = lowerExtent(node, doc, ref.from, ref.to);
        const bound = resolveUseBound(stack, moduleLets, ext.from, ext.to, ext.name);
        uses.push({
          from: ext.from,
          to: ext.to,
          name: ext.name,
          kind: 'lower',
          bound,
        });
      } else if (n === 'UpperIdentifier') {
        const parent = node.parent;
        if (parent) {
          const p = parent.name;
          if (p === 'InductiveBody' ||
              p === 'CoinductiveBody' ||
              p === 'CompConstructor' ||
              p === 'CompDestructor' ||
              p === 'TypedefDeclaration' ||
              p === 'ModuleDeclaration' ||
              p === 'ProofDeclaration' ||
              p === 'LFConstructor') {
            noteDefinedName(ref.from, ref.to);
          } else if (p === 'LFDeclaration') {
            let hasDot = false, hasError = false;
            for (let c = parent.firstChild; c; c = c.nextSibling) {
              if (c.name === '.') hasDot = true;
              if (c.type.isError) hasError = true;
            }
            if (hasDot && !hasError) noteDefinedName(ref.from, ref.to);
          }
        }

        const ext = upperExtent(node, doc, ref.from, ref.to);
        const bound = resolveUseBound(stack, moduleLets, ext.from, ext.to, ext.name);
        uses.push({
          from: ext.from,
          to: ext.to,
          name: ext.name,
          kind: 'upper',
          bound,
        });
      }
    },
    leave(ref) {
      const node = ref.node;
      const n = node.name;

      const tailCollect = MODULE_TAIL_COLLECTORS[n];
      if (tailCollect) {
        const bindings = tailCollect(node, doc);
        if (bindings.length) {
          moduleLets.push({
            bindings,
            scopeFrom: node.to,
            scopeTo: moduleTailTo(moduleEndStack, node),
          });
        }
      }

      if (n === 'ModuleDeclaration') moduleEndStack.pop();

      switch (n) {
        case 'LFLambda':
        case 'FnExpression':
        case 'MLamExpression':
        case 'ContextualType':
        case 'ContextualObject':
        case 'CaseBranch':
        case 'RecDeclaration':
          stack.pop();
          break;
        case 'LetExpression': {
          const { quantified, pattern, pat, body } = letExpressionBindings(node, doc);
          if (pattern.length && body) stack.pop();
          if (quantified.length && pat) stack.pop();
          break;
        }
        case 'SchemaElement':
          if (schemaSomeFrame(node, doc)) stack.pop();
          break;
        case 'AngleHatTerm':
          if (angleHatFrame(node, doc)) stack.pop();
          break;
        default:
          if (n === 'LFType' || n === 'LFKind') {
            if (collectLfDependent(node, doc)) stack.pop();
          } else if (n === 'CompType') {
            if (collectCompDependent(node, doc)) stack.pop();
          } else if (n === 'CompKind') {
            if (collectCompKindDependent(node, doc)) stack.pop();
          }
      }

      if (n === 'LFDatatypeDeclaration') {
        inLFDatatype = false;
        lfDatatypeKeywordSeen = false;
      }
    },
  });

  return { definedNames, defMap, uses };
}

// Block-level dependency map derived from the walk: defining block index →
// the set of block indices that USE a name it defines. This is the impact
// relation the multi-pass settlement uses — when a block errors, everything
// downstream of it can't be trusted (its errors would be induced "unbound
// identifier" noise), so the whole impacted set is masked together.
export function blockDependents(tree, doc) {
  const summary = walkTree(tree, doc);
  const defs = new Map();
  for (const d of summary.definedNames) {
    if (d.blockIndex == null || d.blockIndex < 0) continue;
    let set = defs.get(d.name);
    if (!set) { set = new Set(); defs.set(d.name, set); }
    set.add(d.blockIndex);
  }
  const dependents = new Map();
  for (const u of summary.uses) {
    if (u.bound) continue;
    const defBlocks = defs.get(u.name);
    if (!defBlocks) continue;
    const hit = summary.blockAt(u.from);
    if (!hit) continue;
    for (const defIdx of defBlocks) {
      if (defIdx === hit.index) continue;
      let set = dependents.get(defIdx);
      if (!set) { set = new Set(); dependents.set(defIdx, set); }
      set.add(hit.index);
    }
  }
  return dependents;
}

// Single canonical pass over the Lezer tree producing the per-tree
// summary consumed by lint, resolver, scope-highlight, and (Phase B+)
// the Decl Graph cascade.
//
// Memoized per Lezer tree via WeakMap — the existing per-module
// caches (_blocksCache in bel-units, _lintCache in bel-lint,
// _declMapCache in bel-resolve, scope-highlight's internal walk)
// collapse into this single cache, eliminating drift between modules.
//
// Phase A scope (what the walker produces today):
//   blocks         — clustered top-level lint blocks (delegated to
//                    computeLintBlocks in bel-units)
//   blockAt        — pos → { index, block } lookup, identical to bel-units'
//   definedNames   — defined identifier sites (replaces collectDefinedNames
//                    in bel-lint)
//   defMap         — name → declaration entry list (replaces buildDeclMap
//                    in bel-resolve)
//   parseDiags     — parser-error diagnostics (replaces collectParserErrors
//                    in bel-lint)
//   uses           — identifier references with extent + bound/free verdict
//                    (replaces scope-highlight's internal walk; lets
//                    Phase B dep-edge builder skip its own walk)
//
// Phase B will add per-decl AST fingerprints, exported-signature subranges,
// and resolved target NodeIds on the use edges to this same summary
// without re-walking.

import {
  GAP_PRAGMA_LINE,
  lfDeclarationHasColon,
  lineSyntaxMessage,
  computeLintBlocks,
} from './bel-units.mjs';

const PARSE_ERROR = '⚠';
const BAD_DOUBLE_DASH_LINE = /^\s*--/;

// Global declaration parent nodes whose first identifier child names the
// declared entity. (Was duplicated in bel-resolve; canonical here now.)
const GLOBAL_DECL_PARENT = new Set([
  'LFDeclaration',
  'LFDatatypeDeclaration',
  'LFConstructor',
  'SchemaDeclaration',
  'TypedefDeclaration',
  'LetDeclaration',
  'ModuleDeclaration',
  'InductiveBody',
  'CompConstructor',
  'RecBody',
]);

const _summaryCache = new WeakMap();

export function walkTree(tree, doc) {
  let s = _summaryCache.get(tree);
  if (s) return s;
  s = doWalk(tree, doc);
  _summaryCache.set(tree, s);
  return s;
}

// ---------------------------------------------------------------------------
// Shared helpers (moved from bel-lint and bel-resolve).
// ---------------------------------------------------------------------------

function firstIdentChild(node) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LowerIdentifier' || c.name === 'UpperIdentifier') return c;
  }
  return null;
}

function firstChildNamed(node, name) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === name) return c;
  }
  return null;
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

// ---------------------------------------------------------------------------
// Binder collectors (moved from bel-scope-highlight).
// Each returns a Frame { bindings, scopeFrom, scopeTo } or a list of
// Bindings to splice into an outer frame.
// ---------------------------------------------------------------------------

function collectCompTypeBinderIds(binder, doc) {
  const out = [];
  const a = binder.firstChild;
  if (!a) return out;
  if (a.name === 'LowerIdentifier' || a.name === 'UpperIdentifier') {
    out.push(binding(doc, a));
    return out;
  }
  // Tagged binders: parameter variable `#p:[...]`, legacy `#S:[...]`,
  // modern substitution `$S:$[...]`, and Greek-lowercase `$ρ:$[...]`.
  // The binder name INCLUDES the prefix so later use-references that
  // also carry the prefix (per lowerExtent/upperExtent) match.
  if (a.name === '#' || a.name === '$') {
    const id = a.nextSibling;
    if (id && (id.name === 'UpperIdentifier' || id.name === 'LowerIdentifier')) {
      out.push({
        name: doc.sliceString(a.from, id.to),
        bindFrom: a.from,
        bindTo: id.to,
        skipFrom: id.from,
        skipTo: id.to,
      });
    }
    return out;
  }
  return out;
}

function collectLfDependent(node, doc) {
  const open = node.firstChild;
  if (!open || open.name !== '{') return null;
  const id = open.nextSibling;
  if (!id || id.name !== 'LowerIdentifier') return null;
  let p = id.nextSibling;
  while (p && p.name !== '}') p = p.nextSibling;
  if (!p || p.name !== '}') return null;
  const rhs = p.nextSibling;
  if (!rhs) return null;
  return { bindings: [binding(doc, id)], scopeFrom: rhs.from, scopeTo: node.to };
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

function quantifiedBinders(caseBranch, doc, acc) {
  for (let c = caseBranch.firstChild; c; c = c.nextSibling) {
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

function letPatternBindings(patternNode, doc) {
  const bindings = [];
  collectAtomicPatternUpperBinder(patternNode, doc, bindings);
  return bindings;
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
    // Tagged binders `#p` / `$S` / `$ρ` extend the binding name through
    // the prefix so later use-references that also carry the prefix can
    // match (the scope resolver compares extended names).
    if (first.name === '#' || first.name === '$') {
      const id = first.nextSibling;
      if (id && (id.name === 'LowerIdentifier' || id.name === 'UpperIdentifier')) {
        bindings.push({
          name: doc.sliceString(first.from, id.to),
          bindFrom: first.from,
          bindTo: id.to,
          skipFrom: id.from,
          skipTo: id.to,
        });
      }
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

// Module-tail collectors: bindings that scope from the declaration's end
// to the closing `end` of the enclosing module.

function declLowerBindings(decl, doc) {
  const id = firstChildNamed(decl, 'LowerIdentifier');
  if (!id) return [];
  return [binding(doc, id)];
}

function lfDatatypeBindings(decl, doc) {
  const bindings = [];
  let sawTypeName = false;
  for (let c = decl.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LowerIdentifier' && !sawTypeName) {
      sawTypeName = true;
      bindings.push(binding(doc, c));
      continue;
    }
    if (c.name === 'LFConstructor') {
      const id = firstChildNamed(c, 'LowerIdentifier');
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

function inductiveFamilyBindings(body, doc) {
  const bindings = [];
  const tid = firstChildNamed(body, 'UpperIdentifier');
  if (tid) bindings.push(binding(doc, tid));
  for (let c = body.firstChild; c; c = c.nextSibling) {
    if (c.name === 'CompConstructor') {
      const id = firstChildNamed(c, 'UpperIdentifier');
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

const MODULE_TAIL_COLLECTORS = {
  LetDeclaration: declLowerBindings,
  LFDeclaration: declLowerBindings,
  LFDatatypeDeclaration: lfDatatypeBindings,
  TypedefDeclaration: typedefBindings,
  SchemaDeclaration: schemaDeclBindings,
  InductiveDeclaration: inductiveDeclBindings,
  StratifiedDeclaration: stratifiedDeclBindings,
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
  // Modern substitution variables can use `$` + lowercase Greek (`$ρ`).
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
    // Both legacy `#S` and modern `$S` are recognised — accept either prefix.
    if (h?.name === '#' || h?.name === '$') {
      return { from: h.from, to: refTo, name: doc.sliceString(h.from, refTo) };
    }
  }
  return { from: refFrom, to: refTo, name: doc.sliceString(refFrom, refTo) };
}

// ---------------------------------------------------------------------------
// The single canonical pass.
//
// One tree.iterate run threads four concerns through a shared cursor:
//   (a) defMap         — every GLOBAL_DECL_PARENT node contributes its
//                        primary identifier child to the name lookup map.
//   (b) definedNames   — identifier sites recognized as definitions by
//                        their parent role (matches bel-lint's old logic).
//   (c) parseDiags     — error nodes, leaf tokens in error context, and
//                        stray ⚠ markers within each lint block.
//   (d) uses           — every identifier reference, with extent and a
//                        bound/free verdict computed against the live
//                        binder stack and module-tail frames.
//
// (a) (b) (c) write to disjoint outputs and don't observe each other.
// (d) needs the binder stack maintained across enter/leave; everything
// stays consistent because the stack/moduleLets are pushed/popped in the
// same enter/leave boundaries scope-highlight used to use.
// ---------------------------------------------------------------------------

function doWalk(tree, doc) {
  const { blocks, blockAt } = computeLintBlocks(tree, doc);

  const parseDiags = [];
  const definedNames = [];
  const defMap = new Map();
  const uses = [];
  const parseDiagSeen = new Set();

  let inLFDatatype = false;
  let lfDatatypeKeywordSeen = false;

  // Binder stack for (d) — push on enter, pop on leave.
  const stack = [];
  const moduleLets = [];
  const moduleEndStack = [];

  function pushParseDiag(from, to, message, blockFrom, blockTo) {
    if (from >= to) return;
    const cf = Math.max(from, blockFrom);
    const ct = Math.min(to, blockTo);
    if (cf >= ct) return;
    const key = `${cf}:${ct}`;
    if (parseDiagSeen.has(key)) return;
    parseDiagSeen.add(key);
    parseDiags.push({ from: cf, to: ct, severity: 'error', message });
  }

  function noteDefinedName(from, to) {
    const hit = blockAt(from);
    definedNames.push({
      name: doc.sliceString(from, to),
      from,
      blockIndex: hit ? hit.index : -1,
    });
  }

  function addDefMapEntry(node) {
    const id = firstIdentChild(node);
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

  tree.iterate({
    enter(ref) {
      const node = ref.node;
      const n = node.name;

      // ===== (d) binder stack pushes (mirror of scope-highlight's switch) =====
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
          const pat = firstChildNamed(node, 'Pattern');
          const body = lastChildNamed(node, 'Expression');
          const bindings = pat && body ? letPatternBindings(pat, doc) : [];
          const scopeFrom = body ? body.from : node.from;
          const scopeTo = body ? body.to : node.to;
          stack.push({ bindings, scopeFrom, scopeTo });
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

      // ===== (a) defMap =====
      if (GLOBAL_DECL_PARENT.has(n)) addDefMapEntry(node);

      // ===== (b) definedNames: LFDatatype state =====
      if (n === 'LFDatatypeDeclaration') {
        inLFDatatype = true;
        lfDatatypeKeywordSeen = false;
      }
      if (inLFDatatype) {
        if (n === 'LFKeyword' || n === 'DatatypeKeyword') {
          lfDatatypeKeywordSeen = true;
        } else if (n === 'LowerIdentifier' && lfDatatypeKeywordSeen) {
          noteDefinedName(ref.from, ref.to);
          lfDatatypeKeywordSeen = false;
        }
      }

      // ===== (b) definedNames: identifier-by-parent-role =====
      if (n === 'LowerIdentifier') {
        const parent = node.parent;
        if (parent) {
          const p = parent.name;
          if (p === 'LFConstructor' ||
              p === 'SchemaDeclaration' ||
              p === 'TypedefDeclaration' ||
              p === 'RecBody' ||
              p === 'LetDeclaration') {
            noteDefinedName(ref.from, ref.to);
          } else if (p === 'LFDeclaration') {
            // Only count complete `name : type.` declarations.
            let hasDot = false, hasError = false;
            for (let c = parent.firstChild; c; c = c.nextSibling) {
              if (c.name === '.') hasDot = true;
              if (c.type.isError) hasError = true;
            }
            if (hasDot && !hasError) noteDefinedName(ref.from, ref.to);
          }
        }

        // ===== (d) uses for LowerIdentifier =====
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
              p === 'CompConstructor' ||
              p === 'TypedefDeclaration' ||
              p === 'ModuleDeclaration') {
            noteDefinedName(ref.from, ref.to);
          }
        }

        // ===== (d) uses for UpperIdentifier =====
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

      // ===== (c) parseDiags =====
      const hit = blockAt(ref.from);
      if (hit) {
        const { from: bFrom, to: bTo } = hit.block;
        if (!lineIsBadPragma(doc, ref.from)) {
          const msg = messageAt(ref.from, doc);
          if (n === PARSE_ERROR && node.from < node.to) {
            if (node.from >= bFrom && node.to <= bTo) {
              pushParseDiag(node.from, node.to, msg, bFrom, bTo);
            }
          } else if (node.type.isError && node.from < node.to && n !== PARSE_ERROR) {
            if (!node.firstChild && node.from >= bFrom && node.to <= bTo) {
              pushParseDiag(node.from, node.to, msg, bFrom, bTo);
            }
          } else if (
            node.firstChild == null &&
            node.from < node.to &&
            n !== 'LineComment' &&
            n !== 'BlockComment' &&
            inParseErrorContext(node, bFrom, bTo)
          ) {
            pushParseDiag(ref.from, ref.to, msg, bFrom, bTo);
          }
        }
      }
    },
    leave(ref) {
      const node = ref.node;
      const n = node.name;

      // Module-tail bindings flow up to the enclosing module's scope.
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
        case 'LetExpression':
        case 'CaseBranch':
        case 'RecDeclaration':
          stack.pop();
          break;
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

  const pragmaDiags = collectBadPragmaLineDiags(blocks, doc);
  const mergedParseDiags = mergeDiagsByOverlap(parseDiags, pragmaDiags);

  return {
    blocks,
    blockAt,
    definedNames,
    defMap,
    parseDiags: mergedParseDiags,
    uses,
  };
}

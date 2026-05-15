// Scope-aware highlights: walk the Lezer tree with a binding stack, decorate
// resolved identifier uses (Prec.highest — overrides base tags from bel-language).
//
//   Syntax helpers → binder collectors → module tails → decoration walk → ViewPlugin

import { highlightingFor, syntaxTree } from '@codemirror/language';
import { tags as hlTags } from '@lezer/highlight';
import { Decoration, ViewPlugin } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

const tagBoundLower = hlTags.local(hlTags.variableName);
const tagBoundUpper = hlTags.local(hlTags.typeName);

function txt(node, doc) {
  return doc.sliceString(node.from, node.to);
}

function binding(doc, node) {
  return { name: txt(node, doc), bindFrom: node.from, bindTo: node.to };
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

/** @typedef {{ name: string, bindFrom?: number|null, bindTo?: number|null, skipFrom?: number, skipTo?: number }} Binding */
/** @typedef {{ bindings: Binding[], scopeFrom: number, scopeTo: number }} Frame */

function markFor(state, markCache, tag) {
  const cls = highlightingFor(state, [tag]);
  if (!cls) return null;
  let m = markCache[cls];
  if (!m) {
    m = Decoration.mark({ class: cls });
    markCache[cls] = m;
  }
  return m;
}

function overlapsViewport(from, to, view) {
  for (const r of view.visibleRanges) {
    if (to > r.from && from < r.to) return true;
  }
  return false;
}

function collectCompTypeBinderIds(binder, doc) {
  const out = [];
  const a = binder.firstChild;
  if (!a) return out;
  if (a.name === 'LowerIdentifier' || a.name === 'UpperIdentifier') {
    out.push(binding(doc, a));
    return out;
  }
  if (a.name === '#') {
    const id = a.nextSibling;
    if (id && id.name === 'UpperIdentifier') {
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

function lfDeclarationComplete(node) {
  let colon = false;
  let dot = false;
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === ':') colon = true;
    if (c.name === '.') dot = true;
  }
  return colon && dot;
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
  return {
    bindings: [binding(doc, id)],
    scopeFrom: rhs.from,
    scopeTo: node.to,
  };
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
  return {
    bindings,
    scopeFrom: rhs.from,
    scopeTo: node.to,
  };
}

function collectCompDependent(node, doc) {
  return collectWrappedBinderDependent(node, doc, 'CompType');
}

function collectCompKindDependent(node, doc) {
  return collectWrappedBinderDependent(node, doc, 'CompKind');
}

function collectSchemaSomeBindings(bindingsRoot, doc, acc) {
  for (let c = bindingsRoot.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LowerIdentifier') {
      const name = txt(c, doc);
      acc.push(binding(doc, c));
      acc.push({
        name: `#${name}`,
        bindFrom: null,
        bindTo: null,
      });
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
  return {
    bindings,
    scopeFrom: block.from,
    scopeTo: block.to,
  };
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
  return {
    bindings,
    scopeFrom: term.from,
    scopeTo: term.to,
  };
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
    if (c.name === 'MLamParam') {
      const id = firstChildNamed(c, 'LowerIdentifier') || firstChildNamed(c, 'UpperIdentifier');
      if (id) bindings.push(binding(doc, id));
    }
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

function bindingDefinesSite(b, from, to) {
  if (
    b.bindFrom != null &&
    b.bindTo != null &&
    b.bindFrom === from &&
    b.bindTo === to
  )
    return true;
  if (b.skipFrom != null && b.skipFrom === from && b.skipTo === to) return true;
  return false;
}

function moduleTailTo(moduleEndStack, declNode) {
  const modEnd = moduleEndStack[moduleEndStack.length - 1];
  if (modEnd != null) return modEnd;
  const parent = declNode.parent;
  return parent ? parent.to : declNode.to;
}

function pushModuleBindings(moduleLets, moduleEndStack, declNode, bindings) {
  if (!bindings.length) return;
  moduleLets.push({
    bindings,
    scopeFrom: declNode.to,
    scopeTo: moduleTailTo(moduleEndStack, declNode),
  });
}

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

function resolveUse(stack, moduleLets, from, to, name) {
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
    if (h?.name === '#')
      return {
        from: h.from,
        to: refTo,
        name: doc.sliceString(h.from, refTo),
      };
  }
  return {
    from: refFrom,
    to: refTo,
    name: doc.sliceString(refFrom, refTo),
  };
}

function upperExtent(node, doc, refFrom, refTo) {
  const p = node.parent;
  if (p?.name === 'SubstitutionVariable') {
    const h = p.firstChild;
    if (h?.name === '#')
      return {
        from: h.from,
        to: refTo,
        name: doc.sliceString(h.from, refTo),
      };
  }
  return {
    from: refFrom,
    to: refTo,
    name: doc.sliceString(refFrom, refTo),
  };
}

function buildDecorations(view, markCache) {
  const tree = syntaxTree(view.state);
  const doc = view.state.doc;
  const state = view.state;
  /** @type {Frame[]} */
  const stack = [];
  /** @type {Frame[]} */
  const moduleLets = [];
  /** @type {number[]} */
  const moduleEndStack = [];
  /** @type {{ from: number, to: number, deco: import('@codemirror/view').Decoration }[]} */
  const pendingMarks = [];

  const decorateId = (from, to, tag) => {
    if (!overlapsViewport(from, to, view)) return;
    const mk = markFor(state, markCache, tag);
    if (mk) pendingMarks.push({ from, to, deco: mk });
  };

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
          stack.push({
            bindings,
            scopeFrom: node.from,
            scopeTo: node.to,
          });
          break;
        }
        case 'FnExpression':
          stack.push({
            bindings: fnParams(node, doc),
            scopeFrom: node.from,
            scopeTo: node.to,
          });
          break;
        case 'MLamExpression':
          stack.push({
            bindings: mlamParams(node, doc),
            scopeFrom: node.from,
            scopeTo: node.to,
          });
          break;
        case 'ContextualType':
        case 'ContextualObject': {
          const bindings = [];
          const part = firstChildNamed(node, 'ContextPart');
          if (part) {
            collectContextBindings(part, doc, bindings);
            collectContextHeadBindings(part, doc, bindings);
          }
          stack.push({
            bindings,
            scopeFrom: node.from,
            scopeTo: node.to,
          });
          break;
        }
        case 'LetExpression': {
          const pat = firstChildNamed(node, 'Pattern');
          const body = lastChildNamed(node, 'Expression');
          const bindings =
            pat && body ? letPatternBindings(pat, doc) : [];
          const scopeFrom = body ? body.from : node.from;
          const scopeTo = body ? body.to : node.to;
          stack.push({
            bindings,
            scopeFrom,
            scopeTo,
          });
          break;
        }
        case 'CaseBranch':
          stack.push({
            bindings: caseBranchBindings(node, doc),
            scopeFrom: node.from,
            scopeTo: node.to,
          });
          break;
        case 'RecDeclaration':
          stack.push({
            bindings: recBindings(node, doc),
            scopeFrom: node.from,
            scopeTo: node.to,
          });
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
          const lfDep =
            n === 'LFType' || n === 'LFKind'
              ? collectLfDependent(node, doc)
              : null;
          if (lfDep) stack.push(lfDep);
          const ctDep = n === 'CompType' ? collectCompDependent(node, doc) : null;
          if (ctDep) stack.push(ctDep);
          const ckDep =
            n === 'CompKind' ? collectCompKindDependent(node, doc) : null;
          if (ckDep) stack.push(ckDep);
        }
      }

      if (n === 'LowerIdentifier') {
        const ext = lowerExtent(node, doc, ref.from, ref.to);
        if (resolveUse(stack, moduleLets, ext.from, ext.to, ext.name))
          decorateId(ext.from, ext.to, tagBoundLower);
      } else if (n === 'UpperIdentifier') {
        const ext = upperExtent(node, doc, ref.from, ref.to);
        if (resolveUse(stack, moduleLets, ext.from, ext.to, ext.name))
          decorateId(ext.from, ext.to, tagBoundUpper);
      }
    },
    leave(ref) {
      const node = ref.node;
      const n = node.name;

      const tailCollect = MODULE_TAIL_COLLECTORS[n];
      if (tailCollect)
        pushModuleBindings(moduleLets, moduleEndStack, node, tailCollect(node, doc));

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

      if (n === 'LFDeclaration' && lfDeclarationComplete(node)) {
        const id = firstChildNamed(node, 'LowerIdentifier');
        if (id) decorateId(id.from, id.to, hlTags.definition(hlTags.typeName));
      }
    },
  });

  pendingMarks.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder();
  for (const p of pendingMarks) builder.add(p.from, p.to, p.deco);
  return builder.finish();
}

export const belugaScopeHighlight = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.markCache = Object.create(null);
      this.decorations = buildDecorations(view, this.markCache);
    }
    update(u) {
      if (
        u.docChanged ||
        u.viewportChanged ||
        syntaxTree(u.startState) !== syntaxTree(u.state)
      ) {
        this.decorations = buildDecorations(u.view, this.markCache);
      }
    }
  },
  { decorations: v => v.decorations }
);

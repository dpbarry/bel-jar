// Instant syntax-tree linter for Beluga.
// Zero Beluga loads — runs on the Lezer tree on every keystroke.
//
// Parser-error and defined-name collection now live in bel-walk.mjs (the
// unified per-tree walker). This module owns the second pass:
//
//   checkLFAtomicTypes: walk every LFAtomicType, check its LowerIdentifier
//   head against the defined-name set plus any pi-binders currently in
//   scope (tracked with an enter/leave stack). Each check is independent —
//   an error node anywhere else in the document cannot suppress or trigger
//   this check.
//
// Scope of checking (deliberately narrow to avoid false positives):
//   - LF type-family names in LFAtomicType head position only.
//   - UpperIdentifier in that position = meta-variable, always OK.
//   - Everything at the computation level (rec, inductive, CompType) is left
//     to the Beluga backend — too many implicit binders and forward refs.

import { syntaxTree } from '@codemirror/language';
import { walkTree } from './bel-walk.mjs';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Memoize the merged result per Lezer tree. The walker is memoized
// separately; this cache only covers checkLFAtomicTypes + merge, which is
// the work that bel-walk doesn't do.
const _lintCache = new WeakMap();

export function syntaxLintTree(tree, doc) {
  const cached = _lintCache.get(tree);
  if (cached) return cached;
  const { blockAt, definedNames, parseDiags } = walkTree(tree, doc);
  const nameDiags = checkLFAtomicTypes(tree, doc, definedNames, blockAt);
  const merged = mergeDiagnostics(parseDiags, nameDiags);
  for (const d of merged) {
    const hit = blockAt(d.from);
    if (hit) d.blockIndex = hit.index;
  }
  _lintCache.set(tree, merged);
  return merged;
}

export function syntaxLint(view) {
  return syntaxLintTree(syntaxTree(view.state), view.state.doc);
}

function mergeDiagnostics(primary, secondary) {
  const merged = primary.slice();
  for (const d of secondary) {
    if (!primary.some((e) => rangesOverlap(e, d))) merged.push(d);
  }
  merged.sort((a, b) => a.from - b.from);
  return merged;
}

function rangesOverlap(a, b) {
  return a.from < b.to && b.from < a.to;
}

// ---------------------------------------------------------------------------
// checkLFAtomicTypes — second pass over the tree with pi-binder stack
// ---------------------------------------------------------------------------
//
// We walk the whole tree. When we enter an LFType or LFKind that opens with
// a pi-binder ({ id : ... } body), we push the binder name onto a stack
// scoped to the codomain. When we see LFAtomicType whose first child is a
// LowerIdentifier, that identifier must be in `definedNames` (visible at
// this position per block ordering) or in `piBinders`.
//
// Stack entries: { name: string, scopeTo: number }
// We pop entries whose scopeTo <= current node from (they've gone out of scope).

function nameVisibleAt(entry, atFrom, blockIndex) {
  if (entry.blockIndex < 0 || blockIndex < 0) return entry.from < atFrom;
  if (entry.blockIndex < blockIndex) return true;
  if (entry.blockIndex === blockIndex) return entry.from < atFrom;
  return false;
}

function isDefinedName(idName, atFrom, blockIndex, defined, piStack) {
  if (piStack.some((b) => b.name === idName)) return true;
  return defined.some((e) => e.name === idName && nameVisibleAt(e, atFrom, blockIndex));
}

function checkLFAtomicTypes(tree, doc, defined, blockAt) {
  const diags = [];
  const piStack = [];

  tree.iterate({
    enter(ref) {
      const name = ref.name;
      const useBlock = blockAt(ref.from);

      // Push pi-binders when we enter a pi-typed LFType or LFKind.
      // Grammar: LFType { "{" PiBinder ":" LFType "}" LFType }
      //          LFKind { "{" PiBinder ":" LFType "}" LFKind }
      // The binder is in scope for the codomain (the trailing LFType/LFKind).
      if (name === 'LFType' || name === 'LFKind') {
        const first = ref.node.firstChild;
        if (first && first.name === '{') {
          const piBinder = first.nextSibling;
          if (piBinder && piBinder.name === 'PiBinder') {
            const binderName = doc.sliceString(piBinder.from, piBinder.to).trim();
            // The codomain starts after the closing '}'.
            let c = piBinder.nextSibling;
            while (c && c.name !== '}') c = c.nextSibling;
            const codomain = c ? c.nextSibling : null;
            if (binderName && codomain) {
              piStack.push({ name: binderName, scopeTo: ref.to });
            }
          }
        }
        return; // keep descending
      }

      if (name === 'LFAtomicType') {
        const first = ref.node.firstChild;
        if (!first) return false;

        if (first.name === 'LowerIdentifier') {
          const idName = doc.sliceString(first.from, first.to);
          // Pop stale binders before checking.
          while (piStack.length && piStack[piStack.length - 1].scopeTo <= first.from) {
            piStack.pop();
          }
          const blockIndex = useBlock ? useBlock.index : -1;
          if (!isDefinedName(idName, first.from, blockIndex, defined, piStack)) {
            diags.push({
              from: first.from,
              to: first.to,
              severity: 'error',
              message: `'${idName}' is not defined`,
            });
          }
        }
        // UpperIdentifier = meta-variable, always OK. '(' LFType ')' = recurse.
        // Don't skip children — parens case needs descent.
        return;
      }

      // Skip computation-level bodies entirely — too many implicit binders.
      // We still need to descend into LFType/LFKind nodes inside them (e.g.
      // constructor kinds in LFDatatypeDeclaration), so we only skip the
      // nodes that are purely at the computation level.
      if (
        name === 'CompType'      ||
        name === 'CompKind'      ||
        name === 'CompAppType'   ||
        name === 'CompAtomicType'||
        name === 'Expression'    ||
        name === 'AppExpression' ||
        name === 'AtomicExpression'
      ) {
        return false;
      }
    },
    leave(ref) {
      const name = ref.name;
      if (name === 'LFType' || name === 'LFKind') {
        while (piStack.length && piStack[piStack.length - 1].scopeTo <= ref.to) {
          piStack.pop();
        }
      }
    },
  });

  return diags;
}

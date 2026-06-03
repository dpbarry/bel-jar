import { syntaxTree } from '@codemirror/language';
import { walkTree } from './bel-walk.mjs';

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

      if (name === 'LFType' || name === 'LFKind') {
        const first = ref.node.firstChild;
        if (first && first.name === '{') {
          const piBinder = first.nextSibling;
          if (piBinder && piBinder.name === 'PiBinder') {
            const binderName = doc.sliceString(piBinder.from, piBinder.to).trim();
            let c = piBinder.nextSibling;
            while (c && c.name !== '}') c = c.nextSibling;
            const codomain = c ? c.nextSibling : null;
            if (binderName && codomain) {
              piStack.push({ name: binderName, scopeTo: ref.to });
            }
          }
        }
        return;
      }

      if (name === 'LFAtomicType') {
        const first = ref.node.firstChild;
        if (!first) return false;

        if (first.name === 'LowerIdentifier') {
          const idName = doc.sliceString(first.from, first.to);
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
        return;
      }

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

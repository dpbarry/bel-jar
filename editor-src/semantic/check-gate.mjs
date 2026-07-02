import { checkerSnapshotFromSyntax } from '../checker-snapshot.mjs';
import { onlySyntaxFaultBlocksChanged } from './syntax-only-gate.mjs';

function commentSpans(tree) {
  const spans = [];
  if (!tree) return spans;
  tree.iterate({
    enter(node) {
      if (node.name === 'LineComment' || node.name === 'BlockComment') {
        spans.push({ from: node.from, to: node.to });
      }
    },
  });
  return spans;
}

function stripSpans(text, spans) {
  const sorted = [...spans].sort((a, b) => b.from - a.from);
  let out = text;
  for (const { from, to } of sorted) {
    out = out.slice(0, from) + out.slice(to);
  }
  return out;
}

// Whitespace and blank-line edits that Beluga treats as immaterial for checking.
function normalizeCosmeticWhitespace(text) {
  return text
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .join('\n')
    .replace(/\n{2,}/g, '\n');
}

export function semanticDeclText(doc, declarationNode, tree) {
  let text = doc.sliceString(declarationNode.from, declarationNode.to);
  if (tree && declarationNode) {
    const lo = declarationNode.from;
    const hi = declarationNode.to;
    const spans = [];
    tree.iterate({
      enter(node) {
        if (node.from < lo || node.to > hi) return;
        if (node.name === 'LineComment' || node.name === 'BlockComment') {
          spans.push({ from: node.from - lo, to: node.to - lo });
        }
      },
    });
    text = stripSpans(text, spans);
  }
  return normalizeCosmeticWhitespace(text);
}

export function belugaCheckFingerprint(syntax) {
  if (!syntax?.doc) return '';
  const snap = checkerSnapshotFromSyntax(syntax);
  const stripped = stripSpans(snap.code, commentSpans(syntax.tree));
  return normalizeCosmeticWhitespace(stripped);
}

// cosmetic — comments / insignificant whitespace only: keep checker verdict, no schedule
// syntax-only — broken-block edits only: refresh graph, no Beluga
// semantic — schedule settlement
export function settlementTrigger(prevSyntax, syntax) {
  if (!prevSyntax?.doc || !syntax?.doc) return 'semantic';

  if (belugaCheckFingerprint(prevSyntax) === belugaCheckFingerprint(syntax)) {
    return 'cosmetic';
  }
  if (onlySyntaxFaultBlocksChanged(prevSyntax, syntax)) {
    return 'syntax-only';
  }
  return 'semantic';
}

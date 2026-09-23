// case-read-arms.mjs — the arm reader, harness-side on purpose.
// Naming grammar nodes is Beluga coupling the purity ratchet counts, so it stays
// out of js/ until we know whether it belongs to the editor (which already has a
// tree) or to a lang/ layer that does not exist yet.
import { parser } from '../js/editor-src/beluga-parser.js';

/** The outermost case arms of a named `rec`, as raw text. */
export function outerArms(code, declName) {
  const src = String(code == null ? '' : code);
  let tree;
  try { tree = parser.parse(src); } catch (_) { return []; }
  const text = (n) => src.slice(n.from, n.to);
  let arms = [];
  tree.iterate({
    enter(node) {
      if (arms.length || node.name !== 'RecBody') return;
      const body = node.node;
      const nameNode = body.getChild('LowerIdentifier');
      if (!nameNode || text(nameNode) !== declName) return;
      let outer = null;
      body.cursor().iterate((n) => {
        if (outer) return false;
        if (n.name === 'CaseExpression') { outer = n.node; return false; }
        return true;
      });
      if (!outer) return;
      const caseBody = outer.getChild('CaseBody');
      if (!caseBody) return;
      const found = [];
      for (let c = caseBody.firstChild; c; c = c.nextSibling) {
        if (c.name === 'CaseBranch') found.push(text(c.node));
      }
      arms = found;
    },
  });
  return arms;
}

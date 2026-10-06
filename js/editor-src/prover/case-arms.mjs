// case-arms.mjs — read the arms of a proof's outer case, and mask or replace one.
//
// Moved here from scripts/case-read-arms.mjs (2026-10-03) when case completion became
// a feature: the editor needs it, not just the harness. It names grammar nodes, which
// the *jar purity ratchet counts as Beluga coupling (+5); that is the price of reading
// a proof's structure, and tests/test-starjar-purity.mjs records it.
import { parser } from '../beluga-parser.js';

/**
 * Every `rec` in a program with the arms of its outermost case expression.
 * Spans are offsets into `code`, so an arm can be masked or replaced in place.
 *
 * @returns {Array<{ name, from, to, arms: Array<{ from, to, text }> }>}
 */
export function recsWithArms(code) {
  const src = String(code == null ? '' : code);
  let tree;
  try { tree = parser.parse(src); } catch (_) { return []; }
  const text = (n) => src.slice(n.from, n.to);
  const recs = [];
  tree.iterate({
    enter(node) {
      if (node.name !== 'RecBody') return;
      const body = node.node;
      const nameNode = body.getChild('LowerIdentifier');
      if (!nameNode) return;
      let outer = null;
      body.cursor().iterate((n) => {
        if (outer) return false;
        if (n.name === 'CaseExpression') { outer = n.node; return false; }
        return true;
      });
      const arms = [];
      const caseBody = outer && outer.getChild('CaseBody');
      if (caseBody) {
        for (let c = caseBody.firstChild; c; c = c.nextSibling) {
          if (c.name === 'CaseBranch') arms.push({ from: c.from, to: c.to, text: text(c) });
        }
      }
      // The outer case itself, and what it cases on (the text between `case` and `of`),
      // for whoever needs to hole the whole case or split on its scrutinee.
      let outerCase = null;
      if (outer) {
        const m = /^case\s+([\s\S]*?)\s+of\b/.exec(text(outer));
        outerCase = { from: outer.from, to: outer.to, scrutinee: m ? m[1].trim() : null };
      }
      recs.push({ name: text(nameNode), from: body.from, to: body.to, arms, outerCase });
    },
  });
  return recs;
}

/** The outermost case arms of a named `rec`, as raw text. */
export function outerArms(code, declName) {
  const rec = recsWithArms(code).find((r) => r.name === declName);
  return rec ? rec.arms.map((a) => a.text) : [];
}

/**
 * Remove one arm, bar included. The first arm of a case may be written without a
 * leading bar, in which case the bar that follows it goes instead.
 */
export function maskArm(code, arm) {
  let i = arm.from - 1;
  while (i >= 0 && /\s/.test(code[i])) i -= 1;
  if (code[i] === '|') return code.slice(0, i) + code.slice(arm.to);
  let j = arm.to;
  while (j < code.length && /\s/.test(code[j])) j += 1;
  if (code[j] === '|') return code.slice(0, arm.from) + code.slice(j + 1);
  return code.slice(0, arm.from) + code.slice(arm.to);
}

/** Put different text where an arm was. */
export function replaceArm(code, arm, armText) {
  return code.slice(0, arm.from) + armText + code.slice(arm.to);
}

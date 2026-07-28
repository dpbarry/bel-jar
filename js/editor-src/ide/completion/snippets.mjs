import { firstIdentChild } from '../../tree-helpers.mjs';

// Snippet bodies use `?` as Beluga holes so Harpoon / the checker own the rest.
// Autocomplete never offers fills for those holes — only the scaffolding.
export const SNIPPETS = Object.freeze({
  'top-decl': Object.freeze([
    {
      label: 'LF',
      detail: 'LF … : type =',
      insert: 'LF name : type =\n| c : name;',
      boost: 100,
    },
    {
      label: 'rec',
      detail: 'rec … : … =',
      insert: 'rec name : [⊢ nat] → [⊢ nat] =\n?;',
      boost: 90,
    },
    {
      label: 'schema',
      detail: 'schema … = block …',
      insert: 'schema name = block (x : nat);',
      boost: 80,
    },
    {
      label: 'inductive',
      detail: 'inductive … : ctype =',
      insert: 'inductive Name : ctype =\n| Mk : [⊢ nat] → Name;',
      boost: 70,
    },
    {
      label: '--infix',
      detail: '--infix op N assoc.',
      insert: '--infix op 5 left.',
      boost: 40,
    },
    {
      label: '--prefix',
      detail: '--prefix op N.',
      insert: '--prefix op 10.',
      boost: 30,
    },
  ]),
  'expr-head': Object.freeze([
    {
      label: 'fn',
      detail: 'fn … ⇒',
      insert: 'fn x ⇒ ?',
      boost: 100,
    },
    {
      label: 'mlam',
      detail: 'mlam … ⇒',
      insert: 'mlam x ⇒ ?',
      boost: 90,
    },
    {
      label: 'case',
      detail: 'case … of | …',
      insert: 'case x of\n| _ ⇒ ?',
      boost: 80,
    },
    {
      label: 'let',
      detail: 'let … = … in',
      insert: 'let y = x in ?',
      boost: 70,
    },
    {
      label: 'impossible',
      detail: 'impossible …',
      insert: 'impossible x',
      boost: 50,
    },
  ]),
  'case-arm': Object.freeze([
    {
      label: '|',
      detail: '| pattern ⇒ …',
      insert: '| _ ⇒ ?',
      boost: 200,
    },
  ]),
});

function isWs(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function skipWsBack(doc, pos) {
  let i = pos;
  while (i > 0 && isWs(doc.sliceString(i - 1, i))) i -= 1;
  return i;
}

function childNamed(node, name) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === name) return c;
  }
  return null;
}

function enclosingCase(node) {
  for (let p = node; p; p = p.parent) {
    if (p.name === 'CaseExpression') return p;
  }
  return null;
}

function lastNonErrorChild(node) {
  let last = null;
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (!c.type.isError) last = c;
  }
  return last;
}

// True when the cursor sits where Beluga requires a `|` case arm and nothing else
// (letters, constructors, recs) is legal yet.
export function isCaseArmSlot(tree, doc, pos) {
  if (!tree || pos == null) return false;

  for (let cur = tree.resolveInner(pos, -1); cur; cur = cur.parent) {
    if (cur.name === 'Pattern' || cur.name === 'AtomicPattern') {
      // A pattern after `|` is real. A bare letter after `of` with no `|` is
      // error recovery inventing a pattern — still an arm slot (withhold idents).
      const caseExpr = enclosingCase(cur);
      const ofKw = caseExpr && childNamed(caseExpr, 'OfKeyword');
      if (ofKw) {
        const between = doc.sliceString(ofKw.to, cur.from);
        if (!/[|]/.test(between)) return true;
      }
      return false;
    }
    if (cur.name === 'CaseBranch') {
      let arrow = null;
      let body = null;
      for (let c = cur.firstChild; c; c = c.nextSibling) {
        if (c.name === 'FatArrow') arrow = c;
        if (arrow && (c.name === 'Expression' || c.name === 'AppExpression')) body = c;
      }
      if (!arrow) return false;
      if (body && pos < body.to) return false;
      return true;
    }
    if (cur.name !== 'CaseExpression' && cur.name !== 'CaseBody') continue;

    const caseExpr = cur.name === 'CaseExpression' ? cur : enclosingCase(cur);
    if (!caseExpr) return false;

    const ofKw = childNamed(caseExpr, 'OfKeyword');
    if (!ofKw || pos <= ofKw.to) return false;

    const body = childNamed(caseExpr, 'CaseBody');
    if (!body) return true;

    for (let c = body.firstChild; c; c = c.nextSibling) {
      if (c.name === 'CaseBranch' && pos > c.from && pos < c.to) return false;
    }
    const last = lastNonErrorChild(body);
    // Cursor immediately after a `|` that opens an arm — pattern comes next.
    if (last && last.name === '|' && pos >= last.to) return false;
    if (last && pos >= last.to) return true;
    const before = skipWsBack(doc, pos);
    if (before <= ofKw.to) return true;
    if (last && before >= last.to) return true;
    return pos >= body.to;
  }

  // Incomplete parse: `of` followed by error/EOF — still an arm slot.
  for (let cur = tree.resolveInner(pos, -1); cur; cur = cur.parent) {
    if (cur.name === 'OfKeyword' && pos >= cur.to) {
      const p = cur.parent;
      if (p && p.name === 'CaseExpression' && !childNamed(p, 'CaseBody')) return true;
    }
  }
  return false;
}

export function isTopDeclSlot(tree, doc, pos) {
  if (!tree || pos == null) return false;
  const prog = tree.topNode;
  if (!prog || prog.name !== 'Program') return false;
  let lastDecl = null;
  for (let c = prog.firstChild; c; c = c.nextSibling) {
    if (c.name !== 'Declaration') continue;
    // Include the end offset: an incomplete `rec … =` has pos === decl.to
    // while the cursor is still in that declaration's body.
    if (pos > c.from && pos <= c.to) return false;
    lastDecl = c;
  }
  return !lastDecl || pos > lastDecl.to;
}

// Expression head: empty (or keyword-prefix) spot where a compound expression starts.
export function isExprHeadSlot(tree, doc, pos, query) {
  if (!tree || pos == null) return false;
  if (isCaseArmSlot(tree, doc, pos)) return false;

  const q = String(query || '');
  // Only offer keyword scaffolds for empty / keyword-like prefixes.
  if (q && !/^(f|fn|m|ml|mla|mlam|c|ca|cas|case|l|le|let|i|im|imp|impo|impos|imposs|impossib|impossibl|impossible)$/i.test(q)) {
    return false;
  }

  for (let cur = tree.resolveInner(pos, -1); cur; cur = cur.parent) {
    if (cur.name === 'CaseBranch') {
      // After ⇒ in a branch body is an expression head when the body is empty/partial.
      let sawArrow = false;
      for (let c = cur.firstChild; c; c = c.nextSibling) {
        if (c.name === 'FatArrow') { sawArrow = true; continue; }
        if (sawArrow && c.name === 'Expression') {
          return pos >= c.from && pos <= c.to && isSparseExpr(doc, c, pos);
        }
      }
      return sawArrow;
    }
    if (cur.name === 'FnExpression' || cur.name === 'MLamExpression') {
      let sawArrow = false;
      for (let c = cur.firstChild; c; c = c.nextSibling) {
        if (c.name === 'FatArrow') { sawArrow = true; continue; }
        if (sawArrow && c.name === 'Expression') {
          return pos >= c.from && pos <= c.to && isSparseExpr(doc, c, pos);
        }
      }
      return false;
    }
    if (cur.name === 'RecBody') {
      let afterEq = false;
      for (let c = cur.firstChild; c; c = c.nextSibling) {
        if (c.name === '=') afterEq = true;
        if (afterEq && c.name === 'Expression') {
          return pos >= c.from && pos <= c.to && isSparseExpr(doc, c, pos);
        }
      }
      const id = firstIdentChild(cur);
      if (id && pos > id.to) {
        const text = doc.sliceString(id.to, pos);
        if (/=\s*$/.test(text)) return true;
      }
    }
    if (cur.name === 'AtomicExpression' || cur.name === 'AppExpression' || cur.name === 'Expression') {
      // Fall through — keep climbing for Fn/Case/Rec context; lone AtomicExpression
      // with a partial keyword is still an expr-head if sparse.
      if (cur.name === 'AtomicExpression' && isSparseExpr(doc, cur, pos)) {
        // Only if not nested inside LF term / type positions.
        let lf = false;
        for (let p = cur.parent; p; p = p.parent) {
          if (p.name === 'LFAtomicTerm' || p.name === 'LFAtomicType'
              || p.name === 'CompAtomicType' || p.name === 'AtomicPattern') {
            lf = true;
            break;
          }
          if (p.name === 'FnExpression' || p.name === 'CaseExpression'
              || p.name === 'RecBody' || p.name === 'LetExpression') break;
        }
        if (!lf) return true;
      }
    }
  }
  return false;
}

function isSparseExpr(doc, exprNode, pos) {
  if (!exprNode) return true;
  const text = doc.sliceString(exprNode.from, Math.min(pos, exprNode.to)).trim();
  if (!text) return true;
  // A single partial keyword / identifier — still scaffolding territory.
  return /^[\p{L}_][\p{L}\p{N}_']*$/u.test(text);
}

export function structureSlotAt(tree, doc, pos, query = '') {
  if (isCaseArmSlot(tree, doc, pos)) return 'case-arm';
  if (isTopDeclSlot(tree, doc, pos)) return 'top-decl';
  if (isExprHeadSlot(tree, doc, pos, query)) return 'expr-head';
  return null;
}

export function contributeSnippets(site) {
  if (!site || !site.structure) return [];
  const table = SNIPPETS[site.structure];
  if (!table) return [];
  const q = String(site.query || '').toLowerCase();
  const out = [];
  for (const snip of table) {
    if (q && !snip.label.toLowerCase().startsWith(q) && !snip.label.toLowerCase().includes(q)) {
      // case-arm `|` never matches letter queries — correctly yields nothing.
      continue;
    }
    out.push({
      label: snip.label,
      insert: snip.insert,
      kind: 'snippet',
      detail: snip.detail,
      source: 'snippet',
      cmType: 'keyword',
      just: 2,
      scoreHints: { base: snip.boost, proximity: 0 },
    });
  }
  return out;
}

import { firstIdentChild } from '../../tree-helpers.mjs';

// Snippet bodies use `?` as Beluga holes so Harpoon / the checker own the rest.
// Autocomplete never offers fills for those holes — only the scaffolding.
const TOP_DECL_LABELS = Object.freeze([
  'LF', 'rec', 'schema', 'inductive', 'coinductive', 'stratified',
  'typedef', 'module', '--infix', '--prefix',
]);

export const SNIPPETS = Object.freeze({
  'top-decl': Object.freeze([
    {
      label: 'LF',
      detail: 'LF … : type =',
      insert: 'LF ? : type =\n| ? : ?;',
      boost: 100,
    },
    {
      label: 'rec',
      detail: 'rec … : … =',
      insert: 'rec ? : ? =\n?;',
      boost: 90,
    },
    {
      label: 'schema',
      detail: 'schema … = block …',
      insert: 'schema ? = block (? : ?);',
      boost: 80,
    },
    {
      label: 'inductive',
      detail: 'inductive … : ctype =',
      insert: 'inductive ? : ctype =\n| ? : ?;',
      boost: 70,
    },
    {
      label: 'coinductive',
      detail: 'coinductive … : ctype =',
      insert: 'coinductive ? : ctype =\n| ? : ?;',
      boost: 65,
    },
    {
      label: 'stratified',
      detail: 'stratified … : ctype =',
      insert: 'stratified ? : ctype =\n| ? : ?;',
      boost: 60,
    },
    {
      label: 'typedef',
      detail: 'typedef … : ctype =',
      insert: 'typedef ? : ctype = ?;',
      boost: 55,
    },
    {
      label: 'module',
      detail: 'module … = struct … end',
      insert: 'module ? = struct\n\nend;',
      boost: 50,
    },
    {
      label: '--infix',
      detail: '--infix … … left.',
      insert: '--infix ? ? left.',
      boost: 40,
    },
    {
      label: '--prefix',
      detail: '--prefix … ….',
      insert: '--prefix ? ?.',
      boost: 30,
    },
  ]),
  'lf-kind': Object.freeze([
    {
      label: 'type',
      detail: 'LF kind',
      insert: 'type',
      boost: 200,
    },
  ]),
  'comp-kind': Object.freeze([
    {
      label: 'ctype',
      detail: 'computation kind',
      insert: 'ctype',
      boost: 200,
    },
    {
      label: 'prop',
      detail: 'proposition kind',
      insert: 'prop',
      boost: 190,
    },
  ]),
  'expr-head': Object.freeze([
    {
      label: 'fn',
      detail: 'fn … ⇒',
      insert: 'fn ? ⇒ ?',
      boost: 100,
    },
    {
      label: 'mlam',
      detail: 'mlam … ⇒',
      insert: 'mlam ? ⇒ ?',
      boost: 90,
    },
    {
      label: 'case',
      detail: 'case … of | …',
      insert: 'case ? of\n| _ ⇒ ?',
      boost: 80,
    },
    {
      label: 'let',
      detail: 'let … = … in',
      insert: 'let ? = ? in ?',
      boost: 70,
    },
    {
      label: 'impossible',
      detail: 'impossible …',
      insert: 'impossible ?',
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
  'schema-body': Object.freeze([
    {
      label: 'block',
      detail: 'block (? : ?)',
      insert: 'block (? : ?)',
      boost: 100,
    },
    {
      label: 'some',
      detail: 'some [? : ?] block …',
      insert: 'some [? : ?] block (? : ?)',
      boost: 90,
    },
  ]),
  'ctx-entry': Object.freeze([
    {
      label: '? : ?',
      detail: 'context variable',
      insert: '? : ?',
      boost: 100,
    },
  ]),
  'ctor-line': Object.freeze([
    {
      label: '|',
      detail: '| Ctor : …',
      insert: '| ? : ?',
      boost: 200,
    },
  ]),
  'infix-assoc': Object.freeze([
    {
      label: 'left',
      detail: 'left-associative',
      insert: 'left',
      boost: 200,
    },
    {
      label: 'right',
      detail: 'right-associative',
      insert: 'right',
      boost: 190,
    },
  ]),
});

const LF_KIND_DECL = new Set([
  'LFDeclaration',
  'LFDatatypeDeclaration',
]);

const COMP_KIND_DECL = new Set([
  'TypedefDeclaration',
  'InductiveBody',
  'CoinductiveBody',
  'InductiveDeclaration',
  'CoinductiveDeclaration',
  'StratifiedDeclaration',
]);

const COMP_KIND_START = new Set([
  'InductiveKeyword',
  'CoinductiveKeyword',
  'StratifiedKeyword',
  'TypedefKeyword',
]);

const LF_KIND_START = new Set([
  'LFKeyword',
  'DatatypeKeyword',
]);

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
      if (body) {
        // Trailing whitespace on the RHS is still "between arms" territory;
        // only the non-ws expression content is the body site.
        let end = body.to;
        while (end > body.from && isWs(doc.sliceString(end - 1, end))) end -= 1;
        if (pos >= body.from && pos <= end) return false;
      }
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

function colonThenBodyRange(node) {
  let colon = null;
  let body = null;
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === ':' && !colon) colon = c;
    if (colon && (c.name === '=' || c.name === '.')) {
      body = c;
      break;
    }
  }
  return { colon, body };
}

// Cursor sits in a kind position: after `:` and before `=` / `.` of a decl,
// or already inside an LFKind / CompKind node.
function inKindSpan(node, pos) {
  const { colon, body } = colonThenBodyRange(node);
  if (!colon || pos < colon.to) return false;
  if (body && pos >= body.from) return false;
  return true;
}

function incompleteKindAtProgram(tree, doc, pos, startKeywords) {
  const prog = tree.topNode;
  if (!prog || prog.name !== 'Program') return false;
  let sawStart = false;
  let sawColon = false;
  for (let c = prog.firstChild; c; c = c.nextSibling) {
    if (c.name === 'Declaration') {
      if (pos > c.from && pos <= c.to) return false;
      sawStart = false;
      sawColon = false;
      continue;
    }
    if (startKeywords.has(c.name) && c.to <= pos) {
      sawStart = true;
      sawColon = false;
      continue;
    }
    if (!sawStart) continue;
    if (c.name === ':' && c.to <= pos) {
      sawColon = true;
      continue;
    }
    if (c.name === '=' || c.name === '.') {
      sawStart = false;
      sawColon = false;
      continue;
    }
    if (sawColon && pos >= c.from && pos <= c.to) return true;
    if (sawColon && c.to <= pos && (c.name === 'CompType' || c.name === 'LFType'
        || c.name === 'LFKind' || c.name === 'CompKind'
        || c.name === 'LowerIdentifier' || c.name === 'UpperIdentifier'
        || c.name === 'CompAtomicType' || c.name === 'LFAtomicType')) {
      // Still in the kind/type fragment before a body marker.
      continue;
    }
  }
  if (sawColon) {
    const before = skipWsBack(doc, pos);
    return before > 0;
  }
  return false;
}

export function isLfKindSlot(tree, doc, pos) {
  if (!tree || pos == null) return false;
  for (let cur = tree.resolveInner(pos, -1); cur; cur = cur.parent) {
    if (cur.name === 'LFKind') return true;
    if (LF_KIND_DECL.has(cur.name) && inKindSpan(cur, pos)) return true;
    if (cur.name === 'CompKind' || COMP_KIND_DECL.has(cur.name)) return false;
  }
  return incompleteKindAtProgram(tree, doc, pos, LF_KIND_START);
}

export function isCompKindSlot(tree, doc, pos) {
  if (!tree || pos == null) return false;
  if (isLfKindSlot(tree, doc, pos)) return false;
  for (let cur = tree.resolveInner(pos, -1); cur; cur = cur.parent) {
    if (cur.name === 'CompKind') return true;
    if (COMP_KIND_DECL.has(cur.name) && inKindSpan(cur, pos)) return true;
    if (cur.name === 'LFKind' || LF_KIND_DECL.has(cur.name)) return false;
  }
  return incompleteKindAtProgram(tree, doc, pos, COMP_KIND_START);
}

function isTopDeclKeywordPrefix(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  const tl = t.toLowerCase();
  return TOP_DECL_LABELS.some((label) => label.toLowerCase().startsWith(tl));
}

export function isTopDeclSlot(tree, doc, pos) {
  if (!tree || pos == null) return false;
  const prog = tree.topNode;
  if (!prog || prog.name !== 'Program') return false;
  let lastDecl = null;
  for (let c = prog.firstChild; c; c = c.nextSibling) {
    if (c.name === 'Declaration') {
      // Include the end offset: an incomplete `rec … =` has pos === decl.to
      // while the cursor is still in that declaration's body.
      if (pos > c.from && pos <= c.to) {
        // Typing `LF` / `rec` / `--in` parses as an incomplete Declaration —
        // still a top-decl site while the text is only a keyword prefix.
        return isTopDeclKeywordPrefix(doc.sliceString(c.from, pos));
      }
      lastDecl = c;
      continue;
    }
    if (c.name === 'LineComment' || c.name === 'BlockComment') continue;
    // Incomplete decl debris at Program level (e.g. `inductive Box : c`).
    if (pos > c.from && pos <= c.to) {
      return isTopDeclKeywordPrefix(doc.sliceString(c.from, pos));
    }
    if ((!lastDecl || c.from >= lastDecl.to) && c.to <= pos) return false;
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
          return pos >= c.from && pos <= c.to && isExprHeadSparse(doc, c, pos);
        }
      }
      return sawArrow;
    }
    if (cur.name === 'FnExpression' || cur.name === 'MLamExpression') {
      let sawArrow = false;
      for (let c = cur.firstChild; c; c = c.nextSibling) {
        if (c.name === 'FatArrow') { sawArrow = true; continue; }
        if (sawArrow && c.name === 'Expression') {
          return pos >= c.from && pos <= c.to && isExprHeadSparse(doc, c, pos);
        }
      }
      // Incomplete `fn x ⇒` / `mlam x ⇒` — body not parsed yet.
      return sawArrow;
    }
    if (cur.name === 'RecBody') {
      let afterEq = false;
      for (let c = cur.firstChild; c; c = c.nextSibling) {
        if (c.name === '=') afterEq = true;
        if (afterEq && c.name === 'Expression') {
          return pos >= c.from && pos <= c.to && isExprHeadSparse(doc, c, pos);
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
      if (cur.name === 'AtomicExpression' && isExprHeadSparse(doc, cur, pos)) {
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

function isExprHeadSparse(doc, exprNode, pos) {
  if (!exprNode) return true;
  const text = doc.sliceString(exprNode.from, Math.min(pos, exprNode.to)).trim();
  if (!text) return true;
  // Keyword prefix only — a real ident like `nat` is not scaffolding territory,
  // even at k=0 with the cursor on the first character.
  return /^(f|fn|m|ml|mla|mlam|c|ca|cas|case|l|le|let|i|im|imp|impo|impos|imposs|impossib|impossibl|impossible)$/i.test(text);
}

// After `schema name =` before a SchemaElement body is filled in.
export function isSchemaBodySlot(tree, doc, pos, query = '') {
  if (!tree || pos == null) return false;
  const q = String(query || '');
  if (q && !/^(b|bl|blo|bloc|block|s|so|som|some)$/i.test(q)) return false;

  for (let cur = tree.resolveInner(pos, -1); cur; cur = cur.parent) {
    if (cur.name === 'SchemaBody') {
      // Inside an already-started element (LFType / LFBlock / some) — not sparse.
      for (let c = cur.firstChild; c; c = c.nextSibling) {
        if (c.name === 'SchemaElement' && pos > c.from && pos < c.to) return false;
      }
      const text = doc.sliceString(cur.from, Math.min(pos, cur.to)).trim();
      if (!text) return true;
      return /^(b|bl|blo|bloc|block|s|so|som|some)$/i.test(text);
    }
    if (cur.name === 'SchemaDeclaration') {
      let afterEq = false;
      for (let c = cur.firstChild; c; c = c.nextSibling) {
        if (c.name === '=') { afterEq = true; continue; }
        if (afterEq && c.name === 'SchemaBody') {
          return pos >= c.from && pos <= c.to && isSchemaBodySlot(tree, doc, pos, query);
        }
      }
      if (afterEq) {
        const id = firstIdentChild(cur);
        if (id) {
          const text = doc.sliceString(id.to, pos);
          if (/=\s*$/.test(text) || /=\s*(b|bl|blo|bloc|block|s|so|som|some)$/i.test(text)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

// Empty / sparse spot inside `[…]` where a context entry `? : ?` may start.
export function isCtxEntrySlot(tree, doc, pos, query = '') {
  if (!tree || pos == null) return false;
  // Binder names are declined elsewhere; only offer the scaffold on empty /
  // scaffold-prefix queries.
  const q = String(query || '');
  if (q && !/^(\?|\?\s*:|\?\s*:\s*\?)?$/i.test(q) && q !== '? : ?') return false;

  for (let cur = tree.resolveInner(pos, -1); cur; cur = cur.parent) {
    if (cur.name === 'ContextPart' || cur.name === 'ContextualType'
        || cur.name === 'ContextualObject' || cur.name === 'ContextApplication') {
      // After turnstile is term/type territory, not a context entry.
      const turnstile = (() => {
        for (let p = cur; p; p = p.parent) {
          if (p.name === 'ContextualType' || p.name === 'ContextualObject') {
            return childNamed(p, 'Turnstile');
          }
        }
        return null;
      })();
      if (turnstile && pos >= turnstile.from) return false;

      // Mid-entry (already past `name :`) is a type slot, not a scaffold.
      for (let p = tree.resolveInner(pos, -1); p && p !== cur; p = p.parent) {
        if (p.name === 'ContextEntry' || p.name === 'ContextTailEntry') {
          const colon = childNamed(p, ':');
          if (colon && pos >= colon.to) return false;
          // Name already started — binder, not scaffold.
          if (q) return false;
        }
      }

      const before = skipWsBack(doc, pos);
      if (before <= 0) return false;
      const ch = doc.sliceString(before - 1, before);
      // After `[` or `,` — a new entry may begin.
      if (ch === '[' || ch === ',') {
        const between = doc.sliceString(before, pos).trim();
        if (!between) return true;
        return /^(\?|\?\s*:.*)?$/i.test(between);
      }
    }
  }
  return false;
}

// Between inductive/coinductive constructors: only `|` is legal.
export function isCtorLineSlot(tree, doc, pos) {
  if (!tree || pos == null) return false;
  for (let cur = tree.resolveInner(pos, -1); cur; cur = cur.parent) {
    if (cur.name === 'CompConstructor' || cur.name === 'CompDestructor'
        || cur.name === 'LFConstructor') {
      // Strictly inside a constructor body — not between lines.
      // Cursor at `ctor.to` (or past it) is after the finished alternative.
      if (pos < cur.to) return false;
      continue;
    }
    if (cur.name === 'InductiveBody' || cur.name === 'CoinductiveBody'
        || cur.name === 'LFDatatypeDeclaration' || cur.name === 'LFDeclaration') {
      let eq = null;
      for (let c = cur.firstChild; c; c = c.nextSibling) {
        if (c.name === '=') eq = c;
      }
      if (!eq || pos <= eq.to) return false;

      // Strictly inside a constructor — pattern handled above; double-check.
      for (let c = cur.firstChild; c; c = c.nextSibling) {
        if ((c.name === 'CompConstructor' || c.name === 'CompDestructor'
            || c.name === 'LFConstructor')
            && pos > c.from && pos < c.to) {
          return false;
        }
      }
      const last = lastNonErrorChild(cur);
      // Cursor immediately after a `|` that opens an arm — ctor name comes next.
      if (last && last.name === '|' && pos >= last.to) return false;

      let sawCtor = false;
      for (let c = cur.firstChild; c; c = c.nextSibling) {
        if (c.name === 'CompConstructor' || c.name === 'CompDestructor'
            || c.name === 'LFConstructor' || c.name === '|') {
          if (c.to <= pos) sawCtor = true;
        }
      }
      if (!sawCtor) {
        const after = doc.sliceString(eq.to, pos).trim();
        return after === '';
      }
      const before = skipWsBack(doc, pos);
      if (last && before >= last.to) return true;
      return pos >= cur.to || (last && pos >= last.to);
    }
  }
  return false;
}

function assocTokenPrefix(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return true;
  return 'left'.startsWith(t) || 'right'.startsWith(t);
}

function pragmaNeedsAssoc(pragma) {
  if (!pragma) return false;
  if (childNamed(pragma, 'Associativity')) return false;
  for (let c = pragma.firstChild; c; c = c.nextSibling) {
    if (c.name === '.') return false;
  }
  return true;
}

function priorOpenFixityPragma(tree, pos) {
  const prog = tree.topNode;
  if (!prog || prog.name !== 'Program') return null;
  let best = null;
  for (let c = prog.firstChild; c; c = c.nextSibling) {
    if (c.from >= pos) break;
    if (c.name !== 'Declaration') continue;
    let pragma = null;
    for (let k = c.firstChild; k; k = k.nextSibling) {
      if (k.name === 'InfixPragma' || k.name === 'AssocPragma') {
        pragma = k;
        break;
      }
    }
    if (pragma && pragmaNeedsAssoc(pragma)) best = pragma;
  }
  return best;
}

function sameLineAfter(doc, from, to) {
  if (to < from) return false;
  const between = doc.sliceString(from, to);
  return /^\s*$/.test(between) && !/[\n\r]/.test(between);
}

// After `--infix op [prec]` / `--assoc op` before associativity is chosen.
export function isInfixAssocSlot(tree, doc, pos, query = '') {
  if (!tree || pos == null) return false;
  const q = String(query || '');
  if (q && !assocTokenPrefix(q)) return false;

  for (let cur = tree.resolveInner(pos, -1); cur; cur = cur.parent) {
    if (cur.name !== 'InfixPragma' && cur.name !== 'AssocPragma') continue;

    const assoc = childNamed(cur, 'Associativity');
    if (assoc) {
      if (pos >= assoc.from && pos <= assoc.to) {
        return assocTokenPrefix(doc.sliceString(assoc.from, pos));
      }
      return false;
    }

    for (let c = cur.firstChild; c; c = c.nextSibling) {
      if (c.name === '.' && pos > c.from) return false;
    }

    const kw = cur.firstChild;
    if (!kw || pos <= kw.to) return false;
    return true;
  }

  // Same-line recovery only: trailing spaces after an open pragma, or a
  // recovered `l`/`r`… token on that line (`--assoc + r`). A later blank line
  // must stay top-decl, not steal left/right.
  const open = priorOpenFixityPragma(tree, pos);
  if (!open) return false;
  if (!q) return sameLineAfter(doc, open.to, pos);

  let tokFrom = pos;
  while (tokFrom > 0 && /[A-Za-z]/.test(doc.sliceString(tokFrom - 1, tokFrom))) tokFrom -= 1;
  if (tokFrom >= pos) return false;
  return sameLineAfter(doc, open.to, tokFrom);
}

export function structureSlotAt(tree, doc, pos, query = '') {
  if (isCaseArmSlot(tree, doc, pos)) return 'case-arm';
  if (isCtorLineSlot(tree, doc, pos)) return 'ctor-line';
  if (isInfixAssocSlot(tree, doc, pos, query)) return 'infix-assoc';
  // Kind slots before top-decl: incomplete `inductive Box : c` must not look
  // like a between-declarations site.
  if (isLfKindSlot(tree, doc, pos)) return 'lf-kind';
  if (isCompKindSlot(tree, doc, pos)) return 'comp-kind';
  if (isSchemaBodySlot(tree, doc, pos, query)) return 'schema-body';
  if (isCtxEntrySlot(tree, doc, pos, query)) return 'ctx-entry';
  if (isTopDeclSlot(tree, doc, pos)) return 'top-decl';
  if (isExprHeadSlot(tree, doc, pos, query)) return 'expr-head';
  return null;
}

// True when insert continues past label at a token boundary (`case` → `case x…`).
function expandsBeyondLabel(label, insert) {
  if (!label || insert == null || insert === label) return false;
  if (!insert.startsWith(label) || insert.length === label.length) return false;
  const next = insert[label.length];
  const last = label[label.length - 1];
  return /\s/.test(next) || (/\w/.test(last) && !/\w/.test(next));
}

export function contributeSnippets(site) {
  if (!site || !site.structure) return [];
  const table = SNIPPETS[site.structure];
  if (!table) return [];
  const q = String(site.query || '').toLowerCase();
  const out = [];
  const cmType = site.structure === 'lf-kind' || site.structure === 'comp-kind' ? 'type' : 'keyword';
  for (const snip of table) {
    if (q && !snip.label.toLowerCase().startsWith(q) && !snip.label.toLowerCase().includes(q)) {
      // case-arm `|` never matches letter queries — correctly yields nothing.
      continue;
    }
    if (expandsBeyondLabel(snip.label, snip.insert)) {
      // Keyword row: label matches what Tab inserts. Slightly lower base so empty
      // structure slots still prefer the scaffold; typed prefixes favor the short label.
      out.push({
        label: snip.label,
        insert: snip.label,
        kind: 'keyword',
        detail: '',
        source: 'snippet-keyword',
        cmType,
        just: 2,
        scoreHints: { base: snip.boost - 1, proximity: 0 },
      });
      out.push({
        label: snip.detail || snip.label,
        insert: snip.insert,
        kind: 'snippet',
        detail: '',
        source: 'snippet',
        cmType,
        just: 2,
        scoreHints: { base: snip.boost, proximity: 0 },
      });
      continue;
    }
    out.push({
      label: snip.label,
      insert: snip.insert,
      kind: 'snippet',
      detail: snip.detail,
      source: 'snippet',
      // Use `type` so kind keywords share the same chrome lane as type families
      // (`keyword` was easy to miss next to peer rows in the popup).
      cmType,
      just: 2,
      scoreHints: { base: snip.boost, proximity: 0 },
    });
  }
  return out;
}

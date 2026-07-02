// Harpoon orchestration (editor side). Bridges a `?` hole in the editor to the
// interactive Harpoon engine: it builds the Harpoon `proof`-form program the
// engine needs, hands it to the UI (js/harpoon-lab.js), and commits the engine's
// translated source back into the user's declaration.
//
// BelJar is the intelligence: the engine only proves `proof name : T = ?`
// theorems (a `?` in an ordinary `rec` body is NOT a harpoon subgoal — see
// memory project-proof-lab), so when the user proves a `rec` body hole we
// TRANSFORM the rec into a proof form to drive the engine, then TRANSFORM the
// translated Comp.exp back into the rec body on commit. We never paste Beluga
// prose — translate output is re-checked before it lands.

import { indentRange } from '@codemirror/language';

// Parse `<kw> name : <type> = <body>` from a top-level declaration's text.
// Returns { kw:'rec'|'proof', name, type, bodyStart } (bodyStart = offset of the
// body within declText, after the top-level `=`), or null when it doesn't match.
export function parseDecl(declText) {
  const s = String(declText == null ? '' : declText);
  const m = /^\s*(rec|proof)\b\s+([A-Za-z_][A-Za-z0-9_']*)\s*:/.exec(s);
  if (!m) return null;
  const kw = m[1];
  const name = m[2];
  // Find the FIRST top-level `=` after the `:` (the type/body separator),
  // skipping any `=` nested in brackets and the `=>`/`>=`/`<=` operators.
  let depth = 0;
  let i = m[0].length;
  let eq = -1;
  for (; i < s.length; i += 1) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    else if (c === '=' && depth === 0) {
      const next = s[i + 1];
      const prev = s[i - 1];
      if (next === '>' || next === '=' || prev === '<' || prev === '>' || prev === '=' || prev === '/') continue;
      eq = i;
      break;
    }
  }
  if (eq === -1) return null;
  const type = s.slice(m[0].length, eq).trim();
  let bodyStart = eq + 1;
  while (bodyStart < s.length && /\s/.test(s[bodyStart])) bodyStart += 1;
  return { kw, name, type, bodyStart, eqOffset: eq };
}

// Build the Harpoon `proof`-form program for the Lab from the assembled checker
// code: replace the enclosing declaration's body with a single `?` and force the
// keyword to `proof`. Returns { code, line, col } where (line,col) is the `?`
// position in the new program (1-based), or null when the decl can't be parsed.
export function buildProofProgram(assembledCode, declFrom, declTo) {
  const code = String(assembledCode == null ? '' : assembledCode);
  const declText = code.slice(declFrom, declTo);
  const decl = parseDecl(declText);
  if (!decl) return null;
  // proof name : type =\n?\n;  — the replaced range [declFrom,declTo) includes
  // the original terminating `;`, so we must re-add one or the parser sees the
  // proof body run to EOF ("Expected the token `;'").
  const header = `proof ${decl.name} : ${decl.type} =`;
  const newDecl = `${header}\n?\n;`;
  const newCode = code.slice(0, declFrom) + newDecl + code.slice(declTo);
  // The `?` sits at the start of the line after the header.
  const before = code.slice(0, declFrom) + header + '\n';
  const line = before.split('\n').length; // 1-based line of the `?`
  return { code: newCode, line, col: 1, decl };
}

// Splice the engine's translated source into the editor as the declaration's
// body. For a `rec`, the body is replaced with the translated Comp.exp; for a
// `proof`, the whole decl is left as a `rec` with the synthesized body (the user
// gets an ordinary function, the idiomatic result of an interactive proof).
// `view` is the CM EditorView; declFrom/declTo are DOC offsets of the decl.
export function commitProof(view, declFrom, declTo, source) {
  const range = declRangeWithSemicolon(view.state.doc, declFrom, declTo);
  const docText = view.state.doc.sliceString(range.from, range.to);
  const decl = parseDecl(docText);
  if (!decl) return false;
  const body = String(source == null ? '' : source).replace(/;\s*$/, '').trimEnd();
  const newDecl = `rec ${decl.name} : ${decl.type} =\n${body}\n;`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: newDecl },
    userEvent: 'input.complete',
  });
  const ir = indentRange(view.state, range.from, range.from + newDecl.length);
  if (!ir.empty) view.dispatch({ changes: ir });
  view.focus();
  return true;
}

// Extend a declaration range to swallow the trailing `;` if the node range
// stopped just before it (the grammar's decl node may exclude the terminator),
// so a re-emitted `rec … ;` doesn't leave a dangling `;`.
export function declRangeWithSemicolon(doc, from, to) {
  let end = to;
  const n = doc.length;
  let i = end;
  while (i < n) {
    const ch = doc.sliceString(i, i + 1);
    if (ch === ';') { end = i + 1; break; }
    if (/\s/.test(ch)) { i += 1; continue; }
    break;
  }
  return { from, to: end };
}

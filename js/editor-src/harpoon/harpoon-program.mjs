// Harpoon orchestration (editor side). Bridges a `?` hole in the editor to the
// interactive Harpoon engine: it builds the Harpoon `proof`-form program the
// engine needs, hands it to the UI (`js/harpoon/harpoon-lab.mjs` / `harpoon-ui`),
// and commits the engine's translated source back into the user's declaration.
//
// BelJar is the intelligence: the engine only proves `proof name : T = ?`
// theorems (a `?` in an ordinary `rec` body is NOT a harpoon subgoal — see
// memory project-proof-lab), so when the user proves a `rec` body hole we
// TRANSFORM the rec into a proof form to drive the engine, then TRANSFORM the
// translated Comp.exp back into the rec body on commit. We never paste Beluga
// prose — translate output is re-checked before it lands.
//
// Mutual `rec f … and g … ;` is one RecDeclaration. Interactive sessions target
// the MEMBER the hole sits in: siblings stay in the program (they are the
// mutual IH pool) and commit rewrites only that member's header+body.

import { formatProofBody } from '../format/proof-format.mjs';
import { dispatchEdit } from '../edit-history.mjs';
import { proveOrchestrationCode } from '../prover/prover-orchestrator.mjs';
import { DECL_IDENT } from '../prover/ident.mjs';
import { memberSpanFromTree } from './scan-file-holes.mjs';
import { parser } from '../beluga-parser.js';

const DECL_HEAD = new RegExp(
  String.raw`^\s*((?:and\s+(?:rec\s+)?)|(?:rec|proof)\s+)(${DECL_IDENT})\s*:`,
  'u',
);

function memberHeadRe(name) {
  const esc = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    String.raw`(^|[\n\r])[ \t]*((?:and\s+(?:rec\s+)?)|(?:rec|proof)\s+)${esc}\s*:`,
    'gu',
  );
}

function normalizeLeader(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

function skipComment(s, i) {
  if (s[i] !== '%') return i;
  if (s[i + 1] === '{') {
    let depth = 1;
    let j = i + 2;
    while (j < s.length && depth > 0) {
      if (s[j] === '%' && s[j + 1] === '{') { depth += 1; j += 2; continue; }
      if (s[j] === '}' && s[j + 1] === '%') { depth -= 1; j += 2; continue; }
      j += 1;
    }
    return j;
  }
  let j = i + 1;
  while (j < s.length && s[j] !== '\n') j += 1;
  return j;
}

function isTypeEq(s, i) {
  const next = s[i + 1];
  const prev = s[i - 1];
  return !(next === '>' || next === '=' || prev === '<' || prev === '>' || prev === '=' || prev === '/');
}

function trimEnd(s, from, i) {
  let end = i;
  while (end > from && /\s/.test(s[end - 1])) end -= 1;
  return end;
}

function memberBodyEnd(s, from) {
  let depth = 0;
  let seenEq = false;
  let i = from;
  while (i < s.length) {
    const c = s[i];
    if (c === '%') { i = skipComment(s, i); continue; }
    if (c === '(' || c === '[' || c === '{') { depth += 1; i += 1; continue; }
    if (c === ')' || c === ']' || c === '}') { depth = Math.max(0, depth - 1); i += 1; continue; }
    if (depth === 0 && c === '=' && !seenEq && isTypeEq(s, i)) { seenEq = true; i += 1; continue; }
    if (depth === 0 && seenEq && c === ';') return trimEnd(s, from, i);
    if (depth === 0 && seenEq && /\s/.test(s[i - 1] || ' ') && /^and\s/.test(s.slice(i, i + 4))) {
      return trimEnd(s, from, i);
    }
    i += 1;
  }
  return s.length;
}

function blockRangeForMember(code, memberFrom) {
  const s = String(code ?? '');
  try {
    const span = memberSpanFromTree(parser.parse(s), memberFrom);
    if (span && span.blockFrom != null) {
      return { from: span.blockFrom, to: span.blockTo };
    }
  } catch (_) { /* fall through */ }
  let i = memberFrom;
  while (i < s.length) {
    if (s[i] === '%') { i = skipComment(s, i); continue; }
    if (s[i] === ';') return { from: memberFrom, to: i + 1 };
    i += 1;
  }
  return { from: memberFrom, to: s.length };
}

// Parse a rec/proof member — standalone, or one arm of `rec … and …`.
// Returns { kw:'rec'|'proof', leader, name, type, bodyStart, eqOffset }.
export function parseDecl(declText) {
  const s = String(declText == null ? '' : declText);
  const m = DECL_HEAD.exec(s);
  if (!m) return null;
  const leader = normalizeLeader(m[1]);
  const name = m[2];
  const kw = /\bproof$/.test(leader) ? 'proof' : 'rec';
  let depth = 0;
  let i = m[0].length;
  let eq = -1;
  for (; i < s.length; i += 1) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    else if (c === '=' && depth === 0 && isTypeEq(s, i)) { eq = i; break; }
  }
  if (eq === -1) return null;
  const type = s.slice(m[0].length, eq).trim();
  let bodyStart = eq + 1;
  while (bodyStart < s.length && /\s/.test(s[bodyStart])) bodyStart += 1;
  return { kw, leader, name, type, bodyStart, eqOffset: eq };
}

export function locateMember(code, name, fromHint = 0) {
  const s = String(code ?? '');
  if (!name) return null;
  const re = memberHeadRe(name);
  const hint = Math.max(0, fromHint | 0);
  re.lastIndex = hint;
  let m = re.exec(s);
  if (!m && hint) {
    re.lastIndex = 0;
    m = re.exec(s);
  }
  if (!m) return null;
  const from = m.index + m[1].length;
  const to = memberBodyEnd(s, from);
  const leader = normalizeLeader(m[2]);
  const block = blockRangeForMember(s, from);
  return { from, to, leader, blockFrom: block.from, blockTo: block.to };
}

export function listCompMembers(docText) {
  const s = String(docText ?? '');
  const re = new RegExp(
    String.raw`(^|[\n\r])[ \t]*((?:and\s+(?:rec\s+)?)|(?:rec|proof)\s+)(${DECL_IDENT})\s*:`,
    'gu',
  );
  const heads = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    heads.push({ from: m.index + m[1].length, name: m[3] });
  }
  const out = [];
  for (let i = 0; i < heads.length; i += 1) {
    const from = heads[i].from;
    const to = memberBodyEnd(s, from);
    out.push({ name: heads[i].name, from, to, text: s.slice(from, to) });
  }
  return out;
}

export function buildProofProgram(assembledCode, declFrom, declTo) {
  const code = String(assembledCode == null ? '' : assembledCode);
  const declText = code.slice(declFrom, declTo);
  const decl = parseDecl(declText);
  if (!decl) return null;
  const hadSemi = /;\s*$/.test(declText);
  // `proof` cannot sit inside a mutual block (`and` continues a `rec`).
  const keepRec = (decl.leader && decl.leader.startsWith('and')) || !hadSemi;
  const header = keepRec
    ? `${decl.leader} ${decl.name} : ${decl.type} =`
    : `proof ${decl.name} : ${decl.type} =`;
  const newDecl = hadSemi ? `${header}\n?\n;` : `${header}\n?`;
  const newCode = code.slice(0, declFrom) + newDecl + code.slice(declTo);
  const before = code.slice(0, declFrom) + header + '\n';
  const line = before.split('\n').length;
  return { code: newCode, line, col: 1, decl };
}

export function committedMemberText(decl, body, hadSemi) {
  const leader = decl.leader && String(decl.leader).startsWith('and') ? decl.leader : 'rec';
  const canonType = expandTypeGlyphs(decl.type);
  const formatted = formatProofBody(String(body == null ? '' : body).replace(/;\s*$/, '').trimEnd());
  return `${leader} ${decl.name} : ${canonType} =\n${formatted}${hadSemi ? '\n;' : ''}`;
}

export function commitProof(view, declFrom, declTo, source) {
  const range = declRangeWithSemicolon(view.state.doc, declFrom, declTo);
  const docText = view.state.doc.sliceString(range.from, range.to);
  const decl = parseDecl(docText);
  if (!decl) return false;
  const hadSemi = /;\s*$/.test(docText);
  const newDecl = committedMemberText(decl, source, hadSemi);
  const fileId = (typeof globalThis !== 'undefined' ? globalThis : window).CurrentEditor?.getCurrentFileId?.() ?? null;
  dispatchEdit(view, {
    changes: { from: range.from, to: range.to, insert: newDecl },
    userEvent: 'input.complete',
  }, { fileId, kind: 'proof-commit' });
  view.focus();
  return true;
}

function expandTypeGlyphs(typeText) {
  return String(typeText == null ? '' : typeText)
    .split('|-').join('⊢')
    .replace(/->/g, '→');
}

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

export function countSiblingHoledDecls(docText, declName) {
  const target = String(declName || '');
  let count = 0;
  for (const mem of listCompMembers(docText)) {
    if (mem.name === target) continue;
    if (/\?/.test(mem.text)) count += 1;
  }
  return count;
}

export function needsFullCommitCheck({ docText, declName }) {
  return countSiblingHoledDecls(docText, declName) > 0;
}

export function buildCommitCheckCodes(assembled, prep, newDecl) {
  const asm = String(assembled ?? '');
  const from = prep.assembledDeclFrom;
  const to = prep.assembledDeclTo;
  const patched = asm.slice(0, from) + newDecl + asm.slice(to);
  const delta = String(newDecl).length - (to - from);
  const blockFrom = prep.assembledBlockFrom != null ? prep.assembledBlockFrom : from;
  const origBlockTo = prep.assembledBlockTo != null ? prep.assembledBlockTo : to;
  const blockTo = origBlockTo + delta;
  const fileStart = prep.fileStart == null ? 0 : prep.fileStart;
  const orchestration = proveOrchestrationCode(patched, prep.name, blockFrom, blockTo, fileStart);
  return { patched, orchestration };
}

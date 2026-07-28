// Corpus decl enumeration for the masking harness (scripts/corpus-*.mjs).
//
// Pure, data-in/data-out. Given a Beluga corpus organised as `sources.cfg` +
// member `.bel`/`.elf` files, we:
//   1. assemble the cfg members (in cfg order) into ONE self-contained program
//      — that concatenation IS the dependency closure Beluga itself uses, so we
//      never re-implement imports (see library/sync-cfgs-from-beluga-w.mjs for
//      the same cfg contract);
//   2. split the assembled program into top-level declarations at bracket-depth
//      0 (the `parseDecl` discipline from harpoon-program.mjs, comment-aware);
//   3. pick the MASKABLE targets — every single (non-`and`) `rec`/`proof` whose
//      computation type parses — leaving LF/schema/inductive/complete-lemma
//      decls as the prelude pool.
//
// The harness masks one target's body to `?` (bel-harpoon.buildProofProgram),
// narrows the prelude via proveOrchestrationCode (which keeps schemas + complete
// siblings and strips only OTHER holed decls), and re-derives it with the live
// checker. Anti-overfit law applies to THIS file too: nothing here may branch on
// a Beluga identifier/constructor name — it reasons purely from syntax.

import { theoremUnderProof } from './prover-hyp.mjs';
import { DECL_IDENT } from './ident.mjs';

// Parse a `sources.cfg`: non-blank, non-`%` lines are member filenames (in
// order). `.cfg` entries recurse into another cfg. Mirrors parseCfgEntries in
// library/sync-cfgs-from-beluga-w.mjs.
export function parseCfgEntries(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%'));
}

// Assemble a cfg-program from an in-memory file map.
//   cfgText  — the sources.cfg contents
//   readFile(name) -> string | null  — resolves a member/.cfg name to its text
// Returns { code, files:[{path, start, end}], unresolved:[names] } where each
// file records its char span in the assembled `code` (so a decl offset maps back
// to a source file). `.cfg` members are inlined recursively (depth-guarded).
export function assembleCfgProgram(cfgText, readFile) {
  const files = [];
  const unresolved = [];
  const seenCfg = new Set();
  let code = '';

  function pushFile(name) {
    const text = readFile(name);
    if (text == null) { unresolved.push(name); return; }
    const start = code.length;
    const normalized = String(text).replace(/\r\n?/g, '\n');
    code += (code && !code.endsWith('\n') ? '\n' : '') + normalized;
    if (!code.endsWith('\n')) code += '\n';
    files.push({ path: name, start, end: code.length });
  }

  function inline(text, cfgName) {
    if (cfgName) {
      if (seenCfg.has(cfgName)) return;
      seenCfg.add(cfgName);
    }
    for (const entry of parseCfgEntries(text)) {
      if (entry.toLowerCase().endsWith('.cfg')) {
        const sub = readFile(entry);
        if (sub == null) { unresolved.push(entry); continue; }
        inline(sub, entry);
      } else {
        pushFile(entry);
      }
    }
  }

  inline(cfgText, null);
  return { code, files, unresolved };
}

// Map a char offset in an assembled program back to { path, line } using the
// files span table from assembleCfgProgram.
export function offsetToFileLine(files, code, offset) {
  const f = (files || []).find((x) => offset >= x.start && offset < x.end);
  const path = f ? f.path : null;
  const base = f ? f.start : 0;
  const local = String(code || '').slice(base, offset);
  const line = local.split('\n').length; // 1-based within the file
  return { path, line };
}

// Advance an index past a Beluga comment starting at `code[i]`, or return i
// unchanged. Handles line comments `% …` and nested block comments `%{ … }%`.
function skipComment(code, i) {
  if (code[i] !== '%') return i;
  if (code[i + 1] === '{') {
    let depth = 1;
    let j = i + 2;
    while (j < code.length && depth > 0) {
      if (code[j] === '%' && code[j + 1] === '{') { depth += 1; j += 2; continue; }
      if (code[j] === '}' && code[j + 1] === '%') { depth -= 1; j += 2; continue; }
      j += 1;
    }
    return j;
  }
  // line comment
  let j = i + 1;
  while (j < code.length && code[j] !== '\n') j += 1;
  return j;
}

// Drop leading whitespace and comments (line `% …` and block `%{ … }%`) so a
// declaration is classified by its first real token, not a preceding comment.
function stripLeadingTrivia(seg) {
  let s = String(seg || '');
  for (;;) {
    const before = s;
    s = s.replace(/^\s+/, '');
    if (s.startsWith('%{')) {
      const end = s.indexOf('}%');
      s = end === -1 ? '' : s.slice(end + 2);
    } else if (s.startsWith('%')) {
      const nl = s.indexOf('\n');
      s = nl === -1 ? '' : s.slice(nl + 1);
    }
    if (s === before) break;
  }
  return s;
}

// The keyword that opens a top-level declaration, or null. `and` continues a
// mutual block (not a fresh decl). Leading comments are ignored.
function declKindAt(rawSeg) {
  const seg = stripLeadingTrivia(rawSeg);
  const m = /^(schema|inductive|coinductive|stratified|typedef|and\s+rec|and\s+inductive|rec|proof|let|--\w+|LF)\b/
    .exec(seg);
  if (!m) {
    // An LF/type-family declaration like `foo : type.` or a constructor
    // `c : T -> foo.` — classified generically as 'lf' (prelude pool).
    if (/^\s*[A-Za-z_⓪-￿][^:;]*:/.test(seg)) return 'lf';
    if (/^\s*%/.test(seg)) return 'pragma';
    return seg.trim() ? 'other' : null;
  }
  const kw = m[1].replace(/\s+/g, ' ');
  if (kw.startsWith('and ')) return kw === 'and rec' ? 'and-rec' : 'and-inductive';
  if (kw === 'LF') return 'inductive'; // `LF name : type = …` datatype
  if (kw.startsWith('--')) return 'pragma';
  return kw;
}

// Is a top-level `.` at index i a SENTENCE terminator (ends an old-style LF/
// pragma decl like `tp : type.`) rather than a projection (`b.1`, `#p.h`), a
// range (`..`), a decimal, or a qualified name (`Nat.z`)? Heuristic: the `.` is
// a terminator when the next non-space char is a newline/EOF or the start of a
// new top-level sentence, and it is not glued to identifier/digit chars on both
// sides. Since we only need decl BOUNDARIES (the prelude is kept verbatim), a
// rare misjudgement merely fuses two prelude decls — harmless.
function isSentenceDot(s, i) {
  const prev = s[i - 1];
  const next = s[i + 1];
  if (next === '.') return false;           // `..` range
  if (prev === '.') return false;           // second dot of `..`
  if (/[0-9]/.test(prev) && /[0-9]/.test(next || '')) return false; // decimal
  // projection / qualified name: `.` glued between two identifier chars
  if (/[A-Za-z0-9_'#]/.test(prev || '') && /[A-Za-z0-9_']/.test(next || '')) return false;
  // Otherwise treat `.` followed by whitespace/EOF (or a new sentence) as a terminator.
  return next === undefined || /\s/.test(next);
}

// Split a program into top-level declarations. Beluga has TWO terminators: `;`
// (rec/proof/schema/LF-datatype/inductive) and `.` (old-style LF families &
// constructors, pragmas). We break at whichever comes first at bracket-depth 0,
// skipping comments. Returns [{ from, to, text, kind, name }].
export function enumerateDecls(code) {
  const s = String(code || '');
  const decls = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  // Push the segment [start,to). We advance `from` past leading comments/space so
  // the recorded text starts at the real first token (a preceding comment belongs
  // to nothing) — keeping offsets valid for masking downstream.
  function push(to) {
    const raw = s.slice(start, to);
    if (raw.trim()) {
      const stripped = stripLeadingTrivia(raw);
      const from = to - stripped.length; // real token start in `s`
      const kind = declKindAt(stripped);
      decls.push({ from, to, text: stripped, kind, name: declName(stripped, kind) });
    }
    start = to;
  }
  while (i < s.length) {
    const c = s[i];
    if (c === '%') { i = skipComment(s, i); continue; }
    if (c === '(' || c === '[' || c === '{') { depth += 1; i += 1; continue; }
    if (c === ')' || c === ']' || c === '}') { depth = Math.max(0, depth - 1); i += 1; continue; }
    if (depth === 0 && c === ';') { push(i + 1); i = start; continue; }
    if (depth === 0 && c === '.' && isSentenceDot(s, i)) {
      // A `.` never terminates a `;`-decl (rec/proof/schema/…): those legitimately
      // contain projections. Only close a `.`-terminated segment when the current
      // open segment (ignoring leading comments) isn't a `;`-keyword decl.
      const seg = stripLeadingTrivia(s.slice(start, i + 1));
      if (!/^(?:and\s+)?(?:rec|proof|schema|inductive|coinductive|stratified|typedef|LF)\b/.test(seg)) {
        push(i + 1);
        i = start;
        continue;
      }
    }
    i += 1;
  }
  push(s.length);
  return decls;
}

function declName(text, kind) {
  if (kind === 'rec' || kind === 'proof' || kind === 'and-rec') {
    const m = new RegExp(String.raw`^\s*(?:and\s+)?(?:rec|proof)\s+(${DECL_IDENT})`, 'u').exec(text);
    return m ? m[1] : null;
  }
  if (kind === 'schema') {
    const m = new RegExp(String.raw`^\s*schema\s+(${DECL_IDENT})`, 'u').exec(text);
    return m ? m[1] : null;
  }
  if (kind === 'inductive' || kind === 'coinductive' || kind === 'stratified' || kind === 'and-inductive') {
    const m = new RegExp(
      String.raw`^\s*(?:and\s+)?(?:LF\s+)?(?:inductive|coinductive|stratified)?\s*(${DECL_IDENT})\s*:`,
      'u',
    ).exec(text);
    return m ? m[1] : null;
  }
  return null;
}

// Does a decl segment contain a top-level `and` keyword (a mutual `rec … and …`
// block, which Beluga terminates with a single `;`)? Scans at bracket-depth 0,
// skipping comments, so an `and` nested in a type/term doesn't count.
function hasTopLevelAnd(text) {
  const s = String(text || '');
  let depth = 0;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '%') { i = skipComment(s, i); continue; }
    if (c === '(' || c === '[' || c === '{') { depth += 1; i += 1; continue; }
    if (c === ')' || c === ']' || c === '}') { depth = Math.max(0, depth - 1); i += 1; continue; }
    // A whitespace-delimited `and` keyword token at depth 0 (Beluga syntax, not a
    // program identifier) marks a mutual block.
    if (depth === 0 && /\s/.test(s[i - 1] || ' ') && /^and\s/.test(s.slice(i, i + 4))) {
      return true;
    }
    i += 1;
  }
  return false;
}

// The maskable targets in an assembled program: every SINGLE `rec`/`proof`
// (not part of a mutual `and` block) whose computation type parses. Mutual
// `and`-joined decls are reported as skips (buildProofProgram masks one decl and
// can't split a mutual block in v1). Everything else is the prelude pool.
//   -> { targets:[{ name, from, to, declText, thm }], skips:[{name, reason}] }
export function maskableTargets(code) {
  const decls = enumerateDecls(code);
  const targets = [];
  const skips = [];
  for (let k = 0; k < decls.length; k += 1) {
    const d = decls[k];
    if (d.kind === 'and-rec') {
      skips.push({ name: d.name, from: d.from, to: d.to, reason: 'mutual' });
      continue;
    }
    if (d.kind !== 'rec' && d.kind !== 'proof') continue;
    // A single `;`-segment containing a top-level `and` IS a mutual block —
    // each MEMBER is a target (masked individually; the sibling members stay
    // complete and act as the mutual IH pool, checker-certified as always).
    if (hasTopLevelAnd(d.text)) {
      for (const mem of mutualMembers(d.text)) {
        const thmM = theoremUnderProof(mem.declish);
        if (!thmM || !thmM.compType) {
          skips.push({ name: mem.name, from: d.from, to: d.to, reason: 'unparseable-type' });
          continue;
        }
        targets.push({ name: mem.name, from: d.from, to: d.to, declText: mem.declish, thm: thmM, mutual: true });
      }
      continue;
    }
    const thm = theoremUnderProof(d.text);
    if (!thm || !thm.compType) {
      skips.push({ name: d.name, from: d.from, to: d.to, reason: 'unparseable-type' });
      continue;
    }
    // A body that is already just `?` is nothing to re-derive.
    const decl = parseSingle(d.text);
    if (decl && decl.bodyIsHole) {
      skips.push({ name: d.name, from: d.from, to: d.to, reason: 'already-hole' });
      continue;
    }
    targets.push({ name: d.name, from: d.from, to: d.to, declText: d.text, thm });
  }
  return { targets, skips };
}

// Split a mutual `rec f : T1 = b1 and g : T2 = b2 ;` block into its members.
// Each member yields { name, declish } where declish is the member respelled as
// a standalone `rec name : type =` header (for theoremUnderProof). Boundaries
// are top-level ` and ` tokens (comment-skipping, bracket-depth 0).
export function mutualMembers(blockText) {
  const s = String(blockText || '');
  const cuts = [0];
  let depth = 0;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '%') { i = skipComment(s, i); continue; }
    if (c === '(' || c === '[' || c === '{') { depth += 1; i += 1; continue; }
    if (c === ')' || c === ']' || c === '}') { depth = Math.max(0, depth - 1); i += 1; continue; }
    if (depth === 0 && /\s/.test(s[i - 1] || ' ') && /^and\s/.test(s.slice(i, i + 4))) cuts.push(i);
    i += 1;
  }
  cuts.push(s.length);
  const out = [];
  for (let k = 0; k < cuts.length - 1; k += 1) {
    const seg = s.slice(cuts[k], cuts[k + 1]).trim().replace(/;\s*$/, '');
    const m = new RegExp(String.raw`^(?:rec|proof|and)\s+(${DECL_IDENT})\s*:([\s\S]*)$`, 'u').exec(seg);
    if (!m) continue;
    out.push({ name: m[1], declish: `rec ${m[1]} :${m[2]}\n;` });
  }
  return out;
}

// Mask the body of the named decl (single `rec`/`proof`, or one MEMBER of a
// mutual `and` block) to `?` IN PLACE — keeping the `rec` keyword and the
// body's LEADING pragmas VERBATIM. Both pragma forms matter: `/ total … /` is
// the prover's IH measure, and `/ trust /` keeps `/ total /` siblings that
// call this decl checking (a total function may only call total/trusted ones).
// The scan is comment-aware in BOTH directions: a pragma inside a `% …`
// comment is trivia and must never be resurrected (the real-corpus idiom
// `/ trust / % / total m (f …) /` carries a commented-out BROKEN measure), and
// a `;`/`and` inside a comment never ends the body.
//
// SELF-CONTAINED by design (no module-scope helpers): the live harness ships
// this exact function into the browser page via `maskByName.toString()`, so it
// must close over nothing.
//   -> { code, declText, kw, boundary } | null
//      code     — the whole program with just this member's body masked
//      declText — the member respelled standalone (for theoremUnderProof)
export function maskByName(text, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const head = new RegExp('(?:^|\\n|\\s)(rec|proof|and)\\s+' + esc + '\\s*:', 'g');
  // Advance past a `% …` line comment or nested `%{ … }%` block comment.
  function skip(s, i) {
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
  // Comment-aware head search: a commented-out `rec f : …` must not steal the
  // match from a later live decl of the same name (algeq-typing's lookup).
  const live = new Uint8Array(text.length);
  live.fill(1);
  for (let i = 0; i < text.length;) {
    if (text[i] === '%') {
      const j = skip(text, i);
      live.fill(0, i, j);
      i = j;
      continue;
    }
    i += 1;
  }
  let hm = null;
  let m;
  while ((m = head.exec(text)) !== null) {
    const kwAt = m.index + m[0].search(/rec|proof|and/);
    if (live[kwAt]) { hm = m; break; }
  }
  if (!hm) return null;
  const kw = hm[1];
  // The body `=` is the first STANDALONE `=` token at bracket depth 0 —
  // identifiers may contain/end with `=` (`pred=`) and an infix `=` type
  // lives inside boxes at depth > 0; a first-`=` regex truncates both.
  const typeFrom = hm.index + hm[0].length;
  let eqIdx = -1;
  {
    let depth = 0;
    for (let i = typeFrom; i < text.length; i += 1) {
      const c = text[i];
      if (c === '%') { i = skip(text, i) - 1; continue; }
      if (c === '(' || c === '[' || c === '{') depth += 1;
      else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
      else if (depth === 0 && c === ';') break;
      else if (depth === 0 && c === '='
        && (i === typeFrom || /\s/.test(text[i - 1]))
        && (i + 1 >= text.length || /\s/.test(text[i + 1]))) { eqIdx = i; break; }
    }
  }
  if (eqIdx < 0) return null;
  const typeStr = text.slice(typeFrom, eqIdx).trim();
  const bodyFrom = eqIdx + 1; // just past the member's `=`
  // Member body ends at the next top-level ` and ` or `;` (comment-skipping).
  let depth = 0;
  let i = bodyFrom;
  let end = -1;
  let boundary = ';';
  while (i < text.length) {
    const c = text[i];
    if (c === '%') { i = skip(text, i); continue; }
    if (c === '(' || c === '[' || c === '{') { depth += 1; i += 1; continue; }
    if (c === ')' || c === ']' || c === '}') { depth = Math.max(0, depth - 1); i += 1; continue; }
    if (depth === 0 && c === ';') { end = i; boundary = ';'; break; }
    if (depth === 0 && /\s/.test(text[i - 1] || ' ') && /^and\s/.test(text.slice(i, i + 4))) {
      end = i; boundary = 'and'; break;
    }
    i += 1;
  }
  if (end < 0) return null;
  const bodyText = text.slice(bodyFrom, end);
  // Collect the body's leading pragmas (`/ … /`), skipping comments between/
  // before them; stop at the first real non-pragma token (the body proper).
  let pragmas = '';
  let p = 0;
  while (p < bodyText.length) {
    if (/\s/.test(bodyText[p])) { p += 1; continue; }
    if (bodyText[p] === '%') { p = skip(bodyText, p); continue; }
    if (bodyText[p] === '/') {
      const close = bodyText.indexOf('/', p + 1);
      if (close < 0) break;
      pragmas += bodyText.slice(p, close + 1) + '\n';
      p = close + 1;
      continue;
    }
    break;
  }
  const maskedBody = `\n${pragmas}?\n`;
  const code = text.slice(0, bodyFrom) + maskedBody + text.slice(end);
  // `=` MUST start a fresh line: typeStr.strip often leaves a trailing `% …`
  // line-comment with no newline (trim ate it), and putting `=` on that same
  // line lets theoremUnderProof's comment-skip swallow the body marker
  // (eq-proof's `trans` — 5× harness FAIL "could not parse theorem").
  const declText = `rec ${name} : ${typeStr}\n=\n${pragmas}?\n;`;
  return { code, declText, kw, boundary };
}

// Minimal single-decl body inspection (does the body already collapse to `?`).
// Body found via the same standalone-`=`-token rule as maskByName (identifiers
// may contain `=`; a first-`=` regex misreads `pred=`-style families).
function parseSingle(declText) {
  const s = String(declText || '');
  const m = new RegExp(String.raw`^\s*(rec|proof)\s+${DECL_IDENT}\s*:`, 'u').exec(s);
  if (!m) return null;
  let depth = 0;
  let eq = -1;
  for (let i = m[0].length; i < s.length; i += 1) {
    const c = s[i];
    if (c === '%') { i = skipComment(s, i) - 1; continue; }
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    else if (depth === 0 && c === ';') break;
    else if (depth === 0 && c === '='
      && (i === m[0].length || /\s/.test(s[i - 1]))
      && (i + 1 >= s.length || /\s/.test(s[i + 1]))) { eq = i; break; }
  }
  if (eq < 0) return null;
  const body = s.slice(eq + 1).replace(/;\s*$/, '')
    .replace(/\/\s*(?:total|trust)[^/]*\//g, '').trim();
  return { bodyIsHole: body === '?' };
}

// case-pieces.mjs — read the AUTHORED pieces out of a proof, and the rule set they
// are pieces of.
//
// The front half of the split the case-completion track is built around:
//   (authored arms) -> pieces + rule set      <- here
//   (rule, pieces)  -> assignment             <- case-assignment.mjs
//
// ⛔ Everything here DERIVES. Family names come from `enumerateDecls`, constructors
// from `enumerateConstructorsTyped`, identifier shape from `ident.mjs`. Nothing
// re-parses Beluga with its own regexes, because a second reading of the signature
// is a second thing to keep true (invariant 22: the dominant failure mode was the
// model misreading the program, not a missing move).

import { enumerateDecls, mutualMembers } from './prover-corpus-decls.mjs';
import { enumerateConstructorsTyped } from './hole-split.mjs';
import { armPatternPart } from './prover-hyp.mjs';
import { DECL_IDENT } from './ident.mjs';

// Constructor and family names as Beluga's LEXER sees them: they may carry symbols
// (`step_@1`, `lin_s≡`, `pred=`). ⛔ Never hand-roll this class -- a letters-only
// identifier silently truncated `step_@1` to `step_` and lost five rules of `step`.
const reHead = new RegExp(`^(${DECL_IDENT})`, 'u');
// NB `String.raw`: a plain template literal swallows the backslash and `\s` becomes a
// literal `s`, which silently matched nothing.
const reHeadColon = new RegExp(String.raw`^(${DECL_IDENT})\s*:`, 'u');

/**
 * Every declared type family, mutual blocks flattened.
 * A mutual LF block is ONE declaration with several heads: `enumerateDecls` reports
 * the first, `mutualMembers` the rest.
 */
export function declaredFamilies(code) {
  const out = [];
  for (const d of enumerateDecls(code)) {
    // `LF f : … = | c : …;` reports kind `inductive` and carries a name. The Twelf
    // form the corpus is mostly written in (`oft : term -> tp -> type.`) reports
    // kind `lf` with NO name, and its constructors are separate top-level decls.
    // Both are families; only the first announces itself.
    if (d.kind !== 'inductive' && d.kind !== 'lf') continue;
    if (d.name && isFamilyDecl(d.text)) out.push(d.name);
    else if (!d.name) { const h = familyHeadOf(d.text); if (h) out.push(h); }
    for (const m of mutualMembers(d.text) || []) {
      if (m && m.name && isFamilyDecl(m.declish)) out.push(m.name);
    }
  }
  return [...new Set(out)];
}

/** The declared type of a declaration: everything between `:` and `=`/terminator. */
function declaredTypeOf(declText) {
  let s = String(declText == null ? '' : declText).trim();
  s = s.replace(/^(?:and\s+)?(?:LF|inductive|rec)\s+/, '');
  const colon = s.indexOf(':');
  if (colon < 0) return '';
  s = s.slice(colon + 1);
  // Stop at the block-form `=` (top level only — an index may contain one).
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth -= 1;
    else if (depth === 0 && c === '=' && s[i + 1] !== '=') return s.slice(0, i);
  }
  return s.replace(/[.;]\s*$/, '');
}

/** A family is a declaration whose result is literally `type`. */
function isFamilyDecl(declText) {
  const t = declaredTypeOf(declText);
  if (!t) return false;
  let depth = 0;
  let last = 0;
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth -= 1;
    else if (depth === 0 && c === '-' && t[i + 1] === '>') last = i + 2;
  }
  return /^\s*type\s*[.;]?\s*$/.test(t.slice(last));
}

/** The head identifier of a nameless (Twelf-form) declaration, when it is a family. */
function familyHeadOf(declText) {
  if (!isFamilyDecl(declText)) return null;
  const m = String(declText || '').trim().match(reHeadColon);
  return m ? m[1] : null;
}

/** constructor name -> the family it constructs. The inverse of the enumerator. */
export function ruleIndex(code) {
  const idx = new Map();
  for (const fam of declaredFamilies(code)) {
    for (const c of enumerateConstructorsTyped(code, fam)) {
      if (!idx.has(c.name)) idx.set(c.name, fam);
    }
  }
  return idx;
}

/**
 * Index of the top-level `=>` that separates an arm's pattern from its body, or -1.
 * Depth-aware: a `=>` inside a box or a parenthesised type is not the separator.
 */
export function armArrowIndex(armText) {
  const s = String(armText == null ? '' : armText);
  let depth = 0;
  for (let i = 0; i < s.length - 1; i += 1) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth -= 1;
    else if (depth === 0 && c === '=' && s[i + 1] === '>') return i;
  }
  return -1;
}

/** Everything left of the arm's top-level `=>`. */
function splitArmPattern(armText) {
  const i = armArrowIndex(armText);
  return i < 0 ? armText : armText.slice(0, i);
}

/**
 * The head constructor of one arm's pattern, or null when the arm does not case on
 * a constructor (a bare variable, a projection, a literal).
 *
 * ⛔ Returns null rather than guessing. A pattern we cannot read is not a rule we may
 * claim to have covered.
 */
export function armRuleHead(armText) {
  // ⛔ CUT THE BODY OFF FIRST. A branch is `pattern => body`, and the body is full of
  // boxes and turnstiles of its own — reading the arm whole made `[ |- e_switch_true]
  // => let [ |- t_switch D D1 D2] = d in [ |- D1]` report its head as `D1`.
  let pat = armPatternPart(splitArmPattern(String(armText == null ? '' : armText))).trim();
  pat = pat.replace(/^\|/, '').trim();
  // Take the boxed term if there is one: `[g |- s_app1 D]` -> `s_app1 D`.
  const boxed = pat.match(/^\[([\s\S]*)\]$/);
  let term = boxed ? boxed[1] : pat;
  // The FIRST turnstile is the context separator; later ones would belong to nested
  // boxes. ⚠ Unpinned: once the body is cut off, no real pattern in the corpus has a
  // second turnstile, so `indexOf` vs `lastIndexOf` is not observable here. Correct by
  // construction, not by test — do not read the suite as evidence for it.
  const turn = term.indexOf('|-');
  if (turn >= 0) term = term.slice(turn + 2);
  term = term.trim();
  // A head is a leading identifier. A lambda, a parenthesised term, a projection or a
  // parameter variable is not a constructor application we can name.
  const m = term.match(reHead);
  if (!m) return null;
  const head = m[1];
  if (head === 'case' || head === 'let' || head === 'impossible') return null;
  return head;
}

// ⛔ NO TREE WALKING HERE. Reading arms out of a document means naming grammar
// nodes, and that is Beluga coupling the *jar purity ratchet counts. `authoredPieces`
// takes the arms as DATA, exactly as it takes the rule set as data: whoever already
// holds a parsed document supplies them (the editor has one; the harness parses one).
// Where that reader should live is a wiring decision, not this module's business.

/**
 * The authored pieces of one proof, plus the judgment they case on.
 *
 * A PIECE is one authored arm. It is named by its ARGUMENT — the rule the author
 * wrote it at — never by index, because an index means nothing to a reader and
 * shifts when an arm is inserted.
 *
 * The judgment is resolved from the arm heads themselves (the family that most of
 * them construct), not from the theorem type: the theorem type may be stated over a
 * context or a box the induction does not case on, while the arms are ground truth
 * about what was actually split.
 *
 * @param {string} code  the assembled program, for the signature
 * @param {string[]} arms  the outermost case arms of the proof, as raw text
 * @returns {{ judgment: string|null, pieces: Array, unreadable: number }}
 */
export function authoredPieces(code, arms) {
  const idx = ruleIndex(code);
  const pieces = [];
  let unreadable = 0;
  const votes = new Map();

  for (const armText of (arms || [])) {
    const rule = armRuleHead(armText);
    if (!rule) { unreadable += 1; continue; }
    const fam = idx.get(rule) || null;
    if (fam) votes.set(fam, (votes.get(fam) || 0) + 1);
    const eq = armArrowIndex(armText);
    pieces.push({
      id: `the ${rule} case`,
      rule,
      family: fam,
      pattern: (eq >= 0 ? armText.slice(0, eq) : armText).replace(/^\s*\|/, '').trim(),
      body: eq >= 0 ? armText.slice(eq + 2).trim() : '',
    });
  }

  let judgment = null;
  let best = 0;
  for (const [fam, n] of votes) if (n > best) { best = n; judgment = fam; }

  // Arms that case on a DIFFERENT family than the judgment are not pieces of this
  // induction; keep them out rather than let them pose as coverage.
  return {
    judgment,
    pieces: pieces.filter((p) => !judgment || p.family === judgment),
    unreadable,
  };
}

/**
 * What the author left for the machine: the rules of the judgment with no authored
 * arm. This is the completion target, and it is computed from the signature, never
 * from a coverage error message.
 */
export function missingRules(code, judgment, pieces) {
  const written = new Set((pieces || []).map((p) => p.rule));
  return enumerateConstructorsTyped(code, judgment).filter((r) => !written.has(r.name));
}

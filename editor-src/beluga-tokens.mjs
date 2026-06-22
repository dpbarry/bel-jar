import { ExternalTokenizer } from '@lezer/lr';
import { BlockComment, NamedProjection, ParameterSubstArg, ProofScript } from './beluga-parser.terms.js';

// Beluga's lexer makes `.field` a single DOT_IDENT token and the PARSER decides
// whether it is a projection or a lambda binder's `.` + body (it can split the
// token). Lezer can't split tokens, so we mirror the parser's decision here: a
// `.name` becomes a NamedProjection ONLY in a state where the grammar can shift
// one (i.e. right after a projectable term) — never where a bare `.` is wanted
// (lambda binder `\x.M`, declaration terminator `T.`).
const RESERVED = new Set([
  46 /* . */, 44 /* , */, 58 /* : */, 59 /* ; */, 37 /* % */, 124 /* | */,
  34 /* " */, 92 /* \ */, 40, 41, 91, 93, 123, 125, 60 /* < */, 62 /* > */,
  0x22a2 /* ⊢ */,
]);
function isIdentContinue(ch) { return ch > 32 && ch !== 127 && !RESERVED.has(ch); }
function isIdentStart(ch) {
  return isIdentContinue(ch) && !(ch >= 48 && ch <= 57) && ch !== 35 /* # */ && ch !== 36 /* $ */;
}

export const namedProjection = new ExternalTokenizer((input, stack) => {
  if (input.peek(0) !== 46) return;             // not "."
  if (!isIdentStart(input.peek(1))) return;     // ".2" / ".." / bare "." handled elsewhere
  if (!stack.canShift(NamedProjection)) return; // only where a projection is grammatical
  let i = 2;
  while (isIdentContinue(input.peek(i))) i += 1;
  input.acceptToken(NamedProjection, i);
}, { contextual: true });

// Nested block comments `%{ ... }%` (and `%{{ ... }}%` documentation comments,
// which depth-count identically). Beluga's lexer nests these; Lezer's @local
// tokens can't, so we scan and balance the `%{` / `}%` delimiters here.
export const blockComment = new ExternalTokenizer((input) => {
  if (input.peek(0) !== 37 || input.peek(1) !== 123) return; // must open with "%{"
  let depth = 0;
  let i = 0;
  for (;;) {
    const c = input.peek(i);
    if (c < 0) break; // EOF: accept the unterminated comment rather than erroring
    if (c === 37 && input.peek(i + 1) === 123) { depth += 1; i += 2; continue; } // %{
    if (c === 125 && input.peek(i + 1) === 37) { // }%
      i += 2;
      depth -= 1;
      if (depth === 0) break;
      continue;
    }
    i += 1;
  }
  input.acceptToken(BlockComment, i);
});

function identLength(input) {
  const first = input.next;
  if (first < 0) return 0;
  const isUpper = first >= 65 && first <= 90;
  if (!isUpper && !isIdentStart(first)) return 0;
  let len = 1;
  while (isIdentContinue(input.peek(len))) len += 1;
  return len;
}

export const parameterSubst = new ExternalTokenizer((input) => {
  const len = identLength(input);
  if (!len) return;
  if (input.peek(len) !== 91) return; // [
  if (input.peek(len + 1) !== 46 || input.peek(len + 2) !== 46) return; // ..
  let end = len + 3;
  while (true) {
    const ch = input.peek(end);
    if (ch < 0) return;
    if (ch === 93) break; // ]
    end += 1;
  }
  input.acceptToken(ParameterSubstArg, end + 1);
}, { contextual: true });

// Harpoon proof body: parse the `proof name : type =` header precisely, then
// consume the proof script opaquely. The script is brace/bracket/paren-balanced
// and the declaration ends at the first `;` seen at depth 0 (the internal
// statement separators of a Harpoon proof sit inside its `{ ... }` blocks).
export const proofScript = new ExternalTokenizer((input) => {
  let depth = 0;
  let len = 0;
  for (;;) {
    const ch = input.peek(len);
    if (ch < 0) break;                                   // EOF
    if (ch === 123 || ch === 91 || ch === 40) depth += 1;       // { [ (
    else if (ch === 125 || ch === 93 || ch === 41) {            // } ] )
      if (depth === 0) break;
      depth -= 1;
    } else if (ch === 59 && depth === 0) break;          // ; terminates the decl
    len += 1;
  }
  if (len > 0) input.acceptToken(ProofScript, len);
});

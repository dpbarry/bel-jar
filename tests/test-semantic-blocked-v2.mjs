// Semantic Engine V2 — quiet blocking lock-down.
// Pins the "one broken declaration never darkens independent insight"
// guarantee: an unresolved lower-case reference blocks only its owner,
// upper-case implicits never block, and a syntax error is syntax-fault
// (not blocked). Independent declarations stay queryable throughout.
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSemanticEngine } from '../js/editor-src/semantic/semantic-engine.mjs';
import { STATUS } from '../js/editor-src/semantic/ids.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function engineOf(src) {
  const e = createSemanticEngine();
  e.update(parser.parse(src), Text.of(src.split('\n')));
  return e;
}

const statusOf = (e, name) => e.debugSnapshot().graph.nodes.find((n) => n.name === name)?.status;

// --- Lower-case unresolved ref blocks only its owner --------------------
const BAD = `LF o : type =
  | ⊤ : o
;
rec foo : [ |- o] =
  bogusref
;
LF good : o → type =
  | gI : good ⊤
;
`;
const e = engineOf(BAD);
expect(statusOf(e, 'foo') === STATUS.BLOCKED, `foo should be blocked, got ${statusOf(e, 'foo')}`);
for (const n of ['o', '⊤', 'good', 'gI']) {
  expect(statusOf(e, n) !== STATUS.BLOCKED, `independent node ${n} must not be blocked`);
}
// Independent declaration is still queryable while another is blocked.
const giPos = BAD.indexOf('gI');
const q = e.queryAt(giPos + 1);
expect(q && q.symbol && q.symbol.name === 'gI', 'gI must remain queryable while foo is blocked');

// --- Upper-case implicit/metavariables never block ----------------------
// In the nd sample ⊃I references A and B (upper, unresolved) yet must stay
// non-blocked because those are implicit binders.
const ND = `LF o : type =
  | ⊃ : o → o → o
;
LF nd : o → type =
  | ⊃I : (nd A → nd B) → nd (A ⊃ B)
;
`;
const e2 = engineOf(ND);
const ub = e2.debugSnapshot().references.filter((r) => r.name === 'A' || r.name === 'B');
expect(ub.length > 0 && ub.every((r) => r.resolution === 'unresolved'), 'A/B should be unresolved uppercase refs');
expect(statusOf(e2, '⊃I') !== STATUS.BLOCKED, 'uppercase implicits must not block ⊃I');

// --- A syntax error is syntax-fault, not blocked ------------------------
const BROKEN = `LF o : type =
  | | ⊤ : o
;
`;
const e3 = engineOf(BROKEN);
expect(e3.debugSnapshot().summary.syntaxDiagnostics > 0, 'broken sample should report a syntax diagnostic');
expect(statusOf(e3, 'o') === STATUS.SYNTAX_FAULT, `o should be syntax-fault, got ${statusOf(e3, 'o')}`);
expect(statusOf(e3, 'o') !== STATUS.BLOCKED, 'syntax fault must not be reported as blocked');

console.log('OK semantic blocked v2 (quiet blocking, implicits safe, syntax-fault distinct)');

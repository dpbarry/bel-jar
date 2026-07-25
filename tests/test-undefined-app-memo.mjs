// Guard for the per-lint-pass memoization in name-resolve.mjs
// (externalKnownName + findEnclosingLocalBinder). Both memos are cleared at the
// top of every collectUndefinedApplicationDiags call and keyed by node position.
// Risks audited: (a) a memo returning a WRONG answer within a pass (e.g. a
// locally-bound identifier reported undefined because a nested application
// re-asked its binder), and (b) stale answers LEAKING across edits when
// positions shift. This test pins both: idempotency across repeated passes, and
// position-correct results after an edit that moves declarations.

import assert from 'node:assert';
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { syntaxLintTree } from '../js/editor-src/ide/syntax-lint.mjs';

function undefDiags(src) {
  const doc = Text.of(src.split('\n'));
  const tree = parser.parse(src);
  return syntaxLintTree(tree, doc).filter((d) => /not defined/.test(d.message));
}

// A genuine typo `t p` (both atoms undefined) — must be flagged on both atoms.
const TYPO = `name : type.
tp : type.
⅋ : t p -> tp -> tp.
`;

// (a) Idempotency: running the pass repeatedly (memo cleared + rebuilt each time)
// yields byte-identical results — a stale/leaking memo would drift.
{
  const first = undefDiags(TYPO);
  assert.ok(first.length >= 2, 'typo flags both atoms');
  for (let i = 0; i < 5; i += 1) {
    const again = undefDiags(TYPO);
    assert.deepStrictEqual(again, first, 'undefined-app diags are idempotent across passes (memo clear works)');
  }
}

// (b) A locally-bound identifier used as an application head/arg must NOT be
// flagged — findEnclosingLocalBinder must resolve it as bound even when a nested
// application re-asks the same head position (the memo path). `dual A A'` binds
// A, A' via the constructor pattern; they are implicit/bound, not undefined.
{
  const VALID = `LF tp : type.
LF dual : tp -> tp -> type =
  | d : dual A A'
;
`;
  const diags = undefDiags(VALID);
  assert.equal(diags.length, 0, 'locally-bound application args are not flagged undefined (memo returns bound)');
}

// (c) Position-correctness after an edit: prepend a line so every declaration
// shifts down. The typo must still be flagged, and at the NEW offsets — a memo
// keyed by stale positions would either miss it or point at the wrong span.
{
  const shifted = 'x : type.\n' + TYPO;
  const doc = Text.of(shifted.split('\n'));
  const diags = undefDiags(shifted);
  assert.ok(diags.length >= 2, 'typo still flagged after a position-shifting edit');
  for (const d of diags) {
    const slice = doc.sliceString(d.from, d.to);
    assert.ok(/^[a-z]+$/.test(slice), `diag anchored on the real atom text, got "${slice}"`);
    // The typo atoms live on the shifted `⅋` line, not on line 1.
    assert.ok(d.from > shifted.indexOf('⅋'), 'diag offset tracks the shifted declaration');
  }
}

console.log('OK undefined-app-memo (idempotent, bound args not flagged, position-correct after edit)');

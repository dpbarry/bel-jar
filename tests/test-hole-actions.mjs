// Interactive hole actions — pure helpers: command-result parsing, split target
// extraction, intro applicability. (The toolbar DOM + async runner need a live
// view/worker; covered by the live verification.)
import {
  parseHoleCommandResult,
  splitTargetsOf,
  canIntro,
} from '../js/editor-src/prover/hole-actions.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── parseHoleCommandResult ──────────────────────────────────────────────────
// A split's real output (from the browser spike): a case expr terminated by `;`.
const SPLIT = 'case n of\n| [ |- z] =>\n  ?\n| [ |- s X] =>\n  ?;\n';
const r1 = parseHoleCommandResult(SPLIT);
expect(r1.ok, 'split output parses ok');
expect(!/;\s*$/.test(r1.text), 'trailing semicolon stripped');
expect(r1.text.startsWith('case n of'), 'case head preserved');
expect(r1.text.includes('| [ |- s X] =>'), 'branches preserved');

// intro of an arrow goal: `fn Y => fn X =>\n?;`
const r2 = parseHoleCommandResult('fn Y => fn X =>\n?;\n');
expect(r2.ok && r2.text === 'fn Y => fn X =>\n?', 'intro output trimmed');

// A bare `?;` (intro with nothing to introduce) still parses to `?`.
const r3 = parseHoleCommandResult('?;\n');
expect(r3.ok && r3.text === '?', 'bare hole parses to ?');

// Error output (leading `-`) is NOT ok; the message is extracted.
const r4 = parseHoleCommandResult('- No variable n found;\n');
expect(!r4.ok, 'error output is not ok');
expect(r4.error === 'No variable n found', `error message extracted (got ${JSON.stringify(r4.error)})`);

// Empty / whitespace → not ok.
expect(!parseHoleCommandResult('').ok, 'empty is not ok');
expect(!parseHoleCommandResult('   \n  ').ok, 'whitespace is not ok');

// ── splitTargetsOf ──────────────────────────────────────────────────────────
const hole = {
  goal: '[ |- nat]',
  ctx: [{ name: 'n', type: '[ |- nat]' }, { name: 'm', type: '[ |- nat]' }],
  meta: [],
};
expect(JSON.stringify(splitTargetsOf(hole)) === JSON.stringify(['n', 'm']),
  'split targets are the computation-context vars in order');
expect(splitTargetsOf({ ctx: [] }).length === 0, 'no ctx → no targets');
expect(splitTargetsOf(null).length === 0, 'null hole → no targets');

// A variable already determined by a context projection (`#p.1[..]`) is NOT a
// meaningful split target — it's excluded (that hole's action is `fill`, not split).
const mixed = {
  ctx: [
    { name: 'free', type: '[g, z:name |- hyp X[..] A[]]' },
    { name: 'determined', type: '[g, z:name |- hyp (#p.1[..]) A1[]]' },
  ],
};
expect(JSON.stringify(splitTargetsOf(mixed)) === JSON.stringify(['free']),
  'a #p-determined variable is excluded from split targets, the free one is kept');

// ── canIntro ────────────────────────────────────────────────────────────────
expect(canIntro({ goal: '[ |- nat] -> [ |- nat]' }), 'arrow goal can intro');
expect(canIntro({ goal: 'A => B' }), 'fat-arrow goal can intro');
expect(!canIntro({ goal: '[ |- nat]' }), 'non-arrow goal cannot intro');
expect(!canIntro({ goal: null }), 'null goal cannot intro');

console.log('OK  hole-actions — parse split/intro output, split targets, intro applicability');

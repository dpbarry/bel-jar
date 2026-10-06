import assert from 'node:assert/strict';
import { parser } from '../js/editor-src/beluga-parser.js';
import { formatString } from '../js/editor-src/format/document-format.mjs';

const src = `rec nex4 : [ ⊢ nd ((A ∨ ¬ A) ⊃ (¬ ¬ A) ⊃ A) ] =
  [ ⊢  ⊃I (\\u. %  (A ∨ ¬ A) true
    ⊃I (\\v. % (¬ ¬ A) true
      (∨E u  % (A ∨ ¬ A) true
        (\\w.w )  % assuming w:A true (nd A) we need to show w:A true (nd A)
        (\\w'. ¬E v w'))
      % to show : A true
    )
  )
];
`;

const out = formatString(src, parser.parse(src));
const outLines = out.split('\n');

assert.ok(outLines[1].startsWith('  [⊢ ⊃I'), 'proof body indented under rec');
assert.equal(outLines[2].search(/\S/), 4, 'nested ⊃I +2');
assert.equal(outLines[3].search(/\S/), 6, '∨E +2');
assert.equal(outLines[4].search(/\S/), 8, 'branch +2');
assert.equal(outLines[6].search(/\S/), 6, '% to show aligns with ∨E');
assert.ok(out.includes('% (A ∨ ¬ A) true'), 'comment spacing normalized');

console.log('OK format proof script');

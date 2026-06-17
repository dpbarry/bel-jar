import assert from 'node:assert/strict';
import { parser } from '../editor-src/beluga-parser.js';
import { formatString } from '../editor-src/bel-format.mjs';
import { reindentProofBlock } from '../editor-src/format/proof-script.mjs';

const raw = `⊃I (\\u. % (A v A) true
    ⊃I (\\v. % (B) true
      (vE u
        (\\w.w)
        (\\w'. x))
    % comment
  )`;

const lines = reindentProofBlock(raw, 2, 2);
assert.equal(lines[0].search(/\S/), 2);
assert.equal(lines[1].search(/\S/), 4);
assert.equal(lines[2].search(/\S/), 6);
assert.equal(lines[5].search(/\S/), 6, 'comment aligns with ∨E block');
assert.equal(lines[6].search(/\S/), 4, 'close paren dedents');

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

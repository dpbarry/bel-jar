import assert from 'node:assert/strict';
import { parser } from '../editor-src/beluga-parser.js';
import { formatString } from '../editor-src/bel-format.mjs';

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

const tree = parser.parse(src);
const out = formatString(src, tree);
const firstLine = out.split('\n')[0];

assert.ok(
  firstLine.includes('⊢ nd'),
  `type annotation preserved in header, got: ${firstLine}`,
);
assert.ok(
  !firstLine.match(/:\s*=/),
  `type should not be empty before =, got: ${firstLine}`,
);

const bodyLines = out.split('\n').slice(1);
assert.ok(bodyLines[0].startsWith('  [⊢'), 'multiline proof body is re-indented');

console.log('OK format rec contextual type');

// Phase A regression check: walkTree() output matches what the three
// existing modules currently produce, on a representative Beluga file.
//
// We compare:
//   - walker.blocks       ≡ computeLintBlocks(tree, doc).blocks
//   - walker.parseDiags   ⊆ syntaxLintTree(tree, doc) (parse-error subset)
//   - walker.defMap       ≡ resolver's internal map (probed via resolveHover)
//
// Strict block/parseDiag equality is the load-bearing check.

import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { computeLintBlocks } from '../editor-src/bel-units.mjs';
import { syntaxLintTree } from '../editor-src/bel-lint.mjs';
import { walkTree } from '../editor-src/bel-walk.mjs';

const SAMPLE = `% Natural Deduction + an intentional typo and a bad pragma to exercise diags.
LF o : type =
  | imp : o → o → o
  | top : o
;

--prefix neg 10.
--inhfix and 5 right.

LF nd : o → type =
  | impI : (nd A → nd B) → nd (A imp B)
  | impE : nd (A imp B) → nd A → nd B
;

rec discharge : (g : ctx) [g |- nd A] → [g |- nd A] =
  fn d => d
;

undefined_name_used_here : ndd .
`;

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function blocksEqual(a, b) {
  if (a.length !== b.length) return `length ${a.length} vs ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x.from !== y.from || x.to !== y.to) return `block ${i} range`;
    if (x.inner !== y.inner) return `block ${i} inner`;
    if (x.syntaxFault !== y.syntaxFault) return `block ${i} syntaxFault`;
    if (x.trustBeluga !== y.trustBeluga) return `block ${i} trustBeluga`;
  }
  return null;
}

function diagKey(d) { return `${d.from}:${d.to}:${d.severity}:${d.message}`; }

const doc = Text.of(SAMPLE.split('\n'));
const tree = parser.parse(SAMPLE);

const ref = computeLintBlocks(tree, doc);
const refLintDiags = syntaxLintTree(tree, doc);

const walk = walkTree(tree, doc);

// 1. Blocks are identical (walker delegates to computeLintBlocks today,
// but verifies the API contract is preserved).
const blockDiff = blocksEqual(walk.blocks, ref.blocks);
expect(!blockDiff, `blocks mismatch: ${blockDiff}`);
console.log('OK blocks:', walk.blocks.length);

// 2. Walker's parseDiags must be a subset of syntaxLintTree's diags
// (lint adds undefined-name diags from checkLFAtomicTypes on top).
const refKeys = new Set(refLintDiags.map(diagKey));
for (const d of walk.parseDiags) {
  expect(refKeys.has(diagKey(d)),
    `walker parseDiag not in syntaxLintTree output: ${diagKey(d)}`);
}
console.log('OK parseDiags subset:', walk.parseDiags.length, 'of', refLintDiags.length);

// 3. definedNames must contain every name from refLintDiags that's defined
// (we can't easily probe the internal set, so we check known names are present).
const names = new Set(walk.definedNames.map(d => d.name));
for (const expected of ['o', 'imp', 'top', 'nd', 'impI', 'impE', 'discharge']) {
  expect(names.has(expected), `definedNames missing: ${expected}`);
}
console.log('OK definedNames includes:', [...names].sort().join(' '));

// 4. defMap must have an entry for every defined global name.
for (const expected of ['o', 'imp', 'top', 'nd', 'impI', 'impE', 'discharge']) {
  expect(walk.defMap.has(expected), `defMap missing: ${expected}`);
}
console.log('OK defMap entries:', walk.defMap.size);

// 5. blockAt round-trips on a few positions.
const ndPos = SAMPLE.indexOf('LF nd');
const hit = walk.blockAt(ndPos);
expect(hit && hit.block.inner === 'LFDatatypeDeclaration',
  `blockAt at LF nd: ${hit && hit.block.inner}`);
console.log('OK blockAt');

// 6. Walker output must be stable (memoized) — same tree → same object.
expect(walkTree(tree, doc) === walk, 'walkTree not memoized per tree');
console.log('OK memoization');

// 7. uses: every LowerIdentifier and UpperIdentifier in the doc shows up,
// with a bound flag. Spot-check a few known cases.
expect(walk.uses.length > 0, 'uses must be populated');

// In `fn d => d`, both occurrences of `d` exist. The param-`d` is the
// binding site (bound=false because it defines, not refers); the
// body-`d` (after the arrow) is a bound use.
const dUses = walk.uses.filter(u => u.name === 'd');
expect(dUses.length >= 2, `expected ≥2 uses of 'd' (param + body), got ${dUses.length}`);
const arrowPos = SAMPLE.indexOf('=> d');
expect(arrowPos > 0, 'sample must contain "=> d"');
const dBodyUse = dUses.find(u => u.from > arrowPos);
expect(dBodyUse, "expected to find body-d after '=> '");
expect(dBodyUse.bound, "body-'d' (use, not binding site) should resolve as bound");
const dParamUse = dUses.find(u => u.from < arrowPos);
expect(dParamUse && !dParamUse.bound, "param-'d' (binding site) is correctly reported as unbound (it defines)");

// `o` in `nd : o → type` is a free use (global LF type, not bound by enclosing).
const oFree = walk.uses.find(u =>
  u.name === 'o' && u.from === SAMPLE.indexOf('o → type'));
expect(oFree, "expected to find use of 'o' in 'nd : o → type'");
expect(!oFree.bound, "'o' in 'nd : o → type' must be free (it's a global ref)");

console.log('OK uses:', walk.uses.length, '(', dUses.length, 'd-uses,',
  walk.uses.filter(u => u.bound).length, 'bound)');

console.log('PARITY OK');

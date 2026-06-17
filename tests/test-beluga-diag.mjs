import assert from 'node:assert';
import { Text } from '@codemirror/state';
import {
  belugaOutputLooksLikeFailure,
  parseBelugaDiagnostics,
} from '../editor-src/bel-beluga-diag.mjs';

const sample = `rec sec3 : (stepBind : pf o) → pf o =
  fn _ => stepBind
;
`;

const doc = Text.of(sample.split('\n'));
const raw = `File "input.bel", line 1, column 22
Error: Failed to parse (mutual) recursive function declaration(s).
Expected the token ')', but got the token ':'.`;

const diags = parseBelugaDiagnostics(raw, doc);
assert.equal(diags.length, 1);
assert.equal(diags[0].severity, 'error');
assert.equal(diags[0].message, 'Failed to parse (mutual) recursive function declaration(s).\nExpected the token \')\', but got the token \':\'.');
assert.equal(doc.lineAt(diags[0].from).number, 1);
assert.ok(diags[0].to > diags[0].from);

const tokenDoc = Text.of(['stepS']);
const tokenRaw = `File "input.bel", line 1, column 1
Error: Expected stepS to be a program constant or computation-level constructor.`;
const tokenDiags = parseBelugaDiagnostics(tokenRaw, tokenDoc);
assert.equal(tokenDiags.length, 1);
assert.equal(tokenDoc.sliceString(tokenDiags[0].from, tokenDiags[0].to), 'stepS');

const chainedDoc = Text.of(Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n'));
const chained = `File "input.bel", line 54, column 12
Error: Expected pf to be a computation-level type constant.
    File "input.bel", line 33, column 1
    Error: pf is a bound LF type constant.`;
const chainedDiags = parseBelugaDiagnostics(chained, chainedDoc);
assert.equal(chainedDiags.length, 2);
const chainedMsgs = chainedDiags.map((d) => d.message).sort();
assert.deepEqual(chainedMsgs, [
  'Expected pf to be a computation-level type constant.',
  'pf is a bound LF type constant.',
]);
assert.ok(chainedDiags.every((d) => !d.message.includes('File "')));
assert.ok(chainedDiags[0].from !== chainedDiags[1].from);

assert.equal(belugaOutputLooksLikeFailure(raw), true);
assert.equal(
  belugaOutputLooksLikeFailure('## Type Reconstruction done: input.bel ##\n## Holes: input.bel ##'),
  false,
);

console.log('OK bel-beluga-diag parses File/line/column errors');

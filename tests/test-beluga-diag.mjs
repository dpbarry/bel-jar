import assert from 'node:assert';
import { Text } from '@codemirror/state';
import {
  belugaOutputLooksLikeFailure,
  parseBelugaDiagnostics,
  spanFirstLineDiagnostic,
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

const garbledDoc = Text.of(['rec dual_sym : [ ⊢ dual A A\' ] → [', '', '', '', '', ';', '']);
const garbledRaw = `File "input.bel", line 7, column 1
Error: Failed to parse Expected the parser input to end here.`;
const garbledDiags = parseBelugaDiagnostics(garbledRaw, garbledDoc);
assert.equal(garbledDiags.length, 1);
assert.equal(
  garbledDiags[0].message,
  'Failed to parse: unexpected text here.',
  'menhir flush-on-one-line parse errors get readable text',
);

assert.equal(belugaOutputLooksLikeFailure(raw), true);
assert.equal(
  belugaOutputLooksLikeFailure('## Type Reconstruction done: input.bel ##\n## Holes: input.bel ##'),
  false,
);

// spanFirstLineDiagnostic — the GENERAL first-line rule (not a one-off): a diag
// anchored anywhere on line 1 must cover the whole first line so it's hoverable.
{
  const d1 = Text.of(['--nostrengthen', 'schema ctx = down A;', '']);
  // A 1-char error at the very top — the misery case.
  const span = spanFirstLineDiagnostic({ from: 0, to: 1, severity: 'error', message: 'x' }, d1);
  assert.equal(span.from, 0, 'first-line diag starts at column 0');
  assert.equal(span.to, d1.line(1).to, 'first-line diag spans to the end of line 1');
  // A short token in the middle of line 1 still gets stretched to the full line.
  const mid = spanFirstLineDiagnostic({ from: 5, to: 8, severity: 'error', message: 'x' }, d1);
  assert.equal(mid.from, 0);
  assert.equal(mid.to, d1.line(1).to);
  // A line-3 error is NOT pulled up to the top.
  const l3from = d1.line(3).from;
  const untouched = spanFirstLineDiagnostic({ from: l3from, to: l3from + 1, severity: 'error', message: 'x' }, d1);
  assert.equal(untouched.from, l3from, 'a line-3 diagnostic is left where it is');
  // Empty doc never throws.
  assert.doesNotThrow(() => spanFirstLineDiagnostic({ from: 0, to: 0 }, Text.of([''])));
}

console.log('OK bel-beluga-diag parses File/line/column errors + first-line span rule');

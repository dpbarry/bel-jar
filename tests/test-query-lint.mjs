import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { syntaxLintTree } from '../js/editor-src/ide/syntax-lint.mjs';
import {
  lintQueryPragmaBounds,
  parseQueryRuntimeDiagnostics,
} from '../js/editor-src/ide/query-diag.mjs';

function expect(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

const src = `LF tp : type = | nat : tp;
LF exp : type = | z : exp | suc : exp -> exp;
LF oft : exp -> tp -> type = | o_z : oft z nat | o_s : oft E nat -> oft (suc E) nat;
--query 1 * D : oft (suc (suc z)) T.
--query * * Q : oft z nat.
--query 3 * D : oft (suc z) nat.
`;

const doc = Text.of(src.split('\n'));
const tree = parser.parse(src);
const diags = syntaxLintTree(tree, doc);

const starHit = diags.find((d) => /infinitely many/i.test(d.message));
expect(starHit, 'expected static lint on * * query');
expect(doc.lineAt(starHit.from).number === 5, 'static lint on * * line');

expect(lintQueryPragmaBounds(tree, doc).length === 1, 'one * * bound diag');

const runtimeOut = `--query 1 * oft (suc (suc z)) T..
Done.
--query * * oft z nat..
Query error: Wrong number of solutions -- expected * in * tries, but found 1.
--query 3 * oft (suc z) nat..
Query error: Wrong number of solutions -- expected 3 in * tries, but found 1.`;

const runtimeDiags = parseQueryRuntimeDiagnostics(runtimeOut, doc);
expect(runtimeDiags.length === 2, 'two runtime query count errors');
expect(doc.lineAt(runtimeDiags[0].from).number === 5, 'first runtime error on * * line');
expect(doc.lineAt(runtimeDiags[1].from).number === 6, 'second runtime error on 3 * line');

const goodFrom = doc.line(4).from;
const badOnGood = diags.filter(
  (d) => d.from >= goodFrom && d.from < doc.line(4).to && /infinitely many/i.test(d.message)
);
expect(badOnGood.length === 0, 'no * * lint on valid 1 * query line');

const incompleteOut = `--query * 5 oft X nat -> oft (suc X) nat..
Query error: Search incomplete -- depth limit reached (found 0 solution(s); search did not finish).`;

const incompleteDiags = parseQueryRuntimeDiagnostics(incompleteOut, doc);
expect(incompleteDiags.length === 1, 'one incomplete-search diag');
expect(/Search incomplete/i.test(incompleteDiags[0].message), 'incomplete message preserved');

// The real checker's output for Beluga's own t/code/success/LFHoles/tps.bel (beluga_web.bc.js, 2026-09-15): four
// queries succeed and the fifth stops early. Only the fifth pragma gets a diagnostic, with the checker's message.
{
  const realDoc = Text.of([
    '--query 1 * D : oft (suc (suc z)) T.',
    '--query 1 * D : oft (lam T (\\x.x)) S.',
    '--query 1 * D : oft (letv (suc (suc z)) (\\x. app (lam nat (\\y. y)) x)) T.',
    '--query 1 * D : oft (lam T (\\x.x)) S.',
    '',
    '--query * 5 P : oft X nat -> oft (suc X) nat.',
  ]);
  const realOut = "## Type Reconstruction begin: input.bel ##\n## Type Reconstruction done:  input.bel ##\n--query 1 * (T : tp) oft (suc (suc z)) T..\n\n---------- Solution 1 ----------\n\nD = tp_s (tp_s tp_z);\n\nT = nat;\n\n\n\nDone.\n--query 1 * (T : tp) (S : tp) oft (lam T (\\x. x)) S..\n\n---------- Solution 1 ----------\n\nD = tp_lam (\\x. \\x34. x34);\n\nS = arrow ?T28_359\n?T28_359;\nT = ?T28_359;\n\n\n\nDone.\n--query 1 * (T : tp) oft (letv (suc (suc z)) (\\x. app (lam nat (\\y. y)) x)) T..\n\n---------- Solution 1 ----------\n\nD = tp_letv (\\x. \\x38. tp_app x38 (tp_lam (\\x1. \\x34. x34)))\n(tp_s (tp_s tp_z));\n\nT = nat;\n\n\n\nDone.\n--query 1 * (T : tp) (S : tp) oft (lam T (\\x. x)) S..\n\n---------- Solution 1 ----------\n\nD = tp_lam (\\x. \\x34. x34);\n\nS = arrow ?T98_522\n?T98_522;\nT = ?T98_522;\n\n\n\nDone.\n--query * 5 (X : exp) oft X nat -> oft (suc X) nat..\n\n---------- Solution 1 ----------\n\nP = \\x41. tp_s x41;\n\nX = ?E142_549;\n\n\n\nQuery error: Search incomplete -- solver stopped early (found 1 solution(s); search did not finish).\n\n## Holes: input.bel  ##\n File \"input.bel\", line 100, column 14: Hole number 0, <anonymous>\n   Meta-context:\n     \"i : ( |- exp)\n     \"i1 : ( |- tp)\n     \"i3 : ( |- exp)\n     F2 : ( |- eval (E4[\"i3]) \"i)\n     F1 : ( |- eval E3 \"i3)\n     \"i2 : ( |- tp)\n     D2 : (x : exp, x38 : oft x \"i2[] |- oft (E4[x]) \"i1[])\n     D1 : ( |- oft E3 \"i2)\n     C1 : ( |- oft \"i3 \"i2)\n   LF Context:\n     \n   ________________________________________________________________________________\n   Goal: eval (E4[\"i3]) \"i\n   Variables of this type: F2\n";
  const realDiags = parseQueryRuntimeDiagnostics(realOut, realDoc);
  expect(realDiags.length === 1, `one diagnostic from the real output, got ${realDiags.length}`);
  expect(realDoc.lineAt(realDiags[0].from).number === 6, 'it sits on the fifth --query pragma');
  expect(/^Query error: Search incomplete/.test(realDiags[0].message), `the checker's message is kept, got ${realDiags[0].message}`);
}

console.log('OK query lint');

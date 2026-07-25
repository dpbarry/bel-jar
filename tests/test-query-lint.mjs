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

console.log('OK query lint');

// Proofs finished — the status strip's progress segment, from a real parse.
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSemanticEngine } from '../js/editor-src/semantic/semantic-engine.mjs';
import { proofProgress } from '../js/editor-src/semantic/proof-progress.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const SAMPLE = `LF nat : type =
| z : nat
| s : nat -> nat;

LF le : nat -> nat -> type =
| le_z : le z N
| le_s : le N M -> le (s N) (s M);

rec refl : {N : [ |- nat]} [ |- le N N] =
mlam N => ? ;

proof done : [ |- le z z] =
/ total /
solve [ |- le_z];

rec trans : [ |- le A B] -> [ |- le B C] -> [ |- le A C] =
fn d => fn e => ?a ;

let v = ? ;
`;

const engine = createSemanticEngine();
engine.update(parser.parse(SAMPLE), Text.of(SAMPLE.split('\n')));
const p = engine.proofProgress();

expect(p.total === 3, `rec and proof are proofs, let is a value (got ${p.total})`);
expect(p.done === 1, `only the proof with no hole is finished (got ${p.done})`);
expect(p.unfinished.map((u) => u.name).join(',') === 'refl,trans', 'unfinished, in document order');
expect(p.unfinished.every((u) => u.holes === 1 && !u.failed), 'each unfinished one owns its hole');
const at = p.unfinished[0].from;
expect(at >= SAMPLE.indexOf('rec refl') && at <= SAMPLE.indexOf('refl :'), 'from is where the declaration starts');

// A failure counts even with no hole, and a hole outside every proof counts for none.
const decls = [
  { id: 'a', name: 'a', isGlobal: true, namespace: 'rec-function', nodeKind: 'RecBody', range: { from: 0, to: 10 } },
  { id: 'b', name: 'b', isGlobal: true, namespace: 'rec-function', nodeKind: 'RecBody', range: { from: 10, to: 20 } },
  { id: 'b2', name: 'b2', isGlobal: true, namespace: 'rec-function', nodeKind: 'RecBody', range: { from: 14, to: 20 } },
];
const q = proofProgress(decls, [{ from: 16 }, { from: 99 }], (id) => id === 'a');
expect(q.total === 3 && q.done === 1, 'a failed, b2 has the hole, b is finished');
expect(q.unfinished.map((u) => u.id).join(',') === 'a,b2', 'a hole belongs to the innermost proof of a mutual block');
expect(q.unfinished[0].failed && !q.unfinished[0].holes, 'a failure with no hole is still unfinished');

console.log('OK proof progress (rec/proof counted, let skipped, holes and failures per proof)');

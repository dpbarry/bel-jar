// transportSub facts must spell with the projection substitution, not bare name.
import { synthesize, factArgText } from '../js/editor-src/prover/prover-synth.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

expect(factArgText({ name: 'h', transportSub: 'b.1, b.2' }) === 'h[b.1, b.2]',
  'factArgText spells transportSub');
expect(factArgText({ name: 'f', weaken: true }) === 'f[..]',
  'factArgText still weakens');
expect(factArgText({ name: 'g' }) === 'g',
  'factArgText bare name');

const goal = { ctx: '', concl: 'term' };
const facts = [{
  name: 'h',
  extras: [],
  concl: 'term',
  original: true,
  decOk: true,
  transportSub: 'b.1, b.2',
}];
const out = synthesize(goal, facts, [], new Map());
expect(out && out.text && out.text.includes('h[b.1, b.2]'),
  'synthesis cites transportSub spelling', out && out.text);

console.log('OK prover-transport-spell');

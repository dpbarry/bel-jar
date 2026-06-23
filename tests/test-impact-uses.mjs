// Impact = type-level CASCADE (transitive, signature/notation) ∪ terminal body
// USES (a decl that calls the symbol in its body; a leaf, never propagated).
// Pins the two-tier model for both the cross-file graph and the single-file engine.
import { buildGroupGraph } from '../editor-src/group-graph.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// `twice` is referenced only in BODIES (a calls it), never in any TYPE. `a`/`b`'s
// boxed types depend on `nat`. b uses `a` in its body (a body-user of a body-user).
const SRC = `LF nat : type =
  | z : nat
  | s : nat -> nat
;
rec twice : [ |- nat ] -> [ |- nat ] = fn n => n ;
rec a : [ |- nat ] = twice ;
rec b : [ |- nat ] = a ;`;

const graph = buildGroupGraph([{ id: 'x', name: 'x.bel' }], 'x', () => SRC, {});
const byName = (name) => [...graph.nodes.values()].find((n) => n.name === name);
const twice = byName('twice');
const nat = byName('nat');
const a = byName('a');
const b = byName('b');
expect(twice && nat && a && b, 'all nodes present (nat/twice/a/b)');

// Sanity: a→twice and b→a are BODY edges (the references sit after the rec `=`).
const aToTwice = graph.dependenciesOf(a.id).find((d) => d.name === 'twice');
expect(aToTwice && aToTwice.kind === 'body', `a depends on twice via a BODY edge (got ${aToTwice && aToTwice.kind})`);

// Impact of `twice`: nothing's TYPE depends on it → empty cascade; `a` calls it in
// its body → a terminal 'uses' leaf; `b` (a body-user of the leaf `a`) must NOT
// appear — uses are leaves and never propagate.
const twiceImpact = graph.impactOf(twice.id);
expect(twiceImpact.every((d) => d.kind === 'cascade' || d.kind === 'uses'), 'every impact entry is tagged cascade|uses');
const tCascade = twiceImpact.filter((d) => d.kind === 'cascade').map((d) => d.name);
const tUses = twiceImpact.filter((d) => d.kind === 'uses').map((d) => d.name);
expect(tCascade.length === 0, `nothing's type depends on twice → empty cascade (got ${tCascade.join(',')})`);
expect(tUses.includes('a'), `a uses twice in its body → 'uses' leaf (got uses=[${tUses.join(',')}])`);
expect(!twiceImpact.some((d) => d.name === 'b'), 'b (body-user of the leaf a) must NOT propagate into twice’s impact');

// Impact of `nat`: constructors + the recs' boxed types all sig-depend on it, so
// they are all 'cascade'; their body-uses are themselves cascaded → no 'uses' tier.
const natImpact = graph.impactOf(nat.id);
expect(natImpact.length > 0 && natImpact.every((d) => d.kind === 'cascade'),
  `nat's impact is all type-cascade (got ${natImpact.map((d) => `${d.kind}:${d.name}`).join(',')})`);
const natNames = natImpact.map((d) => d.name);
expect(['z', 's', 'twice', 'a', 'b'].every((n) => natNames.includes(n)),
  `nat cascades to its constructors + every dependent rec (got ${natNames.join(',')})`);

console.log('OK  impact uses — type cascade vs terminal body-use leaves (no propagation through uses)');

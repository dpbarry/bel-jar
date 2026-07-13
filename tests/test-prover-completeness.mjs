// Generation-level completeness pins (docs/prover-completeness.md §5).
// Every fix is pinned on INVENTED shapes — never a corpus/held-out lemma name —
// so green means "the mechanism is general", not "a lemma passes".
import { parseCompType, parseTotality, decreasingBoxIndex } from '../editor-src/bel-prover.mjs';
import { synthesize } from '../editor-src/bel-synth.mjs';
import { buildIntroSkeleton } from '../editor-src/bel-hole-split.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── D1: named totality measures resolve to the RIGHT box premise ────────────
{
  const thm = (type, tot) => ({ compType: parseCompType(type), totality: parseTotality(tot) });
  // index form — unchanged behavior
  expect(decreasingBoxIndex(thm('[ |- q A B] -> [ |- q A C] -> [ |- r B C]', '/ total 2 /')) === 1,
    'index measure picks box 2');
  // named, decreasing = SECOND premise, 3 implicits (A,B,C): (f _ _ _ x1 x2)
  expect(decreasingBoxIndex(thm('[ |- q A B] -> [ |- q B C] -> [ |- q A C]', '/ total x2 (f _ _ _ x1 x2) /')) === 1,
    'named measure aligned past implicits picks box 2');
  // named, decreasing = second premise with 3 implicits (P,K,P2): (f _ _ _ _ y)
  expect(decreasingBoxIndex(thm("[ |- w P K] -> [ |- st P P2] -> [ |- w P2 K]", '/ total y (f _ _ _ _ y) /')) === 1,
    'named measure with underscore implicits picks box 2');
  // named, single premise: (f _ _ m)
  expect(decreasingBoxIndex(thm('[ |- rel T S] -> [ |- rel S T]', '/ total m (f _ _ m) /')) === 0,
    'named single-premise resolves to box 1');
  // named with a listed ctx binder: (f g _ _ _ d) → first box
  expect(decreasingBoxIndex(thm('(g:sch) [g |- ev M R] -> [g |- ev M R2] -> [g |- eq R R2]', '/ total d (f g _ _ _ d) /')) === 0,
    'named with ctx binder in the spine picks box 1');
  // FULL-SPINE spelling: the pattern lists arguments PAST the decreasing one —
  // the decreasing slot is the NAMED argument's position, never the last listed.
  expect(decreasingBoxIndex(thm('[ |- ev E N] -> [ |- pl N A R] -> [ |- ea E A R]', '/ total d (f e n a r d q) /')) === 0,
    'full-spine named measure resolves by POSITION of the name (box 1, not last)');
}

// ── D2: unique-constructor inversion of BASE facts (saturation) ─────────────
// Shape: goal `wt (w1 (w2 P Q)) base` closable only by inverting fact
// F1 : wt (w1 P) base (unique ctor mk1) to expose `wt P base`.
{
  const goal = { ctx: '', concl: 'wt (w1 (w2 P Q)) base' };
  const facts = [
    { name: 'F1', extras: [], concl: 'wt (w1 P) base', original: true, decOk: true },
    { name: 'F2', extras: [], concl: 'wt Q base', original: true, decOk: true },
  ];
  const ctors = new Map([['wt', [
    { name: 'mk1', argTypes: ['wt M base'], result: { head: 'wt', indices: ['(w1 M)', 'base'] } },
    { name: 'mk2', argTypes: ['wt M base', 'wt N base'], result: { head: 'wt', indices: ['(w2 M N)', 'base'] } },
    { name: 'mk0', argTypes: [], result: { head: 'wt', indices: ['e0', 'base'] } },
  ]]]);
  const out = synthesize(goal, facts, [], ctors, { metaVars: new Set(['P', 'Q']) });
  expect(out && out.text, 'fact-inversion chain found');
  expect(/let \[\s*\|-\s*mk1 /.test(out.text), 'saturation destructures F1 via its unique ctor');
  expect(/mk1 \(mk2 /.test(out.text), 'tail rebuilds the nested constructor application');
}
// Second shape (different family/arity — generality): invert a two-arg product.
{
  const goal = { ctx: '', concl: 'pl A' };
  const facts = [{ name: 'H', extras: [], concl: 'pk (kk A) B', original: true, decOk: false }];
  const ctors = new Map([
    ['pk', [{ name: 'pmk', argTypes: ['pl M', 'pm N'], result: { head: 'pk', indices: ['(kk M)', 'N'] } }]],
    ['pl', []],
  ]);
  const out = synthesize(goal, facts, [], ctors, { metaVars: new Set(['A', 'B']) });
  expect(out && /let \[\s*\|-\s*pmk /.test(out.text), 'two-component fact inversion exposes the needed piece');
}

// ── D3: comp facts as rec-call arguments, rendered BARE ─────────────────────
// Transitivity SHAPE (fresh names): IH rel/rl, dec premise = #2; the chain must
// pass the ORIGINAL comp premise through slot 1 bare: `thr cf [ |- Dp]`.
{
  const goal = { ctx: '', concl: 'rl a c' };
  const facts = [
    { name: 'cf', extras: [], concl: 'rl a b', original: true, decOk: false, viaComp: true },
    { name: 'Dp', extras: [], concl: 'rl b w', original: true, decOk: true },
    { name: 'Dq', extras: [], concl: 'sg w c', original: true, decOk: false },
  ];
  const rules = [{
    name: 'thr', isIH: true, decIdx: 1, flex: new Set(['X', 'Y', 'Z']),
    pis: [], premises: ['rl X Y', 'rl Y Z'], result: 'rl X Z',
  }];
  const ctors = new Map([['rl', [
    { name: 'ext', argTypes: ['rl X Y', 'sg Y Z'], result: { head: 'rl', indices: ['X', 'Z'] } },
  ]]]);
  const out = synthesize(goal, facts, rules, ctors, { metaVars: new Set(['a', 'b', 'c', 'w']) });
  expect(out && out.text, 'pass-through recursion chain found');
  expect(/thr cf \[\s*\|-\s*Dp\]/.test(out.text), 'comp fact passed BARE in slot 1, dec meta boxed in slot 2');
  expect(!/\[\s*\|-\s*cf\]/.test(out.text), 'comp fact never boxed');
}
// A comp fact must never resolve an LF constructor argument.
{
  const goal = { ctx: '', concl: 'rl a c' };
  const facts = [{ name: 'cf', extras: [], concl: 'sg a c', original: true, decOk: false, viaComp: true }];
  const ctors = new Map([['rl', [
    { name: 'lift', argTypes: ['sg X Y'], result: { head: 'rl', indices: ['X', 'Y'] } },
  ]]]);
  const out = synthesize(goal, facts, [], ctors, { metaVars: new Set(['a', 'c']) });
  expect(!out || !/lift cf/.test(out.text), 'comp fact rejected inside an LF constructor application');
}

// ── D4: intro telescope covers substitution/parameter binders ───────────────
{
  const sk = buildIntroSkeleton('{g:ctx} {h:ctx} {$W:$[h |- g]} [g |- t M[..]] -> [h |- t M[$W]]');
  expect(sk === 'mlam g => mlam h => mlam $W => fn R => ?'
    || /^mlam g => mlam h => mlam \$W => fn \w+ => \?$/.test(sk || ''),
    'intro introduces the FULL telescope incl. the substitution binder: ' + sk);
  // A second $-shape with a different arity.
  const sk2 = buildIntroSkeleton('{k:ctx} {$S:$[k |- k]} [k |- u N] -> [k |- u N]');
  expect(/^mlam k => mlam \$S => fn \w+ => \?$/.test(sk2 || ''), 'second substitution telescope introduces fully');
  // Never a partial telescope: a malformed binder yields NULL, not a wrong skeleton.
  const sk3 = buildIntroSkeleton('{g:ctx} {?bad:oops} [g |- t] -> [g |- t]');
  expect(sk3 === null, 'unrecognizable binder ⇒ null, never a truncated skeleton');
}

// ── A comp fact must never SHADOW a derivable LF term (lfOnly discipline) ────
// The consumer is an LF constructor: its argument must be an LF term, and a comp
// variable whose type matches the premise exactly must not block the ctor route.
{
  const goal = { ctx: '', concl: 'ee8 (m8 z8) a8 a8' };
  const facts = [
    { name: 'cf8', extras: [], concl: 'pl8 z8 a8 a8', original: true, decOk: false, viaComp: true },
  ];
  const ctors = new Map([
    ['ee8', [{ name: 'ev8', argTypes: ['pl8 N A R'], result: { head: 'ee8', indices: ['(m8 N)', 'A', 'R'] } }]],
    ['pl8', [{ name: 'pz8', argTypes: [], result: { head: 'pl8', indices: ['z8', 'N', 'N'] } }]],
  ]);
  const out = synthesize(goal, facts, [], ctors, { metaVars: new Set(['a8']) });
  expect(out && /ev8 pz8/.test(out.text),
    'LF ctor argument derived via the ctor route despite a matching comp fact: ' + (out && out.text));
}

// ── D10: multi-line hole GOALS (the report puts a Pi goal on FOLLOWING lines) ─
{
  const { parseHoles } = await import('../editor-src/bel-holes.mjs');
  const report = [
    '## Holes: input.bel  ##',
    'File "input.bel", line 20, column 1: Hole number 0, <anonymous>',
    '  Meta-context:',
    '    ',
    '  Computation context:',
    '    ',
    '  Goal:',
    '  {g : ctx}',
    '    {h : ctx}',
    '      {$S : $(h |-  g)} [g |- w M T[]] -> [h |- w (M[$S[..]]) T[]]',
    '',
  ].join('\n');
  const hs = parseHoles(report);
  expect(hs.length === 1 && hs[0].goal && hs[0].goal.includes('{$S : $(h |- ')
    && hs[0].goal.includes('->'), 'multi-line Pi goal accumulated: ' + (hs[0] && hs[0].goal));
  // Single-line goals still parse identically.
  const hs2 = parseHoles('## Holes: input.bel  ##\nFile "input.bel", line 3, column 1: Hole number 0, <anonymous>\n  Goal: [ |- q A B]\n');
  expect(hs2.length === 1 && hs2[0].goal === '[ |- q A B]', 'single-line goal unchanged');
}

console.log('OK test-prover-completeness (named measures, fact inversion, comp args, full telescopes, multi-line goals)');

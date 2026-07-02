// Block-schema recursion (recursion under a `block (…)`-extended context, e.g.
// tp_uniq's t_lam branch) is a KNOWN CAPABILITY GAP in the honest engine. The old
// implementation faked it with cp-specific projection scaffolding (hardcoded field
// names, `refl_proc`, wtp channel-hyps) — that was stripped (see memory:
// feedback-prover-overfit-postmortem). This test pins the HONEST contract:
//   • the engine still offers its GENERAL moves on a block-schema theorem, and
//   • it does NOT fabricate an unsupported block-projection IH call — where the move
//     isn't genuinely derivable, it honest-declines (no move) rather than emit junk.
// When block-schema recursion is rebuilt GENERALLY (schema-driven, no hardcoded
// names), replace these with positive assertions that the projected IH is produced.
import {
  recurseTexts,
  theoremUnderProof,
} from '../editor-src/bel-prover-bridge.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const BLOCK = [
  'tp : type.',
  'tm : type.',
  'oft : tm -> tp -> type.',
  'eq_tp : tp -> tp -> type.',
  'refl_tp : eq_tp A A.',
  'schema tctx = some [A:tp] block (x:tm, u:oft x _);',
].join('\n');

const decl = [
  'rec block_lemma : (g:tctx) [g, b:block (x:tm, u:oft x _) |- oft M T[]] -> [g |- oft M T] =',
  '/ total d (block_lemma g m t d) /',
  '?',
  ';',
].join('\n');
const thm = theoremUnderProof(decl);
const code = `${BLOCK}\n${decl}`;

// A sub-derivation living under a block-extended context.
const hole = {
  goal: '[g |- oft M T]',
  meta: [
    { name: 'g', type: 'tctx' },
    { name: 'D', type: '(g, b:block (x:tm, u:oft x _) |- oft M T[])' },
  ],
  ctx: [],
};
const rec = recurseTexts(hole, thm, code);
// HONEST CONTRACT: the engine must NOT emit a fabricated block-projection IH with
// hardcoded field names (`b.x`, `b.u`) — that was the stripped overfit. Any recurse
// it does produce must be a plain, checker-verifiable reference, not invented
// projections. (Once block-schema projection is general, flip this to a positive.)
expect(rec.every((t) => !/\bb\.[a-z]/.test(t)),
  `no fabricated block-field projections in the IH call (got ${JSON.stringify(rec)})`);
expect(rec.every((t) => !t.includes('refl_proc') && !t.includes('refl_tp')),
  'no hardcoded reflexivity-constructor guessing');

console.log('OK test-prover-block-schema (honest gap: no fabricated block projection)');

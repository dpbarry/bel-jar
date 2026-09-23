// The assignment table — the contract the surface and the harness share.
// Pure ESM: no DOM, no Beluga, no built leaf needed.
import {
  VERDICTS, STRENGTH, PROVENANCE,
  strengthOf, buildTable, recordVerdict, reassign, summarize, validate,
} from '../js/editor-src/prover/case-assignment.mjs';
import { enumerateConstructorsTyped } from '../js/editor-src/prover/hole-split.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// A real signature, read through the model the engine already uses. The table must
// build from `enumerateConstructorsTyped` output directly — no parallel rule type.
const code = String.raw`LF tm : type = | app : tm -> tm -> tm | lam : (tm -> tm) -> tm;
LF step : tm -> tm -> type =
| s_app1 : step M M' -> step (app M N) (app M' N)
| s_beta : step (app (lam \x. M x) N) (M N)
| s_lam  : ({x:tm} step (M x) (M' x)) -> step (lam \x. M x) (lam \x. M' x);`;

const rules = enumerateConstructorsTyped(code, 'step');
expect(rules.length === 3, 'the fixture has three rules');
expect(rules[0].name === 's_app1', 'rules arrive in signature order');

// ── the rule set is data, straight from the model ─────────────────────────────
const pieces = [{ id: 'the congruence case', rule: 's_app1' }];
const always = (rule) => ({ pieceId: 'the congruence case' });
const t0 = buildTable({ judgment: 'step', rules, pieces, assign: always, strength: STRENGTH.total });

expect(t0.rows.length === 3, 'every rule gets a row, including the ones the author wrote');
expect(t0.rows.map((r) => r.rule).join(',') === 's_app1,s_beta,s_lam', 'rows hold rule-set order');
expect(t0.rows[0].verdict === VERDICTS.authored, "the author's own case is a row, marked as theirs");
expect(t0.rows[1].verdict === VERDICTS.pending, 'a proposed case starts unchecked');

// ── assignment cannot declare correctness ─────────────────────────────────────
// The whole safety argument is generate-and-check, so the classifier has no route
// to `checked`; only an oracle verdict does.
expect(
  t0.rows.every((r) => r.verdict !== VERDICTS.checked),
  'nothing is checked before the oracle has spoken',
);
const t1 = recordVerdict(t0, 's_beta', { ok: true });
expect(t1.rows[1].verdict === VERDICTS.checked, 'an oracle pass is the only way to `checked`');
const t2 = recordVerdict(t1, 's_lam', { ok: false, error: 'coverage failure' });
expect(t2.rows[2].verdict === VERDICTS.rejected, 'an oracle failure lands as rejected');
expect(t2.rows[2].why === 'coverage failure', "a rejection carries the checker's own words");
expect(t0.rows[1].verdict === VERDICTS.pending, 'recordVerdict is pure and leaves the old table alone');

// ── the author's work is never re-judged ──────────────────────────────────────
const t3 = recordVerdict(t2, 's_app1', { ok: false, error: 'nonsense' });
expect(t3.rows[0].verdict === VERDICTS.authored, 'an oracle verdict cannot overwrite an authored row');

// ── refusal is by name, with a reason ─────────────────────────────────────────
const never = () => null;
const tR = buildTable({ judgment: 'step', rules, pieces, assign: never, strength: STRENGTH.total });
expect(tR.rows[1].verdict === VERDICTS.refused, 'no applicable piece means refused, never guessed');
expect(/s_beta/.test(tR.rows[1].why), 'a refusal names the rule it refuses');
expect(validate(tR).length === 0, 'a refusal with a reason is structurally valid');

// A classifier that throws is a refusal, not a crash and not a guess.
const boom = () => { throw new Error('unify blew up'); };
const tB = buildTable({ judgment: 'step', rules, pieces, assign: boom, strength: STRENGTH.total });
expect(tB.rows[1].verdict === VERDICTS.refused, 'a throwing classifier refuses');
expect(/unify blew up/.test(tB.rows[1].why), 'and says what went wrong');

// ── reassignment is the primary action ────────────────────────────────────────
const t4 = reassign(t2, 's_lam', 'the binder case');
expect(t4.rows[2].piece === 'the binder case', 'reassign points the rule at a different piece');
expect(t4.rows[2].verdict === VERDICTS.pending, 'a reassignment is a new claim, so it must be re-checked');
expect(t4.rows[2].why === '', 'the stale rejection does not survive reassignment');
expect(t4.rows[2].provenance === PROVENANCE.authored, 'a hand-picked assignment is authored, not inferred');

// ── the pitch number excludes the author's own arms ───────────────────────────
const s = summarize(t2);
expect(s.rules === 3, 'three rules');
expect(s.authored === 1, 'one the author wrote');
expect(s.completable === 2, 'the denominator is the cases the author did NOT write');
expect(s.checked === 1 && s.rejected === 1, 'one checked, one rejected');
expect(s.rate === 0.5, 'the rate is checked over completable, never over all rules');

const sAll = summarize(buildTable({
  judgment: 'step', rules,
  pieces: rules.map((r) => ({ id: 'p_' + r.name, rule: r.name })),
  assign: never, strength: STRENGTH.total,
}));
expect(sAll.completable === 0 && sAll.rate === null, 'a fully authored proof has no rate, not a 100%');

// ── strength is read from the declaration and never assumed ───────────────────
expect(strengthOf('rec f : T =\n/ total 1 /\nfn n => ?;') === STRENGTH.total, 'a pragma means total');
expect(strengthOf('rec f : T =\nfn n => ?;') === STRENGTH.typedOnly, 'no pragma means well-typed only');
expect(
  STRENGTH.typedOnly.guarantees.length === 1 && STRENGTH.typedOnly.guarantees[0] === 'well-typed',
  'without a totality declaration Beluga checks neither coverage nor termination, and the table says so',
);
expect(summarize(t2).strength === 'total', 'a summary carries the strength of its claim');

// ── the vocabulary is single-sourced ──────────────────────────────────────────
expect(
  Object.keys(VERDICTS).every((k) => VERDICTS[k].key === k),
  'every verdict is keyed by its own name, so a surface cannot invent one',
);
expect(Object.keys(VERDICTS).length === 5, 'five verdicts, no more: any sixth belongs in VERDICTS');

// ── validate catches the shapes that would let two bugs look alike ────────────
const bad = { judgment: 'step', strength: STRENGTH.total, rows: [
  { rule: 's_beta', piece: null, verdict: VERDICTS.refused, why: '' },
  { rule: 's_beta', piece: null, verdict: VERDICTS.checked, why: '' },
] };
const problems = validate(bad);
expect(problems.some((p) => /more than once/.test(p)), 'a duplicated rule is caught');
expect(problems.some((p) => /without a reason/.test(p)), 'a silent refusal is caught');
expect(problems.some((p) => /checked with no piece/.test(p)), 'a checked row with nothing in it is caught');

console.log('PASS test-case-assignment.mjs');

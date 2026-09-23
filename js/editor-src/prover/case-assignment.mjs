// case-assignment.mjs — THE ASSIGNMENT TABLE.
//
// The reviewable object for case completion is the ASSIGNMENT: which authored
// piece covers which rule of the judgment. Not the generated arms — Beluga checks
// those anyway, so they carry no information the author has to review. The
// assignment is the falsifiable claim, so it is the thing on screen.
//
// ONE table, ONE vocabulary. The surface renders these rows and the harness scores
// them; neither retypes the other's labels. A verdict that is not in VERDICTS
// cannot appear on either.
//
// THE THREE INTERFACE DECISIONS, encoded rather than documented:
//   1. SCHEMA IS A FIRST-CLASS INPUT. `assign` is injected and every row records
//      its `provenance`, so an authored schema drops in where an inferred one came
//      out without the table changing shape.
//   2. ABSTRACT CASE, NOT CONCRETE SOURCE TEXT. A row holds a rule and a piece id.
//      Nothing here renders Beluga (or Calf); that belongs to the surface.
//   3. RULE SET AS DATA. `rules` is exactly what `enumerateConstructorsTyped`
//      returns. No path, no file, no re-parse.
//
// ⛔ SAFETY, ENCODED: `assign` cannot declare a case correct. It proposes a piece;
// the row starts `pending` and only `recordVerdict` — which takes an oracle's
// answer — can move it to `checked`. Generate-and-check is the whole safety
// argument, so the type makes "probably fine" unrepresentable.

/**
 * The verdict vocabulary. `settled` means the row needs nothing further from the
 * author; `actionable` means reassigning could change the answer.
 *
 * Labels are house voice: sentence case, terse. The surface may not invent its own.
 */
export const VERDICTS = Object.freeze({
  authored:  { key: 'authored',  label: 'You wrote this',  settled: true,  actionable: false },
  checked:   { key: 'checked',   label: 'Checked',         settled: true,  actionable: true  },
  rejected:  { key: 'rejected',  label: 'Beluga refused',  settled: false, actionable: true  },
  pending:   { key: 'pending',   label: 'Not checked yet', settled: false, actionable: true  },
  refused:   { key: 'refused',   label: 'No case matches', settled: true,  actionable: false },
});

export const VERDICT_ORDER = Object.freeze(['authored', 'checked', 'pending', 'rejected', 'refused']);

/**
 * What a `checked` on this declaration is actually worth.
 *
 * Measured 2026-09-22: Beluga gates coverage checking PER DECLARATION on that
 * declaration's own totality declaration (`recsgn.ml:1603` sets `Total.enabled`
 * around one theorem and resets it immediately; `coverage.ml:3592` reads it). A
 * declaration with a deleted arm and no `/ total /` passes, even with a totalied
 * sibling in the same file.
 *
 * ⛔ So a table must never report the same confidence for both. The surface shows
 * this, it does not bury it.
 */
export const STRENGTH = Object.freeze({
  total: {
    key: 'total',
    label: 'Coverage and termination checked',
    guarantees: ['well-typed', 'covering', 'terminating'],
  },
  typedOnly: {
    key: 'typedOnly',
    label: 'Well-typed only, no totality declaration',
    guarantees: ['well-typed'],
  },
});

/** Where the domain assignment came from. Calf later supplies `authored`. */
export const PROVENANCE = Object.freeze({
  inferred: { key: 'inferred', label: 'Inferred from your cases' },
  authored: { key: 'authored', label: 'From your schema' },
});

/**
 * Strength of a declaration, from the declaration itself. Takes the decl text
 * because the totality pragma is the only thing that decides it.
 */
export function strengthOf(declText) {
  return /\/\s*total\b/.test(String(declText == null ? '' : declText))
    ? STRENGTH.total
    : STRENGTH.typedOnly;
}

/**
 * Build the table.
 *
 * @param {object}   spec
 * @param {string}   spec.judgment  the type family under induction, e.g. `step`
 * @param {Array}    spec.rules     `enumerateConstructorsTyped(code, judgment)`
 * @param {Array}    spec.pieces    authored arms: `{ id, rule, note? }`. `rule` is
 *                                  the rule the author wrote it for; `id` names the
 *                                  piece by its ARGUMENT, never by index.
 * @param {Function} spec.assign    `(rule, pieces, ctx) => { pieceId, why? } | null`.
 *                                  null means: no authored piece applies. A refusal
 *                                  must name the rule, never guess.
 * @param {object}   spec.strength  a STRENGTH value.
 * @returns {{judgment, strength, rows}}
 */
export function buildTable({ judgment, rules, pieces, assign, strength }) {
  const ruleList = Array.isArray(rules) ? rules : [];
  const pieceList = Array.isArray(pieces) ? pieces : [];
  const byRule = new Map(pieceList.map((p) => [p.rule, p]));
  const str = strength || STRENGTH.typedOnly;

  const rows = ruleList.map((rule) => {
    const base = { rule: rule.name, ruleType: rule, piece: null, why: '', provenance: null };

    // The author already covered this rule. Nothing to assign, nothing to check.
    if (byRule.has(rule.name)) {
      return { ...base, piece: byRule.get(rule.name).id, verdict: VERDICTS.authored };
    }

    let proposal = null;
    try {
      proposal = assign ? assign(rule, pieceList, { judgment, strength: str }) : null;
    } catch (e) {
      // A classifier that throws is a refusal with a reason, never a crash and
      // never a guess.
      return { ...base, verdict: VERDICTS.refused, why: `assignment failed: ${e && e.message ? e.message : e}` };
    }

    if (!proposal || !proposal.pieceId) {
      return {
        ...base,
        verdict: VERDICTS.refused,
        why: (proposal && proposal.why) || `no authored case matches ${rule.name}`,
      };
    }
    return {
      ...base,
      piece: proposal.pieceId,
      verdict: VERDICTS.pending,
      why: proposal.why || '',
      provenance: proposal.provenance || PROVENANCE.inferred,
    };
  });

  return { judgment, strength: str, rows };
}

/**
 * Fold an oracle's answer into one row. The ONLY route to `checked`.
 * Pure: returns a new table.
 */
export function recordVerdict(table, ruleName, { ok, error }) {
  return {
    ...table,
    rows: table.rows.map((r) => {
      if (r.rule !== ruleName) return r;
      if (r.verdict === VERDICTS.authored) return r; // never re-judge the author's own work
      return ok
        ? { ...r, verdict: VERDICTS.checked, why: '' }
        : { ...r, verdict: VERDICTS.rejected, why: String(error || 'rejected') };
    }),
  };
}

/**
 * Point a rule at a different piece. The row drops back to `pending`, because a
 * reassignment is a new claim and nothing carries over. This is the primary user
 * action on the table: one candidate, one check.
 */
export function reassign(table, ruleName, pieceId) {
  return {
    ...table,
    rows: table.rows.map((r) => (
      r.rule === ruleName
        ? { ...r, piece: pieceId, verdict: VERDICTS.pending, why: '', provenance: PROVENANCE.authored }
        : r
    )),
  };
}

/**
 * The number the pitch rests on.
 *
 * ⛔ The denominator EXCLUDES rules the author wrote. "Of the cases you did not
 * write, how many did the machine supply correctly" is the honest question; counting
 * the author's own arms as successes inflates every figure.
 */
export function summarize(table) {
  const rows = (table && table.rows) || [];
  const count = (k) => rows.filter((r) => r.verdict.key === k).length;
  const authored = count('authored');
  const checked = count('checked');
  const denom = rows.length - authored;
  return {
    rules: rows.length,
    authored,
    checked,
    rejected: count('rejected'),
    pending: count('pending'),
    refused: count('refused'),
    completable: denom,
    rate: denom > 0 ? checked / denom : null,
    strength: table.strength.key,
  };
}

/**
 * Structural invariants. The harness asserts these; a surface bug and a scoring bug
 * should never be able to look like each other.
 */
export function validate(table) {
  const problems = [];
  const rows = (table && table.rows) || [];
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.rule)) problems.push(`rule ${r.rule} appears more than once`);
    seen.add(r.rule);
    if (!VERDICTS[r.verdict.key]) problems.push(`rule ${r.rule} has an unknown verdict`);
    if (r.verdict === VERDICTS.refused && !r.why) problems.push(`rule ${r.rule} is refused without a reason`);
    if (r.verdict === VERDICTS.checked && !r.piece) problems.push(`rule ${r.rule} is checked with no piece`);
    if (r.verdict === VERDICTS.rejected && !r.why) problems.push(`rule ${r.rule} is rejected without the checker's error`);
  }
  return problems;
}

// case-fill-job.mjs — one background job: plan a proof's missing cases and fill them,
// reporting each row as it lands. The case-completion worker runs this; so do the tests.
// The checker, the messages out and the cancel flag are injected.
//
// Order: every row gets the instant lookup first, so whatever the signature determines
// shows at once; then Orca, one row at a time, each with its own budget.

import { recsWithArms } from './case-arms.mjs';
import { enumerateDecls } from './prover-corpus-decls.mjs';
import { armRuleHead, splitArm } from './case-pieces.mjs';
import { signatureIndex } from './case-lookup.mjs';
import { eligibility, planCase, fillRow, slicesFor, keyOfPattern } from './case-fill.mjs';

// Automatic: the measured setting. Forced: three times the time, because about half of
// the measured misses were the budget (docs/case-completion.md §6).
export const BUDGET = Object.freeze({
  auto: { maxSteps: 15, deadlineMs: 60000 },
  force: { maxSteps: 40, deadlineMs: 180000 },
});

const lookupOnly = async () => ({ complete: false, stuck: { reason: 'lookup-only' } });

/**
 * job: { id, code, recName, recOrdinal = 0, mode: 'auto' | 'force', keys?: string[] }
 *   `code` is the whole program the proof lives in (prelude and file); `recOrdinal`
 *   picks among declarations of the same name, in program order.
 * post(msg), in this order:
 *   { id, type: 'plan', eligibility, rows: [{ key, rule, pattern, anchor }], unbuilt, why }
 *   { id, type: 'row-start', key, deadlineMs }            before each Orca attempt
 *   { id, type: 'row', key, ok, text, source, donor, why } once per row
 *   { id, type: 'done', cancelled }
 * `anchor` is the key of the authored arm the row goes before, or null for "after the
 * last arm": the editor re-finds that arm in the live document, never an offset.
 */
export async function runJob(job, check, post, isCancelled = () => false) {
  const id = job.id;
  const done = (cancelled = false) => post({ id, type: 'done', cancelled });
  const named = recsWithArms(job.code).filter((r) => r.name === job.recName);
  const rec0 = named[job.recOrdinal || 0];
  if (!rec0) {
    post({ id, type: 'plan', eligibility: null, rows: [], unbuilt: true, why: 'proof-not-found' });
    return done();
  }
  const elig = eligibility(job.code, rec0);
  if (job.mode !== 'force' && !elig.auto) {
    post({ id, type: 'plan', eligibility: elig, rows: [], unbuilt: false, why: 'not-automatic' });
    return done();
  }

  // The smallest program the planned proof checks in.
  let plan = null; let rec = null;
  for (const sl of slicesFor(job.code, enumerateDecls(job.code), rec0)) {
    if (isCancelled()) return done(true);
    const r = recsWithArms(sl.prog).find((x) => x.name === job.recName && x.from === rec0.from + sl.shift);
    if (!r) continue;
    const p = await planCase(sl.prog, r, check);
    plan = p; rec = r;
    if (!p.unbuilt || p.why !== 'program-error') break;
  }
  if (!plan || !rec) {
    post({ id, type: 'plan', eligibility: elig, rows: [], unbuilt: true, why: 'no-slice' });
    return done();
  }

  // Where each row sits: before the first authored arm that follows it in the plan.
  const planned = recsWithArms(plan.code).find((x) => x.name === job.recName && x.from === rec.from);
  const authoredKeys = new Set(rec.arms.map((a) => { const sp = splitArm(a.text); return sp ? keyOfPattern(sp.pattern) : null; }));
  const anchorOf = (row) => {
    const next = (planned ? planned.arms : []).find((a) => a.from > row.to && authoredKeys.has(keyOf(a)));
    return next ? keyOf(next) : null;
  };
  const rows = plan.rows.map((r) => ({ key: r.key, rule: r.rule, pattern: r.pattern, anchor: anchorOf(r) }));
  post({ id, type: 'plan', eligibility: elig, rows, unbuilt: !!plan.unbuilt, why: plan.why || null });
  if (plan.unbuilt) return done();

  const wanted = plan.rows
    .map((r, k) => ({ r, k }))
    .filter(({ r }) => !job.keys || job.keys.includes(r.key));
  const authored = rec.arms.map((a) => ({ text: a.text, head: armRuleHead(a.text) }));
  const index = signatureIndex(plan.code);
  const budget = BUDGET[job.mode === 'force' ? 'force' : 'auto'];
  const base = { recStart: rec.from, authored, index };
  const report = (r, f) => post({
    id, type: 'row', key: r.key, ok: !!f.ok, text: f.ok ? f.text : null,
    source: f.source || null, donor: f.donor || null, why: f.ok ? null : (f.why || 'not-filled'),
  });

  // Pass 1: the lookup alone, every row.
  const left = [];
  for (const w of wanted) {
    if (isCancelled()) return done(true);
    const f = await fillRow(plan, w.k, check, { ...base, prove: lookupOnly });
    if (f.ok) report(w.r, f); else left.push(w);
  }
  // Pass 2: Orca, one row at a time.
  for (const w of left) {
    if (isCancelled()) return done(true);
    post({ id, type: 'row-start', key: w.r.key, deadlineMs: budget.deadlineMs });
    const f = await fillRow(plan, w.k, check, {
      ...base, noLookup: true, maxSteps: budget.maxSteps, deadlineMs: budget.deadlineMs, shouldCancel: isCancelled,
    });
    if (isCancelled()) return done(true);
    report(w.r, f);
  }
  return done();
}

function keyOf(arm) {
  const sp = splitArm(arm.text);
  return sp ? keyOfPattern(sp.pattern) : null;
}

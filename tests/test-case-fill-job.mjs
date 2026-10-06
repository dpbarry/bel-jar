// One background job, as the case-completion worker runs it: plan, then fill, reporting
// each row as it lands. Against the real checker, on a small proof.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { TextDecoder, TextEncoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import { recsWithArms, maskArm } from '../js/editor-src/prover/case-arms.mjs';
import { armRuleHead } from '../js/editor-src/prover/case-pieces.mjs';
import { runJob, BUDGET } from '../js/editor-src/prover/case-fill-job.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { console, TextDecoder, TextEncoder, setTimeout, clearTimeout };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'beluga_web.bc.js'), 'utf8'), ctx);
const check = async (code) => { const r = ctx.Beluga.checkFromString(code); return { ok: !!r.ok, output: String(r.output || '') }; };

const TPS = `LF tm : type = | z : tm | succ : tm -> tm | pred : tm -> tm;
LF tp : type = | nat : tp;
LF oft : tm -> tp -> type =
| t_z : oft z nat
| t_succ : oft M nat -> oft (succ M) nat
| t_pred : oft M nat -> oft (pred M) nat;
LF step : tm -> tm -> type =
| e_succ : step M M' -> step (succ M) (succ M')
| e_pred : step M M' -> step (pred M) (pred M')
| e_pred_z : step (pred z) z;
rec tps : [ |- step M N] -> [ |- oft M T] -> [ |- oft N T] =
/ total s (tps m n t s) /
fn s => fn d => case s of
| [ |- e_succ S] =>
  let [ |- t_succ D] = d in
  let [ |- D'] = tps [ |- S] [ |- D] in
  [ |- t_succ D']
| [ |- e_pred S] =>
  let [ |- t_pred D] = d in
  let [ |- D'] = tps [ |- S] [ |- D] in
  [ |- t_pred D']
| [ |- e_pred_z] =>
  let [ |- t_pred D] = d in
  [ |- t_z]
;
`;
const without = (code, heads) => {
  let out = code;
  const rec = recsWithArms(code).find((r) => r.name === 'tps');
  for (const a of rec.arms.filter((x) => heads.includes(armRuleHead(x.text))).sort((x, y) => y.from - x.from)) out = maskArm(out, a);
  return out;
};
const two = without(TPS, ['e_pred', 'e_pred_z']);
const run = async (job, isCancelled) => {
  const msgs = [];
  await runJob({ id: 'j', recName: 'tps', mode: 'auto', ...job }, check, (m) => msgs.push(m), isCancelled);
  return msgs;
};

expect(BUDGET.auto.deadlineMs === 60000 && BUDGET.force.deadlineMs === 180000, 'the budgets are the measured 60 s and three times that when forced');

// ── a whole job ───────────────────────────────────────────────────────────────
const m = await run({ code: two });
const plan = m.find((x) => x.type === 'plan');
expect(plan && plan.rows.map((r) => r.key).join(',') === 'e_pred,e_pred_z', 'the plan names both missing cases first');
expect(plan.rows.every((r) => r.anchor === null || r.anchor === 'e_succ'), 'each row says which authored arm it goes before, if any');
const rows = m.filter((x) => x.type === 'row');
expect(rows.length === 2 && rows.every((r) => r.ok), 'both rows are filled');
const lookupAt = m.findIndex((x) => x.type === 'row' && x.source === 'lookup');
const firstOrca = m.findIndex((x) => x.type === 'row-start');
expect(lookupAt >= 0 && firstOrca > lookupAt, 'the instant lookup reports before any search starts');
expect(m[m.length - 1].type === 'done' && !m[m.length - 1].cancelled, 'and the job ends with done');
expect(rows.every((r) => typeof r.text === 'string' && r.text.length), 'a filled row carries its arm text, never an offset');

// ── who is filled unasked, and forcing ────────────────────────────────────────
const untotalied = two.replace('/ total s (tps m n t s) /', '');
const quiet = await run({ code: untotalied });
expect(quiet.find((x) => x.type === 'plan').why === 'not-automatic' && !quiet.some((x) => x.type === 'row'), 'an untotalied proof is never filled automatically');
const forced = await run({ code: untotalied, mode: 'force', keys: ['e_pred'] });
const fr = forced.filter((x) => x.type === 'row');
expect(fr.length === 1 && fr[0].key === 'e_pred' && fr[0].ok, 'forcing fills it anyway, and only the rows asked for');

// ── cancel ────────────────────────────────────────────────────────────────────
let stop = false;
const msgs = [];
await runJob({ id: 'c', code: two, recName: 'tps', mode: 'auto' }, check, (x) => { msgs.push(x); if (x.type === 'plan') stop = true; }, () => stop);
expect(!msgs.some((x) => x.type === 'row') && msgs[msgs.length - 1].cancelled === true, 'a job cancelled after planning reports no rows and says it was cancelled');

const lost = await run({ code: two, recName: 'nope' });
expect(lost.find((x) => x.type === 'plan').why === 'proof-not-found' && lost[lost.length - 1].type === 'done', 'a proof that is gone ends the job cleanly');

console.log('PASS test-case-fill-job.mjs');

// When case completion runs and on what: the scheduler's whole policy, with a fake
// worker and a fake clock. Pure Node, no Beluga.
import { createCaseFillScheduler, PAUSE_MS, GRACE_MS, IDLE_MS } from '../js/editor-src/prover/case-fill-scheduler.mjs';
import * as store from '../js/editor-src/prover/case-fill-store.mjs';
import { VERDICTS } from '../js/editor-src/prover/case-assignment.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const DOC = `LF nat : type = | z : nat | s : nat -> nat;
rec f : [ |- nat] -> [ |- nat] =
/ total n (f n) /
fn n => case n of
| [ |- z] => [ |- z]
;
rec g : [ |- nat] -> [ |- nat] =
/ total n (g n) /
fn n => case n of
| [ |- z] => (case n of | [ |- z] => [ |- z])
;
`;
const caseAt = (text, rec) => text.indexOf('case', text.indexOf(`rec ${rec}`));
const coverageAt = (from) => ({ from, to: from + 4, message: 'COVERAGE FAILURE: Case expression doesn\'t cover: ...' });

function harness(opts = {}) {
  let t = 1000;
  const timers = new Map();
  let tid = 0;
  const setTimer = (fn, ms) => { tid += 1; timers.set(tid, { at: t + ms, fn }); return tid; };
  const clearTimer = (id) => { timers.delete(id); };
  const advance = (ms) => {
    const end = t + ms;
    for (;;) {
      const due = [...timers].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      t = due[1].at;
      timers.delete(due[0]);
      due[1].fn();
    }
    t = end;
  };
  const workers = [];
  const state = { text: opts.text || DOC, setting: opts.setting || 'auto', busy: false, declined: [] };
  const sched = createCaseFillScheduler({
    makeWorker: () => {
      const w = { posted: [], terminated: false, onmessage: null, postMessage(m) { this.posted.push(m); }, terminate() { this.terminated = true; } };
      workers.push(w);
      return w;
    },
    runtimeUrl: () => 'https://runtime.example/beluga_web.bc.js?v=1',
    getFileId: () => 'file-1',
    getDocText: () => state.text,
    getProgram: () => ({ code: `% prelude\n${state.text}`, fileStart: '% prelude\n'.length }),
    readSetting: () => state.setting,
    isHarpoonBusy: () => state.busy,
    declined: (d) => state.declined.push(d),
    now: () => t,
    setTimer,
    clearTimer,
  });
  const w = () => workers[workers.length - 1];
  const jobs = () => workers.flatMap((x) => x.posted).filter((m) => m.type === 'job').map((m) => m.job);
  const say = (msg) => w().onmessage({ data: msg });
  return { sched, state, advance, workers, w, jobs, say };
}

// ── it starts only after a pause, on the proof whose OUTER case is incomplete ─
{
  store.resetStore();
  const h = harness();
  h.sched.noteEdit();
  h.sched.onSettlement({ state: 'ready', belugaDiagnostics: [coverageAt(caseAt(DOC, 'f'))] });
  expect(h.workers.length === 0, 'nothing starts while typing has not paused');
  h.advance(PAUSE_MS);
  expect(h.workers.length === 1 && h.w().posted[0].type === 'init', 'after the pause one worker starts, given the runtime first');
  expect(h.w().posted[0].script === 'https://runtime.example/beluga_web.bc.js?v=1', 'with the URL the runtime owner gave');
  const [job] = h.jobs();
  expect(job && job.recName === 'f' && job.mode === 'auto' && job.recOrdinal === 0, 'the job is the incomplete proof, automatically');
  expect(job.code.startsWith('% prelude\n'), 'and it carries the whole program the file checks in');

  // Results land in the store, in the table's words.
  h.say({ id: job.id, type: 'plan', eligibility: { auto: true }, rows: [{ key: 's', rule: 's', pattern: '[ |- s X]', anchor: null }], unbuilt: false, why: null });
  h.say({ id: job.id, type: 'row', key: 's', ok: true, text: '[ |- s X] =>\n  [ |- X]', source: 'orca' });
  const e = store.entry('file-1', 'f#0');
  expect(e && e.rows.get('s').state === 'filled' && /\[ \|- X\]/.test(e.rows.get('s').text), 'a filled row is in the store with its text');
  expect(store.verdictOf(e, 's') === VERDICTS.checked, 'and its verdict is Checked, reached only through a passed fill');
  h.say({ id: job.id, type: 'done', cancelled: false });

  // The same proof, unchanged: not planned twice.
  h.sched.onSettlement({ state: 'ready', belugaDiagnostics: [coverageAt(caseAt(DOC, 'f'))] });
  h.advance(PAUSE_MS);
  expect(h.jobs().length === 1, 'a proof already planned in this exact form is not searched again');

  // An edit to the proof drops what was found for it.
  h.state.text = DOC.replace('| [ |- z] => [ |- z]\n;\nrec g', '| [ |- z] => [ |- z ]\n;\nrec g');
  h.sched.onSettlement({ state: 'ready', belugaDiagnostics: [] });
  expect(!store.entry('file-1', 'f#0'), 'editing the proof drops its rows');

  // Idle: the worker gives its memory back.
  h.advance(IDLE_MS + 1);
  expect(h.w().terminated, 'an idle worker is terminated');
}

// ── a proof put back as it was is filled again ────────────────────────────────
// Regression (Chrome, 2026-10-05): a space typed in the proof and deleted again leaves
// the text exactly as the last check read it, so no new check settles. The ghosts the
// edit dropped never came back. The last settled check is still the verdict for that text.
{
  store.resetStore();
  const h = harness();
  const snap = { state: 'ready', belugaDiagnostics: [coverageAt(caseAt(DOC, 'f'))] };
  h.sched.onSettlement(snap);
  h.advance(PAUSE_MS);
  const [job] = h.jobs();
  h.say({ id: job.id, type: 'plan', eligibility: { auto: true }, rows: [{ key: 's', rule: 's', pattern: '[ |- s X]', anchor: null }], unbuilt: false });
  h.say({ id: job.id, type: 'row', key: 's', ok: true, text: '[ |- s X] => [ |- X]', source: 'orca' });
  h.say({ id: job.id, type: 'done' });

  // Typed in, then put back: the ghost layer reports the touch; no check settles.
  h.sched.noteEdit();
  h.sched.proofTouched('file-1', 'f#0');
  expect(!store.entry('file-1', 'f#0'), 'the touch drops what was found');
  h.advance(PAUSE_MS - 1);
  h.sched.noteEdit(); // still typing: the look waits for the pause
  h.advance(PAUSE_MS - 1);
  expect(h.jobs().length === 1, 'nothing restarts while typing has not paused');
  h.advance(PAUSE_MS * 2);
  const again = h.jobs()[1];
  expect(again && again.recName === 'f' && again.mode === 'auto', 'once it pauses, the proof that reads as last checked is filled again');

  // Put back to something else: that text's own check decides, not the old one.
  h.say({ id: again.id, type: 'plan', eligibility: { auto: true }, rows: [{ key: 's', rule: 's', pattern: '[ |- s X]', anchor: null }], unbuilt: false });
  h.say({ id: again.id, type: 'done' });
  h.sched.proofTouched('file-1', 'f#0');
  h.state.text = DOC.replace('| [ |- z] => [ |- z]\n;\nrec g', '| [ |- z] => [ |- s z]\n;\nrec g');
  h.advance(PAUSE_MS * 3);
  expect(h.jobs().length === 2, 'a proof that reads differently waits for a check of its own');

  // And the old check is not read against it: a fill forced on the new text survives.
  h.sched.proofTouched('file-1', 'f#0');
  expect(h.sched.force(caseAt(h.state.text, 'f')), 'force the edited proof');
  h.advance(1);
  const forced = h.jobs()[2];
  h.say({ id: forced.id, type: 'plan', eligibility: { auto: true }, rows: [{ key: 's', rule: 's', pattern: '[ |- s X]', anchor: null }], unbuilt: false });
  h.advance(PAUSE_MS * 3);
  expect(store.entry('file-1', 'f#0'), 'what the forced fill planned is still there after the look comes round');
}

// ── an inner case's failure is not ours ───────────────────────────────────────
{
  store.resetStore();
  const h = harness();
  const inner = DOC.indexOf('(case n of');
  h.sched.onSettlement({ state: 'ready', belugaDiagnostics: [coverageAt(inner + 1)] });
  h.advance(PAUSE_MS * 2);
  expect(h.jobs().length === 0, 'a coverage failure at an inner case starts nothing');
  h.sched.onSettlement({ state: 'stale', belugaDiagnostics: [coverageAt(caseAt(DOC, 'f'))] });
  h.advance(PAUSE_MS * 2);
  expect(h.jobs().length === 0, 'nor does an unsettled check');
}

// ── an edit while the job runs cancels it, and a stuck worker is killed ───────
{
  store.resetStore();
  const h = harness();
  h.sched.onSettlement({ state: 'ready', belugaDiagnostics: [coverageAt(caseAt(DOC, 'f'))] });
  h.advance(PAUSE_MS);
  const [job] = h.jobs();
  h.say({ id: job.id, type: 'plan', eligibility: { auto: true }, rows: [{ key: 's', rule: 's', pattern: '[ |- s X]', anchor: null }, { key: 'k', rule: 'k', pattern: '[ |- k]', anchor: null }], unbuilt: false });
  h.say({ id: job.id, type: 'row-start', key: 's', deadlineMs: 1000 });
  h.advance(1000 + GRACE_MS - 1);
  expect(!h.workers[0].terminated, 'a row still inside its deadline and grace is left alone');
  h.advance(2);
  expect(h.workers[0].terminated, 'a row past its deadline and the grace gets its worker terminated: the only way to stop a looping check');
  const row = store.entry('file-1', 'f#0').rows.get('s');
  expect(row.state === 'none' && row.why === 'time-budget', 'and the row is recorded as out of time');
  const again = h.jobs()[1];
  expect(again && again.keys && again.keys.join(',') === 'k', 'the rest of the job is requeued on a fresh worker');

  h.state.text = `${DOC}\n`.replace('rec f :', 'rec f  :');
  h.sched.onSettlement({ state: 'ready', belugaDiagnostics: [] });
  expect(h.w().posted.some((m) => m.type === 'cancel' && m.id === again.id), 'an edit to the proof cancels its running job');
  h.advance(GRACE_MS + 1);
  expect(h.w().terminated, 'and a worker that does not stop is terminated after the grace');
}

// ── the setting, force, and Harpoon ───────────────────────────────────────────
{
  store.resetStore();
  const h = harness({ setting: 'ask' });
  h.sched.onSettlement({ state: 'ready', belugaDiagnostics: [coverageAt(caseAt(DOC, 'f'))] });
  h.advance(PAUSE_MS * 2);
  expect(h.jobs().length === 0, '"When asked": nothing starts on its own');
  h.sched.noteEdit();
  expect(h.sched.force(caseAt(DOC, 'f') + 2, ['s']) === true, 'forcing works whatever the setting');
  const [job] = h.jobs();
  expect(job && job.mode === 'force' && job.keys.join(',') === 's', 'at once, without waiting for a pause, and only on the rows asked for');
  h.say({ id: job.id, type: 'plan', eligibility: { auto: false }, rows: [{ key: 's', rule: 's', pattern: '[ |- s X]', anchor: null }], unbuilt: false });
  h.say({ id: job.id, type: 'row', key: 's', ok: false, why: 'no-move' });
  expect(h.state.declined.length === 1 && h.state.declined[0].rule === 's', 'a forced row that finds nothing is reported, so the person hears back');
  expect(h.sched.force(0) === false, 'outside any proof there is nothing to force');
}
{
  store.resetStore();
  const h = harness();
  h.sched.onSettlement({ state: 'ready', belugaDiagnostics: [coverageAt(caseAt(DOC, 'f'))] });
  h.advance(PAUSE_MS);
  const [job] = h.jobs();
  h.say({ id: job.id, type: 'plan', eligibility: { auto: true }, rows: [{ key: 's', rule: 's', pattern: '[ |- s X]', anchor: null }], unbuilt: false });
  h.say({ id: job.id, type: 'row', key: 's', ok: false, why: 'no-move' });
  expect(h.state.declined.length === 0, 'an automatic miss is silent');
  h.say({ id: job.id, type: 'done' });
  h.sched.onSettingChanged('ask');
  expect(!store.entry('file-1', 'f#0'), 'switching to "When asked" drops what automatic work produced');
}
{
  store.resetStore();
  const h = harness();
  h.state.busy = true;
  h.sched.onSettlement({ state: 'ready', belugaDiagnostics: [coverageAt(caseAt(DOC, 'f'))] });
  h.advance(PAUSE_MS + 5000);
  expect(h.jobs().length === 0, 'nothing starts while Harpoon runs Orca');
  h.state.busy = false;
  h.advance(2000);
  expect(h.jobs().length === 1, 'and it starts once Harpoon is done');
}
{
  // A plan for a proof that changed in the meantime is thrown away.
  store.resetStore();
  const h = harness();
  h.sched.onSettlement({ state: 'ready', belugaDiagnostics: [coverageAt(caseAt(DOC, 'f'))] });
  h.advance(PAUSE_MS);
  const [job] = h.jobs();
  // (An edit inside the proof: trailing space after its last token is outside it.)
  h.state.text = DOC.replace('rec f : [ |- nat] -> [ |- nat] =', 'rec f : [ |- nat] -> [ |- nat]  =');
  h.say({ id: job.id, type: 'plan', eligibility: { auto: true }, rows: [{ key: 's', rule: 's', pattern: '[ |- s X]', anchor: null }], unbuilt: false });
  expect(!store.entry('file-1', 'f#0'), 'a plan for a proof that has since changed is not shown');
}

console.log('PASS test-case-fill-scheduler.mjs');

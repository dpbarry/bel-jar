// Watching the store grow (plan v6 c11, docs/PERSIST.md §5.7): what
// `npm run usage` reports, and the one thing that must hold before old
// versions are ever pruned: a merge whose base text the server no longer has
// keeps both versions, where it used to stop with an error.
import { createMemoryServer } from '../js/persist/sync/memory-server.mjs';
import { report, human, LIMITS } from '../scripts/usage.mjs';
import { makeDevice, syncHash, fileId, projectState } from './_sync-env.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── npm run usage ───────────────────────────────────────────────────────────
const small = report({ accounts: 25, versions: 30000, databaseBytes: 40 * 1024 * 1024, textBytes: 700 * 1024 * 1024, rowsRead: 1, rowsWritten: 2 });
expect(small.length === 5 && /^accounts\s+25$/.test(small[0]) && /^versions\s+30000$/.test(small[1]), 'the four numbers, and the day\'s rows');
expect(/40\.0 MB of 500\.0 MB \(8%/.test(small[2]) && !/past half/.test(small.join('\n')), 'each beside its limit; under half, nothing to do');
const big = report({ accounts: 25, versions: 1, databaseBytes: 300 * 1024 * 1024, textBytes: 6 * 1024 * 1024 * 1024, rowsRead: 0, rowsWritten: 0 });
expect(/past half: build pruning/.test(big[2]) && /past half: build pruning/.test(big[3]), 'past half of a limit, it says pruning is due');
const paid = report({ accounts: 1, versions: 1, databaseBytes: 300 * 1024 * 1024, textBytes: 0, rowsRead: 0, rowsWritten: 0 }, 'paid');
expect(/of 10\.00 GB/.test(paid[2]) && !/past half/.test(paid[2]), 'on the paid plan the database may grow to 10 GB');
expect(LIMITS.databaseBytes.free === 500 * 1024 * 1024 && human(1536) === '1.5 kB', 'D1\'s free limit, and sizes as a person reads them');

// ── a merge whose base the server no longer has ────────────────────────────
const server = createMemoryServer({ hash: syncHash });
const a = makeDevice(server, { name: 'GA' });
const b = makeDevice(server, { name: 'GB' });
const pid = a.work.projectId();
const main = fileId(a.work, pid, 'main.bel');
a.work.setText(main, 'the base\n', pid);
await a.engine.syncAll();
await b.engine.syncAll();
const baseHash = server.history(pid).versions[0].manifest.files[0].hash;
// Both change it; one goes up first; then the server lets the base go.
b.work.setText(main, 'written on b\n', pid);
a.work.setText(main, 'written on a\n', pid);
await a.engine.syncAll();
server.forget('u_dean', baseHash);
const res = await b.engine.syncAll();
const st = res.projects[pid];
expect(st && st.status !== 'error', `the round goes on: no error for a base that is gone (${JSON.stringify(st)})`);
const conflicts = b.work.listConflicts();
expect(conflicts.length === 1, 'both versions are kept, as one file to review');
const sides = b.work.conflictSides(conflicts[0].fid, pid);
expect(sides && sides.mine === 'written on b\n' && sides.theirs === 'written on a\n' && sides.base === '',
  `this device's text is kept beside the cloud's, to be chosen (no base to show: it is gone) (${JSON.stringify(sides)})`);
expect(projectState(b.work, pid).files[0].text === 'written on a\n', 'and the file shows the cloud\'s, as any conflict does');
await b.engine.syncAll();
expect(b.work.listConflicts().length === 1, 'the next round goes on too, and the choice still waits for a person');

// A text the server's own version names is still required: that is damage, not pruning.
// A device with its own edit merges against a head whose text the server lacks.
{
  const sv = createMemoryServer({ hash: syncHash });
  const c = makeDevice(sv, { name: 'GC' });
  const d = makeDevice(sv, { name: 'GD' });
  const q = c.work.projectId();
  const f = fileId(c.work, q, 'main.bel');
  c.work.setText(f, 'start\n', q);
  await c.engine.syncAll();
  await d.engine.syncAll();
  d.work.setText(f, 'd typed this\n', q);
  c.work.setText(f, 'c typed this\n', q);
  await c.engine.syncAll();
  const head = sv.history(q).versions.at(-1);
  sv.forget('u_dean', head.manifest.files[0].hash);
  const r = await d.engine.syncAll();
  expect(r.projects[q] && r.projects[q].status === 'error' && /missing a file its version lists/.test(r.projects[q].message),
    `a missing text the head itself names is still an error: it cannot be made up (${JSON.stringify(r.projects[q])})`);
  expect(projectState(d.work, q).files[0].text === 'd typed this\n', 'and nothing here is touched while it waits');
}

console.log(`OK sync growth (${n} checks: what npm run usage says and when pruning is due, a merge over a base the server let go keeping both)`);

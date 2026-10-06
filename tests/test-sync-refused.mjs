// A refused request reads as "couldn't sync", with its reason, never as
// offline (plan v6 c9). Done when: "a test with the Worker answering 429: the
// cloud says Couldn't sync with the reason, nothing is lost, and the next round
// after it recovers pushes everything." Run on the page's own Persist (the
// built bundle), over the HTTP transport, against a server that answers 429.
import { createMemoryServer } from '../js/persist/sync/memory-server.mjs';
import { createHttpTransport } from '../js/persist/sync/http-transport.mjs';
import { cloudWords, failureWords, noteRefusal } from '../js/account/sync-ui.mjs';
import { syncHash, makeDevice, projectState } from './_sync-env.mjs';
import { makeBrowserStorage, openTab, here } from './_persist-env.mjs';
import { flush, lockManager } from './_runner-env.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── the words ───────────────────────────────────────────────────────────────
expect(/busy \(429\)/.test(failureWords('status-429')) && /nothing here is lost/.test(failureWords('status-429')), 'a 429 says the server is busy, and that nothing is lost');
expect(/problem \(503\)/.test(failureWords('status-503')) && /\(500\)/.test(failureWords('status-500')), 'a 5xx says the server had a problem, with its code');
expect(/too large/.test(failureWords('status-413')) && /session/.test(failureWords('status-401')), 'too large, and a session that ended, each say so');
expect(/Delete projects you no longer need/.test(failureWords('refused-quota-projects')) && /1,000 projects/.test(failureWords('refused-quota-projects')),
  'an account at its project limit says what to delete');
expect(/Report an issue/.test(failureWords('refused-quota-texts')) && /1 GB/.test(failureWords('refused-quota-texts')),
  'one at its text limit says what it means, and what to do');
expect(failureWords(null) === null && failureWords('nonsense') === null, 'and nothing is made up for a reason it does not know');
expect(cloudWords({ state: 'error', reason: null }).detail === 'BelJar keeps trying.', 'without a reason, the cloud says it keeps trying, as before');
const allWords = ['status-429', 'status-503', 'status-413', 'status-401', 'status-418', 'refused-quota-projects', 'refused-quota-texts', 'refused-too-many'].map(failureWords).join(' ');
expect(!/—|–/.test(allWords), 'in the house voice: no dashes');

// ── the page, against a server answering 429 ────────────────────────────────
const server = createMemoryServer({ hash: syncHash });
const real = server.transport('u_dean');
let busy = false;
let refused = 0;
const answer = (result, status = 200) => ({ status, json: async () => ({ result }) });
const fetch = (url, init) => {
  const method = String(url).split('/').pop();
  // Busy for commits: the round reaches the server, and is refused at its first push.
  if (busy && method === 'commit') {
    refused += 1;
    return Promise.resolve(answer(null, 429));
  }
  return real[method](...JSON.parse(init.body).args).then((result) => answer(result));
};
const doc = { visibilityState: 'visible', readyState: 'complete', addEventListener() {}, removeEventListener() {} };
const storage = makeBrowserStorage();
const locks = lockManager();
const { P, S } = openTab(storage, { document: doc, navigator: { onLine: true } });
// "Back online: Ask me first": a busy server must not hold the edits as if offline.
S.set('syncReconnect', 'ask');
P.setAccount('u_dean');
const made = P.createProjectWithFiles('Thesis', [{ name: 'main.bel', text: 'first\n' }]);
const pid = made.projectId;
const fid = made.files[0].id;
const runner = P.startSync({ transport: createHttpTransport({ fetch }), locks });
// A second tab of the same browser: it does not sync, and hears how it went.
const { P: P2 } = openTab(storage, { document: doc, navigator: { onLine: true } });
P2.startSync({ transport: createHttpTransport({ fetch }), locks });
await flush();
await runner.syncNow();
expect(server.projectIds().includes(pid), 'a project in the cloud');

busy = true;
P.setFileText(fid, 'typed while the server was busy\n');
const other = P.createProjectWithFiles('Made while busy', [{ name: 'b.bel', text: 'new\n' }]);
await runner.syncNow();
await flush();
const s = here(P.syncSummary());
expect(refused === 1 && s.state === 'error' && s.reason === 'status-429', `the round stops at the first refusal (no project after it is tried), and the summary says couldn't sync, and why (${refused}, ${JSON.stringify(s)})`);
const s2 = here(P2.syncSummary());
expect(s2.state === 'error' && s2.reason === 'status-429', `another tab of the browser says the same, with the reason (${JSON.stringify(s2)})`);
const words = cloudWords(s);
expect(words.title === 'Couldn’t sync' && /busy \(429\)/.test(words.detail), `the cloud says Couldn't sync, with the reason (${words.detail})`);
expect(s.state !== 'offline' && !here(runner.status()).held, 'not offline, and not held: the network is fine, and "Ask me first" is for offline edits');
P.setActiveProjectId(pid);
expect(P.getFileText(fid) === 'typed while the server was busy\n', 'nothing here is lost');

busy = false;
await runner.syncNow();
await flush();
const after = here(P.syncSummary());
expect(after.state === 'synced' && after.reason === null && here(runner.status()).reason === null, `recovered: the next round goes through, and the reason goes with the trouble (${after.state})`);
const b = makeDevice(server, { name: 'R' });
await b.engine.syncAll();
expect(projectState(b.work, pid).files[0].text === 'typed while the server was busy\n'
  && projectState(b.work, other.projectId).files[0].text === 'new\n', 'and everything done meanwhile is in the cloud: the edit and the new project');
await P.stopSync();
await P2.stopSync();

// ── an account at its limit (plan v6 c10) ───────────────────────────────────
// The page's own Persist against a server that takes one project: the second
// is refused, the summary says why, the cloud says what to delete, and the
// notifications keep it, once.
{
  const small = createMemoryServer({ hash: syncHash, quota: { projects: 1 } });
  const { P: Q } = openTab(makeBrowserStorage(), { document: doc, navigator: { onLine: true } });
  Q.setAccount('u_dean');
  Q.createProjectWithFiles('One', [{ name: 'a.bel', text: 'a\n' }]);
  const two = Q.createProjectWithFiles('Two', [{ name: 'b.bel', text: 'b\n' }]);
  const r = Q.startSync({ transport: small.transport('u_dean'), locks: lockManager() });
  await flush();
  await r.syncNow();
  const q = here(Q.syncSummary());
  expect(small.projectIds().length === 1 && q.state === 'error' && q.reason === 'refused-quota-projects',
    `a project past the limit is refused, and the summary says why (${JSON.stringify(q)})`);
  expect(/Delete projects you no longer need/.test(cloudWords(q).detail), 'the cloud says what to delete');
  const emitted = [];
  const had = globalThis.Notifications;
  globalThis.Notifications = { emit: (n) => emitted.push(n) };
  noteRefusal(q);
  globalThis.Notifications = had;
  expect(emitted.length === 1 && emitted[0].dedupeKey === 'sync.refused-quota-projects' && /Delete projects you no longer need/.test(emitted[0].body),
    'and the notification says it too, kept to one by its key');
  Q.setActiveProjectId(two.projectId);
  expect(Q.getFileText(two.files[0].id) === 'b\n', 'nothing here is lost');
  await Q.stopSync();
}

// ── a server that cannot be reached is still offline ────────────────────────
{
  const { P: Q } = openTab(makeBrowserStorage(), { document: doc, navigator: { onLine: true } });
  Q.setAccount('u_dean');
  const r = Q.startSync({ transport: createHttpTransport({ fetch: () => Promise.reject(new TypeError('Failed to fetch')) }), locks: lockManager() });
  await flush();
  await r.syncNow();
  const q = here(Q.syncSummary());
  expect(q.state === 'offline' && q.reason === null, `a request that never came back reads as offline, as before (${q.state})`);
  await Q.stopSync();
}

console.log(`OK sync refused (${n} checks: the words for each reason, a busy server read as couldn't sync and never held, nothing lost, everything pushed after, unreachable still offline)`);

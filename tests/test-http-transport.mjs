// The sync transport's time limit (js/persist/sync/http-transport.mjs). Rounds
// never overlap, so a request that never answers held its round open and every
// round after it: sync stopped, silently, until a reload. A call that runs out
// is abandoned, the round fails as offline, and the runner tries again.
import { createHttpTransport, TIMEOUT_MS, TEXTS_TIMEOUT_MS } from '../js/persist/sync/http-transport.mjs';
import { createMemoryServer } from '../js/persist/sync/memory-server.mjs';
import { createSyncRunner } from '../js/persist/sync/runner.mjs';
import { makeDevice, syncHash, fileId } from './_sync-env.mjs';
import { flush, clock, lockManager } from './_runner-env.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const answer = (result, status = 200) => ({ status, json: async () => ({ result }) });

/** A fetch whose answers the test hands out: stalled until told, and aborted when its signal says. */
function stallingFetch() {
  const calls = [];
  const fetch = (url, init) => new Promise((resolve, reject) => {
    const call = { url, init, resolve, aborted: false };
    calls.push(call);
    init.signal.addEventListener('abort', () => { call.aborted = true; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
  });
  return { fetch, calls };
}

// ── a commit sent as the page goes: keepalive, and only it ──────────────────
{
  const c = clock();
  const { fetch, calls } = stallingFetch();
  const t = createHttpTransport({ base: 'http://x/api/sync', fetch, timers: c.timers });
  t.commitOnHide('p1', { id: 'c1', base: 1, manifest: {}, texts: {} });
  t.commit('p1', { id: 'c2', base: 1, manifest: {} });
  t.heads();
  await flush();
  expect(calls[0].url === 'http://x/api/sync/commit' && calls[0].init.keepalive === true && JSON.parse(calls[0].init.body).args[1].id === 'c1',
    'a commit sent as the page goes out of sight asks the browser to finish it after the page is gone (keepalive)');
  expect(calls[1].init.keepalive === false && calls[2].init.keepalive === false, 'and no other request does: the browser lets them carry only 64 KB between them');
  for (const call of calls) call.resolve(answer(null));
  await flush();
}

// ── a call that is answered: the result, and no timer left behind ───────────
{
  const c = clock();
  const { fetch, calls } = stallingFetch();
  const t = createHttpTransport({ base: 'http://x/api/sync', fetch, timers: c.timers });
  const got = t.heads();
  await flush();
  expect(calls.length === 1 && calls[0].url === 'http://x/api/sync/heads' && calls[0].init.signal instanceof AbortSignal, 'each call can be abandoned: it carries a signal');
  calls[0].resolve(answer([{ id: 'p1', version: 1 }]));
  expect((await got)[0].id === 'p1', 'an answer in time is the result');
  await c.advance(TEXTS_TIMEOUT_MS * 2);
  expect(calls[0].aborted === false, 'and its limit is cleared: nothing is aborted afterwards');
}

// ── a call that is never answered is abandoned at its limit ──────────────────
{
  const c = clock();
  const { fetch, calls } = stallingFetch();
  const t = createHttpTransport({ fetch, timers: c.timers });
  let err = null;
  let done = false;
  t.commit('p1', { id: 'c1' }).then(() => { done = true; }, (e) => { err = e; done = true; });
  await c.advance(TIMEOUT_MS - 1);
  expect(!done && !calls[0].aborted, 'a slow answer is waited for, up to the limit');
  await c.advance(1);
  expect(done && calls[0].aborted && err && err.timeout === true && /did not answer commit in time/.test(err.message),
    `at the limit the request is aborted and the call throws (${err && err.message})`);

  let slow = null;
  let slowDone = false;
  t.putBlobs('p1', {}).then(() => { slowDone = true; }, (e) => { slow = e; slowDone = true; });
  await c.advance(TIMEOUT_MS);
  expect(!slowDone, 'a call carrying texts gets more room: a slow link is not a dead one');
  await c.advance(TEXTS_TIMEOUT_MS - TIMEOUT_MS);
  expect(slowDone && slow && slow.timeout === true, 'and a limit of its own');
}

// ── headers arrive, the body never does: the same silence ───────────────────
{
  const c = clock();
  const { fetch, calls } = stallingFetch();
  const t = createHttpTransport({ fetch, timers: c.timers });
  let err = null;
  t.heads().catch((e) => { err = e; });
  await flush();
  const signal = calls[0].init.signal;
  let reading = false;
  calls[0].resolve({
    status: 200,
    json: () => new Promise((_, reject) => {
      reading = true;
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }),
  });
  await flush();
  expect(reading && err === null, 'the answer has begun, and its body is still to come');
  await c.advance(TIMEOUT_MS);
  expect(err && err.timeout === true, 'the limit covers reading the answer too');
}

// ── other failures are told as what they are ────────────────────────────────
{
  const t = createHttpTransport({ fetch: async () => answer(null, 503) });
  const err = await t.heads().then(() => null, (e) => e);
  expect(err && err.status === 503 && !err.timeout, 'a status that is not 200 is not a timeout');
  const down = createHttpTransport({ fetch: async () => { throw new TypeError('Failed to fetch'); } });
  const e2 = await down.heads().then(() => null, (e) => e);
  expect(e2 instanceof TypeError && !e2.timeout, 'nor is a request the network refused');

  // A 401: the session may have ended elsewhere (Sign out there, the account
  // deleted). The page hears it and asks who is signed in (account.mjs).
  let heard = 0;
  const refused = createHttpTransport({ fetch: async () => answer(null, 401), onSignedOut: () => { heard += 1; } });
  const e3 = await refused.heads().then(() => null, (e) => e);
  expect(e3 && e3.status === 401 && heard === 1, 'a 401 still fails the call, and tells the page once');
  const busy = createHttpTransport({ fetch: async () => answer(null, 503), onSignedOut: () => { heard += 1; } });
  await busy.heads().catch(() => null);
  const throwing = createHttpTransport({ fetch: async () => answer(null, 401), onSignedOut: () => { throw new Error('a listener broke'); } });
  const e4 = await throwing.heads().then(() => null, (e) => e);
  expect(heard === 1 && e4 && e4.status === 401, 'no other status does, and a listener that throws changes nothing about the call');
}

// ── the round it belonged to ends, and sync goes on ─────────────────────────
{
  const c = clock();
  const server = createMemoryServer({ hash: syncHash });
  const real = server.transport('u_dean');
  let stall = true;
  // The server's own transport behind the HTTP one: its first request never answers.
  const fetch = (url, init) => {
    const method = String(url).split('/').pop();
    if (stall) {
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    }
    return real[method](...JSON.parse(init.body).args).then((result) => answer(result));
  };
  const transport = createHttpTransport({ fetch, timers: c.timers });
  const dev = makeDevice(server, { name: 'T', transport });
  const pid = dev.work.projectId();
  dev.work.setText(fileId(dev.work, pid, 'main.bel'), 'rec nat : type.\n', pid);
  const runner = createSyncRunner({ engine: dev.engine, store: dev.store, locks: lockManager(), timers: c.timers, now: c.now });
  runner.start();
  await flush();
  expect(runner.status().state === 'syncing', 'a round begins, and its first request stalls');
  await c.advance(TIMEOUT_MS - 1);
  expect(runner.status().state === 'syncing' && server.projectIds().length === 0, 'it waits');
  await c.advance(1);
  await flush();
  expect(runner.status().state === 'offline', `at the limit the round ends as offline, not held open for good (${runner.status().state})`);
  stall = false;
  await c.advance(5000);
  await flush();
  for (let i = 0; i < 20 && runner.status().state !== 'idle'; i++) await flush();
  expect(runner.status().state === 'idle' && server.projectIds().includes(pid), `and the next try, after the backoff, gets through (${runner.status().state})`);
  await runner.stop();
}

console.log(`OK http transport (${n} checks: every call has a limit, texts a longer one, the body counts, a stalled round ends and sync goes on)`);

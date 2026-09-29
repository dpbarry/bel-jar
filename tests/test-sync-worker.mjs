// The Worker's sync API, held to the reference server's rules (server/,
// docs/PERSIST.md §5.7). It runs as it will run: `wrangler dev` with
// server/wrangler.jsonc, a fresh local D1 (the real migrations) and R2, over
// HTTP. Then: the Worker's own gate (accounts, same-site, content type),
// commits racing over one base, and two devices' engines syncing through it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { createHttpTransport } from '../js/persist/sync/http-transport.mjs';
import { createSyncStore } from '../server/sync-store.mjs';
import worker from '../server/worker.mjs';
import { serverRules } from './_sync-protocol-suite.mjs';
import { makeDevice, sha256Now, projectState, addFile, fileId } from './_sync-env.mjs';
import { startWorker, testConfig, ROOT as root } from './_worker-env.mjs';

let n = 0;
let dev = null;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  finish(1);
}

function finish(code) {
  if (dev) {
    if (code) console.error(dev.logs().split('\n').slice(-20).join('\n'));
    dev.stop();
  }
  process.exit(code);
}

// ── start it ─────────────────────────────────────────────────────────────────
try {
  dev = await startWorker();
} catch (err) {
  console.error(String(err && err.message || err));
}
expect(!!dev, 'wrangler dev serves the Worker');
const URL_ = dev.url;
const logs = { match: (re) => dev.logs().match(re) };

const post = (method, body, headers = {}) => fetch(`${URL_}/api/sync/${method}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

const transport = (account) => createHttpTransport({ base: `${URL_}/api/sync`, headers: { 'x-beljar-account': account } });

// ── the reference server's rules, over HTTP, on D1 and R2 ────────────────────
await serverRules({ dean: transport('u_dean'), other: transport('u_other') }, expect);

// ── the Worker's own gate ────────────────────────────────────────────────────
expect((await post('heads', { args: [] })).status === 401, 'no account: 401, nothing answered');
expect((await post('heads', { args: [] }, { 'x-beljar-account': 'u dean' })).status === 401, 'a malformed account is no account');
const refused = await transport('u dean').heads().then(() => null, (err) => err);
expect(refused && refused.status === 401, 'the transport turns a refusal into no answer (the engine waits), never into a result');
expect((await post('heads', { args: [] }, { 'x-beljar-account': 'u_dean', origin: 'https://evil.example' })).status === 403,
  'a request from another site is refused');
expect((await post('heads', { args: [] }, { 'x-beljar-account': 'u_dean', origin: URL_ })).status === 200, 'its own origin is fine');
const plain = await fetch(`${URL_}/api/sync/heads`, { method: 'POST', headers: { 'content-type': 'text/plain', 'x-beljar-account': 'u_dean' }, body: '{"args":[]}' });
expect(plain.status === 415, 'only JSON (a form post from elsewhere cannot even be sent without a preflight)');
expect((await fetch(`${URL_}/api/sync/heads`)).status === 405, 'only POST');
expect((await post('dropTables', { args: [] }, { 'x-beljar-account': 'u_dean' })).status === 404, 'only the protocol\'s methods');
expect((await post('heads', 'not json', { 'x-beljar-account': 'u_dean' })).status === 400, 'a body that is not JSON is refused');

// ── commits racing over one base ─────────────────────────────────────────────
{
  const t = transport('u_race');
  const text = 'rec nat : type.\n';
  await t.putBlobs('p_race', { [sha256Now(text)]: text });
  const manifest = (name) => ({ v: 1, name, createdAt: 1, files: [{ id: 'f1', path: 'main.bel', hash: sha256Now(text) }], folders: [], suites: {} });
  const first = await t.commit('p_race', { id: 'c0', base: 0, manifest: manifest('start') });
  expect(first.ok && first.version === 1, 'a project starts');
  const racers = await Promise.all(Array.from({ length: 8 }, (_, i) => t.commit('p_race', { id: 'c' + (i + 1), base: 1, manifest: manifest('racer ' + i) })));
  const won = racers.filter((r) => r.ok);
  expect(won.length === 1 && won[0].version === 2, `eight commits over one base: exactly one lands (${won.length})`);
  expect(racers.filter((r) => !r.ok).every((r) => r.head && r.head.version === 2), 'the rest are refused with the new head');
  const same = await Promise.all(Array.from({ length: 6 }, () => t.commit('p_race', { id: 'c-retry', base: 2, manifest: manifest('retried') })));
  expect(same.every((r) => r.ok && r.version === 3), 'one commit sent six times at once makes one version, and every answer names it');
  const head = await t.head('p_race');
  expect(head.version === 3 && head.manifest.name === 'retried' && head.commit === 'c-retry', 'the head is that version');
  const settings = await Promise.all(Array.from({ length: 5 }, (_, i) => t.commitSettings({ id: 's' + i, base: 0, values: { theme: 'light' } })));
  expect(settings.filter((r) => r.ok).length === 1, 'settings race the same way');
}

// ── two devices, their engines, through the Worker ───────────────────────────
{
  const a = makeDevice(null, { name: 'A', account: 'u_sync', transport: transport('u_sync') });
  const b = makeDevice(null, { name: 'B', account: 'u_sync', transport: transport('u_sync') });
  const pid = a.work.projectId();
  const main = fileId(a.work, pid, 'main.bel');
  a.work.setText(main, 'one\ntwo\nthree\n', pid);
  addFile(a.work, pid, 'proofs/λ.bel', 'λ proof\n');
  let res = await a.engine.syncAll();
  expect(res.projects[pid].status === 'pushed', 'a project goes up through the Worker');
  res = await b.engine.syncAll();
  expect(res.projects[pid].status === 'downloaded' && JSON.stringify(projectState(b.work, pid)) === JSON.stringify(projectState(a.work, pid)),
    'and comes down on another device, whole, Unicode included');

  a.work.setText(main, 'ONE\ntwo\nthree\n', pid);
  b.work.setText(main, 'one\ntwo\nTHREE\n', pid);
  await a.engine.syncAll();
  await b.engine.syncAll();
  await a.engine.syncAll();
  expect(a.work.getText(main, pid) === 'ONE\ntwo\nTHREE\n' && b.work.getText(main, pid) === 'ONE\ntwo\nTHREE\n', 'edits on both devices merge');

  a.work.setText(main, 'ONE by A\ntwo\nTHREE\n', pid);
  b.work.setText(main, 'ONE by B\ntwo\nTHREE\n', pid);
  await a.engine.syncAll();
  await b.engine.syncAll();
  const rec = b.work.readConflict(main, pid);
  expect(rec && rec.source === 'device' && rec.mine === 'ONE by B\ntwo\nTHREE\n', 'the same line on both: a conflict, both sides kept');

  a.settings.set('keymapStyle', 'vim');
  await a.engine.syncAll();
  await b.engine.syncAll();
  expect(b.settings.get('keymapStyle') === 'vim', 'settings follow the account');

  a.work.createProject('Spare');
  await a.engine.syncAll();
  await b.engine.syncAll();
  const spare = a.work.allProjects().find((p) => p.name === 'Spare');
  a.work.deleteProject(spare.id);
  res = await a.engine.syncAll();
  expect(res.projects[spare.id].status === 'deleted', 'a delete reaches the Worker');
  res = await b.engine.syncAll();
  expect(res.projects[spare.id].status === 'forgot' && !b.work.getProject(spare.id), 'and the other device lets the project go');

  // The answer to a commit is lost: the next round settles it by replay, from D1.
  let lose = 1;
  const real = transport('u_sync');
  const lossy = Object.assign({}, real, {
    commit: async (...args) => {
      const r = await real.commit(...args);
      if (lose > 0) { lose -= 1; throw new Error('the answer was lost'); }
      return r;
    },
  });
  const c = makeDevice(null, { name: 'C', account: 'u_sync', transport: lossy });
  await c.engine.syncAll().catch(() => null);
  const cpid = c.work.allProjects().find((p) => p.id === pid) ? pid : null;
  expect(cpid, 'a third device joins');
  c.work.setText(main, c.work.getText(main, pid) + 'from C\n', pid);
  let failed = null;
  try { await c.engine.syncAll(); } catch (err) { failed = err; }
  expect(failed && failed.offline, 'its commit lands, and the answer is lost on the way back');
  res = await c.engine.syncAll();
  expect(!c.work.readConflict(main, pid) && (await real.head(pid)).manifest.files.length === 2,
    'the next round settles it from the Worker\'s own record: no conflict with itself');
}

const served = (logs.match(/POST \/api\/sync\//g) || []).length;
console.log(`  (the Worker logged ${served} sync requests)`);

// ── the transaction itself, raced for certain ────────────────────────────────
// wrangler dev happened to run each request's check and write without another
// request between them, so the racing above never reached the guard inside the
// transaction; on Cloudflare, requests can truly run at once against D1. Here
// the store runs against a real local D1, and every racer is held at the door
// of its transaction until all of them have passed the check before it.
{
  const persist2 = fs.mkdtempSync(path.join(os.tmpdir(), 'beljar-race-'));
  const proxy = await getPlatformProxy({ configPath: testConfig(persist2), persist: { path: persist2 } });
  try {
    const db = proxy.env.DB;
    const sql = fs.readFileSync(path.join(root, 'server', 'migrations', '0001_sync.sql'), 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    for (const stmt of sql.split(';')) if (stmt.trim()) await db.prepare(stmt).run();
    const texts = proxy.env.TEXTS;
    // Every batch waits until \`count\` batches are waiting, then they all go.
    const held = (count) => {
      const waiting = [];
      return new Proxy(db, {
        get(target, key) {
          if (key === 'batch') {
            return async (stmts) => {
              await new Promise((go) => { waiting.push(go); if (waiting.length === count) waiting.forEach((g) => g()); });
              return target.batch(stmts);
            };
          }
          const v = target[key];
          return typeof v === 'function' ? v.bind(target) : v;
        },
      });
    };
    const plain = createSyncStore({ db, texts }).transport('u_race2');
    // No files: the race is over the head, and each query through the proxy costs ~50ms.
    const manifest = (name) => ({ v: 1, name, createdAt: 1, files: [], folders: [], suites: {} });
    expect((await plain.commit('p_r', { id: 'r0', base: 0, manifest: manifest('start') })).version === 1, 'a project starts on the proxied D1');

    const racing = createSyncStore({ db: held(3), texts }).transport('u_race2');
    const results = await Promise.all(Array.from({ length: 3 }, (_, i) => racing.commit('p_r', { id: 'r' + (i + 1), base: 1, manifest: manifest('racer ' + i) })));
    expect(results.filter((r) => r.ok).length === 1, `three commits past the check at once: exactly one transaction moves the head (${results.filter((r) => r.ok).length})`);
    const versions = await db.prepare('SELECT version, base FROM versions WHERE project = ? ORDER BY version').bind('p_r').all();
    expect(JSON.stringify(versions.results.map((v) => [v.version, v.base])) === '[[1,0],[2,1]]', 'and history is still a line: one version over each base');
    const head = await plain.head('p_r');
    expect(head.version === 2 && results.find((r) => r.ok) && head.commit === 'r' + (results.findIndex((r) => r.ok) + 1),
      'the head is the one that moved');

    const deletes = createSyncStore({ db: held(2), texts }).transport('u_race2');
    const removed = await Promise.all(Array.from({ length: 2 }, (_, i) => deletes.remove('p_r', { id: 'd' + i, base: 2 })));
    expect(removed.filter((r) => r.ok).length === 1 && (await plain.head('p_r')).deleted, 'deletes race the same way: one deletion');

    await plain.commitSettings({ id: 'st0', base: 0, values: { theme: 'light' } });
    const sets = createSyncStore({ db: held(2), texts }).transport('u_race2');
    const settled = await Promise.all(Array.from({ length: 2 }, (_, i) => sets.commitSettings({ id: 'st' + (i + 1), base: 1, values: { theme: 'dark', n: i } })));
    expect(settled.filter((r) => r.ok).length === 1, 'and settings: one version over each base');
  } finally {
    await proxy.dispose();
    try { fs.rmSync(persist2, { recursive: true, force: true }); } catch (_) { /* a file may be held briefly */ }
  }
}

// ── deployed without the local dev flag: nobody is anybody ───────────────────
// The Worker's own code with an environment as a deploy would have it (no
// DEV_ACCOUNT_HEADER), called directly: the store is never reached.
{
  const untouchable = { prepare() { throw new Error('the store was reached'); }, batch() { throw new Error('the store was reached'); } };
  const deployed = { DB: untouchable, TEXTS: untouchable };
  const ask = (method, args) => worker.fetch(new Request(`https://beljar.example/api/sync/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-beljar-account': 'u_dean' },
    body: JSON.stringify({ args }),
  }), deployed);
  expect((await ask('heads', [])).status === 401,
    'without the dev flag an account header is ignored: until sign-in exists, a deployed Worker answers nobody');
  expect((await ask('commit', ['p1', { id: 'x', base: 4, manifest: null }])).status === 401, 'and writes nothing for anybody');
  expect((await worker.fetch(new Request('https://beljar.example/api/other'), deployed)).status === 404, 'other /api paths are not the site');
}
console.log(`OK sync worker (${n} checks: the reference server's rules on D1 and R2 over HTTP, the gate, racing commits, three devices' engines)`);
finish(0);

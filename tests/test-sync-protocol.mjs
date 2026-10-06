// What sync says to the server, and what the server must do with it
// (js/persist/sync/protocol.mjs, js/persist/sync/memory-server.mjs,
// docs/PERSIST.md §5). The memory server is the reference a real server is
// held to, so its rules are pinned here one by one.
import {
  canonicalJson, sha256, isHash, emptyManifest, normalizeManifest, manifestOf, sameManifest, versionsLimit, VERSIONS_PAGE, VERSIONS_MAX,
} from '../js/persist/sync/protocol.mjs';
import fs from 'node:fs';
import { createMemoryServer } from '../js/persist/sync/memory-server.mjs';
import { sha256Now } from './_sync-env.mjs';
import { serverRules, quotaRules } from './_sync-protocol-suite.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── canonical JSON, hashes ───────────────────────────────────────────────────
expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] }) === '{"a":[2,{"c":4,"d":3}],"b":1}', 'keys are sorted at every depth; arrays keep their order');
expect(canonicalJson({ a: undefined, b: null }) === '{"b":null}', 'undefined is absent, as in JSON');
expect((await sha256('λ proof\n')) === sha256Now('λ proof\n'), 'the browser hash is SHA-256 of the UTF-8 bytes');
expect((await sha256('')) === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'the empty text has the well-known hash');
expect(isHash(sha256Now('x')) && !isHash('ABC') && !isHash(sha256Now('x').toUpperCase()), 'a hash is 64 lowercase hex digits');

// ── manifests ────────────────────────────────────────────────────────────────
const h = (t) => sha256Now(t);
const good = { v: 1, name: 'P', createdAt: 5, files: [{ id: 'f1', path: 'a.bel', hash: h('a') }], folders: ['z', 'a'], suites: { '': ['x.cfg'], lib: [] } };
const m = normalizeManifest(good);
expect(m && JSON.stringify(m.folders) === '["a","z"]', 'folders are sorted: their order means nothing');
expect(m && !('lib' in m.suites), 'an empty suite list is no entry');
expect(normalizeManifest({ ...good, v: 2 }) === null, 'another manifest version is refused, not guessed at');
expect(normalizeManifest({ ...good, files: [...good.files, { id: 'f1', path: 'b.bel', hash: h('b') }] }) === null, 'two entries with one id: refused whole');
expect(normalizeManifest({ ...good, files: [...good.files, { id: 'f2', path: 'a.bel', hash: h('b') }] }) === null, 'two files at one path: refused whole');
expect(normalizeManifest({ ...good, files: [{ id: 'f1', path: 'a.bel', hash: 'nope' }] }) === null, 'a file without a real hash: refused whole');
expect(normalizeManifest(null) === null && normalizeManifest({}) === null, 'not a manifest at all: refused');
const local = manifestOf({ name: 'P', createdAt: 5 }, { files: [{ id: 'f1', name: 'a.bel' }], folders: ['z', 'a'], suites: { '': ['x.cfg'] } }, { f1: h('a') });
expect(sameManifest(local, m), 'a project as it stands locally hashes to the same manifest as the one sent');
expect(!sameManifest(local, { ...m, name: 'Q' }), 'a different name is a different manifest');
expect(sameManifest(emptyManifest(), normalizeManifest(emptyManifest())), 'the empty manifest is a manifest');

// ── the server's rules (shared with the Worker: tests/_sync-protocol-suite.mjs) ──
const server = createMemoryServer({ hash: (t) => Promise.resolve(sha256Now(t)) });
await serverRules({ dean: server.transport('u_dean'), other: server.transport('u_other') }, expect);
const hist = server.history('p1');
expect(hist.owner === 'u_dean' && hist.versions.map((v) => `${v.version}/${v.base}`).join() === '1/0,2/1,3/2,4/3', 'history is a line');

// What an account may hold, on a server made with small limits (plan v6 c10).
{
  const small = createMemoryServer({ hash: (t) => Promise.resolve(sha256Now(t)), quota: { projects: 2, textBytes: 20 } });
  await quotaRules({ dean: small.transport('u_dean'), other: small.transport('u_other') }, expect);
  const u = small.usage('u_dean');
  expect(u.projects === 2 && u.textBytes === 10, `and the count is what the account holds: two projects, ten bytes (${JSON.stringify(u)})`);
}

// A history page is bounded, whatever a client asks (Version history, plan v6 c6),
// and both servers ask the one rule for it.
expect(VERSIONS_PAGE === 50 && VERSIONS_MAX === 200 && versionsLimit(undefined) === 50 && versionsLimit(-3) === 50 && versionsLimit(1.5) === 50
  && versionsLimit(7) === 7 && versionsLimit(1000) === 200, 'a page of history is 50 by default, never more than 200');
for (const f of ['js/persist/sync/memory-server.mjs', 'server/sync-store.mjs']) {
  const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const at = src.indexOf('async versions(');
  expect(at > 0 && src.slice(at, at + 1200).includes('versionsLimit(o && o.limit)'), `${f} bounds its pages by that rule`);
}

console.log(`OK sync protocol (${n} checks: canonical JSON, hashes, manifests, and every server rule)`);

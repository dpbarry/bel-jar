// A load that fails must leave nothing behind for the next one (beluga_web.ml,
// load_from_string), on every build BelJar ships.
//
// A `--query` is queued when reconstruction reaches it and is run, then cleared,
// only by Logic.runLogic at the very end of a load that succeeded. A file that
// failed after its query left the query queued, and the NEXT check on the same
// instance ran it against the new file's store: a one-line signature was refused
// with DynArray.Invalid_arg (the stale query names a cid the new store does not
// have), and a file that did have the cid had the old query answered as well as
// its own. Every check builds a fresh session, but the queue is global; the
// worker keeps one instance (js/beluga/beluga-client.js), so a user's red check,
// or a rejected Orca or case-fill candidate, broke the checks after it. Found
// 2026-10-17 from the primer's book-b.bel, whose §19.5 query sits before a
// failing §22.
//
//   1. the failing file does reach its query: rejected by reconstruction, after it
//   2. after it, a small file on the same instance is accepted
//   3. after it, a file with its own query has that query answered once, not twice
//   4. the same through loadFromString, which shares the load
import { loadBelugaRuntime } from './_beluga-runtime.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const QUEUED_THEN_FAILS = `LF a : type = | ca : a;
LF b : type = | cb : b;
LF c : type = | cc : c;
--query 1 * X : c.
LF p : a -> type = | pc : p cb;
`;
const WITH_QUERY = `LF a : type = | ca : a;
LF b : type = | cb : b;
LF c : type = | cc : c;
--query 1 * X : c.
`;
const SMALL = 'LF t : type = | k : t;\n';

const ok = (r) => r.ok === true || r.ok === 1 || String(r.ok) === 'true';
const out = (r) => String(r.output || '');
const answers = (r) => (out(r).match(/X = cc/g) || []).length;
const brief = (r) => out(r).replace(/\s+/g, ' ').slice(0, 90);

for (const build of ['stable', 'wasm', 'wasm-cps']) {
  const fresh = async () => (await loadBelugaRuntime(build)).Beluga;

  // 1. the reproduction means something: on a fresh instance the query file answers
  //    once, and the failing file fails in reconstruction, past the query
  const control = (await fresh()).checkFromString(WITH_QUERY);
  expect(ok(control) && answers(control) === 1, `${build}: the query file alone is accepted and answers once (${brief(control)})`);
  const B = await fresh();
  const failed = B.checkFromString(QUEUED_THEN_FAILS);
  expect(!ok(failed) && /line 5/.test(out(failed)) && /Ill-typed/.test(out(failed)),
    `${build}: the failing file is refused at line 5, after its query (${brief(failed)})`);

  // 2. nothing of it reaches the next check
  const small = B.checkFromString(SMALL);
  expect(ok(small), `${build}: after a file failed past its query, a one-line signature is accepted (${brief(small)})`);

  // 3. nor a file that has a cid for the stale query to land on
  const C = await fresh();
  C.checkFromString(QUEUED_THEN_FAILS);
  const again = C.checkFromString(WITH_QUERY);
  expect(ok(again) && answers(again) === 1, `${build}: after it, a file's own query is answered once, not ${answers(again)} times`);

  // 4. loadFromString runs the same load
  const D = await fresh();
  const loadFailed = D.loadFromString(QUEUED_THEN_FAILS);
  expect(!ok(loadFailed), `${build}: loadFromString refuses the failing file`);
  const loadSmall = D.loadFromString(SMALL);
  expect(ok(loadSmall), `${build}: and then loads a one-line signature (${brief(loadSmall)})`);
}

console.log(`test-beluga-stale-query: ${n} checks passed`);

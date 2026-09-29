// Ids and keys (js/persist/keys.mjs, docs/PERSIST.md §3.4).
//
// Ids become server keys and URL segments, and their time order is a file's
// creation order (a folder run without a cfg runs files in registry order, and
// a merge keeps that order by id). So: 128 bits, a fixed URL-safe shape, unique,
// and sorted in the order they were made, even inside one millisecond.
import { newId, idTime, parseKey } from '../js/persist/keys.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const SHAPE = /^f_[0-9a-hjkmnp-tv-z]{26}$/;
const before = Date.now();
const ids = Array.from({ length: 2000 }, () => newId('f'));
const after = Date.now();

expect(ids.every((id) => SHAPE.test(id)), `every id is f_ + 26 lowercase Crockford base32 characters (${ids[0]})`);
expect(new Set(ids).size === ids.length, '2000 ids, no repeats');
expect(ids.slice().sort().join() === ids.join(), '2000 ids made in a tight loop (many per millisecond) sort in the order they were made');
expect(ids.every((id) => idTime(id) >= before && idTime(id) <= after + 1), 'each carries the millisecond it was made');
expect(Number.isNaN(idTime('p_short')) && Number.isNaN(idTime('workspace://main.bel')), 'anything else has no time');
expect(newId('p', (id) => id.endsWith('0') || id.endsWith('1')).match(/[^01]$/) !== null, 'a taken id is never returned');

expect(JSON.stringify(parseKey('beljar/p/p_x/f/f_y')) === '{"pid":"p_x","kind":"f","fid":"f_y"}', 'a file key names its project and file');
expect(JSON.stringify(parseKey('beljar/p/p_x/meta')) === '{"pid":"p_x","kind":"meta"}', 'a project key names its project');
expect(parseKey('beljar/p/p_x/conflict/f_y').kind === 'conflict', 'conflict records parse');
for (const bad of ['beljar/p/p_x/f', 'beljar/p/p_x/meta/extra', 'beljar/p//tree', 'beljar/settings', 'beljar/projects', '', null]) {
  expect(parseKey(bad) === null, `"${bad}" is not a project key`);
}

console.log(`OK ids (${n} checks: 128-bit shape, unique, time-ordered within a millisecond, parseKey)`);

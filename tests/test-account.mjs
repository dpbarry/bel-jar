// The account's decisions (js/account/account.mjs): what a sign-in means for
// this browser, which projects the claim flow offers, when a sync round makes
// removing projects safe, and how a project is described.
import { accountStep, claimCandidates, roundIsSafe, projectLine } from '../js/account/account.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const dean = { id: 'u_dean', handle: 'dean' };
expect(accountStep(null, null) === 'signed-out', 'nobody signed in, nobody known: signed out');
expect(accountStep(null, 'u_dean') === 'ended', 'the server knows nobody but this browser remembers someone: the session ended elsewhere');
expect(accountStep(dean, null) === 'first', 'a first sign-in on this browser');
expect(accountStep(dean, 'u_dean') === 'same', 'the same account as before');
expect(accountStep(dean, 'u_other') === 'switched', 'another account than the one this browser knew');

const projects = [
  { id: 'p1', name: 'Mine', owner: null },
  { id: 'p2', name: 'Empty', owner: null },
  { id: 'p3', name: 'Already theirs', owner: 'u_dean' },
];
const stats = { p1: { files: 3, size: 4300, editedAt: 5 }, p2: { files: 1, size: 0, editedAt: 5 }, p3: { files: 1, size: 9, editedAt: 5 } };
const offered = claimCandidates(projects, (id) => stats[id]);
expect(offered.length === 1 && offered[0].id === 'p1' && offered[0].files === 3,
  'only this device\'s own projects with work in them are offered (not an empty one, not one that is already an account\'s)');

expect(roundIsSafe({ projects: { a: { status: 'clean' }, b: { status: 'pushed' } } }), 'every project clean or pushed: safe to remove');
expect(!roundIsSafe({ projects: { a: { status: 'clean' }, b: { status: 'error' } } }), 'one project that could not sync: not safe');
expect(!roundIsSafe({ projects: { a: { status: 'busy' } } }), 'a project still moving: not safe');
expect(!roundIsSafe(null), 'no round (offline, or another tab syncs): not safe');
expect(roundIsSafe({ projects: {} }), 'no projects at all: nothing to lose');

const now = Date.UTC(2026, 8, 28, 12);
expect(projectLine({ files: 3, size: 4300, editedAt: now - 3600e3 }, now) === '3 files · 4.2 KB · edited today', 'a project in one line');
expect(projectLine({ files: 1, size: 20, editedAt: now - 86400e3 * 1.5 }, now) === '1 file · 20 characters · edited yesterday', 'small, and yesterday');
expect(/^2 files · 12 KB · edited 5 days ago$/.test(projectLine({ files: 2, size: 12288, editedAt: now - 86400e3 * 5 }, now)), 'days ago');
expect(!/—/.test(projectLine({ files: 2, size: 1, editedAt: 0 }, now)), 'no em dash, in the house voice');

console.log(`OK account (${n} checks: sign-in steps, what the claim flow offers, when removal is safe, how a project reads)`);

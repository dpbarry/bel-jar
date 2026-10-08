// The account's decisions (js/account/account.mjs): what a sign-in means for
// this browser, which projects it adopts, when a sync round makes removing
// projects safe, and how a failed sign-in is explained.
import fs from 'node:fs';
import { accountStep, adoptable, roundIsSafe, signInFailure, reach, unreachableWords, resumeTarget, accountState, accountMenu } from '../js/account/account.mjs';

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
const sizes = { p1: 4300, p2: 0, p3: 9 };
expect(JSON.stringify(adoptable(projects, (id) => sizes[id])) === '["p1"]',
  'signing in adopts every project here that belongs to no account and has something in it, and asks nothing');
expect(adoptable(projects, (id) => sizes[id]).indexOf('p2') < 0,
  'an empty one waits for its first character: every browser starts with one, and the account would collect them');
expect(adoptable([{ id: 'x', owner: 'u_other' }], () => 5).length === 0, 'another account\'s project is never adopted');

// ── the server answered, or it did not ──────────────────────────────────────
expect(reach({ user: null }, false) === 'signed' && reach({ user: { id: 'u' } }, true) === 'signed', 'an answer, signed in or not, is an answer anywhere');
expect(reach({ none: true }, false) === 'none', 'a local static server has no API: the account stays out of sight');
expect(reach({ error: 'network' }, false) === 'none', 'and locally, a failure is no server either');
expect(reach({ error: 'network' }, true) === 'unreachable' && reach({ none: true }, true) === 'unreachable',
  'on a deployed host there is always a server: a failure, even a 404, is shown and explained, never a vanished button');
const reasons = ['network', 'not-json', 'status-404', 'status-503', 'status-429', null];
const said = reasons.map((r) => unreachableWords(r));
expect(new Set(said.slice(0, 4)).size === 4 && said.every((w) => w && !/—/.test(w)), 'every way of not reaching it reads differently, no em dash');
expect(/extension/.test(unreachableWords('network')) && /503/.test(unreachableWords('status-503')), 'a blocked request names the likely cause; a status names its number');

expect(roundIsSafe({ projects: { a: { status: 'clean' }, b: { status: 'pushed' } } }), 'every project clean or pushed: safe to remove');
expect(!roundIsSafe({ projects: { a: { status: 'clean' }, b: { status: 'error' } } }), 'one project that could not sync: not safe');
expect(!roundIsSafe({ projects: { a: { status: 'busy' } } }), 'a project still moving: not safe');
expect(!roundIsSafe(null), 'no round (offline, or another tab syncs): not safe');
expect(roundIsSafe({ projects: {} }), 'no projects at all: nothing to lose');


// ── a failed sign-in, explained ──────────────────────────────────────────────
// Every step the server can name (server/auth.mjs: fail('…') and failed('…'), read from the
// source so a new one cannot land without its sentence) gets its own, never the fallback.
const auth = fs.readFileSync(new URL('../server/auth.mjs', import.meta.url), 'utf8');
const steps = [...new Set([...auth.matchAll(/\bfail(?:ed)?\('([a-z]+)'/g)].map((m) => m[1]))];
expect(steps.length >= 7, `the server's failure steps are found in its source (${steps.join(', ')})`);
const fallback = signInFailure('no-such-step', '');
for (const why of steps) {
  const said = signInFailure(why, '');
  expect(why === 'denied' ? said === null : typeof said === 'string' && said !== fallback,
    `the page has its own explanation for "${why}"`);
}
expect(signInFailure('denied', '') === null, 'a sign-in the person cancelled is not a failure');
expect(/secret/.test(signInFailure('exchange', 'incorrect_client_credentials')) && /not your account/.test(signInFailure('exchange', 'incorrect_client_credentials')),
  'a secret GitHub rejects is named as the server\'s fault, not the person\'s');
expect(/expired|already used/.test(signInFailure('exchange', 'bad_verification_code')), 'an expired or reused code says so');
expect(/Wait a few minutes/.test(signInFailure('exchange', 'status-429')), 'GitHub turning the server away (429) says to wait, not what went wrong with the account');
expect(/cookie/.test(signInFailure('state', 'no-cookie')) && /another tab/.test(signInFailure('state', 'mismatch')),
  'a missing state cookie and a newer sign-in in another tab read differently');
for (const why of steps) for (const d of ['', 'no-cookie', 'mismatch', 'incorrect_client_credentials', 'bad_verification_code', 'status-500']) {
  const said = signInFailure(why, d);
  expect(said === null || !/—/.test(said), `no em dash in "${why}/${d}", in the house voice`);
}

// ── signing in again: which of the account's projects to come back to ───────
{
  const projects = [
    { id: 'p_old', owner: 'u_1', createdAt: 100 },
    { id: 'p_new', owner: 'u_1', createdAt: 300 },
    { id: 'p_theirs', owner: 'u_2', createdAt: 900 },
    { id: 'p_here', owner: null, createdAt: 950 },
  ];
  expect(resumeTarget(projects, 'u_1', 'p_old') === 'p_old', 'the project it had open when it signed out here');
  expect(resumeTarget(projects, 'u_1', '') === 'p_new', 'none remembered (a new device): its newest');
  expect(resumeTarget(projects, 'u_1', 'p_gone') === 'p_new', 'the remembered one is gone: its newest');
  expect(resumeTarget(projects, 'u_1', 'p_theirs') === 'p_new', "never another account's, nor this browser's own");
  expect(resumeTarget(projects, 'u_3', '') === null, 'an account with nothing here: stay');
  const tied = [{ id: 'p_a', owner: 'u_1', createdAt: 5 }, { id: 'p_b', owner: 'u_1', createdAt: 5 }];
  expect(resumeTarget(tied, 'u_1', '') === 'p_b', 'made in the same millisecond: the later in the list, every time');
}

// ── The header's account button (Dean, 2026-10-06): always there, and its menu says where
// the account stands at that moment, and holds only the account ──────────────────────
{
  const st = (o) => accountState(Object.assign({ asked: true, available: true, unreachable: null, user: null }, o));
  expect(st({ asked: false }) === 'checking' && st({ asked: false, user: { id: 'u' } }) === 'checking', 'before the server answers: checking, whatever was known');
  expect(st({ available: false }) === 'none', 'no server here: none');
  expect(st({ unreachable: 'network' }) === 'unreachable', 'a server out of reach: unreachable');
  expect(st({}) === 'signed-out' && st({ user: { id: 'u' } }) === 'signed-in', 'then signed out, or in');
  const said = (state, o) => accountMenu(state, o).map((i) => i.type === 'status' ? '[' + i.title + ']' : i.type === 'separator' ? '|' : i.label).join(' ');
  expect(said('checking') === '[Checking your account…]', `checking: says so, and offers nothing yet (${said('checking')})`);
  expect(said('none') === '[No accounts here]', `no server: says why there is no account (${said('none')})`);
  expect(said('unreachable', { reasonWords: 'x' }) === '[Can’t reach BelJar’s server] | Try again', `out of reach: says so, then Try again (${said('unreachable')})`);
  expect(said('signed-out') === '[Not signed in] | Sign in with GitHub', `signed out: says so, then Sign in (${said('signed-out')})`);
  const u = { handle: 'dean-b', name: 'Dean' };
  expect(said('signed-in', { user: u, settings: true }) === '[Dean] | Account settings Sign out', `signed in: who, then Account settings and Sign out (${said('signed-in', { user: u, settings: true })})`);
  expect(said('signed-in', { user: u, settings: false }) === '[Dean] | Sign out', 'where there is no Settings dialog (home), Sign out alone');
  const every = ['checking', 'none', 'unreachable', 'signed-out', 'signed-in'].flatMap((x) => accountMenu(x, { user: u, settings: true }));
  expect(!every.some((i) => /^(Home|Settings)$/.test(i.label || '')), 'and nothing that is not about the account: Home is its own button');
  expect(every.filter((i) => i.label).every((i) => ['try-again', 'sign-in', 'settings', 'sign-out'].includes(i.act)), 'every action names what it does');
}

console.log(`OK account (${n} checks: sign-in steps, what sign-in adopts, when removal is safe, every sign-in failure explained, where signing in comes back to, the account menu in every state)`);

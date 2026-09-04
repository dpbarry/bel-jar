// Vim bindings: the `:set` bridge onto real BelJar preferences, and the maps.
import { _pure, runSet, DEFAULT_LEADER } from '../js/editor-src/ide/modal/vim-setup.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const { NORMAL_MAP, LEADER_MAP } = _pure;

// ── every mapping points at a real command id shape ───────────────────────────
for (const [keys, id] of NORMAL_MAP.concat(LEADER_MAP)) {
  expect(typeof keys === 'string' && keys.length > 0, 'a mapping has keys');
  expect(/^[a-z][a-z0-9]*\.[a-z0-9-]+$/.test(id), `${keys} maps to a command id, got ${id}`);
}
expect(NORMAL_MAP.some(([k]) => k === ']h'), 'bracket motion to the next hole');
expect(NORMAL_MAP.some(([k]) => k === 'gd'), 'gd goes to a definition');
expect(DEFAULT_LEADER === String.fromCharCode(92), 'the leader is backslash by default');
expect(new Set(NORMAL_MAP.map(([k]) => k)).size === NORMAL_MAP.length, 'no duplicate normal-mode keys');
expect(new Set(LEADER_MAP.map(([k]) => k)).size === LEADER_MAP.length, 'no duplicate leader keys');

// ── :set delegates to the one shared option table ─────────────────────────────
// The table, the parsing and the writes live shell-side in `command-settings.mjs`
// (tested in `test-command-settings.mjs`); what has to be true HERE is that Vim's
// `:set` reaches it rather than keeping a second, drifting copy.
const calls = [];
globalThis.Commands = {
  run: (id, ctx) => { calls.push(['run', id, ctx && ctx.argText]); return true; },
  runSet: (arg) => { calls.push(['runSet', arg]); return true; },
};
expect(runSet('nu') === true, ':set nu is carried out');
expect(calls.pop().join() === 'runSet,nu', 'straight to the shared implementation');
expect(runSet('ts=4') && calls.pop().join() === 'runSet,ts=4', 'arguments pass through intact');

// Before the shell publishes `runSet`, the command id still gets there.
delete globalThis.Commands.runSet;
expect(runSet('nolist') === true, 'the id route works too');
expect(calls.pop().join() === 'run,settings.set,nolist', 'via the settings.set command');

// With no registry at all it refuses rather than throwing into Vim's ex handler.
globalThis.Commands = undefined;
expect(runSet('nu') === false, 'no registry, no silent success');

console.log(`OK vim setup (${NORMAL_MAP.length} normal maps, ${LEADER_MAP.length} leader maps, :set bridge)`);

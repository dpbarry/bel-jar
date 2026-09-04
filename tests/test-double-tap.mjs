// Double-tap detection. The rules exist to stop three specific false fires:
// typing capitals, holding the key, and tapping either side of a word.
import { shouldFire, blockReason, resolveAction, _pure } from '../js/ui/double-tap.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const base = { trigger: 'shift', repeat: false, otherKeySeen: false, otherModifier: false, gap: 200, windowMs: 350 };

expect(shouldFire(base) === true, 'two clean taps inside the window fire');
expect(shouldFire({ ...base, trigger: 'off' }) === false, 'the gesture is off by default');
expect(shouldFire({ ...base, gap: 400 }) === false, 'too slow does not fire');
expect(shouldFire({ ...base, gap: 0 }) === false, 'a first tap alone does not fire');
expect(shouldFire({ ...base, gap: 350 }) === true, 'exactly at the window still fires');

// Typing a capital presses Shift, then a letter — the letter disqualifies it.
expect(shouldFire({ ...base, otherKeySeen: true }) === false, 'a key between the taps cancels');
// Holding the key repeats keydown; that is not a tap.
expect(shouldFire({ ...base, repeat: true }) === false, 'auto-repeat is not a tap');
// Ctrl+Shift+something released is not a Shift double-tap.
expect(shouldFire({ ...base, otherModifier: true }) === false, 'another modifier cancels');

expect(shouldFire({}) === false, 'an empty state never fires');
expect(shouldFire(null) === false, 'null never fires');

// Speed presets bound the window.
expect(shouldFire({ ...base, gap: 260, windowMs: 250 }) === false, 'fast is strict');
expect(shouldFire({ ...base, gap: 480, windowMs: 500 }) === true, 'relaxed is lenient');

// ── who owns the keyboard ─────────────────────────────────────────────────────
// The header used to claim IME and modal guards that were never written. These
// pin the claim to the code.
expect(blockReason({}) === '', 'nothing owning the keyboard, nothing blocked');
expect(blockReason({ composing: true }) === 'composing', 'IME composition blocks');
expect(blockReason({ recordingChord: true }) === 'chord-recorder', 'a chord recorder blocks');
expect(blockReason({ modalOpen: true }) === 'modal', 'a modal dialog blocks — including the settings search inside it');
expect(blockReason({ commandLineOpen: true }) === 'command-line', 'the command line blocks');
expect(blockReason(null) === '', 'a missing state blocks nothing');

// ── what it does when the palette is already up ───────────────────────────────
expect(resolveAction('tools.palette', false).run === 'tools.palette', 'closed palette: just run');
expect(resolveAction('tools.palette', false).close === false, 'nothing to close');
// Asking for the palette while the palette is showing is a toggle.
const toggled = resolveAction('tools.palette', true);
expect(toggled.close === true && toggled.run === null, 'open palette + palette target = toggle shut');
// Asking for something ELSE must still happen — the old code swallowed it.
const other = resolveAction('run.default', true);
expect(other.close === true && other.run === 'run.default',
  'open palette + other target: close the palette AND run the command');
expect(resolveAction('nav.symbol', true).run === null, 'every palette mode counts as a toggle');
expect(_pure.PALETTE_OPENERS.has('edit.search-project'), 'search-project opens the palette');
expect(!_pure.PALETTE_OPENERS.has('run.default'), 'running a file does not');

// ── the gesture-target shortlist ─────────────────────────────────────────────
// The persisted key accepts any command id, but the settings picker offers
// these — and a picker naming a command that does not exist is a dead row.
const { CATALOG } = await import('../js/commands/command-catalog.mjs');
const byId = new Map(CATALOG.map((c) => [c.id, c]));
const targets = _pure.GESTURE_TARGETS;
expect(targets.length > 3, `the shortlist is worth opening (${targets.length})`);
expect(new Set(targets).size === targets.length, 'no duplicate targets');
for (const id of targets) {
  const cmd = byId.get(id);
  expect(cmd, `${id} is offered as a gesture target but is not in the catalogue`);
  // The gesture fires from anywhere, including with no editor mounted.
  expect(cmd.scope === 'global', `${id} is editor-scope; a gesture can fire with no editor`);
}
expect(targets[0] === 'tools.palette', 'the default target leads the list');

console.log(`OK double tap (fires on a clean pair; never on capitals, repeat, or mixed modifiers; `
  + `${targets.length} gesture targets)`);

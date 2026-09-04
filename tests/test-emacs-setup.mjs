// Emacs bindings + the reserved-chord truth table.
import { _pure as emacs, chordVariants } from '../js/editor-src/ide/modal/emacs-setup.mjs';
import {
  reservedChords, emacsFidelity, isMacPlatform, BROWSER_RESERVED_PC, BROWSER_RESERVED_MAC, PREFIX_RULE,
} from '../js/editor-src/ide/modal/reserved-chords.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const { CX_MAP, CC_MAP, DECLINED } = emacs;

// ── every binding is a command id ─────────────────────────────────────────────
for (const [keys, id] of CX_MAP.concat(CC_MAP)) {
  expect(/^[a-z][a-z0-9]*\.[a-z0-9-]+$/.test(id), `${keys} maps to a command id, got ${id}`);
}
const allKeys = CX_MAP.concat(CC_MAP).map(([k]) => k);
expect(new Set(allKeys).size === allKeys.length, 'no duplicate chords');

// ── the rule that keeps chains reachable ──────────────────────────────────────
// A chain whose SECOND key is a control chord is unreachable on Windows/Linux
// and opens a browser window mid-sequence. Second keys stay plain.
for (const [keys] of CC_MAP) {
  const parts = keys.split(' ');
  expect(parts.length === 2 && parts[0] === 'C-c', `${keys} is a C-c chain`);
  expect(!/^C-/.test(parts[1]), `${keys} has a plain second key, not a control chord`);
}
expect(/cannot be reached/.test(PREFIX_RULE), 'the rule is written down where it can be read');

// ── declines answer instead of going silent ───────────────────────────────────
expect(DECLINED.length >= 3, 'the chords Emacs users reach for are answered');
for (const [keys, why] of DECLINED) {
  expect(typeof why === 'string' && why.length > 20, `${keys} explains itself`);
}
expect(DECLINED.some(([k]) => k === 'C-x C-c'), 'C-x C-c is answered, not bound');
expect(DECLINED.some(([k]) => k === 'C-x 2'), 'window splits are answered honestly');

// ── the platform truth table ──────────────────────────────────────────────────
// macOS reserves things too — just not Emacs chords. "Nothing is reserved" was
// the shorthand; what is actually true is "nothing Emacs needs".
expect(reservedChords(true).every((r) => r.emacs === '—'),
  'macOS reserves Command, so no Emacs chord is lost');
expect(reservedChords(false).length > 0, 'Windows and Linux lose several');
expect(BROWSER_RESERVED_PC.some((r) => r.chord === 'Ctrl+N'), 'Ctrl+N is named');
for (const row of BROWSER_RESERVED_PC) {
  expect(row.chord && row.emacs && row.substitute, `${row.chord} states meaning and substitute`);
}

const mac = emacsFidelity(true);
const pc = emacsFidelity(false);
expect(mac.level === 'full' && mac.taken === 0, 'macOS reports full fidelity');
expect(/All Emacs chords reach/.test(mac.headline), 'and says so plainly', mac.headline);
expect(pc.level === 'partial' && pc.taken > 0, 'Windows/Linux reports what it loses');
expect(/taken by the browser/.test(pc.headline), 'in the headline, not a footnote', pc.headline);
expect(mac.headline !== pc.headline, 'one option, two honest descriptions');

expect(isMacPlatform({ platform: 'MacIntel' }) === true, 'mac detected');
expect(isMacPlatform({ platform: 'Win32' }) === false, 'windows detected');

// The handler names keys from `e.code`, so a digit arrives as `Digit2`. Binding
// only the readable spelling silently never fires — the probe caught exactly that.
expect(chordVariants('C-x 2').join('|') === 'C-x 2|C-x Digit2', 'digits bind both spellings');
expect(chordVariants('C-c h').join('|') === 'C-c h', 'letters need only one spelling');

// ── the measured reserved table ──────────────────────────────────────────────
// Measured with `scripts/chord-audit.html` on Chrome 152 / Windows 11, by hand.
// ⛔ Do not edit that table from memory or from a docs page — re-measure.
const reservedNames = BROWSER_RESERVED_PC.map((r) => r.chord);

for (const chord of ['Ctrl+N', 'Ctrl+T', 'Ctrl+W', 'Ctrl+Shift+N', 'Ctrl+Shift+T',
  'Ctrl+Shift+W', 'Ctrl+Shift+P', 'Ctrl+Tab', 'Ctrl+Shift+Tab']) {
  expect(reservedNames.indexOf(chord) >= 0, `${chord} was measured reserved and must stay listed`);
}
// Ctrl+9 only arrived because there was no ninth tab to switch to; with nine or
// more open it goes to the last one, so the whole range is unreliable.
expect(reservedNames.some((c) => /1…9/.test(c)), 'the whole Ctrl+digit range is listed, not just Ctrl+1');
// ⚠ Ctrl+L reaches the page — it was listed as reserved without ever being measured.
expect(reservedNames.indexOf('Ctrl+L') < 0, 'Ctrl+L is NOT reserved; it was measured arriving');

// ⛔ The bug the measurement caught: `Ctrl+W`'s replacement was `Ctrl+Shift+W`,
// which is itself reserved — a substitute nobody could ever press.
for (const row of BROWSER_RESERVED_PC) {
  if (!row.substitute || row.substitute === '—') continue;
  for (const part of row.substitute.split(/,| or /)) {
    const chord = part.trim();
    if (!chord || /then/.test(chord)) continue;
    expect(reservedNames.indexOf(chord) < 0,
      `${row.chord} substitutes ${chord}, which is itself reserved`);
  }
}
// macOS: documented, not measured. What matters for Emacs is that none of it is
// an Emacs chord, so `emacsFidelity` must still report the keymap as whole.
expect(BROWSER_RESERVED_MAC.every((r) => r.emacs === '—'),
  'nothing macOS reserves is an Emacs chord');
expect(emacsFidelity(true).taken === 0 && emacsFidelity(true).level === 'full',
  'so Emacs is whole on a Mac');
expect(BROWSER_RESERVED_MAC.some((r) => r.chord === 'Ctrl+Tab'),
  'Ctrl+Tab is the browser’s on BOTH platforms');

// ── the one package internal we depend on ────────────────────────────────────
// `$data.keyChain` has no public accessor, so the pending prefix is read by
// wrapping `handleKeyboard` on the prototype. If a bump moves either of these,
// this fails loudly rather than the badge silently going quiet.
const { emacsChainShape } = await import('../js/editor-src/ide/keymap-style.mjs');
const shape = emacsChainShape();
expect(shape.hasHandleKeyboard, 'EmacsHandler.prototype.handleKeyboard still exists');
expect(shape.hasFindCommand, 'EmacsHandler.prototype.findCommand still exists');

console.log(`OK emacs setup (${CX_MAP.length} C-x, ${CC_MAP.length} C-c, ${DECLINED.length} answered declines)`);

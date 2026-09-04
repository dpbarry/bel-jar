// Every key the Emacs package binds must be accounted for, in words.
//
// ⛔ The KEYS come from the package; only the WORDS are ours. This test is the
// thing that stops the table going quietly out of date: if the package grows,
// drops or renames a spec, it fails here rather than silently listing 61 of 62
// bindings — or, worse, advertising one the package no longer has.
//
// Available macros was listing BelJar's chords and BelJar's own Vim/Emacs maps
// and calling that "available", while `C-p`, `C-e`, `C-k`, `C-y` and forty
// others were live the whole time and appeared nowhere.
import {
  EMACS_KEY_LABELS, packageSpecs, readableEmacsKey, preferredKey, emacsKeyRows,
} from '../js/editor-src/ide/modal/emacs-keys.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const specs = packageSpecs();
expect(specs.length > 50, `the package binds a real set of keys (${specs.length})`);

// ── every spec accounted for, and nothing invented ───────────────────────────
for (const spec of specs) {
  expect(Object.prototype.hasOwnProperty.call(EMACS_KEY_LABELS, spec),
    `the package binds ${JSON.stringify(spec)} and nothing here says what it does`);
}
for (const spec of Object.keys(EMACS_KEY_LABELS)) {
  expect(specs.indexOf(spec) >= 0,
    `${JSON.stringify(spec)} has words but the package does not bind it`);
}

// ⚠ Exactly two are deliberately unlisted: plain Backspace and plain Return.
// Those are the keyboard working, not macros. `Delete|C-d` stays, because `C-d`
// is a real Emacs binding even though the Delete key is not. Any OTHER null is a
// gap, not a decision.
const skipped = Object.keys(EMACS_KEY_LABELS).filter((s) => !EMACS_KEY_LABELS[s]);
expect(skipped.sort().join(' | ') === 'Backspace | Return|C-m',
  `only the literal keys are unlisted (${skipped.join(', ')})`);

// ── the spelling a reader can act on ─────────────────────────────────────────
expect(readableEmacsKey('C-p') === 'Ctrl+P', 'the package spelling becomes a chord');
expect(readableEmacsKey('S-C-p') === 'Ctrl+Shift+P', 'modifiers in BelJar order');
expect(readableEmacsKey('M-x') === 'Alt+X', 'meta is Alt');
expect(readableEmacsKey('C-Space') === 'Ctrl+Space', 'named keys keep their name');
expect(readableEmacsKey('Up') === 'Up', 'a bare key is itself');

// ── the shown key must be one that WORKS ─────────────────────────────────────
const eaten = new Set(['Ctrl+N', 'Ctrl+T', 'Ctrl+W', 'Ctrl+Shift+W', 'Ctrl+Shift+P']);
const gone = (k) => eaten.has(k);
// An Emacs chord is preferred over an arrow — that is the whole point of a row.
expect(preferredKey('Up|C-p', gone).key === 'C-p', 'C-p over Up');
expect(preferredKey('Up|C-p', gone).reserved === false, 'and nothing was lost');
// …but only where the browser delivers it.
const next = preferredKey('Down|C-n', gone);
expect(next.key === 'Down' && next.reserved === true,
  'C-n is eaten, so the row shows Down and is flagged', JSON.stringify(next));
// Both spellings eaten and no plain alternative: not a row at all. The
// substitute BelJar binds in its place is the row, from the substitute table.
expect(preferredKey('C-w|C-S-w', gone) === null,
  'a spec the browser takes entirely is not offered');

// ── the rows ─────────────────────────────────────────────────────────────────
const rows = emacsKeyRows(gone);
expect(rows.length > 45, `a real set of rows (${rows.length})`);
expect(rows.every((r) => r.keys && r.title), 'every row names a key and what it does');
expect(rows.some((r) => r.keys === 'Ctrl+P' && /Previous line/.test(r.title)),
  'Ctrl+P is listed — the one the user went looking for and could not find');
expect(rows.some((r) => r.keys === 'Ctrl+K'), 'and Ctrl+K');
expect(rows.some((r) => r.keys === 'Ctrl+Y'), 'and Ctrl+Y');
expect(!rows.some((r) => r.keys === 'Ctrl+W'), 'but never one the browser eats');
expect(rows.filter((r) => r.reserved).length > 0, 'and the flagged ones are flagged');

console.log(`OK emacs keys (${specs.length} package specs, all worded; ${rows.length} live rows)`);

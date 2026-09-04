// The style's own maps, as a listable table.
//
// These bindings — Vim's `gd` and leader map, Emacs' `C-x`/`C-c` chains — were
// real, invocable, and listed in NO surface anywhere. The Keybindings sheet
// projects `Keybindings`, which has never heard of them; the palette lists
// commands, not keys; Available Macros asked `Commands.describe()`, which only
// knows BelJar's own chord table. Which-key was the only way in, and which-key
// answers a prefix you already knew to press.
import { styleMacroGroups, readableKeys } from '../js/editor-src/ide/modal/style-macros.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const BACKSLASH = String.fromCharCode(92);
const vim = styleMacroGroups('vim', BACKSLASH);
expect(vim.map((g) => g.name).join(',') === 'Vim keys,Vim leader', 'two Vim blocks');
expect(vim[0].rows.length > 12, `the whole Normal map (${vim[0].rows.length})`);
expect(vim[0].rows.some((r) => r.keys === 'gd'), 'gd is listed');
expect(vim[1].rows.every((r) => r.keys.startsWith(BACKSLASH)),
  'every leader row carries the leader');

// The leader is a PARAMETER, so the list follows the setting rather than a
// hardcoded backslash — the whole reason the old help text went stale.
expect(styleMacroGroups('vim', ',')[1].rows.every((r) => r.keys.startsWith(',')),
  'a comma leader is reflected');
// ⛔ Space is spelled `<Space>` for vim and `Space ` for a reader.
expect(styleMacroGroups('vim', ' ')[1].rows.every((r) => r.keys.startsWith('Space ')),
  'a space leader reads as a word, not as an invisible character');

// ⛔ `<C-o>` is vim CONFIG syntax, not a key anyone presses.
expect(readableKeys('<C-o>') === 'Ctrl+O', 'a control chord reads as a chord');
expect(readableKeys(']h') === ']h', 'a plain sequence is left alone');
expect(vim[0].rows.every((r) => r.keys.indexOf('<') < 0), 'no angle brackets reach the screen');

const emacs = styleMacroGroups('emacs');
expect(emacs.map((g) => g.name).join(',') === 'Emacs C-x,Emacs C-c', 'two Emacs blocks');
// ⛔ One spelling. These are written `C-x C-s` in the map that installs them and
// spoken as `Ctrl+X Ctrl+S` everywhere a reader sees them.
expect(emacs[0].rows.some((r) => r.keys === 'Ctrl+X Ctrl+S'),
  'the save chord is listed, in one spelling',
  JSON.stringify(emacs[0].rows.map((r) => r.keys)));

expect(styleMacroGroups('default').length === 0, 'Standard adds no keys, so it lists none');

// Every row names a real command id, or the list could advertise a dead key.
import { CATALOG } from '../js/commands/command-catalog.mjs';
const ids = new Set(CATALOG.map((c) => c.id));
for (const group of vim.concat(emacs)) {
  for (const row of group.rows) {
    expect(ids.has(row.id), `${group.name} ${row.keys} names ${row.id}, which does not exist`);
  }
}

console.log(`OK style macros (${vim[0].rows.length + vim[1].rows.length} Vim keys, `
  + `${emacs[0].rows.length + emacs[1].rows.length} Emacs, every id real)`);

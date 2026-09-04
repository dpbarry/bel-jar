// Command registry — define/attach/list/describe/defaults over the built leaf
// (js/commands/command-registry.js). DOM-free: the IIFE attaches to globalThis
// and nothing in the registry touches the document.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'js', 'commands', 'command-registry.js'), 'utf8');
// eslint-disable-next-line no-new-func
new Function(src)();
const C = globalThis.Commands;
expect(C && typeof C.define === 'function', 'Commands is published');

// ── catalogue is loaded at import ─────────────────────────────────────────────

expect(C.has('edit.format'), 'catalogue loaded at module load');
expect(C.get('edit.format').title === 'Format Document', 'catalogue title');
expect(C.get('edit.format').defaultSpec === 'Alt+Shift+F', 'catalogue chord');
expect(C.get('nope.missing') === null, 'unknown id → null');

// ── define / attach ───────────────────────────────────────────────────────────

expect(C.define(null) === false, 'define(null) rejected');
expect(C.define({}) === false, 'define without id rejected');
expect(C.define({ id: 'test.alpha', title: 'Alpha', section: 'S' }) === true, 'define accepted');
expect(C.get('test.alpha').title === 'Alpha', 'defined title');
expect(typeof C.get('test.alpha').run !== 'function', 'metadata alone is not runnable');

// define merges: catalogue metadata survives a later partial define
C.define({ id: 'edit.format', detail: 'wraps at the format width' });
expect(C.get('edit.format').defaultSpec === 'Alt+Shift+F', 'partial define keeps the chord');
expect(C.get('edit.format').ex.join(',') === 'fmt,format', 'partial define keeps ex names');
expect(C.get('edit.format').detail === 'wraps at the format width', 'partial define applies');

let ran = 0;
expect(C.attach('test.alpha', { run: () => { ran += 1; } }) === true, 'attach accepted');
expect(typeof C.get('test.alpha').run === 'function', 'attach wires run');
expect(C.attach('test.alpha', {}) === true, 'attach with no behaviour is a no-op define');
expect(typeof C.get('test.alpha').run === 'function', 'empty attach does not clear run');

expect(C.run('test.alpha') === true, 'run invokes');
expect(ran === 1, 'run ran once');
expect(C.run('nope.missing') === false, 'run on unknown id is false');

// ── when() ────────────────────────────────────────────────────────────────────

C.define({ id: 'test.gated', title: 'Gated', run: () => {}, when: () => false, palette: true });
C.define({ id: 'test.throws', title: 'Throws', run: () => {}, palette: true, when: () => { throw new Error('boom'); } });
const avail = C.list({ palette: true, runnable: true, available: true }).map((c) => c.id);
expect(avail.indexOf('test.gated') < 0, 'when() false hides the command');
expect(avail.indexOf('test.throws') < 0, 'throwing when() hides the command, no crash');
expect(C.run('test.gated') === false, 'run respects when()');

// ── list filters ──────────────────────────────────────────────────────────────

expect(C.list().length > 25, 'unfiltered list returns the catalogue');
expect(C.list({ keybindable: true }).every((c) => c.keybindable), 'keybindable filter');
expect(C.list({ scope: 'editor' }).every((c) => c.scope === 'editor'), 'scope filter');
expect(C.list({ section: 'Run' }).every((c) => c.section === 'Run'), 'section filter');
expect(C.list({ runnable: true }).every((c) => typeof c.run === 'function'), 'runnable filter');

// ── defaults(): the projection Keybindings resolves against ───────────────────

const SHIPPED_16 = [
  'nav.anywhere', 'tools.commands', 'nav.symbol', 'edit.search-project',
  'edit.undo', 'edit.redo', 'edit.find', 'edit.toggle-comment', 'edit.format',
  'edit.rename', 'edit.select-all', 'edit.autocomplete',
  'nav.definition', 'nav.references', 'nav.next-hole', 'nav.prev-hole',
];
const projected = C.defaults();
for (const id of SHIPPED_16) {
  const row = projected.find((d) => d.id === id);
  expect(row, `defaults() includes ${id}`);
  expect(row.defaultSpec, `${id} is one of the shipped chords and must stay bound by default`);
}
const bound = projected.filter((d) => d.defaultSpec).map((d) => d.id).sort();
expect(
  bound.join(',') === SHIPPED_16.slice().sort().join(','),
  'exactly the shipped 16 ship a default chord; new commands arrive unbound\n  got: ' + bound.join(',')
);
const redo = projected.find((d) => d.id === 'edit.redo');
expect(redo.defaultSpec === 'Mod+Y' && redo.macDefaultSpec === 'Mod+Shift+Z', 'defaults() carries the mac variant');
expect(projected.every((d) => d.title && d.section && d.scope), 'projection rows are complete');
expect(projected.length > SHIPPED_16.length, 'the bindable set has grown past the shipped chords');

// ── style policy ──────────────────────────────────────────────────────────────

expect(C.styleFor('edit.find', 'emacs') === 'off', 'emacs owns Mod+F');
expect(C.styleFor('nav.anywhere', 'emacs') === 'yield', 'emacs yields Go to File');
expect(C.styleFor('nav.next-hole', 'vim') === 'always', 'F8 is always live in vim');
expect(C.styleFor('edit.undo', 'vim') === 'insert-only', 'undo is insert-only in vim');
// Alt+X is M-x, so Emacs keeps it; `tools.inspector` states nothing and so is
// the one that shows the default.
expect(C.styleFor('tools.commands', 'emacs') === 'off', 'Emacs owns Alt+X for M-x');
expect(C.styleFor('tools.inspector', 'emacs') === 'always', 'unstated policy defaults to always');
expect(C.styleFor('nope.missing', 'vim') === 'always', 'unknown id defaults to always');
expect(C.idsWithStyle('emacs', 'off').indexOf('edit.find') >= 0, 'idsWithStyle collects the omit set');
expect(C.idsWithStyle('emacs', 'off').indexOf('tools.inspector') < 0, 'idsWithStyle is explicit-only');

// ── describe() ────────────────────────────────────────────────────────────────

// ⛔ `resolve` and `findConflict` are load-bearing now: the shadow is computed
// from the CHORD, so a stub that only knows labels reports every chord as
// uncontested — which is the failure the whole tag exists to catch.
const STUB_SPECS = {
  'edit.find': 'Mod+F',
  'edit.redo': 'Mod+Y',
  'edit.undo': 'Mod+Z',
  'edit.format': 'Alt+Shift+F',
  'tools.commands': 'Alt+X',
};
globalThis.Keybindings = {
  has: (id) => SHIPPED_16.indexOf(id) >= 0,
  resolve: (id) => STUB_SPECS[id] || '',
  labelFor: (id) => 'CHORD:' + id,
  formatShortcut: (spec) => 'LIT:' + spec,
  normalizeSpec: (spec) => spec,
  findConflict: () => null,
};
const d = C.describe('edit.format');
expect(d.chord === 'CHORD:edit.format', 'describe uses the live keybinding');
expect(d.mx === 'beljar-edit-format', 'M-x name derived from the id');
expect(d.ex.join(',') === 'fmt,format', 'describe carries ex names');
expect(d.runnable === false, 'describe reports unwired commands as not runnable');
expect(d.availableInStyle === true && d.shadow === null, 'default style shadows nothing');

// ⛔ `describe()` reports a shadow as a TAG plus a sentence for its tooltip —
// there is no bare sentence field any more, because every renderer that had one
// printed it as a second line under the row.
//
// ⛔⛔ And the shadow is about the CHORD ON THE ROW, not about the command. A
// surface showing BelJar's own chord gets the contest over THAT chord; a surface
// showing the style's chord says so with `showing: 'style'` and gets the answer
// for that one instead. The old shape hung "without Emacs, Redo is Ctrl+Y" on a
// row whose chord collided with nothing.
const dEmacs = C.describe('edit.find', { style: 'emacs' });
expect(dEmacs.availableInStyle === false, 'find is unavailable under emacs');
expect(dEmacs.shadow.tag === 'shadowed',
  'the row showing Ctrl+F reports that Ctrl+F is taken', JSON.stringify(dEmacs.shadow));
expect(dEmacs.shadow.runs === 'forward-char', 'and what Emacs does with it', dEmacs.shadow.runs);
expect(!/Without Emacs/.test(dEmacs.shadow.tip),
  'never a sentence about a keymap you are not in', dEmacs.shadow.tip);
// ⛔ In BelJar's spelling, not Emacs'. `STYLE_CHORDS` is written `C-s`, and
// Available macros groups keys by shape — two spellings in one list produced
// blocks headed `C`, `C+S` and `Ctrl+x`.
expect(dEmacs.styleChord === 'Ctrl+S',
  'the chord that works is carried separately, in one spelling', dEmacs.styleChord);
// The same command on a surface that shows `C-s`: that chord is contested by
// nothing, so there is no tag at all.
const dLive = C.describe('edit.find', { style: 'emacs', showing: 'style' });
expect(dLive.shadow === null,
  'showing the live chord, which collides with nothing, means no tag', JSON.stringify(dLive.shadow));
expect(dEmacs.shadowedBy === undefined, 'the bare sentence field is gone');
const dVim = C.describe('edit.undo', { style: 'vim' });
expect(dVim.shadow.tag === 'insert', 'insert-only reads as insert', JSON.stringify(dVim.shadow));

const dPalette = C.describe('tools.palette');
expect(dPalette.chord === 'LIT:Mod+K', 'unbindable commands fall back to the literal shortcut');
expect(C.describe('nope.missing') === null, 'describe on unknown id → null');

// ── unregister / version ──────────────────────────────────────────────────────

const v0 = C.version();
expect(C.unregister('test.alpha') === true, 'unregister removes');
expect(C.has('test.alpha') === false, 'removed from the registry');
expect(C.unregister('test.alpha') === false, 'second unregister is false');
expect(C.version() > v0, 'version advances on change');

console.log('OK command registry (define/attach, when, filters, defaults projection, style policy, describe)');

// What a tag means, and when it may appear at all.
//
// ⛔ THE RULE: a tag exists for exactly one reason — **the chord on this row is
// claimed by something other than this row** — and it names the other claimant.
//
// It used to be keyed by COMMAND and say "This is an Emacs macro. Without Emacs,
// Redo is Ctrl+Y." That is a statement about a keymap you are not using, and it
// appeared on rows whose chord collided with nothing (`C-S-z` is free) while the
// seven chords Emacs genuinely takes carried no tag on the surface listing them.
import {
  STYLE_TAKES, STYLE_CHORDS, INSERT_ALTERNATIVE, chordShadow, takesChord, specFromStyleKey,
} from '../js/commands/command-shadows.mjs';
import { CATALOG } from '../js/commands/command-catalog.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const shadow = (over) => chordShadow(Object.assign({
  style: 'emacs', policy: 'always', commandId: 'x.y', spec: '', label: '',
}, over));

// ── nothing contested, nothing said ──────────────────────────────────────────
expect(shadow({ style: 'default', spec: 'Mod+F' }) === null, 'Standard contests nothing');
expect(shadow({ spec: 'Mod+Shift+F' }) === null, 'a chord Emacs does not take has no tag');
expect(shadow({ spec: '' }) === null, 'no chord, no tag');

// ── shadowed: the chord on this row is taken by the style ───────────────────
const find = shadow({ commandId: 'edit.find', spec: 'Mod+F', label: 'Ctrl+F' });
expect(find.kind === 'shadowed', 'Ctrl+F is shadowed under Emacs');
// ⛔ The sentence is about the CHORD and names what took it. Never "without
// Emacs this command would be…".
expect(find.tip === 'Emacs uses Ctrl+F for forward-char.', 'and says so plainly', find.tip);
expect(!/[Ww]ithout Emacs/.test(find.tip), 'never describes a keymap you are not in');
expect(find.tag === 'shadowed', 'the word says this row is the one being shadowed', find.tag);

// ── the style running the command ITSELF is not a contest ────────────────────
// `M-x` IS Run Command; a tag implying it was taken away would be wrong.
expect(shadow({ commandId: 'tools.commands', spec: 'Alt+X', label: 'Alt+X' }) === null,
  'M-x reaches Run Command, so nothing is contested');
// …but the same chord for anything else IS.
expect(shadow({ commandId: 'other.thing', spec: 'Alt+X', label: 'Alt+X' }).kind === 'shadowed',
  'the exemption is for that one command, not for the chord');

// ── shadowing: this row's chord takes a base chord from someone else ─────────
// The case that gives the tag its name. `baseOwnerOf` is the live chord table.
const owner = () => ({ id: 'file.save', title: 'Save Now' });
const clash = shadow({
  commandId: 'edit.find', spec: 'Mod+S', label: 'C-s', fromStyle: true, baseOwnerOf: owner,
});
expect(clash.kind === 'shadowing', 'a style chord landing on a base chord is flagged');
expect(clash.tip === 'Emacs uses C-s here. In Standard, C-s is Save Now.',
  'and names the command that originally used the chord', clash.tip);
// Its own chord is not a contest with itself.
expect(shadow({
  commandId: 'file.save', spec: 'Mod+S', label: 'C-s', fromStyle: true, baseOwnerOf: owner,
}) === null, 'a row does not shadow itself');
// ⛔ Without `fromStyle` this is a keybinding CONFLICT, not a style contest —
// and it fired on one: `tools.palette` and `nav.anywhere` deliberately share
// Ctrl+K because they are the same action, and the row read "Vim uses Ctrl+K
// here" under a style that had done nothing at all.
expect(shadow({
  style: 'vim', commandId: 'tools.palette', spec: 'Mod+K', label: 'Ctrl+K', baseOwnerOf: owner,
}) === null, 'two BASE commands sharing a chord is a conflict, not a shadow');

// ── insert: the chord works, but only while typing ───────────────────────────
const undo = shadow({ style: 'vim', policy: 'insert-only', commandId: 'edit.undo' });
expect(undo.kind === 'insert', 'an insert-only chord still works, so the row keeps it');
expect(undo.instead === 'u', 'and carries the Normal-mode key');
const comment = shadow({ style: 'vim', policy: 'insert-only', commandId: 'edit.toggle-comment' });
expect(comment.kind === 'insert' && !comment.instead, 'or none, where Vim has no equivalent');

// ── the take table is real ───────────────────────────────────────────────────
const byId = new Map(CATALOG.map((c) => [c.id, c]));
const specs = new Set();
for (const c of CATALOG) {
  if (c.defaultSpec) specs.add(c.defaultSpec);
  if (c.macDefaultSpec) specs.add(c.macDefaultSpec);
}
for (const style of Object.keys(STYLE_TAKES)) {
  for (const entry of STYLE_TAKES[style]) {
    // ⛔ A chord no BelJar command ships would be a collision with nothing —
    // the tag would never fire and nobody would notice it had gone stale.
    expect(specs.has(entry.spec),
      `${style} claims to take ${entry.spec}, which BelJar does not bind`);
    expect(entry.runs, `${style} ${entry.spec} must say what it runs instead`);
    expect(takesChord(style, entry.spec) === entry, 'and is findable by spec');
    if (entry.sameCommand) {
      expect(byId.has(entry.sameCommand), `${entry.sameCommand} is a real command`);
    }
  }
}
expect(STYLE_TAKES.emacs.length >= 6,
  `Emacs takes a real set of chords (${STYLE_TAKES.emacs.length})`);

// Every substitute the style offers names a real command.
for (const style of Object.keys(STYLE_CHORDS)) {
  for (const id of Object.keys(STYLE_CHORDS[style])) {
    expect(byId.has(id), `${style} offers a chord for ${id}, which is not in the catalogue`);
  }
}
for (const id of Object.keys(INSERT_ALTERNATIVE.vim)) {
  expect(byId.has(id), `${id} is a real command`);
}

// ── the style spellings normalize ────────────────────────────────────────────
// ⛔ Without this the `shadowing` case can never fire: a style chord is not in
// the form the chord table is keyed by, and '' reads as "no collision".
expect(specFromStyleKey('C-s') === 'Mod+S', 'Emacs spelling');
expect(specFromStyleKey('C-S-z') === 'Mod+Shift+Z', 'with modifiers');
expect(specFromStyleKey('M-x') === 'Alt+X', 'meta is Alt');
expect(specFromStyleKey('Ctrl+O') === 'Mod+O', 'and the READABLE spelling a list renders');
// A chain cannot collide with a single chord; saying it does would tag
// `C-x C-f` against whatever owns Ctrl+X.
expect(specFromStyleKey('C-x h') === '', 'a chain is not a chord');
expect(specFromStyleKey('gd') === '' && specFromStyleKey(']h') === '', 'a bare sequence is not a chord');

console.log(`OK command shadows (a tag means the CHORD is contested; `
  + `${STYLE_TAKES.emacs.length} Emacs takes, all real)`);

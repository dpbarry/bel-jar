// The available macros's model: what earns a row, and what does not.
//
// It is the short answer to "what can I press", not a second copy of the
// Keybindings sheet. So the rule to pin is the one that keeps it short: a row
// exists because you can type it.
import {
  macroModel, countRows, rowMatches, reservedGroup, listSentence, commandLineAccess,
} from '../js/ui/available-macros.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const row = (over) => ({
  id: 'x.y', title: 'Thing', section: 'Edit', chord: '', ex: [], mx: 'thing',
  runnable: true, shadow: null, ...over,
});

// ── what earns a row ─────────────────────────────────────────────────────────
const VIM_LINE = commandLineAccess('vim');
const groups = macroModel([
  row({ id: 'a.one', title: 'One', chord: 'Ctrl+1' }),
  row({ id: 'a.two', title: 'Two' }),
  row({ id: 'a.three', title: 'Three', ex: ['three'] }),
  row({ id: 'a.four', title: 'Four', chord: 'Ctrl+4', ex: ['four'] }),
], [], null, VIM_LINE);
// ⛔ Blocks are named for the KEY SHAPE, never for whose keymap a binding came
// from. "BelJar keys" beside "Emacs C-x" drew a line that does not exist: those
// bindings change when you switch style too. `Ctrl+1` and `Ctrl+4` are both Ctrl
// chords and belong together, whoever bound them.
expect(groups.map((g) => g.name).join(',') === 'Ctrl,Command line',
  'keys grouped by shape, then the line', groups.map((g) => g.name).join(','));
expect(groups[0].rows.map((r) => r.title).join(',') === 'One,Four', 'the chorded rows');
expect(groups[1].rows.map((r) => r.title).join(',') === 'Three,Four', 'the typed rows');
// A command with neither is in the palette, not here. Listing it would put a
// column of em-dashes on the page and answer nothing.
expect(countRows(groups) === 4, 'four rows from four commands, one of them twice');
expect(!groups.some((g) => g.rows.some((r) => r.title === 'Two')), 'the unreachable row is dropped');

// Empty blocks do not print their heading.
const keysOnly = macroModel([row({ chord: 'Ctrl+1' })], [], null, VIM_LINE);
expect(keysOnly.length === 1 && keysOnly[0].name === 'Ctrl', 'no command line, no heading');
expect(macroModel([row({})], [], null, VIM_LINE).length === 0, 'nothing typeable, nothing at all');
expect(macroModel([]).length === 0 && macroModel(null).length === 0, 'no input is safe');
expect(countRows(null) === 0, 'counting nothing is zero');

// ── the active style's own maps come first ───────────────────────────────────
// Vim's `gd` and `]h`, Emacs' `C-x C-s`: real bindings that used to be listed
// NOWHERE — not the Keybindings sheet, not the palette, not here. Which-key was
// the only way to see them, and which-key answers a prefix you already knew.
const withStyle = macroModel(
  [row({ id: 'a.one', title: 'One', chord: 'Ctrl+1' })],
  [{ name: 'Vim keys', rows: [{ keys: 'gd', id: 'nav.definition', title: 'Go to Definition' }] }],
  null, VIM_LINE
);
// A `g` map and a Ctrl chord are different SHAPES, so different blocks — and the
// sequence maps lead, because they are the style's own vocabulary.
expect(withStyle.map((g) => g.name).join(',') === 'g,Ctrl',
  'the style sequence leads its own block', withStyle.map((g) => g.name).join(','));
expect(withStyle[0].rows[0].chord === 'gd', 'the sequence is the row chord');
expect(rowMatches(withStyle[0].rows[0], 'gd'), 'and the filter finds it by key');
expect(macroModel([row({ chord: 'Ctrl+1' })], [], null, VIM_LINE).length === 1,
  'no style maps, no extra heading');

// ── the filter ───────────────────────────────────────────────────────────────
const r = row({ title: 'Format Document', chord: 'Alt+Shift+F', ex: ['fmt', 'format'] });
expect(rowMatches(r, ''), 'an empty query matches everything');
expect(rowMatches(r, 'format'), 'by title');
expect(rowMatches(r, 'alt+shift'), 'by chord');
expect(rowMatches(r, 'fmt'), 'by name');
// Someone filtering a command line types the colon out of habit.
expect(rowMatches(r, ':fmt'), 'a typed colon is not a failed search');
expect(rowMatches(r, 'FORMAT'), 'case insensitively');
expect(!rowMatches(r, 'zzz'), 'and misses when it should');

console.log('OK available macros (a row earns its place by being typeable; two blocks; filter)');


// ── taken by the browser ─────────────────────────────────────────────────────
//
// ⛔ This block replaced a floating "Reserved chords" sheet whose table was a
// three-column grid in which FIVE of nine rows read `—  —`, under an orange
// headline, in a box that scrolled at nine rows. It printed a column of dashes:
// the exact thing this window exists to not do. The rule holds here too — a row
// whose answer is a dash is not a row, it is one closing line.
const FACTS = {
  fidelity: { headline: 'H', detail: 'D' },
  rows: [
    // `Ctrl+M` is bound on `EmacsHandler` and nowhere else.
    { chord: 'Ctrl+N', emacs: 'next-line', substitute: 'Ctrl+M, or Down', subStyle: 'emacs' },
    // `Alt+X` is a BelJar global — live in every style.
    { chord: 'Ctrl+Shift+P', emacs: '—', substitute: 'Alt+X' },
    { chord: 'Ctrl+Shift+N', emacs: '—', substitute: '—' },
    { chord: 'Ctrl+Tab', emacs: '—', substitute: '—' },
  ],
};

const GLOSS = (chord) => (chord === 'Alt+X' ? 'Run Command…' : '');
const res = reservedGroup(FACTS, GLOSS, null, 'emacs');
// ⛔ The heading carries the mark that a substituted key wears in the list
// above, so you can find the key where you look for keys and the explanation
// where explanations go.
expect(res.name === '* Taken by the browser', 'the block says what it is', res.name);
expect(res.rows.length === 2, 'only the chords with an answer are rows', String(res.rows.length));
expect(!res.rows.some((r) => /—/.test(r.chord) || /—/.test(r.title)),
  'and not one of them is a dash');
// The dead chord is the SUBJECT, on the left; the keys column stays pressable.
expect(res.rows[0].dead === 'Ctrl+N' && res.rows[0].chord === 'Ctrl+M, or Down',
  'the chord you reached for is the subject, the substitute is the answer');
// A chord with no Emacs meaning is glossed by what its substitute reaches.
expect(res.rows[1].title === 'Run Command…', 'a missing gloss is derived, not left blank');
// The rest are one line, not four rows of nothing.
// ⛔ Closing META ROWS, in the same left-label / right-value grammar as every
// other row — not a chatty paragraph bolted onto the end of the block.
const alsoTaken = res.meta.find((m) => m.label === 'Also taken');
expect(alsoTaken && alsoTaken.chords.join(',') === 'Ctrl+Shift+N,Ctrl+Tab',
  'the substitute-less chords are one labelled row of chips', JSON.stringify(res.meta));
expect(res.meta.some((m) => /Reclaim/.test(m.label)),
  'and the way to get them all back closes the block', JSON.stringify(res.meta));
// ⛔ The lead names no chord: the rows already do, and a prose copy of a table
// is the copy that rots.
expect(!/Ctrl\+/.test(res.lead), 'the lead does not restate the table', res.lead);
// ⛔ One short line, not a paragraph. The block used to end in two of them.
expect(res.lead.length < 70, 'and it is one short line', res.lead);
expect(reservedGroup(null) === null && reservedGroup({ rows: [] }) === null, 'no facts, no block');

// You look a reserved chord up by the chord that FAILED you.
expect(rowMatches(res.rows[0], 'ctrl+n'), 'the filter finds a row by its dead chord');

// It comes last: the window leads with what you can press.
const withRes = macroModel([row({ chord: 'Ctrl+1' })], [], res, VIM_LINE);
expect(/Taken by the browser$/.test(withRes[withRes.length - 1].name),
  'and the block closes the window', withRes.map((g) => g.name).join(','));
expect(macroModel([row({ chord: 'Ctrl+1' })], [], null, VIM_LINE).length === 1,
  'no facts, no block appended');

expect(listSentence(['a']) === 'a' && listSentence(['a', 'b']) === 'a and b'
  && listSentence(['a', 'b', 'c']) === 'a, b and c', 'the closing line reads as a sentence');


// ── "available" has to mean AVAILABLE ────────────────────────────────────────
//
// ⛔ The `:` names are only typeable where something opens the line, and the
// spelling differs. `Alt+X` under Standard opens the PALETTE, not the line; on
// the `M-x` line a name is typed WITHOUT a colon, so `:fmt` there resolves to
// nothing. Printing `:fmt` in Standard and in Emacs was wrong in both.
expect(commandLineAccess('vim').prefix === ':', 'Vim types the colon');
expect(/Normal mode/.test(commandLineAccess('vim').open), 'and : is how you open it');
expect(commandLineAccess('emacs').prefix === '', 'the M-x line takes a bare name');
expect(/M-x/.test(commandLineAccess('emacs').open), 'and M-x is how you open it');
expect(commandLineAccess('default', '') === null,
  'Standard with nothing bound has no command line at all');
const bound = commandLineAccess('default', 'Ctrl+;');
expect(bound && bound.prefix === ':' && /Ctrl\+;/.test(bound.open),
  'but a bound chord brings it back, and names the chord', JSON.stringify(bound));

// The block follows: no access, no block.
const noLine = macroModel([row({ title: 'Three', ex: ['three'] })], [], null, null);
expect(!noLine.some((g) => g.name === 'Command line'),
  'a name you cannot type is not listed', noLine.map((g) => g.name).join(','));
const emacsLine = macroModel([row({ title: 'Three', ex: ['three'] })], [], null,
  commandLineAccess('emacs'));
expect(emacsLine[0].prefix === '', 'and the block carries the style prefix down to the rows');

// ⛔ The same applies to prose. `:fullkeys` is Vim's spelling.
const resVim = reservedGroup(FACTS, () => '', commandLineAccess('vim'), 'vim');
const nameOf = (g) => (g.meta.find((m) => /Reclaim/.test(m.label)) || {}).name;
expect(nameOf(resVim) === ':fullkeys', 'Vim is told :fullkeys', nameOf(resVim));
const resEmacs = reservedGroup(FACTS, () => '', commandLineAccess('emacs'), 'emacs');
expect(nameOf(resEmacs) === 'fullkeys', 'Emacs is told fullkeys, with no colon', nameOf(resEmacs));
const resNone = reservedGroup(FACTS, () => '', null, 'default');
expect(!nameOf(resNone), 'and with no line at all the name is not offered', nameOf(resNone));


// ── a substitute only counts in the style that BINDS it ──────────────────────
//
// ⛔ `Ctrl+M`, `Alt+T`, `Ctrl+Q` and `Ctrl+U` live on `EmacsHandler` and nowhere
// else. Offering them under Standard told you to press a key that does nothing —
// the same lie as advertising a chord the browser eats, one level deeper. The
// chord is still taken, so it moves to the closing line with the rest.
const stdRes = reservedGroup(FACTS, GLOSS, null, 'default');
expect(stdRes.rows.length === 1 && stdRes.rows[0].dead === 'Ctrl+Shift+P',
  'under Standard only the substitute BelJar itself binds is offered',
  JSON.stringify(stdRes.rows.map((r) => r.dead)));
expect(stdRes.meta.find((m) => m.label === 'Also taken').chords.indexOf('Ctrl+N') >= 0,
  'and the Emacs-only one joins the closing row', JSON.stringify(stdRes.meta));
const emRes = reservedGroup(FACTS, GLOSS, null, 'emacs');
expect(emRes.rows.length === 2, 'under Emacs both are offered',
  JSON.stringify(emRes.rows.map((r) => r.dead)));
// ⛔ `kill-region` means nothing under Standard, so the Emacs gloss is Emacs-only.
expect(emRes.rows[0].title === 'next-line', 'Emacs gets the Emacs meaning');
expect(stdRes.rows[0].title === 'Run Command…',
  'Standard gets the BelJar command its substitute reaches', stdRes.rows[0].title);


// ── one name per row, but every alias still searchable ───────────────────────
//
// ⛔ `Save Now` was printing `w write wa wall` — four spellings of ONE answer, in
// a column whose entire job is to tell you what to type. A row needs the name you
// would type; the rest are muscle-memory conveniences that work whether or not a
// list mentions them. So they stay in the FILTER and leave the row.
const aliased = row({ title: 'Save Now', ex: ['w', 'write', 'wa', 'wall'] });
expect(rowMatches(aliased, 'write') && rowMatches(aliased, 'wall'),
  'a secondary alias still finds the row');
expect(rowMatches(aliased, 'w'), 'and so does the primary one');

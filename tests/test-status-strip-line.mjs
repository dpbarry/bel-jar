// The command line's grammar and completion. Pure ESM: no DOM, no registry.
import { parseCommandLine, tokenAtCaret, lineTarget } from '../js/status-strip/status-strip-parse.mjs';
import { complete, ghostFor, applyCompletion, score } from '../js/status-strip/status-strip-complete.mjs';
import { optionCandidates, optionValueCandidates } from '../js/commands/command-settings.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── parsing ───────────────────────────────────────────────────────────────────

expect(parseCommandLine('').kind === 'empty', 'empty line');
expect(parseCommandLine('   ').kind === 'empty', 'whitespace is empty');

const l = parseCommandLine('42');
expect(l.kind === 'line' && l.line === 42 && l.col === 1, 'a bare number is a line address');
const lc = parseCommandLine('42:8');
expect(lc.line === 42 && lc.col === 8, 'line:column');
expect(lineTarget(lc).line === 42, 'lineTarget');
expect(lineTarget(parseCommandLine('fmt')) === null, 'a command is not a line');
expect(parseCommandLine('42 foo').kind === 'command', '42 with an argument is not a line address');

const c = parseCommandLine('fmt');
expect(c.kind === 'command' && c.name === 'fmt' && c.bang === false, 'a plain command');
const b = parseCommandLine('w!');
expect(b.name === 'w' && b.bang === true, 'the bang is not part of the name');
expect(parseCommandLine('!').name === '!', 'a lone bang is a name, not a bang');

const a = parseCommandLine('e util.bel');
expect(a.name === 'e' && a.args.join(',') === 'util.bel', 'arguments are split off');
expect(a.argText === 'util.bel', 'argText is the raw tail');
const a2 = parseCommandLine('set ts 4');
expect(a2.args.length === 2, 'multiple arguments');

// ── caret slots ───────────────────────────────────────────────────────────────

expect(parseCommandLine('e util', 1).slot === 0, 'caret in the name is slot 0');
expect(parseCommandLine('e util', 3).slot === 1, 'caret inside the argument is slot 1');
expect(parseCommandLine('e util', 6).slot === 1, 'caret in the first argument is slot 1');
// The space matters: completion must switch sources before a character is typed.
expect(parseCommandLine('e ', 2).slot === 1, 'caret past the space is already slot 1');
expect(tokenAtCaret(parseCommandLine('e util', 6)).text === 'util', 'token at caret');
expect(tokenAtCaret(parseCommandLine('e ', 2)).text === '', 'empty token after a space');

// ── scoring ───────────────────────────────────────────────────────────────────

expect(score('fmt', 'fmt') > score('fmt', 'format'), 'an exact match outranks a longer prefix');
expect(score('fmt', 'format') > 0, 'a subsequence still matches');
expect(score('zz', 'format') < 0, 'a non-subsequence does not');
expect(score('run', 'run') > score('run', 'prune'), 'a prefix beats a buried match');

// ── titles match on a contiguous run, never a scattered subsequence ───────────
// A command line is where you type a NAME. Scoring titles loosely made `:ru`
// offer "Format Document", through the r of Format and the u of Document.
const byTitle = complete('ru', 2, {
  commands: () => [
    { value: 'fmt', label: 'Format Document' },
    { value: 'run', label: 'Run File' },
  ],
  files: () => [], options: () => [],
});
expect(byTitle.items.length === 1 && byTitle.items[0].value === 'run',
  'a scattered title match is refused', byTitle.items.map((i) => i.value).join(','));
const titleWord = complete('document', 8, {
  commands: () => [{ value: 'fmt', label: 'Format Document' }],
  files: () => [], options: () => [],
});
expect(titleWord.items.length === 1, 'a real word in the title still finds it');
// An alias is a name, so it keeps the fuzzy score.
const byAlias = complete('fo', 2, {
  commands: () => [{ value: 'fmt', label: 'Format Document', aliases: ['format'] }],
  files: () => [], options: () => [],
});
expect(byAlias.items.length === 1, 'aliases are matched as names');

// ── completion ────────────────────────────────────────────────────────────────

const commands = () => [
  { value: 'fmt', label: 'Format Document', args: [] },
  { value: 'format', label: 'Format Document', args: [] },
  { value: 'e', label: 'Open File', args: [{ kind: 'file' }] },
  { value: 'set', label: 'Set Option', args: [{ kind: 'option' }] },
  { value: 'run', label: 'Run File', args: [] },
];
const files = () => [{ value: 'util.bel' }, { value: 'main.bel' }, { value: 'lemmas.bel' }];
const options = () => [{ value: 'nu' }, { value: 'wrap' }];
const src = { commands, files, options };

const cf = complete('f', 1, src);
expect(cf.kind === 'command', 'slot 0 completes command names');
expect(cf.items[0].value === 'fmt' || cf.items[0].value === 'format', 'names rank first', cf.items[0].value);
expect(cf.ghost === 'mt' || cf.ghost === 'ormat', 'ghost is the remainder of the best match', cf.ghost);

const ce = complete('e ', 2, src);
expect(ce.kind === 'file', 'after `e ` the source switches to files');
expect(ce.items.length === 3, 'all files offered with an empty query');
const ceu = complete('e u', 3, src);
expect(ceu.items[0].value === 'util.bel', 'files rank by the typed prefix');
expect(ceu.ghost === 'til.bel', 'ghost completes the path', ceu.ghost);

const cs = complete('set n', 5, src);
expect(cs.kind === 'option' && cs.items[0].value === 'nu', 'option arguments complete too');

expect(complete('42', 2, src).kind === 'line', 'a line address offers nothing to complete');
expect(complete('', 0, src).items.length === 5, 'an empty line lists every command');
expect(complete('zzz', 3, src).items.length === 0, 'no matches, no items');
expect(complete('zzz', 3, src).ghost === '', 'and no ghost');

// ── ghost text ────────────────────────────────────────────────────────────────

expect(ghostFor('fo', [{ value: 'format' }]) === 'rmat', 'ghost is the tail');
expect(ghostFor('fo', [{ value: 'Format' }]) === 'rmat', 'ghost is case-insensitive on the prefix');
expect(ghostFor('xy', [{ value: 'format' }]) === '', 'no ghost when the best match is not a prefix');
expect(ghostFor('', [{ value: 'format' }]) === '', 'no ghost before anything is typed');

// ── applying ──────────────────────────────────────────────────────────────────

const ap = applyCompletion('e u', 3, 'util.bel');
expect(ap.text === 'e util.bel' && ap.caret === 10, 'a completion replaces the caret token', JSON.stringify(ap));
const ap2 = applyCompletion('fo', 2, 'format');
expect(ap2.text === 'format' && ap2.caret === 6, 'and works on the command name');
const ap3 = applyCompletion('e ', 2, 'main.bel');
expect(ap3.text === 'e main.bel', 'inserting into an empty slot appends', ap3.text);

// ── ⛔ the completer must know the grammar the PARSER already implements ──────
//
// `parseSet` has always understood `nu`, `nonu`, `nu!` and `ts=4`, and
// `parseCommandLine` has always split the bang off `w!`. The completer knew
// none of it, and the line's red "unknown" tint is driven by *the candidate
// list being empty* — so a perfectly valid line, mid-typing, went red and its
// list said "No matching command":
//
//     :set ts=     ← the instant the `=` was typed
//     :w!          ← the most-typed ex command there is
//
// One grammar, two halves, and only one of them knew it.
{
  const settingsCommands = () => [
    { value: 'set', label: 'Set Option', aliases: ['se'], args: [{ kind: 'option' }] },
    { value: 'w', label: 'Save Now', aliases: ['write'], args: [] },
    { value: 'e', label: 'Open File', aliases: ['edit'], args: [{ kind: 'file' }] },
  ];
  const gsrc = {
    commands: settingsCommands,
    files: () => [{ value: 'util.bel' }],
    options: () => optionCandidates(),
    optionValues: (n) => optionValueCandidates(n),
  };
  const at = (line) => complete(line, line.length, gsrc);

  // `:set ts=` — the screenshot bug.
  const eq = at('set ts=');
  expect(eq.kind === 'option-value', '`set ts=` completes a VALUE, not a command name', eq.kind);
  expect(eq.items.map((i) => i.value).join(',') === '2,4',
    'and offers that setting own values', eq.items.map((i) => i.value).join(','));
  expect(eq.known === true, 'and the line is KNOWN — `set` is a real command');
  expect(at('set ts=4').items.length === 1, '`set ts=4` narrows to the value typed');
  expect(at('set ts=9').known === true,
    'a value that does not exist does not make the COMMAND unknown');

  // The value completion replaces only the value.
  const applied = applyCompletion('set ts=', 7, '4', eq.token);
  expect(applied.text === 'set ts=4' && applied.caret === 8,
    'accepting a value keeps `set ts=` in front of it', JSON.stringify(applied));

  // `:w!` — the bang is grammar, not part of the name.
  const bang = at('w!');
  expect(bang.items.length === 1 && bang.items[0].value === 'w',
    '`w!` still finds `w` — the bang is grammar', JSON.stringify(bang.items));
  expect(at('set nu!').items.length > 0, 'and so is a bang on an option');
  const nameToken = at('set nu!').token;
  expect(applyCompletion('set nu!', 7, 'line-numbers', nameToken).text === 'set line-numbers!',
    'completing a banged option keeps the bang');

  // vi negation completes, because `parseSet` accepts it.
  const neg = at('set nonu');
  expect(neg.items.some((i) => i.value === 'nonumber' || i.value === 'nonu'),
    '`set nonu` offers the negated forms', neg.items.slice(0, 3).map((i) => i.value).join(','));
  expect(optionValueCandidates('wrap').length === 0,
    'a boolean offers no `=` values — `:set wrap=true` is not vi');

  // An argument that matches nothing is still not an unknown COMMAND.
  expect(at('e nosuch').known === true, 'a missing file does not make `:e` unknown');
  expect(at('set zzz').known === true, 'a missing option does not make `:set` unknown');
  expect(at('zzz').known === undefined, 'slot 0 has no name to be known yet');
}

import { blurRestoreOnClose } from '../js/status-strip/status-strip-line-ui.mjs';

expect(blurRestoreOnClose(true) === true, 'search blur restores selection');
expect(blurRestoreOnClose(false) === false, 'command blur does not restore');

console.log('OK status strip line (grammar, caret slots, `:set` and bang grammar, ghost text)');

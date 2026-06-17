// Command palette pure logic — fuzzy scorer, input-mode parsing, ranking, and
// the command registry (js/command-palette.js). DOM-shimmed like
// test-scroll-fade.mjs: the IIFE attaches to a fake window; UI code paths are
// lazy (built on open) so loading never touches the DOM.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'js', 'command-palette.js'), 'utf8');
const fakeWindow = {};
// eslint-disable-next-line no-new-func
new Function('window', src)(fakeWindow);
const CP = fakeWindow.CommandPalette;
expect(CP && CP._pure && typeof CP._pure.fuzzyScore === 'function', 'CommandPalette._pure is exported');

const { fuzzyScore, parseInput, rankItems, formatShortcut } = CP._pure;

// ── fuzzyScore ────────────────────────────────────────────────────────────────

expect(fuzzyScore('', 'anything').score === 0, 'empty query matches everything with score 0');
expect(fuzzyScore('xyz', 'abc') === null, 'non-subsequence → null');
expect(fuzzyScore('abc', 'ab') === null, 'query longer than text → null');

// Subsequence positions are recorded for highlighting.
const m = fuzzyScore('gtd', 'Go to Definition');
expect(m !== null, '"gtd" is a subsequence of "Go to Definition"');
expect(JSON.stringify(m.positions) === JSON.stringify([0, 3, 6]), 'word-start positions chosen greedily');

// Word-start matches outrank buried matches.
const wordStart = fuzzyScore('find', 'Find References').score;
const buried = fuzzyScore('find', 'Unfindable').score;
expect(wordStart > buried, 'word-start match scores above mid-word match');

// A word-start run outranks the same letters buried mid-word.
const run = fuzzyScore('form', 'Format Document').score;
const midWord = fuzzyScore('form', 'Performance Mode').score;
expect(run > midWord, 'prefix run beats mid-word run');

// With no word-start bonuses in play, consecutive beats scattered.
expect(fuzzyScore('ac', 'acb').score > fuzzyScore('ac', 'abc').score,
  'consecutive pair beats gapped pair');

// Case-insensitive.
expect(fuzzyScore('UNDO', 'Undo') !== null, 'matching is case-insensitive');

// camelCase humps count as word starts.
const hump = fuzzyScore('cf', 'closeFile');
expect(hump !== null && hump.positions[1] === 5, 'camelCase hump is matched as a word start');

// ── parseInput ────────────────────────────────────────────────────────────────

expect(parseInput('').mode === 'commands', 'empty input → commands mode');
expect(parseInput('rename').mode === 'commands', 'plain text → commands mode');
expect(parseInput('@step').mode === 'symbols', '@ prefix → symbols mode');
expect(parseInput('@step').query === 'step', '@ prefix stripped from query');
expect(parseInput('@').query === '', 'bare @ → symbols mode, empty query');
expect(parseInput('>form').mode === 'commands' && parseInput('>form').query === 'form',
  '> prefix (VS Code muscle memory) → commands mode, prefix stripped');

// ── rankItems ─────────────────────────────────────────────────────────────────

const items = [
  { title: 'New File…', section: 'File' },
  { title: 'Format Document', section: 'Edit' },
  { title: 'Find…', section: 'Edit' },
  { title: 'Toggle Theme', section: 'View' },
];

// Empty query preserves registration order.
let out = rankItems(items, '');
expect(out.length === 4 && out[0].title === 'New File…', 'empty query → original order');
expect(out[0]._match === null, 'empty query → no highlight positions');

// Query filters and sorts by score.
out = rankItems(items, 'fo');
expect(out.length >= 1 && out[0].title === 'Format Document', '"fo" ranks Format Document first');
expect(Array.isArray(out[0]._match), 'matches carry highlight positions');

// Non-matching items are dropped.
out = rankItems(items, 'zzz');
expect(out.length === 0, 'no matches → empty result');

// Detail acts as a half-weight fallback when the title misses.
out = rankItems([{ title: 'main.bel', detail: 'Switch to file' }], 'switch');
expect(out.length === 1 && out[0]._match === null, 'detail match included without title highlights');

// Limit respected.
const many = Array.from({ length: 80 }, (_, i) => ({ title: 'cmd' + i }));
expect(rankItems(many, '', 50).length === 50, 'empty-query results capped at limit');
expect(rankItems(many, 'cmd', 50).length === 50, 'filtered results capped at limit');

// ── formatShortcut ────────────────────────────────────────────────────────────

expect(formatShortcut('Mod+K', false) === 'Ctrl+K', 'Mod → Ctrl on non-mac');
expect(formatShortcut('Mod+K', true) === '⌘K', 'Mod → ⌘ joined without + on mac');
expect(formatShortcut('Mod+Shift+O', true) === '⌘⇧O', 'Shift → ⇧ on mac');
expect(formatShortcut('Alt+←', false) === 'Alt+←', 'non-modifier keys pass through');

// ── registry ──────────────────────────────────────────────────────────────────

let ran = 0;
CP.register({ id: 'a', title: 'Alpha', section: 'S', run: () => ran++ });
CP.register({ id: 'b', title: 'Beta', section: 'S', run: () => {}, when: () => false });
CP.register({ id: 'c', title: 'Gamma', section: 'S', run: () => {}, when: () => { throw new Error('boom'); } });

let active = CP._registry.activeCommands();
expect(active.some((c) => c.id === 'a'), 'command without when() is active');
expect(!active.some((c) => c.id === 'b'), 'when() === false hides the command');
expect(!active.some((c) => c.id === 'c'), 'throwing when() hides the command (no crash)');

// Re-register replaces, unregister removes.
CP.register({ id: 'a', title: 'Alpha 2', run: () => {} });
active = CP._registry.activeCommands();
expect(active.filter((c) => c.id === 'a').length === 1, 're-register does not duplicate');
expect(active.find((c) => c.id === 'a').title === 'Alpha 2', 're-register replaces the entry');
CP.unregister('a');
expect(!CP._registry.activeCommands().some((c) => c.id === 'a'), 'unregister removes the command');

// Invalid registrations are ignored.
CP.register({ id: 'no-run', title: 'Missing run' });
CP.register(null);
expect(!CP._registry.activeCommands().some((c) => c.id === 'no-run'), 'command without run() is rejected');

console.log('OK command palette (fuzzy scorer, mode parsing, ranking, shortcut labels, registry)');

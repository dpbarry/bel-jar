// Command palette pure logic — fuzzy scorer, input-mode parsing, ranking, and
// the command registry (js/ui/command-palette.js). DOM-shimmed like
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
const src = readFileSync(join(here, '..', 'js', 'ui', 'command-palette.js'), 'utf8');
// eslint-disable-next-line no-new-func
new Function(src)();
const CP = globalThis.CommandPalette;
expect(CP && CP._pure && typeof CP._pure.fuzzyScore === 'function', 'CommandPalette._pure is exported');

const {
  fuzzyScore,
  parseInput,
  rankItems,
  formatShortcut,
  parseLineQuery,
  substringPositions,
  MODE_PREFIX,
} = CP._pure;

// ── fuzzyScore ────────────────────────────────────────────────────────────────

expect(fuzzyScore('', 'anything').score === 0, 'empty query matches everything with score 0');
expect(fuzzyScore('xyz', 'abc') === null, 'non-subsequence → null');
expect(fuzzyScore('abc', 'ab') === null, 'query longer than text → null');

const m = fuzzyScore('gtd', 'Go to Definition');
expect(m !== null, '"gtd" is a subsequence of "Go to Definition"');
expect(JSON.stringify(m.positions) === JSON.stringify([0, 3, 6]), 'word-start positions chosen greedily');

const wordStart = fuzzyScore('find', 'Find References').score;
const buried = fuzzyScore('find', 'Unfindable').score;
expect(wordStart > buried, 'word-start match scores above mid-word match');

const run = fuzzyScore('form', 'Format Document').score;
const midWord = fuzzyScore('form', 'Performance Mode').score;
expect(run > midWord, 'prefix run beats mid-word run');

expect(fuzzyScore('ac', 'acb').score > fuzzyScore('ac', 'abc').score,
  'consecutive pair beats gapped pair');

expect(fuzzyScore('UNDO', 'Undo') !== null, 'matching is case-insensitive');

const hump = fuzzyScore('cf', 'closeFile');
expect(hump !== null && hump.positions[1] === 5, 'camelCase hump is matched as a word start');

// ── parseInput ────────────────────────────────────────────────────────────────

expect(parseInput('').mode === 'anywhere', 'empty input → anywhere mode');
expect(parseInput('rename').mode === 'anywhere', 'plain text → anywhere mode');
expect(parseInput('@step').mode === 'symbols', '@ prefix → symbols mode');
expect(parseInput('@step').query === 'step', '@ prefix stripped from query');
expect(parseInput('@').query === '', 'bare @ → symbols mode, empty query');
expect(parseInput('>form').mode === 'commands' && parseInput('>form').query === 'form',
  '> prefix → commands mode, prefix stripped');
expect(parseInput('%foo').mode === 'search' && parseInput('%foo').query === 'foo',
  '% prefix → search mode');
expect(parseInput('#foo').mode === 'search' && parseInput('#foo').legacyHash === true,
  '# soft-redirects to search with legacyHash');
expect(parseInput('#foo').query === 'foo', '# query stripped');
expect(parseInput(':12').mode === 'line' && parseInput(':12').query === '12',
  ': prefix → line mode');
expect(parseInput('!err').mode === 'problems' && parseInput('!err').query === 'err',
  '! prefix → problems mode');
expect(parseInput('/nat').mode === 'library' && parseInput('/nat').query === 'nat',
  '/ prefix → library mode');
expect(parseInput('?').mode === 'help', '? prefix → help mode');

expect(MODE_PREFIX.search === '%', 'MODE_PREFIX.search is %');
expect(MODE_PREFIX.commands === '>', 'MODE_PREFIX.commands is >');
expect(MODE_PREFIX.anywhere === '', 'MODE_PREFIX.anywhere is empty');

// ── parseLineQuery / substringPositions ───────────────────────────────────────

expect(parseLineQuery('42')?.line === 42 && parseLineQuery('42')?.col === 1, 'line-only query');
expect(parseLineQuery('12:8')?.line === 12 && parseLineQuery('12:8')?.col === 8, 'line:col query');
expect(parseLineQuery('abc') === null, 'garbage line query → null');
expect(parseLineQuery('0') === null, 'line 0 rejected');

const sub = substringPositions('lam', 'fn lam x');
expect(sub && sub[0] === 3 && sub.length === 3, 'substring highlight positions');

// ── rankItems ─────────────────────────────────────────────────────────────────

const items = [
  { title: 'New file…', section: 'File' },
  { title: 'Format Document', section: 'Edit' },
  { title: 'Find…', section: 'Edit' },
  { title: 'Toggle Theme', section: 'View' },
];

let out = rankItems(items, '');
expect(out.length === 4 && out[0].title === 'New file…', 'empty query → original order');
expect(out[0]._match === null, 'empty query → no highlight positions');

out = rankItems(items, 'fo');
expect(out.length >= 1 && out[0].title === 'Format Document', '"fo" ranks Format Document first');
expect(Array.isArray(out[0]._match), 'matches carry highlight positions');

out = rankItems(items, 'zzz');
expect(out.length === 0, 'no matches → empty result');

out = rankItems([{ title: 'main.bel', detail: 'Switch to file' }], 'switch');
expect(out.length === 1 && out[0]._match === null, 'detail match included without title highlights');

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

CP.register({ id: 'a', title: 'Alpha 2', run: () => {} });
active = CP._registry.activeCommands();
expect(active.filter((c) => c.id === 'a').length === 1, 're-register does not duplicate');
expect(active.find((c) => c.id === 'a').title === 'Alpha 2', 're-register replaces the entry');
CP.unregister('a');
expect(!CP._registry.activeCommands().some((c) => c.id === 'a'), 'unregister removes the command');

CP.register({ id: 'no-run', title: 'Missing run' });
CP.register(null);
expect(!CP._registry.activeCommands().some((c) => c.id === 'no-run'), 'command without run() is rejected');

console.log('OK command palette (fuzzy scorer, mode parsing, ranking, shortcut labels, registry)');

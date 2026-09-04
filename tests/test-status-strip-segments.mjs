// Status strip segment model — the dashboard contract.
// Pure ESM: no DOM, no globals, no built leaf needed.
import { readFileSync } from 'node:fs';
import { buildSegments, isResting, SEGMENT_ORDER, DETAIL_LEVELS } from '../js/status-strip/status-strip-segments.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const base = { style: 'default', hasFile: true, line: 12, col: 4 };
const keys = (s, d) => buildSegments(s, d).map((x) => x.key);
const find = (s, k, d) => buildSegments(s, d).find((x) => x.key === k);

// ── it always says something worth the row it occupies ────────────────────────
expect(keys(base).indexOf('position') >= 0, 'position is always there with a file');
expect(keys(base).indexOf('checker') >= 0, 'the checker always speaks — silence reads as "is it on?"');
expect(find(base, 'checker').text === 'Checked', 'a clean settled file says so in words');
// With no file open there is still one useful thing to offer: the command list.
expect(keys({ style: 'default', hasFile: false }).length === 0, 'with no file the bar has nothing to say');

// ── the proof-state segments are the point ────────────────────────────────────
const inHole = { ...base, goal: '[ |- eq A A]', holes: 3 };
expect(find(inHole, 'goal').text === '[ |- eq A A]', 'the goal segment carries the bare type');
expect(find(inHole, 'goal').mark === '⊢', 'the turnstile is a separate marker, not part of the type');
expect(find(inHole, 'goal').render === 'type', 'the goal is rendered as syntax-highlighted Beluga');
expect(find(inHole, 'goal').grow === true, 'the goal takes the slack');
expect(find(inHole, 'goal').action === 'open-harpoon', 'clicking the goal opens Harpoon');
expect(find(inHole, 'holes').text === '+2 more', 'standing in a hole, the counter shows the rest');
expect(find({ ...base, goal: 'x', holes: 1 }, 'holes').text === 'last hole', 'the final hole says so');
expect(find({ ...base, holes: 4 }, 'holes').text === '4 holes', 'outside a hole it is a plain count');
expect(find(base, 'holes') === undefined, 'no holes, no hole segment');

const longGoal = { ...base, goal: 'x'.repeat(200) };
expect(find(longGoal, 'goal').text.length < 60, 'a long goal is truncated for the bar');
expect(find(longGoal, 'goal').title.indexOf('x'.repeat(200)) >= 0, 'the full goal survives in the tooltip');

// ── checker speaks in words, not just colour ──────────────────────────────────
expect(find({ ...base, checking: true }, 'checker').text === 'Checking…', 'working checker');
expect(find({ ...base, checking: true, parsePercent: 42 }, 'checker').text === 'Parsing 42%', 'parse progress');
expect(find({ ...base, errors: 3 }, 'checker').text === '3 errors', 'errors counted in words');
expect(find({ ...base, warnings: 1 }, 'checker').text === '1 warning', 'singular warning');
expect(find({ ...base, errors: 2, warnings: 1 }, 'problems').text === '2× 1⚠', 'problems are compact');
expect(find({ ...base, errors: 2 }, 'problems').action === 'next-problem', 'problems jump to the next one');

// ── Orca ──────────────────────────────────────────────────────────────────────
expect(find(base, 'orca') === undefined, 'Orca is silent when not searching');
expect(find({ ...base, orca: true }, 'orca').text === 'Orca searching…', 'Orca announces itself');
expect(find({ ...base, orca: true, orcaDetail: '18 moves' }, 'orca').text === 'Orca · 18 moves', 'with detail when given');

// ── layout ────────────────────────────────────────────────────────────────────
const laid = keys({ ...base, goal: 'g', holes: 2, errors: 1 });
expect(laid.indexOf('spacer') > laid.indexOf('problems'), 'the spacer follows the left group');
expect(laid.indexOf('checker') > laid.indexOf('spacer'), 'the checker rides the right edge');
expect(buildSegments({ hasFile: false }, 'compact').filter((s) => s.spacer).length === 0,
  'a trailing spacer with nothing after it is dropped');

// ── verbosity is the user's call, not a hidden cap ───────────────────────────
const loud = { ...base, style: 'vim', mode: 'INSERT', selChars: 40, selLines: 3, goal: 'g', holes: 2, errors: 1, warnings: 1, symbols: 27, orca: true };
expect(keys(loud, 'detailed').indexOf('symbols') >= 0, 'Detailed adds the declaration count');
expect(keys(loud, 'standard').indexOf('symbols') < 0, 'Standard leaves it out');
expect(keys(loud, 'compact').indexOf('selection') < 0, 'Compact drops selection');
expect(keys(loud, 'compact').indexOf('goal') >= 0, 'Compact keeps the goal — it is the point');
expect(buildSegments(loud, 'detailed').length > buildSegments(loud, 'compact').length, 'Detailed > Compact');
expect(DETAIL_LEVELS.join(',') === 'compact,standard,detailed', 'three levels');
expect(SEGMENT_ORDER.indexOf('goal') >= 0 && SEGMENT_ORDER.indexOf('holes') >= 0, 'proof state is declared');

// ── keymap, mode and command are three separate facts ─────────────────────────
// ⛔ They were one badge that said `EMACS`, then `MARK` *instead of* it, then
// `EMACS C-x` — as though Mark and C-x were rival keymaps. Layers, not choices.
const seg = (st, k) => buildSegments(st).find((x) => x.key === k);

expect(seg(base, 'keymap').text === 'Standard', 'the keymap segment names the keymap');
expect(seg(base, 'keymap').tone === 'plain', 'and carries no state colour');
expect(keys({ style: 'vim', hasFile: false }).indexOf('keymap') < 0,
  'with no file there is no keymap to be in');

expect(keys(base).indexOf('mode') < 0, 'Standard has no mode to show');
expect(seg({ ...base, style: 'vim', mode: 'INSERT' }, 'mode').tone === 'insert', 'insert tone');
expect(seg({ ...base, style: 'vim', mode: 'V-LINE' }, 'mode').tone === 'visual', 'visual tone');
expect(seg({ ...base, style: 'vim', mode: 'INSERT' }, 'keymap').text === 'Vim',
  'and the keymap still says Vim while the mode changes under it');

// Emacs is modeless except for the mark — and MARK never replaces the keymap.
expect(keys({ ...base, style: 'emacs' }).indexOf('mode') < 0, 'Emacs at rest has no mode');
expect(seg({ ...base, style: 'emacs', mark: true }, 'mode').text === 'MARK', 'the mark is a mode');
expect(seg({ ...base, style: 'emacs', mark: true }, 'keymap').text === 'Emacs',
  'and Emacs is still Emacs while it is set');

// A half-typed chord is its own segment, in the command zone.
expect(keys(base).indexOf('command') < 0, 'nothing pending, no command segment');
expect(seg({ ...base, style: 'vim', mode: 'NORMAL', pending: '2d' }, 'command').text === '2d',
  'a pending chord stands alone');
expect(seg({ ...base, style: 'vim', mode: 'NORMAL', pending: '2d' }, 'mode').text === 'NORMAL',
  'and the mode is untouched by it');
expect(seg({ ...base, style: 'emacs', pending: 'C-x' }, 'command').text === 'C-x',
  'the same for an Emacs chain');

// Order: keymap, position, mode, command — the reading order of the sentence.
const ordered = keys({ ...base, style: 'vim', mode: 'NORMAL', pending: 'g' });
expect(ordered.indexOf('keymap') < ordered.indexOf('position'), 'keymap first');
expect(ordered.indexOf('position') < ordered.indexOf('mode'), 'then where you are');
expect(ordered.indexOf('mode') < ordered.indexOf('command'), 'then the mode, then what is pending');

// ⛔ Every mode the builder can emit must be a DIFFERENT colour. `is-insert`
// once resolved to the same value as the base rule, so NORMAL and INSERT — the
// one distinction a Vim user reads at a glance — were the same word in the same
// colour. A tone with no rule of its own is that bug waiting to happen again.
const css = readFileSync(new URL('../css/status-strip.css', import.meta.url), 'utf8');
const colourOf = (tone) => {
  const at = css.indexOf('.bj-strip__seg--mode.is-' + tone + ' ');
  if (at < 0) return null;
  const rule = css.slice(at, css.indexOf('}', at));
  const c = rule.match(/color:\s*([^;]+);/);
  return c ? c[1].trim() : null;
};
const seen = new Map();
for (const m of ['NORMAL', 'INSERT', 'VISUAL', 'V-LINE', 'V-BLOCK', 'REPLACE']) {
  const tone = seg({ ...base, style: 'vim', mode: m }, 'mode').tone;
  const colour = colourOf(tone);
  expect(colour, `${m} → tone "${tone}" has its own colour rule`);
  if (seen.has(colour)) {
    expect(seen.get(colour) === tone, `${m} (${tone}) reuses the colour of ${seen.get(colour)}`);
  }
  seen.set(colour, tone);
}
expect(colourOf(seg({ ...base, style: 'emacs', mark: true }, 'mode').tone), 'and so does MARK');

// A badge, not a button: nothing that looks pressable may be a no-op.
expect(seg({ ...base, style: 'vim', mode: 'NORMAL' }, 'mode').action === undefined,
  'the mode badge is a label, not a clickable no-op');
expect(buildSegments({ ...base, holes: 2 }).find((x) => x.key === 'holes').action === 'next-hole',
  'the holes segment does jump');
expect(isResting(buildSegments(base)) === false, 'position + checker is not "resting"');

console.log('OK status strip segments (goal, holes, checker in words, Orca, verbosity levels)');

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
const inHole = { ...base, inHole: true, goal: '[ |- eq A A]', holes: 3 };
expect(find(inHole, 'goal').text === '[ |- eq A A]', 'the goal segment carries the bare type');
expect(find(inHole, 'goal').mark === '⊢', 'the turnstile is a separate marker, not part of the type');
expect(find(inHole, 'goal').render === 'type', 'the goal is rendered as syntax-highlighted Beluga');
expect(find(inHole, 'goal').grow === true, 'the goal takes the slack');
expect(find(inHole, 'goal').action === 'open-harpoon', 'clicking the goal opens Harpoon');
expect(find(inHole, 'holes').text === '+2 more', 'standing in a hole, the counter shows the rest');
expect(find({ ...base, inHole: true, goal: 'x', holes: 1 }, 'holes') === undefined,
  'standing in the only hole: no count, and no button that goes nowhere');
expect(find({ ...base, holes: 4 }, 'holes').text === '4 holes', 'outside a hole it is a plain count');
expect(find(base, 'holes') === undefined, 'no holes, no hole segment');

const longGoal = { ...base, inHole: true, goal: 'x'.repeat(200) };
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
const laid = keys({ ...base, inHole: true, goal: 'g', holes: 2, errors: 1 });
expect(laid.indexOf('spacer') > laid.indexOf('problems'), 'the spacer follows the left group');
expect(laid.indexOf('checker') > laid.indexOf('spacer'), 'the checker rides the right edge');
expect(buildSegments({ hasFile: false }, 'compact').filter((s) => s.spacer).length === 0,
  'a trailing spacer with nothing after it is dropped');

// ── a second tab is a strip warning, leftmost of the right-hand group ────────
expect(find(base, 'tab') === undefined, 'quiet when this is the only tab');
const conflicted = { ...base, tabConflict: true, undoDepth: 2 };
expect(find(conflicted, 'tab').text === 'Open in another tab', 'the chip names the condition');
expect(find(conflicted, 'tab').title === 'Both tabs save to the same files. The later save overwrites the other.',
  'the tooltip says what two tabs share, without a lecture');
expect(find(conflicted, 'tab').tone === 'warning', 'and it is a warning');
expect(find(conflicted, 'tab').action === undefined, 'it is a standing label, not a button');
const conflictedKeys = keys(conflicted);
expect(conflictedKeys.indexOf('spacer') < conflictedKeys.indexOf('tab'),
  'on the right-hand side of the spacer');
expect(conflictedKeys.indexOf('tab') < conflictedKeys.indexOf('history'),
  'leftmost of the right group — before History');
expect(keys({ tabConflict: true, hasFile: false }).indexOf('tab') >= 0,
  'it speaks even with no file open: the conflict is the project, not the buffer');
for (const level of DETAIL_LEVELS) {
  const at = keys(conflicted, level);
  expect(at.indexOf('tab') >= 0 && at.indexOf('tab') < at.indexOf('history'),
    `${level} keeps the warning before History`);
}

// ── verbosity is the user's call, not a hidden cap ───────────────────────────
const loud = { ...base, style: 'vim', mode: 'INSERT', selChars: 40, selLines: 3, inHole: true, goal: 'g', holes: 2, errors: 1, warnings: 1, symbols: 27, orca: true };
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
  const at = css.indexOf('.jar-strip__seg--mode.is-' + tone + ' ');
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

// ── REC: the one state you can lose work to ───────────────────────────────
// A user with REC on the bar had to ask out loud how to stop it. The chip must
// carry the answer, and the answer has to survive the mode you are in.
const recording = (extra) => ({ ...base, macro: { recording: true, stop: 'q', ...extra } });
expect(seg({ ...base, macro: null }, 'macro') === undefined, 'not recording, no chip');
expect(seg(recording(), 'macro').text === 'REC', 'recording says REC');
expect(seg(recording({ label: '@a' }), 'macro').text === 'REC @a', 'and names the register when there is one');
expect(seg(recording(), 'macro').action === 'macro-stop',
  'the chip stops the recording — a state you cannot leave is a trap, not a status');

// ⚠ The tone must be one the STYLESHEET honours. `error` was declared here for
// weeks with rules only under `--problems` and `--checker`, so the chip that
// must not be missed rendered in the resting grey.
const macroTone = seg(recording(), 'macro').tone;
expect(css.indexOf('.jar-strip__seg--macro.is-' + macroTone) >= 0,
  `REC's tone "${macroTone}" has a colour rule of its own`);

// The stop key comes from the ENGINE (`macro-keys.mjs`); all the builder adds is
// whether it can be reached from the mode you are in.
expect(/press q to stop/i.test(seg({ ...recording(), style: 'vim', mode: 'NORMAL' }, 'macro').title),
  'in Vim Normal mode the chip names `q`');
expect(/press esc then q to stop/i.test(seg({ ...recording(), style: 'vim', mode: 'INSERT' }, 'macro').title),
  'in Insert mode it says Esc first — `q` there types the letter q');
expect(/press esc then q/i.test(seg({ ...recording(), style: 'vim', mode: 'V-BLOCK' }, 'macro').title),
  'and the same in Visual');
expect(/click to stop, or run the command again/i.test(seg({ ...recording({ stop: '' }) }, 'macro').title),
  'with nothing bound it offers the click instead of naming a key nobody has');
expect(!/press/i.test(seg({ ...recording({ stop: '' }) }, 'macro').title),
  'and never names a chord that does not exist');

// ── the goal chip has THREE states ────────────────────────────────────
// Being IN a hole and KNOWING its goal are different facts. Folded into one
// string, a hole whose goal the checker had not produced yet reported as no
// hole at all: you stood on a fresh `?` and the bar said nothing.
expect(seg({ ...base, inHole: false, goal: '' }, 'goal') === undefined, 'not in a hole, no chip');
const pending = { ...base, inHole: true, goal: '', holes: 2, goalPending: true };
expect(seg(pending, 'goal').text === 'Computing…', 'in a hole with no goal yet, the chip holds a placeholder');
expect(seg(pending, 'goal').mark === '⊢', 'and keeps the turnstile, so the chip does not jump when the goal lands');
expect(seg(pending, 'goal').render !== 'type', 'a placeholder is not syntax-highlighted — there is no syntax yet');
expect(seg(pending, 'goal').action === undefined,
  'and it is not a button: an action that cannot work yet is worse than none');

// ⛔ `Computing…` only while something computes. A hole inside a declaration
// that failed to check never gets a goal, and a spinner that never resolves is
// a lie told slowly.
expect(seg({ ...pending, goalPending: false }, 'goal').text === 'No goal',
  'settled with no goal says so instead of computing forever');
expect(seg({ ...pending, goalPending: false }, 'goal').title.indexOf('has not checked') > 0,
  'and the tooltip says why');

// The count beside it keys on the same fact, or it counts the hole you are in.
expect(seg(pending, 'holes').text === '+1 more', 'the hole count knows you are standing in one');
expect(seg({ ...pending, holes: 1 }, 'holes') === undefined, 'even with the goal still computing');

// ── sync: only what needs the person (docs/UI.md; the cloud says the rest) ──
const syncOf = (x) => ({ ...base, sync: { signedIn: true, state: 'synced', differs: [], notices: true, ...x } });
const file1 = [{ pid: 'p', fid: 'f', path: 'a.bel', source: 'device' }];
expect(find(syncOf({}), 'sync') === undefined, 'synced: the cloud says it; the strip says nothing');
expect(find(syncOf({ state: 'syncing' }), 'sync') === undefined, 'syncing is not the strip\'s news either');
expect(find(syncOf({ state: 'differs', differs: file1 }), 'sync').text === '1 file to review'
  && find(syncOf({ state: 'differs', differs: file1 }), 'sync').action === 'review-differences', 'files to review open the review');
expect(find({ ...base, sync: { signedIn: false, state: 'differs', differs: file1 } }, 'sync').text === '1 file to review',
  'files to review show signed out too (two tabs)');
expect(find({ ...base, sync: { signedIn: false, state: 'off', differs: [] } }, 'sync') === undefined, 'signed out, nothing else');
expect(find(syncOf({ state: 'offline' }), 'sync').text === 'Offline', 'offline, with "Say when you go offline" on');
expect(find(syncOf({ state: 'offline', notices: false }), 'sync') === undefined, 'and silent with it off');
const held = find(syncOf({ state: 'held', notices: false }), 'sync');
expect(held && held.text === 'Changes made offline' && held.action === 'review-offline' && held.tone === 'warning',
  'edits held for the person: the strip says so, and opens the review, whatever the notices setting');
expect(find(syncOf({ state: 'error' }), 'sync').action === 'sync-now', 'could not sync: the strip offers Sync now');

// ── proofs finished: a per-proof measure, never a hole count ─────────────────
const proofsOf = (done, total, names = []) => ({
  ...base, holes: 3, proofs: { done, total, unfinished: names.map((name) => ({ name })) },
});
const prog = find(proofsOf(5, 8, ['a', 'b', 'c']), 'progress');
expect(prog.text === '5/8' && prog.sub === 'proved', 'the count and its unit are separate parts');
expect(prog.meter === 5 / 8, 'the ring carries the same fraction');
expect(prog.action === 'next-unfinished' && prog.command === 'nav.next-unfinished', 'clicking goes to the next unfinished proof');
expect(prog.title.startsWith('Unfinished: a, b and c\n'), 'the tooltip names what is left');
expect(prog.title.indexOf('hole') < 0, 'and says nothing about holes — that is the next segment');
expect(find(proofsOf(1, 6, ['a', 'b', 'c', 'd', 'e']), 'progress').title.startsWith('Unfinished: a, b, c and 2 more'),
  'a long list is cut, not wrapped');
expect(find(proofsOf(8, 8), 'progress') === undefined, 'all proved: silent, the checker already says Checked');
expect(find(proofsOf(0, 1, ['a']), 'progress') === undefined, 'one proof: 0/1 adds nothing to its hole or error');
expect(find(proofsOf(1, 3, ['a']), 'holes').text === '3 holes', 'the hole count stands beside it, unchanged');
const progKeys = keys(proofsOf(1, 3, ['a']));
expect(progKeys.indexOf('progress') === progKeys.indexOf('holes') - 1, 'progress reads first, then the holes inside it');
expect(find(proofsOf(1, 3, ['a']), 'progress', 'compact') === undefined, 'Compact keeps to the hole count');

// ── the suite: context nothing else on screen shows ──────────────────────────
const suiteOf = (x) => ({ ...base, suite: { name: 'fvnat', index: 2, count: 7, upstreamErrors: [], ...x } });
const su = find(suiteOf({}), 'suite');
expect(su.text === 'fvnat' && su.sub === '3/7', 'the suite and the place in it');
expect(su.tone === 'plain' && su.action === 'reveal-file' && su.command === 'view.reveal-file', 'a caption that reveals the file');
expect(su.title === 'File 3 of 7 in suite fvnat\nReveal in Explorer', 'the tooltip spells the place out');
const suBad = find(suiteOf({ upstreamErrors: ['a.bel'] }), 'suite');
expect(suBad.tone === 'warning' && suBad.title.indexOf('An earlier file has errors: a.bel') >= 0,
  'a failing earlier member is this file\'s problem too');
expect(find(suiteOf({ count: 1, index: 0 }), 'suite').sub === '', 'a one-file suite has no place to state');
const holesTip = (holes, elsewhere) => find({ ...suiteOf({ elsewhere }), holes }, 'suite').title.split('\n')[1];
expect(holesTip(2, [{ name: 'a.bel', holes: 3 }, { name: 'b.bel', holes: 2 }])
  === '7 holes in the suite: 2 here, 3 in a.bel and 2 in b.bel', 'holes across the suite, file by file');
expect(holesTip(0, [{ name: 'a.bel', holes: 1 }]) === '1 hole in the suite: 1 in a.bel', 'none here, so here is not named');
expect(holesTip(4, []) === '4 holes in the suite, all here', 'all in this file');
expect(holesTip(0, []) === 'No holes in the suite', 'a finished suite says so');
expect(find({ ...suiteOf({}), holes: 3 }, 'suite').title.indexOf('hole') < 0,
  'with the other members unknown, it says nothing rather than undercount');
expect(find(base, 'suite') === undefined, 'no suite, no segment');
expect(find({ ...suiteOf({}), hasFile: false }, 'suite') === undefined, 'no file, no suite');
const suKeys = keys({ ...suiteOf({}), undoDepth: 1 });
expect(suKeys.indexOf('spacer') < suKeys.indexOf('suite') && suKeys.indexOf('suite') < suKeys.indexOf('undo'),
  'right-hand group, before the edit tray');

// ── a long Run: timed, and stoppable ─────────────────────────────────────────
const runOf = (ms) => ({ ...base, run: { label: 'suite fvnat', elapsedMs: ms } });
expect(find(runOf(1500), 'run') === undefined && find(runOf(1500), 'runstop') === undefined,
  'a quick Run finishes before a clock would be worth reading');
const rn = find(runOf(12400), 'run');
expect(rn.text === 'Running' && rn.sub === '12s' && rn.title === 'Running suite fvnat', 'a verb, a clock, what is running');
expect(find(runOf(64000), 'run').sub === '1:04', 'minutes past a minute');
const stop = find(runOf(3000), 'runstop');
expect(stop.icon === 'stop' && stop.action === 'run-stop' && stop.command === 'run.stop', 'a stop button beside it');
for (const level of DETAIL_LEVELS) {
  expect(keys(runOf(3000), level).indexOf('runstop') >= 0, `${level} always offers the stop`);
}

// ── ⛔ no tone may be styled NOWHERE ───────────────────────────────
// A tone is a CLAIM ON A STYLESHEET. REC declared `error` for weeks while
// `is-error` had rules under `--problems` and `--checker` only, so the one chip
// that must not be missed rendered in the resting grey; `is-pending` on the
// half-typed chord had no rule at all. Every tone a builder can emit must
// either have a rule of its own or be listed here as deliberately riding the
// segment's base colour.
const RIDES_BASE_RULE = {
  // key → the tone that is simply the segment's own colour
  keymap: ['plain'],
  goal: ['goal'],
  holes: ['holes'],
  orca: ['busy'],
  run: ['busy'],
  suite: ['plain'],
  history: ['plain'],
};
const STATES = [
  base,
  { ...base, inHole: true, goal: 'x', holes: 2 },
  { ...base, inHole: true, goal: '', holes: 2, goalPending: true },
  { ...base, holes: 3 },
  { ...base, errors: 2 },
  { ...base, warnings: 2 },
  { ...base, errors: 2, checking: true },
  { ...base, checking: true },
  { ...base, orca: true },
  { ...base, symbols: 9 },
  { ...base, pending: 'g' },
  { ...base, macro: { recording: true, stop: 'q' } },
  { ...base, undoDepth: 3 },
  { ...base, undoDepth: 3, redoDepth: 1 },
  { ...base, tabConflict: true },
  { ...base, style: 'emacs', mark: true },
  proofsOf(1, 3, ['a']),
  suiteOf({}),
  suiteOf({ upstreamErrors: ['a.bel'] }),
  runOf(5000),
  ...['differs', 'offline', 'held', 'error'].map((state) => syncOf({ state, differs: state === 'differs' ? file1 : [] })),
  ...['NORMAL', 'INSERT', 'VISUAL', 'V-LINE', 'V-BLOCK', 'REPLACE']
    .map((m) => ({ ...base, style: 'vim', mode: m })),
];
const emitted = new Map();
for (const st of STATES) {
  for (const level of DETAIL_LEVELS) {
    for (const x of buildSegments(st, level)) {
      if (!x.tone) continue;
      if (!emitted.has(x.key)) emitted.set(x.key, new Set());
      emitted.get(x.key).add(x.tone);
    }
  }
}
expect(emitted.size >= 7, `the sweep reached the segments (${emitted.size} keys with tones)`);
for (const [key, tones] of emitted) {
  for (const tone of tones) {
    const own = css.indexOf('.jar-strip__seg--' + key + '.is-' + tone) >= 0;
    const rides = (RIDES_BASE_RULE[key] || []).indexOf(tone) >= 0;
    expect(own || rides, `${key} can be "${tone}", which is styled nowhere`);
  }
}

console.log(`OK status strip segments (goal in three states, REC, `
  + `${[...emitted.values()].reduce((n, t) => n + t.size, 0)} tones all styled)`);

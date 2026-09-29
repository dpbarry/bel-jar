// The three-way line merge (js/persist/merge.mjs, docs/PERSIST.md §4.4).
//
// A merge that guesses loses someone's proof, so this pins laws over thousands
// of seeded random cases rather than a handful of examples: the diff is a real
// LONGEST common subsequence; editor changes reproduce their target exactly;
// edits in different places always combine to "both applied"; the merge is
// symmetric; and edits that overlap or touch are always a conflict.
import { lcsMatch, merge3, textChanges, applyChanges, splitLines } from '../js/persist/merge.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// A small seeded PRNG (mulberry32): every failure is reproducible from its seed.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const WORDS = ['LF', 'nat', ':', 'type', '=', '| z', '| s', '→', 'rec', 'fn', 'case', 'of', '[', '|-', ']', ';', '', '%', 'λ'];
const line = (r) => Array.from({ length: int(r, 0, 4) }, () => WORDS[int(r, 0, WORDS.length - 1)]).join(' ');
const lines = (r, count) => Array.from({ length: count }, () => line(r));

// ── the diff is a longest common subsequence ────────────────────────────────
function lcsLength(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Int32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp[0][0];
}
{
  let bad = null;
  for (let seed = 1; seed <= 1500 && !bad; seed++) {
    const r = rng(seed);
    // A small alphabet makes many ties and long common runs: the hard case.
    const a = Array.from({ length: int(r, 0, 30) }, () => 'abcd'[int(r, 0, 3)]);
    const b = Array.from({ length: int(r, 0, 30) }, () => 'abcd'[int(r, 0, 3)]);
    const m = lcsMatch(a, b);
    let last = -1;
    let count = 0;
    for (let i = 0; i < a.length; i++) {
      if (m[i] < 0) continue;
      if (m[i] <= last || a[i] !== b[m[i]]) { bad = `seed ${seed}: not a common subsequence`; break; }
      last = m[i];
      count += 1;
    }
    if (!bad && count !== lcsLength(a, b)) bad = `seed ${seed}: ${count} matched, the longest is ${lcsLength(a, b)}`;
  }
  expect(!bad, bad || '');
  expect(true, '1500 random pairs: every match is a common subsequence of the longest possible length');
}

// ── editor changes reproduce their target exactly ───────────────────────────
{
  let bad = null;
  for (let seed = 1; seed <= 1500 && !bad; seed++) {
    const r = rng(seed * 7919);
    const joiner = r() < 0.2 ? '\r\n' : '\n';
    const a = lines(r, int(r, 0, 25)).join(joiner) + (r() < 0.5 ? '\n' : '');
    const b = r() < 0.1 ? a : lines(r, int(r, 0, 25)).join(joiner) + (r() < 0.5 ? '\n' : '');
    const ch = textChanges(a, b);
    if (applyChanges(a, ch) !== b) bad = `seed ${seed}: changes do not reproduce the target`;
    for (let i = 0; i < ch.length && !bad; i++) {
      const c = ch[i];
      if (c.from > c.to || c.to > a.length || (i && ch[i - 1].to > c.from)) bad = `seed ${seed}: changes out of order or overlapping`;
    }
    if (a === b && ch.length) bad = `seed ${seed}: identical texts produced changes`;
  }
  expect(!bad, bad || '');
  expect(true, '1500 random pairs (LF and CRLF, with and without a final newline): applying the changes gives the target');
}
{
  const a = 'keep 1\nold\nkeep 2\nkeep 3\n';
  const b = 'keep 1\nnew\nkeep 2\nkeep 3\nadded\n';
  const ch = textChanges(a, b);
  expect(ch.length === 2 && ch[0].from === 7 && ch[0].to === 11 && ch[1].from === a.length,
    `only the changed lines are touched: ${JSON.stringify(ch)}`);
}

// ── the trivial laws ────────────────────────────────────────────────────────
{
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(seed * 104729);
    const o = lines(r, int(r, 0, 15)).join('\n');
    const a = lines(r, int(r, 0, 15)).join('\n');
    const m1 = merge3(o, o, a);
    const m2 = merge3(o, a, o);
    const m3 = merge3(o, a, a);
    if (!(m1.ok && m1.text === a && m2.ok && m2.text === a && m3.ok && m3.text === a)) {
      expect(false, `seed ${seed}: a one-sided or identical edit is not taken as is`);
    }
  }
  expect(true, '300 cases: one side unchanged takes the other; both the same takes it');
}

// ── edits in different places combine, symmetrically ────────────────────────
// Base of N lines; each side edits its own region; at least one untouched line
// separates the regions (lines that TOUCH are a conflict by design, below).
function editRegion(r, base, from, to) {
  const out = base.slice(0, from);
  const count = int(r, 0, 3);
  for (let i = 0; i < count; i++) out.push('edited ' + line(r) + ' #' + int(r, 0, 1e6));
  return out.concat(base.slice(to));
}
{
  let bad = null;
  for (let seed = 1; seed <= 2000 && !bad; seed++) {
    const r = rng(seed * 31337);
    const base = Array.from({ length: int(r, 3, 30) }, (_, i) => `base ${i} ${line(r)}`);
    const n0 = base.length;
    // Two regions [a0, a1) and [b0, b1) with a1 < b0 (a gap of at least one line).
    const a0 = int(r, 0, n0 - 3);
    const a1 = int(r, a0, n0 - 2);
    const b0 = int(r, a1 + 1, n0 - 1);
    const b1 = int(r, b0, n0);
    const mine = editRegion(r, base, a0, a1);
    const theirs = editRegion(r, base, b0, b1);
    // Both applied: mine up to base line b0 (its tail from a1 on is base), then
    // theirs' replacement of [b0, b1), then the rest of the base.
    const expected = mine.slice(0, mine.length - (n0 - b0))
      .concat(theirs.slice(b0, theirs.length - (n0 - b1)))
      .concat(base.slice(b1));
    const O = base.join('\n');
    const A = mine.join('\n');
    const B = theirs.join('\n');
    const m = merge3(O, A, B);
    const s = merge3(O, B, A);
    if (!m.ok) bad = `seed ${seed}: disjoint edits reported a conflict`;
    else if (m.text !== expected.join('\n')) bad = `seed ${seed}: the merge is not both edits applied`;
    else if (!s.ok || s.text !== m.text) bad = `seed ${seed}: merging the other way round differs`;
  }
  expect(!bad, bad || '');
  expect(true, '2000 random disjoint edit pairs: always clean, always both applied, the same either way round');
}

// ── overlapping or touching edits are a conflict, and keep mine ─────────────
{
  let bad = null;
  for (let seed = 1; seed <= 1000 && !bad; seed++) {
    const r = rng(seed * 65537);
    const base = Array.from({ length: int(r, 2, 20) }, (_, i) => `base ${i}`);
    const at = int(r, 0, base.length - 1);
    const mine = base.slice();
    const theirs = base.slice();
    mine[at] = 'mine ' + seed;
    // The same line, or the next one (touching).
    const at2 = Math.min(base.length - 1, at + int(r, 0, 1));
    theirs[at2] = 'theirs ' + seed;
    const m = merge3(base.join('\n'), mine.join('\n'), theirs.join('\n'));
    if (m.ok) bad = `seed ${seed}: edits to line ${at} and ${at2} merged without a conflict`;
    else if (!m.text.includes('mine ' + seed) || m.text.includes('theirs ' + seed)) bad = `seed ${seed}: the conflict text is not mine`;
    else if (!m.conflicts.some((c) => c.theirs.join('\n').includes('theirs ' + seed))) bad = `seed ${seed}: the conflict does not carry theirs`;
  }
  expect(!bad, bad || '');
  expect(true, '1000 overlapping or touching edit pairs: always a conflict, mine in the text, theirs in the conflict');
}

// ── the cases a person meets ────────────────────────────────────────────────
{
  const m = merge3('line 1\nline 2\n', 'line one\nline 2\n', 'line 1\nline 2\nline 3 from B\n');
  expect(m.ok && m.text === 'line one\nline 2\nline 3 from B\n',
    `a fix at the top and a line added at the bottom both survive (the lost update of 2026-09-24): ${JSON.stringify(m.text)}`);
}
{
  const base = 'LF nat : type =\n  | z : nat\n  | s : nat → nat\n;\n\nrec add : nat → nat → nat =\n  fn m => fn n => ?;\n';
  const mine = base.replace('fn m => fn n => ?', 'fn m => fn n => case m of\n  | z => n\n  | s m\' => s (add m\' n)');
  const theirs = base.replace('LF nat : type =', '% natural numbers\nLF nat : type =');
  const m = merge3(base, mine, theirs);
  expect(m.ok && m.text.startsWith('% natural numbers\n') && m.text.includes('| s m\' => s (add m\' n)'),
    'a proof filled in on one side and a comment added on the other merge, unicode and all');
}
{
  expect(merge3('', 'a', 'b').ok === false, 'two different texts added to an empty file conflict');
  expect(merge3('', 'same', 'same').text === 'same', 'the same text added on both sides is taken once');
  const noNl = merge3('a\nb', 'a\nb\nc', 'z\nb');
  expect(noNl.ok && noNl.text === 'z\nb\nc', `no final newline is handled line-wise: ${JSON.stringify(noNl.text)}`);
  expect(merge3('x\r\ny\r\n', 'X\r\ny\r\n', 'x\r\ny\r\nz').text === 'X\r\ny\r\nz', 'CRLF lines merge and keep their \\r');
  expect(splitLines('a\nb\n').join('\n') === 'a\nb\n', 'lines round-trip exactly');
}

// ── it stays fast on real sizes ─────────────────────────────────────────────
{
  const r = rng(42);
  const base = Array.from({ length: 3000 }, (_, i) => `line ${i} ${line(r)}`);
  const mine = base.slice();
  const theirs = base.slice();
  for (let i = 0; i < 12; i++) mine[i * 200 + 5] = 'mine ' + i;
  for (let i = 0; i < 12; i++) theirs[i * 200 + 105] = 'theirs ' + i;
  let t = Date.now();
  const m = merge3(base.join('\n'), mine.join('\n'), theirs.join('\n'));
  const ms = Date.now() - t;
  expect(m.ok && ms < 250, `a 3000-line file with 24 scattered edits merges cleanly in ${ms} ms (< 250)`);
  t = Date.now();
  const rewrite = Array.from({ length: 2500 }, (_, i) => `rewritten ${i}`).join('\n');
  merge3(base.slice(0, 2500).join('\n'), rewrite, base.slice(0, 2500).join('\n') + '\nx');
  const ms2 = Date.now() - t;
  expect(ms2 < 2000, `a whole-file rewrite of 2500 lines still finishes in ${ms2} ms (< 2000)`);
}

console.log(`OK merge (${n} checks over ~8000 random cases: longest common subsequence, exact editor changes, disjoint edits combine symmetrically, overlaps always conflict, real sizes fast)`);

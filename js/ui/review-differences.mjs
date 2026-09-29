/**
 * Review differences (docs/UI.md §3; docs/PERSIST.md §4.4, §5): every file
 * changed in two places, each with a compact diff and Keep mine or Use cloud.
 *
 * Opened by the person, from the strip or the cloud; never on its own. Both
 * versions stay kept until someone chooses, so closing the window decides
 * nothing. A file open in this page is resolved through its document, which
 * also moves the editor (App.resolveOpenConflict); any other through storage.
 */
import { splitLines, lcsMatch } from '../persist/merge.mjs';
import { actionButton } from './prompt-dialog.mjs';

const g = typeof window !== 'undefined' ? window : globalThis;

/**
 * Line rows from the other side (`theirs`) to this one (`mine`): 'same', 'theirs'
 * (only on the other side), 'mine' (only here). Within a change, the other
 * side's lines come first, as in any unified diff.
 */
export function lineDiff(theirs, mine) {
  const a = splitLines(theirs);
  const b = splitLines(mine);
  const match = lcsMatch(a, b);
  const rows = [];
  let j = 0;
  for (let i = 0; i < a.length; i++) {
    const m = match[i];
    if (m < 0) {
      rows.push({ kind: 'theirs', text: a[i] });
      continue;
    }
    while (j < m) rows.push({ kind: 'mine', text: b[j++] });
    rows.push({ kind: 'same', text: a[i] });
    j = m + 1;
  }
  while (j < b.length) rows.push({ kind: 'mine', text: b[j++] });
  return rows;
}

/** Only what changed, with `context` unchanged lines around it; a skipped run becomes a gap. */
export function compactDiff(rows, context = 1) {
  const keep = new Array(rows.length).fill(false);
  rows.forEach((r, i) => {
    if (r.kind === 'same') return;
    for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++) keep[k] = true;
  });
  const out = [];
  let gap = 0;
  rows.forEach((r, i) => {
    if (!keep[i]) { gap += 1; return; }
    if (gap) out.push({ kind: 'gap', count: gap });
    gap = 0;
    out.push(r);
  });
  if (gap && out.length) out.push({ kind: 'gap', count: gap });
  return out;
}

/** Where the other version came from, in the words the window uses. */
export function otherSide(source) {
  return source === 'tab'
    ? { where: 'here and in another tab', theirs: 'the other tab’s', use: 'Use other tab', all: 'Use other tabs' }
    : { where: 'here and in the cloud', theirs: 'the cloud’s', use: 'Use cloud', all: 'Use cloud for all' };
}

/** The words for a set of files: one source names it, a mix says "somewhere else". */
export function reviewWords(files) {
  const sources = new Set(files.map((c) => (c.source === 'tab' ? 'tab' : 'device')));
  if (sources.size === 1) {
    const w = otherSide([...sources][0]);
    return { intro: (files.length === 1 ? 'This file changed ' : 'These files changed ') + w.where + '.', theirs: w.theirs, all: w.all };
  }
  return { intro: 'These files changed here and somewhere else.', theirs: 'the other version', all: 'Use the other versions' };
}

// ── the window ──────────────────────────────────────────────────────────────

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** Both sides of one file: through the page's open document when it holds the file. */
function sidesOf(c) {
  const App = g.App;
  const open = App && typeof App.openConflictSides === 'function' ? App.openConflictSides(c.pid, c.fid) : null;
  return open || g.Persist.conflictSides(c.pid, c.fid);
}

/** Keep one side. True when it took. */
export function resolveDifference(c, choice) {
  const App = g.App;
  const open = App && typeof App.resolveOpenConflict === 'function' ? App.resolveOpenConflict(c.pid, c.fid, choice) : null;
  if (open !== null && open !== undefined) return open;
  return g.Persist.resolveStoredConflict(c.pid, c.fid, choice);
}

function diffNode(sides) {
  const pre = el('div', 'review-diff');
  const rows = compactDiff(lineDiff(sides.theirs, sides.mine), 1);
  if (!rows.length) {
    pre.appendChild(el('div', 'review-diff__none', 'Both sides are the same now. Either choice keeps it.'));
    return pre;
  }
  for (const r of rows) {
    if (r.kind === 'gap') {
      pre.appendChild(el('div', 'review-diff__gap', r.count === 1 ? '1 unchanged line' : r.count + ' unchanged lines'));
      continue;
    }
    const line = el('div', 'review-diff__line is-' + r.kind);
    line.appendChild(el('span', 'review-diff__mark', r.kind === 'theirs' ? '−' : r.kind === 'mine' ? '+' : ''));
    line.appendChild(el('span', 'review-diff__text', r.text || ' '));
    pre.appendChild(line);
  }
  return pre;
}

let win = null;

function render(body) {
  const P = g.Persist;
  const files = P.listConflicts();
  body.replaceChildren();
  if (!files.length) {
    if (win) win.close();
    return;
  }
  const all = reviewWords(files);
  body.appendChild(el('p', 'review__intro', all.intro + ' Both versions are kept until you choose.'));
  const legend = el('p', 'review__legend');
  legend.appendChild(el('span', 'review__key is-theirs', '− ' + all.theirs));
  legend.appendChild(el('span', 'review__key is-mine', '+ yours'));
  body.appendChild(legend);
  for (const c of files) {
    const sides = sidesOf(c);
    if (!sides) continue;
    const words = otherSide(sides.source || c.source);
    const section = el('section', 'review__file');
    section.dataset.pid = c.pid;
    section.dataset.fid = c.fid;
    const head = el('div', 'review__head');
    const name = el('div', 'review__name');
    name.appendChild(el('span', 'review__path', c.path));
    head.appendChild(name);
    const actions = el('div', 'review__actions');
    const theirsBtn = actionButton(words.use, 'theirs', 'secondary');
    const mineBtn = actionButton('Keep mine', 'mine', 'primary');
    for (const btn of [theirsBtn, mineBtn]) {
      btn.addEventListener('click', () => {
        resolveDifference(c, btn.dataset.action);
        render(body);
      });
      actions.appendChild(btn);
    }
    head.appendChild(actions);
    section.appendChild(head);
    section.appendChild(diffNode(sides));
    body.appendChild(section);
  }
  if (files.length > 1) {
    const bar = el('div', 'review__all');
    const theirsAll = actionButton(all.all, 'theirs', 'secondary');
    const mineAll = actionButton('Keep all mine', 'mine', 'primary');
    for (const btn of [theirsAll, mineAll]) {
      btn.addEventListener('click', () => {
        for (const c of g.Persist.listConflicts()) resolveDifference(c, btn.dataset.action);
        render(body);
      });
      bar.appendChild(btn);
    }
    body.appendChild(bar);
  }
}

/** A height that fits what there is to show, within reason: one short diff opens small. */
function fittingHeight(files) {
  let rows = 0;
  for (const c of files) {
    const sides = sidesOf(c);
    if (sides) rows += compactDiff(lineDiff(sides.theirs, sides.mine), 1).length;
  }
  return Math.max(220, Math.min(540, 124 + files.length * 52 + rows * 18 + (files.length > 1 ? 44 : 0)));
}

/** Open the window (or bring its contents up to date). */
export function openReviewDifferences() {
  const FW = g.FloatingWindow;
  if (!FW || !g.Persist) return false;
  if (!g.Persist.listConflicts().length) return false;
  if (win) {
    render(win.body);
    return true;
  }
  const body = el('div', 'review');
  const handle = FW.open({
    title: 'Review differences',
    className: 'floating-window--review',
    content: body,
    width: 560,
    height: fittingHeight(g.Persist.listConflicts()),
    minWidth: 360,
    minHeight: 220,
    onClose: () => { win = null; },
  });
  win = { close: () => handle.close(), body };
  render(body);
  return true;
}

/** Keep an open window in step with the files (a file settled elsewhere drops out). */
export function refreshReviewDifferences() {
  if (win) render(win.body);
}

export const ReviewDifferences = { open: openReviewDifferences, refresh: refreshReviewDifferences, resolve: resolveDifference };
g.ReviewDifferences = ReviewDifferences;

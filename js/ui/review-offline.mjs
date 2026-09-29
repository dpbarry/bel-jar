/**
 * Changes made offline (Settings > Account > Back online: Ask me first,
 * docs/PERSIST.md §5.7): what this device changed while the connection was
 * gone, held (persist/sync/hold.mjs) until the person uploads it or takes the
 * cloud's version instead.
 *
 * Opened by the person, from the strip or the cloud. Upload lets the held
 * rounds go (every project, as sync would have); "Use the cloud’s" puts one
 * project back to the cloud's version, which may be that the cloud deleted it.
 * A project made here while offline has no cloud version, so it only goes up:
 * dropping it would be deleting it.
 */
import { lineDiff, compactDiff } from './review-differences.mjs';
import { actionButton } from './prompt-dialog.mjs';

const g = typeof window !== 'undefined' ? window : globalThis;

const CHANGE_WORDS = { added: 'new', edited: 'edited', renamed: 'renamed', deleted: 'deleted' };

/** A project's changes in one line of words: "2 edited, 1 new". */
export function changeSummary(p) {
  if (p.isNew) return 'new here';
  if (p.deleted) return 'deleted here';
  const counts = {};
  for (const f of p.files) counts[f.change] = (counts[f.change] || 0) + 1;
  const parts = ['edited', 'added', 'renamed', 'deleted'].filter((k) => counts[k]).map((k) => counts[k] + ' ' + CHANGE_WORDS[k]);
  if (p.renamed) parts.unshift('name changed');
  return parts.length ? parts.join(', ') : 'folders or suites changed';
}

/**
 * What the window lists: each changed project beside the cloud's side of it,
 * leaving out what there is nothing to choose about (deleted here, and gone
 * from the cloud too).
 */
export function offlineRows(changes, sides) {
  const out = [];
  for (const p of changes) {
    const side = sides[p.pid] || { state: 'unknown', name: null, texts: {} };
    if (p.deleted && (side.state === 'deleted' || side.state === 'absent')) continue;
    out.push({
      p,
      side,
      name: p.name || side.name || 'A deleted project',
      words: changeSummary(p) + (side.state === 'deleted' && !p.deleted ? ', deleted in the cloud' : ''),
      // Only what the cloud has (or deleted) can be taken from it.
      canUseCloud: side.state === 'present' || side.state === 'deleted' || side.state === 'unknown',
    });
  }
  return out;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function diffNode(theirs, mine) {
  const box = el('div', 'review-diff');
  for (const r of compactDiff(lineDiff(theirs || '', mine || ''), 1)) {
    if (r.kind === 'gap') {
      box.appendChild(el('div', 'review-diff__gap', r.count === 1 ? '1 unchanged line' : r.count + ' unchanged lines'));
      continue;
    }
    const line = el('div', 'review-diff__line is-' + r.kind);
    line.appendChild(el('span', 'review-diff__mark', r.kind === 'theirs' ? '−' : r.kind === 'mine' ? '+' : ''));
    line.appendChild(el('span', 'review-diff__text', r.text || ' '));
    box.appendChild(line);
  }
  return box;
}

let win = null;
let busy = false;
let problem = null;

function projectSection(row) {
  const P = g.Persist;
  const { p, side } = row;
  const section = el('section', 'review__file');
  section.dataset.pid = p.pid;
  const head = el('div', 'review__head');
  const name = el('div', 'review__name');
  name.appendChild(el('span', 'review__project', row.name));
  name.appendChild(el('span', 'review__changes', row.words));
  head.appendChild(name);
  const actions = el('div', 'review__actions');
  if (row.canUseCloud) {
    const cloud = actionButton('Use the cloud’s', 'cloud', 'secondary');
    cloud.addEventListener('click', () => act(() => P.useCloud(p.pid)));
    actions.appendChild(cloud);
  }
  head.appendChild(actions);
  section.appendChild(head);
  for (const f of p.files) {
    const line = el('div', 'review__change');
    line.appendChild(el('span', 'review__path', f.path));
    line.appendChild(el('span', 'review__kind', CHANGE_WORDS[f.change]));
    section.appendChild(line);
    const theirs = side.texts && side.texts[f.fid];
    if (f.change === 'edited' && typeof theirs === 'string') {
      section.appendChild(diffNode(theirs, P.projectFileText(p.pid, f.fid)));
    }
  }
  return section;
}

async function cloudSides(changes) {
  const P = g.Persist;
  const sides = {};
  for (const p of changes) {
    if (p.isNew) {
      sides[p.pid] = { state: 'absent', name: null, texts: {} };
      continue;
    }
    try {
      sides[p.pid] = await P.cloudSide(p.pid, p.files.filter((f) => f.change === 'edited').map((f) => f.fid));
    } catch (_) {
      sides[p.pid] = { state: 'unknown', name: null, texts: {} };
    }
  }
  return sides;
}

async function render(body) {
  const P = g.Persist;
  const changes = await P.offlineChanges();
  const rows = offlineRows(changes, await cloudSides(changes));
  body.replaceChildren();
  if (!rows.length) {
    // Nothing of this device's waits any more: let the held rounds go.
    await P.releaseSync();
    if (win) win.close();
    return;
  }
  body.appendChild(el('p', 'review__intro', rows.length === 1
    ? 'This project changed here while you were offline. Upload the changes, or use the cloud’s version instead.'
    : 'These projects changed here while you were offline. Upload the changes, or use the cloud’s version instead.'));
  if (rows.some((r) => r.p.files.some((f) => f.change === 'edited'))) {
    const legend = el('p', 'review__legend');
    legend.appendChild(el('span', 'review__key is-theirs', '− the cloud’s'));
    legend.appendChild(el('span', 'review__key is-mine', '+ yours'));
    body.appendChild(legend);
  }
  for (const row of rows) body.appendChild(projectSection(row));
  if (problem) body.appendChild(el('p', 'review__problem', problem));
  const bar = el('div', 'review__all');
  const cloudable = rows.filter((r) => r.canUseCloud);
  if (rows.length > 1 && cloudable.length) {
    const cloudAll = actionButton('Use the cloud’s for all', 'cloud', 'secondary');
    cloudAll.addEventListener('click', () => act(async () => {
      for (const r of cloudable) await P.useCloud(r.p.pid);
    }));
    bar.appendChild(cloudAll);
  }
  const upload = actionButton('Upload', 'upload', 'primary');
  upload.addEventListener('click', () => act(async () => {
    await P.releaseSync();
    if (win) win.close();
  }));
  bar.appendChild(upload);
  body.appendChild(bar);
}

async function act(fn) {
  if (busy) return;
  busy = true;
  problem = null;
  try {
    await fn();
  } catch (_) {
    problem = 'Couldn’t reach the cloud. Try again.';
  } finally {
    busy = false;
  }
  if (win) await render(win.body);
}

/** Open the window (or bring its contents up to date). */
export async function openReviewOffline() {
  const FW = g.FloatingWindow;
  if (!FW || !g.Persist) return false;
  if (win) {
    await render(win.body);
    return true;
  }
  const body = el('div', 'review');
  const handle = FW.open({
    title: 'Changes made offline',
    className: 'floating-window--review',
    content: body,
    width: 560,
    height: 380,
    minWidth: 360,
    minHeight: 220,
    onClose: () => { win = null; problem = null; },
  });
  win = { close: () => handle.close(), body };
  await render(body);
  return true;
}

export const ReviewOffline = { open: openReviewOffline };
g.ReviewOffline = ReviewOffline;

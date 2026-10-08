/**
 * Sync, shown where it belongs (docs/UI.md §2, §3). All of it reads one
 * summary, the same in every tab (Persist.syncSummary):
 *
 *   the cloud        beside the project name, signed in only: synced, syncing,
 *                    offline, couldn't sync, files to review, changes made
 *                    offline. Its popover says the state and offers Sync now
 *                    and Review differences, or, held, the offline review.
 *   the strip        a segment only when something needs you (status-strip-
 *                    segments.mjs `sync`), and "Back online" in passing.
 *   the explorer     files changed in two places are marked.
 *
 * Nothing here toasts, and nothing opens by itself: the review window opens
 * when the person asks (docs/UI.md §3).
 */
import { openReviewDifferences, refreshReviewDifferences, resolveDifference } from '../ui/review-differences.mjs';
import { openReviewOffline } from '../ui/review-offline.mjs';
import { cloudLook, cloudSvg } from './cloud-glyphs.mjs';
import { QUOTA } from '../persist/sync/protocol.mjs';
import { createFailureWatch } from './sync-watch.mjs';

export { cloudLook };

const g = typeof window !== 'undefined' ? window : globalThis;

let summary = null;
let wasOffline = false;
let marks = null;

function plural(n, one, many) {
  return n + ' ' + (n === 1 ? one : many);
}

/** "just now", "3 minutes ago", "at 14:05". */
export function ago(ms, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return plural(m, 'minute', 'minutes') + ' ago';
  return 'at ' + new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Why a round could not sync, in a sentence, from the reason the runner gives
 * (`status-<code>` the server's answer, `refused-<code>` its refusal of one
 * project). Null for one with no words of its own.
 */
export function failureWords(reason) {
  const m = /^status-(\d+)$/.exec(reason || '');
  if (m) {
    const code = Number(m[1]);
    if (code === 429) return 'BelJar’s server is busy (429). It tries again on its own; nothing here is lost.';
    if (code >= 500) return 'BelJar’s server had a problem (' + code + '). It tries again on its own; nothing here is lost.';
    if (code === 413) return 'A change was too large for the server to take (413). It stays here.';
    if (code === 401) return 'This browser’s session has ended. Sign in again to sync.';
    return 'BelJar’s server refused the request (' + code + '). It tries again on its own; nothing here is lost.';
  }
  if (reason === 'refused-quota-projects') {
    return 'Your account has ' + QUOTA.projects.toLocaleString('en') + ' projects, BelJar’s limit. Delete projects you no longer need, and new ones sync.';
  }
  if (reason === 'refused-quota-texts') {
    return 'Your account has stored as much text as BelJar allows (' + Math.round(QUOTA.textBytes / (1024 * 1024 * 1024)) + ' GB), which usually means something has gone wrong. Report an issue; nothing here is lost.';
  }
  if (reason === 'refused-too-many' || reason === 'refused-bad-manifest') return 'The server refused a change it could not take. It stays here.';
  return null;
}

/** The cloud's words for a summary: its tooltip, and the popover's first row. */
export function cloudWords(s, now = Date.now()) {
  switch (s.state) {
    case 'differs': {
      const n = s.differs.length;
      return { tip: plural(n, 'file', 'files') + ' to review', title: plural(n, 'file', 'files') + ' to review', detail: 'Changed here and somewhere else.', tone: 'warning' };
    }
    case 'offline':
      return { tip: 'Offline', title: 'Offline', detail: 'Changes sync when you’re back online.' };
    case 'held':
      return { tip: 'Changes made offline', title: 'Changes made offline', detail: 'They wait for you to upload them, or use the cloud’s version.', tone: 'warning' };
    case 'error':
      return { tip: 'Couldn’t sync', title: 'Couldn’t sync', detail: failureWords(s.reason) || 'BelJar keeps trying.', tone: 'error' };
    case 'syncing':
    case 'pending':
      return { tip: 'Syncing', title: 'Syncing', detail: s.lastSync ? 'Last synced ' + ago(s.lastSync, now) : null };
    default:
      return { tip: 'All changes synced', title: 'All changes synced', detail: s.lastSync ? 'Synced ' + ago(s.lastSync, now) : null };
  }
}

// The look on screen: the glyph is redrawn only when it changes, so the rising
// arrow is never restarted by a summary that says the same thing.
let shownLook = null;

function renderCloud(s) {
  const btn = document.getElementById('btn-sync');
  if (!btn) return;
  btn.hidden = !s.signedIn;
  if (!s.signedIn) {
    shownLook = null;
    return;
  }
  const look = cloudLook(s.state);
  // Waiting for the quiet spell reads apart from a round in flight: its arrow rests.
  btn.dataset.state = s.state === 'differs' || s.state === 'held' ? 'differs' : s.state === 'pending' ? 'pending' : look;
  if (look !== shownLook) {
    // Coming to synced from anything but the first paint: the check draws itself in.
    btn.classList.toggle('is-arriving', look === 'synced' && shownLook !== null);
    btn.innerHTML = cloudSvg(look);
    shownLook = look;
  }
  const tip = cloudWords(s).tip;
  btn.setAttribute('aria-label', tip);
  if (g.Tooltips && typeof g.Tooltips.set === 'function') g.Tooltips.set(btn, tip);
  else btn.setAttribute('data-tooltip', tip);
  // Open, its popover follows: it says what is true now, not when it was opened.
  if (g.Menu && g.Menu.update && g.Menu.rootAnchor && g.Menu.rootAnchor() === btn) g.Menu.update(btn, menuItems());
}

/** The cloud's popover: the state, then what you can do. */
function menuItems() {
  const s = summary || g.Persist.syncSummary();
  const words = cloudWords(s);
  const items = [{ type: 'status', title: words.title, detail: words.detail, tone: words.tone }];
  if (s.differs.length) {
    items.push({ type: 'separator' }, { label: 'Review differences', onSelect: () => openReviewDifferences() });
  }
  // Held, the review is the way on: Upload is there, beside what it sends.
  if (s.state === 'held') {
    items.push({ type: 'separator' }, { label: 'Review changes made offline', onSelect: () => openReviewOffline() });
    return items;
  }
  items.push({ type: 'separator' }, {
    label: 'Sync now',
    disabled: s.state === 'offline' || s.state === 'syncing',
    onSelect: () => g.Persist.confirmSynced(),
  });
  return items;
}

// Files changed in two places, marked in the explorer by id: rules rather than
// classes, so a re-render of the tree keeps them without being told.
function markExplorer(s) {
  // The editor only: home has no explorer, and no project to ask about.
  if (!g.Routes || g.Routes.pageOf(g.location) !== 'edit') return;
  if (!marks) {
    marks = document.createElement('style');
    marks.id = 'sync-differs-marks';
    document.head.appendChild(marks);
  }
  const pid = g.Persist.getActiveProjectId();
  const ids = s.differs.filter((d) => d.pid === pid).map((d) => d.fid);
  const esc = (id) => (g.CSS && typeof g.CSS.escape === 'function' ? g.CSS.escape(id) : String(id).replace(/"/g, ''));
  marks.textContent = ids.length
    ? ids.map((id) => `.explorer-file-item[data-file-id="${esc(id)}"] .explorer-file-item-name`).join(',\n') + ' { color: var(--ide-status-warning); }\n'
      + ids.map((id) => `.explorer-file-item[data-file-id="${esc(id)}"] .explorer-file-item-name::after`).join(',\n') + ' { content: " \\2260"; opacity: 0.85; }'
    : '';
}

// Settings > Account: merging, "Where edits overlap: Keep mine / Keep the
// cloud’s" settles what came from the cloud to that side as soon as it
// appears. Asking (either setting) leaves it to the review window.
function applyPreference(s) {
  const S = g.Settings;
  if (!S || S.get('syncBothChanged') !== 'merge') return false;
  const how = S.get('syncOverlap');
  if (how !== 'mine' && how !== 'cloud') return false;
  let settled = false;
  for (const c of s.differs) {
    if (c.source !== 'device') continue;
    if (resolveDifference(c, how === 'mine' ? 'mine' : 'theirs')) settled = true;
  }
  return settled;
}

function say(text) {
  if (g.StatusStrip && typeof g.StatusStrip.setMessage === 'function') g.StatusStrip.setMessage(text);
}

/** "Say when you go offline" (Settings > Account): the strip's notes, never the cloud's state. */
function notices() {
  return !g.Settings || g.Settings.get('syncNotices') !== false;
}

/**
 * A refusal the person must act on (an account at its limit) is kept where it
 * can be found again, once: the cloud says it while it lasts, the
 * notifications after.
 */
export function noteRefusal(s) {
  const reason = s && s.state === 'error' ? s.reason : null;
  if (!reason || !/^refused-quota-/.test(reason)) return;
  const N = g.Notifications;
  if (!N || typeof N.emit !== 'function') return;
  N.emit({
    kind: 'error',
    category: 'ops',
    origin: 'local',
    source: 'sync.quota',
    dedupeKey: 'sync.' + reason,
    title: reason === 'refused-quota-projects' ? 'Too many projects to sync' : 'Your account is full',
    body: failureWords(reason),
  });
}

/**
 * Rounds failing for ten minutes, kept findable (plan v6 phase 04, n4;
 * sync-watch.mjs): one card with the reason, taken away by the round that goes
 * through. `N`: the notifications (the page's own unless a test hands one in).
 */
export function noteFailing(action, s, N = g.Notifications) {
  if (!N || typeof N.emit !== 'function') return;
  if (action === 'emit') {
    N.emit({
      kind: 'error',
      category: 'ops',
      origin: 'local',
      source: 'sync.failing',
      dedupeKey: 'sync.failing',
      title: 'Couldn’t sync for ten minutes',
      body: failureWords(s && s.reason) || 'BelJar keeps trying. Everything stays in this browser meanwhile.',
    });
  } else if (action === 'clear') {
    const card = (typeof N.list === 'function' ? N.list() : []).find((r) => r.dedupeKey === 'sync.failing' && !r.dismissedAt);
    if (card && typeof N.dismiss === 'function') N.dismiss(card.id);
  }
}

// `BELJAR_SYNC_FAILING_MS` lowers the ten minutes for the probe that checks it (probe-sync-failing.mjs).
const failing = createFailureWatch({ after: typeof g.BELJAR_SYNC_FAILING_MS === 'number' ? g.BELJAR_SYNC_FAILING_MS : undefined });

function update(s) {
  if (applyPreference(s)) return; // the summary moves again, and comes back here
  const before = summary;
  summary = s;
  noteRefusal(s);
  const act = failing.observe(s);
  if (act) noteFailing(act, s);
  if (s.state === 'offline') wasOffline = true;
  else if (wasOffline && s.state === 'synced') {
    wasOffline = false;
    if (before && notices()) say('Back online. Everything is synced.');
  }
  renderCloud(s);
  markExplorer(s);
  refreshReviewDifferences();
  if (g.StatusStrip && typeof g.StatusStrip.setEditorState === 'function') {
    g.StatusStrip.setEditorState({ sync: Object.assign({}, s, { notices: notices() }) });
  }
}

export const SyncUI = {
  menuItems,
  review: () => openReviewDifferences(),
  reviewOffline: () => openReviewOffline(),
  summary: () => summary || (g.Persist ? g.Persist.syncSummary() : null),
};
g.SyncUI = SyncUI;

if (typeof document !== 'undefined') {
  const go = () => {
    const P = g.Persist;
    if (!P || typeof P.onSyncSummary !== 'function') return;
    P.onSyncSummary(update);
    update(P.syncSummary());
    // Signing in, switching project: the summary is the same, what it means here is not.
    g.addEventListener('beljar:account', () => update(P.syncSummary()));
    // A sync setting changed (here, in another tab, or from another device):
    // show it now, and let "Where edits overlap" settle what waits.
    if (g.Settings && typeof g.Settings.subscribe === 'function') {
      g.Settings.subscribe((e) => {
        if (e && Array.isArray(e.ids) && e.ids.some((id) => /^sync/.test(id))) update(P.syncSummary());
      });
    }
    g.addEventListener('beljar:project-tree-changed', () => { if (summary) markExplorer(summary); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });
  else go();
}

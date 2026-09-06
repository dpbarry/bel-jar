// Pure projection: a stored notification record → everything the panel draws.
// Kept out of notifications.mjs so the shapes the user actually sees are
// testable in Node, not only through a browser probe.
import { linkTarget } from './notification-store.mjs';

const WEEK = 7 * 24 * 3600000;

/**
 * Kind → the accent it brands with, and the word that names it. The accent is
 * the SAME token the stylesheet keys off (`--notif-kind-<kind>`, defined once in
 * tokens.css), so a card's wash and its edge can never name different reds.
 * The label is for screen readers only: on screen the wash carries the kind.
 */
export const KIND_META = {
  error: { accent: 'var(--notif-kind-error)', label: 'Error' },
  warn: { accent: 'var(--notif-kind-warn)', label: 'Warning' },
  info: { accent: 'var(--notif-kind-info)', label: 'Info' },
  success: { accent: 'var(--notif-kind-success)', label: 'Done' },
  system: { accent: 'var(--notif-kind-system)', label: 'System' },
};

export function kindMeta(kind) {
  return KIND_META[kind] || KIND_META.system;
}

function clock(ts) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
      .format(new Date(ts));
  } catch (_) {
    return '';
  }
}

function weekday(ts) {
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(ts));
  } catch (_) {
    return '';
  }
}

function calendarDay(ts) {
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
      .format(new Date(ts));
  } catch (_) {
    return '';
  }
}

function sameDay(a, b) {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear()
    && x.getMonth() === y.getMonth()
    && x.getDate() === y.getDate();
}

/**
 * A card's stamp is a clock reading, never a relative one: "12m ago" is stale
 * the moment it is drawn and needs a ticker to stay honest. Today is bare
 * clock, the past week gains a weekday, anything older gains the date.
 */
export function formatStamp(ts, now) {
  if (!Number.isFinite(ts)) return '';
  const at = Number.isFinite(now) ? now : Date.now();
  if (sameDay(ts, at)) return clock(ts);
  if (at - ts >= 0 && at - ts < WEEK) return weekday(ts) + ' ' + clock(ts);
  return calendarDay(ts) + ', ' + clock(ts);
}

/** The full stamp, for the hover that backs the short one. */
export function formatStampFull(ts) {
  if (!Number.isFinite(ts)) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch (_) {
    return '';
  }
}

// A title is a label, not a sentence. Toast text ends in a period and the same
// string banks into the inbox, so one trailing period comes off; '...', '?' and
// '!' are left alone because they carry meaning.
export function labelTitle(text) {
  const t = text == null ? '' : String(text).trim();
  if (t.length < 2 || !t.endsWith('.') || t.endsWith('..')) return t;
  return t.slice(0, -1);
}

// A card never hides its only content. `body` is the sentence we always show;
// a record that arrived with a raw `detail` and nothing else gets that detail
// promoted into the body rather than left behind a disclosure that reads empty.
function splitText(rec) {
  const title = labelTitle(rec.title);
  const rawBody = rec.body != null ? String(rec.body).trim() : '';
  const rawDetail = rec.detail != null ? String(rec.detail).trim() : '';
  const body = rawBody && rawBody !== title ? rawBody : '';
  const detail = rawDetail && rawDetail !== title && rawDetail !== body ? rawDetail : '';
  if (!body && detail) return { body: detail, detail: '', promoted: true };
  return { body, detail, promoted: false };
}

/**
 * Card bodies quote Beluga source in backticks (`Split n of type `nat``), so
 * split a body into plain and code runs rather than printing the backticks.
 * Only paired ticks count; an odd one stays literal text.
 */
export function inlineSegments(text) {
  const src = text == null ? '' : String(text);
  if (src.indexOf('`') < 0) return src ? [{ code: false, text: src }] : [];
  const out = [];
  let rest = src;
  while (rest) {
    const open = rest.indexOf('`');
    if (open < 0) break;
    const close = rest.indexOf('`', open + 1);
    if (close < 0) break;
    if (open > 0) out.push({ code: false, text: rest.slice(0, open) });
    const code = rest.slice(open + 1, close);
    if (code) out.push({ code: true, text: code });
    rest = rest.slice(close + 1);
  }
  if (rest) out.push({ code: false, text: rest });
  return out;
}

/** Everything one card needs, with nothing left for the renderer to decide. */
export function itemView(rec, now) {
  if (!rec || typeof rec !== 'object') return null;
  const kind = KIND_META[rec.kind] ? rec.kind : 'system';
  const text = splitText(rec);
  return {
    id: rec.id,
    kind,
    meta: kindMeta(kind),
    title: labelTitle(rec.title),
    body: text.body,
    bodySegments: inlineSegments(text.body),
    detail: text.detail,
    promotedDetail: text.promoted,
    unread: !rec.readAt,
    remote: rec.origin === 'remote',
    teaching: rec.category === 'teaching',
    stamp: formatStamp(rec.createdAt, now),
    stampFull: formatStampFull(rec.createdAt),
    target: linkTarget(rec),
  };
}

/** Panel-level summary: what the header states above the list. */
export function panelView(list, now) {
  const items = Array.isArray(list) ? list : [];
  return {
    total: items.length,
    unread: items.filter((r) => r && !r.readAt).length,
    empty: items.length === 0,
    items: items.map((r) => itemView(r, now)).filter(Boolean),
  };
}

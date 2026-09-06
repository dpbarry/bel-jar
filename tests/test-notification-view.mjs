// The notification panel's PROJECTION, not its model: what a card actually
// shows. The bug this guards is a record whose only content sat behind a
// disclosure, so the panel read as an empty "Details" line.
import {
  KIND_META,
  formatStamp,
  formatStampFull,
  inlineSegments,
  itemView,
  kindMeta,
  labelTitle,
  panelView,
} from '../js/ui/notification-view.mjs';
import { normalizeRecord } from '../js/ui/notification-store.mjs';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokensCss = readFileSync(join(root, 'css', 'tokens.css'), 'utf8');
const notifCss = readFileSync(join(root, 'css', 'notifications.css'), 'utf8');

// -- kinds ------------------------------------------------------------------
for (const kind of ['error', 'warn', 'info', 'success', 'system']) {
  const meta = kindMeta(kind);
  expect(!!meta.accent, kind + ' has an accent');
  expect(!!meta.label, kind + ' names itself for screen readers');
  expect(meta.icon === undefined, kind + ' carries no glyph: the wash is the branding');
}
expect(kindMeta('nonsense') === KIND_META.system, 'an unknown kind falls back to system');

// The projection and the stylesheet must name ONE accent per kind, or a card's
// badge and its wash drift apart. Both halves point at --notif-kind-<kind>.
for (const kind of Object.keys(KIND_META)) {
  expect(KIND_META[kind].accent === 'var(--notif-kind-' + kind + ')',
    kind + ' brands with the shared --notif-kind-' + kind + ' token');
  expect(tokensCss.includes('--notif-kind-' + kind + ':'),
    '--notif-kind-' + kind + ' is defined in tokens.css');
  expect(notifCss.includes('--notif-kind-' + kind + ')'),
    'the stylesheet keys ' + kind + ' off that same token');
}
// Every kind but the default one earns an explicit card rule.
for (const kind of ['error', 'warn', 'info', 'success']) {
  expect(notifCss.includes('.notif-item--' + kind + ' {'), kind + ' has a card rule');
}
expect(notifCss.includes('--notif-accent: var(--notif-kind-system)'),
  'system is the card default, so it needs no rule of its own');
expect(itemView(normalizeRecord({ title: 'x', kind: 'error' })).kind === 'error', 'kind kept');

// -- the "everything was hidden" bug ---------------------------------------
const detailOnly = itemView(normalizeRecord({
  title: 'Beluga checker failed to load.',
  kind: 'error',
  detail: 'Beluga worker crashed (beluga_web.bc.js:1)',
}));
expect(detailOnly.body === 'Beluga worker crashed (beluga_web.bc.js:1)',
  'a detail with no body is promoted into the visible body');
expect(detailOnly.detail === '', 'and is not also left behind a disclosure');
expect(detailOnly.promotedDetail === true, 'the card knows it is showing raw output');

const both = itemView(normalizeRecord({
  title: 'Beluga checker failed to load.',
  kind: 'error',
  body: 'Reload the page to retry.',
  detail: 'Beluga worker crashed',
}));
expect(both.body === 'Reload the page to retry.', 'prose body wins');
expect(both.detail === 'Beluga worker crashed', 'the raw detail stays available');
expect(both.promotedDetail === false, 'nothing was promoted');

// Redundancy never earns a second line.
const echo = itemView(normalizeRecord({ title: 'Same', body: 'Same', detail: 'Same' }));
expect(echo.body === '' && echo.detail === '', 'a body/detail echoing the title is dropped');

const dupDetail = itemView(normalizeRecord({ title: 'T', body: 'B', detail: 'B' }));
expect(dupDetail.detail === '', 'a detail equal to the body is dropped');

// -- titles read as labels --------------------------------------------------
expect(labelTitle('Beluga checker failed to load.') === 'Beluga checker failed to load',
  'a toast sentence banks as a label');
expect(labelTitle('Split n declined') === 'Split n declined', 'a label is left alone');
expect(labelTitle('Still working...') === 'Still working...', 'an ellipsis survives');
expect(labelTitle('Now what?') === 'Now what?', 'a question mark survives');
expect(labelTitle('') === '' && labelTitle(null) === '', 'no title, no label');
expect(itemView(normalizeRecord({ title: 'Loaded.' })).title === 'Loaded',
  'the card gets the label, not the sentence');

// -- inline code ------------------------------------------------------------
expect(inlineSegments('') .length === 0, 'no text, no segments');
expect(inlineSegments('plain').length === 1, 'plain text is one run');
const segs = inlineSegments('Split `n` of type `nat`.');
expect(segs.length === 5, 'five runs: text, code, text, code, trailing text');
expect(segs[1].code === true && segs[1].text === 'n', 'first code run');
expect(segs[2].code === false && segs[2].text === ' of type ', 'text between');
expect(segs[3].code === true && segs[3].text === 'nat', 'second code run');
expect(segs[4].code === false && segs[4].text === '.', 'the tail after the last code run');
expect(segs.map((s) => s.text).join('') === 'Split n of type nat.', 'no character is lost');

const odd = inlineSegments('an unpaired ` tick');
expect(odd.length === 1 && odd[0].code === false, 'an unpaired tick stays literal');
expect(odd[0].text === 'an unpaired ` tick', 'and keeps its backtick');

const teaching = itemView(normalizeRecord({
  title: 'Split n declined',
  body: 'Split `n` of type `nat`: no pattern.',
  category: 'teaching',
  kind: 'error',
}));
expect(teaching.bodySegments.filter((s) => s.code).length === 2, 'the card gets its code runs');
expect(teaching.teaching === true, 'a teaching record is tagged as such');

// -- stamps are clock readings, never relative ------------------------------
const now = new Date(2026, 8, 6, 13, 30, 0).getTime();
const fresh = formatStamp(now - 5000, now);
expect(!/ago|now/.test(fresh), `seconds old still reads as a time (got ${fresh})`);
expect(/\d/.test(fresh), 'and it is an actual clock reading');
expect(formatStamp(now - 12 * 60000, now) === formatStamp(now - 12 * 60000, now + 9e6),
  'a stamp cannot go stale: the same instant always prints the same');
const today = formatStamp(now - 3 * 3600000, now);
expect(!/ago/.test(today), 'earlier today is bare clock');
const yesterday = formatStamp(now - 30 * 3600000, now);
expect(yesterday.length > today.length, 'within the week a weekday is added');
const old = formatStamp(now - 30 * 24 * 3600000, now);
expect(old.indexOf(',') > 0, `older than a week carries the date too (got ${old})`);
expect(formatStamp(NaN, now) === '', 'no timestamp, no stamp');
expect(formatStampFull(now) !== '', 'the hover stamp is always spelled out');
expect(formatStampFull(now).length > formatStamp(now, now).length,
  'the hover stamp says more than the card one');

// -- one card per thing, never a tally --------------------------------------
expect(itemView(normalizeRecord({ title: 'x' })).repeat === undefined,
  'a card has no repeat count to show');
expect(normalizeRecord({ title: 'x', count: 4 }).count === undefined,
  'and the record does not keep one');
expect(itemView(normalizeRecord({ title: 'x' })).unread === true, 'a fresh record is unread');
expect(itemView(normalizeRecord({ title: 'x', readAt: now })).unread === false, 'readAt clears it');

// -- link target ------------------------------------------------------------
const linked = itemView(normalizeRecord({
  title: 'Development failed to type-check',
  links: { fileId: 'f1', path: 'proofs/weak-norm.bel', line: 42 },
}));
expect(linked.target && linked.target.label === 'weak-norm.bel:42', 'the card carries its chip');
expect(itemView(normalizeRecord({ title: 'x' })).target === null, 'no links, no chip');

// -- the panel header -------------------------------------------------------
const empty = panelView([], now);
expect(empty.empty === true && empty.total === 0, 'an empty inbox says so');
const filled = panelView([
  normalizeRecord({ title: 'a' }),
  normalizeRecord({ title: 'b', readAt: now }),
], now);
expect(filled.total === 2 && filled.unread === 1, 'the header counts total and unread');
expect(filled.items.length === 2, 'every record projects to a card');
expect(panelView(null, now).empty === true, 'a missing list is an empty one');
expect(itemView(null) === null, 'no record, no card');

console.log('OK notification-view (kind/CSS parity, promoted detail, inline code, stamps, panel counts)');

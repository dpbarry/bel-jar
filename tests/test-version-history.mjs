// Version history's window (js/ui/version-history.mjs, plan v6 c6): what it
// says of each version, and what restoring one would do to the project now.
import { versionTime, rowTag, listTimes, versionChanges, changeWords, restoreProblem } from '../js/ui/version-history.mjs';
import { dayWords } from '../js/ui/when.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const now = new Date(2026, 9, 5, 15, 30).getTime();
const at = (d, h, m) => new Date(2026, 9, d, h, m).getTime();
expect(/^Today \d{1,2}:04:00\b/.test(versionTime(at(5, 9, 4), now)), `a version from today says so, with its time to the second, 00 too (${versionTime(at(5, 9, 4), now)})`);
expect(/^Yesterday \d{1,2}:\d{2}/.test(versionTime(at(4, 23, 59), now)), 'one from yesterday');
expect(/^\S+ \S+ \d{1,2}:\d{2}/.test(versionTime(at(1, 8, 0), now)) && !/2026/.test(versionTime(at(1, 8, 0), now)), 'one from this year: its date and time');
expect(/2025/.test(versionTime(new Date(2025, 11, 31, 12, 0).getTime(), now)), 'one from another year names the year');

// A row says its time, and a word at its right only for the newest and a deletion.
expect(rowTag({ files: 3 }, true) === 'Current' && rowTag({ files: 3 }, false) === '', 'the newest is current; the rest say nothing besides their time');
expect(rowTag({ deleted: true, files: 0 }, false) === 'Deleted' && rowTag({ deleted: true, files: 0 }, true) === 'Deleted', 'a deletion says so, newest or not');

// The list's times: a day's heading, and the time alone, every one to the second.
const t0 = new Date(2026, 9, 5, 14, 30, 50).getTime();
const times = listTimes([
  { createdAt: t0 + 3 * 60000 },
  { createdAt: t0 },
  { createdAt: t0 - 20000 },
  { createdAt: t0 - 40000 },
  { createdAt: t0 - 26 * 3600000 },
], new Date(2026, 9, 5, 18, 0).getTime());
const secs = (t) => /:\d\d:\d\d/.test(t);
expect(times.map((t) => t.day).join() === 'Today,Today,Today,Today,Yesterday', `each version's day (${times.map((t) => t.day)})`);
expect(times.every((t) => secs(t.time)) && /:33:00\b/.test(listTimes([{ createdAt: new Date(2026, 9, 5, 14, 33).getTime() }])[0].time),
  `seconds on every row, :00 included (${times.map((t) => t.time).join(' | ')})`);

// Yesterday is the calendar's, not 24 hours back: the day the clocks go back has 25.
const dstNow = new Date(2026, 10, 2, 0, 30).getTime();
expect(dayWords(new Date(2026, 10, 1, 0, 10).getTime(), dstNow) === 'Yesterday' && dayWords(new Date(2026, 9, 31, 23, 50).getTime(), dstNow) !== 'Yesterday',
  `yesterday by the calendar (${dayWords(new Date(2026, 10, 1, 0, 10).getTime(), dstNow)}, ${dayWords(new Date(2026, 9, 31, 23, 50).getTime(), dstNow)})`);

const version = { files: [
  { id: 'a', path: 'a.bel', text: 'old a\n' },
  { id: 'b', path: 'b.bel', text: 'same\n' },
  { id: 'c', path: 'renamed.bel', text: 'c\n' },
  { id: 'd', path: 'gone-since.bel', text: 'd\n' },
] };
const current = [
  { id: 'a', path: 'a.bel', text: 'new a\n' },
  { id: 'b', path: 'b.bel', text: 'same\n' },
  { id: 'c', path: 'c.bel', text: 'c\n' },
  { id: 'e', path: 'added-since.bel', text: 'e\n' },
];
const ch = versionChanges(version, current);
const says = Object.fromEntries(ch.map((c) => [c.path, c.change]));
expect(JSON.stringify(says) === JSON.stringify({ 'a.bel': 'edited', 'renamed.bel': 'renamed', 'gone-since.bel': 'back', 'added-since.bel': 'gone' }),
  `restoring: a file edited since goes back, one renamed takes its old name, one deleted since comes back, one added since goes; the same is left out (${JSON.stringify(says)})`);
const words = ch.map((c) => c.path + ' ' + changeWords(c)).join(' | ');
expect(words === 'a.bel edited since | renamed.bel renamed since, now c.bel | gone-since.bel deleted since | added-since.bel added since',
  `each file says what became of it after the version: edited, renamed (and what it is called now), deleted or added since (${words})`);
const a = ch.find((c) => c.path === 'a.bel');
expect(a.before === 'new a\n' && a.after === 'old a\n', 'an edited file is set beside the project now: what it is, and what it would be');
expect(versionChanges({ files: current.map((f) => Object.assign({}, f)) }, current).length === 0, 'a version the same as now changes nothing');

for (const e of ['unsynced', 'review', 'no-version', 'network']) {
  const s = restoreProblem(e);
  expect(typeof s === 'string' && s.length > 10 && /\.$/.test(s) && !/—|–/.test(s), `each refusal is a sentence in the house voice (${e})`);
}
expect(/lose/.test(restoreProblem('unsynced')), 'and the one about unsynced work says what would be lost');

console.log(`OK version history (${n} checks: when, the word beside a row, what restoring would change, why it could not)`);

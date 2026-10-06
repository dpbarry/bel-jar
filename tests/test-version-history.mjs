// Version history's window (js/ui/version-history.mjs, plan v6 c6): what it
// says of each version, and what restoring one would do to the project now.
import { versionTime, versionWords, versionChanges, restoreProblem } from '../js/ui/version-history.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const now = new Date(2026, 9, 5, 15, 30).getTime();
const at = (d, h, m) => new Date(2026, 9, d, h, m).getTime();
expect(/^Today \d{1,2}:\d{2}/.test(versionTime(at(5, 9, 4), now)), `a version from today says so, with its time (${versionTime(at(5, 9, 4), now)})`);
expect(/^Yesterday \d{1,2}:\d{2}/.test(versionTime(at(4, 23, 59), now)), 'one from yesterday');
expect(/^\S+ \S+ \d{1,2}:\d{2}/.test(versionTime(at(1, 8, 0), now)) && !/2026/.test(versionTime(at(1, 8, 0), now)), 'one from this year: its date and time');
expect(/2025/.test(versionTime(new Date(2025, 11, 31, 12, 0).getTime(), now)), 'one from another year names the year');

expect(versionWords({ deleted: true, files: 0 }) === 'Deleted', 'a deletion is just that');
expect(versionWords({ name: 'P', files: 3 }, { current: true, name: 'P' }) === 'Current, 3 files', 'the newest says it is current');
expect(versionWords({ name: 'Old name', files: 1 }, { name: 'P' }) === 'Named Old name, 1 file', 'a name it had then is said; one file is one file');

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
const a = ch.find((c) => c.path === 'a.bel');
expect(a.before === 'new a\n' && a.after === 'old a\n', 'an edited file is set beside the project now: what it is, and what it would be');
expect(versionChanges({ files: current.map((f) => Object.assign({}, f)) }, current).length === 0, 'a version the same as now changes nothing');

for (const e of ['unsynced', 'review', 'no-version', 'network']) {
  const s = restoreProblem(e);
  expect(typeof s === 'string' && s.length > 10 && /\.$/.test(s) && !/—|–/.test(s), `each refusal is a sentence in the house voice (${e})`);
}
expect(/lose/.test(restoreProblem('unsynced')), 'and the one about unsynced work says what would be lost');

console.log(`OK version history (${n} checks: when, what each row says, what restoring would change, why it could not)`);

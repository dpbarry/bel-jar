// Files changed in two places, end to end below the page: the store lists them,
// reads both sides and settles one (work.mjs), the review window diffs them
// (js/ui/review-differences.mjs), the strip says so only when it needs you
// (status-strip-segments.mjs `sync`), and the cloud's words (js/account/sync-ui.mjs).
import fs from 'node:fs';
import { createMemoryServer } from '../js/persist/sync/memory-server.mjs';
import { makeDevice, syncHash, fileId } from './_sync-env.mjs';
import { lineDiff, compactDiff, otherSide, reviewWords } from '../js/ui/review-differences.mjs';
import { buildSegments } from '../js/status-strip/status-strip-segments.mjs';
import { cloudLook, cloudWords, ago } from '../js/account/sync-ui.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── the store: listed, both sides, settled ──────────────────────────────────
{
  const server = createMemoryServer({ hash: syncHash });
  const a = makeDevice(server, { name: 'A' });
  const b = makeDevice(server, { name: 'B' });
  const pid = a.work.projectId();
  const main = fileId(a.work, pid, 'main.bel');
  a.work.setText(main, 'theorem\nproof\n', pid);
  await a.engine.syncAll();
  await b.engine.syncAll();
  expect(b.work.listConflicts().length === 0, 'nothing changed in two places: nothing listed');

  a.work.setText(main, 'theorem by A\nproof\n', pid);
  b.work.setText(main, 'theorem by B\nproof\n', pid);
  await a.engine.syncAll();
  await b.engine.syncAll();
  const list = b.work.listConflicts();
  expect(list.length === 1 && list[0].pid === pid && list[0].fid === main && list[0].path === 'main.bel' && list[0].source === 'device',
    `the file changed on both devices is listed, with its path and where the other side came from (${JSON.stringify(list)})`);
  const sides = b.work.conflictSides(main, pid);
  expect(sides && sides.mine === 'theorem by B\nproof\n' && sides.theirs === 'theorem by A\nproof\n',
    'both sides read back: mine from the record, theirs from storage');

  expect(b.work.resolveStoredConflict(main, 'theirs', pid) && !b.work.readConflict(main, pid)
    && b.work.getText(main, pid) === 'theorem by A\nproof\n' && b.work.listConflicts().length === 0,
    'Use cloud: the record goes and the cloud’s text stays');

  a.work.setText(main, 'theorem by A2\nproof\n', pid);
  b.work.setText(main, 'theorem by B2\nproof\n', pid);
  await a.engine.syncAll();
  await b.engine.syncAll();
  expect(b.work.listConflicts().length === 1, 'a second overlap is listed again');
  expect(b.work.resolveStoredConflict(main, 'mine', pid) && b.work.getText(main, pid) === 'theorem by B2\nproof\n',
    'Keep mine: this device’s text is written over the other');
  await b.engine.syncAll();
  await a.engine.syncAll();
  expect(a.work.getText(main, pid) === 'theorem by B2\nproof\n', 'and it reaches the other device on the next rounds');
  expect(!b.work.resolveStoredConflict(main, 'mine', pid), 'nothing to settle: refused, nothing written');
}

// ── the diff ────────────────────────────────────────────────────────────────
{
  const rows = lineDiff('a\nb\nc\nd\ne\nf\ng', 'a\nb\nC\nd\ne\nf\ng');
  expect(rows.map((r) => r.kind[0] + r.text).join(' ') === 'sa sb tc mC sd se sf sg',
    `one changed line: the other side's line, then mine, in place (${rows.map((r) => r.kind[0] + r.text).join(' ')})`);
  const short = compactDiff(rows, 1);
  expect(short.map((r) => (r.kind === 'gap' ? 'gap' + r.count : r.kind[0] + r.text)).join(' ') === 'gap1 sb tc mC sd gap3',
    'only what changed, one line of context, the rest folded into counted gaps');
  expect(compactDiff(lineDiff('same\n', 'same\n')).length === 0, 'no difference left: nothing to show');
  const added = lineDiff('x', 'x\ny');
  expect(added.length === 2 && added[1].kind === 'mine' && added[1].text === 'y', 'a line only here is mine');
  expect(otherSide('device').use === 'Use cloud' && otherSide('tab').use === 'Use other tab', 'the other version is named for where it came from');
  const one = reviewWords([{ source: 'device' }]);
  expect(one.intro === 'This file changed here and in the cloud.' && one.theirs === 'the cloud’s', 'one file from the cloud: said once, in the introduction and the legend');
  expect(reviewWords([{ source: 'tab' }, { source: 'tab' }]).intro === 'These files changed here and in another tab.', 'files from another tab, plural');
  expect(/somewhere else/.test(reviewWords([{ source: 'tab' }, { source: 'device' }]).intro), 'a mix of sources says so without naming one');
}

// ── the strip: only when it needs you ───────────────────────────────────────
{
  const seg = (sync) => buildSegments({ sync }, 'standard').find((s) => s.key === 'sync') || null;
  const two = [{ pid: 'p', fid: 'f1', path: 'a.bel', source: 'device' }, { pid: 'p', fid: 'f2', path: 'b.bel', source: 'device' }];
  const review = seg({ signedIn: true, state: 'differs', differs: two });
  expect(review && review.text === '2 files to review' && review.action === 'review-differences' && review.tone === 'warning',
    'files to review: a warning you can click to review');
  expect(seg({ signedIn: false, state: 'differs', differs: two.slice(0, 1) }).text === '1 file to review', 'signed out too (two tabs), singular');
  expect(seg({ signedIn: true, state: 'offline', differs: [] }).text === 'Offline', 'offline, while signed in');
  const failed = seg({ signedIn: true, state: 'error', differs: [] });
  expect(failed && failed.tone === 'error' && failed.action === 'sync-now', 'a failed round: an error you can click to retry');
  for (const state of ['synced', 'syncing', 'pending']) {
    expect(seg({ signedIn: true, state, differs: [] }) === null, `"${state}" is the cloud’s to show, never the strip’s`);
  }
  expect(seg({ signedIn: false, state: 'off', differs: [] }) === null, 'signed out and nothing to review: nothing');
  const css = fs.readFileSync(new URL('../css/status-strip.css', import.meta.url), 'utf8');
  expect(/\.jar-strip__seg--sync\.is-warning\s*\{/.test(css) && /\.jar-strip__seg--sync\.is-error\s*\{/.test(css),
    'both of the segment’s tones are styled');
}

// ── the cloud's words ───────────────────────────────────────────────────────
{
  const now = Date.UTC(2026, 8, 29, 14);
  expect(cloudLook('pending') === 'syncing' && cloudLook('syncing') === 'syncing', 'waiting for a round and in one look the same');
  expect(cloudLook('differs') === 'alert' && cloudLook('error') === 'alert' && cloudLook('offline') === 'offline' && cloudLook('synced') === 'synced',
    'a state that needs you looks it');
  const synced = cloudWords({ state: 'synced', lastSync: now - 10e3, differs: [] }, now);
  expect(synced.title === 'All changes synced' && synced.detail === 'Synced just now', 'synced, and when');
  expect(ago(now - 5 * 60e3, now) === '5 minutes ago' && ago(now - 60e3, now) === '1 minute ago', 'minutes, singular and plural');
  const all = ['synced', 'syncing', 'pending', 'offline', 'error', 'differs']
    .map((state) => cloudWords({ state, lastSync: now - 3 * 60e3, differs: [{}, {}] }, now));
  expect(all.every((w) => w.title && w.tip && !/—/.test(w.title + (w.detail || '')) && w.title[0] === w.title[0].toUpperCase()),
    'every state has a title and a tip, sentence case, no em dash');
}

console.log(`OK review differences (${n} checks: listed, both sides, Use cloud, Keep mine across devices, the diff, the strip, the cloud's words)`);

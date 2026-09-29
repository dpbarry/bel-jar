// Merging three versions of a project, file by file (js/persist/sync/merge-project.mjs,
// docs/PERSIST.md §5): each rule on its own, then the laws over random projects.
import { mergeProject } from '../js/persist/sync/merge-project.mjs';
import { emptyManifest, normalizeManifest } from '../js/persist/sync/protocol.mjs';
import { conflictedCopyName } from '../js/persist/merge.mjs';
import { sha256Now } from './_sync-env.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const texts = new Map();

/** A manifest from [id, path, text] rows, and the texts by id. */
function version(spec) {
  const files = (spec.files || []).map(([id, path, text]) => {
    const hash = sha256Now(text);
    texts.set(hash, text);
    return { id, path, hash, text };
  });
  const manifest = normalizeManifest({
    v: 1,
    name: spec.name || 'P',
    createdAt: 1,
    files: files.map(({ id, path, hash }) => ({ id, path, hash })),
    folders: spec.folders || [],
    suites: spec.suites || {},
  });
  if (!manifest) throw new Error('bad test manifest');
  return { manifest, texts: Object.fromEntries(files.map((f) => [f.id, f.text])) };
}

let fresh = 0;
function merge(base, mine, theirs, extra = {}) {
  const r = mergeProject({
    base: base ? base.manifest : emptyManifest(),
    mine: mine.manifest,
    mineTexts: mine.texts,
    theirs: theirs.manifest,
    text: (h) => texts.get(h),
    conflicted: extra.conflicted,
    newFileId: () => 'f_new' + (++fresh),
  });
  if (r.needs) throw new Error('needs ' + r.needs.join());
  return r;
}

const files = (r) => r.project.files.map((f) => [f.id, f.path, f.text]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── one side changed ─────────────────────────────────────────────────────────
{
  const base = version({ files: [['f1', 'a.bel', 'x\n'], ['f2', 'b.bel', 'y\n']] });
  const mine = version({ files: [['f1', 'a.bel', 'x mine\n'], ['f2', 'b.bel', 'y\n']] });
  const theirs = version({ files: [['f1', 'a.bel', 'x\n'], ['f2', 'b.bel', 'y theirs\n']] });
  const r = merge(base, mine, theirs);
  expect(same(files(r), [['f1', 'a.bel', 'x mine\n'], ['f2', 'b.bel', 'y theirs\n']]), 'different files changed on each side: both changes kept');
  expect(!r.conflicts.length && !r.notices.length, 'nothing to ask, nothing to say');
}

// ── both changed one file ────────────────────────────────────────────────────
{
  const base = version({ files: [['f1', 'a.bel', 'one\ntwo\nthree\nfour\n']] });
  const mine = version({ files: [['f1', 'a.bel', 'ONE\ntwo\nthree\nfour\n']] });
  const theirs = version({ files: [['f1', 'a.bel', 'one\ntwo\nthree\nFOUR\n']] });
  const r = merge(base, mine, theirs);
  expect(same(files(r), [['f1', 'a.bel', 'ONE\ntwo\nthree\nFOUR\n']]), 'different lines of one file: merged');
  expect(!r.conflicts.length, 'different lines never ask');
}
{
  const base = version({ files: [['f1', 'a.bel', 'one\ntwo\n']] });
  const mine = version({ files: [['f1', 'a.bel', 'mine\ntwo\n']] });
  const theirs = version({ files: [['f1', 'a.bel', 'theirs\ntwo\n']] });
  const r = merge(base, mine, theirs);
  expect(same(files(r), [['f1', 'a.bel', 'theirs\ntwo\n']]), 'same lines: storage takes theirs');
  expect(r.conflicts.length === 1 && r.conflicts[0].mine === 'mine\ntwo\n' && r.conflicts[0].theirs === 'theirs\ntwo\n'
    && r.conflicts[0].base === 'one\ntwo\n' && r.conflicts[0].id === 'f1', 'same lines: mine waits in a conflict record, with the base');
  expect(r.notices.length === 1 && r.notices[0].kind === 'conflict' && r.notices[0].path === 'a.bel', 'and a person is told');
}
{
  const base = version({ files: [['f1', 'a.bel', 'one\n']] });
  const both = version({ files: [['f1', 'a.bel', 'same edit\n']] });
  const r = merge(base, both, both);
  expect(same(files(r), [['f1', 'a.bel', 'same edit\n']]) && !r.conflicts.length, 'the same edit on both sides is one edit');
}

// ── a conflict on a file already waiting for a person ────────────────────────
{
  const base = version({ files: [['f1', 'a.bel', 'one\n']] });
  const mine = version({ files: [['f1', 'a.bel', 'another tab\n']] });
  const theirs = version({ files: [['f1', 'a.bel', 'another device\n']] });
  const r = merge(base, mine, theirs, { conflicted: new Set(['f1']) });
  expect(!r.conflicts.length, 'no second record over one still waiting');
  expect(same(files(r), [['f1', 'a.bel', 'another device\n'], ['f_new' + fresh, 'a (conflicted copy).bel', 'another tab\n']]),
    'this side is kept as a copy beside the file; storage takes theirs; the waiting record keeps its side');
  expect(r.notices.some((x) => x.kind === 'copied' && x.path === 'a (conflicted copy).bel' && x.from === 'a.bel'), 'and a person is told where');
}

// ── deletes ──────────────────────────────────────────────────────────────────
{
  const base = version({ files: [['f1', 'a.bel', 'x\n'], ['f2', 'b.bel', 'y\n']] });
  const mine = version({ files: [['f1', 'a.bel', 'x\n']] });
  const r1 = merge(base, mine, base);
  expect(same(files(r1), [['f1', 'a.bel', 'x\n']]) && !r1.notices.length, 'deleted here, untouched there: gone');
  const r2 = merge(base, base, mine);
  expect(same(files(r2), [['f1', 'a.bel', 'x\n']]) && !r2.notices.length, 'deleted there, untouched here: gone');

  const edited = version({ files: [['f1', 'a.bel', 'x\n'], ['f2', 'b.bel', 'y edited\n']] });
  const r3 = merge(base, mine, edited);
  expect(same(files(r3), [['f1', 'a.bel', 'x\n'], ['f2', 'b.bel', 'y edited\n']]), 'deleted here, changed there: it comes back with the change');
  expect(r3.notices.length === 1 && r3.notices[0].kind === 'restored' && r3.notices[0].path === 'b.bel', 'and a person is told');
  const r4 = merge(base, edited, mine);
  expect(same(files(r4), [['f1', 'a.bel', 'x\n'], ['f2', 'b.bel', 'y edited\n']]), 'deleted there, changed here: kept');
  expect(r4.notices.length === 1 && r4.notices[0].kind === 'kept', 'and a person is told');

  const renamed = version({ files: [['f1', 'a.bel', 'x\n'], ['f2', 'moved.bel', 'y\n']] });
  const r5 = merge(base, renamed, mine);
  expect(same(files(r5), [['f1', 'a.bel', 'x\n'], ['f2', 'moved.bel', 'y\n']]), 'a rename is a change: deleted there, renamed here, kept');
  const r6 = merge(base, base, mine, { conflicted: new Set(['f2']) });
  expect(same(files(r6), [['f1', 'a.bel', 'x\n'], ['f2', 'b.bel', 'y\n']]) && r6.notices[0].kind === 'kept',
    'deleted there while a conflict waits here: kept (its other side lives only in the record)');
}

// ── renames ──────────────────────────────────────────────────────────────────
{
  const base = version({ files: [['f1', 'a.bel', 'x\n']] });
  const r1 = merge(base, version({ files: [['f1', 'mine.bel', 'x\n']] }), version({ files: [['f1', 'a.bel', 'x edited\n']] }));
  expect(same(files(r1), [['f1', 'mine.bel', 'x edited\n']]), 'renamed here, edited there: both, one file (ids, not paths)');
  const r2 = merge(base, version({ files: [['f1', 'mine.bel', 'x\n']] }), version({ files: [['f1', 'theirs.bel', 'x\n']] }));
  expect(same(files(r2), [['f1', 'mine.bel', 'x\n']]), 'renamed on both: mine');
}

// ── two files, one path ──────────────────────────────────────────────────────
{
  const base = version({ files: [['f1', 'a.bel', 'x\n']] });
  const mine = version({ files: [['f1', 'a.bel', 'x\n'], ['f2', 'lemma.bel', 'mine\n']] });
  const theirs = version({ files: [['f1', 'a.bel', 'x\n'], ['f3', 'lemma.bel', 'theirs\n']] });
  const r = merge(base, mine, theirs);
  expect(same(files(r), [['f1', 'a.bel', 'x\n'], ['f3', 'lemma.bel', 'theirs\n'], ['f2', 'lemma (conflicted copy).bel', 'mine\n']]),
    'made on both sides at one path: the server\'s keeps it, this one is renamed, nothing is lost');
  expect(r.notices.length === 1 && r.notices[0].kind === 'renamed' && r.notices[0].from === 'lemma.bel', 'and a person is told');
  const taken = new Set(['a (conflicted copy).bel']);
  expect(conflictedCopyName('a.bel', taken) === 'a (conflicted copy 2).bel', 'a copy name that is taken is numbered');
  expect(conflictedCopyName('dir/Makefile', new Set()) === 'dir/Makefile (conflicted copy)', 'no extension, no problem');
}

// ── order ────────────────────────────────────────────────────────────────────
{
  const base = version({ files: [['f1', 'a.bel', '']] });
  const mine = version({ files: [['f1', 'a.bel', ''], ['f2', 'b.bel', '']] });
  const theirs = version({ files: [['f3', 'c.bel', ''], ['f1', 'a.bel', '']] });
  const r = merge(base, mine, theirs);
  expect(same(r.project.files.map((f) => f.id), ['f3', 'f1', 'f2']), 'the server\'s order, then what was added here');
}

// ── folders, suites, name ────────────────────────────────────────────────────
{
  const base = version({ folders: ['kept', 'dropped-here', 'dropped-there'] });
  const mine = version({ folders: ['kept', 'dropped-there', 'new-here'] });
  const theirs = version({ folders: ['kept', 'dropped-here', 'new-there'] });
  const r = merge(base, mine, theirs);
  expect(same(r.project.folders, ['kept', 'new-here', 'new-there']), 'empty folders merge as a set: made by either, dropped by either');
  const withFile = version({ files: [['f1', 'new-there/x.bel', '']], folders: ['kept', 'dropped-here', 'new-there'] });
  expect(!merge(base, mine, withFile).project.folders.includes('new-there'), 'a folder with a file under it is not an empty folder');
}
{
  const base = version({ suites: { '': ['a.cfg'], lib: ['lib/l.cfg'] } });
  const mine = version({ suites: { '': ['b.cfg'], lib: ['lib/l.cfg'] } });
  const theirs = version({ suites: { '': ['a.cfg'], lib: ['lib/m.cfg'] } });
  const r = merge(base, mine, theirs);
  expect(same(r.project.suites, { '': ['b.cfg'], lib: ['lib/m.cfg'] }), 'suites merge per directory');
  const theirs2 = version({ suites: { '': ['c.cfg'], lib: ['lib/l.cfg'] } });
  expect(same(merge(base, mine, theirs2).project.suites[''], ['b.cfg']), 'one directory changed on both: mine');
}
{
  const base = version({ name: 'Base' });
  expect(merge(base, version({ name: 'Mine' }), base).project.name === 'Mine', 'renamed here: mine');
  expect(merge(base, base, version({ name: 'Theirs' })).project.name === 'Theirs', 'renamed there: theirs');
  expect(merge(base, version({ name: 'Mine' }), version({ name: 'Theirs' })).project.name === 'Mine', 'renamed on both: mine');
}

// ── no common version (the sync record was lost) ─────────────────────────────
{
  const mine = version({ files: [['f1', 'a.bel', 'same\n'], ['f2', 'b.bel', 'mine\n']] });
  const theirs = version({ files: [['f1', 'a.bel', 'same\n'], ['f2', 'b.bel', 'theirs\n']] });
  const r = merge(null, mine, theirs);
  expect(files(r)[0][2] === 'same\n' && r.conflicts.length === 1 && r.conflicts[0].id === 'f2',
    'with no common version, what matches is kept and what differs is a conflict, never a guess');
}

// ── what it needs to fetch ───────────────────────────────────────────────────
{
  const base = version({ files: [['f1', 'a.bel', 'base only\n']] });
  const mine = version({ files: [['f1', 'a.bel', 'mine only\n']] });
  const theirs = version({ files: [['f1', 'a.bel', 'theirs only\n']] });
  const unknown = new Set([base.manifest.files[0].hash, theirs.manifest.files[0].hash]);
  const r = mergeProject({
    base: base.manifest, mine: mine.manifest, mineTexts: mine.texts, theirs: theirs.manifest,
    text: (h) => (unknown.has(h) ? undefined : texts.get(h)), newFileId: () => 'x',
  });
  expect(r.needs && same(r.needs.slice().sort(), [...unknown].sort()), 'it names the texts it needs (base and theirs), and does nothing else');
}

// ── laws, over random projects ───────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(7);
const pickOf = (xs) => xs[Math.floor(rand() * xs.length)];
function randomVersion(from) {
  const rows = from ? from.map((r) => r.slice()) : [];
  const ops = 1 + Math.floor(rand() * 4);
  for (let i = 0; i < ops; i++) {
    const r = rand();
    if (r < 0.3 || !rows.length) {
      const path = 'p' + Math.floor(rand() * 8) + '.bel';
      if (!rows.some((x) => x[1] === path)) rows.push(['f' + Math.floor(rand() * 1e6), path, 'l' + Math.floor(rand() * 5) + '\n']);
    } else if (r < 0.7) {
      const row = pickOf(rows);
      const lines = row[2].split('\n');
      lines.splice(Math.floor(rand() * lines.length), 0, 'e' + Math.floor(rand() * 5));
      row[2] = lines.join('\n');
    } else if (r < 0.85) {
      const row = pickOf(rows);
      const path = 'p' + Math.floor(rand() * 8) + '.bel';
      if (!rows.some((x) => x[1] === path)) row[1] = path;
    } else {
      rows.splice(rows.indexOf(pickOf(rows)), 1);
    }
  }
  return rows;
}
let laws = 0;
for (let i = 0; i < 600; i++) {
  const b = randomVersion(null);
  const m = randomVersion(b);
  const t = randomVersion(b);
  const B = version({ files: b });
  const M = version({ files: m });
  const T = version({ files: t });
  const unchangedThere = merge(B, M, B);
  expect(same(files(unchangedThere), m), `law: nothing changed there → exactly mine (${i})`);
  const unchangedHere = merge(B, B, T);
  expect(same(files(unchangedHere), t), `law: nothing changed here → exactly theirs (${i})`);
  const agreed = merge(B, M, M);
  expect(same(files(agreed), m) && !agreed.conflicts.length, `law: both made the same change → that change (${i})`);
  const r = merge(B, M, T);
  const paths = r.project.files.map((f) => f.path);
  expect(new Set(paths).size === paths.length, `law: a merge never leaves two files at one path (${i})`);
  const ids = r.project.files.map((f) => f.id);
  for (const row of m) {
    const inBase = b.find((x) => x[0] === row[0]);
    const changedHere = !inBase || inBase[1] !== row[1] || inBase[2] !== row[2];
    if (changedHere) expect(ids.includes(row[0]), `law: a file changed here survives the merge (${i})`);
  }
  for (const row of t) {
    const inBase = b.find((x) => x[0] === row[0]);
    const changedThere = !inBase || inBase[1] !== row[1] || inBase[2] !== row[2];
    if (changedThere) expect(ids.includes(row[0]), `law: a file changed there survives the merge (${i})`);
  }
  laws += 1;
}

console.log(`OK sync merge (${n} checks: every rule, and ${laws} random three-way project merges against the laws)`);

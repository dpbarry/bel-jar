// The open document (js/persist/document.mjs, docs/PERSIST.md §4.2, §4.4):
// text, view and semantic checkpoint round-trip through three records of three
// classes; a save writes only what changed; a change made underneath an open
// file is merged or kept as a conflict, never overwritten; and the engine
// accepts a checkpoint only for the text it was computed from.
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSemanticEngine } from '../js/editor-src/semantic/semantic-engine.mjs';
import { classOf } from '../js/persist/store.mjs';
import { makeBrowserStorage, openTab } from './_persist-env.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const SAMPLE = `LF o : type =\n  | imp : o → o → o\n;\nLF nd : o → type =\n  | impI : nd → nd\n;\n`;
const ndPos = SAMPLE.indexOf('LF nd') + 3;

function providers(fp, over = {}) {
  return {
    getSemantic: () => ({
      types: { v: 1, decls: [['k', 'T', 'fp1']], metavars: [], reconstructed: [] },
      identity: [['sym-k', 'id-1']],
      deriveAttempted: [['sym-k', 'fp1']],
    }),
    getViewport: () => ({ selection: { anchor: 5, head: 5 }, centerLine: 42, scrollTop: 120, scrollLeft: 8 }),
    getDocFp: (text) => fp(text),
    getBelugaBuild: () => 'stable',
    ...over,
  };
}

/**
 * The keys written or removed while `fn` runs. Counts the calls, not the
 * difference: a rewrite within the same millisecond stores an identical
 * envelope, and would look like no write at all.
 */
function writesDuring(storage, fn) {
  const touched = [];
  const { setItem, removeItem } = storage;
  storage.setItem = (k, v) => { touched.push(k); return setItem.call(storage, k, v); };
  storage.removeItem = (k) => { touched.push(k); return removeItem.call(storage, k); };
  try {
    fn();
  } finally {
    storage.setItem = setItem;
    storage.removeItem = removeItem;
  }
  return touched;
}

// ── three records, three classes, and back again ───────────────────────────
{
  const storage = makeBrowserStorage();
  const { P } = openTab(storage);
  const pid = P.getActiveProjectId();
  const id = P.listFiles()[0].id;
  const p = P.createPersist({ documentId: id, debounceMs: 1 });
  p.setCheckpointProviders(providers(P.documentFingerprint));
  p.scheduleEditorPersist(SAMPLE);
  p.flushCheckpoint();

  const textKey = `beljar/p/${pid}/f/${id}`;
  const sessionKey = `beljar/p/${pid}/session`;
  const cacheKey = `beljar/p/${pid}/cache/${id}`;
  expect(JSON.parse(storage.getItem(textKey)).data.text === SAMPLE, 'the text is in the file record');
  expect(JSON.parse(storage.getItem(sessionKey)).data.views[id].centerLine === 42, 'the view is in the session');
  expect(JSON.parse(storage.getItem(cacheKey)).data.types.decls.length === 1, 'the checkpoint is in the cache record');
  expect(classOf(textKey) === 'work' && classOf(sessionKey) === 'device' && classOf(cacheKey) === 'cache',
    'as work, device and cache: text syncs, the view stays on this device, the checkpoint can be evicted');

  const reopened = openTab(storage).P.createPersist({ documentId: id });
  const snap = reopened.getInitialCheckpoint();
  expect(snap.meta.documentId === id && snap.editor.text === SAMPLE, 'text round-trips through a reload');
  const v = snap.editor.local;
  expect(v.selection.anchor === 5 && v.centerLine === 42 && v.scrollTop === 120 && v.scrollLeft === 8, 'the view round-trips');
  expect(snap.semantic && snap.semantic.types.decls.length === 1 && snap.semantic.identity.length === 1, 'the checkpoint round-trips');
  expect(snap.semantic.docFp === P.documentFingerprint(SAMPLE), 'stamped with the fingerprint of the text it describes');
}

// ── ⛔ a save writes only what changed ──────────────────────────────────────
{
  const storage = makeBrowserStorage();
  const { P } = openTab(storage);
  const id = P.listFiles()[0].id;
  const p = P.createPersist({ documentId: id, debounceMs: 1 });
  let view = { selection: { anchor: 1, head: 1 } };
  let text = SAMPLE;
  p.setCheckpointProviders(providers(P.documentFingerprint, { getText: () => text, getViewport: () => view }));
  p.flushCheckpoint();

  expect(writesDuring(storage, () => p.flushCheckpoint()).length === 0, 'a save with nothing changed writes nothing');
  view = { selection: { anchor: 9, head: 9 } };
  const viewOnly = writesDuring(storage, () => p.flushCheckpoint());
  expect(viewOnly.length === 1 && viewOnly[0].endsWith('/session'), `moving the cursor writes only the session (${viewOnly})`);
  text = SAMPLE + '\n% more';
  const textOnly = writesDuring(storage, () => p.flushCheckpoint());
  expect(textOnly.some((k) => k.includes('/f/')) && !textOnly.some((k) => k.endsWith('/session')),
    `typing writes the text, not the unchanged view (${textOnly})`);
}

// ── a checkpoint of only reconstructed types is still saved; none removes it ─
{
  const storage = makeBrowserStorage();
  const { P } = openTab(storage);
  const id = P.listFiles()[0].id;
  const p = P.createPersist({ documentId: id, debounceMs: 1 });
  let semantic = { types: { v: 1, decls: [], metavars: [], reconstructed: [['sk-nd', 'R(nd)', 'fp-1']] }, identity: [], deriveAttempted: [] };
  p.setCheckpointProviders(providers(P.documentFingerprint, { getSemantic: () => semantic }));
  p.scheduleEditorPersist(SAMPLE);
  p.flushCheckpoint();
  expect(p.getSemanticCheckpoint().types.reconstructed.length === 1, 'a reconstructed-only checkpoint is saved');
  semantic = { types: { v: 1, decls: [], metavars: [], reconstructed: [] }, identity: [], deriveAttempted: [] };
  p.flushCheckpoint();
  expect(p.getSemanticCheckpoint() === null, 'an empty one reads as none');
  expect(![...storage.map.keys()].some((k) => k.includes('/cache/')), 'and its record is removed');
}

// ── switchFile saves the old file, then loads the new one's three records ──
{
  const storage = makeBrowserStorage();
  const { P } = openTab(storage);
  const a = P.listFiles()[0].id;
  const b = P.createFile('b.bel');
  P.setFileText(b, 'LF b : type;');
  const p = P.createPersist({ documentId: a, debounceMs: 1 });
  p.setCheckpointProviders(providers(P.documentFingerprint, { getText: () => 'LF a : type;' }));
  const snap = p.switchFile(b);
  expect(P.getFileText(a) === 'LF a : type;', 'the file being left is saved first');
  expect(snap.meta.documentId === b && snap.editor.text === 'LF b : type;' && snap.semantic === null, 'the new file loads its own records');
  p.flushCheckpoint();
  expect(P.getFileText(b) === 'LF b : type;', 'and the stale providers are dropped: b never receives a\'s text');
}

// ── the engine accepts a checkpoint only for its text ──────────────────────
{
  const { P } = openTab(makeBrowserStorage());
  const fp = P.documentFingerprint;
  const e = createSemanticEngine();
  e.update(parser.parse(SAMPLE), Text.of(SAMPLE.split('\n')));
  e.observeType(ndPos, 'D(nd)');

  const exported = e.exportCheckpoint();
  expect(exported.types.decls.some(([, t]) => t === 'D(nd)'), 'exportCheckpoint has the decl type');

  const e2 = createSemanticEngine();
  e2.update(parser.parse(SAMPLE), Text.of(SAMPLE.split('\n')));
  const ok = e2.importCheckpoint(
    { ...exported, docFp: fp(SAMPLE), belugaBuild: 'stable' },
    { docFp: fp(SAMPLE), belugaBuild: 'stable' },
  );
  expect(ok.ok, 'importCheckpoint accepts a matching fingerprint');
  const c = e2.cachedTypeAt(ndPos);
  expect(c && c.type === 'D(nd)' && c.source === 'hydrated', `the hydrated type is restored, got ${c && c.type}`);

  const e3 = createSemanticEngine();
  const CHANGED = SAMPLE.replace('| impI : nd → nd', '| impI : nd → nd → nd');
  e3.update(parser.parse(CHANGED), Text.of(CHANGED.split('\n')));
  const ok3 = e3.importCheckpoint(
    { types: exported.types, belugaBuild: 'stable' },
    { docFp: fp(CHANGED), belugaBuild: 'stable' },
  );
  expect(ok3.ok, 'import without a blob fingerprint applies types behind the per-decl gate');
  const c3 = e3.cachedTypeAt(CHANGED.indexOf('LF nd') + 3);
  expect(c3.source === 'annotation', 'the per-decl gate drops a stale type on a changed decl');

  const mismatch = e2.importCheckpoint(
    { ...exported, docFp: 'wrong', belugaBuild: 'stable' },
    { docFp: fp(SAMPLE), belugaBuild: 'stable' },
  );
  expect(!mismatch.ok && mismatch.reason === 'doc-fp-mismatch', 'a fingerprint mismatch is rejected');
}

// ── ⛔ a change underneath an open file is never overwritten (§4.4) ────────
// A fake editor that behaves like the real one: it shows what the document
// hands it (applyExternalText), and peekText reads the buffer as it stands.
function openEditor(P, fid) {
  const doc = P.createPersist({ documentId: fid, debounceMs: 1 });
  const ed = { text: doc.getEditorText() };
  doc.setCheckpointProviders({
    getText: () => ed.text,
    peekText: () => ed.text,
    applyExternalText: (next) => { ed.text = next; },
  });
  return { doc, ed };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

{
  // Nothing unsaved here: the other tab's change is simply taken.
  const browser = makeBrowserStorage();
  const A = openTab(browser).P;
  const id = A.listFiles()[0].id;
  A.setFileText(id, 'line 1\nline 2\n');
  const { doc, ed } = openEditor(A, id);
  openTab(browser).P.setFileText(id, 'line 1\nline 2\nfrom B\n');
  await settle();
  expect(ed.text === 'line 1\nline 2\nfrom B\n', "with nothing unsaved, the editor shows the other tab's change");
  doc.flushCheckpoint();
  expect(A.getFileText(id) === 'line 1\nline 2\nfrom B\n', 'and saving writes nothing over it');
  doc.dispose();
}

for (const order of ['event first', 'save first']) {
  // Unsaved edits that do not touch theirs: both survive (the lost update of 2026-09-24).
  const browser = makeBrowserStorage();
  const A = openTab(browser).P;
  const id = A.listFiles()[0].id;
  A.setFileText(id, 'line 1\nline 2\n');
  const { doc, ed } = openEditor(A, id);
  ed.text = 'line one\nline 2\n'; // typed in A, not yet saved
  doc.markEditorDirty();
  openTab(browser).P.setFileText(id, 'line 1\nline 2\nline 3 from B\n');
  if (order === 'event first') await settle();
  doc.flushCheckpoint();
  await settle();
  const want = 'line one\nline 2\nline 3 from B\n';
  expect(A.getFileText(id) === want, `${order}: both edits are in storage (${JSON.stringify(A.getFileText(id))})`);
  expect(ed.text === want, `${order}: and in the editor`);
  expect(doc.getConflict() === null, `${order}: with no conflict to resolve`);
  doc.dispose();
}

{
  // Edits to the same line: both kept, storage untouched, a person asked.
  const browser = makeBrowserStorage();
  const A = openTab(browser).P;
  const id = A.listFiles()[0].id;
  A.setFileText(id, 'line 1\nline 2\n');
  const { doc, ed } = openEditor(A, id);
  ed.text = 'line ONE (mine)\nline 2\n';
  doc.markEditorDirty();
  openTab(browser).P.setFileText(id, 'line one (theirs)\nline 2\n');
  await settle();
  const c = doc.getConflict();
  expect(c && c.mine === 'line ONE (mine)\nline 2\n' && c.theirs === 'line one (theirs)\nline 2\n' && c.base === 'line 1\nline 2\n',
    'the same line changed on both sides is a conflict holding all three versions');
  expect(c.source === 'tab', 'and it says theirs came from another tab');
  expect(ed.text === 'line ONE (mine)\nline 2\n', 'the editor keeps mine');
  doc.flushCheckpoint();
  ed.text = 'line ONE (mine, edited more)\nline 2\n';
  doc.flushCheckpoint();
  expect(A.getFileText(id) === 'line one (theirs)\nline 2\n', 'saving while unresolved writes nothing over theirs');
  const pid = A.getActiveProjectId();
  const rec = JSON.parse(browser.getItem(`beljar/p/${pid}/conflict/${id}`)).data;
  expect(rec.mine === 'line ONE (mine, edited more)\nline 2\n', 'mine keeps being saved, into the conflict record');

  // A reload: the conflict and my text come back.
  doc.dispose();
  const again = openTab(browser).P;
  const back = again.createPersist({ documentId: id });
  const c2 = back.getConflict();
  expect(back.getEditorText() === 'line ONE (mine, edited more)\nline 2\n' && c2 && c2.theirs === 'line one (theirs)\nline 2\n',
    'after a reload the editor opens on mine, still in conflict with theirs');

  // Keep both: mine stays here, theirs becomes a copy beside it.
  const r = back.resolveConflict('both');
  const copy = again.getFileById(r.copyId);
  expect(r.ok && copy && copy.name === 'main (conflicted copy).bel', `keep both saves theirs as a copy (${copy && copy.name})`);
  expect(again.getFileText(r.copyId) === 'line one (theirs)\nline 2\n', 'holding theirs');
  expect(again.getFileText(id) === 'line ONE (mine, edited more)\nline 2\n' && back.getConflict() === null, 'and the file holds mine, resolved');
  expect(browser.getItem(`beljar/p/${pid}/conflict/${id}`) === null, 'the conflict record is gone');
  back.dispose();
}

for (const choice of ['mine', 'theirs']) {
  const browser = makeBrowserStorage();
  const A = openTab(browser).P;
  const id = A.listFiles()[0].id;
  A.setFileText(id, 'x\n');
  const { doc, ed } = openEditor(A, id);
  ed.text = 'mine\n';
  doc.markEditorDirty();
  openTab(browser).P.setFileText(id, 'theirs\n');
  await settle();
  const r = doc.resolveConflict(choice);
  const want = choice === 'mine' ? 'mine\n' : 'theirs\n';
  expect(r.ok && A.getFileText(id) === want && ed.text === want && doc.getConflict() === null,
    `choosing ${choice}: storage and editor both hold ${JSON.stringify(want)}`);
  expect(A.listFiles().length === 1, `choosing ${choice} makes no copy`);
  doc.dispose();
}

{
  // An editor that cannot show a change must not be told it has one.
  const browser = makeBrowserStorage();
  const A = openTab(browser).P;
  const id = A.listFiles()[0].id;
  A.setFileText(id, 'a\n');
  const doc = A.createPersist({ documentId: id, debounceMs: 1 });
  doc.setCheckpointProviders({ getText: () => 'a\n' });
  openTab(browser).P.setFileText(id, 'a\nb\n');
  await settle();
  expect(doc.getConflict() !== null, 'without applyExternalText the change becomes a conflict, not a silent adopt');
  doc.flushCheckpoint();
  expect(A.getFileText(id) === 'a\nb\n', 'so its next save cannot put the old text back');
  doc.dispose();
}

{
  // A rewrite in the same tab (a .cfg following a rename) reaches the open editor too.
  const { P } = openTab(makeBrowserStorage());
  const id = P.listFiles()[0].id;
  const { doc, ed } = openEditor(P, id);
  P.setFileText(id, 'rewritten here\n');
  await settle();
  expect(ed.text === 'rewritten here\n', 'a same-tab rewrite of the open file is shown');
  doc.dispose();
}

console.log(`OK document (${n} checks: three records of three classes, writes only what changed, cache removal, switchFile, changes underneath merged or kept as a conflict, fingerprint gate)`);

// Multi-file switch correctness: switching documents must (1) save the old
// file's records while its providers are still wired, (2) drop the providers
// so a save scheduled in the switch gap cannot write old-engine data into the
// NEW file's records, and (3) load the new file's own state. Also pins that a
// fresh engine mints symbol ids under its own documentId.
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSemanticEngine } from '../js/editor-src/semantic/semantic-engine.mjs';
import { createSemanticScheduler } from '../js/editor-src/semantic/semantic-scheduler.mjs';
import { makeBrowserStorage, openTab } from './_persist-env.mjs';

const storage = makeBrowserStorage();
const Persist = openTab(storage).P;

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const fp = Persist.documentFingerprint;
const TEXT_A = `LF o : type =
  | imp : o → o → o
;
`;
const TEXT_B = `LF tm : type =
  | lam : (tm → tm) → tm
;
`;
const FILE_A = Persist.listFiles()[0].id;
const FILE_B = Persist.createFile('second.bel');
const PID = Persist.getActiveProjectId();
const record = (kind, id) => {
  const raw = storage.getItem(`beljar/p/${PID}/${kind}/${id}`);
  return raw ? JSON.parse(raw).data : null;
};

// --- switchFile isolates the two files' stored state ---------------------------
{
  const p = Persist.createPersist({ documentId: FILE_A, debounceMs: 1 });

  // Simulate the mounted editor for A: providers reflect engine A.
  p.setCheckpointProviders({
    getSemantic: () => ({
      types: { v: 1, decls: [['sym-A', 'T(A)', 'fpA']], metavars: [], reconstructed: [] },
      identity: [['sym-A', 'id-A']],
      deriveAttempted: [],
    }),
    getViewport: () => ({}),
    getDocFp: (text) => fp(text),
    getBelugaBuild: () => 'stable',
  });
  p.scheduleEditorPersist(TEXT_A);
  p.flushCheckpoint();

  // B's text exists already (as if created earlier).
  Persist.setFileText(FILE_B, TEXT_B);

  // Switch A -> B.
  const snapshot = p.switchFile(FILE_B);

  // (a) A's records hold A's text and A-engine checkpoint, fingerprinted for A.
  expect(record('f', FILE_A).text === TEXT_A, "A's text saved in A's record");
  const semA = record('cache', FILE_A);
  expect(semA && semA.docFp === fp(TEXT_A), "A's checkpoint fingerprint matches A's text");
  expect(semA.types.decls[0][0] === 'sym-A', "A's engine payload in A's cache record");

  // (b) the returned snapshot is B's.
  expect(snapshot.meta.documentId === FILE_B, 'snapshot documentId is B');
  expect(snapshot.editor.text === TEXT_B, "snapshot text is B's");
  expect(p.getCurrentFileId() === FILE_B, 'current file id is B');

  // (c) a save fired in the gap BEFORE the new editor rewires providers must
  //     NOT write A-engine data into B's records (providers were dropped).
  p.flushCheckpoint();
  expect(record('f', FILE_B).text === TEXT_B, "gap-save kept B's text");
  const bSem = record('cache', FILE_B);
  expect(
    !bSem || !bSem.types.decls.some(([k]) => k === 'sym-A'),
    "gap-save did not leak A's engine payload into B's records",
  );

  // (d) after the remount re-wires providers to engine B, saves go to B only.
  p.setCheckpointProviders({
    getSemantic: () => ({
      types: { v: 1, decls: [['sym-B', 'T(B)', 'fpB']], metavars: [], reconstructed: [] },
      identity: [['sym-B', 'id-B']],
      deriveAttempted: [],
    }),
    getViewport: () => ({}),
    getDocFp: (text) => fp(text),
    getBelugaBuild: () => 'stable',
  });
  p.scheduleEditorPersist(TEXT_B);
  p.flushCheckpoint();

  expect(record('cache', FILE_B).types.decls[0][0] === 'sym-B', "B-engine payload saved in B's cache record");
  expect(record('cache', FILE_A).types.decls[0][0] === 'sym-A', "A's records untouched by B saves");
}

// --- fresh engine mints ids under its own documentId ----------------------------
{
  const eA = createSemanticEngine({ documentId: FILE_A });
  eA.update(parser.parse(TEXT_A), Text.of(TEXT_A.split('\n')));
  const eB = createSemanticEngine({ documentId: FILE_B });
  eB.update(parser.parse(TEXT_B), Text.of(TEXT_B.split('\n')));

  const symsA = eA.getSnapshot().symbols.globalSymbols;
  const symsB = eB.getSnapshot().symbols.globalSymbols;
  expect(symsA.length > 0 && symsB.length > 0, 'both engines produced symbols');
  expect(symsA.every((s) => s.id.startsWith(FILE_A + '#')), 'A symbol ids carry A documentId');
  expect(symsB.every((s) => s.id.startsWith(FILE_B + '#')), 'B symbol ids carry B documentId');
}

// --- scheduler stop() is permanent ----------------------------------------------
{
  const fakeEngine = {
    stores: { symbols: { getSnapshot: () => ({ symbolsById: new Map(), globalSymbols: [] }) } },
    dirtyFrontier: () => [],
  };
  const sched = createSemanticScheduler(fakeEngine, {});
  sched.enqueue('id-1', { from: 0, to: 5 });
  expect(sched.getStatus().queued === 1, 'live scheduler accepts work');
  sched.stop();
  expect(sched.getStatus().queued === 0, 'stop clears the queue');
  sched.enqueue('id-2', { from: 0, to: 5 });
  sched.markDirty('id-3', { from: 0, to: 5 });
  sched.startBackground();
  expect(sched.getStatus().queued === 0, 'stopped scheduler accepts no work');
}

console.log('OK multifile switch (state isolation, provider drop, per-doc symbol ids, scheduler stop)');

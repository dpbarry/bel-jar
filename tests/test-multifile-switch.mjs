// Multi-file switch correctness: switching documents must (1) flush the old
// file's checkpoint under the OLD key while its providers are still wired,
// (2) drop the providers so a save scheduled in the switch gap cannot write
// old-engine data under the NEW key, and (3) load the new file's own state.
// Also pins that a fresh engine mints symbol ids under its own documentId.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSemanticEngine } from '../js/editor-src/semantic/semantic-engine.mjs';
import { createSemanticScheduler } from '../js/editor-src/semantic/semantic-scheduler.mjs';
import { runPersistStackInContext } from './persist-stack.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ctx = vm.createContext({
  globalThis: {},
  clearTimeout,
  setTimeout,
  TextEncoder,
});
ctx.globalThis = ctx;
const Persist = runPersistStackInContext(ctx);

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const fp = Persist.documentFingerprint;
const TEXT_A = `LF o : type =\n  | imp : o → o → o\n;\n`;
const TEXT_B = `LF tm : type =\n  | lam : (tm → tm) → tm\n;\n`;
const FILE_A = Persist.DEFAULT_DOCUMENT_ID; // workspace://main.bel
const FILE_B = 'workspace://second.bel';

function keyFor(id, backend) {
  // stateKeyFor is private; recover the key by writing a sentinel state and
  // finding which backend key holds it.
  const probe = Persist.createPersist({ backend, documentId: id });
  probe.scheduleEditorPersist('__probe__' + id);
  probe.flushCheckpoint();
  const dump = backend._dump();
  for (const k of Object.keys(dump)) {
    const v = JSON.parse(dump[k]);
    if (v && v.editor && v.editor.text === '__probe__' + id) return k;
  }
  return null;
}

// --- switchFile isolates the two files' stored state ---------------------------
{
  const backend = Persist.createMemoryBackend();
  const KEY_A = keyFor(FILE_A, backend);
  const KEY_B = keyFor(FILE_B, backend);
  expect(KEY_A && KEY_B && KEY_A !== KEY_B, 'A and B persist under distinct keys');

  const p = Persist.createPersist({ backend, documentId: FILE_A, debounceMs: 1 });

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

  // Pre-seed B's slot with its own text (as if created earlier).
  {
    const pb = Persist.createPersist({ backend, documentId: FILE_B });
    pb.scheduleEditorPersist(TEXT_B);
    pb.flushCheckpoint();
  }

  // Switch A -> B.
  const snapshot = p.switchFile(FILE_B);

  // (a) A's blob landed under A's key, fingerprinted for A's text, with
  //     A-engine semantic payload.
  const storedA = JSON.parse(backend._dump()[KEY_A]);
  expect(storedA.editor.text === TEXT_A, "A's text saved under A's key");
  expect(storedA.semantic && storedA.semantic.docFp === fp(TEXT_A), "A's semantic docFp matches A's text");
  expect(storedA.semantic.types.decls[0][0] === 'sym-A', "A's semantic payload under A's key");

  // (b) the returned snapshot is B's.
  expect(snapshot.meta.documentId === FILE_B, 'snapshot documentId is B');
  expect(snapshot.editor.text === TEXT_B, "snapshot text is B's");
  expect(p.getCurrentFileId() === FILE_B, 'current file id is B');

  // (c) a save fired in the gap BEFORE the new editor rewires providers must
  //     NOT write A-engine data under B's key (providers were dropped).
  p.flushCheckpoint();
  const storedB = JSON.parse(backend._dump()[KEY_B]);
  expect(storedB.editor.text === TEXT_B, "gap-save kept B's text");
  const bSem = storedB.semantic;
  expect(
    !bSem || !bSem.types.decls.some(([k]) => k === 'sym-A'),
    "gap-save did not leak A's engine payload under B's key",
  );

  // (d) after the remount re-wires providers to engine B, saves go under B only.
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

  const storedB2 = JSON.parse(backend._dump()[KEY_B]);
  expect(storedB2.semantic.types.decls[0][0] === 'sym-B', "B-engine payload saved under B's key");
  const storedA2 = JSON.parse(backend._dump()[KEY_A]);
  expect(storedA2.semantic.types.decls[0][0] === 'sym-A', "A's key untouched by B saves");
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

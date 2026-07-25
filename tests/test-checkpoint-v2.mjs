import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSemanticEngine } from '../js/editor-src/semantic/semantic-engine.mjs';
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
const SAMPLE = `LF o : type =\n  | imp : o → o → o\n;\nLF nd : o → type =\n  | impI : nd → nd\n;\n`;
const ndPos = SAMPLE.indexOf('LF nd') + 3;

// --- persist v2 round-trip via memory backend --------------------------------
{
  const backend = Persist.createMemoryBackend();
  const p = Persist.createPersist({ backend, debounceMs: 1 });

  p.setCheckpointProviders({
    getSemantic: () => ({
      types: { v: 1, decls: [['k', 'T', 'fp1']], metavars: [], reconstructed: [] },
      identity: [['sym-k', 'id-1']],
      deriveAttempted: [['sym-k', 'fp1']],
    }),
    getViewport: () => ({
      selection: { anchor: 5, head: 5 },
      centerLine: 42,
      scrollTop: 120,
      scrollLeft: 8,
    }),
    getDocFp: (text) => fp(text),
    getBelugaBuild: () => 'stable',
  });

  p.scheduleEditorPersist(SAMPLE);
  p.flushCheckpoint();

  const snap = p.getInitialCheckpoint();
  expect(snap.v === 3, 'checkpoint schema v3');
  expect(snap.editor.text === SAMPLE, 'text round-trips');
  expect(snap.editor.local.selection.anchor === 5, 'selection round-trips');
  expect(snap.editor.local.centerLine === 42, 'centerLine round-trips');
  expect(snap.editor.local.scrollTop === 120, 'scrollTop round-trips');
  expect(snap.editor.local.scrollLeft === 8, 'scrollLeft round-trips');
  expect(snap.meta.revision >= 1, 'revision bumped');
  expect(snap.semantic && snap.semantic.types.decls.length === 1, 'semantic types saved');
  expect(snap.semantic.identity.length === 1, 'identity saved');
}

// --- legacy v1 migration -------------------------------------------------------
{
  const backend = Persist.createMemoryBackend({
    [Persist.LEGACY_STATE_KEY]: JSON.stringify({ v: 1, editor: { text: 'legacy text' } }),
  });
  const p = Persist.createPersist({ backend });
  expect(p.getEditorText() === 'legacy text', 'v1 text migrates');
}

// --- engine importCheckpoint gating --------------------------------------------
{
  const e = createSemanticEngine();
  e.update(parser.parse(SAMPLE), Text.of(SAMPLE.split('\n')));
  e.observeType(ndPos, 'D(nd)');

  const exported = e.exportCheckpoint();
  expect(exported.types.decls.some(([, t]) => t === 'D(nd)'), 'exportCheckpoint has decl type');

  const e2 = createSemanticEngine();
  e2.update(parser.parse(SAMPLE), Text.of(SAMPLE.split('\n')));
  const ok = e2.importCheckpoint(
    { ...exported, docFp: fp(SAMPLE), belugaBuild: 'stable' },
    { docFp: fp(SAMPLE), belugaBuild: 'stable' },
  );
  expect(ok.ok, 'importCheckpoint accepts matching fp');
  const c = e2.cachedTypeAt(ndPos);
  expect(c && c.type === 'D(nd)' && c.source === 'hydrated', `hydrated type restored, got ${c && c.type}`);

  const e3 = createSemanticEngine();
  const CHANGED = SAMPLE.replace('| impI : nd → nd', '| impI : nd → nd → nd');
  e3.update(parser.parse(CHANGED), Text.of(CHANGED.split('\n')));
  const ok3 = e3.importCheckpoint(
    { types: exported.types, belugaBuild: 'stable' },
    { docFp: fp(CHANGED), belugaBuild: 'stable' },
  );
  expect(ok3.ok, 'import without blob docFp applies types with per-decl gate');
  const ndPosChanged = CHANGED.indexOf('LF nd') + 3;
  const c3 = e3.cachedTypeAt(ndPosChanged);
  expect(c3.source === 'annotation', 'per-decl fp gate drops stale type on changed decl');

  const mismatch = e2.importCheckpoint(
    { ...exported, docFp: 'wrong', belugaBuild: 'stable' },
    { docFp: fp(SAMPLE), belugaBuild: 'stable' },
  );
  expect(!mismatch.ok && mismatch.reason === 'doc-fp-mismatch', 'doc fp mismatch rejected');
}

// --- reconstructed-only checkpoint payload -------------------------------------
{
  const backend = Persist.createMemoryBackend();
  const p = Persist.createPersist({ backend });
  p.setCheckpointProviders({
    getSemantic: () => ({
      types: { v: 1, decls: [], metavars: [], reconstructed: [['sk-nd', 'R(nd)', 'fp-1']] },
      identity: [],
      deriveAttempted: [],
    }),
    getViewport: () => ({}),
    getDocFp: (text) => fp(text),
    getBelugaBuild: () => 'stable',
  });
  p.scheduleEditorPersist(SAMPLE);
  p.flushCheckpoint();
  const sem = p.getSemanticCheckpoint();
  expect(sem && sem.types.reconstructed.length === 1, 'persist saves reconstructed-only payload');
}

console.log('OK checkpoint v2 (persist round-trip, v1 migrate, fp gate, reconstructed save)');

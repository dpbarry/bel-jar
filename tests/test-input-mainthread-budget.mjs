// Phase A guard: the per-keystroke input path must NOT materialize the whole
// document. Two offenders were removed:
//   1. bel-edit-history.onDocChange — used to toString() the full buffer on
//      every keystroke (and the start doc when a burst began).
//   2. persist.scheduleEditorPersist — used to be handed a full toString() every
//      key from the editor's docChanged listener.
// This test drives many keystrokes through both paths with instrumented Text /
// persist mocks and asserts the whole-doc materialization count stays bounded
// (a small constant), independent of the keystroke count — i.e. cost is O(edits
// flushed), not O(keystrokes) and not O(doc size).

import { createEditHistory } from '../js/editor-src/edit-history.mjs';
import { Transaction } from '@codemirror/state';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// A Text-like object that counts how many times its whole content is stringified.
function countingDoc(text, counter, label) {
  return {
    get length() { return text.length; },
    toString() { counter.count += 1; counter.last = label; return text; },
  };
}

// ── 1. Edit-history: N keystrokes in one burst → bounded whole-doc toStrings ──
{
  const counter = { count: 0, last: null };
  const adapter = {
    projectKey: 'budget',
    sessionStorage: null,
    getFileText: () => '',
    setFileText: () => {},
    listFiles: () => [{ id: 'a', name: 'a.bel' }],
    getFileById: (id) => (id === 'a' ? { id, name: 'a.bel' } : null),
    getActiveFileId: () => 'a',
    getActiveEditor: () => null,
    flushCheckpoint: () => {},
    toast: () => {},
  };
  const H = createEditHistory(adapter);

  const N = 500;
  let buf = 'x';
  for (let i = 0; i < N; i += 1) {
    const before = buf;
    buf += 'y';
    const view = { state: { doc: countingDoc(buf, counter, 'after'), selection: { main: { anchor: buf.length, head: buf.length } } } };
    const update = {
      docChanged: true,
      startState: { doc: countingDoc(before, counter, 'start'), selection: { main: { anchor: before.length, head: before.length } } },
      transactions: [{
        annotation(ann) {
          if (ann === Transaction.userEvent) return 'input.type';
          return undefined;
        },
      }],
    };
    H.onDocChange(view, update, 'a');
  }
  const duringTyping = counter.count;
  // During a continuous burst the engine must not stringify the whole buffer on
  // every keystroke. Allow a small constant (burst start capture, etc.), never
  // anything that scales with N.
  expect(duringTyping <= 5,
    `edit-history stringified whole doc ${duringTyping}x across ${N} keystrokes (expected O(1), last=${counter.last})`);

  // Flushing the burst is where the strings are finally materialized — that's
  // allowed (once, off the input path), and it must produce an undoable entry.
  H.flushTypingGroup();
  expect(H.canUndo(), 'a typing burst produced an undoable entry after flush');
}

// ── 2. Persist: keystrokes mark dirty without materializing the whole doc ──────
// The editor now hands persist a lazy getText provider and calls markEditorDirty
// on each key. Verify markEditorDirty does not pull text, and persistNow (save)
// pulls exactly once via the provider.
{
  // Load persist as a CommonJS-ish global module (js/persist/persist.js attaches to a
  // global). It's browser-oriented; emulate the minimal globals it needs.
  const g = globalThis;
  g.window = g;
  g.localStorage = (() => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
      clear: () => m.clear(),
      key: (i) => [...m.keys()][i] ?? null,
      get length() { return m.size; },
    };
  })();

  await import('./persist-stack.mjs').then((m) => m.importPersistStack(g));
  const P = g.Persist;
  expect(P && typeof P.createPersist === 'function', 'Persist loaded');

  const persist = P.createPersist({ documentId: 'doc-budget', debounceMs: 5 });

  let getTextCalls = 0;
  let liveText = 'start';
  persist.setCheckpointProviders({
    getText: () => { getTextCalls += 1; return liveText; },
  });

  expect(typeof persist.markEditorDirty === 'function', 'persist exposes markEditorDirty');

  // Simulate keystrokes: mark dirty many times; the provider must not be pulled.
  for (let i = 0; i < 300; i += 1) {
    liveText += '.';
    persist.markEditorDirty();
  }
  expect(getTextCalls === 0,
    `markEditorDirty pulled live text ${getTextCalls}x during typing (expected 0 — save is debounced)`);

  // A flush (debounced save firing) pulls the live text — once — and stores it.
  persist.flushCheckpoint();
  expect(getTextCalls >= 1, 'flush pulls the live text via provider');
  expect(persist.getEditorText() === liveText,
    'persisted text matches the live doc after flush');
}

console.log('OK input-mainthread-budget: input path does not materialize whole doc per keystroke');

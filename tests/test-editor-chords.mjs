// Every editor command the Keybindings sheet offers must RUN when you bind it.
//
// This is the invariant that failed in the field. `buildEditorKeymap` walked the
// editor-scope catalogue, built a CodeMirror entry for each bound chord, and
// looked the command up in a table of twelve hand-written runners. The other 62
// — every motion, every selection twin, the line edits, the nav verbs, the
// prover verbs — found nothing and returned false. The sheet accepted the chord,
// the settings panel showed it, and the key did nothing. `npm test` was green:
// 236/236, because no test had ever built the keymap.
//
// So the rule now lives in the projection rather than in whoever calls it:
//   · a runner named explicitly wins (it holds a view-specific closure)
//   · `opts.fallback(id)` covers everything else, through the registry
//   · with neither, NO entry is emitted — the chord falls through to CodeMirror
//     instead of being swallowed by a dead one
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { runPersistStackInContext } from './persist-stack.mjs';
import { CATALOG } from '../js/commands/command-catalog.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const store = Object.create(null);

const ctx = vm.createContext({
  localStorage: {
    getItem(k) { return store[k] ?? null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
  },
  navigator: { platform: 'Win32' },
  addEventListener() {},
  dispatchEvent() { return true; },
  clearTimeout,
  setTimeout,
  TextEncoder,
});
ctx.window = ctx;
ctx.globalThis = ctx;
runPersistStackInContext(ctx);
vm.runInContext(readFileSync(join(here, '..', 'js', 'ui', 'keybindings.js'), 'utf8'), ctx);

const KB = ctx.Keybindings;
const P = ctx.Persist;

// ── the whole editor-scope bindable set gets a chord ──────────────────────────

const editorIds = CATALOG.filter((c) => c.scope === 'editor' && c.keybindable).map((c) => c.id);
expect(editorIds.length > 60, `the editor-scope bindable set is worth pinning (${editorIds.length})`);

// F13-F24 are bindable, unused by any browser, and there are plenty of them: a
// chord per command without tripping the reserved or conflict checks.
const overrides = {};
editorIds.forEach((id, i) => { overrides[id] = 'Mod+Alt+Shift+F' + (i + 1); });
P.writeStoredKeybindings(overrides);

const called = [];
const fallback = (id) => () => { called.push(id); return true; };
const entries = KB.buildEditorKeymap({}, { fallback });

// Rebinding frees each command's platform default, and a freed default gets its
// own swallow entry so CodeMirror's built-in does not fire in its place — so the
// table is legitimately larger than the command set.
expect(entries.length >= editorIds.length,
  `every bound editor command becomes a keymap entry (${entries.length} for ${editorIds.length})`);
for (const entry of entries) entry.run(null);
const ran = new Set(called);
for (const id of editorIds) {
  expect(ran.has(id), `${id} is offered for binding but its chord runs nothing`);
}

// ── an explicit runner still wins ─────────────────────────────────────────────
// The twelve that need a live view must not be quietly replaced by the registry.

const explicit = [];
const one = editorIds[0];
KB.buildEditorKeymap(
  { [one]: () => { explicit.push(one); return true; } },
  { fallback }
).forEach((e) => e.run(null));
expect(explicit.length === 1, 'a named runner is preferred over the fallback');

// ── no fallback, no dead key ──────────────────────────────────────────────────
// Emitting an entry that returns false would SWALLOW the chord: CodeMirror reads
// false as "not handled", but the entry still shadows a lower-precedence one for
// the same key. Skipping it is the only honest answer.

const freed = KB.freedDefaultsForScope('editor').length;
expect(KB.buildEditorKeymap({}, {}).length === freed,
  'with no runner and no fallback the only entries are the freed-default swallows');

// ── omitted ids stay omitted ──────────────────────────────────────────────────
// Under Emacs the style owns these chords outright; the fallback must not hand
// them back.

const omitId = editorIds[1];
const omitCalled = [];
KB.buildEditorKeymap({}, { fallback: (id) => () => { omitCalled.push(id); return true; }, omitIds: [omitId] })
  .forEach((e) => e.run(null));
expect(omitCalled.indexOf(omitId) < 0, 'an omitted id emits no entry');
expect(omitCalled.length === editorIds.length - 1, 'everything else still does');

P.writeStoredKeybindings({});
console.log(`OK editor chords (${editorIds.length} editor commands, all live when bound)`);

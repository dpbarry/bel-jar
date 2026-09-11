// Every GLOBAL command the Keybindings sheet offers must RUN when you bind it.
//
// ⛔ The twin of `test-editor-chords.mjs`, and the half that was still broken
// after that one was written. `buildEditorKeymap` learned "named runner, else
// `fallback(id)`, else no entry"; `initGlobals` never did. It was handed a
// hand-written map of FOUR handlers — the palette's four modes — while the
// catalogue declares 67 bindable global commands, and the dispatch loop ended
// `if (typeof handler !== 'function') continue;`.
//
// So the sheet accepted a chord for any of the other 63, the panel drew it, and
// pressing it did nothing at all. Measured, not inferred: binding Toggle Theme
// to Ctrl+Alt+J in a real browser and pressing it left the theme alone.
//
// The rule is the same one, in the same shape:
//   · a named handler wins (it holds a closure the registry cannot supply)
//   · `opts.fallback(id)` covers everything else, through the registry
//   · with neither, the chord is NOT consumed — it falls through to the browser
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
let keydown = null;

const ctx = vm.createContext({
  localStorage: {
    getItem(k) { return store[k] ?? null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
  },
  navigator: { platform: 'Win32' },
  addEventListener(type, fn) { if (type === 'keydown') keydown = fn; },
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

const globalIds = CATALOG.filter((c) => (c.scope || 'global') === 'global' && c.keybindable)
  .map((c) => c.id);
expect(globalIds.length > 50, `the global-scope bindable set is worth pinning (${globalIds.length})`);

// One free chord per command. Ctrl+Alt+Shift+F1… is bindable, browser-safe, and
// there are enough of them.
const overrides = {};
globalIds.forEach((id, i) => { overrides[id] = 'Mod+Alt+Shift+F' + (i + 1); });
P.writeStoredKeybindings(overrides);

const called = [];
const named = [];
KB.initGlobals(
  { [globalIds[0]]: () => { named.push(globalIds[0]); } },
  { fallback: (id) => () => { called.push(id); } },
);
expect(typeof keydown === 'function', 'initGlobals registers the capture listener');

function press(i) {
  keydown({
    key: 'F' + (i + 1),
    ctrlKey: true,
    metaKey: false,
    altKey: true,
    shiftKey: true,
    isComposing: false,
    target: null,
    preventDefault() {},
    stopPropagation() {},
  });
}

for (let i = 0; i < globalIds.length; i += 1) press(i);

const ran = new Set(called.concat(named));
for (const id of globalIds) {
  expect(ran.has(id), `${id} is offered for binding but its chord runs nothing`);
}

// ── a named handler still wins ───────────────────────────────────────────────
// The four that open a specific palette mode must not be quietly replaced.
expect(named.length === 1, 'a named handler is preferred over the fallback');
expect(called.indexOf(globalIds[0]) < 0, 'and the fallback is not also called for it');

// ── no fallback, no dead key ─────────────────────────────────────────────────
// A fallback returning null means "nothing is attached to this id yet". The
// chord must reach the browser rather than be eaten by a handler that cannot act.
{
  let prevented = false;
  const target = globalIds[globalIds.length - 1];
  P.writeStoredKeybindings({ [target]: 'Mod+Alt+Shift+F24' });
  // A fresh module instance, so the earlier fallback is not still installed.
  const store2 = Object.create(null);
  let keydown2 = null;
  const ctx2 = vm.createContext({
    localStorage: {
      getItem(k) { return store2[k] ?? null; },
      setItem(k, v) { store2[k] = String(v); },
      removeItem(k) { delete store2[k]; },
    },
    navigator: { platform: 'Win32' },
    addEventListener(type, fn) { if (type === 'keydown') keydown2 = fn; },
    dispatchEvent() { return true; },
    clearTimeout,
    setTimeout,
    TextEncoder,
  });
  ctx2.window = ctx2;
  ctx2.globalThis = ctx2;
  runPersistStackInContext(ctx2);
  vm.runInContext(readFileSync(join(here, '..', 'js', 'ui', 'keybindings.js'), 'utf8'), ctx2);
  ctx2.Persist.writeStoredKeybindings({ [target]: 'Mod+Alt+Shift+F24' });
  ctx2.Keybindings.initGlobals({}, { fallback: () => null });
  keydown2({
    key: 'F24',
    ctrlKey: true,
    metaKey: false,
    altKey: true,
    shiftKey: true,
    isComposing: false,
    target: null,
    preventDefault() { prevented = true; },
    stopPropagation() {},
  });
  expect(!prevented, 'a bound id with nothing attached does not swallow its chord');
}

P.writeStoredKeybindings({});
console.log(`OK global chords (${globalIds.length} global commands, all live when bound)`);

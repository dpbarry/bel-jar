// Global chord dispatch — what the capture-phase keydown listener costs, and
// that it never serves a stale override.
//
// This listener runs on EVERY keypress in the app, editor typing included, and
// walks every global-scope command. The command catalogue grew that set from 4
// to 19, so "how many times does one keystroke read stored keybindings" is a
// real input-latency property, not a micro-benchmark.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { runPersistStackInContext } from './persist-stack.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const store = Object.create(null);
let keydownListener = null;

const ctx = vm.createContext({
  localStorage: {
    getItem(k) { return store[k] ?? null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    get length() { return Object.keys(store).length; },
    key(i) { return Object.keys(store)[i] ?? null; },
  },
  navigator: { platform: 'Win32' },
  addEventListener(type, fn) { if (type === 'keydown') keydownListener = fn; },
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
const S = ctx.Settings;

// Count reads of the override map. Settings answers from memory, but each read
// still copies the map and the dispatch table re-normalizes 66 specs from it;
// a keystroke must not pay for that when nothing changed.
let reads = 0;
const realGet = S.get;
S.get = function (id) {
  if (id === 'keybindings') reads += 1;
  return realGet.apply(S, arguments);
};

const fired = [];
KB.initGlobals({
  'nav.anywhere': () => fired.push('nav.anywhere'),
  'tools.commands': () => fired.push('tools.commands'),
  'edit.search-project': () => fired.push('edit.search-project'),
});
expect(typeof keydownListener === 'function', 'initGlobals registers a keydown listener');

function press(key, mods) {
  const m = mods || {};
  let prevented = false;
  reads = 0;
  fired.length = 0;
  keydownListener({
    key,
    ctrlKey: !!m.ctrl,
    metaKey: !!m.meta,
    altKey: !!m.alt,
    shiftKey: !!m.shift,
    isComposing: false,
    target: null,
    preventDefault() { prevented = true; },
    stopPropagation() {},
  });
  return { reads, prevented, fired: fired.slice() };
}

// ── the typing path costs nothing ─────────────────────────────────────────────

const globalCount = KB.DEFAULTS.filter((d) => d.scope === 'global').length;
expect(globalCount > 10, `catalogue has grown the global set well past the original 4 (got ${globalCount})`);

expect(press('a').reads === 0, 'a bare letter reads no overrides');
expect(press('a', { shift: true }).reads === 0, 'Shift+letter reads no overrides');
expect(press('Enter').reads === 0, 'Enter reads no overrides');
expect(press(' ').reads === 0, 'Space reads no overrides');
expect(press('a').fired.length === 0, 'a bare letter fires nothing');

// ── a real chord costs one read, not one per command ──────────────────────────

const hit = press('k', { ctrl: true });
expect(hit.fired.join(',') === 'nav.anywhere', 'Ctrl+K runs Go to File');
expect(hit.prevented, 'a claimed chord is prevented');
expect(hit.reads <= 1, `one chord = at most one override read, got ${hit.reads}`);

// ⛔ And ZERO on the next press. The dispatch table is keyed on the STORED
// override string, so a held-down Emacs motion rebuilds nothing: no JSON parse
// and no re-normalizing of 66 specs per repeat. Held at key-repeat that was the
// difference between free and a few hundred string allocations a second.
expect(press('k', { ctrl: true }).reads === 0, 'a repeat of the same chord reads nothing');
expect(press('k', { ctrl: true }).fired.join(',') === 'nav.anywhere', 'and still fires');

const miss = press('j', { ctrl: true });
expect(miss.fired.length === 0, 'an unclaimed chord fires nothing');
expect(miss.reads === 0, `an unclaimed modifier chord costs nothing either, got ${miss.reads}`);

// ⛔ NOT Ctrl+Shift+P: measured reserved by Chrome on Windows, so it was a
// default that fired for nobody. See `scripts/chord-audit.html`.
expect(press('p', { ctrl: true, shift: true }).fired.length === 0, 'Ctrl+Shift+P is bound to nothing');
expect(press('x', { alt: true }).fired.join(',') === 'tools.commands', 'Alt+X runs a command');
expect(press('f', { ctrl: true, shift: true }).fired.join(',') === 'edit.search-project', 'Ctrl+Shift+F');

// Function keys carry no modifier but can still be bound, so they must not be
// short-circuited by the fast path. Bind one and press it — a read count cannot
// show this any more, and firing is the property that was meant.
S.set('keybindings', { 'nav.anywhere': 'F8' });
expect(press('F8').fired.join(',') === 'nav.anywhere', 'function keys reach the tables');
S.set('keybindings', {});

// ── no stale overrides ────────────────────────────────────────────────────────
// A write from anywhere (an import, another tab, the online layer) goes through
// Settings, which bumps the revision the dispatch cache is keyed on, so it must
// take effect on the very next keystroke with nothing told to refresh.

S.set('keybindings', { 'nav.anywhere': 'Mod+J' });
expect(press('k', { ctrl: true }).fired.length === 0, 'old chord stops firing after an external rebind');
expect(press('j', { ctrl: true }).fired.join(',') === 'nav.anywhere', 'new chord fires immediately');

S.set('keybindings', {});
expect(press('k', { ctrl: true }).fired.join(',') === 'nav.anywhere', 'clearing overrides restores the default');

// A default freed by a rebind is swallowed, not passed to the browser.
S.set('keybindings', { 'nav.anywhere': 'Mod+B' });
const freed = press('k', { ctrl: true });
expect(freed.fired.length === 0, 'the freed default fires nothing');
expect(freed.prevented, 'the freed default is still swallowed');
S.set('keybindings', {});

console.log(`OK keybindings dispatch (${globalCount} global commands, <=1 read per rebind, 0 per repeat, 0 while typing)`);

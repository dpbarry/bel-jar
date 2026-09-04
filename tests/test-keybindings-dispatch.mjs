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
const P = ctx.Persist;

// Count reads of the stored override map — the localStorage + JSON.parse hop.
let reads = 0;
const realRead = P.readStoredKeybindings;
P.readStoredKeybindings = function () {
  reads += 1;
  return realRead.apply(P, arguments);
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
expect(hit.reads === 1, `one chord = one override read, got ${hit.reads}`);

const miss = press('j', { ctrl: true });
expect(miss.fired.length === 0, 'an unclaimed chord fires nothing');
expect(miss.reads === 1, `an unclaimed modifier chord still reads once, got ${miss.reads}`);

// ⛔ NOT Ctrl+Shift+P: measured reserved by Chrome on Windows, so it was a
// default that fired for nobody. See `scripts/chord-audit.html`.
expect(press('p', { ctrl: true, shift: true }).fired.length === 0, 'Ctrl+Shift+P is bound to nothing');
expect(press('x', { alt: true }).fired.join(',') === 'tools.commands', 'Alt+X runs a command');
expect(press('f', { ctrl: true, shift: true }).fired.join(',') === 'edit.search-project', 'Ctrl+Shift+F');

// Function keys carry no modifier but can still be bound, so they must not be
// short-circuited by the fast path.
expect(press('F8').reads === 1, 'function keys reach the tables');

// ── no stale overrides ────────────────────────────────────────────────────────
// Nothing is cached between calls: a write from a settings import or another tab
// goes through Persist directly and must take effect on the very next keystroke.

P.writeStoredKeybindings({ 'nav.anywhere': 'Mod+J' });
expect(press('k', { ctrl: true }).fired.length === 0, 'old chord stops firing after an external rebind');
expect(press('j', { ctrl: true }).fired.join(',') === 'nav.anywhere', 'new chord fires immediately');

P.writeStoredKeybindings({});
expect(press('k', { ctrl: true }).fired.join(',') === 'nav.anywhere', 'clearing overrides restores the default');

// A default freed by a rebind is swallowed, not passed to the browser.
P.writeStoredKeybindings({ 'nav.anywhere': 'Mod+B' });
const freed = press('k', { ctrl: true });
expect(freed.fired.length === 0, 'the freed default fires nothing');
expect(freed.prevented, 'the freed default is still swallowed');
P.writeStoredKeybindings({});

console.log(`OK keybindings dispatch (${globalCount} global commands, 1 read per chord, 0 while typing)`);

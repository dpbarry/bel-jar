// BelJar keybindings resolver — defaults, overrides, reserved, conflicts.
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
expect(KB && typeof KB.resolve === 'function', 'Keybindings exported');
expect(P && typeof P.readStoredKeybindings === 'function', 'persist keybindings API');

const {
  normalizeSpec,
  formatShortcut,
  toCmKey,
  isBrowserReserved,
  isReservedSequence,
} = KB._pure;

expect(normalizeSpec('mod+shift+f') === 'Mod+Shift+F', 'normalize Mod+Shift+F');
expect(normalizeSpec('Ctrl+K') === 'Mod+K', 'Ctrl → Mod');
expect(normalizeSpec('Control+Space') === 'Control+Space', 'Control stays Control');
expect(toCmKey('Mod+Shift+F') === 'Mod-Shift-f', 'CM key conversion');
expect(toCmKey('Control+Space') === 'Ctrl-Space', 'CM Control+Space');
expect(toCmKey('Alt+Shift+F') === 'Alt-Shift-f', 'CM Alt-Shift-f');
expect(toCmKey('F12') === 'F12', 'CM F12');
expect(isBrowserReserved('Mod+T') === true, 'Mod+T reserved');
expect(isBrowserReserved('Mod+K') === false, 'Mod+K not reserved');
expect(isReservedSequence('Mod+T') === true, 'Mod+T reserved sequence');
expect(isReservedSequence('Mod+K') === false, 'Mod+K not reserved sequence');
expect(isReservedSequence('A') === true, 'bare A reserved sequence');
expect(isReservedSequence('1') === true, 'bare 1 reserved sequence');
expect(isReservedSequence('Shift+A') === true, 'Shift+A reserved sequence');
expect(isReservedSequence('F2') === false, 'F2 allowed');
expect(isReservedSequence('Shift+F8') === false, 'Shift+F8 allowed');
expect(isReservedSequence('Control+Space') === false, 'Control+Space allowed');

expect(KB.resolve('nav.anywhere') === 'Mod+K', 'default anywhere');
expect(KB.resolve('edit.autocomplete') === 'Control+Space', 'default show autocomplete');
expect(KB.resolve('edit.redo', false) === 'Mod+Y', 'redo default on Win');
expect(KB.resolve('edit.redo', true) === 'Mod+Shift+Z', 'redo default on Mac');
expect(formatShortcut('Mod+Y', false) === 'Ctrl+Y', 'label Win');
expect(formatShortcut('Mod+Shift+Z', true) === '\u2318\u21E7Z', 'label Mac redo');
expect(KB.titleFor('edit.undo') === 'Undo', 'titleFor undo');

P.writeStoredKeybindings({ 'nav.anywhere': 'Mod+J' });
expect(KB.resolve('nav.anywhere') === 'Mod+J', 'override anywhere');
expect(KB.isUserOverride('nav.anywhere') === true, 'user override flag');
expect(KB.findConflict('Mod+J', 'nav.anywhere') == null, 'no self conflict');
expect(KB.findConflict('Mod+Z', 'nav.anywhere') === 'edit.undo', 'conflicts with undo');
expect(KB.setBinding('nav.anywhere', 'Mod+T').ok === false, 'refuse reserved browser');
expect(KB.setBinding('nav.anywhere', 'Mod+T').reason === 'reserved', 'reserved reason');
expect(KB.setBinding('nav.anywhere', 'A').ok === false, 'refuse bare A');
expect(KB.setBinding('nav.anywhere', 'A').reason === 'reserved', 'bare A reason');
expect(KB.setBinding('nav.anywhere', '1').reason === 'reserved', 'bare 1 reason');
{
  const conflict = KB.setBinding('nav.anywhere', 'Mod+Z');
  expect(conflict.ok === false, 'refuse conflict');
  expect(conflict.reason === 'conflict', 'conflict reason');
  expect(conflict.conflictId === 'edit.undo', 'conflict owner');
}
expect(KB.setBinding('nav.anywhere', 'Mod+B').ok === true, 'set free chord');
expect(KB.resolve('nav.anywhere') === 'Mod+B', 'resolve after set');
expect(KB.setBinding('nav.anywhere', 'F2').ok === false, 'refuse F2 conflict with rename');
KB.resetBinding('edit.rename');
KB.clearBinding('edit.rename');
expect(KB.setBinding('nav.anywhere', 'F2').ok === true, 'F2 ok when free');
expect(KB.setBinding('edit.format', 'Shift+F8').ok === false, 'Shift+F8 conflicts prev-hole');
KB.clearBinding('nav.prev-hole');
expect(KB.setBinding('edit.format', 'Shift+F8').ok === true, 'Shift+F8 ok when free');
KB.resetBinding('nav.anywhere');
expect(KB.resolve('nav.anywhere') === 'Mod+K', 'reset binding');
{
  const findEv = { key: 'f', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false };
  expect(KB.matchesId(findEv, 'edit.find') === true, 'Mod+F matches edit.find');
  expect(KB.matchesId(findEv, 'edit.search-project') === false, 'Mod+F is not search-project');
  expect(KB.matchesId({ key: 'f', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true }, 'edit.find') === false, 'Mod+Shift+F is not find');
  const acEv = { key: ' ', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false };
  expect(KB.matchesId(acEv, 'edit.autocomplete') === true, 'Control+Space matches autocomplete');
  expect(KB.matchesId(findEv, 'edit.autocomplete') === false, 'Mod+F is not autocomplete');
}
KB.clearBinding('edit.find');
expect(KB.matchesId({ key: 'f', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }, 'edit.find') === false, 'unbound find does not match');
expect(KB.resolve('edit.find') == null, 'clear to unbound');
KB.resetAll();
expect(KB.resolve('edit.find') === 'Mod+F', 'resetAll restores');

console.log('OK keybindings');

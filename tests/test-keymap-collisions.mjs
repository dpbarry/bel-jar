// Keymap collision policy — Emacs omit list + global yield helper.
import {
  remappableOmitIds,
  EMACS_OMIT_COMMAND_IDS,
  EMACS_YIELD_GLOBAL_IDS,
  shouldYieldGlobalForEmacs,
} from '../js/editor-src/ide/keymap-style.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const omit = remappableOmitIds('emacs');
for (const id of [
  'edit.find',
  'edit.select-all',
  'edit.autocomplete',
  'edit.redo',
  'edit.toggle-comment',
]) {
  expect(omit.includes(id), `emacs omits ${id}`);
  expect(EMACS_OMIT_COMMAND_IDS.includes(id), `EMACS_OMIT has ${id}`);
}
expect(remappableOmitIds('default').length === 0, 'default omits nothing');
expect(remappableOmitIds('vim').length === 0, 'vim omits nothing');

expect(EMACS_YIELD_GLOBAL_IDS.includes('nav.anywhere'), 'yield Go to File');
expect(shouldYieldGlobalForEmacs('nav.anywhere', true) === true, 'yield when focused');
expect(shouldYieldGlobalForEmacs('nav.anywhere', false) === false, 'no yield when not focused');
expect(shouldYieldGlobalForEmacs('tools.commands', true) === false, 'palette not yielded');

const here = dirname(fileURLToPath(import.meta.url));
const ctx = vm.createContext({
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  navigator: { platform: 'Win32' },
  addEventListener() {},
  dispatchEvent() { return true; },
  document: { activeElement: null },
  clearTimeout,
  setTimeout,
  TextEncoder,
});
ctx.window = ctx;
ctx.globalThis = ctx;
vm.runInContext(readFileSync(join(here, '..', 'js', 'ui', 'keybindings.js'), 'utf8'), ctx);
const KB = ctx.Keybindings;
expect(typeof KB.shouldYieldGlobalForEmacs === 'function', 'Keybindings.shouldYieldGlobalForEmacs');
expect(KB.shouldYieldGlobalForEmacs('nav.anywhere', true) === true, 'KB yield true');
expect(KB.shouldYieldGlobalForEmacs('nav.anywhere', false) === false, 'KB yield false');

console.log('OK keymap-collisions');

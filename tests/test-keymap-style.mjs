// Keymap style normalize, policy helpers, and extension builders.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emacsKeys } from '@replit/codemirror-emacs';
import {
  KEYMAP_STYLES,
  normalizeKeymapStyle,
  buildKeymapStyleExtensions,
  remappableOmitIds,
  EMACS_OMIT_COMMAND_IDS,
  VIM_ALWAYS_COMMAND_IDS,
  ensureEmacsKeys,
  emacsKeysReady,
  EMACS_LINE_DOWN_KEY,
  isVimNormalEditorFocused,
} from '../js/editor-src/ide/keymap-style.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

expect(Array.isArray(KEYMAP_STYLES) && KEYMAP_STYLES.includes('vim'), 'KEYMAP_STYLES');
expect(normalizeKeymapStyle('default') === 'default', 'normalize default');
expect(normalizeKeymapStyle('VIM') === 'vim', 'normalize VIM');
expect(normalizeKeymapStyle('Emacs') === 'emacs', 'normalize Emacs');
expect(normalizeKeymapStyle('nope') === 'default', 'normalize unknown');
expect(normalizeKeymapStyle(null) === 'default', 'normalize null');
expect(normalizeKeymapStyle('') === 'default', 'normalize empty');

expect(remappableOmitIds('default').length === 0, 'omit empty default');
expect(remappableOmitIds('vim').length === 0, 'omit empty vim');
expect(remappableOmitIds('emacs').includes('edit.find'), 'omit find under emacs');
expect(remappableOmitIds('emacs').includes('edit.redo'), 'omit redo under emacs');
expect(remappableOmitIds('emacs').includes('edit.toggle-comment'), 'omit comment under emacs');
expect(EMACS_OMIT_COMMAND_IDS.includes('edit.select-all'), 'omit select-all');
expect(VIM_ALWAYS_COMMAND_IDS.includes('nav.next-hole'), 'F8 always in vim');

const empty = buildKeymapStyleExtensions('default');
expect(Array.isArray(empty) && empty.length === 0, 'default extensions empty');

const bundlePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'editor-cm.bundle.js');
const bundle = readFileSync(bundlePath, 'utf8');

const vimExt = buildKeymapStyleExtensions('vim');
expect(Array.isArray(vimExt) && vimExt.length >= 1, 'vim extensions elevated');
expect(bundle.includes('enterVimMode'), 'bundle retains vim mode init');
expect(typeof isVimNormalEditorFocused === 'function', 'isVimNormalEditorFocused export');
const emacsExt = buildKeymapStyleExtensions('emacs');
expect(Array.isArray(emacsExt) && emacsExt.length >= 1, 'emacs extensions elevated');
expect(emacsKeysReady(), 'emacs keys bound after build');
expect(EMACS_LINE_DOWN_KEY === 'C-m', 'next line on C-m (browser blocks C-n)');
expect(Object.keys(emacsKeys).length > 20, 'emacsKeys catalog non-empty');

expect(bundle.includes('.bindKey('), 'bundle retains emacs bindKey calls');

console.log('OK keymap-style');

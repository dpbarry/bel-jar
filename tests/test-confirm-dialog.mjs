import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));

function loadModules(paths) {
  const fakeWindow = {};
  for (const path of paths) {
    const src = readFileSync(join(here, '..', path), 'utf8');
    new Function('window', src)(fakeWindow);
  }
  return fakeWindow;
}

const w = loadModules(['js/dialog.js', 'js/prompt-dialog.js', 'js/confirm-dialog.js']);
const PD = w.BelJarPromptDialog;
const CD = w.BelJarConfirmDialog;

expect(typeof PD.open === 'function', 'PromptDialog.open exists');
expect(typeof PD.buildActions === 'function', 'PromptDialog.buildActions exists');
expect(PD.CARD_CLASS.includes('bj-prompt-dialog__card'), 'shared card class');

expect(typeof CD.confirm === 'function', 'ConfirmDialog.confirm exists');

// Without BelJarDialog wired in a real DOM, confirm resolves false.
CD.confirm('Delete everything?').then(function (ok) {
  expect(ok === false, 'confirm without DOM resolves false');
  console.log('OK confirm-dialog');
});

import {
  PromptDialog,
} from '../js/ui/prompt-dialog.mjs';
import {
  ConfirmDialog,
} from '../js/ui/confirm-dialog.mjs';
import {
  Dialog,
} from '../js/ui/dialog.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

expect(typeof Dialog.createDialog === 'function', 'Dialog.createDialog exists');
expect(typeof PromptDialog.open === 'function', 'PromptDialog.open exists');
expect(typeof PromptDialog.buildActions === 'function', 'PromptDialog.buildActions exists');
expect(PromptDialog.CARD_CLASS.includes('bj-prompt-dialog__card'), 'shared card class');
expect(typeof ConfirmDialog.confirm === 'function', 'ConfirmDialog.confirm exists');

if (typeof document === 'undefined') {
  console.log('OK confirm-dialog (ESM dialog graph API)');
} else {
  ConfirmDialog.confirm('Delete everything?').then((ok) => {
    expect(typeof ok === 'boolean', 'confirm resolves boolean');
    console.log('OK confirm-dialog (ESM dialog graph API)');
  });
}

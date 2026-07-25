import { open as promptOpen } from './prompt-dialog.mjs';

function normalizeOpts(messageOrOpts, maybeOpts) {
  if (messageOrOpts != null && typeof messageOrOpts === 'object' && !(messageOrOpts instanceof Node)) {
    return messageOrOpts;
  }
  return Object.assign({}, maybeOpts || {}, { message: messageOrOpts });
}

export function confirm(messageOrOpts, maybeOpts) {
  const opts = normalizeOpts(messageOrOpts, maybeOpts);
  const danger = opts.danger !== false;
  return promptOpen({
    ariaLabel: opts.ariaLabel || 'Confirm',
    subject: opts.subject,
    message: opts.message,
    note: opts.note,
    className: opts.className || 'bj-confirm-dialog-wrap',
    closeButton: opts.closeButton,
    layout: 'row',
    buttons: [
      { action: 'no', label: opts.cancelLabel || 'Cancel', variant: 'ghost' },
      {
        action: 'yes',
        label: opts.confirmLabel || (danger ? 'Delete' : 'OK'),
        variant: danger ? 'danger' : 'primary',
      },
    ],
  }).then((action) => action === 'yes');
}

export const ConfirmDialog = { confirm };

const g = typeof window !== 'undefined' ? window : globalThis;
g.ConfirmDialog = ConfirmDialog;
g.BelJarConfirmDialog = g.ConfirmDialog

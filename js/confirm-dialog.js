// Blocking yes/no confirm (replaces window.confirm).
(function (global) {
  'use strict';

  function normalizeOpts(messageOrOpts, maybeOpts) {
    if (messageOrOpts != null && typeof messageOrOpts === 'object' && !(messageOrOpts instanceof Node)) {
      return messageOrOpts;
    }
    return Object.assign({}, maybeOpts || {}, { message: messageOrOpts });
  }

  function confirm(messageOrOpts, maybeOpts) {
    var opts = normalizeOpts(messageOrOpts, maybeOpts);
    if (typeof BelJarPromptDialog === 'undefined') return Promise.resolve(false);

    var danger = opts.danger !== false;
    return BelJarPromptDialog.open({
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
    }).then(function (action) { return action === 'yes'; });
  }

  global.BelJarConfirmDialog = { confirm: confirm };
})(typeof window !== 'undefined' ? window : globalThis);

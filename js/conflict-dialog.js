// Blocking modal for resolving path name conflicts (upload / move).
(function (global) {
  'use strict';

  var PD = function () { return global.BelJarPromptDialog; };

  function suggestedBase(conflict) {
    var path = conflict.suggestedPath;
    if (global.BelJarNameConflicts && typeof BelJarNameConflicts.baseName === 'function') {
      return BelJarNameConflicts.baseName(path);
    }
    var slash = path.lastIndexOf('/');
    return slash === -1 ? path : path.slice(slash + 1);
  }

  function buildConflictBody(conflict, total, index) {
    var el = PD().el;
    var wrap = el('div', 'bj-conflict-dialog__panel');

    if (total > 1) {
      wrap.appendChild(el('p', 'bj-prompt-dialog__step', (index + 1) + ' of ' + total));
    }

    var subject = el('p', 'bj-prompt-dialog__subject');
    subject.appendChild(PD().markMono(conflict.label));
    wrap.appendChild(subject);

    var message = el('p', 'bj-prompt-dialog__message');
    message.textContent = conflict.kind === 'folder'
      ? 'A folder with this name is already in the project.'
      : 'A file with this name is already in the project.';
    wrap.appendChild(message);

    return wrap;
  }

  function buildActions(conflict, total) {
    var suggested = suggestedBase(conflict);
    return PD().buildActions([
      {
        action: 'rename',
        label: 'Keep as ' + suggested,
        labelPrefix: 'Keep as',
        monoSuffix: suggested,
        variant: 'primary',
      },
      {
        action: 'replace',
        label: conflict.kind === 'folder' ? 'Replace existing folder' : 'Replace existing file',
        variant: 'secondary',
      },
      {
        action: total === 1 ? 'cancel' : 'skip',
        label: total === 1 ? 'Cancel' : 'Skip',
        variant: 'ghost',
      },
    ]);
  }

  function resolveConflicts(conflicts, options) {
    options = options || {};
    if (!conflicts || !conflicts.length) return Promise.resolve([]);
    if (typeof BelJarDialog === 'undefined' || typeof BelJarPromptDialog === 'undefined') {
      return Promise.resolve(null);
    }

    return new Promise(function (resolve) {
      var index = 0;
      var resolutions = [];
      var settled = false;

      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
        BelJarDialog.requestDialogClose(dialogEl);
      }

      var shell = PD().el('div', 'bj-prompt-dialog');

      var dialogEl = BelJarDialog.createDialog({
        ariaLabel: 'Name conflict',
        content: shell,
        className: PD().WRAP_CLASS,
        cardClass: PD().CARD_CLASS,
        removeOnClose: true,
      });

      function renderStep() {
        shell.replaceChildren();
        var conflict = conflicts[index];
        shell.appendChild(buildConflictBody(conflict, conflicts.length, index));
        shell.appendChild(buildActions(conflict, conflicts.length));
      }

      shell.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        var action = btn.dataset.action;
        var conflict = conflicts[index];

        if (action === 'cancel') {
          finish(null);
          return;
        }

        if (action === 'skip') {
          resolutions.push({ action: 'skip' });
        } else if (action === 'replace') {
          resolutions.push({ action: 'replace' });
        } else if (action === 'rename') {
          resolutions.push({ action: 'rename', newPath: conflict.suggestedPath });
        }

        index += 1;
        if (index >= conflicts.length) finish(resolutions);
        else renderStep();
      });

      dialogEl.addEventListener('close', function () {
        if (!settled) finish(null);
      });

      renderStep();
      BelJarDialog.openDialog(dialogEl);
    });
  }

  global.BelJarConflictDialog = {
    resolveConflicts: resolveConflicts,
  };
})(typeof window !== 'undefined' ? window : globalThis);

// Blocking modal for resolving path name conflicts (upload / move).
(function (global) {
  'use strict';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function markName(name) {
    var span = el('span', 'bj-conflict-dialog__mono');
    span.textContent = name;
    return span;
  }

  function suggestedBase(conflict) {
    var path = conflict.suggestedPath;
    if (global.BelJarNameConflicts && typeof BelJarNameConflicts.baseName === 'function') {
      return BelJarNameConflicts.baseName(path);
    }
    var slash = path.lastIndexOf('/');
    return slash === -1 ? path : path.slice(slash + 1);
  }

  function actionButton(label, action, variant) {
    var btn = el('button', 'bj-conflict-dialog__btn' + (variant ? ' is-' + variant : ''));
    btn.type = 'button';
    btn.textContent = label;
    btn.dataset.action = action;
    return btn;
  }

  function buildConflictBody(conflict, total, index) {
    var wrap = el('div', 'bj-conflict-dialog__panel');

    if (total > 1) {
      wrap.appendChild(el('p', 'bj-conflict-dialog__step', (index + 1) + ' of ' + total));
    }

    var intro = el('p', 'bj-conflict-dialog__intro');
    intro.appendChild(markName(conflict.kind === 'folder' ? conflict.label : conflict.label));
    intro.appendChild(document.createTextNode(' already exists.'));
    wrap.appendChild(intro);

    return wrap;
  }

  function buildActions(conflict, total) {
    var actions = el('div', 'bj-conflict-dialog__actions');

    actions.appendChild(actionButton(
      'Save as ' + suggestedBase(conflict),
      'rename',
      'primary',
    ));
    actions.appendChild(actionButton(
      conflict.kind === 'folder' ? 'Replace folder' : 'Replace',
      'replace',
      'danger',
    ));
    actions.appendChild(actionButton(
      total === 1 ? 'Cancel' : 'Skip',
      total === 1 ? 'cancel' : 'skip',
      'ghost',
    ));

    return actions;
  }

  function resolveConflicts(conflicts, options) {
    options = options || {};
    if (!conflicts || !conflicts.length) return Promise.resolve([]);
    if (typeof BelJarDialog === 'undefined') return Promise.resolve(null);

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

      var shell = el('div', 'bj-conflict-dialog');

      var dialogEl = BelJarDialog.createDialog({
        ariaLabel: 'Name conflict',
        content: shell,
        className: 'bj-conflict-dialog-wrap',
        cardClass: 'bj-dialog__card bj-conflict-dialog__card',
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

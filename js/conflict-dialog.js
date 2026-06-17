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

  function actionButton(label, action, variant) {
    var btn = el('button', 'bj-conflict-dialog__btn' + (variant ? ' is-' + variant : ''));
    btn.type = 'button';
    btn.textContent = label;
    btn.dataset.action = action;
    return btn;
  }

  function buildConflictBody(conflict, total, index, options) {
    options = options || {};
    var isMove = options.context === 'move';
    var wrap = el('div', 'bj-conflict-dialog__panel');

    if (total > 1) {
      var progress = el('p', 'bj-conflict-dialog__progress');
      progress.textContent = 'Conflict ' + (index + 1) + ' of ' + total;
      wrap.appendChild(progress);
    }

    var intro = el('p', 'bj-conflict-dialog__intro');
    if (conflict.kind === 'folder') {
      intro.appendChild(document.createTextNode('The folder '));
      intro.appendChild(markName(conflict.label));
      intro.appendChild(document.createTextNode(' already exists in this project ('));
      intro.appendChild(document.createTextNode(String(conflict.existingPaths.length)));
      intro.appendChild(document.createTextNode(' file' + (conflict.existingPaths.length === 1 ? '' : 's') + ' inside).'));
    } else {
      intro.appendChild(document.createTextNode('A file named '));
      intro.appendChild(markName(conflict.label));
      intro.appendChild(document.createTextNode(' already exists in this folder.'));
    }
    wrap.appendChild(intro);

    var hint = el('p', 'bj-conflict-dialog__hint');
    if (conflict.kind === 'folder') {
      hint.textContent = isMove
        ? 'Replace removes every file currently inside this folder and keeps the moved contents instead.'
        : 'Replace removes every file currently inside this folder and uses the uploaded contents instead.';
    } else {
      hint.textContent = isMove
        ? 'Choose how to handle the moved file.'
        : 'Choose how to handle the incoming file.';
    }
    wrap.appendChild(hint);

    var renameLabel = el('p', 'bj-conflict-dialog__rename-note');
    renameLabel.appendChild(document.createTextNode('Save as '));
    renameLabel.appendChild(markName(global.BelJarNameConflicts
      ? BelJarNameConflicts.baseName(conflict.suggestedPath)
      : conflict.suggestedPath));
    renameLabel.appendChild(document.createTextNode(' instead.'));
    wrap.appendChild(renameLabel);

    return wrap;
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

      var bodyHost = el('div', 'bj-conflict-dialog__body-host');
      var actions = el('div', 'bj-conflict-dialog__actions');

      var dialogEl = BelJarDialog.createDialog({
        title: conflicts.length === 1 ? 'Name conflict' : conflicts.length + ' name conflicts',
        content: bodyHost,
        className: 'bj-conflict-dialog',
        cardClass: 'bj-dialog__card bj-conflict-dialog__card',
        removeOnClose: true,
      });

      function renderStep() {
        bodyHost.innerHTML = '';
        actions.innerHTML = '';
        var conflict = conflicts[index];
        bodyHost.appendChild(buildConflictBody(conflict, conflicts.length, index, options));

        if (conflicts.length === 1) {
          actions.appendChild(actionButton('Cancel', 'cancel', 'ghost'));
        } else {
          actions.appendChild(actionButton('Skip', 'skip', 'ghost'));
        }
        actions.appendChild(actionButton(
          conflict.kind === 'folder' ? 'Replace folder' : 'Replace',
          'replace',
          'danger',
        ));
        actions.appendChild(actionButton(
          'Save as ' + (global.BelJarNameConflicts
            ? BelJarNameConflicts.baseName(conflict.suggestedPath)
            : conflict.suggestedPath),
          'rename',
          'primary',
        ));

        if (!bodyHost.contains(actions)) bodyHost.appendChild(actions);
      }

      actions.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
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

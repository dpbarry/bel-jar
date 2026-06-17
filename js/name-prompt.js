// Reusable styled name-input dialog (replaces window.prompt for names).
(function (global) {
  'use strict';

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function defaultNormalize(raw) {
    return String(raw || '').trim();
  }

  function defaultValidate(name) {
    if (!name) return 'Name is required.';
    return null;
  }

  function selectionForValue(value, selection) {
    var v = String(value || '');
    if (!selection) return { start: 0, end: v.length };
    var start = selection.start != null ? selection.start : 0;
    var end = selection.end != null ? selection.end : v.length;
    start = Math.max(0, Math.min(start, v.length));
    end = Math.max(start, Math.min(end, v.length));
    return { start: start, end: end };
  }

  function normalizeBelFileName(raw) {
    var name = String(raw || '').trim();
    if (!name) return '';
    if (name.indexOf('.') === -1) name += '.bel';
    return name;
  }

  function open(opts) {
    opts = opts || {};
    if (typeof BelJarDialog === 'undefined') {
      return Promise.resolve(null);
    }

    var normalize = typeof opts.normalize === 'function' ? opts.normalize : defaultNormalize;
    var validate = typeof opts.validate === 'function' ? opts.validate : defaultValidate;
    var initialValue = opts.value != null ? String(opts.value) : '';
    var sel = selectionForValue(initialValue, opts.selection);
    var settled = false;

    return new Promise(function (resolve) {
      var wrap = el('div', 'bj-name-prompt');
      var input = el('input', 'bj-name-prompt__input');
      input.type = 'text';
      input.value = initialValue;
      input.spellcheck = false;
      input.autocomplete = 'off';
      if (opts.mono) input.classList.add('is-mono');
      if (opts.placeholder) input.placeholder = opts.placeholder;
      wrap.appendChild(input);

      var errorEl = el('p', 'bj-name-prompt__error');
      errorEl.hidden = true;
      wrap.appendChild(errorEl);

      if (opts.hint) {
        var hint = el('p', 'bj-name-prompt__hint');
        hint.textContent = opts.hint;
        wrap.appendChild(hint);
      }

      var actions = el('div', 'bj-name-prompt__actions');
      var cancelBtn = el('button', 'bj-conflict-dialog__btn is-ghost');
      cancelBtn.type = 'button';
      cancelBtn.textContent = opts.cancelLabel || 'Cancel';
      var confirmBtn = el('button', 'bj-conflict-dialog__btn is-primary');
      confirmBtn.type = 'button';
      confirmBtn.textContent = opts.confirmLabel || 'Create';
      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);
      wrap.appendChild(actions);

      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
        BelJarDialog.requestDialogClose(dialogEl);
      }

      function showError(msg) {
        if (msg) {
          errorEl.textContent = msg;
          errorEl.hidden = false;
          input.classList.add('is-invalid');
          confirmBtn.disabled = true;
        } else {
          errorEl.textContent = '';
          errorEl.hidden = true;
          input.classList.remove('is-invalid');
          confirmBtn.disabled = false;
        }
      }

      function currentNormalized() {
        return normalize(input.value);
      }

      function tryConfirm() {
        var name = currentNormalized();
        var err = validate(name);
        if (err) {
          showError(err);
          return;
        }
        finish(name);
      }

      input.addEventListener('input', function () {
        showError(validate(currentNormalized()));
      });

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          tryConfirm();
        }
      });

      cancelBtn.addEventListener('click', function () {
        finish(null);
      });

      confirmBtn.addEventListener('click', function () {
        tryConfirm();
      });

      var dialogEl = BelJarDialog.createDialog({
        title: opts.title || 'Name',
        content: wrap,
        className: 'bj-name-prompt-dialog',
        cardClass: 'bj-dialog__card bj-name-prompt__card',
        removeOnClose: true,
      });

      dialogEl.addEventListener('close', function () {
        if (!settled) finish(null);
      });

      BelJarDialog.openDialog(dialogEl);

      requestAnimationFrame(function () {
        input.focus();
        input.setSelectionRange(sel.start, sel.end);
        showError(validate(currentNormalized()));
      });
    });
  }

  global.BelJarNamePrompt = {
    open: open,
    normalizeBelFileName: normalizeBelFileName,
    defaultNormalize: defaultNormalize,
    defaultValidate: defaultValidate,
    selectionForValue: selectionForValue,
  };
})(typeof window !== 'undefined' ? window : globalThis);

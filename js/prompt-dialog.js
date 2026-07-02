// Shared blocking choice prompts (confirm, name conflict, …).
(function (global) {
  'use strict';

  var CARD_CLASS = 'bj-dialog__card bj-prompt-dialog__card';
  var WRAP_CLASS = 'bj-prompt-dialog-wrap';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function markMono(name) {
    var span = el('span', 'bj-prompt-dialog__mono');
    span.textContent = name;
    return span;
  }

  function actionButton(label, action, variant, opts) {
    opts = opts || {};
    var btn = el('button', 'bj-prompt-dialog__btn' + (variant ? ' is-' + variant : ''));
    btn.type = 'button';
    btn.dataset.action = action;
    if (opts.monoSuffix) {
      if (opts.labelPrefix) {
        btn.appendChild(el('span', 'bj-prompt-dialog__btn-prefix', opts.labelPrefix));
      }
      var mono = el('span', 'bj-prompt-dialog__btn-mono');
      mono.textContent = opts.monoSuffix;
      btn.appendChild(mono);
    } else {
      btn.textContent = label;
    }
    return btn;
  }

  function buildActions(buttons, layout) {
    var actions = el('div', 'bj-prompt-dialog__actions');
    if (layout === 'row') actions.classList.add('is-row');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var btnOpts = {};
      if (b.monoSuffix != null) {
        btnOpts.monoSuffix = b.monoSuffix;
        if (b.labelPrefix) btnOpts.labelPrefix = b.labelPrefix;
      }
      actions.appendChild(actionButton(b.label, b.action, b.variant, btnOpts));
    }
    return actions;
  }

  function buildRowActions(buttons) {
    return buildActions(buttons, 'row');
  }

  function appendBody(shell, opts) {
    if (opts.body instanceof Node) {
      shell.appendChild(opts.body);
      return;
    }

    if (opts.step) {
      shell.appendChild(el('p', 'bj-prompt-dialog__step', opts.step));
    }

    if (opts.subject) {
      var subject = el('p', 'bj-prompt-dialog__subject');
      subject.appendChild(markMono(opts.subject));
      shell.appendChild(subject);
    }

    if (opts.message != null) {
      var intro = el('p', 'bj-prompt-dialog__message');
      if (opts.message instanceof Node) intro.appendChild(opts.message);
      else intro.textContent = String(opts.message);
      shell.appendChild(intro);
    }

    if (opts.note) {
      shell.appendChild(el('p', 'bj-prompt-dialog__note', opts.note));
    }
  }

  function open(opts) {
    opts = opts || {};
    if (typeof BelJarDialog === 'undefined') return Promise.resolve(null);

    return new Promise(function (resolve) {
      var settled = false;
      var shell = el('div', 'bj-prompt-dialog');
      appendBody(shell, opts);

      var buttons = opts.buttons || [];
      if (buttons.length) {
        shell.appendChild(buildActions(buttons, opts.layout));
      }

      var dialogEl = BelJarDialog.createDialog({
        ariaLabel: opts.ariaLabel || opts.title || 'Prompt',
        title: opts.title,
        content: shell,
        className: opts.className || WRAP_CLASS,
        cardClass: opts.cardClass || CARD_CLASS,
        closeButton: opts.closeButton !== false,
        removeOnClose: true,
      });

      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
        BelJarDialog.requestDialogClose(dialogEl);
      }

      shell.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        finish(btn.dataset.action);
      });

      dialogEl.addEventListener('close', function () {
        if (!settled) finish(null);
      });

      BelJarDialog.openDialog(dialogEl);

      if (typeof opts.onOpen === 'function') {
        requestAnimationFrame(function () { opts.onOpen(dialogEl, shell); });
      }
    });
  }

  global.BelJarPromptDialog = {
    CARD_CLASS: CARD_CLASS,
    WRAP_CLASS: WRAP_CLASS,
    el: el,
    markMono: markMono,
    actionButton: actionButton,
    buildActions: buildActions,
    buildRowActions: buildRowActions,
    appendBody: appendBody,
    open: open,
  };
})(typeof window !== 'undefined' ? window : globalThis);

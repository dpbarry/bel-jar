import { createDialog, openDialog, requestDialogClose } from './dialog.mjs';

export const CARD_CLASS = 'bj-dialog__card bj-prompt-dialog__card';
export const WRAP_CLASS = 'bj-prompt-dialog-wrap';

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function markMono(name) {
  const span = el('span', 'bj-prompt-dialog__mono');
  span.textContent = name;
  return span;
}

export function actionButton(label, action, variant, opts) {
  opts = opts || {};
  const btn = el('button', 'bj-prompt-dialog__btn' + (variant ? ` is-${variant}` : ''));
  btn.type = 'button';
  btn.dataset.action = action;
  if (opts.monoSuffix) {
    if (opts.labelPrefix) {
      btn.appendChild(el('span', 'bj-prompt-dialog__btn-prefix', opts.labelPrefix));
    }
    const mono = el('span', 'bj-prompt-dialog__btn-mono');
    mono.textContent = opts.monoSuffix;
    btn.appendChild(mono);
  } else {
    btn.textContent = label;
  }
  return btn;
}

export function buildActions(buttons, layout) {
  const actions = el('div', 'bj-prompt-dialog__actions');
  if (layout === 'row') actions.classList.add('is-row');
  for (const b of buttons) {
    const btnOpts = {};
    if (b.monoSuffix != null) {
      btnOpts.monoSuffix = b.monoSuffix;
      if (b.labelPrefix) btnOpts.labelPrefix = b.labelPrefix;
    }
    actions.appendChild(actionButton(b.label, b.action, b.variant, btnOpts));
  }
  return actions;
}

export function buildRowActions(buttons) {
  return buildActions(buttons, 'row');
}

export function appendBody(shell, opts) {
  if (opts.body instanceof Node) {
    shell.appendChild(opts.body);
    return;
  }

  if (opts.step) {
    shell.appendChild(el('p', 'bj-prompt-dialog__step', opts.step));
  }

  if (opts.subject) {
    const subject = el('p', 'bj-prompt-dialog__subject');
    subject.appendChild(markMono(opts.subject));
    shell.appendChild(subject);
  }

  if (opts.message != null) {
    const intro = el('p', 'bj-prompt-dialog__message');
    if (opts.message instanceof Node) intro.appendChild(opts.message);
    else intro.textContent = String(opts.message);
    shell.appendChild(intro);
  }

  if (opts.note) {
    shell.appendChild(el('p', 'bj-prompt-dialog__note', opts.note));
  }
}

export function open(opts) {
  opts = opts || {};

  return new Promise((resolve) => {
    let settled = false;
    const shell = el('div', 'bj-prompt-dialog');
    appendBody(shell, opts);

    const buttons = opts.buttons || [];
    if (buttons.length) {
      shell.appendChild(buildActions(buttons, opts.layout));
    }

    const dialogEl = createDialog({
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
      requestDialogClose(dialogEl);
    }

    shell.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      finish(btn.dataset.action);
    });

    dialogEl.addEventListener('close', () => {
      if (!settled) finish(null);
    });

    openDialog(dialogEl);

    if (typeof opts.onOpen === 'function') {
      requestAnimationFrame(() => { opts.onOpen(dialogEl, shell); });
    }
  });
}

export const PromptDialog = {
  CARD_CLASS,
  WRAP_CLASS,
  el,
  markMono,
  actionButton,
  buildActions,
  buildRowActions,
  appendBody,
  open,
};

const g = typeof window !== 'undefined' ? window : globalThis;
g.PromptDialog = PromptDialog;
g.BelJarPromptDialog = g.PromptDialog

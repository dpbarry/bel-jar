import {
  createDialog,
  openDialog,
  requestDialogClose,
} from './dialog.mjs';
import {
  PromptDialog,
} from './prompt-dialog.mjs';

export function defaultNormalize(raw) {
  return String(raw || '').trim();
}

export function defaultValidate(name) {
  if (!name) return 'Name is required.';
  return null;
}

export function selectionForValue(value, selection) {
  const v = String(value || '');
  if (!selection) return { start: 0, end: v.length };
  let start = selection.start != null ? selection.start : 0;
  let end = selection.end != null ? selection.end : v.length;
  start = Math.max(0, Math.min(start, v.length));
  end = Math.max(start, Math.min(end, v.length));
  return { start, end };
}

export function normalizeBelFileName(raw) {
  let name = String(raw || '').trim();
  if (!name) return '';
  if (name.indexOf('.') === -1) name += '.bel';
  return name;
}

export function open(opts) {
  opts = opts || {};
  const { el, buildRowActions, CARD_CLASS } = PromptDialog;
  const normalize = typeof opts.normalize === 'function' ? opts.normalize : defaultNormalize;
  const validate = typeof opts.validate === 'function' ? opts.validate : defaultValidate;
  const initialValue = opts.value != null ? String(opts.value) : '';
  const sel = selectionForValue(initialValue, opts.selection);
  let settled = false;

  return new Promise((resolve) => {
    const wrap = el('div', 'bj-name-prompt');
    const leadEl = opts.message ? el('p', 'bj-name-prompt__message', opts.message) : null;

    const input = el('input', 'bj-name-prompt__input');
    input.type = 'text';
    input.value = initialValue;
    input.spellcheck = false;
    input.autocomplete = 'off';
    if (opts.mono) input.classList.add('is-mono');
    if (opts.placeholder) input.placeholder = opts.placeholder;
    wrap.appendChild(input);

    const errorEl = el('p', 'bj-name-prompt__error');
    errorEl.hidden = true;
    wrap.appendChild(errorEl);

    if (opts.hint) {
      const hint = el('p', 'bj-name-prompt__hint');
      hint.textContent = opts.hint;
      wrap.appendChild(hint);
    }

    const actions = buildRowActions([
      { action: 'cancel', label: opts.cancelLabel || 'Cancel', variant: 'ghost' },
      { action: 'confirm', label: opts.confirmLabel || 'Create', variant: 'primary' },
    ]);
    actions.classList.add('bj-name-prompt__actions');
    const cancelBtn = actions.querySelector('[data-action="cancel"]');
    const confirmBtn = actions.querySelector('[data-action="confirm"]');
    wrap.appendChild(actions);

    const dialogEl = createDialog({
      ariaLabel: opts.ariaLabel || 'Name',
      content: wrap,
      className: 'bj-name-prompt-dialog',
      cardClass: CARD_CLASS,
      removeOnClose: true,
    });

    function finish(value) {
      if (settled) return;
      settled = true;
      resolve(value);
      requestDialogClose(dialogEl);
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
      const name = currentNormalized();
      const err = validate(name);
      if (err) {
        showError(err);
        return;
      }
      finish(name);
    }

    input.addEventListener('input', () => {
      showError(validate(currentNormalized()));
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        tryConfirm();
      }
    });

    cancelBtn.addEventListener('click', () => {
      finish(null);
    });

    confirmBtn.addEventListener('click', () => {
      tryConfirm();
    });

    if (leadEl) {
      const card = dialogEl.querySelector('.bj-dialog__card');
      const body = dialogEl.querySelector('.bj-dialog__body');
      if (card && body) card.insertBefore(leadEl, body);
    }

    dialogEl.addEventListener('close', () => {
      if (!settled) finish(null);
    });

    openDialog(dialogEl);

    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(sel.start, sel.end);
      showError(validate(currentNormalized()));
    });
  });
}

export const NamePrompt = {
  open,
  normalizeBelFileName,
  defaultNormalize,
  defaultValidate,
  selectionForValue,
};

const g = typeof window !== 'undefined' ? window : globalThis;
g.NamePrompt = NamePrompt;
g.BelJarNamePrompt = g.NamePrompt

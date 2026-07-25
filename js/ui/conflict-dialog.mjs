import {
  createDialog,
  openDialog,
  requestDialogClose,
} from './dialog.mjs';
import {
  PromptDialog,
} from './prompt-dialog.mjs';

function suggestedBase(conflict) {
  const path = conflict.suggestedPath;
  const NC = globalThis.NameConflicts;
  if (NC && typeof NC.baseName === 'function') {
    return NC.baseName(path);
  }
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

function buildConflictBody(conflict, total, index) {
  const { el, markMono } = PromptDialog;
  const wrap = el('div', 'bj-conflict-dialog__panel');

  if (total > 1) {
    wrap.appendChild(el('p', 'bj-prompt-dialog__step', `${index + 1} of ${total}`));
  }

  const subject = el('p', 'bj-prompt-dialog__subject');
  subject.appendChild(markMono(conflict.label));
  wrap.appendChild(subject);

  const message = el('p', 'bj-prompt-dialog__message');
  message.textContent = conflict.kind === 'folder'
    ? 'A folder with this name is already in the project.'
    : 'A file with this name is already in the project.';
  wrap.appendChild(message);

  return wrap;
}

function buildActions(conflict, total) {
  const suggested = suggestedBase(conflict);
  return PromptDialog.buildActions([
    {
      action: 'rename',
      label: `Keep as ${suggested}`,
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

export function resolveConflicts(conflicts, options) {
  options = options || {};
  if (!conflicts || !conflicts.length) return Promise.resolve([]);

  const { el, WRAP_CLASS, CARD_CLASS } = PromptDialog;

  return new Promise((resolve) => {
    let index = 0;
    const resolutions = [];
    let settled = false;

    const shell = el('div', 'bj-prompt-dialog');

    const dialogEl = createDialog({
      ariaLabel: 'Name conflict',
      content: shell,
      className: WRAP_CLASS,
      cardClass: CARD_CLASS,
      removeOnClose: true,
    });

    function finish(value) {
      if (settled) return;
      settled = true;
      resolve(value);
      requestDialogClose(dialogEl);
    }

    function renderStep() {
      shell.replaceChildren();
      const conflict = conflicts[index];
      shell.appendChild(buildConflictBody(conflict, conflicts.length, index));
      shell.appendChild(buildActions(conflict, conflicts.length));
    }

    shell.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const action = btn.dataset.action;
      const conflict = conflicts[index];

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

    dialogEl.addEventListener('close', () => {
      if (!settled) finish(null);
    });

    renderStep();
    openDialog(dialogEl);
  });
}

export const ConflictDialog = {
  resolveConflicts,
};

const g = typeof window !== 'undefined' ? window : globalThis;
g.ConflictDialog = ConflictDialog;
g.BelJarConflictDialog = g.ConflictDialog

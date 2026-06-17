(function (global) {
  'use strict';

  const DIALOG_ROOT_CLASS = 'bj-dialog';

  const dialogs = new WeakMap();

  function parseMs(cssValue, fallback) {
    const n = parseFloat(String(cssValue || '').trim());
    return Number.isFinite(n) ? n : fallback;
  }

  function closeDurationMs() {
    return parseMs(getComputedStyle(document.documentElement).getPropertyValue('--dialog-ms-out'), 132);
  }

  function dialogInfo(dialogEl) {
    return dialogs.get(dialogEl);
  }

  function registerDialog(dialogEl, removeOnClose) {
    if (!dialogEl || dialogs.has(dialogEl)) return dialogEl || null;

    const info = {
      removeOnClose: !!removeOnClose,
      isClosing: false,
      timer: null,
    };

    dialogEl.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target !== dialogEl) return;

      function cleanup() {
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', cleanup);
      }

      function onPointerUp(upE) {
        if (upE.target === dialogEl) requestDialogClose(dialogEl);
        cleanup();
      }

      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', cleanup);
    });

    dialogEl.addEventListener('cancel', function (e) {
      e.preventDefault();
      requestDialogClose(dialogEl);
    });

    dialogEl.addEventListener('close', function () {
      info.isClosing = false;
      if (info.timer) {
        clearTimeout(info.timer);
        info.timer = null;
      }
      dialogEl.classList.remove('is-leaving');
      if (info.removeOnClose) {
        dialogs.delete(dialogEl);
        dialogEl.remove();
      }
    });

    dialogs.set(dialogEl, info);
    return dialogEl;
  }

  function openDialog(dialogEl) {
    if (!dialogEl) return null;
    registerDialog(dialogEl);
    const info = dialogInfo(dialogEl);
    if (!info) return dialogEl;

    info.isClosing = false;
    dialogEl.classList.remove('is-leaving');
    if (info.timer) {
      clearTimeout(info.timer);
      info.timer = null;
    }

    if (!dialogEl.open) dialogEl.showModal();
    return dialogEl;
  }

  function requestDialogClose(dialogEl) {
    if (!dialogEl) return;
    const info = dialogInfo(dialogEl);
    if (!info || !dialogEl.open || info.isClosing) return;

    info.isClosing = true;
    dialogEl.classList.add('is-leaving');

    if (info.timer) {
      clearTimeout(info.timer);
      info.timer = null;
    }
    const ms = closeDurationMs();
    info.timer = setTimeout(function () {
      info.timer = null;
      if (dialogEl.open) dialogEl.close();
    }, ms);
  }

  function createDialog(opts) {
    opts = opts || {};
    const className = opts.className || '';
    const cardClass = opts.cardClass || '';
    const title = opts.title;
    const closeButton = opts.closeButton !== false;
    const closeLabel = opts.closeLabel || 'Close dialog';
    const removeOnClose = opts.removeOnClose !== false;

    const dialogEl = document.createElement('dialog');
    dialogEl.className = [DIALOG_ROOT_CLASS, className].filter(Boolean).join(' ');

    const card = document.createElement('div');
    card.className = ['bj-dialog__card', cardClass].filter(Boolean).join(' ');

    if (closeButton) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bj-dialog__close icon-btn';
      btn.setAttribute('aria-label', closeLabel);
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        requestDialogClose(dialogEl);
      });
      card.appendChild(btn);
    }

    if (title) {
      const h = document.createElement('div');
      h.className = 'bj-dialog__title';
      h.id = 'bj-dialog-title-' + Math.random().toString(36).slice(2);
      h.textContent = title;
      dialogEl.setAttribute('aria-labelledby', h.id);
      card.appendChild(h);
    } else if (opts.ariaLabel) {
      dialogEl.setAttribute('aria-label', opts.ariaLabel);
    }

    const body = document.createElement('div');
    body.className = 'bj-dialog__body';
    const c = opts.content;
    if (c instanceof Node) body.appendChild(c);
    else body.innerHTML = c != null ? String(c) : '';
    card.appendChild(body);

    dialogEl.appendChild(card);
    document.body.appendChild(dialogEl);
    registerDialog(dialogEl, removeOnClose);
    return dialogEl;
  }

  function closeAllDialogs() {
    document.querySelectorAll('dialog.' + DIALOG_ROOT_CLASS + '[open]').forEach(function (dlg) {
      requestDialogClose(dlg);
    });
  }

  function setDialogFooterError(root, message) {
    if (!root) return;
    const foot =
      root.querySelector('[data-dialog-foot]') ||
      (root.matches && root.matches('[data-dialog-foot]') ? root : null);
    if (!foot) return;
    const preview = foot.querySelector('[data-dialog-foot-preview]');
    const warn = foot.querySelector('[data-dialog-foot-warning]');
    if (!preview || !warn) return;
    if (message) {
      warn.textContent = message;
      warn.hidden = false;
      preview.hidden = true;
    } else {
      warn.textContent = '';
      warn.hidden = true;
      preview.hidden = false;
    }
  }

  global.BelJarDialog = {
    registerDialog,
    openDialog,
    requestDialogClose,
    createDialog,
    closeAllDialogs,
    setDialogFooterError,
  };
})(typeof window !== 'undefined' ? window : globalThis);

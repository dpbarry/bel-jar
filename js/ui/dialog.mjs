const DIALOG_ROOT_CLASS = 'bj-dialog';
const dialogs = new WeakMap();

const SURFACE_SEARCH_SELECTOR = 'input[type="search"]:not([disabled]), [data-surface-find]';
const PALETTE_PREFIXES = '/@>%#!?:';

function isRecordingChordTarget(e) {
  const t = (e && e.target) || (typeof document !== 'undefined' ? document.activeElement : null);
  return !!(t && t.classList && t.classList.contains('bj-kb__chord') && t.classList.contains('is-recording'));
}

function isFindEvent(e) {
  const KB = globalThis.Keybindings;
  if (KB && typeof KB.matchesId === 'function') return KB.matchesId(e, 'edit.find');
  if (!e || e.altKey || e.shiftKey) return false;
  if (!(e.ctrlKey || e.metaKey)) return false;
  return String(e.key).toLowerCase() === 'f';
}

export function findSurfaceSearchInput(root) {
  if (!root || typeof root.querySelector !== 'function') return null;
  const el = root.querySelector(SURFACE_SEARCH_SELECTOR);
  if (!el || el.disabled) return null;
  return el;
}

function capturingSearchInput() {
  if (typeof document === 'undefined') return null;
  const open = document.querySelectorAll('dialog.' + DIALOG_ROOT_CLASS + '[open]:not(.is-leaving)');
  for (let i = open.length - 1; i >= 0; i--) {
    const input = findSurfaceSearchInput(open[i]);
    if (input) return input;
  }
  const palette = document.querySelector('.bel-palette.is-open');
  return palette ? findSurfaceSearchInput(palette) : null;
}

export function focusSurfaceSearch(input) {
  if (!input || typeof input.focus !== 'function') return false;
  input.focus();
  const v = String(input.value || '');
  if (input.classList && input.classList.contains('bel-palette-input')) {
    const start = v.length && PALETTE_PREFIXES.includes(v[0]) ? 1 : 0;
    try { input.setSelectionRange(start, v.length); } catch (_) {}
    return true;
  }
  try { input.select(); } catch (_) {}
  return true;
}

function onCapturingFind(e) {
  if (!e || e.isComposing || e.defaultPrevented) return;
  if (isRecordingChordTarget(e)) return;
  if (!isFindEvent(e)) return;
  const input = capturingSearchInput();
  if (!input) return;
  e.preventDefault();
  e.stopPropagation();
  focusSurfaceSearch(input);
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', onCapturingFind, true);
}

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

export function registerDialog(dialogEl, removeOnClose) {
  if (!dialogEl || dialogs.has(dialogEl)) return dialogEl || null;

  const info = {
    removeOnClose: !!removeOnClose,
    isClosing: false,
    timer: null,
  };

  dialogEl.addEventListener('pointerdown', (e) => {
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

  dialogEl.addEventListener('cancel', (e) => {
    e.preventDefault();
    requestDialogClose(dialogEl);
  });

  dialogEl.addEventListener('close', () => {
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

export function openDialog(dialogEl) {
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

export function requestDialogClose(dialogEl) {
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
  info.timer = setTimeout(() => {
    info.timer = null;
    if (dialogEl.open) dialogEl.close();
  }, ms);
}

export function createDialog(opts) {
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
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      requestDialogClose(dialogEl);
    });
    card.appendChild(btn);
  }

  const headerExtra = opts.headerExtra instanceof Node ? opts.headerExtra : null;
  if (title || headerExtra) {
    let titleEl = null;
    if (title) {
      titleEl = document.createElement('div');
      titleEl.className = 'bj-dialog__title';
      titleEl.id = 'bj-dialog-title-' + Math.random().toString(36).slice(2);
      titleEl.textContent = title;
      dialogEl.setAttribute('aria-labelledby', titleEl.id);
    }
    if (headerExtra) {
      const header = document.createElement('div');
      header.className = 'bj-dialog__header';
      if (titleEl) header.appendChild(titleEl);
      header.appendChild(headerExtra);
      card.appendChild(header);
    } else {
      card.appendChild(titleEl);
    }
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

export function closeAllDialogs() {
  document.querySelectorAll(`dialog.${DIALOG_ROOT_CLASS}[open]`).forEach((dlg) => {
    requestDialogClose(dlg);
  });
}

export function setDialogFooterError(root, message) {
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

export const Dialog = {
  registerDialog,
  openDialog,
  requestDialogClose,
  createDialog,
  closeAllDialogs,
  setDialogFooterError,
  findSurfaceSearchInput,
  focusSurfaceSearch,
};

const g = typeof window !== 'undefined' ? window : globalThis;
g.Dialog = Dialog;
g.BelJarDialog = g.Dialog

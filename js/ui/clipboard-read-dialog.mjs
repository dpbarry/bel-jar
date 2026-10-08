/**
 * The clipboard card. Editor page only: a paste that will call readText, and
 * no grant yet. Allow opens Chrome's prompt from the click itself. Ignore,
 * the close button, Escape and the backdrop are the same dismissal.
 */
import { createDialog, openDialog, requestDialogClose } from './dialog.mjs';
import { el, markMono, actionButton, CARD_CLASS, WRAP_CLASS } from './prompt-dialog.mjs';
import { pageOf } from '../frame/routes.mjs';
import { readSetting, writeSetting } from '../persist/settings-schema.mjs';
import {
  WATCHED_SETTINGS, situation, shouldOpen, initialView, reduce, copyFor,
  isDismissed, rememberDismissal,
} from './clipboard-read.mjs';

const GRANTED_HOLD_MS = 700;

let ticket = 0;
let readGen = 0;
let dialogEl = null;
let shell = null;
let subjectEl = null;
let messageEl = null;
let noteEl = null;
let actionsEl = null;
let view = null;
let current = null;
let status = null;
let leaving = false;
let rememberOnClose = true;
let holdTimer = null;

function settings() {
  return globalThis.Settings || null;
}

function readDismissed() {
  const v = readSetting('clipboardReadDismissed');
  return Array.isArray(v) ? v : [];
}

function storeDismissal(id) {
  if (!id) return;
  writeSetting('clipboardReadDismissed', rememberDismissal(readDismissed(), id));
}

function present() {
  const S = settings();
  if (!S) return null;
  const KB = globalThis.Keybindings;
  const spec = KB && typeof KB.resolve === 'function' ? KB.resolve('edit.paste') : '';
  const sit = situation({
    style: S.get('keymapStyle'),
    yankSource: S.get('emacsYankSource'),
    pasteSpec: spec,
  });
  if (!sit || sit.kind !== 'rebind') return sit;
  const label = KB && typeof KB.formatShortcut === 'function' ? KB.formatShortcut(sit.chord) : '';
  return { id: sit.id, kind: sit.kind, chord: label || sit.chord };
}

function queryPermission() {
  const permissions = globalThis.navigator && globalThis.navigator.permissions;
  if (!permissions || typeof permissions.query !== 'function') return Promise.resolve(null);
  try {
    return Promise.resolve(permissions.query({ name: 'clipboard-read' })).then(
      (result) => (result && typeof result.state === 'string' ? result : null),
      () => null,
    );
  } catch (_) {
    return Promise.resolve(null);
  }
}

function watch(perm) {
  if (status === perm) return;
  if (status) status.onchange = null;
  status = perm;
  status.onchange = () => {
    if (!dialogEl || !status) return;
    apply({ type: 'permission', state: status.state });
  };
}

function detachStatus() {
  if (status) status.onchange = null;
  status = null;
}

function clearHold() {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

function grantedHoldMs() {
  const pref = settings() && settings().get('motionPref');
  if (pref === 'reduce') return 0;
  if (pref === 'full') return GRANTED_HOLD_MS;
  try {
    if (globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
  } catch (_) { /* matchMedia can throw in a stub document */ }
  return GRANTED_HOLD_MS;
}

function scheduleHold() {
  clearHold();
  holdTimer = setTimeout(() => {
    holdTimer = null;
    finish(false);
  }, grantedHoldMs());
}

function finish(remember) {
  if (!dialogEl || leaving) return;
  leaving = true;
  rememberOnClose = !!remember;
  readGen += 1;
  requestDialogClose(dialogEl);
}

function onDialogClose() {
  clearHold();
  detachStatus();
  const grantedClose = !rememberOnClose && view && view.phase === 'granted';
  const id = rememberOnClose && current ? current.id : null;
  dialogEl = null;
  shell = null;
  subjectEl = null;
  messageEl = null;
  noteEl = null;
  actionsEl = null;
  view = null;
  current = null;
  leaving = false;
  rememberOnClose = true;
  if (id) storeDismissal(id);
  else if (!grantedClose) void consider();
}

function focusPrimary() {
  if (!actionsEl || !dialogEl) return;
  const allow = actionsEl.querySelector('[data-action="allow"]:not(:disabled)');
  const leave = actionsEl.querySelector('[data-action="ignore"]');
  const btn = allow || leave;
  if (btn && typeof btn.focus === 'function') btn.focus();
}

function paint(opts) {
  if (!shell || !view || !current) return;
  const card = copyFor(view, current);
  shell.dataset.phase = view.phase;
  if (card.lead) {
    subjectEl.hidden = false;
    subjectEl.replaceChildren(markMono(card.lead));
  } else {
    subjectEl.hidden = true;
    subjectEl.replaceChildren();
  }
  messageEl.textContent = card.message;
  noteEl.hidden = !card.note;
  noteEl.textContent = card.note || '';
  actionsEl.hidden = card.buttons.length === 0;
  actionsEl.replaceChildren();
  for (const b of card.buttons) {
    const btn = actionButton(b.label, b.action, b.variant);
    if (b.disabled) btn.disabled = true;
    actionsEl.appendChild(btn);
  }
  if (opts && opts.focus) focusPrimary();
}

function apply(event) {
  if (!dialogEl || !view || leaving) return;
  const prev = view.phase;
  view = reduce(view, event);
  if (view.phase === 'closed') {
    finish(!!view.remember);
    return;
  }
  if (prev === 'granted' && view.phase !== 'granted') clearHold();
  if (view.phase === 'granted' && prev !== 'granted') rememberOnClose = false;
  paint({ focus: view.phase !== prev && view.phase !== 'granted' });
  if (view.phase === 'granted' && prev !== 'granted') scheduleHold();
}

function permissionNow() {
  return (status && status.state) || 'prompt';
}

function beginRead() {
  if (!view || view.phase !== 'offer') return;
  const clip = globalThis.navigator && globalThis.navigator.clipboard;
  const gen = ++readGen;
  let pending;
  try {
    pending = clip && typeof clip.readText === 'function'
      ? clip.readText()
      : Promise.reject(new Error('no clipboard'));
  } catch (err) {
    pending = Promise.reject(err);
  }
  apply({ type: 'allow' });
  Promise.resolve(pending).then(
    () => {
      if (gen !== readGen) return;
      apply({ type: 'read', ok: true, permission: permissionNow() });
    },
    () => {
      if (gen !== readGen) return;
      apply({ type: 'read', ok: false, permission: permissionNow() });
    },
  );
}

function onAction(e) {
  const btn = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
  if (!btn || btn.disabled) return;
  e.preventDefault();
  if (btn.dataset.action === 'allow') beginRead();
  else if (btn.dataset.action === 'ignore') apply({ type: 'ignore' });
}

function mount(permission) {
  if (typeof document === 'undefined' || !document.body) return;
  view = initialView(permission);
  rememberOnClose = true;
  leaving = false;
  shell = el('div', 'jar-prompt-dialog');
  const live = el('div');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  subjectEl = el('p', 'jar-prompt-dialog__subject');
  messageEl = el('p', 'jar-prompt-dialog__message');
  noteEl = el('p', 'jar-prompt-dialog__note');
  live.append(subjectEl, messageEl, noteEl);
  actionsEl = el('div', 'jar-prompt-dialog__actions is-row');
  shell.append(live, actionsEl);
  shell.addEventListener('click', onAction);
  dialogEl = createDialog({
    title: 'Clipboard',
    content: shell,
    className: WRAP_CLASS,
    cardClass: CARD_CLASS,
    closeButton: true,
    removeOnClose: true,
  });
  dialogEl.addEventListener('close', onDialogClose);
  paint();
  openDialog(dialogEl);
  focusPrimary();
  requestAnimationFrame(() => focusPrimary());
}

function adopt(next) {
  readGen += 1;
  const state = status ? status.state : 'prompt';
  if (!shouldOpen(state, next, readDismissed())) {
    finish(false);
    return;
  }
  current = next;
  const prev = view ? view.phase : '';
  view = initialView(state);
  if (prev === 'granted' && view.phase !== 'granted') clearHold();
  if (view.phase === 'granted') rememberOnClose = false;
  paint({ focus: true });
  if (view.phase === 'granted') scheduleHold();
}

async function consider() {
  const mine = ++ticket;
  try {
    if (leaving) return;
    const next = present();
    if (!next) {
      if (dialogEl) finish(false);
      return;
    }
    if (dialogEl && current && current.id === next.id) {
      if (current.chord !== next.chord) {
        current = next;
        paint();
      }
      return;
    }
    if (dialogEl && current && current.id !== next.id) {
      adopt(next);
      return;
    }
    if (isDismissed(readDismissed(), next.id)) return;
    const perm = await queryPermission();
    if (mine !== ticket || leaving) return;
    if (!perm) return;
    const again = present();
    if (!again || again.id !== next.id || isDismissed(readDismissed(), again.id)) return;
    if (!shouldOpen(perm.state, again, readDismissed())) return;
    if (dialogEl) {
      watch(perm);
      adopt(again);
      return;
    }
    watch(perm);
    current = again;
    mount(perm.state);
    if (!dialogEl) current = null;
  } catch (_) { /* a permission query that rejects is a browser with nothing to ask */ }
}

function relevant(ids) {
  if (!ids) return true;
  for (let i = 0; i < ids.length; i++) {
    if (WATCHED_SETTINGS.indexOf(ids[i]) !== -1) return true;
  }
  return false;
}

function start() {
  if (typeof globalThis.location === 'undefined') return;
  if (pageOf(globalThis.location) !== 'edit') return;
  const S = settings();
  if (!S || typeof S.subscribe !== 'function') return;
  S.subscribe((e) => {
    if (!relevant(e && e.ids)) return;
    void consider();
  });
  void consider();
}

start();

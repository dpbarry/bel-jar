/**
 * The edit-history panel: the timeline behind the strip's `⟲` segment.
 *
 * It grows out of the strip the same way the command line's candidate list
 * does — `position: fixed`, measured against the bar's own rect, sharing the
 * strip's top border as its bottom edge. Two popups anchored to the same bar
 * that float at different distances from it read as two different applications.
 *
 * Everything it says comes from `status-strip-history.mjs`; this file is the
 * DOM and the keyboard, nothing else.
 */
import { buildHistoryRows, historySummary } from './status-strip-history.mjs';

const global = globalThis;

let panelEl = null;
let listEl = null;
let footEl = null;
let open = false;
let active = -1;
let rows = [];
let listeners = false;
let onChanged = null;

/** Nothing to travel to and nothing to say: the panel does not open empty. */
function history() {
  return global.EditHistory || null;
}

function nameOf(id) {
  const P = global.Persist;
  if (!P || typeof P.getFileById !== 'function') return null;
  const f = P.getFileById(id);
  return f ? f.name : null;
}

function bar() {
  return document.querySelector('.jar-strip');
}

function anchor() {
  const strip = bar();
  if (!strip || !panelEl) return;
  const rect = strip.getBoundingClientRect();
  // No gap: the strip's top border IS the panel's bottom edge.
  panelEl.style.bottom = Math.max(0, Math.round(window.innerHeight - rect.top)) + 'px';
  // Right-aligned to the segment it belongs to, so it points at the thing you
  // clicked rather than at the far side of the window.
  const seg = strip.querySelector('.jar-strip__seg--history');
  const from = seg ? seg.getBoundingClientRect() : null;
  const pad = 6;
  const width = panelEl.offsetWidth || 0;
  let left = from ? from.right - width : rect.right - width - pad;
  left = Math.min(left, Math.max(pad, window.innerWidth - width - pad));
  panelEl.style.left = Math.max(pad, Math.round(left)) + 'px';
}

function ensurePanel() {
  if (panelEl && panelEl.isConnected) return panelEl;
  panelEl = document.createElement('div');
  panelEl.className = 'jar-hist';
  panelEl.setAttribute('role', 'dialog');
  panelEl.setAttribute('aria-label', 'Edit history');

  const head = document.createElement('div');
  head.className = 'jar-hist__head';
  const title = document.createElement('span');
  title.className = 'jar-hist__title';
  title.textContent = 'Edit history';
  const count = document.createElement('span');
  count.className = 'jar-hist__count';
  head.appendChild(title);
  head.appendChild(count);
  panelEl.appendChild(head);

  listEl = document.createElement('div');
  listEl.className = 'jar-hist__list';
  listEl.setAttribute('role', 'listbox');
  panelEl.appendChild(listEl);

  footEl = document.createElement('div');
  footEl.className = 'jar-hist__foot';
  // Populated in render(), not here — see renderFoot for why it has to be
  // rebuilt on every paint rather than fixed at panel creation.
  panelEl.appendChild(footEl);

  panelEl._count = count;
  document.body.appendChild(panelEl);
  return panelEl;
}

/**
 * Which style the editor is actually in right now.
 *
 * Read fresh every time rather than cached: this drives what the footer tells
 * the user to press, and a stale read here is a wrong instruction, not a
 * cosmetic glitch.
 */
function liveKeymapStyle() {
  const P = global.Persist;
  const raw = P && typeof P.readStoredKeymapStyle === 'function' ? P.readStoredKeymapStyle() : '';
  const s = String(raw || '').toLowerCase();
  return s === 'vim' || s === 'emacs' ? s : 'default';
}

/**
 * Vim's and Emacs' OWN undo/redo keys — not reachable through the Keybindings
 * sheet, so there is no override to read for them.
 *
 * `edit.undo`/`edit.redo` in the catalogue are the STANDARD chord only. Under
 * Vim, Normal-mode undo is the package's own fixed `u` / `Ctrl-R`
 * (`ensureVimUndoBridge` in vim-runtime.mjs just points what they DO at
 * BelJar's history; it does not touch what triggers them). Under Emacs the
 * bridge binds its own fixed aliases (`ensureEmacsUndoBridge` in
 * emacs-runtime.mjs) — `edit.redo` is even policy-`off` there, so the registry
 * chord for it does not fire at all. Showing `Keybindings.labelFor('edit.undo')`
 * regardless of style told an Emacs user to press Ctrl+Y for redo, which is
 * yank.
 *
 * ⛔ Emacs shows `Ctrl+Z` / `Ctrl+Shift+Z`, not the stock-Emacs `C-/` / `C-S-/`
 * — even though `ensureEmacsUndoBridge` binds BOTH pairs as equal aliases and
 * either works. Real GNU Emacs uses `C-z` to suspend the frame, so `C-/` is
 * its bound-in undo key; a browser tab has no frame to suspend, and every
 * other application trains people to reach for `Ctrl+Z`, so that alias is the
 * one BelJar's own users actually press. The hint names what people use, not
 * what is most traditional.
 *
 * Specs use BelJar's own `Control+…` vocabulary rather than the packages'
 * `C-…` shorthand, so `Keybindings.formatShortcut` renders them exactly like
 * every other chord in the app (`Ctrl+Z` on Windows/Linux, `⌃Z` on a Mac).
 */
const FIXED_STYLE_SPECS = {
  vim: { 'edit.undo': 'u', 'edit.redo': 'Control+R' },
  emacs: { 'edit.undo': 'Control+Z', 'edit.redo': 'Control+Shift+Z' },
};

function liveKeyLabel(commandId) {
  const K = global.Keybindings;
  const style = liveKeymapStyle();
  const fixed = FIXED_STYLE_SPECS[style] && FIXED_STYLE_SPECS[style][commandId];
  if (fixed != null) {
    return K && typeof K.formatShortcut === 'function' ? K.formatShortcut(fixed) : fixed;
  }
  // Standard style: the registry chord, WITH the user's own override if they
  // rebound it — a panel that names a key you rebound away from is a surface
  // offering what does not work.
  if (!K || typeof K.labelFor !== 'function') return '';
  try {
    return K.labelFor(commandId) || '';
  } catch (_) {
    return '';
  }
}

/** A footer hint: the command's name, and the key that ACTUALLY runs it now. */
function hintRow(commandId, fallbackLabel) {
  const row = document.createElement('span');
  row.className = 'jar-hist__hint';
  const C = global.Commands;
  let label = fallbackLabel;
  try {
    const cmd = C && typeof C.get === 'function' ? C.get(commandId) : null;
    if (cmd && cmd.title) label = cmd.title;
  } catch (_) { /* the fallback label still reads correctly */ }
  const keys = liveKeyLabel(commandId);
  const name = document.createElement('span');
  name.className = 'jar-hist__hint-name';
  name.textContent = label;
  row.appendChild(name);
  if (keys) {
    const kbd = document.createElement('kbd');
    kbd.className = 'jar-hist__key';
    kbd.textContent = keys;
    row.appendChild(kbd);
  }
  return row;
}

/**
 * Rebuilt every render, not fixed at panel creation.
 *
 * ⛔ The style can change while the panel is open — Settings is one click away
 * — and `render()` is what runs on that repaint (via the stack's own
 * `onStackChange`, which fires on every project swap too). A footer built once
 * at `ensurePanel()` would keep naming the style that was live when the panel
 * FIRST opened.
 */
function renderFoot() {
  if (!footEl) return;
  footEl.textContent = '';
  footEl.appendChild(hintRow('edit.undo', 'Undo'));
  footEl.appendChild(hintRow('edit.redo', 'Redo'));
}

function rowEl(row, index) {
  if (row.now) {
    const marker = document.createElement('div');
    marker.className = 'jar-hist__now';
    marker.setAttribute('role', 'option');
    marker.setAttribute('aria-selected', 'true');
    marker.dataset.index = String(index);
    const dot = document.createElement('span');
    dot.className = 'jar-hist__now-dot';
    const text = document.createElement('span');
    text.className = 'jar-hist__now-text';
    text.textContent = row.label;
    marker.appendChild(dot);
    marker.appendChild(text);
    return marker;
  }

  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'jar-hist__row' + (row.ahead ? ' is-ahead' : '');
  el.setAttribute('role', 'option');
  el.setAttribute('aria-selected', 'false');
  el.dataset.index = String(index);
  el.dataset.direction = row.direction;
  el.dataset.distance = String(row.distance);

  // What it did, when that is legible; what it was called, when it is not.
  const label = document.createElement('span');
  label.className = 'jar-hist__label';
  if (row.preview) {
    label.classList.add('is-preview');
    const sign = document.createElement('span');
    sign.className = 'jar-hist__sign is-' + (row.preview.sign === '+' ? 'add'
      : (row.preview.sign === '−' ? 'cut' : 'swap'));
    sign.textContent = row.preview.sign;
    label.appendChild(sign);
    const text = document.createElement('span');
    text.className = 'jar-hist__text' + (row.preview.faded ? ' is-faded' : '');
    text.textContent = row.preview.text;
    label.appendChild(text);
  } else {
    label.textContent = row.label;
  }
  el.appendChild(label);

  if (row.where) {
    const where = document.createElement('span');
    where.className = 'jar-hist__where';
    where.textContent = row.where;
    el.appendChild(where);
  }

  const when = document.createElement('span');
  when.className = 'jar-hist__when';
  when.textContent = row.when || '';
  el.appendChild(when);

  // The tooltip carries what the row had to cut: the kind behind a preview, and
  // the whole file list behind a count.
  const tipLines = [row.label];
  if (row.files && row.files.length > 1) tipLines.push('', ...row.files);
  el.setAttribute('data-tooltip', tipLines.join('\n'));
  el.setAttribute('aria-label', row.label + (row.where ? ', ' + row.where : ''));
  // Built long after the one boot-time `[data-tooltip]` sweep, so it binds itself.
  global.Tooltips?.bind?.(el);
  return el;
}

function render() {
  const H = history();
  if (!H) return;
  const panel = ensurePanel();
  const undo = H.getUndoStack ? H.getUndoStack() : [];
  const redo = H.getRedoStack ? H.getRedoStack() : [];
  rows = buildHistoryRows(undo, redo, { nameOf, now: Date.now() });
  panel._count.textContent = historySummary(undo.length, redo.length);

  listEl.textContent = '';
  rows.forEach((row, i) => listEl.appendChild(rowEl(row, i)));
  renderFoot();
  if (active < 0 || active >= rows.length) active = rows.findIndex((r) => r.now);
  paintActive();
  // Open on the present, not on the top of a long list: the row you came to act
  // near is the one you are standing on.
  const now = listEl.querySelector('.jar-hist__now');
  if (now && typeof now.scrollIntoView === 'function') {
    now.scrollIntoView({ block: 'center' });
  }
  anchor();
}

function paintActive() {
  const nodes = listEl.children;
  for (let i = 0; i < nodes.length; i += 1) {
    const on = i === active;
    nodes[i].classList.toggle('is-active', on);
    nodes[i].setAttribute('aria-selected', on ? 'true' : 'false');
  }
  const el = nodes[active];
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
}

/**
 * Travel to a row: apply its direction as many times as it is away.
 *
 * ⛔ One step at a time through the real `undo()`/`redo()`, never a jump that
 * reconstructs a state directly. Every guarantee the history makes — atomic file
 * moves, the editor following a deleted file, drift reconciliation — lives in
 * those two calls, and a shortcut past them would be a second, weaker history.
 */
function travelTo(index) {
  const row = rows[index];
  const H = history();
  if (!row || !H || !row.direction || !row.distance) return false;
  const step = row.direction === 'undo' ? H.undo : H.redo;
  for (let i = 0; i < row.distance; i += 1) {
    if (!step.call(H)) break;
  }
  active = -1;
  render();
  if (onChanged) onChanged();
  return true;
}

function onKeyDown(e) {
  if (!open) return;
  if (e.key === 'Escape') { e.preventDefault(); close({ focusStrip: true }); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const dir = e.key === 'ArrowDown' ? 1 : -1;
    active = Math.max(0, Math.min(rows.length - 1, active + dir));
    paintActive();
    return;
  }
  if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    active = e.key === 'Home' ? 0 : rows.length - 1;
    paintActive();
    return;
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    travelTo(active);
  }
}

function onDocPointerDown(e) {
  if (!open) return;
  const t = e.target;
  if (panelEl && panelEl.contains(t)) return;
  // The segment toggles; letting the outside-click close it too would close and
  // immediately reopen.
  if (t && t.closest && t.closest('.jar-strip__seg--history')) return;
  close();
}

function onListClick(e) {
  const btn = e.target && e.target.closest ? e.target.closest('.jar-hist__row') : null;
  if (!btn) return;
  e.preventDefault();
  travelTo(Number(btn.dataset.index));
}

function bind() {
  if (listeners) return;
  listeners = true;
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('pointerdown', onDocPointerDown, true);
  window.addEventListener('resize', anchor);
  window.addEventListener('scroll', anchor, { passive: true, capture: true });
  listEl.addEventListener('click', onListClick);
}

function unbind() {
  if (!listeners) return;
  listeners = false;
  document.removeEventListener('keydown', onKeyDown, true);
  document.removeEventListener('pointerdown', onDocPointerDown, true);
  window.removeEventListener('resize', anchor);
  window.removeEventListener('scroll', anchor, { capture: true });
  if (listEl) listEl.removeEventListener('click', onListClick);
}

export function isOpen() {
  return open;
}

export function close(opts) {
  if (!open) return false;
  open = false;
  unbind();
  if (panelEl && panelEl.parentNode) panelEl.parentNode.removeChild(panelEl);
  panelEl = null;
  listEl = null;
  active = -1;
  if (onChanged) onChanged();
  if (opts && opts.focusStrip) global.CurrentEditor?.focus?.();
  return true;
}

export function openPanel(changed) {
  const H = history();
  if (!H) return false;
  const undo = H.getUndoStack ? H.getUndoStack().length : 0;
  const redo = H.getRedoStack ? H.getRedoStack().length : 0;
  if (!undo && !redo) return false;
  onChanged = changed || null;
  open = true;
  ensurePanel();
  bind();
  active = -1;
  render();
  // A frame after mount so the measured width is real before we place it.
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(anchor);
  if (onChanged) onChanged();
  return true;
}

export function toggle(changed) {
  return open ? (close(), false) : openPanel(changed);
}

/** Repaint in place when the stack moves under an open panel. */
export function refresh() {
  if (!open) return;
  const H = history();
  if (!H) { close(); return; }
  const undo = H.getUndoStack ? H.getUndoStack().length : 0;
  const redo = H.getRedoStack ? H.getRedoStack().length : 0;
  if (!undo && !redo) { close(); return; }
  render();
}

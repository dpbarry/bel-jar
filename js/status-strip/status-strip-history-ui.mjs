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
  return document.querySelector('.bj-strip');
}

function anchor() {
  const strip = bar();
  if (!strip || !panelEl) return;
  const rect = strip.getBoundingClientRect();
  // No gap: the strip's top border IS the panel's bottom edge.
  panelEl.style.bottom = Math.max(0, Math.round(window.innerHeight - rect.top)) + 'px';
  // Right-aligned to the segment it belongs to, so it points at the thing you
  // clicked rather than at the far side of the window.
  const seg = strip.querySelector('.bj-strip__seg--history');
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
  panelEl.className = 'bj-hist';
  panelEl.setAttribute('role', 'dialog');
  panelEl.setAttribute('aria-label', 'Edit history');

  const head = document.createElement('div');
  head.className = 'bj-hist__head';
  const title = document.createElement('span');
  title.className = 'bj-hist__title';
  title.textContent = 'Edit history';
  const count = document.createElement('span');
  count.className = 'bj-hist__count';
  head.appendChild(title);
  head.appendChild(count);
  panelEl.appendChild(head);

  listEl = document.createElement('div');
  listEl.className = 'bj-hist__list';
  listEl.setAttribute('role', 'listbox');
  panelEl.appendChild(listEl);

  const foot = document.createElement('div');
  foot.className = 'bj-hist__foot';
  // ⛔ Derived from the registry, never retyped: if the user has rebound undo,
  // the hint has to name the key they actually have.
  foot.appendChild(hintRow('edit.undo', 'Undo'));
  foot.appendChild(hintRow('edit.redo', 'Redo'));
  panelEl.appendChild(foot);

  panelEl._count = count;
  document.body.appendChild(panelEl);
  return panelEl;
}

/**
 * A footer hint naming the chord the user actually has for a command.
 *
 * Reads the live keybinding rather than spelling `Ctrl+Z` into the markup —
 * a panel that names a key you rebound is a surface offering what does not work.
 */
function hintRow(commandId, fallbackLabel) {
  const row = document.createElement('span');
  row.className = 'bj-hist__hint';
  const K = global.Keybindings;
  const C = global.Commands;
  let label = fallbackLabel;
  let keys = '';
  try {
    const cmd = C && typeof C.get === 'function' ? C.get(commandId) : null;
    if (cmd && cmd.title) label = cmd.title;
    if (K && typeof K.labelFor === 'function') keys = K.labelFor(commandId) || '';
  } catch (_) { /* the fallback label still reads correctly */ }
  const name = document.createElement('span');
  name.className = 'bj-hist__hint-name';
  name.textContent = label;
  row.appendChild(name);
  if (keys) {
    const kbd = document.createElement('kbd');
    kbd.className = 'bj-hist__key';
    kbd.textContent = keys;
    row.appendChild(kbd);
  }
  return row;
}

function rowEl(row, index) {
  if (row.now) {
    const marker = document.createElement('div');
    marker.className = 'bj-hist__now';
    marker.setAttribute('role', 'option');
    marker.setAttribute('aria-selected', 'true');
    marker.dataset.index = String(index);
    const dot = document.createElement('span');
    dot.className = 'bj-hist__now-dot';
    const text = document.createElement('span');
    text.className = 'bj-hist__now-text';
    text.textContent = row.label;
    marker.appendChild(dot);
    marker.appendChild(text);
    return marker;
  }

  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'bj-hist__row' + (row.ahead ? ' is-ahead' : '');
  el.setAttribute('role', 'option');
  el.setAttribute('aria-selected', 'false');
  el.dataset.index = String(index);
  el.dataset.direction = row.direction;
  el.dataset.distance = String(row.distance);

  // What it did, when that is legible; what it was called, when it is not.
  const label = document.createElement('span');
  label.className = 'bj-hist__label';
  if (row.preview) {
    label.classList.add('is-preview');
    const sign = document.createElement('span');
    sign.className = 'bj-hist__sign is-' + (row.preview.sign === '+' ? 'add'
      : (row.preview.sign === '−' ? 'cut' : 'swap'));
    sign.textContent = row.preview.sign;
    label.appendChild(sign);
    const text = document.createElement('span');
    text.className = 'bj-hist__text' + (row.preview.faded ? ' is-faded' : '');
    text.textContent = row.preview.text;
    label.appendChild(text);
  } else {
    label.textContent = row.label;
  }
  el.appendChild(label);

  if (row.where) {
    const where = document.createElement('span');
    where.className = 'bj-hist__where';
    where.textContent = row.where;
    el.appendChild(where);
  }

  const when = document.createElement('span');
  when.className = 'bj-hist__when';
  when.textContent = row.when || '';
  el.appendChild(when);

  // The tooltip carries what the row had to cut: the kind behind a preview, and
  // the whole file list behind a count.
  const tipLines = [row.label];
  if (row.files && row.files.length > 1) tipLines.push('', ...row.files);
  el.setAttribute('data-tooltip', tipLines.join('\n'));
  el.setAttribute('aria-label', row.label + (row.where ? ', ' + row.where : ''));
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
  if (active < 0 || active >= rows.length) active = rows.findIndex((r) => r.now);
  paintActive();
  // Open on the present, not on the top of a long list: the row you came to act
  // near is the one you are standing on.
  const now = listEl.querySelector('.bj-hist__now');
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
  if (t && t.closest && t.closest('.bj-strip__seg--history')) return;
  close();
}

function onListClick(e) {
  const btn = e.target && e.target.closest ? e.target.closest('.bj-hist__row') : null;
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

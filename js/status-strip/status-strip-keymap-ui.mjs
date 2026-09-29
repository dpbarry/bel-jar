/**
 * The editing-style picker behind the strip's keymap segment.
 *
 * ⛔ Deliberately the history panel's chrome — `.jar-hist` frame, caption,
 * list, flush on the strip — anchored to the opposite edge. Two popups grown
 * from one bar that do not look alike read as two applications. Only the rows
 * are its own.
 */
import { anchorAbove } from './status-strip-popup.mjs';
import { liveKeymapStyle } from './status-strip-keys.mjs';

const global = globalThis;

const STYLES = [
  { value: 'default', name: 'Standard' },
  { value: 'vim', name: 'Vim' },
  { value: 'emacs', name: 'Emacs' },
];

let panelEl = null;
let listEl = null;
let active = -1;
let onChanged = null;

const anchor = () => anchorAbove(panelEl, '.jar-strip__seg--keymap', 'left', '.jar-style__name');

function rowEl(style, index, current) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'jar-style__row' + (current ? ' is-current' : '');
  el.setAttribute('role', 'option');
  el.setAttribute('aria-selected', current ? 'true' : 'false');
  el.dataset.index = String(index);
  const name = document.createElement('span');
  name.className = 'jar-style__name';
  name.textContent = style.name;
  el.appendChild(name);
  return el;
}

function build() {
  panelEl = document.createElement('div');
  panelEl.className = 'jar-hist jar-hist--style';
  panelEl.setAttribute('role', 'dialog');
  panelEl.setAttribute('aria-label', 'Editing style');
  const head = document.createElement('div');
  head.className = 'jar-hist__head';
  const title = document.createElement('span');
  title.className = 'jar-hist__title';
  title.textContent = 'Editing style';
  head.appendChild(title);
  listEl = document.createElement('div');
  listEl.className = 'jar-hist__list';
  listEl.setAttribute('role', 'listbox');
  const current = liveKeymapStyle();
  STYLES.forEach((s, i) => listEl.appendChild(rowEl(s, i, s.value === current)));
  active = -1;
  panelEl.append(head, listEl);
  document.body.appendChild(panelEl);
  paintActive();
}

function paintActive() {
  Array.from(listEl.children).forEach((n, i) => n.classList.toggle('is-active', i === active));
}

function choose(index) {
  const style = STYLES[index];
  close();
  if (style && style.value !== liveKeymapStyle()) {
    global.Settings.set('keymapStyle', style.value);
    global.dispatchEvent(new CustomEvent('beljar:settings-changed', { detail: { key: 'keymap-style' } }));
    global.StatusStrip?.setEditorState?.({ style: style.value });
  }
  global.CurrentEditor?.focus?.();
}

/** With nothing highlighted, the keyboard starts from the style in use. */
const from = () => (active < 0 ? Math.max(0, STYLES.findIndex((s) => s.value === liveKeymapStyle())) : active);

const moveTo = (i) => { active = (i + STYLES.length) % STYLES.length; paintActive(); };

const KEYS = {
  Escape: () => close({ focusEditor: true }),
  ArrowDown: () => moveTo(active < 0 ? from() : active + 1),
  ArrowUp: () => moveTo(active < 0 ? from() : active - 1),
  Home: () => moveTo(0),
  End: () => moveTo(STYLES.length - 1),
  Enter: () => choose(from()),
  ' ': () => choose(from()),
};

function onKeyDown(e) {
  const fn = KEYS[e.key];
  if (!fn) return;
  e.preventDefault();
  e.stopPropagation();
  fn();
}

function onDocPointerDown(e) {
  const t = e.target;
  if (panelEl?.contains(t) || t?.closest?.('.jar-strip__seg--keymap')) return;
  close();
}

function onListClick(e) {
  const row = e.target?.closest?.('.jar-style__row');
  if (row) choose(Number(row.dataset.index));
}

function onListMove(e) {
  if (e.pointerType === 'touch') return;
  const row = e.target?.closest?.('.jar-style__row');
  if (row && Number(row.dataset.index) !== active) moveTo(Number(row.dataset.index));
}

function onListLeave() {
  if (active >= 0) { active = -1; paintActive(); }
}

export const isOpen = () => !!panelEl;

export function close(opts) {
  if (!panelEl) return false;
  document.removeEventListener('keydown', onKeyDown, true);
  document.removeEventListener('pointerdown', onDocPointerDown, true);
  window.removeEventListener('resize', anchor);
  panelEl.remove();
  panelEl = null;
  listEl = null;
  onChanged?.();
  if (opts?.focusEditor) global.CurrentEditor?.focus?.();
  return true;
}

export function toggle(changed) {
  if (panelEl) return (close(), false);
  onChanged = changed || null;
  build();
  listEl.addEventListener('click', onListClick);
  listEl.addEventListener('pointermove', onListMove);
  listEl.addEventListener('pointerleave', onListLeave);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('pointerdown', onDocPointerDown, true);
  window.addEventListener('resize', anchor);
  anchor();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(anchor);
  onChanged?.();
  return true;
}

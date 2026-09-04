/**
 * The command line: the strip's `command` state, in three faces.
 *
 *   command   our own input, opened by `:` (Standard), `M-x` (Emacs), the palette
 *   search    the same input matching text incrementally (`/`, `C-s`)
 *   ex        VIM'S input, mounted in our slot, with our candidates layered on top
 *
 * All three share one candidate state machine, because the bugs come from having
 * more than one: a list that outlived its input, a highlight that scrolled out of
 * sight, an Enter that ran something other than what was selected.
 *
 * Grammar and ranking live in the pure modules beside this one; everything here
 * is DOM and wiring.
 */
import { parseCommandLine, lineTarget, tokenAtCaret } from './status-strip-parse.mjs';
import { optionCandidates } from '../commands/command-settings.mjs';
import { complete, applyCompletion } from './status-strip-complete.mjs';

const global = globalThis;
const HISTORY_CAP = 50;
/** Every candidate is rendered: arrowing must never fall off the end of the DOM. */
const LIST_CAP = 30;

/**
 * Walking the list: forward, forward, back.
 *
 * ⛔ `C-m` is forward, NOT Enter. Chromium never delivers `Ctrl+N` to a page, so
 * `Ctrl+M` is the substitute BelJar's own reserved-chord table has promised for
 * next-line since the table was written, and the editor has bound it that way
 * just as long (`EMACS_LINE_DOWN_KEY`). The same trio has to mean the same thing
 * on this line as it does in the editor; treating it as RET because a terminal
 * once did contradicted two places in this repo that already said otherwise.
 */
export const LIST_STEP = { n: 1, m: 1, p: -1 };
const PAGE = 8;

let host = null;
let input = null;
let ghostEl = null;
let listEl = null;
let open = false;
let items = [];
let active = -1;
/** Did the user pick this row, or is it just the top of the list? */
let chosen = false;
/** The text the current candidate list was ranked from. */
let query = '';
let onCloseCb = null;
let history = [];
let historyAt = -1;
let historyLoaded = false;
// What the viewport looked like before a preview moved it.
let savedScroll = null;
let savedSelection = null;
// '' when the line is running commands; '/' or '?' while searching.
let searchDir = '';
let searchAnchor = 0;
let promptEl = null;
let countEl = null;
let previewTimer = 0;
const PREVIEW_MS = 90;
let listListeners = false;
/** Measured once per render, so arrowing never forces a style recalc. */
let listPad = { top: 0, bottom: 0 };
/** The popup is showing key hints rather than command candidates. */
let hinting = false;
/** The user asked for the list outright, so an empty query still shows it. */
let forced = false;

/** Pure: blur during search aborts (restore); command blur does not. */
export function blurRestoreOnClose(wasSearch) {
  return !!wasSearch;
}

function loadHistory() {
  if (historyLoaded) return;
  historyLoaded = true;
  const P = global.Persist;
  if (P && typeof P.readStoredCommandLineHistory === 'function') {
    try { history = P.readStoredCommandLineHistory() || []; } catch (_) { history = []; }
  }
}

function saveHistory() {
  const P = global.Persist;
  if (P && typeof P.writeStoredCommandLineHistory === 'function') {
    try { P.writeStoredCommandLineHistory(history); } catch (_) { /* storage full */ }
  }
}

/** Commands the line can name: ex aliases first, then the id. */
function commandSources() {
  const C = global.Commands;
  const P = global.Persist;
  return {
    commands() {
      if (!C || typeof C.list !== 'function') return [];
      return C.list({ cmdline: true, runnable: true, available: true }).map((c) => ({
        value: (c.ex && c.ex[0]) || c.id,
        label: c.title,
        detail: c.section,
        aliases: (c.ex || []).concat([c.id], c.mx ? [c.mx] : []),
        args: c.args || [],
        id: c.id,
      }));
    },
    files() {
      if (!P || typeof P.listFiles !== 'function') return [];
      return (P.listFiles() || []).map((f) => ({ value: f.name, label: f.name }));
    },
    // `:set ` completes over every preference name and vi abbreviation.
    options: () => optionCandidates(),
  };
}

/**
 * ⛔ Case-insensitive. Every name this line answers to is lower-case, so `HELP`
 * can only have meant `help` — refusing it was the line being pedantic about a
 * distinction it does not itself make. The title fallback below was already
 * case-insensitive, which made the strictness inconsistent as well as unhelpful.
 */
function resolveCommand(name) {
  const all = commandSources().commands();
  const want = String(name == null ? '' : name).toLowerCase();
  if (!want) return null;
  return all.find((c) => String(c.value).toLowerCase() === want)
    || all.find((c) => c.aliases.some((a) => String(a).toLowerCase() === want))
    || all.find((c) => (c.label || '').toLowerCase() === want)
    || null;
}

function jumpToLine(target) {
  const ed = global.CurrentEditor;
  const view = ed && typeof ed.getView === 'function' ? ed.getView() : null;
  if (!view || !target) return false;
  const doc = view.state.doc;
  const line = doc.line(Math.max(1, Math.min(target.line, doc.lines)));
  const pos = Math.min(line.from + Math.max(0, target.col - 1), line.to);
  if (typeof ed.jumpToRange === 'function') ed.jumpToRange({ from: pos, to: pos });
  else view.dispatch({ selection: { anchor: pos, head: pos }, scrollIntoView: true });
  if (typeof ed.focus === 'function') ed.focus();
  return true;
}

function message(text) {
  const B = global.StatusStrip;
  if (B && typeof B.setMessage === 'function') B.setMessage(text);
}

/**
 * Run one line. `closing` performs whatever the caller needs to do between
 * parsing and running — the interactive path closes the line there, `@:` has
 * nothing to close.
 */
function runLine(raw, closing) {
  const parsed = parseCommandLine(raw);
  remember(raw);
  if (parsed.kind === 'empty') { closing(); return false; }
  if (parsed.kind === 'line') {
    // Committed: the jump keeps the viewport it previewed.
    savedScroll = null;
    closing();
    if (jumpToLine(lineTarget(parsed))) return true;
    message('No file open.');
    return false;
  }
  const cmd = resolveCommand(parsed.name);
  closing();
  if (!cmd) {
    const near = complete(parsed.name, parsed.name.length, commandSources()).items[0];
    message(near ? `Unknown command "${parsed.name}". Did you mean "${near.value}"?`
      : `Unknown command "${parsed.name}".`);
    return false;
  }
  const C = global.Commands;
  try {
    const ok = C && C.run(cmd.id, { args: parsed.args, bang: parsed.bang, argText: parsed.argText });
    if (!ok) message(`"${cmd.label}" is not available right now.`);
    return !!ok;
  } catch (err) {
    if (global.console && console.error) console.error('[cmdline]', err);
    if (global.Toasts && global.Toasts.warn) {
      const msg = err && err.message ? String(err.message) : String(err);
      global.Toasts.warn('Command failed: ' + msg);
    }
    return false;
  }
}

/** Run whatever the line says, and report in the strip when it cannot. */
export function submit() {
  runLine(input ? input.value : '', () => close());
}

function remember(raw) {
  const text = String(raw || '').trim();
  if (!text) return;
  loadHistory();
  const at = history.indexOf(text);
  if (at >= 0) history.splice(at, 1);
  history.unshift(text);
  if (history.length > HISTORY_CAP) history.length = HISTORY_CAP;
  historyAt = -1;
  saveHistory();
}

/**
 * Live preview, per the plan's rule: viewport and decorations ONLY. `:42`
 * scrolls line 42 into view without moving the caret, and aborting puts the
 * scroll back. Nothing here may touch the document.
 */
function previewLine(parsed) {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = 0;
  if (!parsed || parsed.kind !== 'line') return;
  previewTimer = setTimeout(() => {
    previewTimer = 0;
    const ed = global.CurrentEditor;
    const view = ed && typeof ed.getView === 'function' ? ed.getView() : null;
    if (!view || typeof ed.peekRange !== 'function') return;
    const doc = view.state.doc;
    const line = doc.line(Math.max(1, Math.min(parsed.line, doc.lines)));
    ed.peekRange({ from: line.from, to: line.from });
  }, PREVIEW_MS);
}

function restoreViewport() {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = 0;
  if (savedScroll == null) return;
  const ed = global.CurrentEditor;
  const view = ed && typeof ed.getView === 'function' ? ed.getView() : null;
  const target = savedScroll;
  savedScroll = null;
  if (!view || !view.scrollDOM) return;
  view.scrollDOM.scrollTop = target;
  // A preview's `scrollIntoView` effect lands on CodeMirror's NEXT measure, so
  // a synchronous restore alone is overwritten a frame later.
  const settle = () => { if (view.dom.isConnected) view.scrollDOM.scrollTop = target; };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(settle);
  setTimeout(settle, 40);
}

/** Sit the list on the strip's top edge, measured rather than inherited. */
/**
 * Show whole rows only.
 *
 * ⛔ The popup's bottom edge IS the strip's top border, so a row sliced in half
 * by the scrollport lands against that line and reads as a rendering fault
 * rather than as "there is more below". A floating list can get away with it;
 * one welded to a border cannot. The cap comes from the stylesheet and the row
 * height is measured, so this holds at any font size.
 */
function fitWholeRows(cap) {
  const first = listEl && listEl.firstElementChild;
  if (!first || !cap) return;
  const rowH = first.offsetHeight;
  if (!rowH || cap < rowH * 2) return;
  const rows = Math.max(2, Math.floor((cap - listPad.top - listPad.bottom) / rowH));
  listEl.style.maxHeight = (rows * rowH + listPad.top + listPad.bottom) + 'px';
}

/**
 * Sit the popup ON the strip, growing out of the field you are typing in.
 *
 * ⛔ No gap. The strip's top border IS the popup's bottom edge — one line, not
 * two hairlines with a sliver of page between them. The popup drops its own
 * bottom border and its bottom corners to make that seam read as one surface.
 *
 * Left-aligned to the input rather than to the window, because the command zone
 * now sits after the keymap and the position: a list anchored to the far left
 * would point at the keymap badge instead of at the text it is completing.
 */
function anchorList() {
  const bar = host && host.closest ? host.closest('.bj-strip') : null;
  if (!bar || !listEl) return;
  const rect = bar.getBoundingClientRect();
  listEl.style.bottom = Math.max(0, Math.round(window.innerHeight - rect.top)) + 'px';

  // The command zone when the line is open — the whole zone, so the box lines up
  // with the `:` and not with the first letter after it. Otherwise the echoed
  // chord, which is what a key hint is about: the popup should grow out of the
  // `C-x` you can see.
  // ⛔ `activeInput()` is not the test: our input exists from boot and is 0×0
  // while hidden, which silently anchored everything to the far left.
  const zone = host.parentNode && host.parentNode.getBoundingClientRect ? host.parentNode : null;
  const field = (open || exInput ? zone : null)
    || bar.querySelector('.bj-strip__seg--command')
    || zone;
  const from = field && field.getBoundingClientRect ? field.getBoundingClientRect() : null;
  const pad = 6;
  let left = from && from.width ? from.left : rect.left + pad;
  const width = listEl.offsetWidth || 0;
  // Never let it run off the right edge; never push it past the left one either.
  left = Math.min(left, Math.max(pad, window.innerWidth - width - pad));
  listEl.style.left = Math.max(pad, Math.round(left)) + 'px';
}

/** Our own input, or Vim's when it owns the line. */
function activeInput() {
  return exInput || input;
}

function listOpen() {
  return !!listEl && !listEl.hidden && items.length > 0;
}

function syncActiveDescendant() {
  const el = activeInput();
  if (!el || !listEl) return;
  if (active < 0 || listEl.hidden) {
    el.removeAttribute('aria-activedescendant');
    return;
  }
  el.setAttribute('aria-activedescendant', 'bj-cmdline-opt-' + active);
}

function bindListListeners() {
  if (listListeners || typeof window === 'undefined') return;
  listListeners = true;
  window.addEventListener('resize', anchorList);
  window.addEventListener('scroll', anchorList, { passive: true, capture: true });
}

function unbindListListeners() {
  if (!listListeners || typeof window === 'undefined') return;
  listListeners = false;
  window.removeEventListener('resize', anchorList);
  window.removeEventListener('scroll', anchorList, { capture: true });
}

/**
 * Keep the highlighted row inside the scrollport.
 *
 * The list is capped by `max-height` and scrolls; without this, arrowing past
 * the last visible row moved a selection you could no longer see.
 */
function scrollRowIntoView(row) {
  if (!row || !listEl) return;
  // The list is padded, and `offsetTop` counts that padding. Ignoring it left
  // the first row flush against the top edge with the padding scrolled away —
  // wrapping to the top looked like the list had shifted rather than reset.
  const top = row.offsetTop - listPad.top;
  const bottom = row.offsetTop + row.offsetHeight + listPad.bottom;
  if (top < listEl.scrollTop) listEl.scrollTop = Math.max(0, top);
  else if (bottom > listEl.scrollTop + listEl.clientHeight) {
    listEl.scrollTop = bottom - listEl.clientHeight;
  }
}

/**
 * Move the highlight WITHOUT rebuilding the rows — rebuilding reset `scrollTop`
 * on every arrow key, which is the other half of why the selection could leave
 * the visible area.
 */
function paintActive() {
  if (!listEl) return;
  for (const row of listEl.children) {
    if (!row.dataset || row.dataset.index == null) continue;
    const on = Number(row.dataset.index) === active;
    row.classList.toggle('is-active', on);
    row.setAttribute('aria-selected', on ? 'true' : 'false');
    if (on) scrollRowIntoView(row);
  }
  syncActiveDescendant();
}

function hideList() {
  forced = false;
  if (!listEl) return;
  listEl.replaceChildren();
  listEl.hidden = true;
  listEl.scrollTop = 0;
  unbindListListeners();
  syncActiveDescendant();
}

/**
 * The whole visibility rule, in one place:
 *
 *   search mode         never offers commands — it matches text, it does not name one
 *   nothing typed       offers nothing; a line that opens full of every command is noise
 *   typed, no matches   says so once, quietly — you should not press Enter to find out
 *   typed, matches      the ranked list, all of it, scrolling
 *
 * …unless it was ASKED for. `forced` is the autocomplete chord: on an empty line
 * "show me everything" is a real request, and refusing it because nothing is
 * typed yet is the one case where the noise rule gets it backwards.
 */
function renderList() {
  if (!listEl) return;
  if (searchDir || (!query.trim() && !forced && !hinting)) { hideList(); return; }
  listEl.replaceChildren();
  listEl.hidden = false;
  listEl.scrollTop = 0;
  bindListListeners();

  if (!items.length) {
    const none = document.createElement('div');
    none.className = 'bj-cmdline__none';
    none.textContent = 'No matching command';
    listEl.appendChild(none);
    anchorList();
    syncActiveDescendant();
    return;
  }

  // Measured with the stylesheet's own ceiling in force, not last render's.
  listEl.style.maxHeight = '';
  const cs = typeof getComputedStyle === 'function' ? getComputedStyle(listEl) : null;
  listPad = {
    top: cs ? parseFloat(cs.paddingTop) || 0 : 0,
    bottom: cs ? parseFloat(cs.paddingBottom) || 0 : 0,
  };
  const cap = cs ? parseFloat(cs.maxHeight) || 0 : 0;

  items.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'bj-cmdline__item';
    row.id = 'bj-cmdline-opt-' + i;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', 'false');
    row.dataset.index = String(i);
    const name = document.createElement('span');
    name.className = 'bj-cmdline__item-name';
    name.textContent = it.value;
    row.appendChild(name);
    if (it.label && it.label !== it.value) {
      const label = document.createElement('span');
      label.className = 'bj-cmdline__item-label';
      label.textContent = it.label;
      row.appendChild(label);
    }
    row.addEventListener('pointerdown', (e) => e.preventDefault());
    // A key hint is a legend, not a menu: there is no line to complete into.
    if (!hinting) row.addEventListener('click', () => { chosen = true; accept(i); });
    else row.classList.add('is-legend');
    listEl.appendChild(row);
  });
  fitWholeRows(cap);
  anchorList();
  paintActive();
}

/**
 * Incremental search: every keystroke moves to the live match, and abort puts
 * the caret and the viewport back exactly where they were. This is the part of
 * Emacs `C-s` that a "find panel" cannot imitate.
 */
function searchStep(fromCaret, forward) {
  const ed = global.CurrentEditor;
  if (!ed || typeof ed.searchFrom !== 'function') return;
  const hit = ed.searchFrom(input.value, fromCaret, forward);
  countEl.textContent = input.value
    ? (hit ? hit.index + '/' + hit.total : 'no match')
    : '';
  countEl.classList.toggle('is-empty', !!input.value && !hit);
  if (!hit) return;
  searchAnchor = hit.from;
  const view = typeof ed.getView === 'function' ? ed.getView() : null;
  if (!view) return;
  // Selecting the match lights up every other one through the editor's existing
  // selection-match highlighting — no second highlighting mechanism.
  view.dispatch({ selection: { anchor: hit.from, head: hit.to }, scrollIntoView: true });
}

/**
 * Re-rank from `el`. Nothing is highlighted until the user picks something: a
 * highlight that Enter would ignore is a lie about what Enter does.
 */
function completeInto(el) {
  const caret = el.selectionStart == null ? el.value.length : el.selectionStart;
  const res = complete(el.value, caret, commandSources());
  query = el.value;
  items = res.items.slice(0, LIST_CAP);
  active = -1;
  chosen = false;
  return res;
}

/**
 * Say that a name matches nothing while it is still being typed, rather than
 * after Enter. A line address (`:42`) is not a name and is never unknown.
 */
function markUnknown() {
  if (!input) return;
  const typed = query.trim();
  input.classList.toggle('is-unknown', !!typed && !items.length && !/^\d/.test(typed));
}

/**
 * Show the candidates for what is on the line, even if that is nothing yet.
 *
 * Bound to whatever runs `edit.autocomplete`, so it is the same key here as in
 * the editor — the line is a place you type, and the key that offers help while
 * typing should not stop working because the text box moved.
 */
export function forceList() {
  const el = activeInput();
  if (!el || searchDir) return false;
  forced = true;
  hinting = false;
  if (el === exInput) refreshEx(); else refresh();
  return true;
}

/** Pure: is this keydown the autocomplete chord? */
function isForceKey(e) {
  const K = (typeof window !== 'undefined' ? window : globalThis).Keybindings;
  if (K && typeof K.matchesId === 'function') return K.matchesId(e, 'edit.autocomplete');
  return e.ctrlKey && (e.key === ' ' || e.code === 'Space');
}

function refresh() {
  if (!open) return;
  if (searchDir) {
    searchStep(searchDir === '/' ? searchAnchor - 1 : searchAnchor, searchDir === '/');
    query = '';
    items = [];
    active = -1;
    hideList();
    return;
  }
  const res = completeInto(input);
  previewLine(res.parsed);
  ghostEl.textContent = res.ghost ? input.value + res.ghost : '';
  markUnknown();
  renderList();
}

function accept(index) {
  const el = activeInput();
  const it = items[index == null ? Math.max(active, 0) : index];
  if (!it || !el) return false;
  const caret = el.selectionStart == null ? el.value.length : el.selectionStart;
  const next = applyCompletion(el.value, caret, it.value);
  el.value = next.text;
  el.setSelectionRange(next.caret, next.caret);
  resetCycle();
  if (el === exInput) refreshEx(); else refresh();
  return true;
}

// ── Tab cycling: Vim's wildmenu ──────────────────────────────────────────────
// The first Tab puts the top candidate on the line; each further Tab replaces it
// with the next. The candidate set is frozen when cycling starts, so the list
// does not re-rank under the insertion and Tab keeps walking the same options.
let wildStem = null;
let wildAt = -1;
let wildItems = [];

function resetCycle() {
  wildStem = null;
  wildAt = -1;
  wildItems = [];
}

function tabCycle(back) {
  const el = activeInput();
  if (!el) return false;
  if (wildStem == null) {
    if (!items.length) return false;
    const caret = el.selectionStart == null ? el.value.length : el.selectionStart;
    const token = tokenAtCaret(parseCommandLine(el.value, caret));
    wildStem = { from: token.from, to: token.to };
    wildItems = items.slice();
    wildAt = back ? wildItems.length - 1 : 0;
  } else {
    wildAt = (wildAt + (back ? -1 : 1) + wildItems.length) % wildItems.length;
  }
  const it = wildItems[wildAt];
  if (!it) { resetCycle(); return false; }
  const caretAt = wildStem.from + it.value.length;
  el.value = el.value.slice(0, wildStem.from) + it.value + el.value.slice(wildStem.to);
  el.setSelectionRange(caretAt, caretAt);
  // The stem's end moves with each replacement, or the next Tab would splice the
  // new value into the middle of the last one.
  wildStem = { from: wildStem.from, to: caretAt };
  active = items.indexOf(it);
  chosen = true;
  if (ghostEl && el === input) ghostEl.textContent = '';
  paintActive();
  return true;
}

/** Move the highlight. False when there is nothing to move through. */
function step(delta) {
  if (!items.length) return false;
  const from = active < 0 ? (delta > 0 ? -1 : 0) : active;
  active = (from + delta + items.length * 2) % items.length;
  chosen = true;
  resetCycle();
  paintActive();
  return true;
}

/**
 * Vim's `:` line, given BelJar's suggestions.
 *
 * ⛔ The package keeps its own input — that seam is why `:%s/a/b/g` and `:g/…`
 * work at all — so the completion list is layered ON TOP of that input rather
 * than replacing it.
 */
let exInput = null;
let exOnInput = null;
let exOnKeydown = null;
let exOnBlur = null;

function refreshEx() {
  if (!exInput) return;
  // The package can tear its input out without telling us, and a list anchored
  // to a field that no longer exists is the suggestion that will not go away.
  if (!exInput.isConnected) { detachExCompletion(); return; }
  completeInto(exInput);
  renderList();
}

export function attachExCompletion(el) {
  if (!el) return false;
  if (exInput === el) { refreshEx(); return true; }
  detachExCompletion();
  exInput = el;
  exOnInput = () => { resetCycle(); refreshEx(); };
  // ⛔ ↑/↓ stay Vim's: they are its ex history, and taking them would cost a real
  // Vim feature to duplicate one Tab already provides.
  exOnKeydown = (e) => {
    if (isForceKey(e)) {
      e.preventDefault();
      e.stopPropagation();
      forceList();
      return;
    }
    if (e.altKey || e.metaKey) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      tabCycle(e.shiftKey);
      return;
    }
    if (e.ctrlKey && LIST_STEP[e.key] !== undefined) {
      if (!step(LIST_STEP[e.key])) return;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Enter runs whatever is ON the line, so a picked candidate goes there
    // first — otherwise choosing one and pressing Enter runs the typed stem.
    if (e.key === 'Enter' && chosen && active >= 0) {
      accept();
      hideList();
      return;
    }
    if (e.key === 'Escape') { hideList(); return; }
    if (!listOpen()) return;
    if (e.key === 'PageDown' || e.key === 'PageUp') {
      if (!step(e.key === 'PageDown' ? PAGE : -PAGE)) return;
      e.preventDefault();
      e.stopPropagation();
    }
  };
  exOnBlur = () => hideList();
  el.addEventListener('input', exOnInput);
  el.addEventListener('keydown', exOnKeydown, true);
  el.addEventListener('blur', exOnBlur);
  refreshEx();
  return true;
}

export function detachExCompletion() {
  if (!exInput) return false;
  exInput.removeEventListener('input', exOnInput);
  exInput.removeEventListener('keydown', exOnKeydown, true);
  exInput.removeEventListener('blur', exOnBlur);
  exInput = null;
  exOnInput = null;
  exOnKeydown = null;
  exOnBlur = null;
  items = [];
  active = -1;
  query = '';
  chosen = false;
  resetCycle();
  hideList();
  return true;
}

function recall(delta) {
  loadHistory();
  if (!history.length) return;
  historyAt = Math.max(-1, Math.min(history.length - 1, historyAt + delta));
  input.value = historyAt < 0 ? '' : history[historyAt];
  input.setSelectionRange(input.value.length, input.value.length);
  resetCycle();
  refresh();
}

function onKey(e) {
  // Escape and `C-g` both abort — the second is what an Emacs user reaches for,
  // and `M-x` opens this very line.
  if (e.key === 'Escape' || (e.ctrlKey && e.key === 'g')) {
    e.preventDefault();
    close({ restore: true });
    return;
  }
  if (searchDir) {
    if (e.key === 'Enter') { e.preventDefault(); savedSelection = null; savedScroll = null; close({ restore: false }); return; }
    // C-s / C-r step, matching Emacs; the arrows do the same for everyone else.
    const fwd = (e.ctrlKey && e.key === 's') || e.key === 'ArrowDown';
    const back = (e.ctrlKey && e.key === 'r') || e.key === 'ArrowUp';
    if (fwd || back) {
      e.preventDefault();
      searchStep(fwd ? searchAnchor : searchAnchor, fwd);
      return;
    }
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    // Run what is on the line, so a picked candidate goes there first.
    if (chosen && active >= 0) accept();
    submit();
    return;
  }
  if (isForceKey(e)) { e.preventDefault(); forceList(); return; }
  if (e.key === 'Tab') { e.preventDefault(); tabCycle(e.shiftKey); return; }
  if (e.ctrlKey && LIST_STEP[e.key] !== undefined) {
    if (step(LIST_STEP[e.key])) e.preventDefault();
    return;
  }
  if (listOpen() && (e.key === 'PageDown' || e.key === 'PageUp')) {
    e.preventDefault();
    step(e.key === 'PageDown' ? PAGE : -PAGE);
    return;
  }
  // An empty line means "show me what I ran before"; anything typed means
  // "walk the candidates".
  if (e.key === 'ArrowDown') { e.preventDefault(); if (input.value) step(1); else recall(-1); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); if (input.value) step(-1); else recall(1); return; }
  if (e.key === 'ArrowRight' && input.selectionStart === input.value.length && ghostEl.textContent) {
    e.preventDefault();
    accept(0);
  }
}

export function build(fieldParent, listParent) {
  host = document.createElement('div');
  host.className = 'bj-cmdline';
  host.hidden = true;

  listEl = document.createElement('div');
  listEl.className = 'bj-cmdline__list';
  listEl.setAttribute('role', 'listbox');
  listEl.hidden = true;

  const field = document.createElement('div');
  field.className = 'bj-cmdline__field';
  const prompt = document.createElement('span');
  prompt.className = 'bj-cmdline__prompt';
  prompt.textContent = ':';
  promptEl = prompt;
  countEl = document.createElement('span');
  countEl.className = 'bj-cmdline__count';
  ghostEl = document.createElement('span');
  ghostEl.className = 'bj-cmdline__ghost';
  ghostEl.setAttribute('aria-hidden', 'true');
  input = document.createElement('input');
  input.type = 'text';
  input.className = 'bj-cmdline__input';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Command line');
  input.addEventListener('input', () => { historyAt = -1; resetCycle(); refresh(); });
  input.addEventListener('keydown', onKey);
  input.addEventListener('blur', () => {
    if (open) close({ restore: blurRestoreOnClose(!!searchDir) });
  });

  const wrap = document.createElement('span');
  wrap.className = 'bj-cmdline__inputwrap';
  wrap.append(ghostEl, input);
  field.append(prompt, wrap, countEl);
  host.append(field);
  fieldParent.appendChild(host);
  // The popup hangs off the STRIP, not off the input row: it must not be
  // clipped by the row's overflow, and it is positioned against the strip's top
  // edge regardless of where in the row the field happens to sit.
  (listParent || fieldParent).appendChild(listEl);
  return host;
}

export function isOpen() {
  return open;
}

/** `/` forward, `?` backward — the search face of the same line. */
export function openSearch(forward, onClose) {
  if (!openLine('', onClose)) return false;
  searchDir = forward === false ? '?' : '/';
  promptEl.textContent = searchDir;
  countEl.textContent = '';
  // Search offers no commands; whatever the command face left is not an answer
  // to what is being typed now.
  items = [];
  active = -1;
  query = '';
  hideList();
  const ed = global.CurrentEditor;
  const view = ed && typeof ed.getView === 'function' ? ed.getView() : null;
  searchAnchor = view ? view.state.selection.main.head : 0;
  return true;
}

export function openLine(prefix, onClose, opts) {
  if (!host) return false;
  onCloseCb = onClose || null;
  loadHistory();
  const ed = global.CurrentEditor;
  const view = ed && typeof ed.getView === 'function' ? ed.getView() : null;
  savedScroll = view && view.scrollDOM ? view.scrollDOM.scrollTop : null;
  savedSelection = view ? { anchor: view.state.selection.main.anchor, head: view.state.selection.main.head } : null;
  searchDir = '';
  // `M-x` is not `:`; the prompt says which line you are on.
  if (promptEl) promptEl.textContent = (opts && opts.prompt) || ':';
  if (countEl) countEl.textContent = '';
  hinting = false;
  forced = false;
  open = true;
  host.hidden = false;
  if (host.parentNode) host.parentNode.classList.add('is-line-open');
  input.value = prefix || '';
  resetCycle();
  refresh();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  return true;
}

export function close(opts) {
  // Clear the takeover class even when we were not open: an early return here
  // could leave the segment row hidden forever if the flag and the class ever
  // disagreed.
  if (host && host.parentNode) host.parentNode.classList.remove('is-line-open');
  if (!open) return;
  open = false;
  host.hidden = true;
  if (host.parentNode) host.parentNode.classList.remove('is-line-open');
  input.value = '';
  input.classList.remove('is-unknown');
  ghostEl.textContent = '';
  items = [];
  active = -1;
  chosen = false;
  query = '';
  resetCycle();
  hideList();
  if (countEl) countEl.textContent = '';
  const wasSearch = !!searchDir;
  searchDir = '';
  if (promptEl) promptEl.textContent = ':';
  if (wasSearch && savedSelection && (!opts || opts.restore !== false)) {
    const ed = global.CurrentEditor;
    const view = ed && typeof ed.getView === 'function' ? ed.getView() : null;
    if (view) view.dispatch({ selection: savedSelection });
  }
  savedSelection = null;
  restoreViewport();
  if (opts && opts.restore !== false) {
    const ed = global.CurrentEditor;
    if (ed && typeof ed.focus === 'function') ed.focus();
  }
  if (onCloseCb) onCloseCb();
}

/**
 * The last line that was submitted, or ''. This is `@:` — the one thing a
 * command line owes you once you have typed something long.
 */
export function lastEntry() {
  loadHistory();
  return history.length ? history[0] : '';
}

/**
 * `@:` — re-run the last line WITHOUT opening the line. It shares `runLine` with
 * the interactive path rather than driving the input element, so repeating is
 * the same act as submitting, minus the chrome.
 */
export function repeatLast() {
  const text = lastEntry();
  if (!text) {
    message('Nothing to repeat yet.');
    return false;
  }
  return runLine(text, () => {});
}

/**
 * Key hints in the same popup the command line completes into.
 *
 * ⛔ Which-key is not a message. It is a LIST of what can follow the key you are
 * holding, and the app already has a place for "here are your options": the box
 * above the strip. One surface, one set of manners — it scrolls, it is styled
 * like the editor's own completion, and it stays until the prefix resolves.
 */
export function showKeyHints(rows) {
  if (!listEl || open || exInput) return false;
  if (!rows || !rows.length) { hideKeyHints(); return false; }
  hinting = true;
  query = '';
  items = rows.map((r) => ({ value: r.key, label: r.title }));
  active = -1;
  chosen = false;
  renderList();
  return true;
}

export function hideKeyHints() {
  if (!hinting) return false;
  hinting = false;
  items = [];
  active = -1;
  query = '';
  hideList();
  return true;
}

/** History ring, exposed for tests. */
export function _history() {
  return history.slice();
}

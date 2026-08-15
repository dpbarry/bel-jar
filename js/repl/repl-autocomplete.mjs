'use strict';

import { suggestReplCompletions, replAcShouldOpen, DEFAULT_VERBS } from './repl-ac-suggest.mjs';
import { activeCwd, dirOf } from './repl-run-cmd.mjs';

const global = globalThis;

var inputEl = null;
var popupEl = null;
var listEl = null;
var mirrorEl = null;
var items = [];
var activeIndex = -1;
var replaceFrom = 0;
var typedToken = '';
var open = false;
var explicit = false;
var suppressRefresh = false;
var debounceTimer = null;
var repositionBound = false;
var alwaysNavBound = false;
var POPUP_GAP_PX = 4;
var VIEW_PAD_PX = 8;

function getInput() {
  if (inputEl && inputEl.isConnected) return inputEl;
  if (typeof ReplStream !== 'undefined' && ReplStream.getCommandInput) {
    inputEl = ReplStream.getCommandInput();
  }
  if (!inputEl) inputEl = document.getElementById('command-input');
  return inputEl;
}

function ensurePopup() {
  if (popupEl && popupEl.isConnected && listEl && listEl.isConnected) return popupEl;
  if (typeof document === 'undefined' || !document.body) return null;
  popupEl = document.createElement('div');
  popupEl.className = 'repl-ac';
  popupEl.hidden = true;
  listEl = document.createElement('ul');
  listEl.className = 'repl-ac-list';
  listEl.setAttribute('role', 'listbox');
  listEl.setAttribute('aria-label', 'Command completions');
  popupEl.appendChild(listEl);
  document.body.appendChild(popupEl);
  return popupEl;
}

function ensureMirror() {
  if (mirrorEl && mirrorEl.isConnected) return mirrorEl;
  if (typeof document === 'undefined' || !document.body) return null;
  mirrorEl = document.createElement('div');
  mirrorEl.setAttribute('aria-hidden', 'true');
  mirrorEl.style.cssText =
    'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;' +
    'pointer-events:none;height:auto;width:auto;';
  document.body.appendChild(mirrorEl);
  return mirrorEl;
}

function tokenAnchor(input, tokenFrom) {
  var rect = input.getBoundingClientRect();
  if (!rect || rect.width < 1 || rect.height < 1) return null;
  var cs = window.getComputedStyle(input);
  var padL = parseFloat(cs.paddingLeft) || 0;
  var borderL = parseFloat(cs.borderLeftWidth) || 0;
  var mirror = ensureMirror();
  var xInInput = padL + borderL;

  if (mirror) {
    mirror.style.font = cs.font;
    mirror.style.fontSize = cs.fontSize;
    mirror.style.fontFamily = cs.fontFamily;
    mirror.style.fontWeight = cs.fontWeight;
    mirror.style.fontStyle = cs.fontStyle;
    mirror.style.letterSpacing = cs.letterSpacing;
    mirror.style.textTransform = cs.textTransform;
    mirror.style.wordSpacing = cs.wordSpacing;
    mirror.style.fontVariantLigatures = cs.fontVariantLigatures;
    mirror.style.fontFeatureSettings = cs.fontFeatureSettings;
    mirror.textContent = String(input.value || '').slice(0, Math.max(0, tokenFrom));
    xInInput += mirror.offsetWidth;
  }

  return {
    left: rect.left + xInInput - (input.scrollLeft || 0),
    top: rect.top,
    bottom: rect.bottom,
  };
}

function positionPopup() {
  if (!popupEl || popupEl.hidden || !open || !listEl) return;
  var input = getInput();
  if (!input) return;

  var anchor = tokenAnchor(input, replaceFrom);
  if (!anchor) return;

  listEl.style.maxHeight = '';
  var popW = popupEl.offsetWidth || 0;
  var popH = popupEl.offsetHeight || 0;
  if (popH < 1) return;

  var roomBelow = window.innerHeight - anchor.bottom - VIEW_PAD_PX;
  var roomAbove = anchor.top - VIEW_PAD_PX;
  var placeBelow = roomBelow >= popH + POPUP_GAP_PX || roomBelow >= roomAbove;

  var avail = placeBelow ? roomBelow : roomAbove;
  if (avail > 0 && popH > avail - POPUP_GAP_PX) {
    listEl.style.maxHeight = Math.max(48, avail - POPUP_GAP_PX) + 'px';
    popH = popupEl.offsetHeight || popH;
  }

  var maxLeft = window.innerWidth - VIEW_PAD_PX - popW;
  var left = Math.max(VIEW_PAD_PX, Math.min(anchor.left, maxLeft));
  var top = placeBelow
    ? anchor.bottom + POPUP_GAP_PX
    : anchor.top - popH - POPUP_GAP_PX;
  if (top < VIEW_PAD_PX) top = VIEW_PAD_PX;
  if (top + popH > window.innerHeight - VIEW_PAD_PX) {
    top = Math.max(VIEW_PAD_PX, window.innerHeight - VIEW_PAD_PX - popH);
  }

  popupEl.style.left = left + 'px';
  popupEl.style.top = top + 'px';
}

function onReposition() {
  if (open) positionPopup();
}

function bindReposition(on) {
  var output = document.getElementById('output');
  if (on && !repositionBound) {
    repositionBound = true;
    window.addEventListener('resize', onReposition);
    if (output) output.addEventListener('scroll', onReposition, { passive: true });
  } else if (!on && repositionBound) {
    repositionBound = false;
    window.removeEventListener('resize', onReposition);
    if (output) output.removeEventListener('scroll', onReposition);
  }
}

function persistApi() {
  return typeof Persist !== 'undefined' ? Persist : null;
}

function autocompleteTrigger() {
  var p = persistApi();
  var v = p && p.readStoredReplAutocompleteTrigger ? p.readStoredReplAutocompleteTrigger() : null;
  return v === 'none' || v === 'always' ? v : 'typing';
}

function autocompleteContinue() {
  var p = persistApi();
  return !!(p && p.readStoredReplAutocompleteContinue && p.readStoredReplAutocompleteContinue());
}

function caretPos(input) {
  if (!input) return 0;
  try {
    var n = input.selectionStart;
    if (typeof n === 'number') return n;
  } catch (_) {}
  return String(input.value || '').length;
}

function isAutocompleteToggle(e) {
  var KB = typeof Keybindings !== 'undefined' ? Keybindings : null;
  if (KB && typeof KB.matchesId === 'function' && KB.has && KB.has('edit.autocomplete')) {
    return KB.matchesId(e, 'edit.autocomplete');
  }
  return !!(e && e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
    && (e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space'));
}

function listFiles() {
  return typeof Persist !== 'undefined' && Persist.listFiles ? Persist.listFiles() || [] : [];
}

function currentCwd() {
  var files = listFiles();
  var id = typeof Persist !== 'undefined' && Persist.getActiveFileId
    ? Persist.getActiveFileId()
    : null;
  if (typeof activeCwd === 'function') return activeCwd(files, id);
  if (!id) return '';
  for (var i = 0; i < files.length; i++) {
    if (files[i].id === id) return dirOf(files[i].name);
  }
  return '';
}

function listVerbs() {
  if (typeof ReplOutput !== 'undefined' && typeof ReplOutput.listReplVerbs === 'function') {
    return ReplOutput.listReplVerbs();
  }
  return DEFAULT_VERBS.slice();
}

function hide() {
  open = false;
  explicit = false;
  items = [];
  activeIndex = -1;
  typedToken = '';
  bindReposition(false);
  if (popupEl) {
    popupEl.hidden = true;
    popupEl.style.visibility = '';
    popupEl.style.left = '';
    popupEl.style.top = '';
  }
  if (listEl) {
    listEl.textContent = '';
    listEl.style.maxHeight = '';
  }
}

function isOpen() {
  return open && items.length > 0;
}

function scrollActiveIntoView(li) {
  if (!listEl || !li) return;
  var top = li.offsetTop;
  var bottom = top + li.offsetHeight;
  var viewTop = listEl.scrollTop;
  var viewBottom = viewTop + listEl.clientHeight;
  if (top < viewTop) listEl.scrollTop = top;
  else if (bottom > viewBottom) listEl.scrollTop = bottom - listEl.clientHeight;
}

function setActive(idx) {
  if (!listEl || !items.length) return;
  activeIndex = Math.max(0, Math.min(items.length - 1, idx));
  var kids = listEl.children;
  for (var i = 0; i < kids.length; i++) {
    if (i === activeIndex) kids[i].setAttribute('aria-selected', 'true');
    else kids[i].removeAttribute('aria-selected');
  }
  scrollActiveIntoView(kids[activeIndex]);
}

function accept(idx) {
  var input = getInput();
  if (!input || idx < 0 || idx >= items.length) return false;
  var item = items[idx];
  var val = String(input.value || '');
  var next = val.slice(0, replaceFrom) + item.insert;
  input.value = next;
  input.focus();
  try {
    input.setSelectionRange(next.length, next.length);
  } catch (_) {}
  hide();
  if (typeof ReplCommands !== 'undefined' && ReplCommands.resetHistoryIndex) {
    ReplCommands.resetHistoryIndex();
  }
  if (autocompleteContinue()) refresh();
  else suppressRefresh = true;
  return true;
}

function fillItem(li, item, token) {
  var text = String(item.label || '');
  var t = String(token || '');
  if (t && text.toLowerCase().indexOf(t.toLowerCase()) === 0) {
    var match = document.createElement('span');
    match.className = 'repl-ac-matched';
    match.textContent = text.slice(0, t.length);
    li.appendChild(match);
    if (t.length < text.length) {
      li.appendChild(document.createTextNode(text.slice(t.length)));
    }
  } else {
    li.appendChild(document.createTextNode(text));
  }
  if (item.detail) {
    var detail = document.createElement('span');
    detail.className = 'repl-ac-detail';
    detail.textContent = item.detail;
    li.appendChild(detail);
  }
}

function render(result) {
  var popup = ensurePopup();
  if (!popup || !listEl) return;
  if (!result || !result.items || !result.items.length) {
    hide();
    return;
  }
  items = result.items;
  replaceFrom = result.replaceFrom || 0;
  typedToken = result.token || '';
  activeIndex = 0;
  open = true;
  listEl.textContent = '';

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var li = document.createElement('li');
    li.className = 'repl-ac-item';
    li.setAttribute('role', 'option');
    li.dataset.index = String(i);
    fillItem(li, it, typedToken);
    li.addEventListener('mousedown', function (e) {
      e.preventDefault();
      accept(parseInt(e.currentTarget.dataset.index, 10));
    });
    listEl.appendChild(li);
  }

  popup.hidden = false;
  popup.style.visibility = 'hidden';
  setActive(0);
  positionPopup();
  popup.style.visibility = '';
  bindReposition(true);
  requestAnimationFrame(positionPopup);
}

function compute() {
  var input = getInput();
  if (!input) return null;
  return suggestReplCompletions({
    line: input.value || '',
    files: listFiles(),
    cwd: currentCwd(),
    verbs: listVerbs(),
  });
}

function refresh(opts) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(function () {
    debounceTimer = null;
    var forceExplicit = !!(opts && opts.explicit);
    if (forceExplicit) explicit = true;
    var input = getInput();
    if (!input) {
      hide();
      return;
    }
    if (!replAcShouldOpen({
      line: input.value || '',
      pos: caretPos(input),
      trigger: autocompleteTrigger(),
      explicit: explicit,
    })) {
      explicit = false;
      hide();
      return;
    }
    explicit = false;
    render(compute());
  }, 20);
}

function toggleExplicit() {
  if (isOpen()) {
    hide();
    return true;
  }
  refresh({ explicit: true });
  return true;
}

function onKeyDown(e) {
  if (!e) return false;
  if (isAutocompleteToggle(e)) {
    toggleExplicit();
    return true;
  }
  if (!isOpen()) return false;
  if (e.key === 'ArrowDown') {
    setActive(activeIndex + 1);
    return true;
  }
  if (e.key === 'ArrowUp') {
    setActive(activeIndex - 1);
    return true;
  }
  if (e.key === 'Escape') {
    hide();
    return true;
  }
  if (e.key === 'Tab') {
    accept(activeIndex);
    return true;
  }
  if (e.key === 'Enter') {
    accept(activeIndex);
    return false;
  }
  return false;
}

function onInput() {
  if (suppressRefresh) {
    suppressRefresh = false;
    if (!autocompleteContinue()) return;
  }
  refresh();
}

function bind(input) {
  inputEl = input || getInput();
  ensurePopup();
  hide();
  if (!inputEl || alwaysNavBound) return;
  alwaysNavBound = true;
  inputEl.addEventListener('keyup', function (e) {
    if (e && (e.ctrlKey || e.metaKey || e.altKey || isAutocompleteToggle(e))) return;
    if (autocompleteTrigger() === 'always') refresh();
  });
  inputEl.addEventListener('click', function () {
    if (autocompleteTrigger() === 'always') refresh();
  });
}

var api = {
  bind: bind,
  refresh: refresh,
  onInput: onInput,
  hide: hide,
  isOpen: isOpen,
  toggleExplicit: toggleExplicit,
  onKeyDown: onKeyDown,
  _compute: compute,
  _suggest: suggestReplCompletions,
};

global.ReplAutocomplete = api;
global.BelJarReplAutocomplete = api;

export {
  bind,
  refresh,
  onInput,
  hide,
  isOpen,
  toggleExplicit,
  onKeyDown,
  suggestReplCompletions,
};

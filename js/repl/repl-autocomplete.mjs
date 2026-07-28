'use strict';

/**
 * REPL autocomplete popup — provider-driven, hsearch-ac look (not CodeMirror).
 */

import { suggestReplCompletions, DEFAULT_VERBS } from './repl-ac-suggest.mjs';
import { activeCwd, dirOf } from './repl-run-cmd.mjs';

const global = globalThis;

var inputEl = null;
var popupEl = null;
var items = [];
var activeIndex = -1;
var replaceFrom = 0;
var open = false;
var debounceTimer = null;
var marqueeTimer = null;
var marqueeRaf = null;
var repositionBound = false;
var MARQUEE_PX_PER_SEC = 36;
var MARQUEE_PAUSE_MS = 700;
var POPUP_GAP_PX = 6;

function getInput() {
  if (inputEl && inputEl.isConnected) return inputEl;
  if (typeof ReplStream !== 'undefined' && ReplStream.getCommandInput) {
    inputEl = ReplStream.getCommandInput();
  }
  if (!inputEl) inputEl = document.getElementById('command-input');
  return inputEl;
}

function getLiveLine() {
  if (typeof ReplStream !== 'undefined' && ReplStream.getLiveLine) {
    var live = ReplStream.getLiveLine();
    if (live && live.isConnected) return live;
  }
  var output = document.getElementById('output');
  return output ? output.querySelector('.repl-live') : null;
}

function ensurePopup() {
  if (popupEl && popupEl.isConnected) return popupEl;
  if (typeof document === 'undefined' || !document.body) return null;
  popupEl = document.createElement('div');
  popupEl.className = 'repl-ac';
  popupEl.hidden = true;
  popupEl.setAttribute('role', 'listbox');
  popupEl.setAttribute('aria-label', 'Command completions');
  document.body.appendChild(popupEl);
  return popupEl;
}

function positionPopup() {
  if (!popupEl || popupEl.hidden || !open) return;
  var anchor = getLiveLine() || getInput();
  if (!anchor) return;
  var rect = anchor.getBoundingClientRect();
  var roomAbove = Math.max(72, rect.top - 8);
  var maxH = Math.min(12 * 16, roomAbove);
  popupEl.style.left = Math.max(8, rect.left) + 'px';
  popupEl.style.width = Math.max(12 * 16, rect.width) + 'px';
  popupEl.style.maxHeight = maxH + 'px';
  popupEl.style.top = 'auto';
  popupEl.style.bottom = (window.innerHeight - rect.top + POPUP_GAP_PX) + 'px';
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

function stopMarquee() {
  if (marqueeTimer) {
    clearTimeout(marqueeTimer);
    marqueeTimer = null;
  }
  if (marqueeRaf) {
    cancelAnimationFrame(marqueeRaf);
    marqueeRaf = null;
  }
  if (!popupEl) return;
  var scrolls = popupEl.querySelectorAll('.repl-ac-name-scroll');
  for (var i = 0; i < scrolls.length; i++) {
    scrolls[i].style.transform = '';
    scrolls[i].classList.remove('is-marquee');
  }
}

function startMarqueeOn(nameEl) {
  stopMarquee();
  if (!nameEl) return;
  var scroll = nameEl.querySelector('.repl-ac-name-scroll');
  if (!scroll) return;
  var overflow = scroll.scrollWidth - nameEl.clientWidth;
  if (overflow <= 1) return;

  scroll.classList.add('is-marquee');
  var pos = 0;
  var dir = 1;
  var last = performance.now();
  var pausing = true;

  function tick(now) {
    marqueeRaf = null;
    if (!scroll.isConnected || !nameEl.closest('.repl-ac-item.is-active')) {
      stopMarquee();
      return;
    }
    var dt = Math.min(48, now - last);
    last = now;
    if (pausing) {
      marqueeRaf = requestAnimationFrame(tick);
      return;
    }
    pos += dir * (MARQUEE_PX_PER_SEC * dt) / 1000;
    if (pos >= overflow) {
      pos = overflow;
      dir = -1;
      pausing = true;
      marqueeTimer = setTimeout(function () {
        marqueeTimer = null;
        pausing = false;
        last = performance.now();
        marqueeRaf = requestAnimationFrame(tick);
      }, MARQUEE_PAUSE_MS);
      scroll.style.transform = 'translateX(' + (-pos) + 'px)';
      return;
    }
    if (pos <= 0) {
      pos = 0;
      dir = 1;
      pausing = true;
      marqueeTimer = setTimeout(function () {
        marqueeTimer = null;
        pausing = false;
        last = performance.now();
        marqueeRaf = requestAnimationFrame(tick);
      }, MARQUEE_PAUSE_MS);
      scroll.style.transform = 'translateX(0)';
      return;
    }
    scroll.style.transform = 'translateX(' + (-pos) + 'px)';
    marqueeRaf = requestAnimationFrame(tick);
  }

  marqueeTimer = setTimeout(function () {
    marqueeTimer = null;
    pausing = false;
    last = performance.now();
    marqueeRaf = requestAnimationFrame(tick);
  }, MARQUEE_PAUSE_MS);
}

function hide() {
  stopMarquee();
  open = false;
  items = [];
  activeIndex = -1;
  bindReposition(false);
  if (popupEl) {
    popupEl.hidden = true;
    popupEl.textContent = '';
    popupEl.style.left = '';
    popupEl.style.width = '';
    popupEl.style.maxHeight = '';
    popupEl.style.top = '';
    popupEl.style.bottom = '';
  }
}

function isOpen() {
  return open && items.length > 0;
}

function setActive(idx) {
  if (!popupEl || !items.length) return;
  stopMarquee();
  activeIndex = Math.max(0, Math.min(items.length - 1, idx));
  var kids = popupEl.querySelectorAll('.repl-ac-item');
  for (var i = 0; i < kids.length; i++) {
    kids[i].classList.toggle('is-active', i === activeIndex);
    if (i === activeIndex) kids[i].setAttribute('aria-selected', 'true');
    else kids[i].removeAttribute('aria-selected');
  }
  var active = kids[activeIndex];
  if (active && active.scrollIntoView) {
    active.scrollIntoView({ block: 'nearest' });
  }
  if (active) {
    var nameEl = active.querySelector('.repl-ac-name');
    // Next frame so layout reflects selection styles / width.
    requestAnimationFrame(function () {
      startMarqueeOn(nameEl);
    });
  }
}

function accept(idx) {
  var input = getInput();
  if (!input || idx < 0 || idx >= items.length) return false;
  var item = items[idx];
  var val = String(input.value || '');
  var before = val.slice(0, replaceFrom);
  var next = before + item.insert;
  input.value = next;
  input.focus();
  try {
    var pos = next.length;
    input.setSelectionRange(pos, pos);
  } catch (_) {}
  hide();
  if (typeof ReplCommands !== 'undefined' && ReplCommands.resetHistoryIndex) {
    ReplCommands.resetHistoryIndex();
  }
  return true;
}

function render(result) {
  var popup = ensurePopup();
  if (!popup) return;
  if (!result || !result.items || !result.items.length) {
    hide();
    return;
  }
  stopMarquee();
  items = result.items;
  replaceFrom = result.replaceFrom || 0;
  activeIndex = 0;
  open = true;
  popup.textContent = '';
  popup.hidden = false;
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'repl-ac-item';
    if (it.ext) btn.classList.add('repl-ac-item--' + it.ext);
    btn.setAttribute('role', 'option');
    btn.dataset.index = String(i);

    var head = document.createElement('div');
    head.className = 'repl-ac-head';
    var name = document.createElement('span');
    name.className = 'repl-ac-name';
    var scroll = document.createElement('span');
    scroll.className = 'repl-ac-name-scroll';
    scroll.textContent = it.label;
    name.appendChild(scroll);
    head.appendChild(name);
    btn.appendChild(head);
    btn.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var ix = parseInt(e.currentTarget.dataset.index, 10);
      accept(ix);
    });
    popup.appendChild(btn);
  }
  setActive(0);
  positionPopup();
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

function refresh() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(function () {
    debounceTimer = null;
    render(compute());
  }, 20);
}

function onKeyDown(e) {
  if (!e) return false;
  if (!isOpen()) {
    if (e.key === 'Tab') {
      var result = compute();
      if (result && result.items && result.items.length) {
        render(result);
        e.preventDefault();
        return true;
      }
    }
    return false;
  }
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
    return false; // let app submit the completed line
  }
  return false;
}

function bind(input) {
  inputEl = input || getInput();
  ensurePopup();
  hide();
}

var api = {
  bind: bind,
  refresh: refresh,
  hide: hide,
  isOpen: isOpen,
  onKeyDown: onKeyDown,
  // test / advanced
  _compute: compute,
  _suggest: suggestReplCompletions,
};

global.ReplAutocomplete = api;
global.BelJarReplAutocomplete = api;

export {
  bind,
  refresh,
  hide,
  isOpen,
  onKeyDown,
  suggestReplCompletions,
};

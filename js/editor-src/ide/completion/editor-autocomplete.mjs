import { Prec } from '@codemirror/state';
import { keymap, ViewPlugin, EditorView } from '@codemirror/view';
import { fuzzyScore } from './fuzzy.mjs';
import { renderTypeInto } from '../../format/type-render.mjs';
import { createCompletionController } from './source.mjs';
import { isQuietTypingActiveForView } from '../quiet-typing.mjs';
import { getEngine } from '../ide-actions.mjs';
import { vimAllowsRemap } from '../keymap-style.mjs';
import { listStepDelta } from './list-keys.mjs';

const POPUP_GAP_PX = 4;
const VIEW_PAD_PX = 8;

function persistApi() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  return g.Persist;
}

function autocompleteTrigger() {
  const p = persistApi();
  const v = p?.readStoredEditorAutocompleteTrigger?.();
  return v === 'none' || v === 'always' ? v : 'typing';
}

function autocompleteContinue() {
  return !!persistApi()?.readStoredEditorAutocompleteContinue?.();
}

/** Cursor at end of a token, before whitespace or EOF. */
function atTokenEndBeforeSpace(doc, pos) {
  if (pos <= 0 || pos > doc.length) return false;
  const before = doc.sliceString(pos - 1, pos);
  if (!before || /\s/.test(before)) return false;
  if (pos >= doc.length) return true;
  const after = doc.sliceString(pos, pos + 1);
  return after === ' ' || after === '\t' || after === '\n' || after === '\r';
}

/** True when the caret sits immediately after a non-whitespace character. */
function caretAfterNonWs(doc, pos) {
  return pos > 0 && !/\s/.test(doc.sliceString(pos - 1, pos));
}

/** Offset in `insert` just after the first `?` or `_` hole, else end. */
function caretAfterFirstHole(insert) {
  const s = String(insert || '');
  const q = s.indexOf('?');
  const u = s.indexOf('_');
  const i = q < 0 ? u : u < 0 ? q : Math.min(q, u);
  return i < 0 ? s.length : i + 1;
}

function fillItem(li, item, token) {
  const label = document.createElement('span');
  label.className = 'editor-ac-label';
  const text = String(item.label || '');
  const match = token ? fuzzyScore(token, text) : null;
  if (match?.positions.length) {
    let last = 0;
    for (const idx of match.positions) {
      if (idx > last) label.appendChild(document.createTextNode(text.slice(last, idx)));
      const span = document.createElement('span');
      span.className = 'editor-ac-matched';
      span.textContent = text[idx];
      label.appendChild(span);
      last = idx + 1;
    }
    if (last < text.length) label.appendChild(document.createTextNode(text.slice(last)));
  } else {
    label.appendChild(document.createTextNode(text));
  }
  li.appendChild(label);

  if (item.signature) {
    const sig = document.createElement('span');
    sig.className = 'editor-ac-signature';
    const prefix = document.createElement('span');
    prefix.className = 'editor-ac-signature-prefix';
    prefix.textContent = ':: ';
    sig.appendChild(prefix);
    const typeEl = document.createElement('span');
    typeEl.className = 'editor-ac-signature-type';
    renderTypeInto(typeEl, item.signature, item.signatureKind);
    sig.appendChild(typeEl);
    li.appendChild(sig);
  } else if (item.detail) {
    const detail = document.createElement('span');
    detail.className = 'editor-ac-detail';
    detail.textContent = item.detail;
    li.appendChild(detail);
  }
}

/** Screen coords for a document position, or null if the view cannot measure it. */
export function coordsAtPosSafe(view, pos, side = 1) {
  const len = view?.state?.doc?.length;
  if (len == null || pos < 0 || pos > len) return null;
  try {
    return view.coordsAtPos(pos, side);
  } catch {
    return null;
  }
}

function positionPopup(view, popup, listEl, replaceFrom) {
  if (!popup || popup.hidden || !listEl) return;
  const coords = coordsAtPosSafe(view, replaceFrom);
  if (!coords) return;

  listEl.style.maxHeight = '';
  const popW = popup.offsetWidth || 0;
  let popH = popup.offsetHeight || 0;
  if (popH < 1) return;

  const roomBelow = window.innerHeight - coords.bottom - VIEW_PAD_PX;
  const roomAbove = coords.top - VIEW_PAD_PX;
  const placeBelow = roomBelow >= popH + POPUP_GAP_PX || roomBelow >= roomAbove;

  const avail = placeBelow ? roomBelow : roomAbove;
  if (avail > 0 && popH > avail - POPUP_GAP_PX) {
    listEl.style.maxHeight = `${Math.max(48, avail - POPUP_GAP_PX)}px`;
    popH = popup.offsetHeight || popH;
  }

  const maxLeft = window.innerWidth - VIEW_PAD_PX - popW;
  const left = Math.max(VIEW_PAD_PX, Math.min(coords.left, maxLeft));
  let top = placeBelow
    ? coords.bottom + POPUP_GAP_PX
    : coords.top - popH - POPUP_GAP_PX;
  if (top < VIEW_PAD_PX) top = VIEW_PAD_PX;
  if (top + popH > window.innerHeight - VIEW_PAD_PX) {
    top = Math.max(VIEW_PAD_PX, window.innerHeight - VIEW_PAD_PX - popH);
  }

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

function createEditorAcPlugin(engine, opts) {
  const controller = createCompletionController(engine, opts);

  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.engine = engine;
      this.popup = null;
      this.listEl = null;
      this.items = [];
      this.activeIndex = -1;
      this.replaceFrom = 0;
      this.replaceTo = 0;
      this.typedToken = '';
      this.open = false;
      this.explicit = false;
      this.debounceTimer = null;
      this.suppressRefresh = false;
      this.repositionBound = false;
      this.repositionTimer = 0;
      this.onReposition = () => this.scheduleReposition();
      // Capture beats emacs()/vim() bubble handlers on the same node. A
      // Prec.highest keymap still loses to those packages: their keydown lives
      // on a ViewPlugin, and the keymap facet itself is consulted at Prec.default.
      this.onCaptureKey = (e) => {
        if (!this.handleEvent(e)) return;
        e.preventDefault();
        e.stopPropagation();
      };
      view.contentDOM.addEventListener('keydown', this.onCaptureKey, true);
      this.ensurePopup();
      this.hide();
    }

    reposition() {
      if (this.open) positionPopup(this.view, this.popup, this.listEl, this.replaceFrom);
    }

    scheduleReposition() {
      if (this.repositionTimer) return;
      this.repositionTimer = requestAnimationFrame(() => {
        this.repositionTimer = 0;
        this.reposition();
      });
    }

    cancelReposition() {
      if (!this.repositionTimer) return;
      cancelAnimationFrame(this.repositionTimer);
      this.repositionTimer = 0;
    }

    ensurePopup() {
      if (this.popup?.isConnected && this.listEl?.isConnected) return this.popup;
      if (typeof document === 'undefined' || !document.body) return null;
      this.popup = document.createElement('div');
      this.popup.className = 'editor-ac';
      this.popup.hidden = true;
      this.listEl = document.createElement('ul');
      this.listEl.className = 'editor-ac-list';
      this.listEl.setAttribute('role', 'listbox');
      this.listEl.setAttribute('aria-label', 'Completions');
      this.popup.appendChild(this.listEl);
      const host = this.view.dom.closest('#editor') || this.view.dom;
      host.appendChild(this.popup);
      return this.popup;
    }

    bindReposition(on) {
      if (on && !this.repositionBound) {
        this.repositionBound = true;
        window.addEventListener('resize', this.onReposition);
        this.view.scrollDOM.addEventListener('scroll', this.onReposition, { passive: true });
      } else if (!on && this.repositionBound) {
        this.repositionBound = false;
        window.removeEventListener('resize', this.onReposition);
        this.view.scrollDOM.removeEventListener('scroll', this.onReposition);
      }
    }

    hide() {
      this.open = false;
      this.items = [];
      this.activeIndex = -1;
      this.typedToken = '';
      this.explicit = false;
      this.cancelReposition();
      this.bindReposition(false);
      if (this.popup) {
        this.popup.hidden = true;
        this.popup.style.visibility = '';
        this.popup.style.left = '';
        this.popup.style.top = '';
      }
      if (this.listEl) {
        this.listEl.replaceChildren();
        this.listEl.style.maxHeight = '';
      }
    }

    isOpen() {
      return this.open && this.items.length > 0;
    }

    scrollActiveIntoView(li) {
      if (!this.listEl || !li) return;
      const top = li.offsetTop;
      const bottom = top + li.offsetHeight;
      const viewTop = this.listEl.scrollTop;
      const viewBottom = viewTop + this.listEl.clientHeight;
      if (top < viewTop) this.listEl.scrollTop = top;
      else if (bottom > viewBottom) this.listEl.scrollTop = bottom - this.listEl.clientHeight;
    }

    setActive(idx) {
      if (!this.listEl || !this.items.length) return;
      this.activeIndex = Math.max(0, Math.min(this.items.length - 1, idx));
      const kids = this.listEl.children;
      for (let i = 0; i < kids.length; i++) {
        if (i === this.activeIndex) kids[i].setAttribute('aria-selected', 'true');
        else kids[i].removeAttribute('aria-selected');
      }
      this.scrollActiveIntoView(kids[this.activeIndex]);
    }

    accept(idx = this.activeIndex) {
      if (idx < 0 || idx >= this.items.length) return false;
      const item = this.items[idx];
      const insert = item.insert != null ? item.insert : item.label;
      const { from, to } = { from: this.replaceFrom, to: this.replaceTo };
      // Only scaffold templates park on the first ?/_ — idents like my_rec must not.
      const caret = item.source === 'snippet'
        ? caretAfterFirstHole(insert)
        : String(insert).length;
      if (!autocompleteContinue()) this.suppressRefresh = true;
      this.view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + caret },
      });
      this.hide();
      this.view.focus();
      return true;
    }

    render(result) {
      const popup = this.ensurePopup();
      if (!popup || !this.listEl) return;
      if (!result?.items?.length) {
        this.hide();
        return;
      }

      const wasOpen = this.open;
      this.items = result.items;
      this.replaceFrom = result.from;
      this.replaceTo = result.to;
      this.typedToken = result.query || '';
      if (!wasOpen) this.activeIndex = 0;
      this.open = true;
      this.listEl.replaceChildren();

      for (let i = 0; i < this.items.length; i++) {
        const li = document.createElement('li');
        li.className = 'editor-ac-item';
        li.setAttribute('role', 'option');
        li.dataset.index = String(i);
        fillItem(li, this.items[i], this.typedToken);
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.accept(parseInt(e.currentTarget.dataset.index, 10));
        });
        this.listEl.appendChild(li);
      }

      popup.hidden = false;
      if (!wasOpen) popup.style.visibility = 'hidden';
      if (!wasOpen || this.activeIndex < 0) this.setActive(0);
      else this.setActive(this.activeIndex);
      this.reposition();
      if (!wasOpen) popup.style.visibility = '';
      this.bindReposition(true);
      if (!wasOpen) this.scheduleReposition();
    }

    compute() {
      const pos = this.view.state.selection.main.head;
      return controller.compute(this.view.state, pos, this.explicit);
    }

    refresh() {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      const result = this.compute();
      this.explicit = false;
      this.render(result);
    }

    scheduleRefresh() {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.refresh(), 20);
    }

    requestExplicit() {
      this.explicit = true;
      this.refresh();
    }

    /** Ctrl-Space: open if closed; dismiss if open (typing can reopen). */
    toggleExplicit() {
      if (this.isOpen()) {
        this.hide();
        return true;
      }
      this.requestExplicit();
      return true;
    }

    handleTab() {
      // Tab only accepts an already-open menu. Closed → indentOrInsertTab at caret.
      if (!this.isOpen()) return false;
      return this.accept(this.activeIndex);
    }

    handleEvent(e) {
      const delta = listStepDelta(e);
      if (!delta || !this.isOpen()) return false;
      this.setActive(this.activeIndex + delta);
      return true;
    }

    handleKey(key) {
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        if (!this.isOpen()) return false;
        this.setActive(this.activeIndex + (key === 'ArrowDown' ? 1 : -1));
        return true;
      }
      if (key === 'Escape') {
        if (!this.isOpen()) return false;
        this.hide();
        return true;
      }
      if (key === 'Tab') return this.handleTab();
      return false;
    }

    update(u) {
      if (this.open && u.docChanged) {
        try {
          this.replaceFrom = u.changes.mapPos(this.replaceFrom, 1);
          this.replaceTo = u.changes.mapPos(this.replaceTo, 1);
        } catch {
          this.hide();
        }
      }
      if (this.open && (u.viewportChanged || u.geometryChanged)) this.scheduleReposition();

      if (!u.docChanged && !u.selectionSet) return;

      const trigger = autocompleteTrigger();
      if (trigger === 'none') {
        if (this.suppressRefresh) this.suppressRefresh = false;
        if (this.isOpen()) this.hide();
        return;
      }

      if (this.suppressRefresh) {
        this.suppressRefresh = false;
        if (u.docChanged && !autocompleteContinue()) return;
      }

      if (u.docChanged) {
        if (trigger !== 'always'
            && !caretAfterNonWs(u.state.doc, u.state.selection.main.head)) {
          if (this.isOpen()) this.hide();
          return;
        }
        const eng = getEngine(u.view) || this.engine;
        if (isQuietTypingActiveForView(eng, u.state)) {
          if (this.isOpen()) this.hide();
          return;
        }
        this.scheduleRefresh();
        return;
      }

      if (u.selectionSet && this.isOpen()) {
        const pos = u.state.selection.main.head;
        if (pos < this.replaceFrom || pos > this.replaceTo) this.hide();
      }

      if (trigger === 'always' && u.selectionSet && !u.docChanged) {
        const eng = getEngine(u.view) || this.engine;
        if (isQuietTypingActiveForView(eng, u.state)) {
          if (this.isOpen()) this.hide();
          return;
        }
        const pos = u.state.selection.main.head;
        if (atTokenEndBeforeSpace(u.state.doc, pos)) this.scheduleRefresh();
        else if (this.isOpen()) {
          if (pos < this.replaceFrom || pos > this.replaceTo) this.hide();
        }
      }
    }

    destroy() {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.cancelReposition();
      this.bindReposition(false);
      this.view.contentDOM.removeEventListener('keydown', this.onCaptureKey, true);
      this.popup?.remove();
      this.popup = null;
      this.listEl = null;
    }
  });
}

let acPlugin = null;

export function toggleEditorAutocomplete(view) {
  if (!view || !acPlugin) return false;
  const inst = view.plugin(acPlugin);
  return inst ? inst.toggleExplicit() : false;
}

/** Step the open editor list. False when the list is closed. */
export function stepEditorAutocomplete(view, delta) {
  if (!view || !acPlugin || !delta) return false;
  const inst = view.plugin(acPlugin);
  if (!inst || !inst.isOpen()) return false;
  inst.setActive(inst.activeIndex + delta);
  return true;
}

export function belEditorAutocomplete(engine, opts = {}) {
  const plugin = createEditorAcPlugin(engine, opts);
  acPlugin = plugin;

  const runKey = (view, key) => {
    const inst = view.plugin(plugin);
    return inst ? inst.handleKey(key) : false;
  };

  const runToggle = (view) => {
    const inst = view.plugin(plugin);
    return inst ? inst.toggleExplicit() : false;
  };

  const runToggleIfDefault = (view) => {
    const g = typeof window !== 'undefined' ? window : globalThis;
    const style = g.Persist?.readStoredKeymapStyle?.();
    if (style === 'emacs') return false;
    if (style === 'vim' && !vimAllowsRemap(view, 'edit.autocomplete')) return false;
    const KB = g.Keybindings;
    if (KB && typeof KB.resolve === 'function' && KB.has && KB.has('edit.autocomplete')) {
      const spec = KB.resolve('edit.autocomplete');
      if (!spec) return false;
      if (typeof KB.toCmKey === 'function' && KB.toCmKey(spec) !== 'Ctrl-Space') return false;
    }
    return runToggle(view);
  };

  const runEvent = (view, event) => {
    const inst = view.plugin(plugin);
    return inst ? inst.handleEvent(event) : false;
  };

  return [
    // ⛔ Prec.highest DOM handler, and this extension MUST sit before emacs()/vim()
    // in the view (see editor.mjs). Those packages also sit at Prec.highest and
    // consume ArrowDown / C-n / C-m as line motion; a keymap entry is too late
    // because the keymap facet itself is consulted at Prec.default.
    Prec.highest(EditorView.domEventHandlers({
      keydown(event, view) {
        if (!runEvent(view, event)) return false;
        event.preventDefault();
        return true;
      },
    })),
    plugin,
    Prec.highest(keymap.of([
      { key: 'Ctrl-Space', run: runToggleIfDefault },
      { mac: 'Alt-`', run: runToggle },
      { mac: 'Alt-i', run: runToggle },
      { key: 'Escape', run: (view) => runKey(view, 'Escape') },
      { key: 'ArrowDown', run: (view) => runKey(view, 'ArrowDown') },
      { key: 'ArrowUp', run: (view) => runKey(view, 'ArrowUp') },
      { key: 'PageDown', run: (view) => runKey(view, 'ArrowDown') },
      { key: 'PageUp', run: (view) => runKey(view, 'ArrowUp') },
      { key: 'Ctrl-n', run: (view) => stepEditorAutocomplete(view, 1) },
      { key: 'Ctrl-m', run: (view) => stepEditorAutocomplete(view, 1) },
      { key: 'Ctrl-p', run: (view) => stepEditorAutocomplete(view, -1) },
      { key: 'Tab', run: (view) => runKey(view, 'Tab') },
    ])),
  ];
}

export const belAutocompletion = belEditorAutocomplete;

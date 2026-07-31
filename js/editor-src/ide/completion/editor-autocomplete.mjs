import { Prec } from '@codemirror/state';
import { EditorView, keymap, ViewPlugin } from '@codemirror/view';
import { fuzzyScore } from './fuzzy.mjs';
import { renderTypeInto } from '../../format/type-render.mjs';
import { createCompletionController } from './source.mjs';

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

function positionPopup(view, popup, listEl, replaceFrom) {
  if (!popup || popup.hidden || !listEl) return;
  const coords = view.coordsAtPos(replaceFrom, false);
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
      this.onReposition = () => {
        if (this.open) positionPopup(this.view, this.popup, this.listEl, this.replaceFrom);
      };
      this.ensurePopup();
      this.hide();
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
      positionPopup(this.view, popup, this.listEl, this.replaceFrom);
      if (!wasOpen) popup.style.visibility = '';
      this.bindReposition(true);
      if (!wasOpen) {
        requestAnimationFrame(() => {
          positionPopup(this.view, popup, this.listEl, this.replaceFrom);
        });
      }
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

    handleTab() {
      if (!this.isOpen()) {
        this.explicit = true;
        const result = this.compute();
        this.explicit = false;
        if (result?.items?.length) {
          this.render(result);
          return true;
        }
        return false;
      }
      return this.accept(this.activeIndex);
    }

    handleKey(key) {
      if (key === 'ArrowDown') {
        if (!this.isOpen()) return false;
        this.setActive(this.activeIndex + 1);
        return true;
      }
      if (key === 'ArrowUp') {
        if (!this.isOpen()) return false;
        this.setActive(this.activeIndex - 1);
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
        this.scheduleRefresh();
        return;
      }

      if (u.selectionSet && this.isOpen()) {
        const pos = u.state.selection.main.head;
        if (pos < this.replaceFrom || pos > this.replaceTo) this.hide();
      }

      if (trigger === 'always' && u.selectionSet && !u.docChanged) {
        const pos = u.state.selection.main.head;
        if (atTokenEndBeforeSpace(u.state.doc, pos)) this.scheduleRefresh();
        else if (this.isOpen()) {
          if (pos < this.replaceFrom || pos > this.replaceTo) this.hide();
        }
      }
    }

    destroy() {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.bindReposition(false);
      this.popup?.remove();
      this.popup = null;
      this.listEl = null;
    }
  });
}

export function belEditorAutocomplete(engine, opts = {}) {
  const plugin = createEditorAcPlugin(engine, opts);

  const runKey = (view, key) => {
    const inst = view.plugin(plugin);
    return inst ? inst.handleKey(key) : false;
  };

  return [
    plugin,
    Prec.highest(keymap.of([
      { key: 'Ctrl-Space', run: (view) => { view.plugin(plugin)?.requestExplicit(); return true; } },
      { mac: 'Alt-`', run: (view) => { view.plugin(plugin)?.requestExplicit(); return true; } },
      { mac: 'Alt-i', run: (view) => { view.plugin(plugin)?.requestExplicit(); return true; } },
      { key: 'Escape', run: (view) => runKey(view, 'Escape') },
      { key: 'ArrowDown', run: (view) => runKey(view, 'ArrowDown') },
      { key: 'ArrowUp', run: (view) => runKey(view, 'ArrowUp') },
      { key: 'PageDown', run: (view) => runKey(view, 'ArrowDown') },
      { key: 'PageUp', run: (view) => runKey(view, 'ArrowUp') },
      { key: 'Tab', run: (view) => runKey(view, 'Tab') },
    ])),
  ];
}

export const belAutocompletion = belEditorAutocomplete;

// Inline rename (F2): a floating field over the symbol name, live-validated
// against engine.renamePreview. Enter commits one atomic edit across def + refs,
// Escape cancels.

import { EditorView, keymap } from '@codemirror/view';
import { getEngine, navInfoAt, applyRename } from './bel-ide-actions.mjs';

let activeField = null;

function closeActive() {
  if (activeField) {
    activeField.destroy();
    activeField = null;
  }
}

function anchorRectFor(view, range) {
  const start = view.coordsAtPos(range.from, 1);
  const end = view.coordsAtPos(range.to, -1);
  if (!start || !end) return null;
  return { left: start.left, top: start.top, bottom: end.bottom };
}

function openRenameField(view, nav) {
  closeActive();
  const range = nav.nameRange;
  const rect = anchorRectFor(view, range);
  if (!rect) return false;

  const host = document.createElement('div');
  host.className = 'bel-rename-field';

  const input = document.createElement('input');
  input.type = 'text';
  input.spellcheck = false;
  input.autocapitalize = 'off';
  input.setAttribute('autocomplete', 'off');
  input.value = nav.name || '';

  const hint = document.createElement('span');
  hint.className = 'bel-rename-hint';

  host.append(input, hint);
  document.body.appendChild(host);

  // Position above the name, left edge aligned with the token start.
  host.style.left = `${Math.round(rect.left)}px`;
  host.style.top = `${Math.round(rect.top)}px`;

  const eng = getEngine(view);

  function validate() {
    const next = input.value.trim();
    if (next === '' || next === nav.name) {
      host.removeAttribute('data-invalid');
      hint.textContent = '';
      return next === nav.name ? 'unchanged' : 'empty';
    }
    const preview = eng && typeof eng.renamePreview === 'function'
      ? eng.renamePreview(nav.symbolId, next)
      : { ok: false, reason: 'no-engine' };
    if (preview.ok) {
      host.removeAttribute('data-invalid');
      const n = preview.edits.length;
      let text = `${n} occurrence${n === 1 ? '' : 's'}`;
      // Surface downstream blast radius from the dependency graph, if any.
      if (eng && typeof eng.impactOf === 'function') {
        let impact = [];
        try {
          impact = eng.impactOf(nav.symbolId) || [];
        } catch (_) {
          impact = [];
        }
        if (impact.length) text += ` · affects ${impact.length} downstream`;
      }
      hint.textContent = text;
      return 'ok';
    }
    host.setAttribute('data-invalid', 'true');
    hint.textContent = preview.reason === 'name-conflict' ? 'name in use'
      : preview.reason === 'invalid-name' ? 'invalid name'
      : 'cannot rename';
    return 'invalid';
  }

  function commit() {
    const next = input.value.trim();
    const state = validate();
    if (state === 'ok') {
      const res = applyRename(view, nav.symbolId, next);
      closeActive();
      return res.ok;
    }
    if (state === 'unchanged' || state === 'empty') {
      closeActive();
      view.focus();
      return false;
    }
    // invalid — keep the field open and let the user fix it.
    input.focus();
    input.select();
    return false;
  }

  function onKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeActive();
      view.focus();
    }
  }

  input.addEventListener('keydown', onKeydown);
  input.addEventListener('input', validate);
  input.addEventListener('blur', () => {
    // Defer so a click on nothing doesn't race the field's own commit path.
    setTimeout(() => {
      if (activeField && activeField.host === host) {
        closeActive();
      }
    }, 0);
  });

  activeField = {
    host,
    destroy() {
      input.removeEventListener('keydown', onKeydown);
      if (host.parentNode) host.parentNode.removeChild(host);
    },
  };

  validate();
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
  return true;
}

// Command: rename the symbol at the cursor. Returns true if a field opened
// (so the keymap consumes the key).
export function startRename(view, pos) {
  const at = pos ?? view.state.selection.main.head;
  const nav = navInfoAt(view, at);
  if (!nav || !nav.symbolId || !nav.nameRange) return false;
  return openRenameField(view, nav);
}

export function belRename() {
  return [
    keymap.of([{ key: 'F2', run: (view) => startRename(view) }]),
    // Tear the field down if the document changes underneath it.
    EditorView.updateListener.of((u) => {
      if (activeField && (u.docChanged || u.geometryChanged)) closeActive();
    }),
  ];
}

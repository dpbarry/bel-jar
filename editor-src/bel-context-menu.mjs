// Right-click context menu: classifies the click via engine.navAt and assembles
// actions from the shared IDE action layer. Built on Menu.openContext.

import { undo, redo, selectAll, undoDepth, redoDepth } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import { EditorView } from '@codemirror/view';
import {
  navInfoAt, termRangeAt, goToDefinition, revealBinder,
} from './bel-ide-actions.mjs';
import { formatCommand } from './bel-format.mjs';
import { openInspectorWindow } from './bel-inspector.mjs';
import { openLocalGraphWindow } from './bel-graph-view.mjs';
import { startRename } from './bel-rename.mjs';
import { findReferences } from './bel-refs-panel.mjs';

function hasStandardSelection(view) {
  return !view.state.selection.main.empty;
}

function isEditable(view) {
  return !view.state.readOnly;
}

function runClipboard(view, action) {
  view.focus();
  try {
    document.execCommand(action);
  } catch (_) {}
}

function buildEditMenuItems(view) {
  const editable = isEditable(view);
  const hasSel = hasStandardSelection(view);
  const state = view.state;

  return [
    {
      label: 'Undo',
      shortcut: 'Ctrl+Z',
      disabled: undoDepth(state) === 0,
      onSelect: () => undo(view),
    },
    {
      label: 'Redo',
      shortcut: 'Ctrl+Y',
      disabled: redoDepth(state) === 0,
      onSelect: () => redo(view),
    },
    { type: 'separator' },
    {
      label: 'Cut',
      shortcut: 'Ctrl+X',
      disabled: !editable || !hasSel,
      onSelect: () => runClipboard(view, 'cut'),
    },
    {
      label: 'Copy',
      shortcut: 'Ctrl+C',
      disabled: !hasSel,
      onSelect: () => runClipboard(view, 'copy'),
    },
    {
      label: 'Paste',
      shortcut: 'Ctrl+V',
      disabled: !editable,
      onSelect: () => runClipboard(view, 'paste'),
    },
    {
      label: 'Select All',
      shortcut: 'Ctrl+A',
      onSelect: () => selectAll(view),
    },
    {
      label: 'Find…',
      shortcut: 'Ctrl+F',
      onSelect: () => openSearchPanel(view),
    },
  ];
}

// Assemble the menu items for the position clicked. `pos` is the document
// offset under the pointer (already resolved to the click point).
function buildMenuItems(view, pos) {
  const nav = navInfoAt(view, pos);
  const items = buildEditMenuItems(view);

  // --- Identifier-scoped actions ---
  if (nav && (nav.symbolId || nav.reference)) {
    items.push({ type: 'separator' });
    if (nav.symbolId && !nav.onDefinition) {
      items.push({
        label: 'Go to Definition',
        shortcut: 'Ctrl+Click',
        onSelect: () => goToDefinition(view, pos),
      });
    }

    // Only when go-to-def can't help: unresolved local/metavar under an enclosing decl.
    if (!nav.symbolId && nav.enclosingDeclarationId) {
      items.push({
        label: 'Reveal Binder',
        onSelect: () => revealBinder(view, pos),
      });
    }

    if (nav.symbolId) {
      items.push({
        label: 'Find References',
        onSelect: () => findReferences(view, pos),
      });
      items.push({
        label: 'Rename Symbol',
        shortcut: 'F2',
        onSelect: () => startRename(view, pos),
      });
    }

    // --- Inspect: open a pinned floating inspector for this term. ---
    if (nav.symbolId) {
      items.push({
        label: 'Inspect',
        onSelect: () => openInspectorWindow(view, pos),
      });
      items.push({
        label: 'Show Dependency Graph',
        onSelect: () => openLocalGraphWindow(view, pos),
      });
    }
  }

  // --- Always-available editor actions ---
  items.push({ type: 'separator' });
  items.push({
    label: 'Format Document',
    shortcut: 'Alt+Shift+F',
    onSelect: () => formatCommand(view),
  });

  return items;
}

export function belContextMenu() {
  return EditorView.domEventHandlers({
    contextmenu(event, view) {
      const g = typeof window !== 'undefined' ? window : self;
      if (typeof g.Menu === 'undefined') return false;
      // Respect a modifier-click escape hatch for the native menu.
      if (event.shiftKey) return false;

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) return false;

      // Select the token under the click (IDE-style) unless the click landed
      // inside an existing selection.
      const sel = view.state.selection.main;
      const insideSel = !sel.empty && pos >= sel.from && pos <= sel.to;
      if (!insideSel) {
        const range = termRangeAt(view, pos);
        view.dispatch(range
          ? { selection: { anchor: range.from, head: range.to } }
          : { selection: { anchor: pos, head: pos } });
      }

      const items = buildMenuItems(view, insideSel ? sel.head : pos);
      if (!items.length) return false;

      event.preventDefault();
      view.dom.classList.add('cm-bel-context-open');
      g.Menu.openContext({
        x: event.clientX,
        y: event.clientY,
        side: 'bottom',
        align: 'start',
        items,
        onClose: () => {
          view.dom.classList.remove('cm-bel-context-open');
        },
        // The menu focuses item 0 on open, latching a :focus-visible ring that
        // coexists with :hover on the row the mouse moves to (two rows lit). Drop
        // it so hover leads; arrow keys re-focus on demand.
        onReady: () => {
          const active = document.activeElement;
          if (active && active.classList && active.classList.contains('menu-item')) {
            active.blur();
          }
        },
      });
      return true;
    },
  });
}

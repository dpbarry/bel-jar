// Right-click context menu: classifies the click via engine.navAt and assembles
// actions from the shared IDE action layer. Built on Menu.openContext.

import { EditorView } from '@codemirror/view';
import {
  navInfoAt, termRangeAt, goToDefinition, revealBinder, insertSignature,
} from './bel-ide-actions.mjs';
import { openInspectorWindow } from './bel-inspector.mjs';
import { openLocalGraphWindow } from './bel-graph-view.mjs';
import { startRename } from './bel-rename.mjs';
import { findReferences } from './bel-refs-panel.mjs';

function hasStandardSelection(view) {
  return !view.state.selection.main.empty;
}

function runReplQuery(view) {
  const sel = view.state.selection.main;
  const text = view.state.sliceDoc(sel.from, sel.to).trim();
  if (!text) return;
  const g = typeof window !== 'undefined' ? window : self;
  // The REPL runner reads from the command input; prime it and fire.
  const input = document.getElementById('command-input');
  if (input && g.BelJarReplCommands && typeof g.BelJarReplCommands.runCmd === 'function') {
    input.value = text;
    g.BelJarReplCommands.runCmd();
  }
}

// Assemble the menu items for the position clicked. `pos` is the document
// offset under the pointer (already resolved to the click point).
function buildMenuItems(view, pos) {
  const nav = navInfoAt(view, pos);
  const items = [];

  // --- Identifier-scoped actions ---
  if (nav && (nav.symbolId || nav.reference)) {
    if (nav.symbolId && !nav.onDefinition) {
      items.push({
        label: 'Go to Definition',
        shortcut: 'Ctrl+Click',
        onSelect: () => goToDefinition(view, pos),
      });
    }

    if (nav.symbolId || nav.enclosingDeclarationId) {
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

    // Insert-signature only for a global decl with a known type.
    if (nav.signature && nav.signature.type != null && nav.isGlobal) {
      items.push({
        label: nav.signature.source === 'reconstructed'
          ? 'Insert Reconstructed Signature'
          : 'Insert Signature',
        onSelect: () => insertSignature(view, pos),
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

  // --- Selection-scoped actions ---
  if (hasStandardSelection(view)) {
    if (items.length) items.push({ type: 'separator' });
    items.push({
      label: 'Run Selection as REPL Query',
      onSelect: () => runReplQuery(view),
    });
  }

  // --- Always-available editor actions ---
  if (items.length) items.push({ type: 'separator' });
  items.push({
    label: 'Format Document',
    shortcut: 'Ctrl+Shift+F',
    onSelect: () => {
      const g = typeof window !== 'undefined' ? window : self;
      const ed = g.BelJarCurrentEditor;
      if (ed && typeof ed.format === 'function') ed.format();
    },
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

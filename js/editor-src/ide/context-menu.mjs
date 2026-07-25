// Right-click context menu: classifies the click via engine.navAt and assembles
// actions from the shared IDE action layer. Built on Menu.openContext.

import { selectAll } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import { EditorView } from '@codemirror/view';
import {
  navInfoAt, termRangeAt, goToDefinition, revealBinder,
  crossFileDefinitionAt, getEngine,
} from './ide-actions.mjs';
import { formatCommand } from '../format/document-format.mjs';
import { canInspectAt, openInspectorWindow } from './inspector.mjs';
import { openLocalGraphWindow } from '../graph/graph-view.mjs';
import { startRename, renameReachAt, renameReachTooltip } from './rename.mjs';
import { findReferences, canFindReferences } from './refs-panel.mjs';
import { holeAt, splitTargetsOf, canIntro, runIntro, runFill, runSplit } from '../prover/hole-actions.mjs';

function canGoToDefinition(view, pos, nav) {
  if (nav?.symbolId && !nav.onDefinition) return true;
  if (nav?.onDefinition) return false;
  return !!crossFileDefinitionAt(view, pos);
}

function canRenameSymbol(view, pos, nav) {
  return !!(nav?.symbolId || renameReachAt(view, pos));
}

function hasSymbolMenuContext(view, pos, nav) {
  if (nav && (nav.symbolId || nav.reference)) return true;
  return canFindReferences(view, pos);
}

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

function editHistoryApi() {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  return g.EditHistory;
}

function kbLabel(id, fallbackSpec) {
  const g = typeof window !== 'undefined' ? window : self;
  if (id && g.Keybindings && typeof g.Keybindings.labelFor === 'function' && g.Keybindings.has(id)) {
    return g.Keybindings.labelFor(id) || '';
  }
  if (g.Keybindings && typeof g.Keybindings.formatShortcut === 'function' && fallbackSpec) {
    return g.Keybindings.formatShortcut(fallbackSpec);
  }
  if (g.CommandPalette && typeof g.CommandPalette.shortcutLabel === 'function' && fallbackSpec) {
    return g.CommandPalette.shortcutLabel(fallbackSpec);
  }
  return fallbackSpec || '';
}

function buildEditMenuItems(view) {
  const editable = isEditable(view);
  const hasSel = hasStandardSelection(view);
  const H = editHistoryApi();

  return [
    {
      label: 'Undo',
      shortcut: kbLabel('edit.undo', 'Mod+Z'),
      disabled: !(H && H.canUndo && H.canUndo()),
      onSelect: () => { H?.undo?.(); },
    },
    {
      label: 'Redo',
      shortcut: kbLabel('edit.redo', 'Mod+Y'),
      disabled: !(H && H.canRedo && H.canRedo()),
      onSelect: () => { H?.redo?.(); },
    },
    { type: 'separator' },
    {
      label: 'Cut',
      shortcut: kbLabel(null, 'Mod+X'),
      disabled: !editable || !hasSel,
      onSelect: () => runClipboard(view, 'cut'),
    },
    {
      label: 'Copy',
      shortcut: kbLabel(null, 'Mod+C'),
      disabled: !hasSel,
      onSelect: () => runClipboard(view, 'copy'),
    },
    {
      label: 'Paste',
      shortcut: kbLabel(null, 'Mod+V'),
      disabled: !editable,
      onSelect: () => runClipboard(view, 'paste'),
    },
    {
      label: 'Select All',
      shortcut: kbLabel('edit.select-all', 'Mod+A'),
      onSelect: () => selectAll(view),
    },
    {
      label: 'Find…',
      shortcut: kbLabel('edit.find', 'Mod+F'),
      onSelect: () => openSearchPanel(view),
    },
  ];
}

// A hole under the click (the `?` token), or null. Engine-backed.
function holeMenuContext(view, pos) {
  const engine = getEngine(view);
  if (!engine) return null;
  try {
    return holeAt(engine, view.state.doc, pos);
  } catch (_) {
    return null;
  }
}

// The "Prove" group for a hole: open the interactive Harpoon, or apply a single
// verified tactic in place. This is the one entry point for proving — the old
// floating toolbar is gone; right-click is the discoverable, non-intrusive surface.
function buildProveMenuItems(view, hit) {
  const g = typeof window !== 'undefined' ? window : self;
  const engine = getEngine(view);
  const lab = g.Harpoon;
  const items = [{ type: 'separator' }];

  if (lab && typeof lab.openFromHole === 'function') {
    items.push({
      label: 'Open in Harpoon…',
      onSelect: () => lab.openFromHole(view, engine, hit),
    });
  }
  if (canIntro(hit.hole)) {
    items.push({ label: 'Introduce', onSelect: () => runIntro(view, engine, hit) });
  }
  const vars = splitTargetsOf(hit.hole);
  if (vars.length === 1) {
    items.push({ label: `Split on ${vars[0]}`, onSelect: () => runSplit(view, engine, hit, vars[0]) });
  } else if (vars.length > 1) {
    items.push({
      label: 'Split on…',
      submenu: vars.map((v) => ({ label: v, onSelect: () => runSplit(view, engine, hit, v) })),
    });
  }
  items.push({ label: 'Fill', tooltip: 'Prove the goal with an inhabiting term', onSelect: () => runFill(view, engine, hit) });
  return items;
}

// Assemble the menu items for the position clicked. `pos` is the document
// offset under the pointer (already resolved to the click point).
function buildMenuItems(view, pos) {
  const nav = navInfoAt(view, pos);
  const items = buildEditMenuItems(view);

  // --- Hole-scoped proving (a `?` under the cursor) ---
  const hit = holeMenuContext(view, pos);
  if (hit) {
    for (const it of buildProveMenuItems(view, hit)) items.push(it);
  }

  // --- Identifier-scoped actions ---
  if (hasSymbolMenuContext(view, pos, nav)) {
    items.push({ type: 'separator' });
    if (canGoToDefinition(view, pos, nav)) {
      items.push({
        label: 'Go to Definition',
        shortcut: kbLabel('nav.definition', 'F12'),
        onSelect: () => goToDefinition(view, pos),
      });
    }

    // Only when go-to-def can't help: unresolved local/metavar under an enclosing decl.
    if (!nav?.symbolId && nav?.enclosingDeclarationId) {
      items.push({
        label: 'Reveal Binder',
        onSelect: () => revealBinder(view, pos),
      });
    }

    if (canFindReferences(view, pos)) {
      items.push({
        label: 'Find References',
        shortcut: kbLabel('nav.references', 'Shift+F12'),
        onSelect: () => findReferences(view, pos),
      });
    }

    if (canRenameSymbol(view, pos, nav)) {
      const reach = renameReachAt(view, pos);
      items.push({
        label: 'Rename Symbol',
        shortcut: kbLabel('edit.rename', 'F2'),
        tooltip: reach ? renameReachTooltip(reach.total) : '',
        tooltipPlacement: 'right',
        onSelect: () => startRename(view, pos),
      });
    }

    if (canInspectAt(view, pos)) {
      items.push({
        label: 'Inspect',
        onSelect: () => openInspectorWindow(view, pos),
      });
    }

    if (nav?.symbolId) {
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
    shortcut: kbLabel('edit.format', 'Alt+Shift+F'),
    onSelect: () => formatCommand(view),
  });

  return items;
}

export function contextMenu() {
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
      let menuPos = insideSel ? sel.head : pos;
      if (!insideSel) {
        const range = termRangeAt(view, pos);
        if (range) {
          view.dispatch({ selection: { anchor: range.from, head: range.to } });
          menuPos = range.from;
        } else {
          view.dispatch({ selection: { anchor: pos, head: pos } });
        }
      }

      const items = buildMenuItems(view, menuPos);
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

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

/**
 * Cut/Copy/Paste, THROUGH the registry now — `edit.cut`/`edit.copy`/`edit.paste`
 * in editor-commands.mjs, not a private `document.execCommand` call living only
 * here. A menu row that runs its own copy of a command is exactly the "list
 * retyped instead of derived" trap: this menu can drift from what Keybindings,
 * the palette and Available Keys all say about the same three commands.
 */
function runClipboard(action) {
  const g = typeof window !== 'undefined' ? window : self;
  g.Commands?.run?.('edit.' + action);
}

function editHistoryApi() {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  return g.EditHistory;
}

/**
 * The chord to print beside a row — the one that WORKS in the style in force.
 *
 * ⛔ `Commands.liveChord` first, not `Keybindings.labelFor`. `labelFor` answers
 * with BelJar's OWN binding and knows nothing about the style having taken it, so
 * this menu offered Ctrl+F for Find… under Emacs (which uses Ctrl+F for
 * forward-char and answers on `C-s`) and Ctrl+X for Cut, where `C-x` is a prefix.
 * One reduction, shared with Available Keys and the header menus.
 */
function kbLabel(id, fallbackSpec) {
  const g = typeof window !== 'undefined' ? window : self;
  if (id && g.Commands && typeof g.Commands.liveChord === 'function') {
    // '' is an ANSWER here — the style took the chord and bound nothing back — so
    // it must not fall through to the spec this file happens to remember.
    try { return g.Commands.liveChord(id) || ''; } catch (_) { /* fall through */ }
  }
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

/**
 * The one place that decides whether this menu may OFFER a command.
 *
 * ⛔ A surface may only offer what WORKS. Every row fronting a registry command
 * declares `commandId`; if the registry does not know it, nothing attached a
 * `run`, or its `when()` says no, the row is DROPPED — not shown dead. The
 * header menus and the palette already derive this way; this menu was the last
 * surface hand-building its own list.
 *
 * Under *jar this is where capability gating lands: a provider with no proof
 * support leaves every `prover.*` command unattached, and the Prove group is
 * simply not offered rather than presenting dead affordances.
 * See docs/starjar/07-surfaces.md.
 *
 * Headless (no registry on the global) returns null and nothing is filtered —
 * a test harness has no user to mislead.
 */
function offerableIds() {
  const g = typeof window !== 'undefined' ? window : self;
  const C = g.Commands;
  if (!C || typeof C.list !== 'function') return null;
  try {
    return new Set(C.list({ runnable: true, available: true }).map((c) => c.id));
  } catch (_) {
    return null;
  }
}

/** Catalogue title for `id`, so a label is never retyped beside the registry. */
function cmdTitle(id, fallback) {
  const g = typeof window !== 'undefined' ? window : self;
  const C = g.Commands;
  try {
    const c = C && typeof C.get === 'function' ? C.get(id) : null;
    if (c && c.title) return c.title;
  } catch (_) { /* fall through */ }
  return fallback;
}

/** A row fronting a registry command — label AND chord both derived from it. */
function cmdRow(id, fallbackLabel, fallbackSpec, extra) {
  return {
    commandId: id,
    label: cmdTitle(id, fallbackLabel),
    shortcut: kbLabel(id, fallbackSpec),
    ...(extra || {}),
  };
}

/**
 * Drop rows the registry will not offer, then tidy the separators those drops
 * strand (leading, trailing, doubled). Without this a gated-away group leaves a
 * visible seam where nothing is.
 */
function keepOfferable(items) {
  const ok = offerableIds();
  const kept = ok ? items.filter((it) => !it.commandId || ok.has(it.commandId)) : items.slice();
  const out = [];
  for (const it of kept) {
    if (it.type === 'separator' && (!out.length || out[out.length - 1].type === 'separator')) continue;
    out.push(it);
  }
  while (out.length && out[out.length - 1].type === 'separator') out.pop();
  return out;
}

function buildEditMenuItems(view) {
  const editable = isEditable(view);
  const hasSel = hasStandardSelection(view);
  const H = editHistoryApi();

  // Labels come from the catalogue — these seven matched it exactly, so they
  // were seven chances for the menu and the palette to drift apart.
  return [
    cmdRow('edit.undo', 'Undo', 'Mod+Z', {
      disabled: !(H && H.canUndo && H.canUndo()),
      onSelect: () => { H?.undo?.(); },
    }),
    cmdRow('edit.redo', 'Redo', 'Mod+Y', {
      disabled: !(H && H.canRedo && H.canRedo()),
      onSelect: () => { H?.redo?.(); },
    }),
    { type: 'separator' },
    cmdRow('edit.cut', 'Cut', 'Mod+X', {
      disabled: !editable || !hasSel,
      onSelect: () => runClipboard('cut'),
    }),
    cmdRow('edit.copy', 'Copy', 'Mod+C', {
      disabled: !hasSel,
      onSelect: () => runClipboard('copy'),
    }),
    cmdRow('edit.paste', 'Paste', 'Mod+V', {
      disabled: !editable,
      onSelect: () => runClipboard('paste'),
    }),
    cmdRow('edit.select-all', 'Select All', 'Mod+A', { onSelect: () => selectAll(view) }),
    cmdRow('edit.find', 'Find…', 'Mod+F', { onSelect: () => openSearchPanel(view) }),
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
    // ⚠ Labels here deliberately DIFFER from the catalogue: right-click already
    // names the hole, so "Open Hole in Harpoon" / "Intro at Hole" would repeat
    // it. The id is what gates the row; the wording is contextual.
    items.push({
      commandId: 'prover.open-in-harpoon',
      label: 'Open in Harpoon…',
      onSelect: () => lab.openFromHole(view, engine, hit),
    });
  }
  if (canIntro(hit.hole)) {
    items.push({
      commandId: 'prover.hole-intro',
      label: 'Introduce',
      onSelect: () => runIntro(view, engine, hit),
    });
  }
  const vars = splitTargetsOf(hit.hole);
  if (vars.length === 1) {
    items.push({
      commandId: 'prover.hole-split',
      label: `Split on ${vars[0]}`,
      onSelect: () => runSplit(view, engine, hit, vars[0]),
    });
  } else if (vars.length > 1) {
    items.push({
      commandId: 'prover.hole-split',
      label: 'Split on…',
      submenu: vars.map((v) => ({ label: v, onSelect: () => runSplit(view, engine, hit, v) })),
    });
  }
  items.push({
    commandId: 'prover.hole-fill',
    label: 'Fill',
    tooltip: 'Prove the goal with an inhabiting term',
    onSelect: () => runFill(view, engine, hit),
  });
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
      items.push(cmdRow('nav.definition', 'Go to Definition', 'F12', {
        onSelect: () => goToDefinition(view, pos),
      }));
    }

    // Only when go-to-def can't help: unresolved local/metavar under an enclosing decl.
    if (!nav?.symbolId && nav?.enclosingDeclarationId) {
      items.push({
        label: 'Reveal Binder',
        onSelect: () => revealBinder(view, pos),
      });
    }

    if (canFindReferences(view, pos)) {
      items.push(cmdRow('nav.references', 'Find References', 'Shift+F12', {
        onSelect: () => findReferences(view, pos),
      }));
    }

    if (canRenameSymbol(view, pos, nav)) {
      const reach = renameReachAt(view, pos);
      items.push(cmdRow('edit.rename', 'Rename Symbol', 'F2', {
        tooltip: reach ? renameReachTooltip(reach.total) : '',
        tooltipPlacement: 'right',
        onSelect: () => startRename(view, pos),
      }));
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
  items.push(cmdRow('edit.format', 'Format Document', 'Alt+Shift+F', {
    onSelect: () => formatCommand(view),
  }));

  return keepOfferable(items);
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
      view.dom.classList.add('cm-jar-context-open');
      g.Menu.openContext({
        x: event.clientX,
        y: event.clientY,
        side: 'bottom',
        align: 'start',
        items,
        onClose: () => {
          view.dom.classList.remove('cm-jar-context-open');
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

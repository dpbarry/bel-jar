// Find-all-references. Collects every occurrence of the symbol under the
// cursor — the engine's precise references in THIS document, plus free
// occurrences across the rest of the file's project group — and presents them
// as a clickable list using the shared Menu primitive, so placement, keyboard
// nav and dismissal come for free. Selecting an entry jumps to it (switching
// files when the occurrence lives elsewhere).

import { navInfoAt, termRangeAt, crossFileDefinitionAt } from './bel-ide-actions.mjs';
import { scrollIntoViewCenter } from './bel-viewport.mjs';
import { groupReferencesFor, usesOf } from './project-prelude.mjs';

function jumpTo(view, from, to) {
  view.dispatch({
    selection: { anchor: from, head: to },
    effects: scrollIntoViewCenter(from),
  });
  view.focus();
}

function lineSnippet(doc, pos) {
  const line = doc.lineAt(pos);
  const col = pos - line.from;
  let text = line.text.trim();
  if (text.length > 60) {
    // Keep the occurrence visible: window around the column.
    const start = Math.max(0, col - 24);
    text = (start > 0 ? '…' : '') + line.text.slice(start, start + 60).trim() + '…';
  }
  return { lineNumber: line.number, col, text };
}

// Free occurrences of `name` across the OTHER files of the project group.
// `defFileId` (when known) marks the file owning the definition so its def
// tokens are listed too.
function crossFileItems(g, name, defFileId) {
  const P = g.BelJarPersist;
  if (!name || !P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function') {
    return { items: [], count: 0 };
  }
  let refs = [];
  try {
    refs = groupReferencesFor(P.listFiles(), P.getActiveFileId(), name, (id) => P.getFileText(id), {
      defFileId,
    });
  } catch (_) {
    return { items: [], count: 0 };
  }
  const items = [];
  let lastFile = null;
  for (const r of refs) {
    if (r.fileName !== lastFile) {
      lastFile = r.fileName;
      items.push({ type: 'section', label: r.fileName.split('/').pop() });
    }
    let text = r.lineText;
    if (text.length > 60) text = `${text.slice(0, 59)}…`;
    items.push({
      label: `${r.isDef ? 'def · ' : ''}${r.line}:${r.col}  ${text}`,
      onSelect: () => {
        if (typeof g.dispatchEvent === 'function') {
          g.dispatchEvent(new CustomEvent('beljar:open-file-at', {
            detail: { fileId: r.fileId, from: r.from, to: r.to },
          }));
        }
      },
    });
  }
  return { items, count: refs.length };
}

// Build the menu item list. Definition first (tagged), then references in
// order, then per-file sections for the rest of the group.
function buildItems(view, g, nav, name, defFileId) {
  const doc = view.state.doc;
  const items = [];

  const cross = crossFileItems(g, name, defFileId);
  const localDef = nav && nav.nameRange ? 1 : 0;
  const localRefs = nav ? nav.references.length : 0;
  const total = localDef + localRefs + cross.count;
  items.push({ type: 'section', label: `${name} — ${total} occurrence${total === 1 ? '' : 's'}` });

  if (nav && nav.nameRange) {
    const snip = lineSnippet(doc, nav.nameRange.from);
    items.push({
      label: `def · ${snip.lineNumber}:${snip.col + 1}  ${snip.text}`,
      onSelect: () => jumpTo(view, nav.nameRange.from, nav.nameRange.to),
    });
  }

  // Local references, sorted by position, skipping the definition name.
  const refs = nav ? nav.references.slice().sort((a, b) => a.from - b.from) : [];
  for (const r of refs) {
    if (nav.nameRange && r.from === nav.nameRange.from) continue;
    const snip = lineSnippet(doc, r.from);
    items.push({
      label: `${snip.lineNumber}:${snip.col + 1}  ${snip.text}`,
      onSelect: () => jumpTo(view, r.from, r.to),
    });
  }

  // When the engine has no symbol here (name defined in another file), the
  // active document's own free occurrences come from the parse index.
  if (!nav) {
    const docText = doc.toString();
    const occs = usesOf(docText).filter((u) => u.name === name);
    if (occs.length) items.push({ type: 'section', label: 'this file' });
    for (const u of occs) {
      const snip = lineSnippet(doc, u.from);
      items.push({
        label: `${snip.lineNumber}:${snip.col + 1}  ${snip.text}`,
        onSelect: () => jumpTo(view, u.from, u.to),
      });
    }
  }

  items.push(...cross.items);
  return items;
}

// Open the references list anchored at the cursor caret.
export function findReferences(view, pos) {
  const g = typeof window !== 'undefined' ? window : self;
  if (typeof g.Menu === 'undefined') return false;
  const at = pos ?? view.state.selection.main.head;
  let nav = navInfoAt(view, at);
  let name = nav && nav.name;
  let defFileId = null;
  if (!nav || !nav.symbolId) {
    // Unresolved here — a cross-file name still gets a project-wide list.
    nav = null;
    const range = termRangeAt(view, at);
    if (!range) return false;
    name = view.state.sliceDoc(range.from, range.to);
    const cross = crossFileDefinitionAt(view, at);
    if (!cross) return false;
    defFileId = cross.fileId;
  }
  if (nav && !nav.nameRange && nav.references.length === 0) return false;

  let x, y;
  const c = view.coordsAtPos(at);
  if (c) { x = c.left; y = c.bottom; }
  else {
    const r = view.dom.getBoundingClientRect();
    x = r.left + 40; y = r.top + 40;
  }

  g.Menu.openContext({
    x, y,
    side: 'bottom',
    align: 'start',
    items: buildItems(view, g, nav, name, defFileId),
  });
  return true;
}

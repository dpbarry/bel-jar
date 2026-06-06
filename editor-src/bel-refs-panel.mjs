// Find-all-references. Collects every occurrence of the symbol under the
// cursor (definition + uses) from the engine and presents them as a clickable
// list using the shared Menu primitive, so placement, keyboard nav and
// dismissal come for free. Selecting an entry jumps to it.

import { navInfoAt } from './bel-ide-actions.mjs';

function jumpTo(view, from, to) {
  // Land on the occurrence and select the token so it's easy to spot.
  view.dispatch({
    selection: { anchor: from, head: to },
    scrollIntoView: true,
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

// Build the menu item list. Definition first (tagged), then references in order.
function buildItems(view, nav) {
  const doc = view.state.doc;
  const items = [];

  const total = (nav.nameRange ? 1 : 0) + nav.references.length;
  items.push({ type: 'section', label: `${nav.name} — ${total} occurrence${total === 1 ? '' : 's'}` });

  if (nav.nameRange) {
    const snip = lineSnippet(doc, nav.nameRange.from);
    items.push({
      label: `def · ${snip.lineNumber}:${snip.col + 1}  ${snip.text}`,
      onSelect: () => jumpTo(view, nav.nameRange.from, nav.nameRange.to),
    });
  }

  // References, sorted by position, skipping the definition name if it appears.
  const refs = nav.references.slice().sort((a, b) => a.from - b.from);
  for (const r of refs) {
    if (nav.nameRange && r.from === nav.nameRange.from) continue;
    const snip = lineSnippet(doc, r.from);
    items.push({
      label: `${snip.lineNumber}:${snip.col + 1}  ${snip.text}`,
      onSelect: () => jumpTo(view, r.from, r.to),
    });
  }

  return items;
}

// Open the references list anchored at the cursor caret.
export function findReferences(view, pos) {
  const g = typeof window !== 'undefined' ? window : self;
  if (typeof g.Menu === 'undefined') return false;
  const at = pos ?? view.state.selection.main.head;
  const nav = navInfoAt(view, at);
  if (!nav || !nav.symbolId) return false;
  if (!nav.nameRange && nav.references.length === 0) return false;

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
    items: buildItems(view, nav),
  });
  return true;
}

// Find-all-references. Collects every occurrence of the symbol under the
// cursor — the engine's precise references in THIS document, plus free
// occurrences across the rest of the file's project group — and presents them
// as a clickable list using the shared Menu primitive, so placement, keyboard
// nav and dismissal come for free. Hovering a same-file row jump-previews to its
// line (caret unmoved, menu open); a click commits the jump and closes the menu.
// Rows carry a def/use badge; the list is capped to a short scrolling stack.

import { navInfoAt, termRangeAt, crossFileDefinitionAt, peekRange } from './bel-ide-actions.mjs';
import { groupReferencesFor, usesOf, referenceGroupFilesFor } from './project-prelude.mjs';

export function referenceRowMatchesPos(row, fileId, pos, doc) {
  if (!row || pos == null || fileId == null) return false;
  const rowFileId = row.fileId ?? fileId;
  if (rowFileId !== fileId) return false;
  if (row.from != null && row.to != null && doc) {
    return pos >= row.from && pos < row.to;
  }
  if (row.line != null && doc) {
    try {
      const ln = doc.line(row.line);
      if (row.col != null) return pos === ln.from + row.col - 1;
      return pos >= ln.from && pos <= ln.to;
    } catch (_) { /* ignore */ }
  }
  return false;
}

function peekReferenceRow(g, view, row, name, editorId) {
  if (g.BelJarSuppressRefPeek) return;
  const fileId = row.fileId ?? editorId;
  const peekAt = {
    from: row.from,
    to: row.to,
    line: row.line,
    col: row.col,
    name,
  };
  const activeId = editorFileId(g, view);
  if (fileId === activeId) {
    const ed = g.BelJarCurrentEditor;
    const liveView = (ed && typeof ed.getView === 'function') ? ed.getView() : view;
    peekRange(liveView, peekAt);
    return;
  }
  if (typeof g.dispatchEvent === 'function') {
    g.dispatchEvent(new CustomEvent('beljar:peek-file-at', {
      detail: { fileId, ...peekAt },
    }));
  }
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

function activeFileMeta(g, view) {
  const id = editorFileId(g, view);
  const P = g.BelJarPersist;
  if (!P || typeof P.listFiles !== 'function') {
    return { id, name: '' };
  }
  const f = id ? P.listFiles().find((x) => x.id === id) : null;
  return { id, name: f ? f.name : '' };
}

// Editor's open document — for jump routing only.
export function editorFileId(g, view) {
  const P = g.BelJarPersist;
  const known = (id) => id && P?.listFiles?.().some((f) => f.id === id);
  const ed = g.BelJarCurrentEditor;
  if (ed && typeof ed.getDocumentId === 'function') {
    const id = ed.getDocumentId();
    if (known(id)) return id;
  }
  if (P && typeof P.getActiveFileId === 'function') return P.getActiveFileId();
  return null;
}

// BelJarPersist active file — drives cross-file reference indexing (module group).
function indexingActiveId(g) {
  const P = g.BelJarPersist;
  if (P && typeof P.getActiveFileId === 'function') return P.getActiveFileId();
  return null;
}

// Which group file owns the definition for this symbol (null = active file).
export function resolveDefFileId(view, nav) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const editorId = editorFileId(g, view);
  const at = view.state.selection.main.head;
  try {
    const cross = crossFileDefinitionAt(view, at);
    if (cross && cross.fileId !== editorId) return cross.fileId;
  } catch (_) { /* ignore */ }
  if (nav?.nameRange) return null;
  return null;
}

function buildLocalRows(view, nav, name, g) {
  const rows = [];
  const seen = new Set();
  const doc = view.state.doc;
  const { id: fileId, name: fileName } = activeFileMeta(g, view);

  const addRow = (from, to, tag) => {
    const key = `${from}:${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    const ln = doc.lineAt(from);
    rows.push({
      from, to, tag, fileId,
      line: ln.number,
      col: from - ln.from + 1,
    });
  };

  if (nav?.nameRange) {
    addRow(nav.nameRange.from, nav.nameRange.to, 'def');
  }
  const refs = nav ? nav.references.slice().sort((a, b) => a.from - b.from) : [];
  for (const r of refs) {
    if (nav?.nameRange && r.from === nav.nameRange.from) continue;
    addRow(r.from, r.to, 'read');
  }
  // Free uses in this file — engine refs are often empty for cross-prelude symbols.
  for (const u of usesOf(doc.toString(), fileName).filter((u) => u.name === name)) {
    if (nav?.nameRange && u.from === nav.nameRange.from) continue;
    addRow(u.from, u.to, 'read');
  }
  return rows;
}

function persistDevOpts(P) {
  if (P && typeof P.getActiveCfgForDir === 'function') {
    return { activeCfgForDir: (dir) => P.getActiveCfgForDir(dir) };
  }
  return {};
}

function crossFileBuckets(g, name, defFileId, activeId) {
  const P = g.BelJarPersist;
  if (!name || !P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function') {
    return { refs: [], byFile: [] };
  }
  let refs = [];
  try {
    refs = groupReferencesFor(P.listFiles(), activeId, name, (id) => P.getFileText(id), {
      defFileId,
      ...persistDevOpts(P),
    });
  } catch (_) {
    return { refs: [], byFile: [] };
  }
  const byFile = [];
  for (const r of refs) {
    let bucket = byFile.length ? byFile[byFile.length - 1] : null;
    if (!bucket || bucket.fileName !== r.fileName) {
      bucket = { fileName: r.fileName, rows: [] };
      byFile.push(bucket);
    }
    bucket.rows.push(r);
  }
  return { refs, byFile };
}

export function fileReferenceSectionLabel(fileName, count, { legacyThisFile = false } = {}) {
  if (legacyThisFile) return `this file (${count})`;
  const base = fileName ? fileName.split('/').pop() : 'this file';
  return `${base} (${count})`;
}

export function referenceFileHeaderLabel(group, gathered, nav) {
  if (!gathered.multiFile && !nav && group.isCurrent) {
    return fileReferenceSectionLabel('', group.rows.length, { legacyThisFile: true });
  }
  return fileReferenceSectionLabel(group.fileName, group.rows.length);
}

export function shouldShowReferenceFileHeader(group, gathered, nav) {
  if (gathered.multiFile && group.rows.length) return true;
  if (!nav && group.isCurrent && group.rows.length) return true;
  return false;
}

function mapCrossRow(r) {
  return {
    from: r.from,
    to: r.to,
    tag: r.isDef ? 'def' : 'read',
    line: r.line,
    col: r.col,
    lineText: r.lineText,
    fileId: r.fileId,
  };
}

// Suite-wide reference groups in cfg / development file order.
export function gatherReferenceGroups(view, g, nav, name, defFileId) {
  const editorId = editorFileId(g, view);
  const activeId = indexingActiveId(g);
  const cross = crossFileBuckets(g, name, defFileId, activeId);
  const localRows = buildLocalRows(view, nav, name, g);

  const rowsByFileId = new Map();
  for (const bucket of cross.byFile) {
    const fid = bucket.rows[0]?.fileId;
    if (!fid) continue;
    rowsByFileId.set(fid, bucket.rows.map(mapCrossRow));
  }
  if (localRows.length && editorId) {
    rowsByFileId.set(editorId, localRows);
  }

  const P = g.BelJarPersist;
  const devOpts = persistDevOpts(P);
  const groupFiles = (P && typeof P.listFiles === 'function' && typeof P.getFileText === 'function')
    ? referenceGroupFilesFor(P.listFiles(), activeId, (id) => P.getFileText(id), devOpts)
    : [];

  const groups = [];
  for (const f of groupFiles) {
    const rows = rowsByFileId.get(f.id);
    if (!rows?.length) continue;
    groups.push({
      fileName: f.name,
      fileId: f.id,
      isCurrent: f.id === editorId,
      rows,
    });
  }

  const total = groups.reduce((n, gr) => n + gr.rows.length, 0);
  const multiFile = groups.length > 1;
  return { groups, multiFile, total, name };
}

// One-time registration of the reference-row type. A row is a focusable
// menu-item button (so the Menu's arrow/Enter handling drives it) that
// jump-previews on hover and commits the jump on click.
let rowTypeRegistered = false;
function ensureRefRowType(g) {
  if (rowTypeRegistered || typeof g.Menu === 'undefined' || typeof g.Menu.registerRowType !== 'function') {
    return;
  }
  rowTypeRegistered = true;
  g.Menu.registerRowType('belref', (item, _wrap, _level, controller) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-item menu-item-ref' + (item.isActiveRef ? ' is-ref-active' : '');
    btn.setAttribute('role', 'menuitem');
    btn.tabIndex = -1;

    if (item.tag) {
      const badge = document.createElement('span');
      badge.className = `menu-ref-badge menu-ref-badge--${item.tag}`;
      badge.textContent = item.tag === 'def' ? 'def' : 'use';
      btn.appendChild(badge);
    }
    const loc = document.createElement('span');
    loc.className = 'menu-ref-loc';
    loc.textContent = item.loc || '';
    btn.appendChild(loc);

    const snip = document.createElement('span');
    snip.className = 'menu-ref-snippet';
    snip.textContent = item.snippet || '';
    btn.appendChild(snip);
    const g = typeof window !== 'undefined' ? window : globalThis;
    if (g.Tooltips?.bindOverflow) g.Tooltips.bindOverflow(snip, () => item.snippet || '');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof item.onSelect === 'function') item.onSelect();
      controller.closeAll();
    });
    // Hover jump-previews the occurrence; the caret only moves on click.
    // Peek is hover-only — initial menu focus must not teleport (esp. cross-file).
    if (typeof item.onPeek === 'function') {
      btn.addEventListener('mouseenter', item.onPeek);
    }
    return btn;
  });
}

function openFileAt(g, fileId, from, to, row, name) {
  if (typeof g.dispatchEvent !== 'function') return;
  g.dispatchEvent(new CustomEvent('beljar:open-file-at', {
    detail: {
      fileId,
      from,
      to,
      line: row && row.line,
      col: row && row.col,
      name,
    },
  }));
}

// Build the menu item list. Definition first (tagged), then references in
// order, then per-file sections for the rest of the group.
function buildItems(view, g, nav, name, defFileId, activeAt) {
  const doc = view.state.doc;
  const gathered = gatherReferenceGroups(view, g, nav, name, defFileId);
  const editorId = editorFileId(g, view);
  const items = [];
  items.push({
    type: 'section',
    label: `${gathered.name} (${gathered.total} occurrence${gathered.total === 1 ? '' : 's'})`,
  });

  const refItem = (row, tag, loc, snippet) => {
    const fileId = row.fileId ?? editorId;
    const isActiveRef = activeAt != null && referenceRowMatchesPos(row, editorId, activeAt, doc);
    return {
      type: 'belref',
      tag,
      loc,
      snippet,
      isActiveRef,
      onSelect: () => openFileAt(g, fileId, row.from, row.to, row, name),
      onPeek: () => peekReferenceRow(g, view, row, name, editorId),
    };
  };

  for (const group of gathered.groups) {
    if (shouldShowReferenceFileHeader(group, gathered, nav)) {
      items.push({
        type: 'section',
        label: referenceFileHeaderLabel(group, gathered, nav),
        className: group.isCurrent ? 'is-ref-file-current' : undefined,
      });
    }
    for (const row of group.rows) {
      if (group.isCurrent || row.fileId === editorId) {
        const snip = lineSnippet(doc, row.from);
        items.push(refItem(
          row,
          row.tag,
          `${snip.lineNumber}:${snip.col + 1}`,
          snip.text,
        ));
        continue;
      }
      let text = row.lineText;
      if (text.length > 60) text = `${text.slice(0, 59)}…`;
      items.push(refItem(row, row.tag, `${row.line}:${row.col}`, text));
    }
  }
  return items;
}

function scrollRefsMenuToCurrentFile() {
  const menu = document.querySelector('.menu:has(.menu-item-ref)');
  if (!menu) return;
  const header = menu.querySelector('.menu-section.is-ref-file-current');
  if (header) {
    const inset = header.getBoundingClientRect().top - menu.getBoundingClientRect().top;
    menu.scrollTop += inset;
    return;
  }
  menu.scrollTop = 0;
}

function focusActiveRefRow() {
  const row = document.querySelector('.menu-item-ref.is-ref-active');
  if (row) row.focus();
}

// Open the references list anchored at the cursor caret.
export function canFindReferences(view, pos) {
  const at = pos ?? view.state.selection.main.head;
  const nav = navInfoAt(view, at);
  if (nav?.symbolId) {
    if (!nav.nameRange && nav.references.length === 0) return false;
    return true;
  }
  const range = termRangeAt(view, at);
  if (!range) return false;
  return !!crossFileDefinitionAt(view, at);
}

export function findReferences(view, pos) {
  const g = typeof window !== 'undefined' ? window : self;
  if (typeof g.Menu === 'undefined') return false;
  ensureRefRowType(g);
  const at = pos ?? view.state.selection.main.head;
  let nav = navInfoAt(view, at);
  let name = nav && nav.name;
  let defFileId = resolveDefFileId(view, nav);
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

  const gPeek = g;
  g.BelJarSuppressRefPeek = true;
  g.Menu.openContext({
    x, y,
    side: 'bottom',
    align: 'start',
    items: buildItems(view, g, nav, name, defFileId, at),
    onReady: () => {
      scrollRefsMenuToCurrentFile();
      focusActiveRefRow();
      requestAnimationFrame(() => {
        g.BelJarSuppressRefPeek = false;
      });
    },
    onClose: () => {
      g.BelJarSuppressRefPeek = false;
      if (typeof gPeek.dispatchEvent === 'function') {
        gPeek.dispatchEvent(new CustomEvent('beljar:end-ref-peek'));
      }
    },
  });
  return true;
}

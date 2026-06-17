// .cfg editor affordances: entry spans, open-on-click, hover, completion, suite reorder.

import { autocompletion } from '@codemirror/autocomplete';
import { EditorView, hoverTooltip } from '@codemirror/view';
import { dirOf, joinPath } from './development.mjs';
import { resolveCfgDocumentPath } from './bel-cfg-lint.mjs';

function persist() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  return g.BelJarPersist || null;
}

function isEntryToken(text) {
  const low = String(text || '').toLowerCase();
  return low.endsWith('.bel') || low.endsWith('.elf') || low.endsWith('.cfg');
}

export function resolveCfgEntryPath(cfgPath, entry) {
  const cfgDir = dirOf(String(cfgPath || ''));
  return cfgDir ? joinPath(cfgDir, entry) : entry;
}

export function iterCfgEntries(doc) {
  const entries = [];
  let pos = 0;
  let entryIndex = 0;
  for (const rawLine of doc.toString().split('\n')) {
    const lineStart = pos;
    pos += rawLine.length + 1;
    const t = rawLine.trim();
    if (!t || t.charAt(0) === '%') continue;
    const from = lineStart + rawLine.indexOf(t);
    const to = from + t.length;
    if (isEntryToken(t)) {
      entries.push({ from, to, text: t, index: entryIndex++ });
    } else {
      entries.push({ from, to, text: t, index: -1 });
    }
  }
  return entries;
}

export function cfgEntryAt(state, pos, cfgPath) {
  for (const e of iterCfgEntries(state.doc)) {
    if (pos >= e.from && pos <= e.to) {
      return {
        ...e,
        cfgPath,
        fullPath: resolveCfgEntryPath(cfgPath, e.text),
      };
    }
  }
  return null;
}

export function countCfgEntries(doc) {
  return iterCfgEntries(doc).filter((e) => e.index >= 0).length;
}

function fileIdForPath(path) {
  const P = persist();
  if (!P || typeof P.listFiles !== 'function') return null;
  for (const f of P.listFiles()) {
    if (f.name === path) return f.id;
  }
  return null;
}

function openCfgEntry(entry) {
  if (!entry || entry.index < 0) return false;
  const fileId = fileIdForPath(entry.fullPath);
  if (!fileId) return false;
  const g = typeof window !== 'undefined' ? window : globalThis;
  if (typeof g.dispatchEvent !== 'function') return false;
  g.dispatchEvent(new CustomEvent('beljar:open-file-at', {
    detail: { fileId, from: 0, to: 0 },
  }));
  return true;
}

function modPressed(event) {
  return event.metaKey || event.ctrlKey;
}

function entryLines(view) {
  return iterCfgEntries(view.state.doc).filter((e) => e.index >= 0);
}

function swapEntryLines(view, at, neighbor) {
  const entries = entryLines(view);
  if (at < 0 || neighbor < 0 || at >= entries.length || neighbor >= entries.length) return false;
  const lineA = view.state.doc.lineAt(entries[at].from);
  const lineB = view.state.doc.lineAt(entries[neighbor].from);
  view.dispatch({
    changes: [
      { from: lineA.from, to: lineA.to, insert: lineB.text },
      { from: lineB.from, to: lineB.to, insert: lineA.text },
    ],
    selection: { anchor: entries[neighbor].from },
  });
  return true;
}

export function moveCfgEntry(view, documentId, delta) {
  const cfgPath = resolveCfgDocumentPath(documentId);
  const pos = view.state.selection.main.head;
  const entry = cfgEntryAt(view.state, pos, cfgPath);
  if (!entry || entry.index < 0) return false;
  const entries = entryLines(view);
  const at = entries.findIndex((e) => e.index === entry.index);
  return swapEntryLines(view, at, at + (delta < 0 ? -1 : 1));
}

export function removeCfgEntryLine(view, documentId) {
  const cfgPath = resolveCfgDocumentPath(documentId);
  const pos = view.state.selection.main.head;
  const entry = cfgEntryAt(view.state, pos, cfgPath);
  if (!entry || entry.index < 0) return false;
  const line = view.state.doc.lineAt(entry.from);
  const to = line.to < view.state.doc.length ? line.to + 1 : line.to;
  view.dispatch({
    changes: { from: line.from, to, insert: '' },
    selection: { anchor: Math.min(line.from, view.state.doc.length) },
  });
  return true;
}

function filesInCfgDir(cfgPath) {
  const P = persist();
  if (!P || typeof P.listFiles !== 'function') return [];
  const cfgDir = dirOf(String(cfgPath || ''));
  const out = [];
  for (const f of P.listFiles()) {
    const n = String(f.name || '');
    if (dirOf(n) !== cfgDir) continue;
    const low = n.toLowerCase();
    if (!low.endsWith('.bel') && !low.endsWith('.elf') && !low.endsWith('.cfg')) continue;
    out.push(n.slice(n.lastIndexOf('/') + 1));
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function cfgHover(documentId) {
  const cfgPath = resolveCfgDocumentPath(documentId);
  return hoverTooltip((view, pos) => {
    const entry = cfgEntryAt(view.state, pos, cfgPath);
    if (!entry || entry.index < 0) return null;
    const exists = !!fileIdForPath(entry.fullPath);
    const posLabel = entry.index + 1;
    const pathLine = exists ? entry.fullPath : `${entry.fullPath} (missing)`;
    const dom = document.createElement('div');
    dom.className = 'beljar-tip bel-type-tip';
    const text = document.createElement('div');
    text.className = 'cm-diagnosticText';
    text.textContent = `${pathLine}\nposition ${posLabel} in suite`;
    dom.appendChild(text);
    return { pos: entry.from, end: entry.to, above: true, create: () => ({ dom }) };
  }, { hoverTime: 280 });
}

function cfgCompletion(documentId) {
  const cfgPath = resolveCfgDocumentPath(documentId);
  return autocompletion({
    activateOnTyping: true,
    maxRenderedOptions: 24,
    override: [(context) => {
      const word = context.matchBefore(/[\w.\-]+/);
      if (!word || (word.from === word.to && !context.explicit)) return null;
      const options = filesInCfgDir(cfgPath)
        .filter((name) => name.toLowerCase().startsWith(word.text.toLowerCase()))
        .map((label) => ({ label, type: 'file' }));
      if (!options.length && !context.explicit) return null;
      return { from: word.from, to: word.to, options };
    }],
  });
}

const cfgNavGestures = (documentId) => {
  const cfgPath = resolveCfgDocumentPath(documentId);
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      const inGutter = !!event.target?.closest?.('.cm-lineNumbers');
      if (!inGutter && (event.button !== 0 || !modPressed(event))) return false;
      if (inGutter && event.button !== 0) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) return false;
      const entry = cfgEntryAt(view.state, pos, cfgPath);
      if (!entry || entry.index < 0) return false;
      event.preventDefault();
      return openCfgEntry(entry);
    },
  });
};

function cfgContextMenu(documentId) {
  const cfgPath = resolveCfgDocumentPath(documentId);
  return EditorView.domEventHandlers({
    contextmenu(event, view) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) return false;
      const entry = cfgEntryAt(view.state, pos, cfgPath);
      if (!entry || entry.index < 0) return false;
      const g = typeof window !== 'undefined' ? window : globalThis;
      if (!g.Menu || typeof g.Menu.openContext !== 'function') return false;
      event.preventDefault();
      const entries = entryLines(view);
      const at = entries.findIndex((e) => e.index === entry.index);
      const items = [];
      if (fileIdForPath(entry.fullPath)) {
        items.push({
          label: 'Open file',
          onSelect: () => openCfgEntry(entry),
        });
      }
      if (at > 0) {
        items.push({
          label: 'Move up in suite',
          onSelect: () => moveCfgEntry(view, documentId, -1),
        });
      }
      if (at >= 0 && at < entries.length - 1) {
        items.push({
          label: 'Move down in suite',
          onSelect: () => moveCfgEntry(view, documentId, 1),
        });
      }
      items.push({
        label: 'Remove from suite',
        onSelect: () => removeCfgEntryLine(view, documentId),
      });
      g.Menu.openContext({ x: event.clientX, y: event.clientY, items });
      return true;
    },
  });
}

export function cfgEditorExtensions(documentId) {
  return [
    cfgHover(documentId),
    cfgCompletion(documentId),
    cfgNavGestures(documentId),
    cfgContextMenu(documentId),
  ];
}

export function goToCfgEntry(view, documentId, pos) {
  const cfgPath = resolveCfgDocumentPath(documentId);
  const entry = cfgEntryAt(view.state, pos ?? view.state.selection.main.head, cfgPath);
  if (!entry || entry.index < 0) return false;
  return openCfgEntry(entry);
}

import {
  ensureSyntaxTree,
  foldEffect,
  foldedRanges,
  syntaxTree,
  unfoldEffect,
} from '@codemirror/language';
import { Transaction } from '@codemirror/state';
import { ViewPlugin } from '@codemirror/view';
import { readEditorPrefs } from './editor-prefs.mjs';
import { keysFromFoldedRanges, matchStoredFoldKeys } from './bel-fold-keys.mjs';

const SESSION_STORE_KEY = 'beljar-fold-session-v1';
const LOCAL_STORE_KEY = 'beljar-fold-local-v1';

function storageForMode(mode) {
  if (typeof globalThis === 'undefined') return null;
  if (mode === 'session') return globalThis.sessionStorage ?? null;
  if (mode === 'local') return globalThis.localStorage ?? null;
  return null;
}

function readStoreBlob(mode) {
  const store = storageForMode(mode);
  if (!store) return {};
  try {
    const raw = store.getItem(mode === 'session' ? SESSION_STORE_KEY : LOCAL_STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoreBlob(mode, blob) {
  const store = storageForMode(mode);
  if (!store) return;
  try {
    const key = mode === 'session' ? SESSION_STORE_KEY : LOCAL_STORE_KEY;
    if (!blob || !Object.keys(blob).length) store.removeItem(key);
    else store.setItem(key, JSON.stringify(blob));
  } catch {
    // quota / privacy mode — ignore
  }
}

export function readFoldPersistMode() {
  const p = typeof globalThis !== 'undefined' ? globalThis.BelJarPersist : null;
  const mode = p?.readStoredEditorFoldPersist?.();
  return mode === 'session' || mode === 'local' ? mode : 'none';
}

export function readFileFoldKeys(fileId, mode = readFoldPersistMode()) {
  if (!fileId || mode === 'none') return [];
  const blob = readStoreBlob(mode);
  const keys = blob[fileId];
  return Array.isArray(keys) ? keys.filter((k) => typeof k === 'string') : [];
}

export function writeFileFoldKeys(fileId, keys, mode = readFoldPersistMode()) {
  if (!fileId || mode === 'none') return;
  const blob = readStoreBlob(mode);
  if (keys?.length) blob[fileId] = keys;
  else delete blob[fileId];
  writeStoreBlob(mode, blob);
}

function foldedRangeList(state) {
  const out = [];
  foldedRanges(state).between(0, state.doc.length, (from, to) => {
    out.push({ from, to });
  });
  return out;
}

export function flushFoldKeys(view, fileId) {
  if (!view || !fileId) return;
  const mode = readFoldPersistMode();
  if (mode === 'none') return;
  ensureSyntaxTree(view.state, view.state.doc.length);
  const keys = keysFromFoldedRanges(view.state, foldedRangeList(view.state));
  writeFileFoldKeys(fileId, keys, mode);
}

function foldChanged(update) {
  for (const tr of update.transactions) {
    for (const e of tr.effects) {
      if (e.is(foldEffect) || e.is(unfoldEffect)) return true;
    }
  }
  return false;
}

function parseComplete(state) {
  ensureSyntaxTree(state, state.doc.length);
  const len = state.doc.length;
  if (!len) return true;
  return syntaxTree(state).length >= len;
}

export function applyStoredFolds(view, fileId) {
  if (!view || !fileId) return false;
  const mode = readFoldPersistMode();
  if (mode === 'none') return false;
  if (!readEditorPrefs().foldGutter) return false;
  if (!parseComplete(view.state)) return false;
  const stored = readFileFoldKeys(fileId, mode);
  if (!stored.length) return false;
  const matched = reconcileStoredFoldKeys(view.state, fileId, mode);
  if (!matched.length) return false;
  view.dispatch({
    effects: matched.map((item) => foldEffect.of(item.range)),
    annotations: Transaction.addToHistory.of(false),
  });
  return true;
}

function pruneStoredFoldKeys(fileId, matched, mode = readFoldPersistMode()) {
  if (!fileId || mode === 'none') return;
  const keys = matched.map((item) => item.key);
  writeFileFoldKeys(fileId, keys, mode);
}

export function reconcileStoredFoldKeys(state, fileId, mode = readFoldPersistMode()) {
  const stored = readFileFoldKeys(fileId, mode);
  const matched = matchStoredFoldKeys(state, stored);
  pruneStoredFoldKeys(fileId, matched, mode);
  return matched;
}

export function belFoldPersistence(fileId) {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.fileId = fileId;
      this.restored = false;
      this.restorePending = false;
      this.saveTimer = null;
      this.scheduleRestore();
    }

    update(update) {
      if (!this.restored) this.scheduleRestore();
      if (foldChanged(update)) this.scheduleSave();
    }

    destroy() {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      flushFoldKeys(this.view, this.fileId);
    }

    scheduleRestore() {
      if (this.restored || this.restorePending || !this.fileId) return;
      this.restorePending = true;
      queueMicrotask(() => {
        this.restorePending = false;
        if (!this.view.dom.isConnected) return;
        this.tryRestore();
      });
    }

    tryRestore() {
      if (this.restored || !this.fileId) return;
      if (readFoldPersistMode() === 'none') {
        this.restored = true;
        return;
      }
      if (!parseComplete(this.view.state)) return;
      const mode = readFoldPersistMode();
      const stored = readFileFoldKeys(this.fileId, mode);
      if (!stored.length) {
        this.restored = true;
        return;
      }
      const matched = reconcileStoredFoldKeys(this.view.state, this.fileId, mode);
      if (matched.length) {
        this.view.dispatch({
          effects: matched.map((item) => foldEffect.of(item.range)),
          annotations: Transaction.addToHistory.of(false),
        });
      }
      this.restored = true;
    }

    scheduleSave() {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        flushFoldKeys(this.view, this.fileId);
      }, 250);
    }
  });
}

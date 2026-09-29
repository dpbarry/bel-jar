/**
 * The open document (docs/PERSIST.md §4.2): one file's text, view and semantic
 * checkpoint, loaded from their three records and saved back to them.
 *
 * In memory it is one snapshot, `{ meta: { documentId }, editor: { text, local },
 * semantic }`, because that is what the editor mounts from. On disk the text is
 * work, the view is device (the session), the checkpoint is cache.
 *
 * ⛔ A save writes only what changed. Every write is an event other tabs and
 * the sync runner act on; a save that changes nothing must not make one.
 * ⛔ A save never resurrects a deleted file (a debounced save can outlive it).
 * ⛔ A change underneath is never overwritten (§4.4). The document remembers
 * its BASE, the text it last read from or wrote to storage. When the file
 * changes under it (another tab, a pull, a rewrite) it three-way merges: edits
 * that do not touch combine and appear in the editor; edits that do become a
 * conflict, with both versions kept and storage left alone until a person
 * chooses. Comparing the buffer with storage could not tell "I edited" from
 * "someone else edited", and so overwrote the other side (measured 2026-09-24).
 */
import { merge3, conflictedCopyName } from './merge.mjs';

var textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

function utf8Bytes(text) {
  if (textEncoder) return textEncoder.encode(text);
  var encoded = unescape(encodeURIComponent(text));
  var bytes = new Uint8Array(encoded.length);
  for (var i = 0; i < encoded.length; i++) bytes[i] = encoded.charCodeAt(i);
  return bytes;
}

export function documentFingerprint(code) {
  var bytes = utf8Bytes(String(code != null ? code : ''));
  var hash = 0x811c9dc5;
  for (var i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return bytes.length + ':' + hash.toString(16).padStart(8, '0');
}

export function normalizeViewportAnchor(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.kind !== 'string') return null;
  if (raw.kind === 'decl') {
    var di = Number(raw.declIndex);
    var so = Number(raw.sigOffset);
    if (!isFinite(di) || di < 0 || !isFinite(so) || so < 0) return null;
    return { kind: 'decl', declIndex: Math.floor(di), sigOffset: Math.floor(so) };
  }
  if (raw.kind === 'doc') {
    var dso = Number(raw.sigOffset);
    if (!isFinite(dso) || dso < 0) return null;
    var out = { kind: 'doc', sigOffset: Math.floor(dso) };
    var ln = Number(raw.line);
    if (isFinite(ln) && ln >= 1) out.line = Math.floor(ln);
    return out;
  }
  return null;
}

/** A file's view: selection, scroll and the anchor that survives reflow. */
export function normalizeView(raw) {
  if (!raw || typeof raw !== 'object') return {};
  var out = {};
  if (raw.selection && typeof raw.selection === 'object') {
    var a = Number(raw.selection.anchor);
    var h = Number(raw.selection.head);
    if (isFinite(a) && isFinite(h)) out.selection = { anchor: a, head: h };
  }
  var cl = Number(raw.centerLine);
  if (isFinite(cl) && cl >= 1) out.centerLine = Math.floor(cl);
  var st = Number(raw.scrollTop);
  if (isFinite(st) && st >= 0) out.scrollTop = st;
  var sl = Number(raw.scrollLeft);
  if (isFinite(sl) && sl >= 0) out.scrollLeft = sl;
  var va = normalizeViewportAnchor(raw.viewportAnchor);
  if (va) out.viewportAnchor = va;
  return out;
}

export function normalizeSemantic(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var types = raw.types && typeof raw.types === 'object' ? raw.types : null;
  if (!types && !raw.identity && !raw.deriveAttempted) return null;
  return {
    docFp: typeof raw.docFp === 'string' ? raw.docFp : '',
    scopeKey: typeof raw.scopeKey === 'string' ? raw.scopeKey : '',
    belugaBuild: raw.belugaBuild === 'fast' ? 'fast' : 'stable',
    types: types || { v: 1, decls: [], metavars: [], reconstructed: [] },
    identity: Array.isArray(raw.identity) ? raw.identity : [],
    deriveAttempted: Array.isArray(raw.deriveAttempted) ? raw.deriveAttempted : [],
  };
}

function semanticHasPayload(semantic) {
  if (!semantic || !semantic.types) return false;
  var t = semantic.types;
  return !!(
    (t.decls && t.decls.length) ||
    (t.metavars && t.metavars.length) ||
    (t.reconstructed && t.reconstructed.length) ||
    (semantic.identity && semantic.identity.length) ||
    (semantic.deriveAttempted && semantic.deriveAttempted.length)
  );
}

/**
 * @param {object} deps
 * @param {ReturnType<import('./work.mjs').createWork>} deps.work
 * @param {{ get(id: string): any }} deps.settings
 * @param {{ createFile(name: string): string, listFiles(): Array<{ id: string, name: string }> }} [deps.files]
 *   work-files, for "Keep both" (theirs saved as a copy beside the file)
 */
export function createDocuments(deps) {
  var work = deps.work;
  var settings = deps.settings;
  var files = deps.files || null;
  var open = new Set();

  // One subscription for every open document: a change to a file's text,
  // from anywhere, reaches the document showing that file.
  work.onFileChange(function (e) {
    open.forEach(function (doc) { doc.noteFileChange(e); });
  });

  function load(documentId) {
    var conflict = work.readConflict(documentId);
    var stored = work.getText(documentId);
    if (conflict && conflict.theirs !== stored) {
      conflict.theirs = stored;
      work.writeConflict(documentId, conflict);
    }
    return {
      state: {
        meta: { documentId: documentId },
        editor: {
          text: conflict ? conflict.mine : stored,
          local: normalizeView(work.peekSession().views[documentId]),
        },
        semantic: normalizeSemantic(work.readCache(documentId)),
      },
      base: conflict ? conflict.base : stored,
      conflicted: !!conflict,
    };
  }

  function copyName(name) {
    return conflictedCopyName(name, new Set((files ? files.listFiles() : []).map(function (f) { return f.name; })));
  }

  /**
   * @param {{ documentId: string, debounceMs?: number }} opts
   */
  function createPersist(opts) {
    opts = opts || {};
    var documentId = opts.documentId;
    if (!documentId) throw new Error('createPersist needs a documentId');

    var loaded = load(documentId);
    var state = loaded.state;
    // The text this document last read from or wrote to storage.
    var base = loaded.base;
    var conflicted = loaded.conflicted;
    var saveTimer = null;
    var providers = null;
    var reconciling = false;
    var reconcileQueued = false;
    // What this document last wrote (or loaded) for the view and checkpoint,
    // serialized: the comparison that keeps an unchanged save from writing.
    var savedView = JSON.stringify(state.editor.local);
    var savedSemantic = JSON.stringify(state.semantic);

    function collectSemantic() {
      if (!providers || typeof providers.getSemantic !== 'function') return state.semantic;
      var exported = providers.getSemantic();
      if (!exported) return state.semantic;
      var text = state.editor.text;
      var docFp = typeof providers.getDocFp === 'function'
        ? providers.getDocFp(text)
        : documentFingerprint(text);
      var belugaBuild = typeof providers.getBelugaBuild === 'function'
        ? providers.getBelugaBuild()
        : settings.get('belugaMode');
      var scopeKey = typeof exported.scopeKey === 'string' ? exported.scopeKey
        : (typeof providers.getScopeKey === 'function' ? providers.getScopeKey() : '');
      var semantic = {
        docFp: docFp,
        scopeKey: scopeKey,
        belugaBuild: belugaBuild,
        types: exported.types || { v: 1, decls: [], metavars: [], reconstructed: [] },
        identity: exported.identity || [],
        deriveAttempted: exported.deriveAttempted || [],
      };
      return semanticHasPayload(semantic) ? semantic : null;
    }

    function collectView() {
      if (providers && typeof providers.getViewport === 'function') {
        return normalizeView(providers.getViewport());
      }
      return state.editor.local || {};
    }

    // Materialize the live document string. Prefer a lazy provider (the editor's
    // live doc) so the whole-buffer toString() happens HERE, at debounced save
    // time, off the input critical path, instead of on every keystroke.
    function collectText() {
      if (providers && typeof providers.getText === 'function') {
        try {
          var live = providers.getText();
          if (live != null) return String(live);
        } catch (_) { /* fall through to last-known text */ }
      }
      return state.editor.text;
    }

    // The editor's text as it stands, with no save transforms (getText formats
    // and trims on the way out; a comparison must not). An editor without
    // peekText is asked with getText rather than trusting the last saved text.
    function peekText() {
      var read = providers && (typeof providers.peekText === 'function' ? providers.peekText
        : (typeof providers.getText === 'function' ? providers.getText : null));
      if (read) {
        try {
          var t = read();
          if (t != null) return String(t);
        } catch (_) { /* fall through */ }
      }
      return state.editor.text;
    }

    // An editor that cannot take a change from elsewhere must not be told it
    // has one: its next save would put the old text straight back.
    function canShow() {
      return !providers || typeof providers.applyExternalText === 'function';
    }

    function show(text) {
      state.editor.text = text;
      if (providers && typeof providers.applyExternalText === 'function') providers.applyExternalText(text);
    }

    function announceConflict(source) {
      var g = typeof window !== 'undefined' ? window : null;
      if (g && typeof g.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        g.dispatchEvent(new CustomEvent('beljar:text-conflict', { detail: { fileId: documentId, source: source } }));
      }
    }

    /**
     * The file changed underneath this document. Nothing unsaved here: take
     * theirs. Unsaved edits that do not touch theirs: merge, show, save. Edits
     * that do: keep both (mine in the conflict record, theirs in storage),
     * write nothing over either, and ask.
     *
     * A conflict record already there when the text moves was written by
     * whoever moved it (the sync engine, merging another device's version):
     * the two sides collided there, and this editor's text is mine.
     */
    function reconcile() {
      reconcileQueued = false;
      if (reconciling || !work.hasFile(documentId)) return;
      var stored = work.getText(documentId);
      if (conflicted) {
        var rec = work.readConflict(documentId);
        if (rec && rec.theirs !== stored) {
          rec.theirs = stored;
          work.writeConflict(documentId, rec);
        }
        return;
      }
      if (stored === base) return;
      var found = work.readConflict(documentId);
      if (found) {
        conflicted = true;
        base = found.base;
        work.writeConflict(documentId, {
          base: found.base, mine: peekText(), theirs: stored, at: found.at, source: found.source,
        });
        announceConflict(found.source);
        return;
      }
      reconciling = true;
      try {
        var mine = peekText();
        if (mine === stored) {
          base = stored;
        } else if (mine === base && canShow()) {
          base = stored;
          show(stored);
        } else {
          var m = merge3(base, mine, stored);
          if (m.ok && canShow()) {
            base = stored;
            show(m.text);
            scheduleSave();
          } else {
            // Theirs came from another device when sync wrote it last; from
            // another tab otherwise.
            var source = work.textOrigin(documentId) === 'sync' ? 'device' : 'tab';
            conflicted = true;
            work.writeConflict(documentId, { base: base, mine: mine, theirs: stored, at: Date.now(), source: source });
            announceConflict(source);
          }
        }
      } finally {
        reconciling = false;
      }
    }

    function noteFileChange(e) {
      if (e.fid !== null && (e.fid !== documentId || e.pid !== work.projectId())) return;
      if (reconcileQueued) return;
      reconcileQueued = true;
      // After the writer finishes (a rename rewrites several files at once),
      // and outside the store's notification loop. A resolved promise, not
      // queueMicrotask: the same timing, with no global to be missing (a
      // throw here would vanish into the store's listener guard).
      Promise.resolve().then(reconcile);
    }

    function persistNow() {
      clearTimeout(saveTimer);
      saveTimer = null;
      if (reconciling) {
        // Re-entered from inside a reconcile (closing an undo burst flushes):
        // save on the next tick instead, from the merged text.
        scheduleSave();
        return;
      }
      var exists = work.hasFile(documentId);
      // A change underneath that has not been handled yet: handle it first.
      if (exists && !conflicted && work.getText(documentId) !== base) reconcile();

      state.editor.text = collectText();
      state.editor.local = collectView();
      state.semantic = collectSemantic();
      // A deleted file keeps its text in memory and never comes back to storage.
      if (!exists) return;

      if (conflicted) {
        // Storage keeps theirs until a person chooses; mine lives in the record.
        var rec = work.readConflict(documentId);
        if (rec && rec.mine !== state.editor.text) {
          rec.mine = state.editor.text;
          work.writeConflict(documentId, rec);
        }
      } else if (state.editor.text !== base) {
        if (work.setText(documentId, state.editor.text).ok) base = state.editor.text;
      }
      var view = JSON.stringify(state.editor.local);
      if (view !== savedView) {
        var local = state.editor.local;
        if (work.updateSession(function (s) { s.views[documentId] = local; }).ok) savedView = view;
      }
      var semantic = JSON.stringify(state.semantic);
      if (semantic !== savedSemantic) {
        // A cache that cannot fit fails quietly (the store's rule): it is recomputable.
        if (work.writeCache(documentId, state.semantic).ok) savedSemantic = semantic;
      }
    }

    function scheduleSave() {
      clearTimeout(saveTimer);
      var delay = opts.debounceMs != null ? opts.debounceMs : settings.get('autosaveDelay');
      saveTimer = globalThis.setTimeout(persistNow, delay);
    }

    // Push path: a caller that already holds the string hands it over. The lazy
    // getText provider (when set) supersedes this at save time.
    function scheduleEditorPersist(text) {
      if (text != null) state.editor.text = String(text);
      scheduleSave();
    }

    // Input-path entry point: mark the buffer dirty and schedule a save WITHOUT
    // materializing the whole document. persistNow() pulls the live text lazily.
    function markEditorDirty() {
      scheduleSave();
    }

    function cancelPendingSave() {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    // Sync the in-memory text without scheduling a save (storage already has it).
    function replaceEditorText(text) {
      cancelPendingSave();
      state.editor.text = String(text != null ? text : '');
      if (!conflicted && work.getText(documentId) === state.editor.text) base = state.editor.text;
    }

    /**
     * Is there an edit that has not reached storage yet?
     *
     * ⛔ `flushCheckpoint` saves whether or not anything is pending. That is
     * right for the once-per-session unload hooks, and wrong for anything that
     * fires repeatedly: `visibilitychange` fires on every alt-tab, and with two
     * tabs open on one project a clean tab flushing is the clean one
     * overwriting the other's work.
     */
    function hasPendingSave() {
      return saveTimer != null;
    }

    function flushCheckpointIfDirty() {
      if (saveTimer != null) persistNow();
    }

    function getInitialCheckpoint() {
      return JSON.parse(JSON.stringify(state));
    }

    function setCheckpointProviders(next) {
      providers = next || null;
    }

    function switchFile(newId) {
      if (!newId) return null;
      // Save the current file while its providers still reflect it.
      persistNow();
      // Drop the providers: they point at the OLD document's engine. If a save
      // fires before the new editor remounts and re-sets them, it must fall
      // back to the freshly loaded state, never collect old-engine data under
      // the new file.
      providers = null;
      documentId = newId;
      var next = load(documentId);
      state = next.state;
      base = next.base;
      conflicted = next.conflicted;
      savedView = JSON.stringify(state.editor.local);
      savedSemantic = JSON.stringify(state.semantic);
      return getInitialCheckpoint();
    }

    /** Both sides of an unresolved conflict on this file, and where theirs came from ('tab' | 'device'), or null. */
    function getConflict() {
      if (!conflicted) return null;
      var rec = work.readConflict(documentId);
      return {
        fileId: documentId,
        base: rec ? rec.base : base,
        mine: peekText(),
        theirs: work.getText(documentId),
        source: rec ? rec.source : 'tab',
      };
    }

    /**
     * Settle a conflict. 'mine': keep this editor's text. 'theirs': take the
     * other side's. 'both': keep mine here and save theirs as a copy beside it.
     * Every write that keeps something lands before the record that held it
     * goes, so an interruption loses neither side.
     */
    function resolveConflict(choice) {
      if (!conflicted) return { ok: false, reason: 'no-conflict' };
      if (choice !== 'mine' && choice !== 'theirs' && choice !== 'both') return { ok: false, reason: 'unknown-choice' };
      cancelPendingSave();
      var theirs = work.getText(documentId);
      var mine = peekText();
      if (choice === 'theirs') {
        base = theirs;
        show(theirs);
        conflicted = false;
        work.removeConflict(documentId);
        return { ok: true, copyId: null };
      }
      var copyId = null;
      if (choice === 'both') {
        if (!files) return { ok: false, reason: 'no-files' };
        var file = work.peekTree().files.find(function (f) { return f.id === documentId; });
        copyId = files.createFile(copyName(file ? file.name : 'untitled'));
        if (!work.setText(copyId, theirs).ok) return { ok: false, reason: 'write-failed' };
      }
      if (!work.setText(documentId, mine).ok) return { ok: false, reason: 'write-failed', copyId: copyId };
      base = mine;
      state.editor.text = mine;
      conflicted = false;
      work.removeConflict(documentId);
      return { ok: true, copyId: copyId };
    }

    var handle = { noteFileChange: noteFileChange };
    open.add(handle);

    return {
      getEditorText: function () { return state.editor.text; },
      getEditorLocal: function () { return normalizeView(state.editor.local); },
      getSemanticCheckpoint: function () {
        return state.semantic ? JSON.parse(JSON.stringify(state.semantic)) : null;
      },
      getInitialCheckpoint: getInitialCheckpoint,
      getCurrentFileId: function () { return documentId; },
      scheduleEditorPersist: scheduleEditorPersist,
      markEditorDirty: markEditorDirty,
      scheduleCheckpointSave: scheduleSave,
      cancelPendingSave: cancelPendingSave,
      replaceEditorText: replaceEditorText,
      flushCheckpoint: persistNow,
      flushCheckpointIfDirty: flushCheckpointIfDirty,
      hasPendingSave: hasPendingSave,
      setCheckpointProviders: setCheckpointProviders,
      switchFile: switchFile,
      getConflict: getConflict,
      resolveConflict: resolveConflict,
      /** Stop listening for changes underneath (tests; a page never closes its document). */
      dispose: function () {
        cancelPendingSave();
        open.delete(handle);
      },
    };
  }

  return { createPersist: createPersist };
}

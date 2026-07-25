// Per-file health: live own-diags while open, keyed observation when left.
// Forget the instant content or prelude identity changes. No seals, no layers.

import { healthFromDiagnostics } from './file-health-store.mjs';
import { fileContentSig, developmentSignature } from './development-check.mjs';
import { developmentForFile } from './development.mjs';

function cloneItems(items) {
  return (items || []).map((it) => ({
    line: it.line,
    msg: it.msg || it.message || '',
    kind: it.kind === 'warning' || it.severity === 'warning' ? 'warning' : 'error',
  }));
}

function cloneRows(rows) {
  return (rows || []).map((d) => ({
    line: d.line,
    message: d.message || d.msg || '',
    severity: d.severity === 'warning' || d.kind === 'warning' ? 'warning' : 'error',
  }));
}

function emptyHealth() {
  return { errors: 0, warnings: 0, items: [], stale: false, diagnostics: [] };
}

function rowsToHealth(rows) {
  const base = healthFromDiagnostics(rows || []);
  return {
    errors: base.errors,
    warnings: base.warnings,
    items: base.items,
    stale: false,
    diagnostics: cloneRows(rows),
  };
}

function fileKey(fileId) {
  return fileId == null ? '' : String(fileId);
}

export function makeHealthKey(scopeKey, contentSig, preludeSig) {
  return `${scopeKey || ''}|${contentSig || ''}|${preludeSig || ''}`;
}

/** Prelude members before fileId in load order (empty if first / standalone). */
export function preludeMembersFor(members, fileId) {
  const list = Array.isArray(members) ? members : [];
  const idx = list.findIndex((m) => m.id === fileId);
  if (idx <= 0) return [];
  return list.slice(0, idx);
}

export function healthKeyFromParts({ scopeKey, text, preludeMembers }) {
  return makeHealthKey(
    scopeKey || 'standalone:',
    fileContentSig(text),
    developmentSignature(Array.isArray(preludeMembers) ? preludeMembers : []),
  );
}

/**
 * Compute the observation key for a project file from Persist-shaped inputs.
 * `members` is full development member list in load order (optional; derived if absent).
 */
export function computeFileHealthKey(fileId, {
  files,
  getText,
  text = null,
  members = null,
  developmentOptions = {},
} = {}) {
  const id = fileKey(fileId);
  if (!id || !files) return makeHealthKey('standalone:', fileContentSig(text ?? ''), '');
  const file = files.find((f) => f.id === id);
  const body = text != null ? text : String(typeof getText === 'function' ? getText(id) : (file?.text ?? ''));
  const get = typeof getText === 'function' ? getText : (fid) => {
    const f = files.find((x) => x.id === fid);
    return f ? String(f.text ?? '') : '';
  };
  const dev = developmentForFile(files, id, get, developmentOptions);
  let preludeMembers;
  if (Array.isArray(members)) {
    preludeMembers = preludeMembersFor(members, id);
  } else {
    const byName = new Map(files.map((f) => [f.name, f]));
    preludeMembers = (dev.preludePaths || []).map((path) => {
      const f = byName.get(path);
      if (!f) return null;
      return { id: f.id, name: f.name, text: String(get(f.id) ?? '') };
    }).filter(Boolean);
  }
  return healthKeyFromParts({
    scopeKey: dev.scopeKey,
    text: body,
    preludeMembers,
  });
}

export function createProjectDiagnostics() {
  const observations = new Map(); // fileId -> { key, errors, warnings, items, source }
  const fileNames = new Map();
  let activeLive = null; // { fileId, rows }
  let notifyPending = false;
  let pendingFileIds = null;
  const listeners = new Set();

  function rememberName(fileId, fileName) {
    const id = fileKey(fileId);
    if (!id) return;
    if (fileName) fileNames.set(id, fileName);
  }

  function scheduleNotify(fileIds, quiet) {
    if (quiet) return;
    if (fileIds) {
      if (!pendingFileIds) pendingFileIds = new Set();
      for (const id of fileIds) pendingFileIds.add(id);
    } else {
      pendingFileIds = null;
    }
    if (notifyPending) return;
    notifyPending = true;
    queueMicrotask(() => {
      notifyPending = false;
      const ids = pendingFileIds ? [...pendingFileIds] : null;
      pendingFileIds = null;
      const detail = ids ? { fileIds: ids } : {};
      for (const fn of listeners) {
        try { fn(detail); } catch (_) { /* consumer fault */ }
      }
      const g = typeof window !== 'undefined' ? window : globalThis;
      if (typeof g.dispatchEvent === 'function') {
        g.dispatchEvent(new CustomEvent('beljar:diagnostics-changed', { detail }));
        g.dispatchEvent(new CustomEvent('beljar:explorer-health-changed', { detail }));
      }
    });
  }

  function registerFiles(files) {
    for (const f of files || []) {
      if (f?.id) rememberName(f.id, f.name);
    }
  }

  /** Open-file paint only — does not write durable memory. */
  function setActiveLive(fileId, rows, opts = {}) {
    const id = fileKey(fileId);
    if (!id) return;
    if (opts.fileName) rememberName(id, opts.fileName);
    const prev = activeLive?.fileId;
    activeLive = { fileId: id, rows: cloneRows(rows) };
    const touched = new Set([id]);
    if (prev && prev !== id) touched.add(prev);
    scheduleNotify(touched, opts.quiet);
  }

  function clearActiveLive(opts = {}) {
    if (!activeLive) return;
    const prev = activeLive.fileId;
    activeLive = null;
    scheduleNotify(prev ? [prev] : null, opts.quiet);
  }

  /**
   * Durable observation after settle (or development). Survives leave until key
   * no longer matches current content+prelude.
   * Never overwrite a live observation with a development one for the same key.
   */
  function setObservation(fileId, rows, opts = {}) {
    const id = fileKey(fileId);
    if (!id) return;
    if (opts.fileName) rememberName(id, opts.fileName);
    const key = opts.key || makeHealthKey(opts.scopeKey, opts.contentSig, opts.preludeSig);
    if (!key || key.endsWith('||') && !opts.key) {
      // still allow explicit empty prelude
    }
    const source = opts.source === 'development' ? 'development' : 'live';
    const prev = observations.get(id);
    if (source === 'development' && prev && prev.source === 'live' && prev.key === key) {
      return; // live wins for the same key
    }
    const health = rowsToHealth(rows);
    observations.set(id, {
      key,
      errors: health.errors,
      warnings: health.warnings,
      items: health.items,
      diagnostics: health.diagnostics,
      source,
    });
    scheduleNotify([id], opts.quiet);
  }

  /** @deprecated alias — prefer setObservation after settle */
  function setActiveObservation(fileId, rows, opts = {}) {
    setActiveLive(fileId, rows, opts);
    setObservation(fileId, rows, { ...opts, source: 'live' });
  }

  function forget(fileId, opts = {}) {
    const id = fileKey(fileId);
    if (!id) return;
    if (!observations.has(id)) return;
    observations.delete(id);
    scheduleNotify([id], opts.quiet);
  }

  function forgetWhere(pred, opts = {}) {
    if (typeof pred !== 'function') return;
    const touched = [];
    for (const [id, obs] of observations) {
      if (!pred(id, obs)) continue;
      observations.delete(id);
      touched.push(id);
    }
    if (touched.length) scheduleNotify(touched, opts.quiet);
  }

  function forgetScope(scopeKeyPrefix, opts = {}) {
    const prefix = String(scopeKeyPrefix || '');
    if (!prefix) return;
    forgetWhere((_id, obs) => String(obs.key || '').startsWith(prefix), opts);
  }

  /**
   * @param {string} fileId
   * @param {{ currentKey?: string, quiet?: boolean }} [opts]
   *   If currentKey omitted, tries Persist to recompute — mismatch drops the observation.
   */
  function forFile(fileId, opts = {}) {
    const id = fileKey(fileId);
    if (!id) return emptyHealth();

    if (activeLive && activeLive.fileId === id) {
      return rowsToHealth(activeLive.rows);
    }

    const obs = observations.get(id);
    if (!obs) return emptyHealth();

    let currentKey = opts.currentKey;
    if (currentKey === undefined) {
      try {
        const g = typeof window !== 'undefined' ? window : globalThis;
        const P = g.Persist;
        if (P?.listFiles && P?.getFileText) {
          currentKey = computeFileHealthKey(id, {
            files: P.listFiles(),
            getText: (fid) => String(P.getFileText(fid) ?? ''),
          });
        }
      } catch (_) { currentKey = undefined; }
    }
    if (currentKey != null && obs.key !== currentKey) {
      observations.delete(id);
      scheduleNotify([id], opts.quiet);
      return emptyHealth();
    }

    return {
      errors: obs.errors || 0,
      warnings: obs.warnings || 0,
      items: (obs.items || []).map((it) => ({ ...it })),
      stale: false,
      diagnostics: cloneRows(obs.diagnostics || []),
    };
  }

  function severity(fileId, opts = {}) {
    const h = forFile(fileId, opts);
    if (h.errors > 0) return 'error';
    if (h.warnings > 0) return 'warning';
    return null;
  }

  function listProject(opts = {}) {
    const ids = new Set([...observations.keys(), ...(activeLive ? [activeLive.fileId] : [])]);
    const out = [];
    const seen = new Set();
    for (const id of ids) {
      const keyFn = opts.keyForFile;
      const currentKey = typeof keyFn === 'function' ? keyFn(id) : undefined;
      const health = forFile(id, { currentKey, quiet: true });
      const name = fileNames.get(id) || id;
      for (const it of health.items || []) {
        if (it.kind !== 'error' && it.kind !== 'warning') continue;
        const k = `${id}\0${it.line}\0${it.msg || ''}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({
          fileId: id,
          fileName: name,
          line: it.line,
          message: it.msg || '',
          severity: it.kind,
          stale: false,
        });
      }
    }
    out.sort((a, b) => {
      const an = a.fileName.localeCompare(b.fileName);
      if (an) return an;
      return (a.line || 0) - (b.line || 0);
    });
    return out;
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function clear() {
    observations.clear();
    fileNames.clear();
    activeLive = null;
    scheduleNotify(null);
  }

  // Back-compat no-ops so old call sites don't explode during peel.
  function setSyntax() {}
  function applyLayer() {}
  function applyNamedLayer() {}
  function getDevelopmentSig() { return null; }

  return {
    setActiveLive,
    clearActiveLive,
    setObservation,
    setActiveObservation,
    forget,
    forgetWhere,
    forgetScope,
    forFile,
    severity,
    listProject,
    registerFiles,
    subscribe,
    clear,
    // compat
    setSyntax,
    applyLayer,
    applyNamedLayer,
    getDevelopmentSig,
  };
}

let shared = null;

export function getProjectDiagnostics() {
  if (!shared) shared = createProjectDiagnostics();
  return shared;
}

export function _resetProjectDiagnosticsForTests(instance = null) {
  shared = instance;
}

/** @deprecated Layers removed — kept for import compatibility in tests during migration. */
export function mergeFileLayers() {
  return emptyHealth();
}

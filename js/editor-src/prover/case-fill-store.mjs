// case-fill-store.mjs — what case completion knows about the open proofs: per file, per
// proof, the missing cases (rows) and what became of each. The ghosts render it; the
// scheduler writes it. Nothing here touches a document.
//
// Verdicts live in the assignment table (case-assignment.mjs), the one vocabulary the
// surface may use: a row starts `pending`, becomes `checked` only through recordVerdict
// with a fill that passed, and a row nothing could fill is `refused` with its reason.
// The arm text, its source and the row's search state ride beside the table.

import { buildTable, recordVerdict, VERDICTS } from './case-assignment.mjs';

const files = new Map(); // fileId -> Map(recKey -> entry)
const listeners = new Set();

export const recKeyOf = (name, ordinal = 0) => `${name}#${ordinal}`;

function emit(fileId) {
  for (const fn of listeners) {
    try { fn(fileId); } catch (_) { /* a listener must never take the store down */ }
  }
  const g = typeof globalThis !== 'undefined' ? globalThis : null;
  if (g && typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function') {
    g.dispatchEvent(new g.CustomEvent('beljar:case-fill-updated', { detail: { fileId } }));
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const entriesOf = (fileId) => {
  if (!files.has(fileId)) files.set(fileId, new Map());
  return files.get(fileId);
};

/** Every entry of a file, for rendering. */
export function entries(fileId) {
  return [...(files.get(fileId) || new Map()).values()];
}

export function entry(fileId, recKey) {
  return (files.get(fileId) || new Map()).get(recKey) || null;
}

/**
 * A plan arrived from the worker. `fingerprint` is the proof's text when the job started;
 * the entry is only ever shown while the proof still reads the same.
 */
export function setPlan(fileId, recKey, { recName, ordinal, fingerprint, eligibility, rows, unbuilt, why, forced }) {
  const table = buildTable({
    judgment: recName,
    rules: rows.map((r) => ({ name: r.key })),
    pieces: [],
    assign: () => ({ pieceId: 'pending' }),
    strength: eligibility ? eligibility.strength : undefined,
  });
  const rowMap = new Map(rows.map((r) => [r.key, {
    key: r.key, rule: r.rule, pattern: r.pattern, anchor: r.anchor,
    state: 'waiting', text: null, source: null, donor: null, why: null, forced: !!forced,
  }]));
  entriesOf(fileId).set(recKey, {
    recKey, recName, ordinal, fingerprint, eligibility, table, rows: rowMap,
    unbuilt: !!unbuilt, why: why || null, forced: !!forced,
  });
  emit(fileId);
}

/** A row is being searched (only a forced row is ever drawn as searching). */
export function setSearching(fileId, recKey, key) {
  const e = entry(fileId, recKey);
  const row = e && e.rows.get(key);
  if (!row || row.state === 'dismissed') return;
  row.state = 'searching';
  emit(fileId);
}

/** A row's result arrived. */
export function setResult(fileId, recKey, { key, ok, text, source, donor, why }) {
  const e = entry(fileId, recKey);
  const row = e && e.rows.get(key);
  if (!row || row.state === 'dismissed') return;
  e.table = recordVerdict(e.table, key, ok ? { ok: true } : { ok: false, error: why || 'not filled' });
  Object.assign(row, ok
    ? { state: 'filled', text, source, donor, why: null }
    : { state: 'none', text: null, source: null, donor: null, why: why || 'not filled' });
  emit(fileId);
}

/** The person said no to a filled row; it stays out of sight for this version of the proof. */
export function dismiss(fileId, recKey, key) {
  const e = entry(fileId, recKey);
  const row = e && e.rows.get(key);
  if (!row) return false;
  row.state = 'dismissed';
  emit(fileId);
  return true;
}

/**
 * Some filled rows went into the document. They leave the entry, and the entry now
 * belongs to the proof as it reads after the edit (`fingerprint`): the rows still
 * waiting were each checked with the others parked, and an accepted arm stands exactly
 * where its parked hole stood, so they stay valid and are not searched again.
 */
export function acceptRows(fileId, recKey, keys, fingerprint) {
  const e = entry(fileId, recKey);
  if (!e) return;
  for (const k of keys) e.rows.delete(k);
  e.fingerprint = fingerprint;
  emit(fileId);
}

/** Forget a proof (it was edited, accepted, or the setting turned off). */
export function drop(fileId, recKey) {
  const m = files.get(fileId);
  if (m && m.delete(recKey)) emit(fileId);
}

export function dropFile(fileId) {
  if (files.delete(fileId)) emit(fileId);
}

/** The verdict a row shows, in the table's own words. */
export function verdictOf(e, key) {
  const t = e && e.table && e.table.rows.find((r) => r.rule === key);
  return t ? t.verdict : VERDICTS.pending;
}

/** For tests. */
export function resetStore() {
  files.clear();
}

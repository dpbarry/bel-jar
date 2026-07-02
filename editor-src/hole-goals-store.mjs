// Unified goal types for Harpoon (and future consumers): settlement and the
// development checker both write here; reads succeed only when the stored
// content signature still matches the file text (edit → miss → recalculating).

import { fileContentSig } from './development-check.mjs';

function cloneHoles(holes) {
  return (holes || []).map((h) => ({ ...h }));
}

export function createHoleGoalsStore() {
  /** @type {Map<string, { sig: string, holes: object[] }>} */
  const byFile = new Map();

  function set(fileName, sig, holes) {
    if (!fileName || !sig || !holes?.length) return;
    byFile.set(fileName, { sig, holes: cloneHoles(holes) });
  }

  function fresh(fileName, sig) {
    if (!fileName || !sig) return null;
    const hit = byFile.get(fileName);
    if (!hit || hit.sig !== sig) return null;
    return cloneHoles(hit.holes);
  }

  function freshMap(fileEntries) {
    const out = {};
    for (const { name, text } of fileEntries || []) {
      if (!name) continue;
      const holes = fresh(name, fileContentSig(text));
      if (holes?.length) out[name] = holes;
    }
    return out;
  }

  function applyDevelopment(members, memberHoles) {
    if (!members?.length || !memberHoles) return;
    for (const m of members) {
      const holes = memberHoles[m.name];
      if (holes?.length) set(m.name, fileContentSig(m.text), holes);
    }
  }

  return { set, fresh, freshMap, applyDevelopment, clear: () => byFile.clear() };
}

let shared = null;

export function getHoleGoalsStore() {
  if (!shared) shared = createHoleGoalsStore();
  return shared;
}

export function syncHoleGoalsFromSettlement(ctx, checkerSnap, getTextByName) {
  if (!checkerSnap || checkerSnap.state !== 'ready') return;
  const store = getHoleGoalsStore();
  const active = ctx?.activeFileName;
  if (active && checkerSnap.holes?.length) {
    const text = ctx.fileCode != null ? ctx.fileCode : '';
    store.set(active, fileContentSig(text), checkerSnap.holes);
  }
  const memberHoles = checkerSnap.memberHoles || {};
  for (const name of Object.keys(memberHoles)) {
    const holes = memberHoles[name];
    if (!holes?.length) continue;
    const text = typeof getTextByName === 'function' ? getTextByName(name) : '';
    store.set(name, fileContentSig(text ?? ''), holes);
  }
}

export function syncHoleGoalsFromDevelopment(members, memberHoles) {
  getHoleGoalsStore().applyDevelopment(members, memberHoles);
}

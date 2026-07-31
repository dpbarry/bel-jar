import { typeCompatibleWithGoal } from '../../prover/hole-split.mjs';
import { NAMESPACE } from '../../semantic/ids.mjs';
import { isCompatibleGlobal } from '../../semantic/symbol-store.mjs';
import { firstIdentChild } from '../../tree-helpers.mjs';

const CM_TYPE = Object.freeze({
  [NAMESPACE.LF_TYPE_FAMILY]: 'type',
  [NAMESPACE.LF_CONSTANT]: 'constant',
  [NAMESPACE.LF_CONSTRUCTOR]: 'class',
  [NAMESPACE.SCHEMA]: 'namespace',
  [NAMESPACE.TYPEDEF]: 'type',
  [NAMESPACE.COMP_TYPE]: 'type',
  [NAMESPACE.COMP_CONSTRUCTOR]: 'class',
  [NAMESPACE.REC_FUNCTION]: 'function',
  [NAMESPACE.MODULE]: 'namespace',
  [NAMESPACE.LOCAL_LOWER]: 'variable',
  [NAMESPACE.LOCAL_UPPER]: 'variable',
  [NAMESPACE.PRAGMA]: 'keyword',
});

function cmTypeFor(namespace) {
  return CM_TYPE[namespace] || 'text';
}

function signatureKindFor(namespace) {
  return namespace === NAMESPACE.LF_TYPE_FAMILY
    || namespace === NAMESPACE.LF_CONSTANT
    || namespace === NAMESPACE.LF_CONSTRUCTOR
    ? 'lf'
    : 'comp';
}

function dirOf(filePath) {
  const s = String(filePath || '').replaceAll('\\', '/');
  const i = s.lastIndexOf('/');
  return i < 0 ? '' : s.slice(0, i);
}

// Asymmetric proximity: prefer already-defined (above) slightly, but keep
// co-recursive helpers below the cursor competitive.
function proximityScore(symFrom, pos) {
  const delta = pos - (symFrom || 0);
  if (delta >= 0) return Math.max(0, 15 - Math.floor(delta / 200));
  return Math.max(0, 12 - Math.floor(Math.abs(delta) / 250));
}

function enclosingRecName(engine, pos) {
  const snap = engine?.stores?.syntax?.getSnapshot?.();
  const tree = snap?.tree;
  const doc = snap?.doc;
  if (!tree || !doc || pos == null) return null;
  for (let p = tree.resolveInner(pos, -1); p; p = p.parent) {
    if (p.name === 'RecBody') {
      const id = firstIdentChild(p);
      return id ? doc.sliceString(id.from, id.to) : null;
    }
  }
  return null;
}

// In-file scope + optional suite peers. Never scans the corpus — peers come from
// the already-cached listGroupSymbols path via getPeerSymbols.
export function contributeIdents(site, engine, opts = {}) {
  if (!site || site.kind !== 'ident' || !engine) return [];
  const store = engine.stores?.symbols;
  if (!store || typeof store.visibleSymbolsAt !== 'function') return [];

  const pos = site.from;
  const allowLocals = site.allowLocals !== false;
  const localsOnly = !!site.localsOnly;
  const visible = store.visibleSymbolsAt(pos, {
    // Locals-only sites pass an empty Set so every global is excluded.
    namespaces: site.namespaces || null,
    refKind: site.refKind || null,
  }).filter((sym) => {
    if (!sym) return false;
    if (!sym.isGlobal) return allowLocals;
    return !localsOnly;
  });

  const goal = site.expectedType || null;
  const recName = enclosingRecName(engine, pos);
  const activeDir = dirOf(opts.activePath || '');

  const items = [];
  const seen = new Set();
  for (let i = 0; i < visible.length; i++) {
    const sym = visible[i];
    if (!sym?.name || seen.has(sym.name)) continue;
    seen.add(sym.name);
    const isLocal = !sym.isGlobal;
    const signature = sym.sourceText || null;
    // J3 REORDERS, it never removes. Type text is matched by string surgery, so a
    // `false` verdict is not proof of ill-typedness — `plus : [|- nat] -> [|- nat]`
    // is a legal head at goal `[|- nat]` once applied. Withholding a name the user
    // is actively typing is far worse than ranking it a few rows down.
    let just = site.namespaces ? 2 : 1;
    if (goal && sym.sourceText && typeCompatibleWithGoal(sym.sourceText, goal) === true) {
      just = 3;
    }
    let proximity = isLocal ? 20 : proximityScore(sym.nameRange?.from, pos);
    // Recursive call inside its own body — the most common proof completion.
    if (recName && sym.name === recName) proximity += 25;
    // Do not set `info` — CM opens a side completionInfo panel. The row carries
    // a syntax-highlighted signature when source text is available.
    items.push({
      label: sym.name,
      insert: sym.name,
      kind: isLocal ? 'local' : 'global',
      signature,
      signatureKind: signature ? signatureKindFor(sym.namespace) : null,
      source: 'ident',
      cmType: cmTypeFor(sym.namespace),
      just,
      scoreHints: {
        base: isLocal ? 80 : 40,
        proximity,
      },
      _index: i,
    });
  }

  const peers = typeof opts.getPeerSymbols === 'function' ? opts.getPeerSymbols() : null;
  if (!localsOnly && peers && peers.length) {
    for (const p of peers) {
      const name = p && p.name;
      if (!name || !p.namespace || seen.has(name)) continue;
      if (site.namespaces && !site.namespaces.has(p.namespace)) continue;
      if (!site.namespaces && !isCompatibleGlobal(site.refKind, p.namespace)) continue;
      seen.add(name);
      const signature = p.sourceText || null;
      const sameDir = activeDir && dirOf(p.fileName || p.path || '') === activeDir;
      items.push({
        label: name,
        insert: name,
        kind: 'peer',
        signature,
        signatureKind: signature ? signatureKindFor(p.namespace) : null,
        source: 'peer',
        cmType: cmTypeFor(p.namespace),
        just: site.namespaces ? 2 : 1,
        scoreHints: { base: sameDir ? 25 : 10, proximity: 0 },
      });
    }
  }
  return items;
}

// Members of a resolved MODULE after `Foo.`. Closed set from the symbol store —
// never invents path segments. Unknown / empty module → [].
export function contributeModuleMembers(site, engine) {
  if (!site || site.kind !== 'module-member' || !engine) return [];
  const store = engine.stores?.symbols;
  if (!store || typeof store.membersOfModule !== 'function') return [];
  const members = store.membersOfModule(site.moduleName, site.from);
  if (!members || !members.length) return [];

  const items = [];
  const seen = new Set();
  for (let i = 0; i < members.length; i++) {
    const sym = members[i];
    if (!sym?.name || seen.has(sym.name)) continue;
    seen.add(sym.name);
    items.push({
      label: sym.name,
      insert: sym.name,
      kind: 'member',
      signature: sym.sourceText || null,
      signatureKind: sym.sourceText ? signatureKindFor(sym.namespace) : null,
      source: 'module-member',
      cmType: cmTypeFor(sym.namespace),
      just: 2,
      scoreHints: {
        base: 90,
        proximity: Math.max(0, 10 - i),
      },
      _index: i,
    });
  }
  return items;
}

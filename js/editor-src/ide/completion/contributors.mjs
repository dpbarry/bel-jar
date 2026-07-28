import { typeCompatibleWithGoal } from '../../prover/hole-split.mjs';
import { NAMESPACE } from '../../semantic/ids.mjs';
import { dirOf } from '../../semantic/development.mjs';
import { isCompatibleGlobal } from '../../semantic/symbol-store.mjs';

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

function truncateDetail(text, max = 48) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// Peer path label relative to the active file's folder: same dir → basename (or
// nested relative); elsewhere → full project path as stored.
export function peerFileDetail(fileName, activePath) {
  const file = String(fileName || '').replace(/\\/g, '/');
  if (!file) return undefined;
  const cwd = dirOf(String(activePath || '').replace(/\\/g, '/'));
  if (cwd && (file === cwd || file.startsWith(`${cwd}/`))) {
    return file.slice(cwd.length + 1);
  }
  return file;
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

  const items = [];
  const seen = new Set();
  for (let i = 0; i < visible.length; i++) {
    const sym = visible[i];
    if (!sym?.name || seen.has(sym.name)) continue;
    seen.add(sym.name);
    const isLocal = !sym.isGlobal;
    const detail = truncateDetail(sym.sourceText) || sym.label || undefined;
    // J3 REORDERS, it never removes. Type text is matched by string surgery, so a
    // `false` verdict is not proof of ill-typedness — `plus : [|- nat] -> [|- nat]`
    // is a legal head at goal `[|- nat]` once applied. Withholding a name the user
    // is actively typing is far worse than ranking it a few rows down.
    let just = site.namespaces ? 2 : 1;
    if (goal && sym.sourceText && typeCompatibleWithGoal(sym.sourceText, goal) === true) {
      just = 3;
    }
    // Do not set `info` — CM opens a side completionInfo panel for it, and a
    // role label / truncated type already lives in `detail`.
    items.push({
      label: sym.name,
      insert: sym.name,
      kind: isLocal ? 'local' : 'global',
      detail,
      source: 'ident',
      cmType: cmTypeFor(sym.namespace),
      just,
      scoreHints: {
        base: isLocal ? 80 : 40,
        // Nearer decls beat farther ones (cursor distance, not later-in-file).
        proximity: isLocal
          ? 20
          : Math.max(0, 15 - Math.min(15, Math.floor(Math.abs((sym.nameRange?.from || 0) - pos) / 200))),
      },
      _index: i,
    });
  }

  const peers = typeof opts.getPeerSymbols === 'function' ? opts.getPeerSymbols() : null;
  const activePath = opts.activePath || '';
  if (!localsOnly && peers && peers.length) {
    for (const p of peers) {
      const name = p && p.name;
      if (!name || !p.namespace || seen.has(name)) continue;
      if (site.namespaces && !site.namespaces.has(p.namespace)) continue;
      if (!site.namespaces && !isCompatibleGlobal(site.refKind, p.namespace)) continue;
      seen.add(name);
      const pathLabel = peerFileDetail(p.fileName, activePath);
      items.push({
        label: name,
        insert: name,
        kind: 'peer',
        detail: pathLabel ? truncateDetail(pathLabel, 32) : undefined,
        source: 'peer',
        cmType: cmTypeFor(p.namespace),
        just: site.namespaces ? 2 : 1,
        scoreHints: { base: 10, proximity: 0 },
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
      detail: truncateDetail(sym.sourceText) || sym.label || undefined,
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

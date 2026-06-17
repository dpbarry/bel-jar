// Shared low-level Lezer-tree helpers for binder/scope logic.
//
// Theme G #24: bel-walk.mjs, bel-resolve.mjs (and, via walkTree, the
// scope-highlight plugin) all need the same primitives to find a declaration's
// head identifier, locate a named child, and recognise a global-decl parent.
// These were copied into each file; this module is the single source of truth.

// The set of grammar nodes whose head identifier names a top-level (global)
// declaration: type families, constructors/destructors, schemas, typedefs,
// modules, rec/proof bodies. Used to classify a binding site as global.
export const GLOBAL_DECL_PARENT = new Set([
  'LFDeclaration',
  'LFDatatypeDeclaration',
  'LFConstructor',
  'SchemaDeclaration',
  'TypedefDeclaration',
  'LetDeclaration',
  'ModuleDeclaration',
  'InductiveBody',
  'CoinductiveBody',
  'CompConstructor',
  'CompDestructor',
  'RecBody',
  'ProofDeclaration',
]);

// First direct child with the given node name, or null.
export function firstChildNamed(node, name) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === name) return c;
  }
  return null;
}

// The metavar identifier inside a ParameterVariable/SubstitutionVariable node
// (`#x` / `$x`), or null if the node isn't one of those or has no sigil+ident.
export function metaVarIdent(node) {
  const sigil = node.firstChild;
  if (!sigil || (sigil.name !== '#' && sigil.name !== '$')) return null;
  const id = sigil.nextSibling;
  if (id && (id.name === 'LowerIdentifier' || id.name === 'UpperIdentifier')) return id;
  return null;
}

// The head identifier of a declaration node: the first Lower/Upper identifier
// child, looking through a leading parameter/substitution variable sigil.
export function firstIdentChild(node) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LowerIdentifier' || c.name === 'UpperIdentifier') return c;
    if (c.name === 'ParameterVariable' || c.name === 'SubstitutionVariable') {
      const id = metaVarIdent(c);
      if (id) return id;
    }
  }
  return null;
}

// The grammar flattens a mutual LF block (`LF n : type = … and a : type = …`)
// into ONE LFDatatypeDeclaration with several head identifiers as direct
// children: the first name, then one after each `and`. A mutual head names a
// type family exactly like the first head — not an implicit reconstruction
// binder. Recognise it as: a direct Lower/Upper identifier child of an
// LFDatatypeDeclaration that is either the first such child OR immediately
// preceded (modulo `:` / `=` / kind / constructor-list noise) by an AndKeyword.
export function isLFDatatypeHead(ident) {
  const decl = ident.parent;
  if (!decl || decl.name !== 'LFDatatypeDeclaration') return false;
  // Lezer SyntaxNode wrappers are not reference-stable across traversals, so
  // match the target by position rather than `===`.
  const at = (c) => c && c.from === ident.from && c.to === ident.to;
  let sawHead = false;
  for (let c = decl.firstChild; c; c = c.nextSibling) {
    if (c.name === 'AndKeyword') {
      // The next identifier child opens a new mutual family.
      for (let h = c.nextSibling; h; h = h.nextSibling) {
        if (h.name === 'LowerIdentifier' || h.name === 'UpperIdentifier') {
          if (at(h)) return true;
          break;
        }
        if (h.name === 'AndKeyword' || h.name === 'LFConstructor') break;
      }
      continue;
    }
    if ((c.name === 'LowerIdentifier' || c.name === 'UpperIdentifier') && !sawHead) {
      sawHead = true;
      if (at(c)) return true;
    }
  }
  return false;
}

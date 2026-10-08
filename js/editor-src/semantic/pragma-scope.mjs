// What a pragma makes visible, read from the tree. Beluga still checks.
// This only stops the editor marking a program the pragma makes legal.

function slice(doc, from, to) {
  return doc.sliceString(from, to);
}

function pragmaNameText(node, doc) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'PragmaName') return slice(doc, c.from, c.to);
  }
  return null;
}

function scopeEnd(node, tree) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.name === 'ModuleDeclaration') return p.to;
  }
  return tree.topNode.to;
}

export function moduleScope(tree, doc) {
  const aliases = [];
  const opens = [];
  if (!tree || !doc) return { aliases, opens };
  tree.iterate({
    enter(ref) {
      if (ref.name !== 'AbbrevPragma' && ref.name !== 'OpenPragma') return;
      const moduleName = pragmaNameText(ref.node, doc);
      if (!moduleName) return false;
      const to = scopeEnd(ref.node, tree);
      if (ref.name === 'OpenPragma') {
        opens.push({ moduleName, from: ref.to, to });
        return false;
      }
      let alias = null;
      let seen = false;
      for (let c = ref.node.firstChild; c; c = c.nextSibling) {
        if (c.name === 'PragmaName') { seen = true; continue; }
        if (seen && (c.name === 'UpperIdentifier' || c.name === 'LowerIdentifier')) {
          alias = slice(doc, c.from, c.to);
          break;
        }
      }
      if (alias) aliases.push({ name: alias, moduleName, from: ref.to, to });
      return false;
    },
  });
  return { aliases, opens };
}

const NAME_RE = /^[ \t]*--name\s+(\S+)\s+(\S+)(?:\s+(\S+))?\s*\./gm;

export function nameBases(text) {
  const map = new Map();
  const src = String(text || '');
  NAME_RE.lastIndex = 0;
  let m;
  while ((m = NAME_RE.exec(src))) {
    map.set(m[1], { meta: m[2], comp: m[3] || null });
  }
  return map;
}

function declarationsOf(parent) {
  const decls = [];
  for (let c = parent.firstChild; c; c = c.nextSibling) {
    if (c.name === 'Declaration') decls.push(c);
  }
  return decls;
}

export function notGuards(tree) {
  const guards = [];
  if (!tree || !tree.topNode) return guards;
  function scan(parent) {
    const decls = declarationsOf(parent);
    for (const decl of decls) {
      for (let k = decl.firstChild; k; k = k.nextSibling) {
        if (k.name === 'ModuleDeclaration') scan(k);
      }
    }
    for (let i = 0; i < decls.length; i += 1) {
      let pragma = null;
      for (let k = decls[i].firstChild; k; k = k.nextSibling) {
        if (k.name === 'NotPragma') pragma = k;
      }
      if (!pragma || !decls[i + 1]) continue;
      guards.push({ pragma, decl: decls[i + 1] });
    }
  }
  scan(tree.topNode);
  return guards;
}

const UNEXPECTED_NOT = /expected to fail reconstruction|successfully reconstructed/i;

export function rewriteNotGuarded(tree, diags) {
  const list = diags || [];
  const guards = notGuards(tree);
  if (!guards.length) return list;
  const out = [];
  for (const d of list) {
    if (d.from == null) { out.push(d); continue; }
    const guard = guards.find((g) => d.from >= g.decl.from && d.from < g.decl.to);
    if (!guard) { out.push(d); continue; }
    if (UNEXPECTED_NOT.test(d.message || '')) {
      out.push({ ...d, from: guard.pragma.from, to: guard.pragma.to });
    }
  }
  return out;
}

export function coveredByNot(tree, from) {
  if (from == null) return false;
  return notGuards(tree).some((g) => from >= g.decl.from && from < g.decl.to);
}

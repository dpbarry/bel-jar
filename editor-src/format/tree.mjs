// Shared Lezer syntax-tree helpers for the Beluga formatter.

export function* children(node) {
  for (let c = node.firstChild; c; c = c.nextSibling) yield c;
}

export function childrenArr(node) {
  const out = [];
  for (let c = node.firstChild; c; c = c.nextSibling) out.push(c);
  return out;
}

export function firstOfType(node, name) {
  for (const c of children(node)) if (c.name === name) return c;
  return null;
}

export function txt(node, src) {
  return src.slice(node.from, node.to);
}

export function collectComments(tree, src) {
  const comments = [];
  tree.iterate({
    enter(n) {
      if (n.name === 'LineComment' || n.name === 'BlockComment') {
        comments.push({
          from: n.from,
          to: n.to,
          text: src.slice(n.from, n.to),
          kind: n.name === 'LineComment' ? 'line' : 'block',
        });
      }
    },
  });
  return comments;
}

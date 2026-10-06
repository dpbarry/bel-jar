/** Shared format primitives: style defaults and tree helpers. */

export const defaultStyle = { indent: 2 };

export function mergeStyle(overrides = {}) {
  return { ...defaultStyle, ...overrides };
}

export function childrenArr(node) {
  const out = [];
  for (let c = node.firstChild; c; c = c.nextSibling) out.push(c);
  return out;
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

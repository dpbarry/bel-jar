/** Shared format primitives: style defaults, tree helpers, comp-prefix peel. */

export const defaultStyle = {
  indent: 2,
  contextualBracket: 'tight',
  binderColon: 'tight',
  proofCase: {
    arrowBreaksBody: true,
  },
  proofLet: {
    breakChains: true,
  },
};

export function mergeStyle(overrides = {}) {
  return {
    ...defaultStyle,
    ...overrides,
    proofCase: { ...defaultStyle.proofCase, ...overrides.proofCase },
    proofLet: { ...defaultStyle.proofLet, ...overrides.proofLet },
  };
}

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

export function hasTopLevelArrow(n) {
  return childrenArr(n).some((c) => c.name === 'ArrowOp');
}

export function splitCompRecPrefix(ty) {
  const clauses = [];
  let cur = ty;
  let peeledBeforeArrow = false;

  while (cur && !hasTopLevelArrow(cur)) {
    const ch = childrenArr(cur);

    if (ch[0]?.name === '(' && ch[1]?.name === 'CompTypeBinder') {
      const rpi = ch.findIndex((c) => c.name === ')');
      const rest = ch[rpi + 1];
      if (rpi >= 0 && rest?.name === 'CompType') {
        clauses.push({ node: cur, endBefore: rest.from });
        cur = rest;
        continue;
      }
    }

    if (ch[0]?.name === '{') {
      const rpi = ch.findIndex((c) => c.name === '}');
      const after = ch[rpi + 1];
      if (rpi >= 0 && after?.name === 'CompType') {
        if (hasTopLevelArrow(after)) {
          const ach = childrenArr(after);
          const ai = ach.findIndex((c) => c.name === 'ArrowOp');
          clauses.push({ node: cur, endBefore: after.from });
          if (ai > 0) {
            clauses.push({ node: after, endBefore: ach[ai].from });
            peeledBeforeArrow = true;
          }
          return { clauses, arrowRoot: after, peeledBeforeArrow };
        }
        clauses.push({ node: cur, endBefore: after.from });
        cur = after;
        continue;
      }
    }

    break;
  }

  if (cur && hasTopLevelArrow(cur)) return { clauses, arrowRoot: cur, peeledBeforeArrow };
  return { clauses, arrowRoot: cur, peeledBeforeArrow };
}

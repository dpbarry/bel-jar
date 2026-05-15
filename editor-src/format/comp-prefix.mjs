import { childrenArr } from './tree.mjs';

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

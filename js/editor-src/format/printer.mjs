// The declaration printer. Every token and every comment of the source is printed exactly
// once, in order, from the tree. Where layout is a free choice the author's line break is kept
// (a newline in the source between two tokens stays a newline); width only breaks what was on
// one line. Structure is imposed where Beluga has one: `| ` heads each constructor and arm, arm
// bodies sit under their arm, continuation lines indent from the line they continue.
import {
  align,
  blankline,
  concat,
  empty,
  freshline,
  group,
  hardline,
  line,
  lineSuffix,
  lnest,
  nest,
  softline,
  space,
  text,
} from './doc.mjs';
import { mergeStyle } from './basics.mjs';

const COMMENTS = new Set(['LineComment', 'BlockComment']);
const TYPES = new Set(['LFType', 'LFKind', 'CompType', 'CompKind', 'ParameterFieldType']);
const APPS = new Set(['LFAppType', 'LFAppTerm', 'CompAppType', 'AppExpression', 'AppPattern', 'ParameterFieldAppType']);
const CTORS = new Set(['LFConstructor', 'CompConstructor', 'CompDestructor']);
const CLOSER = { '(': ')', '[': ']', '{': '}', '<': '>' };

const isLeaf = (n) => !n.firstChild;
const isBreak = (k) => k === 'nl' || k === 'blank';

function kids(n) {
  const out = [];
  for (let c = n.firstChild; c; c = c.nextSibling) {
    if (c.to > c.from && !COMMENTS.has(c.name)) out.push(c);
  }
  return out;
}

function classify(ws) {
  if (!ws) return 'none';
  const nl = ws.split('\n').length - 1;
  return nl === 0 ? 'space' : nl === 1 ? 'nl' : 'blank';
}

export function makePrinter(src, opts = {}) {
  const IND = mergeStyle(opts.style).indent;

  let leaves = [];
  let lead = new Map();
  let trail = new Map();
  let done = new Set();

  function scan(root) {
    const ls = [];
    const cs = [];
    root.cursor().iterate((n) => {
      if (COMMENTS.has(n.name)) {
        cs.push({ from: n.from, to: n.to, line: n.name === 'LineComment' });
        return false;
      }
      if (!n.node.firstChild && n.to > n.from) ls.push(n.node);
      return undefined;
    });
    const ld = new Map();
    const tr = new Map();
    const push = (m, i, c) => m.set(i, [...(m.get(i) || []), c]);
    let li = 0;
    for (const c of cs) {
      while (li < ls.length && ls[li].to <= c.from) li++;
      const prev = li - 1;
      const sameLine = prev >= 0 && !src.slice(ls[prev].to, c.from).includes('\n');
      const endsLine = c.line || /^[ \t]*(?:\n|$)/.test(src.slice(c.to, c.to + 200));
      if ((sameLine && endsLine) || li >= ls.length) push(tr, Math.max(0, prev), c);
      else push(ld, li, c);
    }
    leaves = ls;
    lead = ld;
    trail = tr;
    done = new Set();
  }

  function lowerBound(pos) {
    let lo = 0;
    let hi = leaves.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (leaves[m].from < pos) lo = m + 1;
      else hi = m;
    }
    return lo;
  }

  function firstLeaf(n) {
    const i = lowerBound(n.from);
    return i < leaves.length && leaves[i].to <= n.to ? i : -1;
  }

  const pending = (m, i) => (m.get(i) || []).filter((c) => !done.has(c));
  const commentText = (c) => src.slice(c.from, c.to).replace(/[ \t]+$/, '');

  function wsBefore(pos) {
    let k = pos;
    while (k > 0 && /\s/.test(src[k - 1])) k--;
    return src.slice(k, pos);
  }

  // An opaque token (a Harpoon proof script) can carry whitespace at its edges; that is gap, not text.
  function core(n) {
    let a = n.from;
    let b = n.to;
    while (a < b && /\s/.test(src[a])) a++;
    while (b > a && /\s/.test(src[b - 1])) b--;
    return [a, b];
  }

  function startOf(n) {
    const i = firstLeaf(n);
    if (i < 0) return n.from;
    const cs = pending(lead, i);
    return cs.length ? cs[0].from : core(leaves[i])[0];
  }

  const sepKind = (n) => classify(wsBefore(startOf(n)));

  function sepDoc(k, brk = false) {
    if (k === 'blank') return blankline;
    if (k === 'nl') return hardline;
    if (k === 'space') return brk ? line : space;
    return empty;
  }

  const sep = (n, brk = false) => sepDoc(sepKind(n), brk);
  const breakBefore = (n) => (sepKind(n) === 'blank' ? blankline : hardline);
  const stickyOr = (n, otherwise) => {
    const k = sepKind(n);
    return isBreak(k) ? sepDoc(k) : otherwise;
  };

  function leadDoc(i, dropLastGap = false) {
    const cs = pending(lead, i);
    if (!cs.length) return empty;
    const parts = [];
    cs.forEach((c, k) => {
      done.add(c);
      if (k === 0 && wsBefore(c.from).includes('\n')) parts.push(freshline);
      parts.push(text(commentText(c)));
      if (dropLastGap && k === cs.length - 1) return;
      const next = k + 1 < cs.length ? cs[k + 1].from : leaves[i].from;
      const g = classify(src.slice(c.to, next));
      parts.push(c.line && !isBreak(g) ? hardline : sepDoc(g));
    });
    return concat(...parts);
  }

  function trailDoc(i) {
    const cs = pending(trail, i);
    cs.forEach((c) => done.add(c));
    return concat(...cs.map((c) => lineSuffix(` ${commentText(c)}`)));
  }

  function tok(n) {
    const i = lowerBound(n.from);
    const body = text(src.slice(...core(n)));
    if (leaves[i]?.from !== n.from) return body;
    return concat(leadDoc(i), body, trailDoc(i));
  }

  function print(n) {
    if (isLeaf(n)) return tok(n);
    const rule = RULES[n.name];
    if (rule) return rule(n);
    if (APPS.has(n.name)) return app(n);
    if (TYPES.has(n.name)) return typeDoc(n);
    return seq(kids(n));
  }

  function seqPlain(ns) {
    if (!ns.length) return empty;
    const parts = [print(ns[0])];
    for (let k = 1; k < ns.length; k++) parts.push(sep(ns[k]), print(ns[k]));
    return concat(...parts);
  }

  function seq(ns) {
    const open = ns[0];
    const shut = ns[ns.length - 1];
    if (ns.length > 2 && isLeaf(open) && CLOSER[open.name] && shut.name === CLOSER[open.name]) {
      return bracket(open, ns.slice(1, -1), shut);
    }
    return seqPlain(ns);
  }

  // Inside brackets a broken line sits one step past the line the bracket opened on.
  function bracket(open, inner, shut) {
    const head = print(open);
    const s0 = sep(inner[0]);
    const body = seqPlain(inner);
    const i = firstLeaf(shut);
    const closing = pending(lead, i).length ? concat(sep(shut), leadDoc(i, true)) : empty;
    const s1 = sep(shut);
    return concat(head, lnest(IND, concat(s0, body, closing)), s1, print(shut));
  }

  function app(n) {
    const args = [];
    let cur = n;
    for (;;) {
      const ch = kids(cur);
      if (!APPS.has(cur.name)) break;
      if (ch.length === 2) {
        args.unshift(ch[1]);
        cur = ch[0];
      } else if (ch.length === 1) cur = ch[0];
      else break;
    }
    const head = APPS.has(cur.name) ? seq(kids(cur)) : print(cur);
    const same = [head];
    let broken = null;
    for (const a of args) {
      const k = sepKind(a);
      if (!broken && isBreak(k)) broken = [];
      (broken || same).push(sepDoc(k), print(a));
    }
    return broken ? concat(...same, lnest(IND, concat(...broken))) : concat(...same);
  }

  // A type is a spine of segments joined by arrows or by a leading binder (`{x:A} B`).
  function spine(n) {
    const items = [];
    let lead = null;
    let cur = n;
    for (;;) {
      const ch = kids(cur);
      const last = ch[ch.length - 1];
      const ai = ch.findIndex((c) => c.name === 'ArrowOp');
      const tail = last && TYPES.has(last.name);
      if (tail && ai > 0 && ai === ch.length - 2) {
        items.push({ lead, nodes: ch.slice(0, ai) });
        lead = ch[ai];
        cur = last;
        continue;
      }
      const binder = ch.length >= 4 && (ch[0].name === '{' || ch[0].name === '(');
      if (tail && binder && (ch[ch.length - 2].name === '}' || ch[ch.length - 2].name === ')')) {
        items.push({ lead, nodes: ch.slice(0, -1) });
        lead = 'juxt';
        cur = last;
        continue;
      }
      items.push({ lead, nodes: ch });
      return items;
    }
  }

  // A binder prefix breaks before the arrows behind it do.
  function spineDoc(items) {
    const parts = [seq(items[0].nodes)];
    for (let k = 1; k < items.length; k++) {
      const it = items[k];
      const seg = it.nodes[0];
      if (it.lead === 'juxt') {
        parts.push(sep(seg, true), spineDoc([{ lead: null, nodes: it.nodes }, ...items.slice(k + 1)]));
        break;
      }
      const before = sepKind(it.lead);
      if (isBreak(before)) {
        parts.push(sepDoc(before), print(it.lead));
        parts.push(stickyOr(seg, space), seq(it.nodes));
        continue;
      }
      const op = print(it.lead);
      const after = sepKind(seg);
      if (isBreak(after)) parts.push(space, op, sepDoc(after), seq(it.nodes));
      else parts.push(line, op, space, seq(it.nodes));
    }
    return group(concat(...parts));
  }

  function typeDoc(n) {
    if (!TYPES.has(n.name)) return print(n);
    const items = spine(n);
    return items.length === 1 ? seq(items[0].nodes) : spineDoc(items);
  }

  function contextual(n) {
    const ch = kids(n);
    const ti = ch.findIndex((c) => c.name === 'Turnstile');
    const shut = ch[ch.length - 1];
    if (ch[0]?.name !== '[' || shut?.name !== ']' || ti < 1) return seq(ch);
    const parts = [print(ch[0])];
    const ctx = ch.slice(1, ti);
    if (ctx.length) parts.push(seqPlain(ctx), stickyOr(ch[ti], space));
    parts.push(print(ch[ti]));
    const body = ch.slice(ti + 1, -1);
    if (body.length) parts.push(stickyOr(body[0], space), seqPlain(body));
    parts.push(stickyOr(shut, empty), print(shut));
    return concat(...parts);
  }

  function branch(n) {
    const ch = kids(n);
    const ai = ch.findIndex((c) => c.name === 'FatArrow');
    if (ai < 0) return seq(ch);
    const head = seqPlain(ch.slice(0, ai));
    const arrow = print(ch[ai]);
    const body = ch.slice(ai + 1);
    if (!body.length) return concat(head, space, arrow);
    const k = sepKind(body[0]);
    if (isBreak(k)) return concat(head, space, arrow, nest(IND, concat(sepDoc(k), seqPlain(body))));
    return concat(head, space, arrow, group(nest(IND, concat(line, seqPlain(body)))));
  }

  // `| `-headed items, one per line; a bar the source left out is supplied.
  function barred(ns, isItem, item, wrap = (d) => d) {
    const parts = [];
    let bar = null;
    for (const c of ns) {
      if (c.name === '|') {
        bar = c;
        continue;
      }
      if (isItem(c)) {
        const brk = breakBefore(bar ?? c);
        parts.push(
          wrap(
            bar
              ? concat(brk, print(bar), space, item(c))
              : concat(brk, leadDoc(firstLeaf(c)), text('| '), item(c)),
          ),
        );
        bar = null;
        continue;
      }
      parts.push(wrap(concat(sep(c), print(c))));
    }
    if (bar) parts.push(wrap(concat(sep(bar), print(bar))));
    return concat(...parts);
  }

  function lam(n) {
    const ch = kids(n);
    const ai = ch.findIndex((c) => c.name === 'FatArrow');
    if (ai < 0 || ai === ch.length - 1) return seq(ch);
    const head = seqPlain(ch.slice(0, ai));
    const arrow = print(ch[ai]);
    const body = ch.slice(ai + 1);
    return concat(head, space, arrow, stickyOr(body[0], space), seqPlain(body));
  }

  function letExpr(n) {
    const ch = kids(n);
    const eq = ch.findIndex((c) => c.name === '=');
    const inK = ch.findIndex((c) => c.name === 'InKeyword');
    if (ch[0]?.name !== 'LetKeyword' || eq < 2 || inK < eq + 2 || inK === ch.length - 1) return seq(ch);
    const kw = print(ch[0]);
    const head = seqPlain(ch.slice(1, eq));
    const eqDoc = print(ch[eq]);
    const rhs = ch.slice(eq + 1, inK);
    const rhsSep = stickyOr(rhs[0], space);
    const rhsDoc = seqPlain(rhs);
    const inSep = isBreak(sepKind(ch[inK])) ? hardline : space;
    const inDoc = print(ch[inK]);
    const body = ch.slice(inK + 1);
    const bodySep = stickyOr(body[0], space);
    return concat(
      kw,
      space,
      nest(IND, concat(head, space, eqDoc, rhsSep, rhsDoc)),
      inSep,
      inDoc,
      bodySep,
      seqPlain(body),
    );
  }

  function caseExpr(n) {
    const ch = kids(n);
    const of = ch.findIndex((c) => c.name === 'OfKeyword');
    const body = ch[ch.length - 1];
    if (ch[0]?.name !== 'CaseKeyword' || of < 2 || body?.name !== 'CaseBody') return seq(ch);
    const head = concat(print(ch[0]), space, seqPlain(ch.slice(1, of)), space, print(ch[of]));
    const arms = kids(body);
    if (arms[0]?.name === '{') return concat(head, space, seq(arms));
    return concat(head, barred(arms, (c) => c.name === 'CaseBranch', branch));
  }

  function cofun(n) {
    const ch = kids(n);
    if (ch[0]?.name !== 'FunKeyword' || ch.length < 2) return seq(ch);
    const kw = print(ch[0]);
    const isBranch = (c) => c.name === 'CofunctionBranch';
    if (ch[1].name === '|') return concat(kw, barred(ch.slice(1), isBranch, branch));
    return concat(kw, space, branch(ch[1]), barred(ch.slice(2), isBranch, branch));
  }

  function ctor(n) {
    const ch = kids(n);
    if (ch.length < 3 || ch[1].name !== ':') return seq(ch);
    return concat(print(ch[0]), space, align(concat(print(ch[1]), space, seqPlain(ch.slice(2)))));
  }

  const ctorList = (ns) => barred(ns, (c) => CTORS.has(c.name), ctor, (d) => nest(IND, d));

  // `name : K =` then the constructors.
  function familyHead(ch, i) {
    const parts = [print(ch[i++])];
    if (ch[i]?.name === ':') {
      parts.push(space, print(ch[i++]), space);
      parts.push(nest(IND, typeDoc(ch[i++])));
    }
    if (ch[i]?.name === '=') parts.push(space, print(ch[i++]));
    return { doc: concat(...parts), next: i };
  }

  function lfDatatype(n) {
    const ch = kids(n);
    const parts = [];
    let i = 0;
    while (i < ch.length) {
      const c = ch[i];
      if (c.name === 'LFKeyword' || c.name === 'DatatypeKeyword' || c.name === 'AndKeyword') {
        if (c.name === 'AndKeyword') parts.push(breakBefore(c));
        parts.push(print(c), space);
        const h = familyHead(ch, i + 1);
        parts.push(h.doc);
        i = h.next;
        const start = i;
        while (i < ch.length && ch[i].name !== 'AndKeyword' && ch[i].name !== ';') i++;
        parts.push(ctorList(ch.slice(start, i)));
        continue;
      }
      parts.push(c.name === ';' ? hardline : sep(c), print(c));
      i++;
    }
    return concat(...parts);
  }

  function familyBody(n) {
    const ch = kids(n);
    const h = familyHead(ch, 0);
    return concat(h.doc, ctorList(ch.slice(h.next)));
  }

  function datatype(n) {
    const parts = [];
    for (const c of kids(n)) {
      if (c.name === 'InductiveBody' || c.name === 'CoinductiveBody') parts.push(familyBody(c));
      else if (c.name === 'DatatypeContinuation') parts.push(breakBefore(c), datatype(c));
      else if (c.name === ';') parts.push(hardline, print(c));
      else if (isLeaf(c)) parts.push(print(c), space);
      else parts.push(sep(c), print(c));
    }
    return concat(...parts);
  }

  function recBody(n) {
    const ch = kids(n);
    if (ch.length < 3 || ch[1].name !== ':') return seq(ch);
    const eq = ch[3]?.name === '=';
    const head = concat(print(ch[0]), space, print(ch[1]), space, nest(IND, typeDoc(ch[2])), eq ? concat(space, print(ch[3])) : empty);
    const rest = ch.slice(eq ? 4 : 3).flatMap((c) => [breakBefore(c), print(c)]);
    return concat(head, nest(IND, concat(...rest)));
  }

  function rec(n) {
    const parts = [];
    for (const c of kids(n)) {
      if (c.name === 'RecBody') parts.push(recBody(c));
      else if (c.name === 'RecContinuation') parts.push(breakBefore(c), rec(c));
      else if (c.name === ';') parts.push(hardline, print(c));
      else if (isLeaf(c)) parts.push(print(c), space);
      else parts.push(sep(c), print(c));
    }
    return concat(...parts);
  }

  // A declaration written on one line keeps its `;` on the line while it fits.
  function closeWith(n, body, semi) {
    if (src.slice(n.from, semi.from).includes('\n')) return concat(body, hardline, print(semi));
    return group(concat(body, softline, print(semi)));
  }

  function equation(n, rhs) {
    const ch = kids(n);
    const eq = ch.findIndex((c) => c.name === '=');
    const semi = ch[ch.length - 1];
    if (eq < 1 || eq === ch.length - 2 || semi.name !== ';') return seq(ch);
    const head = concat(seqPlain(ch.slice(0, eq)), space, print(ch[eq]));
    return closeWith(n, concat(head, rhs(ch.slice(eq + 1, -1))), semi);
  }

  const RULES = {
    LFDeclaration(n) {
      const ch = kids(n);
      const ci = ch.findIndex((c) => c.name === ':');
      const dot = ch[ch.length - 1]?.name === '.' ? ch[ch.length - 1] : null;
      if (ci < 1 || ci !== ch.length - (dot ? 3 : 2)) return seq(ch);
      return concat(seqPlain(ch.slice(0, ci)), space, print(ch[ci]), space, nest(IND, typeDoc(ch[ci + 1])), dot ? print(dot) : empty);
    },
    LFDatatypeDeclaration: lfDatatype,
    InductiveDeclaration: datatype,
    StratifiedDeclaration: datatype,
    CoinductiveDeclaration: datatype,
    RecDeclaration: rec,
    SchemaDeclaration: (n) =>
      equation(n, ([body]) => {
        const parts = [];
        for (const e of kids(body)) {
          if (e.name === '+') parts.push(stickyOr(e, line), print(e), space);
          else parts.push(parts.length ? empty : stickyOr(e, line), print(e));
        }
        return group(nest(IND, concat(...parts)));
      }),
    TypedefDeclaration: (n) => equation(n, ([ty]) => group(nest(IND, concat(stickyOr(ty, line), typeDoc(ty))))),
    LetDeclaration: (n) => equation(n, (rhs) => nest(IND, concat(stickyOr(rhs[0], space), seqPlain(rhs)))),
    ModuleDeclaration(n) {
      const ch = kids(n);
      const st = ch.findIndex((c) => c.name === 'StructKeyword');
      const end = ch.findIndex((c) => c.name === 'EndKeyword');
      if (st < 0 || end < st) return seq(ch);
      const head = seqPlain(ch.slice(0, st + 1));
      const inner = ch.slice(st + 1, end).flatMap((d) => [breakBefore(d), print(d)]);
      return concat(head, nest(IND, concat(...inner)), hardline, seqPlain(ch.slice(end)));
    },
    ContextualType: contextual,
    ContextualObject: contextual,
    CaseExpression: caseExpr,
    CofunctionExpression: cofun,
    FnExpression: lam,
    MLamExpression: lam,
    LetExpression: letExpr,
  };

  function pp(node) {
    scan(node);
    return print(node);
  }

  return { pp };
}

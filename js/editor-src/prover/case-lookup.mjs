// case-lookup.mjs — the instant half of case completion: a missing case that is an
// authored case with its constructors renamed by the signature.
//
// `e_succ` is the step rule about `succ`; its case uses `t_succ`, the typing rule about
// `succ`. The case for `e_pred` is the same text with `succ` read as `pred`, so `t_succ`
// becomes the typing rule about `pred`. Nothing is searched: the signature says which
// constructor plays which part, and when it cannot say (no rule, or two), the lookup
// refuses with the reason rather than guessing.
//
// Measured (docs/case-completion.md §6): this reproduces the author's own case for 11% of
// theorem cases, 24% in proofs with six or more, with no search and one check. Whatever it
// produces is still only a candidate; the caller checks it.

import { declaredFamilies } from './case-pieces.mjs';
import { enumerateConstructorsTyped } from './hole-split.mjs';
import { DECL_IDENT } from './ident.mjs';

const TOKEN = new RegExp(String.raw`${DECL_IDENT}|[0-9]+|[^\s]`, 'gu');

/**
 * Every constructor of the program: name -> { fam, arity, objects }, where `objects` is
 * the sequence of constructors its conclusion mentions (`t_succ : … -> oft (succ M) nat`
 * gives `succ nat`). Built once per program text.
 */
export function signatureIndex(code) {
  const raw = new Map();
  for (const fam of declaredFamilies(code)) {
    for (const c of enumerateConstructorsTyped(code, fam)) {
      if (!raw.has(c.name)) {
        raw.set(c.name, { fam, arity: c.argTypes.length, indices: (c.result && c.result.indices) || [] });
      }
    }
  }
  const index = new Map();
  for (const [name, c] of raw) {
    const objects = (c.indices.join(' ').match(TOKEN) || []).filter((t) => raw.has(t));
    index.set(name, { fam: c.fam, arity: c.arity, objects });
  }
  return index;
}

// Spans of `%{ … }%` and `% …` comments, so a constructor named in a comment is left as
// the author wrote it.
function commentSpans(text) {
  const spans = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '%') continue;
    if (text[i + 1] === '{') {
      const end = text.indexOf('}%', i + 2);
      const to = end < 0 ? text.length : end + 2;
      spans.push([i, to]); i = to - 1;
    } else {
      const nl = text.indexOf('\n', i);
      const to = nl < 0 ? text.length : nl;
      spans.push([i, to]); i = to - 1;
    }
  }
  return spans;
}

/**
 * The case for rule `to`, from the authored case `armText` for rule `from`.
 * Returns `{ text, renames }` (renames: Map old -> new, the head included), or
 * `{ why }` saying, in words, why the signature does not determine it.
 */
export function transportArm(armText, from, to, index) {
  const a = index.get(from); const b = index.get(to);
  if (!a || !b) return { why: 'not a rule of the signature' };
  if (a.fam !== b.fam) return { why: `${from} and ${to} belong to different judgments` };
  if (a.arity !== b.arity) return { why: `${to} has ${b.arity} premises, ${from} has ${a.arity}` };
  // theta: what the two rules talk about. Same length, position by position.
  const theta = new Map([[from, to]]);
  if (a.objects.length === b.objects.length) {
    for (let i = 0; i < a.objects.length; i += 1) {
      const x = a.objects[i]; const y = b.objects[i];
      if (theta.has(x) && theta.get(x) !== y) return { why: `${from} and ${to} do not line up` };
      theta.set(x, y);
    }
  }
  const changed = new Set([...theta].filter(([x, y]) => x !== y && x !== from).map(([x]) => x));
  const range = new Set([...theta].filter(([x]) => x !== from).map(([, y]) => y));
  const text = String(armText == null ? '' : armText);
  const comments = commentSpans(text);
  const inComment = (i) => comments.some(([s, e]) => i >= s && i < e);
  const renames = new Map();
  let out = '';
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const k = m[0];
    if (!index.has(k) || inComment(m.index)) continue;
    let repl = k;
    if (theta.has(k)) repl = theta.get(k);
    else if (index.get(k).objects.some((t) => changed.has(t))) {
      // A constructor that talks about a changed object is replaced by the ONE rule of
      // its own judgment and arity that talks about the new object in its place.
      const info = index.get(k);
      const goal = info.objects.filter((t) => theta.has(t)).map((t) => theta.get(t)).join(' ');
      const cands = [...index]
        .filter(([, c]) => c.fam === info.fam && c.arity === info.arity)
        .map(([n]) => n)
        .filter((n) => index.get(n).objects.filter((t) => range.has(t)).join(' ') === goal);
      if (cands.length !== 1) {
        return { why: cands.length ? `two rules of ${info.fam} could play the part of ${k}` : `no rule of ${info.fam} plays the part of ${k}` };
      }
      repl = cands[0];
    }
    if (repl !== k) renames.set(k, repl);
    out += text.slice(last, m.index) + repl;
    last = m.index + k.length;
  }
  out += text.slice(last);
  return { text: out, renames };
}

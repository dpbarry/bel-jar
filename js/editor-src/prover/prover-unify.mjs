// prover-unify.mjs — THE CONTEXTUAL-TYPE UNIFIER (step 2 of the unified core).
//
// WHY THIS EXISTS. The engine has no type system of its own: it matches type TEXT and
// lets the checker arbitrate. The consequence is measured, not asserted — ~773 lines of
// the prover touch spelling/variant/writability/guard concerns against ~183 touching
// unification, a 4:1 ratio, and every mechanism that ever paid was a missing move or
// mis-emitted text while every prune/rank returned zero. That is the signature of a
// string generator with an external oracle.
//
// The concrete gap this closes: when a constructor is applied at a goal, each argument
// slot's type must be INSTANTIATED by what the goal fixes. Today that is
// `matchIndices`, which binds only tokens that happen to be UPPERCASE — so:
//   • a context variable never binds (they are lowercase by convention:
//     `M_dot : Map [h] [g] -> [h |- target S[]] -> Map [h] [g, x:source S[]]`), and every
//     slot keeps its DECLARED context. That is why the weakening spelling of entry 40a
//     could not fire at an argument slot for eight months: `ctxProperlyExtends` was
//     comparing `h` against `h`.
//   • an index buried inside a context declaration never binds (`S` in `x:source S[]`),
//   • and when the token spines do not align at all, `matchIndices` returns null and the
//     slot keeps its raw declared type, indices and all.
//
// FAILS OPEN, ALWAYS. `unifyAgainstGoal` returns a substitution or `null`, and `null`
// means "no information" — never "reject". Nothing here prunes a candidate. The plan
// already records the split-side unifier being OVER-strict and dropping legitimate arms
// (§"the prefilter axis is CLOSED"), and a unifier that refuses is a prefilter wearing a
// type theory's clothes. Precision here may only ADD or SHARPEN candidates.
//
// SUBSUMES (as the core grows): `matchIndices` (uppercase-only), `ctypeCtxSubst` +
// `applyCtxSubst` (entry 56's hand-rolled context binding — a strict subset of
// `unifyContext` below), and the per-site context surgery in `argFillChoices`.

// Cyclic with hole-split by design: both sides export hoisted FUNCTION DECLARATIONS, so
// every call happens after both modules have evaluated. The alternative — duplicating the
// contextual-type parser here — is exactly the per-site duplication this module exists to end.
import {
  decomposeContextual,
  parseAppType,
} from './hole-split.mjs';

const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const isUpperVar = (t) => /^\p{Lu}[\p{L}\p{N}_']*(\[[^[\]]*\])?$/u.test(String(t || ''));
const isBareIdent = (t) => /^[\p{L}_][\p{L}\p{N}_']*$/u.test(String(t || '').trim());
const isLowerIdent = (t) => /^[\p{Ll}_][\p{L}\p{N}_']*$/u.test(String(t || '').trim());

// A bracketed group with NO turnstile is a CONTEXT (`[h]`, `[g, x:source S[]]`);
// with one it is a contextual object (`[h |- target S[]]`).
function asContext(text) {
  const t = norm(text);
  if (t[0] !== '[' || t[t.length - 1] !== ']') return null;
  const inner = t.slice(1, -1);
  // A turnstile at depth 0 makes it a box, not a context.
  let d = 0;
  for (let i = 0; i < inner.length; i += 1) {
    const c = inner[i];
    if (c === '[' || c === '(') d += 1;
    else if (c === ']' || c === ')') d -= 1;
    else if (d === 0 && (c === '⊢' || (c === '|' && inner[i + 1] === '-'))) return null;
  }
  return inner.trim();
}

// ⛔ A PARENTHESISED TYPE IS NOT A BOX. `decomposeContextual` strips one outer `(…)`
// and reports a box with an EMPTY context, because a meta type really is written
// `(g |- A)`. But `(tm -> tm)` — the higher-order argument of `lam : (tm -> tm) -> tm` —
// decomposes the same way, and instantiating it then rewrote it as `[ |- tm -> tm]`: a
// bogus box, at every parenthesised argument slot. A box requires an actual TURNSTILE.
export function asBox(text) {
  const t = norm(text);
  if (!t) return null;
  if (t[0] !== '[' && t[0] !== '(') return null;
  const inner = t.slice(1, -1);
  let d = 0;
  let found = false;
  for (let i = 0; i < inner.length; i += 1) {
    const c = inner[i];
    if (c === '[' || c === '(') d += 1;
    else if (c === ']' || c === ')') d -= 1;
    else if (d === 0 && (c === '⊢' || (c === '|' && inner[i + 1] === '-'))) { found = true; break; }
  }
  if (!found) return null;
  return decomposeContextual(t);
}

export function splitContextParts(ctxText) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of String(ctxText || '')) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function splitDecl(part) {
  const p = String(part || '').trim();
  const i = p.indexOf(':');
  if (i < 0) return null;
  return { name: p.slice(0, i).trim(), type: p.slice(i + 1).trim() };
}

// Token spine of a term: parenthesised groups stay whole, everything else splits on
// top-level spaces. (Deliberately the same shape as `hole-split`'s `tokenizeTerm`; kept
// local so this module has no cyclic dependency on it.)
function tokens(text) {
  const t = norm(text);
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of t) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ' ' && depth === 0) { if (cur) out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function stripParens(s) {
  let t = norm(s);
  while (t[0] === '(' && t[t.length - 1] === ')') {
    let d = 0; let ok = true;
    for (let i = 0; i < t.length; i += 1) {
      if (t[i] === '(') d += 1;
      else if (t[i] === ')') { d -= 1; if (d === 0 && i < t.length - 1) { ok = false; break; } }
    }
    if (!ok) break;
    t = t.slice(1, -1).trim();
  }
  return t;
}

// ── the substitution ────────────────────────────────────────────────────────
// Two namespaces, deliberately kept apart: INDEX metavariables (uppercase, substituted
// inside terms) and CONTEXT variables (substituted only in context position). Merging
// them is what makes text-level substitution unsound — a lowercase `h` may be an LF
// variable in one position and a context variable in another, and only the STRUCTURE
// says which.
function emptySubst() { return { idx: Object.create(null), ctx: Object.create(null) }; }

function bindIdx(subst, name, value) {
  const v = norm(value);
  if (subst.idx[name] != null) return norm(subst.idx[name]) === v;
  subst.idx[name] = v;
  return true;
}
function bindCtx(subst, name, value) {
  const v = norm(value);
  if (subst.ctx[name] != null) return norm(subst.ctx[name]) === v;
  subst.ctx[name] = v;
  return true;
}

// ── unification ─────────────────────────────────────────────────────────────

// One INDEX TERM. One-directional (the pattern is the constructor's declared side).
// Structural, position-wise, alpha-aware for `\x.` binders — the same discipline as the
// existing `matchTerm`, which this replaces at the sites it is wired into.
// Bind an uppercase occurrence, honouring its CLOSURE. `S[]` is the variable S applied
// to the empty substitution, so matching `S[]` against `S1[]` binds S to S1 — NOT to
// `S1[]`, which would re-emit `S1[][]` when the slot type is instantiated. Measured on
// cc.bel's `M_dot`, where every boxed slot carries `target S[]`.
function bindOccurrence(patternTok, goalTok, subst) {
  const pm = /^(\p{Lu}[\p{L}\p{N}_']*)(\[[^[\]]*\])?$/u.exec(String(patternTok));
  if (!pm) return false;
  const name = pm[1];
  const closure = pm[2] || '';
  let value = norm(goalTok);
  if (closure) {
    if (!value.endsWith(closure)) return false; // different closure ⇒ no information
    value = value.slice(0, value.length - closure.length);
  }
  return bindIdx(subst, name, value);
}

// Is this GOAL-side text flexible — a metavariable, a wildcard, a projection, a
// substitution-applied meta? Then it constrains nothing and any pattern matches it,
// binding NOTHING. This is not leniency; it is what "the goal has not determined this
// index yet" means. Without it a pattern more specific than the goal (`app M N` vs a bare
// `X2`) fails, and one flexible index kills the substitution for the WHOLE constructor —
// which is most of why the first cut said "no information" on 80% of applications.
function goalIsFlexible(text) {
  const t = stripParens(text);
  if (!t || t === '_') return true;
  if (/^\p{Lu}[\p{L}\p{N}_']*(\[[^[\]]*\])?$/u.test(t)) return true;   // X, X2, X[..], T'[]
  if (/^#[\p{L}_][\p{L}\p{N}_']*(\.[\p{L}\p{N}_']+)?$/u.test(t)) return true; // #p, #p.1
  if (/^[\p{L}_][\p{L}\p{N}_']*\.[\p{L}\p{N}_']+$/u.test(t)) return true;     // b.1 projection
  return false;
}

function unifyTerm(pattern, goal, subst, alpha) {
  if (goalIsFlexible(goal)) return true;
  const p = tokens(pattern);
  const g = tokens(goal);
  if (!p.length || !g.length) return false;
  if (p.length === 1 && isUpperVar(p[0])) {
    return bindOccurrence(p[0], g.length === 1 ? g[0] : goal, subst);
  }
  if (p.length !== g.length) return false;
  for (let i = 0; i < p.length; i += 1) {
    const pt = p[i];
    const gt = g[i];
    const pb = /^\\([\w']+)\.$/.exec(pt);
    const gb = /^\\([\w']+)\.$/.exec(gt);
    if (pb || gb) {
      if (!pb || !gb) return false;
      alpha.set(pb[1], gb[1]);
      continue;
    }
    // A nested contextual object inside an index (`[g |- M]` as an argument of a ctype).
    const pc = asContext(pt);
    const gc = asContext(gt);
    if (pc !== null || gc !== null) {
      if (pc === null || gc === null) return false;
      if (!unifyContext(pc, gc, subst, alpha)) return false;
      continue;
    }
    const pd = asBox(pt);
    const gd = asBox(gt);
    if (pd && gd) {
      if (!unifyContext(pd.ctx, gd.ctx, subst, alpha)) return false;
      if (!unifyTerm(pd.concl, gd.concl, subst, alpha)) return false;
      continue;
    }
    if (isUpperVar(pt)) {
      if (!bindOccurrence(pt, gt, subst)) return false;
      continue;
    }
    if (pt[0] === '(' || gt[0] === '(') {
      if (!unifyTerm(stripParens(pt), stripParens(gt), subst, alpha)) return false;
      continue;
    }
    if (goalIsFlexible(gt)) continue; // this position is undetermined — no information
    if (alpha.has(pt)) {
      if (alpha.get(pt) !== gt) return false;
      continue;
    }
    if (norm(pt) !== norm(gt)) return false;
  }
  return true;
}

// A CONTEXT. This is the part `matchIndices` never had.
//
//   pattern `h`                 vs goal `h1, x : target S[]`  ⇒ h ↦ "h1, x : target S[]"
//   pattern `g, x:source S[]`   vs goal `g1, x : source S1[]` ⇒ g ↦ "g1", S ↦ "S1"
//
// A leading bare identifier is a context VARIABLE and absorbs however many goal parts
// the declaration tail leaves over — that is what makes it a context variable rather
// than a fixed binder. Declaration parts then align one-for-one, unifying their TYPES
// (so an index buried in a context binds, which is new) and recording the binder
// renaming in `alpha`. Anything that does not align returns false, and the caller reads
// that as NO INFORMATION.
export function unifyContext(patternCtx, goalCtx, subst, alpha = new Map()) {
  const pp = splitContextParts(patternCtx);
  const gp = splitContextParts(goalCtx);
  if (!pp.length) return !gp.length ? true : false;
  const headIsVar = isBareIdent(pp[0]) && isLowerIdent(pp[0]);
  if (headIsVar) {
    const tail = pp.length - 1;
    if (gp.length < tail) return false;
    const absorb = gp.slice(0, gp.length - tail).join(', ');
    if (!bindCtx(subst, pp[0], absorb)) return false;
    for (let i = 0; i < tail; i += 1) {
      if (!unifyCtxPart(pp[i + 1], gp[gp.length - tail + i], subst, alpha)) return false;
    }
    return true;
  }
  if (pp.length !== gp.length) return false;
  for (let i = 0; i < pp.length; i += 1) {
    if (!unifyCtxPart(pp[i], gp[i], subst, alpha)) return false;
  }
  return true;
}

function unifyCtxPart(patternPart, goalPart, subst, alpha) {
  const pd = splitDecl(patternPart);
  const gd = splitDecl(goalPart);
  if (!pd || !gd) return norm(patternPart) === norm(goalPart);
  // Binder names are bound occurrences — they match up to renaming.
  if (pd.name !== gd.name) alpha.set(pd.name, gd.name);
  // `block (…)` fields: compare structurally rather than guessing.
  if (/^block\b/.test(pd.type) || /^block\b/.test(gd.type)) {
    return norm(pd.type) === norm(gd.type);
  }
  return unifyTerm(pd.type, gd.type, subst, alpha);
}

// ── the entry point ─────────────────────────────────────────────────────────

// Unify a constructor's RESULT against the goal, returning a substitution over index
// metavariables AND context variables, or `null` for "no information".
//
// `patternIndices` are the constructor's declared result indices; `goalIndices` the
// goal's. Both come from `parseAppType`, so a context index arrives as `[h]` and a
// contextual one as `[h |- C]` — which is exactly the distinction `asContext` reads.
export function unifyAgainstGoal(patternIndices, goalIndices) {
  if (!Array.isArray(patternIndices) || !Array.isArray(goalIndices)) return null;
  if (!patternIndices.length || !goalIndices.length) return null;
  // IMPLICIT ARGUMENTS ARE NOT PRINTED. `Printer.Control.printImplicit` defaults to
  // false, so the goal read out of a hole report carries only the EXPLICIT indices while
  // the constructor's declared result carries all of them. Implicits lead the telescope,
  // so the two align from the RIGHT and the surplus leading pattern indices are simply
  // the ones reconstruction will infer. Bailing on the length difference — which is what
  // `matchIndices` does — throws away every constructor of every family that has an
  // implicit index, which in this corpus is most of them.
  // ONE DIRECTION ONLY. Pattern-longer-than-goal is the hidden-implicit case and aligns
  // from the right. Goal-longer-than-pattern is not: the goal cannot carry more explicit
  // indices than the constructor declares, so that is a parse disagreement, and guessing
  // an alignment there would be inventing information. No-info.
  let pat = patternIndices;
  const goal = goalIndices;
  if (goal.length > pat.length) return null;
  if (pat.length > goal.length) pat = pat.slice(pat.length - goal.length);
  const subst = emptySubst();
  const alpha = new Map();
  for (let i = 0; i < pat.length; i += 1) {
    const p = norm(pat[i]);
    const g = norm(goal[i]);
    const pc = asContext(p);
    const gc = asContext(g);
    if (pc !== null && gc !== null) {
      if (!unifyContext(pc, gc, subst, alpha)) return null;
      continue;
    }
    const pd = asBox(p);
    const gd = asBox(g);
    if (pd && gd) {
      if (!unifyContext(pd.ctx, gd.ctx, subst, alpha)) return null;
      if (!unifyTerm(pd.concl, gd.concl, subst, alpha)) return null;
      continue;
    }
    if (!unifyTerm(p, g, subst, alpha)) return null;
  }
  return (Object.keys(subst.idx).length || Object.keys(subst.ctx).length) ? subst : null;
}

// Unify two TYPES (not index lists). The recursive inhabiter needs to ask "can this
// hypothesis inhabit this slot?" and "does this constructor's result match this goal?",
// which are the same question at every depth — that is the point of a core.
export function unifyTypes(patternType, goalType) {
  const p = norm(patternType);
  const g = norm(goalType);
  if (!p || !g) return null;
  const subst = emptySubst();
  const alpha = new Map();
  const pc = asContext(p);
  const gc = asContext(g);
  if (pc !== null && gc !== null) return unifyContext(pc, gc, subst, alpha) ? subst : null;
  const pb = asBox(p);
  const gb = asBox(g);
  if (pb && gb) {
    if (!unifyContext(pb.ctx, gb.ctx, subst, alpha)) return null;
    return unifyTerm(pb.concl, gb.concl, subst, alpha) ? subst : null;
  }
  if (pb || gb) return null;
  const pa = parseAppType(p);
  const ga = parseAppType(g);
  if (pa && ga && pa.head === ga.head && (pa.indices.length || ga.indices.length)) {
    const u = unifyAgainstGoal(pa.indices, ga.indices);
    return u || subst; // same head, nothing to bind ⇒ compatible with an empty substitution
  }
  return unifyTerm(p, g, subst, alpha) ? subst : null;
}

// "Provably cannot inhabit" — the ONLY negative this module offers, and it is used for
// selection, never for pruning an already-generated candidate. Heads that are both rigid
// and different can never unify; anything else passes.
export function typeIncompatible(candidateType, wantType) {
  const c = norm(candidateType);
  const w = norm(wantType);
  if (!c || !w) return false;
  const cb = asBox(c);
  const wb = asBox(w);
  const ch = parseAppType(cb ? cb.concl : c);
  const wh = parseAppType(wb ? wb.concl : w);
  if (!ch || !wh || !ch.head || !wh.head) return false;
  if (isUpperVar(ch.head) || isUpperVar(wh.head)) return false; // flexible ⇒ no verdict
  return ch.head !== wh.head;
}

// ── instantiation ───────────────────────────────────────────────────────────

// Apply a substitution to a TYPE, STRUCTURALLY. Never a global text replace: a context
// variable is substituted only where the structure says a context is, so an LF variable
// that happens to share a name with a context variable is untouched. (Entry 56's
// `applyCtxSubst` did exactly that global replace; this supersedes it.)
export function instantiateType(typeText, subst) {
  const t = norm(typeText);
  if (!t || !subst) return t;
  if (t[0] === '{') return t; // a Pi binder — its own scope, left alone
  const ctx = asContext(t);
  if (ctx !== null) return `[${instantiateContext(ctx, subst)}]`;
  const box = asBox(t);
  if (box) {
    const c = instantiateContext(box.ctx, subst);
    const inner = instantiateTerm(box.concl, subst);
    return c ? `[${c} |- ${inner}]` : `[ |- ${inner}]`;
  }
  const app = parseAppType(t);
  if (app && app.indices.length) {
    return [app.head, ...app.indices.map((i) => instantiateType(i, subst))].join(' ');
  }
  return instantiateTerm(t, subst);
}

export function instantiateContext(ctxText, subst) {
  const parts = splitContextParts(ctxText);
  const out = [];
  for (const part of parts) {
    const d = splitDecl(part);
    if (!d) {
      out.push(subst.ctx[part.trim()] != null ? subst.ctx[part.trim()] : part);
      continue;
    }
    out.push(`${d.name} : ${instantiateTerm(d.type, subst)}`);
  }
  return out.filter(Boolean).join(', ');
}

// Index metavariables only — a term has no context positions of its own.
function instantiateTerm(text, subst) {
  return String(text == null ? '' : text)
    .replace(/\p{Lu}[\p{L}\p{N}_']*/gu, (tok) => (subst.idx[tok] != null ? subst.idx[tok] : tok));
}

// Did instantiation actually CHANGE this slot? The step-2 gate is the rate at which it
// does — a unifier that fires everywhere and sharpens nothing is not a core, and that is
// the outcome that would falsify the "one system" claim at its cheapest point.
export function instantiationChanged(rawType, subst) {
  if (!subst) return false;
  return norm(instantiateType(rawType, subst)) !== norm(rawType);
}

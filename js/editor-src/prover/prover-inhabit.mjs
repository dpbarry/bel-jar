// prover-inhabit.mjs — STEP 3 OF THE UNIFIED CORE: one recursive, goal-directed
// procedure that BUILDS an inhabitant of a type.
//
// ── why one procedure ───────────────────────────────────────────────────────
// The engine has SEVEN generators that each answer "what term goes here?", every one of
// them written for the sliver its author's target needed:
//
//   fillCandidates rule (3)   nullary constructors of the goal head
//   fillCandidates rule (3b)  the higher-order `mlam` skeleton (accessibility families)
//   fillCandidates rule (4)   synthesizeFills — LF constructor synthesis, one level
//   fillCandidates rule (5)   constructor application over in-scope names
//   argFillChoices            per-slot lookup, with five special cases inside it
//   nestedCtorArgFills        depth-2 constructor witnesses, comp families only
//   lfCtorAppFills            depth-1 constructor applications, LF families only
//   hoSlotFills               binder introduction, only when the R-pool is empty
//   inlineArgCallTexts        an inline IH/lemma call, ctype slots only
//
// Each measured ~2% and none measured more, which is the fragmentation result read from
// the CODE rather than from the corpus. They are not nine mechanisms; they are nine
// fragments of `inhabit`, differing in which sources they consider, at which depth, for
// which family kind, in which position. This module is the whole function.
//
// ── what it does ────────────────────────────────────────────────────────────
// `inhabit(want, env, depth)` returns TERM TEXTS for a type, most-specific first, from
// four sources applied UNIFORMLY at every depth and in every position:
//
//   (1) a hypothesis (meta, comp, context binder, or block projection) whose type
//       unifies with the want,
//   (2) a constructor of the want's family whose RESULT unifies with the want, its
//       argument slots inhabited recursively with the unifier's substitution threaded
//       through — this is the step the lookup pools could never take,
//   (3) an inline call (the IH or a sibling lemma) whose conclusion unifies,
//   (4) binder introduction for a higher-order want, with the body inhabited in the
//       extended scope.
//
// ── the two laws it must obey ───────────────────────────────────────────────
// **It may only ADD or SHARPEN candidates, never refuse one.** Selection uses
// `typeIncompatible` (both heads rigid and different), which is the same conservative
// test as the shipped prefilter; everything uncertain passes. Pruning is a closed axis
// with 22 negative results behind it.
//
// **It is CAPPED at every level.** Recursive generation multiplies, and the corpus
// evidence says the win comes from a term being PRESENT AT ALL, not from enumerating
// more of them (caps widened 128× changed 207/207 verdicts by nothing). So the caps are
// deliberately tight: breadth is not the product here, expressiveness is.

import {
  conclusionOf,
  headOfConclusion,
  parseAppType,
  enumerateConstructorsTyped,
  constructorArgDescriptor,
  isCTypeFamily,
  typeFamilyHead,
  contextWritableAt,
} from './hole-split.mjs';
import {
  unifyTypes,
  typeIncompatible,
  instantiateType,
  splitContextParts,
  asBox,
} from './prover-unify.mjs';

const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

// Tight by intent — see the header. `PER_SLOT` is how many inhabitants one argument may
// contribute, `COMBOS` how many argument tuples one constructor may yield, `TOTAL` the
// ceiling on one `inhabit` call.
const PER_SLOT = 4;
const COMBOS = 8;
const TOTAL = 16;

function combos(lists, max) {
  let acc = [[]];
  for (const l of lists) {
    const next = [];
    for (const a of acc) {
      for (const x of l) {
        next.push([...a, x]);
        if (next.length >= max) break;
      }
      if (next.length >= max) break;
    }
    acc = next;
    if (!acc.length) return [];
  }
  return acc.slice(0, max);
}

// A context's own binders are inhabitants of their declared types — `extend`'s
// `[h, x:target _ |- x]` cites `x`, which exists in no hole scope because it is bound by
// the SLOT's context. Reachable only once the unifier has instantiated that context.
function contextBinders(ctxText) {
  const out = [];
  for (const part of splitContextParts(ctxText)) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    const type = part.slice(i + 1).trim();
    if (!/^[\p{Ll}_][\p{L}\p{N}_']*$/u.test(name)) continue;
    if (/\bblock\b/.test(type)) continue; // block entries inhabit by projection
    out.push({ name, type, concl: conclusionOf(type) });
  }
  return out;
}

// Does a hypothesis in context `have` need the weakening substitution to be cited in
// context `want`? Purely structural: `want` extends `have` as a prefix.
function weakenSuffix(haveCtx, wantCtx) {
  const h = splitContextParts(haveCtx);
  const w = splitContextParts(wantCtx);
  if (!h.length || w.length <= h.length) return null;
  for (let i = 0; i < h.length; i += 1) {
    if (norm(h[i]) !== norm(w[i])) return null;
  }
  return '[..]';
}

// ── the procedure ───────────────────────────────────────────────────────────

// `env` = { hole, code, scope, thm, inlineCalls, depthUsed }
//   scope       — [{ name, type, concl, where }] the hypotheses in play
//   inlineCalls — (familyHead) => callText[]   (supplied by the caller that holds the thm)
export function inhabit(want, env, depth = 2) {
  const t = norm(want);
  if (!t) return [];
  if (t[0] === '{') {
    // An explicit Pi: the checker infers a boxed witness (the existential idiom).
    const inner = /^\{\s*[^:]*:\s*([\s\S]*)\}$/.exec(t);
    const bd = inner && asBox(inner[1].trim());
    return bd ? [bd.ctx ? `[${bd.ctx} |- _]` : '[ |- _]', '_'] : ['_'];
  }
  const desc = constructorArgDescriptor(t, []);
  if (desc && desc.higherOrder) return inhabitHigherOrder(t, desc, env, depth);
  const box = asBox(t);
  if (box) return inhabitBoxed(box, env, depth);
  return inhabitComputational(t, env, depth);
}

// A BOXED want `[Γ ⊢ C]`: build an LF term of type C, in context Γ, then box it once.
function inhabitBoxed(box, env, depth) {
  const out = [];
  const seen = new Set();
  const ctx = box.ctx || '';
  const writable = env.hole ? contextWritableAt(env.code, env.hole, ctx) : true;
  // A context spelled with reconstruction-invented names is not citable (invariant 11);
  // the lead-underscored spelling is the one that checks. Both go out, checker arbitrates.
  const spellings = writable || !ctx
    ? [ctx]
    : [splitContextParts(ctx).map((p, i) => (i === 0 ? '_' : p)).join(', '), ctx];
  const push = (term) => {
    for (const c of spellings) {
      const s = c ? `[${c} |- ${term}]` : `[ |- ${term}]`;
      if (!seen.has(s)) { seen.add(s); out.push(s); }
      if (out.length >= TOTAL) return;
    }
  };

  // (1) hypotheses of the right family — metas first (they are contextual objects and may
  //     be weakened), then the slot context's own binders.
  for (const h of env.scope) {
    if (out.length >= TOTAL) break;
    if (!h || !h.name) continue;
    if (typeIncompatible(h.concl || h.type, box.concl)) continue;
    const hb = asBox(h.type);
    const hctx = hb ? hb.ctx : '';
    if (h.where === 'comp') {
      // A comp variable is a VALUE, not an LF term — it may never be spelled inside a
      // box (measured: "Expected an LF term-level constant"). It inhabits the box only
      // by being the whole boxed object, which the caller handles.
      continue;
    }
    push(h.name);
    const wk = weakenSuffix(hctx, ctx);
    if (wk) push(`${h.name}${wk}`);
  }
  for (const b of contextBinders(ctx)) {
    if (out.length >= TOTAL) break;
    if (typeIncompatible(b.concl, box.concl)) continue;
    push(b.name);
  }

  // (2) constructors of the want's family, arguments inhabited RECURSIVELY.
  const fam = typeFamilyHead(box.concl, env.code) || headOfConclusion(box.concl);
  if (fam && fam !== 'type') {
    for (const ctor of enumerateConstructorsTyped(env.code, fam)) {
      if (out.length >= TOTAL) break;
      if (!ctor.argTypes || !ctor.argTypes.length) { push(ctor.name); continue; }
      if (depth <= 0) continue;
      const u = unifyTypes(ctor.result ? [ctor.result.head, ...(ctor.result.indices || [])].join(' ') : '', box.concl);
      const perArg = [];
      let ok = true;
      for (const at of ctor.argTypes) {
        const wantArg = u ? instantiateType(at, u) : at;
        // Inside a box the argument lives in the SAME context, so an unboxed LF argument
        // type is inhabited in that context rather than as a fresh contextual object.
        // A higher-order or already-boxed argument keeps its own shape; a plain LF
        // argument type is inhabited IN THE ENCLOSING CONTEXT, which is what makes the
        // recursion context-correct rather than context-blind.
        const argDesc = constructorArgDescriptor(wantArg, []);
        const inner = (asBox(wantArg) || (argDesc && argDesc.higherOrder))
          ? wantArg
          : (ctx ? `[${ctx} |- ${wantArg}]` : `[ |- ${wantArg}]`);
        const got = inhabit(inner, env, depth - 1)
          .map((x) => unbox(x))
          .filter(Boolean)
          .slice(0, PER_SLOT);
        if (!got.length) { ok = false; break; }
        perArg.push(got);
      }
      if (!ok) continue;
      for (const combo of combos(perArg, COMBOS)) {
        push(`${ctor.name} ${combo.map(paren).join(' ')}`);
        if (out.length >= TOTAL) break;
      }
    }
  }
  return out;
}

function unbox(text) {
  const d = asBox(text);
  if (d) return d.concl;
  return norm(text);
}
function paren(t) {
  const s = norm(t);
  return /\s/.test(s) && !(s[0] === '(' || s[0] === '[') ? `(${s})` : s;
}

// A COMPUTATIONAL want — a ctype application (`Map [h] [g]`) or a bare family.
function inhabitComputational(t, env, depth) {
  const out = [];
  const seen = new Set();
  const push = (x) => { const s = norm(x); if (s && !seen.has(s)) { seen.add(s); out.push(s); } };
  const app = parseAppType(t);
  const fam = app && app.head;
  if (!fam) return out;

  // (1) hypotheses — a comp value of the same family passes BARE (the M3/M4 rule).
  for (const h of env.scope) {
    if (out.length >= TOTAL) break;
    if (!h || !h.name) continue;
    const ha = parseAppType(norm(h.type));
    if (ha && ha.head === fam) push(h.name);
  }

  // (3) an inline call whose conclusion is this family. Placed BEFORE constructor
  //     application because a derived fact is what constructor slots usually need, and
  //     an appended candidate is unreachable under the caller's combo cap.
  if (env.inlineCalls) {
    for (const c of (env.inlineCalls(fam) || [])) {
      push(c);
      if (out.length >= TOTAL) break;
    }
  }

  // (2) constructors, arguments inhabited recursively.
  if (depth > 0 && isCTypeFamily(env.code, fam)) {
    for (const ctor of enumerateConstructorsTyped(env.code, fam)) {
      if (out.length >= TOTAL) break;
      if (!ctor.argTypes || !ctor.argTypes.length) { push(ctor.name); continue; }
      const u = app ? unifyTypes([ctor.result.head, ...(ctor.result.indices || [])].join(' '), t) : null;
      const perArg = [];
      let ok = true;
      for (const at of ctor.argTypes) {
        const wantArg = u ? instantiateType(at, u) : at;
        const got = inhabit(wantArg, env, depth - 1).slice(0, PER_SLOT);
        if (!got.length) { ok = false; break; }
        perArg.push(got);
      }
      if (!ok) continue;
      for (const combo of combos(perArg, COMBOS)) {
        push(`${ctor.name} ${combo.map(paren).join(' ')}`);
        if (out.length >= TOTAL) break;
      }
    }
  }
  return out;
}

// A HIGHER-ORDER want `({x:A} … C)` or `(A -> C)`: introduce the binders and inhabit the
// BODY in the extended scope. The binders join the scope, so they can inhabit the body's
// own slots — which is the whole point, and is why a lookup pool could never fill one of
// these before a recursion result existed to look up.
function inhabitHigherOrder(t, desc, env, depth) {
  const binders = (desc.binderCtx || []).map((b, i) => ({
    name: b.name || `x${i + 1}`, type: b.type || '', concl: conclusionOf(b.type || ''),
  }));
  if (!binders.length) return [];
  const lam = (body) => `(${binders.map((b) => `\\${b.name}. `).join('')}${body})`;
  const out = [];
  const seen = new Set();
  const push = (x) => { const s = lam(x); if (!seen.has(s)) { seen.add(s); out.push(s); } };

  // A binder is the simplest possible body.
  for (const b of binders) {
    if (!typeIncompatible(b.concl, conclusionOf(desc.bodyType || ''))) push(b.name);
  }
  if (depth > 0) {
    const env2 = { ...env, scope: [...env.scope, ...binders.map((b) => ({ ...b, where: 'meta' }))] };
    const bodyWant = norm(desc.bodyType || '');
    for (const term of inhabit(bodyWant, env2, depth - 1)) {
      push(unbox(term));
      if (out.length >= TOTAL) break;
    }
    // A meta used under new binders must carry the EXTENDED substitution; dual-spelled.
    for (const h of env.scope) {
      if (out.length >= TOTAL) break;
      if (!h || !h.name || h.where === 'comp') continue;
      if (typeIncompatible(h.concl || h.type, conclusionOf(desc.bodyType || ''))) continue;
      push(`${h.name}[.., ${binders.map((b) => b.name).join(', ')}]`);
    }
  }
  return out.slice(0, TOTAL);
}

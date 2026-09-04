// GOAL-DIRECTED PROOF SYNTHESIS — SLD resolution over the pattern fragment.
//
// The greedy generate-and-verify loop cannot FIND a deep `let`-chain whose steps
// don't individually refine the goal (the bigstep eval_app1 shape: four
// non-closing lets, only the tail closes). This engine derives such chains the
// way logic programming does: BACKWARD from the goal, unifying each rule's
// RESULT against the goal and recursing on the premises the unifier leaves as
// subgoals. Every instantiation comes from unification against declared types —
// nothing is enumerated blindly — so the chain is a directed derivation, and the
// engine is complete for its fragment up to the depth bound. The assembled term
// is certified by ONE checker call (the caller's job); internal types here are
// planning approximations, never trusted output.
//
// Fragment (v1, honest scope): goals and facts in one shared base context;
// under-binder facts extend it by object/derivation binders; first-order
// matching with substitution-form metavariables (`M'[.., x]`) plus the single
// beta step a higher-order constructor argument needs. Anything outside the
// fragment returns null — the caller's other move generators still run.
//
// Inputs are PLAIN DATA (the bridge adapts holes/theorems to this shape):
//   goal  : { ctx, concl }
//   facts : [{ name, extras: [{name,type}], concl, original }]
//     extras=[] ⇒ a base-context fact; extras≠[] ⇒ an under-binder fact whose
//     conclusion mentions the binders in substitution form.
//   rules : [{ name, isIH, decIdx, flex: [names], pis: [{kind:'ctx'}|
//             {kind:'obj', varName}], premises: [conclText], result: conclText }]
//   ctors : Map(family → [{ name, argTypes, result: {head, indices} }])
// Output: { text } (a complete hole-closing term: lets + tail) or null.

import { normalizeCtypeSpelling, parseCompType, isCtypeApplication } from './prover-comp-type.mjs';
import { decomposeContextual } from './hole-split.mjs';

const MAX_DEPTH = 5;
const MAX_NODES = 400;
const MAX_PRODUCTS = 12;

// Internal marker around explicit object-Pi argument boxes (like the `¿`
// namespace: a character neither Beluga source nor checker output contains).
// Assembly strips it from the primary text and derives the `[ |- _]`-spelled
// alternative from it — see the pi-argument rendering in applyRule.
const OBJ_MARK = '¦';
const stripObjMarks = (s) => String(s).split(OBJ_MARK).join('');
const underscoreObjMarks = (s) => String(s)
  .replace(new RegExp(`${OBJ_MARK}\\[([^${OBJ_MARK}]*)\\]${OBJ_MARK}`, 'g'), (whole, inner) => {
    const cut = Math.max(inner.lastIndexOf('|-'), inner.lastIndexOf('⊢'));
    return cut >= 0 ? `[${inner.slice(0, cut)}|- _]` : '[ |- _]';
  })
  .split(OBJ_MARK).join('');

// ── term utilities (substitution-form token domain) ──────────────────────────

function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

/** How a fact is spelled when cited in a synthesized term. */
export function factArgText(f) {
  if (f.transportSub) return `${f.name}[${f.transportSub}]`;
  if (f.weaken) return `${f.name}[..]`;
  return f.name;
}

// Split into top-level tokens; parenthesised groups stay whole.
function toks(text) {
  const s = norm(text);
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ' ' && depth === 0) { if (cur) { out.push(cur); cur = ''; } } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function stripParens(t) {
  let s = norm(t);
  while (s[0] === '(' && s[s.length - 1] === ')') {
    // only strip if the parens are a single balanced group
    let d = 0;
    let whole = true;
    for (let i = 0; i < s.length; i += 1) {
      if (s[i] === '(') d += 1;
      else if (s[i] === ')') { d -= 1; if (d === 0 && i < s.length - 1) { whole = false; break; } }
    }
    if (!whole) break;
    s = s.slice(1, -1).trim();
  }
  return s;
}

// NAMESPACE SEPARATION: a rule's schematic variables are renamed into a reserved
// namespace (`¿`-prefixed — a character checker output never contains) before any
// matching, so a schematic name can never collide with a same-spelled RIGID
// checker metavariable in the goal/facts (rule `R'` vs goal meta `R'` — the
// capture that would otherwise corrupt instantiation).
function freshenRule(rule) {
  const map = new Map();
  for (const v of rule.flex) map.set(v, `¿${v}`);
  const ren = (t) => applyTheta(t, rule.flex, map);
  return {
    ...rule,
    flex: new Set([...rule.flex].map((v) => `¿${v}`)),
    premises: rule.premises.map(ren),
    result: ren(rule.result),
    pis: rule.pis.map((p) => (p.kind === 'obj' ? { ...p, varName: `¿${p.varName}` } : p)),
  };
}

// Parse a substitution token `H[.., a, b]` / `H[..]` / `H[]` → { head, args }.
// (`..` is the identity prefix, not an argument.) Null for non-subst tokens.
function substTok(t) {
  const m = /^([\p{L}_"¿][\p{L}\p{N}_']*)\[([^[\]]*)\]$/u.exec(norm(t));
  if (!m) return null;
  const parts = m[2].split(',').map((x) => x.trim()).filter((x) => x.length);
  const args = parts[0] === '..' ? parts.slice(1) : parts;
  return { head: m[1], args };
}

// One-directional MATCH: pattern may contain flex names (bare, or as slots of a
// substitution token); ground side is rigid. Binds into θ; alpha tracks matched
// lambda binders. Returns false on any mismatch — when in doubt, fail (the
// caller treats failure as "this rule/fact does not apply", never as an error).
function matchT(pattern, ground, flex, theta, alpha = new Map()) {
  const p = toks(pattern);
  const g = toks(ground);
  if (p.length !== g.length) return false;
  for (let i = 0; i < p.length; i += 1) {
    const pt = p[i];
    const gt = g[i];
    const pb = /^\\([\w'"]+)\.$/.exec(pt);
    const gb = /^\\([\w'"]+)\.$/.exec(gt);
    if (pb || gb) {
      if (!pb || !gb) return false;
      alpha.set(pb[1], gb[1]);
      continue;
    }
    if (flex.has(pt)) {
      const bound = theta.get(pt);
      if (bound != null && norm(bound) !== norm(gt)) return false;
      theta.set(pt, gt);
      continue;
    }
    const ps = substTok(pt);
    const gs = substTok(stripParens(gt));
    if (ps && ps.args.some((a) => flex.has(a))) {
      // `H[.., x]` with flex slot x: same rigid head, slotwise match.
      if (!gs || gs.head !== ps.head || gs.args.length !== ps.args.length) return false;
      for (let k = 0; k < ps.args.length; k += 1) {
        if (flex.has(ps.args[k])) {
          const bound = theta.get(ps.args[k]);
          if (bound != null && norm(bound) !== norm(gs.args[k])) return false;
          theta.set(ps.args[k], gs.args[k]);
        } else if (norm(ps.args[k]) !== norm(gs.args[k])) return false;
      }
      continue;
    }
    // Ctype context tokens (2026-07-21 ctype-split slice). Two planning-domain
    // rules — the checker arbitrates every downstream spelling:
    //  • an instantiated `[_]` pattern token (a context the checker's hole
    //    print elided) matches ANY bracket ground token, no binding;
    //  • a flex-HEAD context extension `[CTXV_g, x:term]` (built by
    //    flexCtx/mkRule's ctype preprocessing) binds its head to the ground
    //    context's leading segment when the remaining tail agrees —
    //    `[CTXV_g, x:term]` vs `[_, x : term]` binds CTXV_g := `_`.
    if (pt[0] === '[' && gt[0] === '[') {
      if (norm(pt) === '[_]') continue;
      // `[FX]` whole-token: bind FX to the ground bracket's INNER text.
      const pw = /^\[\s*([^\s,\]]+)\s*\]$/.exec(pt);
      if (pw && flex.has(pw[1])) {
        const val = gt.slice(1, -1).trim();
        const bound = theta.get(pw[1]);
        if (bound != null && norm(bound) !== norm(val)) return false;
        theta.set(pw[1], val);
        continue;
      }
      const pm = /^\[\s*([^\s,\]]+)\s*,\s*([\s\S]*)\]$/.exec(pt);
      if (pm && flex.has(pm[1])) {
        const ptail = pm[2].replace(/\s+/g, '');
        const gi = gt.slice(1, -1);
        let depth = 0;
        let boundHere = false;
        for (let k = 0; k < gi.length; k += 1) {
          const ch = gi[k];
          if (ch === '(' || ch === '[') depth += 1;
          else if (ch === ')' || ch === ']') depth -= 1;
          else if (ch === ',' && depth === 0) {
            if (gi.slice(k + 1).replace(/\s+/g, '') === ptail) {
              const val = gi.slice(0, k).trim();
              const bound = theta.get(pm[1]);
              if (bound != null && norm(bound) !== norm(val)) return false;
              theta.set(pm[1], val);
              boundHere = true;
              break;
            }
          }
        }
        if (boundHere) continue;
        return false;
      }
    }
    if (pt[0] === '(' || gt[0] === '(') {
      const spt = stripParens(pt);
      const sgt = stripParens(gt);
      // WELL-FOUNDED recursion only: a token like `(a)(b)` starts with `(` but
      // is not one balanced group, so stripParens returns it UNCHANGED —
      // recursing on identical arguments overflowed the stack (the wk crash,
      // 2026-07-18 heldout sweep). Unstrippable tokens fall through to the
      // literal comparison below.
      if (spt !== pt || sgt !== gt) {
        if (!matchT(spt, sgt, flex, theta, alpha)) return false;
        continue;
      }
    }
    if (alpha.has(pt)) {
      if (alpha.get(pt) !== gt) return false;
      continue;
    }
    if (norm(pt) !== norm(gt)) return false;
  }
  return true;
}

// SYMMETRIC unification: flex names on EITHER side may bind (two substitutions).
// Used by inversion, where the ctor pattern carries ¿-schematics AND the product's
// type carries refinable hole METAVARIABLES — a pattern match refines both.
function unifyT(a, b, flexA, flexB, thA, thB, alpha = new Map()) {
  const ta = toks(a);
  const tb = toks(b);
  if (ta.length !== tb.length) {
    // eta-mismatch fallbacks are out of fragment — fail (sound: caller skips).
    return false;
  }
  for (let i = 0; i < ta.length; i += 1) {
    const x = ta[i];
    const y = tb[i];
    const lx = /^\\([\w'"]+)\.$/.exec(x);
    const ly = /^\\([\w'"]+)\.$/.exec(y);
    if (lx || ly) {
      if (!lx || !ly) return false;
      alpha.set(lx[1], ly[1]);
      continue;
    }
    if (flexA.has(x)) {
      const bound = thA.get(x);
      if (bound != null && norm(bound) !== norm(y)) return false;
      thA.set(x, y);
      continue;
    }
    if (flexB.has(y)) {
      const bound = thB.get(y);
      if (bound != null && norm(bound) !== norm(x)) return false;
      thB.set(y, x);
      continue;
    }
    if (x[0] === '(' || y[0] === '(') {
      const sx = stripParens(x);
      const sy = stripParens(y);
      // Same well-foundedness guard as matchT (the wk stack overflow).
      if (sx !== x || sy !== y) {
        if (!unifyT(sx, sy, flexA, flexB, thA, thB, alpha)) return false;
        continue;
      }
    }
    if (alpha.has(x)) {
      if (alpha.get(x) !== y) return false;
      continue;
    }
    if (norm(x) !== norm(y)) return false;
  }
  return true;
}

// Apply θ to a rule/ctor text in ONE pass (sequential replacement could rewrite
// tokens inside an already-inserted binding — capture). Flex identifiers are
// replaced where they occur as whole tokens or before a substitution suffix; a
// bound value that is itself an application gets parenthesised in token position.
function applyTheta(text, flex, theta) {
  const wrap = (v) => (toks(v).length > 1 && v[0] !== '(' ? `(${v})` : v);
  return norm(text).replace(/[\p{L}_"¿][\p{L}\p{N}_']*(\[)?/gu, (m, bracket, off, str) => {
    const name = bracket ? m.slice(0, -1) : m;
    // must be a whole token: not preceded by an identifier char
    const prev = off > 0 ? str[off - 1] : ' ';
    if (/[\p{L}\p{N}_'"¿]/u.test(prev)) return m;
    if (!flex.has(name) || theta.get(name) == null) return m;
    const v = theta.get(name);
    return bracket ? `${v}[` : wrap(v);
  });
}

// Names (flex candidates) still unbound in a text.
function unboundIn(text, flex, theta) {
  const out = new Set();
  for (const t of norm(text).match(/[\p{L}_"¿][\p{L}\p{N}_']*/gu) || []) {
    if (flex.has(t) && theta.get(t) == null) out.add(t);
  }
  return out;
}

// The single beta step the fragment needs: instantiating a HO constructor arg's
// body `(M x)` where σ(M) = `(\y. B)` (or a bare metavar). Yields substitution
// form: `B[.., x]` with y renamed to x — approximated as `B'[.., x]` where B' is
// σ(M)'s body when it is a bare name, else null (outside fragment).
function betaBody(fnVal, argName) {
  const v = stripParens(fnVal);
  const lam = /^\\([\w'"]+)\.\s*([\s\S]+)$/.exec(v);
  if (lam) {
    const body = norm(lam[2]);
    if (/^[\p{L}_"¿][\p{L}\p{N}_']*$/u.test(body)) return `${body}[.., ${argName}]`;
    return null; // structured body — outside v1's fragment
  }
  // A bare metavariable — incl. a still-unbound ¿-schematic (an inversion may
  // leave some ctor schematics undetermined; the component pattern still binds).
  if (/^[\p{L}_"¿][\p{L}\p{N}_']*$/u.test(v)) return `${v}[.., ${argName}]`;
  return null;
}

function splitArrows(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  const str = norm(s);
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    if (depth === 0 && (str.startsWith('->', i) || str[i] === '→')) {
      out.push(cur.trim());
      cur = '';
      i += str[i] === '→' ? 0 : 1;
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Destructure one ctor arg into a synth fact + pattern fragment.
 * FO → base fact; Pi-prefixed HO `{x:T} …` → under-binder fact (Phase F.9).
 * Null when outside the fragment (structured beta, bare-arrow HO without Pi).
 */
export function componentOfArg(argType, flex, theta, freshName) {
  const at = stripParens(norm(argType));
  if (!/[{]/.test(at)) {
    if (/->|→/.test(at)) return null; // bare-arrow HO — not Pi-prefixed
    const name = freshName();
    return {
      fact: { name, extras: [], concl: applyTheta(at, flex, theta), original: false },
      pattern: name,
      name,
    };
  }
  const extras = [];
  let rest = at;
  const piRe = /^\{\s*([\w'"]+)\s*:\s*([^}]*)\}\s*/;
  let m = piRe.exec(rest);
  while (m) {
    extras.push({ name: m[1], type: norm(m[2]) });
    rest = rest.slice(m[0].length);
    m = piRe.exec(rest);
  }
  const arrowParts = splitArrows(rest);
  const body = arrowParts[arrowParts.length - 1];
  const hypNames = ['u', 'v', 'w'];
  for (let i = 0; i < arrowParts.length - 1; i += 1) {
    extras.push({ name: hypNames[i % 3] + (i > 2 ? i : ''), type: norm(arrowParts[i]) });
  }
  const inst = applyTheta(body, flex, theta);
  const bts = toks(inst);
  const outToks = [];
  for (const t of bts) {
    const app = /^\(\s*([\s\S]+?)\s+([\w'"]+)\s*\)$/.exec(t);
    if (app && extras.some((e) => e.name === app[2])) {
      const b = betaBody(app[1], app[2]);
      if (!b) return null;
      outToks.push(b);
    } else outToks.push(t);
  }
  const name = freshName();
  const binderPat = extras.map((e) => `\\${e.name}.`).join(' ');
  return {
    fact: { name, extras, concl: outToks.join(' '), original: false },
    pattern: `(${binderPat} ${name})`,
    name,
  };
}

// ── rule descent classification (the termination architecture) ───────────────
// The Twelf-style structural check (Rohwedder–Pfenning mode/termination), done
// per rule, purely on token structure — never on names. It partitions the rule
// space into the three classes whose search policies make backward chaining
// terminate WITHOUT numeric budgets:
//   'descending' — every premise argument is a subterm of a conclusion argument,
//     ≥1 strictly, per premise: recursion descends the goal's own structure
//     (well-founded, no cap needed).
//   'orbit' — no premise builds new rigid structure around a schematic (bare
//     fresh existentials like trans's middle K allowed): reachable goals stay in
//     the finite subterm closure of goal∪facts arranged in the signature's
//     bounded-depth templates — the path check + memo exhaust a FINITE orbit.
//   'growing' — some premise wraps a schematic in rigid structure absent from
//     the conclusion (`q (s X)` under `p X`): the one genuinely non-terminating
//     backward dimension (Horn logic is Turing-complete through exactly this).
//     Policy: such premises resolve from FACTS only — never spawn recursive
//     subgoals. This is correct, not a compromise: grown derivations (multi-step
//     evaluations) come from destructured hypotheses via demanded splits, never
//     from synthesizing computation.

// Token-tree containment: does `needle` occur as a subterm of `hay`?
// Substitution tokens `H[.., a]` expose head + slot args as subterms.
function containsTerm(hay, needle) {
  const h = stripParens(norm(hay));
  const n = stripParens(norm(needle));
  if (!n) return false;
  if (h === n) return true;
  const parts = toks(h);
  if (parts.length <= 1) {
    const st = substTok(h);
    if (st) return st.head === n || st.args.some((a) => containsTerm(a, n));
    return false;
  }
  return parts.some((p) => containsTerm(p, n));
}

function mentionsFlex(text, flex) {
  for (const t of String(norm(text)).match(/[\p{L}_"¿][\p{L}\p{N}_']*/gu) || []) {
    if (flex.has(t)) return true;
  }
  return false;
}

export function classifyRuleDescent(rule) {
  const cargs = toks(norm(rule.result)).slice(1).map(stripParens);
  let growing = false;
  let allDescending = (rule.premises || []).length > 0;
  for (const prem of (rule.premises || [])) {
    const pargs = toks(norm(prem)).slice(1).map(stripParens);
    let anyStrict = false;
    let allContained = pargs.length > 0;
    for (const pa of pargs) {
      const compound = toks(pa).length > 1;
      const contained = cargs.some((ca) => containsTerm(ca, pa));
      if (compound && mentionsFlex(pa, rule.flex) && !contained) growing = true;
      if (!contained) allContained = false;
      else if (cargs.some((ca) => containsTerm(ca, pa) && norm(stripParens(ca)) !== norm(stripParens(pa)))) anyStrict = true;
    }
    if (!(allContained && anyStrict)) allDescending = false;
  }
  if (growing) return 'growing'; // GENERAL: descent-class tag, structural — not a Beluga name
  if (allDescending) return 'descending'; // GENERAL: descent-class tag
  return 'orbit'; // GENERAL: descent-class tag
}

// ── the engine ────────────────────────────────────────────────────────────────

export function synthesize(goal, facts, rules, ctors, opts = {}) {
  const metaVars = opts.metaVars || new Set();
  let nodes = 0;
  // G.2c per-level flags (iterative deepening): a depth cut is normal frontier
  // behavior at a non-final level, NEVER a bound; nodes/choice cuts are runtime
  // tripwires. Only the FINAL level's flags decide the exhaustion certificate.
  let levelFlags = { depthHit: false, nodesHit: false, choiceHit: false };
  const failMemo = new Set();
  const allFacts = [...facts];
  const saturationLets = []; // [{ text, provides: [names] }]
  const refutations = []; // complete `satLet + impossible h` closers
  let freshN = 0;
  const fresh = () => { freshN += 1; return `S${freshN}`; };
  let etaN = 0;
  const freshEta = () => { etaN += 1; return `η${etaN}`; };
  const box = (inner) => `[${goal.ctx ? goal.ctx + ' |- ' : ' |- '}${inner}]`;

  // ---- FORWARD SATURATION: invertible products only. For the IH (and lemmas
  // with ≥2 premises), a premise tuple drawn from ORIGINAL base facts gives a
  // product; when the product's indices force a UNIQUE constructor, destructure
  // it — a deterministic inversion (no choice, no information loss), so adding
  // its components preserves completeness without exploding the fact set.
  for (const rawRule of rules) {
    if (!rawRule.premises.length || rawRule.pis.length) continue;
    const rule = freshenRule(rawRule);
    const tuples = premiseTuples(rule, allFacts);
    // Truncation trims the fact pool ⇒ trims completeness ⇒ taints exhaustion.
    if (tuples.length > MAX_PRODUCTS && opts.stats) opts.stats.boundHit = true;
    for (const { theta, refs } of tuples.slice(0, MAX_PRODUCTS)) {
      if (rule.isIH && !refs[rule.decIdx]?.decOk) continue;
      const result = applyTheta(rule.result, rule.flex, theta);
      const inv = uniqueInversion(result, ctors);
      if (!inv) continue;
      const comps = [];
      const patParts = [inv.ctor.name];
      let ok = true;
      for (const at of inv.ctor.argTypes) {
        const c = componentOfArg(at, inv.flex, inv.theta, fresh);
        if (!c) { ok = false; break; }
        comps.push(c.fact);
        patParts.push(c.pattern);
      }
      if (!ok || !comps.length) continue;
      const args = refs.map((r) => (r.viaComp ? r.name : box(r.name))).join(' ');
      // A CTYPE-result product destructures via the BARE constructor pattern
      // over boxed components (`let Re [ ⊢ S1] [ ⊢ S2] = reassoc [ ⊢ P] q in`);
      // an LF product destructures inside one box as before.
      const satText = rule.ctypeResult
        ? `let ${patParts[0]} ${patParts.slice(1).map((pp) => box(pp)).join(' ')} = ${rule.name} ${args} in`
        : `let ${box(patParts.join(' '))} = ${rule.name} ${args} in`;
      saturationLets.push({ text: satText, provides: comps.map((c) => c.name) });
      for (const c of comps) allFacts.push(c);
      // REFUTATION closing (the reference's `let [g ⊢ eq_lam …] = … in
      // impossible [g ⊢ NL]` idiom): the inversion REFINED result-side
      // metavariables (inv.metaTheta, e.g. M'1 := lam ¿N). Propagate the
      // refinement (¿-schematics become arbitrary-but-fixed η rigids) into each
      // base fact; a fact whose refined type no declared constructor can unify
      // with is uninhabitable — the destructuring let plus `impossible` CLOSES
      // the goal by contradiction. Checker-certified like every move.
      if (inv.metaTheta && inv.metaTheta.size) {
        const refKeys = new Set(inv.metaTheta.keys());
        const etaed = new Map();
        for (const [k, v] of inv.metaTheta) {
          etaed.set(k, String(v).replace(/¿[\p{L}\p{N}_']*/gu, () => freshEta()));
        }
        for (const f of facts) {
          if (f.invented) continue; // Phase F.7
          if (f.extras.length) continue;
          if ([...refKeys].every((k) => !new RegExp(`(^|[^A-Za-z0-9_'¿])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_']|$)`).test(f.concl))) continue;
          const refined = applyTheta(f.concl, refKeys, etaed);
          const fam = toks(refined)[0];
          const famCtors = ctors.get(fam) || [];
          if (!famCtors.length) continue;
          const inhabited = famCtors.some((c2) => {
            const rf = ctorFlex(c2);
            const m2 = new Map();
            for (const v of rf) m2.set(v, `¿${v}`);
            const pat2 = applyTheta(`${c2.result.head} ${c2.result.indices.join(' ')}`.trim(), rf, m2);
            return unifyT(pat2, refined, new Set([...rf].map((v) => `¿${v}`)), metaVars, new Map(), new Map());
          });
          if (!inhabited) {
            refutations.push(`${satText}\nimpossible ${box(f.name)}`);
          }
        }
      }
    }
  }

  // ---- FACT-INVERSION SATURATION (spec §2 invert): a base fact whose (refined)
  // type admits exactly ONE unifying constructor destructures deterministically —
  // `let [Γ ⊢ ctor c1 c2] = F in` — no choice, no information loss. Components
  // are strict subterms, so decOk is INHERITED (the totality checker's criterion
  // descends through subterms). Bounded fixpoint so an inversion CHAIN
  // (`oft (s (plus M N)) nat` needing two levels) saturates too.
  let lastRoundAdded = false;
  for (let round = 0; round < 3; round += 1) {
    let added = false;
    for (const f of [...allFacts]) {
      if (f.invented) continue; // Phase F.7 — `let … = Invented` is unwritable
      if (f.extras.length || f.inverted) continue;
      const inv = uniqueInversion(f.concl, ctors);
      if (!inv) continue;
      f.inverted = true;
      const comps = [];
      const patParts = [inv.ctor.name];
      let ok = true;
      for (const at of inv.ctor.argTypes) {
        const c = componentOfArg(at, inv.flex, inv.theta, fresh);
        if (!c) { ok = false; break; }
        c.fact.decOk = !!f.decOk;
        comps.push(c.fact);
        patParts.push(c.pattern);
      }
      if (!ok || !comps.length) continue;
      const rhs = f.viaComp ? f.name : box(f.name);
      saturationLets.push({
        text: `let ${box(patParts.join(' '))} = ${rhs} in`,
        provides: comps.map((c) => c.name),
      });
      for (const c of comps) allFacts.push(c);
      added = true;
    }
    lastRoundAdded = added;
    if (!added) break;
  }
  // The fixpoint was cut by the round cap, not reached — a bound, not a "no".
  if (lastRoundAdded && opts.stats) opts.stats.boundHit = true;

  // ---- BACKWARD SOLVER ----
  // solve → { argText, lets } (argText goes inside a box at the use site) | null.
  // `path` is the SLD loop check: the normalized goals on the current derivation
  // path — a rule may not re-derive a goal it is already trying to derive (kills
  // the eq_sym ping-pong without forbidding a single legitimate symmetric step).
  // `suppressRules` (ROOT-ONLY, never propagated into recursion): skip the
  // rules loop at THIS node so the ctor/fact chains surface as an ALTERNATIVE
  // candidate. The synth is otherwise one-shot — the first plan-valid chain
  // wins — and C6's wider rule applicability let a checker-REJECTED rule call
  // shadow a checker-ACCEPTED ctor fill (the `remove` regression: `append X X`
  // shadowed `Nil`; exCRel's TRvar arm: direct `exCRel X2` shadows
  // `Crel_xa (exCRel X2)` — note the suppressed pass still uses rules INSIDE
  // premise recursion, so compositions survive). The checker arbitrates the
  // candidate list; this only widens it.
  function solve(concl, depth, path = [], lfOnly = false, suppressRules = false) {
    nodes += 1;
    if (nodes > (opts.maxNodes || MAX_NODES)) {
      levelFlags.nodesHit = true; // runtime tripwire — taints this level only
      return { status: 'dead' };
    }
    const goalKey = norm(concl);
    // A path-cut prunes only derivations that re-derive an ancestor goal inside
    // themselves — complete for minimal proofs (the standard tabling argument).
    // But a failure REACHED THROUGH a cut is path-DEPENDENT: memoizing it would
    // export the failure to paths where that ancestor is absent (a completeness
    // leak that would falsify the exhaustion certificate). `cyc` taints such
    // failures; tainted failures are never memoized, only re-explored.
    if (path.includes(goalKey)) return { status: 'dead', cyc: true };
    const key = `${depth}§${goalKey}`;
    if (failMemo.has(key)) return { status: 'dead' };
    // Phase D: collect obligations from ALL top-level blocked rules (not just the
    // first). "First to block" ≠ "the block a split helps" — eq_sym can shadow
    // the IH's decreasing-premise block. The demand filter selects among these.
    const blockedAcc = [];
    let cycSeen = false;

    // 1. FACTS. Base facts: exact conclusion. Under-binder facts: match with the
    // binder slots flex; undetermined slots become subgoals of their (instantiated)
    // binder types — the `E1[.., N, E2]` instantiation, derived, not guessed.
    // Phase F.7: invented report names are not source-writable — never cite them.
    for (const f of allFacts) {
      if (f.invented) continue;
      if (!f.extras.length) {
        // An LF-constructor consumer cannot take a comp variable — skip it here
        // so the constructor derivation below is still reachable (a comp fact
        // must never SHADOW a derivable LF term).
        if (lfOnly && f.viaComp) continue;
        if (norm(f.concl) === norm(concl)) {
          return { status: 'solved', argText: factArgText(f), lets: [], viaComp: !!f.viaComp };
        }
        continue;
      }
      const slotFlex = new Set(f.extras.map((e) => e.name));
      const theta = new Map();
      if (!matchT(f.concl, concl, slotFlex, theta)) continue;
      const slotTerms = [];
      const lets = [];
      let ok = true;
      for (const e of f.extras) {
        const bound = theta.get(e.name);
        if (bound != null) { slotTerms.push(bound); continue; }
        // undetermined slot: its type, with earlier slots substituted, is a subgoal
        let ty = e.type;
        for (let k = 0; k < f.extras.length; k += 1) {
          const prev = f.extras[k].name;
          const pv = theta.get(prev);
          if (pv != null) {
            ty = applyTheta(ty, new Set([prev]), new Map([[prev, pv]]));
          }
        }
        if (depth <= 0) {
          levelFlags.depthHit = true; // frontier cut — the next level goes deeper
          ok = false;
          break;
        }
        const sub = solve(ty, depth - 1, [...path, goalKey]);
        if (sub.cyc) cycSeen = true;
        if (sub.status !== 'solved') {
          if (sub.status === 'blocked' && sub.obligations) blockedAcc.push(...sub.obligations);
          ok = false;
          break;
        }
        lets.push(...sub.lets);
        slotTerms.push(sub.argText);
      }
      if (!ok) continue;
      return { status: 'solved', argText: `${f.name}[.., ${slotTerms.join(', ')}]`, lets };
    }

    if (depth <= 0) {
      levelFlags.depthHit = true; // frontier cut — the next level goes deeper
      if (!cycSeen && !suppressRules) failMemo.add(key); // a rules-suppressed failure is not a real DEAD
      return blockedAcc.length
        ? { status: 'blocked', obligations: blockedAcc, cyc: cycSeen || undefined }
        : { status: 'dead', cyc: cycSeen || undefined };
    }

    // 2. RULES (IH, lemmas, first-order constructors): unify the RESULT with the
    // goal; premises are resolved most-ground-first, each by fact-matching (which
    // may further instantiate the rule) or, once ground, by recursion. A premise
    // the unifier cannot ground fails the rule — no blind instantiation.
    const subPath = [...path, goalKey];
    for (const rule of suppressRules ? [] : rules) {
      // M2 (2026-07-19, S1): a ctype-result rule (`aeq_wk : … -> Aeq' […]…`)
      // used to be saturation-only — never tried backward. That was the
      // dominant block on the S1 composition class (`atrans_s (aeq_wk ae tr1
      // tr2)`-shape lemmas): the goal-directed chain literally cannot exist
      // without treating a ctype conclusion as an ordinary provable subgoal.
      // Un-gated; applyRule's arg-assembly is now premise-kind-aware
      // (`rule.premiseCtype`) so a ctype-typed slot embeds BARE, never boxed.
      // Descent class cached on the RAW rule; freshenRule's spread carries it.
      if (rule.descent == null) rule.descent = classifyRuleDescent(rule);
      const app = applyRule(freshenRule(rule), concl, depth, subPath);
      if (app.cyc) cycSeen = true;
      if (app.status === 'solved') return app;
      if (app.status === 'blocked' && app.obligations) blockedAcc.push(...app.obligations);
    }
    const goalHead = toks(concl)[0];
    for (const c of ctors.get(goalHead) || []) {
      const asRule = ctypeCtorAsRule(c);
      if (!asRule) continue;
      const app = applyRule(freshenRule(asRule), concl, depth, subPath);
      if (app.cyc) cycSeen = true;
      if (app.status === 'solved') return app;
      if (app.status === 'blocked' && app.obligations) blockedAcc.push(...app.obligations);
    }

    if (!cycSeen && !suppressRules) failMemo.add(key); // a rules-suppressed failure is not a real DEAD
    return blockedAcc.length
      ? { status: 'blocked', obligations: blockedAcc, cyc: cycSeen || undefined }
      : { status: 'dead', cyc: cycSeen || undefined };
  }

  function applyRule(rule, concl, depth, path = []) {
    const theta0 = new Map();
    if (!matchT(rule.result, concl, rule.flex, theta0)) return { status: 'dead' };
    if (rule.descent == null) rule.descent = classifyRuleDescent(rule); // ctor asRule path
    // Premise resolution is a bounded DFS over CHOICES (spec §2: fair argument
    // enumeration). The old greedy loop took the first matching fact per premise
    // with no backtracking — one wrong early binding (two facts matching the
    // same premise) killed derivable chains. Each level resolves the most-ground
    // pending premise, trying every base fact then (once ground) recursion.
    let choiceBudget = 64;
    let cycTaint = false; // a sub-solve was path-cut ⇒ this rule's failure is path-dependent
    // dfs returns { status:'solved', theta, resolved, lets } | { status:'blocked',
    // obligations } | { status:'dead' }. A 'blocked' return means the rule matched
    // the goal but the most-ground pending premise had no resolver — a split MIGHT
    // unblock it (the demand analysis decides). blockedFallback keeps the first
    // block seen while still exhausting SOLVING options (behavior-preserving: only
    // a 'solved' short-circuits the search, exactly as the old truthy return did).
    // Choice exhaustion is a BOUND, not an honest "no" — it must taint any
    // exhaustion claim exactly like nodes (tripwire discipline, D8).
    const choiceSpent = () => {
      levelFlags.choiceHit = true;
      return { status: 'dead' };
    };
    const dfs = (theta, pending, resolved, lets) => {
      if (choiceBudget <= 0) return choiceSpent();
      if (!pending.length) return { status: 'solved', theta, resolved, lets };
      // Most-ground first, but EVERY pending premise is tried as the pick: a
      // later premise's fact match may be what grounds an earlier one
      // (eval_respects_eq: premise 2 matches F2, which grounds premise 1).
      const ranked = [...pending].sort((a, b) =>
        unboundIn(applyTheta(a.text, rule.flex, theta), rule.flex, theta).size
        - unboundIn(applyTheta(b.text, rule.flex, theta), rule.flex, theta).size);
      let blockedFallback = null;
      for (const pick of ranked) {
        const rest = pending.filter((p) => p !== pick);
        const inst = applyTheta(pick.text, rule.flex, theta);
        // (a) every base-fact resolution of this premise. The IH's decreasing
        // premise must be a decOk fact (the totality checker's criterion); a
        // comp fact never resolves an LF constructor argument.
        for (const f of allFacts) {
          if (f.invented) continue; // Phase F.7 — no named cite of invented report facts
          if (f.extras.length) continue;
          // A comp fact never resolves an LF ctor argument — but a CTYPE
          // ctor's argument IS a comp expression (premiseCtype[i]), and a
          // comp fact is exactly what fills it (`Crel_xa X1`, C6 2026-07-21).
          if (rule.isCtor && f.viaComp && !(rule.premiseCtype && rule.premiseCtype[pick.i])) continue;
          if (rule.isIH && pick.i === rule.decIdx && !f.decOk) continue;
          const t2 = new Map(theta);
          if (!matchT(inst, f.concl, rule.flex, t2)) continue;
          choiceBudget -= 1;
          if (choiceBudget <= 0) return choiceSpent();
          const r2 = resolved.slice();
          r2[pick.i] = { text: factArgText(f), viaComp: !!f.viaComp };
          const deep = dfs(t2, rest, r2, lets);
          if (deep.status === 'solved') return deep;
          if (deep.status === 'blocked' && !blockedFallback) blockedFallback = deep;
        }
        // (b) a GROUND premise recurses (under-binder facts + deeper rules). Never
        // the IH's decreasing premise — a derived term is not structurally smaller.
        // A GROWING rule's premises resolve from facts only (case a): recursing on
        // a premise that wraps schematics in fresh rigid structure is the one
        // non-terminating backward dimension (the p X ← q (s X) counter-machine).
        // Grown derivations come from destructured hypotheses, never from search.
        if (!(rule.isIH && pick.i === rule.decIdx)
            && rule.descent !== 'growing' // GENERAL: descent-class tag (classifyRuleDescent), not a Beluga name
            && !unboundIn(inst, rule.flex, theta).size) {
          const premIsCtype = !!(rule.premiseCtype && rule.premiseCtype[pick.i]);
          const sub = solve(inst, depth - 1, path, !!rule.isCtor && !premIsCtype);
          if (sub.cyc) cycTaint = true;
          if (sub.status === 'blocked' && !blockedFallback) blockedFallback = sub;
          if (sub.status === 'solved' && !(rule.isCtor && sub.viaComp && !premIsCtype)) {
            choiceBudget -= 1;
            if (choiceBudget <= 0) return choiceSpent();
            const r2 = resolved.slice();
            r2[pick.i] = { text: sub.argText, viaComp: !!sub.viaComp };
            const deep = dfs(theta, rest, r2, [...lets, ...sub.lets]);
            if (deep.status === 'solved') return deep;
            if (deep.status === 'blocked' && !blockedFallback) blockedFallback = deep;
          }
        }
      }
      if (blockedFallback) return blockedFallback;
      // Exhausted with nothing solved and no deeper block: THIS is the demand site.
      // Report the most-ground pending premise as the blocked obligation.
      const pick0 = ranked[0];
      const inst0 = applyTheta(pick0.text, rule.flex, theta);
      return {
        status: 'blocked',
        obligations: [{
          premiseText: inst0,
          ruleName: rule.name,
          flexRemaining: [...unboundIn(inst0, rule.flex, theta)],
          partialTheta: theta,
          resolvedSoFar: resolved,
          depth,
          // IH decreasing premises need a decOk resolver — the demand probe must
          // model that, or existing non-decOk facts falsely look productive.
          needsDecOk: !!(rule.isIH && pick0.i === rule.decIdx),
        }],
      };
    };
    const hit = dfs(theta0, rule.premises.map((p, i) => ({ i, text: p })),
      new Array(rule.premises.length).fill(null), []);
    if (hit.status === 'blocked') {
      if (cycTaint) hit.cyc = true;
      return hit;
    }
    if (hit.status !== 'solved') return { status: 'dead', cyc: cycTaint || undefined };
    const theta = hit.theta;
    const resolved = hit.resolved;
    const lets = hit.lets;
    // Pi arguments: the context, substitution variables (passed through bare —
    // `$[Γ ⊢ $W]`), and object binders the result-match determined. Object args
    // are MARKED (OBJ_MARK) so assembly can also emit an inferred `[ |- _]`
    // spelling: the determined term may mention metas the checker INVENTED for
    // unnamed implicit pattern arguments — present in the hole report, bound
    // nowhere in source, so the named spelling is unwritable by construction
    // ("free meta-variable is illegal"). The checker arbitrates between the two.
    const args = [];
    for (const pi of rule.pis) {
      if (pi.kind === 'ctx') {
        // Under a CTYPE goal there is no goal context to pass — the corpus's
        // own idiom is the inferred `[_]` (norm/red_var/cr1-style), never the
        // empty `[]` (which asserts the EMPTY context and over-commits).
        args.push(opts.ctypeGoal && !goal.ctx ? '[_]' : `[${goal.ctx}]`);
        continue;
      }
      if (pi.kind === 'subst') { args.push(`$[${goal.ctx} |- ${pi.varName}]`); continue; }
      const v = theta.get(pi.varName);
      if (v == null) return { status: 'dead' };
      args.push(OBJ_MARK + box(stripParens(v)) + OBJ_MARK);
    }
    // A resolved slot embeds BARE when its FACT came from a comp variable
    // (viaComp) OR when the PREMISE ITSELF is ctype-typed (M3: a ctype value
    // — e.g. a nested lemma's result — is a comp-level expression, never an
    // LF term needing `[Γ ⊢ …]`, regardless of how it was resolved).
    resolved.forEach((r, i) => {
      const bare = r.viaComp || (rule.premiseCtype && rule.premiseCtype[i]);
      args.push(bare ? r.text : box(r.text));
    });
    if (rule.isCtor) {
      const spell = (r) => (toks(r.text).length > 1 ? `(${r.text})` : r.text);
      let inner;
      if (rule.argPlan && rule.argPlan.some((e) => e.pi != null)) {
        // Interleave spelled Pi-context args with resolved premises in the
        // ctor's declared argument order (`M_id [x : target _]`-shape).
        const parts = [rule.name];
        for (const e of rule.argPlan) {
          if (e.pi != null) {
            // freshenRule renamed the flex set with the ¿ prefix. The θ-value
            // is the UNBRACKETED context text (matchT ctx-token convention).
            const v = theta.get(`¿${e.pi}`) ?? theta.get(e.pi);
            if (v == null) return { status: 'dead' };
            parts.push(underscoreCtxArg(`[${v}]`));
          } else {
            parts.push(spell(resolved[e.prem]));
          }
        }
        inner = parts.join(' ');
      } else {
        inner = `${rule.name}${resolved.length ? ' ' + resolved.map(spell).join(' ') : ''}`;
      }
      return { status: 'solved', argText: inner, lets };
    }
    const r = fresh();
    // M4 (2026-07-19, S1): the LET BINDING for a rule's OWN result must match
    // its result's kind too — a ctype-result rule's call (`aeq_wk ae tr1
    // tr2 : Aeq' […]…`) binds BARE (`let S1 = … in`), never
    // `let [h ⊢ S1] = … in` (an LF-box pattern around a comp-level value).
    lets.push(rule.ctypeResult
      ? `let ${r} = ${rule.name} ${args.join(' ')} in`
      : `let ${box(r)} = ${rule.name} ${args.join(' ')} in`);
    return {
      status: 'solved', argText: r, lets, viaComp: !!rule.ctypeResult,
      callText: `${rule.name} ${args.join(' ')}`,
    };
  }

  // premise tuples for saturation: resolve every premise by an original base fact.
  function premiseTuples(rule, pool) {
    const base = pool.filter((f) => !f.extras.length && f.original && !f.invented);
    let states = [{ theta: new Map(), refs: [] }];
    for (const prem of rule.premises) {
      const next = [];
      for (const st of states) {
        const inst = applyTheta(prem, rule.flex, st.theta);
        for (const f of base) {
          const t2 = new Map(st.theta);
          if (matchT(inst, f.concl, rule.flex, t2)) next.push({ theta: t2, refs: [...st.refs, f] });
        }
      }
      if (next.length > MAX_PRODUCTS * 4 && opts.stats) opts.stats.boundHit = true;
      states = next.slice(0, MAX_PRODUCTS * 4);
      if (!states.length) return [];
    }
    // distinct facts per tuple
    return states.filter((st) => new Set(st.refs.map((r) => r.name)).size === st.refs.length);
  }

  // Does exactly ONE constructor of the result's family unify with it? The ctor's
  // schematics are freshened into the reserved namespace first (same capture
  // hazard as rules), and the returned argTypes carry the renaming so
  // componentOf instantiates consistently. Unification is SYMMETRIC over the
  // result's own METAVARIABLES (opts.metaVars): a pattern match REFINES them —
  // `eq (lam (\x.M')) M'1` inverts by eq_lam with M'1 := lam ¿N — exactly what
  // the checker does when the destructuring pattern lands. The refinement θ of
  // the result-side metas is returned so refutation closing can propagate it.
  function uniqueInversion(resultConcl, ctorsMap) {
    const head = toks(resultConcl)[0];
    const list = ctorsMap.get(head) || [];
    // An unresolved ¿-existential in the subject's type is neither flex nor a
    // hole metavariable, so unifyT treats it RIGID — which FALSELY excludes
    // constructors whose pattern constrains that position (measured on
    // unique_eval 2026-07-18: `eval E1 ¿V2` claimed ev_app-unique because
    // ev_lam's nonflex `lam ¿E` vs rigid ¿V2 failed; the "inversion" then
    // silently refined the branch-universal E1). Uniqueness among ≥2 ctors is
    // undecidable by FO matching with an unknown index — refuse (an inversion
    // is deterministic information, never speculation). A single-ctor family
    // stays invertible: unique under every instantiation.
    if (list.length > 1 && String(resultConcl).includes('¿')) return null;
    let hit = null;
    for (const c of list) {
      const rawFlex = ctorFlex(c);
      const map = new Map();
      for (const v of rawFlex) map.set(v, `¿${v}`);
      const flex = new Set([...rawFlex].map((v) => `¿${v}`));
      const ren = (t) => applyTheta(t, rawFlex, map);
      const theta = new Map();
      const metaTheta = new Map();
      const pat = ren(`${c.result.head} ${c.result.indices.join(' ')}`.trim());
      if (unifyT(pat, resultConcl, flex, metaVars, theta, metaTheta)) {
        if (hit) return null; // ambiguous — NOT invertible
        hit = { ctor: { ...c, argTypes: c.argTypes.map(ren) }, flex, theta, metaTheta };
      }
    }
    return hit;
  }

  // ---- ROOT: ITERATIVE DEEPENING (G.2c) ----
  // Depth is an ITERATION FRONTIER, not a bound. Level d is a complete depth-d
  // search — shallowest proofs found first (the behavior the corpus validated
  // pre-G.2b; naive depth-free DFS burned the node budget on deep failing
  // branches and LOST shallow solutions — measured 2026-07-17, COMPLETE→
  // search-bound flips). A level that completes with ZERO depth cuts has
  // explored the entire finite space — deeper levels are identical — so the
  // loop halts with a true exhaustion certificate and needs no ceiling.
  // Node/choice budgets are per-level runtime tripwires; only the FINAL
  // level's trips taint the certificate (earlier levels are subsumed).
  // failMemo persists across levels: keys are (remaining-depth § goal) and
  // "unprovable within r levels" is start-level-independent — a sound
  // transposition table that pays for the classic IDDFS re-exploration.
  const levelCap = opts.maxDepth || 0; // caller cap = probe mode (plan fillers)
  let root = { status: 'dead' };
  let solvedDepth = 0;
  for (let d = 1; ; d += 1) {
    levelFlags = { depthHit: false, nodesHit: false, choiceHit: false };
    nodes = 0;
    root = solve(norm(goal.concl), d);
    if (root.status === 'solved') { solvedDepth = d; break; }
    if (!levelFlags.depthHit && !levelFlags.nodesHit && !levelFlags.choiceHit) {
      break; // clean level ⇒ the finite space is truly exhausted
    }
    if (levelFlags.nodesHit || levelFlags.choiceHit) {
      // A runtime tripwire — deeper levels only re-explore a superset; honest bound.
      if (opts.stats) opts.stats.boundHit = true;
      break;
    }
    if (levelCap && d >= levelCap) {
      // Caller-imposed probe ceiling while depth was still the cut — a bound.
      if (opts.stats) opts.stats.boundHit = true;
      break;
    }
  }
  if (root.status !== 'solved') {
    // Phase D: surface the blocked obligation(s) via a SIDE CHANNEL only — the
    // public return is byte-identical to before (null / refutation), so acceptance
    // is unchanged. The demand oracle reads obligations via opts.onDemand; a human
    // reads them via __demandDebug. A non-'solved' root is still a synth miss.
    const obligations = root.status === 'blocked' ? root.obligations : [];
    if (obligations.length) {
      if (opts.onDemand) opts.onDemand(obligations);
      if (typeof globalThis !== 'undefined' && globalThis.__demandDebug) {
        globalThis.__demandDebug({ goal: norm(goal.concl), obligations });
      }
    }
    // No inhabiting chain — a REFUTATION (destructure + impossible) also closes.
    // EXHAUSTION CERTIFICATE SEED (Phase G): a null with NO bound hit means the
    // finite search space was genuinely exhausted — the termination architecture
    // (descent classes + demand-only splits + cyc-safe memo) makes that a real
    // "no plan in the synth fragment", not a resource verdict. boundHit taints it.
    if (!refutations.length && opts.stats && !opts.stats.boundHit) {
      opts.stats.exhausted = true;
    }
    return refutations.length
      ? { text: stripObjMarks(refutations[0]), alts: refutations.slice(1).map(stripObjMarks) }
      : null;
  }
  // Tail form: when the root is a rule call, emit it as the tail expression;
  // when it is a bare/instantiated fact, emit the boxed fill.
  const assembleRootText = (r) => {
    let lets = r.lets;
    let tail;
    if (r.callText && lets.length && lets[lets.length - 1].includes(r.callText)) {
      lets = lets.slice(0, -1);
      tail = r.callText;
    } else if (r.viaComp) {
      tail = r.argText; // a comp variable IS the proof term — never boxed
    } else if (opts.ctypeGoal) {
      // A CTYPE goal's inhabitant is a bare comp expression (a lemma call or an
      // inductive-family ctor application) — boxing it is ill-formed (S1/M1).
      tail = r.argText;
    } else {
      tail = box(r.argText);
    }
    // Include only the saturation lets whose components are actually used.
    const usedText = [...lets, tail].join('\n');
    const satNeeded = saturationLets.filter((s) => s.provides.some((n) =>
      new RegExp(`(^|[^A-Za-z0-9_'])${n}([^A-Za-z0-9_']|$)`).test(usedText)));
    const raw = [...satNeeded.map((s) => s.text), ...lets, tail].join('\n');
    return { text: stripObjMarks(raw), textU: underscoreObjMarks(raw) };
  };
  const primary = assembleRootText(root);
  // ROOT ALTERNATIVE (2026-07-21): re-solve at the same level with the root's
  // rules loop suppressed — the ctor/fact chain the primary may have shadowed.
  // Rules stay available INSIDE premise recursion (compositions survive).
  // Rides the existing alts channel; the checker arbitrates the list.
  const altTexts = [];
  if (solvedDepth) {
    // The alternative may need to be DEEPER than the primary: a direct IH call
    // solves at depth 1, while the ctor-composed form (`Crel_xa (exCRel X2)`)
    // needs its premise recursion one level down. Two extra levels, bounded.
    for (let ad = solvedDepth; ad <= solvedDepth + 2; ad += 1) {
      const altRoot = solve(norm(goal.concl), ad, [], false, true);
      if (altRoot.status === 'solved') {
        const alt = assembleRootText(altRoot);
        if (alt.text !== primary.text) altTexts.push(alt.text);
        break;
      }
    }
  }
  return {
    text: primary.text,
    textU: primary.textU !== primary.text ? primary.textU : undefined,
    alts: [...altTexts, ...refutations.map(stripObjMarks)],
  };
}

// The schematic (implicitly quantified) variables of a constructor: uppercase
// identifiers in its declared type.
function ctorFlex(c) {
  const names = new Set();
  const scan = (t) => {
    for (const m of String(t).match(/\p{Lu}[\p{L}\p{N}_']*/gu) || []) names.add(m);
  };
  c.argTypes.forEach(scan);
  c.result.indices.forEach(scan);
  return names;
}

// Spell a θ-bound context argument writably: each binding keeps its TYPE HEAD
// and underscores the type's arguments — `[x : target (cross Y S)]` →
// `[x : target _]`. The θ-exact spelling mentions the theorem's implicit metas
// (S, Y), which are unbound in generated source ("free meta-variable is
// illegal", the D11 writability class); the head+underscore form is the corpus
// idiom and checker-verified 2026-07-21 (`M_id [x : target _]` accepted in
// pattern AND fill position; a bare `[x : _]` is ILLEGAL — "Holes may not
// appear as contextual LF types", so the head must be kept).
function underscoreCtxArg(ctxTok) {
  const s = String(ctxTok == null ? '' : ctxTok).trim();
  if (!(s[0] === '[' && s[s.length - 1] === ']')) return s;
  const inner = s.slice(1, -1);
  // Split on TOP-LEVEL commas only.
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of inner) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  const out = parts.map((p) => {
    const ci = (() => {
      let d = 0;
      for (let i = 0; i < p.length; i += 1) {
        if (p[i] === '(' || p[i] === '[') d += 1;
        else if (p[i] === ')' || p[i] === ']') d -= 1;
        else if (p[i] === ':' && d === 0) return i;
      }
      return -1;
    })();
    if (ci < 0) return p.trim(); // bare ctx var / `_` — unchanged
    const name = p.slice(0, ci).trim();
    const ty = p.slice(ci + 1).trim();
    const headM = /^[\p{L}_][\p{L}\p{N}_']*/u.exec(ty);
    if (!headM || headM[0].length === ty.length) return `${name} : ${ty}`; // atomic type — keep
    return `${name} : ${headM[0]} _`;
  });
  return `[${out.join(', ')}]`;
}

// A constructor as a backward-chaining rule. For LF ctors this is the original
// conversion (HO/Pi args skip the ctor — split's job). For CTYPE ctors
// (c.isCType, 2026-07-21 ctype-split slice) two extra mechanisms make the
// M_id/M_dot shapes derivable:
//   • a whole-token context index (`[h]`, `[g]` — lowercase, implicitly
//     quantified CONTEXT variables, invisible to the uppercase ctorFlex scan)
//     becomes a flex placeholder, so `Map [h] []` can match the goal
//     `Map [x : target (cross Y S)] []` and bind h to the goal's context;
//   • a SCHEMA-typed Pi arg (`{h:tctx}` — a bare-ident-typed binder; boxed-Pi
//     LF binders stay out of fragment) is not a provable premise but a SPELLED
//     argument slot: the assembly emits θ(h) verbatim (`M_id [x : target _]`
//     is the corpus idiom; the checker arbitrates the spelling).
// `argPlan` records the ctor's argument order (pi-slot vs premise-slot) so the
// isCtor assembly can interleave them exactly as declared.
function ctypeCtorAsRule(c) {
  const flex = ctorFlex(c);
  const argPlan = [];
  const premises = [];
  const ctxFlex = new Map(); // context-var name → flex placeholder token
  const ctxTokenOf = (name) => {
    if (!ctxFlex.has(name)) {
      const fx = `CTXV_${name}`;
      ctxFlex.set(name, fx);
      flex.add(fx);
    }
    return ctxFlex.get(name);
  };
  // Context-variable indices → flex placeholders, ctype only. CONVENTION:
  // a CTXV_* θ-value is the UNBRACKETED context text (`_`, `g1`,
  // `x : target _`); every occurrence keeps its own brackets — `[CTXV_h]`
  // whole-token, `[CTXV_g, x:term]` composite head. matchT's ctx-token rules
  // bind both forms consistently.
  const flexCtx = (t) => String(t)
    .replace(/\[\s*([a-z_][\p{L}\p{N}_']*)\s*\]/gu, (m, n) => `[${ctxTokenOf(n)}]`)
    .replace(/\[\s*([a-z_][\p{L}\p{N}_']*)\s*,/gu, (m, n) => `[${ctxTokenOf(n)},`);
  for (const a of c.argTypes) {
    const t = String(a).trim();
    if (c.isCType) {
      const pm = /^\{\s*([\p{L}_][\p{L}\p{N}_']*)\s*:\s*[\p{L}_][\p{L}\p{N}_']*\s*\}$/u.exec(t);
      if (pm) { argPlan.push({ pi: ctxTokenOf(pm[1]) }); continue; }
    }
    if (/[{]|->|→/.test(t)) return null; // HO/Pi ctor arg — split's job
    premises.push(c.isCType ? flexCtx(normalizeCtypeSpelling(norm(t))) : normalizeCtypeSpelling(norm(t)));
    argPlan.push({ prem: premises.length - 1 });
  }
  let result = normalizeCtypeSpelling(`${c.result.head} ${c.result.indices.map((ix) => normalizeCtypeSpelling(ix)).join(' ')}`.trim());
  if (c.isCType) result = flexCtx(result);
  return {
    name: c.name,
    isIH: false,
    decIdx: -1,
    flex,
    pis: [],
    premises,
    result,
    isCtor: true,
    argPlan,
    // A CTYPE ctor's arguments are COMP expressions — comp facts (viaComp) DO
    // resolve them (`Crel_xa X1`), unlike LF ctor args. The dfs viaComp gates
    // key off this array (all-false for LF ctors: behavior unchanged).
    premiseCtype: premises.map(() => !!c.isCType),
  };
}

// Phase D demand probe: EVERY constructor arm's subject-side meta refinement
// plus `componentOfArg` facts (FO base + Pi-HO under-binder). Empty ⇒ fail-open.
// Phase F.8/F.9: bare-arrow HO skips the arm (`partialHo`); Pi-prefixed HO is
// refined into under-binder components so FO+Pi siblings can both fill.
export function armRefinements(subjectConcl, ctorsMap, metaVars, familyKinds) {
  const head = toks(subjectConcl)[0];
  const list = (ctorsMap && ctorsMap.get(head)) || [];
  if (list.length < 2) return [];
  const kinds = (familyKinds && familyKinds.get(head)) || null;
  const arms = [];
  let partialHo = false;
  const mv = metaVars || new Set();
  for (const c of list) {
    const rawFlex = ctorFlex(c);
    const map = new Map();
    for (const v of rawFlex) map.set(v, `¿${v}`);
    const flex = new Set([...rawFlex].map((v) => `¿${v}`));
    const ren = (t) => applyTheta(t, rawFlex, map);
    const theta = new Map();
    const metaTheta = new Map();
    const pat = ren(`${c.result.head} ${c.result.indices.join(' ')}`.trim());
    if (!unifyT(pat, subjectConcl, flex, mv, theta, metaTheta)) continue;
    const components = [];
    let ci = 0;
    let ok = true;
    for (const at of c.argTypes.map(ren)) {
      const co = componentOfArg(at, flex, theta, () => `¿arm${ci}`);
      if (!co) {
        // Bare-arrow HO / unanalysable — skip this arm, keep FO/Pi siblings.
        ok = false;
        break;
      }
      components.push({
        ...co.fact,
        name: `¿arm${ci}`,
        original: false,
        decOk: true,
      });
      ci += 1;
    }
    if (!ok) {
      partialHo = true;
      continue;
    }
    arms.push({
      ctorName: c.name,
      metaTheta,
      flex,
      theta,
      components,
      argTypesRen: c.argTypes.map(ren),
      resultIndices: c.result.indices.map(String),
      indexSorts: kinds,
    });
  }
  if (partialHo) arms.partialHo = true;
  return arms;
}

function identSet(text) {
  return new Set(String(text || '').match(/[\p{L}_"¿][\p{L}\p{N}_']*/gu) || []);
}

function sharesMetaWithObligation(subjectConcl, obligation, metaVars) {
  const sub = identSet(subjectConcl);
  const prem = identSet(obligation.premiseText);
  for (const m of (obligation.flexRemaining || [])) {
    if (sub.has(m)) return true;
  }
  for (const m of (metaVars || [])) {
    if (sub.has(m) && prem.has(m)) return true;
  }
  // Shared uppercase token between subject type and blocked premise.
  for (const t of prem) {
    if (/^\p{Lu}/u.test(t) && sub.has(t)) return true;
  }
  // A FULLY-SCHEMATIC premise (the rule's conclusion bound nothing — the IH of
  // a refutation theorem concluding `empty` leaves `step ¿M ¿N`) shares no
  // textual meta with anything, yet splitting a subject of the SAME FAMILY is
  // exactly what produces its decOk sub-derivations. Family-head relatedness —
  // still a tight filter; the productivity loop decides from here
  // (neutral_doesnt_step, caught by the 2026-07-17 sweep).
  if ((obligation.flexRemaining || []).some((m) => String(m)[0] === '¿')) {
    const ph = toks(norm(obligation.premiseText))[0];
    const sh = toks(norm(subjectConcl))[0];
    if (ph && sh && ph === sh) return true;
  }
  return false;
}

// "Does SOME instantiation of the arm's components resolve the premise?" —
// existential on BOTH sides, so the test is SYMMETRIC unification: the premise
// carries the obligation's ¿-schematics + the hole's (implicit) metas, and a
// component's conclusion carries the ctor's own unbound ¿-schematics (`step
// ¿M ¿M'` — the checker's real split binds them fresh). One-directional matchT
// treated the component side as ground, so schematic components never resolved
// anything and step-splits were vacuous-dropped (neutral_doesnt_step, caught
// by the 2026-07-17 sweep). Over-approximation is safe: this is a ranking
// probe; the checker arbitrates every emitted split.
function premiseResolvableAfter(premiseText, metaTheta, facts, metaVars, armComponents, needsDecOk) {
  let inst = norm(premiseText);
  if (metaTheta && metaTheta.size) {
    inst = applyTheta(inst, new Set(metaTheta.keys()), metaTheta);
  }
  const pool = [...(facts || []), ...(armComponents || [])];
  const flexA = new Set();
  for (const t of identSet(inst)) {
    if (t[0] === '¿' || (metaVars && metaVars.has(t))) flexA.add(t);
  }
  for (const f of pool) {
    if (needsDecOk && !f.decOk) continue;
    if (norm(f.concl) === inst) return true;
    const flexB = new Set();
    for (const t of identSet(f.concl)) {
      if (t[0] === '¿') flexB.add(t);
    }
    // UNDER-BINDER components are resolvers too: red_ind-style Pi arms
    // ({w:names} ex_red_rew (P' w) (Q' w)) carry the decOk sub-derivation the
    // IH premise needs — skipping extras made the probe judge the WHOLE split
    // vacuous, and P12's skipCertify then silenced the proof's first move
    // (red_rew_impl_fstepcong, user-reported 2026-07-18). Binder names join
    // the fact-side flex — a ranking probe; the checker still arbitrates.
    for (const e of (f.extras || [])) {
      if (e && e.name) flexB.add(e.name);
    }
    if (!flexA.size && !flexB.size) continue;
    if (unifyT(inst, f.concl, flexA, flexB, new Map(), new Map())) return true;
  }
  return false;
}

/**
 * FO impossibility certificate for a refined obligation premise: declared family
 * with ≥1 FO ctor, none of which unify after metaTheta. Unknown / HO → false
 * (fail-open — not a certified empty).
 */
function premiseRigidlyEmptyAfter(premiseText, metaTheta, ctorsMap, metaVars) {
  let inst = norm(premiseText);
  if (metaTheta && metaTheta.size) {
    inst = applyTheta(inst, new Set(metaTheta.keys()), metaTheta);
  }
  for (const t of identSet(inst)) {
    if (t[0] === '¿') continue;
    if (/^\p{Lu}/u.test(t) && !(metaVars && metaVars.has(t))) return false;
    if (metaVars && metaVars.has(t) && !(metaTheta && metaTheta.has(t))) return false;
  }
  const head = toks(inst)[0];
  if (!head || !ctorsMap) return false;
  const list = ctorsMap.get(head) || [];
  if (!list.length) return false;
  const mv = metaVars || new Set();
  for (const c of list) {
    if (c.argTypes.some((a) => /[{]|->|→/.test(String(a)))) return false;
    const rawFlex = ctorFlex(c);
    const map = new Map();
    for (const v of rawFlex) map.set(v, `¿${v}`);
    const flex = new Set([...rawFlex].map((v) => `¿${v}`));
    const ren = (t) => applyTheta(t, rawFlex, map);
    const theta = new Map();
    const metaTheta2 = new Map();
    const pat = ren(`${c.result.head} ${c.result.indices.join(' ')}`.trim());
    if (unifyT(pat, inst, flex, mv, theta, metaTheta2)) return false;
  }
  return true;
}

// ⊥-ELIMINATION probe (2026-07-18): does this arm's refinement make some
// in-scope FACT rigidly empty? Such an arm DISCHARGES its branch by
// `impossible` — progress independent of any blocked obligation (the empty
// left rule is invertible in a focused calculus, so the contradiction is
// self-justifying). May-inhabitation semantics: every unrefined meta and
// ¿-remnant on the fact side stays FLEXIBLE, so unification failure across
// ALL declared FO ctors is a sound emptiness signal for RANKING (the checker
// still arbitrates the actual `impossible` arms); any HO ctor ⇒ not refuted
// (fail-open). Without this, the verdict scored refutation splits by
// obligation-premise productivity alone and vacuous-dropped the proof's only
// move (values_dont_step / natval_dont_step, P12 fallout measured 2026-07-18).
function armRefutesAFact(metaTheta, facts, ctorsMap, metaVars) {
  if (!metaTheta || !metaTheta.size) return false; // no refinement — nothing newly empty
  const refKeys = new Set(metaTheta.keys());
  for (const f of (facts || [])) {
    if (!f || (f.extras && f.extras.length)) continue;
    const concl = norm(f.concl);
    const ids = identSet(concl);
    if (![...refKeys].some((k) => ids.has(k))) continue; // untouched fact — same as before the split
    const inst = applyTheta(concl, refKeys, metaTheta);
    const head = toks(inst)[0];
    const list = (ctorsMap && ctorsMap.get(head)) || [];
    if (!list.length) continue; // unknown family — fail-open
    let inhabited = false;
    let ho = false;
    for (const c of list) {
      if (c.argTypes.some((a) => /[{]|->|→/.test(String(a)))) { ho = true; break; }
      const rawFlex = ctorFlex(c);
      const map = new Map();
      for (const v of rawFlex) map.set(v, `¿${v}`);
      const pat = applyTheta(`${c.result.head} ${c.result.indices.join(' ')}`.trim(), rawFlex, map);
      const flex = new Set([...rawFlex].map((v) => `¿${v}`));
      const mv2 = new Set(metaVars || []);
      for (const t of identSet(inst)) {
        if (t[0] === '¿' || /^\p{Lu}/u.test(t)) mv2.add(t);
      }
      if (unifyT(pat, inst, flex, mv2, new Map(), new Map())) { inhabited = true; break; }
    }
    if (!ho && !inhabited) return true;
  }
  return false;
}

// INVERSION-UNLOCK probe (2026-07-19) — the deterministic sibling of the
// ⊥-elimination probe: does this arm's refinement make some in-scope FACT
// NEWLY uniquely-invertible? Unlocked unique inversion is deterministic
// information (the inversion phase), exactly what a split "demands" in the
// prd_det shape: `e : prd N R2` is 2-ctor ambiguous, arm `prd_z` refines
// N:=z and `prd z R2` inverts uniquely, whose inversion refines R2 and
// closes the goal. May-semantics; the checker arbitrates the actual let.
function armUnlocksInversion(metaTheta, facts, ctorsMap, metaVars, subjectConcl) {
  if (!metaTheta || !metaTheta.size) return false;
  const refKeys = new Set(metaTheta.keys());
  const subjNorm = norm(subjectConcl || '');
  for (const f of (facts || [])) {
    if (!f || (f.extras && f.extras.length)) continue;
    const concl = norm(f.concl);
    // The SUBJECT trivially becomes "invertible" under its own arm refinement
    // — that is the split itself, not unlocked information. Skip it (and any
    // same-typed twin — a conservative miss, never a false demand).
    if (concl === subjNorm) continue;
    const ids = identSet(concl);
    if (![...refKeys].some((k) => ids.has(k))) continue;
    // Per-fact meta widening (the P6a discipline): the fact's own implicit
    // uppercase metas must be flexible or no ctor unifies at all and the
    // "newly unique" test never fires (ev_add_ev's `add N M R`, whose M/R
    // live nowhere in the hole's Δ).
    const mvBefore = widenMetaVarsForSubject(metaVars, concl);
    if (uniqueFoInversion(concl, ctorsMap, mvBefore)) continue; // already deterministic
    const inst = applyTheta(concl, refKeys, metaTheta);
    if (uniqueFoInversion(inst, ctorsMap, widenMetaVarsForSubject(metaVars, inst),
      { probeRemnants: true })) return true;
  }
  return false;
}

// The demand probe's flex view must cover the subject's IMPLICIT metas: a hole
// whose Meta-context is empty still has free uppercase index metas (M, N in
// `mstep M N`) that Beluga REFINES when a split pattern lands (m_ref forces
// N:=M). Treating them rigid collapses arm coverage and productivity, and a
// split that is the proof's first move gets vacuous-dropped (tapl `sound`,
// caught by the 2026-07-17 sweep). Probe-only widening — solving is untouched.
function widenMetaVarsForSubject(metaVars, subjectConcl) {
  const out = new Set(metaVars || []);
  for (const t of identSet(subjectConcl)) {
    if (/^\p{Lu}/u.test(t)) out.add(t);
  }
  return out;
}

// Demand verdict for one split subject against collected blocked obligations.
// Returns 'demanded' | 'vacuous' | 'open' (fail-open / inconclusive).
// Demanded = ≥1 arm productive AND every arm productive-or-impossible (D.2).
// Vacuous when unrelated, or related with zero productive arms.
export function demandSplitVerdict(subjectConcl, obligations, facts, ctorsMap, metaVars0) {
  if (!obligations || !obligations.length) return 'open';
  const metaVars = widenMetaVarsForSubject(metaVars0, subjectConcl);
  const arms0 = armRefinements(subjectConcl, ctorsMap, metaVars);
  // ⊥-elimination demand: a split EVERY arm of which refutes an in-scope fact
  // is the proof of its branch(es) outright — demanded independent of the
  // obligation set (the values_dont_step class). Requires complete coverage
  // (no partialHo) — an unrefuted HO arm is not settled.
  const refutes = (arms0.length && !arms0.partialHo)
    ? arms0.map((arm) => armRefutesAFact(arm.metaTheta, facts, ctorsMap, metaVars))
    : [];
  const unlocks = (arms0.length && !arms0.partialHo)
    ? arms0.map((arm) => armUnlocksInversion(arm.metaTheta, facts, ctorsMap, metaVars, subjectConcl))
    : [];
  // Every arm discharges (⊥) — demanded regardless of the obligation set:
  // decisive, every branch ends (values_dont_step).
  if (refutes.length && refutes.every(Boolean)) return 'demanded';
  // Every arm discharges or UNLOCKS deterministic information — rescued from
  // vacuous (it certifies and may be accepted at its normal split rank), but
  // NEVER promoted to demanded: unlock-promotion outranked a winning
  // lemma-path and lost times_det (measured 2026-07-19; prd_det/ev_add_ev
  // complete fine from the tail — at their holes nothing else certifies).
  if (refutes.length
    && arms0.every((a, i) => refutes[i] || unlocks[i])
    && (refutes.some(Boolean) || unlocks.some(Boolean))) return 'open';
  const related = obligations.filter((o) => sharesMetaWithObligation(subjectConcl, o, metaVars));
  if (!related.length) return 'vacuous';
  const arms = arms0;
  if (!arms.length) return 'open';
  // Phase F.8: FO-only refinements under a HO sibling are incomplete coverage —
  // never "demand" (would drop the HO arm from the productivity check).
  if (arms.partialHo) return 'open';
  let sawPartial = false;
  for (const o of related) {
    let productive = 0;
    let settled = 0;
    for (let i = 0; i < arms.length; i += 1) {
      const arm = arms[i];
      // PRODUCTIVITY FIRST — it is the stronger claim and opens the demanded
      // gate. A refuting arm (discharged by `impossible`) or an unlocking arm
      // (deterministic information) is SETTLED-only: such arms alone must not
      // flip former-vacuous junk splits to open/demanded (the P12 spiral,
      // measured on natval_dont_step). Testing settled-classes BEFORE
      // productivity shadowed arms that were BOTH — productive fell to zero
      // and the transitivity family's essential splits went vacuous
      // (trans/transtp/transG, caught by the differential 2026-07-19).
      if (premiseResolvableAfter(
        o.premiseText, arm.metaTheta, facts, metaVars, arm.components, !!o.needsDecOk,
      )) {
        productive += 1;
        settled += 1;
      } else if (refutes[i] || unlocks[i]) {
        settled += 1;
      } else if (premiseRigidlyEmptyAfter(o.premiseText, arm.metaTheta, ctorsMap, metaVars)) {
        settled += 1;
      }
    }
    if (productive >= 1 && settled === arms.length) return 'demanded';
    if (productive > 0) sawPartial = true;
  }
  return sawPartial ? 'open' : 'vacuous';
}

function refineText(text, metaTheta) {
  if (!metaTheta || !metaTheta.size) return text;
  return applyTheta(text, new Set(metaTheta.keys()), metaTheta);
}

function matchCtorArm(patternLine, arms) {
  for (const a of arms) {
    const esc = String(a.ctorName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^\\p{L}\\p{N}_'])${esc}([^\\p{L}\\p{N}_']|$)`, 'u').test(patternLine)) {
      return a;
    }
  }
  return null;
}

/**
 * Phase F.2/F.9 — arg names from a bridge case-arm pattern line.
 * FO idents as before; HO lambda spines `(\x. \u. D)` yield the body name `D`.
 * Null when arity/shape mismatch (do not invent ¿arm stand-ins from junk).
 */
function parseArmPatternArgs(patternLine, ctorName, arity) {
  const line = String(patternLine || '');
  const boxM = /\[\s*[^\]]*?(?:\s*\|-|\s*⊢)\s*([^\]]*)\]/.exec(line);
  let pat;
  if (boxM) {
    pat = boxM[1].trim();
  } else {
    const bare = /^\s*\|\s*(.+?)(?:\s*:|\s*=>|\s*⇒)/u.exec(line);
    if (!bare) return null;
    pat = bare[1].trim();
  }
  const parts = toks(pat);
  if (!parts.length || parts[0] !== ctorName) return null;
  const args = parts.slice(1);
  if (args.length !== arity) return null;
  const names = [];
  for (const a of args) {
    if (/^[\p{L}_][\p{L}\p{N}_']*$/u.test(a)) {
      names.push(a);
      continue;
    }
    // Phase F.9 — HO parenthesized lambda spine ending in a binder name.
    const stripped = stripParens(a);
    if (!/\\/.test(stripped)) return null;
    const body = /(?:\\[\p{L}_][\p{L}\p{N}_']*\.\s*)+([\p{L}_][\p{L}\p{N}_']*)\s*$/u.exec(stripped);
    if (!body) return null;
    names.push(body[1]);
  }
  return names;
}

/**
 * Phase F.3a — FO uppercase binders from an arm `: [Γ ⊢ …]` annotation.
 * Empty when absent / HO (lambda). Order = first-occurrence in the annotation.
 */
function parseArmAnnotationBinders(patternLine) {
  const m = /\]\s*:\s*\[[^\]]*?(?:\s*\|-|\s*⊢)\s*([^\]]*)\]/.exec(String(patternLine || ''));
  if (!m) return [];
  const ann = m[1].trim();
  if (/\\/.test(ann)) return [];
  const names = [];
  const seen = new Set();
  for (const hit of ann.matchAll(/\p{Lu}[\p{L}\p{N}_']*/gu)) {
    if (seen.has(hit[0])) continue;
    seen.add(hit[0]);
    names.push(hit[0]);
  }
  return names;
}

/**
 * Simple FO object sort from a ctor's argTypes (e.g. `tm`, `nat`) — used to type
 * annotation index binders when they don't line up 1:1 with components (F.4).
 */
function objectSortGuess(argTypesRen, flex, theta) {
  const fl = flex || new Set();
  for (const at of argTypesRen || []) {
    const t = applyTheta(stripParens(norm(at)), fl, theta || new Map());
    if (toks(t).length === 1 && t[0] !== '¿' && !fl.has(t)) return t;
  }
  return null;
}

function simpleFoSort(argType) {
  const t = stripParens(norm(argType));
  if (!t || toks(t).length !== 1 || t[0] === '¿') return null;
  if (/[{]|->|→|\\/.test(t)) return null;
  return t;
}

/** Unique ctor by name across families; ambiguous → null. */
function findCtorByName(ctorsMap, name) {
  if (!ctorsMap || !name) return null;
  let hit = null;
  for (const list of ctorsMap.values()) {
    for (const c of list || []) {
      if (!c || c.name !== name) continue;
      if (hit) return null;
      hit = c;
    }
  }
  return hit;
}

/** FO idents nested under compound result indices (not whole-index binders). */
function nestedNamesInIndices(indices) {
  const s = new Set();
  for (const idx of indices || []) {
    const parts = toks(stripParens(norm(idx)));
    if (parts.length <= 1) continue;
    for (let i = 1; i < parts.length; i += 1) {
      const a = toks(stripParens(parts[i]));
      if (a.length === 1 && /^[\p{L}_][\p{L}\p{N}_']*$/u.test(a[0])) s.add(a[0]);
    }
  }
  return s;
}

/**
 * Phase F.6 — type annotation binders that appear as FO args of a compound
 * result index, from that index head's ctor spine (`app : tm → tm → tm`
 * types `M`/`N` in `(app M N)`). Fail-closed on HO / arity / unknown head.
 */
function nestedIndexBinderFacts(annNames, indices, ctorsMap, claimed, pat) {
  const out = [];
  if (!indices || !indices.length || !ctorsMap) return out;
  const ann = new Set(annNames || []);
  for (const idx of indices) {
    const parts = toks(stripParens(norm(idx)));
    if (parts.length < 2) continue;
    const head = parts[0];
    if (!/^[\p{L}_][\p{L}\p{N}_']*$/u.test(head)) continue;
    const args = [];
    let fo = true;
    for (let i = 1; i < parts.length; i += 1) {
      const a = toks(stripParens(parts[i]));
      if (a.length !== 1 || !/^[\p{L}_][\p{L}\p{N}_']*$/u.test(a[0]) || /\\/.test(parts[i])) {
        fo = false;
        break;
      }
      args.push(a[0]);
    }
    if (!fo) continue;
    const ctor = findCtorByName(ctorsMap, head);
    if (!ctor || !ctor.argTypes || ctor.argTypes.length !== args.length) continue;
    if (ctor.argTypes.some((at) => /[{]|->|→|\\/.test(String(at)))) continue;
    for (let i = 0; i < args.length; i += 1) {
      const name = args[i];
      if (!ann.has(name) || pat.has(name) || claimed.has(name)) continue;
      const sort = simpleFoSort(ctor.argTypes[i]);
      if (!sort) continue;
      out.push({
        name,
        extras: [],
        concl: sort,
        original: false,
        decOk: true,
      });
      claimed.add(name);
    }
  }
  return out;
}

/**
 * Expose annotation FO binders as source-named facts.
 * F.3a: 1:1 with FO components → same types as those components.
 * F.5: bare result-index binders typed by the family kind telescope.
 * F.6: nested FO args of compound indices typed from the index-head ctor spine.
 * F.4: remaining unequal-count binders typed by a simple FO object sort from
 * the ctor's argTypes (fail-closed if none); never invent names absent from the
 * annotation. Soft-zip never assigns derivation types to nested index metas.
 */
function annotationComponentFacts(annNames, comps, patNames, opts = {}) {
  if (!annNames || !annNames.length) return [];
  const pat = new Set(patNames || []);
  const out = [];
  if (comps && comps.length && annNames.length === comps.length) {
    for (let i = 0; i < annNames.length; i += 1) {
      const n = annNames[i];
      if (pat.has(n)) continue;
      out.push({
        name: n,
        extras: [],
        concl: comps[i].concl,
        original: false,
        decOk: true,
      });
    }
    return out;
  }
  const claimed = new Set();
  const indices = opts.resultIndices || [];
  // Phase F.5 — bare whole-index binders ← family kind sorts.
  const indexSorts = opts.indexSorts || [];
  if (indices.length && indexSorts.length === indices.length) {
    const ann = new Set(annNames);
    for (let i = 0; i < indices.length; i += 1) {
      const sort = String(indexSorts[i] || '').trim();
      if (!sort || toks(sort).length !== 1) continue;
      const idxToks = toks(stripParens(norm(indices[i])));
      if (idxToks.length !== 1) continue;
      const name = idxToks[0];
      if (!ann.has(name) || pat.has(name) || claimed.has(name)) continue;
      out.push({
        name,
        extras: [],
        concl: sort,
        original: false,
        decOk: true,
      });
      claimed.add(name);
    }
  }
  // Phase F.6 — nested FO args under compound indices ← index-head ctor.
  for (const f of nestedIndexBinderFacts(annNames, indices, opts.ctorsMap, claimed, pat)) {
    out.push(f);
  }
  // Phase F.4 — leftover annotation binders via object-sort guess / soft zip.
  const leftover = annNames.filter((n) => !pat.has(n) && !claimed.has(n));
  if (!leftover.length) return out;
  const sort = objectSortGuess(opts.argTypesRen, opts.flex, opts.theta);
  if (!sort) {
    // Soft zip: never assign FO-component (often derivation) types to metas that
    // only appear nested inside compound indices — those need F.6 or fail-closed.
    const nested = nestedNamesInIndices(indices);
    const zipable = leftover.filter((n) => !nested.has(n));
    const n = Math.min(zipable.length, (comps || []).length);
    for (let i = 0; i < n; i += 1) {
      out.push({
        name: zipable[i],
        extras: [],
        concl: comps[i].concl,
        original: false,
        decOk: true,
      });
    }
    return out;
  }
  for (const name of leftover) {
    out.push({
      name,
      extras: [],
      concl: sort,
      original: false,
      decOk: true,
    });
  }
  return out;
}

// Phase D Stage 2: splice a bridge-emitted split with per-arm synthesis under each
// arm's metaTheta. Case text is NEVER rebuilt — only `?` bodies are replaced.
// Returns null when nothing improves on the bare split (fail-open to Stage 1).
export function fillSplitPlan({
  splitText, subjectConcl, goal, facts, rules, ctorsMap, metaVars, maxDepth, familyKinds,
}) {
  let text = String(splitText || '').trim();
  let wrapped = false;
  if (text.startsWith('(') && text.endsWith(')')) {
    text = text.slice(1, -1).trim();
    wrapped = true;
  }
  if (!/^case\b/.test(text)) return null;
  // Same implicit-meta widening as demandSplitVerdict: the arms the checker
  // will accept refine the subject's free uppercase metas even when cD is empty.
  const refinements = armRefinements(
    subjectConcl, ctorsMap, widenMetaVarsForSubject(metaVars, subjectConcl), familyKinds,
  );
  if (!refinements.length) return null;

  const lines = text.split('\n');
  const holeLines = [];
  let lastPat = '';
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*\|/.test(lines[i])) lastPat = lines[i];
    if (/^\s*\?\s*$/.test(lines[i])) holeLines.push({ idx: i, pattern: lastPat });
  }
  if (!holeLines.length) return null;

  let filledArms = 0;
  const depth = maxDepth == null ? 4 : maxDepth;
  for (const h of holeLines) {
    const arm = matchCtorArm(h.pattern, refinements);
    if (!arm) continue;
    const g = {
      ctx: goal && goal.ctx != null ? goal.ctx : '',
      concl: refineText(goal && goal.concl, arm.metaTheta),
    };
    const rawComps = arm.components || [];
    const patNames = parseArmPatternArgs(h.pattern, arm.ctorName, rawComps.length);
    const comps = rawComps.map((f, i) => ({
      ...f,
      name: (patNames && patNames[i]) || f.name,
      concl: refineText(f.concl, arm.metaTheta),
    }));
    const annNames = parseArmAnnotationBinders(h.pattern);
    const annFacts = annotationComponentFacts(annNames, comps, patNames, {
      argTypesRen: arm.argTypesRen,
      flex: arm.flex,
      theta: arm.theta,
      resultIndices: arm.resultIndices,
      indexSorts: arm.indexSorts,
      ctorsMap,
    });
    const refinedFacts = [
      ...(facts || []).map((f) => ({
        ...f,
        concl: refineText(f.concl, arm.metaTheta),
      })),
      ...annFacts,
      ...comps,
    ];
    const out = synthesize(g, refinedFacts, rules || [], ctorsMap, {
      maxDepth: depth,
      metaVars: metaVars || new Set(),
    });
    if (!out || !out.text || /\?/.test(out.text)) continue;
    // F.2: a closing body must not cite planner-private ¿armN once the pattern
    // supplied source names (writability by construction).
    if (patNames && /¿arm\d+/.test(out.text)) continue;
    const indent = (lines[h.idx].match(/^\s*/) || [''])[0];
    const body = out.text.split('\n').map((ln, j) => (j === 0 ? indent + ln : `${indent}${ln}`)).join('\n');
    lines[h.idx] = body;
    filledArms += 1;
  }
  if (!filledArms) return null;
  const joined = lines.join('\n');
  return {
    text: wrapped ? `(${joined})` : joined,
    filledArms,
    openArms: holeLines.length - filledArms,
  };
}

/** Exactly one FO ctor unifies with `resultConcl`; HO or ambiguous → null. */
function uniqueFoInversion(resultConcl, ctorsMap, metaVars, uOpts) {
  const head = toks(resultConcl)[0];
  const list = (ctorsMap && ctorsMap.get(head)) || [];
  // Same law as uniqueInversion: a ¿-remnant (an index the parent unification
  // left existential) makes multi-ctor uniqueness undecidable by FO matching —
  // the remnant is treated rigid and falsely excludes constructors, turning a
  // refining COMMITMENT into a claimed inversion (the unique_eval chain trap).
  // EXCEPT in probe mode (`probeRemnants` — the demand probes' may-semantics
  // RANKING, never emission): remnants join the flexible set instead, so an
  // arm-refined subject like `add (s ¿N) M R` can still be judged newly
  // unique (ev_add_ev, 2026-07-19). Over-unification there only keeps more
  // ctors alive → under-claims uniqueness → conservative for a probe.
  let mv0 = metaVars;
  if (String(resultConcl).includes('¿')) {
    if (!(uOpts && uOpts.probeRemnants)) {
      if (list.length > 1) return null;
    } else {
      mv0 = new Set(metaVars || []);
      for (const t of identSet(resultConcl)) if (t[0] === '¿') mv0.add(t);
    }
  }
  let hit = null;
  const mv = mv0 || new Set();
  for (const c of list) {
    const rawFlex = ctorFlex(c);
    const map = new Map();
    for (const v of rawFlex) map.set(v, `¿${v}`);
    const flex = new Set([...rawFlex].map((v) => `¿${v}`));
    const ren = (t) => applyTheta(t, rawFlex, map);
    const theta = new Map();
    const metaTheta = new Map();
    const pat = ren(`${c.result.head} ${c.result.indices.join(' ')}`.trim());
    if (!unifyT(pat, resultConcl, flex, mv, theta, metaTheta)) continue;
    if (c.argTypes.some((a) => /[{]|->|→/.test(String(a)))) return null;
    if (hit) return null;
    hit = { ctor: { ...c, argTypes: c.argTypes.map(ren) }, flex, theta, metaTheta };
  }
  return hit;
}

/**
 * Phase E.2 — compose intro binders + residual synthesis into one closing plan.
 * One candidate, one certify (vs intro step then a second fill/synth check).
 * Fail-closed: null when residual synth leaves a hole or binders don't line up.
 */
export function fillIntroPlan({
  introText, goalType, compType, facts, rules, ctorsMap, metaVars, maxDepth,
}) {
  const intro = String(introText || '').trim();
  if (!/\?\s*$/.test(intro) || !/\b(?:fn|mlam)\b/.test(intro)) return null;

  const fromGoal = parseCompType(goalType);
  const parsed = (fromGoal && fromGoal.premises && fromGoal.premises.length)
    ? fromGoal
    : ((compType && Array.isArray(compType.premises) && compType.conclusion != null)
      ? { premises: compType.premises, conclusion: String(compType.conclusion).trim() }
      : fromGoal);
  if (!parsed || !parsed.conclusion) return null;

  const binderNames = [];
  for (const m of intro.matchAll(/\b(fn|mlam)\s+([$\p{L}_][\p{L}\p{N}_']*)/gu)) {
    binderNames.push({ kind: m[1], name: m[2] });
  }
  if (!binderNames.length) return null;

  const binderFacts = [];
  let bi = 0;
  for (const p of parsed.premises) {
    if (!p || p.kind === 'ctx') continue; // GENERAL: premise-kind from classifyPremise
    if (bi >= binderNames.length) break;
    const b = binderNames[bi];
    if (p.kind === 'pi') { // GENERAL: premise-kind from classifyPremise
      if (b.kind !== 'mlam') return null;
      bi += 1;
      continue;
    }
    if (b.kind !== 'fn') return null;
    bi += 1;
    // decOk is FALSE here by construction: this fact is the theorem's own
    // premise, fresh off `fn`/`mlam` — the raw, undestructured derivation, not
    // a sub-derivation any split produced. Marking it decOk would let the IH's
    // decreasing slot match itself (`fn e => eq_sym e`, the eq_sym self-call
    // regression a real corpus sweep caught 2026-07-17) — Beluga's totality
    // checker correctly rejects the non-terminating call, and because a closing
    // intro plan strictly dominates the bare intro (introsRest empties when one
    // exists), that bad candidate became the ONLY intro move — no fallback to
    // the bare `fn d => ?` that would let a split reach the real proof.
    if (p.kind === 'ctype' || isCtypeApplication(p.raw)) { // GENERAL: premise-kind
      binderFacts.push({
        name: b.name,
        extras: [],
        concl: normalizeCtypeSpelling(p.raw),
        original: true,
        decOk: false,
        viaComp: true,
      });
      continue;
    }
    let raw = String(p.raw || '').trim();
    if (raw && !raw.startsWith('[')) raw = `[${raw}]`;
    const box = decomposeContextual(raw);
    if (!box) return null;
    binderFacts.push({
      name: b.name,
      extras: [],
      concl: String(box.concl || '').trim(),
      original: true,
      decOk: false,
      viaComp: true,
    });
  }

  const conclRaw = parsed.conclusion;
  let goal;
  if (isCtypeApplication(conclRaw)) {
    goal = { ctx: '', concl: normalizeCtypeSpelling(conclRaw) };
  } else {
    const box = decomposeContextual(conclRaw.startsWith('[') ? conclRaw : `[${conclRaw}]`);
    if (!box) return null;
    goal = { ctx: box.ctx || '', concl: String(box.concl || '').trim() };
  }

  const allFacts = [...(facts || []), ...binderFacts];
  if (!allFacts.length) return null;
  const out = synthesize(goal, allFacts, rules || [], ctorsMap || new Map(), {
    maxDepth: maxDepth == null ? 4 : maxDepth,
    metaVars: metaVars || new Set(),
  });
  if (!out || !out.text || /\?/.test(out.text)) return null;
  return {
    text: intro.replace(/\?\s*$/, out.text),
    closingPlan: true,
  };
}

/**
 * Phase E.4 — unique invert + residual synthesis as one closing plan.
 * Reuses bridge invert spelling; never rebuilds the let. Fail-closed on HO /
 * ambiguous / param invert / residual hole. Accepts optional F.1 `: [ann]`.
 */
export function fillInvertPlan({
  invertText, goal, facts, rules, ctorsMap, metaVars, maxDepth, familyKinds,
}) {
  const parsed = parseInvertLet(invertText);
  if (!parsed) return null;
  const fact = (facts || []).find((f) => f && f.name === parsed.hyp && !(f.extras && f.extras.length));
  if (!fact) return null;

  const inv = uniqueFoInversion(norm(fact.concl), ctorsMap, metaVars);
  if (!inv || inv.ctor.name !== parsed.ctorName) return null;
  if (inv.ctor.argTypes.length !== parsed.argNames.length) return null;

  const components = [];
  for (let i = 0; i < parsed.argNames.length; i += 1) {
    components.push({
      name: parsed.argNames[i],
      extras: [],
      concl: applyTheta(stripParens(norm(inv.ctor.argTypes[i])), inv.flex, inv.theta),
      original: false,
      decOk: !!fact.decOk,
    });
  }

  const mt = inv.metaTheta;
  const g = {
    ctx: goal && goal.ctx != null ? goal.ctx : '',
    concl: refineText(goal && goal.concl, mt),
  };
  const refinedFacts = (facts || []).map((f) => ({
    ...f,
    concl: refineText(f.concl, mt),
    inverted: f.name === parsed.hyp ? true : f.inverted,
  }));
  // Phase F.3b/F.4/F.5 — annotation FO binders (mirror fillSplitPlan).
  const famHead = toks(fact.concl)[0];
  const annNames = parseArmAnnotationBinders(parsed.text);
  const annFacts = annotationComponentFacts(annNames, components, parsed.argNames, {
    argTypesRen: inv.ctor.argTypes,
    flex: inv.flex,
    theta: inv.theta,
    resultIndices: (inv.ctor.result && inv.ctor.result.indices) || [],
    indexSorts: (familyKinds && famHead && familyKinds.get(famHead)) || null,
    ctorsMap,
  }).map((f) => ({
    ...f,
    concl: refineText(f.concl, mt),
    decOk: !!fact.decOk,
  }));
  const out = synthesize(g, [...refinedFacts, ...annFacts, ...components], rules || [], ctorsMap || new Map(), {
    maxDepth: maxDepth == null ? 4 : maxDepth,
    metaVars: metaVars || new Set(),
  });
  if (!out || !out.text || /\?/.test(out.text)) return null;
  return {
    text: `${parsed.text}\n${out.text}`,
    closingPlan: true,
    hyp: parsed.hyp,
  };
}

function parseInvertLet(letText) {
  const text = String(letText || '').replace(/\n?\s*\?\s*$/, '').trim();
  if (!/^let\b/.test(text) || !/\bin\s*$/.test(text) || /#/.test(text)) return null;
  const hm = /=\s*([\p{L}_][\p{L}\p{N}_']*)\s+in\s*$/u.exec(text);
  if (!hm) return null;
  // Optional `: [ann]` (Phase F.1) — pattern box is still the first `[…]`.
  const boxM = /^let\s+\[([^\]]*)\](?:\s*:\s*\[[^\]]*\])?\s*=/.exec(text);
  if (!boxM) return null;
  const inner = boxM[1];
  let turnIdx = inner.lastIndexOf('|-');
  let turnLen = 2;
  if (turnIdx < 0) {
    turnIdx = inner.lastIndexOf('⊢');
    turnLen = 1;
  }
  if (turnIdx < 0) return null;
  const ctx = inner.slice(0, turnIdx).trim();
  const pat = inner.slice(turnIdx + turnLen).trim();
  const parts = toks(pat);
  if (!parts.length) return null;
  const argNames = parts.slice(1);
  if (argNames.some((a) => !/^[\p{L}_][\p{L}\p{N}_']*$/u.test(a))) return null;
  return { text, hyp: hm[1], ctx, ctorName: parts[0], argNames };
}

function foBox(ctx, inner) {
  return ctx ? `[${ctx} |- ${inner}]` : `[ |- ${inner}]`;
}

/**
 * Phase E.5 — bounded unique-FO invert chain as one plan.
 * Depth ≥ 2 required (length-1 open stays the bare invert; E.4 owns length-1 close).
 * Residual synth may close the chain; otherwise emit `lets…\n?` still as one certify.
 */
export function fillInvertChainPlan({
  invertText, goal, facts, rules, ctorsMap, metaVars, maxDepth, maxRounds, familyKinds,
}) {
  const parsed = parseInvertLet(invertText);
  if (!parsed) return null;
  const fact0 = (facts || []).find((f) => f && f.name === parsed.hyp && !(f.extras && f.extras.length));
  if (!fact0) return null;

  const inv0 = uniqueFoInversion(norm(fact0.concl), ctorsMap, metaVars);
  if (!inv0 || inv0.ctor.name !== parsed.ctorName) return null;
  if (inv0.ctor.argTypes.length !== parsed.argNames.length) return null;

  const used = new Set();
  for (const f of (facts || [])) if (f && f.name) used.add(f.name);
  for (const n of parsed.argNames) used.add(n);
  const fresh = () => {
    for (let i = 1; i < 1000; i += 1) {
      const n = `C${i}`;
      if (!used.has(n)) { used.add(n); return n; }
    }
    return null;
  };

  const rounds = maxRounds == null ? 3 : maxRounds;
  const lets = [parsed.text];
  let mt = inv0.metaTheta;
  let gConcl = refineText(goal && goal.concl, mt);
  let pool = (facts || []).map((f) => ({
    ...f,
    concl: refineText(f.concl, mt),
    inverted: f.name === parsed.hyp,
  }));
  let frontier = [];
  for (let i = 0; i < parsed.argNames.length; i += 1) {
    frontier.push({
      name: parsed.argNames[i],
      extras: [],
      concl: applyTheta(stripParens(norm(inv0.ctor.argTypes[i])), inv0.flex, inv0.theta),
      original: false,
      decOk: !!fact0.decOk,
    });
  }
  // Phase F.3b/F.4/F.5 — root invert annotation binders (same as fillInvertPlan).
  const famHead0 = toks(fact0.concl)[0];
  const rootAnn = annotationComponentFacts(
    parseArmAnnotationBinders(parsed.text), frontier, parsed.argNames, {
      argTypesRen: inv0.ctor.argTypes,
      flex: inv0.flex,
      theta: inv0.theta,
      resultIndices: (inv0.ctor.result && inv0.ctor.result.indices) || [],
      indexSorts: (familyKinds && famHead0 && familyKinds.get(famHead0)) || null,
      ctorsMap,
    },
  ).map((f) => ({ ...f, decOk: !!fact0.decOk }));
  for (const n of rootAnn) used.add(n.name);
  pool = pool.concat(rootAnn, frontier);

  for (let r = 1; r < rounds; r += 1) {
    let extended = false;
    for (const f of frontier) {
      if (!f || f.inverted) continue;
      const inv = uniqueFoInversion(norm(f.concl), ctorsMap, metaVars);
      if (!inv || !inv.ctor.argTypes.length) continue;
      const argNames = [];
      let ok = true;
      for (let i = 0; i < inv.ctor.argTypes.length; i += 1) {
        const n = fresh();
        if (!n) { ok = false; break; }
        argNames.push(n);
      }
      if (!ok) continue;
      const comps = [];
      for (let i = 0; i < argNames.length; i += 1) {
        comps.push({
          name: argNames[i],
          extras: [],
          concl: applyTheta(stripParens(norm(inv.ctor.argTypes[i])), inv.flex, inv.theta),
          original: false,
          decOk: !!f.decOk,
        });
      }
      const pat = [inv.ctor.name, ...argNames].join(' ');
      const rhs = f.viaComp ? f.name : foBox(parsed.ctx, f.name);
      lets.push(`let ${foBox(parsed.ctx, pat)} = ${rhs} in`);
      f.inverted = true;
      if (inv.metaTheta && inv.metaTheta.size) {
        mt = inv.metaTheta;
        gConcl = refineText(gConcl, mt);
        for (const p of pool) p.concl = refineText(p.concl, mt);
        for (const c of comps) c.concl = refineText(c.concl, mt);
      }
      frontier = comps;
      pool = pool.concat(comps);
      extended = true;
      break;
    }
    if (!extended) break;
  }

  if (lets.length < 2) return null;

  const g = {
    ctx: goal && goal.ctx != null ? goal.ctx : '',
    concl: gConcl,
  };
  const out = synthesize(g, pool, rules || [], ctorsMap || new Map(), {
    maxDepth: maxDepth == null ? 4 : maxDepth,
    metaVars: metaVars || new Set(),
  });
  if (out && out.text && !/\?/.test(out.text)) {
    return {
      text: `${lets.join('\n')}\n${out.text}`,
      closingPlan: true,
      hyp: parsed.hyp,
      chainLen: lets.length,
    };
  }
  return {
    text: `${lets.join('\n')}\n?`,
    closingPlan: false,
    hyp: parsed.hyp,
    chainLen: lets.length,
  };
}


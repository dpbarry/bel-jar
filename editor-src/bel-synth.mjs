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
  const m = /^([A-Za-z_"¿][A-Za-z0-9_']*)\[([^[\]]*)\]$/.exec(norm(t));
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
    if (pt[0] === '(' || gt[0] === '(') {
      if (!matchT(stripParens(pt), stripParens(gt), flex, theta, alpha)) return false;
      continue;
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
      if (!unifyT(stripParens(x), stripParens(y), flexA, flexB, thA, thB, alpha)) return false;
      continue;
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
  return norm(text).replace(/[A-Za-z_"¿][A-Za-z0-9_']*(\[)?/g, (m, bracket, off, str) => {
    const name = bracket ? m.slice(0, -1) : m;
    // must be a whole token: not preceded by an identifier char
    const prev = off > 0 ? str[off - 1] : ' ';
    if (/[A-Za-z0-9_'"¿]/.test(prev)) return m;
    if (!flex.has(name) || theta.get(name) == null) return m;
    const v = theta.get(name);
    return bracket ? `${v}[` : wrap(v);
  });
}

// Names (flex candidates) still unbound in a text.
function unboundIn(text, flex, theta) {
  const out = new Set();
  for (const t of norm(text).match(/[A-Za-z_"¿][A-Za-z0-9_']*/g) || []) {
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
    if (/^[A-Za-z_"¿][A-Za-z0-9_']*$/.test(body)) return `${body}[.., ${argName}]`;
    return null; // structured body — outside v1's fragment
  }
  // A bare metavariable — incl. a still-unbound ¿-schematic (an inversion may
  // leave some ctor schematics undetermined; the component pattern still binds).
  if (/^[A-Za-z_"¿][A-Za-z0-9_']*$/.test(v)) return `${v}[.., ${argName}]`;
  return null;
}

// ── the engine ────────────────────────────────────────────────────────────────

export function synthesize(goal, facts, rules, ctors, opts = {}) {
  const maxDepth = opts.maxDepth || MAX_DEPTH;
  const metaVars = opts.metaVars || new Set();
  let nodes = 0;
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
    for (const { theta, refs } of tuples.slice(0, MAX_PRODUCTS)) {
      if (rule.isIH && !refs[rule.decIdx]?.decOk) continue;
      const result = applyTheta(rule.result, rule.flex, theta);
      const inv = uniqueInversion(result, ctors);
      if (!inv) continue;
      const comps = [];
      const patParts = [inv.ctor.name];
      let ok = true;
      for (const at of inv.ctor.argTypes) {
        const c = componentOf(at, inv.flex, inv.theta, fresh);
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
          etaed.set(k, String(v).replace(/¿[A-Za-z0-9_']*/g, () => freshEta()));
        }
        for (const f of facts) {
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
  for (let round = 0; round < 3; round += 1) {
    let added = false;
    for (const f of [...allFacts]) {
      if (f.extras.length || f.inverted) continue;
      const inv = uniqueInversion(f.concl, ctors);
      if (!inv) continue;
      f.inverted = true;
      const comps = [];
      const patParts = [inv.ctor.name];
      let ok = true;
      for (const at of inv.ctor.argTypes) {
        const c = componentOf(at, inv.flex, inv.theta, fresh);
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
    if (!added) break;
  }

  // ---- BACKWARD SOLVER ----
  // solve → { argText, lets } (argText goes inside a box at the use site) | null.
  // `path` is the SLD loop check: the normalized goals on the current derivation
  // path — a rule may not re-derive a goal it is already trying to derive (kills
  // the eq_sym ping-pong without forbidding a single legitimate symmetric step).
  function solve(concl, depth, path = [], lfOnly = false) {
    nodes += 1;
    if (nodes > (opts.maxNodes || MAX_NODES)) {
      if (opts.stats) opts.stats.boundHit = true; // honesty: a bound, not "no move"
      return null;
    }
    const goalKey = norm(concl);
    if (path.includes(goalKey)) return null;
    const key = `${depth}§${goalKey}`;
    if (failMemo.has(key)) return null;

    // 1. FACTS. Base facts: exact conclusion. Under-binder facts: match with the
    // binder slots flex; undetermined slots become subgoals of their (instantiated)
    // binder types — the `E1[.., N, E2]` instantiation, derived, not guessed.
    for (const f of allFacts) {
      if (!f.extras.length) {
        // An LF-constructor consumer cannot take a comp variable — skip it here
        // so the constructor derivation below is still reachable (a comp fact
        // must never SHADOW a derivable LF term).
        if (lfOnly && f.viaComp) continue;
        if (norm(f.concl) === norm(concl)) {
          return { argText: f.weaken ? `${f.name}[..]` : f.name, lets: [], viaComp: !!f.viaComp };
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
          if (opts.stats) opts.stats.boundHit = true;
          ok = false;
          break;
        }
        const sub = solve(ty, depth - 1, [...path, goalKey]);
        if (!sub) { ok = false; break; }
        lets.push(...sub.lets);
        slotTerms.push(sub.argText);
      }
      if (!ok) continue;
      return { argText: `${f.name}[.., ${slotTerms.join(', ')}]`, lets };
    }

    if (depth <= 0) {
      if (opts.stats) opts.stats.boundHit = true;
      failMemo.add(key);
      return null;
    }

    // 2. RULES (IH, lemmas, first-order constructors): unify the RESULT with the
    // goal; premises are resolved most-ground-first, each by fact-matching (which
    // may further instantiate the rule) or, once ground, by recursion. A premise
    // the unifier cannot ground fails the rule — no blind instantiation.
    const subPath = [...path, goalKey];
    for (const rule of rules) {
      if (rule.ctypeResult) continue; // saturation-only (spec §7 invariant 3c)
      const app = applyRule(freshenRule(rule), concl, depth, subPath);
      if (app) return app;
    }
    const goalHead = toks(concl)[0];
    for (const c of ctors.get(goalHead) || []) {
      if (c.argTypes.some((a) => /[{]|->|→/.test(a))) continue; // HO ctor arg — split's job
      const asRule = freshenRule({
        name: c.name,
        isIH: false,
        decIdx: -1,
        flex: ctorFlex(c),
        pis: [],
        premises: c.argTypes.map(norm),
        result: `${c.result.head} ${c.result.indices.join(' ')}`.trim(),
        isCtor: true,
      });
      const app = applyRule(asRule, concl, depth, subPath);
      if (app) return app;
    }

    failMemo.add(key);
    return null;
  }

  function applyRule(rule, concl, depth, path = []) {
    const theta0 = new Map();
    if (!matchT(rule.result, concl, rule.flex, theta0)) return null;
    // Premise resolution is a bounded DFS over CHOICES (spec §2: fair argument
    // enumeration). The old greedy loop took the first matching fact per premise
    // with no backtracking — one wrong early binding (two facts matching the
    // same premise) killed derivable chains. Each level resolves the most-ground
    // pending premise, trying every base fact then (once ground) recursion.
    let choiceBudget = 64;
    const dfs = (theta, pending, resolved, lets) => {
      if (choiceBudget <= 0) return null;
      if (!pending.length) return { theta, resolved, lets };
      // Most-ground first, but EVERY pending premise is tried as the pick: a
      // later premise's fact match may be what grounds an earlier one
      // (eval_respects_eq: premise 2 matches F2, which grounds premise 1).
      const ranked = [...pending].sort((a, b) =>
        unboundIn(applyTheta(a.text, rule.flex, theta), rule.flex, theta).size
        - unboundIn(applyTheta(b.text, rule.flex, theta), rule.flex, theta).size);
      for (const pick of ranked) {
        const rest = pending.filter((p) => p !== pick);
        const inst = applyTheta(pick.text, rule.flex, theta);
        // (a) every base-fact resolution of this premise. The IH's decreasing
        // premise must be a decOk fact (the totality checker's criterion); a
        // comp fact never resolves an LF constructor argument.
        for (const f of allFacts) {
          if (f.extras.length) continue;
          if (rule.isCtor && f.viaComp) continue;
          if (rule.isIH && pick.i === rule.decIdx && !f.decOk) continue;
          const t2 = new Map(theta);
          if (!matchT(inst, f.concl, rule.flex, t2)) continue;
          choiceBudget -= 1;
          if (choiceBudget <= 0) return null;
          const r2 = resolved.slice();
          r2[pick.i] = { text: f.weaken ? `${f.name}[..]` : f.name, viaComp: !!f.viaComp };
          const deep = dfs(t2, rest, r2, lets);
          if (deep) return deep;
        }
        // (b) a GROUND premise recurses (under-binder facts + deeper rules). Never
        // the IH's decreasing premise — a derived term is not structurally smaller.
        if (!(rule.isIH && pick.i === rule.decIdx)
            && !unboundIn(inst, rule.flex, theta).size) {
          const sub = solve(inst, depth - 1, path, !!rule.isCtor);
          if (sub && !(rule.isCtor && sub.viaComp)) {
            choiceBudget -= 1;
            if (choiceBudget <= 0) return null;
            const r2 = resolved.slice();
            r2[pick.i] = { text: sub.argText, viaComp: !!sub.viaComp };
            const deep = dfs(theta, rest, r2, [...lets, ...sub.lets]);
            if (deep) return deep;
          }
        }
      }
      return null;
    };
    const hit = dfs(theta0, rule.premises.map((p, i) => ({ i, text: p })),
      new Array(rule.premises.length).fill(null), []);
    if (!hit) return null;
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
      if (pi.kind === 'ctx') { args.push(`[${goal.ctx}]`); continue; }
      if (pi.kind === 'subst') { args.push(`$[${goal.ctx} |- ${pi.varName}]`); continue; }
      const v = theta.get(pi.varName);
      if (v == null) return null;
      args.push(OBJ_MARK + box(stripParens(v)) + OBJ_MARK);
    }
    for (const r of resolved) args.push(r.viaComp ? r.text : box(r.text));
    if (rule.isCtor) {
      const inner = `${rule.name}${resolved.length ? ' ' + resolved.map((r) => (toks(r.text).length > 1 ? `(${r.text})` : r.text)).join(' ') : ''}`;
      return { argText: inner, lets };
    }
    const r = fresh();
    lets.push(`let ${box(r)} = ${rule.name} ${args.join(' ')} in`);
    return { argText: r, lets, callText: `${rule.name} ${args.join(' ')}` };
  }

  // premise tuples for saturation: resolve every premise by an original base fact.
  function premiseTuples(rule, pool) {
    const base = pool.filter((f) => !f.extras.length && f.original);
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

  // A destructured component of an inverted product. FO arg → base fact; HO arg
  // `({x:exp} eq x x -> eq (M x) (N x))` → under-binder fact in substitution form
  // (beta on the instantiated body), pattern `(\x. \u. E)`.
  function componentOf(argType, flex, theta, freshName) {
    const at = stripParens(norm(argType));
    if (!/[{]/.test(at)) {
      const name = freshName();
      return { fact: { name, extras: [], concl: applyTheta(at, flex, theta), original: false }, pattern: name, name };
    }
    // Pi-prefixed HO arg: `{x:exp} T1 -> T2 -> body`
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
    // instantiate + beta the body: tokens `(M x)` with σ(M) a lambda/metavar
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

  // ---- ROOT ----
  const root = solve(norm(goal.concl), maxDepth);
  if (!root) {
    // No inhabiting chain — a REFUTATION (destructure + impossible) also closes.
    return refutations.length
      ? { text: stripObjMarks(refutations[0]), alts: refutations.slice(1).map(stripObjMarks) }
      : null;
  }
  // Tail form: when the root is a rule call, emit it as the tail expression;
  // when it is a bare/instantiated fact, emit the boxed fill.
  let lets = root.lets;
  let tail;
  if (root.callText && lets.length && lets[lets.length - 1].includes(root.callText)) {
    lets = lets.slice(0, -1);
    tail = root.callText;
  } else if (root.viaComp) {
    tail = root.argText; // a comp variable IS the proof term — never boxed
  } else {
    tail = box(root.argText);
  }
  // Include only the saturation lets whose components are actually used.
  const usedText = [...lets, tail].join('\n');
  const satNeeded = saturationLets.filter((s) => s.provides.some((n) =>
    new RegExp(`(^|[^A-Za-z0-9_'])${n}([^A-Za-z0-9_']|$)`).test(usedText)));
  const raw = [...satNeeded.map((s) => s.text), ...lets, tail].join('\n');
  const text = stripObjMarks(raw);
  // The inferred-argument alternative (`[ |- _]` for every object-Pi arg): the
  // NAMED spelling stays primary — it is more constrained and load-bearing when
  // a call has no box premises to infer from — but when it references invented
  // (source-unbound) metas only this variant is certifiable.
  const textU = underscoreObjMarks(raw);
  return {
    text,
    textU: textU !== text ? textU : undefined,
    alts: refutations.map(stripObjMarks),
  };
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

// The schematic (implicitly quantified) variables of a constructor: uppercase
// identifiers in its declared type.
function ctorFlex(c) {
  const names = new Set();
  const scan = (t) => {
    for (const m of String(t).match(/[A-Z][A-Za-z0-9_']*/g) || []) names.add(m);
  };
  c.argTypes.forEach(scan);
  c.result.indices.forEach(scan);
  return names;
}

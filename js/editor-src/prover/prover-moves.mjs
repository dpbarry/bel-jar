// Pure move-text emission: given (hole, code, thm), produce candidate texts
// for fill / synth / recurse / lemma / split / intro. No ordering, no checker.

import {
  decomposeContextual,
  headOfConclusion,
  parseAppType,
  typeFamilyHead,
  enumerateConstructorsTyped,
  splitConstructorsForGoal,
  buildSplitSkeleton,
  buildIntroSkeleton,
  constructorTerm,
  freshNamer,
  patternMetavars,
  fillCandidates,
  invertCandidates,
  paramInvertCandidates,
  reachableTypeHeads,
  isHypArgType,
  isCTypeFamily,
  branchLetNames,
  constructorArgDescriptor,
  conclusionOf,
  schemaInfo,
  schemaAdmittedTypes,
  parameterTermFor,
  soleSchemaAdmitting,
  introBinders,
  familyIndexSorts,
} from './hole-split.mjs';
import { synthesize } from './prover-synth.mjs';
import {
  parseCompType,
  boxedConclusionHead,
  decreasingBoxIndex,
  decreasingArgIndex,
  measureDesignation,
  implicitMetaCount,
  normalizeCtypeSpelling,
  isCtypeApplication,
} from './prover-comp-type.mjs';
import { letRhsOf } from './prover-captions.mjs';
import { stripLfComments } from './prover-certify.mjs';
import { reIdentExact } from './ident.mjs';
import {
  usedNamesOf,
  leadCtxVar,
  candidateSchemasFor,
  introBinderNames,
  topLevelIndexGroups,
  rigidCtorHeadOf,
  theoremContextParam,
  resultBoxFor,
  isDeclaredTypeFamily,
  premiseDecHead,
  contextualBinderMeta,
  isBlockSubderiv,
  metaConclusion,
  ihMetaCand,
  innerSubderivFromBranchGoal,
  decreasingHyps,
  normCtxPart,
  contextualHead,
  normCtxPartSpelling,
  isPremiseShapedSubderiv,
  isIntroducedPremise,
  subderivMetas,
  openCasesAt,
  decreasingBinderNameAt,
  decSubderivNames,
  holeByteOffsetBridge,
  sourceWritableNames,
  inventedReportNames,
  textReferencesNames,
  declBodyEqIndex,
  theoremIndex,
  theoremInScope,
  hypsOf,
  expandedHypsOf,
  declStartOffset,
  branchPatternBox,
  branchPatternMetas,
  blockProjectionHyps,
  higherOrderHyp,
  premiseBoxArg,
  termOf,
  boxOf,
  splitCtx,
  schemaSomeVars,
  letsInBranch,
  freshForHole,
  freshName,
  enrichHoleFromTheorem,
  unwrapExtraGoalBox,
  resolveHoleGoal,
  resultFamilyOfCtor,
  familyOfConstructorNameBridge,
} from './prover-hyp.mjs';

// Build the case-split text for scrutinee `varName` from OUR model (constructors
// + schema parameter branch). Returns the `case … of …` text or null.

export function splitTextFor(code, hole, varName, splitOpts) {
  const entry = (hole.ctx || []).find((c) => c && c.name === varName);
  if (!entry) return null;
  return splitTextForBox(code, hole, varName, entry.type, splitOpts);
}

// S1b (2026-07-19): split on a CTYPE-headed scrutinee (`tr : TRel [l⊢T] [h⊢T']`
// — a comp-level inductive family, not an LF-boxed hypothesis).
// `splitTextForBox` is LF-CONTEXT-centric top to bottom (a schema, a context
// string, dependency-closure over the scrutinee's Γ-tail) — a ctype family has
// no such single context; its own binders (`(g:tCtx)(h:taCtx)`) are refined
// PER-CONSTRUCTOR by unification, an entirely different shape. Rather than
// force that model, this is a MINIMAL, SEPARATE emitter: enumerate ctors
// (already comment/depth-bound-safe — the S1 ctor-scanner fixes), skip any
// ctor with a Pi-PREFIXED arg (`{h:taCtx} …` — dependent/HO, fail-open,
// matching F.8's "partial coverage never demands" discipline), and reuse
// `constructorTerm` UNBOXED — it already falls through to a bare `fresh()`
// name for any arg it doesn't recognize as HO/hyp-block/LF-dependent, which
// is EXACTLY the correct spelling for a ctype-typed constructor argument
// (`TRapp fresh1 fresh2`, never `TRapp [⊢fresh1] [⊢fresh2]`). No context-
// refinement tracking (out of scope for this cut): sound for ctors whose
// premises are themselves plain ctype/LF values, not context extensions
// other hypotheses depend on.

// S1b (2026-07-19): split on a CTYPE-headed scrutinee (`tr : TRel [l⊢T] [h⊢T']`
// — a comp-level inductive family, not an LF-boxed hypothesis).
// `splitTextForBox` is LF-CONTEXT-centric top to bottom (a schema, a context
// string, dependency-closure over the scrutinee's Γ-tail) — a ctype family has
// no such single context; its own binders (`(g:tCtx)(h:taCtx)`) are refined
// PER-CONSTRUCTOR by unification, an entirely different shape. Rather than
// force that model, this is a MINIMAL, SEPARATE emitter: enumerate ctors
// (already comment/depth-bound-safe — the S1 ctor-scanner fixes), skip any
// ctor with a Pi-PREFIXED arg (`{h:taCtx} …` — dependent/HO, fail-open,
// matching F.8's "partial coverage never demands" discipline), and reuse
// `constructorTerm` UNBOXED — it already falls through to a bare `fresh()`
// name for any arg it doesn't recognize as HO/hyp-block/LF-dependent, which
// is EXACTLY the correct spelling for a ctype-typed constructor argument
// (`TRapp fresh1 fresh2`, never `TRapp [⊢fresh1] [⊢fresh2]`). No context-
// refinement tracking (out of scope for this cut): sound for ctors whose
// premises are themselves plain ctype/LF values, not context extensions
// other hypotheses depend on.

export function splitTextForCtype(code, hole, scrutText, ctypeType, ctOpts = {}) {
  const headM = /^[\p{L}_][\p{L}\p{N}_']*/u.exec(normalizeCtypeSpelling(ctypeType).trim());
  const head = headM && headM[0];
  if (!head || !isDeclaredTypeFamily(code, head)) return null;
  const ctors = enumerateConstructorsTyped(code, head);
  if (!ctors.length) return null;
  const used = usedNamesOf(hole);
  const fresh = freshNamer(used);
  let lowerN = 0;
  const lowerFresh = () => {
    let name;
    do { name = 'h' + (lowerN === 0 ? '' : lowerN); lowerN += 1; } while (used.includes(name));
    used.push(name);
    return name;
  };
  // A SCHEMA-typed Pi ctor arg (`{h:tctx} Map [h] []`) spells as a fresh
  // context box `[h1]` in pattern position — checker-verified 2026-07-21
  // (cc.bel extendEnv: `M_id [h] => ?` accepted, binds the context). A
  // non-schema Pi (LF-object binder) stays out of fragment → skip that ctor
  // (fail-open partial coverage — the checker's coverage check is ground
  // truth). Every other arg (ctype, LF box) binds as a bare fresh name; the
  // checker infers its type from the ctor signature.
  const isSchema = (name) => new RegExp(`(^|\\n)\\s*schema\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(String(code || ''));
  const branches = [];
  // `only` restricts to a single constructor — the CTYPE INVERSION caller, which has
  // already established that the hypothesis' indices leave exactly one possible.
  for (const ctor of (ctOpts.only ? ctors.filter((c) => c.name === ctOpts.only) : ctors)) {
    const args = [];
    let ok = true;
    for (const at of (ctor.argTypes || [])) {
      const t = String(at).trim();
      const pm = /^\{\s*[\p{L}_][\p{L}\p{N}_']*\s*:\s*([\p{L}_][\p{L}\p{N}_']*)\s*\}$/u.exec(t);
      if (pm && isSchema(pm[1])) { args.push(`[${lowerFresh()}]`); continue; }
      // An OBJECT-Pi ctor argument (`{A:[⊢ty]}`, `{M:[Γ⊢tm A[]]}`) is a
      // META-OBJECT, so it binds as a BOX in pattern position — it is not out
      // of fragment, and skipping the ctor for it silently removed the ONLY
      // constructor of every accessibility-style family (`Sn`'s `Acc`, the
      // whole poplmark-reloaded SN development), leaving those theorems with
      // no first move at all. Checker-arbitrated, 2026-07-28: for `Acc`,
      // `| Acc [_] [ |- A1] [_ |- M1] R => ?` is ACCEPTED while the bare
      // spelling is rejected ("Expected a meta-object; Found a
      // computation-level pattern"). The context is spelled `_` (the corpus
      // idiom, and D11-safe — the ctor's declared context variable need not be
      // writable at this hole); a structural extension keeps its tail.
      const pib = /^\{\s*[\p{L}_][\p{L}\p{N}_']*\s*:\s*([\s\S]*)\}$/u.exec(t);
      const pibType = pib && pib[1].trim();
      const box = pibType && pibType[0] === '[' ? decomposeContextual(pibType) : null;
      if (box) {
        const parts = splitCtx(box.ctx || '');
        // A CLOSED declared box (`[⊢ ty]`) keeps its empty context; an open one
        // replaces the leading context variable with `_` and keeps its tail.
        const ctxTxt = parts.length ? ['_', ...parts.slice(1)].join(', ') : '';
        args.push(`[${ctxTxt} |- ${fresh()}]`);
        continue;
      }
      if (t[0] === '{') { ok = false; break; } // a non-box Pi binder — still out of fragment
      args.push(fresh());
    }
    if (!ok) continue;
    branches.push(`| ${[ctor.name, ...args].join(' ')} =>\n  ?`);
  }
  if (!branches.length) return null;
  return `case ${scrutText} of\n${branches.join('\n')}`;
}

// Same, for an arbitrary scrutinee EXPRESSION (`case [g |- U] of …` — an
// mlam-bound meta split as a constructed box) with its boxed type.

// Same, for an arbitrary scrutinee EXPRESSION (`case [g |- U] of …` — an
// mlam-bound meta split as a constructed box) with its boxed type.

export function splitTextForBox(code, hole, scrutText, boxedType, splitOpts = {}) {
  const dbg = globalThis.__splitDebug || (() => {});
  const decomp = decomposeContextual(boxedType);
  if (!decomp) { dbg('no-decomp', boxedType); return null; }
  // The scrutinee's family head: the syntactic head of its conclusion (`hyp X A` →
  // `hyp`) when that is a declared family; else fall back to the notation-resolved
  // family (infix operators, e.g. `P ⇛ Q` → `⇛`). Guard against `typeFamilyHead`
  // collapsing a fully-applied family to its KIND (`type`).
  const synHead = headOfConclusion(decomp.concl);
  const notaHead = typeFamilyHead(decomp.concl, code);
  const head = (synHead && isDeclaredTypeFamily(code, synHead)) ? synHead
    : (notaHead && notaHead !== 'type') ? notaHead
    : synHead;
  if (!head) { dbg('no-head', decomp.concl); return null; }
  dbg('head', head);
  const lead = leadCtxVar(decomp.ctx);
  const candidates = candidateSchemasFor(code, hole, lead);
  let schema = null;
  for (const name of candidates) {
    const info = schemaInfo(code, name);
    if (parameterTermFor(head, info)) { schema = info; break; }
  }
  if (!schema && candidates.length) schema = schemaInfo(code, candidates[0]);
  // The context variable named no schema we could resolve (an IMPLICITLY
  // quantified `g` — the theorem never writes `(g:ctx)` and the checker reports
  // it bare or as `_`). Only a context VARIABLE can hold a parameter, so this
  // never fires for a closed `[ |- …]` scrutinee; when exactly one declared
  // schema admits the scrutinee's family, that settles it.
  if (!schema && lead) schema = soleSchemaAdmitting(code, head);
  const schemaTypes = candidates.length ? schemaAdmittedTypes(code, candidates[0]) : null;
  // Dependency annotations for a strengthening-shaped context (a declared binder
  // tail after the context variable): a pattern metavar depends only on the tail
  // binders whose TYPES its family's constructor closure can reach. Nothing
  // reachable at all (tail nor schema) pins the metavar closed (`D[]`).
  const tailParts = splitCtx(decomp.ctx).slice(1).map((p) => {
    const colon = p.indexOf(':');
    return { name: p.slice(0, colon < 0 ? p.length : colon).trim(), head: colon < 0 ? null : headOfConclusion(p.slice(colon + 1)) };
  });
  const reachMemo = new Map();
  const reachOf = (fam) => {
    if (!reachMemo.has(fam)) reachMemo.set(fam, reachableTypeHeads(code, fam));
    return reachMemo.get(fam);
  };
  const depFor = (at, desc) => {
    if (!tailParts.length) return null;
    if (/^\s*\{/.test(at) || isHypArgType(at) || isHypArgType(desc.bodyType)) return null;
    // Notation-aware family (an infix arg `(Q ⇛ R)` is family `⇛`, not `Q`), and
    // it must be DECLARED — a metavariable head has no closure to reason from.
    const concl0 = conclusionOf(desc.higherOrder ? desc.bodyType : String(at));
    const nota = typeFamilyHead(concl0, code);
    const fam = (nota && nota !== 'type') ? nota : headOfConclusion(concl0);
    if (!fam || !isDeclaredTypeFamily(code, fam)) return null;
    const r = reachOf(fam);
    const keep = tailParts.filter((t) => t.head && r.has(t.head)).map((t) => t.name);
    if (keep.length === tailParts.length) return null; // full dependency — no annotation
    const schemaReach = schemaTypes ? [...schemaTypes].some((h2) => r.has(h2)) : true;
    if (!keep.length && !schemaReach) return { closed: true, keep: [] };
    return { closed: false, keep };
  };
  // Typed enumeration reads BOTH declaration forms (the cp-suite `c : … -> F …`
  // form too). Map each constructor's arg TYPES to the {higherOrder, binders}
  // shape buildSplitSkeleton/constructorTerm expect (a function arg type ⇒
  // higher-order, with one binder per top-level arrow).
  const typed = enumerateConstructorsTyped(code, head);
  const typedFiltered = typed;
  const ctors = splitConstructorsForGoal(decomp.concl, typedFiltered.map((c) => ({
    name: c.name,
    result: c.result, // the arm ANNOTATION binds the implicit indices from this
    args: c.argTypes.map((at) => {
      const desc = { ...constructorArgDescriptor(at, usedNamesOf(hole)), rawType: at };
      desc.dep = depFor(at, desc);
      return desc;
    }),
  })), typedFiltered);
  // A NULLARY ctor arm whose result indices DEFINITELY rigid-clash the
  // scrutinee's is never emitted: the checker does not reject it — a bare-
  // identifier pattern whose constructor cannot type elaborates as a fresh
  // catch-all VARIABLE binder instead (measured 2026-07-18 on natval_dont_step:
  // the arm `| [ |- s_pred_zero] => ?` against scrutinee `step (succ N) M'`
  // certified with `s_pred_zero : ( |- step (succ N) "i)` in Δ — a full-
  // strength re-pose of the pre-split obligation, inv-3 junk by construction
  // and the backtracker's wander fuel). Beluga's own coverage never demands a
  // definitely-unreachable ctor arm, so dropping is sound. FAIL-OPEN: only a
  // rigid-rigid head clash between DECLARED ctor heads drops (metas, params,
  // `"`-names, projections, count misalignment all keep the arm), and
  // non-nullary clash arms still go through checker pruning as before.
  const scrutIdx = topLevelIndexGroups(decomp.concl);
  const reachable = ctors.filter((c) => {
    if ((c.args || []).length) return true;
    const rIdx = (c.result && c.result.indices) || [];
    if (rIdx.length !== scrutIdx.length) return true;
    for (let i = 0; i < rIdx.length; i += 1) {
      const a = rigidCtorHeadOf(scrutIdx[i], code);
      const b = rigidCtorHeadOf(rIdx[i], code);
      if (a && b && a !== b) return false;
    }
    return true;
  });
  if (reachable.length !== ctors.length) dbg('unreachable-nullary-dropped', ctors.length - reachable.length);
  const goalCtx = hole?.goal && decomposeContextual(hole.goal)?.ctx;
  const ctxStr = decomp.ctx || goalCtx;
  const hasHoCtor = reachable.some((c) => c.args?.some((a) => a.higherOrder));
  const ctxHasNames = String(ctxStr || '').split(',').some((p) => /:\s*name\b/.test(p));
  dbg('ctors', reachable.length, 'ctx', ctxStr);
  const sk = buildSplitSkeleton(scrutText, ctxStr, reachable, {
    head, schema, schemaTypes, usedNames: usedNamesOf(hole),
    contextProjection: hasHoCtor || ctxHasNames,
    annotate: splitOpts.annotate,
    code, // fixity source: arm annotations must respect --infix declarations
  });
  dbg('skeleton', sk ? 'ok' : 'null');
  return sk;
}

// Top-level application argument groups of a conclusion, head dropped:
// `step (succ N) "i` → ['(succ N)', '"i'] (paren/bracket-aware).


export function synthMoves(hole, code, thm) {
  if (!thm || !thm.compType) return [];
  // M2 (2026-07-19, S1): a theorem with NO box-kind premise (ctype-only /
  // Pi-only straight-line composition) never self-recurses in the unsound
  // sense — it needs no totality measure.
  //
  // S2 (2026-07-21, user policy — AUTHOR-FAITHFUL UNTOTALIED RECURSION, see
  // memory `project_prover_sprint_contract.md`): the old bail here
  // (`hasBoxPremise && !thm.totality → []`) is REMOVED. When the AUTHOR's own
  // decl omits `/ total /` (the entire 112-member no-totality residue class:
  // 98 single + 14 mutual, all NO-PRAGMA after comment-aware audit), the
  // engine may recurse: Beluga accepts untotalied recs, and the SAFETY is the
  // engine's own decOk gate — the IH's decreasing slot (decreasingBoxIndex's
  // untotalied default: premise 0) only accepts case-components of the
  // destructured binder, so generated calls are structurally smaller BY
  // CONSTRUCTION. The checker is NOT the guard here (it would accept circular
  // junk untotalied); decOk is. No pragma is ever emitted — the author's
  // header stays verbatim. recurseTexts/piRecurseTexts still refuse without
  // totality (conservative; the synth IH path is the one opened, as measured
  // sufficient for the ctype half of this policy — exCRel et al.).
  const goalBox = decomposeContextual(hole && hole.goal);
  // S1/M1 (2026-07-19): a CTYPE goal (`OSim [⊢T] [_⊢M] [_⊢M]`, `Map [_] [_]`,
  // `Red [⊢A] [g⊢#p]` — the stratified/inductive comp families) previously
  // BYPASSED synthesis entirely (decomposeContextual null → []), which left
  // whole developments (logrel, compile, equal, howes) with near-zero
  // generation: the measured dominant residue class (179 small-reference
  // no-moves). Phase C normalized ctype RULES and FACTS to the paren spelling;
  // this admits the GOAL position with the same normalization.
  let goal;
  let goalParts;
  let ctypeGoal = false;
  if (goalBox) {
    goal = { ctx: String(goalBox.ctx || '').trim(), concl: String(goalBox.concl || '').trim() };
    goalParts = splitCtx(goalBox.ctx);
  } else if (isCtypeApplication(hole && hole.goal)) {
    goal = { ctx: '', concl: normalizeCtypeSpelling(hole.goal) };
    goalParts = [];
    ctypeGoal = true;
  } else {
    return [];
  }

  // S1/M1b: CTYPE premises are premises — a theorem whose only premise is
  // `Map [h] [g]` (compile/equal/logrel families) must still synthesize; the
  // box-only gate silently zeroed generation for the whole class.
  const boxes = thm.compType.premises.filter((p) => p.kind === 'box' || p.kind === 'ctype');
  if (!boxes.length) return [];
  // ARG-premise index (box+ctype aligned — see decreasingArgIndex): for all-box
  // theorems this IS decreasingBoxIndex; for ctype-premise theorems it makes the
  // decreasing slot (hence the IH rule + decOk facts) reachable at all.
  const decIdxThm = decreasingArgIndex(thm);
  const decNames = decSubderivNames(code, hole, decIdxThm);

  // Phase F.7 — writable set before fact admission so invented report names
  // never enter the named-citation pool.
  const writable = sourceWritableNames(code, hole, thm);
  const inventedSet = new Set(inventedReportNames(hole, writable));

  const facts = [];
  const pushFact = (name, type, viaComp = false) => {
    if (!name || !type || !reIdentExact.test(name)) return;
    let t = String(type).trim();
    if (t[0] === '(' && t[t.length - 1] === ')') t = `[${t.slice(1, -1)}]`;
    const b = decomposeContextual(t);
    if (!b) {
      // Phase C Seam 2: ctype hypotheses (TRel [g |- M] [h |- N]) are facts —
      // no outer contextual box, so decomposeContextual is null by design.
      if (!isCtypeApplication(t)) return;
      facts.push({
        name, extras: [], concl: normalizeCtypeSpelling(t),
        original: true, decOk: decNames.has(name), viaComp, weaken: false, ctype: true,
        invented: inventedSet.has(name) || undefined,
      });
      return;
    }
    // ⛔ CONTEXTUAL FACTS AT A CTYPE GOAL — admitting them was TRIED and REVERTED
    // (master plan entry 42, 2026-07-31). The drop below is real and broad: the planner
    // is single-context, so at a ctype goal (empty ambient context) a boxed fact's own
    // context becomes an unparseable "extra" and the fact is discarded — measured on 16
    // of 40 sampled stuck targets, 160 drops, 7 of them STUCK:no-move. Admitting such
    // facts with their own spelling (`[h1 |- X2]`), PLUS weakening-aware subgoal
    // matching, measured **0 completions and 0 verdict changes on those same 16**
    // (1 row moved 34→27 checks). Reaching the site is not the same as being able to
    // COMPLETE the term: the family needs a 3-part composite move (ctype-ctor
    // application + INLINE IH call in an argument slot + weakened box), and building
    // two of the three pays exactly nothing. Do not re-add the admission alone.
    // `__factDropDebug` below is the instrument that measured this; it is a no-op.
    const hp = splitCtx(b.ctx);
    // A fact whose context is a strict PREFIX of the goal's weakens into it
    // (spec §2 / D7) — spelled `X[..]` at use sites. A comp variable cannot.
    let weaken = false;
    if (hp.length < goalParts.length) {
      if (viaComp) return;
      for (let i = 0; i < hp.length; i += 1) {
        if (normCtxPart(hp[i]) !== normCtxPart(goalParts[i])) return;
      }
      weaken = true;
    } else {
      for (let i = 0; i < goalParts.length; i += 1) {
        if (normCtxPart(hp[i]) !== normCtxPart(goalParts[i])) return;
      }
    }
    const extras = hp.slice(goalParts.length).map((e) => {
      const c = e.indexOf(':');
      return c < 0 ? null : { name: e.slice(0, c).trim(), type: e.slice(c + 1).trim() };
    });
    if (extras.some((e) => !e || /\bblock\b/.test(e.type))) {
      if (globalThis.__factDropDebug) globalThis.__factDropDebug({ name, type: t, ctx: b.ctx, concl: b.concl, goalParts, reason: 'unparseable-extra' });
      return; // block extras — outside fragment
    }
    if (viaComp && extras.length) return; // a comp variable has no binder telescope
    // Ctype concl inside a meta box `( |- TRel …)` — normalize like bare ctype facts.
    const concl = isCtypeApplication(b.concl)
      ? normalizeCtypeSpelling(b.concl)
      : String(b.concl || '').trim();
    facts.push({
      name, extras, concl, original: true, decOk: decNames.has(name), viaComp, weaken,
      invented: inventedSet.has(name) || undefined,
    });
  };
  for (const m of (hole.meta || [])) pushFact(m && m.name, m && m.type);
  // Comp-context hypotheses are facts too (spec §2 synthesis): usable as
  // rec/lemma arguments or the whole tail — provenance-marked so they are never
  // spelled inside an LF term.
  for (const c of (hole.ctx || [])) pushFact(c && c.name, c && c.type, true);
  if (!facts.length) return [];

  // A theorem/lemma as an engine rule: box premises' conclusions, explicit-brace
  // binders as pi args (ctx vs boxed-object), implicit paren binders dropped
  // (they take no call argument). Flex = the schematic (uppercase) names.
  const mkRule = (name, compType, isIH, totality) => {
    const conclBox = decomposeContextual(compType.conclusion);
    // A CTYPE conclusion (`Reassoc [ ⊢ N1] …`) enters the planning domain with
    // its boxed indices normalized to parenthesized terms — its single-ctor
    // products saturate deterministically into facts (spec §7 invariant 3c).
    let ctypeResult = false;
    let ctypeConcl = null;
    // Context variables are SCHEMATIC in the ctype planning domain (C6,
    // 2026-07-21): whole-token `[l]`/`[h]` indices and composite heads
    // `[g, x:term]` in a ctype premise/conclusion become CTXV_* flex
    // placeholders (same convention as bel-synth's ctypeCtorAsRule — θ-values
    // are the UNBRACKETED context text; matchT's ctx-token rules bind them).
    // Without this the IH result `Crel [l] [h]` can never match a
    // checker-printed goal `Crel [_] [h1]`.
    const ctxFlexNames = new Set();
    const flexCtxRule = (t) => String(t)
      .replace(/\[\s*([a-z_][\p{L}\p{N}_']*)\s*\]/gu, (m, n) => { ctxFlexNames.add(`CTXV_${n}`); return `[CTXV_${n}]`; })
      .replace(/\[\s*([a-z_][\p{L}\p{N}_']*)\s*,/gu, (m, n) => { ctxFlexNames.add(`CTXV_${n}`); return `[CTXV_${n},`; });
    if (!conclBox) {
      const lead = (String(compType.conclusion).trim().match(/^[\p{L}_][\p{L}\p{N}_']*/u) || [])[0];
      if (!lead || !enumerateConstructorsTyped(code, lead).length) return null;
      ctypeResult = true;
      ctypeConcl = flexCtxRule(normalizeCtypeSpelling(compType.conclusion));
    }
    const premises = [];
    // Parallel to `premises`: a CTYPE-typed premise's resolved value is a
    // COMP-level expression and must be passed BARE at a call site (never
    // `[Γ ⊢ …]`-boxed like an LF premise's). M3 (2026-07-19, S1): the
    // backward solver's arg-assembly boxed every resolved slot uniformly —
    // fine while ctype-result rules were never chained backward, but M2's
    // un-gating made this load-bearing (a nested `aeq_wk` result embedded
    // into `atrans_s`'s call must read `atrans_s S1`, never `atrans_s [⊢S1]`).
    const premiseCtype = [];
    const pis = [];
    for (const p of compType.premises) {
      if (p.kind === 'ctype' || (p.kind === 'box' && isCtypeApplication(p.raw))) { // GENERAL: premise-kind enum tag from classifyPremise, not a Beluga name
        // Phase C Seam 1: never wrap a ctype as `[TRel …]` — that misparses.
        premises.push(flexCtxRule(normalizeCtypeSpelling(p.raw)));
        premiseCtype.push(true);
      } else if (p.kind === 'box') {
        let raw = p.raw;
        if (raw && !raw.startsWith('[')) raw = `[${raw}]`;
        const b = decomposeContextual(raw);
        if (!b) return null;
        premises.push(String(b.concl || '').trim());
        premiseCtype.push(false);
      } else if (p.kind === 'pi') {
        const inner = p.raw.slice(1, p.raw.lastIndexOf('}') >= 0 ? p.raw.lastIndexOf('}') : p.raw.length);
        const ci = inner.indexOf(':');
        if (ci < 0) return null;
        const vn = inner.slice(0, ci).trim();
        const vt = inner.slice(ci + 1).trim();
        if (vt.startsWith('$')) pis.push({ kind: 'subst', varName: vn }); // vn keeps its `$` — that IS the spelling
        else if (vt.includes('[') || vt.includes('⊢') || vt.includes('|-')) pis.push({ kind: 'obj', varName: vn });
        else pis.push({ kind: 'ctx' });
      }
      // kind 'ctx' (implicit `(g:schema)` binder): no call argument — skip
    }
    const flex = new Set();
    const scan = (t) => {
      const s = String(t);
      const re = /\p{Lu}[\p{L}\p{N}_']*/gu;
      let m;
      while ((m = re.exec(s))) {
        // `$W` is a substitution VARIABLE, not a schematic — treating its `W` as
        // flex would let applyTheta rewrite inside substitution tokens (capture).
        const prev = m.index > 0 ? s[m.index - 1] : ' ';
        if (prev === '$') continue;
        flex.add(m[0]);
      }
    };
    // The HEAD (family/relation name) must never enter the flex set — a
    // CTYPE/inductive family (`Aeq`, `TRel`, `Map`, `Red`, `SN`…) is ALSO
    // conventionally uppercase, colliding with the schematic-metavariable
    // convention this scan exists to capture. Scanning the head as flex let
    // matchT/unifyT treat the RELATION ITSELF as a unification placeholder —
    // measured 2026-07-19 (S1): aeq_wk's premise `Aeq (M') (N')` flagged
    // `Aeq` flex, and every ctype-premise rule silently failed to match any
    // fact. An application's head is always a declared symbol in this
    // fragment (never a bare schematic var) — stripping it is sound for LF
    // premises too (their heads are lowercase, so this is a no-op there).
    const scanArgsOnly = (t) => {
      const s = String(t).trim();
      const headM = /^[\p{L}_][\p{L}\p{N}_']*/u.exec(s);
      scan(headM ? s.slice(headM[0].length) : s);
    };
    premises.forEach(scanArgsOnly);
    if (conclBox) scanArgsOnly(conclBox.concl);
    for (const n of ctxFlexNames) flex.add(n); // C6 context schematics (the Lu scan also catches these; explicit for clarity)
    for (const pi of pis) if (pi.kind === 'obj') flex.add(pi.varName); // GENERAL: 'obj' is this adapter's own pi-kind tag, not a name
    // rule.decIdx indexes THIS rule's `premises` array (box+ctype interleaved
    // in declaration order) — decreasingArgIndex is the aligned notion;
    // decreasingBoxIndex's box-only count drifts once a ctype premise exists.
    const decI = decreasingArgIndex({ compType, totality });
    if (ctypeResult) {
      const ccTrim = String(ctypeConcl).trim();
      const ccHead = /^[\p{L}_][\p{L}\p{N}_']*/u.exec(ccTrim);
      const ccArgs = ccHead ? ccTrim.slice(ccHead[0].length) : ccTrim;
      for (const w of ccArgs.match(/\p{Lu}[\p{L}\p{N}_']*/gu) || []) flex.add(w);
      return {
        name, isIH, decIdx: isIH ? decI : -1, flex, pis, premises, premiseCtype,
        result: ctypeConcl, ctypeResult: true,
      };
    }
    return {
      name, isIH, decIdx: isIH ? decI : -1, flex, pis, premises, premiseCtype,
      result: String(conclBox.concl || '').trim(),
    };
  };

  let rules = [];
  const thmIdx = theoremIndex(code);
  for (const lem of thmIdx) {
    if (!lem || !lem.compType || (thm && lem.name === thm.name)) continue;
    if (!theoremInScope(lem, thm, thmIdx)) continue; // sequential signature
    const r = mkRule(lem.name, lem.compType, false, null);
    if (r) rules.push(r);
  }
  // The IH enters synthesis only when a BOX premise decreases (decOk gating is
  // box-slot–keyed). A Pi-designating measure recurses via piRecurseTexts with
  // its own structural guard — an ungated IH rule here would let backward
  // chaining spiral on the recursive theorem (§7 invariant discipline).
  const ihRule = decIdxThm >= 0 ? mkRule(thm.name, thm.compType, true, thm.totality) : null;
  if (ihRule) rules.push(ihRule);
  // S2 COST CONTAINMENT (2026-07-21, measured twice, not guessed): for an
  // AUTHOR-UNTOTALIED box theorem (the policy unlock), synthesis is
  // (a) IH-rule ONLY — the full lemma-rule mass flipped sstu_helper4
  //     COMPLETE→step-bound on the first differential; and
  // (b) engaged only at holes where a decOk fact EXISTS (i.e. after a split
  //     destructured the decreasing binder) — with rules contained, the
  //     fact/ctor chains at PRE-split holes still flipped ctx_eq_unr
  //     COMPLETE→step-bound on the second differential. Pre-split holes are
  //     now byte-identical to pre-policy (zero synth candidates); post-split
  //     holes get exactly the policy's intended gain, the decOk-gated IH —
  //     which is what the measured wins (appd, count) actually used.
  const authorUntotaliedBox = !thm.totality
    && thm.compType.premises.some((p) => p.kind === 'box');
  if (authorUntotaliedBox) {
    rules = rules.filter((r) => r.isIH);
    if (!facts.some((f) => f.decOk)) return [];
  }
  if (!rules.length) return [];

  const goalFam = headOfConclusion(goal.concl);
  const fams = new Set(goalFam ? reachableTypeHeads(code, goalFam) : []);
  if (goalFam) fams.add(goalFam);
  for (const r of rules) {
    const rf = headOfConclusion(r.result);
    if (rf) fams.add(rf);
  }
  // FACT families too: refutation closing tests each hypothesis's (refined) type
  // for inhabitation, so the constructor map must cover them (`notLam` at the
  // cross arms — reachable from neither the goal nor any rule result).
  // Closure (Phase F.6): index-head ctors in those families' spines (e.g. `app`
  // under `tm` from `ev (app M N) R`) must be present to type nested annotation
  // binders.
  for (const f of facts) {
    const fh = headOfConclusion(f.concl);
    if (!fh || !/^[\p{L}_]/u.test(fh)) continue;
    fams.add(fh);
    for (const r of reachableTypeHeads(code, fh)) fams.add(r);
  }
  const ctorsMap = new Map();
  const familyKinds = new Map();
  // Nested-bracket-tolerant (one level), mirroring normalizeCtypeSpelling's
  // 2026-07-21 fix — `[ |- M[..]]` → `(M[..])`, never the mangled `(M[..)]`.
  const planNorm = (t) => String(t).replace(/\[\s*\|-\s*((?:[^\[\]]|\[[^\[\]]*\])+)\]/g, '($1)');
  for (const fam of fams) {
    let cs = enumerateConstructorsTyped(code, fam);
    if (cs.length && isCTypeFamily(code, fam)) {
      // Normalize boxed argument/index spellings into the planning domain.
      cs = cs.map((c) => ({
        ...c,
        argTypes: c.argTypes.map(planNorm),
        result: { head: c.result.head, indices: c.result.indices.map(planNorm) },
        isCType: true,
      }));
    }
    if (cs.length) ctorsMap.set(fam, cs);
    const sorts = familyIndexSorts(code, fam);
    if (sorts) familyKinds.set(fam, sorts);
  }

  // Refinable metavariables for the engine's symmetric inversion: the hole's cD
  // metas (a pattern match may refine them — the checker does exactly that).
  const metaVars = new Set((hole.meta || [])
    .map((m) => m && m.name)
    .filter((n) => n && /^[\p{L}_"][\p{L}\p{N}_']*$/u.test(n)));

  // Debug hook (no-op unless a harness installs it): expose the exact engine
  // inputs so a real stuck state can be replayed and diagnosed purely.
  if (globalThis.__synthDebug) {
    globalThis.__synthDebug({
      goal, facts, rules, ctors: [...ctorsMap.keys()], decNames: [...decNames],
      // full live objects so a debug hook can REPLAY synthesize exactly
      ctorsMap, metaVars, familyKinds,
    });
  }
  const stats = {};
  const obligations = [];
  // No maxDepth: the main path runs full iterative deepening (G.2c) — the
  // level loop self-terminates on a clean level (certified exhaustion) or a
  // node/choice tripwire. Plan fillers keep their explicit probe caps.
  const out = synthesize(goal, facts, rules, ctorsMap, {
    metaVars, stats, ctypeGoal,
    onDemand: (obs) => { if (obs && obs.length) obligations.push(...obs); },
  });
  const attachDemand = (arr) => {
    arr.obligations = obligations;
    arr.demandFacts = facts;
    arr.demandCtors = ctorsMap;
    arr.demandFamilyKinds = familyKinds;
    arr.demandMetaVars = metaVars;
    arr.demandRules = rules;
    arr.demandGoal = goal;
    return arr;
  };
  if (!out || !out.text) {
    const none = attachDemand([]);
    if (stats.boundHit) none.searchBounded = true; // honesty: a bound was hit, not "no move"
    // Phase G seed: no plan AND no bound hit ⇒ the synth fragment was genuinely
    // exhausted (descent classes + cyc-safe memo make this a certificate, not a
    // resource verdict). The full NO-CUT-FREE-PROOF needs the bridge's own
    // move-space account too — this is the synth-level half.
    if (stats.exhausted) none.synthExhausted = true;
    return none;
  }
  // Phase F.0 (direction a): prefer plans whose referenced report-names are
  // source-writable. Named spelling that cites invented hole binders is demoted
  // or dropped when the inferred (`_`) spelling is clean — never rename to "fix".
  // (writable / inventedSet computed above for F.7 fact tagging.)
  const invented = [...inventedSet];
  const namedHits = textReferencesNames(out.text, invented);
  const uHits = out.textU ? textReferencesNames(out.textU, invented) : false;
  const moves = attachDemand([]);
  if (namedHits && out.textU && !uHits) {
    moves.push({
      kind: 'synth',
      text: out.textU,
      rationale: 'goal-directed synthesis: writable inferred (`_`) spelling',
    });
  } else if (namedHits) {
    if (out.textU) {
      moves.push({
        kind: 'synth',
        text: out.textU,
        rationale: 'goal-directed synthesis: inferred (`_`) object-argument spelling',
        writableRisk: true,
      });
    }
    moves.push({
      kind: 'synth',
      text: out.text,
      rationale: 'goal-directed synthesis: named spelling (writable-risk)',
      writableRisk: true,
    });
  } else {
    moves.push({
      kind: 'synth',
      text: out.text,
      rationale: 'goal-directed synthesis: backward chaining from the goal type',
    });
    if (out.textU) {
      moves.push({
        kind: 'synth',
        text: out.textU,
        rationale: 'goal-directed synthesis: inferred (`_`) object-argument spelling',
      });
    }
  }
  for (const alt of (out.alts || []).slice(0, 3)) {
    const risk = textReferencesNames(alt, invented);
    moves.push({
      kind: 'synth',
      text: alt,
      rationale: 'goal-directed synthesis: refutation closing',
      writableRisk: risk || undefined,
    });
  }
  return moves;
}

// Recurse-via-IH candidates. The IH = the theorem applied to ALL its premises:
// `thm [Γ |- a1] … [Γ |- an]` where the DECREASING premise is filled by a
// structural sub-derivation (a cD metavar from a split, the totality guard) and
// the OTHER premises by in-scope hypotheses whose types are consistent with it
// (shared index vars unify across premises — that pairing is the crux of a
// multi-argument induction like `dl_uniq [⊢ X2] [⊢ X4]`). Each consistent
// argument-tuple yields `let [Γ |- R] = thm … in ?` binding a fresh result. For
// the classic single-premise case this reduces to `thm [⊢ D]` on each
// sub-derivation. Returns the `let … in ?` texts. Generate-and-verify: the
// checker rejects an inconsistent tuple, so we can over-propose safely.

// Recurse-via-IH candidates. The IH = the theorem applied to ALL its premises:
// `thm [Γ |- a1] … [Γ |- an]` where the DECREASING premise is filled by a
// structural sub-derivation (a cD metavar from a split, the totality guard) and
// the OTHER premises by in-scope hypotheses whose types are consistent with it
// (shared index vars unify across premises — that pairing is the crux of a
// multi-argument induction like `dl_uniq [⊢ X2] [⊢ X4]`). Each consistent
// argument-tuple yields `let [Γ |- R] = thm … in ?` binding a fresh result. For
// the classic single-premise case this reduces to `thm [⊢ D]` on each
// sub-derivation. Returns the `let … in ?` texts. Generate-and-verify: the
// checker rejects an inconsistent tuple, so we can over-propose safely.

export function recurseTexts(hole, thm, code) {
  if (!thm || !thm.compType) return [];
  const boxes = thm.compType.premises.filter((p) => p.kind === 'box');
  // ⭐ ALL-CTYPE RECURSION. `boxes` is box-only, so a theorem whose argument premises
  // are ALL ctype fell through to `piRecurseTexts`, which needs a Pi binder to pick a
  // decreasing subject — with none it bails and the theorem gets NO recursion at all.
  // `equal#trans : Aeq [g ⊢ E] [g ⊢ F] → Aeq [g ⊢ F] [g ⊢ L] → Aeq [g ⊢ E] [g ⊢ L]` is
  // exactly that shape, and its trace shows the deepest hole offering only fill+split:
  // no IH existed to offer. This is the M1b rule ("a ctype premise IS a premise")
  // reaching `recurseTexts`' entry, the last emitter that still filtered to boxes.
  //
  // Arguments are spelled BARE — a ctype value is a computation expression and must
  // never be boxed (the M3/M4 law). The decreasing slot is restricted to
  // `decSubderivNames`, the totality checker's own criterion, so no call is proposed
  // that the checker would refuse for termination.
  if (!boxes.length && thm.totality) {
    const ctypePrems = thm.compType.premises.filter((p) => p.kind === 'ctype');
    if (ctypePrems.length) {
      const decI2 = decreasingArgIndex(thm);
      const decNames2 = decSubderivNames(code, hole, decI2);
      if (decNames2.size && decI2 >= 0 && decI2 < ctypePrems.length) {
        const headOfPrem = (p) => {
          const a = parseAppType(normalizeCtypeSpelling(String(p.raw || '').trim()));
          return a && a.head;
        };
        const scope = (hole.ctx || []).filter((h) => h && h.name && h.type);
        const perSlot = ctypePrems.map((p, i) => {
          const want = headOfPrem(p);
          const cands = scope.filter((h) => {
            const a = parseAppType(normalizeCtypeSpelling(String(h.type).trim()));
            return a && a.head === want;
          }).map((h) => h.name);
          return i === decI2 ? cands.filter((n) => decNames2.has(n)) : cands.slice(0, 3);
        });
        if (!perSlot.some((l) => !l.length)) {
          const tuples = perSlot.reduce((acc, l) => acc.flatMap((t) => l.map((x) => [...t, x])), [[]]).slice(0, 8);
          const fresh2 = freshForHole(hole, code);
          const out2 = [];
          for (const t of tuples) {
            if (new Set(t).size !== t.length) continue; // a slot may not reuse another's argument
            const call = `${thm.name} ${t.join(' ')}`;
            out2.push(`let ${fresh2()} = ${call} in\n?`);
            out2.push(call);
          }
          if (out2.length) return out2;
        }
      }
    }
  }
  // ⭐ MIXED ctype+box RECURSION. The branch above is gated on `!boxes.length`, so a
  // theorem whose DECREASING premise is a ctype while it ALSO carries box premises
  // matched neither emitter: the box path below picks its decreasing subject with
  // `decreasingBoxIndex` (which is -1 once the measure names a ctype), so it bails
  // and the theorem gets NO induction hypothesis at all. `weak_neut :
  // (g:ctx)(h:ctx) Extends [g] [h] → [g ⊢ neut A[]] → [h ⊢ neut A[]]` with
  // `/ total e (weak_neut g h a e r) /` is exactly that shape — its trace offered
  // fill/intro/invert/split/synth and never one recurse.
  //
  // Same discipline as the all-ctype branch: the decreasing slot is restricted to
  // `decSubderivNames` (the totality checker's own criterion) so no call is proposed
  // that would be refused for termination, and ctype arguments are spelled BARE
  // (M3/M4 — a ctype value is a computation expression, never boxed). A BOX slot is
  // filled from comp-context hypotheses, which already hold contextual objects and
  // so are also passed bare.
  if (boxes.length && thm.totality && !globalThis.__proverNoMixRec) {
    const argPrems = thm.compType.premises.filter((p) => p.kind === 'box' || p.kind === 'ctype');
    const decI3 = decreasingArgIndex(thm);
    if (argPrems[decI3] && argPrems[decI3].kind === 'ctype') {
      const decNames3 = decSubderivNames(code, hole, decI3);
      if (decNames3.size) {
        const scope3 = (hole.ctx || []).filter((h) => h && h.name && h.type);
        const ctypeHead = (t) => {
          const a = parseAppType(normalizeCtypeSpelling(String(t || '').trim()));
          return a && a.head;
        };
        const perSlot3 = argPrems.map((p, i) => {
          if (p.kind === 'ctype') {
            const want = ctypeHead(p.raw);
            const cands = scope3.filter((h) => ctypeHead(h.type) === want).map((h) => h.name);
            return i === decI3 ? cands.filter((n) => decNames3.has(n)) : cands.slice(0, 3);
          }
          const want = premiseDecHead(p.raw, code);
          return scope3
            .filter((h) => String(h.type || '').trim().startsWith('[')
              && premiseDecHead(h.type, code) === want)
            .map((h) => h.name)
            .slice(0, 3);
        });
        if (!perSlot3.some((l) => !l.length)) {
          const tuples3 = perSlot3.reduce((acc, l) => acc.flatMap((t) => l.map((x) => [...t, x])), [[]]).slice(0, 8);
          const fresh3 = freshForHole(hole, code);
          const out3 = [];
          for (const t of tuples3) {
            if (new Set(t).size !== t.length) continue; // a slot may not reuse another's argument
            const call = `${thm.name} ${t.join(' ')}`;
            // The result is UNBOXED into a meta when the conclusion is a box, so a
            // later fill can weaken it into a deeper context (`[h, x:_ ⊢ R[..]]`).
            const rbox = resultBoxFor(thm, null);
            const r3 = fresh3();
            const bound = rbox ? rbox(r3) : r3;
            out3.push(`let ${bound} = ${call} in\n?`);
            out3.push(`let ${r3} = ${call} in\n?`);
            out3.push(call);
          }
          if (out3.length) return out3;
        }
      }
    }
  }
  if (!boxes.length) return piRecurseTexts(hole, thm, code);
  if (!thm.totality) return [];
  // A measure designating a Pi BINDER (`/ total m (f _ m _) /` on a mixed
  // theorem): recursion is by case analysis on that meta, with the box
  // premises passed as extra call arguments — the piRecurseTexts route.
  const desig = measureDesignation(thm);
  if (desig && desig.kind === 'pi') return piRecurseTexts(hole, thm, code);
  const decIdx = decreasingBoxIndex(thm);
  const decHead = premiseDecHead(boxes[decIdx] ? boxes[decIdx].raw : boxes[0].raw, code);
  if (!decHead) return [];

  const all = expandedHypsOf(hole, code);
  const ctxParam = theoremContextParam(thm);
  const rawDecCands = decreasingHyps(hole, thm, decHead, code);
  if (!rawDecCands.length) return [];
  const premHeads = boxes.map((b) => premiseDecHead(b.raw, code));
  // Candidate hypotheses for premise `i`: the decreasing premise is filled by the
  // chosen sub-derivation `dec`; every OTHER premise draws from in-scope hyps of
  // the matching family head — cD metavariables AND comp-context hypotheses
  // (spec §2: a non-decreasing slot may pass an ORIGINAL premise through
  // unchanged, the transitivity shape `trans s1 [⊢ S2']`). Ranked so
  // index-consistent pairings come first.
  const candsFor = (i, dec) => {
    if (i === decIdx) return [dec];
    let cs = ctxParam
      ? all.filter((h) => ihMetaCand(h, premHeads[i]))
      : all.filter((h) => h.where === 'meta' && contextualHead(h.type) === premHeads[i]);
    if (ctxParam?.schema) cs = subderivMetas(cs);
    const comps = all.filter((h) => h.where === 'comp' && h.name !== (dec && dec.name)
      && boxedConclusionHead(h.type) === premHeads[i]);
    return [...rankBySubject(cs, dec), ...comps];
  };

  const fresh = freshName(usedNamesOf(hole));
  const out = [];
  const seen = new Set();

  // Leading EXPLICIT Pi binders take call arguments BEFORE the box premises
  // (spec §2 / D5). Context Pi → its context, extended in parallel with the
  // decreasing argument's extension; substitution Pi `$W : $[h ⊢ g]` →
  // `$[h' ⊢ $W]` pass-through, or `$[h', b… ⊢ $W[..], b…]` when extended.
  // An object Pi mixed with box premises is outside this generator — null bails.
  // ⭐ PER-SLOT UNDERSCORE (the MIXED call spelling). A recursive call passes a
  // SUB-DERIVATION in the decreasing slot, so every Pi binder occurring in the
  // decreasing premise's type is RE-INSTANTIATED by that argument — its new value
  // is a reconstruction-invented term (`N1` in `X1 : mstep N1 M'`) with no source
  // name, so passing the binder through BY NAME is ill-typed. Underscoring ALL
  // slots is equally wrong: a binder that occurs only in the CONCLUSION is
  // determined by nothing and reconstruction reports "Expression is not closed".
  //
  // The law, derived from the theorem's own type (no name branching): a Pi binder
  // OCCURRING IN THE DECREASING PREMISE is solved from the argument → spell `_`;
  // one that does not occur there must be spelled by its in-scope name.
  //
  // Measured on poplmark-reloaded#mstep_appl in the engine's own skeleton
  // (scratchpad/probe-mixed-slot.mjs), `[g⊢mstep M M'] → [g⊢mstep (app M N) (app M' N)]`:
  //   all-named          `f [g|-M] [g|-M'] [g|-N] [g|-X1]` → Ill-typed
  //   all-underscore     `f [g|-_] [g|-_] [g|-_] [g|-X1]`  → Expression is not closed
  //   THIS RULE (M,M' occur in the premise; N does not)
  //                      `f _ _ [g|-N] [g|-X1]`            → PASS
  //   `_` at slot 2 only `f [g|-M] _ [g|-N] [g|-X1]`       → Ill-typed (slot 1 still named)
  // Emitted as a VARIANT ahead of the named spelling, checker-arbitrated (the D3/D11/D14
  // dual-spelling doctrine) so no existing all-box theorem can regress.
  const decIndexNames = () => {
    let raw = (boxes[decIdx] || boxes[0]).raw || '';
    if (raw && !raw.startsWith('[')) raw = `[${raw}]`;
    // boxOf returns { ctx, inner } — the conclusion is `inner`.
    const inner = String((boxOf(raw) || {}).inner || '').trim();
    const names = new Set();
    // Drop the leading FAMILY HEAD: only the index positions are re-instantiated.
    const idx = inner.replace(/^[\p{L}_][\p{L}\p{N}_'-]*/u, '');
    for (const m of idx.matchAll(/[\p{L}_][\p{L}\p{N}_']*/gu)) names.add(m[0]);
    return names;
  };
  const piPrefixCore = (decArgCtx, underscoreDetermined = false) => {
    const prems = thm.compType.premises;
    const determined = underscoreDetermined ? decIndexNames() : null;
    let decRaw = (boxes[decIdx] || boxes[0]).raw || '';
    if (decRaw && !decRaw.startsWith('[')) decRaw = `[${decRaw}]`;
    const decParts = splitCtx(boxOf(decRaw).ctx);
    const decVar = (decParts[0] || '').trim();
    const argParts = splitCtx(decArgCtx || '');
    const suffix = (decVar && argParts[0] && argParts[0].trim() === decVar) ? argParts.slice(1) : [];
    const prefix = [];
    const extOf = new Map(); // ctx binder -> { ctx, names } of its (possibly extended) spelling
    const usedB = [...usedNamesOf(hole)];
    for (const p of prems) {
      if (p.kind === 'box') break;
      if (p.kind === 'ctx') continue; // implicit (g:schema) — no call argument
      const m = /^\{\s*([$#]?[\p{L}_][\p{L}\p{N}_']*)\s*:\s*([\s\S]*)\}$/u.exec(String(p.raw).trim());
      if (!m) return null;
      const vn = m[1];
      const vt = m[2].trim();
      if (vt.startsWith('$')) {
        const dm = /^\$\[\s*([\s\S]*?)\s*(?:\|-|⊢)\s*[\s\S]*\]$/.exec(vt);
        if (!dm) return null;
        const domVar = dm[1].trim();
        const domExt = extOf.get(domVar);
        if (domExt && domExt.names.length) {
          prefix.push(`$[${domExt.ctx} |- ${vn}[..], ${domExt.names.join(', ')}]`);
        } else {
          prefix.push(`$[${(domExt && domExt.ctx) || domVar} |- ${vn}]`);
        }
        continue;
      }
      if (vt.includes('[') || vt.includes('|-') || vt.includes('⊢')) {
        // An OBJECT Pi binder is in scope (intro mlam'd it) — pass it through,
        // spelled in its own declared context (`ceq_plus [ |- N] [ |- D]`), UNLESS
        // the decreasing premise re-instantiates it (see decIndexNames above), in
        // which case only `_` is well-typed.
        const ob = decomposeContextual(vt);
        if (!ob) return null;
        const w = (determined && determined.has(vn)) ? '_' : vn;
        prefix.push(ob.ctx ? `[${ob.ctx} |- ${w}]` : `[ |- ${w}]`);
        continue;
      }
      if (vn === decVar) {
        prefix.push(`[${decArgCtx || vn}]`);
        extOf.set(vn, { ctx: decArgCtx || vn, names: suffix.map((s2) => s2.split(':')[0].trim()) });
      } else if (suffix.length) {
        const renamed = suffix.map((s2) => {
          const ci = s2.indexOf(':');
          const nm2 = freshBlockVarName(usedB);
          usedB.push(nm2);
          return { decl: ci >= 0 ? `${nm2}:${s2.slice(ci + 1).trim()}` : nm2, name: nm2 };
        });
        const ctxTxt = [vn, ...renamed.map((r2) => r2.decl)].join(', ');
        prefix.push(`[${ctxTxt}]`);
        extOf.set(vn, { ctx: ctxTxt, names: renamed.map((r2) => r2.name) });
      } else {
        prefix.push(`[${vn}]`);
        extOf.set(vn, { ctx: vn, names: [] });
      }
    }
    return { prefix, extOf };
  };
  const piPrefixFor = (decArgCtx, underscoreDetermined = false) => {
    const core = piPrefixCore(decArgCtx, underscoreDetermined);
    return core === null ? null : core.prefix;
  };
  const piPrefixExtOf = (decArgCtx) => {
    const core = piPrefixCore(decArgCtx);
    return core === null ? null : core.extOf;
  };
  const withPiPrefix = (decArgCtx, argTexts, underscoreDetermined = false) => {
    const prefix = piPrefixFor(decArgCtx, underscoreDetermined);
    if (prefix === null) return null;
    return `${thm.name} ${[...prefix, ...argTexts].join(' ')}`;
  };
  // Both spellings of one call, MIXED first (it is the well-typed one whenever the
  // decreasing slot holds a sub-derivation; see decIndexNames). Identical strings
  // collapse, so a theorem with no re-instantiated Pi binder is byte-identical to
  // pre-slice — which is why every all-box theorem is unaffected.
  const callVariants = (decArgCtx, argTexts) => {
    const named = withPiPrefix(decArgCtx, argTexts);
    if (globalThis.__proverNoMixedSlot) return [named];
    const mixed = withPiPrefix(decArgCtx, argTexts, true);
    if (globalThis.__mixedSlotDebug) {
      globalThis.__mixedSlotDebug({ determined: [...decIndexNames()], named, mixed });
    }
    return (mixed !== null && mixed !== named) ? [mixed, named] : [named];
  };
  // When the conclusion's OWN context variable was extended in parallel by the
  // Pi prefix (the under-binder arm of a context-morphism theorem), the result
  // binds over the EXTENDED conclusion context with block projections —
  // `let [h, b:block(y:tm, v:oft y _) ⊢ R[.., b.1, b.2]] = wk … in` — so the
  // closing fill can re-lambda it. Returns null when no extension applies.
  const extendedResultBind = (decArgCtx, r) => {
    const prefixInfo = piPrefixExtOf(decArgCtx);
    if (!prefixInfo) return null;
    const conclBox = decomposeContextual(thm.compType.conclusion);
    const conclVar = conclBox && String(conclBox.ctx || '').trim();
    if (!conclVar || conclVar.includes(',')) return null;
    const ext = prefixInfo.get(conclVar);
    if (!ext || !ext.names.length) return null;
    const projs = [];
    for (const n of ext.names) {
      const decl = splitCtx(ext.ctx).find((p2) => p2.split(':')[0].trim() === n);
      const bm = decl && /:\s*block\s*\(?([\s\S]*?)\)?\s*$/.exec(decl);
      if (bm) for (let k = 1; k <= splitCtx(bm[1]).length; k += 1) projs.push(`${n}.${k}`);
      else projs.push(n);
    }
    return `[${ext.ctx} |- ${r}[.., ${projs.join(', ')}]]`;
  };

  // Single-premise theorem: recurse on EVERY decreasing sub-derivation at once (the
  // dual_sym shape: l from Dl, r from Dr → fill from both).
  if (boxes.length === 1) {
    const direct = goalMatchesTheoremConclusion(hole, thm);
    const decs = subderivMetas(rawDecCands, direct, thm);
    // Per dec: the schema-instantiation VARIANTS of its recursion let (`_` first,
    // then each nullary some-var instantiation — they only differ under a block).
    const perDec = [];
    const letSeen = new Set();
    const insts = someInstVariants(thm, code);
    for (const d of decs) {
      const varLets = [];
      for (const someInst of insts) {
        const args = callArgs([d], boxes, thm, code, usedNamesOf(hole), someInst);
        const texts = args.map((a) => a.text);
        const altTexts = args.map((a) => a.alt || a.text);
        const calls = [...callVariants(args[0].ctx, texts)];
        // Comp-arg spelling variant (boxed vs bare) — checker-arbitrated.
        if (altTexts.some((t, k) => t !== texts[k])) calls.push(...callVariants(args[0].ctx, altTexts));
        for (const call of calls) {
          if (call === null || letSeen.has(call)) continue;
          letSeen.add(call);
          if (direct) { out.push(call); continue; }
          // A CTYPE conclusion destructures via its constructor pattern
          // (`let Res [g ⊢ _] [g, x:name ⊢ refl_proc] [g ⊢ R] = str_step … in`).
          const ctypePat = ctypeResultPattern(thm, code, fresh, args[0].ctx);
          if (ctypePat) {
            varLets.push(`let ${ctypePat} = ${call} in`);
            continue;
          }
          const r = fresh();
          // A conclusion-context extension (context-morphism theorems) binds the
          // result over the EXTENDED conclusion context (D5).
          const extBind = extendedResultBind(args[0].ctx, r);
          if (extBind) {
            varLets.push(`let ${extBind} = ${call} in`);
            continue;
          }
          // A block-repackaged call binds its result ANNOTATED with the same
          // projections — declaring it over the raw binder slots so the final fill can
          // re-lambda it (`let [g, b:block (…) |- R[.., b.1, b.2]] = … in … (\y.\hy. R)`).
          const rbox1 = resultBoxFor(thm, args[0].ctx);
          const rctx1 = (decomposeContextual(rbox1('X0')) || {}).ctx || '';
          const projs1 = args[0].resultProjs
            ? (depResultProjs(thm, code, rctx1) || args[0].resultProjs)
            : null;
          const bound = projs1 ? `${r}[.., ${projs1.join(', ')}]` : r;
          varLets.push(`let ${rbox1(bound)} = ${call} in`);
        }
      }
      if (varLets.length) perDec.push(varLets);
    }
    // NEST one let per dec (first variant) with a SINGLE trailing hole —
    // `let R = … in let R1 = … in ?` — never sibling `?`s (which is malformed).
    // The composite leads; each variant follows singly so one bad candidate
    // can't sink the others.
    if (perDec.length) {
      out.push(perDec.map((v) => v[0]).join('\n') + '\n?');
      const singles = perDec.flat();
      if (singles.length > 1) for (const l of singles) out.push(l + '\n?');
    }
    return out;
  }

  // Multi-premise: for each decreasing sub-derivation, ENUMERATE the argument tuples
  // (one candidate per other premise) and propose each — ordered so index-consistent
  // tuples come first. The checker certifies the right pairing; over-propose safely.
  for (const dec of rawDecCands) {
    if (ctxParam?.schema) {
      const sub = subderivMetas(rawDecCands);
      if (sub.length && !sub.includes(dec)) continue;
    }
    const perPremise = boxes.map((_, i) => candsFor(i, dec));
    if (perPremise.some((cs) => !cs.length)) continue;
    for (const tuple of cartesian(perPremise)) {
      const names = tuple.map((a) => a.name);
      if (new Set(names).size !== names.length) continue;
      const key = ctxParam?.var + '|' + thm.name + '|' + names.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      const args = callArgs(tuple, boxes, thm, code, usedNamesOf(hole));
      const decCtx = args[decIdx] ? args[decIdx].ctx : args[0].ctx;
      const texts = args.map((a) => a.text);
      const altTexts = args.map((a) => a.alt || a.text);
      const calls = [...callVariants(decCtx, texts)];
      // Comp-arg spelling variant (boxed vs bare) — checker-arbitrated.
      if (altTexts.some((t, k) => t !== texts[k])) calls.push(...callVariants(decCtx, altTexts));
      for (const call of calls) {
        if (call === null) continue;
        const ctypePat = ctypeResultPattern(thm, code, fresh, decCtx);
        if (ctypePat) {
          out.push(`let ${ctypePat} = ${call} in\n?`);
          continue;
        }
        const extBind = extendedResultBind(decCtx, fresh());
        if (extBind) {
          out.push(`let ${extBind} = ${call} in\n?`);
          continue;
        }
        const rbox = resultBoxFor(thm, decCtx);
        // When the conclusion family reaches only SOME of the result context's
        // block fields, the bound result must carry the dep-filtered projection
        // annotation (`E1[.., b.1, b.4]`); when it reaches all of them the bare
        // binding stands (the eq_trans shape — its tuple fill relies on it).
        const rctx = (decomposeContextual(rbox('X0')) || {}).ctx || '';
        let inner = null;
        if (/:\s*block\b/.test(rctx)) {
          const projs = depResultProjs(thm, code, rctx);
          const total = splitCtx(rctx).reduce((n, p) => {
            const bm = /:\s*block\s*\(?([\s\S]*?)\)?\s*$/.exec(p);
            return n + (bm ? splitCtx(bm[1]).length : 0);
          }, 0);
          if (projs && projs.length < total) inner = `${fresh()}[.., ${projs.join(', ')}]`;
        }
        if (!inner) inner = resultPattern(thm, code, fresh);
        out.push(`let ${rbox(inner)} = ${call} in\n?`);
      }
    }
  }
  return out;
}

// Recursion for a Pi-PREMISE theorem (`rec ref : {g:eqCtx} {U:[g ⊢ exp]} [g ⊢
// eq U U]`): the IH instantiates the Pi binders — the schema Pi gets the
// decreasing argument's (possibly block-extended) context, the boxed Pi gets the
// structural sub-term: `ref [g, e:block (q:exp, _t:eq q q)] [g, e |- L[.., e.1]]`.

// Recursion for a Pi-PREMISE theorem (`rec ref : {g:eqCtx} {U:[g ⊢ exp]} [g ⊢
// eq U U]`): the IH instantiates the Pi binders — the schema Pi gets the
// decreasing argument's (possibly block-extended) context, the boxed Pi gets the
// structural sub-term: `ref [g, e:block (q:exp, _t:eq q q)] [g, e |- L[.., e.1]]`.

// APPLICATIONS of an in-scope HIGHER-ORDER hypothesis concluding in `wantHead`.
// A comp hypothesis may itself be a Pi telescope — `X3 : {M':(h ⊢ tm A[])}
// {S:(h ⊢ step X2 M')} Sn [h ⊢ M']`, the accessibility function bound by an `Acc`
// pattern. It is a RULE, and nothing in the move vocabulary applied it, so the
// idiom stopped one step from the end. Each binder slot is filled by an in-scope
// meta of the matching family, or `_`; the all-`_` spelling is emitted LAST
// because it is the one the checker rejects for leftover metavariables. Bounded
// hard (telescopes are short and this sits inside a cartesian product).
function hoHypApplications(hole, wantHead, code) {
  const out = [];
  const parenBox = (t) => {
    const s = String(t || '').trim();
    const m = /^\(\s*([\s\S]*?)\s*(?:\|-|⊢)\s*([\s\S]*)\)$/.exec(s)
      || /^\[\s*([\s\S]*?)\s*(?:\|-|⊢)\s*([\s\S]*)\]$/.exec(s);
    return m ? { ctx: m[1].trim(), concl: m[2].trim() } : null;
  };
  for (const c of (hole.ctx || [])) {
    if (!c || !c.name || !c.type) continue;
    let s = String(c.type).trim();
    if (s[0] !== '{') continue;
    const binders = [];
    let bad = false;
    while (s[0] === '{') {
      let d = 0;
      let j = 0;
      for (; j < s.length; j += 1) {
        if (s[j] === '{') d += 1;
        else if (s[j] === '}') { d -= 1; if (d === 0) break; }
      }
      if (j >= s.length) { bad = true; break; }
      const inner = s.slice(1, j);
      const ci = inner.indexOf(':');
      if (ci < 0) { bad = true; break; }
      binders.push(inner.slice(ci + 1).trim());
      s = s.slice(j + 1).trim();
      if (binders.length > 4) { bad = true; break; }
    }
    if (bad || !binders.length) continue;
    const concl = parseAppType(normalizeCtypeSpelling(s));
    if (!concl || concl.head !== wantHead) continue;
    const perBinder = binders.map((bt) => {
      const b = parenBox(bt);
      const ctx = b ? b.ctx : '';
      const fam = b ? headOfConclusion(b.concl) : null;
      const named = [];
      for (const m of (hole.meta || [])) {
        if (!m || !m.name || !m.type) continue;
        const mb = parenBox(m.type);
        if (mb && fam && headOfConclusion(mb.concl) === fam) named.push(`[${ctx} |- ${m.name}]`);
      }
      // ONE-CONSTRUCTOR REBUILDS. The accessibility function is routinely applied to a
      // derivation the caller must BUILD, not one already in scope —
      // `r [_ ⊢ _] [_ ⊢ rappr S]` (app_snb/case_snb/case_snc): the bound `S` steps the
      // sub-term, and the slot wants the step of the WHOLE term. So offer, per slot,
      // each constructor of the slot's family that takes exactly ONE argument of that
      // same family, applied to an in-scope meta of it. The `nestedCtorArgFills`
      // limiter: it fires exactly at a rebuild point, never as generic breadth.
      // Checker-arbitrated (2026-07-28, app_snb): with `rappr X5` in this slot and `_`
      // everywhere else the proof is ACCEPTED; with the bare meta it is "Ill-typed".
      const rebuilt = [];
      if (fam && named.length) {
        for (const ctor of enumerateConstructorsTyped(code, fam)) {
          if (!ctor.argTypes || ctor.argTypes.length !== 1) continue;
          const at = String(ctor.argTypes[0]).trim();
          if (/[{\\]/.test(at)) continue; // Pi / higher-order argument — not this shape
          const ab = parenBox(at);
          if (headOfConclusion(ab ? ab.concl : at) !== fam) continue;
          for (const n of named.slice(0, 1)) {
            const inner = /\|-\s*([\s\S]*)\]$/.exec(n);
            if (inner) rebuilt.push(`[${ctx} |- ${ctor.name} ${inner[1].trim()}]`);
          }
        }
      }
      return [...named.slice(0, 2), ...rebuilt.slice(0, 5), `[${ctx} |- _]`];
    });
    // SUPPLY THE DERIVATION, INFER THE INDICES. A telescope's leading slots are the
    // index arguments and its LAST slot is the derivation that determines them, so the
    // shape that checks is `r [_ ⊢ _] … [_ ⊢ <derivation>]` — verified both ways:
    // `X3 [h ⊢ _] [h ⊢ X21]` closes inl_sn, and for app_snb every fully-concrete
    // spelling of the leading slot is "Ill-typed" while the inferred one is accepted.
    // (An earlier cut ranked tuples by fewest underscores and sorted the winning shape
    // out of the cap entirely.) Fully-concrete tuples still follow, capped, as the
    // fallback for telescopes whose indices are not inferable.
    const lastI = perBinder.length - 1;
    const inferredLead = perBinder.map((opts) => opts[opts.length - 1]); // the `_` entry
    for (const cand of perBinder[lastI]) {
      if (cand === inferredLead[lastI]) continue; // all-`_`: leftover metavariables
      const t = inferredLead.slice(0, lastI).concat([cand]);
      out.push(`(${c.name} ${t.join(' ')})`);
    }
    let tuples = [[]];
    for (const opts of perBinder) {
      tuples = tuples.flatMap((t) => opts.map((o) => [...t, o]));
      if (tuples.length > 12) { tuples = tuples.slice(0, 12); break; }
    }
    for (const t of tuples) out.push(`(${c.name} ${t.join(' ')})`);
  }
  // All-`_` applications last: they are the ones that fail "leftover metavariables".
  return [...new Set(out)].slice(0, 10);
}

function piRecurseTexts(hole, thm, code) {
  if (!thm.totality) return [];
  const pis = thm.compType.premises.filter((p) => p.kind === 'pi');
  if (!pis.length) return [];
  const parsed = pis.map((p) => {
    const m = /^\{\s*([$#]?[\p{L}_][\p{L}\p{N}_']*)\s*:\s*([\s\S]*)\}$/u.exec(String(p.raw).trim());
    return m ? { name: m[1], type: m[2].trim() } : null;
  });
  if (parsed.some((p) => !p)) return [];
  // The decreasing subject: the measure's designated Pi when it names one
  // (mixed pi+box theorems route here with desig.kind === 'pi'), else the
  // LAST Pi whose type is a box (the classic no-box pi-recursion shape).
  const desig = measureDesignation(thm);
  let decI = -1;
  if (desig && desig.kind === 'pi' && parsed[desig.piIdx]
    && decomposeContextual(parsed[desig.piIdx].type)) {
    decI = desig.piIdx;
  }
  for (let i = parsed.length - 1; decI < 0 && i >= 0; i -= 1) {
    if (decomposeContextual(parsed[i].type)) { decI = i; break; }
  }
  const decGateOk = decI >= 0;
  // Box premises of a MIXED theorem take call arguments AFTER the Pi args:
  // per premise, in-scope comp hypotheses (bare — the pass-through original
  // premise) and cD metas of the matching family (boxed). Checker-arbitrated;
  // no candidates for some premise ⇒ no emittable call.
  // ARGUMENT premises of a MIXED theorem take call arguments AFTER the Pi args.
  // CTYPE premises count (the M1b rule: a ctype premise IS a premise) — filtering
  // to `box` alone emitted the call with that argument slot simply MISSING, so a
  // theorem whose only premise is `Sn [Γ ⊢ M]` could never be applied to anything
  // (measured on poplmark-reloaded+#inl_sn: `inl_sn [ |- _] [ |- X1]`, two args for
  // a three-argument theorem).
  const boxPrems = thm.compType.premises.filter((p) => p.kind === 'box' || p.kind === 'ctype');
  let boxTuples = [[]];
  if (boxPrems.length) {
    const all = expandedHypsOf(hole, code);
    const perSlot = boxPrems.map((b) => {
      if (b.kind === 'ctype') {
        const want = parseAppType(normalizeCtypeSpelling(String(b.raw || '').trim()));
        const wantHead = want && want.head;
        if (!wantHead) return [];
        // A ctype argument is a COMP value: an in-scope comp hypothesis of that
        // family, bare — plus an APPLICATION of an in-scope higher-order
        // hypothesis concluding in it. The latter is the accessibility idiom's
        // last link (`r [_ ⊢ _] [_ ⊢ S']`): the totality checker accepts the
        // recursion ONLY with that application written INLINE in the argument
        // slot — probed on inl_sn, where binding it to a `let` first is rejected
        // "Recursive call not structurally smaller".
        const bare = all.filter((h) => h.where === 'comp' && !/^\s*\{/.test(String(h.type || ''))
          && (parseAppType(normalizeCtypeSpelling(String(h.type || '').trim())) || {}).head === wantHead)
          .slice(0, 2).map((h) => h.name);
        return [...hoHypApplications(hole, wantHead, code), ...bare].slice(0, 8);
      }
      let raw = b.raw;
      if (raw && !raw.startsWith('[')) raw = `[${raw}]`;
      const head = premiseDecHead(raw, code);
      if (!head) return [];
      const comps = all.filter((h) => h.where === 'comp' && boxedConclusionHead(h.type) === head)
        .slice(0, 2).map((h) => h.name);
      const metas = all.filter((h) => h.where === 'meta' && !h.term && contextualHead(h.type) === head)
        .slice(0, 2).map((h) => `[${boxOf(h.type).ctx} |- ${h.name}]`);
      return [...comps, ...metas];
    });
    if (perSlot.some((l) => !l.length)) return [];
    boxTuples = perSlot.reduce((acc, l) => acc.flatMap((t) => l.map((x) => [...t, x])), [[]]).slice(0, 8);
  }
  const out = [];
  const seen = new Set();
  const fresh = freshForHole(hole, code);
  // CTYPE-SUBJECT RECURSION. When the induction subject is a CTYPE premise rather
  // than a Pi, `decI` above still points at the last box Pi, so the emitted call
  // recurses on the wrong argument (`inl_sn [ |- _] [ |- X1]` — induction on the
  // TYPE `B`). The reference shape leaves every Pi argument inferred and carries
  // the decrease in the argument itself:
  // `inl_sn [_ ⊢ _] [ ⊢ _] (r [_ ⊢ _] [_ ⊢ S'])`, where `r` is the higher-order
  // hypothesis bound by the constructor pattern. Emit exactly that family —
  // additive (the decI-driven calls above are untouched), and only when the
  // ctype slot has a candidate, which `hoHypApplications` bounds hard.
  if (boxPrems.some((p) => p.kind === 'ctype') && boxTuples.length) {
    const inferredPi = parsed.map((p2) => {
      const b = decomposeContextual(p2.type);
      if (!b) return '[]';
      const c = String(b.ctx || '').trim();
      return c ? '[_ |- _]' : '[ |- _]';
    });
    for (const tuple of boxTuples) {
      if (!tuple.some((x) => /^\(/.test(String(x)))) continue; // needs the HO application
      const call = `${thm.name} ${[...inferredPi, ...tuple].join(' ')}`;
      if (seen.has(call)) continue;
      seen.add(call);
      out.push(call);
      out.push(`let ${fresh()} = ${call} in\n?`);
    }
  }
  const decHead = decGateOk ? premiseDecHead(parsed[decI].type, code) : null;
  const rawDecCands = decHead ? decreasingHyps(hole, thm, decHead, code) : [];
  // The decI-driven Pi recursion is skipped when its subject has no candidate in
  // scope — but the ctype-subject calls above are already emitted, so bail to
  // `out`, never to `[]`.
  if (!rawDecCands.length) return out;
  const decs = subderivMetas(rawDecCands, false, thm);
  for (const d of decs) {
    for (const someInst of someInstVariants(thm, code)) {
      const arg = callArgs([d], [{ raw: parsed[decI].type }], thm, code, usedNamesOf(hole), someInst)[0];
      const ctxTxt = arg.ctx || '';
      // Block declarations belong to the FIRST spelling (the context argument);
      // later arguments abbreviate to the block variable.
      const abbrev = splitCtx(ctxTxt)
        .map((p2) => (/:\s*block\b/.test(p2) ? p2.split(':')[0].trim() : p2))
        .join(', ');
      const args = parsed.map((p2, i) => {
        if (i === decI) {
          return ctxTxt === abbrev ? arg.text : arg.text.replace(`[${ctxTxt} |-`, `[${abbrev} |-`);
        }
        if (decomposeContextual(p2.type)) return `[${ctxTxt} |- _]`;
        return ctxTxt ? `[${ctxTxt}]` : '[]';
      });
      for (const tuple of boxTuples) {
        const call = `${thm.name} ${[...args, ...tuple].join(' ')}`;
        if (seen.has(call)) continue;
        seen.add(call);
        // A CTYPE conclusion binds BARE or destructures via its unique
        // constructor (`let ExWkV/c tr = … in`) — never inside a box.
        const conclB = decomposeContextual(thm.compType.conclusion);
        if (!conclB) {
          const head = (String(thm.compType.conclusion).trim().match(/^[\p{L}_][\p{L}\p{N}_']*/u) || [])[0];
          const ctors = head ? enumerateConstructorsTyped(code, head) : [];
          if (ctors.length === 1 && ctors[0].argTypes.length) {
            // Component spellings follow the ctor's own arg raws: an (explicit-
            // Pi or premise) BOX binds `[<its ctx> |- fresh]`; a ctype premise
            // binds bare (`let ExWk/c [h |- M1] tr = … in`, the reference idiom).
            const comps = ctors[0].argTypes.map((at) => {
              let raw = String(at).trim();
              const pm = /^\{\s*[^:]+:\s*([\s\S]*)\}$/.exec(raw);
              if (pm) raw = pm[1].trim();
              // Only a genuine `[Γ ⊢ A]` box binds boxed. A HIGHER-ORDER argument
              // (`({M':[Γ⊢tm A[]]} {S:…} Sn [Γ⊢M'])`, `Acc`'s accessibility
              // function) is a COMP-level value and binds bare — and running it
              // through decomposeContextual split it at its FIRST turnstile, which
              // is inside the nested Pi, emitting the unparseable
              // `[{M':[Γ |- R3]` (measured on poplmark-reloaded+#inl_sn: "Failed
              // to parse (mutual) recursive function declaration(s)").
              const b = raw[0] === '[' ? decomposeContextual(raw) : null;
              return b ? `[${b.ctx || ''} |- ${fresh()}]` : fresh();
            });
            out.push(`let ${ctors[0].name} ${comps.join(' ')} = ${call} in\n?`);
          }
          out.push(`let ${fresh()} = ${call} in\n?`);
          continue;
        }
        const bound = arg.resultProjs ? `${fresh()}[.., ${arg.resultProjs.join(', ')}]` : fresh();
        out.push(`let ${resultBoxFor(thm, ctxTxt)(bound)} = ${call} in\n?`);
      }
    }
  }
  return out;
}

// The last substitution former: a binder-extended meta used in a SHORTER context
// by instantiating its extra slots with in-scope TERMS of matching family —
// `eq_sym [g |- E1[.., N, E2]]` (slot x:exp ← N, slot u:eq x x ← E2). Candidates
// are matched per-slot by type-family head; the checker certifies each tuple.

// The last substitution former: a binder-extended meta used in a SHORTER context
// by instantiating its extra slots with in-scope TERMS of matching family —
// `eq_sym [g |- E1[.., N, E2]]` (slot x:exp ← N, slot u:eq x x ← E2). Candidates
// are matched per-slot by type-family head; the checker certifies each tuple.

function instantiatedVariants(h, premCtx, all, code) {
  if (!h || h.where !== 'meta' || h.term) return [];
  const hp = splitCtx(boxOf(h.type).ctx);
  const pp = splitCtx(premCtx || '');
  if (hp.length <= pp.length) return [];
  for (let i = 0; i < pp.length; i += 1) {
    if (normCtxPart(hp[i]) !== normCtxPart(pp[i])) return [];
  }
  const extras = hp.slice(pp.length);
  if (extras.some((e) => /\bblock\b/.test(e) || !e.includes(':'))) return [];
  const perSlot = extras.map((e) => {
    const ty = e.slice(e.indexOf(':') + 1).trim();
    const nota = typeFamilyHead(ty, code);
    const fh = (nota && nota !== 'type') ? nota : headOfConclusion(ty);
    if (!fh) return [];
    return all.filter((s) => s !== h && s.where === 'meta' && !s.term
      && normCtxPart(boxOf(s.type).ctx) === normCtxPart(premCtx || '')
      && contextualHead(s.type) === fh)
      .slice(0, 3)
      .map((s) => s.name);
  });
  if (perSlot.some((l) => !l.length)) return [];
  const out = [];
  for (const tuple of cartesian(perSlot).slice(0, 4)) {
    out.push({
      name: h.name,
      where: 'meta',
      term: `${h.name}[.., ${tuple.join(', ')}]`,
      type: premCtx ? `[${premCtx} |- ${conclusionOf(h.type)}]` : `[ |- ${conclusionOf(h.type)}]`,
    });
  }
  return out;
}


export function supportLemmaTexts(hole, currentThm, code) {
  const goal = decomposeContextual(hole && hole.goal);
  if (!goal) return [];
  const goalHead = headOfConclusion(goal.concl);
  if (!goalHead) return [];
  const all = expandedHypsOf(hole, code);
  const fresh = freshForHole(hole, code);
  const out = [];
  const seen = new Set();
  const thmIdx = theoremIndex(code);
  for (const lemma of thmIdx) {
    if (!lemma || !lemma.compType || (currentThm && lemma.name === currentThm.name)) continue;
    if (!theoremInScope(lemma, currentThm, thmIdx)) continue; // sequential signature
    const conclHead = boxedConclusionHead(lemma.compType.conclusion);
    if (conclHead !== goalHead) continue;
    const boxes = lemma.compType.premises.filter((p) => p.kind === 'box');
    if (!boxes.length) continue;
    const perPremise = boxes.map((b) => {
      let raw2 = b.raw;
      if (raw2 && !raw2.startsWith('[')) raw2 = `[${raw2}]`;
      const pc = boxOf(raw2).ctx;
      const pHead2 = premiseDecHead(b.raw, code);
      const bas = all.filter((h) => contextualHead(h.type) === pHead2);
      const ext = [];
      for (const h of bas) ext.push(...instantiatedVariants(h, pc, all, code));
      return [...bas, ...ext];
    });
    if (perPremise.some((cs) => !cs.length)) continue;
    const goalBox = (inner) => (goal.ctx ? `[${goal.ctx} |- ${inner}]` : `[ |- ${inner}]`);
    for (const tuple of cartesian(perPremise)) {
      const args = tuple.map((h) => {
        const b = boxOf(h.type);
        const box = (inner) => (b.ctx ? `[${b.ctx} |- ${inner}]` : `[ |- ${inner}]`);
        return box(termOf(h));
      });
      // Comp-hypothesis spelling variant: a true fn-bound premise passes BARE
      // (`lem6 [ |- Pd] cq`); provenance is unrecoverable, checker arbitrates
      // (spec §2 / D3 — same discipline as IH calls).
      const altArgs = tuple.map((h, ti) => (h.where === 'comp' ? h.name : args[ti]));
      const calls = [`${lemma.name} ${args.join(' ')}`];
      if (altArgs.some((t, k) => t !== args[k])) calls.push(`${lemma.name} ${altArgs.join(' ')}`);
      for (const call of calls) {
        const key = lemma.name + '|' + call + '|' + goal.ctx;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name: lemma.name, text: `let ${goalBox(resultPattern(lemma, code, fresh))} = ${call} in\n?` });
      }
    }
  }
  return out;
}

// The index of a decl's BODY `=`: the first standalone `=` TOKEN at bracket
// depth 0 from `from` (comment-skipping); -1 when the decl ends (`;`) first.
// Beluga identifiers may CONTAIN or END WITH `=` (church-rosser's `pred=`
// family, 2026-07-12) and an infix `=` type lives inside boxes at depth > 0 —
// a lazy first-`=` regex truncates the type mid-identifier in both cases.

// The comp-LET pattern destructuring a CTYPE result: the conclusion family's
// unique constructor applied to one boxed pattern per argument — a boxed Pi gets
// the wildcard witness (`Res [g ⊢ _] …`), a premise whose family has a unique
// NULLARY constructor gets it (`[g, x:name ⊢ refl_proc]` — the ctype analog of
// the `let [⊢ refl] = …` refinement), anything else binds a fresh metavar.
// Contexts are the constructor's declared ones with the lemma's context variable
// instantiated the way the decreasing argument instantiates it. Null when the
// conclusion isn't a single-constructor ctype of this shape.

function ctypeResultPattern(lemma, code, fresh, decArgCtx) {
  const concl = (lemma && lemma.compType && lemma.compType.conclusion) || '';
  if (decomposeContextual(concl)) return null; // boxed conclusion — not a ctype
  const head = headOfConclusion(concl);
  if (!head || !isCTypeFamily(code, head)) return null;
  const ctors = enumerateConstructorsTyped(code, head);
  if (ctors.length !== 1) return null;
  const ctor = ctors[0];
  const ctxParam = theoremContextParam(lemma);
  let inst = ctxParam ? ctxParam.var : null;
  if (ctxParam && decArgCtx) {
    const boxes = lemma.compType.premises.filter((p) => p.kind === 'box');
    const decIdx = decreasingBoxIndex(lemma);
    let raw = (boxes[decIdx] || boxes[0] || {}).raw || '';
    if (raw && !raw.startsWith('[')) raw = `[${raw}]`;
    const tail = Math.max(0, splitCtx(boxOf(raw).ctx).length - 1);
    const parts = splitCtx(decArgCtx);
    if (parts.length > tail) inst = parts.slice(0, parts.length - tail).join(', ');
  }
  const instCtx = (declCtx) => {
    if (!ctxParam || !inst) return declCtx;
    const parts = splitCtx(declCtx);
    if (parts.length && parts[0] === ctxParam.var) return [inst, ...parts.slice(1)].join(', ');
    return declCtx;
  };
  const args = [];
  for (const at of ctor.argTypes) {
    const t = String(at).trim();
    const pim = t.startsWith('{') ? /^\{\s*[\p{L}_][\p{L}\p{N}_']*\s*:\s*([\s\S]*)\}$/u.exec(t) : null;
    const boxT = decomposeContextual(pim ? pim[1].trim() : t);
    if (!boxT) return null; // a non-boxed ctype argument — not this shape
    const bctx = instCtx(boxT.ctx);
    const wrap = (inner) => (bctx ? `[${bctx} |- ${inner}]` : `[ |- ${inner}]`);
    if (pim) {
      // In a block-instantiated context the existential witness must carry its
      // dependency RESTRICTION — the checker rejects a bare `_` ("requires that
      // some metavariables are further restricted"). Keep only the projections of
      // block fields whose type-head the witness's family can reach
      // (`Q'[.., b.1]`: a proc may mention the name field, never the hyp).
      const blockDecls = splitCtx(bctx).filter((p) => /\bblock\b/.test(p));
      if (blockDecls.length) {
        const nota2 = typeFamilyHead(boxT.concl, code);
        const fam2 = (nota2 && nota2 !== 'type') ? nota2 : headOfConclusion(boxT.concl);
        const reach = fam2 ? reachableTypeHeads(code, fam2) : new Set();
        const projs = [];
        for (const bd of blockDecls) {
          const bv = bd.slice(0, bd.indexOf(':')).trim();
          const bi = bd.indexOf('block');
          let rest = bd.slice(bi + 5).trim();
          if (rest[0] === '(') {
            const close = rest.lastIndexOf(')');
            rest = rest.slice(1, close < 0 ? rest.length : close);
          }
          splitCtx(rest).forEach((f, k) => {
            const fh = headOfConclusion(f.slice(f.indexOf(':') + 1));
            if (fh && reach.has(fh)) projs.push(`${bv}.${k + 1}`);
          });
        }
        args.push(wrap(`${fresh()}[..${projs.length ? ', ' + projs.join(', ') : ''}]`));
        continue;
      }
      args.push(wrap('_'));
      continue;
    }
    const nota = typeFamilyHead(boxT.concl, code);
    const fam = (nota && nota !== 'type') ? nota : headOfConclusion(boxT.concl);
    const famCtors = fam ? enumerateConstructorsTyped(code, fam) : [];
    if (famCtors.length === 1 && !famCtors[0].argTypes.length) {
      args.push(wrap(famCtors[0].name));
      continue;
    }
    args.push(wrap(fresh()));
  }
  return `${ctor.name} ${args.join(' ')}`;
}

// The `let`-pattern for binding the IH result. When the theorem's conclusion
// family has a UNIQUE constructor (e.g. `eq` has only `refl`), bind the result
// with THAT constructor's pattern — this REFINES the result's index variables
// (the `let [⊢ refl] = … in` idiom that unifies the two sides), which is what
// makes the outer goal provable. Otherwise bind a fresh result var.

// The `let`-pattern for binding the IH result. When the theorem's conclusion
// family has a UNIQUE constructor (e.g. `eq` has only `refl`), bind the result
// with THAT constructor's pattern — this REFINES the result's index variables
// (the `let [⊢ refl] = … in` idiom that unifies the two sides), which is what
// makes the outer goal provable. Otherwise bind a fresh result var.

function resultPattern(thm, code, fresh) {
  const concl = thm.compType && thm.compType.conclusion;
  const head = concl ? boxedConclusionHead(concl) : null;
  if (head) {
    const ctors = enumerateConstructorsTyped(code, head);
    if (ctors.length === 1) {
      const c = ctors[0];
      return c.argTypes.length ? `${c.name} ${c.argTypes.map(() => fresh()).join(' ')}` : c.name;
    }
  }
  return fresh();
}

// Order candidate hypotheses for a premise so those SHARING the subject (first)
// index with the decreasing arg come first — the consistent pairing in a
// uniqueness-style lemma (`dl_uniq [⊢ X2] [⊢ X4]`: X2, X4 share the left subtype).

// Order candidate hypotheses for a premise so those SHARING the subject (first)
// index with the decreasing arg come first — the consistent pairing in a
// uniqueness-style lemma (`dl_uniq [⊢ X2] [⊢ X4]`: X2, X4 share the left subtype).

function rankBySubject(cands, dec) {
  const decFirst = firstIndexOf(dec.type);
  return [...cands].sort((a, b) => {
    const sa = firstIndexOf(a.type) === decFirst ? 0 : 1;
    const sb = firstIndexOf(b.type) === decFirst ? 0 : 1;
    return sa - sb;
  });
}

// The first applied index of a boxed type's conclusion ("dl A B" → "A").

// The first applied index of a boxed type's conclusion ("dl A B" → "A").

function firstIndexOf(typeStr) {
  const concl = boxOf(typeStr).inner;
  const toks = String(concl).trim().split(/\s+/);
  return toks.length > 1 ? toks[1] : null;
}

// Cartesian product of arrays-of-candidates (bounded — premise counts are small).

// Cartesian product of arrays-of-candidates (bounded — premise counts are small).

function cartesian(lists) {
  return lists.reduce((acc, list) => {
    const next = [];
    for (const combo of acc) for (const item of list) next.push([...combo, item]);
    return next;
  }, [[]]);
}

// All hypotheses available at a hole — meta-context (cD) AND computation context
// (cG) — each tagged with `where` so callers can apply context-specific rules
// (e.g. the IH structural guard requires the sub-derivation be a cD metavar).

// Apply a support lemma that TRANSFORMS the goal — a lemma whose conclusion head
// DIFFERS from the goal head, so its result is a new hypothesis a later move
// consumes (`let [Γ |- R] = lemma [Γ |- h] … in ?`). General: matched purely by
// conclusion/premise family heads against in-scope hypotheses; the checker certifies
// the pairing. (Same-head lemmas that CLOSE the goal are supportLemmaTexts.)

export function helperLemmaTexts(hole, currentThm, code) {
  let goal = decomposeContextual(hole && hole.goal);
  let goalIsCType = false;
  if (!goal) {
    // An UNBOXED computation-type goal (`Result [g |- P] …`) has no context of
    // its own; the context gate below is meaningless for it.
    const raw = String((hole && hole.goal) || '').trim();
    const h0 = headOfConclusion(raw);
    if (!h0 || !isCTypeFamily(code, h0)) return [];
    goal = { ctx: '', concl: raw };
    goalIsCType = true;
  }
  const goalHead = headOfConclusion(goal.concl);
  if (!goalHead) return [];
  const all = expandedHypsOf(hole, code);
  const fresh = freshForHole(hole, code);
  const out = [];
  const seen = new Set();
  const thmIdx = theoremIndex(code);
  for (const lemma of thmIdx) {
    if (!lemma || !lemma.compType || (currentThm && lemma.name === currentThm.name)) continue;
    if (!theoremInScope(lemma, currentThm, thmIdx)) continue; // sequential signature
    const conclHead = boxedConclusionHead(lemma.compType.conclusion);
    if (!conclHead || conclHead === goalHead) continue;
    const lemGoal = decomposeContextual(lemma.compType.conclusion);
    // A CTYPE-conclusion lemma (unboxed) has no context to compare — admit it; a
    // boxed conclusion must share at least the goal's context VARIABLE (a result
    // in an EXTENDED context is still consumable under a binder in the fill).
    // Against a ctype GOAL the context gate is meaningless — skip it.
    if (!goalIsCType && lemGoal && normCtxPart(lemGoal.ctx) !== normCtxPart(goal.ctx)
      && leadCtxVar(lemGoal.ctx) !== leadCtxVar(goal.ctx)) continue;
    if (!lemGoal && !isCTypeFamily(code, conclHead)) continue;
    const boxes = lemma.compType.premises.filter((p) => p.kind === 'box');
    if (!boxes.length) continue;
    const perPremise = boxes.map((b) => {
      let raw = b.raw;
      if (raw && !raw.startsWith('[')) raw = `[${raw}]`;
      const premParts = splitCtx(boxOf(raw).ctx).length;
      const pHead = premiseDecHead(b.raw, code);
      const bas = all.filter((h) => {
        if (contextualHead(h.type) !== pHead) return false;
        const hp = splitCtx(boxOf(h.type).ctx);
        // an argument already SHORTER than the premise context is already
        // strengthened — unless its trailing BLOCK packs the premise's binders
        if (hp.length >= premParts) return true;
        return /\bblock\b/.test(hp[hp.length - 1] || '');
      });
      const pc = boxOf(raw).ctx;
      const ext = [];
      for (const h of all) {
        if (contextualHead(h.type) !== pHead) continue;
        ext.push(...instantiatedVariants(h, pc, all, code));
      }
      return [...bas, ...ext];
    });
    if (perPremise.some((cs) => !cs.length)) continue;
    const decI = decreasingBoxIndex(lemma);
    const usedN = usedNamesOf(hole);
    for (const tuple of cartesian(perPremise)) {
      const args = tuple.map((h, ti) => {
        const b = boxOf(h.type);
        // Block-slot EXPANSION: the premise declares raw binders that the
        // hypothesis' trailing block packs — call with fresh binder declarations
        // and the block slot substituted by the tuple (the str_step' idiom
        // `s_P1'[.., <y;hy>]`).
        let praw = boxes[ti].raw;
        if (praw && !praw.startsWith('[')) praw = `[${praw}]`;
        const premTail = splitCtx(boxOf(praw).ctx).slice(1);
        const hParts = splitCtx(b.ctx);
        const lastPart = hParts[hParts.length - 1] || '';
        const bm = /^([\p{L}_][\p{L}\p{N}_']*)\s*:\s*block\s*\(?([\s\S]*?)\)?\s*$/u.exec(lastPart);
        if (bm && premTail.length >= 2) {
          const fields = splitCtx(bm[2]);
          const fHeads = fields.map((p) => headOfConclusion(p.slice(p.indexOf(':') + 1)));
          const pHeads = premTail.map((p) => headOfConclusion(p.slice(p.indexOf(':') + 1)));
          if (fields.length === premTail.length && fHeads.every((x, k) => x && x === pHeads[k])) {
            const names = [];
            const decls = fields.map((f, k) => {
              const colon = f.indexOf(':');
              const fn = f.slice(0, colon).trim();
              let ft = f.slice(colon + 1).trim();
              for (let q = 0; q < k; q += 1) {
                const prev = fields[q].slice(0, fields[q].indexOf(':')).trim();
                const esc = prev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                ft = ft.replace(new RegExp(`(^|[^\\p{L}\\p{N}_'])${esc}(?![\\p{L}\\p{N}_'])`, 'gu'), `$1${names[q]}`);
              }
              let nm = fn;
              let k2 = 0;
              while (usedN.includes(nm) || names.includes(nm)) { k2 += 1; nm = fn + k2; }
              names.push(nm);
              return `${nm}:${ft}`;
            });
            const ext = [...hParts.slice(0, -1), ...decls].join(', ');
            return { text: `[${ext} |- ${h.name}[.., <${names.join(';')}>]]`, ctx: ext };
          }
        }
        return { text: b.ctx ? `[${b.ctx} |- ${termOf(h)}]` : `[ |- ${termOf(h)}]`, ctx: b.ctx };
      });
      const key = lemma.name + '|' + args.map((a) => a.text).join('|') + '|' + goal.ctx;
      if (seen.has(key)) continue;
      seen.add(key);
      // A COMP hypothesis in a tuple slot has two possible spellings (boxed for a
      // pattern-bound sub-derivation, BARE for a true fn-bound premise variable —
      // `reassoc [ |- P] q`); provenance is not syntactically recoverable, so both
      // variant calls are proposed and the checker arbitrates (spec §2 / D3).
      const texts = args.map((a) => a.text);
      const altTexts = args.map((a, ti) => (tuple[ti] && tuple[ti].where === 'comp' ? tuple[ti].name : a.text));
      const calls = [`${lemma.name} ${texts.join(' ')}`];
      if (altTexts.some((t, k) => t !== texts[k])) calls.push(`${lemma.name} ${altTexts.join(' ')}`);
      // Bind the result in the lemma's conclusion context INSTANTIATED the way the
      // decreasing argument instantiates it (a strengthening lemma called at
      // `[g, x:name, z:name |- X]` yields its result in `[g, x:name |- R]`); a
      // CTYPE conclusion destructures via its constructor pattern instead.
      const decCtx = (args[decI] || args[0]).ctx;
      for (const call of calls) {
        const ctypePat = ctypeResultPattern(lemma, code, fresh, decCtx);
        const lhs = ctypePat || resultBoxFor(lemma, decCtx)(fresh());
        out.push({ name: lemma.name, text: `let ${lhs} = ${call} in\n?` });
      }
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// True when the hole's goal is exactly the theorem's own conclusion — then the IH
// applied to a sub-derivation INHABITS the goal directly (a bare `thm arg`, no
// result-binding `let` needed). General: matched by conclusion family head, and only
// when the conclusion carries no index arguments that would need to be unified via a
// binding pattern (a bare family like `imposs`, or a fully-parametric result).

export function goalMatchesTheoremConclusion(hole, thm) {
  if (!hole || !thm || !thm.compType) return false;
  const g = decomposeContextual(hole.goal);
  if (!g) return false;
  const gh = headOfConclusion(g.concl);
  const th = boxedConclusionHead(thm.compType.conclusion);
  if (!gh || !th || gh !== th) return false;
  // Direct inhabitation is sound when the conclusion has no index arguments to
  // reconcile (head alone determines it); otherwise we must bind + refine via `let`.
  const conclInner = boxOf(thm.compType.conclusion).inner;
  return String(conclInner).trim().split(/\s+/).length === 1;
}


export function ihDirectCallTexts(hole, thm, code) {
  if (!goalMatchesTheoremConclusion(hole, thm)) return [];
  return recurseTexts(hole, thm, code).filter((t) => !t.includes('let ') && !t.includes('?'));
}


function eraseSomeVars(typeText, someVars, inst = '_') {
  let out = String(typeText || '');
  for (const v of someVars) {
    const esc = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(^|[^\\p{L}\\p{N}_'])${esc}(?![\\p{L}\\p{N}_'])`, 'gu'), (mm, p1) => p1 + inst);
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Candidate instantiations for the schema's `some`-bound variable when a block is
// re-declared at an IH call site: `_` first (the checker infers it when the call
// determines it), then each NULLARY constructor of the variable's type — a
// restriction channel's `hyp x ⊥` is not inferable from the call site, only
// certifiable (the β∥ shape: "Expression is not closed" under `_`).

// Candidate instantiations for the schema's `some`-bound variable when a block is
// re-declared at an IH call site: `_` first (the checker infers it when the call
// determines it), then each NULLARY constructor of the variable's type — a
// restriction channel's `hyp x ⊥` is not inferable from the call site, only
// certifiable (the β∥ shape: "Expression is not closed" under `_`).

function someInstVariants(thm, code) {
  const ctxParam = theoremContextParam(thm);
  if (!ctxParam || !ctxParam.schema) return [null];
  const esc = String(ctxParam.schema).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Comment-stripped for the same reason as schemaSomeVars (commented-out
  // alternative schema declarations must not be scanned as real).
  const m = new RegExp(`schema\\s+${esc}\\s*=\\s*some\\s*\\[([^\\]]*)\\]`).exec(stripLfComments(code));
  if (!m) return [null];
  const first = m[1].split(',')[0] || '';
  const ty = first.includes(':') ? first.slice(first.indexOf(':') + 1).trim() : '';
  if (!ty) return [null];
  const out = [null];
  for (const c of enumerateConstructorsTyped(code, headOfConclusion(ty))) {
    if (!c.argTypes.length) out.push(c.name);
  }
  return out.slice(0, 5);
}

// Repackage a hypothesis' RAW context extension as the theorem-schema's BLOCK, for
// an IH call under a binder. A sub-derivation a split/inversion exposed under
// binders lives in `(g, x:tm, u:oft x A[..] |- …)`; under a block schema that raw
// extension is ill-formed at a call site (the checker's "free meta-variable is
// illegal"), so the schema-conformant call extends the context with the block whose
// fields align positionally with the extra binders BY TYPE-FAMILY HEAD and
// substitutes each binder by the positional projection — the unique3 idiom
// `[g, b:block (x:exp, u:type_of x _) |- D[.., b.1, b.2]]`. All read from the
// schema/AST; returns { premCtx, fieldsTxt, arity } or null (no aligned block).

// Repackage a hypothesis' RAW context extension as the theorem-schema's BLOCK, for
// an IH call under a binder. A sub-derivation a split/inversion exposed under
// binders lives in `(g, x:tm, u:oft x A[..] |- …)`; under a block schema that raw
// extension is ill-formed at a call site (the checker's "free meta-variable is
// illegal"), so the schema-conformant call extends the context with the block whose
// fields align positionally with the extra binders BY TYPE-FAMILY HEAD and
// substitutes each binder by the positional projection — the unique3 idiom
// `[g, b:block (x:exp, u:type_of x _) |- D[.., b.1, b.2]]`. All read from the
// schema/AST; returns { premCtx, fieldsTxt, arity } or null (no aligned block).

function blockRepackaging(h, premCtx, thm, code) {
  if (!h || h.where !== 'meta') return null;
  const hctx = boxOf(h.type).ctx;
  if (!hctx) return null;
  const hp = splitCtx(hctx);
  const pp = splitCtx(premCtx);
  if (hp.length <= pp.length) return null;
  for (let i = 0; i < pp.length; i += 1) {
    if (normCtxPart(hp[i]) !== normCtxPart(pp[i])) return null;
  }
  const extras = hp.slice(pp.length);
  if (extras.some((e) => /\bblock\b/.test(e))) return null;
  const ctxParam = theoremContextParam(thm);
  if (!ctxParam || !ctxParam.schema) return null;
  const info = schemaInfo(code, ctxParam.schema);
  const someVars = schemaSomeVars(code, ctxParam.schema);
  const heads = extras.map((e) => {
    const colon = e.indexOf(':');
    return colon >= 0 ? headOfConclusion(e.slice(colon + 1).trim()) : null;
  });
  for (const el of (info.elements || [])) {
    // full alignment, or the extras matching a field PREFIX (a lone `x:exp` under
    // `block (x:exp, _t:eq x x)` projects only `b.1` — the eq-proof ref shape).
    if (!el.block || !el.fields || el.fields.length < extras.length) continue;
    if (!heads.every((hd, i) => hd && el.fields[i] && el.fields[i].head === hd && el.fields[i].name)) continue;
    const fieldsTxt = el.fields
      .map((f) => `${f.name}:${eraseSomeVars(f.type || f.head, someVars)}`)
      .join(', ');
    return { premCtx, fieldsTxt, arity: extras.length };
  }
  return null;
}


function freshBlockVarName(used) {
  const taken = new Set(used || []);
  let i = 0;
  let n = 'b';
  while (taken.has(n)) { i += 1; n = 'b' + i; }
  return n;
}

// Dependency-filtered RESULT projections: a result bound over a block-extended
// context may only depend on the fields its CONCLUSION family can reach
// (`E1[.., b.1, b.4]` — an eq result sees the exp and eq fields of a 4-field
// eval block, never eval/notLam). Enumerated from the RESULT context's block
// declarations; null when no block or nothing reachable.

// Dependency-filtered RESULT projections: a result bound over a block-extended
// context may only depend on the fields its CONCLUSION family can reach
// (`E1[.., b.1, b.4]` — an eq result sees the exp and eq fields of a 4-field
// eval block, never eval/notLam). Enumerated from the RESULT context's block
// declarations; null when no block or nothing reachable.

function depResultProjs(thm, code, resultCtx) {
  const conclRaw = (thm && thm.compType && thm.compType.conclusion) || '';
  const d = decomposeContextual(conclRaw);
  const c = d ? d.concl : conclRaw;
  const nota = typeFamilyHead(c, code);
  const fam = (nota && nota !== 'type') ? nota : headOfConclusion(c);
  if (!fam) return null;
  const reach = reachableTypeHeads(code, fam);
  const out = [];
  for (const p of splitCtx(resultCtx || '')) {
    const bm = /^([\p{L}_][\p{L}\p{N}_']*)\s*:\s*block\s*\(?([\s\S]*?)\)?\s*$/u.exec(p);
    if (!bm) continue;
    splitCtx(bm[2]).forEach((f, k) => {
      const fh = headOfConclusion(f.slice(f.indexOf(':') + 1));
      if (fh && reach.has(fh)) out.push(`${bm[1]}.${k + 1}`);
    });
  }
  return out.length ? out : null;
}

// Segment a run of pattern binders into consecutive SCHEMA BLOCKS by type-family
// head (a 4-binder run [name, hyp, name, hyp] under `block (x:name, h:hyp x A)` is
// TWO blocks — the wtp_inp shape). Null when the binders don't tile into blocks.

// Segment a run of pattern binders into consecutive SCHEMA BLOCKS by type-family
// head (a 4-binder run [name, hyp, name, hyp] under `block (x:name, h:hyp x A)` is
// TWO blocks — the wtp_inp shape). Null when the binders don't tile into blocks.

function schemaChunks(binderCtx, thm, code, someInst = null) {
  const ctxParam = theoremContextParam(thm);
  if (!ctxParam || !ctxParam.schema) return null;
  const info = schemaInfo(code, ctxParam.schema);
  const someVars = schemaSomeVars(code, ctxParam.schema);
  const blocks = (info.elements || []).filter((el) => el.block && el.fields && el.fields.length
    && el.fields.every((f) => f.name && f.head));
  if (!blocks.length) return null;
  const chunks = [];
  let i = 0;
  while (i < binderCtx.length) {
    // Greedy: prefer a FULL block match, else a block whose field PREFIX matches
    // the remaining binders (a lone `y:name` under `block (x:name, h:hyp x A)`
    // consumes the block projecting only `b.1` — the str_step β∥ shape).
    let el = blocks.find((b) => b.fields.length <= binderCtx.length - i
      && b.fields.every((f, k) => headOfConclusion(binderCtx[i + k].type) === f.head));
    let used = el ? el.fields.length : 0;
    if (!el) {
      const left = binderCtx.length - i;
      el = blocks.find((b) => b.fields.length > left
        && b.fields.slice(0, left).every((f, k) => headOfConclusion(binderCtx[i + k].type) === f.head));
      used = left;
    }
    if (!el) return null;
    chunks.push({
      fieldsTxt: el.fields.map((f) => `${f.name}:${eraseSomeVars(f.type || f.head, someVars, someInst || '_')}`).join(', '),
      arity: used,
    });
    i += used;
  }
  return chunks;
}

// The IH-call arguments for a tuple of hypotheses (tuple[i] fills premise i), each
// as { text, ctx }. A hypothesis whose context raw-extends its premise's context
// under a block schema is repackaged via blockRepackaging, sharing ONE block binder
// per block shape across the call (the reference idiom: the first argument spells
// `g, b:block (…)`, later ones abbreviate `g, b`). A pattern metavar seen UNDER
// `\`-binders (annotated `X[.., y, x]`) re-binds those binders as context
// declarations inserted after the context variable, before the branch tail —
// matching the annotation's slot order — and references the metavar bare:
// `str_lin [g, y:name, x:name |- X]` (the reference strengthening idiom).

// The IH-call arguments for a tuple of hypotheses (tuple[i] fills premise i), each
// as { text, ctx }. A hypothesis whose context raw-extends its premise's context
// under a block schema is repackaged via blockRepackaging, sharing ONE block binder
// per block shape across the call (the reference idiom: the first argument spells
// `g, b:block (…)`, later ones abbreviate `g, b`). A pattern metavar seen UNDER
// `\`-binders (annotated `X[.., y, x]`) re-binds those binders as context
// declarations inserted after the context variable, before the branch tail —
// matching the annotation's slot order — and references the metavar bare:
// `str_lin [g, y:name, x:name |- X]` (the reference strengthening idiom).

function callArgs(tuple, boxes, thm, code, used, someInst = null) {
  const vars = new Map();
  return tuple.map((h, i) => {
    let raw = (boxes[Math.min(i, boxes.length - 1)] || {}).raw || '';
    if (raw && !raw.startsWith('[')) raw = `[${raw}]`;
    const plan = blockRepackaging(h, boxOf(raw).ctx, thm, code);
    if (plan) {
      let bv = vars.get(plan.fieldsTxt);
      const first = !bv;
      if (!bv) {
        bv = freshBlockVarName([...(used || []), ...vars.values()]);
        vars.set(plan.fieldsTxt, bv);
      }
      const projs = Array.from({ length: plan.arity }, (_, k) => `${bv}.${k + 1}`).join(', ');
      const ctxTxt = first
        ? `${plan.premCtx}, ${bv}:block (${plan.fieldsTxt})`
        : `${plan.premCtx}, ${bv}`;
      return { text: `[${ctxTxt} |- ${h.name}[.., ${projs}]]`, ctx: ctxTxt };
    }
    if (h.where === 'meta' && h.underBinder && Array.isArray(h.binderCtx) && h.binderCtx.length) {
      const base = splitCtx(boxOf(h.type).ctx);
      if (base.length) {
        // Under a BLOCK schema the binders must be repackaged as blocks inserted
        // before the strengthened tail, with the metavar substituted by the
        // projections then the tail (the cp str_wtp idiom:
        // `[g, b:block (x:name, h:hyp x _), z:name, hz:hyp z C[] |- X[.., b.1, b.2, z, hz]]`).
        const chunks = schemaChunks(h.binderCtx, thm, code, someInst);
        if (chunks) {
          const decls = [];
          const projs = [];
          for (const ch of chunks) {
            const bv = freshBlockVarName([...(used || []), ...vars.values(), ...decls.map((d) => d.split(':')[0])]);
            decls.push(`${bv}:block (${ch.fieldsTxt})`);
            for (let k = 1; k <= ch.arity; k += 1) projs.push(`${bv}.${k}`);
          }
          const tailNames = base.slice(1).map((p) => p.split(':')[0].trim());
          const ext = [base[0], ...decls, ...base.slice(1)].join(', ');
          const suffix = [...projs, ...tailNames].join(', ');
          return { text: `[${ext} |- ${h.name}[.., ${suffix}]]`, ctx: ext, resultProjs: projs };
        }
        // Bare schema: raw binder declarations in annotation-slot order, metavar bare.
        const ext = [base[0], ...h.binderCtx.map((b) => `${b.name}:${b.type}`), ...base.slice(1)].join(', ');
        return { text: `[${ext} |- ${h.name}]`, ctx: ext };
      }
    }
    // A comp-context hypothesis has TWO possible spellings: boxed (a
    // pattern-bound sub-derivation reported in the comp context) or BARE (a true
    // fn-bound computation variable — `trans s1 [⊢ S2']`). The syntactic model
    // cannot distinguish provenance, so both variants are proposed and the
    // checker arbitrates (generate-and-verify; a wrong spelling merely rejects).
    return {
      text: premiseBoxArg(h, thm, code),
      ctx: boxOf(h.type).ctx,
      alt: h.where === 'comp' ? h.name : undefined,
    };
  });
}

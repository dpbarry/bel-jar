// Ordered move vocabulary for one hole + sound syntactic prefilter.
// Collects emitters, demand/vacuous tagging, plan fills, domination marking,
// and ranking. Does not run the Beluga search loop.

import {
  decomposeContextual,
  headOfConclusion,
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
  introBinders,
  familyIndexSorts,
} from './hole-split.mjs';
import {
  synthesize,
  demandSplitVerdict,
  fillSplitPlan,
  fillIntroPlan,
  fillInvertPlan,
  fillInvertChainPlan,
} from './prover-synth.mjs';
import {
  boxedConclusionHead,
  normalizeCtypeSpelling,
  isCtypeApplication,
  decreasingArgIndex,
} from './prover-comp-type.mjs';
import { withWritableRiskDominated } from './prover-policy.mjs';
import { letRhsOf } from './prover-captions.mjs';
import {
  usedNamesOf,
  leadCtxVar,
  candidateSchemasFor,
  introBinderNames,
  isDeclaredTypeFamily,
  isIntroducedPremise,
  openCasesAt,
  sourceWritableNames,
  inventedReportNames,
  textReferencesNames,
  hypsOf,
  expandedHypsOf,
  branchPatternBox,
  branchPatternMetas,
  branchBodyBefore,
  boxOf,
  splitCtx,
  enrichHoleFromTheorem,
  resolveHoleGoal,
  resultFamilyOfCtor,
  familyOfConstructorNameBridge,
  decreasingHyps,
  subderivMetas,
  metaConclusion,
  contextualHead,
  theoremContextParam,
  resultBoxFor,
  holeByteOffsetBridge,
  freshForHole,
  freshName,
  letsInBranch,
  higherOrderHyp,
  blockProjectionHyps,
  termOf,
  premiseBoxArg,
} from './prover-hyp.mjs';
import {
  splitTextFor,
  splitTextForCtype,
  splitTextForBox,
  synthMoves,
  recurseTexts,
  supportLemmaTexts,
  helperLemmaTexts,
  ihDirectCallTexts,
  goalMatchesTheoremConclusion,
} from './prover-moves.mjs';

// All candidate moves for a hole, in ONE general priority order — justified by
// each move's cost/decisiveness, NOT by which theorem it unlocks:
//   fill       — inhabit the goal directly (closes a leaf; cheapest, most decisive)
//   impossible — refute an uninhabitable hypothesis (zero-branch case; closes a leaf)
//   recurse    — apply the induction hypothesis (leaf-ish, one continuation `?`)
//   invert     — a hypothesis is fully DETERMINED (one constructor, or a parameter
//                projection when no constructor unifies) ⇒ a `let`
//   lemma      — apply a support lemma whose conclusion matches the goal head
//   split      — case-analyse a scrutinee (branches; most expensive)
//   intro      — introduce the goal's binders
// The one STRUCTURAL nuance: at a top-level hole (no case pattern yet) a split is
// the ONLY thing that can make progress on an inductive scrutinee, so it leads.
// Every move's TEXT comes from the AST/schema model; nothing here branches on a
// specific theorem, family, or variable name.

export function candidateMoves(hole, code, thm) {
  hole = resolveHoleGoal(enrichHoleFromTheorem(hole, thm, code), thm);

  const fills = [];
  for (const t of fillCandidates(hole, code)) {
    fills.push({ kind: 'fill', text: t, rationale: 'inhabit the goal directly with ' + t });
  }
  for (const t of ihDirectCallTexts(hole, thm, code)) {
    fills.push({ kind: 'fill', text: t, rationale: 'close via the induction hypothesis ' + (thm && thm.name) });
  }

  const recurses = [];
  const recTexts = recurseTexts(hole, thm, code);
  for (const t of recTexts) {
    if (!t.includes('let ')) continue;
    recurses.push({ kind: 'recurse', text: t, rationale: 'apply the induction hypothesis ' + (thm && thm.name) });
  }
  // When the goal's family IS the theorem's conclusion family, a recursion's
  // result may close the goal directly — offer each recurse RHS as a closing
  // fill (the tail-call `deterministic [g |- D2] [g |- F3]` shape; the checker
  // arbitrates the indices).
  {
    const gd0 = decomposeContextual(hole.goal);
    const goalHead0 = gd0 ? headOfConclusion(gd0.concl) : headOfConclusion(String(hole.goal || ''));
    const thmConclHead = boxedConclusionHead((thm && thm.compType && thm.compType.conclusion) || '');
    if (goalHead0 && goalHead0 === thmConclHead) {
      for (const t of recTexts) {
        const rhs = letRhsOf(t);
        if (rhs) fills.push({ kind: 'fill', text: rhs, rationale: 'close via the induction hypothesis ' + (thm && thm.name) });
      }
    }
  }

  // The current branch already destructured its SCRUTINEE — re-inverting THAT exact
  // hypothesis is a redundant self-inversion (re-binding the same constructor to
  // fresh names, no progress). Skip only the scrutinee itself (a comp hypothesis whose
  // boxed type equals a theorem premise), NOT other hypotheses of the same family — a
  // sibling premise may legitimately need inverting (e.g. dl_uniq's second argument).
  const splitDone = !!branchPatternBox(code, hole);
  // ANY enclosing case's scrutinee is already destructured by its branch
  // pattern — re-analysing it (at any nesting depth) is vacuous by construction:
  // the nested case type-checks but derives nothing, and each round respawns the
  // whole branch search one level deeper (the re-split spiral).
  // openCasesAt tracks CLOSURE (a `(case f of …)` that already ended does not
  // block f elsewhere) — unlike the old nearest-`case`-regex, whose staleness
  // both blocked the legitimate split and let the vacuous re-split through.
  // openCasesAt tracks CLOSURE (a `(case f of …)` that already ended does not
  // block f elsewhere) — unlike the old nearest-`case`-regex, whose staleness
  // both blocked the legitimate split and let the vacuous re-split through.
  // REVERTED 2026-07-19 (S1b): gating this on openCasesAt's result UNCONDITIONALLY
  // (dropping the `splitDone` pre-check, to also catch bare-CTYPE arms) caused
  // 23 corpus regressions — openCasesAt's prefix-wide, paren-depth-based scan
  // does NOT perfectly match branchPatternBox's narrower arm-line check, and
  // over-matches on ordinary LF-boxed proofs, wrongly blocking legitimate
  // re-splits. The ctype-split re-split-guard gap (S1b's splitTextForCtype
  // wastes a couple of checks re-deriving its own scrutinee before giving up)
  // is the safer residual cost — do not re-attempt this without auditing every
  // divergence between the two closure-tracking functions first.
  const caseScrutSet = new Set(splitDone ? openCasesAt(code, hole).map((c2) => c2.scrut) : []);
  // Re-split guard for CTYPE splits only (see the emission site below): a ctype
  // arm's pattern is a bare ctor application, not `[…]`-boxed, so branchPatternBox
  // (hence splitDone/caseScrutSet) never sees it — without this, the engine
  // re-splits its own ctype scrutinee inside every arm (the S1b spiral). Lazy +
  // memoized; NEVER merged into caseScrutSet (that exact merge was the S1b
  // 23-regression revert).
  let ctypeScrutsOpenMemo = null;
  const ctypeScrutsOpen = () => {
    if (!ctypeScrutsOpenMemo) ctypeScrutsOpenMemo = new Set(openCasesAt(code, hole).map((c2) => c2.scrut));
    return ctypeScrutsOpenMemo;
  };
  const inverts = [];
  const impossibles = [];
  for (const c of (hole.ctx || [])) {
    if (!c || !c.name) continue;
    if (caseScrutSet.has(c.name)) continue;
    if (splitDone && thm && isIntroducedPremise({ type: c.type, where: 'comp' }, thm)) continue;
    const scope = (hole.ctx || []).filter((s) => s.name !== c.name);
    const used = usedNamesOf(hole);
    const bare = invertCandidates(c, code, [...used], scope, { annotate: false });
    if (bare.length === 1) {
      // Phase F.1: annotated unique invert first (binds index metas in source),
      // bare as checker-arbitrated fallback — same dual-spell discipline as splits.
      const ann = invertCandidates(c, code, [...used], scope, { annotate: true });
      if (ann.length === 1 && ann[0] !== bare[0]) {
        inverts.push({
          kind: 'invert',
          text: ann[0] + '\n?',
          rationale: 'invert the determined hypothesis ' + c.name + ' (annotated)',
        });
      }
      inverts.push({
        kind: 'invert',
        text: bare[0] + '\n?',
        rationale: 'invert the determined hypothesis ' + c.name,
      });
      continue;
    }
    if (bare.length) continue;
    // NO constructor result unifies with this hypothesis' conclusion. If it mentions
    // a parameter, its only origin is a context-block projection — the inversion
    // `let [Γ |- #q.field[..]] = h in` (schema-driven; the checker certifies the
    // refinement it forces).
    let param = null;
    const lead = leadCtxVar(boxOf(c.type).ctx);
    for (const schemaName of candidateSchemasFor(code, hole, lead)) {
      const pv = paramInvertCandidates(c, schemaInfo(code, schemaName), usedNamesOf(hole));
      if (pv.length === 1) { param = pv[0]; break; }
    }
    if (param) {
      inverts.push({ kind: 'invert', text: param + '\n?', rationale: 'invert ' + c.name + ' to a context-block projection' });
      continue;
    }
    // Neither a constructor nor a parameter can inhabit it — the hypothesis type is
    // plausibly EMPTY, so propose the zero-branch case `impossible h`; Beluga itself
    // certifies the coverage refutation (a wrong guess is simply rejected).
    if (decomposeContextual(c.type)) {
      impossibles.push({ kind: 'impossible', text: `impossible ${c.name}`, rationale: 'refute the uninhabitable hypothesis ' + c.name });
    }
  }
  // A cD sub-derivation can be refutable too (`impossible [g |- NL]` — a
  // `notLam (lam …)` exposed by inversion). Gated on the family HAVING
  // constructors (emptiness-by-conflict), none of which unify.
  for (const m3 of (hole.meta || [])) {
    if (!m3 || !m3.name || m3.name[0] === '#' || m3.name[0] === '"') continue;
    const d3 = decomposeContextual(m3.type);
    if (!d3 || !d3.concl) continue;
    const fam3 = typeFamilyHead(d3.concl, code);
    if (!fam3 || fam3 === 'type' || !enumerateConstructorsTyped(code, fam3).length) continue;
    if (invertCandidates({ name: m3.name, type: m3.type }, code, usedNamesOf(hole), []).length) continue;
    if (String(d3.concl).includes('#')) continue; // parameter territory
    impossibles.push({
      kind: 'impossible',
      text: `impossible [${d3.ctx || ''} |- ${m3.name}]`,
      rationale: 'refute the uninhabitable sub-derivation ' + m3.name,
    });
  }

  const lemmas = [];
  for (const t of helperLemmaTexts(hole, thm, code)) {
    lemmas.push({ kind: 'lemma', text: t.text, rationale: 'apply helper lemma ' + t.name });
  }
  for (const t of supportLemmaTexts(hole, thm, code)) {
    lemmas.push({ kind: 'lemma', text: t.text, rationale: 'apply support lemma ' + t.name });
  }

  const splits = [];
  for (const c of (hole.ctx || [])) {
    if (!c || !c.name) continue;
    // Never RE-split the enclosing case's own scrutinee inside its branch — the
    // nested case type-checks but derives nothing, and each round respawns the
    // whole branch search one level deeper (the spiral).
    if (caseScrutSet.has(c.name)) continue;
    // A hypothesis already DESTRUCTURED by an inversion in this branch
    // (`let [ |- pat] = e in`) must not be case-split either: destructuring is
    // idempotent, so the nested case is vacuous — it re-binds the same
    // components under fresh names (and fresh index metas, corrupting the
    // decreasing-candidate scoping downstream).
    if (branchBodyBefore(code, hole).includes(`= ${c.name} in`)) continue;
    // TWO variants, checker-arbitrated: ANNOTATED arms first (bind the implicit
    // indices so branch bodies may reference them — the bigstep chains need it),
    // then BARE (strengthening/block shapes reject bare annotation index vars).
    // A NESTED case must be parenthesized — otherwise the OUTER case's remaining
    // arms parse as arms of the inner one (the reference writes `(case f of …)`).
    const annotated = splitTextFor(code, hole, c.name);
    const bare = splitTextFor(code, hole, c.name, { annotate: false });
    for (const text of [annotated, ...(bare !== annotated ? [bare] : [])]) {
      if (!text) continue;
      splits.push({
        kind: 'split',
        text: splitDone ? `(${text})` : text,
        rationale: 'case-analyse ' + c.name,
        scrutinee: c.name,
      });
    }
    // Ctype-hypothesis split (staked 2026-07-21; S1b's 2026-07-19 attempt is
    // the postmortem in docs/prover-master-plan.md §0.5). The re-split guard
    // that broke S1b (swapping the SHARED caseScrutSet to openCasesAt caused
    // 23 LF regressions) is here scoped to THIS emission only: ctypeScrutsOpen
    // gates ctype splits alone, so the LF path (splitDone/caseScrutSet) is
    // byte-identical to before. openCasesAt's over-matching is safe in this
    // position by construction — a false positive only suppresses a ctype
    // split, a move type that otherwise did not exist.
    if (!annotated && !bare && c.type && isCtypeApplication(c.type)
        && !ctypeScrutsOpen().has(c.name)) {
      const ctypeText = splitTextForCtype(code, hole, c.name, c.type);
      if (ctypeText) {
        splits.push({
          kind: 'split',
          text: splitDone ? `(${ctypeText})` : ctypeText,
          rationale: 'case-analyse ' + c.name,
          scrutinee: c.name,
        });
      }
    }
  }
  // The theorem's OWN Pi-bound metas (mlam binders) split as CONSTRUCTED boxes
  // (`case [g |- U] of …`) — never arbitrary sub-derivation metas.
  const piNames = (((thm && thm.compType && thm.compType.premises) || [])
    .filter((p) => p.kind === 'pi').map((p) => p.binder)).filter(Boolean);
  const normScrut = (s) => String(s || '').replace(/\s+/g, '');
  const piBoxes = ((thm && thm.compType && thm.compType.premises) || []).filter((p) => p.kind === 'box');
  const totName = (thm && thm.totality && thm.totality.kind === 'named') ? String(thm.totality.name).toLowerCase() : null;
  for (const m2 of (hole.meta || [])) {
    if (!m2 || !m2.name || !piNames.includes(m2.name)) continue;
    const d2 = decomposeContextual(m2.type);
    if (!d2 || !d2.concl) continue;
    // A Pi-bound OBJECT meta is case-able only when the split can matter:
    // it is the totality measure's named argument (eq_ref — induction ON it),
    // there are no box premises (the Pi IS the induction subject), or some
    // HYPOTHESIS's type depends on it (its shape gates coverage). Splitting a
    // meta only the GOAL mentions specializes the theorem vacuously — the
    // ceq-congruence `case [ ⊢ N] of zero/succ/…` regress (spec §7 inv. 3).
    {
      const measureDriven = totName && totName === m2.name.toLowerCase();
      let hypDepends = false;
      if (!measureDriven && piBoxes.length) {
        const dep = new RegExp(`(^|[^A-Za-z0-9_'])${m2.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_']|$)`);
        for (const o of [...(hole.meta || []), ...(hole.ctx || [])]) {
          if (!o || o === m2 || !o.type) continue;
          if (dep.test(String(o.type))) { hypDepends = true; break; }
        }
        if (!hypDepends) continue;
      }
    }
    const scrutText = d2.ctx ? `[${d2.ctx} |- ${m2.name}]` : `[ |- ${m2.name}]`;
    if ([...caseScrutSet].some((cs) => normScrut(scrutText) === normScrut(cs) || normScrut(m2.name) === normScrut(cs))) continue;
    const boxedType = d2.ctx ? `[${d2.ctx} |- ${d2.concl}]` : `[ |- ${d2.concl}]`;
    const annotated2 = splitTextForBox(code, hole, scrutText, boxedType);
    const bare2 = splitTextForBox(code, hole, scrutText, boxedType, { annotate: false });
    for (const text of [annotated2, ...(bare2 !== annotated2 ? [bare2] : [])]) {
      if (!text) continue;
      splits.push({
        kind: 'split',
        text: splitDone ? `(${text})` : text,
        rationale: 'case-analyse ' + scrutText,
        scrutinee: scrutText,
      });
    }
  }
  // A general cD METAVARIABLE splits too (spec §2 / D6) when its family has ≥2
  // constructors and no unique inversion applies (unique ⇒ invert owns it;
  // zero ⇒ impossible owns it). Guarded like every split against re-analysing
  // an already-destructured subject; ranked after the comp-hypothesis splits.
  for (const m4 of (hole.meta || [])) {
    if (!m4 || !m4.name || m4.name[0] === '#' || m4.name[0] === '"' || m4.name[0] === '$') continue;
    if (piNames.includes(m4.name)) continue; // handled above
    const d4 = decomposeContextual(m4.type);
    if (!d4 || !d4.concl || String(d4.concl).includes('#')) continue;
    const fam4 = typeFamilyHead(d4.concl, code);
    if (!fam4 || fam4 === 'type' || enumerateConstructorsTyped(code, fam4).length < 2) continue;
    if (invertCandidates({ name: m4.name, type: m4.type }, code, usedNamesOf(hole), []).length === 1) continue;
    // A LET-BOUND result (a speculative lemma/recursion's output) is DERIVED
    // structure — the producing move can regenerate it one level up, so casing
    // on it consumes no finite resource and its sub-derivations are never
    // decOk (the ceq-congruence `case [ ⊢ R1] of` regress; spec §7 inv. 3).
    // Derived results are destructured via `let` patterns, never case-split.
    if (letsInBranch(code, hole).includes(m4.name)) continue;
    // An INDEX metavariable — one the goal or another hypothesis's type DEPENDS
    // on — is never a D6 scrutinee: splitting it specializes the theorem
    // (vacuous over-specialization; the proof must stay uniform in it). A
    // derivation you case on is CONSUMED by the analysis, not depended upon.
    {
      const esc4 = m4.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const dep = new RegExp(`(^|[^A-Za-z0-9_'])${esc4}([^A-Za-z0-9_']|$)`);
      let isIndex = dep.test(String(hole.goal || ''));
      if (!isIndex) {
        for (const o of [...(hole.meta || []), ...(hole.ctx || [])]) {
          if (!o || o === m4 || !o.type) continue;
          if (dep.test(String(o.type))) { isIndex = true; break; }
        }
      }
      if (isIndex) continue;
    }
    const scrutText4 = d4.ctx ? `[${d4.ctx} |- ${m4.name}]` : `[ |- ${m4.name}]`;
    if ([...caseScrutSet].some((cs) => normScrut(scrutText4) === normScrut(cs) || normScrut(m4.name) === normScrut(cs))) continue;
    if (branchBodyBefore(code, hole).includes(`= ${scrutText4}`)) continue;
    const boxedType4 = d4.ctx ? `[${d4.ctx} |- ${d4.concl}]` : `[ |- ${d4.concl}]`;
    const t4 = splitTextForBox(code, hole, scrutText4, boxedType4);
    if (t4) {
      splits.push({
        kind: 'split',
        text: splitDone ? `(${t4})` : t4,
        rationale: 'case-analyse the sub-derivation ' + m4.name,
        scrutinee: scrutText4,
      });
    }
  }
  const topLevel = splits.length && !branchPatternBox(code, hole);

  const introInfo = introBinders(hole.goal);
  const intro = buildIntroSkeleton(hole.goal, {
    usedNames: usedNamesOf(hole),
    binderNames: introInfo ? introBinderNames(thm, introInfo.arrows) : null,
  });
  const intros = intro ? [{ kind: 'intro', text: intro, rationale: 'introduce the goal’s binders' }] : [];
  // IMPLICIT CONTEXT VARIABLES (writability, the ctx form of invariant 11): a
  // theorem type may mention context variables it never binds (`Crel [l] [h]`
  // with free l, h — Beluga quantifies them implicitly). They are UNWRITABLE in
  // the body until NAMED, so splits/fills spelling them are rejected "free
  // context variable is illegal" while the checker prints the goal's contexts
  // as `[_]`. Beluga's own idiom binds them: a type-annotating re-let of a
  // premise whose declared type spells the names (`fn cr =>
  // let (cr : Crel [l] [h]) = cr in …`). Emit that as a SECOND intro variant,
  // ranked FIRST when the goal shows unnamed contexts — it strictly dominates
  // (same state, names bound); if it fails to certify, the plain intro stands.
  if (intro && /\[_/.test(String(hole.goal || '')) && thm && thm.compType) {
    const fnNames = [...intro.matchAll(/\bfn\s+([\p{L}_][\p{L}\p{N}_']*)/gu)].map((m5) => m5[1]);
    const boxPrems = thm.compType.premises.filter((p) => p && p.kind === 'box');
    const lets = [];
    for (let i = 0; i < fnNames.length && i < boxPrems.length; i += 1) {
      const raw = String(boxPrems[i].raw || '').trim();
      // only premises that actually SPELL a context name (a bracketed group
      // whose ctx part is a bare identifier) can bind one
      if (/\[\s*[\p{L}_][\p{L}\p{N}_']*\s*(\||\])/u.test(raw)) {
        lets.push(`let (${fnNames[i]} : ${raw}) = ${fnNames[i]} in`);
      }
    }
    if (lets.length) {
      intros.unshift({
        kind: 'intro',
        text: intro.replace(/\?\s*$/, `${lets.join('\n')}\n?`),
        rationale: 'introduce the goal’s binders, naming the implicit context variables',
      });
    }
  }

  // A fill that CLOSES the goal (no `?`) is the most decisive — try those first. A
  // fill that leaves sub-holes is speculative, so it ranks AFTER the induction
  // hypothesis (the principled structural move). Then invert (determined hyp), lemma,
  // split. At a top-level hole a split must lead (nothing else applies yet).
  const closingFills = fills.filter((m) => !/\?/.test(m.text));
  const openFills = fills.filter((m) => /\?/.test(m.text));
  // Goal-directed SYNTHESIS (backward chaining): derives a COMPLETE hole-closing
  // let-chain by unification when one exists in its fragment. It is a CLOSING
  // move (no `?` in its text), so it ranks with the closers — before any
  // refining move (invert/split), which can otherwise spiral: each invert/split
  // manufactures fresh metas that admit further inverts/splits, "progressing"
  // forever without approaching closure. A certified complete chain is never
  // worse than a speculative refinement of the same hole. Single-step closing
  // fills still lead (prefer the shortest certified closer).
  const synths = synthMoves(hole, code, thm);
  // Phase D Stage 1: demand oracle ranks/prunes the split candidates the bridge
  // already emitted. Correlate by mv.scrutinee → subject type; never rebuild case
  // text. Vacuous drops; demanded ranks ahead of intro/open fills; unanalysable
  // stays fail-open in the open-split bucket.
  const demandObs = synths.obligations || [];
  const demandFacts = synths.demandFacts || [];
  const demandCtors = synths.demandCtors || new Map();
  const demandMetaVars = synths.demandMetaVars || new Set();
  const subjectConclOf = (scrut) => {
    const s = String(scrut || '').trim();
    if (!s) return null;
    const asBox = decomposeContextual(s);
    const want = asBox ? String(asBox.concl || '').trim() : s;
    for (const h of [...(hole.ctx || []), ...(hole.meta || [])]) {
      if (!h || !h.name || !h.type) continue;
      if (h.name === s || h.name === want) {
        const d = decomposeContextual(h.type);
        return d ? String(d.concl || '').trim() : null;
      }
    }
    return null;
  };
  const demanded = [];
  const openSplits = [];
  // §5.2 LAW: ranking may reorder the spec-mandated set, never EMPTY it — so a
  // vacuous split stays IN the vocabulary (the coverage matrix sees it). But
  // the 2026-07-18 sweep MEASURED what certify-at-the-tail does to it: a
  // vacuous split usually CERTIFIES (splits do), the greedy loop accepted it
  // at failing holes, and the split spiral returned through the back door
  // (eval_det/sound 500+ checks → TIMEOUT; tps, lemma_val_1 lost). Vacuous
  // descent is the unbounded №1 dimension outside the demand discipline —
  // acceptance is what poisons, so vacuous is vocabulary-only: skipCertify,
  // never accepted, counted as the exhaustion certificate's split taint.
  // THE INDUCTION SUBJECT IS NEVER VACUOUS. A `/ total v (f _ v) /` measure is the
  // author DECLARING which argument the induction is on, so a case analysis of that
  // argument is the induction itself — whatever the demand probe concludes about it.
  // Measured on `vself` (tapl ch3+arith): with the pragma present the ONLY split,
  // `case v of`, was tagged vacuous and therefore never certified, so the theorem
  // reported "no move" with 5 checks; comment the pragma out and the identical split
  // is accepted and the search runs 6 steps. Adding a totality measure must never
  // REMOVE the move that measure licenses. Derived from the theorem's own measure —
  // no name literal, nothing corpus-specific.
  // WHICH hypothesis is the declared induction subject. Matching the measure's
  // NAME is useless: `introBinderNames` only supplies source names when the
  // premise count lines up, so the engine's binders are usually fresh (`X`, `X1`)
  // and never equal `v`/`e`. The measure designates a POSITION, and the intro
  // binds the argument premises in declaration order — so the subject is the
  // decreasing-index entry of the hole's comp context, guarded by the arity
  // lining up (anything else: no subject, no reordering).
  const measureSubject = (() => {
    if (!thm || !thm.compType) return null;
    const decI = decreasingArgIndex(thm);
    if (!(decI >= 0)) return null;
    const argPrems = (thm.compType.premises || []).filter((p) => p && (p.kind === 'box' || p.kind === 'ctype'));
    const ctx = (hole.ctx || []).filter((c) => c && c.name);
    if (ctx.length !== argPrems.length || decI >= ctx.length) return null;
    return String(ctx[decI].name).trim();
  })();
  let splitDrops = 0;
  for (const sp of splits) {
    if (!demandObs.length) { openSplits.push(sp); continue; }
    const concl = subjectConclOf(sp.scrutinee);
    if (!concl) { openSplits.push(sp); continue; }
    const v = demandSplitVerdict(concl, demandObs, demandFacts, demandCtors, demandMetaVars);
    if (globalThis.__splitDemandDebug) {
      globalThis.__splitDemandDebug({
        scrutinee: sp.scrutinee, concl, verdict: v, obligations: demandObs,
      });
    }
    if (v === 'vacuous') { // GENERAL: demand-oracle verdict tag, not a Beluga name
      splitDrops += 1;
      openSplits.push({
        ...sp,
        dominated: true,
        skipCertify: true,
        rationale: `${sp.rationale || ''} (vacuous probe: vocabulary-only, taints exhaustion)`,
      });
      continue;
    }
    if (v === 'demanded') demanded.push(sp); // GENERAL: demand-oracle verdict tag, not a Beluga name
    else openSplits.push(sp);
  }
  // NOTE (2026-07-27, tried and REVERTED): promoting the measure's declared
  // induction subject to the FRONT of the split order is sound in principle
  // (ordering only, nothing dropped) but cost `tapl/ch3+arith+leq#mstep_leq_2`
  // COMPLETE → a >10-minute search: leading with a different scrutinee changes
  // which subtree the greedy loop commits to, and this one commits badly. The
  // wrong-subject evidence that motivated it was ALSO a measurement artifact
  // (comparing reference binder indices that count `mlam`s against the engine's
  // numbering over `fn` binders only — corrected, 8/66 differ, not 19). Any retry
  // needs a real wrong-subject measurement AND a bound on the resulting search.
  // A vacuous verdict may REORDER the split vocabulary, never EMPTY it (§5.2).
  // `skipCertify` does empty it in practice: if every split at this hole is tagged
  // vacuous, no case analysis is ever sent to the checker and the hole reports
  // "no move" even though the induction the theorem DECLARES is sitting right
  // there. Measured on tapl `vself`: with `/ total v (vself _ v) /` present the
  // only split, `case v of`, was dropped vacuous → no-move in 5 checks; with the
  // pragma commented out the identical split is accepted. Adding a measure must
  // not remove the move that measure licenses.
  // Strictly ADDITIVE by construction: this fires only when nothing else is
  // certifiable, so it can never reorder a hole that already had a live split
  // (an unrestricted exemption did, and cost `tps` on the differential).
  if (measureSubject && !demanded.length && openSplits.length
    && openSplits.every((s) => s.skipCertify)) {
    const i = openSplits.findIndex((s) => String(s.scrutinee || '').trim() === measureSubject);
    if (i >= 0) {
      const { skipCertify, dominated, ...revived } = openSplits[i];
      openSplits[i] = { ...revived, rationale: `${revived.rationale || ''} (declared induction subject: vacuous probe overridden)` };
      splitDrops = Math.max(0, splitDrops - 1);
    }
  }
  // Phase D Stage 2: for a demanded split, try filling arms via synth under each
  // arm's metaTheta. One candidate, one certify — fail-open if nothing fills.
  const planMoves = [];
  const plannedScrut = new Set();
  if (demandObs.length && demanded.length && synths.demandGoal) {
    const seenScrut = new Set();
    for (const sp of demanded) {
      const key = String(sp.scrutinee || '');
      if (seenScrut.has(key)) continue;
      seenScrut.add(key);
      const concl = subjectConclOf(sp.scrutinee);
      if (!concl) continue;
      const plan = fillSplitPlan({
        splitText: sp.text,
        subjectConcl: concl,
        goal: synths.demandGoal,
        facts: demandFacts,
        rules: synths.demandRules || [],
        ctorsMap: demandCtors,
        metaVars: demandMetaVars,
        familyKinds: synths.demandFamilyKinds,
      });
      if (!plan) continue;
      plannedScrut.add(key);
      planMoves.push({
        kind: 'split', // GENERAL: move-kind tag — case-shaped so proveHoleLive prune applies
        text: plan.text,
        rationale: 'demand-spliced split with per-arm synthesis',
        scrutinee: sp.scrutinee,
        planFilledArms: plan.filledArms,
        planOpenArms: plan.openArms,
        // Fully-closed plan ⇒ one certify for the whole case (Phase E.1).
        closingPlan: plan.openArms === 0,
      });
    }
  }
  // Phase E.2: intro + residual synth as one closing plan (one certify).
  const introPlans = [];
  if (intros.length) {
    const seenIntro = new Set();
    for (const iv of intros) {
      const key = String(iv.text || '');
      if (seenIntro.has(key)) continue;
      seenIntro.add(key);
      const plan = fillIntroPlan({
        introText: iv.text,
        goalType: String(hole.goal || ''),
        compType: thm && thm.compType,
        facts: demandFacts,
        rules: synths.demandRules || [],
        ctorsMap: demandCtors,
        metaVars: demandMetaVars,
      });
      if (!plan) continue;
      introPlans.push({
        kind: 'intro', // GENERAL: move-kind — binder-shaped; certifyWaveSize sees closingPlan
        text: plan.text,
        rationale: 'intro + residual synthesis (closing plan)',
        closingPlan: true,
      });
    }
  }
  // A closing intro plan DOMINATES the open intros — but domination defers,
  // never empties (G.3b): if the plan is checker-rejected, the bare intro is
  // the only road to a split-based proof. Emptying this list is exactly how
  // eq_sym was lost on the 2026-07-17 sweep (plan rejected for a bad self-call,
  // bare `fn d => ?` never tried, instant no-move at hole 0).
  const introsRest = introPlans.length
    ? intros.map((iv) => ({
      ...iv,
      dominated: true,
      rationale: `${iv.rationale || ''} (deferred: closing intro plan exists)`,
    }))
    : intros;
  // Phase E.4/E.5: unique invert (+ chain) as one plan. E.4 owns length-1 close;
  // E.5 emits depth≥2 chains (closing or open) so N invert steps → one certify.
  const invertPlans = [];
  const plannedInvertHyps = new Set();
  if (inverts.length && synths.demandGoal) {
    const seenInv = new Set();
    for (const iv of inverts) {
      const key = String(iv.text || '');
      if (seenInv.has(key)) continue;
      seenInv.add(key);
      const args = {
        invertText: iv.text,
        goal: synths.demandGoal,
        facts: demandFacts,
        rules: synths.demandRules || [],
        ctorsMap: demandCtors,
        metaVars: demandMetaVars,
        familyKinds: synths.demandFamilyKinds,
      };
      const plan = fillInvertPlan(args) || fillInvertChainPlan(args);
      if (!plan) continue;
      if (plan.hyp) plannedInvertHyps.add(plan.hyp);
      invertPlans.push({
        kind: 'invert', // GENERAL: move-kind — keep vocabulary; closingPlan → wave=1
        text: plan.text,
        rationale: plan.closingPlan
          ? (plan.chainLen > 1
            ? 'invert chain + residual synthesis (closing plan)'
            : 'invert + residual synthesis (closing plan)')
          : 'invert chain (open plan)',
        closingPlan: !!plan.closingPlan,
      });
    }
  }
  // Phase E.3: open inverts whose hyp is already destructured by a closing synth
  // stay in the move vocabulary (coverage) but are marked dominated — the search
  // skips their certify (synth saturation already owns that let). E.4/E.5 likewise
  // dominate the open invert when an invert plan exists for that hyp.
  const closingSynths = synths.filter((s) => s && s.text && !/\?/.test(s.text));
  const invertsMarked = inverts.map((iv) => {
    const hm = /=\s*([\p{L}_][\p{L}\p{N}_']*)\s+in/u.exec(String(iv.text || ''));
    if (!hm) return iv;
    const hyp = hm[1];
    if (plannedInvertHyps.has(hyp)) {
      return { ...iv, dominated: true, rationale: `${iv.rationale || ''} (subsumed by invert plan)` };
    }
    const re = new RegExp(`=\\s*${hyp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+in`);
    if (!closingSynths.some((s) => re.test(s.text))) return iv;
    return { ...iv, dominated: true, rationale: `${iv.rationale || ''} (subsumed by closing synth)` };
  });
  // Phase E.8 — writableRisk synth is strictly weaker than a clean closing synth
  // (F.0 already ranked `_` first when clean). Keep vocabulary; skip certify.
  const synthsMarked = withWritableRiskDominated(synths);
  // Bare demanded / open splits for a scrutinee that already has a filled plan are
  // strictly weaker (all-`?` vs some/all arms closed) — skip the duplicate certify.
  // G.3b: a bare split whose scrutinee has a filled plan is DEFERRED, not
  // dropped — the domination claim ("all-? is strictly weaker") holds only if
  // the plan certifies; if the plan is rejected, the bare split gets its turn
  // (deferDominated sorts dominated last, so the success path never pays).
  const deferPlanned = (sp) => (sp.dominated || !plannedScrut.has(String(sp.scrutinee || ''))
    ? sp
    : { ...sp, dominated: true, rationale: `${sp.rationale || ''} (deferred: filled plan exists)` });
  const demandedRest = demanded.map(deferPlanned);
  const openSplitsRest = openSplits.map(deferPlanned);
  // "A certified complete chain is never worse than a speculative refinement"
  // applies at the TOP LEVEL too: closing fills/synths rank before open splits
  // everywhere. (The old top-level order put splits first; it was masked by the
  // demand oracle's over-aggressive vacuous drops — once those were fixed
  // (P6), split-eager ordering sent todbruijn into an 8-deep split spiral
  // where one closing synth ends the proof. Ranking, not dropping.)
  const closingSynthsRanked = synthsMarked.filter((s) => s && s.text && !/\?/.test(s.text));
  const openSynthsRanked = synthsMarked.filter((s) => !(s && s.text && !/\?/.test(s.text)));
  const ordered = topLevel
    ? [...planMoves, ...introPlans, ...invertPlans, ...closingFills, ...closingSynthsRanked, ...demandedRest, ...openSplitsRest, ...impossibles, ...recurses, ...openFills, ...openSynthsRanked, ...invertsMarked, ...lemmas, ...introsRest]
    // Focusing discipline (2026-07-19): the UNIQUE INVERT is the inversion
    // phase — deterministic, non-branching, information-preserving — and ranks
    // BEFORE any branching split, demanded or planned (a demanded one-arm
    // split of the same subject is the same content at strictly higher cost,
    // and accepting it first sent unique_eval's search into the nested-split
    // wander). Ranking only — everything stays in the vocabulary.
    : [...closingFills, ...synthsMarked, ...introPlans, ...invertPlans, ...impossibles, ...recurses, ...invertsMarked, ...planMoves, ...demandedRest, ...openFills, ...lemmas, ...openSplitsRest, ...introsRest];
  if (synths.searchBounded) ordered.searchBounded = true;
  if (synths.synthExhausted) ordered.synthExhausted = true;
  if (splitDrops) ordered.splitDrops = splitDrops;
  return ordered;
}

/**
 * G.3b — dominated moves are DEFERRED, never skipped (see prover-policy.mjs).
 * Phase E.1 certifyWaveSize / classifyVerdict — see prover-policy.mjs.
 */

// ── Sound syntactic PRE-FILTER (E2b) ─────────────────────────────────────────
// The search pays a full checker round-trip per candidate move. Most candidates
// are rejectable IN-PROCESS by a cheap, SOUND head-family check — one that never
// rejects a move the checker would accept. This collapses O(candidates) worker
// calls to O(survivors) (usually 1–3). The discipline: when in ANY doubt, return
// true (pass through to the checker) — soundness over completeness.
//
// The single high-yield rule: a CLOSING fill `[Γ ⊢ H a…]` whose head `H` is a
// DECLARED CONSTRUCTOR can only inhabit a goal of `H`'s RESULT family. If the goal
// head is a different declared family, the fill is dead — skip the checker. We only
// judge fills with a rigid constructor head against a rigid goal family head; a
// metavariable/parameter head, an infix-notation head, or a non-boxed goal all
// pass through untouched.

// ── Sound syntactic PRE-FILTER (E2b) ─────────────────────────────────────────
// The search pays a full checker round-trip per candidate move. Most candidates
// are rejectable IN-PROCESS by a cheap, SOUND head-family check — one that never
// rejects a move the checker would accept. This collapses O(candidates) worker
// calls to O(survivors) (usually 1–3). The discipline: when in ANY doubt, return
// true (pass through to the checker) — soundness over completeness.
//
// The single high-yield rule: a CLOSING fill `[Γ ⊢ H a…]` whose head `H` is a
// DECLARED CONSTRUCTOR can only inhabit a goal of `H`'s RESULT family. If the goal
// head is a different declared family, the fill is dead — skip the checker. We only
// judge fills with a rigid constructor head against a rigid goal family head; a
// metavariable/parameter head, an infix-notation head, or a non-boxed goal all
// pass through untouched.

export function movePrefilterOk(mv, hole, code, pfOpts = {}) {
  // Universal lexical guard: checker-internal `"`-quoted names (the renumbered
  // anonymous metas of invariant §5.1) are not lexable Beluga source — a
  // candidate carrying one is unparseable BY CONSTRUCTION ("Unlexable
  // character") and can never certify. Generated candidates never contain a
  // legitimate `"` (Beluga terms have no string literals). Found live: hole
  // hypotheses named `"i2` leaked into fills and burned 8/31 checks on
  // bs_in_rew_par1 (2026-07-12).
  if (mv && /"/.test(String(mv.text || ''))) return false;
  // Universal lexical guard #2 (2026-07-25, measured): a PARAMETER (`#p`) or
  // SUBSTITUTION (`$S`) variable is a META object — it may only be cited inside a
  // box (`[g |- #p]`) or bound in a binder list (`mlam g, #p =>`, `{#p : …}`).
  // Written bare in a computation-level argument slot it is not even parseable
  // ("Failed to parse (mutual) recursive function declaration(s)"), so such a
  // candidate can NEVER certify. The reject census measured 171 of these across
  // 26 targets — `Ae_a X #p`, `Ae_a #p #p`, `Ae_a g1 #p` — pure wasted checks.
  if (mv && bareMetaObjectOutsideBox(String(mv.text || ''))) return false;
  if (!mv || mv.kind !== 'fill') return true;
  const t = String(mv.text || '').trim();
  if (/\?/.test(t)) return true;               // open fill — not a closing inhabitant
  if (/\blet\b|\\|=>/.test(t)) return true;     // a call/binder form, not a bare box
  const box = decomposeContextual(t);
  if (!box) return true;                        // not a boxed term — don't judge
  const termHead = headOfConclusion(box.concl);
  if (!termHead || !/^[\p{L}_]/u.test(termHead)) return true; // metavar/param/#-head
  // The term head must be a DECLARED constructor with a known result family; else
  // (a bound var, a projection, an unknown) we can't judge soundly → pass.
  const ctors = enumerateConstructorsTyped(code, resultFamilyOfCtor(code, termHead));
  const ctor = ctors.find((c) => c.name === termHead);
  if (!ctor || !ctor.result || !ctor.result.head) return true;
  const gd = decomposeContextual(hole && hole.goal);
  if (!gd) return true;
  const goalHead = headOfConclusion(gd.concl);
  // (1) HEAD check: reject when both heads are rigid declared families and differ.
  if (goalHead && /^[\p{L}_]/u.test(goalHead) && isDeclaredTypeFamily(code, goalHead)
    && ctor.result.head !== goalHead) return false;

  // (2) ARGUMENT-FAMILY check (the high-yield one): each explicit constructor arg
  // has a declared family; if the fill passes a BARE in-scope hypothesis whose own
  // declared family differs, the fill is dead — reject, no checker. Sound: we only
  // judge args that are (a) a bare identifier naming a scope hyp of (b) a KNOWN
  // rigid family, against (c) a first-order (non-Pi, non-higher-order) ctor arg of
  // (d) a known rigid family. Anything else (metavars, `_`, lambdas, unknown types)
  // passes. This is what kills `eq_app d M1` where `d : eval …`.
  //
  // POSITIONAL-ALIGNMENT guard: `argTypes` excludes explicit `{Pi}` binders (the
  // spine walker skips them), but the TERM's args include their instances — so a
  // Pi-typed constructor shifts the alignment and judging would be UNSOUND. Only
  // judge when the ctor's declaration provably has no `{` and the arity matches
  // exactly; any doubt (decl not found, `{` anywhere in it) → pass to the checker.
  // POSITIONAL-ALIGNMENT guard. Invariant 5 forbade judging a Pi-typed
  // constructor because `argTypes` DROPPED explicit `{Pi}` binders, so the term's
  // args and the declared args were off by one and judging was unsound. Since
  // 2026-07-25 the binders are kept IN POSITION, so alignment holds and the guard
  // narrows to what it must still cover: a declaration we cannot locate at all.
  // The two remaining misalignment sources are already handled — the exact-arity
  // requirement below catches a term that OMITS a Pi arg supplied by a hyp pair
  // (`piArgsCoveredByHyp`), and each Pi/HO slot is skipped individually when the
  // per-argument family check runs.
  const argToks = splitTopLevelArgs(box.concl).slice(1); // drop the head
  if (argToks.length && argToks.length === ctor.argTypes.length
    && !ctorDeclMissing(code, termHead)) {
    const scope = scopeFamilyMap(hole);
    // S3 pre-filter (2026-07-22, measured): a bare CONTEXT VARIABLE in a
    // first-order LF constructor argument slot is provably dead — a context is
    // not a term, so the checker rejects it ("Expected an LF term-level
    // constant"). Unambiguously sound: it does NOT depend on hole.meta being
    // complete (unlike an unbound-name check, which the prefilter contract
    // forbids — see test-prover-prefilter's `eq_app D1 D2` PASS case: uppercase
    // metavar args must never be rejected on absence-from-meta alone).
    const ctxVars = new Set(); // bare context variables of the CANDIDATE's own box
    for (const part of splitCtx(box.ctx || '')) {
      const p = part.trim();
      if (p && !p.includes(':') && /^[\p{L}_][\p{L}\p{N}_']*$/u.test(p)) ctxVars.add(p);
    }
    for (let i = 0; i < argToks.length; i += 1) {
      const a = String(argToks[i]).trim();
      if (!/^[\p{L}_][\p{L}\p{N}_']*(\[[^[\]]*\])?$/u.test(a)) continue; // not a bare hyp
      const aName = a.replace(/\[[^[\]]*\]$/, '');
      if (aName === '_') continue; // GENERAL: `_` is the universal inferred-argument wildcard (checker fills it), not a Beluga name — always valid in any arg slot
      const at = ctor.argTypes[i];
      const desc = constructorArgDescriptor(at, []);
      if (desc.higherOrder || /^\s*\{/.test(String(at))) continue; // Pi/HO arg — skip
      // (a) a context variable can never inhabit a first-order LF term slot.
      if (ctxVars.has(aName)) return false;
      // (b) SCOPE check — trustScope only. An UPPERCASE bare name that is
      // neither a bound metavariable (hole.meta) nor a declared constructor is
      // UNBOUND: a free uppercase metavar in a closing LF fill cannot typecheck
      // ("Expected an LF term-level constant"). SOUND ONLY when hole.meta is
      // COMPLETE — true for a checker-reported hole in the live move loop, NOT
      // for the pure-function callers (test-prover-prefilter deliberately uses
      // an empty-meta synthetic hole and requires `eq_app D1 D2` to PASS). So
      // the caller opts in via pfOpts.trustScope; validated corpus-wide by the
      // zero-loss differential, not asserted.
      if (pfOpts.trustScope && /^\p{Lu}/u.test(aName)
        && !(hole.meta || []).some((h) => h && h.name === aName)
        && !(hole.ctx || []).some((h) => h && h.name === aName)
        && !resultFamilyOfCtor(code, aName)) return false;
      // (c) existing rigid family-mismatch check.
      const aFam = scope.get(aName);
      if (!aFam) continue; // unknown-typed hyp — can't judge
      const wantFam = headOfConclusion(conclusionOf(String(at)));
      if (!wantFam || !isDeclaredTypeFamily(code, wantFam)) continue;
      if (aFam !== wantFam) return false; // rigid family mismatch — dead fill
    }
  }
  return true;
}

// Is there a `#`/`$`-headed name at BRACKET DEPTH 0 that is not a binder? Those
// are the only positions where a meta object is unwritable-by-construction:
//   legal   `[g |- #p]` · `[g |- #p.1]` · `mlam g, #p =>` · `{#p : #[g |- tm]}`
//   illegal `Ae_a X #p` · `lemma #p` — a parse error, never a type error
// Sound and cheap: purely lexical, no model lookup, mirrors the `"`-name guard.
function bareMetaObjectOutsideBox(text) {
  const s = String(text || '');
  let depth = 0;      // [ ] and { } — both open a meta/binder context
  let inBinders = false; // inside an `mlam …` binder list, until `=>`
  const tok = /(\bmlam\b|=>|⇒|[[\]{}]|[#$][\p{L}\p{N}_'.]*)/gu;
  let m;
  while ((m = tok.exec(s)) !== null) {
    const t = m[0];
    if (t === '[' || t === '{') { depth += 1; continue; }
    if (t === ']' || t === '}') { depth = Math.max(0, depth - 1); continue; }
    if (t === 'mlam') { inBinders = true; continue; } // GENERAL: Beluga's meta-binder keyword, not a name
    if (t === '=>' || t === '⇒') { inBinders = false; continue; }
    if (depth === 0 && !inBinders) return true; // a bare `#…`/`$…`
  }
  return false;
}

// Does constructor `name`'s DECLARATION contain an explicit `{Pi}` binder? Any `{`
// before the declaration's terminator (a depth-agnostic, conservative scan), or a
// declaration we cannot locate at all, answers TRUE — which makes the caller skip
// judging (sound). Terminators: `;`, a `.` followed by whitespace/EOF (so `b.1`
// projections don't cut the scan short), or a newline whose next line opens with
// `|`/`;` (the LF-block arm boundary).
let _ctorPiSrc = null;
let _ctorPiMap = null;


// Can we not even LOCATE `name`'s declaration? Then nothing about it may be
// judged positionally. (The old `ctorDeclHasPi` also answered true for a Pi-
// carrying declaration; that half is obsolete — see the call site.)
function ctorDeclMissing(code, name) {
  return ctorDeclScan(code, name).missing;
}

function ctorDeclScan(code, name) {
  const src = String(code || '');
  if (src !== _ctorPiSrc) { _ctorPiSrc = src; _ctorPiMap = new Map(); }
  if (_ctorPiMap.has(name)) return _ctorPiMap.get(name);
  const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\n|\\|)\\s*${esc}\\s*:`, 'g');
  let m;
  let found = false;
  let hasPi = false;
  while ((m = re.exec(src)) !== null && !hasPi) {
    found = true;
    const rest = src.slice(m.index + m[0].length);
    let end = rest.length;
    for (let i = 0; i < rest.length; i += 1) {
      const ch = rest[i];
      if (ch === ';') { end = i; break; }
      if (ch === '.' && (i + 1 >= rest.length || /\s/.test(rest[i + 1]))) { end = i; break; }
      if (ch === '\n' && /^\s*[|;]/.test(rest.slice(i + 1, i + 40))) { end = i; break; }
    }
    if (rest.slice(0, end).includes('{')) hasPi = true;
  }
  const out = { missing: !found, hasPi };
  _ctorPiMap.set(name, out);
  return out;
}

// Map from an in-scope hypothesis NAME to its rigid declared family head (meta +
// comp binders). Used by the argument-family pre-filter. Only entries whose family
// is a real declared family are included; ambiguous/notation heads are omitted so
// the filter stays sound (an absent entry means "don't judge").

// Map from an in-scope hypothesis NAME to its rigid declared family head (meta +
// comp binders). Used by the argument-family pre-filter. Only entries whose family
// is a real declared family are included; ambiguous/notation heads are omitted so
// the filter stays sound (an absent entry means "don't judge").

function scopeFamilyMap(hole) {
  const m = new Map();
  const add = (name, type) => {
    if (!name || !type) return;
    const f = contextualHead(type);
    if (f && /^[\p{L}_]/u.test(f)) m.set(name, f);
  };
  for (const h of (hole.meta || [])) add(h && h.name, h && h.type);
  for (const c of (hole.ctx || [])) add(c && c.name, c && c.type);
  return m;
}

// Split the goal/term conclusion into top-level tokens (head + args), parens kept
// whole. `eq_app d M1` → ['eq_app','d','M1']; `eq_app (foo x) M1` → 3 toks.

// Split the goal/term conclusion into top-level tokens (head + args), parens kept
// whole. `eq_app d M1` → ['eq_app','d','M1']; `eq_app (foo x) M1` → 3 toks.

function splitTopLevelArgs(concl) {
  const s = String(concl || '').trim();
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    if (/\s/.test(ch) && depth === 0) { if (cur) { out.push(cur); cur = ''; } } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

// The declared family a constructor name belongs to (its result head). Reads the
// AST once via the memoized enumerator; null when `name` isn't a constructor.

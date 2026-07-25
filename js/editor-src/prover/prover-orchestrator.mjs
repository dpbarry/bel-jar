// Live search orchestration: BelJar drives, the checker certifies.
// Move generation lives in prover-hyp / prover-moves / prover-candidates.
// Policy / captions / certify stay in their own modules (re-exported below).

import {
  decomposeContextual,
  headOfConclusion,
  typeFamilyHead,
  enumerateConstructorsTyped,
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
  patternMetavars,
} from './hole-split.mjs';
import { synthesize, demandSplitVerdict, fillSplitPlan, fillIntroPlan, fillInvertPlan, fillInvertChainPlan } from './prover-synth.mjs';
import { findCounterexample, certifyCounterexample } from './prover-counterexample.mjs';
import { parseHoles } from './hole-report.mjs';
import { reIdentExact } from './ident.mjs';
import {
  parseCompType,
  parseTotality,
  boxedConclusionHead,
  decreasingBoxIndex,
  decreasingArgIndex,
  measureDesignation,
  implicitMetaCount,
  normalizeCtypeSpelling,
  isCtypeApplication,
} from './prover-comp-type.mjs';
import {
  deferDominated,
  withWritableRiskDominated,
  certifyWaveSize,
  classifyVerdict,
} from './prover-policy.mjs';
import { stepMeta, stepLead, letRhsOf, moveHead } from './prover-captions.mjs';
import {
  theoremDeclRange,
  trimForCertify,
  spliceAtHole,
  holesForTheorem,
  normalizeHoleCol,
  holeByteOffset,
  stripLfComments,
  proveOrchestrationCode,
  mapProveHolesToDocHits,
} from './prover-certify.mjs';
import {
  theoremUnderProof,
  pathBodyBefore,
  enrichHoleFromTheorem,
  resolveHoleGoal,
  hypsOf,
  expandedHypsOf,
  sourceWritableNames,
  inventedReportNames,
  textReferencesNames,
  schemaSomeVars,
  branchBodyBefore,
  openCasesAt,
  branchPatternBox,
  letsInBranch,
  boxOf,
  splitCtx,
  termOf,
  freshForHole,
  metaConclusion,
  contextualHead,
  isDeclaredTypeFamily,
  resultFamilyOfCtor,
  holeByteOffsetBridge,
  declStartOffset,
  declBodyEqIndex,
} from './prover-hyp.mjs';
import { recurseTexts, splitTextForCtype } from './prover-moves.mjs';
import { candidateMoves, movePrefilterOk } from './prover-candidates.mjs';

export {
  deferDominated,
  withWritableRiskDominated,
  certifyWaveSize,
  classifyVerdict,
} from './prover-policy.mjs';
export { stepMeta, stepLead } from './prover-captions.mjs';
export {
  theoremDeclRange,
  proveOrchestrationCode,
  trimForCertify,
  mapProveHolesToDocHits,
  spliceAtHole,
} from './prover-certify.mjs';
export {
  theoremUnderProof,
  pathBodyBefore,
  sourceWritableNames,
  inventedReportNames,
  textReferencesNames,
  schemaSomeVars,
} from './prover-hyp.mjs';
export { recurseTexts, splitTextForCtype } from './prover-moves.mjs';
export { candidateMoves, movePrefilterOk } from './prover-candidates.mjs';

// ── Fragment classification for honest STUCK verdicts ───────────────────────
// The move space is CLOSED over Beluga's inductive expression formers (plan
// §1); the copattern `fun` former — the only way to CONSTRUCT an inhabitant of
// a `coinductive`-declared ctype — is deliberately out of scope. So a no-move
// stuck state whose goal CONCLUDES in a coinductive family is not a search
// gap: it is out of fragment BY CONSTRUCTION, and the verdict must say so
// instead of a bare "no-move". Purely syntax-directed — keyed on the
// `coinductive` declaration KEYWORD, never on a family or theorem name.

export function coinductiveFamiliesOf(code) {
  const s = String(code || '');
  // Blank out comments so a commented-out declaration never counts.
  let clean = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === '%') {
      if (s[i + 1] === '{') {
        let depth = 1;
        let j = i + 2;
        while (j < s.length && depth > 0) {
          if (s[j] === '%' && s[j + 1] === '{') { depth += 1; j += 2; continue; }
          if (s[j] === '}' && s[j + 1] === '%') { depth -= 1; j += 2; continue; }
          j += 1;
        }
        clean += ' '.repeat(j - i);
        i = j;
        continue;
      }
      let j = i + 1;
      while (j < s.length && s[j] !== '\n') j += 1;
      clean += ' '.repeat(j - i);
      i = j;
      continue;
    }
    clean += s[i];
    i += 1;
  }
  const out = new Set();
  const re = /(?:^|[\s;.])(?:and\s+)?coinductive\s+([\p{L}_][\p{L}\p{N}_']*)\s*:/gu;
  let m;
  while ((m = re.exec(clean)) !== null) out.add(m[1]);
  return out;
}

// Does this goal type CONCLUDE in one of the given (coinductive) families?
// Strips leading Pi/implicit binder groups `{…}`/`(g:ctx)`, then takes the
// final segment of the top-level arrow spine and reads its head token.

// Does this goal type CONCLUDE in one of the given (coinductive) families?
// Strips leading Pi/implicit binder groups `{…}`/`(g:ctx)`, then takes the
// final segment of the top-level arrow spine and reads its head token.

export function goalConcludesInFamily(goalText, families) {
  if (!families || !families.size) return null;
  let t = String(goalText || '').trim();
  // Peel leading binder groups at depth 0: `{X:…}`, `(g:ctx)`.
  for (;;) {
    const c = t[0];
    if (c !== '{' && c !== '(') break;
    const close = c === '{' ? '}' : ')';
    let depth = 0;
    let j = 0;
    for (; j < t.length; j += 1) {
      if (t[j] === c) depth += 1;
      else if (t[j] === close) { depth -= 1; if (depth === 0) break; }
    }
    if (depth !== 0) break;
    t = t.slice(j + 1).trim();
  }
  // Last segment of the top-level arrow spine.
  let depth = 0;
  let lastCut = 0;
  for (let j = 0; j < t.length; j += 1) {
    const c = t[j];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (c === '→' || (c === '-' && t[j + 1] === '>'))) {
      lastCut = j + (c === '→' ? 1 : 2);
    }
  }
  const concl = t.slice(lastCut).trim();
  const head = /^([\p{L}_][\p{L}\p{N}_']*)/u.exec(concl);
  return head && families.has(head[1]) ? head[1] : null;
}

// ── Measure synthesis (the no-totality-measure class, 178/823 of the library
// corpus) ─────────────────────────────────────────────────────────────────────
// A theorem with boxed premises but NO `/ total … /` never receives IH moves
// (unguarded recursion is unsound), so recursive theorems in that class decline
// honestly. But the measure is PROOF METADATA, not part of the theorem: if the
// search COMPLETES under a hypothetical `/ total N /`, Beluga's own totality
// checker validates that measure when it certifies the final program — sound by
// generate-and-verify, like every other move. So: run the plain search first
// (non-recursive proofs need no pragma); on a no-totality-measure decline, fork
// over hypothetical measures (one per boxed-premise position) and return the
// first completion, whose code carries the pragma. No completion ⇒ the original
// verdict, with the attempted measures recorded.

// ── Measure synthesis (the no-totality-measure class, 178/823 of the library
// corpus) ─────────────────────────────────────────────────────────────────────
// A theorem with boxed premises but NO `/ total … /` never receives IH moves
// (unguarded recursion is unsound), so recursive theorems in that class decline
// honestly. But the measure is PROOF METADATA, not part of the theorem: if the
// search COMPLETES under a hypothetical `/ total N /`, Beluga's own totality
// checker validates that measure when it certifies the final program — sound by
// generate-and-verify, like every other move. So: run the plain search first
// (non-recursive proofs need no pragma); on a no-totality-measure decline, fork
// over hypothetical measures (one per boxed-premise position) and return the
// first completion, whose code carries the pragma. No completion ⇒ the original
// verdict, with the attempted measures recorded.

function spliceTotalityPragma(code, name, pragmaText) {
  const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const head = new RegExp('(?:^|\\n|\\s)(?:rec|proof|and)\\s+' + esc + '\\s*:');
  const hm = head.exec(String(code || ''));
  if (!hm) return null;
  const eq = declBodyEqIndex(String(code), hm.index + hm[0].length);
  if (eq < 0) return null;
  return `${code.slice(0, eq + 1)}\n${pragmaText}${code.slice(eq + 1)}`;
}

// Candidate hypothetical measures, as { pragma, totality } descriptors.
// `/ total N /` counts EXPLICIT arguments — Pi binders AND box premises
// uniformly; implicit `(g:ctx)`-style paren groups don't number. (Ground truth
// established 2026-07-12 by native experiment: `/ total 1 /` on
// `copy : {n:[ |- nat]} [ |- unit] -> [ |- nat]` designates n and certifies;
// `/ total 2 /` is rejected; the named `_`-spine `/ total n (copy n _) /` also
// certifies.) Positions proposed: every boxed premise (index form) AND every
// explicit OBJECT-Pi binder (`{M : [Ψ ⊢ A]}` — induction on a Pi-bound term is
// the standard idiom; measured 22/148 of the residual no-totality class recurse
// there). Pi positions use the NAMED `_`-spine form because the D6 pi-object
// split gate keys on the measure NAMING the binder; the spine convention
// (non-box premises + implicit metas + box premises) mirrors measureDesignation
// exactly, and Beluga arbitrates validity at each fork's base check (cheap).
// Context and substitution binders are not measure positions. Cap 4.

// Candidate hypothetical measures, as { pragma, totality } descriptors.
// `/ total N /` counts EXPLICIT arguments — Pi binders AND box premises
// uniformly; implicit `(g:ctx)`-style paren groups don't number. (Ground truth
// established 2026-07-12 by native experiment: `/ total 1 /` on
// `copy : {n:[ |- nat]} [ |- unit] -> [ |- nat]` designates n and certifies;
// `/ total 2 /` is rejected; the named `_`-spine `/ total n (copy n _) /` also
// certifies.) Positions proposed: every boxed premise (index form) AND every
// explicit OBJECT-Pi binder (`{M : [Ψ ⊢ A]}` — induction on a Pi-bound term is
// the standard idiom; measured 22/148 of the residual no-totality class recurse
// there). Pi positions use the NAMED `_`-spine form because the D6 pi-object
// split gate keys on the measure NAMING the binder; the spine convention
// (non-box premises + implicit metas + box premises) mirrors measureDesignation
// exactly, and Beluga arbitrates validity at each fork's base check (cheap).
// Context and substitution binders are not measure positions. Cap 4.

export function hypotheticalMeasures(thm) { // exported for the S2 class audit (scripts), 2026-07-21
  const prem = (thm && thm.compType && thm.compType.premises) || [];
  const out = [];
  const nonBox = prem.filter((p) => p && p.kind !== 'box');
  const boxCount = prem.filter((p) => p && p.kind === 'box').length;
  let n = 0;
  for (const p of prem) {
    const raw = String((p && p.raw) || '').trim();
    if (raw.startsWith('(')) continue; // implicit group — not numbered
    n += 1;
    if (!p) continue;
    if (p.kind === 'box') {
      out.push({ pragma: `/ total ${n} /`, totality: { kind: 'index', index: n } });
      continue;
    }
    if (p.kind !== 'pi') continue;
    const ci = raw.indexOf(':');
    if (ci < 0) continue;
    const vn = raw.slice(1, ci).trim();
    const vt = raw.slice(ci + 1).trim();
    if (!vt.startsWith('[') || vn.startsWith('$') || vn.startsWith('#')) continue;
    const lc = vn.toLowerCase();
    if (!/^\p{Ll}[\p{L}\p{N}_']*$/u.test(lc)) continue; // measure-fork: letter binders only (Phase B)
    const spineLen = nonBox.length + implicitMetaCount(thm.compType) + boxCount;
    const spineIdx = nonBox.indexOf(p);
    if (spineIdx < 0 || spineIdx >= spineLen) continue;
    const args = new Array(spineLen).fill('_');
    args[spineIdx] = lc;
    out.push({
      pragma: `/ total ${lc} (${thm.name} ${args.join(' ')}) /`,
      totality: { kind: 'named', name: lc, args },
    });
  }
  return out.slice(0, 4);
}

/**
 * Phase G.1 — feasible-only blocking cause for a stuck result. Derived from the
 * stuck reason + theorem shape (measure candidates, coinductive family), never
 * speculated cuts. Returns null when no honest actionable hint exists.
 */

/**
 * Phase G.1 — feasible-only blocking cause for a stuck result. Derived from the
 * stuck reason + theorem shape (measure candidates, coinductive family), never
 * speculated cuts. Returns null when no honest actionable hint exists.
 */

export function stuckHintFor(stuck, thm) {
  if (!stuck || !stuck.reason) return null;
  const reason = stuck.reason;
  if (reason === 'no-totality-measure') { // GENERAL: stuck reason
    const ms = hypotheticalMeasures(thm);
    const pragmas = ms.map((m) => m.pragma);
    return {
      message: pragmas.length
        ? `likely needs structural recursion — try ${pragmas[0].trim()}`
        : 'likely needs a / total … / measure',
      pragmas,
    };
  }
  if (reason === 'coinductive-out-of-fragment') { // GENERAL: stuck reason
    return {
      message: stuck.family
        ? `goal concludes in coinductive family ${stuck.family} — beyond the inductive fragment`
        : 'goal is coinductive — beyond the inductive fragment',
    };
  }
  if (reason === 'disproved') { // GENERAL: stuck reason
    return { message: 'counterexample: the statement is false on a ground instance' };
  }
  if (reason === 'search-bound') { // GENERAL: stuck reason
    return { message: 'synthesis hit its search bound — not a decidable no' };
  }
  if (reason === 'step-bound') { // GENERAL: stuck reason
    return { message: 'step budget exhausted — not a decidable no' };
  }
  if (reason === 'no-move' && stuck.noCutFree) { // GENERAL: stuck reason
    return {
      message: 'analytic move space exhausted — no cut-free proof in the fragment; '
        + 'a lemma or generalized induction hypothesis (a cut) is required',
    };
  }
  if (reason === 'no-move' && stuck.closest) { // GENERAL: stuck reason
    return { message: `no certifying move; closest tried: ${stuck.closest}` };
  }
  return null;
}


function attachStuckHint(stuck, thm) {
  if (!stuck) return stuck;
  const h = stuckHintFor(stuck, thm);
  if (!h) return stuck;
  stuck.hint = h.message;
  if (h.pragmas && h.pragmas.length) stuck.measurePragmas = h.pragmas;
  return stuck;
}


export async function proveProgram(initialCode, thm, oracle, opts = {}) {
  const first = await proveProgramCore(initialCode, thm, oracle, opts);
  if (first.complete || opts.noMeasureSynthesis) return first;
  if (!first.stuck || first.stuck.reason !== 'no-totality-measure') return first;
  const measures = hypotheticalMeasures(thm);
  const tried = [];
  // Fork attempts run with STEP/TRACE callbacks suppressed: streamed entries
  // must mirror the RETURNED trace (pinned in test-prover-trace), and the plain
  // run already streamed. A winning fork returns its own steps/trace whole.
  // The PULSE channel stays LIVE with a fork prefix — muting it produced
  // minutes of dead air between the last greyed candidate and "failed search"
  // while whole silent sub-searches ran (user report, 2026-07-19). Pulses are
  // status, not trace: the mirror pin is untouched.
  let forkChecks = 0;
  for (let fi = 0; fi < measures.length; fi += 1) {
    const d = measures[fi];
    if (opts.shouldCancel && opts.shouldCancel()) break;
    const forked = spliceTotalityPragma(initialCode, thm && thm.name, d.pragma);
    if (!forked) break;
    tried.push(d.pragma);
    if (opts.onPulse) {
      opts.onPulse({ label: `No totality measure — trying synthesized ${d.pragma.trim()} (${fi + 1}/${measures.length})…` });
    }
    const forkPulse = opts.onPulse
      ? (p) => opts.onPulse(p && p.label
        ? { ...p, label: `${d.pragma.trim()} · ${p.label}` }
        : p)
      : undefined;
    const quiet = { ...opts, onStep: undefined, onTraceEntry: undefined, onPulse: forkPulse };
    const thm2 = { ...thm, totality: d.totality };
    const res = await proveProgramCore(forked, thm2, oracle, quiet);
    forkChecks += res.checkCount || 0;
    if (res.complete) {
      res.synthesizedMeasure = d.pragma; // the emitted code carries the pragma
      res.checkCount = (first.checkCount || 0) + forkChecks;
      return res;
    }
  }
  first.stuck.measuresTried = tried;
  first.checkCount = (first.checkCount || 0) + forkChecks;
  return first;
}

// ── Live orchestration: BelJar drives, the checker certifies ─────────────────
// Solve EVERY hole in `code` for the theorem `thm`, by repeatedly: re-check the
// program to read its holes (with goal/ctx/meta), take the first OPEN hole,
// generate candidate moves from our model, and accept the first move that
// type-checks AND does not increase the error count. Loop until no holes remain
// (PROVEN) or a hole has no working move (STUCK — honest partial).
//
// `oracle(code)` → Promise<{ ok, output }> (BelugaClient.checkResult, injected so
// this is testable with a stub). Returns
//   { complete, code, steps:[{move, rationale, goal}], stuck?, checkCount }.
// `checkCount` = Beluga certifications only (every runOracle → oracle call), not
// guard/prefilter skips. Phase E instrument: timeouts are check-count bugs.

// ── Live orchestration: BelJar drives, the checker certifies ─────────────────
// Solve EVERY hole in `code` for the theorem `thm`, by repeatedly: re-check the
// program to read its holes (with goal/ctx/meta), take the first OPEN hole,
// generate candidate moves from our model, and accept the first move that
// type-checks AND does not increase the error count. Loop until no holes remain
// (PROVEN) or a hole has no working move (STUCK — honest partial).
//
// `oracle(code)` → Promise<{ ok, output }> (BelugaClient.checkResult, injected so
// this is testable with a stub). Returns
//   { complete, code, steps:[{move, rationale, goal}], stuck?, checkCount }.
// `checkCount` = Beluga certifications only (every runOracle → oracle call), not
// guard/prefilter skips. Phase E instrument: timeouts are check-count bugs.

async function proveProgramCore(initialCode, thm, oracle, opts = {}) {
  const maxSteps = opts.maxSteps || 200;
  let code = String(initialCode);
  const steps = [];
  const hardCancel = () => opts.shouldCancel && opts.shouldCancel();
  const paused = () => opts.shouldPause && opts.shouldPause();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitWhilePaused() {
    while (paused() && !hardCancel()) await sleep(50);
  }
  // Move-space trace (opts.collectTrace): one entry per visited hole with every
  // candidate's verdict — the data the Move-space view and the stuck card render.
  const trace = opts.collectTrace ? [] : null;
  let oracleCalls = 0;
  let oracleCallsAtStep = 0;
  const finish = (r) => {
    r.checkCount = oracleCalls;
    if (r.stuck) attachStuckHint(r.stuck, thm);
    const v = classifyVerdict(r);
    r.verdict = v.verdict;
    r.tier = v.tier;
    return r;
  };

  // Phase I: fail-closed DISPROOF before search. Type-level CE, then Beluga-gate
  // (premises check + conclusion reject-fill fails). Opt out of the gate with
  // opts.counterexampleCertify === false (type-level only, zero checks).
  if (!opts.noCounterexample && thm && thm.compType) {
    if (opts.onPulse) opts.onPulse({ label: 'Probing for a counterexample…' });
    const ce = findCounterexample(thm.compType, initialCode, opts.counterexample || {});
    if (ce) {
      let certified = false;
      if (opts.counterexampleCertify === false) {
        certified = false; // type-level only
      } else {
        const cert = await certifyCounterexample(ce, initialCode, oracle);
        oracleCalls += cert.checkCount || 0;
        if (!cert.ok) {
          // Beluga gate declined — do not claim DISPROVED; fall through to search.
        } else {
          certified = true;
        }
      }
      if (certified || opts.counterexampleCertify === false) {
        return finish({
          complete: false,
          code,
          steps,
          stuck: {
            reason: 'disproved', // GENERAL: Phase-I verdict tag (§3.3), not a Beluga name
            goal: thm.compType.conclusion,
            counterexample: certified ? { ...ce, certified: true } : ce,
          },
        });
      }
    }
  }

  // purpose: string → status label; false → silent (caller already pulsed a
  // better label, e.g. "Trying intro…"); omitted → generic Beluga check.
  // Never pulse a call counter — motion without meaning is still dead air
  // from the user's seat (2026-07-22). Status-line contract: any span that
  // can exceed ~1s must leave a descriptive pulse visible.
  const runOracle = async (src, purpose) => {
    await waitWhilePaused();
    if (hardCancel()) return { ok: false, output: '', cancelled: true };
    if (opts.onPulse && purpose !== false) {
      opts.onPulse({ label: purpose || 'Checking with Beluga…' });
    }
    oracleCalls += 1;
    let res;
    try {
      res = await oracle(src);
    } catch (err) {
      if (paused() && !hardCancel()) {
        await waitWhilePaused();
        return runOracle(src, purpose);
      }
      throw err;
    }
    if (paused() && !hardCancel()) {
      await waitWhilePaused();
      return runOracle(src, purpose);
    }
    if (hardCancel()) return { ok: false, output: '', cancelled: true };
    return res;
  };

  // Baseline: how many errors does the program have right now (a partial proof
  // with holes still checks ok; errors come only from a genuinely bad step).
  if (hardCancel()) {
    return finish({ complete: false, code, steps, stuck: { reason: 'cancelled' } });
  }
  const base = await runOracle(code, 'Reading open goals…');
  if (base.cancelled) {
    return finish({ complete: false, code, steps, stuck: { reason: 'cancelled' } });
  }
  let baseErrors = countErrors(base);

  // PROGRESS guard: a move must change the open-goal state. We remember each
  // hole-set fingerprint we've been in; a move whose result revisits one is a
  // no-progress cycle (e.g. inverting an already-determined hypothesis to itself)
  // and is rejected — this keeps the search well-founded regardless of move kind.
  const seen = new Set();
  // Alpha-canonical fingerprint of the whole open-goal multiset (ctxSig already
  // folds the goal + hypotheses into one renaming-invariant string per hole).
  const holeSig = (h) => ctxSig(h) + '§' + branchBodyBefore(code, h).replace(/\s+/g, ' ').trim();
  const fingerprint = (holes) => holes.map(holeSig).sort().join('||');
  const baseHoles = parseHoles(base.output || '');
  seen.add(fingerprint(holesForTheorem(code, thm, baseHoles)));

  // Speculative-binding budget per goal: a `let … in ?` (recurse/invert) that adds
  // a hypothesis but leaves the leftmost GOAL alpha-unchanged is "speculative" — it
  // only pays off once a later move consumes it. We allow a bounded number of such
  // additions per distinct goal, then require a goal-CHANGING move. This kills the
  // speculative-`let` churn (e.g. `dl_uniq X2 X2` ad infinitum) generally, without
  // a per-move special case. Budget ≥ the theorem's premise count (enough lets to
  // assemble any single fill) plus slack.
  const specBudget = Math.max(4, 2 * ((thm && thm.compType && thm.compType.premises.length) || 1));
  const specCount = new Map(); // hole fingerprint → speculative additions so far
  // §6.2 №1 interim bound: maximum enclosing-case nesting depth at which a new
  // SPLIT may still be proposed on a path. Structural proofs in the corpus
  // need ≤3 (natval 2, dl_uniq 2, str_step 1); 6 leaves headroom while cutting
  // the strictly-refining descent (each level = one manufactured meta). A hole
  // that declines only because of this budget reports search-bound, honestly.
  const SPLIT_DEPTH_BUDGET = 6;
  // Zero-progress acceptances afforded per ANCESTOR PATH (closed siblings
  // excluded — mstep_leq_2's arms each legitimately spend 2 lemma-lets, and a
  // chronological counter summed siblings into a false overflow, measured
  // 2026-07-19). Derived, not counted: accepted no-op steps carry `zp: true`,
  // and the check counts the flagged steps whose text is on the current
  // hole's `pathBodyBefore` — `steps.pop()` on backtrack un-counts for free.
  // Real proofs need ≤3 per path; the eval_det runaway (nested descent, so
  // its junk lets pile on ONE path) needed 30+.
  const ZP_BUDGET = 4;

  // §7 INVARIANT 2 — per-path state canonicity. The junk-free state at each
  // enclosing SPLIT point of the current path, depth-pruned every iteration
  // (leftmost/DFS focus order makes nesting depth a sufficient path key). A
  // candidate that creates a hole STRICTLY DEEPER than an ancestor with an
  // α-EQUAL junk-free state re-poses that ancestor's obligation with nothing
  // consumed — refuted. Sibling arms sit at EQUAL depth and are never compared,
  // so legitimate α-repeats across arms stay legal.
  const pathAnc = []; // [{ depth, sig }]

  // Carry the accepting candidate's oracle result into the next step: the loop-top
  // check of `code` is byte-identical to the check that just accepted it (and, on
  // the first iteration, to `base`), so re-running it is a pure waste of one full
  // checker round-trip per accepted step.
  let carried = { forCode: code, res: base };

  // §6.2 №4 (scoped) — CHRONOLOGICAL BACKTRACKING over accepted moves. The
  // greedy loop's one accepted junk move used to poison the whole run (the
  // measured 5-target ledger: unique_eval's eager invert-chain, tps, …). Now
  // every acceptance pushes a DECISION (the pre-acceptance state, snapshotted),
  // and a no-move stuck pops back to the nearest decision and tries the NEXT
  // candidate there — the accepted text joins a per-code-state skip set, and
  // candidateMoves regenerates deterministically. Termination is by the
  // existing iteration cap (every backtrack visit consumes a step — honest
  // `step-bound` on exhaustion) plus monotonically-growing skip sets; each
  // backtrack is ZERO-check (the decision stores its loop-top result). A stuck
  // that survives means every alternative prefix was exhausted too — strictly
  // MORE honest for the G.3 certificate, never less.
  const backtrackSkip = new Map(); // code string -> Set of accepted-then-abandoned texts
  const decisions = []; // [{ code, res, seen, specCount, pathAnc, baseErrors }]
  // G.3 accounting over the DECISION TREE: the certificate belongs to the
  // whole search, so it fires at the final (empty-stack) stuck iff every
  // FRESH dead end en route was per-hole certifiable. A stuck at a node whose
  // candidates include backtrack-skips is a tree replay, not a leaf.
  let deadEnds = 0;
  let allDeadEndsCertified = true;
  // A SEARCH-BOUND dead end is a property of its PATH (a per-path bound
  // truncated that hole's candidate list), not of the decision tree — it must
  // backtrack like a no-move, but the tree is then provably NOT exhausted:
  // the final verdict stays an honest `search-bound` and the certificate
  // never fires (measured on unique_eval 2026-07-18: the run aborted at a
  // bounded leaf with the winning single-invert sibling still on the stack).
  let boundedLeafSeen = false;
  // A rejection is deterministic per (code state, candidate text) — cache it so
  // a backtrack's re-scan of the hole never re-pays the rejected prefix.
  const rejectCache = new Map(); // code string -> Set of checker-rejected texts

  // Phase G.3 — the invertible-steps condition of the NO-CUT-FREE-PROOF
  // certificate. Every accepted move kind except an OPEN FILL is provability-
  // PRESERVING: intro introduces the goal's own telescope, split is coverage-
  // total case analysis (an invertible left rule), invert is deterministic,
  // recurse/lemma lets only ADD hypotheses (weakening), and hole-free closers
  // are terminal. An open fill commits constructor structure with residual
  // holes — the one accepted kind that can make a provable theorem look stuck.
  let unsafeAccepted = false;

  for (let step = 0; step < maxSteps; step += 1) {
    await waitWhilePaused();
    if (hardCancel()) {
      return finish({ complete: false, code, steps, stuck: { reason: 'cancelled' } });
    }
    const checked = (carried && carried.forCode === code)
      ? carried.res
      : await runOracle(code, steps.length ? 'Checking the proof state…' : 'Reading open goals…');
    carried = null;
    if (checked.cancelled) {
      return finish({ complete: false, code, steps, stuck: { reason: 'cancelled' } });
    }
    let holes = holesForTheorem(code, thm, parseHoles(checked.output || ''));
    if (!holes.length) {
      const syn = syntacticHoleInTheorem(code, thm);
      if (!syn) {
        return finish({ complete: !!(checked.ok && countErrors(checked) <= baseErrors), code, steps, trace: trace || undefined });
      }
      // A `?` remains but Beluga reported no holes for it. If the check errored,
      // the report was cut short — searching blind would guess; decline honestly.
      if (countErrors(checked) > 0) {
        return finish({
          complete: false,
          code,
          steps,
          stuck: { reason: 'file-errors', error: firstErrorOf(checked.output) || 'the program does not check' },
        });
      }
      holes = [syn];
    }
    const armLines = holes.map((h) => caseArmLine(code, h));
    const focusArm = Math.min(...armLines);
    const pool = holes.filter((h, i) => armLines[i] === focusArm);
    const rawHole = [...pool].sort((a, b) => scoreHole(b, code) - scoreHole(a, code))[0];
    let hole = resolveHoleGoal(
      normalizeHoleCol(code, enrichHoleFromTheorem(rawHole, thm, code)),
      thm,
    );
    const goalKey = alphaGoal(hole.goal);
    const branchAtHole = branchPatternBox(code, hole);
    const holeCtxSnap = (hole.ctx || []).map((b) => ({ name: b.name, type: b.type }));
    const holeMetaSnap = (hole.meta || []).map((b) => ({ name: b.name, type: b.type }));
    const focusMeta = {
      armLine: caseArmLine(code, hole),
      score: scoreHole(hole, code),
      siblingCount: holes.length,
    };
    if (opts.onPulse) {
      opts.onPulse({
        label: steps.length === 0
          ? 'Looking for a first move…'
          : `Looking for the next move… (after step ${steps.length})`,
        goal: hole.goal,
      });
    }
    let moves = candidateMoves(hole, code, thm);
    if (!moves.length && (hole.ctx || []).length) {
      const retry = resolveHoleGoal(
        enrichHoleFromTheorem({ ...hole, ctx: [] }, thm, code),
        thm,
      );
      const retryMoves = candidateMoves(retry, code, thm);
      if (retryMoves.length) {
        hole = retry;
        moves = retryMoves;
      }
    }
    // WRITABILITY (ctx-var rename drift): a re-elaboration may REPORT an
    // implicit context variable under a fresh name (l → g) while the SOURCE
    // still binds the original (the annotating let / theorem header spells l).
    // A candidate referencing the reported name is then rejected "free context
    // variable is illegal". When exactly ONE reported ctx name is
    // source-unbound and exactly ONE source-spelled ctx name is missing from
    // the report, they denote the same variable — offer the source spelling as
    // an additional checker-arbitrated variant of each affected candidate.
    {
      const srcText = pathBodyBefore(code, hole) + '\n' + (thm && thm.compType
        ? [...thm.compType.premises.map((p) => String(p.raw || '')), String(thm.compType.conclusion || '')].join('\n')
        : '');
      const srcCtxNames = new Set();
      for (const mm of srcText.matchAll(/\[\s*(\p{Ll}[\p{L}\p{N}_']*)\s*(?:\||\])/gu)) srcCtxNames.add(mm[1]);
      const reportedNames = new Set([...(hole.meta || []), ...(hole.ctx || [])]
        .map((b) => b && b.name).filter(Boolean));
      const reportedCtx = (hole.meta || []).filter((b) => b && b.name && b.type
        && /^\p{Ll}/u.test(String(b.name))
        && /^[\p{L}_][\p{L}\p{N}_']*$/u.test(String(b.type).trim().replace(/^\(\s*\|-\s*/, '').replace(/\)\s*$/, '')))
        .map((b) => String(b.name));
      const unbound = reportedCtx.filter((n2) => !srcCtxNames.has(n2));
      const missing = [...srcCtxNames].filter((n2) => !reportedNames.has(n2));
      if (unbound.length === 1 && missing.length === 1) {
        const re = new RegExp(`(^|[^A-Za-z0-9_'])${unbound[0]}([^A-Za-z0-9_']|$)`, 'g');
        moves = moves.flatMap((mv) => {
          if (!mv || !mv.text || !re.test(mv.text)) { re.lastIndex = 0; return [mv]; }
          re.lastIndex = 0;
          const mapped = mv.text.replace(re, `$1${missing[0]}$2`).replace(re, `$1${missing[0]}$2`);
          re.lastIndex = 0;
          return [mv, { ...mv, text: mapped, rationale: `${mv.rationale || ''} (source ctx spelling)` }];
        });
      }
      // WRITABILITY (implicit ctx var, the ctxToEnv instance — D14 family): a
      // goal context that is a bare IMPLICITLY-quantified variable (spelled in
      // the theorem type, bound by NO explicit binder) may be unwritable in
      // the body — `[h |- nil]` rejects "free context variable is illegal"
      // while the INFERRED spelling `[_ |- nil]` certifies. Dual-spell every
      // fill citing such a context (additive variant, checker arbitrates —
      // the same doctrine as D3/D11/D14).
      {
        const gd = decomposeContextual(hole.goal);
        const gctx = gd && String(gd.ctx || '').trim();
        if (gctx && /^\p{Ll}[\p{L}\p{N}_']*$/u.test(gctx) && thm && thm.compType
          && !thm.compType.premises.some((p) => p && p.binder === gctx)) {
          const boxRe = new RegExp(`\\[\\s*${gctx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(\\||⊢)`, 'g');
          moves = moves.flatMap((mv) => {
            if (!mv || mv.kind !== 'fill' || !mv.text) return [mv]; // GENERAL: move-kind tag
            if (!boxRe.test(mv.text)) { boxRe.lastIndex = 0; return [mv]; }
            boxRe.lastIndex = 0;
            const mapped = mv.text.replace(boxRe, '[_ $1');
            boxRe.lastIndex = 0;
            return [mv, {
              ...mv,
              text: mapped,
              rationale: `${mv.rationale || ''} (inferred ctx spelling)`,
            }];
          });
        }
      }
    }
    // Per-path canonicity bookkeeping for the (final) focused hole: prune stack
    // entries not on this hole's ancestor chain, snapshot its junk-free state.
    const holeDepth = openCasesAt(code, hole).length;
    // Decl-scoped ABSOLUTE depth (split budget only — relative compares keep
    // the whole-prefix count they were built on).
    const holeDeclDepth = openCasesAt(
      code, hole, declStartOffset(code, holeByteOffsetBridge(code, hole)),
    ).length;
    while (pathAnc.length && pathAnc[pathAnc.length - 1].depth >= holeDepth) pathAnc.pop();
    const holeSigJF = junkFreeSig(code, hole);

    // Cheap pre-guards, hoisted: they read only step-invariant state (`code`,
    // `hole`), so evaluating them up front is identical to the old lazy order.
    // Duplicate-IH-call guard: a `recurse` move whose `let … = <call> in`
    // re-derives a call ALREADY present IN THE CURRENT BRANCH is redundant (the
    // multi-arg loop re-emitting `dl_uniq [⊢ X2] [⊢ X4]`). Scoped to (a) recurse
    // only — an inversion's RHS is a bare hypothesis name that legitimately
    // recurs — and (b) the CURRENT BRANCH body, since pattern var names like `X1`
    // repeat across sibling branches and must not cross-block. Then the SOUND
    // PRE-FILTER: skip a candidate the checker would provably reject, without
    // paying the round-trip.
    const cands = [];
    // Phase G.3 — per-hole exhaustion taints. Only the STUCK hole's skips matter
    // (advanced holes accepted a provability-preserving move, so their untried
    // alternatives are irrelevant). Independent of the tried-row cap.
    // (Dominated moves are no longer a taint — G.3b defers them to the queue's
    // tail, so at a stuck hole they are genuinely tried, never skipped.)
    let budgetSkips = 0;   // budget-class guards (chain cap, spec budget) — never soundness
    let spliceFails = 0;   // a generated candidate silently unspliceable
    // Per-hole TRIED record (the Move-space view + the stuck card): every
    // candidate that reached this hole, with its verdict — guard-skipped,
    // checker-rejected (with the objection), or accepted.
    const triedCap = Math.max(80, opts.triedCap || 200);
    // Always record tried rows (Phase G.1 closest-hint); attach to trace when requested.
    const tried = [];
    const recordTried = (mv, verdict, reason, textOverride) => {
      if (tried.length >= triedCap) return;
      const text = textOverride != null ? textOverride : mv.text;
      tried.push({
        kind: mv.kind,
        text,
        head: moveHead(text),
        rationale: mv.rationale || null,
        verdict,
        reason: reason || null,
      });
    };
    const traceSkip = (mv, reason) => {
      recordTried(mv, 'guard', reason);
    };
    // A candidate that reached the checker has RESOLVED (accepted/rejected/guard):
    // record it in the trace AND announce it to the live reel. `head` is the exact
    // one-line term already computed for the Move-space view — nothing recomputed.
    const reportVerdict = (mv, verdict, reason, textOverride) => {
      recordTried(mv, verdict, reason, textOverride);
      const text = textOverride != null ? textOverride : mv.text;
      if (opts.onPulse) {
        opts.onPulse({ verdict: { kind: mv.kind, head: moveHead(text), verdict, reason: reason || null } });
      }
    };
    const btSkip = backtrackSkip.get(code);
    const rjSkip = rejectCache.get(code);
    let btSkippedHere = 0;
    // §6.2 №1 INTERIM (sanctioned by the master plan; the full closure is
    // plan-driven splitting): a per-path SPLIT-DEPTH budget. A strictly-
    // refining demanded descent manufactures a fresh splittable meta per
    // level (eval_det measured 2026-07-19: split [X10] → synth → split [X12]
    // → … — every level obligation-productive, none α-repeating), so neither
    // per-path canonicity nor the demand filter bounds it. Deeper-than-budget
    // splits are BUDGET skips: the dead end reports search-bound (never
    // no-move, D8), the exhaustion certificate is forfeited, and P14
    // backtracking recovers shallower alternatives instead of aborting.
    let splitDepthBounded = false;
    for (const mv of deferDominated(moves)) {
      if (mv.skipCertify) { traceSkip(mv, 'vacuous-probe split: vocabulary-only (taints exhaustion)'); continue; }
      if (mv.kind === 'split' && holeDeclDepth >= SPLIT_DEPTH_BUDGET) { // GENERAL: move-kind tag
        splitDepthBounded = true;
        budgetSkips += 1;
        traceSkip(mv, `split-depth budget (${SPLIT_DEPTH_BUDGET}) for this path`);
        continue;
      }
      if (btSkip && btSkip.has(mv.text)) { btSkippedHere += 1; traceSkip(mv, 'backtracked: this acceptance led to a dead end'); continue; }
      if (rjSkip && rjSkip.has(mv.text)) { traceSkip(mv, 'rejected on a prior visit (cached)'); continue; }
      // PROGRESS DISCIPLINE (search control, E1): a speculative lemma-let leaves
      // the goal unchanged, so an unbounded run of them is junk that certifies —
      // each costs a checker call and a step while starving the move that
      // actually analyses the goal. Legitimate chains (str_wtp's
      // recurse→lemma→lemma→fill) use at most TWO in a row; cap there.
      if (mv.kind === 'lemma') {
        let run = 0;
        for (let k = steps.length - 1; k >= 0; k -= 1) {
          if (steps[k].move === 'lemma' && (steps[k].branch || null) === (branchAtHole || null)) run += 1;
          else break;
        }
        if (run >= 2) { budgetSkips += 1; traceSkip(mv, 'speculative-let chain cap (no goal progress)'); continue; }
      }
      if (mv.kind === 'recurse' || mv.kind === 'lemma') {
        const rhs = letRhsOf(mv.text);
        // PATH-scoped (§7 per-path discipline): an ancestor arm's binding is in
        // scope here, so re-deriving the same call anywhere on the ancestor
        // chain is redundant — a nested split must not launder this guard.
        if (rhs && pathBodyBefore(code, hole).includes(rhs)) { traceSkip(mv, 'duplicate call already on this path'); continue; }
        // SELF-CHAINING guard (search control, E1): a lemma applied to a result
        // that the SAME lemma produced earlier in this branch derives an orbit,
        // not progress — each application's fresh result defeats the exact-
        // duplicate guard and floods the step budget (ceq-closure shapes).
        // Chaining DIFFERENT lemmas (str_wtp/str_step) is untouched.
        if (rhs) {
          const callee = rhs.split(/\s+/)[0];
          const argNames = new Set((rhs.match(/[\p{L}_][\p{L}\p{N}_']*/gu) || []).slice(1));
          const body = pathBodyBefore(code, hole);
          const re = new RegExp(`let\\s+\\[[^\\]]*\\|-\\s*([\p{L}_][\p{L}\p{N}_']*)[^\\]]*\\]\\s*=\\s*${callee.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`, 'g');
          let selfChain = false;
          let mm;
          while ((mm = re.exec(body))) {
            if (argNames.has(mm[1])) { selfChain = true; break; }
          }
          if (selfChain) { traceSkip(mv, 'self-chaining: argument is this call’s own earlier result'); continue; }
        }
      }
      if (mv.kind === 'invert') {
        const rhs = letRhsOf(mv.text);
        if (rhs && pathBodyBefore(code, hole).includes(`= ${rhs} in`)) { traceSkip(mv, 'hypothesis already destructured on this path'); continue; }
      }
      if (!movePrefilterOk(mv, hole, code, { trustScope: true })) { traceSkip(mv, 'pre-filter: constructor/argument family or scope cannot match'); continue; }
      const spliced = spliceAtHole(code, hole, mv.text);
      if (spliced == null) { spliceFails += 1; continue; }
      cands.push({ mv, spliced });
    }

    // WAVE-PARALLEL trial: fire the next few candidates' checks CONCURRENTLY
    // (a prover `check` is stateless worker-side and the client pools prover
    // workers), then scan the results IN RANK ORDER with the exact sequential
    // acceptance logic — so the accepted move is byte-identical to the serial
    // search, at ~wave× less wall time on the failing-candidate scans. A
    // later-rank candidate's error is discarded when an earlier one accepts
    // (the serial loop would never have run it).
    // Phase E.1: closing / hole-free heads certify alone (wave=1) so checkCount
    // tracks proof size, not speculative siblings.
    let advanced = false;
    const defaultWave = Math.max(1, opts.wave || 3);
    for (let wi = 0; wi < cands.length && !advanced; ) {
      await waitWhilePaused();
      if (hardCancel()) {
        return finish({ complete: false, code, steps, stuck: { reason: 'cancelled' } });
      }
      const waveSize = certifyWaveSize(cands[wi].mv, defaultWave);
      const batch = cands.slice(wi, wi + waveSize);
      wi += waveSize;
      // Live reel feed: announce the whole wave's candidate terms up front (kind +
      // one-line head), so the UI can stream the actual moves being attempted — not
      // just the first candidate's kind. `verdict` events below report each outcome.
      if (opts.onPulse) {
        opts.onPulse({
          trying: batch[0].mv.kind,
          goal: hole.goal,
          branch: branchPatternBox(code, hole),
          wave: batch.map((c) => ({ kind: c.mv.kind, head: moveHead(c.mv.text) })),
        });
      }
      // E.9 — certify against the candidate's dependency CLOSURE, not the
      // world (the measured timeout mechanism is prefix re-elaboration × size:
      // ~1.5s/check on 48KB where the same theorems complete on 20KB). A pure
      // COST transform: verdicts are identical by construction (any trimmed
      // doubt falls back to the full program below). Cost-model gate:
      // opts.certifyTrim === false disables it — the native oracle's cost is
      // per-CALL (process spawn), the browser's is per-BYTE (wasm
      // elaboration); the trim wins bytes at the price of occasional extra
      // calls, so it is ON for the browser and OFF for the dev oracle.
      // Splits keep the full program (pruneOneBranch reads its line numbers);
      // a nonzero error baseline keeps the full program (comparability).
      const certPlans = batch.map((c) => {
        if (opts.certifyTrim === false || baseErrors !== 0) return null;
        const t = trimForCertify(c.spliced, thm && thm.name);
        if (!t || t.code.length >= c.spliced.length * 0.8) return null; // no material win
        return t;
      });
      // Silent certify: the wave pulse already set "Trying intro…" — don't
      // clobber it with a generic Beluga check label.
      const settled = await Promise.all(batch.map((c, ci) => runOracle(
        certPlans[ci] ? certPlans[ci].code : c.spliced,
        false,
      ).then((res) => ({ res }), (err) => ({ err }))));
      for (let bi = 0; bi < batch.length; bi += 1) {
      const { mv } = batch[bi];
      let effText = mv.text;
      let { spliced } = batch[bi];
      if (settled[bi].err) throw settled[bi].err;
      let res = settled[bi].res;
      if (res.cancelled) {
        return finish({ complete: false, code, steps, stuck: { reason: 'cancelled' } });
      }
      // E.9 arbitration: a trimmed OK must re-run FULL (acceptance bookkeeping —
      // holes, fingerprints, the carried state — lives in the full program's
      // coordinates); a trimmed REJECTION whose error is not attributable to
      // the target decl may be a trim artifact — fall back to the full program
      // (fail-open; a false rejection would be a completeness bug).
      // Splits are arbitrated in the PRUNE block below — their rejected output
      // feeds pruneOneBranch after a line-offset translation.
      if (certPlans[bi] && mv.kind !== 'split') {
        const trimErrs = countErrors(res);
        if (res.ok && trimErrs === 0) {
          res = await runOracle(spliced, 'Verifying…');
        } else {
          const ln = errorLineOf(res.output);
          if (ln == null || ln < certPlans[bi].targetStartLine || ln > certPlans[bi].targetEndLine) {
            res = await runOracle(spliced, 'Verifying…');
          }
        }
        if (res.cancelled) {
          return finish({ complete: false, code, steps, stuck: { reason: 'cancelled' } });
        }
      }
      // Checker-guided BRANCH PRUNING for a rejected split: Beluga expects branches
      // its coverage checker can infer impossible to be OMITTED (the cp idiom
      // "principal cases are inferred to be impossible"), and rejects an emitted
      // branch whose pattern cannot type-check against the scrutinee's refined type
      // (a rigid binder occurrence — a higher-order matching fact only the checker
      // decides). Drop the branch the error points into and re-verify, until the
      // split checks or nothing prunable remains. Pruning a branch coverage still
      // REQUIRES makes the final check fail at the case itself ⇒ honest rejection.
      if (mv.kind === 'split') {
        // E.9 for splits: the trim keeps the target decl text VERBATIM, so
        // trimmed error lines map to full-program lines by a CONSTANT offset
        // (the decl's start-line difference). pruneOneBranch reads the shifted
        // output; every re-check runs against a fresh trim of the pruned
        // splice; a clean trimmed exit re-runs FULL for the bookkeeping.
        let plan9s = certPlans[bi];
        const shiftOut = (output, plan) => {
          if (!plan) return output;
          const range = theoremDeclRange(spliced, thm && thm.name);
          if (!range) return output;
          const off = range.start - plan.targetStartLine;
          if (!off) return output;
          return String(output || '').replace(/\bline (\d+)/g, (mm, n) => `line ${parseInt(n, 10) + off}`);
        };
        // Fail-open: a trimmed rejection not attributable to the target decl is
        // a possible trim artifact — fall back to FULL before (and during) the
        // prune loop; a lost prune would be a completeness bug.
        const unattributable = (plan) => {
          if (!plan || res.ok) return false;
          const ln = errorLineOf(res.output);
          return ln == null || ln < plan.targetStartLine || ln > plan.targetEndLine;
        };
        if (unattributable(plan9s)) {
          plan9s = null;
          res = await runOracle(spliced, 'Verifying…');
          if (res.cancelled) {
            return finish({ complete: false, code, steps, stuck: { reason: 'cancelled' } });
          }
        }
        let guard = (effText.match(/^\s*\|/gm) || []).length;
        while ((!res.ok || countErrors(res) > baseErrors) && guard-- > 0) {
          const next = pruneOneBranch(effText, shiftOut(res.output, plan9s), hole);
          if (!next) break;
          effText = next;
          spliced = spliceAtHole(code, hole, effText);
          if (spliced == null) break;
          plan9s = (opts.certifyTrim === false || baseErrors !== 0) ? null : trimForCertify(spliced, thm && thm.name);
          if (plan9s && plan9s.code.length >= spliced.length * 0.8) plan9s = null;
          res = await runOracle(plan9s ? plan9s.code : spliced, 'Pruning unreachable split arms…');
          if (res.cancelled) {
            return finish({ complete: false, code, steps, stuck: { reason: 'cancelled' } });
          }
          if (unattributable(plan9s)) {
            plan9s = null;
            res = await runOracle(spliced, 'Verifying…');
            if (res.cancelled) {
              return finish({ complete: false, code, steps, stuck: { reason: 'cancelled' } });
            }
          }
        }
        if (spliced == null) continue;
        if (plan9s && res.ok && countErrors(res) <= baseErrors) {
          res = await runOracle(spliced, 'Verifying…'); // full coordinates for acceptance
          if (res.cancelled) {
            return finish({ complete: false, code, steps, stuck: { reason: 'cancelled' } });
          }
        }
      }
      const errs = countErrors(res);
      if (!res.ok || errs > baseErrors) {
        let rejSet = rejectCache.get(code);
        if (!rejSet) { rejSet = new Set(); rejectCache.set(code, rejSet); }
        rejSet.add(mv.text);
        reportVerdict(mv, 'rejected',
          (firstErrorOf(res.output) || 'did not certify').slice(0, 160));
        continue;
      }
      const nextHoles = holesForTheorem(spliced, thm, parseHoles(res.output || ''));
      const fp = fingerprint(nextHoles);
      const bodyBefore = branchBodyBefore(code, hole).trim();
      const bodyAfter = branchBodyBefore(spliced, hole).trim();
      const branchProgress = bodyAfter.length > bodyBefore.length;
      // A COMPLETING candidate (zero holes left) is progress by definition —
      // its empty fingerprint can collide with a no-hole-report baseline and
      // must never be refuted as a revisit (P7 pin caught this).
      if (nextHoles.length && seen.has(fp) && !branchProgress) {
        reportVerdict(mv, 'guard', 'revisits an already-seen proof state');
        continue;
      }
      // §7 invariant 2 — refute an ancestor-obligation repeat. Scoped to the
      // candidate's OWN product (holes it created, strictly deeper than here):
      // pending holes elsewhere belong to other subtrees and are not compared.
      {
        const mvLines = String(effText || '').split('\n').length;
        let regress = null;
        for (const h of nextHoles) {
          if (h.line < hole.line || h.line > hole.line + mvLines) continue;
          const d = openCasesAt(spliced, h).length;
          if (d <= holeDepth) continue;
          const anc = [...pathAnc, { depth: holeDepth, sig: holeSigJF }].filter((a) => a.depth < d);
          if (!anc.length) continue;
          const s = junkFreeSig(spliced, h);
          if (anc.some((a) => a.sig === s)) { regress = h; break; }
        }
        if (regress) {
          reportVerdict(mv, 'guard', 'per-path canonicity: re-poses an enclosing obligation (α-regress)');
          continue;
        }
      }
      // Inv-3 ZERO-PROGRESS budget (2026-07-19) — the SAME-DEPTH complement of
      // the α-regress refute above: a certified move whose own successor hole
      // carries the SAME junk-free signature as this hole re-poses the
      // identical obligation one step deeper (§6.1 quotient: goal and every
      // non-derived hypothesis unchanged). An unbounded run of them is the
      // runaway-chain fuel (batch-09 eval_det: 80 junk
      // `let [ |- refl] = add_det [ |- X] [ |- X] in` acceptances, 0
      // backtracks, 2967 checks). NOT a hard refusal: the quotient's
      // "call results are regenerable in-process" is aspirational — today's
      // synth does NOT regenerate eqfun's recurse-let chains, so a hard
      // refuse lost real proofs (measured same day). Instead a PATH-scoped
      // budget: snapshot/restored by the backtracker (like specCount), so
      // each chronological path affords a few genuinely-consumed lets while
      // the junk chain dies. Budget-class guard: taints the certificate,
      // never cached (the refusal is path-state-dependent).
      let mvZp = false;
      {
        const mvLines = String(effText || '').split('\n').length;
        // keepBareMetas: a bare-sort component is this move's yield here.
        // Both sides are RAW parseHoles states (the loop-top hole is theorem-
        // ENRICHED with binders the successor's raw report lacks — an
        // asymmetric compare never fires; raw-vs-raw is symmetric).
        const preStrict = junkFreeSig(code, rawHole, { keepBareMetas: true });
        const noop = nextHoles.some((h) => h.line >= hole.line && h.line <= hole.line + mvLines
          && openCasesAt(spliced, h).length === holeDepth
          && junkFreeSig(spliced, h, { keepBareMetas: true }) === preStrict);
        if (noop) {
          const pb = pathBodyBefore(code, hole) || '';
          const zpOnPath = steps.filter((s) => s.zp
            && pb.includes(String(s.text || '').split('\n')[0])).length;
          if (zpOnPath >= ZP_BUDGET) {
            budgetSkips += 1;
            reportVerdict(mv, 'guard', `zero-progress budget (${ZP_BUDGET}) for this path: junk-free state unchanged`);
            continue;
          }
          mvZp = true;
        }
      }
      // Speculative-`let` guard: if this move left the leftmost goal alpha-unchanged
      // (a `let … in ?` that only added a hypothesis), spend from the per-goal
      // budget; once exhausted, reject it so the search must change the goal.
      // Keyed on BRANCH + GOAL (not the full hole fingerprint): every accepted
      // `let` adds a novel hypothesis, so a hypothesis-inclusive key resets the
      // budget each step and never trips on novel-shaped churn (the endless
      // lemma-let spiral). The goal staying alpha-equal in the same branch IS
      // the "no goal-changing move yet" condition the budget is meant to bound.
      const stillSameGoal = nextHoles.some((h) => alphaGoal(h.goal) === goalKey);
      if (globalThis.__budgetDebug) {
        globalThis.__budgetDebug({
          kind: mv.kind,
          stillSameGoal,
          goalKey,
          nh: nextHoles.length,
          h: holes.length,
          branch: (branchPatternBox(code, hole) || '').slice(0, 40),
        });
      }
      // Only genuinely SPECULATIVE lets are budgeted: recurse/lemma calls whose
      // payoff needs a later consumer. INVERTS are the invertible phase —
      // deterministic, information-preserving, each determined hypothesis
      // invertible once (the dup guard) — charging them starves legitimate
      // invert+invert+recurse+recurse proofs (dl_uniq) now that the budget
      // actually accumulates.
      if (stillSameGoal && (mv.kind === 'recurse' || mv.kind === 'lemma') && nextHoles.length >= holes.length) {
        const budgetKey = `${branchPatternBox(code, hole) || ''}§${goalKey}`;
        const used = specCount.get(budgetKey) || 0;
        if (used >= specBudget) {
          budgetSkips += 1;
          reportVerdict(mv, 'guard', 'speculative-let budget exhausted for this goal');
          continue;
        }
        specCount.set(budgetKey, used + 1);
      }
      // G.3: an accepted OPEN FILL is the one non-invertible accepted kind —
      // it forfeits the exhaustion certificate for the rest of the run.
      if (mv.kind === 'fill' && /\?/.test(effText)) unsafeAccepted = true; // GENERAL: move-kind tag
      // §6.2 №4 — record the decision point BEFORE committing: the accepted
      // text joins this code-state's skip set, and the pre-acceptance state
      // (with its loop-top result, so a backtrack costs zero checks) is pushed.
      {
        let skipSet = backtrackSkip.get(code);
        if (!skipSet) { skipSet = new Set(); backtrackSkip.set(code, skipSet); }
        skipSet.add(mv.text);
        decisions.push({
          code,
          res: checked,
          seen: new Set(seen),
          specCount: new Map(specCount),
          pathAnc: pathAnc.map((a) => ({ ...a })),
          baseErrors,
        });
      }
      // Accept: real, type-correct progress. Carry this result — the next step's
      // loop-top check of the same code would be byte-identical.
      code = spliced;
      carried = { forCode: spliced, res };
      baseErrors = errs;
      seen.add(fp);
      // An accepted split makes this hole an ancestor point of everything
      // inside its arms — record its junk-free state for the canonicity refute.
      if (mv.kind === 'split') pathAnc.push({ depth: holeDepth, sig: holeSigJF });
      const meta = stepMeta(mv, effText, hole);
      const checksUsed = oracleCalls - oracleCallsAtStep;
      oracleCallsAtStep = oracleCalls;
      reportVerdict(mv, 'accepted', null, effText);
      const lead = stepLead(mv, meta, hole);
      steps.push({
        move: mv.kind,
        lead,
        rationale: lead,
        meta,
        checks: checksUsed,
        goal: hole.goal,
        hole: { line: hole.line, col: hole.col, name: hole.name || null },
        holeCtx: holeCtxSnap,
        holeMeta: holeMetaSnap,
        focus: focusMeta,
        // the enclosing case-branch PATTERN (null at top level) — the proof-tree
        // UI groups steps by it
        branch: branchPatternBox(code, hole),
        text: effText,
        status: nextHoles.length ? 'open' : 'solved',
        zp: mvZp || undefined,
      });
      if (opts.onStep) opts.onStep({ steps: [...steps], last: steps[steps.length - 1] });
      advanced = true;
      break;
      }
    }
    if (trace) {
      const traceEntry = {
        goal: hole.goal,
        branch: branchAtHole,
        hole: { line: hole.line, col: hole.col, name: hole.name || null },
        holeCtx: holeCtxSnap,
        holeMeta: holeMetaSnap,
        focus: focusMeta,
        tried: tried || [],
        advanced,
      };
      trace.push(traceEntry);
      if (opts.onTraceEntry) opts.onTraceEntry(traceEntry, trace.length - 1);
    }
    if (!advanced) {
      // Classify the decline before reporting — a bare "no-move" hides causes
      // that are ANSWERS, not search gaps:
      //  - a goal concluding in a coinductive family needs the copattern
      //    former, out of the inductive fragment by construction;
      //  - a theorem with boxed premises but NO `/ total … /` measure never
      //    receives IH-recursion candidates (unguarded recursion is unsound;
      //    the generators return [] without a measure) — the `/ trust /` and
      //    unannotated classes, where adding a measure may unblock the search.
      const bounded = moves.searchBounded || splitDepthBounded;
      const coFam = bounded
        ? null : goalConcludesInFamily(hole.goal, coinductiveFamiliesOf(code));
      // Measure-position source of truth is hypotheticalMeasures: a theorem
      // with NO measure but ≥1 candidate position (box premise or explicit
      // object-Pi binder) is in the synthesizable class.
      const totalityBlocked = !bounded && !coFam
        && (!thm || !thm.totality)
        && !!(thm && thm.compType && hypotheticalMeasures(thm).length);
      const reason = bounded ? 'search-bound'
        : coFam ? 'coinductive-out-of-fragment'
          : totalityBlocked ? 'no-totality-measure' : 'no-move';
      // G.3 × §6.2 №4: in THEORY an exhausted hole under an invertible prefix
      // is a settled NO — but that rests on generation-completeness, and
      // unique_eval FALSIFIED it (2026-07-18: a certificate-shaped dead end on
      // a provable theorem — an open coverage-matrix gap). So the certificate
      // now belongs to the WHOLE decision tree: record whether every FRESH
      // dead end (no backtrack-skips at the hole = a real leaf) was per-hole
      // certifiable, and only the final empty-stack stuck may certify.
      if (reason === 'no-move' && btSkippedHere === 0) { // GENERAL: stuck reason
        deadEnds += 1;
        const holeCert = !!moves.synthExhausted
          && budgetSkips === 0
          && spliceFails === 0
          && !(moves.splitDrops > 0);
        if (!holeCert) allDeadEndsCertified = false;
      }
      // §6.2 №4 — a no-move dead end with decisions on the stack is NOT a
      // verdict: pop to the previous acceptance and try the next candidate
      // there (its text is in the skip set). Zero-check restore via the stored
      // loop-top result; the step counter keeps ticking, so exhaustion of the
      // whole decision tree ends as an honest step-bound or a genuinely
      // alternative-free no-move. A search-bound leaf backtracks the same way
      // (the bound truncated this PATH, not the tree) but taints the run:
      // no exhaustion claim survives it.
      if (reason === 'search-bound') boundedLeafSeen = true; // GENERAL: stuck reason
      if ((reason === 'no-move' || reason === 'search-bound') && decisions.length) { // GENERAL: stuck reason
        const d = decisions.pop();
        code = d.code;
        carried = { forCode: d.code, res: d.res };
        seen.clear();
        for (const x of d.seen) seen.add(x);
        specCount.clear();
        for (const [k, v] of d.specCount) specCount.set(k, v);
        pathAnc.length = 0;
        pathAnc.push(...d.pathAnc);
        baseErrors = d.baseErrors;
        steps.pop(); // the abandoned acceptance
        if (opts.onPulse) opts.onPulse({ label: 'Backtracking…' });
        continue;
      }
      let closest = null;
      if (reason === 'no-move' && tried && tried.length) { // GENERAL: stuck reason
        const row = tried.find((t) => t.verdict === 'rejected')
          || tried.find((t) => t.verdict === 'guard')
          || tried[0];
        if (row) {
          closest = `${row.kind}${row.head ? `: ${row.head}` : ''}${row.reason ? ` (${row.reason})` : ''}`
            .replace(/\s+/g, ' ').trim().slice(0, 140);
        }
      }
      // Phase G.3 — the theorem-level NO-CUT-FREE-PROOF certificate. Sound
      // because (i) every accepted step was provability-preserving (invertible
      // or weakening; open fills veto via unsafeAccepted), so the theorem is
      // provable iff THIS hole is; (ii) the hole's §5.2-complete move set was
      // generated in full and every member was checker-rejected or soundly
      // refuted — no budget skip, no silent splice drop, and NOTHING is ever
      // dropped: every domination (plans, vacuous probes) DEFERS to the tail
      // and is genuinely tried at a stuck hole; (iii) synthesis exhausted its
      // finite space with no tripwire (stats.exhausted, G.2). Any taint ⇒
      // stay a plain no-move. The oracle's verdicts are the arbiter.
      // The tree-level certificate: this is the FINAL stuck (no alternatives
      // left), every fresh dead end en route was certifiable, and the run
      // never accepted a non-invertible move. Conservative by construction;
      // the unique_eval-class residual risk (a generation gap making every
      // branch dead-end "cleanly") is logged in the plan.
      const noCutFree = reason === 'no-move' // GENERAL: stuck reason
        && !boundedLeafSeen
        && decisions.length === 0
        && deadEnds > 0
        && allDeadEndsCertified
        && !unsafeAccepted
        && baseErrors === 0;
      // A tree that contained a bounded leaf was NOT exhausted — a final
      // no-move would claim "no candidates anywhere", which is false. Report
      // the honest bound (D8 discipline). Theorem-level classifications
      // (no-totality-measure / coinductive) are structural facts and stand.
      const finalReason = (reason === 'no-move' && boundedLeafSeen) // GENERAL: stuck reason
        ? 'search-bound' : reason;
      return finish({
        complete: false, code, steps, trace: trace || undefined,
        stuck: {
          goal: hole.goal,
          reason: finalReason,
          noCutFree: noCutFree || undefined,
          family: coFam || undefined,
          closest: closest || undefined,
          hole: { line: hole.line, col: hole.col, name: hole.name || null },
        },
      });
    }
  }
  return finish({ complete: false, code, steps, trace: trace || undefined, stuck: { reason: 'step-bound' } });
}

// A compact signature of a hole's context (meta + comp binders) for the progress
// fingerprint — two states are "the same" iff identical open goals AND identical
// available hypotheses UP TO BINDER RENAMING. We alpha-normalise: the multiset of
// hypothesis TYPES (binder names dropped) is what matters, so re-inverting a
// hypothesis to fresh-named sub-derivations of a shape already present counts as
// NO progress (the fresh names alone must not look like a new state — that was the
// infinite-inversion loop).
// We alpha-normalise the WHOLE hole (goal + all hypothesis types) with ONE shared
// renaming so cross-hypothesis variable sharing is preserved, but fresh binder
// NAMES don't fake progress. Re-inverting a hypothesis to fresh-named
// sub-derivations of a shape already present is then recognised as the same state.
// The line number of the FIRST reported error (the `File "…", line N` header
// nearest before the first `Error`), or null when unattributable. E.9 uses it
// to decide whether a trimmed-certify rejection blames the target decl.

// A compact signature of a hole's context (meta + comp binders) for the progress
// fingerprint — two states are "the same" iff identical open goals AND identical
// available hypotheses UP TO BINDER RENAMING. We alpha-normalise: the multiset of
// hypothesis TYPES (binder names dropped) is what matters, so re-inverting a
// hypothesis to fresh-named sub-derivations of a shape already present counts as
// NO progress (the fresh names alone must not look like a new state — that was the
// infinite-inversion loop).
// We alpha-normalise the WHOLE hole (goal + all hypothesis types) with ONE shared
// renaming so cross-hypothesis variable sharing is preserved, but fresh binder
// NAMES don't fake progress. Re-inverting a hypothesis to fresh-named
// sub-derivations of a shape already present is then recognised as the same state.
// The line number of the FIRST reported error (the `File "…", line N` header
// nearest before the first `Error`), or null when unattributable. E.9 uses it
// to decide whether a trimmed-certify rejection blames the target decl.

function errorLineOf(output) {
  const s = String(output || '');
  const ei = s.search(/\bError\b/);
  if (ei < 0) return null;
  let last = null;
  const re = /File "[^"]*", line (\d+)/g;
  let m;
  while ((m = re.exec(s.slice(0, ei)))) last = m[1];
  return last == null ? null : parseInt(last, 10);
}

// stepMeta / stepLead — see prover-captions.mjs

// Approximate display goal for a hole at (line,col) in file text: the theorem
// header comp type when the hole is top-level in its decl (no `=>`/`fn` before it).

export function approximateHoleGoal(fileText, line, col) {
  const code = String(fileText || '');
  const wantLine = line;
  const wantCol = col || 1;
  const re = /\b(?:rec|proof)\s+([\p{L}_][\p{L}\p{N}_']*)\s*:/gu;
  let match;
  while ((match = re.exec(code)) !== null) {
    const name = match[1];
    const range = theoremDeclRange(code, name);
    if (!range || wantLine < range.start || wantLine > range.end) continue;
    const semi = code.indexOf(';', match.index);
    const declText = code.slice(match.index, semi < 0 ? code.length : semi + 1);
    const thm = theoremUnderProof(declText);
    if (!thm) continue;
    const syn = syntacticHoleAt(code, thm, wantLine, wantCol);
    if (syn?.goal) return syn.goal;
  }
  return null;
}


function syntacticHoleAt(code, thm, line, col) {
  const range = theoremDeclRange(code, thm && thm.name);
  const lines = String(code || '').split('\n');
  const start = range ? range.start - 1 : 0;
  const end = range ? range.end : lines.length;
  if (line < start + 1 || line > end) return null;
  const i = line - 1;
  const holeCol = lines[i].indexOf('?');
  if (holeCol < 0 || holeCol + 1 !== col) return null;
  const upToHole = lines.slice(start, i).join('\n') + '\n' + lines[i].slice(0, holeCol);
  const topLevel = !/=>|⇒|\bfn\s+\w+\s*=>/.test(upToHole);
  const goal = topLevel && thm?.compType?.raw ? thm.compType.raw : null;
  return goal ? { line, col, goal, ctx: [], meta: [] } : null;
}

// Locate a `?` inside the theorem decl when Beluga omitted it from ## Holes ##.
// A top-level hole (no `=>` introduced before it) has the FULL comp type as its
// goal — that is what Beluga itself reports there — so intro can bootstrap the
// search; past an arm/binder we leave the goal unknown (conclusion via resolve).

// Locate a `?` inside the theorem decl when Beluga omitted it from ## Holes ##.
// A top-level hole (no `=>` introduced before it) has the FULL comp type as its
// goal — that is what Beluga itself reports there — so intro can bootstrap the
// search; past an arm/binder we leave the goal unknown (conclusion via resolve).

function syntacticHoleInTheorem(code, thm) {
  const range = theoremDeclRange(code, thm && thm.name);
  const lines = String(code || '').split('\n');
  const start = range ? range.start - 1 : 0;
  const end = range ? range.end : lines.length;
  for (let i = start; i < end; i += 1) {
    const col = lines[i].indexOf('?');
    if (col >= 0) {
      const hit = syntacticHoleAt(code, thm, i + 1, col + 1);
      if (hit) return hit;
    }
  }
  return null;
}

// The line of the first genuine ERROR in checker output (a `File "…", line N`
// header immediately followed by an error line — hole reports use the same header
// shape and must not match).

// The line of the first genuine ERROR in checker output (a `File "…", line N`
// header immediately followed by an error line — hole reports use the same header
// shape and must not match).

function firstErrorLoc(output) {
  const lines = String(output || '').split('\n');
  for (let i = 0; i < lines.length - 1; i += 1) {
    const m = /File\s+"[^"]*",\s*line\s+(\d+)/.exec(lines[i]);
    if (!m) continue;
    // The web shim puts `Error: …` on the next line; the native CLI interleaves
    // a source excerpt + caret line first. Scan a few lines for a real Error
    // (ANSI-tolerant, line-anchored so excerpt text can't false-match).
    for (let j = i + 1; j < Math.min(i + 8, lines.length); j += 1) {
      const plain = lines[j].replace(/\[[0-9;]*m/g, '').trim();
      if (/^error\b/i.test(plain)) return { line: parseInt(m[1], 10) };
      if (/File\s+"[^"]*",\s*line\s+\d+/.test(lines[j])) break; // next location block
    }
  }
  return null;
}

// Remove the split branch the checker's error points into. Splicing maps move-text
// line i to program line hole.line + i, so an error inside the spliced span selects
// one `| …` branch to drop. Returns the pruned text, or null when the error is
// outside the span / at the case head / only one branch remains (a case needs ≥1
// branch — full emptiness is the separate `impossible` move).

// Remove the split branch the checker's error points into. Splicing maps move-text
// line i to program line hole.line + i, so an error inside the spliced span selects
// one `| …` branch to drop. Returns the pruned text, or null when the error is
// outside the span / at the case head / only one branch remains (a case needs ≥1
// branch — full emptiness is the separate `impossible` move).

function pruneOneBranch(text, output, hole) {
  const loc = firstErrorLoc(output);
  if (!loc) return null;
  const lines = String(text).split('\n');
  const rel = loc.line - hole.line;
  if (rel < 0 || rel >= lines.length) return null;
  const starts = [];
  lines.forEach((l, i) => { if (/^\s*\|/.test(l)) starts.push(i); });
  if (starts.length <= 1) return null;
  let bi = -1;
  for (let k = 0; k < starts.length; k += 1) {
    if (rel >= starts[k] && (k + 1 >= starts.length || rel < starts[k + 1])) { bi = k; break; }
  }
  if (bi < 0) return null;
  let to = bi + 1 < starts.length ? starts[bi + 1] : lines.length;
  // A NESTED case is wrapped `(case … of … )`; the closing `)` rides on the last
  // arm's final line. Removing the last arm must not swallow that `)` — carry any
  // trailing close-parens on the removed span's last line onto the survivor.
  let tail = '';
  if (to === lines.length) {
    const lastLine = lines[to - 1] || '';
    const closes = /(\)+\s*)$/.exec(lastLine);
    if (closes) tail = closes[1].trim();
  }
  const kept = [...lines.slice(0, starts[bi]), ...lines.slice(to)];
  if (tail && kept.length) {
    // append the carried close-parens to the survivor's last non-blank line
    for (let i = kept.length - 1; i >= 0; i -= 1) {
      if (kept[i].trim()) { kept[i] = kept[i].replace(/\s*$/, '') + tail; break; }
    }
  }
  return kept.join('\n');
}

// First error location/message in checker output, for an honest stuck report.

// First error location/message in checker output, for an honest stuck report.

function firstErrorOf(output) {
  const lines = String(output || '').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (/error/i.test(lines[i])) {
      const loc = i > 0 && /^File\s+"/.test(lines[i - 1]) ? lines[i - 1].trim() + ' ' : '';
      return (loc + lines[i].trim()).slice(0, 300);
    }
  }
  return null;
}


function caseArmLine(code, hole) {
  const lines = String(code || '').split('\n');
  for (let i = hole.line - 1; i >= 0; i -= 1) {
    if (/^\s*\|/.test(lines[i])) return i + 1;
  }
  return hole.line;
}


function scoreHole(hole, code) {
  let s = 0;
  const pat = branchPatternBox(code, hole);
  if (pat) s += 30;
  const body = branchBodyBefore(code, hole);
  s += (body.match(/\blet\s+\[/g) || []).length * 8;
  s += branchLetNames(code, hole).length * 6;
  if (/"\w/.test(hole.goal || '')) s -= 500;
  if ((hole.meta || []).some((m) => m && /"/.test(String(m.name)))) s -= 500;
  return s;
}

// Alpha-normalize a goal: metavariable SPELLINGS are printer artifacts — both
// the uppercase pattern names AND the checker's `"`-quoted INTERNAL names (which
// the checker RENUMBERS on every re-elaboration: `"i17` → `"i18` across two
// checks of the same state). Both classes map positionally, so a re-elaborated
// but unchanged goal keys identically — the budget/seen guards depend on it.

// Alpha-normalize a goal: metavariable SPELLINGS are printer artifacts — both
// the uppercase pattern names AND the checker's `"`-quoted INTERNAL names (which
// the checker RENUMBERS on every re-elaboration: `"i17` → `"i18` across two
// checks of the same state). Both classes map positionally, so a re-elaborated
// but unchanged goal keys identically — the budget/seen guards depend on it.

function alphaGoal(goalStr) {
  const map = new Map();
  let n = 0;
  return String(goalStr == null ? '' : goalStr).replace(/\s+/g, ' ').trim()
    .replace(/"[A-Za-z][A-Za-z0-9_']*|\p{Lu}[\p{L}\p{N}_']*/gu, (m) => {
      if (!map.has(m)) { map.set(m, '#' + n); n += 1; }
      return map.get(m);
    });
}

// Hypothesis names bound as CALL RESULTS on a path (a `let` whose RHS applies a
// lemma/IH — ≥2 top-level tokens; an inversion's RHS is a bare hypothesis name).
// Call results are REGENERABLE from the structural state by re-issuing the same
// calls, so per-path state identity must quotient them out — otherwise junk-fact
// accumulation fakes state novelty and masks an α-regress (§7 invariant 2).

// Hypothesis names bound as CALL RESULTS on a path (a `let` whose RHS applies a
// lemma/IH — ≥2 top-level tokens; an inversion's RHS is a bare hypothesis name).
// Call results are REGENERABLE from the structural state by re-issuing the same
// calls, so per-path state identity must quotient them out — otherwise junk-fact
// accumulation fakes state novelty and masks an α-regress (§7 invariant 2).

function derivedLetNamesIn(body) {
  const out = new Set();
  const re = /let\s+([^=\n]+?)\s*=\s*([^\n]+?)\s+in\b/g;
  let m;
  while ((m = re.exec(String(body || '')))) {
    if (m[2].trim().split(/\s+/).length < 2) continue;
    for (const t of m[1].match(/\p{Lu}[\p{L}\p{N}_']*/gu) || []) out.add(t);
  }
  return out;
}

// α-canonical PER-PATH state signature, quotiented by regenerable facts (§7
// invariant 2): the goal + hypothesis types, EXCLUDING (i) call-result bindings
// anywhere on the ancestor chain and (ii) bare object metas (`N : ( |- nat)` —
// index sorts don't individuate obligations; their occurrences inside judgment
// facts and the goal carry the information, and a refining split consumes the
// entry itself). Justification of the quotient: derived facts are regenerable
// from the structural facts by the same calls, so two states with equal
// junk-free signatures have the same derivable closure — the same obligation.
// `"`-names and uppercase metas normalize positionally like alphaGoal/ctxSig.
// opts.keepBareMetas: the ZERO-PROGRESS refute compares a hole to its own
// successor, where a newly-bound bare-sort component IS the move's entire
// yield (an inversion binding `X : ( |- fam_c)`); dropping it there would
// refuse genuinely-informative moves. The ancestor-comparison uses keep the
// default exclusion (the bare meta exists on BOTH sides of those compares).

// α-canonical PER-PATH state signature, quotiented by regenerable facts (§7
// invariant 2): the goal + hypothesis types, EXCLUDING (i) call-result bindings
// anywhere on the ancestor chain and (ii) bare object metas (`N : ( |- nat)` —
// index sorts don't individuate obligations; their occurrences inside judgment
// facts and the goal carry the information, and a refining split consumes the
// entry itself). Justification of the quotient: derived facts are regenerable
// from the structural facts by the same calls, so two states with equal
// junk-free signatures have the same derivable closure — the same obligation.
// `"`-names and uppercase metas normalize positionally like alphaGoal/ctxSig.
// opts.keepBareMetas: the ZERO-PROGRESS refute compares a hole to its own
// successor, where a newly-bound bare-sort component IS the move's entire
// yield (an inversion binding `X : ( |- fam_c)`); dropping it there would
// refuse genuinely-informative moves. The ancestor-comparison uses keep the
// default exclusion (the bare meta exists on BOTH sides of those compares).

export function junkFreeSig(codeStr, h, jfOpts) {
  const keepBare = !!(jfOpts && jfOpts.keepBareMetas);
  const derived = derivedLetNamesIn(pathBodyBefore(codeStr, h));
  const map = new Map();
  let n = 0;
  const nrm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
    .replace(/"[A-Za-z][A-Za-z0-9_']*|\p{Lu}[\p{L}\p{N}_']*/gu, (t) => {
      if (!map.has(t)) { map.set(t, '#' + n); n += 1; }
      return map.get(t);
    });
  const head = nrm(h.goal);
  const types = [];
  for (const b of [...(h.meta || []), ...(h.ctx || [])]) {
    if (!b || !b.name || !b.type || derived.has(String(b.name))) continue;
    const inner = String(b.type).trim().replace(/^[([]\s*/, '').replace(/[)\]]\s*$/, '');
    const parts = inner.split(/\|-|⊢/);
    const concl = (parts.length > 1 ? parts[parts.length - 1] : parts[0]).trim();
    const ctxPart = parts.length > 1 ? parts[0].trim() : '';
    if (!keepBare && !ctxPart && !/\s/.test(concl)) continue; // bare object meta
    types.push(nrm(b.type));
  }
  return head + '⊢' + types.sort().join(',');
}


function ctxSig(hole) {
  const map = new Map();
  let n = 0;
  // Internal `"`-names normalize too (see alphaGoal) — the checker renumbers
  // them per elaboration, which would otherwise fake state novelty past `seen`.
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
    .replace(/"[A-Za-z][A-Za-z0-9_']*|\p{Lu}[\p{L}\p{N}_']*/gu, (m) => {
      if (!map.has(m)) { map.set(m, '#' + n); n += 1; }
      return map.get(m);
    });
  const types = [];
  for (const m of (hole.meta || [])) types.push('m:' + norm(m.type));
  for (const c of (hole.ctx || [])) types.push('c:' + norm(c.type));
  // include the goal in the shared renaming so the WHOLE state is alpha-canonical
  return norm(hole.goal) + '⊢' + types.sort().join(',');
}

// Count genuine type ERRORS in checker output (NOT holes — holes are wildcards).
// A clean partial proof reports `ok:true` with a `## Holes ##` section and no
// error lines. We treat ok:false OR an explicit error marker as an error signal.

// Count genuine type ERRORS in checker output (NOT holes — holes are wildcards).
// A clean partial proof reports `ok:true` with a `## Holes ##` section and no
// error lines. We treat ok:false OR an explicit error marker as an error signal.

function countErrors(res) {
  if (!res) return 1;
  if (!res.ok) return 1;
  return 0;
}

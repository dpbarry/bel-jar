import { Text } from '@codemirror/state';
import { parser } from '../beluga-parser.js';
import { fallbackDiagnostic, namedCulprit, parseBelugaDiagnostics, spanFirstLineDiagnostic } from '../bel-beluga-diag.mjs';
import { assembleCheckerCode, shiftCheckerOutput, attributeCheckerHoles } from '../project-prelude.mjs';
import { mergeDiagnostics, parseQueryRuntimeDiagnostics } from '../bel-query-diag.mjs';
import { checkerSnapshotFromSyntax } from '../checker-snapshot.mjs';
import { computeLintBlocks, maskBlocksByIndex } from '../bel-units.mjs';
import { blockDependents, walkTree } from '../bel-walk.mjs';
import { getCheckTrace } from '../perf/check-trace.mjs';
import { computeSettleDelayMs, SETTLE_DELAY_MS } from './settle-delay.mjs';
import {
  declIndicesForRanges,
  declRangesForIndices,
  diagnosticOverlapsRange,
  diagnosticsOutsideRanges,
  topDeclSpans,
} from './scoped-check.mjs';
import {
  buildCompressedCheckerCode,
} from './compress-development.mjs';

// Beluga halts at the first error it meets. A single check therefore yields at
// most ONE diagnostic per settle — antithetical to the engine's whole design.
// MAX_PASSES bounds the divide-and-conquer loop that works around it: each
// pass masks the blocks that already errored (plus everything depending on
// them) and re-checks the remainder, so independent errors all surface.
const MAX_PASSES = 8;
const MAX_PASSES_PRELUDE_FLOOR = 16;

export function belugaDiagnosticsFromOutput(rawOutput, doc, {
  blockAt = null,
  hasSyntaxFault = false,
  ok = true,
} = {}) {
  let diags = parseBelugaDiagnostics(rawOutput, doc);
  diags = mergeDiagnostics(diags, parseQueryRuntimeDiagnostics(rawOutput, doc));
  for (const d of diags) {
    d.source = 'beluga';
    const hit = blockAt && blockAt(d.from);
    if (hit) d.blockIndex = hit.index;
  }
  if (!diags.length && ok === false && !hasSyntaxFault) {
    const fb = fallbackDiagnostic(rawOutput, doc);
    if (fb) {
      fb.source = 'beluga';
      const hit = blockAt && blockAt(fb.from);
      if (hit) fb.blockIndex = hit.index;
      diags = [fb];
    }
  }
  // General rule: any diagnostic anchored on line 1 spans the whole first line.
  for (const d of diags) spanFirstLineDiagnostic(d, doc);
  return diags;
}

// Transitive closure of blockDependents starting from `seeds`: every block
// whose meaning rests (directly or not) on an erroring block. Exported for
// tests.
export function impactedBlocks(dependents, seeds) {
  const impacted = new Set(seeds);
  const queue = [...seeds];
  while (queue.length) {
    const idx = queue.shift();
    const next = dependents.get(idx);
    if (!next) continue;
    for (const dep of next) {
      if (impacted.has(dep)) continue;
      impacted.add(dep);
      queue.push(dep);
    }
  }
  return impacted;
}

function diagKey(d) {
  return `${d.from}:${d.to}:${(d.message || '').slice(0, 60)}`;
}

// The per-member diagnostic map: the prelude findings the recovery loop already
// computed (file name + file-relative line + message), surfaced as structured
// diagnostics keyed by member file name instead of collapsed into one banner.
// This is the cross-file channel Tier-2 consumers (inspector, dependency graph)
// read for members OTHER than the active file — so a checked-but-erroring member
// shows its real health rather than "parsed, not checked here". Prelude issues
// are always errors (Beluga halts at the first error; warnings never reach here).
function memberDiagnosticsFromIssues(issues) {
  const byFile = {};
  for (const iss of issues) {
    if (!iss || !iss.name) continue;
    (byFile[iss.name] || (byFile[iss.name] = [])).push({
      line: iss.line,
      message: iss.message || 'Error in this file.',
      severity: 'error',
    });
  }
  return byFile;
}

export function createSettlement({
  belugaClient,
  checkerStore,
  getCheckContext = null,
  getScopedFrontier = null,
  getSettleDelay = null,
  onComplete = null,
  onChecking = null,
  onProgress = null,
  maxPasses = MAX_PASSES,
  /** When true, default settle uses full uncompressed multipass. */
  preferFullCheck = false,
} = {}) {
  let scheduled = null;
  let inflight = null;
  let inflightStartedAt = 0;
  let generation = 0;
  /** Last prelude content fingerprint that was fully (uncompressed) certified. */
  let lastFullPreludeFp = null;

  // Terminating the checker worker mid-run forces a full Beluga runtime
  // re-eval on the next check. Doing that on EVERY keystroke while a check is
  // in flight (the norm late in a suite, where checks outlive the typing
  // cadence) churns a worker per keystroke and saturates the CPU — the
  // late-suite keystroke lag. Superseded results are already discarded by the
  // generation guard, so a warm worker is only killed when it is genuinely
  // stuck on a heavy stale job.
  const STALE_INFLIGHT_MS = 4000;
  function cancelInflightIfStale() {
    if (inflight === null) return;
    if (Date.now() - inflightStartedAt < STALE_INFLIGHT_MS) return;
    if (belugaClient && typeof belugaClient.cancelCheckerWorkload === 'function') {
      belugaClient.cancelCheckerWorkload();
    }
  }

  function fingerprint(code) {
    if (belugaClient && typeof belugaClient.fingerprint === 'function') {
      return belugaClient.fingerprint(code);
    }
    return code;
  }

  function runCheck(code) {
    if (!belugaClient) return Promise.resolve(null);
    if (typeof belugaClient.checkResult === 'function') {
      return Promise.resolve(belugaClient.checkResult(code));
    }
    if (typeof belugaClient.check === 'function') {
      return Promise.resolve(belugaClient.check(code))
        .then((output) => ({ ok: false, output: output || '' }));
    }
    return Promise.resolve(null);
  }

  function finish(snapshotArgs, gen) {
    checkerStore.applyResult(snapshotArgs);
    if (gen === generation && typeof onComplete === 'function') {
      onComplete(checkerStore.getSnapshot());
    }
    return checkerStore.getSnapshot();
  }

  async function settleNow(syntaxSnap, gen, traceOptions = {}) {
    if (!syntaxSnap || !belugaClient) return null;

    const perf = getCheckTrace();
    const settleSpan = perf.enabled
      ? perf.spanStart('settle:total', { trigger: traceOptions.trigger || 'semantic' })
      : null;
    let passCount = 0;

    const snap = checkerSnapshotFromSyntax(syntaxSnap);
    const ctx = typeof getCheckContext === 'function' ? getCheckContext(syntaxSnap) : null;
    const rawPrelude = ctx?.prelude || null;
    let shiftPrelude = rawPrelude;
    const diagDoc = ctx?.doc || syntaxSnap.doc;
    // Suite-composition warnings (pragma leak / duplicate decl) ride alongside
    // the Beluga findings so the same problem the cfg flags is visible in the
    // open file too. Non-fatal — they never flip `ok` on their own.
    const suiteDiags = (ctx?.suiteDiagnostics || []).map((d) => {
      const out = { ...d, source: d.source || 'suite' };
      return spanFirstLineDiagnostic(out, diagDoc);
    });
    // Raw findings (affected files resolved to names) let the banner tell whether
    // a "prelude error" is actually the active file's own fault — see
    // preludeBannerDiag.
    const suiteFindings = ctx?.suiteFindings || [];

    // Block-index the prelude the same way the active file is, so an error in an
    // earlier suite file can be masked and the active file still reached —
    // parity with the single-file divide-and-conquer. Lazy: an all-green run
    // never parses it. `maskedPrelude` accumulates erroring prelude blocks;
    // masking blanks lines (line count preserved) so shift offsets stay valid.
    let preludeBlocks = null;
    const maskedPrelude = new Set();
    function ensurePreludeBlocks() {
      if (preludeBlocks !== null) return preludeBlocks;
      if (!rawPrelude || !rawPrelude.code) { preludeBlocks = false; return preludeBlocks; }
      const pdoc = Text.of(String(rawPrelude.code).split('\n'));
      const { blocks, blockAt } = computeLintBlocks(parser.parse(String(rawPrelude.code)), pdoc);
      preludeBlocks = { blocks, blockAt, doc: pdoc };
      return preludeBlocks;
    }
    function currentPrelude() {
      if (!rawPrelude || !maskedPrelude.size) return rawPrelude;
      const pb = ensurePreludeBlocks();
      if (!pb) return rawPrelude;
      return { ...rawPrelude, code: maskBlocksByIndex(rawPrelude.code, pb.doc, pb.blocks, maskedPrelude) };
    }
    // Attribute prelude diagnostics (file + file-relative line, from
    // shiftCheckerOutput) to prelude blocks; returns how many NEW blocks were
    // carved out so the loop knows the prelude made progress.
    function maskPreludeBlocksInSpan(span) {
      const pb = ensurePreludeBlocks();
      if (!pb || !span) return 0;
      let added = 0;
      for (let i = 0; i < pb.blocks.length; i += 1) {
        const blk = pb.blocks[i];
        if (!blk?.range) continue;
        const ln = pb.doc.lineAt(blk.range.from).number;
        if (ln >= span.startLine && ln <= span.endLine && !maskedPrelude.has(i)) {
          maskedPrelude.add(i);
          added += 1;
        }
      }
      return added;
    }

    function maskPreludeIssues(issues) {
      if (!issues || !issues.length || !rawPrelude) return 0;
      const pb = ensurePreludeBlocks();
      if (!pb) return 0;
      let added = 0;
      for (const iss of issues) {
        const span = (rawPrelude.spans || []).find((s) => s.name === iss.name);
        if (!span) continue;
        const codeLine = span.startLine + (iss.line - 1);
        if (codeLine < 1 || codeLine > pb.doc.lines) continue;
        const hit = pb.blockAt(pb.doc.line(codeLine).from);
        if (hit && !maskedPrelude.has(hit.index)) {
          maskedPrelude.add(hit.index);
          added += 1;
          continue;
        }
        // No lint block at the error line, or that block is already masked but
        // Beluga still halts in the prelude — mask the whole member so the loop
        // cannot stall with only the line-1 banner.
        added += maskPreludeBlocksInSpan(span);
      }
      return added;
    }

    function withPrelude(fileCode) {
      const assembled = assembleCheckerCode(fileCode, currentPrelude());
      shiftPrelude = assembled.prelude;
      return assembled.code;
    }

    // Active-file diagnostics for one pass. Prelude issues come back separately
    // (the caller masks the offending prelude block and re-checks) so a broken
    // earlier file no longer blocks the active file's own results.
    function processCheckerOutput(rawOutput, ok) {
      const shifted = shiftPrelude ? shiftCheckerOutput(rawOutput, shiftPrelude) : { text: rawOutput, preludeIssues: [] };
      const preludeIssues = shifted.preludeIssues || [];
      // Beluga halts at the FIRST error, so one output carries one error. When
      // that error is located in the prelude, every diagnostic parsed from this
      // output is that same prelude error (re-shifted / fallback) — not an
      // active-file finding. Mask the prelude block and re-check instead.
      if (preludeIssues.length) return { diags: [], preludeIssues };
      let diags = belugaDiagnosticsFromOutput(shifted.text, diagDoc, {
        blockAt: snap.blockAt,
        hasSyntaxFault: snap.hasSyntaxFault,
        ok,
      });
      return { diags, preludeIssues };
    }

    if (!snap.code.trim()) {
      return finish({
        syntaxVersion: syntaxSnap.version,
        checkerFp: '',
        ok: true,
        belugaDiagnostics: suiteDiags,
        rawOutput: '',
      }, gen);
    }

    const canonicalFp = fingerprint(snap.code);
    checkerStore.markChecking(syntaxSnap.version, canonicalFp);
    if (typeof onChecking === 'function') onChecking();

    // Block-level impact relation, computed once per settle from the same
    // walk the lint already memoized. Lazy: an all-green first pass (the
    // common case) never touches it.
    let dependents = null;
    function impactOf(seeds) {
      if (!dependents) dependents = blockDependents(syntaxSnap.tree, syntaxSnap.doc);
      return impactedBlocks(dependents, seeds);
    }

    const masked = new Set();

    // An "unbound identifier X" where every definition of X lives in a masked
    // or syntax-faulted block is INDUCED by the masking, not a fault of the
    // block it's reported in. Recognize it so it never reaches the user.
    function isInducedUnbound(message) {
      const culprit = namedCulprit(message || '');
      if (!culprit) return false;
      const entries = walkTree(syntaxSnap.tree, syntaxSnap.doc).defMap.get(culprit);
      if (!entries || !entries.length) return false;
      let sawDef = false;
      for (const entry of entries) {
        const hit = snap.blockAt(entry.ident.from);
        if (!hit) continue;
        sawDef = true;
        if (!masked.has(hit.index) && !snap.blocks[hit.index].syntaxFault) return false;
      }
      return sawDef;
    }

    // Syntax-faulted blocks are already line-masked in snap.code, but their
    // DEPENDENTS aren't — checked as-is they'd open with induced unbound
    // errors. Carve out the whole impacted set before the first pass.
    const faulted = [];
    for (let i = 0; i < snap.blocks.length; i += 1) {
      if (snap.blocks[i].syntaxFault) faulted.push(i);
    }
    if (faulted.length) {
      for (const idx of impactOf(faulted)) masked.add(idx);
    }

    const collected = [];
    const seen = new Set();
    const outputs = [];
    // Prelude issues across all passes, deduped — one non-blocking banner is
    // emitted at the end so a broken earlier file is reported without hiding the
    // active file's own diagnostics/types.
    const preludeIssuesSeen = new Map();
    let fileCode = masked.size
      ? maskBlocksByIndex(snap.code, syntaxSnap.doc, snap.blocks, masked)
      : snap.code;

    const forceFull = !!(traceOptions.forceFull
      || traceOptions.trigger === 'full'
      || preferFullCheck);
    const frontierRanges = (!forceFull && typeof getScopedFrontier === 'function')
      ? (getScopedFrontier(syntaxSnap) || [])
      : null;
    let keepIdx = frontierRanges && frontierRanges.length
      ? declIndicesForRanges(syntaxSnap.tree, frontierRanges)
      : null;
    const preludeFp = rawPrelude?.code != null ? fingerprint(rawPrelude.code) : '';
    // Only treat as "prelude changed" when we already certified a different
    // prelude. A null lastFullPreludeFp must NOT force full — otherwise every
    // cancelled settle while typing restarts an O(suite) bootstrap and the
    // frontier path never engages (the late-suite lag we just shipped around).
    const preludeChanged = lastFullPreludeFp != null
      && !!preludeFp
      && preludeFp !== lastFullPreludeFp;
    // Frontier path when we have a dirty neighborhood to certify. Empty frontier
    // with a prior ready verdict for this version → nothing for Beluga. Otherwise
    // bootstrap by certifying the whole active file (still compressed).
    // Prelude fingerprint change forces a one-shot full multipass to re-certify.
    const useFrontier = !forceFull
      && !preludeChanged
      && typeof getScopedFrontier === 'function'
      && !snap.hasSyntaxFault;

    function withCompressed(activeCode, idx) {
      const assembled = buildCompressedCheckerCode({
        fileCode: activeCode,
        prelude: currentPrelude(),
        keepIdx: idx,
        tree: syntaxSnap.tree,
        activeSrc: activeCode,
      });
      if (!assembled) return null;
      shiftPrelude = assembled.prelude;
      return assembled.code;
    }

    let assemblePass = withPrelude;
    let code;
    let lastOk = false;
    let checkedOkCode = null;
    let settledHoles = [];
    let settledMemberHoles = {};
    let passLimit;

    if (useFrontier && (!keepIdx || !keepIdx.size)) {
      const prev = checkerStore.getSnapshot();
      const priorForVersion = (prev.state === 'ready' || prev.state === 'stale')
        && prev.syntaxVersion === syntaxSnap.version;
      if (priorForVersion) {
        if (perf.enabled) perf.record('settle:mode', 0, { mode: 'frontier-empty' });
        if (preludeFp) lastFullPreludeFp = preludeFp;
        const prevDiags = (prev.belugaDiagnostics || []).filter((d) => d.source !== 'suite');
        return finish({
          syntaxVersion: syntaxSnap.version,
          checkerFp: canonicalFp,
          ok: prev.ok,
          belugaDiagnostics: [...prevDiags, ...suiteDiags],
          rawOutput: prev.rawOutput || '',
          holes: prev.holes || [],
          checkedCode: prev.checkedCode || '',
          checkedFp: prev.checkedFp || '',
          settleMode: 'frontier-empty',
        }, gen);
      }
      // Mount / first check: no dirty set yet — certify every top-level decl.
      const all = topDeclSpans(syntaxSnap.tree);
      keepIdx = new Set(all.map((_, i) => i));
    }

    if (useFrontier && keepIdx && keepIdx.size) {
      assemblePass = (activeCode) => withCompressed(activeCode, keepIdx) || '';
      code = assemblePass(fileCode);
      passLimit = Math.max(maxPasses, keepIdx.size + 2);
      if (perf.enabled) {
        perf.record('settle:mode', 0, { mode: 'frontier', keep: keepIdx.size });
      }
    } else {
      // Full uncompressed multipass (tests without frontier, forceFull, prelude change).
      if (typeof getScopedFrontier === 'function' && !masked.size && !snap.hasSyntaxFault) {
        try {
          const frontier = getScopedFrontier(syntaxSnap) || [];
          const earlyIdx = frontier.length ? declIndicesForRanges(syntaxSnap.tree, frontier) : null;
          if (earlyIdx && earlyIdx.size) {
            const earlyCode = withCompressed(snap.code, earlyIdx);
            if (earlyCode && earlyCode.trim()) {
              const res = await runCheck(earlyCode);
              if (gen !== generation) { releaseStaleChecking(gen); return null; }
              const keepRanges = declRangesForIndices(syntaxSnap.tree, earlyIdx);
              if (res && !res.ok && res.output) {
                const { diags } = processCheckerOutput(res.output, false);
                if (diags.length) {
                  checkerStore.applyProgress({
                    syntaxVersion: syntaxSnap.version,
                    checkerFp: canonicalFp,
                    belugaDiagnostics: [...diags, ...suiteDiags],
                    rawOutput: res.output,
                  });
                  if (typeof onProgress === 'function') onProgress(checkerStore.getSnapshot());
                }
              } else if (res && res.ok) {
                const prev = checkerStore.getSnapshot().belugaDiagnostics || [];
                const kept = diagnosticsOutsideRanges(prev, keepRanges);
                const hadInFrontier = prev.some((d) => keepRanges.some((r) => diagnosticOverlapsRange(d, r)));
                if (hadInFrontier) {
                  checkerStore.applyProgress({
                    syntaxVersion: syntaxSnap.version,
                    checkerFp: canonicalFp,
                    belugaDiagnostics: [...kept, ...suiteDiags],
                    replace: true,
                    rawOutput: res.output || '',
                  });
                  if (typeof onProgress === 'function') onProgress(checkerStore.getSnapshot());
                }
              }
            }
          }
        } catch (_) { /* full pass is authoritative */ }
      }

      assemblePass = withPrelude;
      code = assemblePass(fileCode);
      const preludeBlockData = ensurePreludeBlocks();
      const preludeBlockCount = preludeBlockData && preludeBlockData !== false
        ? preludeBlockData.blocks.length
        : 0;
      passLimit = Math.max(maxPasses, MAX_PASSES_PRELUDE_FLOOR, preludeBlockCount + maxPasses);
      if (perf.enabled) {
        perf.record('settle:mode', 0, {
          mode: forceFull ? 'full-forced' : (preludeChanged ? 'full-prelude' : 'full'),
        });
      }
    }

    try {
      if (!code || !String(code).trim()) {
        return finish({
          syntaxVersion: syntaxSnap.version,
          checkerFp: canonicalFp,
          ok: true,
          belugaDiagnostics: suiteDiags,
          rawOutput: '',
        }, gen);
      }

      for (let pass = 0; pass < passLimit; pass += 1) {
        const passSpan = perf.enabled ? perf.spanStart('settle:pass', { pass }) : null;
        const res = await runCheck(code);
        if (passSpan) perf.spanEnd(passSpan, { cancelled: gen !== generation });
        if (gen !== generation) { releaseStaleChecking(gen); return null; }
        passCount += 1;

        if (!res) {
          if (collected.length) break;
          checkerStore.markFailed(syntaxSnap.version);
          if (typeof onComplete === 'function') onComplete(checkerStore.getSnapshot());
          return checkerStore.getSnapshot();
        }

        if (res.output) outputs.push(res.output);
        if (res.ok) {
          lastOk = true;
          checkedOkCode = code;
          const attributed = attributeCheckerHoles(res.output, {
            prelude: shiftPrelude,
            activeFileName: ctx?.activeFileName || null,
          });
          settledHoles = attributed.activeHoles
            .filter((h) => h.line >= 1 && h.line <= diagDoc.lines);
          settledMemberHoles = attributed.memberHoles;
          break;
        }

        const { diags, preludeIssues } = processCheckerOutput(res.output, false);
        for (const iss of preludeIssues) {
          const k = `${iss.name}:${iss.line}`;
          if (!preludeIssuesSeen.has(k)) preludeIssuesSeen.set(k, iss);
        }
        const preludeAdded = maskPreludeIssues(preludeIssues);

        const newBlocks = new Set();
        for (const d of diags) {
          const idx = d.blockIndex != null
            ? d.blockIndex
            : (snap.blockAt && snap.blockAt(d.from) ? snap.blockAt(d.from).index : null);
          if (idx != null && masked.has(idx)) continue;
          if (idx != null && isInducedUnbound(d.message)) {
            newBlocks.add(idx);
            continue;
          }
          const key = diagKey(d);
          if (seen.has(key)) continue;
          seen.add(key);
          collected.push(d);
          if (idx != null) newBlocks.add(idx);
        }

        if (!newBlocks.size && !preludeAdded) break;

        if (newBlocks.size) for (const idx of impactOf([...newBlocks])) masked.add(idx);
        fileCode = masked.size
          ? maskBlocksByIndex(snap.code, syntaxSnap.doc, snap.blocks, masked)
          : snap.code;
        code = assemblePass(fileCode);
        if (!code || !String(code).trim()) {
          lastOk = true;
          break;
        }

        checkerStore.applyProgress({
          syntaxVersion: syntaxSnap.version,
          checkerFp: canonicalFp,
          belugaDiagnostics: collected.slice(),
          rawOutput: outputs.join('\n'),
        });
        if (gen === generation && typeof onProgress === 'function') {
          onProgress(checkerStore.getSnapshot());
        }
      }

      collected.sort((a, b) => a.from - b.from);
      const preludeIssuesAll = [...preludeIssuesSeen.values()];
      let finalDiags = [...collected, ...suiteDiags];
      if (useFrontier && keepIdx && keepIdx.size) {
        const keepRanges = declRangesForIndices(syntaxSnap.tree, keepIdx);
        const prev = checkerStore.getSnapshot();
        const outside = diagnosticsOutsideRanges(prev.belugaDiagnostics || [], keepRanges)
          .filter((d) => d.source !== 'suite');
        finalDiags = [...outside, ...collected, ...suiteDiags];
        finalDiags.sort((a, b) => (a.from || 0) - (b.from || 0));
      }
      // Record whatever prelude we settled against so the NEXT edit can use the
      // frontier path; only a real prelude content change forces full again.
      if (preludeFp) lastFullPreludeFp = preludeFp;
      return finish({
        syntaxVersion: syntaxSnap.version,
        checkerFp: canonicalFp,
        ok: lastOk && collected.length === 0 && preludeIssuesAll.length === 0,
        belugaDiagnostics: finalDiags,
        memberDiagnostics: memberDiagnosticsFromIssues(preludeIssuesAll),
        memberHoles: settledMemberHoles,
        rawOutput: outputs.join('\n'),
        holes: settledHoles,
        checkedCode: checkedOkCode || '',
        checkedFp: checkedOkCode ? fingerprint(checkedOkCode) : '',
        settleMode: useFrontier && keepIdx && keepIdx.size ? 'frontier' : 'full',
      }, gen);
    } catch (_) {
      if (gen !== generation) { releaseStaleChecking(gen); return null; }
      checkerStore.markFailed(syntaxSnap.version);
      if (typeof onComplete === 'function') onComplete(checkerStore.getSnapshot());
      return checkerStore.getSnapshot();
    } finally {
      if (settleSpan) perf.spanEnd(settleSpan, { passes: passCount });
    }
  }

  function schedule(syntaxSnap, options = {}) {
    const trigger = options.trigger || 'semantic';
    generation += 1;
    const gen = generation;

    if (scheduled) {
      clearTimeout(scheduled);
      scheduled = null;
    }

    cancelInflightIfStale();

    checkerStore.invalidate(syntaxSnap.version);

    const delay = typeof getSettleDelay === 'function'
      ? getSettleDelay(syntaxSnap)
      : SETTLE_DELAY_MS;
    const perf = getCheckTrace();
    if (perf.enabled) perf.record('settle:debounce', delay, { gen, trigger });

    scheduled = setTimeout(() => {
      scheduled = null;
      inflightStartedAt = Date.now();
      inflight = settleNow(syntaxSnap, gen, { trigger }).finally(() => {
        inflight = null;
      });
    }, delay);
  }

  function cancelPending() {
    generation += 1;
    if (scheduled) {
      clearTimeout(scheduled);
      scheduled = null;
    }
    cancelInflightIfStale();
  }

  function isSettledFor(version) {
    const s = checkerStore.getSnapshot();
    return s.syntaxVersion === version && (s.state === 'ready' || s.state === 'failed');
  }

  function isPending() {
    return scheduled !== null || inflight !== null;
  }

  function releaseStaleChecking(gen) {
    if (gen === generation) return;
    const snap = checkerStore.getSnapshot();
    if (snap.state === 'checking') checkerStore.holdVerdict();
  }

  return {
    schedule,
    cancel: cancelPending,
    cancelPending,
    isSettledFor,
    isPending,
    releaseStaleChecking,
    settleNow,
  };
}

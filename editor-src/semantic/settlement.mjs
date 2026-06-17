import { fallbackDiagnostic, namedCulprit, parseBelugaDiagnostics } from '../bel-beluga-diag.mjs';
import { assembleCheckerCode, shiftCheckerOutput } from '../project-prelude.mjs';
import { mergeDiagnostics, parseQueryRuntimeDiagnostics } from '../bel-query-diag.mjs';
import { checkerSnapshotFromSyntax } from '../checker-snapshot.mjs';
import { maskBlocksByIndex } from '../bel-units.mjs';
import { blockDependents, walkTree } from '../bel-walk.mjs';

const SETTLE_DELAY_MS = 250;

// Beluga halts at the first error it meets. A single check therefore yields at
// most ONE diagnostic per settle — antithetical to the engine's whole design.
// MAX_PASSES bounds the divide-and-conquer loop that works around it: each
// pass masks the blocks that already errored (plus everything depending on
// them) and re-checks the remainder, so independent errors all surface.
const MAX_PASSES = 8;

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

function preludeBannerDiag(doc, issues) {
  if (!issues.length) return null;
  const first = issues[0];
  const more = issues.length > 1 ? ` (+${issues.length - 1} more in prelude)` : '';
  return {
    from: 0,
    to: Math.min(1, doc.length),
    severity: 'error',
    message: `Error in earlier file ${first.name}:${first.line} — fix prelude files in this folder first${more}`,
    source: 'beluga',
  };
}

export function createSettlement({
  belugaClient,
  checkerStore,
  getCheckContext = null,
  onComplete = null,
  onChecking = null,
  onProgress = null,
  maxPasses = MAX_PASSES,
} = {}) {
  let scheduled = null;
  let inflight = null;
  let generation = 0;

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

  async function settleNow(syntaxSnap, gen) {
    if (!syntaxSnap || !belugaClient) return null;

    const snap = checkerSnapshotFromSyntax(syntaxSnap);
    const ctx = typeof getCheckContext === 'function' ? getCheckContext(syntaxSnap) : null;
    const rawPrelude = ctx?.prelude || null;
    let shiftPrelude = rawPrelude;
    const diagDoc = ctx?.doc || syntaxSnap.doc;

    function withPrelude(fileCode) {
      const assembled = assembleCheckerCode(fileCode, rawPrelude);
      shiftPrelude = assembled.prelude;
      return assembled.code;
    }

    function processCheckerOutput(rawOutput, ok) {
      const shifted = shiftPrelude ? shiftCheckerOutput(rawOutput, shiftPrelude) : { text: rawOutput, preludeIssues: [] };
      let diags = belugaDiagnosticsFromOutput(shifted.text, diagDoc, {
        blockAt: snap.blockAt,
        hasSyntaxFault: snap.hasSyntaxFault,
        ok,
      });
      if (rawPrelude?.names?.size) {
        diags = diags.filter((d) => {
          const culprit = namedCulprit(d.message || '');
          return !(culprit && rawPrelude.names.has(culprit));
        });
      }
      const banner = preludeBannerDiag(diagDoc, shifted.preludeIssues);
      if (banner) diags = [banner, ...diags];
      return { diags, shiftedText: shifted.text };
    }

    if (!snap.code.trim()) {
      return finish({
        syntaxVersion: syntaxSnap.version,
        checkerFp: '',
        ok: true,
        belugaDiagnostics: [],
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
    let fileCode = masked.size
      ? maskBlocksByIndex(snap.code, syntaxSnap.doc, snap.blocks, masked)
      : snap.code;
    let code = withPrelude(fileCode);
    let lastOk = false;
    // The code of the last pass that actually loaded clean — what the checker
    // slot really holds afterwards. Stays null if no pass came back ok.
    let checkedOkCode = null;

    try {
      // Everything checkable was carved out by syntax faults — the JS lint
      // owns those errors; there is nothing for Beluga to add.
      if (!code.trim()) {
        return finish({
          syntaxVersion: syntaxSnap.version,
          checkerFp: canonicalFp,
          ok: true,
          belugaDiagnostics: [],
          rawOutput: '',
        }, gen);
      }

      for (let pass = 0; pass < maxPasses; pass += 1) {
        const res = await runCheck(code);
        if (gen !== generation) return null;

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
          break;
        }

        const { diags } = processCheckerOutput(res.output, false);

        // Attribute this pass's findings to blocks. Anything pointing into a
        // block we already masked is an echo of a prior error (the checker
        // mock or a stale message), not new information — drop it. An induced
        // unbound (its culprit's definition was masked away) still ADVANCES
        // the loop — its block gets carved out — but is never shown.
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

        // No fresh block to carve out → no further progress possible.
        if (!newBlocks.size) break;

        // Mask the erroring blocks AND everything impacted by them: dependent
        // blocks can only produce induced "unbound identifier" noise once
        // their dependency is gone, so they're carved out of the next pass.
        for (const idx of impactOf([...newBlocks])) masked.add(idx);
        fileCode = maskBlocksByIndex(snap.code, syntaxSnap.doc, snap.blocks, masked);
        code = withPrelude(fileCode);
        if (!code.trim()) {
          lastOk = true;
          break;
        }

        // Publish what we have so far — errors appear in the editor pass by
        // pass instead of all-or-nothing at the end.
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
      return finish({
        syntaxVersion: syntaxSnap.version,
        checkerFp: canonicalFp,
        ok: lastOk && collected.length === 0,
        belugaDiagnostics: collected,
        rawOutput: outputs.join('\n'),
        checkedCode: checkedOkCode || '',
        checkedFp: checkedOkCode ? fingerprint(checkedOkCode) : '',
      }, gen);
    } catch (_) {
      if (gen !== generation) return null;
      checkerStore.markFailed(syntaxSnap.version);
      if (typeof onComplete === 'function') onComplete(checkerStore.getSnapshot());
      return checkerStore.getSnapshot();
    }
  }

  function schedule(syntaxSnap) {
    generation += 1;
    const gen = generation;

    if (scheduled) {
      clearTimeout(scheduled);
      scheduled = null;
    }

    checkerStore.invalidate(syntaxSnap.version);

    scheduled = setTimeout(() => {
      scheduled = null;
      inflight = settleNow(syntaxSnap, gen).finally(() => {
        inflight = null;
      });
    }, SETTLE_DELAY_MS);
  }

  function cancel() {
    generation += 1;
    if (scheduled) {
      clearTimeout(scheduled);
      scheduled = null;
    }
  }

  function isSettledFor(version) {
    const s = checkerStore.getSnapshot();
    return s.syntaxVersion === version && (s.state === 'ready' || s.state === 'failed');
  }

  return {
    schedule,
    cancel,
    isSettledFor,
    settleNow,
  };
}

import { Text } from '@codemirror/state';
import { parser } from '../beluga-parser.js';
import { fallbackDiagnostic, namedCulprit, parseBelugaDiagnostics, spanFirstLineDiagnostic } from '../bel-beluga-diag.mjs';
import { assembleCheckerCode, shiftCheckerOutput } from '../project-prelude.mjs';
import { mergeDiagnostics, parseQueryRuntimeDiagnostics } from '../bel-query-diag.mjs';
import { checkerSnapshotFromSyntax } from '../checker-snapshot.mjs';
import { computeLintBlocks, maskBlocksByIndex } from '../bel-units.mjs';
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

// A prelude file shows an error, but is that error genuinely the prelude file's
// fault — or did the ACTIVE file inject it? When the active file carries a global
// pragma (e.g. --nostrengthen) or a colliding declaration, Beluga hoists/merges
// it across the whole development and the prelude file fails at a line that is
// perfectly correct on its own. Telling the user "fix the earlier file" is then
// a lie: they open it, run it standalone, it's clean, and they're stranded. So a
// prelude issue whose file is named by an active-file-caused suite finding is NOT
// the earlier file's fault and must not raise the "fix earlier file" banner — the
// suite finding (anchored on the real cause in THIS file) already explains it.
function preludeIssueIsActiveCaused(issue, findings) {
  for (const f of findings) {
    if (!f.atIsActive) continue;
    // A leaked pragma from the active file breaks earlier files in the prelude;
    // "fix the earlier file" is then a lie (it's clean standalone). The
    // shadowed-use finding, by contrast, makes the ACTIVE file the victim — its
    // error lands in the active file itself, not the prelude — so it needs no
    // banner re-attribution here.
    if (f.kind === 'pragma-leak' && (f.affectedNames || []).includes(issue.name)) return true;
  }
  return false;
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

function preludeBannerDiag(doc, issues, findings = []) {
  // Drop prelude issues the active file itself caused — their true explanation is
  // the suite finding pinned to this file, not "go fix a correct earlier file".
  const genuine = issues.filter((iss) => !preludeIssueIsActiveCaused(iss, findings));
  if (!genuine.length) return null;
  const first = genuine[0];
  const more = genuine.length > 1 ? ` (+${genuine.length - 1} more in prelude)` : '';
  // Start-of-file banner: the shared first-line rule makes it hoverable across
  // the whole line, not just one char.
  return spanFirstLineDiagnostic({
    from: 0,
    to: Math.min(1, doc.length),
    severity: 'error',
    message: `Error in earlier file ${first.name}:${first.line}. Fix earlier suite files in this folder first${more}`,
    source: 'beluga',
  }, doc);
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
        if (hit && !maskedPrelude.has(hit.index)) { maskedPrelude.add(hit.index); added += 1; }
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
      if (rawPrelude?.names?.size) {
        diags = diags.filter((d) => {
          const culprit = namedCulprit(d.message || '');
          return !(culprit && rawPrelude.names.has(culprit));
        });
      }
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
    let code = withPrelude(fileCode);
    let lastOk = false;
    // The code of the last pass that actually loaded clean — what the checker
    // slot really holds afterwards. Stays null if no pass came back ok.
    let checkedOkCode = null;

    try {
      // Everything checkable was carved out by syntax faults — the JS lint
      // owns those errors; there is nothing for Beluga to add. Suite-composition
      // warnings are independent of that, so they still ride along.
      if (!code.trim()) {
        return finish({
          syntaxVersion: syntaxSnap.version,
          checkerFp: canonicalFp,
          ok: true,
          belugaDiagnostics: suiteDiags,
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

        const { diags, preludeIssues } = processCheckerOutput(res.output, false);
        for (const iss of preludeIssues) {
          const k = `${iss.name}:${iss.line}`;
          if (!preludeIssuesSeen.has(k)) preludeIssuesSeen.set(k, iss);
        }
        // An error inside an earlier suite file halts Beluga before the active
        // file is reached. Carve out that prelude block and re-check so the
        // active file's own results still surface (its types for anything not
        // depending on the masked block included).
        const preludeAdded = maskPreludeIssues(preludeIssues);

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

        // No fresh active block AND no fresh prelude block → no progress.
        if (!newBlocks.size && !preludeAdded) break;

        // Mask the erroring blocks AND everything impacted by them: dependent
        // blocks can only produce induced "unbound identifier" noise once
        // their dependency is gone, so they're carved out of the next pass.
        if (newBlocks.size) for (const idx of impactOf([...newBlocks])) masked.add(idx);
        fileCode = masked.size
          ? maskBlocksByIndex(snap.code, syntaxSnap.doc, snap.blocks, masked)
          : snap.code;
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
      // One non-blocking banner for the earlier-file errors that were masked to
      // reach the active file. It rides alongside (not instead of) the active
      // file's own diagnostics.
      const preludeIssuesAll = [...preludeIssuesSeen.values()];
      const banner = preludeBannerDiag(diagDoc, preludeIssuesAll, suiteFindings);
      const finalDiags = [...(banner ? [banner] : []), ...collected, ...suiteDiags];
      return finish({
        syntaxVersion: syntaxSnap.version,
        checkerFp: canonicalFp,
        ok: lastOk && collected.length === 0 && preludeIssuesAll.length === 0,
        belugaDiagnostics: finalDiags,
        memberDiagnostics: memberDiagnosticsFromIssues(preludeIssuesAll),
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

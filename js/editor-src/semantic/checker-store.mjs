export function createCheckerStore() {
  let snapshot = {
    syntaxVersion: -1,
    checkerFp: '',
    state: 'idle',
    ok: true,
    belugaDiagnostics: [],
    // Per-member cross-file findings: { [memberFileName]: [{ line, message,
    // severity }] } for development members OTHER than the active file (the
    // active file's diagnostics carry real from/to and ride belugaDiagnostics).
    memberDiagnostics: {},
    // Goal types for development members OTHER than the active file, keyed by
    // project path: { [memberFileName]: [{ line, col, goal, ctx, meta, index }] }.
    memberHoles: {},
    rawOutput: '',
    // Holes parsed from the clean reconstruction output (source order, doc-relative
    // positions): [{ line, col, goal, ctx, meta, index, name }]. See hole-report.mjs.
    holes: [],
    // The code (and its fingerprint) the LAST SUCCESSFUL checker pass actually
    // loaded. With multi-pass settlement this can be more masked than the
    // canonical snapshot code: erroring blocks are blanked so the rest of the
    // file stays live for elaboration/hover.
    checkedCode: '',
    checkedFp: '',
  };

  function invalidate(syntaxVersion) {
    const prev = snapshot;
    const keepDiags = (prev.state === 'ready' || prev.state === 'stale' || prev.state === 'checking')
      ? (prev.belugaDiagnostics || []).map((d) => ({ ...d, stale: true }))
      : [];
    snapshot = {
      syntaxVersion,
      checkerFp: prev.checkerFp,
      state: keepDiags.length ? 'stale' : 'idle',
      ok: prev.ok,
      belugaDiagnostics: keepDiags,
      // Cross-file health changes far slower than the active doc; carry it across
      // an active-file re-check so member badges don't blink on every keystroke.
      memberDiagnostics: prev.memberDiagnostics || {},
      memberHoles: prev.memberHoles || {},
      rawOutput: prev.rawOutput,
      // Holes change only on a clean re-check; carry them across an invalidate so
      // the decorations don't blink off on every keystroke (they go stale, not gone).
      holes: prev.holes || [],
      checkedCode: '',
      checkedFp: '',
    };
  }

  function markChecking(syntaxVersion, checkerFp) {
    snapshot = {
      ...snapshot,
      syntaxVersion,
      checkerFp,
      state: 'checking',
    };
  }

  // Mid-settlement update: diagnostics found so far land in the UI while the
  // remaining passes are still running. State stays 'checking'.
  function applyProgress({ syntaxVersion, checkerFp, belugaDiagnostics, rawOutput, replace = false }) {
    const incoming = belugaDiagnostics || [];
    // Mid-pass progress with nothing new yet must not blink stale findings away —
    // the status dot and inspector stay on "rechecking error" until a pass lands
    // or settlement finishes. `replace: true` opts in (scoped frontier clear).
    const next = (replace || incoming.length) ? incoming : (snapshot.belugaDiagnostics || []);
    snapshot = {
      ...snapshot,
      syntaxVersion,
      checkerFp: checkerFp != null ? checkerFp : snapshot.checkerFp,
      state: 'checking',
      ok: !next.length,
      belugaDiagnostics: next,
      rawOutput: rawOutput != null ? rawOutput : snapshot.rawOutput,
    };
  }

  function applyResult({
    syntaxVersion,
    checkerFp,
    ok,
    belugaDiagnostics,
    memberDiagnostics = {},
    memberHoles = {},
    rawOutput,
    holes = [],
    checkedCode = '',
    checkedFp = '',
    settleMode = null,
  }) {
    snapshot = {
      syntaxVersion,
      checkerFp,
      state: 'ready',
      ok: !!ok,
      belugaDiagnostics: belugaDiagnostics || [],
      memberDiagnostics: memberDiagnostics || {},
      memberHoles: memberHoles || {},
      rawOutput: rawOutput || '',
      holes: holes || [],
      checkedCode,
      checkedFp,
      settleMode: settleMode || null,
    };
  }

  function markFailed(syntaxVersion, { belugaDiagnostics = null, rawOutput = null } = {}) {
    snapshot = {
      ...snapshot,
      syntaxVersion,
      state: 'failed',
      ok: false,
      belugaDiagnostics: belugaDiagnostics != null ? belugaDiagnostics : snapshot.belugaDiagnostics,
      rawOutput: rawOutput != null ? rawOutput : snapshot.rawOutput,
      // A failed pass tells us nothing about what's loaded — never let an
      // older version's checkedCode/holes survive under this syntaxVersion.
      holes: [],
      checkedCode: '',
      checkedFp: '',
    };
  }

  // Cosmetic edit: syntax version moves but the Beluga substrate is unchanged.
  function adoptSyntaxVersion(syntaxVersion) {
    snapshot = { ...snapshot, syntaxVersion };
  }

  // Abort a pending/in-flight check without marking findings stale.
  function holdVerdict() {
    if (snapshot.state === 'ready') return;
    if (snapshot.state === 'idle' || snapshot.state === 'failed') return;
    snapshot = {
      ...snapshot,
      state: 'ready',
      belugaDiagnostics: (snapshot.belugaDiagnostics || []).map((d) => {
        if (!d.stale) return d;
        const { stale, ...rest } = d;
        return rest;
      }),
    };
  }

  function remapDiagnostics(changes) {
    if (!changes || !snapshot.belugaDiagnostics?.length) return;
    snapshot = {
      ...snapshot,
      belugaDiagnostics: snapshot.belugaDiagnostics.map((d) => {
        if (d.from == null) return d;
        const from = changes.mapPos(d.from, 1);
        const to = d.to != null ? changes.mapPos(d.to, -1) : d.to;
        return from === d.from && to === d.to ? d : { ...d, from, to };
      }),
    };
  }

  function getSnapshot() {
    return snapshot;
  }

  function settleState() {
    return snapshot.state;
  }

  return {
    invalidate,
    markChecking,
    applyProgress,
    applyResult,
    markFailed,
    adoptSyntaxVersion,
    holdVerdict,
    remapDiagnostics,
    getSnapshot,
    settleState,
  };
}

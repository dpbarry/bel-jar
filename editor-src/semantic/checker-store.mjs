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
    rawOutput: '',
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
      rawOutput: prev.rawOutput,
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
  function applyProgress({ syntaxVersion, checkerFp, belugaDiagnostics, rawOutput }) {
    snapshot = {
      ...snapshot,
      syntaxVersion,
      checkerFp: checkerFp != null ? checkerFp : snapshot.checkerFp,
      state: 'checking',
      ok: !(belugaDiagnostics && belugaDiagnostics.length),
      belugaDiagnostics: belugaDiagnostics || [],
      rawOutput: rawOutput != null ? rawOutput : snapshot.rawOutput,
    };
  }

  function applyResult({
    syntaxVersion,
    checkerFp,
    ok,
    belugaDiagnostics,
    memberDiagnostics = {},
    rawOutput,
    checkedCode = '',
    checkedFp = '',
  }) {
    snapshot = {
      syntaxVersion,
      checkerFp,
      state: 'ready',
      ok: !!ok,
      belugaDiagnostics: belugaDiagnostics || [],
      memberDiagnostics: memberDiagnostics || {},
      rawOutput: rawOutput || '',
      checkedCode,
      checkedFp,
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
      // older version's checkedCode survive under this syntaxVersion.
      checkedCode: '',
      checkedFp: '',
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
    getSnapshot,
    settleState,
  };
}

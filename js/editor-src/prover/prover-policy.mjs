/** Prover search policy: wave size, domination deferral, verdict taxonomy. */
export function deferDominated(moves) {
  const live = [];
  const rest = [];
  for (const mv of (Array.isArray(moves) ? moves : [])) {
    (mv && mv.dominated ? rest : live).push(mv);
  }
  return rest.length ? [...live, ...rest] : moves;
}

/** Mark writableRisk synths dominated when a clean closing synth exists. */
export function withWritableRiskDominated(synths) {
  const list = Array.isArray(synths) ? synths : [];
  const hasClean = list.some((s) => s && s.text && !/\?/.test(String(s.text)) && !s.writableRisk);
  if (!hasClean) return list;
  return list.map((s) => {
    if (!s || !s.writableRisk) return s;
    return {
      ...s,
      dominated: true,
      rationale: `${s.rationale || ''} (subsumed by writable synth)`.trim(),
    };
  });
}

/** Closing candidates certify alone (plan-sized check). */
export function certifyWaveSize(mv, defaultWave) {
  const w = Math.max(1, defaultWave == null ? 3 : defaultWave);
  if (mv && (mv.closingPlan || (mv.text != null && !/\?/.test(String(mv.text))))) return 1;
  return w;
}

/**
 * Verdict taxonomy on a proveProgram result.
 * Tier is set only for real Tier-1 claims (COMPLETE / DISPROVED / NO-CUT-FREE-PROOF).
 */
export function classifyVerdict(res) {
  if (!res) return { verdict: 'UNKNOWN', tier: null };
  if (res.complete) return { verdict: 'COMPLETE', tier: 1 };
  const reason = res.stuck && res.stuck.reason;
  if (reason === 'disproved') return { verdict: 'DISPROVED', tier: 1 }; // GENERAL: §3.3 / Phase-I stuck reason
  if (reason === 'cancelled') return { verdict: 'CANCELLED', tier: null }; // GENERAL: search control
  if (reason === 'file-errors') return { verdict: 'ILL-TYPED', tier: null }; // GENERAL: stuck reason
  if (reason === 'coinductive-out-of-fragment') {
    return { verdict: 'BEYOND-FRAGMENT', tier: 2 }; // GENERAL: stuck reason
  }
  if (reason === 'no-totality-measure') {
    return { verdict: 'STUCK', tier: null }; // GENERAL: stuck reason — actionable; not yet NEEDS-A-CUT
  }
  if (reason === 'step-bound' || reason === 'search-bound') {
    return { verdict: 'SEARCH-BOUND', tier: null }; // GENERAL: stuck reason
  }
  if (reason === 'no-move' && res.stuck.noCutFree) { // GENERAL: stuck reason
    return { verdict: 'NO-CUT-FREE-PROOF', tier: 1 };
  }
  if (reason === 'no-move' || reason === 'no-moves') {
    return { verdict: 'STUCK', tier: null }; // GENERAL: stuck reason
  }
  return { verdict: 'STUCK', tier: null };
}

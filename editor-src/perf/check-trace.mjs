const CAP = 256;

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function createCheckTrace(enabled = false) {
  const events = [];
  const spans = new Map();
  let editSeq = 0;

  function push(phase, ms, meta = {}) {
    const row = { t: Date.now(), phase, ms: ms != null ? Math.round(ms * 10) / 10 : null, ...meta };
    events.push(row);
    if (events.length > CAP) events.shift();
    const g = typeof globalThis !== 'undefined' ? globalThis : null;
    if (g?.BelJarPerfDebug && typeof console !== 'undefined') {
      console.debug('[beljar-perf]', phase, ms != null ? `${ms.toFixed(1)}ms` : '', meta);
    }
    return row;
  }

  return {
    enabled,
    events,
    beginEdit() {
      editSeq += 1;
      push('edit', 0, { editSeq });
      return editSeq;
    },
    spanStart(name, meta = {}) {
      const id = `${name}:${now()}:${Math.random().toString(36).slice(2, 7)}`;
      spans.set(id, { name, t0: now(), meta });
      return id;
    },
    spanEnd(id, extra = {}) {
      const s = spans.get(id);
      if (!s) return null;
      spans.delete(id);
      const ms = now() - s.t0;
      push(s.name, ms, { ...s.meta, ...extra });
      return ms;
    },
    record(phase, ms, meta = {}) {
      return push(phase, ms, meta);
    },
    workerJob(type, ms, meta = {}) {
      return push(`worker:${type}`, ms, meta);
    },
    lastEditBreakdown() {
      const lastEdit = [...events].reverse().find((e) => e.phase === 'edit');
      if (!lastEdit) return null;
      const seq = lastEdit.editSeq;
      const related = events.filter((e) => e.editSeq === seq || e.t >= lastEdit.t);
      const byPhase = {};
      for (const e of related) {
        if (e.ms == null) continue;
        if (!byPhase[e.phase]) byPhase[e.phase] = [];
        byPhase[e.phase].push(e.ms);
      }
      const summary = {};
      for (const [phase, times] of Object.entries(byPhase)) {
        const sorted = times.slice().sort((a, b) => a - b);
        summary[phase] = {
          count: times.length,
          total: Math.round(times.reduce((a, b) => a + b, 0) * 10) / 10,
          p50: Math.round(percentile(sorted, 50) * 10) / 10,
          p95: Math.round(percentile(sorted, 95) * 10) / 10,
        };
      }
      return { editSeq: seq, at: lastEdit.t, phases: summary };
    },
    statsForPhase(phase) {
      const times = events.filter((e) => e.phase === phase && e.ms != null).map((e) => e.ms);
      if (!times.length) return null;
      const sorted = times.slice().sort((a, b) => a - b);
      return {
        count: times.length,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
      };
    },
    exportEvents() {
      return events.slice();
    },
    clear() {
      events.length = 0;
      spans.clear();
    },
  };
}

let shared = null;

export function getCheckTrace() {
  if (!shared) {
    const g = typeof globalThis !== 'undefined' ? globalThis : null;
    const enabled = !!(g && (g.BelJarPerf || g.BelJarPerfDebug));
    shared = createCheckTrace(enabled);
    if (g) g.BelJarPerf = shared;
  }
  return shared;
}

export function perfEnabled() {
  const g = typeof globalThis !== 'undefined' ? globalThis : null;
  return !!(g && (g.BelJarPerf || g.BelJarPerfDebug));
}

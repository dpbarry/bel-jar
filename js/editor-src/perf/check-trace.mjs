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
    if (g?.PerfDebug && typeof console !== 'undefined') {
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

// Enable flag is SEPARATE from the trace object. Earlier both lived at
// `window.Perf`, so `window.Perf = true` clobbered the object and
// lost lastEditBreakdown(). Now:
//   • window.Perf        — the trace object (methods live here), always.
//   • window.__belPerfOn       — the enable flag (set by Perf.enable()).
//   • window.PerfDebug   — legacy: also enables + console.debug spam.
function perfFlagOn(g) {
  return !!(g && (g.__belPerfOn || g.PerfDebug));
}

export function getCheckTrace() {
  if (!shared) {
    const g = typeof globalThis !== 'undefined' ? globalThis : null;
    shared = createCheckTrace(perfFlagOn(g));
    if (g) {
      // Attach enable/disable so `Perf.enable()` turns tracing on WITHOUT
      // overwriting the object.
      shared.enable = () => { g.__belPerfOn = true; shared.enabled = true; return 'perf tracing ON — type, then Perf.report()'; };
      shared.disable = () => { g.__belPerfOn = false; shared.enabled = false; return 'perf tracing OFF'; };
      // One-shot summary of every synchronous per-keystroke phase, sorted by p95.
      // Enumerate whatever `sync:` phases were actually recorded rather than a
      // fixed whitelist, so newly-instrumented phases (settlementTrigger,
      // graphUpdate, sym.incremental, …) always surface instead of being hidden.
      shared.report = () => {
        const seen = new Set();
        for (const e of shared.events) {
          if (typeof e.phase === 'string' && e.phase.startsWith('sync:')) seen.add(e.phase);
        }
        const rows = [...seen].map((p) => {
          const s = shared.statsForPhase(p);
          return s ? { phase: p.replace('sync:', ''), count: s.count, p50: Math.round(s.p50 * 10) / 10, p95: Math.round(s.p95 * 10) / 10 } : null;
        }).filter(Boolean).sort((a, b) => b.p95 - a.p95);
        if (typeof console !== 'undefined' && console.table) console.table(rows);
        return rows;
      };
      g.Perf = shared;
      g.BelJarPerf = g.Perf
    }
  }
  return shared;
}

export function perfEnabled() {
  const g = typeof globalThis !== 'undefined' ? globalThis : null;
  return perfFlagOn(g);
}

// Time a synchronous fn and record it under `sync:<phase>` — but ONLY when perf
// tracing is enabled, so it's genuinely zero-cost (no now() calls) in normal use.
// Instruments work that runs INSIDE a CodeMirror transaction (before paint), which
// nothing else measures. Enable with Perf.enable(); read with Perf.report().
export function timeSync(phase, fn, meta = {}) {
  const g = typeof globalThis !== 'undefined' ? globalThis : null;
  if (!perfFlagOn(g)) return fn();
  const trace = getCheckTrace();
  const t0 = now();
  const r = fn();
  trace.record(`sync:${phase}`, now() - t0, meta);
  return r;
}

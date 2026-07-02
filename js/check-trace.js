'use strict';
(function (global) {
  var CAP = 256;
  function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    var idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
  }
  function createCheckTrace(enabled) {
    var events = [];
    var spans = {};
    var editSeq = 0;
    function push(phase, ms, meta) {
      meta = meta || {};
      var row = { t: Date.now(), phase: phase, ms: ms != null ? Math.round(ms * 10) / 10 : null };
      for (var k in meta) if (Object.prototype.hasOwnProperty.call(meta, k)) row[k] = meta[k];
      events.push(row);
      if (events.length > CAP) events.shift();
      if (global.BelJarPerfDebug && console.debug) {
        console.debug('[beljar-perf]', phase, ms != null ? ms.toFixed(1) + 'ms' : '', meta);
      }
      return row;
    }
    return {
      enabled: enabled,
      events: events,
      beginEdit: function () {
        editSeq += 1;
        push('edit', 0, { editSeq: editSeq });
        return editSeq;
      },
      spanStart: function (name, meta) {
        var id = name + ':' + now() + ':' + Math.random().toString(36).slice(2, 7);
        spans[id] = { name: name, t0: now(), meta: meta || {} };
        return id;
      },
      spanEnd: function (id, extra) {
        var s = spans[id];
        if (!s) return null;
        delete spans[id];
        var ms = now() - s.t0;
        var m = {};
        for (var a in s.meta) m[a] = s.meta[a];
        if (extra) for (var b in extra) m[b] = extra[b];
        push(s.name, ms, m);
        return ms;
      },
      record: function (phase, ms, meta) { return push(phase, ms, meta); },
      workerJob: function (type, ms, meta) {
        meta = meta || {};
        meta.slot = meta.slot || 'checker';
        return push('worker:' + type, ms, meta);
      },
      lastEditBreakdown: function () {
        var lastEdit = null;
        for (var i = events.length - 1; i >= 0; i--) {
          if (events[i].phase === 'edit') { lastEdit = events[i]; break; }
        }
        if (!lastEdit) return null;
        var seq = lastEdit.editSeq;
        var related = events.filter(function (e) {
          return e.editSeq === seq || e.t >= lastEdit.t;
        });
        var byPhase = {};
        related.forEach(function (e) {
          if (e.ms == null) return;
          if (!byPhase[e.phase]) byPhase[e.phase] = [];
          byPhase[e.phase].push(e.ms);
        });
        var summary = {};
        Object.keys(byPhase).forEach(function (phase) {
          var times = byPhase[phase];
          var sorted = times.slice().sort(function (a, b) { return a - b; });
          summary[phase] = {
            count: times.length,
            total: Math.round(times.reduce(function (a, b) { return a + b; }, 0) * 10) / 10,
            p50: Math.round(percentile(sorted, 50) * 10) / 10,
            p95: Math.round(percentile(sorted, 95) * 10) / 10,
          };
        });
        return { editSeq: seq, at: lastEdit.t, phases: summary };
      },
      statsForPhase: function (phase) {
        var times = events.filter(function (e) { return e.phase === phase && e.ms != null; }).map(function (e) { return e.ms; });
        if (!times.length) return null;
        var sorted = times.slice().sort(function (a, b) { return a - b; });
        return { count: times.length, p50: percentile(sorted, 50), p95: percentile(sorted, 95) };
      },
      exportEvents: function () { return events.slice(); },
      clear: function () { events.length = 0; spans = {}; },
    };
  }
  if (!global.BelJarPerf) {
    global.BelJarPerf = createCheckTrace(!!global.BelJarPerfDebug);
  }
})(typeof window !== 'undefined' ? window : globalThis);

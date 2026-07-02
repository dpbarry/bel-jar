'use strict';
(function (global) {
  var panel = null;
  var timer = null;

  function perf() {
    return global.BelJarPerf || null;
  }

  function formatBreakdown(bd) {
    if (!bd || !bd.phases) return '(no edit trace yet — type in the editor)';
    var lines = ['edit #' + bd.editSeq];
    var phases = Object.keys(bd.phases).sort();
    for (var i = 0; i < phases.length; i += 1) {
      var p = phases[i];
      var s = bd.phases[p];
      lines.push(p + ': n=' + s.count + ' total=' + s.total + 'ms p50=' + s.p50 + ' p95=' + s.p95);
    }
    return lines.join('\n');
  }

  function render() {
    if (!panel) return;
    var p = perf();
    if (!p) {
      panel.textContent = 'BelJarPerf missing — reload after check-trace.js loads';
      return;
    }
    panel.textContent = formatBreakdown(p.lastEditBreakdown());
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('pre');
    panel.id = 'beljar-perf-hud';
    panel.setAttribute('aria-live', 'polite');
    panel.style.cssText = [
      'position:fixed', 'bottom:12px', 'right:12px', 'z-index:99999',
      'margin:0', 'padding:8px 10px', 'max-width:min(420px,90vw)',
      'font:11px/1.35 ui-monospace,monospace', 'white-space:pre-wrap',
      'color:#e8e8ec', 'background:rgba(18,18,22,.92)', 'border:1px solid #444',
      'border-radius:6px', 'pointer-events:none', 'box-shadow:0 4px 16px rgba(0,0,0,.35)',
    ].join(';');
    document.body.appendChild(panel);
    return panel;
  }

  function enable() {
    global.BelJarPerfDebug = true;
    var p = perf();
    if (p) p.enabled = true;
    ensurePanel();
    render();
    if (timer) clearInterval(timer);
    timer = setInterval(render, 500);
    if (console.info) console.info('[beljar-perf] HUD enabled — BelJarPerf.lastEditBreakdown() / exportEvents()');
    return p;
  }

  function disable() {
    if (timer) { clearInterval(timer); timer = null; }
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
    var p = perf();
    if (p) p.enabled = false;
    global.BelJarPerfDebug = false;
  }

  global.BelJarPerfHud = { enable: enable, disable: disable, refresh: render };
})(typeof window !== 'undefined' ? window : globalThis);

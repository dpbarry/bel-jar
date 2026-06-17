'use strict';

(function (global) {
  var FADE_OUT_MS = 175;
  var SMOOTH_K = 8;
  var CREEP_BUDGET_SCALE = 0.5;

  // Conservative first-run model (stable WASM); refined per device after loads.
  var DEFAULT_BASE_MS = 650;
  var DEFAULT_MS_PER_LINE = 16;
  var MIN_MS_PER_LINE = 1.5;
  var MIN_BASE_MS = 120;
  var MIN_ESTIMATE_MS = 900;
  var LEARN_MIN_LINES = 5;
  var LEARN_ALPHA_CAP = 0.35;
  var LEARN_ALPHA_FLOOR = 0.08;

  var headerEl = null;
  var fillEl = null;
  var statusEl = null;
  var outputEl = null;

  var running = false;
  var rafId = null;
  var lastTick = 0;
  var displayRatio = 0;
  var targetRatio = 0;
  var creepStart = 0;
  var lineCount = 0;

  var PHASE_WEIGHTS = {
    init: { begin: 0.05, done: 0.05 },
    'Type Reconstruction': { begin: 0.12, done: 0.72 },
    Holes: { begin: 0.78, done: 0.92 },
  };

  var DEFAULT_PHASE = { begin: 0.2, done: 0.85 };

  function defaultModel() {
    return { baseMs: DEFAULT_BASE_MS, msPerLine: DEFAULT_MS_PER_LINE, sampleCount: 0 };
  }

  function normalizeStats(raw) {
    if (!raw) return null;
    if (typeof raw.msPerLine === 'number' && raw.msPerLine > 0 && typeof raw.baseMs === 'number') {
      return {
        baseMs: Math.max(MIN_BASE_MS, raw.baseMs),
        msPerLine: Math.max(MIN_MS_PER_LINE, raw.msPerLine),
        sampleCount: raw.sampleCount > 0 ? raw.sampleCount : 1,
      };
    }
    if (raw.lines > 0 && raw.ms > 0) {
      return {
        baseMs: DEFAULT_BASE_MS,
        msPerLine: Math.max(MIN_MS_PER_LINE, raw.ms / raw.lines),
        sampleCount: 1,
      };
    }
    return null;
  }

  function readModel() {
    var P = global.BelJarPersist;
    if (!P) return null;
    return normalizeStats(P.loadStat());
  }

  function learningAlpha(sampleCount) {
    return Math.max(LEARN_ALPHA_FLOOR, Math.min(LEARN_ALPHA_CAP, 2 / (sampleCount + 2)));
  }

  function writeStats(lines, ms) {
    if (lines < LEARN_MIN_LINES || ms <= 0) return;
    var P = global.BelJarPersist;
    if (!P) return;
    try {
      var prev = readModel() || defaultModel();
      var observedRate = ms / lines;
      var alpha = learningAlpha(prev.sampleCount);
      if (prev.sampleCount >= 3) {
        var ratio = observedRate / prev.msPerLine;
        if (ratio > 3 || ratio < 0.33) alpha *= 0.25;
      }
      var msPerLine = prev.sampleCount
        ? prev.msPerLine * (1 - alpha) + observedRate * alpha
        : observedRate;
      msPerLine = Math.max(MIN_MS_PER_LINE, msPerLine);
      var baseMs = prev.baseMs;
      if (prev.sampleCount > 0) {
        var impliedBase = Math.max(MIN_BASE_MS, ms - lines * msPerLine);
        baseMs = prev.baseMs * (1 - alpha) + impliedBase * alpha;
      }
      P.saveStat({
        lines: lines,
        ms: ms,
        msPerLine: Math.round(msPerLine * 100) / 100,
        baseMs: Math.round(baseMs),
        sampleCount: prev.sampleCount + 1,
      });
    } catch (_) {}
  }

  function estimateDurationMs(lines) {
    var model = readModel() || defaultModel();
    var n = Math.max(1, lines || 1);
    return Math.max(MIN_ESTIMATE_MS, model.baseMs + n * model.msPerLine);
  }

  function phaseWeights(name) {
    if (PHASE_WEIGHTS[name]) return PHASE_WEIGHTS[name];
    var key = Object.keys(PHASE_WEIGHTS).find(function (k) {
      return name.indexOf(k) >= 0 || k.indexOf(name) >= 0;
    });
    if (key) return PHASE_WEIGHTS[key];
    return DEFAULT_PHASE;
  }

  function clamp01(r) {
    return Math.max(0, Math.min(1, r));
  }

  function paintHeader(pct) {
    if (!fillEl) return;
    var clamped = clamp01(pct);
    displayRatio = clamped;
    fillEl.style.transition = '';
    if (clamped <= 0) {
      fillEl.style.transform = 'scaleX(0)';
      fillEl.style.opacity = '1';
      return;
    }
    fillEl.style.transform = 'scaleX(' + clamped + ')';
    fillEl.style.opacity = '1';
  }

  function setDomRatio(r) {
    paintHeader(r);
    if (fillEl) fillEl.setAttribute('aria-valuenow', String(Math.round(clamp01(r) * 100)));
  }

  function smoothStep(dt) {
    return 1 - Math.exp(-SMOOTH_K * dt);
  }

  function applyRunningUi(on) {
    running = on;
    if (headerEl) {
      if (on) headerEl.setAttribute('data-running', '');
      else headerEl.removeAttribute('data-running');
    }
    if (statusEl) statusEl.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (fillEl) fillEl.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (outputEl) outputEl.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function stopRaf() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastTick = 0;
  }

  function tick(now) {
    if (!running) return;
    if (!lastTick) lastTick = now;
    var dt = Math.min((now - lastTick) / 1000, 0.048);
    lastTick = now;

    if (creepStart > 0) {
      var elapsed = now - creepStart;
      var estimated = estimateDurationMs(lineCount);
      var tau = estimated * CREEP_BUDGET_SCALE;
      var creep = 0.95 * (1 - Math.exp(-elapsed / tau));
      targetRatio = Math.max(targetRatio, Math.min(creep, 0.95));
    }

    var delta = targetRatio - displayRatio;
    if (Math.abs(delta) > 0.00008) {
      displayRatio += delta * smoothStep(dt);
    } else {
      displayRatio = targetRatio;
    }
    setDomRatio(displayRatio);
    rafId = requestAnimationFrame(tick);
  }

  function bumpTarget(r) {
    targetRatio = Math.max(targetRatio, Math.min(r, 0.985));
  }

  function handlePhaseEvent(msg) {
    if (!running) return;
    if ((msg.phase || '').trim() === 'init') return;
    if (typeof msg.ratio === 'number') {
      bumpTarget(msg.ratio);
      return;
    }
    var phase = (msg.phase || '').trim();
    var state = (msg.state || '').trim();
    if (!phase) return;
    var w = phaseWeights(phase);
    if (state === 'begin') {
      bumpTarget(w.begin);
    } else if (state === 'done') {
      bumpTarget(w.done);
    }
  }

  function fadeOutFill(onDone, opts) {
    opts = opts || {};
    if (headerEl) headerEl.removeAttribute('data-running');
    if (statusEl) statusEl.setAttribute('aria-hidden', 'true');
    if (!fillEl) {
      if (onDone) onDone();
      return;
    }
    if (!opts.keepScale) fillEl.style.transform = 'scaleX(1)';
    fillEl.style.transition = 'opacity ' + FADE_OUT_MS + 'ms ease-out';
    fillEl.style.opacity = '1';
    void fillEl.offsetWidth;
    fillEl.style.opacity = '0';
    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      fillEl.style.transition = '';
      fillEl.style.transform = 'scaleX(0)';
      fillEl.style.opacity = '1';
      if (onDone) onDone();
    }
    fillEl.addEventListener('transitionend', function onEnd(e) {
      if (e.propertyName !== 'opacity') return;
      fillEl.removeEventListener('transitionend', onEnd);
      finish();
    });
    setTimeout(finish, FADE_OUT_MS + 50);
  }

  global.RunProgress = {
    bind: function (opts) {
      headerEl = opts.header;
      fillEl = opts.fill;
      statusEl = opts.status;
      outputEl = opts.output;
    },

    isRunning: function () {
      return running;
    },

    onBelugaProgress: function (msg) {
      handlePhaseEvent(msg);
    },

    start: function (opts) {
      lineCount = (opts && opts.lineCount) || 0;
      stopRaf();
      displayRatio = 0;
      targetRatio = 0;
      creepStart = performance.now();
      applyRunningUi(true);
      lastTick = 0;
      setDomRatio(0);
      rafId = requestAnimationFrame(tick);
    },

    complete: function (opts) {
      if (!running && !(opts && opts.force)) return Promise.resolve();
      stopRaf();
      targetRatio = 1;
      displayRatio = 1;
      return new Promise(function (resolve) {
        setDomRatio(1);
        requestAnimationFrame(function () {
          fadeOutFill(function () {
            running = false;
            if (fillEl) fillEl.setAttribute('aria-hidden', 'true');
            if (outputEl) outputEl.setAttribute('aria-busy', 'false');
            displayRatio = 0;
            targetRatio = 0;
            if (opts && opts.lines > 0 && opts.ms > 0) writeStats(opts.lines, opts.ms);
            resolve();
          });
        });
      });
    },

    fail: function () {
      stopRaf();
      if (displayRatio < 0.02) {
        applyRunningUi(false);
        setDomRatio(0);
        return;
      }
      fadeOutFill(function () {
        running = false;
        if (fillEl) fillEl.setAttribute('aria-hidden', 'true');
        if (outputEl) outputEl.setAttribute('aria-busy', 'false');
        displayRatio = 0;
        targetRatio = 0;
      }, { keepScale: true });
    },
  };
})(typeof window !== 'undefined' ? window : self);

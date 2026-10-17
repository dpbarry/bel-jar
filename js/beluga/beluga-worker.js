/* global Beluga */
'use strict';

var params = new URLSearchParams(self.location.search);

function belugaScriptUrl() {
  var fromParam = params.get('script');
  if (fromParam) return fromParam;
  // No ?script= (BelugaClient always passes one): the stable build, same origin.
  return new URL('../../beluga_web.bc.js', self.location.href).href;
}

var BELUGA_JS = belugaScriptUrl();

var currentJob = null;
var jobQueue = [];
var belugaReady = false;
var belugaLoadError = null;
var progressPending = null;
var progressScheduled = false;

function flushProgress() {
  progressScheduled = false;
  if (!currentJob || !progressPending) return;
  var p = progressPending;
  progressPending = null;
  self.postMessage({
    id: currentJob.id,
    type: 'progress',
    phase: p.phase,
    state: p.state,
  });
}

self.reportBelugaProgress = function (payload) {
  if (!currentJob || !payload) return;
  progressPending = {
    phase: payload.phase || '',
    state: payload.state || '',
  };
  if (!progressScheduled) {
    progressScheduled = true;
    setTimeout(flushProgress, 0);
  }
};

function cloneBelugaResult(result) {
  if (result == null || typeof result !== 'object') return result;
  var out = {};
  if ('ok' in result || result.ok != null) {
    out.ok = result.ok === true || result.ok === 1 || String(result.ok) === 'true';
  }
  if (result.output != null) out.output = String(result.output);
  if (result.fingerprint != null) out.fingerprint = String(result.fingerprint);
  return out;
}

function runBelugaJob(type, payload) {
  if (type === 'check') return cloneBelugaResult(Beluga.checkFromString(payload));
  if (type === 'load') return cloneBelugaResult(Beluga.loadFromString(payload));
  if (type === 'run') return Beluga.runCommand(payload);
  if (type === 'ide-type') return Beluga.ideTypeAtJson(payload.line, payload.col);
  if (type === 'ide-decl-type') return Beluga.ideDeclType(payload.name);
  if (type === 'ide-elaborate') {
    return Beluga.ideElaborateDecl(payload.start, payload.end, payload.positions || '');
  }
  if (type === 'ide-command') return Beluga.ideCommandJson(payload);
  if (type === 'fingerprint') return Beluga.getCommittedFingerprint();
  if (type === 'harpoon-start') return Beluga.ideProofStart(payload.code, payload.line, payload.col);
  if (type === 'harpoon-state') return Beluga.ideProofState();
  if (type === 'harpoon-tactic') return Beluga.ideProofTactic(payload.subgoal, payload.tactic);
  if (type === 'harpoon-undo') return Beluga.ideProofUndo();
  if (type === 'harpoon-redo') return Beluga.ideProofRedo();
  if (type === 'harpoon-translate') return Beluga.ideProofTranslate();
  throw new Error('Unknown job type: ' + type);
}

// A JS build catches a stack overflow inside OCaml and answers it (beluga_web.ml's
// normalize_exn): "Stack overflow", as a failed check or load, or as a command's text.
// Under Wasm no OCaml handler sees the engine's overflow and it is thrown out of the
// call instead (docs/wasm-runtime.md §5), so it is answered here exactly as the JS build
// answers it, and nothing above this worker can tell the builds apart. The instance is
// sound afterwards (the differential's step E). A load that overflows commits nothing.
var IS_WASM = false;

function overflowAnswer(type) {
  if (type === 'check') return { ok: false, output: 'Stack overflow\n' };
  if (type === 'load') {
    return { ok: false, output: 'Stack overflow\n', fingerprint: String(Beluga.getCommittedFingerprint()) };
  }
  if (type === 'run') return 'Stack overflow';
  return undefined;
}

function rejectJob(job, message) {
  if (!job) return;
  self.postMessage({ id: job.id, type: 'error', message: message });
}

function runNext() {
  if (currentJob || !jobQueue.length) return;

  if (belugaLoadError) {
    currentJob = jobQueue.shift();
    rejectJob(currentJob, belugaLoadError);
    currentJob = null;
    runNext();
    return;
  }

  if (!belugaReady) return;

  currentJob = jobQueue.shift();
  progressPending = null;
  progressScheduled = false;

  try {
    if (currentJob.type === 'init') {
      if (typeof Beluga === 'undefined') throw new Error('Beluga failed to load in worker');
      self.postMessage({ id: currentJob.id, type: 'ready' });
      currentJob = null;
      runNext();
      return;
    }

    self.postMessage({
      id: currentJob.id,
      type: 'result',
      result: runBelugaJob(currentJob.type, currentJob.payload),
    });
  } catch (e) {
    var msg = e && e.message ? e.message : String(e);
    var overflow = (e instanceof RangeError) || /maximum call stack|too much recursion/i.test(msg);
    var asJs = overflow && IS_WASM ? overflowAnswer(currentJob.type) : undefined;
    if (asJs !== undefined) {
      self.postMessage({ id: currentJob.id, type: 'result', result: asJs });
    } else if (overflow) {
      self.postMessage({ id: currentJob.id, type: 'stack-overflow' });
    } else {
      self.postMessage({ id: currentJob.id, type: 'error', message: msg });
    }
  }

  currentJob = null;
  runNext();
}

function enqueueJob(msg) {
  jobQueue.push(msg);
  runNext();
}

self.onmessage = function (e) {
  var msg = e.data;
  if (!msg || !msg.type || !msg.id) return;
  enqueueJob(msg);
};

// The runtime loader is shared with the case-completion worker (beluga-runtime-load.js),
// so the one way the runtime is loaded cannot drift between them.
importScripts(new URL('beluga-runtime-load.js', self.location.href).href);
IS_WASM = self.isWasmRuntime(BELUGA_JS);

function loadBelugaScript() {
  return self.loadBelugaRuntime(BELUGA_JS);
}

loadBelugaScript().then(function () {
  belugaReady = true;
  runNext();
}).catch(function (err) {
  belugaLoadError = err && err.message ? err.message : String(err);
  runNext();
});

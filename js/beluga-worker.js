/* global Beluga */
'use strict';

var params = new URLSearchParams(self.location.search);

function belugaScriptUrl() {
  var fromParam = params.get('script');
  if (fromParam) return fromParam;
  var rel = params.get('build') === 'fast' ? '../beluga_web.bc.dt.js' : '../beluga_web.bc.js';
  return new URL(rel, self.location.href).href;
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

function runBelugaJob(type, payload) {
  if (type === 'check') return Beluga.checkFromString(payload);
  if (type === 'load') return Beluga.loadFromString(payload);
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
    if ((e instanceof RangeError) || /maximum call stack|too much recursion/i.test(msg)) {
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

function importBelugaFromBlob(buffer) {
  var blob = new Blob([buffer], { type: 'text/javascript' });
  var url = URL.createObjectURL(blob);
  try {
    importScripts(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadBelugaScript() {
  return fetch(BELUGA_JS, { credentials: 'same-origin' }).then(function (res) {
    if (!res.ok) {
      throw new Error('Beluga fetch HTTP ' + res.status + ' for ' + BELUGA_JS);
    }
    return res.arrayBuffer();
  }).then(function (buf) {
    if (!buf || !buf.byteLength) throw new Error('Beluga script was empty: ' + BELUGA_JS);
    importBelugaFromBlob(buf);
    if (typeof Beluga === 'undefined') throw new Error('Beluga global missing after load');
  }).catch(function (fetchErr) {
    try {
      importScripts(BELUGA_JS);
      if (typeof Beluga === 'undefined') throw new Error('Beluga global missing after load');
    } catch (syncErr) {
      var detail = fetchErr && fetchErr.message ? fetchErr.message : String(fetchErr);
      var syncDetail = syncErr && syncErr.message ? syncErr.message : String(syncErr);
      throw new Error('Could not load Beluga (' + detail + '; importScripts: ' + syncDetail + ')');
    }
  });
}

loadBelugaScript().then(function () {
  belugaReady = true;
  runNext();
}).catch(function (err) {
  belugaLoadError = err && err.message ? err.message : String(err);
  runNext();
});

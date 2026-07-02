/* global Beluga */
'use strict';

var params = new URLSearchParams(self.location.search);
var BELUGA_JS = params.get('build') === 'fast'
  ? '../beluga_web.bc.dt.js'
  : '../beluga_web.bc.js';

var currentJob = null;
var jobQueue = [];
var belugaReady = false;
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
  // Harpoon — a stateful interactive proof on THIS worker's Beluga instance.
  // The session persists across jobs (Beluga holds it in a ref), so all proof
  // jobs for one proof must go to the same (dedicated) worker slot.
  if (type === 'harpoon-start') return Beluga.ideProofStart(payload.code, payload.line, payload.col);
  if (type === 'harpoon-state') return Beluga.ideProofState();
  if (type === 'harpoon-tactic') return Beluga.ideProofTactic(payload.subgoal, payload.tactic);
  if (type === 'harpoon-undo') return Beluga.ideProofUndo();
  if (type === 'harpoon-redo') return Beluga.ideProofRedo();
  if (type === 'harpoon-translate') return Beluga.ideProofTranslate();
  throw new Error('Unknown job type: ' + type);
}

function runNext() {
  if (currentJob || !jobQueue.length) return;
  currentJob = jobQueue.shift();
  progressPending = null;
  progressScheduled = false;

  try {
    if (currentJob.type === 'init') {
      if (typeof Beluga === 'undefined') throw new Error('Beluga failed to load in worker');
      belugaReady = true;
      self.postMessage({ id: currentJob.id, type: 'ready' });
      currentJob = null;
      runNext();
      return;
    }

    if (!belugaReady) throw new Error('Beluga worker not initialized');
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

importScripts(BELUGA_JS);

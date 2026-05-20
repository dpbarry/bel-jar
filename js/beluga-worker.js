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
    var result;
    if (currentJob.type === 'load') {
      result = Beluga.loadFromString(currentJob.payload);
      self.postMessage({ id: currentJob.id, type: 'result', text: result });
    } else if (currentJob.type === 'run') {
      result = Beluga.runCommand(currentJob.payload);
      self.postMessage({ id: currentJob.id, type: 'result', text: result });
    } else {
      throw new Error('Unknown job type: ' + currentJob.type);
    }
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

self.onmessage = function (e) {
  var msg = e.data;
  if (!msg || !msg.id || !msg.type) return;
  jobQueue.push(msg);
  runNext();
};

importScripts(BELUGA_JS);

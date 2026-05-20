'use strict';

(function (global) {
  var SCRIPT_SRC = document.currentScript && document.currentScript.src;

  var cfg = { thread: 'worker', build: 'stable' };

  var onProgress = null;

  // ---- Worker mode state ----
  var worker = null;
  var workerReady = false;
  var workerReadyPromise = null;
  var activeBuild = null;
  var nextId = 1;
  var pending = new Map();

  // ---- Main thread mode state ----
  var mainReady = false;
  var mainReadyPromise = null;
  var mainActiveBuild = null;

  // ---- Config ----
  function configure(opts) {
    var changed = false;
    if (opts.thread !== undefined && opts.thread !== cfg.thread) { cfg.thread = opts.thread; changed = true; }
    if (opts.build !== undefined && opts.build !== cfg.build) { cfg.build = opts.build; changed = true; }
    if (changed) teardown();
  }

  function teardown() {
    if (worker) { worker.terminate(); worker = null; }
    workerReady = false;
    workerReadyPromise = null;
    activeBuild = null;
    mainReady = false;
    mainReadyPromise = null;
    mainActiveBuild = null;
    pending.forEach(function (e) { e.reject(new Error('BelugaClient reconfigured')); });
    pending.clear();
  }

  // ---- Worker mode ----
  function workerUrl(build) {
    var base = SCRIPT_SRC ? new URL('beluga-worker.js', SCRIPT_SRC).href
                          : new URL('js/beluga-worker.js', document.baseURI).href;
    return base + '?build=' + build;
  }

  function rejectAll(err) {
    pending.forEach(function (entry) { entry.reject(err); });
    pending.clear();
  }

  function spawnWorker(build) {
    if (worker) { worker.terminate(); worker = null; }
    workerReady = false;
    activeBuild = build;
    worker = new Worker(workerUrl(build));
    worker.onmessage = function (e) {
      var msg = e.data;
      if (!msg || msg.id == null) return;
      var entry = pending.get(msg.id);
      if (msg.type === 'progress') {
        if (entry && entry.onProgress) entry.onProgress(msg);
        if (onProgress && entry && entry.jobType !== 'init') onProgress(msg);
        return;
      }
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.type === 'ready') { workerReady = true; entry.resolve(); return; }
      if (msg.type === 'result') { entry.resolve(msg.text); return; }
      if (msg.type === 'stack-overflow') {
        var ovfErr = new Error('Stack overflow');
        ovfErr.isStackOverflow = true;
        entry.reject(ovfErr);
        return;
      }
      if (msg.type === 'error') { entry.reject(new Error(msg.message || 'Beluga worker error')); }
    };
    worker.onerror = function (ev) {
      var msg = ev.message || '';
      var isOvf = /stack.?overflow|maximum call stack|too much recursion/i.test(msg);
      if (isOvf) ev.preventDefault();
      var err = new Error(msg || 'Beluga worker crashed');
      err.isStackOverflow = isOvf;
      rejectAll(err);
      workerReady = false;
      workerReadyPromise = null;
    };
  }

  function postWorker(type, payload, hooks) {
    var id = nextId++;
    return new Promise(function (resolve, reject) {
      pending.set(id, {
        resolve: resolve,
        reject: reject,
        onProgress: hooks && hooks.onProgress,
        jobType: type,
      });
      worker.postMessage({ id: id, type: type, payload: payload });
    });
  }

  function ensureWorkerReady(build) {
    if (workerReady && activeBuild === build) return Promise.resolve();
    if (workerReadyPromise && activeBuild === build) return workerReadyPromise;
    spawnWorker(build);
    workerReadyPromise = postWorker('init', null)
      .then(function () { workerReady = true; })
      .catch(function (err) { workerReadyPromise = null; throw err; });
    return workerReadyPromise;
  }

  // ---- Main thread mode ----
  function mainScriptUrl(build) {
    var base = SCRIPT_SRC ? new URL('../', SCRIPT_SRC).href : document.baseURI;
    return build === 'fast'
      ? new URL('beluga_web.bc.dt.js', base).href
      : new URL('beluga_web.bc.js', base).href;
  }

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed to load ' + url)); };
      document.head.appendChild(s);
    });
  }

  function ensureMainReady(build) {
    if (mainReady && mainActiveBuild === build) return Promise.resolve();
    if (mainReadyPromise && mainActiveBuild === build) return mainReadyPromise;
    mainActiveBuild = build;
    mainReadyPromise = loadScript(mainScriptUrl(build))
      .then(function () {
        if (typeof global.Beluga === 'undefined') throw new Error('Beluga failed to load');
        global.reportBelugaProgress = function (payload) {
          if (!payload || !onProgress) return;
          onProgress({ type: 'progress', phase: payload.phase || '', state: payload.state || '' });
        };
        mainReady = true;
      })
      .catch(function (err) { mainReadyPromise = null; throw err; });
    return mainReadyPromise;
  }

  function callMain(type, payload) {
    return new Promise(function (resolve) {
      resolve(type === 'load'
        ? global.Beluga.loadFromString(payload)
        : global.Beluga.runCommand(payload));
    });
  }

  // ---- Auto-fallback ----
  function isOverflow(text) {
    return typeof text === 'string' &&
      /stack.?overflow|maximum call stack|too much recursion/i.test(text);
  }

  function isOverflowError(err) {
    if (err && err.isStackOverflow) return true;
    var msg = err && (err.message || String(err));
    return !!msg && /stack.?overflow|maximum call stack|too much recursion/i.test(msg);
  }

  function switchToStable() {
    if (cfg.thread === 'worker') {
      if (worker) { worker.terminate(); worker = null; }
      workerReady = false;
      workerReadyPromise = null;
      activeBuild = null;
      // Reject any jobs that were queued behind the overflowing one
      if (pending.size > 0) {
        pending.forEach(function (e) { e.reject(new Error('Beluga switched to stable build')); });
        pending.clear();
      }
    } else {
      mainReady = false;
      mainReadyPromise = null;
      mainActiveBuild = null;
    }
  }

  // ---- Unified dispatch ----
  function dispatch(type, payload, hooks) {
    var build = cfg.build;

    function run(b) {
      if (cfg.thread === 'worker') {
        return ensureWorkerReady(b).then(function () {
          return postWorker(type, payload, hooks);
        });
      }
      return ensureMainReady(b).then(function () {
        return callMain(type, payload);
      });
    }

    function tryFallback() {
      if (onProgress) onProgress({ type: 'progress', phase: 'build-fallback' });
      switchToStable();
      return run('stable');
    }

    return run(build)
      .then(function (text) {
        if (build === 'fast' && isOverflow(text)) return tryFallback();
        return text;
      })
      .catch(function (err) {
        if (build === 'fast' && isOverflowError(err)) return tryFallback();
        throw err;
      });
  }

  function ensureReady() {
    if (cfg.thread === 'worker') return ensureWorkerReady(cfg.build);
    return ensureMainReady(cfg.build);
  }

  global.BelugaClient = {
    configure: configure,

    setProgressHandler: function (fn) { onProgress = fn; },

    isReady: function () {
      return cfg.thread === 'worker' ? workerReady : mainReady;
    },

    getBuild: function () {
      return cfg.thread === 'worker' ? activeBuild : mainActiveBuild;
    },

    warm: function () { return ensureReady(); },

    load: function (code, hooks) { return dispatch('load', code, hooks); },

    run: function (cmd, hooks) { return dispatch('run', cmd, hooks); },
  };
})(typeof window !== 'undefined' ? window : self);

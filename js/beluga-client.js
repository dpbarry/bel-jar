'use strict';

(function (global) {
  var SCRIPT_SRC = document.currentScript && document.currentScript.src;

  var cfg = { thread: 'worker', build: 'stable' };
  var onProgress = null;

  var primarySlot = null;
  var primaryStandby = null;
  var checkerSlot = null;
  var checkerIdleTimer = null;

  var mainReady = false;
  var mainReadyPromise = null;
  var mainActiveBuild = null;

  var currentEditorCode = '';
  var editorFingerprint = '';
  var mainCommittedFingerprint = '';
  var mainCheckerFingerprint = '';
  var activeLoad = null;

  var LOAD_CANCELLED_MSG = 'Beluga load cancelled';
  var CHECK_CANCELLED_MSG = 'Beluga check cancelled';
  var RECONFIGURED_MSG = 'BelugaClient reconfigured';
  var LONG_LOAD_THRESHOLD_MS = 1200;
  var CHECKER_IDLE_TTL_MS = 5 * 60 * 1000;
  var textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

  function makeCancelledError(message) {
    var err = new Error(message);
    err.isBelugaCancelled = true;
    return err;
  }

  function isCancelledError(err) {
    return !!(
      err &&
      (err.isBelugaCancelled ||
        err.message === LOAD_CANCELLED_MSG ||
        err.message === CHECK_CANCELLED_MSG)
    );
  }

  function utf8Bytes(text) {
    if (textEncoder) return textEncoder.encode(text);
    var encoded = unescape(encodeURIComponent(text));
    var bytes = new Uint8Array(encoded.length);
    for (var i = 0; i < encoded.length; i++) bytes[i] = encoded.charCodeAt(i);
    return bytes;
  }

  function fingerprintCode(code) {
    var text = String(code != null ? code : '');
    var bytes = utf8Bytes(text);
    var hash = 0x811c9dc5;
    for (var i = 0; i < bytes.length; i++) {
      hash ^= bytes[i];
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return bytes.length + ':' + hash.toString(16).padStart(8, '0');
  }

  function workerUrl(build) {
    var base = SCRIPT_SRC ? new URL('beluga-worker.js', SCRIPT_SRC).href
      : new URL('js/beluga-worker.js', document.baseURI).href;
    return base + '?build=' + build;
  }

  function mainScriptUrl(build) {
    var base = SCRIPT_SRC ? new URL('../', SCRIPT_SRC).href : document.baseURI;
    return build === 'fast'
      ? new URL('beluga_web.bc.dt.js', base).href
      : new URL('beluga_web.bc.js', base).href;
  }

  function createWorkerSlot(build, label) {
    return {
      label: label,
      build: build,
      worker: null,
      ready: false,
      readyPromise: null,
      nextId: 1,
      pending: new Map(),
      committedFingerprint: '',
    };
  }

  function rejectSlotPending(slot, err) {
    slot.pending.forEach(function (entry) { entry.reject(err); });
    slot.pending.clear();
  }

  function terminateSlot(slot, err) {
    if (!slot) return;
    if (slot.worker) {
      slot.worker.terminate();
      slot.worker = null;
    }
    slot.ready = false;
    slot.readyPromise = null;
    rejectSlotPending(slot, err);
  }

  function disposePrimaryStandby(err) {
    if (!primaryStandby) return;
    terminateSlot(primaryStandby, err || makeCancelledError(LOAD_CANCELLED_MSG));
    primaryStandby = null;
  }

  function clearCheckerIdleTimer() {
    if (!checkerIdleTimer) return;
    clearTimeout(checkerIdleTimer);
    checkerIdleTimer = null;
  }

  function scheduleCheckerIdleShutdown() {
    if (cfg.thread !== 'worker') return;
    clearCheckerIdleTimer();
    if (!checkerSlot || checkerSlot.pending.size > 0) return;
    checkerIdleTimer = setTimeout(function () {
      if (!checkerSlot || checkerSlot.pending.size > 0) return;
      terminateSlot(checkerSlot, makeCancelledError(CHECK_CANCELLED_MSG));
      checkerSlot = null;
    }, CHECKER_IDLE_TTL_MS);
  }

  function warmBelugaScriptCache(build) {
    return fetch(mainScriptUrl(build), { credentials: 'omit' }).catch(function () {});
  }

  function bindWorkerSlot(slot) {
    slot.worker = new Worker(workerUrl(slot.build));

    slot.worker.onmessage = function (e) {
      var msg = e.data;
      if (!msg || msg.id == null) return;
      var entry = slot.pending.get(msg.id);

      if (msg.type === 'progress') {
        if (entry && entry.onProgress) entry.onProgress(msg);
        if (onProgress && entry && entry.forwardGlobalProgress) onProgress(msg);
        return;
      }

      if (!entry) return;
      slot.pending.delete(msg.id);

      if (msg.type === 'ready') {
        slot.ready = true;
        entry.resolve(slot);
        return;
      }

      if (msg.type === 'result') {
        entry.resolve(msg.result);
        return;
      }

      if (msg.type === 'stack-overflow') {
        var ovfErr = new Error('Stack overflow');
        ovfErr.isStackOverflow = true;
        entry.reject(ovfErr);
        return;
      }

      if (msg.type === 'error') {
        entry.reject(new Error(msg.message || 'Beluga worker error'));
      }
    };

    slot.worker.onerror = function (ev) {
      var msg = ev.message || '';
      var isOvf = /stack.?overflow|maximum call stack|too much recursion/i.test(msg);
      if (isOvf) ev.preventDefault();
      var err = new Error(msg || 'Beluga worker crashed');
      err.isStackOverflow = isOvf;
      slot.ready = false;
      slot.readyPromise = null;
      if (slot === primarySlot) primarySlot = null;
      if (slot === primaryStandby) primaryStandby = null;
      if (slot === checkerSlot) checkerSlot = null;
      terminateSlot(slot, err);
    };
  }

  function postWorker(slot, type, payload, hooks, meta) {
    var id = slot.nextId++;
    return new Promise(function (resolve, reject) {
      slot.pending.set(id, {
        resolve: resolve,
        reject: reject,
        onProgress: hooks && hooks.onProgress,
        forwardGlobalProgress: !!(meta && meta.forwardGlobalProgress),
      });
      slot.worker.postMessage({ id: id, type: type, payload: payload });
    });
  }

  function ensureWorkerSlotReady(slot) {
    if (slot.ready) return Promise.resolve(slot);
    if (slot.readyPromise) return slot.readyPromise;
    if (!slot.worker) {
      slot.readyPromise = warmBelugaScriptCache(slot.build)
        .then(function () {
          bindWorkerSlot(slot);
          return postWorker(slot, 'init', null, null, null);
        })
        .then(function () {
          slot.ready = true;
          slot.readyPromise = null;
          return slot;
        })
        .catch(function (err) {
          slot.readyPromise = null;
          throw err;
        });
      return slot.readyPromise;
    }
    slot.readyPromise = postWorker(slot, 'init', null, null, null)
      .then(function () {
        slot.ready = true;
        slot.readyPromise = null;
        return slot;
      })
      .catch(function (err) {
        slot.readyPromise = null;
        throw err;
      });
    return slot.readyPromise;
  }

  function ensurePrimaryReady(build) {
    if (!primarySlot || primarySlot.build !== build) {
      if (primarySlot) terminateSlot(primarySlot, new Error(RECONFIGURED_MSG));
      primarySlot = createWorkerSlot(build, 'primary');
    }
    return ensureWorkerSlotReady(primarySlot);
  }

  function ensureCheckerReady(build) {
    if (!checkerSlot || checkerSlot.build !== build) {
      if (checkerSlot) terminateSlot(checkerSlot, makeCancelledError(CHECK_CANCELLED_MSG));
      checkerSlot = createWorkerSlot(build, 'checker');
    }
    return ensureWorkerSlotReady(checkerSlot);
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
      .catch(function (err) {
        mainReadyPromise = null;
        throw err;
      });
    return mainReadyPromise;
  }

  function callMain(type, payload) {
    return new Promise(function (resolve) {
      if (type === 'check') resolve(global.Beluga.checkFromString(payload));
      else if (type === 'load') resolve(global.Beluga.loadFromString(payload));
      else if (type === 'run') resolve(global.Beluga.runCommand(payload));
      else if (type === 'fingerprint') resolve(global.Beluga.getCommittedFingerprint());
      else throw new Error('Unknown main-thread Beluga call: ' + type);
    });
  }

  function resultText(result) {
    return typeof result === 'string' ? result : result && result.output;
  }

  function syncCommittedFingerprintFromLoadResult(result) {
    if (!result || !result.ok || !result.fingerprint) return;
    var fp = String(result.fingerprint);
    if (cfg.thread === 'worker') {
      if (primarySlot) primarySlot.committedFingerprint = fp;
    } else {
      mainCommittedFingerprint = fp;
    }
  }

  function invalidatePrimaryFingerprint() {
    if (primarySlot) primarySlot.committedFingerprint = '';
    mainCommittedFingerprint = '';
  }

  function commandInvalidatesCommittedFingerprint(cmd) {
    var text = String(cmd != null ? cmd : '').replace(/^%:/, '').trim().toLowerCase();
    return text === 'reset' || text === 'reload' || text === 'load' || text.indexOf('load ') === 0;
  }

  function isOverflowValue(value) {
    var text = resultText(value);
    return typeof text === 'string' &&
      /stack.?overflow|maximum call stack|too much recursion/i.test(text);
  }

  function isOverflowError(err) {
    if (err && err.isStackOverflow) return true;
    var msg = err && (err.message || String(err));
    return !!msg && /stack.?overflow|maximum call stack|too much recursion/i.test(msg);
  }

  function switchToStable() {
    if (primarySlot) {
      terminateSlot(primarySlot, new Error('Beluga switched to stable build'));
      primarySlot = null;
    }
    disposePrimaryStandby(new Error('Beluga switched to stable build'));
    if (checkerSlot) {
      terminateSlot(checkerSlot, new Error('Beluga switched to stable build'));
      checkerSlot = null;
    }
    clearCheckerIdleTimer();
    mainReady = false;
    mainReadyPromise = null;
    mainActiveBuild = null;
    activeLoad = null;
    mainCommittedFingerprint = '';
    mainCheckerFingerprint = '';
  }

  function teardown() {
    terminateSlot(primarySlot, new Error(RECONFIGURED_MSG));
    primarySlot = null;
    disposePrimaryStandby(new Error(RECONFIGURED_MSG));
    terminateSlot(checkerSlot, new Error(RECONFIGURED_MSG));
    checkerSlot = null;
    clearCheckerIdleTimer();
    mainReady = false;
    mainReadyPromise = null;
    mainActiveBuild = null;
    mainCommittedFingerprint = '';
    mainCheckerFingerprint = '';
    activeLoad = null;
  }

  function configure(opts) {
    var changed = false;
    if (opts.thread !== undefined && opts.thread !== cfg.thread) {
      cfg.thread = opts.thread;
      changed = true;
    }
    if (opts.build !== undefined && opts.build !== cfg.build) {
      cfg.build = opts.build;
      changed = true;
    }
    if (changed) teardown();
  }

  function maybeWarmPrimaryStandby() {
    if (
      cfg.thread !== 'worker' ||
      cfg.build !== 'stable' ||
      !activeLoad ||
      !activeLoad.stale
    ) {
      return;
    }

    if (!primaryStandby) primaryStandby = createWorkerSlot(cfg.build, 'primary-standby');
    var standby = primaryStandby;

    if (onProgress) {
      onProgress({ type: 'progress', phase: 'worker-swap', state: 'warming' });
    }

    ensureWorkerSlotReady(standby)
      .then(function () {
        if (primaryStandby !== standby) {
          terminateSlot(standby, makeCancelledError(LOAD_CANCELLED_MSG));
          return;
        }
        if (!activeLoad || !activeLoad.stale) {
          disposePrimaryStandby(makeCancelledError(LOAD_CANCELLED_MSG));
          return;
        }
        terminateSlot(primarySlot, makeCancelledError(LOAD_CANCELLED_MSG));
        primarySlot = standby;
        primaryStandby = null;
        if (onProgress) {
          onProgress({ type: 'progress', phase: 'worker-swap', state: 'ready' });
        }
      })
      .catch(function () {
        if (primaryStandby === standby) primaryStandby = null;
      });
  }

  function clearActiveLoad(loadInfo) {
    if (!loadInfo) return;
    if (loadInfo.longTimer) {
      clearTimeout(loadInfo.longTimer);
      loadInfo.longTimer = null;
    }
    if (activeLoad === loadInfo) activeLoad = null;
  }

  function handleStaleCompletedLoad(loadInfo) {
    clearActiveLoad(loadInfo);
    invalidatePrimaryFingerprint();

    if (primarySlot) {
      terminateSlot(primarySlot, makeCancelledError(LOAD_CANCELLED_MSG));
      primarySlot = null;
    }

    if (primaryStandby && primaryStandby.ready) {
      primarySlot = primaryStandby;
      primaryStandby = null;
      return;
    }

    if (primaryStandby) {
      var standby = primaryStandby;
      ensureWorkerSlotReady(standby)
        .then(function () {
          if (primaryStandby === standby && !primarySlot) {
            primarySlot = standby;
            primaryStandby = null;
          }
        })
        .catch(function () {
          if (primaryStandby === standby) primaryStandby = null;
        });
    }
  }

  function noteEditorChange(code) {
    currentEditorCode = String(code != null ? code : '');
    editorFingerprint = fingerprintCode(currentEditorCode);
    if (checkerSlot) checkerSlot.committedFingerprint = '';
    mainCheckerFingerprint = '';

    if (checkerSlot && checkerSlot.pending.size > 0) {
      terminateSlot(checkerSlot, makeCancelledError(CHECK_CANCELLED_MSG));
      checkerSlot = null;
    }

    if (!activeLoad) return;
    activeLoad.stale = activeLoad.requestFingerprint !== editorFingerprint;
    if (!activeLoad.stale) return;

    if (Date.now() - activeLoad.startedAt >= LONG_LOAD_THRESHOLD_MS) {
      maybeWarmPrimaryStandby();
    }
  }

  // Structured check result: { ok, output }. `ok` is Beluga's own load/check
  // verdict — the authoritative "did this file pass" signal — so the linter can
  // surface a failure even when the error text carries no parseable location.
  function checkResultOf(result) {
    return { ok: !!(result && result.ok), output: resultText(result) || '' };
  }

  function dispatchCheckResult(code, hooks) {
    var requestCode = String(code != null ? code : '');
    if (cfg.thread === 'worker') {
      clearCheckerIdleTimer();
      return ensureCheckerReady(cfg.build)
        .then(function (slot) {
          return postWorker(slot, 'check', requestCode, hooks, null);
        })
        .then(function (result) {
          scheduleCheckerIdleShutdown();
          return checkResultOf(result);
        })
        .catch(function (err) {
          scheduleCheckerIdleShutdown();
          throw err;
        });
    }

    function run(build) {
      return ensureMainReady(build).then(function () {
        return callMain('check', requestCode);
      });
    }

    return run(cfg.build)
      .then(function (result) {
        if (cfg.build === 'fast' && isOverflowValue(result)) {
          if (onProgress) onProgress({ type: 'progress', phase: 'build-fallback' });
          switchToStable();
          return run('stable').then(checkResultOf);
        }
        return checkResultOf(result);
      })
      .catch(function (err) {
        if (cfg.build === 'fast' && isOverflowError(err)) {
          if (onProgress) onProgress({ type: 'progress', phase: 'build-fallback' });
          switchToStable();
          return run('stable').then(checkResultOf);
        }
        throw err;
      });
  }

  function dispatchCheck(code, hooks) {
    return dispatchCheckResult(code, hooks).then(function (r) { return r.output; });
  }

  function dispatchCheckerCommand(code, cmd) {
    var requestCode = String(code != null ? code : '');
    var requestFP = fingerprintCode(requestCode);

    if (cfg.thread === 'worker') {
      clearCheckerIdleTimer();
      return ensureCheckerReady(cfg.build)
        .then(function (slot) {
          if (slot.committedFingerprint === requestFP) {
            return postWorker(slot, 'run', cmd, null, null);
          }
          return postWorker(slot, 'load', requestCode, null, null)
            .then(function (loadResult) {
              if (!loadResult || !loadResult.ok) {
                slot.committedFingerprint = '';
                return '';
              }
              slot.committedFingerprint = requestFP;
              return postWorker(slot, 'run', cmd, null, null);
            });
        })
        .then(function (result) {
          scheduleCheckerIdleShutdown();
          return resultText(result) || '';
        })
        .catch(function (err) {
          scheduleCheckerIdleShutdown();
          if (checkerSlot) checkerSlot.committedFingerprint = '';
          throw err;
        });
    }

    return ensureMainReady(cfg.build)
      .then(function () {
        if (mainCheckerFingerprint !== requestFP) {
          var lr = global.Beluga.loadFromString(requestCode);
          if (!lr || !lr.ok) { mainCheckerFingerprint = ''; return ''; }
          mainCheckerFingerprint = requestFP;
        }
        return global.Beluga.runCommand(cmd);
      })
      .then(function (result) { return resultText(result) || ''; });
  }

  function dispatchGetType(code, line, col) {
    return dispatchCheckerCommand(code, '%:get-type ' + line + ' ' + col);
  }

  function dispatchIdeType(code, line, col) {
    var requestCode = String(code != null ? code : '');
    var requestFP = fingerprintCode(requestCode);
    var payload = { line: line, col: col };

    if (cfg.thread === 'worker') {
      clearCheckerIdleTimer();
      return ensureCheckerReady(cfg.build)
        .then(function (slot) {
          if (slot.committedFingerprint === requestFP) {
            return postWorker(slot, 'ide-type', payload, null, null);
          }
          return postWorker(slot, 'load', requestCode, null, null)
            .then(function (loadResult) {
              if (!loadResult || !loadResult.ok) {
                slot.committedFingerprint = '';
                return '';
              }
              slot.committedFingerprint = requestFP;
              return postWorker(slot, 'ide-type', payload, null, null);
            });
        })
        .then(function (result) {
          scheduleCheckerIdleShutdown();
          return resultText(result) || '';
        })
        .catch(function (err) {
          scheduleCheckerIdleShutdown();
          if (checkerSlot) checkerSlot.committedFingerprint = '';
          throw err;
        });
    }

    return ensureMainReady(cfg.build)
      .then(function () {
        if (mainCheckerFingerprint !== requestFP) {
          var lr = global.Beluga.loadFromString(requestCode);
          if (!lr || !lr.ok) { mainCheckerFingerprint = ''; return ''; }
          mainCheckerFingerprint = requestFP;
        }
        return global.Beluga.ideTypeAtJson(line, col);
      })
      .then(function (result) { return resultText(result) || ''; });
  }

  function dispatchLoadChecker(code) {
    var requestCode = String(code != null ? code : '');
    var requestFP = fingerprintCode(requestCode);

    if (cfg.thread === 'worker') {
      clearCheckerIdleTimer();
      return ensureCheckerReady(cfg.build)
        .then(function (slot) {
          if (slot.committedFingerprint === requestFP) {
            return '';
          }
          return postWorker(slot, 'load', requestCode, null, null)
            .then(function (loadResult) {
              if (!loadResult || !loadResult.ok) {
                slot.committedFingerprint = '';
              } else {
                slot.committedFingerprint = requestFP;
              }
              return resultText(loadResult) || '';
            });
        })
        .then(function (result) {
          scheduleCheckerIdleShutdown();
          return result;
        })
        .catch(function (err) {
          scheduleCheckerIdleShutdown();
          if (checkerSlot) checkerSlot.committedFingerprint = '';
          throw err;
        });
    }

    return ensureMainReady(cfg.build)
      .then(function () {
        if (mainCheckerFingerprint === requestFP) return '';
        var lr = global.Beluga.loadFromString(requestCode);
        if (!lr || !lr.ok) { mainCheckerFingerprint = ''; }
        else { mainCheckerFingerprint = requestFP; }
        return resultText(lr) || '';
      });
  }

  function dispatchLoad(code, hooks) {
    var requestCode = String(code != null ? code : '');
    var requestFingerprint = fingerprintCode(requestCode);

    if (cfg.thread === 'worker') {
      if (activeLoad) return Promise.reject(new Error('Beluga load already in progress'));

      var loadInfo = {
        requestFingerprint: requestFingerprint,
        startedAt: Date.now(),
        stale: requestFingerprint !== editorFingerprint && currentEditorCode !== '',
        longTimer: null,
      };
      activeLoad = loadInfo;

      return ensurePrimaryReady(cfg.build)
        .then(function (slot) {
          if (activeLoad !== loadInfo) throw makeCancelledError(LOAD_CANCELLED_MSG);
          loadInfo.longTimer = setTimeout(function () {
            if (activeLoad === loadInfo && loadInfo.stale) maybeWarmPrimaryStandby();
          }, LONG_LOAD_THRESHOLD_MS);
          return postWorker(slot, 'load', requestCode, hooks, { forwardGlobalProgress: true });
        })
        .then(function (result) {
          if (loadInfo.stale) {
            handleStaleCompletedLoad(loadInfo);
            throw makeCancelledError(LOAD_CANCELLED_MSG);
          }
          clearActiveLoad(loadInfo);
          disposePrimaryStandby(makeCancelledError(LOAD_CANCELLED_MSG));
          syncCommittedFingerprintFromLoadResult(result);
          return resultText(result) || '';
        })
        .catch(function (err) {
          clearActiveLoad(loadInfo);
          if (!isCancelledError(err)) disposePrimaryStandby(makeCancelledError(LOAD_CANCELLED_MSG));
          throw err;
        });
    }

    function run(build) {
      return ensureMainReady(build).then(function () {
        return callMain('load', requestCode);
      });
    }

    return run(cfg.build)
      .then(function (result) {
        if (cfg.build === 'fast' && isOverflowValue(result)) {
          if (onProgress) onProgress({ type: 'progress', phase: 'build-fallback' });
          switchToStable();
          return run('stable').then(function (fallback) {
            syncCommittedFingerprintFromLoadResult(fallback);
            return resultText(fallback) || '';
          });
        }
        syncCommittedFingerprintFromLoadResult(result);
        return resultText(result) || '';
      })
      .catch(function (err) {
        if (cfg.build === 'fast' && isOverflowError(err)) {
          if (onProgress) onProgress({ type: 'progress', phase: 'build-fallback' });
          switchToStable();
          return run('stable').then(function (fallback) {
            syncCommittedFingerprintFromLoadResult(fallback);
            return resultText(fallback) || '';
          });
        }
        throw err;
      });
  }

  function dispatchRun(cmd, hooks) {
    var payload = String(cmd != null ? cmd : '');
    if (cfg.thread === 'worker') {
      return ensurePrimaryReady(cfg.build)
        .then(function (slot) {
          return postWorker(slot, 'run', payload, hooks, { forwardGlobalProgress: true });
        })
        .then(function (result) {
          if (commandInvalidatesCommittedFingerprint(payload)) invalidatePrimaryFingerprint();
          return resultText(result) || '';
        });
    }

    function run(build) {
      return ensureMainReady(build).then(function () {
        return callMain('run', payload);
      });
    }

    return run(cfg.build)
      .then(function (result) {
        if (cfg.build === 'fast' && isOverflowValue(result)) {
          if (onProgress) onProgress({ type: 'progress', phase: 'build-fallback' });
          switchToStable();
          return run('stable').then(function (fallback) { return resultText(fallback) || ''; });
        }
        if (commandInvalidatesCommittedFingerprint(payload)) invalidatePrimaryFingerprint();
        return resultText(result) || '';
      })
      .catch(function (err) {
        if (cfg.build === 'fast' && isOverflowError(err)) {
          if (onProgress) onProgress({ type: 'progress', phase: 'build-fallback' });
          switchToStable();
          return run('stable').then(function (fallback) { return resultText(fallback) || ''; });
        }
        throw err;
      });
  }

  function ensureReady() {
    if (cfg.thread === 'worker') return ensurePrimaryReady(cfg.build).then(function () {});
    return ensureMainReady(cfg.build);
  }

  global.BelugaClient = {
    configure: configure,

    setProgressHandler: function (fn) { onProgress = fn; },

    isReady: function () {
      if (cfg.thread === 'worker') return !!(primarySlot && primarySlot.ready);
      return mainReady;
    },

    getBuild: function () {
      if (cfg.thread === 'worker') return primarySlot ? primarySlot.build : null;
      return mainActiveBuild;
    },

    getThread: function () { return cfg.thread; },

    workerUrl: function (build) { return workerUrl(build || cfg.build); },

    warm: function () { return ensureReady(); },

    noteEditorChange: noteEditorChange,

    fingerprint: fingerprintCode,

    getEditorFingerprint: function () { return editorFingerprint; },

    getCommittedFingerprint: function () {
      var fp = cfg.thread === 'worker'
        ? (primarySlot ? primarySlot.committedFingerprint : '')
        : mainCommittedFingerprint;
      return fp || null;
    },

    load: function (code, hooks) {
      return dispatchLoad(code, hooks);
    },

    check: function (code, hooks) {
      return dispatchCheck(code, hooks);
    },

    // Like check(), but resolves to { ok, output } so callers can tell a failed
    // check apart from a clean one even when the error text has no location.
    checkResult: function (code, hooks) {
      return dispatchCheckResult(code, hooks);
    },

    loadChecker: function (code) {
      return dispatchLoadChecker(code);
    },

    run: function (cmd, hooks) {
      return dispatchRun(cmd, hooks);
    },

    getType: function (code, line, col) {
      return dispatchGetType(code, line, col);
    },

    ideType: function (code, line, col) {
      return dispatchIdeType(code, line, col);
    },

    ideElaborate: function (code, startLine, endLine, positionsSpec) {
      var requestCode = String(code != null ? code : '');
      var requestFP = fingerprintCode(requestCode);
      var posSpec = String(positionsSpec != null ? positionsSpec : '');

      if (cfg.thread === 'worker') {
        clearCheckerIdleTimer();
        return ensureCheckerReady(cfg.build)
          .then(function (slot) {
            if (slot.committedFingerprint !== requestFP) {
              return postWorker(slot, 'load', requestCode, null, null)
                .then(function (loadResult) {
                  if (!loadResult || !loadResult.ok) {
                    slot.committedFingerprint = '';
                    return '{"ok":false,"reason":"load-failed"}';
                  }
                  slot.committedFingerprint = requestFP;
                  return postWorker(slot, 'ide-elaborate', { start: startLine, end: endLine, positions: posSpec }, null, null);
                });
            }
            return postWorker(slot, 'ide-elaborate', { start: startLine, end: endLine, positions: posSpec }, null, null);
          })
          .then(function (result) {
            scheduleCheckerIdleShutdown();
            return resultText(result) || '{"ok":false,"reason":"empty-response"}';
          })
          .catch(function (err) {
            scheduleCheckerIdleShutdown();
            if (checkerSlot) checkerSlot.committedFingerprint = '';
            throw err;
          });
      }

      return ensureMainReady(cfg.build)
        .then(function () {
          if (mainCheckerFingerprint !== requestFP) {
            var lr = global.Beluga.loadFromString(requestCode);
            if (!lr || !lr.ok) {
              mainCheckerFingerprint = '';
              return '{"ok":false,"reason":"load-failed"}';
            }
            mainCheckerFingerprint = requestFP;
          }
          return global.Beluga.ideElaborateDecl(startLine, endLine, posSpec);
        })
        .then(function (result) { return resultText(result) || '{"ok":false,"reason":"empty-response"}'; });
    },

    runCheckerCommand: function (code, cmd) {
      return dispatchCheckerCommand(code, cmd);
    },

    isCancelledError: isCancelledError,
  };
})(typeof window !== 'undefined' ? window : self);

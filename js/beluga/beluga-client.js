'use strict';

(function (global) {
  var SCRIPT_SRC = document.currentScript && document.currentScript.src;

  var cfg = { thread: 'worker', build: 'stable' };
  var onProgress = null;

  // The SEMANTIC CHECKER must NEVER run on the main thread. Fast mode
  // (thread:'main', build:'fast') is a deliberate trade for the explicit Run
  // action only — the user accepts a freeze when they press Run. But the editor's
  // background type-checking (hover types, settlement, hole goals) must stay off
  // the main thread, or merely refreshing/navigating freezes the UI while Beluga
  // runs behind the scenes. So the checker slot is ALWAYS a stable web worker,
  // regardless of `cfg`. Only `load`/`run` (the primary slot) honour `cfg`.
  var CHECKER_THREAD = 'worker';
  var CHECKER_BUILD = 'stable';

  var primarySlot = null;
  var primaryStandby = null;
  var checkerSlot = null;
  var proverSlot = null;
  var proverSessionCount = 0;
  var intelSlot = null;
  var intelKeepWarm = false;
  var checkerIdleTimer = null;
  var proverIdleTimer = null;

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

  function shouldFallbackStable() {
    return !global.Persist || global.Persist.readStoredBelugaFallbackStable();
  }

  function shouldCancelOnEdit() {
    return !global.Persist || global.Persist.readStoredBelugaCancelOnEdit();
  }
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
      : new URL('js/beluga/beluga-worker.js', document.baseURI).href;
    return base
      + '?build=' + encodeURIComponent(build)
      + '&script=' + encodeURIComponent(mainScriptUrl(build));
  }

  function mainScriptUrl(build) {
    var base = SCRIPT_SRC ? new URL('../../', SCRIPT_SRC).href : document.baseURI;
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
    // The checker is ALWAYS a worker now (independent of cfg.thread / fast mode),
    // so this no longer gates on cfg.thread — it must run even in fast mode.
    if (CHECKER_THREAD !== 'worker') return;
    clearCheckerIdleTimer();
    if (!checkerSlot || checkerSlot.pending.size > 0) return;
    checkerIdleTimer = setTimeout(function () {
      if (!checkerSlot || checkerSlot.pending.size > 0) return;
      terminateSlot(checkerSlot, makeCancelledError(CHECK_CANCELLED_MSG));
      checkerSlot = null;
    }, CHECKER_IDLE_TTL_MS);
  }

  function clearProverIdleTimer() {
    if (!proverIdleTimer) return;
    clearTimeout(proverIdleTimer);
    proverIdleTimer = null;
  }

  function proverPoolBusy() {
    for (var i = 0; i < proverPool.length; i += 1) {
      if (proverPool[i].pending.size > 0) return true;
    }
    return false;
  }

  function scheduleProverIdleShutdown() {
    if (proverSessionCount > 0) return;
    clearProverIdleTimer();
    if ((!proverSlot && !proverPool.length) || (proverSlot && proverSlot.pending.size > 0) || proverPoolBusy()) return;
    proverIdleTimer = setTimeout(function () {
      if (proverSessionCount > 0) return;
      if ((proverSlot && proverSlot.pending.size > 0) || proverPoolBusy()) return;
      if (proverSlot) terminateSlot(proverSlot, makeCancelledError(CHECK_CANCELLED_MSG));
      proverSlot = null;
      terminateProverPool(makeCancelledError(CHECK_CANCELLED_MSG));
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
      var loc = ev.filename
        ? (' (' + ev.filename + (ev.lineno ? ':' + ev.lineno : '') + ')')
        : '';
      var isOvf = /stack.?overflow|maximum call stack|too much recursion/i.test(msg);
      if (isOvf) ev.preventDefault();
      var err = new Error((msg || 'Beluga worker crashed') + loc);
      err.isStackOverflow = isOvf;
      if (!isOvf && global.Toasts && global.Toasts.error) {
        global.Toasts.error(
          'Beluga checker failed to load' + loc
          + '. Hard-refresh the page; if it persists, check that beluga_web.bc.js downloads fully in the Network tab.',
          { duration: 12000 },
        );
      }
      slot.ready = false;
      slot.readyPromise = null;
      if (slot === primarySlot) primarySlot = null;
      if (slot === primaryStandby) primaryStandby = null;
      if (slot === checkerSlot) checkerSlot = null;
      if (slot === intelSlot) intelSlot = null;
      terminateSlot(slot, err);
    };
  }

  function postWorker(slot, type, payload, hooks, meta) {
    var id = slot.nextId++;
    var perf = global.Perf;
    var queuedAt = (perf && typeof performance !== 'undefined') ? performance.now() : 0;
  var slotLabel = slot && slot.label ? slot.label : 'worker';
    return new Promise(function (resolve, reject) {
      slot.pending.set(id, {
        resolve: function (result) {
          if (perf && perf.workerJob && queuedAt) {
            perf.workerJob(type, performance.now() - queuedAt, { slot: slotLabel, jobId: id });
          }
          resolve(result);
        },
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

  function ensureIntelReady(build) {
    if (!intelSlot || intelSlot.build !== build) {
      if (intelSlot) terminateSlot(intelSlot, makeCancelledError(CHECK_CANCELLED_MSG));
      intelSlot = createWorkerSlot(build, 'intel');
    }
    return ensureWorkerSlotReady(intelSlot);
  }

  function ensureProverReady(build) {
    if (!proverSlot || proverSlot.build !== build) {
      if (proverSlot) terminateSlot(proverSlot, makeCancelledError(CHECK_CANCELLED_MSG));
      proverSlot = createWorkerSlot(build, 'prover');
    }
    return ensureWorkerSlotReady(proverSlot);
  }

  // Prover CHECK pool. A prover `check` job is STATELESS on the worker side
  // (checkFromString builds a fresh trial session per call), so any worker can
  // serve any check and the search may fire several candidate checks CONCURRENTLY
  // (wave-parallel generate-and-verify). Slot 0 stays `proverSlot` — the session
  // slot for load/fingerprint ops — and overflow checks spill onto extra pooled
  // workers created on demand, least-loaded first.
  var proverPool = [];
  var PROVER_POOL_MAX = 2; // extra workers beyond the session slot

  function ensureProverCheckReady(build) {
    // Drop wrong-build pool workers.
    for (var i = proverPool.length - 1; i >= 0; i -= 1) {
      if (proverPool[i].build !== build) {
        terminateSlot(proverPool[i], makeCancelledError(CHECK_CANCELLED_MSG));
        proverPool.splice(i, 1);
      }
    }
    if (!proverSlot || proverSlot.build !== build) return ensureProverReady(build);
    // Least-loaded among the session slot + pool; spawn a pool worker only when
    // every existing one is busy and the pool has room.
    var all = [proverSlot].concat(proverPool);
    var best = all[0];
    for (var j = 1; j < all.length; j += 1) {
      if (all[j].pending.size < best.pending.size) best = all[j];
    }
    if (best.pending.size > 0 && proverPool.length < PROVER_POOL_MAX) {
      best = createWorkerSlot(build, 'prover');
      proverPool.push(best);
    }
    return ensureWorkerSlotReady(best);
  }

  function terminateProverPool(err) {
    for (var i = 0; i < proverPool.length; i += 1) terminateSlot(proverPool[i], err);
    proverPool = [];
  }

  function beginProverSession() {
    proverSessionCount += 1;
    clearProverIdleTimer();
    return ensureProverReady(CHECKER_BUILD);
  }

  function endProverSession() {
    if (proverSessionCount > 0) proverSessionCount -= 1;
    if (proverSessionCount === 0) scheduleProverIdleShutdown();
  }

  function cancelCheckerWorkload() {
    clearCheckerIdleTimer();
    if (!checkerSlot) return;
    if (checkerSlot.pending.size > 0) {
      terminateSlot(checkerSlot, makeCancelledError(CHECK_CANCELLED_MSG));
      checkerSlot = null;
    }
  }

  function intelLoadThen(slot, requestCode, requestFP, jobType, payload) {
    if (slot.committedFingerprint === requestFP) {
      return postWorker(slot, jobType, payload, null, { slot: 'intel' });
    }
    return postWorker(slot, 'load', requestCode, null, { slot: 'intel' })
      .then(function (loadResult) {
        if (!loadResult || !loadResult.ok) {
          slot.committedFingerprint = '';
          return null;
        }
        slot.committedFingerprint = requestFP;
        return postWorker(slot, jobType, payload, null, { slot: 'intel' });
      });
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
    if (proverSlot) {
      terminateSlot(proverSlot, new Error('Beluga switched to stable build'));
      proverSlot = null;
    }
    terminateProverPool(new Error('Beluga switched to stable build'));
    proverSessionCount = 0;
    clearCheckerIdleTimer();
    clearProverIdleTimer();
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
    terminateSlot(intelSlot, new Error(RECONFIGURED_MSG));
    intelSlot = null;
    terminateSlot(proverSlot, new Error(RECONFIGURED_MSG));
    proverSlot = null;
    terminateProverPool(new Error(RECONFIGURED_MSG));
    proverSessionCount = 0;
    clearCheckerIdleTimer();
    clearProverIdleTimer();
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
    if (!shouldCancelOnEdit()) return;
    activeLoad.stale = !activeLoad.pinned
      && activeLoad.requestFingerprint !== editorFingerprint;
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

  function syncCheckerFingerprintFromCheck(code, result, slot) {
    if (!result || !result.ok) return;
    // The checker is always a worker slot now; sync the slot's committed
    // fingerprint so a subsequent get-type/decl-type can skip the reload.
    if (slot) slot.committedFingerprint = fingerprintCode(code);
  }

  function dispatchCheckResultOnSlot(code, hooks, ensureReady, onIdle) {
    var requestCode = String(code != null ? code : '');
    onIdle.clear();
    return ensureReady(CHECKER_BUILD)
      .then(function (slot) {
        return postWorker(slot, 'check', requestCode, hooks, null)
          .then(function (result) {
            syncCheckerFingerprintFromCheck(requestCode, result, slot);
            return result;
          });
      })
      .then(function (result) {
        onIdle.schedule();
        return checkResultOf(result);
      })
      .catch(function (err) {
        onIdle.schedule();
        throw err;
      });
  }

  function dispatchCheckResult(code, hooks) {
    return dispatchCheckResultOnSlot(code, hooks, ensureCheckerReady, {
      clear: clearCheckerIdleTimer,
      schedule: scheduleCheckerIdleShutdown,
    });
  }

  function dispatchCheckResultForProver(code, hooks) {
    return dispatchCheckResultOnSlot(code, hooks, ensureProverCheckReady, {
      clear: clearProverIdleTimer,
      schedule: scheduleProverIdleShutdown,
    });
  }

  function dispatchCheck(code, hooks) {
    return dispatchCheckResult(code, hooks).then(function (r) { return r.output; });
  }

  function dispatchCheckerCommand(code, cmd) {
    var requestCode = String(code != null ? code : '');
    var requestFP = fingerprintCode(requestCode);

    return ensureIntelReady(CHECKER_BUILD)
      .then(function (slot) {
        if (slot.committedFingerprint === requestFP) {
          return postWorker(slot, 'run', cmd, null, { slot: 'intel' });
        }
        return postWorker(slot, 'load', requestCode, null, { slot: 'intel' })
          .then(function (loadResult) {
            if (!loadResult || !loadResult.ok) {
              slot.committedFingerprint = '';
              return '';
            }
            slot.committedFingerprint = requestFP;
            return postWorker(slot, 'run', cmd, null, { slot: 'intel' });
          });
      })
      .then(function (result) {
        return resultText(result) || '';
      })
      .catch(function (err) {
        if (intelSlot) intelSlot.committedFingerprint = '';
        throw err;
      });
  }

  function dispatchGetType(code, line, col) {
    return dispatchCheckerCommand(code, '%:get-type ' + line + ' ' + col);
  }

  // Find the Beluga hole NUMBER reported at (line, col) in a fresh load's
  // `## Holes ##` section. Lines/cols are 1-based and point AT the `?`.
  function holeNumberAt(loadOutput, line, col) {
    var re = /File\s+"[^"]*"\s*,\s*line\s+(\d+)\s*,\s*column\s+(\d+)\s*:\s*Hole number\s+(\d+)/g;
    var m;
    while ((m = re.exec(String(loadOutput || ''))) !== null) {
      if (parseInt(m[1], 10) === line && parseInt(m[2], 10) === col) {
        return parseInt(m[3], 10);
      }
    }
    return null;
  }

  // Atomic load + interactive hole command — the STEP-2 FALLBACK transport only
  // (BelJar generates split/intro skeletons from its own model first; this is used
  // when it can't, and the editor TRANSFORMS the printed answer into our grammar,
  // never inserting raw printer text — see js/editor-src/prover/hole-actions.mjs). `cmd`
  // is the action ('split n' / 'intro'); we resolve the drifting session-global
  // hole number from a fresh load's `## Holes ##` report by position and run
  // `%:<verb> <number> <arg>`. Resolves `{ ok, output }` (output = raw command text).
  function dispatchHoleAction(code, line, col, cmd) {
    var requestCode = String(code != null ? code : '');
    var action = String(cmd != null ? cmd : '').trim();

    function build(loadOutput, runCmd) {
      var number = holeNumberAt(loadOutput, line, col);
      if (number == null) {
        return Promise.resolve({ ok: false, output: '', error: 'hole-not-found' });
      }
      var parts = action.split(/\s+/);
      var verb = parts.shift();
      var full = '%:' + verb + ' ' + number + (parts.length ? ' ' + parts.join(' ') : '');
      return runCmd(full).then(function (out) {
        return { ok: true, output: resultText(out) || '' };
      });
    }

    clearCheckerIdleTimer();
    return ensureCheckerReady(CHECKER_BUILD)
      .then(function (slot) {
        // Always reload — a prior committed load may carry drifted hole numbers.
        return postWorker(slot, 'load', requestCode, null, null).then(function (loadResult) {
          slot.committedFingerprint = '';
          if (!loadResult || !loadResult.ok) {
            return { ok: false, output: resultText(loadResult) || '', error: 'load-failed' };
          }
          return build(resultText(loadResult) || '', function (full) {
            return postWorker(slot, 'run', full, null, null);
          });
        });
      })
      .then(function (r) { scheduleCheckerIdleShutdown(); return r; })
      .catch(function (err) {
        scheduleCheckerIdleShutdown();
        if (checkerSlot) checkerSlot.committedFingerprint = '';
        throw err;
      });
  }

  function dispatchIdeType(code, line, col) {
    var requestCode = String(code != null ? code : '');
    var requestFP = fingerprintCode(requestCode);
    var payload = { line: line, col: col };

    return ensureIntelReady(CHECKER_BUILD)
      .then(function (slot) {
        return intelLoadThen(slot, requestCode, requestFP, 'ide-type', payload);
      })
      .then(function (result) {
        return resultText(result) || '';
      })
      .catch(function (err) {
        if (intelSlot) intelSlot.committedFingerprint = '';
        throw err;
      });
  }

  function dispatchIdeDeclType(code, name) {
    var requestCode = String(code != null ? code : '');
    var requestFP = fingerprintCode(requestCode);
    var payload = { name: name };

    return ensureIntelReady(CHECKER_BUILD)
      .then(function (slot) {
        return intelLoadThen(slot, requestCode, requestFP, 'ide-decl-type', payload);
      })
      .then(function (result) {
        return resultText(result) || '';
      })
      .catch(function (err) {
        if (intelSlot) intelSlot.committedFingerprint = '';
        throw err;
      });
  }

  function dispatchLoadOnSlot(code, ensureReady, onIdle) {
    var requestCode = String(code != null ? code : '');
    var requestFP = fingerprintCode(requestCode);

    onIdle.clear();
    return ensureReady(CHECKER_BUILD)
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
        onIdle.schedule();
        return result;
      })
      .catch(function (err) {
        onIdle.schedule();
        throw err;
      });
  }

  function dispatchLoadChecker(code) {
    return dispatchLoadOnSlot(code, ensureCheckerReady, {
      clear: clearCheckerIdleTimer,
      schedule: scheduleCheckerIdleShutdown,
    }).catch(function (err) {
      if (checkerSlot) checkerSlot.committedFingerprint = '';
      throw err;
    });
  }

  function dispatchLoadProverChecker(code) {
    return dispatchLoadOnSlot(code, ensureProverReady, {
      clear: clearProverIdleTimer,
      schedule: scheduleProverIdleShutdown,
    }).catch(function (err) {
      if (proverSlot) proverSlot.committedFingerprint = '';
      throw err;
    });
  }

  // Surgical decl-type query on the PROVER session slot. When the session's
  // program is already loaded (loadProverChecker) this is a single worker job —
  // it never touches the intel slot, so the active file's loaded program stays.
  function dispatchIdeDeclTypeForProver(code, name) {
    var requestCode = String(code != null ? code : '');
    var requestFP = fingerprintCode(requestCode);
    var payload = { name: name };

    clearProverIdleTimer();
    return ensureProverReady(CHECKER_BUILD)
      .then(function (slot) {
        if (slot.committedFingerprint === requestFP) {
          return postWorker(slot, 'ide-decl-type', payload, null, null);
        }
        return postWorker(slot, 'load', requestCode, null, null)
          .then(function (loadResult) {
            if (!loadResult || !loadResult.ok) {
              slot.committedFingerprint = '';
              return null;
            }
            slot.committedFingerprint = requestFP;
            return postWorker(slot, 'ide-decl-type', payload, null, null);
          });
      })
      .then(function (result) {
        scheduleProverIdleShutdown();
        return resultText(result) || '';
      })
      .catch(function (err) {
        scheduleProverIdleShutdown();
        if (proverSlot) proverSlot.committedFingerprint = '';
        throw err;
      });
  }

  function dispatchLoad(code, hooks) {
    var requestCode = String(code != null ? code : '');
    var requestFingerprint = fingerprintCode(requestCode);

    if (cfg.thread === 'worker') {
      if (activeLoad) return Promise.reject(new Error('Beluga load already in progress'));

      // A "pinned" load intentionally differs from the editor buffer (project
      // run: prelude/whole-project concatenation) — it must NOT be treated as
      // stale just because its code isn't byte-identical to the buffer.
      var pinned = !!(hooks && hooks.pinned);
      var loadInfo = {
        requestFingerprint: requestFingerprint,
        startedAt: Date.now(),
        pinned: pinned,
        stale: shouldCancelOnEdit() && !pinned && requestFingerprint !== editorFingerprint && currentEditorCode !== '',
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
        if (cfg.build === 'fast' && isOverflowValue(result) && shouldFallbackStable()) {
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
        if (cfg.build === 'fast' && isOverflowError(err) && shouldFallbackStable()) {
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
        if (cfg.build === 'fast' && isOverflowValue(result) && shouldFallbackStable()) {
          if (onProgress) onProgress({ type: 'progress', phase: 'build-fallback' });
          switchToStable();
          return run('stable').then(function (fallback) { return resultText(fallback) || ''; });
        }
        if (commandInvalidatesCommittedFingerprint(payload)) invalidatePrimaryFingerprint();
        return resultText(result) || '';
      })
      .catch(function (err) {
        if (cfg.build === 'fast' && isOverflowError(err) && shouldFallbackStable()) {
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

    beginProverSession: beginProverSession,
    endProverSession: endProverSession,

    checkResultForProver: function (code, hooks) {
      return dispatchCheckResultForProver(code, hooks);
    },

    loadProverChecker: function (code) {
      return dispatchLoadProverChecker(code);
    },

    ideDeclTypeForProver: function (code, name) {
      return dispatchIdeDeclTypeForProver(code, name);
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

    ideDeclType: function (code, name) {
      return dispatchIdeDeclType(code, name);
    },

    ideElaborate: function (code, startLine, endLine, positionsSpec) {
      var requestCode = String(code != null ? code : '');
      var requestFP = fingerprintCode(requestCode);
      var posSpec = String(positionsSpec != null ? positionsSpec : '');
      var payload = { start: startLine, end: endLine, positions: posSpec };

      return ensureIntelReady(CHECKER_BUILD)
        .then(function (slot) {
          return intelLoadThen(slot, requestCode, requestFP, 'ide-elaborate', payload);
        })
        .then(function (result) {
          return resultText(result) || '{"ok":false,"reason":"empty-response"}';
        })
        .catch(function (err) {
          if (intelSlot) intelSlot.committedFingerprint = '';
          throw err;
        });
    },

    runCheckerCommand: function (code, cmd) {
      return dispatchCheckerCommand(code, cmd);
    },

    // Interactive hole action (split/intro) — the STEP-2 FALLBACK only; BelJar
    // generates skeletons from its own model first (hole-split.mjs), and when
    // it falls back here the editor TRANSFORMS the printed answer into our grammar
    // rather than inserting it raw. Beluga's hole NUMBER is a session-global
    // counter that drifts across loads, so this does the load + command ATOMICALLY:
    // a fresh load of `code` re-prints `## Holes ##` with numbers valid for THAT
    // session, we resolve the target hole by position, then run `%:<cmd> <number>
    // <arg>`. The worker serialises jobs, so nothing interleaves. Resolves to
    // { ok, output } — output is the raw command text.
    holeAction: function (code, line, col, cmd) {
      return dispatchHoleAction(code, line, col, cmd);
    },

    isCancelledError: isCancelledError,

    cancelCheckerWorkload: cancelCheckerWorkload,

    setIntelKeepWarm: function (on) {
      intelKeepWarm = !!on;
      if (intelKeepWarm && !intelSlot) {
        ensureIntelReady(CHECKER_BUILD).catch(function () {});
      }
    },

    warmIntel: function (code) {
      var requestCode = String(code != null ? code : '');
      var requestFP = fingerprintCode(requestCode);
      return ensureIntelReady(CHECKER_BUILD).then(function (slot) {
        if (slot.committedFingerprint === requestFP) return true;
        return postWorker(slot, 'load', requestCode, null, { slot: 'intel' })
          .then(function (loadResult) {
            if (loadResult && loadResult.ok) {
              slot.committedFingerprint = requestFP;
              return true;
            }
            slot.committedFingerprint = '';
            return false;
          });
      });
    },
  };
})(typeof window !== 'undefined' ? window : self);

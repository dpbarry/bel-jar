'use strict';

(function (global) {
  var SCRIPT_SRC = document.currentScript && document.currentScript.src;

  var onProgress = null;

  // The builds of the Beluga runtime: the ONE table. Settings > Beluga > Build
  // version offers what availableBuilds() returns, the setting's values and default
  // (settings-schema.mjs) are these keys and DEFAULT_BUILD, and every runtime URL is
  // built from `file` (tests/test-beluga-builds.mjs holds them all to it).
  //   wasm-cps  "Wasm CPS": wasm_of_ocaml, CPS. The default, deeper than stable on
  //             every input measured and as fast as wasm in Chrome (docs/wasm-runtime.md)
  //   wasm      "Wasm direct": wasm_of_ocaml, direct style
  //   stable    "JS CPS": js_of_ocaml, CPS. The fallback, for a browser that cannot
  //             run Wasm (the id is from when it was the safe choice beside "Fast")
  // The ids are stored on every device (the setting, the Run bar's models): the
  // names people see are settings-ui.mjs's, and only those were ever renamed.
  // The table's order is the order the row offers them in.
  // Every build runs in workers. "Fast" (the double-translation build, Run and Load on
  // the main thread) was retired on 2026-10-16: a Wasm build in a worker is ~4× faster
  // and never freezes the page.
  // A Wasm build is a loader plus a folder of .wasm beside it; the loader finds
  // the folder from its own URL (beluga-runtime-load.js), so only `file` is named.
  var BUILDS = {
    'wasm-cps': { file: 'beluga_web_wasm_cps.bc.wasm.js', kind: 'wasm' },
    wasm: { file: 'beluga_web_wasm.bc.wasm.js', kind: 'wasm' },
    stable: { file: 'beluga_web.bc.js', kind: 'js' },
  };
  var DEFAULT_BUILD = 'wasm-cps';
  var FALLBACK_BUILD = 'stable';

  // What a Wasm build needs of the engine: GC, tail calls and exception handling
  // (Chrome 119, Firefox 122, Safari 18.2). Asked of the engine by validating a
  // few bytes that use each, never guessed from the user agent.
  var WASM_PROBES = [
    [0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 95, 1, 120, 0], // a struct type
    [0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 6, 1, 4, 0, 18, 0, 11], // return_call
    [0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 8, 1, 6, 0, 6, 64, 25, 11, 11], // try / catch_all
  ];
  var wasmSupport = null;

  function wasmSupported() {
    if (wasmSupport !== null) return wasmSupport;
    try {
      wasmSupport = typeof WebAssembly === 'object' && WASM_PROBES.every(function (bytes) {
        return WebAssembly.validate(new Uint8Array(bytes));
      });
    } catch (_) {
      wasmSupport = false;
    }
    return wasmSupport;
  }

  // The builds that work in this browser. The deployed site serves the Wasm builds
  // from R2 beside the JS one (upload them first: _rebuild/RECIPE.md, Deploying).
  function availableBuilds() {
    return Object.keys(BUILDS).filter(function (b) {
      return BUILDS[b].kind !== 'wasm' || wasmSupported();
    });
  }

  // The build that runs for a chosen one: itself where it works; otherwise the
  // default where that works, else Stable (a Wasm build stored where the browser can
  // run it, read where it cannot; or a retired value such as "fast").
  function effectiveBuild(build) {
    var available = availableBuilds();
    if (available.indexOf(build) >= 0) return build;
    return available.indexOf(DEFAULT_BUILD) >= 0 ? DEFAULT_BUILD : FALLBACK_BUILD;
  }

  // The SEMANTIC CHECKER must NEVER run on the main thread: refreshing or
  // navigating would freeze the UI while Beluga runs behind the scenes. Every slot
  // (primary, checker, intel, prover and its pool) is a web worker on the chosen
  // build, so choosing one runs everything on it.
  var cfg = { build: effectiveBuild(DEFAULT_BUILD) };

  function checkerBuild() {
    return cfg.build;
  }

  var primarySlot = null;
  var primaryStandby = null;
  var checkerSlot = null;
  var proverSlot = null;
  var proverSessionCount = 0;
  var intelSlot = null;
  var intelKeepWarm = false;
  var checkerIdleTimer = null;
  var proverIdleTimer = null;

  var currentEditorCode = '';
  var editorFingerprint = '';
  var activeLoad = null;

  var LOAD_CANCELLED_MSG = 'Beluga load cancelled';
  var CHECK_CANCELLED_MSG = 'Beluga check cancelled';

  // The settings table (js/persist/settings-schema.mjs) where the page has one; the
  // default, on, where it does not (Node tests). Until 2026-09-28 this asked
  // Persist for functions the persistence rebuild removed, and Run threw on every file.
  // A literal id, so tests/test-persist-api-use.mjs holds it to the table.
  function shouldCancelOnEdit() {
    return !global.Settings || !!global.Settings.get('belugaCancelOnEdit');
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

  // Where the runtime is served from. Same origin by default, so local dev,
  // file:// and the probe suite behave exactly as before. A deployment overrides
  // it with BELJAR_RUNTIME_BASE: the runtime files are kept out of the Worker's
  // upload (.assetsignore) and live in R2.
  //
  // A cross-origin base needs CORS on the bucket. The worker loads the runtime
  // with fetch() in CORS mode and falls back to importScripts, and a Wasm build's
  // loader fetches its .wasm in CORS mode too; without Access-Control-Allow-Origin
  // they fail (seen in Chrome) and Beluga never boots.
  function runtimeBase() {
    var override = typeof globalThis !== 'undefined' ? globalThis.BELJAR_RUNTIME_BASE : null;
    if (override) return new URL(String(override), document.baseURI).href;
    return SCRIPT_SRC ? new URL('../../', SCRIPT_SRC).href : document.baseURI;
  }

  // The build the runtime URL names. _rebuild/stamp-runtime.ps1 writes it from
  // the same timestamp as sw.js's CACHE_NAME every time the blobs are rebuilt,
  // and tests/test-runtime-url.mjs fails if the two ever disagree.
  //
  // ⛔ It is in the URL so every rebuild is a URL no cache has seen. The blob
  // names never change and R2 ignores the query string, but the browser cache
  // and Cloudflare's edge both key on it. Without it a rebuilt runtime hides
  // behind the old bytes for the edge TTL, and in the meantime different users
  // check proofs against different compilers.
  var RUNTIME_VERSION = '20261018002008';

  // ⛔ The ONE place the runtime URL is built. Harpoon's proof worker loads the
  // same bytes and asks for them through BelugaClient.runtimeScriptUrl. It used
  // to keep a private copy of this logic, which still pointed at the app origin
  // after the blobs moved to R2, so its worker 404'd on the deployed site.
  function mainScriptUrl(build) {
    var file = BUILDS[effectiveBuild(build)].file;
    return new URL(file + '?v=' + RUNTIME_VERSION, runtimeBase()).href;
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
          'Beluga checker failed to load.',
          {
            duration: 'long',
            durable: true,
            body: 'Type-checking is unavailable until it loads. Reload the page;'
              + ' if it keeps failing, check that ' + BUILDS[slot.build].file + ' downloads fully.',
            detail: (msg || 'Beluga worker crashed') + loc,
            source: 'beluga.worker',
            dedupeKey: 'beluga.worker.onerror',
          },
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
    return ensureProverReady(checkerBuild());
  }

  function endProverSession() {
    if (proverSessionCount > 0) proverSessionCount -= 1;
    if (proverSessionCount === 0) scheduleProverIdleShutdown();
  }

  function abortProverWorkload() {
    clearProverIdleTimer();
    if (proverSlot) {
      terminateSlot(proverSlot, makeCancelledError(CHECK_CANCELLED_MSG));
      proverSlot = null;
    }
    terminateProverPool(makeCancelledError(CHECK_CANCELLED_MSG));
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

  function resultText(result) {
    return typeof result === 'string' ? result : result && result.output;
  }

  function syncCommittedFingerprintFromLoadResult(result) {
    if (!result || !result.ok || !result.fingerprint) return;
    if (primarySlot) primarySlot.committedFingerprint = String(result.fingerprint);
  }

  function invalidatePrimaryFingerprint() {
    if (primarySlot) primarySlot.committedFingerprint = '';
  }

  function commandInvalidatesCommittedFingerprint(cmd) {
    var text = String(cmd != null ? cmd : '').replace(/^%:/, '').trim().toLowerCase();
    return text === 'reset' || text === 'reload' || text === 'load' || text.indexOf('load ') === 0;
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
    activeLoad = null;
  }

  // The configuration a chosen build runs as: the build that works here.
  function configFor(build) {
    return { build: effectiveBuild(build) };
  }

  function configure(opts) {
    var build = opts && opts.build !== undefined ? effectiveBuild(opts.build) : cfg.build;
    if (build === cfg.build) return;
    cfg.build = build;
    teardown();
  }

  function maybeWarmPrimaryStandby() {
    if (!activeLoad || !activeLoad.stale) return;

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

  // Stop the explicit Run. A primary slot still fetching its script is left to
  // finish warming — the load itself sees it is no longer active and rejects as
  // cancelled.
  function cancelLoad() {
    if (!activeLoad) return false;
    clearActiveLoad(activeLoad);
    invalidatePrimaryFingerprint();
    disposePrimaryStandby(makeCancelledError(LOAD_CANCELLED_MSG));
    if (primarySlot && primarySlot.worker) {
      terminateSlot(primarySlot, makeCancelledError(LOAD_CANCELLED_MSG));
      primarySlot = null;
    }
    return true;
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
  // A `## Holes ##` report with no Error: is a successful check of an incomplete
  // proof (Harpoon's starting state). Worker postMessage can drop `ok`; recover
  // from the output so a clean hole file is not reported as ill-typed.
  function outputLooksLikeSuccessfulHoleReport(output) {
    var text = String(output || '');
    if (!/##\s*Holes:/i.test(text)) return false;
    if (/\bis unbound\b/i.test(text)) return false;
    if (/^Error:/im.test(text)) return false;
    if (/^-\s*Unhandled exception:/im.test(text)) return false;
    if (/Failed to (?:parse|execute|load)\b/i.test(text)) return false;
    return true;
  }

  function checkResultOf(result) {
    var output = resultText(result) || '';
    var ok = !!(result && result.ok);
    if (!ok && outputLooksLikeSuccessfulHoleReport(output)) ok = true;
    return { ok: ok, output: output };
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
    return ensureReady(checkerBuild())
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

    return ensureIntelReady(checkerBuild())
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
    return ensureCheckerReady(checkerBuild())
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

    return ensureIntelReady(checkerBuild())
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

    return ensureIntelReady(checkerBuild())
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
    return ensureReady(checkerBuild())
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
    return ensureProverReady(checkerBuild())
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

  function dispatchRun(cmd, hooks) {
    var payload = String(cmd != null ? cmd : '');
    return ensurePrimaryReady(cfg.build)
      .then(function (slot) {
        return postWorker(slot, 'run', payload, hooks, { forwardGlobalProgress: true });
      })
      .then(function (result) {
        if (commandInvalidatesCommittedFingerprint(payload)) invalidatePrimaryFingerprint();
        return resultText(result) || '';
      });
  }

  function ensureReady() {
    return ensurePrimaryReady(cfg.build).then(function () {});
  }

  global.BelugaClient = {
    configure: configure,

    setProgressHandler: function (fn) { onProgress = fn; },

    isReady: function () { return !!(primarySlot && primarySlot.ready); },

    // The build every slot runs: the one chosen, as it works here.
    getBuild: function () { return cfg.build; },

    workerUrl: function (build) { return workerUrl(build || cfg.build); },

    // The runtime script URL for a build. Anything else that loads the Beluga
    // runtime (Harpoon's dedicated worker, case completion) asks here rather than
    // rebuilding it. A build that does not work here is the one that runs instead
    // (effectiveBuild).
    runtimeScriptUrl: function (build) { return mainScriptUrl(build); },

    // The builds, as Settings > Beluga > Build version offers them: only those
    // that work in this browser, in the table's order.
    availableBuilds: availableBuilds,
    effectiveBuild: effectiveBuild,
    configFor: configFor,
    defaultBuild: DEFAULT_BUILD,

    warm: function () { return ensureReady(); },

    noteEditorChange: noteEditorChange,

    fingerprint: fingerprintCode,

    getEditorFingerprint: function () { return editorFingerprint; },

    getCommittedFingerprint: function () {
      return (primarySlot ? primarySlot.committedFingerprint : '') || null;
    },

    load: function (code, hooks) {
      return dispatchLoad(code, hooks);
    },

    cancelLoad: cancelLoad,

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
    abortProverWorkload: abortProverWorkload,

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

      return ensureIntelReady(checkerBuild())
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
        ensureIntelReady(checkerBuild()).catch(function () {});
      }
    },

    warmIntel: function (code) {
      var requestCode = String(code != null ? code : '');
      var requestFP = fingerprintCode(requestCode);
      return ensureIntelReady(checkerBuild()).then(function (slot) {
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

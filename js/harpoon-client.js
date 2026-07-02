'use strict';

// BelJarHarpoonEngine — the JS transport for the Harpoon (Architecture II).
//
// Drives the REAL Harpoon tactic engine exposed by the OCaml shim
// (ideProofStart/State/Tactic/Undo/Redo/Translate). BelJar is the intelligence:
// only structured JSON crosses this boundary — never Beluga prose. The proof is
// a STATEFUL session living on a single dedicated worker's Beluga instance, so
// every call for one proof goes to the same worker (a fresh start() resets it).
//
// This is deliberately a standalone module (its own worker), so the live
// checker's constant reloads on BelugaClient's slots never clobber an in-flight
// proof. See memory: project-proof-lab.
(function (global) {
  var SCRIPT_SRC = document.currentScript && document.currentScript.src;

  function workerUrl(build) {
    var base = SCRIPT_SRC
      ? new URL('beluga-worker.js', SCRIPT_SRC).href
      : new URL('js/beluga-worker.js', document.baseURI).href;
    return base + (build === 'fast' ? '?build=fast' : '?build=stable');
  }

  // Match BelugaClient's build preference when discoverable, else stable.
  function preferredBuild() {
    try {
      if (global.BelugaClient && typeof global.BelugaClient.getBuild === 'function') {
        return global.BelugaClient.getBuild() || 'stable';
      }
    } catch (e) { /* ignore */ }
    return 'stable';
  }

  var slot = null; // { worker, pending:Map, nextId, ready, readyPromise, build }

  function makeSlot(build) {
    return { worker: null, pending: new Map(), nextId: 1, ready: false, readyPromise: null, build: build };
  }

  function bind(s) {
    s.worker = new Worker(workerUrl(s.build));
    s.worker.onmessage = function (e) {
      var msg = e.data;
      if (!msg || msg.id == null) return;
      var entry = s.pending.get(msg.id);
      if (msg.type === 'progress') return; // proofs don't stream progress
      if (!entry) return;
      s.pending.delete(msg.id);
      if (msg.type === 'ready') { s.ready = true; entry.resolve(s); return; }
      if (msg.type === 'result') { entry.resolve(msg.result); return; }
      if (msg.type === 'stack-overflow') {
        var ovf = new Error('Stack overflow'); ovf.isStackOverflow = true; entry.reject(ovf); return;
      }
      if (msg.type === 'error') entry.reject(new Error(msg.message || 'Proof worker error'));
    };
    s.worker.onerror = function (ev) {
      var err = new Error(ev.message || 'Proof worker crashed');
      s.ready = false; s.readyPromise = null;
      s.pending.forEach(function (en) { en.reject(err); });
      s.pending.clear();
      if (s === slot) slot = null;
    };
  }

  function post(s, type, payload) {
    var id = s.nextId++;
    return new Promise(function (resolve, reject) {
      s.pending.set(id, { resolve: resolve, reject: reject });
      s.worker.postMessage({ id: id, type: type, payload: payload });
    });
  }

  function ready() {
    var build = preferredBuild();
    if (!slot || slot.build !== build) {
      if (slot && slot.worker) slot.worker.terminate();
      slot = makeSlot(build);
    }
    if (slot.ready) return Promise.resolve(slot);
    if (slot.readyPromise) return slot.readyPromise;
    bind(slot);
    slot.readyPromise = post(slot, 'init', null)
      .then(function () { slot.ready = true; slot.readyPromise = null; return slot; })
      .catch(function (err) { slot.readyPromise = null; throw err; });
    return slot.readyPromise;
  }

  // Main-thread fallback: when Worker is unavailable, drive global.Beluga
  // directly. The proof session then lives on the page's Beluga instance.
  var mainReady = false;
  function ensureMain() {
    if (mainReady && typeof global.Beluga !== 'undefined') return Promise.resolve();
    if (typeof global.Beluga !== 'undefined') { mainReady = true; return Promise.resolve(); }
    return Promise.reject(new Error('Beluga not loaded (no worker, no global.Beluga)'));
  }

  function useWorker() {
    return typeof Worker !== 'undefined';
  }

  function callMain(type, payload) {
    switch (type) {
      case 'harpoon-start': return global.Beluga.ideProofStart(payload.code, payload.line, payload.col);
      case 'harpoon-state': return global.Beluga.ideProofState();
      case 'harpoon-tactic': return global.Beluga.ideProofTactic(payload.subgoal, payload.tactic);
      case 'harpoon-undo': return global.Beluga.ideProofUndo();
      case 'harpoon-redo': return global.Beluga.ideProofRedo();
      case 'harpoon-translate': return global.Beluga.ideProofTranslate();
      default: throw new Error('Unknown proof call: ' + type);
    }
  }

  function call(type, payload) {
    if (useWorker()) {
      return ready().then(function (s) { return post(s, type, payload); });
    }
    return ensureMain().then(function () { return callMain(type, payload); });
  }

  // Parse a JSON envelope returned by the shim; tolerate a non-JSON surprise.
  function parse(raw) {
    try { return JSON.parse(String(raw)); }
    catch (e) { return { ok: false, error: 'bad-response', raw: String(raw) }; }
  }

  global.BelJarHarpoonEngine = {
    // Start an interactive proof on the hole at (line, col) — 1-based — in CODE.
    // Resolves the proof model { ok, name, complete, subgoals:[{id,label,goal,ctxText,metaText}] }.
    start: function (code, line, col) {
      return call('harpoon-start', { code: String(code != null ? code : ''), line: line, col: col }).then(parse);
    },
    // Re-read the focused theorem's subgoals.
    state: function () { return call('harpoon-state', null).then(parse); },
    // Apply one tactic to subgoal `subgoalId`. `tactic` is { kind, var? }.
    tactic: function (subgoalId, tactic) {
      return call('harpoon-tactic', { subgoal: String(subgoalId), tactic: JSON.stringify(tactic) }).then(parse);
    },
    undo: function () { return call('harpoon-undo', null).then(parse); },
    redo: function () { return call('harpoon-redo', null).then(parse); },
    // Translate the (complete) proof to BelJar-grammar source: { ok, complete, source }.
    translate: function () { return call('harpoon-translate', null).then(parse); },
    // Drop the dedicated worker (ends the proof session).
    dispose: function () {
      if (slot && slot.worker) slot.worker.terminate();
      slot = null;
    },
  };
})(typeof window !== 'undefined' ? window : self);

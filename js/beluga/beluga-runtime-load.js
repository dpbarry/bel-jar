/* global Beluga */
'use strict';

// Load the Beluga runtime into a worker. Shared by every worker that holds one (the
// checker's `beluga-worker.js`, the case-completion worker) so the one way it is loaded
// cannot drift: fetched and evaluated from a Blob (the deployed runtime lives on another
// origin, served with CORS), falling back to a plain importScripts.
//
// The URL is never built here: the page asks BelugaClient.runtimeScriptUrl, its one
// owner, and hands it in.
//
// A Wasm build (wasm_of_ocaml: a `.wasm.js` loader, its .wasm in a folder beside it) is
// loaded differently, for three things its loader does (_rebuild/RECIPE.md, Wasm builds):
//   - it finds its .wasm from document.currentScript.src, which a worker has not got, so
//     it is given one for as long as it takes to read it;
//   - it starts asynchronously and drops its own promise: `Beluga` exists only once
//     OCaml's start assigns it, which a setter here observes, with a deadline, and a
//     start that fails surfaces as an unhandled rejection, which is caught, never a hang;
//   - it compiles with instantiateStreaming, which refuses a response that is not
//     application/wasm; a local server that sends another type still works.

(function (root) {
  var WASM_START_MS = 60000;

  function isWasmRuntime(scriptUrl) {
    return /\.wasm\.js$/.test(new URL(scriptUrl, root.location.href).pathname);
  }

  function importFromBlob(buffer) {
    var blob = new Blob([buffer], { type: 'text/javascript' });
    var url = URL.createObjectURL(blob);
    try {
      importScripts(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function loadJs(scriptUrl) {
    return fetch(scriptUrl, { credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) {
        throw new Error('Beluga fetch HTTP ' + res.status + ' for ' + scriptUrl);
      }
      return res.arrayBuffer();
    }).then(function (buf) {
      if (!buf || !buf.byteLength) throw new Error('Beluga script was empty: ' + scriptUrl);
      importFromBlob(buf);
      if (typeof Beluga === 'undefined') throw new Error('Beluga global missing after load');
    }).catch(function (fetchErr) {
      try {
        importScripts(scriptUrl);
        if (typeof Beluga === 'undefined') throw new Error('Beluga global missing after load');
      } catch (syncErr) {
        var detail = fetchErr && fetchErr.message ? fetchErr.message : String(fetchErr);
        var syncDetail = syncErr && syncErr.message ? syncErr.message : String(syncErr);
        throw new Error('Could not load Beluga (' + detail + '; importScripts: ' + syncDetail + ')');
      }
    });
  }

  // instantiateStreaming, but a response of the wrong type is compiled from its bytes.
  function tolerateWasmMime() {
    var streaming = WebAssembly.instantiateStreaming;
    if (!streaming || streaming.tolerant) return;
    var tolerant = function (source, imports, options) {
      return Promise.resolve(source).then(function (res) {
        var type = (res && res.headers && res.headers.get('content-type')) || '';
        if (/^application\/wasm\b/i.test(type)) return streaming.call(WebAssembly, res, imports, options);
        if (!res.ok) throw new Error('Beluga fetch HTTP ' + res.status + ' for ' + res.url);
        return res.arrayBuffer().then(function (buf) { return WebAssembly.instantiate(buf, imports, options); });
      });
    };
    tolerant.tolerant = true;
    WebAssembly.instantiateStreaming = tolerant;
  }

  // The loader is fetched first, as a JS build is, so a server that has not got this
  // build says so ("HTTP 404 for …") instead of importScripts' bare "failed to load";
  // then it runs from its bytes, told its real URL. A fetch that fails outright (the
  // network, CORS) falls back to importing it by that URL.
  function loadWasm(scriptUrl) {
    var fetched = fetch(scriptUrl, { credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) {
        var httpErr = new Error('Could not load Beluga (HTTP ' + res.status + ' for ' + scriptUrl + ')');
        httpErr.isHttp = true;
        throw httpErr;
      }
      return res.arrayBuffer();
    });
    return fetched.then(function (buf) {
      if (!buf || !buf.byteLength) throw new Error('Beluga script was empty: ' + scriptUrl);
      return startWasm(scriptUrl, function () { importFromBlob(buf); });
    }, function (err) {
      if (err && err.isHttp) throw err;
      return startWasm(scriptUrl, function () { importScripts(scriptUrl); });
    });
  }

  function startWasm(scriptUrl, evaluate) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = null;
      function finish(err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        root.removeEventListener('unhandledrejection', onRejection);
        if (err) reject(err); else resolve();
      }
      function onRejection(e) {
        var r = e && e.reason;
        e.preventDefault();
        finish(new Error('Could not start Beluga (' + (r && r.message ? r.message : String(r)) + ')'));
      }
      var value;
      Object.defineProperty(root, 'Beluga', {
        configurable: true,
        get: function () { return value; },
        set: function (v) {
          Object.defineProperty(root, 'Beluga', { configurable: true, writable: true, value: v });
          finish(null);
        },
      });
      root.addEventListener('unhandledrejection', onRejection);
      timer = setTimeout(function () {
        finish(new Error('Beluga did not start within ' + (WASM_START_MS / 1000) + ' s: ' + scriptUrl));
      }, WASM_START_MS);
      tolerateWasmMime();
      var hadDocument = 'document' in root;
      if (!hadDocument) root.document = { currentScript: { src: scriptUrl } };
      try {
        evaluate();
      } catch (e) {
        finish(new Error('Could not load Beluga (importScripts: ' + (e && e.message ? e.message : String(e)) + ')'));
      } finally {
        // The loader read currentScript before its first await; nothing else here may
        // take the stand-in for a page.
        if (!hadDocument) delete root.document;
      }
    });
  }

  root.isWasmRuntime = isWasmRuntime;
  root.loadBelugaRuntime = function (scriptUrl) {
    return isWasmRuntime(scriptUrl) ? loadWasm(scriptUrl) : loadJs(scriptUrl);
  };
}(self));

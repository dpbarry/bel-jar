/* The runtime benchmark's worker (scripts/runtime-bench/chrome-bench.mjs): one
   Beluga runtime of any build, booted and timed.

   A JS build loads as the app loads it (js/beluga/beluga-runtime-load.js): fetched,
   then importScripts from a Blob URL. A Wasm build's loader finds its .wasm from
   document.currentScript.src, which a worker does not have, so the worker gives it
   one; the page may also hand over the compiled WebAssembly.Module, and then the
   loader instantiates that instead of compiling its own. Either way the runtime is
   ready when the shim assigns `Beluga`, which a setter here observes. */
'use strict';

var T0 = performance.now();
var ready = null;
var failed = null;
var beluga;
var whenReady = new Promise(function (resolve, reject) { ready = resolve; failed = reject; });

Object.defineProperty(self, 'Beluga', {
  configurable: true,
  get: function () { return beluga; },
  set: function (v) { beluga = v; ready(v); },
});
self.reportBelugaProgress = function () {};
self.addEventListener('unhandledrejection', function (e) { failed(e.reason); });

function errText(e) {
  return (e && e.name ? e.name + ': ' : '') + (e && e.message ? e.message : String(e));
}

async function sha1(text) {
  var d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('').slice(0, 12);
}

function resources() {
  return performance.getEntriesByType('resource').map(function (r) {
    return { name: r.name.replace(/^.*\//, ''), transferSize: r.transferSize, encodedBodySize: r.encodedBodySize, ms: +(r.responseEnd - r.startTime).toFixed(1) };
  });
}

async function boot(msg) {
  var t1 = performance.now();
  var fetched;
  if (msg.kind === 'js') {
    var buf = await (await fetch(msg.url)).arrayBuffer();
    fetched = performance.now();
    var url = URL.createObjectURL(new Blob([buf], { type: 'text/javascript' }));
    try { importScripts(url); } finally { URL.revokeObjectURL(url); }
  } else {
    self.document = { currentScript: { src: msg.url } };
    if (msg.module) {
      var shared = msg.module;
      WebAssembly.instantiateStreaming = async function (_response, imports) {
        return { module: shared, instance: await WebAssembly.instantiate(shared, imports) };
      };
    }
    importScripts(msg.url);
    fetched = performance.now();
  }
  await whenReady;
  var t3 = performance.now();
  return { workerStartToReadyMs: t3 - T0, loadMs: t3 - t1, fetchMs: fetched - t1, resources: resources() };
}

async function check(code) {
  var t = performance.now();
  var out = null;
  var threw = null;
  try { out = self.Beluga.checkFromString(code); } catch (e) { threw = errText(e); }
  var ms = performance.now() - t;
  var ok = !!(out && (out.ok === true || out.ok === 1));
  return { ms: ms, ok: ok, threw: threw, output: threw ? '' : String(out.output).slice(0, 300),
    hash: threw ? null : await sha1(String(ok) + '\u0000' + String(out.output)) };
}

self.onmessage = async function (e) {
  var msg = e.data;
  try {
    var result;
    if (msg.type === 'boot') result = await boot(msg);
    else if (msg.type === 'check') result = await check(msg.code);
    else throw new Error('unknown message ' + msg.type);
    self.postMessage({ id: msg.id, result: result });
  } catch (err) {
    self.postMessage({ id: msg.id, error: errText(err) });
  }
};

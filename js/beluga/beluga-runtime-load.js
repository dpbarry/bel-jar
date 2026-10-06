/* global Beluga */
'use strict';

// Load the Beluga runtime into a worker. Shared by every worker that holds one (the
// checker's `beluga-worker.js`, the case-completion worker) so the one way it is loaded
// cannot drift: fetched and evaluated from a Blob (the deployed runtime lives on another
// origin, served with CORS), falling back to a plain importScripts.
//
// The URL is never built here: the page asks BelugaClient.runtimeScriptUrl, its one
// owner, and hands it in.

(function (root) {
  function importFromBlob(buffer) {
    var blob = new Blob([buffer], { type: 'text/javascript' });
    var url = URL.createObjectURL(blob);
    try {
      importScripts(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  root.loadBelugaRuntime = function (scriptUrl) {
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
  };
}(self));

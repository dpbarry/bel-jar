'use strict';

// The Beluga runtime is a 25-33 MB js_of_ocaml bundle. Fetching it from the
// network on every load is the single biggest thing between opening BelJar and
// type-checking anything, so it is cached — and nothing else is.
var CACHE_NAME = 'beluga-runtime-20260922151200';

function isBelugaRuntime(url) {
  return /\/beluga_web\.bc(\.dt)?\.js$/.test(new URL(url).pathname);
}

function stashInCache(cache, request, response) {
  try {
    cache.put(request, response.clone()).catch(function () {});
  } catch (_) { /* clone/quota must never break the live response */ }
}

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) { return k !== CACHE_NAME; })
          .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

// One revalidation per URL per service-worker lifetime. The runtime is fetched
// once per page load anyway; this is belt and braces against a page that asks
// twice.
var revalidated = Object.create(null);

/**
 * ⛔ Cache-first with NO revalidation meant a stale runtime FOREVER.
 *
 * The URL never changes across builds, so the only thing that could evict the
 * old bytes was someone remembering to hand-edit `CACHE_NAME` — and by the time
 * this was written that name was already older than the `beluga_web.bc.js`
 * sitting beside it. Anyone who had loaded BelJar before that build was still
 * being served the previous compiler, with no way to notice and no way out but
 * clearing site data.
 *
 * Stale-while-revalidate instead: serve the cached bytes immediately (the whole
 * point of caching something this size), and in the background ask the server
 * whether they are still current. `cache: 'no-cache'` forces a conditional
 * request, so an unchanged runtime costs one 304 and an updated one is in place
 * for the next load. Correctness no longer depends on remembering anything.
 *
 * Since then the runtime URL carries the build stamp as well (?v=, from
 * RUNTIME_VERSION in beluga-client.js), so a rebuild is a URL no cache has
 * seen and arrives on the very next load. Revalidation stays as the safety net
 * for bytes that change under an unchanged URL: a deploy that went out before
 * the R2 upload, say.
 */
function revalidate(cache, request) {
  var key = request.url;
  if (revalidated[key]) return Promise.resolve();
  revalidated[key] = true;
  return fetch(request, { cache: 'no-cache' }).then(function (fresh) {
    if (fresh && fresh.ok) stashInCache(cache, request, fresh);
  }).catch(function () { /* offline is not an error here */ });
}

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  if (!isBelugaRuntime(event.request.url)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(event.request).then(function (cached) {
        if (cached) {
          // ⛔ Never let the revalidation affect the response. It is started
          // either way; `waitUntil` only asks the browser to keep this worker
          // alive until it finishes, and a throw from it (the event is no
          // longer active) must not reject the promise handed to
          // `respondWith` — that would fail the Beluga runtime request
          // outright, which is far worse than a background check cut short.
          var pending = revalidate(cache, event.request);
          try { event.waitUntil(pending); } catch (_) { /* it still runs */ }
          return cached;
        }

        return fetch(event.request).then(function (response) {
          if (response.ok) stashInCache(cache, event.request, response);
          return response;
        });
      });
    }).catch(function () {
      // ⛔ The Cache API is not always there — private windows, storage
      // disabled, an evicted origin. Caching is an optimisation for this one
      // asset; failing to cache must never mean failing to load it.
      return fetch(event.request);
    })
  );
});

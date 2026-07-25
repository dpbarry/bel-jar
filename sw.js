'use strict';

var CACHE_NAME = 'beluga-runtime-20260722f-shell-graph';

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

self.addEventListener('fetch', function (event) {
  if (!isBelugaRuntime(event.request.url)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(event.request).then(function (cached) {
        if (cached) return cached;

        return fetch(event.request).then(function (response) {
          if (response.ok) stashInCache(cache, event.request, response);
          return response;
        });
      });
    })
  );
});

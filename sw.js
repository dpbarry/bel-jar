'use strict';

var CACHE_NAME = 'beluga-runtime-20260602165949';

function isBelugaRuntime(url) {
  return /\/beluga_web\.bc(\.dt)?\.js$/.test(new URL(url).pathname);
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

// Stale-while-revalidate: serve cached immediately, update cache in background.
self.addEventListener('fetch', function (event) {
  if (!isBelugaRuntime(event.request.url)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(event.request).then(function (cached) {
        var networkPromise = fetch(event.request).then(function (response) {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(function (err) {
          if (cached) return cached;
          throw err;
        });

        return cached || networkPromise;
      });
    })
  );
});

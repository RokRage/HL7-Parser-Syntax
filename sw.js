const CACHE_VERSION = "hl7-message-explorer-v0.0001";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/styles.css?v=app-version-1",
  "./assets/js/app.js?v=mobile-badge-labels-1",
  "./assets/js/hl7-fields-2x.js",
  "./assets/js/hl7-datatypes-2x.js",
  "./assets/js/hl7-field-desc-2x.js",
  "./assets/js/samples.js",
  "./assets/vendor/codemirror/codemirror.bundle.js",
  "./assets/vendor/material-symbols/material-symbols-rounded.css",
  "./assets/vendor/material-symbols/material-symbols-rounded-subset.woff2",
  "./assets/dude_sqizzle_shaded.svg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return key !== CACHE_VERSION;
          })
          .map(function (key) {
            return caches.delete(key);
          })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  var url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          var copy = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) {
            cache.put("./index.html", copy);
          });
          return response;
        })
        .catch(function () {
          return caches.match("./index.html");
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      var network = fetch(request)
        .then(function (response) {
          if (response && response.ok) {
            var copy = response.clone();
            caches.open(CACHE_VERSION).then(function (cache) {
              cache.put(request, copy);
            });
          }
          return response;
        })
        .catch(function () {
          return cached;
        });
      return cached || network;
    })
  );
});

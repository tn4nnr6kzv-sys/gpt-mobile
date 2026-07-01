/* Golf Tracker Mobile — service worker
   Cache-first : une fois visitée en Wi-Fi, l'app fonctionne intégralement
   hors-ligne (sur le parcours, sans réseau). */

const CACHE_NAME = "golftracker-mobile-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  var isSameOrigin = new URL(event.request.url).origin === self.location.origin;
  if (!isSameOrigin) {
    // Requêtes externes (ex. API météo) : réseau direct, jamais mises en cache —
    // ce sont des données changeantes, et l'app doit fonctionner sans elles hors-ligne.
    event.respondWith(fetch(event.request).catch(() => Response.error()));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((resp) => {
          var copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return resp;
        })
        .catch(() => cached);
    })
  );
});

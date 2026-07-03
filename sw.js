/* Golf Tracker Mobile — service worker
   Cache-first : une fois visitée en Wi-Fi, l'app fonctionne intégralement
   hors-ligne (sur le parcours, sans réseau). */

// Nom du cache = version du PWA. RÈGLE : garder synchronisé avec APP_BUILD dans app.js à
// chaque modification (ex. app.js "v1.8.0" -> cache "golftracker-mobile-1.8.0"). Le changement
// de ce nom déclenche la purge de l'ancien cache à l'activation (voir handler 'activate').
const CACHE_NAME = "golftracker-mobile-1.8.0";
const ASSETS = [
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
    caches.open(CACHE_NAME).then((cache) => {
      // cache.add() par fichier plutôt que cache.addAll() : addAll() est tout-ou-rien — un
      // seul fichier en échec (404, réseau) fait silencieusement échouer TOUTE la mise en
      // cache, et l'app se retrouve sans rien de disponible hors-ligne. Ici, un échec isolé
      // n'empêche pas les autres fichiers d'être mis en cache.
      return Promise.all(
        ASSETS.map((url) => cache.add(url).catch((err) => {
          console.error("Échec de mise en cache :", url, err);
        }))
      );
    }).then(() => self.skipWaiting())
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
  var url = new URL(event.request.url);
  var isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin) {
    // Requêtes externes (ex. API météo) : réseau direct, jamais mises en cache —
    // ce sont des données changeantes, et l'app doit fonctionner sans elles hors-ligne.
    event.respondWith(fetch(event.request).catch(() => Response.error()));
    return;
  }
  if (url.pathname.endsWith("courses-data.json")) {
    // Fichier de données parcours (déposé manuellement dans le dépôt, mis à jour de temps en
    // temps) : réseau EN PRIORITÉ pour toujours avoir la dernière version quand il y a du réseau,
    // avec repli sur la version en cache si hors-ligne. L'inverse du reste de l'app (cache-first),
    // volontairement — sinon une mise à jour du fichier ne serait jamais vue.
    event.respondWith(
      fetch(event.request).then((resp) => {
        var copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return resp;
      }).catch(() => caches.match(event.request))
    );
    return;
  }
  // Fichiers de l'app (HTML / JS / CSS) : STALE-WHILE-REVALIDATE. On sert immédiatement la
  // version en cache (rapide, et fonctionne hors-ligne sur le parcours), MAIS on relance en
  // parallèle un fetch réseau qui met à jour le cache en arrière-plan. Résultat : dès qu'une
  // nouvelle version est déployée, elle est récupérée à la visite suivante avec réseau, sans
  // rien faire — le bouton « Actualiser l'app » ne sert plus qu'à forcer immédiatement.
  var isAppShell = url.pathname.endsWith(".html") || url.pathname.endsWith(".js") ||
                   url.pathname.endsWith(".css") || url.pathname.endsWith("/") ||
                   event.request.mode === "navigate";
  if (isAppShell) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        var network = fetch(event.request).then((resp) => {
          if (resp && resp.status === 200) {
            var copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return resp;
        }).catch(() => null);
        // cache d'abord (instantané), sinon on attend le réseau ; le fetch réseau tourne de
        // toute façon en tâche de fond pour rafraîchir le cache.
        return cached || network.then((r) => r || (event.request.mode === "navigate"
          ? caches.match("./index.html") : Response.error()));
      })
    );
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
        .catch(() => {
          // Hors-ligne et pas en cache : pour une navigation (ouverture de l'app), on retombe
          // sur l'index en cache plutôt que d'afficher l'erreur générique du navigateur.
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
          return cached;
        });
    })
  );
});

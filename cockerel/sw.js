// sw.js — minimal app-shell service worker. Two jobs: (1) satisfy the
// "registered service worker controlling the page" leg of Chrome/Android's
// PWA installability criteria (manifest.webmanifest alone isn't enough to
// get a real install prompt), and (2) a little offline resilience as a
// side benefit. Deliberately NOT a heavy caching PWA — every fetch is
// network-first, cache only as a fallback, so a player is never stuck on
// stale game code after a deploy just because a service worker cached the
// old version. There is no build step here (zero-dependency Node
// toolchain, see cockerel/CLAUDE.md) — this file IS what ships, hand-kept
// in sync with the real static file list below.
//
// NEVER intercepts /api/* — those must always hit the real server.
// Caching a guess/write/today response would be a correctness bug (stale
// game state), not just a staleness annoyance.
//
// CACHE_NAME is the one thing to bump on a meaningful static-asset
// change — activate() deletes every other cockerel-shell-* cache, so an
// unbumped version just means one extra file added to an existing cache
// (harmless, network-first makes it moot anyway), not stale content served.
const CACHE_NAME = "cockerel-shell-v1";
const APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "css/tokens.css",
  "assets/fredoka.css",
  "assets/nesen.svg",
  "assets/nesen-180.png",
  "assets/nesen-512.png",
  "js/ui.js",
  "js/config.js",
  "js/i18n.js",
  "js/storage.js",
  "js/gallery-screens.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Only ever handle same-origin GET requests outside /api/ — everything
  // else (API calls, cross-origin requests like the Google Identity
  // Services script, non-GET requests) passes straight through untouched.
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? Response.error()))
  );
});

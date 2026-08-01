// Minimal service worker: exists only to satisfy PWA installability criteria
// (a fetch handler is required). It intentionally does NOT cache anything -
// every request passes straight through to the network, so there is no risk
// of serving stale JS/CSS/API responses.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request))
})

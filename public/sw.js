// Real offline support: cache the app shell (HTML/JS/CSS/manifest) and any
// recipe data + photos the user has actually looked at, so recipes stay
// readable without a connection. Bump the cache names below whenever the
// caching strategy changes, to drop stale entries from returning users.
const SHELL_CACHE = 'shell-v1'
const RUNTIME_CACHE = 'runtime-v2'
const SHELL_URLS = ['/', '/manifest.webmanifest', '/favicon.png']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== SHELL_CACHE && key !== RUNTIME_CACHE).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  )
})

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (err) {
    const cached = await cache.match(request)
    if (cached) return cached
    throw err
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  // Opaque (no-cors, cross-origin) responses report ok:false but are still
  // valid to cache - that's how third-party recipe photos get stored.
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // The app uses a HashRouter, so every route is served from '/' - normalize
  // navigations to the precached shell document instead of the hash URL.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(new Request('/'), SHELL_CACHE))
    return
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/assets/')) {
      // Vite fingerprints build output by content hash, so a given URL's
      // content never changes - safe to serve straight from cache.
      event.respondWith(cacheFirst(request, SHELL_CACHE))
      return
    }

    if (url.pathname.startsWith('/api/recipes') || url.pathname.startsWith('/api/favorites')) {
      event.respondWith(networkFirst(request, RUNTIME_CACHE))
      return
    }

    if (url.pathname === '/api/share/image') {
      // Every hosted recipe photo (not just third-party ones below) is
      // served through this resize proxy - response is content-immutable
      // per (src, width) query pair, so it's safe and worth caching the
      // same way. Without this, switching views and back re-downloaded
      // every thumbnail instead of hitting the cache.
      event.respondWith(cacheFirst(request, RUNTIME_CACHE))
      return
    }

    return
  }

  if (request.destination === 'image') {
    // Recipe photos (assets.tugy.dev, Unsplash, ...) - cache as viewed.
    event.respondWith(cacheFirst(request, RUNTIME_CACHE))
  }
})

// Cache version — bump this on every deploy to force update
const CACHE = 'dekabess-v2'

self.addEventListener('install', e => {
  self.skipWaiting() // activate immediately
})

self.addEventListener('activate', e => {
  // Delete ALL old caches
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  // Never cache Supabase API calls — always need live data
  if (e.request.url.includes('supabase') || 
      e.request.url.includes('api.') ||
      e.request.method !== 'GET') {
    e.respondWith(fetch(e.request))
    return
  }

  // Network first — try to get fresh version, fall back to cache
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
      .catch(() => caches.match(e.request))
  )
})

// Tell all open tabs to reload when new SW activates
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting()
})

// Pin & Spin service worker: makes the game installable as an app (like Dekabess).
// Network first, so players always get the latest version; the cache is only a fallback
// when the connection drops. Game data (the Supabase server) is never cached.
// v2: sounds are no longer routed through here (see below); the old cache is cleared.
const CACHE = 'pin-and-spin-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    // keep the sounds the game stored on the device (src/sound/sfx.js, 'pin-and-spin-sounds')
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'pin-and-spin-sounds').map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || e.request.method !== 'GET') return;
  if (url.pathname === '/version.json') return; // the update banner always asks the server
  // Sounds and other media go straight to the network (the game keeps its own copy of the
  // sounds, see src/sound/sfx.js). Phones load audio in pieces ("range" requests); handling
  // those here breaks playback in the installed app, especially on iPhone.
  const d = e.request.destination;
  if (d === 'audio' || d === 'video' || e.request.headers.has('range') || url.pathname.startsWith('/sounds/')) return;
  e.respondWith(fetch(e.request)
    .then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })
    .catch(() => caches.match(e.request).then((hit) => hit || caches.match('/'))));
});

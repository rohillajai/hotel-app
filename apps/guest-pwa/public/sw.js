// Service Worker — Guest PWA
// Minimal implementation: cache app shell for offline, pass through API calls

const CACHE_NAME = 'guest-pwa-v1';
const SHELL_ASSETS = ['/', '/checkin', '/dashboard'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Don't cache API calls or websocket
  if (url.pathname.startsWith('/api') || url.protocol === 'wss:') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

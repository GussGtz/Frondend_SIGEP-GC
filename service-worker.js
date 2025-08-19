// service-worker.js
const SW_VERSION = 'v2025-08-19-5';
const STATIC_CACHE = `static-${SW_VERSION}`;

// Cacheamos SOLO estáticos “seguros” (no HTML/JS principales)
const STATIC_ASSETS = [
  '/manifest.json',
  '/offline.html',
  '/assets/fondo.png',
  '/assets/logoglass.png',
  '/assets/logoglassico.ico',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== STATIC_CACHE ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

// Mensaje para activar al instante tras deploy
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // No interceptar llamadas a API ni de otros orígenes
  const isAPI = url.pathname.startsWith('/api') || url.origin.includes('backend-sigep-gc');
  if (isAPI) return;

  // Navegación: network-first, fallback offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // Misma-origen: cache-first SOLO para STATIC_ASSETS
  if (url.origin === self.location.origin) {
    const matchInStaticList = STATIC_ASSETS.includes(url.pathname);
    if (matchInStaticList) {
      event.respondWith(
        caches.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
            return res;
          }).catch(() => caches.match('/offline.html'));
        })
      );
    }
    // el resto (index.html, js, etc.) van por red normalmente -> evita quedarse “pegado”
  }
});

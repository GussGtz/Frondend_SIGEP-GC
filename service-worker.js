// service-worker.js
const SW_VERSION = 'v1.0.2';          // ⬅ sube versión para “romper” cache anterior
const STATIC_CACHE = `static-${SW_VERSION}`;
const STATIC_ASSETS = [
  '/', '/index.html', '/manifest.json', '/offline.html',
  '/assets/fondo.png', '/assets/logoglass.png', '/assets/logoglassico.ico',
  '/js/index.js', '/js/auth.js', '/js/login.js'
];

// ... resto igual ...

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isApi = url.pathname.startsWith('/api') || url.origin.includes('backend-sigep-gc');
  const isAuth = url.pathname.includes('login.html');

  // Nunca cachear API ni login
  if (isApi || isAuth) return;

  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((res) => {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            return res;
          })
          .catch(() => {
            if (request.mode === 'navigate' || request.destination === 'document') {
              return caches.match('/offline.html');
            }
          });
      })
    );
  }
});

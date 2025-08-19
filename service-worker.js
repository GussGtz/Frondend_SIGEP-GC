/* service-worker.js */
const SW_VERSION = 'v1.0.0';
const STATIC_CACHE = `static-${SW_VERSION}`;
const STATIC_ASSETS = [
  '/',               // Render sirve index en /
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/assets/fondo.png',
  '/assets/logoglass.png',
  '/assets/logoglassico.ico',
  // CSS/JS propios:
  '/js/index.js',
  '/js/auth.js',
  // Fuentes/Libs CDNs no se pueden cachear por ruta relativa; opcionalmente agrégalas si las sirves local
];

// Instalar: precache estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activar: limpia versiones antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== STATIC_CACHE ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// Estrategia:
// - Requests a nuestro sitio y archivos estáticos → "cache-first con fallback a red"
// - Requests a API (backend) → "network-only" (no cacheamos contenido privado)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // No interceptar métodos que no sean GET
  if (request.method !== 'GET') return;

  // Si es nuestro backend (ajusta dominio si cambia)
  const isApi = url.origin.includes('backend-sigep-gc');
  if (isApi) {
    // Deja pasar a la red (para no cachear info privada ni cookies)
    return; // no respondWith ⇒ pasa directo
  }

  // Si es mismo origen y archivo estático => cache-first
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((res) => {
            // Cachea nuevas respuestas navegables/estáticas
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            return res;
          })
          .catch(() => {
            // Fallback offline SOLO para navegaciones
            if (request.mode === 'navigate' || request.destination === 'document') {
              return caches.match('/offline.html');
            }
          });
      })
    );
  }
});

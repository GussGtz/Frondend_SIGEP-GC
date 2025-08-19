/* service-worker.js — auto-actualizable sin tocar versión */
const SW_VERSION = 'auto'; // etiqueta simbólica
const CACHE_PREFIX = 'sigepgc';
const STATIC_CACHE = `${CACHE_PREFIX}-static-v1`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-v1`;

const STATIC_ASSETS = [
  '/offline.html',
  '/manifest.json',
  '/assets/fondo.png',
  '/assets/logoglass.png',
  '/assets/logoglassico.ico',
  '/js/index.js',
  '/js/auth.js',
  '/js/login.js'
];

// Helpers
const isSameOrigin = (url) => url.origin === self.location.origin;
const isApi = (url) =>
  url.pathname.startsWith('/api') || url.origin.includes('backend-sigep-gc');
const isLogin = (url) => url.pathname.endsWith('/login.html');
const isHTMLRequest = (request) =>
  request.mode === 'navigate' ||
  (request.destination === 'document') ||
  (request.headers.get('accept') || '').includes('text/html');

// Install: precache mínimos (NO index.html para no estancarlo)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: limpia cachés viejas y toma control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: estrategias por tipo
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nunca cachear API ni login
  if (isApi(url) || isLogin(url)) return;

  // 1) HTML / navegación -> Network First (con fallback a cache/offline)
  if (isHTMLRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          // cache:'reload' fuerza a pedir al servidor la última versión del HTML
          const fresh = await fetch(new Request(request, { cache: 'reload' }));
          // guarda copia en runtime cache para fallback
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, fresh.clone());
          return fresh;
        } catch (err) {
          const cache = await caches.open(RUNTIME_CACHE);
          const cached = await cache.match(request);
          if (cached) return cached;
          // último recurso: offline
          return (await caches.open(STATIC_CACHE)).match('/offline.html');
        }
      })()
    );
    return;
  }

  // 2) Misma-ORIGEN estáticos (js/css/img) -> Stale-While-Revalidate
  if (isSameOrigin(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((res) => {
            // guarda la respuesta fresca para la próxima
            cache.put(request, res.clone());
            return res;
          })
          .catch(() => null);

        // devuelve cache rápido y actualiza en segundo plano
        return cached || (await networkPromise) || (await caches.match('/offline.html'));
      })()
    );
    return;
  }

  // 3) Terceros: intenta red y si falla usa lo que haya en cache (si es que lo agregamos alguna vez)
  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        const cached = await caches.match(request);
        return cached || (await caches.match('/offline.html'));
      }
    })()
  );
});

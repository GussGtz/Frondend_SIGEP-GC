/* service-worker.js */
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

const isSameOrigin = (url) => url.origin === self.location.origin;
const isApi = (url) => url.pathname.startsWith('/api') || url.origin.includes('backend-sigep-gc');
const isLogin = (url) => url.pathname.endsWith('/login.html');
const isHTMLRequest = (request) =>
  request.mode === 'navigate' ||
  request.destination === 'document' ||
  (request.headers.get('accept') || '').includes('text/html');

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nunca cachear API ni login
  if (isApi(url) || isLogin(url)) return;

  // HTML -> Network First
  if (isHTMLRequest(request)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(new Request(request, { cache: 'reload' }));
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        return (await caches.open(STATIC_CACHE)).match('/offline.html');
      }
    })());
    return;
  }

  // Estáticos mismo origen -> Stale-While-Revalidate
  if (isSameOrigin(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      const networkPromise = fetch(request).then((res) => {
        cache.put(request, res.clone());
        return res;
      }).catch(() => null);
      return cached || (await networkPromise) || (await caches.match('/offline.html'));
    })());
    return;
  }

  // Terceros
  event.respondWith((async () => {
    try { return await fetch(request); }
    catch {
      const cached = await caches.match(request);
      return cached || (await caches.match('/offline.html'));
    }
  })());
});

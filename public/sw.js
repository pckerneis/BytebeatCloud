const CACHE_PREFIX = 'bytebeatcloud-';
let CACHE_NAME = `${CACHE_PREFIX}dev`;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX))
          .map((key) => caches.delete(key)),
      ),
    ),
  );

  void self.clients.claim();
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'SET_VERSION') return;
  const version = String(data.version || '').trim();
  if (!version) return;
  CACHE_NAME = `${CACHE_PREFIX}${version}`;
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const accept = request.headers.get('accept') || '';
  const isHtml = request.mode === 'navigate' || accept.includes('text/html');
  const isStaticAsset =
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/bytebeat-worklet.js' ||
    url.pathname.startsWith('/fonts/');

  // Network-first for HTML/navigation requests: always try to get fresh UI, fallback to cache.
  if (isHtml) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request)),
    );
    return;
  }

  // Cache-first for static assets.
  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          return response;
        });
      }),
    );
  }
});

const CACHE_VERSION = 'shokuzai-local-v1.0.3';

const CORE_ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/db.js',
  './js/import.js',
  './js/backup.js',
  './js/share.js',
  './manifest.json',
  './icons/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (url.origin === self.location.origin && url.pathname.endsWith('/css/app.css')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(async response => {
          const css = await response.text();
          const patched = `${css}\n.update-banner{display:none!important;}\n`;
          return new Response(patched, {
            status: response.status,
            statusText: response.statusText,
            headers: { 'Content-Type': 'text/css; charset=utf-8' }
          });
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (!cached) throw new Error('CSS unavailable');
          const css = await cached.text();
          return new Response(`${css}\n.update-banner{display:none!important;}\n`, {
            headers: { 'Content-Type': 'text/css; charset=utf-8' }
          });
        })
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(fetch(event.request));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

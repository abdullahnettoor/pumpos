// Minimal service worker — makes the mobile app installable and gives an
// offline app-shell. Data is never cached here (owner reports must be live);
// TanStack Query handles in-session data caching per the pump-data-caching tiers.
const SHELL_CACHE = 'pumpos-mobile-shell-v1';
const SHELL_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Never intercept API / auth calls — always hit the network for live data.
  if (url.pathname.startsWith('/api') || url.hostname !== self.location.hostname) return;

  // App-shell navigations: network-first, fall back to cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  // Static assets: cache-first.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request)),
  );
});

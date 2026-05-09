const CACHE_NAME = 'wechat-pwa-v0-0-06';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './srcipt.js',
  './manifest.webmanifest',
  './sw.js',
  './service-worker.js',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isCore = /(?:index\.html|style\.css|srcipt\.js|sw\.js|service-worker\.js)$/.test(url.pathname) || event.request.mode === 'navigate';
  if (isCore) {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => null);
      return response;
    }).catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => null);
    return response;
  }).catch(() => caches.match('./index.html'))));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const contactId = event.notification.data && event.notification.data.contactId;
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if ('focus' in client) {
        client.focus();
        if (contactId) client.postMessage({ type: 'OPEN_CHAT', contactId });
        return;
      }
    }
    const url = contactId ? `./index.html?chat=${encodeURIComponent(contactId)}` : './index.html';
    if (clients.openWindow) await clients.openWindow(url);
  })());
});

let lastKeepAliveAt = 0;
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'KEEP_ALIVE') lastKeepAliveAt = event.data.time || Date.now();
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

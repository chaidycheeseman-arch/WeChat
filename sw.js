const CACHE_NAME = 'wechat-forum-pwa-v4';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './srcipt.js',
  './manifest.webmanifest',
  './sw.js',
  './service-worker.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/dexie/3.2.4/dexie.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
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
  if (event.data && event.data.type === 'KEEP_ALIVE') {
    lastKeepAliveAt = event.data.time || Date.now();
  }
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

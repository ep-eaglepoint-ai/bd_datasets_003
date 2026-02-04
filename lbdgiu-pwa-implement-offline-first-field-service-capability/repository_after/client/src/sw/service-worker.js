const CACHE_NAME = 'field-service-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/src/main.jsx',
    '/manifest.json',
    // other critical assets like CSS or logos here
];

// Skip waiting and claim clients immediately
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Caching shell assets');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
    // Clean up old caches if version changes
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
});

// Cache-First Strategy
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((networkResponse) => {
                return networkResponse;
            });
        }).catch(() => {
            // If both fail (offline and not in cache), show offline fallback
            if (event.request.mode === 'navigate') {
                return caches.match('/');
            }
        })
    );
});
const CACHE_NAME = 'bte-ticketing-v2';
const ASSETS_TO_CACHE = [
  './index.html',
  './admin.html',
  './track.html',
  './login.html',
  './css/style.css',
  './css/login.css',
  './css/index.css',
  './js/config.js',
  './js/cache_manager.js',
  './js/auth.js',
  './js/pwa.js',
  './logo.png',
  './logo-192.png',
  './logo-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell');
        // We use addAll with a fallback map to avoid failing the whole install if one file is missing
        return Promise.allSettled(
            ASSETS_TO_CACHE.map(url => cache.add(url).catch(err => console.warn('[Service Worker] Failed to cache', url, err)))
        );
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(keyList.map(key => {
        if (key !== CACHE_NAME) {
          console.log('[Service Worker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request).catch(() => {
            // Handle offline fallback if needed
        });
      })
  );
});

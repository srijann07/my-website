// sw.js - Service Worker for offline support and caching
const CACHE_NAME = 'disaster-dashboard-v1';
const ASSETS = [
  '/',
  '/html',
  '/ss.css',
  '/srij.js',
  '/worker-csv.js',
  'https://unpkg.com/leaflet/dist/leaflet.js',
  'https://unpkg.com/leaflet/dist/leaflet.css',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
});

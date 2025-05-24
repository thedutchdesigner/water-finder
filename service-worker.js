const CACHE_NAME = 'water-finder-v1';
const ASSETS = [
  '.',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.json',
  'https://unpkg.com/leaflet/dist/leaflet.css',
  'https://unpkg.com/leaflet/dist/leaflet.js'
];

self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', evt => {
  const url = new URL(evt.request.url);

  // Serve static assets from cache first
  if (ASSETS.includes(url.pathname) || ASSETS.includes(evt.request.url)) {
    evt.respondWith(caches.match(evt.request));
    return;
  }

  // Otherwise do network (Overpass, tiles, etc.), but still cache tile layers
  if (url.origin.includes('tile.openstreetmap.org')) {
    evt.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        fetch(evt.request).then(resp => {
          cache.put(evt.request, resp.clone());
          return resp;
        })
      )
    );
    return;
  }

  // Default: network fallback to cache
  evt.respondWith(
    fetch(evt.request)
      .catch(() => caches.match(evt.request))
  );
});

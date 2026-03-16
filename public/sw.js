// Manpower Service Worker v2 - iOS compatible
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  const method = event.request.method;

  // Don't intercept API calls AT ALL - let browser handle natively
  // This fixes "Returned response is null" on iOS
  if (
    url.includes('anthropic.com') ||
    url.includes('supabase.co') ||
    url.includes('flagcdn.com') ||
    method === 'POST' ||
    method === 'PATCH' ||
    method === 'DELETE' ||
    method === 'PUT'
  ) {
    return; // No event.respondWith = browser handles it directly
  }

  // Only cache static GET assets
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
  self.clients.claim();
});

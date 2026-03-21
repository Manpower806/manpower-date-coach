// Manpower Service Worker v5 - Offline + Push + iOS compatible
const CACHE_NAME = 'manpower-v5';

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  const method = event.request.method;

  // Never intercept API calls
  if (
    url.includes('anthropic.com') ||
    url.includes('supabase.co') ||
    url.includes('flagcdn.com') ||
    method === 'POST' ||
    method === 'PATCH' ||
    method === 'DELETE' ||
    method === 'PUT'
  ) {
    return;
  }

  // Images from storage - cache them for offline
  if (url.includes('storage') || url.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached || new Response('', {status: 404}));
        })
      )
    );
    return;
  }

  // App shell - network first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(r => r || new Response('Offline - Bitte Internet verbinden', {status: 503})))
  );
});

// Handle incoming push notifications
self.addEventListener('push', (event) => {
  let data = { title: 'MANPOWER BRUDERSCHAFT', body: '👑 Neue Nachricht' };
  try { data = event.data.json(); } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'manpower',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: '/' },
    })
  );
});

// Click on notification opens the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url === '/' && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
  self.clients.claim();
});

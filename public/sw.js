// Manpower Service Worker v3 - Push + iOS compatible

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  const method = event.request.method;
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
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
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

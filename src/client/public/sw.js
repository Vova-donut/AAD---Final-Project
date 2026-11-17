/* App shell is cached separately from private data, which lives in IndexedDB. */
const CACHE = 'study-planner-shell-v1';
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch('/', { cache: 'reload' });
      const html = await response.text();
      const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"#]+)"/g)].map(
        (match) => match[1],
      );
      const fonts = [];
      for (const css of assets.filter((path) => path.endsWith('.css'))) {
        const cssText = await (await fetch(css, { cache: 'reload' })).text();
        for (const match of cssText.matchAll(/url\(["']?([^\)"']+)["']?\)/g)) {
          const url = new URL(match[1], new URL(css, self.location.origin));
          if (url.origin === self.location.origin && !url.href.startsWith('data:'))
            fonts.push(url.pathname);
        }
      }
      await cache.put('/', new Response(html, { headers: { 'Content-Type': 'text/html' } }));
      await cache.addAll([
        ...new Set([
          ...assets,
          ...fonts,
          '/fonts.css',
          '/icon.svg',
          '/icon-192.png',
          '/icon-512.png',
          '/manifest.webmanifest',
        ]),
      ]);
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(
        (await caches.keys())
          .filter((key) => key.startsWith('study-planner-shell-') && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }
  event.respondWith(
    (async () => {
      const hit = await caches.match(request);
      if (hit) return hit;
      return fetch(request);
    })(),
  );
});
self.addEventListener('push', (event) => {
  let payload = { title: 'Study Planner', body: 'You have a study notification.', url: '/' };
  try {
    Object.assign(payload, event.data.json());
  } catch {}
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'study-planner',
      data: { url: '/' },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients)
        if (client.url.startsWith(self.location.origin) && 'focus' in client) return client.focus();
      return self.clients.openWindow('/');
    })(),
  );
});

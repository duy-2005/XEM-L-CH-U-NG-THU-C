/* Service worker: cache vỏ ứng dụng (cùng origin), KHÔNG cache dữ liệu y tế/API, nhận Web Push. */
const CACHE = 'dtd-shell-v1';
const SHELL = [
  '/index.html', '/app.js', '/common.js', '/styles.css', '/manifest.json',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Chỉ xử lý GET cùng origin; bỏ qua /api/*, Supabase, CDN
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Ưu tiên mạng (luôn bản mới nhất), rơi về cache khi mất mạng
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && SHELL.includes(url.pathname)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
  );
});

// ---- Web Push ----
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data && e.data.text() }; }
  const title = String(data.title || 'Nhắc uống thuốc');
  e.waitUntil(
    self.registration.showNotification(title, {
      body: String(data.body || 'Đã đến giờ dùng thuốc.'),
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'dtd-reminder',
      data: { url: '/index.html' },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return clients.openWindow('/index.html');
    })
  );
});

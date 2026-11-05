// XemChuaVN - service worker: cho phép cài app (PWA) + mở nhanh / chạy vỏ giao diện khi mạng chập chờn.
// Chiến lược: mạng trước, lỗi mạng thì lấy bản đã lưu. Không đụng vào /api, /socket.io, video, trang ngoài.
const CACHE = 'xemchuavn-v1';
const SHELL = ['/', '/app.js', '/catalog.json', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png',
  '/vendor/three/build/three.module.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/') || req.headers.has('range')) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('/') : Response.error()))));
});

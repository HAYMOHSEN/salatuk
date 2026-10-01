/* Salatuk service worker — bump VERSION on every release so installed apps refresh their files */
const VERSION = 'salatuk-1.0.0';
const FONT_CACHE = 'salatuk-fonts';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './privacy.html',
  './icons/favicon.svg', './icons/favicon-32.png', './icons/apple-touch-icon.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-192.png', './icons/maskable-512.png',
  './icons/shortcut-qibla.png', './icons/shortcut-adhkar.png', './icons/shortcut-tasbeeh.png', './icons/shortcut-calendar.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONT_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: serve from cache, refresh in the background
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    e.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const hit = await cache.match(req);
      const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()); return r; }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      return (await net) || Response.error();
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Pages: network first (so updates arrive), cached copy when offline or slow
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const net = fetch(req).then(r => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
      const first = await Promise.race([net, new Promise(res => setTimeout(() => res('slow'), 3500))]);
      if (first && first !== 'slow') return first;
      const cached = (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./index.html')) || (await cache.match('./'));
      if (cached) { e.waitUntil(net); return cached; }
      return (await net) || new Response('<!doctype html><meta charset="utf-8"><title>Salatuk</title><p style="font-family:sans-serif;padding:2rem">Offline</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    })());
    return;
  }

  // Static files: cache first
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r && r.ok) { const c = await caches.open(VERSION); c.put(req, r.clone()); }
      return r;
    } catch (err) { return Response.error(); }
  })());
});

/* Offline support. Network first, so a new version arrives as soon as you are online; the saved copy is used when you are not.
   Change VERSION whenever you edit the app files so phones drop the old copy. Your budget data is never touched here. */
const VERSION = 'my-budget-v3';
const SHELL = ['./', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/core.js', 'js/demo.js', 'js/charts.js', 'js/views.js', 'js/views2.js', 'js/sheets.js', 'js/plan.js', 'js/lock.js', 'js/main.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(
    fetch(r).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(r, copy)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match('index.html')))
  );
});

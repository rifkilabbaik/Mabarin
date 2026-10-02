/* MABARIN service worker
 * Naikkan CACHE_VERSION setiap kali ada file yang berubah / game baru ditambahkan,
 * agar pemain otomatis mendapat versi terbaru. */
var CACHE_VERSION = 'mabarin-v1.0.0';

var PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './fonts/fonts.css',
  './fonts/lilita-one.woff2',
  './fonts/fredoka.woff2',
  './js/app.js',
  './js/games.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
  // Tambahkan file game di sini, mis. './games/tap-race/index.html'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) { return cache.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_VERSION) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  // Halaman: network-first agar update cepat terasa, fallback ke cache saat offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (hit) {
          return hit || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // Aset lain: stale-while-revalidate
  event.respondWith(
    caches.match(req).then(function (hit) {
      var network = fetch(req).then(function (res) {
        if (res.ok) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || network;
    })
  );
});

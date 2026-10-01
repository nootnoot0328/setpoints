/* Setpoint service worker — makes the app work offline after the first visit.
   Bump VERSION whenever you change any file so phones pick up the update. */
const VERSION = "setpoint-3.7.0";
// Quest art lives in its own cache that survives app updates. Its name is a
// fingerprint of assets/quest/ (node tools/art-hash.js); the tests fail if it's stale,
// so changed art always reaches phones instead of the old copy being served.
const ART = "setpoint-art-18e94708";
const SHELL = [
  "./", "index.html", "manifest.webmanifest",
  "css/app.css", "js/engine.js", "js/foods.js", "js/charts.js", "js/exercises.js", "js/train.js", "js/quest.js", "js/sync.js", "js/app.js", "js/exlib-full.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/favicon-64.png"
];

self.addEventListener("install", e => {
  // cache: "reload" skips the browser's HTTP cache, so an update never
  // installs stale copies of the files it's meant to replace.
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== ART).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // barcode lookups and the sync Worker must always be live
  // the update check reads sw.js itself; never answer that from a cache
  if (url.origin === self.location.origin && url.pathname.endsWith("/sw.js")) return;
  if (url.hostname.endsWith("openfoodfacts.org") || url.hostname.endsWith("workers.dev")) return;

  // fonts and the barcode library: cache-first, they never change
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) || url.hostname === "cdn.jsdelivr.net" || url.hostname === "raw.githubusercontent.com") {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Quest art: cache-first in the long-lived art cache, so updates don't re-download it
  if (url.origin === self.location.origin && url.pathname.includes("/assets/quest/")) {
    e.respondWith(caches.open(ART).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // app shell and exercise images: serve from cache instantly, refresh in the background.
  // Exercise images are cached the first time each one is shown.
  if (url.origin === self.location.origin) {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});

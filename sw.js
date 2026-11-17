// Site Notes service worker - v1.4 (17 Nov 2026). Change CACHE on every release so phones show "Update now".
const CACHE = "sitenotes-v5";
const SHELL = ["./", "./index.html", "./manifest.json", "./icon-aji-192.png", "./icon-aji-512.png", "./apple-touch-icon-aji.png"];
const LIBS = [
  "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.umd.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
];
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })));
    for (const u of LIBS) { try { await c.add(u); } catch (err) {} }
  })());
});
self.addEventListener("message", e => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.includes("/api/")) return; // live data from the PC - never cached
  // App page: network first (to get updates) but only wait 3.5 s, then use the saved copy
  if (req.mode === "navigate" || (url.origin === location.origin && url.pathname.endsWith("index.html"))) {
    const net = fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put("./index.html", cp)); } return r; });
    e.respondWith(new Promise(resolve => {
      let done = false;
      const fromCache = () => caches.match("./index.html").then(hit => { if (hit && !done) { done = true; resolve(hit); } return hit; });
      const t = setTimeout(fromCache, 3500);
      net.then(r => { clearTimeout(t); if (!done) { done = true; resolve(r); } },
               () => { clearTimeout(t); fromCache().then(hit => { if (!hit && !done) { done = true; resolve(Response.error()); } }); });
    }));
    e.waitUntil(net.catch(() => {}));
    return;
  }
  // manifest + icons: network first so a new icon is picked up, saved copy when offline
  if (url.origin === location.origin && /manifest\.json$|\.png$/.test(url.pathname)) {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return r; })
      .catch(() => caches.match(req)));
    return;
  }
  // Everything else: cache first
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok && (url.origin === location.origin || /cdnjs|jsdelivr/.test(url.host))) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return r;
  })));
});

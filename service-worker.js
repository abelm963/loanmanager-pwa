const CACHE_NAME = "loanmanager-pwa-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) NEVER try to cache/fallback POST/PUT/etc.
  //    If network fails, return a clean JSON error (not null).
  if (req.method !== "GET") {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(
          JSON.stringify({ ok: false, status: 503, error: "Network/API request failed" }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    return;
  }

  // 2) App assets: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }

  // 3) External GETs (Apps Script GET endpoints): network-first with safe JSON fallback
  event.respondWith(
    fetch(req).catch(() =>
      new Response(
        JSON.stringify({ ok: false, status: 503, error: "Network/API request failed" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      )
    )
  );
});

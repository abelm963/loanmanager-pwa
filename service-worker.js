const CACHE_NAME = "loanmanager-pwa-v4";
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

// Any request to these hosts MUST bypass the SW entirely.
// This prevents "Returned response is null" caused by Apps Script redirects / opaque responses.
function isBypassHost(hostname) {
  const h = (hostname || "").toLowerCase();
  return (
    h === "script.google.com" ||
    h.endsWith(".script.google.com") ||
    h === "script.googleusercontent.com" ||
    h.endsWith(".script.googleusercontent.com") ||
    h === "googleusercontent.com" ||
    h.endsWith(".googleusercontent.com") ||
    h.endsWith(".google.com")
  );
}

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

  // If we can't safely reason about the URL, do nothing.
  // Let the browser handle it.
  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  // 0) HARD BYPASS: Never intercept Google / Apps Script traffic (GET or POST).
  // Let Safari handle redirects and cross-origin rules natively.
  if (isBypassHost(url.hostname)) {
    return;
  }

  // 1) Never intercept non-GET. (POST/PUT/PATCH/DELETE)
  // Do not respondWith anything. Let the browser handle it.
  // This avoids SW producing null/opaque failures.
  if (req.method !== "GET") {
    return;
  }

  // 2) Same-origin assets: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }

  // 3) Other external GETs: network-only (no caching, no JSON fallback)
  // (Avoid corrupting responses for fonts/images/anything else.)
  event.respondWith(fetch(req));
});

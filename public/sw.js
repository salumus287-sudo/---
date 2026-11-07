const CACHE = "drack-hub-static-v2";
const OFFLINE = "/offline.html";

const PRECACHE = [
  OFFLINE,
  "/manifest.json",
  "/drack-hub-icon.svg",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key =>
              key.startsWith("drack-hub-static-") && key !== CACHE
            )
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/admin") ||
    url.pathname.includes("drack-media")
  ) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        return await caches.match(OFFLINE) ||
          new Response("DRACK HUB: Internet haipatikani.", {
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
      })
    );
    return;
  }

  if (/\.(css|js|svg|png|jpg|jpeg|webp|woff2)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => {
        const update = fetch(request).then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        });

        if (cached) {
          event.waitUntil(update.catch(() => {}));
          return cached;
        }

        return update;
      })
    );
  }
});

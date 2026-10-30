const CACHE = "mestre-mobile-v11-shell-2";
const SHELL = [
  "index.html",
  "styles.css",
  "app.js",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "icon.svg",
  "sw.js",
];

function isShell(url) {
  if (url.origin !== self.location.origin) return false;
  const name = url.pathname.split("/").pop();
  return !name || SHELL.includes(name);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((name) => new URL(name, self.location.href)))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!isShell(url)) return;
  event.respondWith((async () => {
    try {
      const fresh = await fetch(request);
      if (fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(request, fresh.clone());
      }
      return fresh;
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        const fallback = await caches.match(new URL("index.html", self.location.href));
        if (fallback) return fallback;
      }
      return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});

const CACHE = "mestre-mobile-shell-v1";
const SHELL = ["/", "/pwa/styles.css", "/pwa/app.js", "/manifest.json"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL))));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))));
self.addEventListener("fetch", (event) => { if (new URL(event.request.url).origin !== location.origin) return; event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });

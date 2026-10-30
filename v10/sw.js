const CACHE_NAME = "mestre-do-pc-v11-pwa-v2";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/gerenciar-comandos.html",
  "/memories.html",
  "/novidades-v11.html",
  "/acessar-memorias.html",
  "/prompts-de-comando.html",
  "/chat-integrado/chat-integrado.html",
  "/chat-integrado/styles.css",
  "/chat-integrado/chat-integrado.js",
  "/chat-integrado/chat-integrado-boot.js",
  "/chat-integrado/chat-utils.js",
  "/chat/chat-module.js",
  "/chat/chat-module.css",
  "/rede-dashboard.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.png",
  "/logo-mestre-v7-transparent.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(STATIC_ASSETS.map((url) => cache.add(url)))
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Endpoints de API e tempo real sempre vão direto para a rede (network-first sem cachear dados mutáveis)
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/ollama/") ||
    url.pathname.startsWith("/memories/") ||
    url.pathname.startsWith("/operations") ||
    url.pathname.startsWith("/soul") ||
    url.pathname.startsWith("/computer-use") ||
    url.pathname === "/ping" ||
    url.pathname === "/status" ||
    url.pathname === "/mcp-status" ||
    url.pathname === "/run-status" ||
    url.pathname === "/modo-livre"
  ) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("/index.html")))
  );
});
#!/usr/bin/env node
/**
 * Servidor estático da pasta completa dist/site na VPS.
 * Escuta só em 127.0.0.1; o Traefik publica HTTPS.
 */
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");
const SITE_ROOT = resolve(process.env.SITE_ROOT || join(PROJECT_ROOT, "dist", "site"));
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || "7780");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(String(urlPath || "/").split("?")[0]);
  const relative = decoded.replace(/^\/+/, "");
  const full = resolve(SITE_ROOT, relative);
  const root = SITE_ROOT.endsWith(sep) ? SITE_ROOT : SITE_ROOT + sep;
  if (full !== SITE_ROOT && !full.startsWith(root)) return null;
  return full;
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method Not Allowed");
  }
  const url = new URL(req.url || "/", `http://${HOST}`);
  if (url.pathname === "/ping") {
    return send(
      res,
      200,
      JSON.stringify({ status: "ok", app: "mestre-site", version: "10.1.0" }),
      "application/json; charset=utf-8",
    );
  }
  let target = safePath(url.pathname);
  if (!target) return send(res, 400, "Bad path");
  if (existsSync(target) && statSync(target).isDirectory()) {
    target = join(target, "index.html");
  }
  if (!existsSync(target) && url.pathname.startsWith("/mobile")) {
    target = join(SITE_ROOT, "mobile", "index.html");
  }
  if (!existsSync(target)) return send(res, 404, "Not found");
  const type = TYPES[extname(target).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(target).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`Mestre site VPS em http://${HOST}:${PORT} (root ${SITE_ROOT})`);
});

#!/usr/bin/env node
/**
 * Servidor estático da pasta completa dist/site na VPS.
 * Escuta só em 127.0.0.1; o Traefik publica HTTPS.
 */
import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
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

// ---- API proxy (chat) added 2026-10-30 ----
const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const OLLAMA_FALLBACK_MODEL = process.env.MESTRE_OLLAMA_CHAT_MODEL || "qwen2.5-coder:3b-instruct";
const ROUTERS = [
  [process.env.NINEROUTER_BASE_URL, process.env.NINEROUTER_API_KEY, process.env.NINEROUTER_MODEL],
  [process.env.NINEROUTER_VPS_BASE_URL, process.env.NINEROUTER_VPS_API_KEY, process.env.NINEROUTER_VPS_MODEL],
].filter(([u, k]) => u && k).map(([u, k, m]) => ({ url: u.replace(/\/+$/, ""), key: k, model: m || "auto" }));


// ---- Hermes agent (same agent as Telegram) added 2026-10-30c ----
const HERMES_URL = (process.env.HERMES_BASE_URL || "").replace(/\/+$/, "");
const HERMES_KEY = process.env.HERMES_API_KEY || "";
const HERMES_MODEL = process.env.HERMES_MODEL || "hermes-agent";
const MOBILE_TOKEN = process.env.MESTRE_MOBILE_TOKEN || "";
function authorized(req) {
  if (!MOBILE_TOKEN) return false;
  const got = Buffer.from(String(req.headers["x-mestre-mobile-token"] || ""));
  const want = Buffer.from(MOBILE_TOKEN);
  return got.length === want.length && timingSafeEqual(got, want);
}
function sessionKey(req, messages) {
  const explicit = String(req.headers["x-mestre-conversation"] || "").replace(/[^\w.-]/g, "").slice(0, 64);
  if (explicit) return "mestre-mobile-" + explicit;
  const first = messages.find(m => m && m.role === "user");
  const seed = first ? (typeof first.content === "string" ? first.content : JSON.stringify(first.content)) : "default";
  return "mestre-mobile-" + createHash("sha256").update(seed).digest("hex").slice(0, 24);
}
async function tryHermes(req, messages) {
  if (!HERMES_URL || !HERMES_KEY) return null;
  try {
    const resp = await fetch(HERMES_URL + "/chat/completions", {
      method: "POST", signal: AbortSignal.timeout(600000),
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + HERMES_KEY, "X-Hermes-Session-Key": sessionKey(req, messages) },
      body: JSON.stringify({ model: HERMES_MODEL, messages, stream: false }),
    });
    if (!resp.ok) { console.error("hermes HTTP", resp.status); return null; }
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content;
    if (text) return { text, provider: "hermes", model: HERMES_MODEL };
  } catch (e) { console.error("hermes err", e.message); }
  return null;
}

function readBody(req) {
  return new Promise((ok, bad) => { let d = ""; req.on("data", c => { d += c; if (d.length > 2e6) req.destroy(); }); req.on("end", () => ok(d)); req.on("error", bad); });
}
function json(res, status, obj) { send(res, status, JSON.stringify(obj), "application/json; charset=utf-8"); }
async function ollamaModels() {
  try { const r = await fetch(OLLAMA_URL + "/api/tags", { signal: AbortSignal.timeout(5000) }); return (await r.json()).models || []; } catch { return []; }
}
async function pickOllamaModel(requested) {
  const names = (await ollamaModels()).map(m => m.name).filter(n => !n.includes("cloud"));
  return names.includes(requested) ? requested : OLLAMA_FALLBACK_MODEL;
}
async function tryRouters(messages) {
  for (const r of ROUTERS) {
    try {
      const resp = await fetch(r.url + "/chat/completions", {
        method: "POST", signal: AbortSignal.timeout(60000),
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + r.key },
        body: JSON.stringify({ model: r.model, messages, stream: false }),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content;
      if (text) return { text, provider: "9router", model: data.model || r.model };
    } catch { /* next */ }
  }
  return null;
}
async function chatHandler(req, res, flavor) {
  let body = {};
  try { body = JSON.parse(await readBody(req) || "{}"); } catch { return json(res, 400, { error: "invalid json" }); }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const m = String(body.model || "");
  const skipHermes = m && !m.startsWith("hermes") && process.env.MESTRE_HERMES_ALWAYS !== "1" && false;
  const routed = (!skipHermes && await tryHermes(req, messages)) || await tryRouters(messages);
  if (routed) {
    if (flavor === "openai") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Mestre-Provider": routed.provider });
      res.write("data: " + JSON.stringify({ choices: [{ delta: { content: routed.text } }] }) + "\n\ndata: [DONE]\n\n");
    } else {
      res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Mestre-Provider": routed.provider });
      res.write(JSON.stringify({ model: routed.model, message: { role: "assistant", content: routed.text }, done: true }) + "\n");
    }
    return res.end();
  }
  const model = await pickOllamaModel(body.model);
  const path = flavor === "openai" ? "/v1/chat/completions" : "/api/chat";
  try {
    const up = await fetch(OLLAMA_URL + path, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true }), signal: AbortSignal.timeout(300000),
    });
    res.writeHead(up.status, { "Content-Type": up.headers.get("content-type") || "application/x-ndjson", "Cache-Control": "no-store", "X-Mestre-Provider": "ollama:" + model });
    for await (const chunk of up.body) res.write(chunk);
    res.end();
  } catch (e) {
    if (!res.headersSent) json(res, 502, { error: "Nenhum provedor de IA respondeu: " + e.message }); else res.end();
  }
}
async function apiRoute(req, res, url) {
  const p = url.pathname;
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (p !== "/api/health" && !authorized(req)) return json(res, 401, { error: "Token mobile ausente ou invalido. Configure em Ajustes > Token mobile." });
  if (p === "/api/health") return json(res, 200, { ok: true, status: "ok", providers: [...(HERMES_URL ? ["hermes"] : []), ...ROUTERS.map(() => "9router"), "ollama"] });
  if (p === "/api/tags") return json(res, 200, { models: await ollamaModels() });
  if (p === "/v1/models") return json(res, 200, { object: "list", data: [{ id: HERMES_MODEL, object: "model" }, ...(await ollamaModels()).map(m => ({ id: m.name, object: "model" }))] });
  if (p === "/api/conversas" && req.method === "POST") return json(res, 200, { data: { id: "local-" + Date.now() } });
  if (/^\/api\/conversas\/[^/]+\/msg$/.test(p)) return json(res, 200, { ok: true });
  if (p === "/api/skills" || p === "/api/tools") return json(res, 200, { data: [] });
  if (req.method === "POST" && p === "/v1/chat/completions") return chatHandler(req, res, "openai");
  if (req.method === "POST" && (p === "/api/chat" || p === "/ollama/chat")) return chatHandler(req, res, "ollama");
  return json(res, 404, { error: "not found" });
}
// ---- end API proxy ----

const server = http.createServer((req, res) => {
  { const u0 = new URL(req.url || "/", "http://x"); if (u0.pathname.startsWith("/api/") || u0.pathname.startsWith("/v1/") || u0.pathname === "/ollama/chat") return apiRoute(req, res, u0); }
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

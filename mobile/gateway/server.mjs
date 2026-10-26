import http from "node:http";
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { loadOperationRegistry } from "../../v10/operation-registry.js";

const scrypt = promisify(scryptCallback);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");
const PORT = Number(process.env.MOBILE_GATEWAY_PORT || "8787");
const HOST = process.env.MOBILE_GATEWAY_HOST || "127.0.0.1";
const LAUNCHER_URL = (process.env.MESTRE_BASE_URL || "http://127.0.0.1:7777").replace(/\/+$/, "");
const AUTH_FILE = process.env.MOBILE_AUTH_FILE || join(__dirname, "data", "users.json");
const SESSION_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_BODY = 16 * 1024 * 1024;
const sessions = new Map();
const challenges = new Map();

function json(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers });
  res.end(JSON.stringify(body));
}
function parseCookies(req) {
  const result = {};
  for (const item of String(req.headers.cookie || "").split(";")) {
    const index = item.indexOf("=");
    if (index > 0) result[item.slice(0, index).trim()] = decodeURIComponent(item.slice(index + 1).trim());
  }
  return result;
}
function sessionCookie(token, maxAge = SESSION_TTL_MS / 1000) {
  const secure = process.env.MOBILE_COOKIE_SECURE !== "0";
  return `mestre_mobile_session=${encodeURIComponent(token)}; Max-Age=${Math.floor(maxAge)}; Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}
async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw new Error("Payload excede o limite permitido."); chunks.push(chunk); }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}
async function loadUsers() {
  try { return JSON.parse(await readFile(AUTH_FILE, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return { users: [] }; throw error; }
}
function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; const clean = String(value || "").toUpperCase().replace(/=+$/, "").replace(/[^A-Z2-7]/g, ""); let bits = "";
  for (const char of clean) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const bytes = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(bytes);
}
function totp(secret, counter = Math.floor(Date.now() / 30000)) {
  const input = Buffer.alloc(8); input.writeBigUInt64BE(BigInt(counter)); const digest = createHmac("sha1", base32Decode(secret)).update(input).digest(); const offset = digest[digest.length - 1] & 15; const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000; return String(value).padStart(6, "0");
}
function verifyTotp(secret, code) {
  const supplied = String(code || "").replace(/\s/g, ""); if (!/^\d{6}$/.test(supplied)) return false;
  for (let drift = -1; drift <= 1; drift += 1) { const expected = totp(secret, Math.floor(Date.now() / 30000) + drift); if (timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return true; } return false;
}
async function verifyPassword(password, encoded) {
  const [saltHex, hashHex] = String(encoded || "").split(":"); if (!saltHex || !hashHex) return false; const derived = await scrypt(String(password || ""), Buffer.from(saltHex, "hex"), 64); const expected = Buffer.from(hashHex, "hex"); return expected.length === derived.length && timingSafeEqual(expected, derived);
}
function getSession(req) {
  const token = parseCookies(req).mestre_mobile_session; const session = token ? sessions.get(token) : null;
  if (!session || session.expiresAt <= Date.now()) { if (token) sessions.delete(token); return null; }
  session.expiresAt = Date.now() + SESSION_TTL_MS; return { token, ...session };
}
function requireSession(req, res) { const session = getSession(req); if (!session) { json(res, 401, { error: "Sessão expirada ou ausente." }); return null; } return session; }
async function launcherToken() {
  if (process.env.MESTRE_LOCAL_MCP_TOKEN) return process.env.MESTRE_LOCAL_MCP_TOKEN;
  const envPath = process.env.MESTRE_ENV_LOCAL_PATH || join(PROJECT_ROOT, ".env.local");
  try { const line = (await readFile(envPath, "utf8")).split(/\r?\n/).find((item) => /^\s*MESTRE_LOCAL_MCP_TOKEN\s*=/.test(item)); return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : ""; } catch { return ""; }
}
async function launcherRequest(path, options = {}) {
  const token = await launcherToken(); if (!token) throw new Error("MESTRE_LOCAL_MCP_TOKEN não configurado. Inicie o launcher primeiro.");
  const headers = new Headers(options.headers || {}); headers.set("X-Mestre-Client", "mcp"); headers.set("X-Mestre-Mcp-Token", token); return fetch(`${LAUNCHER_URL}${path}`, { ...options, headers });
}
async function proxyJson(res, path, options = {}) {
  try { const upstream = await launcherRequest(path, options); const text = await upstream.text(); res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "application/json", "Cache-Control": "no-store" }); res.end(text); }
  catch (error) { json(res, 502, { error: error.message }); }
}
async function proxyStream(res, path, body) {
  try { const upstream = await launcherRequest(path, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }); res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "application/x-ndjson", "Cache-Control": "no-store", "X-Accel-Buffering": "no" }); if (!upstream.body) return res.end(); for await (const chunk of upstream.body) res.write(chunk); res.end(); }
  catch (error) { if (!res.headersSent) json(res, 502, { error: error.message }); else res.end(); }
}
async function toolRequiresConfirmation(name) {
  try { const registry = await loadOperationRegistry(); const operation = registry.getById(name); if (operation) return Boolean(operation.destructive); } catch {}
  try {
    const response = await launcherRequest("/api/tools");
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data.metadata?.[name]?.destructive || data.metadata?.[name]?.isDestructive || data.metadata?.[name]?.requiresConfirmation);
  } catch {
    return false;
  }
}

export function createMobileGateway() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
    try {
      if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, service: "mestre-mobile-gateway", launcher: LAUNCHER_URL });
      if (req.method === "GET" && url.pathname === "/manifest.json") { const manifest = await readFile(join(__dirname, "../pwa/manifest.json")); res.writeHead(200, { "Content-Type": "application/manifest+json" }); return res.end(manifest); }
      if (url.pathname.startsWith("/auth/")) {
        if (req.method === "POST" && url.pathname === "/auth/login") { const body = await readBody(req); const { users = [] } = await loadUsers(); const user = users.find((item) => item.username === String(body.username || "").trim().toLowerCase()); if (!user || !(await verifyPassword(body.password, user.passwordHash))) return json(res, 401, { error: "Usuário ou senha inválidos." }); const challengeId = randomUUID(); challenges.set(challengeId, { user: user.username, totpSecret: user.totpSecret, expiresAt: Date.now() + CHALLENGE_TTL_MS }); return json(res, 200, { challengeId, requires2fa: true }); }
        if (req.method === "POST" && url.pathname === "/auth/2fa/verify") { const body = await readBody(req); const challenge = challenges.get(String(body.challengeId || "")); if (!challenge || challenge.expiresAt <= Date.now() || !verifyTotp(challenge.totpSecret, body.code)) return json(res, 401, { error: "Código 2FA inválido ou expirado." }); challenges.delete(body.challengeId); const token = randomBytes(32).toString("base64url"); sessions.set(token, { user: challenge.user, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS, refreshUntil: Date.now() + REFRESH_TTL_MS }); return json(res, 200, { ok: true, user: challenge.user }, { "Set-Cookie": sessionCookie(token) }); }
        if (req.method === "POST" && url.pathname === "/auth/refresh") { const session = getSession(req); if (!session || session.refreshUntil <= Date.now()) return json(res, 401, { error: "Sessão não pode ser renovada." }); return json(res, 200, { ok: true, user: session.user }, { "Set-Cookie": sessionCookie(session.token) }); }
        if (req.method === "POST" && url.pathname === "/auth/logout") { const token = parseCookies(req).mestre_mobile_session; if (token) sessions.delete(token); return json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) }); }
        return json(res, 404, { error: "Rota de autenticação não encontrada." });
      }
      if (url.pathname.startsWith("/api/")) {
        if (!requireSession(req, res)) return;
        if (req.method === "GET" && url.pathname === "/api/session") return json(res, 200, { ok: true, user: getSession(req).user });
        if (req.method === "GET" && url.pathname === "/api/status") return proxyJson(res, "/status");
        if (req.method === "POST" && url.pathname === "/api/chat") return proxyStream(res, "/ollama/chat", await readBody(req));
        if (url.pathname === "/api/tools" && req.method === "GET") return proxyJson(res, "/api/tools");
        if (url.pathname.startsWith("/api/tools/") && req.method === "POST") {
          const body = await readBody(req); const name = url.pathname.slice("/api/tools/".length).split("/")[0];
          if (await toolRequiresConfirmation(name) && body.confirm !== true) return json(res, 409, { error: "Confirmação obrigatória para operação destrutiva.", tool: name });
          const { confirm: _confirm, ...toolArgs } = body;
          const target = url.pathname.slice("/api".length); return proxyJson(res, target, { method: "POST", body: JSON.stringify(toolArgs), headers: { "Content-Type": "application/json" } });
        }
        const passthrough = ["/api/models", "/api/profiles", "/api/skills", "/api/conversas", "/api/memorias", "/api/audit", "/api/config", "/api/sync"];
        if (passthrough.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) { const body = ["POST", "PUT", "DELETE"].includes(req.method) ? JSON.stringify(await readBody(req)) : undefined; return proxyJson(res, `${url.pathname}${url.search}`, { method: req.method, body, headers: body ? { "Content-Type": "application/json" } : {} }); }
        return json(res, 404, { error: "Rota mobile não encontrada." });
      }
      if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname.startsWith("/pwa/")) { const root = resolve(__dirname, "../pwa"); const relative = url.pathname === "/" || url.pathname === "/index.html" ? "index.html" : url.pathname.slice("/pwa/".length); const file = resolve(root, relative); if (!file.startsWith(root)) return json(res, 403, { error: "Caminho inválido." }); const content = await readFile(file); const type = relative.endsWith(".js") ? "text/javascript" : relative.endsWith(".css") ? "text/css" : relative.endsWith(".json") ? "application/json" : "text/html; charset=utf-8"; res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" }); return res.end(content); }
      return json(res, 404, { error: "Não encontrado." });
    } catch (error) { console.error(`[mobile-gateway] ${req.method} ${url.pathname}: ${error.message}`); return json(res, 400, { error: error.message }); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) createMobileGateway().listen(PORT, HOST, () => console.log(`Mestre Mobile Gateway em http://${HOST}:${PORT}`));

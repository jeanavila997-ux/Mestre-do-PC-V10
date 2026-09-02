#!/usr/bin/env node
// Mestre do PC V10 - Launcher Node.js (autônomo)
// Porta 7777. Executa PowerShell localmente com jobs, proxy Ollama com streaming
// e endpoint /status com métricas do sistema para o dashboard.
// V10.1: suporta operações parametrizadas via {id, params} e templates seguros.

import http from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, resolve, sep } from "node:path";
import { checkPromptInjection } from "../mcp-server/security.js";
import { auditLog, AuditLevel } from "../mcp-server/audit-logger.js";
import { handleApiRoute } from "./chat-integrado/api-routes.js";
import { loadOperationRegistry, clearOperationRegistryCache } from "./operation-registry.js";
import { handleMemoryRoutes } from "./memory-routes.js";
import { handleOperationRoutes } from "./operation-routes.js";
import { handleSoulRoutes } from "./soul-routes.js";
import { isAllowedWebOrigin, isNppOrigin } from "./security/origin-policy.js";
import { 
  createMemory, 
  listMemories, 
  getMemory, 
  updateMemory, 
  deleteMemory, 
  exportMemories, 
  importMemories,
  searchRelevantMemories,
  MemoryType 
} from "./memory-manager.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.MPC_PORT ? Number(process.env.MPC_PORT) : 7777;
const HOST = process.env.MPC_HOST || "127.0.0.1";
if (HOST !== "127.0.0.1") {
  throw new Error("MPC_HOST deve ser 127.0.0.1; o launcher não aceita exposição em rede.");
}
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const BASE_URL = `http://${HOST}:${PORT}`;
const PROJECT_DIR = join(__dirname, "..");
const EXTENSION_TOKEN = process.env.MESTRE_EXTENSION_TOKEN || "";
const EXTENSION_ORIGINS = (process.env.MESTRE_EXTENSION_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const NPP_TOKEN = process.env.MESTRE_NPP_TOKEN || "";
const MAX_CONCURRENT_JOBS = 3;
const JOB_TIMEOUT_MS = 15 * 60 * 1000;
const JOB_RETENTION_MS = 30 * 60 * 1000;
const MAX_CMD_LENGTH = 32768;

// ===== Modo Livre — execução de comandos fora da whitelist =====
// Opt-in e reversível: por padrão desligado. Quando ligado, /run-free aceita
// qualquer comando PowerShell (sem checar allowed-operations.json) e o chat
// pula o modal de confirmação. Cada execução é logada em nível SECURITY.
const MODO_LIVRE_CONFIG_FILE = join(__dirname, "..", "logs", "config", "modo-livre.json");
const MODO_LIVRE_TTL_MS = Math.min(
  Math.max(Number(process.env.MESTRE_MODO_LIVRE_TTL_MS || 5 * 60 * 1000), 1),
  30 * 60 * 1000,
);
let modoLivreEnabled = process.env.MESTRE_MODO_LIVRE === "1";
let modoLivreExpiresAt = modoLivreEnabled ? Date.now() + MODO_LIVRE_TTL_MS : 0;
try {
  if (existsSync(MODO_LIVRE_CONFIG_FILE)) {
    const saved = JSON.parse(readFileSync(MODO_LIVRE_CONFIG_FILE, "utf8"));
    if (typeof saved.enabled === "boolean") modoLivreEnabled = saved.enabled;
    if (saved.expiresAt) modoLivreExpiresAt = Date.parse(saved.expiresAt) || 0;
  }
} catch { /* usa o valor da env var / padrão (desligado) */ }

function isModoLivreActive() {
  if (!modoLivreEnabled) return false;
  if (modoLivreExpiresAt && Date.now() > modoLivreExpiresAt) {
    modoLivreEnabled = false;
    modoLivreExpiresAt = 0;
    return false;
  }
  return true;
}

async function setModoLivre(enabled) {
  modoLivreEnabled = !!enabled;
  modoLivreExpiresAt = modoLivreEnabled ? Date.now() + MODO_LIVRE_TTL_MS : 0;
  const expiresAt = modoLivreExpiresAt ? new Date(modoLivreExpiresAt).toISOString() : null;
  try {
    await mkdir(dirname(MODO_LIVRE_CONFIG_FILE), { recursive: true });
    await writeFile(MODO_LIVRE_CONFIG_FILE, JSON.stringify({ enabled: modoLivreEnabled, expiresAt, ttlMs: MODO_LIVRE_TTL_MS, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  } catch (e) {
    console.error(`[MODO-LIVRE] Falha ao persistir estado: ${e.message}`);
  }
  return { enabled: modoLivreEnabled, expiresAt, ttlMs: MODO_LIVRE_TTL_MS };
}

function isCriticalFreeCommand(cmd) {
  return /\b(Remove-Item|rm|rmdir|del|Format-Volume|Clear-Disk|Remove-Partition|Stop-Computer|Restart-Computer|shutdown|bcdedit|cipher)\b/i.test(cmd);
}

// Constrói environment limpo para spawn do PowerShell 5.1, removendo caminhos
// do PS 7 (MSIX) que poluem PSModulePath e quebram módulos como Microsoft.PowerShell.Security
function cleanPSEnv(extra = {}) {
  const psModulePath = [
    join(process.env.USERPROFILE || "", "OneDrive", "Documents", "WindowsPowerShell", "Modules"),
    process.env.ProgramFiles ? join(process.env.ProgramFiles, "WindowsPowerShell", "Modules") : "",
    process.env.SystemRoot ? join(process.env.SystemRoot, "system32", "WindowsPowerShell", "v1.0", "Modules") : "",
  ].filter(Boolean).join(";");
  return { ...process.env, PSModulePath: psModulePath, ...extra };
}

// O /ping reportava admin:false fixo, entao a interface mostrava "sem elevacao"
// mesmo com o launcher rodando como Administrador. `net session` só responde 0
// para conta elevada — é a checagem clássica no Windows. Roda uma vez no boot e
// fica em cache; o estado de elevação não muda durante a vida do processo.
let isElevated = false;
function detectarElevacao() {
  return new Promise((resolve) => {
    try {
      const p = spawn("net", ["session"], { windowsHide: true, stdio: "ignore" });
      p.on("close", (code) => resolve(code === 0));
      p.on("error", () => resolve(false));
    } catch { resolve(false); }
  });
}

let registry = await loadOperationRegistry(join(__dirname, "allowed-operations.json"));
let allowedOperations = registry.operations;
let allowedTemplates = registry.templates;
function applyRegistryRefs() {
  allowedOperations = registry.operations;
  allowedTemplates = registry.templates;
}
applyRegistryRefs();
// Recarrega a whitelist do disco após edições feitas pela UI de gestão
// (/gerenciar-comandos.html). Sem isto, o launcher manteria a cópia antiga em memória.
async function reloadRegistry() {
  clearOperationRegistryCache();
  registry = await loadOperationRegistry(join(__dirname, "allowed-operations.json"));
  applyRegistryRefs();
  return registry;
}

const jobs = new Map();

function cors(res, origin = BASE_URL) {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Mestre-Client, X-Mestre-Extension-Token, X-Mestre-Npp-Token");
  res.setHeader("Vary", "Origin");
}

function isExtensionOrigin(origin) {
  if (!origin) return false;
  return EXTENSION_ORIGINS.some((allowed) => allowed === origin || (allowed.endsWith("/*") && origin.startsWith(allowed.slice(0, -1))));
}

function isAuthorized(req) {
  const origin = req.headers.origin || "";
  const client = req.headers["x-mestre-client"] || "";
  
  // v10-web tem permissão total apenas quando vem do próprio launcher.
  if (client === "v10-web") {
    return isAllowedWebOrigin(origin, BASE_URL);
  }
  
  // MCP sem origin é permitido
  if (!origin && client === "mcp") return true;
  
  // Extensão requer token e origem na allowlist
  if (EXTENSION_TOKEN && client === "browser-extension" && req.headers["x-mestre-extension-token"] === EXTENSION_TOKEN) {
    return !origin || isExtensionOrigin(origin);
  }
  
  // Notepad++ requer token e origem local
  if (NPP_TOKEN && client === "notepad-plus-plus" && req.headers["x-mestre-npp-token"] === NPP_TOKEN) {
    return isNppOrigin(origin);
  }
  
  return false;
}

function getRunningJobCount() {
  return [...jobs.values()].filter((j) => j.state === "running").length;
}

function getAllowedOrigin(req) {
  const origin = req.headers.origin || "";
  if (isAllowedWebOrigin(origin, BASE_URL)) return origin || BASE_URL;
  if (isExtensionOrigin(origin)) return origin;
  if (isNppOrigin(origin)) return origin || BASE_URL;
  return BASE_URL;
}

function sendJson(res, status, data, allowOrigin = BASE_URL) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Mestre-Client, X-Mestre-Extension-Token, X-Mestre-Npp-Token",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (c) => {
      buf += c;
      if (Buffer.byteLength(buf, "utf8") > maxBytes) {
        reject(new Error("Corpo da requisição excede o limite permitido."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(buf || "{}")); }
      catch { reject(new Error("JSON inválido.")); }
    });
    req.on("error", reject);
  });
}

// Resolve uma requisição de execução para um comando final seguro.
// Delega ao OperationRegistry, que é a fonte única de verdade.
function resolveCommand(body) {
  return registry.resolve(body, { maxCmdLength: MAX_CMD_LENGTH });
}

// Guard do chat: roda a heurística de prompt injection sobre a última mensagem
// do usuário. Só bloqueia em "malicioso"; "suspeito" passa e é apenas logado.
function guardChatInjection(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const lastUser = [...messages].reverse().find((m) => m?.role === "user");
  if (!lastUser || typeof lastUser.content !== "string") return null;
  const verdict = checkPromptInjection(lastUser.content);
  if (verdict.classification === "malicioso") {
    console.warn(`[guard] Chat bloqueado por prompt injection (score ${verdict.score.toFixed(2)}).`);
    return {
      error: "Mensagem bloqueada: padrão de prompt injection detectado.",
      classification: verdict.classification,
      score: verdict.score,
      details: verdict.details,
    };
  }
  if (verdict.classification === "suspeito") {
    console.warn(`[guard] Chat suspeito (score ${verdict.score.toFixed(2)}).`);
  }
  return null;
}

// Classifica um comando contra a whitelist sem executar. Base do /classify.
function classifyCommand(body) {
  const resolved = resolveCommand(body);
  if (resolved.error) {
    return { allowed: false, destructive: false, reason: resolved.error };
  }
  const meta = registry.getById(resolved.id) || {};
  return {
    allowed: true,
    destructive: !!resolved.destructive,
    id: resolved.id || "",
    title: meta.title || "",
    category: meta.category || "",
    cmd: resolved.cmd,
  };
}

// Executa PowerShell e devolve o id do job. Output é acumulado em job.output (ao vivo).
function runPowerShell(cmd, meta = {}) {
  const id = randomUUID();
  const job = {
    id,
    state: "running",
    output: "",
    exitCode: null,
    success: null,
    startedAt: Date.now(),
    operationId: meta.id || null,
    destructive: meta.destructive || false,
  };
  jobs.set(id, job);
  const ps = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd], {
    windowsHide: true,
    env: cleanPSEnv({ MESTRE_PROJETO_PATH: PROJECT_DIR }),
  });
  // Referência usada por /shutdown para interromper comandos em andamento.
  job.child = ps;
  const timeout = setTimeout(() => {
    if (job.state === "running") {
      ps.kill();
      job.state = "timed_out";
      job.exitCode = -1;
      job.success = false;
      job.output += "\n[ERRO] Timeout após 15 minutos.";
      job.completedAt = Date.now();
    }
  }, JOB_TIMEOUT_MS);
  timeout.unref();
  ps.stdout.on("data", (d) => (job.output += d.toString()));
  ps.stderr.on("data", (d) => (job.output += d.toString()));
  ps.on("close", (code) => {
    clearTimeout(timeout);
    if (job.state === "timed_out") return;
    job.state = "completed";
    job.exitCode = code;
    job.success = code === 0;
    job.completedAt = Date.now();
  });
  ps.on("error", (e) => {
    clearTimeout(timeout);
    job.state = "completed";
    job.success = false;
    job.output += `\n[ERRO] ${e.message}`;
    job.completedAt = Date.now();
  });
  return id;
}

// Proxy Ollama com streaming (NDJSON passado direto para o cliente).
async function proxyOllamaStream(path, req, res, allowOrigin = BASE_URL, maxBodyBytes = 2 * 1024 * 1024, guard = null) {
  const body = await readBody(req, maxBodyBytes);
  if (guard) {
    const blocked = guard(body);
    if (blocked) return sendJson(res, 400, blocked, allowOrigin);
  }
  let upstream;
  try {
    upstream = await fetch(OLLAMA_URL + path, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      body: req.method === "POST" ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return sendJson(res, 502, { error: "Ollama offline: " + e.message }, allowOrigin);
  }
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return sendJson(res, upstream.status || 502, { error: text || "Ollama error" }, allowOrigin);
  }
  res.writeHead(upstream.status, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Access-Control-Allow-Origin": allowOrigin,
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } catch (e) {
    // cliente desconectou ou erro de stream — ignora silenciosamente
  } finally {
    res.end();
  }
}

// Proxy Ollama simples (JSON único, ex: /api/tags).
async function proxyOllamaJson(path, res, allowOrigin = BASE_URL) {
  let upstream;
  try {
    upstream = await fetch(OLLAMA_URL + path, { signal: AbortSignal.timeout(5000) });
  } catch (e) {
    return sendJson(res, 502, { error: "Ollama offline", models: [] }, allowOrigin);
  }
  const text = await upstream.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { output: text }; }
  sendJson(res, upstream.status, data, allowOrigin);
}

// ===== Notepad++ integration helpers =====
const NPP_ALLOWED_ACTIONS = new Set(["explain_code", "ask_ai", "suggest_cmd", "quick_diag", "search_web"]);

function isNppAuthorized(req) {
  const client = req.headers["x-mestre-client"] || "";
  const token = req.headers["x-mestre-npp-token"] || "";
  return NPP_TOKEN && client === "notepad-plus-plus" && token === NPP_TOKEN;
}

async function callOllamaChat(messages, allowOrigin = BASE_URL) {
  const model = process.env.OLLAMA_MODEL || "qwen2.5-coder:3b-instruct";
  const upstream = await fetch(OLLAMA_URL + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false, keep_alive: "10m" }),
    signal: AbortSignal.timeout(60000),
  });
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    throw new Error("Ollama error HTTP " + upstream.status + ": " + text);
  }
  const data = await upstream.json();
  return data.message?.content || "";
}

async function runAllowedOperation(operationId, params = {}) {
  const op = registry.getById(operationId);
  if (!op) throw new Error("Operação não encontrada: " + operationId);
  const resolved = resolveCommand({ id: operationId, params });
  if (resolved.error) throw new Error(resolved.error);
  const id = runPowerShell(resolved.cmd, { id: operationId, destructive: !!op.destructive });
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const job = jobs.get(id);
      if (!job) return;
      if (job.state === "completed") {
        clearInterval(timer);
        resolve(job.output || "");
      }
    }, 250);
    setTimeout(() => { clearInterval(timer); reject(new Error("Timeout ao aguardar operação")); }, 60000);
  });
}

async function searchWebDuckDuckGo(query, maxResults = 5) {
  const limit = Math.min(Math.max(1, Math.floor(Number(maxResults) || 5)), 10);
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=br-pt`;
  const res = await fetch(searchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("DuckDuckGo retornou HTTP " + res.status);
  const html = await res.text();
  if (html.includes("anomaly.js") || html.includes("challenge-form")) {
    throw new Error("DuckDuckGo bloqueou a requisição (anti-bot).");
  }
  const results = [];
  const blocks = html.split(/<div class="result[^"]*">/i).slice(1);
  for (const block of blocks.slice(0, limit)) {
    const titleMatch = block.match(/<a[^\u003e]*class="result__a"[^\u003e]*href="([^"]+)"[^\u003e]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = block.match(/<a[^\u003e]*class="result__snippet"[^\u003e]*>([\s\S]*?)<\/a>/i);
    if (titleMatch) {
      let url = titleMatch[1];
      const uddg = url.match(/[?&]uddg=([^\u0026]+)/i);
      if (uddg) try { url = decodeURIComponent(uddg[1]); } catch {}
      results.push({
        title: stripTags(titleMatch[2]).trim(),
        url: url.trim(),
        snippet: snippetMatch ? stripTags(snippetMatch[1]).trim() : "",
      });
    }
  }
  return results;
}

function stripTags(html) {
  return html
    .replace(/<script\b[^\u003c]*(?:(?!<\/script>)<[^\u003c]*)*<\/script>/gi, "")
    .replace(/<style\b[^\u003c]*(?:(?!<\/style>)<[^\u003c]*)*<\/style>/gi, "")
    .replace(/<[^\u003e]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function handleNppAction(action, payload) {
  const text = (payload.text || "").slice(0, 8000);
  const language = (payload.language || "").slice(0, 64);
  switch (action) {
    case "explain_code": {
      const system = "Você é um assistente técnico. Explique o código ou texto fornecido de forma clara e objetiva em português.";
      const user = language ? `[${language}]\n${text}` : text;
      return await callOllamaChat([{ role: "system", content: system }, { role: "user", content: user }]);
    }
    case "ask_ai": {
      const question = (payload.question || "Responda sobre o texto/código fornecido.").slice(0, 2000);
      return await callOllamaChat([
        { role: "system", content: "Você é um assistente técnico. Responda em português com base no contexto fornecido." },
        { role: "user", content: `Contexto:\n${text}\n\nPergunta: ${question}` },
      ]);
    }
    case "suggest_cmd": {
      const prompt = `Dado o seguinte problema/descrição, sugira um comando do Mestre do PC (PowerShell/Windows) que ajudaria a resolver. Responda apenas com o comando e uma breve explicação em português.\n\n${text}`;
      return await callOllamaChat([{ role: "user", content: prompt }]);
    }
    case "quick_diag": {
      return await runAllowedOperation("relatorio_rapido_do_pc");
    }
    case "search_web": {
      const query = (payload.query || text || "").slice(0, 256);
      if (!query) throw new Error("Query vazia para busca na web.");
      const results = await searchWebDuckDuckGo(query, payload.max_results);
      if (!results.length) return "Nenhum resultado encontrado.";
      return results.map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`).join("\n\n");
    }
    default:
      throw new Error("Ação não suportada: " + action);
  }
}

// Métricas do sistema via PowerShell (para o dashboard V10).
function getSystemStatus(res) {
  const ps = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `
$os = Get-WmiObject Win32_OperatingSystem
$ramFree = [math]::Round($os.FreePhysicalMemory/1MB, 2)
$ramTotal = [math]::Round($os.TotalVisibleMemorySize/1MB, 2)
$cpu = (Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$disk = Get-PSDrive C
$diskFree = [math]::Round($disk.Free/1GB, 2)
$diskUsed = [math]::Round($disk.Used/1GB, 2)
$boot = [Management.ManagementDateTimeConverter]::ToDateTime($os.LastBootUpTime)
$uptime = [int]((Get-Date) - $boot).TotalSeconds
@{cpu=[math]::Round($cpu,1);ramFree=$ramFree;ramTotal=$ramTotal;diskFree=$diskFree;diskUsed=$diskUsed;uptimeSec=$uptime} | ConvertTo-Json -Compress
`], { windowsHide: true, env: cleanPSEnv() });
  let out = "";
  ps.stdout.on("data", (d) => (out += d.toString()));
  ps.stderr.on("data", (d) => (out += d.toString()));
  ps.on("close", () => {
    try { sendJson(res, 200, JSON.parse(out.trim())); }
    catch { sendJson(res, 200, { cpu: 0, ramFree: 0, ramTotal: 0, diskFree: 0, diskUsed: 0, uptimeSec: 0 }); }
  });
  ps.on("error", () => sendJson(res, 500, { error: "Falha ao obter métricas" }));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  const path = url.pathname;
  const allowedOrigin = getAllowedOrigin(req);
  if (req.method === "OPTIONS") {
    if (allowedOrigin === BASE_URL && req.headers.origin !== BASE_URL) {
      return sendJson(res, 403, { error: "Origem não autorizada." }, BASE_URL);
    }
    cors(res, allowedOrigin);
    res.writeHead(204);
    return res.end();
  }

  try {
    // ── Chat Integrado: rotas /api/* ───────────────────────────────
    if (path.startsWith("/api/")) {
      const handled = await handleApiRoute(req, res, url, { isAuthorized, allowedOrigin });
      if (handled) return;
    }

    // ── Gestão de Memórias: rotas /memories/* ───────────────────────
    if (path.startsWith("/memories/")) {
      const handled = await handleMemoryRoutes(req, res, url, { isAuthorized, allowedOrigin });
      if (handled) return;
    }

    // ── Gestão de Operações/Comandos: rotas /operations* ────────────
    if (path === "/operations" || path.startsWith("/operations/")) {
      const handled = await handleOperationRoutes(req, res, url, { isAuthorized, allowedOrigin, reloadRegistry });
      if (handled) return;
    }

    // ── Perfil do Agente: leitura/edição dos Soul.md ────────────────
    if (path === "/soul" || path.startsWith("/soul/")) {
      const handled = await handleSoulRoutes(req, res, url, { isAuthorized, allowedOrigin });
      if (handled) return;
    }

    if (path === "/ping") {
      return sendJson(res, 200, {
        status: "ok",
        admin: isElevated,
        state: getRunningJobCount() > 0 ? "busy" : "idle",
        activeJobs: getRunningJobCount(),
        version: "10.1.0",
        pid: process.pid,
      }, allowedOrigin);
    }

    if (path === "/mcp-status") {
      return sendJson(res, 200, {
        status: "unknown",
        version: "10.1.0",
        modelProfile: process.env.OLLAMA_MODEL_PROFILE || "balanced",
        model: process.env.OLLAMA_MODEL || "qwen2.5-coder:3b-instruct",
      }, allowedOrigin);
    }

    if (path === "/status") {
      return getSystemStatus(res);
    }

    if (path === "/run" && req.method === "POST") {
      if (!isAuthorized(req)) return sendJson(res, 403, { success: false, output: "Cliente não autorizado.", state: "forbidden" }, allowedOrigin);
      if (getRunningJobCount() >= MAX_CONCURRENT_JOBS) {
        return sendJson(res, 429, { success: false, output: "Limite de comandos simultâneos atingido.", state: "busy" }, allowedOrigin);
      }
      const body = await readBody(req);
      const resolved = resolveCommand(body);
      if (resolved.error) {
        return sendJson(res, 403, { success: false, output: resolved.error }, allowedOrigin);
      }
      const id = runPowerShell(resolved.cmd, { id: resolved.id, destructive: resolved.destructive });
      return sendJson(res, 202, {
        success: true,
        accepted: true,
        jobId: id,
        state: "running",
        activeJobs: getRunningJobCount(),
        operationId: resolved.id,
      }, allowedOrigin);
    }

    // Resolve o comando contra a whitelist SEM executar. A UI usa os metadados
    // para exibir uma confirmação explícita antes de qualquer execução sugerida pela IA.
    if (path === "/classify" && req.method === "POST") {
      if (!isAuthorized(req)) return sendJson(res, 403, { allowed: false, reason: "Cliente não autorizado." }, allowedOrigin);
      const body = await readBody(req, 64 * 1024);
      return sendJson(res, 200, classifyCommand(body), allowedOrigin);
    }

    // Estado do Modo Livre (ligado/desligado). GET consulta, POST alterna.
    if (path === "/modo-livre" && req.method === "GET") {
      if (!isAuthorized(req)) return sendJson(res, 403, { enabled: false, reason: "Cliente não autorizado." }, allowedOrigin);
      return sendJson(res, 200, { enabled: isModoLivreActive(), expiresAt: modoLivreExpiresAt ? new Date(modoLivreExpiresAt).toISOString() : null }, allowedOrigin);
    }
    if (path === "/modo-livre" && req.method === "POST") {
      if (!isAuthorized(req)) return sendJson(res, 403, { success: false, reason: "Cliente não autorizado." }, allowedOrigin);
      const body = await readBody(req, 1024);
      const state = await setModoLivre(body.enabled);
      await auditLog(AuditLevel.SECURITY, "modo_livre_toggle", state, req.headers["x-mestre-client"] || "unknown");
      return sendJson(res, 200, { success: true, ...state }, allowedOrigin);
    }

    // Modo Livre: executa QUALQUER comando PowerShell, sem checar a whitelist
    // de allowed-operations.json. Só responde se o Modo Livre estiver ligado
    // (ver /modo-livre) — desligado por padrão. Toda chamada é auditada em
    // nível SECURITY com o comando literal, já que a whitelist deixa de ser
    // a rede de segurança aqui.
    if (path === "/run-free" && req.method === "POST") {
      if (!isAuthorized(req)) return sendJson(res, 403, { success: false, output: "Cliente não autorizado.", state: "forbidden" }, allowedOrigin);
      if (!isModoLivreActive()) {
        return sendJson(res, 403, { success: false, output: "Modo Livre está desligado ou expirou. Ative em /modo-livre antes de executar comandos fora da whitelist.", state: "forbidden" }, allowedOrigin);
      }
      if (getRunningJobCount() >= MAX_CONCURRENT_JOBS) {
        return sendJson(res, 429, { success: false, output: "Limite de comandos simultâneos atingido.", state: "busy" }, allowedOrigin);
      }
      const body = await readBody(req);
      const cmd = typeof body.cmd === "string" ? body.cmd : "";
      if (!cmd || cmd.length > MAX_CMD_LENGTH) {
        return sendJson(res, 400, { success: false, output: "Comando ausente ou excede o limite de tamanho." }, allowedOrigin);
      }
      if (isCriticalFreeCommand(cmd)) {
        await auditLog(AuditLevel.SECURITY, "run_free_blocked_critical", { cmd }, req.headers["x-mestre-client"] || "unknown");
        return sendJson(res, 400, { success: false, output: "Comando bloqueado: operação crítica demais para o Modo Livre. Cadastre uma operação na whitelist com confirmação explícita.", state: "blocked" }, allowedOrigin);
      }
      await auditLog(AuditLevel.SECURITY, "run_free_command", { cmd, expiresAt: modoLivreExpiresAt ? new Date(modoLivreExpiresAt).toISOString() : null }, req.headers["x-mestre-client"] || "unknown");
      const id = runPowerShell(cmd, { id: "livre", destructive: true });
      return sendJson(res, 202, {
        success: true,
        accepted: true,
        jobId: id,
        state: "running",
        activeJobs: getRunningJobCount(),
        operationId: "livre",
      }, allowedOrigin);
    }

    if (path === "/run-status") {
      if (!isAuthorized(req)) return sendJson(res, 403, { success: false, output: "Cliente não autorizado.", state: "forbidden" }, allowedOrigin);
      const id = url.searchParams.get("id");
      const job = jobs.get(id);
      if (!job) return sendJson(res, 404, { success: false, output: "Job not found", state: "not_found" }, allowedOrigin);
      return sendJson(res, 200, {
        jobId: job.id,
        state: job.state,
        success: job.state === "completed" ? job.success : null,
        running: job.state === "running",
        done: job.state !== "running",
        exitCode: job.exitCode,
        output: job.output || "",
        activeJobs: getRunningJobCount(),
        operationId: job.operationId,
      }, allowedOrigin);
    }

    // Encerra o próprio launcher. Usa a mesma autorização do /run (origem + header
    // X-Mestre-Client), então só a UI local, o MCP ou a extensão autenticada podem
    // chamar. Responde antes de sair para o cliente receber a confirmação.
    if (path === "/shutdown" && req.method === "POST") {
      if (!isAuthorized(req)) return sendJson(res, 403, { success: false, output: "Cliente não autorizado." }, allowedOrigin);
      const ativos = getRunningJobCount();
      sendJson(res, 200, {
        success: true,
        output: ativos > 0
          ? `Launcher encerrando. ${ativos} comando(s) em execução serão interrompidos.`
          : "Launcher encerrando.",
        activeJobs: ativos,
        pid: process.pid,
      }, allowedOrigin);
      res.on("finish", () => {
        console.log(`Encerrando launcher por solicitação da interface (jobs ativos: ${ativos}).`);
        for (const job of jobs.values()) {
          if (job.state === "running" && job.child) {
            try { job.child.kill(); } catch { /* processo já saiu */ }
          }
        }
        server.close(() => process.exit(0));
        // Rede de segurança: se alguma conexão keep-alive travar o close.
        setTimeout(() => process.exit(0), 1500).unref();
      });
      return;
    }

    if (path === "/open-terminal" && req.method === "POST") {
      if (!isAuthorized(req)) return sendJson(res, 403, { success: false, output: "Cliente não autorizado." }, allowedOrigin);
      spawn("powershell.exe", ["-NoLogo", "-NoExit", "-Command", "Set-Location '" + __dirname.replace(/'/g, "''") + "'"], { windowsHide: false, detached: true, stdio: "ignore" }).unref();
      return sendJson(res, 200, { success: true, output: "Terminal aberto." }, allowedOrigin);
    }

    // Notepad++ integration endpoint
    if (path === "/npp" && req.method === "POST") {
      if (!NPP_TOKEN) return sendJson(res, 501, { success: false, error: "Integração Notepad++ não configurada. Defina MESTRE_NPP_TOKEN." }, allowedOrigin);
      if (!isNppAuthorized(req)) return sendJson(res, 403, { success: false, error: "Cliente não autorizado." }, allowedOrigin);
      const body = await readBody(req, 64 * 1024);
      const action = (body.action || "").toString();
      if (!NPP_ALLOWED_ACTIONS.has(action)) {
        return sendJson(res, 400, { success: false, error: "Ação não permitida." }, allowedOrigin);
      }
      try {
        const output = await handleNppAction(action, body.payload || {});
        return sendJson(res, 200, { success: true, action, output }, allowedOrigin);
      } catch (e) {
        return sendJson(res, 500, { success: false, error: e.message }, allowedOrigin);
      }
    }

    // Proxy Ollama
    if (path === "/ollama/tags") return proxyOllamaJson("/api/tags", res, allowedOrigin);
    if (path === "/ollama/chat" && req.method === "POST") {
      if (!isAuthorized(req)) return sendJson(res, 403, { error: "Cliente não autorizado." }, allowedOrigin);
      return proxyOllamaStream("/api/chat", req, res, allowedOrigin, 16 * 1024 * 1024, guardChatInjection);
    }
    if (path === "/ollama/pull" && req.method === "POST") {
      if (!isAuthorized(req)) return sendJson(res, 403, { error: "Cliente não autorizado." }, allowedOrigin);
      return proxyOllamaStream("/api/pull", req, res, allowedOrigin);
    }

    // Servir frontend estático
    if (path === "/" || path === "/index.html") {
      try {
        const html = await readFile(join(__dirname, "index.html"), "utf8");
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "Cache-Control": "no-store",
        });
        return res.end(html);
      } catch { return sendJson(res, 404, { error: "index.html não encontrado" }); }
    }
    if (path === "/favicon.png" || path === "/logo-mestre-v7-transparent.png") {
      try {
        const buf = await readFile(join(__dirname, "..", path.slice(1)));
        res.writeHead(200, {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=604800, immutable",
        });
        return res.end(buf);
      } catch { return sendJson(res, 404, { error: "recurso não encontrado" }); }
    }

    // ===== CORREÇÃO V10.1.1: Servir rede-dashboard.js como JavaScript =====
    if (path === "/rede-dashboard.js") {
      try {
        const js = await readFile(join(__dirname, "rede-dashboard.js"), "utf8");
        res.writeHead(200, {
          "Content-Type": "text/javascript; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        return res.end(js);
      } catch { return sendJson(res, 404, { error: "rede-dashboard.js não encontrado" }); }
    }

    // ===== NOVO V11.2: Páginas .html estáticas do diretório v10 (ex: /novidades-v11.html) =====
    // Regex restringe a um único nome de arquivo seguro (sem path traversal).
    if (req.method === "GET" && /^\/[a-z0-9-]+\.html$/i.test(path)) {
      try {
        const html = await readFile(join(__dirname, path.slice(1)), "utf8");
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "Cache-Control": "no-store",
        });
        return res.end(html);
      } catch { return sendJson(res, 404, { error: "página não encontrada" }); }
    }

    // ===== NOVO: Servir recursos estáticos do módulo de chat (/chat/*) =====
    if (req.method === "GET" && path.startsWith("/chat/")) {
      const relative = path.slice("/chat/".length);
      // Bloqueia path traversal (..) e caracteres perigosos.
      if (!relative || /\.{2,}|[\\<>|:"*?]|^\//.test(relative)) {
        return sendJson(res, 403, { error: "Caminho não permitido." });
      }
      const chatRoot = resolve(__dirname, "chat");
      const filePath = resolve(chatRoot, relative);
      if (!filePath.startsWith(chatRoot + sep)) {
        return sendJson(res, 403, { error: "Caminho não permitido." });
      }
      const ext = extname(filePath).toLowerCase();
      const mimeTypes = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".md": "text/markdown; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
      };
      const contentType = mimeTypes[ext];
      if (!contentType) {
        return sendJson(res, 403, { error: "Extensão não permitida." });
      }
      try {
        const content = await readFile(filePath);
        const headers = {
          "Content-Type": contentType,
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        };
        if (ext === ".js" || ext === ".css" || ext === ".html") {
          headers["Cache-Control"] = "no-store";
        } else {
          headers["Cache-Control"] = "public, max-age=604800, immutable";
        }
        if (ext === ".html") {
          headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
        }
        res.writeHead(200, headers);
        return res.end(content);
      } catch { return sendJson(res, 404, { error: "recurso do chat não encontrado" }); }
    }

    // ===== Servir recursos estáticos do chat-integrado (/chat-integrado/*) =====
    if (req.method === "GET" && path.startsWith("/chat-integrado/")) {
      const relative = path.slice("/chat-integrado/".length);
      if (!relative || /\.{2,}|[\\<>|:"*?]|^\//.test(relative)) {
        return sendJson(res, 403, { error: "Caminho não permitido." });
      }
      const ciRoot = resolve(__dirname, "chat-integrado");
      const filePath = resolve(ciRoot, relative);
      if (!filePath.startsWith(ciRoot + sep)) {
        return sendJson(res, 403, { error: "Caminho não permitido." });
      }
      const ext = extname(filePath).toLowerCase();
      const mimeTypes = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".svg": "image/svg+xml",
      };
      const contentType = mimeTypes[ext];
      if (!contentType) {
        return sendJson(res, 403, { error: "Extensão não permitida." });
      }
      try {
        const content = await readFile(filePath);
        const headers = {
          "Content-Type": contentType,
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "Cache-Control": "no-store",
        };
        if (ext === ".html") {
          headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
        }
        res.writeHead(200, headers);
        return res.end(content);
      } catch { return sendJson(res, 404, { error: "recurso do chat-integrado não encontrado" }); }
    }

    // ===== NOVO V11.2: SPA fallback — rotas de seção (ex: /8.diagnostico) servem index.html =====
    // Rotas de API acima já retornaram; qualquer GET sem extensão de arquivo é rota de seção.
    if (req.method === "GET" && !path.includes(".")) {
      try {
        const html = await readFile(join(__dirname, "index.html"), "utf8");
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "Cache-Control": "no-store",
        });
        return res.end(html);
      } catch { return sendJson(res, 404, { error: "index.html não encontrado" }); }
    }

    sendJson(res, 404, { success: false, output: "Rota não encontrada." });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
});

server.listen(PORT, HOST, async () => {
  console.log(`Mestre do PC V10 - Launcher ativo em http://${HOST}:${PORT}`);
  console.log(`Operações cadastradas: ${allowedOperations.length}; templates: ${allowedTemplates.length}`);
  isElevated = await detectarElevacao();
  console.log(`Elevação: ${isElevated ? "Administrador" : "usuário comum (comandos administrativos vão falhar)"}`);
  console.log(`Ollama proxy -> ${OLLAMA_URL}`);
  console.log(`Extensão do navegador: ${EXTENSION_TOKEN ? "habilitada" : "desabilitada (defina MESTRE_EXTENSION_TOKEN)"}`);
  console.log(`Notepad++: ${NPP_TOKEN ? "habilitado" : "desabilitado (defina MESTRE_NPP_TOKEN)"}`);
  console.log(`Dashboard /status | Streaming /ollama/chat | Notepad++ /npp`);
});

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.completedAt && now - job.completedAt >= JOB_RETENTION_MS) jobs.delete(id);
  }
}, 60_000);
cleanupTimer.unref();

#!/usr/bin/env node
// Mestre do PC V10 - Launcher Node.js (autônomo)
// Porta 7777. Executa PowerShell localmente com jobs, proxy Ollama com streaming
// e endpoint /status com métricas do sistema para o dashboard.
// V10.1: suporta operações parametrizadas via {id, params} e templates seguros.

import http from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.MPC_PORT ? Number(process.env.MPC_PORT) : 7777;
const HOST = process.env.MPC_HOST || "127.0.0.1";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const BASE_URL = `http://${HOST}:${PORT}`;
const PROJECT_DIR = join(__dirname, "..");
const EXTENSION_TOKEN = process.env.MESTRE_EXTENSION_TOKEN || "";
const EXTENSION_ORIGINS = (process.env.MESTRE_EXTENSION_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_CONCURRENT_JOBS = 3;
const JOB_TIMEOUT_MS = 15 * 60 * 1000;
const JOB_RETENTION_MS = 30 * 60 * 1000;
const MAX_CMD_LENGTH = 32768;

const operationsFile = join(__dirname, "allowed-operations.json");
const rawCatalog = JSON.parse(await readFile(operationsFile, "utf8"));

const allowedOperations = Array.isArray(rawCatalog) ? rawCatalog : rawCatalog.operations || [];
const allowedTemplates = (!Array.isArray(rawCatalog) && rawCatalog.templates) ? rawCatalog.templates : [];

const operationsById = new Map(allowedOperations.map((op) => [op.id, op]));
const exactCommands = new Set(allowedOperations.map((op) => op.command));

// Compila templates parametrizados em regex seguras.
// Cada placeholder {{NOME}} é substituído por um grupo nomeado com a regex permitida.
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const compiledTemplates = allowedTemplates.filter((tpl) => typeof tpl.pattern === "string").map((tpl) => {
  const placeholderRe = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g;
  const paramNames = [...tpl.pattern.matchAll(placeholderRe)].map((m) => m[1].toLowerCase());
  let regexSource = escapeRegex(tpl.pattern);
  for (const name of [...new Set(paramNames)]) {
    const paramRegex = tpl.params?.[name] || "^[a-zA-Z0-9_. -]{1,128}$";
    // Usa grupos nomeados para validar e extrair valores.
    regexSource = regexSource.replace(
      new RegExp(escapeRegex(`{{${name.toUpperCase()}}}`), "g"),
      `(?<${name}>${paramRegex})`,
    );
  }
  return {
    id: tpl.id,
    title: tpl.title,
    pattern: tpl.pattern,
    params: tpl.params || {},
    destructive: !!tpl.destructive,
    regex: new RegExp(`^${regexSource}$`, "s"),
  };
});

const jobs = new Map();

function cors(res, origin = BASE_URL) {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Mestre-Client, X-Mestre-Extension-Token");
  res.setHeader("Vary", "Origin");
}

function isExtensionOrigin(origin) {
  if (!origin) return false;
  return EXTENSION_ORIGINS.some((allowed) => allowed === origin || (allowed.endsWith("/*") && origin.startsWith(allowed.slice(0, -1))));
}

function isAuthorized(req) {
  const origin = req.headers.origin || "";
  const client = req.headers["x-mestre-client"] || "";
  if (origin === BASE_URL && client === "v10-web") return true;
  if (!origin && client === "mcp") return true;
  if (EXTENSION_TOKEN && client === "browser-extension" && req.headers["x-mestre-extension-token"] === EXTENSION_TOKEN) {
    // Origem da extensão deve estar na allowlist ou requisição sem origin (ex: service worker).
    return !origin || isExtensionOrigin(origin);
  }
  return false;
}

function getRunningJobCount() {
  return [...jobs.values()].filter((j) => j.state === "running").length;
}

function getAllowedOrigin(req) {
  const origin = req.headers.origin || "";
  if (origin === BASE_URL) return BASE_URL;
  if (isExtensionOrigin(origin)) return origin;
  return BASE_URL;
}

function sendJson(res, status, data, allowOrigin = BASE_URL) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Mestre-Client, X-Mestre-Extension-Token",
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

// Valida um valor de parâmetro contra a regex permitida.
function validateParam(name, value, regexSource) {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > 1024) return null;
  const re = new RegExp(`^(?:${regexSource})$`);
  return re.test(value) ? value : null;
}

// Resolve uma requisição de execução para um comando final seguro.
// Aceita {id, params?} ou {cmd}.
function resolveCommand(body) {
  if (!body || typeof body !== "object") return { error: "Corpo inválido." };

  // Modo novo: id + params
  if (body.id && typeof body.id === "string") {
    const op = operationsById.get(body.id);
    const tpl = allowedTemplates.find((t) => t.id === body.id);
    if (!op && !tpl) return { error: `Operação '${body.id}' não encontrada.` };

    if (op) {
      return { cmd: op.command, destructive: !!op.destructive, id: op.id };
    }

    let finalCmd = tpl.pattern;
    const params = body.params || {};
    for (const [key, regexSource] of Object.entries(tpl.params || {})) {
      const val = params[key];
      const sanitized = validateParam(key, val, regexSource);
      if (sanitized == null) {
        return { error: `Parâmetro inválido para '${key}'.` };
      }
      finalCmd = finalCmd.replace(new RegExp(`\\{\\{${key.toUpperCase()}\\}\\}`, "g"), sanitized);
    }
    return { cmd: finalCmd, destructive: !!tpl.destructive, id: tpl.id };
  }

  // Modo legado: cmd exato ou template compilado
  if (body.cmd && typeof body.cmd === "string") {
    const cmd = body.cmd;
    if (cmd.length > MAX_CMD_LENGTH) return { error: "Comando excede o limite de tamanho." };
    if (exactCommands.has(cmd)) {
      const op = allowedOperations.find((o) => o.command === cmd);
      return { cmd, destructive: !!op?.destructive, id: op?.id };
    }
    for (const compiled of compiledTemplates) {
      const match = compiled.regex.test(cmd);
      if (match) {
        return { cmd, destructive: compiled.destructive, id: compiled.id };
      }
    }
    return { error: "Operação bloqueada: somente comandos cadastrados na V10 podem ser executados." };
  }

  return { error: "Comando ausente ou inválido." };
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
    env: { ...process.env, MESTRE_PROJETO_PATH: PROJECT_DIR },
  });
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
async function proxyOllamaStream(path, req, res, allowOrigin = BASE_URL) {
  const body = await readBody(req);
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
`], { windowsHide: true });
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
    if (path === "/ping") {
      return sendJson(res, 200, {
        status: "ok",
        admin: false,
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

    if (path === "/run-status") {
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

    if (path === "/open-terminal" && req.method === "POST") {
      if (!isAuthorized(req)) return sendJson(res, 403, { success: false, output: "Cliente não autorizado." }, allowedOrigin);
      spawn("powershell.exe", ["-NoLogo", "-NoExit", "-Command", "Set-Location '" + __dirname.replace(/'/g, "''") + "'"], { windowsHide: false, detached: true, stdio: "ignore" }).unref();
      return sendJson(res, 200, { success: true, output: "Terminal aberto." }, allowedOrigin);
    }

    // Proxy Ollama
    if (path === "/ollama/tags") return proxyOllamaJson("/api/tags", res, allowedOrigin);
    if (path === "/ollama/chat" && req.method === "POST") {
      if (!isAuthorized(req)) return sendJson(res, 403, { error: "Cliente não autorizado." }, allowedOrigin);
      return proxyOllamaStream("/api/chat", req, res, allowedOrigin);
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

    sendJson(res, 404, { success: false, output: "Rota não encontrada." });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Mestre do PC V10 - Launcher ativo em http://${HOST}:${PORT}`);
  console.log(`Operações cadastradas: ${allowedOperations.length}; templates: ${allowedTemplates.length}`);
  console.log(`Ollama proxy -> ${OLLAMA_URL}`);
  console.log(`Extensão do navegador: ${EXTENSION_TOKEN ? "habilitada" : "desabilitada (defina MESTRE_EXTENSION_TOKEN)"}`);
  console.log(`Dashboard /status | Streaming /ollama/chat`);
});

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.completedAt && now - job.completedAt >= JOB_RETENTION_MS) jobs.delete(id);
  }
}, 60_000);
cleanupTimer.unref();

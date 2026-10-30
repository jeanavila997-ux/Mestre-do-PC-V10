import { readFileSync as __rf } from "node:fs";
function readLocal9RouterKey() { try { const p = new URL("../data/providers.json", import.meta.url); return JSON.parse(__rf(p, "utf8")).providers?.["9router"]?.apiKey || ""; } catch { return ""; } }
/**
 * grokbot-bridge.js — Integração Oficial Grok Bot <-> Mestre do PC V11 (MCP + Plugin + 9Router)
 *
 * Recursos:
 *  1. Servidor MCP Streamable HTTP (JSON-RPC 2.0) em /mcp (GET info/SSE + POST JSON-RPC)
 *  2. Ferramentas nativas grokbot__* integradas ao Chat Integrado (/api/tools)
 *  3. Roteamento inteligente para modelos Grok (gcli/grok-4.7-build-fast, gcli/grok-4.7) via 9Router (127.0.0.1:20128)
 *  4. Sincronização de memórias e fila de tarefas compartilhadas em v10/data/grokbot-bridge.json
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import * as db from "./db.js";
import { loadOperationRegistry } from "../operation-registry.js";
import { listMemories, createMemory } from "../memory-manager.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const BRIDGE_FILE = join(DATA_DIR, "grokbot-bridge.json");

export const ROUTER9_BASE_URL = process.env.ROUTER9_BASE_URL || "http://127.0.0.1:20128/v1";
export const ROUTER9_API_KEY = process.env.ROUTER9_API_KEY || process.env.NINEROUTER_API_KEY || readLocal9RouterKey();
export const DEFAULT_GROK_MODEL = process.env.GROKBOT_MODEL || "gcli/grok-4.7-build-fast";
const MESTRE_BASE_URL = process.env.MESTRE_BASE_URL || "http://127.0.0.1:7777";

// ── Estado Persistente da Ponte Grok Bot ────────────────────────────

async function loadBridgeState() {
  try {
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true });
    }
    if (!existsSync(BRIDGE_FILE)) {
      const initial = {
        version: "11.2.0",
        agent: "Grok Bot",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastSyncAt: null,
        tasks: [],
        sharedNotes: [],
      };
      await writeFile(BRIDGE_FILE, JSON.stringify(initial, null, 2), "utf8");
      return initial;
    }
    const raw = await readFile(BRIDGE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      version: "11.2.0",
      agent: "Grok Bot",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSyncAt: null,
      tasks: [],
      sharedNotes: [],
    };
  }
}

async function saveBridgeState(state) {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
  state.updatedAt = new Date().toISOString();
  await writeFile(BRIDGE_FILE, JSON.stringify(state, null, 2), "utf8");
  return state;
}

// ── Descoberta de Modelos no 9Router (Grok / Claude / DeepSeek / GPT) ──

let routerModelsCache = [];
let routerCheckedAt = 0;
let routerOnline = false;

export async function getRouter9Models(force = false) {
  if (!force && Date.now() - routerCheckedAt < 30000 && routerModelsCache.length) {
    return { online: routerOnline, models: routerModelsCache };
  }
  routerCheckedAt = Date.now();
  try {
    const resp = await fetch(`${ROUTER9_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${ROUTER9_API_KEY}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    routerModelsCache = (data.data || []).map((m) => m.id).filter(Boolean);
    routerOnline = true;
    return { online: true, models: routerModelsCache };
  } catch {
    routerOnline = false;
    return { online: false, models: routerModelsCache };
  }
}

export function isRouter9Model(modelName = "") {
  const m = String(modelName || "");
  return (
    m.startsWith("gcli/") ||
    m.startsWith("cc/") ||
    m.startsWith("cx/") ||
    m.startsWith("ag/") ||
    m.startsWith("nvidia/") ||
    m.startsWith("kimi/") ||
    m.startsWith("gh/") ||
    m.startsWith("nous/") ||
    m.startsWith("mmf/") ||
    m.startsWith("oc/") ||
    m.startsWith("ollama/") ||
    m.startsWith("ollama-local/")
  );
}

/**
 * Faz chamada de chat via 9Router (OpenAI-compatible) e retorna o texto.
 */
export async function callGrokRouterChat({
  messages,
  model = DEFAULT_GROK_MODEL,
  system = "",
  temperature = 0.4,
  timeoutMs = 60000,
}) {
  const finalMessages = [];
  if (system) finalMessages.push({ role: "system", content: system });
  for (const msg of messages || []) {
    if (msg && msg.role && typeof msg.content === "string") {
      finalMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const resp = await fetch(`${ROUTER9_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ROUTER9_API_KEY}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_GROK_MODEL,
      messages: finalMessages,
      temperature,
      stream: false,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`9Router/Grok HTTP ${resp.status}: ${errText.slice(0, 250)}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Converte o stream SSE do 9Router (/v1/chat/completions) para o stream NDJSON do Ollama (/ollama/chat)
 * para que o frontend do Chat Integrado funcione com qualquer modelo do Grok Bot / 9Router!
 */
export async function streamRouter9AsOllama(body, res, allowOrigin) {
  const requestedModel = body.model || DEFAULT_GROK_MODEL;
  const model = isRouter9Model(requestedModel) ? requestedModel : DEFAULT_GROK_MODEL;
  const messages = (body.messages || []).map((m) => ({
    role: m.role || "user",
    content: typeof m.content === "string" ? m.content : String(m.content || ""),
  }));

  const upstream = await fetch(`${ROUTER9_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ROUTER9_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: body.options?.temperature ?? 0.4,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "");
    res.writeHead(upstream.status || 502, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": allowOrigin,
    });
    res.end(JSON.stringify({ error: `Grok/9Router HTTP ${upstream.status}: ${errText.slice(0, 250)}` }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Access-Control-Allow-Origin": allowOrigin,
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            res.write(
              JSON.stringify({
                model,
                created_at: new Date().toISOString(),
                message: { role: "assistant", content: delta },
                done: false,
              }) + "\n"
            );
          }
        } catch {
          // ignora chunk parcial
        }
      }
    }
    res.write(
      JSON.stringify({
        model,
        created_at: new Date().toISOString(),
        message: { role: "assistant", content: "" },
        done: true,
      }) + "\n"
    );
  } catch {
    // conexão encerrada pelo cliente
  } finally {
    res.end();
  }
}

// ── Auxiliar de Métricas e Otimização Rápida via PowerShell ─────────

export async function getQuickSystemMetrics() {
  try {
    const resp = await fetch(`${MESTRE_BASE_URL}/status`, {
      headers: { "X-Mestre-Client": "v10-web" },
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) return await resp.json();
  } catch {}
  return { cpu: 0, ramFree: 0, ramTotal: 0, diskFree: 0, diskUsed: 0, uptimeSec: 0 };
}

export async function runFastPcOptimization() {
  const before = await getQuickSystemMetrics();
  const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
$tempBefore = @(Get-ChildItem -Path $env:TEMP -Recurse -Force).Count
Get-ChildItem -Path $env:TEMP -Force | Remove-Item -Recurse -Force
Get-ChildItem -Path 'C:\\Windows\\Temp' -Force | Remove-Item -Recurse -Force
Clear-RecycleBin -Force
Clear-DnsClientCache
$sig = 'using System; using System.Runtime.InteropServices; public class MemOpt { [DllImport("psapi.dll")] public static extern bool EmptyWorkingSet(IntPtr hProcess); }'
Add-Type -TypeDefinition $sig
$trimmed = 0
Get-Process | ForEach-Object { try { if ($_.Handle -ne [IntPtr]::Zero -and [MemOpt]::EmptyWorkingSet($_.Handle)) { $trimmed++ } } catch {} }
[System.GC]::Collect()
$tempAfter = @(Get-ChildItem -Path $env:TEMP -Recurse -Force).Count
@{ tempRemoved = [math]::Max(0, $tempBefore - $tempAfter); tempRemaining = $tempAfter; processesTrimmed = $trimmed } | ConvertTo-Json -Compress
`;
  const psResult = await new Promise((resolve) => {
    let out = "";
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript], {
      windowsHide: true,
    });
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("close", () => {
      try {
        resolve(JSON.parse(out.trim()));
      } catch {
        resolve({ tempRemoved: 0, tempRemaining: 0, processesTrimmed: 0 });
      }
    });
    child.on("error", () => resolve({ tempRemoved: 0, tempRemaining: 0, processesTrimmed: 0 }));
  });

  const after = await getQuickSystemMetrics();
  const ramFreedGb = Number((after.ramFree - before.ramFree).toFixed(2));
  const diskFreedGb = Number((after.diskFree - before.diskFree).toFixed(2));

  return {
    success: true,
    timestamp: new Date().toISOString(),
    before,
    after,
    ramFreedGb,
    diskFreedGb,
    details: psResult,
  };
}

// ── Status Completo da Integração Grok Bot ──────────────────────────

export async function getGrokBotStatus() {
  const [router, metrics, bridge] = await Promise.all([
    getRouter9Models(),
    getQuickSystemMetrics(),
    loadBridgeState(),
  ]);
  const grokModels = router.models.filter((m) => m.includes("grok"));
  const chatMemories = db.listarMemorias();
  let fileMemories = [];
  try {
    fileMemories = await listMemories();
  } catch {}

  return {
    connected: true,
    agent: "Grok Bot",
    bridgeVersion: "11.2.0",
    mcpEndpoint: `${MESTRE_BASE_URL}/mcp`,
    mcpStdioEntry: "C:\\Users\\Jean\\Projetos\\Mestre-do-PC-V10\\mcp-server\\index.js",
    router9: {
      online: router.online,
      baseUrl: ROUTER9_BASE_URL,
      defaultModel: DEFAULT_GROK_MODEL,
      grokModels: grokModels.length ? grokModels : ["gcli/grok-4.7-build-fast", "gcli/grok-4.7", "gcli/grok-4.6", "gcli/grok-4.5"],
      totalModels: router.models.length,
    },
    memories: {
      chatSqlite: chatMemories.length,
      mestreStore: fileMemories.length,
      lastSyncAt: bridge.lastSyncAt,
    },
    tasks: {
      total: (bridge.tasks || []).length,
      pending: (bridge.tasks || []).filter((t) => t.status === "pending").length,
    },
    system: metrics,
  };
}

// ── Sincronização de Memórias entre SQLite do Chat, Store V11 e Grok Bot ──

export async function syncGrokBotMemories({ note = "" } = {}) {
  const bridge = await loadBridgeState();
  const sqliteMems = db.listarMemorias();
  let storeMems = [];
  try {
    storeMems = await listMemories();
  } catch {}

  let importedToSqlite = 0;
  let exportedToStore = 0;

  // Se recebeu uma nota nova, salva nos dois
  if (note && String(note).trim()) {
    const clean = String(note).trim();
    const title = clean.slice(0, 50);
    db.addMemoria(title, clean);
    try {
      await createMemory({
        content: clean,
        type: "contexto_conversa",
        tags: ["grokbot", "sync"],
        metadata: { source: "grokbot-bridge" },
      });
    } catch {}
    bridge.sharedNotes = bridge.sharedNotes || [];
    bridge.sharedNotes.unshift({
      id: randomUUID(),
      content: clean,
      createdAt: new Date().toISOString(),
    });
  }

  // Sincroniza memórias do Store JSON para o SQLite do Chat Integrado
  const sqliteContents = new Set(sqliteMems.map((m) => String(m.conteudo || "").trim().toLowerCase()));
  for (const sm of storeMems) {
    const text = String(sm.content || "").trim();
    if (text && !sqliteContents.has(text.toLowerCase())) {
      db.addMemoria(text.slice(0, 50), text);
      sqliteContents.add(text.toLowerCase());
      importedToSqlite++;
    }
  }

  // Sincroniza memórias do SQLite do Chat para o Store JSON do Mestre
  const storeContents = new Set(storeMems.map((m) => String(m.content || "").trim().toLowerCase()));
  for (const cm of sqliteMems) {
    const text = String(cm.conteudo || "").trim();
    if (text && !storeContents.has(text.toLowerCase())) {
      try {
        await createMemory({
          content: text,
          type: "preferencia_usuario",
          tags: ["chat-integrado", "grokbot-sync"],
          metadata: { sqliteId: cm.id, title: cm.titulo },
        });
        storeContents.add(text.toLowerCase());
        exportedToStore++;
      } catch {}
    }
  }

  bridge.lastSyncAt = new Date().toISOString();
  await saveBridgeState(bridge);

  return {
    success: true,
    lastSyncAt: bridge.lastSyncAt,
    importedToSqlite,
    exportedToStore,
    totalSqlite: db.listarMemorias().length,
  };
}

// ── Fila de Tarefas Delegadas (Mestre do PC <-> Grok Bot) ───────────

export async function createGrokBotTask({ titulo, descricao = "", operacao_id = "" }) {
  const bridge = await loadBridgeState();
  const task = {
    id: randomUUID(),
    titulo: String(titulo || "Tarefa Grok Bot").slice(0, 120),
    descricao: String(descricao || ""),
    operacaoId: operacao_id || null,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  bridge.tasks = bridge.tasks || [];
  bridge.tasks.unshift(task);
  if (bridge.tasks.length > 100) bridge.tasks = bridge.tasks.slice(0, 100);
  await saveBridgeState(bridge);
  return task;
}

export async function listGrokBotTasks() {
  const bridge = await loadBridgeState();
  return bridge.tasks || [];
}

// ── Catálogo de Ferramentas Nativas Grok Bot para o Chat Integrado ──

export const GROKBOT_TOOLS_METADATA = {
  grokbot__status: {
    id: "grokbot__status",
    name: "grokbot__status",
    title: "Grok Bot: Status da Ponte & MCP",
    description: "Exibe status em tempo real da ponte Grok Bot, servidor MCP, modelos Grok 4.7 no 9Router e telemetria do PC.",
    provider: "grokbot",
    icon: "🤖",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {} },
  },
  grokbot__chat: {
    id: "grokbot__chat",
    name: "grokbot__chat",
    title: "Grok Bot: Consultar Grok 4.7",
    description: "Envia uma consulta técnica ao modelo Grok 4.7 (via 9Router) enriquecida com as métricas atuais do Windows.",
    provider: "grokbot",
    icon: "⚡",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      required: ["pergunta"],
      properties: {
        pergunta: { type: "string", description: "Pergunta ou diagnóstico para o Grok Bot" },
        modelo: { type: "string", description: "Modelo no 9Router (padrão: gcli/grok-4.7-build-fast)" },
      },
    },
  },
  grokbot__optimize_pc: {
    id: "grokbot__optimize_pc",
    name: "grokbot__optimize_pc",
    title: "Grok Bot: Limpar Temp, Lixeira e Otimizar RAM",
    description: "Limpa pastas temporárias (%TEMP%, Windows\\Temp), esvazia Lixeira, limpa DNS e libera WorkingSet da memória RAM.",
    provider: "grokbot",
    icon: "🚀",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {} },
  },
  grokbot__sync_memories: {
    id: "grokbot__sync_memories",
    name: "grokbot__sync_memories",
    title: "Grok Bot: Sincronizar Memórias",
    description: "Sincroniza as memórias do Chat Integrado SQLite com o repositório de memórias do Mestre do PC e Grok Bot.",
    provider: "grokbot",
    icon: "🔄",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        nota: { type: "string", description: "Nova memória opcional para salvar e sincronizar" },
      },
    },
  },
  grokbot__delegate_task: {
    id: "grokbot__delegate_task",
    name: "grokbot__delegate_task",
    title: "Grok Bot: Registrar Tarefa na Fila",
    description: "Registra uma tarefa compartilhada na fila da ponte Grok Bot <-> Mestre do PC.",
    provider: "grokbot",
    icon: "📌",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      required: ["titulo"],
      properties: {
        titulo: { type: "string", description: "Título ou objetivo da tarefa" },
        descricao: { type: "string", description: "Detalhes adicionais" },
      },
    },
  },
};

export function isGrokBotTool(toolName = "") {
  return String(toolName || "").startsWith("grokbot__");
}

export async function callGrokBotTool(toolName, rawArgs = {}) {
  const args = (rawArgs && typeof rawArgs.args === 'object' && !Array.isArray(rawArgs.args)) ? rawArgs.args : (rawArgs || {});
  switch (toolName) {
    case "grokbot__status":
      return await getGrokBotStatus();

    case "grokbot__chat": {
      const pergunta = String(args.pergunta || args.query || args.input || "").trim();
      if (!pergunta) throw new Error("Informe o campo 'pergunta' para consultar o Grok Bot.");
      const metrics = await getQuickSystemMetrics();
      const activeMemories = db
        .listarMemorias()
        .filter((m) => m.ativa)
        .slice(0, 8)
        .map((m) => `- ${m.titulo}: ${m.conteudo}`)
        .join("\n");

      const system = [
        "Você é o Grok Bot integrado ao Mestre do PC V11 (Ultimate Plus) no Windows 11.",
        "Responda SEMPRE em português brasileiro de forma clara, técnica e objetiva.",
        `Métricas em tempo real do PC: CPU ${metrics.cpu}% | RAM Livre ${metrics.ramFree}/${metrics.ramTotal} GB | Disco C: Livre ${metrics.diskFree} GB.`,
        activeMemories ? `Memórias ativas do usuário:\n${activeMemories}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const model = args.modelo || DEFAULT_GROK_MODEL;
      const resposta = await callGrokRouterChat({
        model,
        system,
        messages: [{ role: "user", content: pergunta }],
      });
      return {
        agent: "Grok Bot",
        model,
        metrics,
        resposta,
      };
    }

    case "grokbot__optimize_pc":
      return await runFastPcOptimization();

    case "grokbot__sync_memories":
      return await syncGrokBotMemories({ note: args.nota || args.input || "" });

    case "grokbot__delegate_task": {
      const titulo = String(args.titulo || args.input || "").trim();
      if (!titulo) throw new Error("Informe o 'titulo' da tarefa.");
      const task = await createGrokBotTask({
        titulo,
        descricao: args.descricao || "",
        operacao_id: args.operacao_id || "",
      });
      return { success: true, task };
    }

    default:
      throw new Error(`Ferramenta Grok Bot desconhecida: ${toolName}`);
  }
}

// ── Endpoint MCP Streamable HTTP / JSON-RPC 2.0 (/mcp) ──────────────

async function getMcpToolsDefinition() {
  return [
    {
      name: "mestre_system_status",
      description: "Retorna métricas em tempo real do PC Windows (CPU %, RAM livre/total GB, Disco C: livre/usado GB e Uptime).",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "mestre_optimize_ram_and_temp",
      description: "Limpa pastas temporárias (%TEMP%, Windows\\Temp), esvazia Lixeira, limpa cache DNS e otimiza a memória RAM (EmptyWorkingSet).",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "mestre_list_operations",
      description: "Lista ou filtra os 506 comandos PowerShell da whitelist oficial do Mestre do PC V11.",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Filtro opcional por id, título ou categoria" },
          limit: { type: "number", description: "Máximo de resultados (padrão 30)" },
        },
      },
    },
    {
      name: "mestre_run_operation",
      description: "Executa uma operação segura da whitelist do Mestre do PC V11 pelo seu ID.",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "ID da operação na whitelist (ex: limpar_temp_usuario, liberar_memoria_ram_imediatamente)" },
          params: { type: "object", description: "Parâmetros opcionais para templates parametrizados" },
        },
      },
    },
    {
      name: "mestre_list_memories",
      description: "Lista todas as memórias persistentes do Chat Integrado e do Mestre do PC.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "mestre_save_memory",
      description: "Salva e sincroniza uma nova memória persistente entre o Mestre do PC e o Grok Bot.",
      inputSchema: {
        type: "object",
        required: ["conteudo"],
        properties: {
          conteudo: { type: "string", description: "Conteúdo da memória a ser salva" },
        },
      },
    },
    {
      name: "mestre_ask_grok",
      description: "Consulta o modelo Grok 4.7 via 9Router com telemetria em tempo real do PC Windows.",
      inputSchema: {
        type: "object",
        required: ["pergunta"],
        properties: {
          pergunta: { type: "string", description: "Pergunta técnica ou comando de diagnóstico" },
          modelo: { type: "string", description: "Modelo opcional no 9Router (padrão gcli/grok-4.7-build-fast)" },
        },
      },
    },
  ];
}

async function executeMcpToolCall(name, args = {}, runOperationCallback = null) {
  switch (name) {
    case "mestre_system_status":
      return await getQuickSystemMetrics();

    case "mestre_optimize_ram_and_temp":
      return await runFastPcOptimization();

    case "mestre_list_operations": {
      const registry = await loadOperationRegistry();
      const all = [...registry.exactEntries, ...registry.parametrizedTemplates].filter((op) => op.enabled !== false);
      const q = String(args.search || "").toLowerCase().trim();
      const limit = Math.min(Math.max(1, Number(args.limit) || 30), 200);
      const filtered = q
        ? all.filter(
            (op) =>
              String(op.id || "").toLowerCase().includes(q) ||
              String(op.title || "").toLowerCase().includes(q) ||
              String(op.category || "").toLowerCase().includes(q) ||
              String(op.description || "").toLowerCase().includes(q)
          )
        : all;
      return {
        totalCatalog: all.length,
        returned: Math.min(filtered.length, limit),
        operations: filtered.slice(0, limit).map((op) => ({
          id: op.id,
          title: op.title || op.id,
          category: op.category || "Geral",
          destructive: !!op.destructive,
        })),
      };
    }

    case "mestre_run_operation": {
      const opId = String(args.id || "").trim();
      if (!opId) throw new Error("Campo obrigatório 'id' ausente.");
      if (typeof runOperationCallback === "function") {
        const output = await runOperationCallback(opId, args.params || {});
        return { success: true, operationId: opId, output };
      }
      throw new Error("Executor de operações indisponível.");
    }

    case "mestre_list_memories": {
      const sqliteMems = db.listarMemorias();
      return { total: sqliteMems.length, memories: sqliteMems };
    }

    case "mestre_save_memory": {
      const conteudo = String(args.conteudo || "").trim();
      if (!conteudo) throw new Error("Campo 'conteudo' é obrigatório.");
      return await syncGrokBotMemories({ note: conteudo });
    }

    case "mestre_ask_grok":
      return await callGrokBotTool("grokbot__chat", args);

    default:
      if (isGrokBotTool(name)) {
        return await callGrokBotTool(name, args);
      }
      throw new Error(`Ferramenta MCP não encontrada: ${name}`);
  }
}

/**
 * Trata requisições HTTP/JSON-RPC em /mcp (compatível com MCP Streamable HTTP 2024-11-05 / 2025-03-26).
 */
export async function handleMcpHttpEndpoint(req, res, { allowedOrigin, readBody, runAllowedOperation }) {
  if (req.method === "GET") {
    const status = await getGrokBotStatus();
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": allowedOrigin,
    });
    res.end(
      JSON.stringify({
        name: "mestre-do-pc-grokbot-mcp",
        version: "11.2.0",
        protocol: "mcp-streamable-http",
        protocolVersion: "2024-11-05",
        status: "online",
        grokBot: status,
      })
    );
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": allowedOrigin,
    });
    res.end(JSON.stringify({ error: "Method Not Allowed" }));
    return;
  }

  let rpc;
  try {
    rpc = await readBody(req, 2 * 1024 * 1024);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": allowedOrigin });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: err.message } }));
    return;
  }

  const sendRpc = (payload) => {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": allowedOrigin,
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(payload));
  };

  const method = rpc?.method || "";
  const id = rpc?.id !== undefined ? rpc.id : null;

  try {
    if (method === "initialize") {
      return sendRpc({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: rpc?.params?.protocolVersion || "2024-11-05",
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false },
          },
          serverInfo: {
            name: "mestre-do-pc-grokbot-mcp",
            version: "11.2.0",
          },
        },
      });
    }

    if (method === "notifications/initialized" || method.startsWith("notifications/")) {
      res.writeHead(202, { "Access-Control-Allow-Origin": allowedOrigin });
      res.end();
      return;
    }

    if (method === "ping") {
      return sendRpc({ jsonrpc: "2.0", id, result: {} });
    }

    if (method === "tools/list") {
      const tools = await getMcpToolsDefinition();
      return sendRpc({ jsonrpc: "2.0", id, result: { tools } });
    }

    if (method === "tools/call") {
      const toolName = rpc?.params?.name;
      const toolArgs = rpc?.params?.arguments || {};
      const output = await executeMcpToolCall(toolName, toolArgs, runAllowedOperation);
      return sendRpc({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          isError: false,
        },
      });
    }

    if (method === "resources/list") {
      return sendRpc({
        jsonrpc: "2.0",
        id,
        result: {
          resources: [
            {
              uri: "mestre://system/status",
              name: "Status do Sistema Windows (Mestre do PC V11)",
              mimeType: "application/json",
            },
            {
              uri: "mestre://grokbot/status",
              name: "Status da Ponte Grok Bot & 9Router",
              mimeType: "application/json",
            },
          ],
        },
      });
    }

    if (method === "resources/read") {
      const uri = rpc?.params?.uri || "";
      const data = uri === "mestre://system/status" ? await getQuickSystemMetrics() : await getGrokBotStatus();
      return sendRpc({
        jsonrpc: "2.0",
        id,
        result: {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        },
      });
    }

    return sendRpc({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  } catch (err) {
    return sendRpc({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: `Erro: ${err.message}` }],
        isError: true,
      },
    });
  }
}
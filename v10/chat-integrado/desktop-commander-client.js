import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(__dirname, "..");
const PACKAGE_DIR = join(PROJECT_DIR, "node_modules", "@wonderwhy-er", "desktop-commander");
const PACKAGE_FILE = join(PACKAGE_DIR, "package.json");
const SERVER_ENTRY = join(PACKAGE_DIR, "dist", "index.js");
const TOOL_PREFIX = "desktop__";
const CONNECT_TIMEOUT_MS = 20000;
const CALL_TIMEOUT_MS = 120000;
const MAX_TEXT_RESULT_CHARS = 120000;

let client = null;
let transport = null;
let connectionPromise = null;
let toolsCache = [];
let connectedAt = null;
let lastError = "";
let packageVersion = "";

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} excedeu ${timeoutMs} ms.`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function resetConnection(error) {
  client = null;
  transport = null;
  connectionPromise = null;
  toolsCache = [];
  connectedAt = null;
  if (error) lastError = error.message || String(error);
}

async function readPackageVersion() {
  if (packageVersion) return packageVersion;
  try {
    const data = JSON.parse(await readFile(PACKAGE_FILE, "utf8"));
    packageVersion = data.version || "";
  } catch {
    packageVersion = "";
  }
  return packageVersion;
}

async function connectDesktopCommander() {
  if (client) return client;
  if (connectionPromise) return connectionPromise;
  if (!existsSync(SERVER_ENTRY)) {
    throw new Error("Desktop Commander não está instalado no projeto.");
  }

  connectionPromise = (async () => {
    const nextClient = new Client(
      { name: "mestre-do-pc-chat", version: "1.0.0" },
      { capabilities: {} },
    );
    const nextTransport = new StdioClientTransport({
      command: process.execPath,
      args: [SERVER_ENTRY],
      cwd: PROJECT_DIR,
      stderr: "pipe",
    });

    let stderr = "";
    nextTransport.stderr?.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-2000);
    });

    try {
      await withTimeout(nextClient.connect(nextTransport), CONNECT_TIMEOUT_MS, "Conexão com Desktop Commander");
      client = nextClient;
      transport = nextTransport;
      connectedAt = new Date().toISOString();
      lastError = "";
      return client;
    } catch (error) {
      await nextTransport.close().catch(() => {});
      const detail = stderr.trim();
      const message = detail ? `${error.message} Detalhes: ${detail.slice(0, 500)}` : error.message;
      resetConnection(new Error(message));
      throw new Error(message);
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

function normalizeDescription(description) {
  return String(description || "").replace(/\s+/g, " ").trim();
}

function normalizeTool(tool) {
  const annotations = tool.annotations || {};
  return {
    id: `${TOOL_PREFIX}${tool.name}`,
    name: tool.name,
    title: annotations.title || tool.name,
    description: normalizeDescription(tool.description),
    inputSchema: tool.inputSchema || { type: "object", properties: {} },
    annotations,
    requiresConfirmation: annotations.destructiveHint === true || annotations.readOnlyHint !== true,
    provider: "desktop-commander",
  };
}

function sanitizeContentItem(item) {
  if (!item || typeof item !== "object") return item;
  if ((item.type === "image" || item.type === "audio") && typeof item.data === "string") {
    return {
      type: item.type,
      mimeType: item.mimeType || "application/octet-stream",
      bytes: Math.floor(item.data.length * 0.75),
      omitted: true,
    };
  }
  if (item.type === "text" && typeof item.text === "string" && item.text.length > MAX_TEXT_RESULT_CHARS) {
    return {
      ...item,
      text: `${item.text.slice(0, MAX_TEXT_RESULT_CHARS)}\n\n[Resultado truncado pelo Chat Integrado]`,
    };
  }
  return item;
}

function sanitizeStructuredContent(value) {
  if (value == null) return value;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= MAX_TEXT_RESULT_CHARS) return value;
    return {
      truncated: true,
      preview: serialized.slice(0, MAX_TEXT_RESULT_CHARS),
    };
  } catch {
    return { unavailable: true };
  }
}

export function isDesktopCommanderTool(toolName) {
  return String(toolName || "").startsWith(TOOL_PREFIX);
}

export async function listDesktopCommanderTools({ refresh = false } = {}) {
  if (toolsCache.length && !refresh) return toolsCache;
  const activeClient = await connectDesktopCommander();
  try {
    const response = await withTimeout(activeClient.listTools(), CONNECT_TIMEOUT_MS, "Catálogo do Desktop Commander");
    toolsCache = (response.tools || []).map(normalizeTool);
    return toolsCache;
  } catch (error) {
    await closeDesktopCommander();
    lastError = error.message || String(error);
    throw error;
  }
}

export async function callDesktopCommanderTool(prefixedName, args = {}) {
  const toolName = String(prefixedName || "").replace(/^desktop__/, "");
  const tools = await listDesktopCommanderTools();
  const tool = tools.find((item) => item.name === toolName);
  if (!tool) throw new Error(`Ferramenta Desktop Commander "${toolName}" não existe.`);

  const confirmed = args.__confirm === true;
  if (tool.requiresConfirmation && !confirmed) {
    throw new Error(`A ferramenta "${toolName}" exige confirmação explícita.`);
  }

  const toolArgs = { ...args };
  delete toolArgs.__confirm;
  if (tool.inputSchema?.properties?.origin && toolArgs.origin == null) {
    toolArgs.origin = "mestre-do-pc-chat";
  }

  const activeClient = await connectDesktopCommander();
  try {
    const result = await withTimeout(
      activeClient.callTool({ name: toolName, arguments: toolArgs }),
      CALL_TIMEOUT_MS,
      `Execução de ${toolName}`,
    );
    return {
      provider: "desktop-commander",
      tool: toolName,
      isError: result.isError === true,
      content: Array.isArray(result.content) ? result.content.map(sanitizeContentItem) : [],
      structuredContent: sanitizeStructuredContent(result.structuredContent),
    };
  } catch (error) {
    lastError = error.message || String(error);
    throw error;
  }
}

export async function getDesktopCommanderStatus() {
  const installed = existsSync(SERVER_ENTRY);
  return {
    installed,
    connected: Boolean(client),
    connectedAt,
    version: installed ? await readPackageVersion() : "",
    tools: toolsCache.length,
    lastError,
  };
}

export async function closeDesktopCommander() {
  const activeClient = client;
  const activeTransport = transport;
  resetConnection();
  if (activeClient) {
    await activeClient.close().catch(() => {});
  } else if (activeTransport) {
    await activeTransport.close().catch(() => {});
  }
}

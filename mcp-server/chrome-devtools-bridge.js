// mcp-server/chrome-devtools-bridge.js
// ============================================================================
// Ponte MCP: Mestre do PC (cliente) -> chrome-devtools-mcp (servidor headless)
// ----------------------------------------------------------------------------
// Conecta o servidor MCP do Mestre do PC ao chrome-devtools-mcp como CLIENTE
// MCP via stdio e re-expoe as ferramentas de debugging de browser como uma
// "nova sessao de funcoes" prefixadas (padrao: "chrome_").
//
// Parallelo EXATO do nexo-bridge.js:
//   - stdio > HTTP: subprocesso local, NENHUMA porta de rede aberta.
//   - Zero dependencias novas: usa apenas APIs nativas do Node.
//   - Degradacao graciosa: se o pacote nao estiver instalado/saudavel, o
//     Mestre do PC continua funcionando normalmente, apenas sem estas tools.
//   - Sem segredos hardcoded: caminho vem de CHROME_DEVTOOLS_MCP_HOME (env).
//
// O chrome-devtools-mcp e um pacote com "skills" proprias em
// node_modules/chrome-devtools-mcp/skills/ (a11y-debugging, lighthouse,
// memory-leak, troubleshooting...). Copie-as para ~/.claude/skills se quiser
// que o agente use os guias de workflow.
//
// Protocolo MCP stdio: JSON-RPC 2.0 newline-delimited (uma msg por linha).
// ============================================================================

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname } from "node:path";
import { tmpdir } from "node:os";

const PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_START_TIMEOUT_MS = 30000;
const DEFAULT_CALL_TIMEOUT_MS = 120000;

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve o entrypoint do chrome-devtools-mcp.
 * Ordem: CHROME_DEVTOOLS_MCP_HOME -> node_modules local do mcp-server ->
 * node_modules da raiz do projeto -> sibling node_modules.
 * Retorna null se nao encontrar (ponte fica desativada, sem quebrar o Mestre).
 */
function resolveChromeDevToolsEntry() {
  const explicit = process.env.CHROME_DEVTOOLS_MCP_HOME && String(process.env.CHROME_DEVTOOLS_MCP_HOME).trim();
  const rel = join("node_modules", "chrome-devtools-mcp", "build", "src", "bin", "chrome-devtools-mcp.js");
  const candidates = [];
  if (explicit) {
    candidates.push(join(resolve(explicit), rel));
    candidates.push(resolve(explicit));
  }
  // mcp-server/node_modules (onde o pacote e instalado por padrao)
  candidates.push(join(__dirname, rel));
  // raiz do projeto
  candidates.push(resolve(__dirname, "..", rel));
  // sibling node_modules (ex.: install global)
  candidates.push(resolve(__dirname, "..", "..", rel));
  // bin global do npm
  candidates.push(join(resolve(__dirname, "..", "..", "node_modules"), rel));
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

/**
 * Monta os argumentos de linha de comando do chrome-devtools-mcp.
 * Padrao: headless (nao abre janela de Chrome ao subir o Mestre).
 * CHROME_DEVTOOLS_HEADLESS=0 -> abre o Chrome visivel.
 */
function buildArgs(entry) {
  const args = [entry, "--no-usage-statistics"];
  const headless = String(process.env.CHROME_DEVTOOLS_HEADLESS ?? "1") !== "0";
  if (headless) args.push("--headless");
  const exe = process.env.CHROME_DEVTOOLS_EXECUTABLE_PATH;
  if (exe && String(exe).trim()) args.push("--executablePath", String(exe).trim());
  const channel = process.env.CHROME_DEVTOOLS_CHANNEL;
  if (channel && String(channel).trim()) args.push("--channel", String(channel).trim());
  return args;
}

export class ChromeDevToolsBridge {
  constructor({ logger = (m) => console.error(m) } = {}) {
    this.logger = logger;
    this.entry = null;
    this.proc = null;
    this.ready = false;
    this.tools = []; // schemas ja prefixados e prontos para o ListTools
    this._buf = "";
    this._nextId = 1;
    this._pending = new Map(); // id -> { resolve, reject, timer }
  }

  /**
   * Configuracao lida sob demanda (e nao no topo do modulo) porque o
   * .env.local e carregado por ./auth/local-token.js, que o index.js importa
   * DEPOIS desta ponte. Ler no topo pegaria o ambiente ainda vazio.
   */
  get _config() {
    return {
      enabled: String(process.env.CHROME_DEVTOOLS_ENABLED ?? "1") !== "0",
      prefix: process.env.CHROME_DEVTOOLS_TOOL_PREFIX || "chrome_",
      startTimeoutMs: Number(process.env.CHROME_DEVTOOLS_START_TIMEOUT_MS) || DEFAULT_START_TIMEOUT_MS,
      callTimeoutMs: Number(process.env.CHROME_DEVTOOLS_CALL_TIMEOUT_MS) || DEFAULT_CALL_TIMEOUT_MS,
    };
  }

  /** Nome da tool no chrome-devtools-mcp, dado o nome prefixado exposto pelo Mestre. */
  _strip(name) {
    const prefix = this._config.prefix;
    return name.startsWith(prefix) ? name.slice(prefix.length) : name;
  }

  isBridgeTool(name) {
    return typeof name === "string" && name.startsWith(this._config.prefix);
  }

  getToolSchemas() {
    return this.tools;
  }

  /**
   * Sobe o subprocesso chrome-devtools-mcp, faz handshake e carrega as tools.
   * Nunca lanca: em qualquer falha, marca indisponivel e retorna false.
   */
  async start() {
    const cfg = this._config;
    if (!cfg.enabled) {
      this.logger("[chrome-devtools-bridge] desativada (CHROME_DEVTOOLS_ENABLED=0).");
      return false;
    }
    this.entry = resolveChromeDevToolsEntry();
    if (!this.entry) {
      this.logger(
        "[chrome-devtools-bridge] chrome-devtools-mcp nao encontrado. Rode 'npm install chrome-devtools-mcp' em mcp-server/ (ou defina CHROME_DEVTOOLS_MCP_HOME) para ativar as tools chrome_*."
      );
      return false;
    }
    try {
      this.proc = spawn(process.execPath, buildArgs(this.entry), {
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
        windowsHide: true,
      });
    } catch (e) {
      this.logger(`[chrome-devtools-bridge] falha ao iniciar chrome-devtools-mcp: ${e.message}`);
      this.proc = null;
      return false;
    }

    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => this._onData(chunk));
    this.proc.stderr.setEncoding("utf8");
    this.proc.stderr.on("data", (d) => this.logger(`[chrome-devtools] ${String(d).trim()}`));
    this.proc.on("exit", (code) => {
      this.ready = false;
      this._rejectAll(new Error(`chrome-devtools-mcp encerrou (code ${code})`));
      this.logger(`[chrome-devtools-bridge] chrome-devtools-mcp encerrou (code ${code}).`);
    });
    this.proc.on("error", (e) => {
      this.ready = false;
      this._rejectAll(e);
      this.logger(`[chrome-devtools-bridge] erro no processo chrome-devtools-mcp: ${e.message}`);
    });

    try {
      await this._rpc(
        "initialize",
        {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { roots: { listChanged: false } },
          clientInfo: { name: "mestre-do-pc", version: "10.0.0" },
        },
        cfg.startTimeoutMs
      );
      const list = await this._rpc("tools/list", {}, cfg.startTimeoutMs);
      const raw = Array.isArray(list?.tools) ? list.tools : [];
      this.tools = raw.map((t) => ({
        name: cfg.prefix + t.name,
        description: `[CHROME] ${t.description || "Ferramenta de debugging de browser (Chrome DevTools MCP)."}`,
        inputSchema: t.inputSchema || { type: "object", properties: {} },
      }));
      this.ready = true;
      this.logger(`[chrome-devtools-bridge] conectado: ${this.tools.length} tools ${cfg.prefix}* disponíveis.`);
      return true;
    } catch (e) {
      this.logger(`[chrome-devtools-bridge] handshake falhou: ${e.message}. Seguindo sem as tools ${cfg.prefix}*.`);
      this.stop();
      return false;
    }
  }

  /**
   * Encaminha uma chamada de tool para o chrome-devtools-mcp. Retorna no
   * formato de conteudo MCP do Mestre do PC ({ isError, content: [{type:'text',text}] }).
   */
  async callTool(prefixedName, args = {}) {
    if (!this.ready) {
      return {
        isError: true,
        content: [{ type: "text", text: `Ponte Chrome DevTools indisponivel. Rode 'npm install chrome-devtools-mcp' em mcp-server/ e reinicie o MCP server.` }],
      };
    }
    const name = this._strip(prefixedName);
    try {
      const res = await this._rpc("tools/call", { name, arguments: args || {} }, this._config.callTimeoutMs);
      const content = Array.isArray(res?.content) && res.content.length
        ? res.content
        : [{ type: "text", text: "(sem conteudo)" }];
      return { isError: Boolean(res?.isError), content };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `Falha na ponte Chrome DevTools (${name}): ${e.message}` }] };
    }
  }

  stop() {
    this.ready = false;
    if (this.proc) {
      try { this.proc.kill(); } catch { /* noop */ }
      this.proc = null;
    }
  }

  // ---- interno: JSON-RPC newline-delimited --------------------------------

  _rpc(method, params, timeoutMs) {
    return new Promise((resolvePromise, rejectPromise) => {
      if (!this.proc || !this.proc.stdin.writable) {
        rejectPromise(new Error("subprocesso chrome-devtools-mcp nao esta gravavel"));
        return;
      }
      const id = this._nextId++;
      const timer = setTimeout(() => {
        this._pending.delete(id);
        rejectPromise(new Error(`timeout em ${method} (${timeoutMs} ms)`));
      }, timeoutMs);
      this._pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer });
      const line = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      this.proc.stdin.write(line, "utf8");
    });
  }

  _onData(chunk) {
    this._buf += chunk;
    let i;
    while ((i = this._buf.indexOf("\n")) >= 0) {
      const line = this._buf.slice(0, i).trim();
      this._buf = this._buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }

      // Requisicao do servidor para o cliente (ex.: roots/list). O
      // chrome-devtools-mcp usa isso para autorizar escrita de arquivos
      // (screenshots, traces) fora da pasta temporaria do SO.
      if (msg.method && msg.id !== undefined) {
        this._handleServerRequest(msg);
        continue;
      }

      const entry = this._pending.get(msg.id);
      if (!entry) continue; // notificacao ou id desconhecido
      this._pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.error) entry.reject(new Error(msg.error.message || "erro JSON-RPC"));
      else entry.resolve(msg.result);
    }
  }

  /**
   * Responde requisicoes JSON-RPC do servidor para o cliente.
   * Implementa apenas "roots/list" (o que o chrome-devtools-mcp usa para
   * autorizar escrita de arquivos) e "ping". Qualquer outra requisicao
   * devolve metodo nao encontrado, sem quebrar o fluxo.
   */
  _handleServerRequest(msg) {
    const reply = (result) => {
      if (!this.proc || !this.proc.stdin.writable) return;
      this.proc.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\n",
        "utf8"
      );
    };
    const fail = (code, message) => {
      if (!this.proc || !this.proc.stdin.writable) return;
      this.proc.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code, message } }) + "\n",
        "utf8"
      );
    };

    if (msg.method === "roots/list") {
      const roots = this._roots().map((p) => ({
        uri: pathToFileURL(p).href,
        name: p,
      }));
      reply({ roots });
      return;
    }
    if (msg.method === "ping") {
      reply({});
      return;
    }
    fail(-32601, `Metodo nao suportado pela ponte: ${msg.method}`);
  }

  /**
   * Pastas-raiz autorizadas para escrita de arquivos pelo browser.
   * Padrao: a pasta do projeto (onde ficam logs/, dist/) + a pasta de
   * trabalho configurada em CHROME_DEVTOOLS_WORKSPACE.
   */
  _roots() {
    const out = [];
    const extra = process.env.CHROME_DEVTOOLS_WORKSPACE;
    if (extra && String(extra).trim()) {
      for (const part of String(extra).split(";")) {
        const p = part.trim();
        if (p && existsSync(p)) out.push(resolve(p));
      }
    }
    // Raiz do projeto: mcp-server/ -> ..
    const projectRoot = resolve(__dirname, "..");
    if (existsSync(projectRoot)) out.push(projectRoot);
    // Pasta temporaria do SO (padrao do chrome-devtools-mcp)
    out.push(tmpdir());
    return [...new Set(out)];
  }

  _rejectAll(err) {
    for (const [, entry] of this._pending) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this._pending.clear();
  }
}

export const chromeDevToolsBridge = new ChromeDevToolsBridge();

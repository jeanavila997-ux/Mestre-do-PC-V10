// mcp-server/nexo-bridge.js
// ============================================================================
// Ponte MCP: Mestre do PC (cliente) -> nexo-core (servidor headless)
// ----------------------------------------------------------------------------
// Conecta o servidor MCP do Mestre do PC ao nexo-core como CLIENTE MCP via
// stdio, e re-expõe as ferramentas do nexo como uma "nova sessão de funções"
// prefixadas (padrão: "nexo_") dentro do próprio Mestre do PC.
//
// Princípios (alinhados à arquitetura do ecossistema NEXO):
//   - stdio > HTTP: subprocesso local, NENHUMA porta de rede aberta.
//   - Zero dependências novas: usa apenas APIs nativas do Node.
//   - Degradação graciosa: se o nexo-core não estiver presente/saudável, o
//     Mestre do PC continua funcionando normalmente, apenas sem estas tools.
//   - A segurança atravessa a fronteira: o gate do nexo (confirm/dry_run)
//     continua decidindo no núcleo. A ponte NUNCA contorna confirmações.
//   - Sem segredos hardcoded: caminho vem de NEXO_HOME (env).
//
// Protocolo do nexo-core: JSON-RPC 2.0 newline-delimited (uma msg por linha).
// ============================================================================

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const PREFIX = process.env.NEXO_TOOL_PREFIX || "nexo_";
const PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_START_TIMEOUT_MS = Number(process.env.NEXO_START_TIMEOUT_MS) || 15000;
const DEFAULT_CALL_TIMEOUT_MS = Number(process.env.NEXO_CALL_TIMEOUT_MS) || 120000;

/**
 * Resolve o caminho do nexo.mjs a partir de NEXO_HOME ou de locais prováveis
 * relativos ao Mestre do PC. Retorna null se não encontrar.
 */
function resolveNexoEntry() {
  const explicit = process.env.NEXO_HOME && String(process.env.NEXO_HOME).trim();
  const candidates = [];
  if (explicit) {
    candidates.push(join(resolve(explicit), "nexo.mjs"));
    candidates.push(resolve(explicit)); // caso já aponte direto para nexo.mjs
  }
  // Locais irmãos comuns (dev no Windows e no Linux/VPS):
  candidates.push(resolve(process.cwd(), "..", "nexo-core", "nexo.mjs"));
  candidates.push(resolve(process.cwd(), "..", "..", "nexo-core", "nexo.mjs"));
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

export class NexoBridge {
  constructor({ logger = (m) => console.error(m) } = {}) {
    this.logger = logger;
    this.enabled = String(process.env.NEXO_ENABLED ?? "1") !== "0";
    this.entry = null;
    this.proc = null;
    this.ready = false;
    this.tools = []; // schemas já prefixados e prontos para o ListTools
    this._buf = "";
    this._nextId = 1;
    this._pending = new Map(); // id -> { resolve, reject, timer }
  }

  /** Nome da tool no nexo, dado o nome prefixado exposto pelo Mestre. */
  _strip(name) {
    return name.startsWith(PREFIX) ? name.slice(PREFIX.length) : name;
  }

  isNexoTool(name) {
    return typeof name === "string" && name.startsWith(PREFIX);
  }

  getToolSchemas() {
    return this.tools;
  }

  /**
   * Sobe o subprocesso nexo-core, faz handshake e carrega as tools.
   * Nunca lança: em qualquer falha, marca indisponível e retorna false.
   */
  async start() {
    if (!this.enabled) {
      this.logger("[nexo-bridge] desativada (NEXO_ENABLED=0).");
      return false;
    }
    this.entry = resolveNexoEntry();
    if (!this.entry) {
      this.logger(
        "[nexo-bridge] nexo-core não encontrado. Defina NEXO_HOME para ativar as tools nexo_* (opcional)."
      );
      return false;
    }
    try {
      this.proc = spawn(process.execPath, [this.entry, "serve-stdio"], {
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
        windowsHide: true,
      });
    } catch (e) {
      this.logger(`[nexo-bridge] falha ao iniciar nexo-core: ${e.message}`);
      this.proc = null;
      return false;
    }

    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => this._onData(chunk));
    this.proc.stderr.setEncoding("utf8");
    this.proc.stderr.on("data", (d) => this.logger(`[nexo-core] ${String(d).trim()}`));
    this.proc.on("exit", (code) => {
      this.ready = false;
      this._rejectAll(new Error(`nexo-core encerrou (code ${code})`));
      this.logger(`[nexo-bridge] nexo-core encerrou (code ${code}).`);
    });
    this.proc.on("error", (e) => {
      this.ready = false;
      this._rejectAll(e);
      this.logger(`[nexo-bridge] erro no processo nexo-core: ${e.message}`);
    });

    try {
      await this._rpc(
        "initialize",
        { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "mestre-do-pc", version: "10.0.0" } },
        DEFAULT_START_TIMEOUT_MS
      );
      const list = await this._rpc("tools/list", {}, DEFAULT_START_TIMEOUT_MS);
      const raw = Array.isArray(list?.tools) ? list.tools : [];
      this.tools = raw.map((t) => ({
        name: PREFIX + t.name,
        description: `[NEXO] ${t.description}`,
        inputSchema: t.inputSchema || { type: "object", properties: {} },
      }));
      this.ready = true;
      this.logger(`[nexo-bridge] conectado: ${this.tools.length} tools nexo_* disponíveis.`);
      return true;
    } catch (e) {
      this.logger(`[nexo-bridge] handshake falhou: ${e.message}. Seguindo sem as tools nexo_*.`);
      this.stop();
      return false;
    }
  }

  /**
   * Encaminha uma chamada de tool para o nexo-core. Retorna no formato de
   * conteúdo MCP do Mestre do PC ({ isError, content: [{type:'text',text}] }).
   */
  async callTool(prefixedName, args = {}) {
    if (!this.ready) {
      return {
        isError: true,
        content: [{ type: "text", text: "Ponte NEXO indisponível. Verifique NEXO_HOME e se o nexo-core está instalado." }],
      };
    }
    const name = this._strip(prefixedName);
    try {
      const res = await this._rpc("tools/call", { name, arguments: args || {} }, DEFAULT_CALL_TIMEOUT_MS);
      const content = Array.isArray(res?.content) && res.content.length
        ? res.content
        : [{ type: "text", text: "(sem conteúdo)" }];
      return { isError: Boolean(res?.isError), content };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `Falha na ponte NEXO (${name}): ${e.message}` }] };
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
        rejectPromise(new Error("subprocesso nexo-core não está gravável"));
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
      const entry = this._pending.get(msg.id);
      if (!entry) continue; // notificação ou id desconhecido
      this._pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.error) entry.reject(new Error(msg.error.message || "erro JSON-RPC"));
      else entry.resolve(msg.result);
    }
  }

  _rejectAll(err) {
    for (const [, entry] of this._pending) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this._pending.clear();
  }
}

export const nexoBridge = new NexoBridge();

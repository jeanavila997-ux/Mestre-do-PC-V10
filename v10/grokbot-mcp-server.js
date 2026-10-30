#!/usr/bin/env node
/**
 * grokbot-mcp-server.js — Servidor MCP Stdio Oficial do Mestre do PC V11 + Grok Bot
 * Compatível com Cursor, Claude Code, Codex CLI, OpenCode e qualquer cliente MCP stdio.
 * Faz proxy/execução local das ferramentas do Mestre do PC V11 (http://127.0.0.1:7777/mcp)
 * com fallback direto para grokbot-bridge.js.
 */

import readline from "node:readline";
import {
  getGrokBotStatus,
  getQuickSystemMetrics,
  runFastPcOptimization,
  syncGrokBotMemories,
  callGrokBotTool,
} from "./chat-integrado/grokbot-bridge.js";

const MESTRE_MCP_URL = process.env.MESTRE_MCP_URL || "http://127.0.0.1:7777/mcp";

async function forwardToHttpMcp(rpcRequest) {
  try {
    const resp = await fetch(MESTRE_MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mestre-Client": "v10-web",
      },
      body: JSON.stringify(rpcRequest),
      signal: AbortSignal.timeout(30000),
    });
    if (resp.status === 202) return null;
    if (resp.ok) return await resp.json();
  } catch {
    // fallback local abaixo se launcher.js não estiver respondendo
  }
  return undefined;
}

async function handleLocalFallback(rpc) {
  const id = rpc?.id !== undefined ? rpc.id : null;
  const method = rpc?.method || "";

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: rpc?.params?.protocolVersion || "2024-11-05",
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: { name: "mestre-do-pc-grokbot-mcp", version: "11.2.0" },
      },
    };
  }
  if (method.startsWith("notifications/")) return null;
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "mestre_system_status",
            description: "Métricas de CPU, RAM, Disco C: e Uptime do PC Windows.",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "mestre_optimize_ram_and_temp",
            description: "Limpa %TEMP%, Lixeira, DNS e otimiza a memória RAM.",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "mestre_ask_grok",
            description: "Consulta o Grok 4.7 via 9Router com contexto do Mestre do PC.",
            inputSchema: {
              type: "object",
              required: ["pergunta"],
              properties: { pergunta: { type: "string" } },
            },
          },
        ],
      },
    };
  }
  if (method === "tools/call") {
    const name = rpc?.params?.name;
    const args = rpc?.params?.arguments || {};
    let data;
    if (name === "mestre_system_status") data = await getQuickSystemMetrics();
    else if (name === "mestre_optimize_ram_and_temp") data = await runFastPcOptimization();
    else if (name === "mestre_save_memory") data = await syncGrokBotMemories({ note: args.conteudo || "" });
    else if (name === "mestre_ask_grok") data = await callGrokBotTool("grokbot__chat", args);
    else data = await getGrokBotStatus();
    return {
      jsonrpc: "2.0",
      id,
      result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], isError: false },
    };
  }
  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let rpc;
  try {
    rpc = JSON.parse(trimmed);
  } catch {
    return;
  }
  let response = await forwardToHttpMcp(rpc);
  if (response === undefined) {
    response = await handleLocalFallback(rpc);
  }
  if (response) {
    process.stdout.write(JSON.stringify(response) + "\n");
  }
});
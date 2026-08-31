// Implementação dos tools MCP locais de banco de dados MySQL/MariaDB.
// Reutiliza o connector.js e a autenticação via local-token.js.

import { query, testConnection, getDatabaseHost, getDatabaseName } from "./connector.js";
import { requireLocalMcpToken, isLocalMcpEnabled } from "../auth/local-token.js";
import { auditLog, AuditLevel } from "../audit-logger.js";

function sanitizeIdentifier(name) {
  // Permite apenas letras, números e underscore. Rejeita tudo o resto.
  if (typeof name !== "string") return null;
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, "");
  return cleaned.length > 0 && cleaned.length <= 64 ? cleaned : null;
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function getDbExtraTools() {
  if (!isLocalMcpEnabled()) {
    return [];
  }
  return [
    {
      name: "mcp_local_db_status",
      description: "Verifica se a conexão com o banco de dados MySQL/MariaDB configurado está funcionando. Requer local_mcp_token.",
      inputSchema: {
        type: "object",
        properties: {
          local_mcp_token: { type: "string", description: "Token de autenticação local (MESTRE_LOCAL_MCP_TOKEN)." },
        },
        required: ["local_mcp_token"],
      },
    },
    {
      name: "mcp_local_db_query",
      description: "Executa uma consulta SQL parametrizada de leitura (SELECT/SHOW/DESCRIBE) no banco local. Apenas SELECT é permitido. Requer local_mcp_token.",
      inputSchema: {
        type: "object",
        properties: {
          local_mcp_token: { type: "string", description: "Token de autenticação local (MESTRE_LOCAL_MCP_TOKEN)." },
          sql: { type: "string", description: "Comando SQL de leitura (apenas SELECT, SHOW ou DESCRIBE)." },
          params: { type: "array", description: "Parâmetros para o SQL (opcional)." },
          limit: { type: "number", description: "Máximo de linhas a retornar (padrão 100, máx 1000)." },
        },
        required: ["local_mcp_token", "sql"],
      },
    },
    {
      name: "mcp_local_db_insert_memory",
      description: "Armazena uma memória persistente no banco local. Requer local_mcp_token.",
      inputSchema: {
        type: "object",
        properties: {
          local_mcp_token: { type: "string", description: "Token de autenticação local (MESTRE_LOCAL_MCP_TOKEN)." },
          memory_type: { type: "string", description: "Tipo da memória (ex: chat, user, project, system)." },
          content: { type: "string", description: "Conteúdo da memória." },
          tags: { type: "array", description: "Lista de tags (opcional)." },
          source: { type: "string", description: "Origem/contexto (opcional)." },
        },
        required: ["local_mcp_token", "memory_type", "content"],
      },
    },
    {
      name: "mcp_local_db_list_memories",
      description: "Lista memórias persistentes do banco local, opcionalmente filtradas por tipo. Requer local_mcp_token.",
      inputSchema: {
        type: "object",
        properties: {
          local_mcp_token: { type: "string", description: "Token de autenticação local (MESTRE_LOCAL_MCP_TOKEN)." },
          memory_type: { type: "string", description: "Filtrar por tipo (opcional)." },
          limit: { type: "number", description: "Máximo de registros (padrão 50, máx 200)." },
        },
        required: ["local_mcp_token"],
      },
    },
    {
      name: "mcp_local_db_create_task",
      description: "Cria uma tarefa no banco local para acompanhamento pelo MCP. Requer local_mcp_token.",
      inputSchema: {
        type: "object",
        properties: {
          local_mcp_token: { type: "string", description: "Token de autenticação local (MESTRE_LOCAL_MCP_TOKEN)." },
          title: { type: "string", description: "Título da tarefa." },
          description: { type: "string", description: "Descrição (opcional)." },
          status: { type: "string", description: "pending, running, done ou failed (padrão: pending)." },
          payload: { type: "object", description: "Dados extras em JSON (opcional)." },
        },
        required: ["local_mcp_token", "title"],
      },
    },
    {
      name: "mcp_local_db_list_tasks",
      description: "Lista tarefas do banco local, opcionalmente filtradas por status. Requer local_mcp_token.",
      inputSchema: {
        type: "object",
        properties: {
          local_mcp_token: { type: "string", description: "Token de autenticação local (MESTRE_LOCAL_MCP_TOKEN)." },
          status: { type: "string", description: "pending, running, done ou failed (opcional)." },
          limit: { type: "number", description: "Máximo de registros (padrão 50, máx 200)." },
        },
        required: ["local_mcp_token"],
      },
    },
  ];
}

export async function handleDbTool(name, args) {
  if (!isLocalMcpEnabled()) {
    return { isError: true, content: [{ type: "text", text: "🔒 MCP local de banco de dados está desabilitado. Configure MESTRE_LOCAL_MCP_TOKEN e as variáveis MYSQL_* em .env.local." }] };
  }

  try {
    requireLocalMcpToken(args);
  } catch (e) {
    await auditLog(AuditLevel.SECURITY, "mcp_local_db_unauthorized", { tool: name, error: e.message });
    return { isError: true, content: [{ type: "text", text: `🚫 ${e.message}` }] };
  }

  // Auditoria de sucesso do token (o token em si nunca é logado).
  await auditLog(AuditLevel.INFO, "mcp_local_db_tool_called", { tool: name });

  if (name === "mcp_local_db_status") {
    try {
      const ok = await testConnection();
      return {
        content: [{
          type: "text",
          text: ok
            ? `✅ Conexão com MySQL/MariaDB funcionando em ${getDatabaseHost()}/${getDatabaseName()}.`
            : "⚠️ Conexão retornou resultado inesperado.",
        }],
      };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `❌ Falha na conexão: ${e.message}` }] };
    }
  }

  if (name === "mcp_local_db_query") {
    const sql = typeof args.sql === "string" ? args.sql.trim() : "";
    if (!sql) {
      throw new Error("Parâmetro 'sql' obrigatório.");
    }
    // Apenas comandos de leitura.
    const allowedPrefix = /^(SELECT|SHOW|DESCRIBE|EXPLAIN)\s/i.test(sql);
    if (!allowedPrefix) {
      await auditLog(AuditLevel.SECURITY, "mcp_local_db_write_blocked", { sql: sql.slice(0, 200) });
      return { isError: true, content: [{ type: "text", text: "🚫 Apenas consultas de leitura (SELECT/SHOW/DESCRIBE/EXPLAIN) são permitidas via MCP." }] };
    }
    const params = Array.isArray(args.params) ? args.params : [];
    const limit = Math.min(Math.max(1, Math.floor(Number(args.limit) || 100)), 1000);
    try {
      const rows = await query(sql, params);
      const limited = Array.isArray(rows) ? rows.slice(0, limit) : rows;
      return { content: [{ type: "text", text: `📊 ${Array.isArray(rows) ? rows.length : 0} registro(s) encontrado(s).\n\n${safeJson(limited)}` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `❌ Erro na consulta: ${e.message}` }] };
    }
  }

  if (name === "mcp_local_db_insert_memory") {
    const memoryType = sanitizeIdentifier(args.memory_type);
    const content = typeof args.content === "string" ? args.content : "";
    if (!memoryType || !content) {
      throw new Error("Parâmetros 'memory_type' e 'content' são obrigatórios.");
    }
    const tags = Array.isArray(args.tags) ? JSON.stringify(args.tags) : null;
    const source = typeof args.source === "string" ? args.source : "mcp";
    try {
      const result = await query(
        "INSERT INTO mcp_local_memories (memory_type, content, tags, source) VALUES (?, ?, ?, ?)",
        [memoryType, content, tags, source],
      );
      return { content: [{ type: "text", text: `✅ Memória armazenada (id: ${result.insertId}).` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `❌ Erro ao armazenar memória: ${e.message}` }] };
    }
  }

  if (name === "mcp_local_db_list_memories") {
    const memoryType = args.memory_type ? sanitizeIdentifier(args.memory_type) : null;
    const limit = Math.min(Math.max(1, Math.floor(Number(args.limit) || 50)), 200);
    try {
      const rows = memoryType
        ? await query("SELECT * FROM mcp_local_memories WHERE memory_type = ? ORDER BY created_at DESC LIMIT ?", [memoryType, limit])
        : await query("SELECT * FROM mcp_local_memories ORDER BY created_at DESC LIMIT ?", [limit]);
      return { content: [{ type: "text", text: `🧠 ${rows.length} memória(s) encontrada(s).\n\n${safeJson(rows)}` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `❌ Erro ao listar memórias: ${e.message}` }] };
    }
  }

  if (name === "mcp_local_db_create_task") {
    const title = typeof args.title === "string" ? args.title.trim() : "";
    if (!title) {
      throw new Error("Parâmetro 'title' obrigatório.");
    }
    const description = typeof args.description === "string" ? args.description : null;
    const status = ["pending", "running", "done", "failed"].includes(args.status) ? args.status : "pending";
    const payload = args.payload ? JSON.stringify(args.payload) : null;
    try {
      const result = await query(
        "INSERT INTO mcp_local_tasks (title, description, status, payload) VALUES (?, ?, ?, ?)",
        [title, description, status, payload],
      );
      return { content: [{ type: "text", text: `✅ Tarefa criada (id: ${result.insertId}).` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `❌ Erro ao criar tarefa: ${e.message}` }] };
    }
  }

  if (name === "mcp_local_db_list_tasks") {
    const status = ["pending", "running", "done", "failed"].includes(args.status) ? args.status : null;
    const limit = Math.min(Math.max(1, Math.floor(Number(args.limit) || 50)), 200);
    try {
      const rows = status
        ? await query("SELECT * FROM mcp_local_tasks WHERE status = ? ORDER BY created_at DESC LIMIT ?", [status, limit])
        : await query("SELECT * FROM mcp_local_tasks ORDER BY created_at DESC LIMIT ?", [limit]);
      return { content: [{ type: "text", text: `📋 ${rows.length} tarefa(s) encontrada(s).\n\n${safeJson(rows)}` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `❌ Erro ao listar tarefas: ${e.message}` }] };
    }
  }

  throw new Error(`Tool de banco desconhecida: ${name}`);
}

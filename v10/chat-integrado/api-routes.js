/**
 * api-routes.js — Rotas /api/* para o Chat Integrado
 *
 * Exporta handleApiRoute() que o launcher.js chama para despachar requisições
 * /api/*. Mantém o launcher limpo e separa responsabilidades.
 *
 * Endpoints:
 *   GET  /api/tools              — lista ferramentas disponíveis
 *   POST /api/tools/:name        — executa uma ferramenta
 *   GET  /api/profiles           — lista perfis de modelo
 *   POST /api/profiles/activate  — ativa um perfil
 *   GET  /api/conversas          — lista conversas
 *   POST /api/conversas          — cria conversa
 *   GET  /api/conversas/:id      — detalhe + mensagens
 *   DELETE /api/conversas/:id    — deleta conversa
 *   POST /api/conversas/:id/msg  — adiciona mensagem
 *   GET  /api/memorias           — lista memórias
 *   POST /api/memorias           — cria memória
 *   PUT  /api/memorias/:id       — atualiza memória
 *   DELETE /api/memorias/:id     — deleta memória
 *   POST /api/memorias/:id/toggle — ativa/desativa memória
 *   GET  /api/audit              — consulta auditoria
 *   GET  /api/sync/status        — status do sync MySQL
 *   POST /api/sync/now           — dispara sync manual
 *   GET  /api/config             — configurações do chat
 *   PUT  /api/config             — atualiza configuração
 */

import { TOOL_NAMES, executarTool, listProfiles, getProfileModel, getProfileOptions, getBestAvailableModel, getBestLocalModel, refreshAvailableModels } from "./tools-api.js";
import { searchWeb, fetchWebPage } from "./web-search.js";
import * as db from "./db.js";
import { sincronizarAgora, getStatus as getSyncStatus, iniciarSyncAutomatico } from "./mysql-sync.js";
import { auditLog, AuditLevel } from "../../mcp-server/audit-logger.js";

let syncStarted = false;

/** Ferramentas desativadas pelo usuário (config tool_disabled:<nome> = "1"). */
function getDisabledTools() {
  return new Set(
    db.listarConfig()
      .filter((r) => r.chave.startsWith("tool_disabled:") && r.valor === "1")
      .map((r) => r.chave.slice("tool_disabled:".length))
  );
}

/**
 * Lê o corpo JSON da requisição.
 */
async function readBody(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (c) => {
      buf += c;
      if (Buffer.byteLength(buf, "utf8") > maxBytes) {
        reject(new Error("Corpo da requisição excede o limite."));
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

function ok(res, data, origin) {
  const body = JSON.stringify(data);
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Mestre-Client, X-Mestre-Extension-Token, X-Mestre-Npp-Token",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function fail(res, status, data, origin) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Mestre-Client, X-Mestre-Extension-Token, X-Mestre-Npp-Token",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

/**
 * Despacha requisições /api/*. Retorna true se a rota foi tratada.
 * O launcher chama esta função para qualquer path começando com /api/.
 *
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 * @param {URL} url — URL já parseada
 * @param {{ isAuthorized: Function, allowedOrigin: string }} ctx
 * @returns {Promise<boolean>}
 */
export async function handleApiRoute(req, res, url, ctx) {
  const { isAuthorized, allowedOrigin } = ctx;
  const path = url.pathname;
  const method = req.method;
  const parts = path.split("/"); // ["", "api", "tools", ...]

  // Garante que o sync automático inicia uma única vez
  if (!syncStarted) {
    syncStarted = true;
    iniciarSyncAutomatico();
    console.log("[api-routes] Rotas /api/* ativas (tools, profiles, conversas, memorias, audit, sync, config)");
  }

  // OPTIONS pré-voo para qualquer rota /api/*
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Mestre-Client, X-Mestre-Extension-Token, X-Mestre-Npp-Token",
      "Vary": "Origin",
    });
    res.end();
    return true;
  }

  const auth = isAuthorized(req);

  // ── Tools ─────────────────────────────────────────────────────────

  if (path === "/api/tools" && method === "GET") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    const disabled = getDisabledTools();
    const enabledTools = TOOL_NAMES.filter((t) => !disabled.has(t));
    ok(res, {
      tools: enabledTools,
      total: enabledTools.length,
      totalTodas: TOOL_NAMES.length,
      desativadas: TOOL_NAMES.filter((t) => disabled.has(t)),
    }, allowedOrigin);
    return true;
  }

  // POST /api/tools/:name/toggle — ativa/desativa ferramenta
  if (parts[2] === "tools" && parts[3] && parts[4] === "toggle" && method === "POST") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    const toolName = parts[3];
    if (!TOOL_NAMES.includes(toolName)) {
      fail(res, 404, { error: `Ferramenta "${toolName}" não existe` }, allowedOrigin);
      return true;
    }
    const key = `tool_disabled:${toolName}`;
    const atual = db.getConfig(key, "0");
    const proximo = atual === "1" ? "0" : "1";
    db.setConfig(key, proximo);
    auditLog(AuditLevel.SECURITY, "tool_toggle", { tool: toolName, ativa: proximo === "0" });
    ok(res, { success: true, tool: toolName, ativa: proximo === "0" }, allowedOrigin);
    return true;
  }

  if (parts[2] === "tools" && parts[3] && !parts[4] && method === "POST") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    const toolName = parts[3];
    if (!TOOL_NAMES.includes(toolName)) {
      fail(res, 404, { error: `Ferramenta "${toolName}" não existe` }, allowedOrigin);
      return true;
    }
    if (db.getConfig(`tool_disabled:${toolName}`, "0") === "1") {
      auditLog(AuditLevel.SECURITY, "tool_blocked_disabled", { tool: toolName });
      fail(res, 403, { success: false, error: `Ferramenta "${toolName}" está desativada. Ative-a no painel de ferramentas.` }, allowedOrigin);
      return true;
    }
    let body;
    try {
      body = await readBody(req);
    } catch {
      fail(res, 400, { error: "JSON inválido" }, allowedOrigin);
      return true;
    }
    try {
      const result = await executarTool(toolName, body);
      ok(res, { success: true, result }, allowedOrigin);
    } catch (err) {
      auditLog(AuditLevel.ERROR, "tool_error", { tool: toolName, error: err.message });
      fail(res, 500, { success: false, error: err.message }, allowedOrigin);
    }
    return true;
  }

  // ── Profiles ──────────────────────────────────────────────────────

  if (path === "/api/profiles" && method === "GET") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    await refreshAvailableModels();
    const modeloDisponivel = await getBestAvailableModel();
    const modeloLocal = await getBestLocalModel();
    ok(res, {
      perfis: listProfiles(),
      modelo_ativo: modeloDisponivel,
      modelo_local: modeloLocal,
      modelo_configurado: getProfileModel(),
      opcoes: getProfileOptions(),
      modelos_disponiveis: true,
    }, allowedOrigin);
    return true;
  }

  if (path === "/api/profiles/activate" && method === "POST") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    let body;
    try { body = await readBody(req); } catch { fail(res, 400, { error: "JSON inválido" }, allowedOrigin); return true; }
    const perfil = body.perfil;
    const profiles = listProfiles();
    if (!profiles.find(p => p.id === perfil)) {
      fail(res, 404, { error: `Perfil "${perfil}" não existe` }, allowedOrigin);
      return true;
    }
    ok(res, {
      perfil,
      modelo: getProfileModel(perfil),
      opcoes: getProfileOptions(perfil),
      mensagem: `Defina OLLAMA_MODEL_PROFILE=${perfil} e reinicie o launcher para ativar permanentemente.`,
    }, allowedOrigin);
    return true;
  }

  // ── Conversas ─────────────────────────────────────────────────────

  if (path === "/api/conversas" && method === "GET") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    const limite = Number(url.searchParams.get("limit")) || 50;
    ok(res, { conversas: db.listarConversas(limite) }, allowedOrigin);
    return true;
  }

  if (path === "/api/conversas" && method === "POST") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    let body;
    try { body = await readBody(req); } catch { fail(res, 400, { error: "JSON inválido" }, allowedOrigin); return true; }
    const conv = db.criarConversa(body.titulo, body.modelo, body.perfil);
    fail(res, 201, conv, allowedOrigin);
    return true;
  }

  if (parts[2] === "conversas" && parts[3] && !parts[4] && method === "GET") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    const conv = db.getConversa(parts[3]);
    if (!conv) { fail(res, 404, { error: "Conversa não encontrada" }, allowedOrigin); return true; }
    const msgs = db.getMensagens(parts[3]);
    ok(res, { conversa: conv, mensagens: msgs }, allowedOrigin);
    return true;
  }

  if (parts[2] === "conversas" && parts[3] && !parts[4] && method === "DELETE") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    db.deletarConversa(parts[3]);
    ok(res, { success: true }, allowedOrigin);
    return true;
  }

  if (parts[2] === "conversas" && parts[3] && parts[4] === "msg" && method === "POST") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    let body;
    try { body = await readBody(req); } catch { fail(res, 400, { error: "JSON inválido" }, allowedOrigin); return true; }
    const msg = db.addMensagem(parts[3], body.role, body.content, body.tool_name, body.tool_result);
    fail(res, 201, msg, allowedOrigin);
    return true;
  }

  // ── Memórias ──────────────────────────────────────────────────────

  if (path === "/api/memorias" && method === "GET") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    ok(res, { memorias: db.listarMemorias() }, allowedOrigin);
    return true;
  }

  if (path === "/api/memorias" && method === "POST") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    let body;
    try { body = await readBody(req); } catch { fail(res, 400, { error: "JSON inválido" }, allowedOrigin); return true; }
    const mem = db.addMemoria(body.titulo, body.conteudo);
    fail(res, 201, mem, allowedOrigin);
    return true;
  }

  if (parts[2] === "memorias" && parts[3] && !parts[4] && method === "PUT") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    let body;
    try { body = await readBody(req); } catch { fail(res, 400, { error: "JSON inválido" }, allowedOrigin); return true; }
    db.atualizarMemoria(parts[3], body);
    ok(res, { success: true }, allowedOrigin);
    return true;
  }

  if (parts[2] === "memorias" && parts[3] && !parts[4] && method === "DELETE") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    db.deletarMemoria(parts[3]);
    ok(res, { success: true }, allowedOrigin);
    return true;
  }

  if (parts[2] === "memorias" && parts[3] && parts[4] === "toggle" && method === "POST") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    const mem = db.getMemoria(parts[3]);
    if (!mem) { fail(res, 404, { error: "Memória não encontrada" }, allowedOrigin); return true; }
    db.atualizarMemoria(parts[3], { ativa: !mem.ativa });
    ok(res, { success: true, ativa: !mem.ativa }, allowedOrigin);
    return true;
  }

  // ── Auditoria ─────────────────────────────────────────────────────

  if (path === "/api/audit" && method === "GET") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    const params = url.searchParams;
    ok(res, {
      entries: db.queryAuditoria({
        level: params.get("level"),
        action: params.get("action"),
        startDate: params.get("start_date"),
        endDate: params.get("end_date"),
        limit: Number(params.get("limit")) || 100,
      }),
    }, allowedOrigin);
    return true;
  }

  // ── Sync MySQL ────────────────────────────────────────────────────

  if (path === "/api/sync/status" && method === "GET") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    ok(res, getSyncStatus(), allowedOrigin);
    return true;
  }

  if (path === "/api/sync/now" && method === "POST") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    const result = await sincronizarAgora();
    ok(res, result, allowedOrigin);
    return true;
  }

  // ── Config ────────────────────────────────────────────────────────

  if (path === "/api/config" && method === "GET") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    const config = {};
    for (const row of db.listarConfig()) {
      config[row.chave] = row.valor;
    }
    ok(res, config, allowedOrigin);
    return true;
  }

  if (path === "/api/config" && method === "PUT") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    let body;
    try { body = await readBody(req); } catch { fail(res, 400, { error: "JSON inválido" }, allowedOrigin); return true; }
    for (const [chave, valor] of Object.entries(body)) {
      db.setConfig(chave, valor);
    }
    ok(res, { success: true }, allowedOrigin);
    return true;
  }

  // ── Web search / web fetch ────────────────────────────────────────

  if (path === "/api/web-search" && method === "GET") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    const query = url.searchParams.get("q");
    const maxResults = Number(url.searchParams.get("max_results")) || 5;
    try {
      const results = await searchWeb(query, maxResults);
      ok(res, { results }, allowedOrigin);
    } catch (err) {
      auditLog(AuditLevel.ERROR, "web_search_error", { query, error: err.message });
      fail(res, 502, { error: err.message }, allowedOrigin);
    }
    return true;
  }

  if (path === "/api/web-fetch" && method === "GET") {
    if (!auth) return fail(res, 403, { error: "Não autorizado" }, allowedOrigin), true;
    const targetUrl = url.searchParams.get("url");
    try {
      const page = await fetchWebPage(targetUrl);
      ok(res, page, allowedOrigin);
    } catch (err) {
      auditLog(AuditLevel.ERROR, "web_fetch_error", { url: targetUrl, error: err.message });
      fail(res, 502, { error: err.message }, allowedOrigin);
    }
    return true;
  }

  // Rota /api/ não reconhecida
  fail(res, 404, { error: "Rota /api não encontrada" }, allowedOrigin);
  return true;
}
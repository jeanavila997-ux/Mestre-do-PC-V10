#!/usr/bin/env node

/**
 * Rotas de API para Gestão de Memórias - Mestre do PC V10/V11
 * Integração com o launcher.js
 */

import { 
  createMemory, 
  listMemories, 
  getMemory, 
  updateMemory, 
  deleteMemory, 
  exportMemories, 
  importMemories,
  searchRelevantMemories
} from "./memory-manager.js";

/**
 * Handler para rotas de memórias
 * @param {object} req - Request HTTP
 * @param {object} res - Response HTTP
 * @param {URL} url - URL parsed
 * @param {function} isAuthorized - Função de autorização
 * @param {string} allowedOrigin - Origem permitida
 * @returns {boolean} true se a rota foi tratada
 */
export async function handleMemoryRoutes(req, res, url, { isAuthorized, allowedOrigin }) {
  const path = url.pathname;
  
  // POST /memories/create - Cria nova memória
  if (path === "/memories/create" && req.method === "POST") {
    if (!isAuthorized(req)) {
      sendJsonResponse(res, 403, { error: "Não autorizado." }, allowedOrigin);
      return true;
    }
    const body = await readBody(req);
    const { type, title, content, metadata } = body;
    if (!content) {
      sendJsonResponse(res, 400, { error: "Conteúdo é obrigatório." });
      return true;
    }
    const memory = await createMemory(type, title, content, metadata);
    sendJsonResponse(res, 201, { success: true, memory }, allowedOrigin);
    return true;
  }

  // GET /memories/list - Lista memórias com filtros
  if (path === "/memories/list" && req.method === "GET") {
    if (!isAuthorized(req)) {
      sendJsonResponse(res, 403, { error: "Não autorizado." }, allowedOrigin);
      return true;
    }
    const filters = {};
    if (url.searchParams.has("type")) filters.type = url.searchParams.get("type");
    if (url.searchParams.has("tags")) filters.tags = url.searchParams.get("tags").split(",");
    if (url.searchParams.has("search")) filters.search = url.searchParams.get("search");
    if (url.searchParams.has("limit")) filters.limit = parseInt(url.searchParams.get("limit"));
    const memories = await listMemories(filters);
    sendJsonResponse(res, 200, { success: true, memories }, allowedOrigin);
    return true;
  }

  // GET /memories/get/:id - Obtém memória por ID
  if (path.startsWith("/memories/get/") && req.method === "GET") {
    if (!isAuthorized(req)) {
      sendJsonResponse(res, 403, { error: "Não autorizado." }, allowedOrigin);
      return true;
    }
    const id = path.split("/").pop();
    const memory = await getMemory(id);
    if (!memory) {
      sendJsonResponse(res, 404, { error: "Memória não encontrada." });
      return true;
    }
    sendJsonResponse(res, 200, { success: true, memory }, allowedOrigin);
    return true;
  }

  // PUT /memories/update/:id - Atualiza memória
  if (path.startsWith("/memories/update/") && req.method === "PUT") {
    if (!isAuthorized(req)) {
      sendJsonResponse(res, 403, { error: "Não autorizado." }, allowedOrigin);
      return true;
    }
    const id = path.split("/").pop();
    const body = await readBody(req);
    const memory = await updateMemory(id, body);
    if (!memory) {
      sendJsonResponse(res, 404, { error: "Memória não encontrada." });
      return true;
    }
    sendJsonResponse(res, 200, { success: true, memory }, allowedOrigin);
    return true;
  }

  // DELETE /memories/delete/:id - Exclui memória
  if (path.startsWith("/memories/delete/") && req.method === "DELETE") {
    if (!isAuthorized(req)) {
      sendJsonResponse(res, 403, { error: "Não autorizado." }, allowedOrigin);
      return true;
    }
    const id = path.split("/").pop();
    const deleted = await deleteMemory(id);
    sendJsonResponse(res, 200, { success: deleted, id }, allowedOrigin);
    return true;
  }

  // GET /memories/search - Busca memórias relevantes
  if (path === "/memories/search" && req.method === "GET") {
    if (!isAuthorized(req)) {
      sendJsonResponse(res, 403, { error: "Não autorizado." }, allowedOrigin);
      return true;
    }
    const query = url.searchParams.get("q") || "";
    const limit = parseInt(url.searchParams.get("limit") || "5");
    const memories = await searchRelevantMemories(query, limit);
    sendJsonResponse(res, 200, { success: true, memories }, allowedOrigin);
    return true;
  }

  // GET /memories/export - Exporta memórias (JSON, CSV, XLSX)
  if (path === "/memories/export" && req.method === "GET") {
    if (!isAuthorized(req)) {
      sendJsonResponse(res, 403, { error: "Não autorizado." }, allowedOrigin);
      return true;
    }
    const format = url.searchParams.get("format") || "csv";
    const filters = {};
    if (url.searchParams.has("type")) filters.type = url.searchParams.get("type");
    if (url.searchParams.has("tags")) filters.tags = url.searchParams.get("tags").split(",");
    
    const exportData = await exportMemories(format, filters);
    res.writeHead(200, {
      "Content-Type": exportData.mimeType,
      "Content-Disposition": `attachment; filename="${exportData.filename}"`,
      "X-Content-Type-Options": "nosniff",
    });
    res.end(exportData.content);
    return true;
  }

  // POST /memories/import - Importa memórias (JSON, CSV, XLSX)
  if (path === "/memories/import" && req.method === "POST") {
    if (!isAuthorized(req)) {
      sendJsonResponse(res, 403, { error: "Não autorizado." }, allowedOrigin);
      return true;
    }
    const body = await readBody(req, 10 * 1024 * 1024); // 10MB max
    const format = body.format || "json";
    const content = body.content;
    
    if (!content) {
      sendJsonResponse(res, 400, { error: "Conteúdo é obrigatório." });
      return true;
    }
    
    const result = await importMemories(content, format);
    sendJsonResponse(res, 200, result, allowedOrigin);
    return true;
  }

  // GET /memories/stats - Estatísticas de memórias
  if (path === "/memories/stats" && req.method === "GET") {
    if (!isAuthorized(req)) {
      sendJsonResponse(res, 403, { error: "Não autorizado." }, allowedOrigin);
      return true;
    }
    const allMemories = await listMemories({ limit: 10000 });
    const stats = {
      total: allMemories.length,
      byType: {},
      recentCount: allMemories.filter(m => {
        const daysOld = (Date.now() - new Date(m.metadata.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        return daysOld < 30;
      }).length,
    };
    
    // Conta por tipo
    allMemories.forEach(m => {
      stats.byType[m.type] = (stats.byType[m.type] || 0) + 1;
    });
    
    sendJsonResponse(res, 200, { success: true, stats }, allowedOrigin);
    return true;
  }

  return false;
}

/**
 * Lê corpo da requisição
 */
async function readBody(req, maxBytes = 2 * 1024 * 1024) {
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

/**
 * Envia resposta JSON
 */
function sendJsonResponse(res, status, data, allowOrigin = "*") {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Mestre-Client",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

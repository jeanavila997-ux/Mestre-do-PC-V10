#!/usr/bin/env node

/**
 * operation-routes.js — Rotas de gestão de operações/comandos (whitelist)
 *
 * Permite editar, ativar, desativar, criar e excluir comandos da
 * allowed-operations.json direto pela interface web (/gerenciar-comandos.html),
 * sem editar o JSON à mão. Mutations validam o catálogo inteiro antes de
 * persistir e recarregam o registry do launcher em memória.
 *
 * Endpoints (todos exigem autorização v10-web/mcp local):
 *   GET    /operations                  — lista (filtros: search, categoria, status, type)
 *   GET    /operations/:id              — detalhe de uma operação
 *   POST   /operations                  — cria nova operação
 *   PUT    /operations/:id              — edita campos (título, comando/pattern, categoria, etc.)
 *   POST   /operations/:id/toggle       — ativa/desativa
 *   DELETE /operations/:id              — exclui
 */

import { copyFile, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OperationRegistry } from "./operation-registry.js";
import { auditLog, AuditLevel } from "../mcp-server/audit-logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPERATIONS_FILE = join(__dirname, "allowed-operations.json");
const MAX_CMD_LENGTH = 32768;

// ── Helpers ─────────────────────────────────────────────────────────

function jsonHeaders(origin) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Mestre-Client, X-Mestre-Extension-Token, X-Mestre-Npp-Token",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  };
}

function ok(res, data, origin, status = 200) {
  res.writeHead(status, jsonHeaders(origin));
  res.end(JSON.stringify(data));
}

function fail(res, status, data, origin) {
  res.writeHead(status, jsonHeaders(origin));
  res.end(JSON.stringify(data));
}

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

async function loadCatalog() {
  const raw = await readFile(OPERATIONS_FILE, "utf8");
  return JSON.parse(raw);
}

async function saveCatalog(catalog) {
  const tempFile = OPERATIONS_FILE + ".tmp-" + process.pid + "-" + Date.now();
  const backupFile = OPERATIONS_FILE + ".bak";
  const hadOriginal = existsSync(OPERATIONS_FILE);
  await writeFile(tempFile, JSON.stringify(catalog, null, 2), "utf8");
  try {
    if (hadOriginal) await copyFile(OPERATIONS_FILE, backupFile);
    await rename(tempFile, OPERATIONS_FILE);
  } catch (error) {
    try { await unlink(tempFile); } catch {}
    throw error;
  }
}

/** Valida o catálogo modificado construindo um registry de teste. */
function validateCatalog(catalog) {
  try {
    const test = new OperationRegistry(catalog);
    const report = test.validate();
    if (!report.ok) return { ok: false, error: report.errors.join("; ") };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Catálogo inválido: " + e.message };
  }
}

function slugifyId(title) {
  const base = String(title)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "operacao";
  return base;
}

/** Lista unificada: operations + fixed templates + parametrized templates. */
function flattenEntries(catalog) {
  const ops = Array.isArray(catalog) ? catalog : catalog.operations || [];
  const templates = (!Array.isArray(catalog) && catalog.templates) ? catalog.templates : [];
  const fixed = templates.filter((t) => typeof t.command === "string");
  const parametrized = templates.filter((t) => typeof t.pattern === "string");
  const out = [];
  for (const op of ops) {
    out.push({
      id: op.id, title: op.title || op.id, category: op.category || "",
      destructive: !!op.destructive, description: op.description || "",
      command: op.command, type: "operation", enabled: op.enabled !== false,
    });
  }
  for (const t of fixed) {
    out.push({
      id: t.id, title: t.title || t.id, category: t.category || "",
      destructive: !!t.destructive, description: t.description || "",
      command: t.command, type: "operation", enabled: t.enabled !== false,
    });
  }
  for (const t of parametrized) {
    out.push({
      id: t.id, title: t.title || t.id, category: t.category || "",
      destructive: !!t.destructive, description: t.description || "",
      pattern: t.pattern, params: t.params || {}, type: "template",
      enabled: t.enabled !== false,
    });
  }
  return out;
}

function findRawEntry(catalog, id) {
  const ops = Array.isArray(catalog) ? catalog : catalog.operations || [];
  const templates = (!Array.isArray(catalog) && catalog.templates) ? catalog.templates : [];
  const opIdx = ops.findIndex((o) => o.id === id);
  if (opIdx >= 0) return { kind: "operations", index: opIdx, list: ops, entry: ops[opIdx] };
  const tplIdx = templates.findIndex((t) => t.id === id);
  if (tplIdx >= 0) return { kind: "templates", index: tplIdx, list: templates, entry: templates[tplIdx] };
  return null;
}

// ── Handler principal ───────────────────────────────────────────────

export async function handleOperationRoutes(req, res, url, ctx) {
  const { isAuthorized, allowedOrigin, reloadRegistry } = ctx;
  const path = url.pathname;
  const method = req.method;
  const parts = path.split("/"); // ["", "operations", ...]

  if (method === "OPTIONS") {
    res.writeHead(204, jsonHeaders(allowedOrigin));
    res.end();
    return true;
  }

  if (!isAuthorized(req)) {
    fail(res, 403, { error: "Não autorizado." }, allowedOrigin);
    return true;
  }

  // GET /operations — lista com filtros
  if (path === "/operations" && method === "GET") {
    try {
      const catalog = await loadCatalog();
      let entries = flattenEntries(catalog);
      const search = (url.searchParams.get("search") || "").toLowerCase().trim();
      const categoria = url.searchParams.get("categoria") || "";
      const status = url.searchParams.get("status") || "";
      const type = url.searchParams.get("type") || "";
      if (search) {
        entries = entries.filter((e) =>
          (e.title || "").toLowerCase().includes(search) ||
          (e.id || "").toLowerCase().includes(search) ||
          (e.command || e.pattern || "").toLowerCase().includes(search) ||
          (e.description || "").toLowerCase().includes(search)
        );
      }
      if (categoria) entries = entries.filter((e) => e.category === categoria);
      if (status === "ativo") entries = entries.filter((e) => e.enabled);
      if (status === "inativo") entries = entries.filter((e) => !e.enabled);
      if (type) entries = entries.filter((e) => e.type === type);
      const all = flattenEntries(catalog);
      const categorias = [...new Set(all.map((e) => e.category).filter(Boolean))].sort();
      ok(res, {
        success: true,
        operations: entries,
        total: entries.length,
        totalGeral: all.length,
        ativos: all.filter((e) => e.enabled).length,
        inativos: all.filter((e) => !e.enabled).length,
        destrutivas: all.filter((e) => e.destructive).length,
        categorias,
      }, allowedOrigin);
    } catch (e) {
      fail(res, 500, { error: "Falha ao listar operações: " + e.message }, allowedOrigin);
    }
    return true;
  }

  // GET /operations/:id — detalhe
  if (parts[2] && !parts[3] && method === "GET") {
    try {
      const catalog = await loadCatalog();
      const entry = flattenEntries(catalog).find((e) => e.id === parts[2]);
      if (!entry) { fail(res, 404, { error: "Operação não encontrada." }, allowedOrigin); return true; }
      ok(res, { success: true, operation: entry }, allowedOrigin);
    } catch (e) {
      fail(res, 500, { error: e.message }, allowedOrigin);
    }
    return true;
  }

  // POST /operations — criar
  if (path === "/operations" && method === "POST") {
    let body;
    try { body = await readBody(req); } catch (e) { fail(res, 400, { error: e.message }, allowedOrigin); return true; }
    const title = String(body.title || "").trim();
    const command = String(body.command || "").trim();
    const category = String(body.category || "Outros").trim() || "Outros";
    const description = String(body.description || "").trim();
    const destructive = body.destructive === true;
    if (!title) { fail(res, 400, { error: "Título é obrigatório." }, allowedOrigin); return true; }
    if (!command) { fail(res, 400, { error: "Comando é obrigatório." }, allowedOrigin); return true; }
    if (command.length > MAX_CMD_LENGTH) { fail(res, 400, { error: "Comando excede o limite de tamanho." }, allowedOrigin); return true; }
    try {
      const catalog = await loadCatalog();
      if (!Array.isArray(catalog.operations)) catalog.operations = [];
      let id = body.id ? String(body.id).trim() : slugifyId(title);
      const all = flattenEntries(catalog);
      let suffix = 2;
      while (all.some((e) => e.id === id)) {
        id = slugifyId(title) + "_" + suffix++;
      }
      catalog.operations.push({ id, title, category, destructive, command, description, enabled: true });
      const check = validateCatalog(catalog);
      if (!check.ok) { fail(res, 400, { error: check.error }, allowedOrigin); return true; }
      await saveCatalog(catalog);
      await reloadRegistry();
      auditLog(AuditLevel.SECURITY, "operation_create", { id, title, category, destructive });
      ok(res, { success: true, operation: { id, title, category, destructive, command, description, type: "operation", enabled: true } }, allowedOrigin, 201);
    } catch (e) {
      fail(res, 500, { error: "Falha ao criar: " + e.message }, allowedOrigin);
    }
    return true;
  }

  // PUT /operations/:id — editar
  if (parts[2] && !parts[3] && method === "PUT") {
    let body;
    try { body = await readBody(req); } catch (e) { fail(res, 400, { error: e.message }, allowedOrigin); return true; }
    try {
      const catalog = await loadCatalog();
      const found = findRawEntry(catalog, parts[2]);
      if (!found) { fail(res, 404, { error: "Operação não encontrada." }, allowedOrigin); return true; }
      const entry = found.entry;
      const changes = {};
      if (body.title !== undefined) { entry.title = String(body.title).trim(); changes.title = entry.title; }
      if (body.category !== undefined) { entry.category = String(body.category).trim() || "Outros"; changes.category = entry.category; }
      if (body.description !== undefined) { entry.description = String(body.description).trim(); changes.description = entry.description; }
      if (body.destructive !== undefined) { entry.destructive = body.destructive === true; changes.destructive = entry.destructive; }
      if (body.command !== undefined) {
        if (typeof entry.pattern === "string") {
          // Template parametrizado: o campo editável é o pattern.
          const pattern = String(body.command).trim();
          if (!pattern) { fail(res, 400, { error: "Pattern não pode ser vazio." }, allowedOrigin); return true; }
          entry.pattern = pattern; changes.pattern = pattern;
        } else {
          const command = String(body.command).trim();
          if (!command) { fail(res, 400, { error: "Comando não pode ser vazio." }, allowedOrigin); return true; }
          if (command.length > MAX_CMD_LENGTH) { fail(res, 400, { error: "Comando excede o limite." }, allowedOrigin); return true; }
          entry.command = command; changes.command = command;
        }
      }
      if (!entry.title || !entry.category) { fail(res, 400, { error: "Título e categoria são obrigatórios." }, allowedOrigin); return true; }
      const check = validateCatalog(catalog);
      if (!check.ok) { fail(res, 400, { error: check.error }, allowedOrigin); return true; }
      await saveCatalog(catalog);
      await reloadRegistry();
      auditLog(AuditLevel.SECURITY, "operation_update", { id: parts[2], changes });
      ok(res, { success: true, operation: entry }, allowedOrigin);
    } catch (e) {
      fail(res, 500, { error: "Falha ao editar: " + e.message }, allowedOrigin);
    }
    return true;
  }

  // POST /operations/:id/toggle — ativar/desativar
  if (parts[2] && parts[3] === "toggle" && method === "POST") {
    let body = {};
    try { body = await readBody(req); } catch { body = {}; }
    try {
      const catalog = await loadCatalog();
      const found = findRawEntry(catalog, parts[2]);
      if (!found) { fail(res, 404, { error: "Operação não encontrada." }, allowedOrigin); return true; }
      const entry = found.entry;
      const next = typeof body.enabled === "boolean" ? body.enabled : entry.enabled !== false ? false : true;
      if (next) delete entry.enabled; else entry.enabled = false;
      await saveCatalog(catalog);
      await reloadRegistry();
      auditLog(AuditLevel.SECURITY, "operation_toggle", { id: parts[2], enabled: next });
      ok(res, { success: true, id: parts[2], enabled: next }, allowedOrigin);
    } catch (e) {
      fail(res, 500, { error: "Falha ao alternar: " + e.message }, allowedOrigin);
    }
    return true;
  }

  // DELETE /operations/:id — excluir
  if (parts[2] && !parts[3] && method === "DELETE") {
    try {
      const catalog = await loadCatalog();
      const found = findRawEntry(catalog, parts[2]);
      if (!found) { fail(res, 404, { error: "Operação não encontrada." }, allowedOrigin); return true; }
      found.list.splice(found.index, 1);
      const check = validateCatalog(catalog);
      if (!check.ok) { fail(res, 400, { error: check.error }, allowedOrigin); return true; }
      await saveCatalog(catalog);
      await reloadRegistry();
      auditLog(AuditLevel.SECURITY, "operation_delete", { id: parts[2] });
      ok(res, { success: true, id: parts[2] }, allowedOrigin);
    } catch (e) {
      fail(res, 500, { error: "Falha ao excluir: " + e.message }, allowedOrigin);
    }
    return true;
  }

  fail(res, 404, { error: "Rota /operations não encontrada." }, allowedOrigin);
  return true;
}

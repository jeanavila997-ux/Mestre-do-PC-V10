#!/usr/bin/env node

/**
 * soul-routes.js — Rotas de gestão do perfil do agente (arquivos Soul.md)
 *
 * Permite ler e editar os arquivos de persona/memória do agente direto pela
 * interface web (/gerenciar-comandos.html, aba "Perfil do Agente"), sem
 * precisar abrir os arquivos à mão.
 *
 * Segurança: apenas os perfis registrados em SOUL_PROFILES podem ser lidos ou
 * gravados — nunca um caminho arbitrário. IDs vêm de uma lista fixa (sem
 * path traversal), o conteúdo é limitado em tamanho e toda gravação é
 * auditada em nível SECURITY com backup .bak do arquivo anterior.
 *
 * Endpoints (todos exigem autorização v10-web/mcp local):
 *   GET  /soul           — lista os perfis disponíveis (id, título, caminho, modificado)
 *   GET  /soul/:id       — conteúdo do perfil
 *   PUT  /soul/:id       — grava o conteúdo ({content: string})
 */

import { copyFile, readFile, writeFile, rename, unlink, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { auditLog, AuditLevel } from "../mcp-server/audit-logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(__dirname, "..");
const MAX_SOUL_BYTES = 256 * 1024; // 256 KB — perfis são texto curto/médio

// Pasta base opcional para os arquivos de perfil (usada pelos testes para
// não tocar nos arquivos reais). Sem a env var, cada perfil usa seu
// caminho padrão dentro do projeto / do perfil do usuário.
const SOUL_DIR = process.env.MESTRE_SOUL_DIR || "";

// Whitelist fixa de arquivos de perfil. Nenhum outro caminho é aceito;
// IDs nunca são convertidos em caminho, apenas usados como chave.
const SOUL_PROFILES = {
  chat: {
    file: SOUL_DIR ? join(SOUL_DIR, "chat-Soul.md") : join(PROJECT_DIR, "v10", "chat", "Soul.md"),
    title: "Agente CHAT IA (persona do chat)",
    description: "Identidade, tom de voz e instruções do agente do chat integrado.",
  },
  workspace: {
    file: SOUL_DIR ? join(SOUL_DIR, "workspace-SOUL.md") : join(process.env.USERPROFILE || PROJECT_DIR, "SOUL.md"),
    title: "Memória de interação do workspace",
    description: "Preferências e diretrizes de interação usadas pelos agentes locais.",
  },
};

// ── Helpers ─────────────────────────────────────────────────────────

function jsonHeaders(origin) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
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

async function readBody(req, maxBytes) {
  const limit = maxBytes || MAX_SOUL_BYTES + 64 * 1024;
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (c) => {
      buf += c;
      if (Buffer.byteLength(buf, "utf8") > limit) {
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

async function fileInfo(file) {
  try {
    const s = await stat(file);
    return { exists: true, size: s.size, modified: s.mtime.toISOString() };
  } catch {
    return { exists: false, size: 0, modified: null };
  }
}

/** Gravação atômica com backup: .bak recebe o conteúdo anterior. */
async function saveWithBackup(file, content) {
  const tempFile = file + ".tmp-" + process.pid + "-" + Date.now();
  const backupFile = file + ".bak";
  await mkdir(dirname(file), { recursive: true });
  await writeFile(tempFile, content, "utf8");
  try {
    if (existsSync(file)) await copyFile(file, backupFile);
    await rename(tempFile, file);
  } catch (error) {
    try { await unlink(tempFile); } catch {}
    throw error;
  }
}

// ── Handler principal ───────────────────────────────────────────────

export async function handleSoulRoutes(req, res, url, ctx) {
  const { isAuthorized, allowedOrigin } = ctx;
  const path = url.pathname;
  const method = req.method;
  const parts = path.split("/"); // ["", "soul", ...]

  if (method === "OPTIONS") {
    res.writeHead(204, jsonHeaders(allowedOrigin));
    res.end();
    return true;
  }

  if (!isAuthorized(req)) {
    fail(res, 403, { error: "Não autorizado." }, allowedOrigin);
    return true;
  }

  // GET /soul — lista perfis disponíveis
  if (path === "/soul" && method === "GET") {
    try {
      const profiles = [];
      for (const [id, def] of Object.entries(SOUL_PROFILES)) {
        const info = await fileInfo(def.file);
        profiles.push({
          id, title: def.title, description: def.description,
          path: def.file, exists: info.exists, size: info.size, modified: info.modified,
        });
      }
      ok(res, { success: true, profiles }, allowedOrigin);
    } catch (e) {
      fail(res, 500, { error: "Falha ao listar perfis: " + e.message }, allowedOrigin);
    }
    return true;
  }

  // Rotas com :id — só aceita IDs da whitelist fixa
  const id = parts[2] ? decodeURIComponent(parts[2]) : "";
  const profile = Object.prototype.hasOwnProperty.call(SOUL_PROFILES, id) ? SOUL_PROFILES[id] : null;
  if (parts[2] && !profile) {
    fail(res, 404, { error: "Perfil não encontrado. Perfis permitidos: " + Object.keys(SOUL_PROFILES).join(", ") }, allowedOrigin);
    return true;
  }

  // GET /soul/:id — conteúdo do perfil
  if (parts[2] && !parts[3] && method === "GET") {
    try {
      const info = await fileInfo(profile.file);
      let content = "";
      if (info.exists) content = await readFile(profile.file, "utf8");
      ok(res, {
        success: true,
        profile: {
          id, title: profile.title, description: profile.description,
          path: profile.file, modified: info.modified, exists: info.exists, content,
        },
      }, allowedOrigin);
    } catch (e) {
      fail(res, 500, { error: "Falha ao ler perfil: " + e.message }, allowedOrigin);
    }
    return true;
  }

  // PUT /soul/:id — grava o conteúdo
  if (parts[2] && !parts[3] && method === "PUT") {
    let body;
    try { body = await readBody(req); } catch (e) { fail(res, 400, { error: e.message }, allowedOrigin); return true; }
    const content = body.content;
    if (typeof content !== "string") { fail(res, 400, { error: "Campo 'content' (string) é obrigatório." }, allowedOrigin); return true; }
    if (Buffer.byteLength(content, "utf8") > MAX_SOUL_BYTES) { fail(res, 400, { error: "Conteúdo excede o limite de 256 KB." }, allowedOrigin); return true; }
    try {
      await saveWithBackup(profile.file, content);
      const info = await fileInfo(profile.file);
      auditLog(AuditLevel.SECURITY, "soul_profile_update", { id, bytes: Buffer.byteLength(content, "utf8"), file: profile.file });
      ok(res, { success: true, id, modified: info.modified, size: info.size, backup: profile.file + ".bak" }, allowedOrigin);
    } catch (e) {
      fail(res, 500, { error: "Falha ao gravar perfil: " + e.message }, allowedOrigin);
    }
    return true;
  }

  fail(res, 404, { error: "Rota /soul não encontrada." }, allowedOrigin);
  return true;
}

export { SOUL_PROFILES };
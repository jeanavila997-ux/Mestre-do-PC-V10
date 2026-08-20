/**
 * db.js — Camada de banco SQLite local para o Chat Integrado do Mestre do PC
 *
 * Usa node:sqlite (built-in no Node.js 22+), sem dependências nativas externas.
 *
 * Tabelas:
 *   - conversas: histórico de conversas (titulo, modelo, perfil, timestamps)
 *   - mensagens: mensagens individuais (role, content, conversa_id, sync_status)
 *   - memorias: memórias persistentes do usuário (titulo, conteudo, ativa)
 *   - auditoria: log de auditoria local (level, action, details)
 *   - config: configurações chave-valor
 *   - sync_meta: metadados do sync MySQL
 */

import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, "..", "data");
const DB_PATH = join(DB_DIR, "mestre-chat.db");

mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// ── Schema ──────────────────────────────────────────────────────────

db.exec(`
CREATE TABLE IF NOT EXISTS conversas (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL DEFAULT 'Nova conversa',
  modelo TEXT,
  perfil TEXT DEFAULT 'balanced',
  criada_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizada_em TEXT NOT NULL DEFAULT (datetime('now')),
  sync_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS mensagens (
  id TEXT PRIMARY KEY,
  conversa_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
  content TEXT NOT NULL,
  tool_name TEXT,
  tool_result TEXT,
  criada_em TEXT NOT NULL DEFAULT (datetime('now')),
  sync_status TEXT NOT NULL DEFAULT 'pending',
  FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON mensagens(conversa_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_sync ON mensagens(sync_status);

CREATE TABLE IF NOT EXISTS memorias (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  ativa INTEGER NOT NULL DEFAULT 0,
  criada_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizada_em TEXT NOT NULL DEFAULT (datetime('now')),
  sync_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS auditoria (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  user_id TEXT,
  criada_em TEXT NOT NULL DEFAULT (datetime('now')),
  sync_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_auditoria_level ON auditoria(level);
CREATE INDEX IF NOT EXISTS idx_auditoria_sync ON auditoria(sync_status);

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT
);

CREATE TABLE IF NOT EXISTS sync_meta (
  id INTEGER PRIMARY KEY DEFAULT 1,
  ultimo_sync TEXT,
  total_synced INTEGER DEFAULT 0
);
`);

// ── Helpers ─────────────────────────────────────────────────────────

function uuid() {
  return randomUUID();
}

// node:sqlite StatementSync.all() retorna array de objetos
// node:sqlite StatementSync.get() retorna um objeto ou undefined

// ── Conversas ───────────────────────────────────────────────────────

export function criarConversa(titulo = "Nova conversa", modelo = null, perfil = "balanced") {
  const id = uuid();
  db.prepare(
    "INSERT INTO conversas (id, titulo, modelo, perfil) VALUES (?, ?, ?, ?)"
  ).run(id, titulo, modelo, perfil);
  return { id, titulo, modelo, perfil };
}

export function listarConversas(limite = 50) {
  return db.prepare(
    "SELECT * FROM conversas ORDER BY atualizada_em DESC LIMIT ?"
  ).all(limite);
}

export function getConversa(id) {
  return db.prepare("SELECT * FROM conversas WHERE id = ?").get(id);
}

export function atualizarConversa(id, { titulo, modelo, perfil }) {
  const fields = [];
  const values = [];
  if (titulo !== undefined) { fields.push("titulo = ?"); values.push(titulo); }
  if (modelo !== undefined) { fields.push("modelo = ?"); values.push(modelo); }
  if (perfil !== undefined) { fields.push("perfil = ?"); values.push(perfil); }
  fields.push("atualizada_em = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE conversas SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export function deletarConversa(id) {
  db.prepare("DELETE FROM conversas WHERE id = ?").run(id);
}

// ── Mensagens ───────────────────────────────────────────────────────

export function addMensagem(conversaId, role, content, toolName = null, toolResult = null) {
  const id = uuid();
  db.prepare(
    "INSERT INTO mensagens (id, conversa_id, role, content, tool_name, tool_result) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, conversaId, role, content, toolName, toolResult);
  db.prepare("UPDATE conversas SET atualizada_em = datetime('now') WHERE id = ?").run(conversaId);
  return { id, conversaId, role, content, toolName, toolResult };
}

export function getMensagens(conversaId, limite = 100) {
  return db.prepare(
    "SELECT * FROM mensagens WHERE conversa_id = ? ORDER BY criada_em ASC LIMIT ?"
  ).all(conversaId, limite);
}

export function getUltimasMensagens(conversaId, n = 20) {
  return db.prepare(
    `SELECT * FROM (
      SELECT * FROM mensagens WHERE conversa_id = ? ORDER BY criada_em DESC LIMIT ?
    ) ORDER BY criada_em ASC`
  ).all(conversaId, n);
}

// ── Memórias ────────────────────────────────────────────────────────

export function addMemoria(titulo, conteudo) {
  const id = uuid();
  db.prepare(
    "INSERT INTO memorias (id, titulo, conteudo) VALUES (?, ?, ?)"
  ).run(id, titulo, conteudo);
  return { id, titulo, conteudo, ativa: 0 };
}

export function listarMemorias() {
  return db.prepare("SELECT * FROM memorias ORDER BY atualizada_em DESC").all();
}

export function getMemoria(id) {
  return db.prepare("SELECT * FROM memorias WHERE id = ?").get(id);
}

export function atualizarMemoria(id, { titulo, conteudo, ativa }) {
  const fields = [];
  const values = [];
  if (titulo !== undefined) { fields.push("titulo = ?"); values.push(titulo); }
  if (conteudo !== undefined) { fields.push("conteudo = ?"); values.push(conteudo); }
  if (ativa !== undefined) { fields.push("ativa = ?"); values.push(ativa ? 1 : 0); }
  fields.push("atualizada_em = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE memorias SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export function deletarMemoria(id) {
  db.prepare("DELETE FROM memorias WHERE id = ?").run(id);
}

export function getMemoriasAtivas() {
  return db.prepare("SELECT * FROM memorias WHERE ativa = 1").all();
}

// ── Auditoria ───────────────────────────────────────────────────────

export function addAuditoria(level, action, details = null, userId = "web-chat") {
  const id = uuid();
  const detailsStr = typeof details === "object" ? JSON.stringify(details) : details;
  db.prepare(
    "INSERT INTO auditoria (id, level, action, details, user_id) VALUES (?, ?, ?, ?, ?)"
  ).run(id, level, action, detailsStr, userId);
  return { id, level, action, details: detailsStr, userId };
}

export function queryAuditoria(filters = {}) {
  let sql = "SELECT * FROM auditoria WHERE 1=1";
  const values = [];
  if (filters.level) { sql += " AND level = ?"; values.push(filters.level); }
  if (filters.action) { sql += " AND action = ?"; values.push(filters.action); }
  if (filters.startDate) { sql += " AND criada_em >= ?"; values.push(filters.startDate); }
  if (filters.endDate) { sql += " AND criada_em <= ?"; values.push(filters.endDate); }
  sql += " ORDER BY criada_em DESC LIMIT ?";
  values.push(filters.limit || 100);
  return db.prepare(sql).all(...values);
}

// ── Config ──────────────────────────────────────────────────────────

export function getConfig(chave, defaultValue = null) {
  const row = db.prepare("SELECT valor FROM config WHERE chave = ?").get(chave);
  return row ? row.valor : defaultValue;
}

export function listarConfig() {
  return db.prepare("SELECT chave, valor FROM config ORDER BY chave").all();
}

export function setConfig(chave, valor) {
  db.prepare(
    "INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor"
  ).run(chave, valor);
}

// ── Sync Status ─────────────────────────────────────────────────────

export function countUnsynced() {
  const msgs = db.prepare("SELECT COUNT(*) as n FROM mensagens WHERE sync_status = 'pending'").get();
  const convs = db.prepare("SELECT COUNT(*) as n FROM conversas WHERE sync_status = 'pending'").get();
  const aud = db.prepare("SELECT COUNT(*) as n FROM auditoria WHERE sync_status = 'pending'").get();
  return { mensagens: msgs.n, conversas: convs.n, auditoria: aud.n, total: msgs.n + convs.n + aud.n };
}

export function markSynced(tabela, ids) {
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`UPDATE ${tabela} SET sync_status = 'synced' WHERE id IN (${placeholders})`).run(...ids);
}

export function getUnsyncedBatch(tabela, limite = 500) {
  return db.prepare(
    `SELECT * FROM ${tabela} WHERE sync_status = 'pending' ORDER BY criada_em ASC LIMIT ?`
  ).all(limite);
}

export function getSyncMeta() {
  return db.prepare("SELECT * FROM sync_meta WHERE id = 1").get();
}

export function updateSyncMeta(totalSynced) {
  db.prepare(
    "INSERT INTO sync_meta (id, ultimo_sync, total_synced) VALUES (1, datetime('now'), ?) ON CONFLICT(id) DO UPDATE SET ultimo_sync = datetime('now'), total_synced = total_synced + excluded.total_synced"
  ).run(totalSynced);
}

export function close() {
  db.close();
}

export default db;
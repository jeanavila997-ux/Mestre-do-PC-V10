/**
 * mysql-sync.js — Sincronização automática SQLite → MySQL (Hostinger)
 *
 * Estratégia: por volume — quando o número de registros pending (não sincronizados)
 * atinge o limite (padrão 500), o sync é disparado automaticamente.
 *
 * Configuração via variáveis de ambiente:
 *   MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
 *   MESTRE_SYNC_THRESHOLD — limite de registros para disparar (padrão 500)
 *   MESTRE_SYNC_INTERVAL_MS — intervalo de checagem (padrão 60s)
 *
 * Se as variáveis MYSQL_* não estiverem configuradas, o sync fica desativado
 * silenciosamente — o SQLite local continua funcionando normalmente.
 */

import { countUnsynced, getUnsyncedBatch, markSynced, updateSyncMeta, getSyncMeta } from "./db.js";

const SYNC_THRESHOLD = Number(process.env.MESTRE_SYNC_THRESHOLD) || 500;
const SYNC_INTERVAL_MS = Number(process.env.MESTRE_SYNC_INTERVAL_MS) || 60000;

const mysqlConfig = {
  host: process.env.MYSQL_HOST || "",
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || "",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "",
};

let mysqlPool = null;
let syncTimer = null;
let syncing = false;

// ── Inicialização preguiçosa do MySQL ───────────────────────────────

async function getMysqlPool() {
  if (!mysqlConfig.host || !mysqlConfig.database) return null;
  if (mysqlPool) return mysqlPool;

  try {
    const mysql = await import("mysql2/promise");
    mysqlPool = mysql.createPool({
      host: mysqlConfig.host,
      port: mysqlConfig.port,
      user: mysqlConfig.user,
      password: mysqlConfig.password,
      database: mysqlConfig.database,
      waitForConnections: true,
      connectionLimit: 3,
      queueLimit: 10,
      connectTimeout: 10000,
    });
    return mysqlPool;
  } catch (err) {
    console.warn("[mysql-sync] mysql2 não instalado ou conexão falhou:", err.message);
    return null;
  }
}

// ── Criação de tabelas no MySQL (executada uma vez) ─────────────────

async function ensureMysqlTables(pool) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS mp_conversas (
      id VARCHAR(64) PRIMARY KEY,
      titulo TEXT,
      modelo VARCHAR(128),
      perfil VARCHAR(32),
      criada_em DATETIME,
      atualizada_em DATETIME
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS mp_mensagens (
      id VARCHAR(64) PRIMARY KEY,
      conversa_id VARCHAR(64),
      role VARCHAR(16),
      content LONGTEXT,
      tool_name VARCHAR(128),
      tool_result LONGTEXT,
      criada_em DATETIME,
      INDEX idx_conversa (conversa_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS mp_auditoria (
      id VARCHAR(64) PRIMARY KEY,
      level VARCHAR(32),
      action VARCHAR(128),
      details LONGTEXT,
      user_id VARCHAR(64),
      criada_em DATETIME,
      INDEX idx_level (level)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ];

  for (const sql of statements) {
    await pool.execute(sql);
  }
}

// ── Sync de uma tabela ──────────────────────────────────────────────

async function syncTabela(pool, tabelaLocal, tabelaMysql, colunas) {
  const batch = getUnsyncedBatch(tabelaLocal, SYNC_THRESHOLD);
  if (!batch.length) return 0;

  const colunasStr = colunas.join(", ");
  const placeholders = colunas.map(() => "?").join(", ");
  const insertSql = `INSERT IGNORE INTO ${tabelaMysql} (${colunasStr}) VALUES (${placeholders})`;

  let synced = 0;
  const ids = [];

  for (const row of batch) {
    try {
      const values = colunas.map(c => row[c]);
      await pool.execute(insertSql, values);
      ids.push(row.id);
      synced++;
    } catch (err) {
      console.warn(`[mysql-sync] Erro ao inserir em ${tabelaMysql}:`, err.message);
    }
  }

  if (ids.length) markSynced(tabelaLocal, ids);
  return synced;
}

// ── Sync completo ───────────────────────────────────────────────────

export async function sincronizarAgora() {
  if (syncing) return { skipped: true, reason: "sync em andamento" };

  const pool = await getMysqlPool();
  if (!pool) return { skipped: true, reason: "MySQL não configurado" };

  syncing = true;
  let totalSynced = 0;

  try {
    await ensureMysqlTables(pool);

    totalSynced += await syncTabela(pool, "conversas", "mp_conversas",
      ["id", "titulo", "modelo", "perfil", "criada_em", "atualizada_em"]);

    totalSynced += await syncTabela(pool, "mensagens", "mp_mensagens",
      ["id", "conversa_id", "role", "content", "tool_name", "tool_result", "criada_em"]);

    totalSynced += await syncTabela(pool, "auditoria", "mp_auditoria",
      ["id", "level", "action", "details", "user_id", "criada_em"]);

    if (totalSynced > 0) {
      updateSyncMeta(totalSynced);
      console.log(`[mysql-sync] ${totalSynced} registros sincronizados para MySQL`);
    }

    return { synced: totalSynced };
  } catch (err) {
    console.error("[mysql-sync] Erro no sync:", err.message);
    return { error: err.message };
  } finally {
    syncing = false;
  }
}

// ── Checagem automática periódica ───────────────────────────────────

export function iniciarSyncAutomatico() {
  if (syncTimer) return;

  syncTimer = setInterval(async () => {
    const unsynced = countUnsynced();
    if (unsynced.total >= SYNC_THRESHOLD) {
      console.log(`[mysql-sync] ${unsynced.total} registros pending (threshold: ${SYNC_THRESHOLD}). Disparando sync...`);
      await sincronizarAgora();
    }
  }, SYNC_INTERVAL_MS);

  console.log(`[mysql-sync] Sync automático ativo (threshold: ${SYNC_THRESHOLD}, intervalo: ${SYNC_INTERVAL_MS}ms)`);
}

export function pararSyncAutomatico() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

export function getStatus() {
  const unsynced = countUnsynced();
  const meta = getSyncMeta();
  return {
    mysqlConfigurado: !!mysqlConfig.host && !!mysqlConfig.database,
    threshold: SYNC_THRESHOLD,
    unsynced,
    ultimoSync: meta?.ultimo_sync || null,
    totalSynced: meta?.total_synced || 0,
  };
}
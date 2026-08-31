#!/usr/bin/env node
// Aplica migrações SQL no banco MySQL configurado em .env.local.
// Uso: node mcp-server/db/migrations/migrate.mjs

import { readdir, readFile } from "node:fs/promises";
import { getPool, closePool, getDatabaseName } from "../connector.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function ensureMigrationsTable(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS mcp_local_migrations (
      id VARCHAR(64) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
}

async function getAppliedMigrations(conn) {
  try {
    const [rows] = await conn.execute("SELECT id FROM mcp_local_migrations ORDER BY id");
    return new Set(rows.map((r) => r.id));
  } catch {
    return new Set();
  }
}

async function applyMigration(conn, id, sql) {
  await conn.query(sql);
  await conn.execute("INSERT INTO mcp_local_migrations (id) VALUES (?)", [id]);
}

async function main() {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.execute(`CREATE DATABASE IF NOT EXISTS \`${getDatabaseName()}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.execute(`USE \`${getDatabaseName()}\``);
    await ensureMigrationsTable(conn);
    const applied = await getAppliedMigrations(conn);

    const files = (await readdir(__dirname))
      .filter((f) => f.endsWith(".sql") && /^\d+_/.test(f))
      .sort();

    for (const file of files) {
      const id = file.replace(/\.sql$/, "");
      if (applied.has(id)) {
        console.log(`[skip] ${file}`);
        continue;
      }
      const sql = await readFile(join(__dirname, file), "utf8");
      console.log(`[apply] ${file}`);
      await applyMigration(conn, id, sql);
    }
    console.log("Migrações concluídas.");
  } finally {
    conn.release();
    await closePool();
  }
}

main().catch((e) => {
  console.error("Erro ao aplicar migrações:", e.message);
  process.exit(1);
});

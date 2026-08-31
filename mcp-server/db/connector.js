// Conector MySQL para os tools MCP locais.
// Suporta conexão local e remota (ex: Hostinger) via variáveis de ambiente.
// Pool é criado sob demanda e reutilizado durante a vida do processo.

import { createPool } from "mysql2/promise";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");

async function loadEnvLocal() {
  const envPath = join(PROJECT_ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  try {
    const content = await readFile(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (process.env[key] == null) process.env[key] = value;
    }
  } catch {
    // ignore
  }
}

await loadEnvLocal();

function buildConfig() {
  // Suporte a dois modos:
  // 1. Local: MYSQL_HOST=127.0.0.1, MYSQL_PORT=3306 (ou socket)
  // 2. Remoto (ex: Hostinger): MYSQL_HOST=seu-host.hostinger.com, MYSQL_PORT=3306
  const host = process.env.MYSQL_HOST || "127.0.0.1";
  const port = Number(process.env.MYSQL_PORT || "3306");
  const user = process.env.MYSQL_USER || "";
  const password = process.env.MYSQL_PASSWORD || "";
  const database = process.env.MYSQL_DATABASE || "mestre_pc";
  const ssl = process.env.MYSQL_SSL === "1" ? { rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== "0" } : undefined;
  const socketPath = process.env.MYSQL_SOCKET_PATH || undefined;

  return {
    host,
    port,
    user,
    password,
    database,
    ssl,
    socketPath,
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || "10"),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  };
}

let pool = null;

export function getPool() {
  if (!pool) {
    pool = createPool(buildConfig());
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function query(sql, params = []) {
  const p = getPool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

export async function testConnection() {
  const p = getPool();
  const [rows] = await p.execute("SELECT 1 AS ok");
  return rows[0]?.ok === 1;
}

export function getDatabaseName() {
  return process.env.MYSQL_DATABASE || "mestre_pc";
}

export function getDatabaseHost() {
  return process.env.MYSQL_HOST || "127.0.0.1";
}

// Autenticação local para tools MCP que acessam banco de dados e recursos sensíveis.
// O token é carregado de MESTRE_LOCAL_MCP_TOKEN (env ou .env.local).
// Em stdio o header não chega literalmente, mas o MCP server pode requerer o token
// nos argumentos do tool quando o acesso for via HTTP/SSE ou quando o client
// encaminha metadados. Para stdio puro, usamos também uma validação de "modo local"
// baseada na ausência de token: se nenhum token foi configurado, os tools de banco
// ficam desabilitados por segurança.

import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");

// Carrega .env.local silenciosamente, se existir.
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

function getExpectedToken() {
  return process.env.MESTRE_LOCAL_MCP_TOKEN || "";
}

export function isLocalMcpEnabled() {
  return getExpectedToken().length > 0;
}

export function generateLocalMcpToken() {
  return randomBytes(32).toString("base64url");
}

export function validateLocalMcpToken(token) {
  const expected = getExpectedToken();
  if (!expected) {
    return { valid: false, reason: "MESTRE_LOCAL_MCP_TOKEN não configurado. Configure .env.local e reinicie o MCP server." };
  }
  if (!token || typeof token !== "string") {
    return { valid: false, reason: "Token ausente." };
  }
  // Usamos comparação de tempo constante simples via normalização.
  const a = Buffer.from(token.normalize(), "utf8");
  const b = Buffer.from(expected.normalize(), "utf8");
  if (a.length !== b.length) {
    return { valid: false, reason: "Token inválido." };
  }
  let equal = 0;
  for (let i = 0; i < a.length; i++) equal |= a[i] ^ b[i];
  if (equal !== 0) {
    return { valid: false, reason: "Token inválido." };
  }
  return { valid: true };
}

export function requireLocalMcpToken(args) {
  const token = args?.local_mcp_token || "";
  const result = validateLocalMcpToken(token);
  if (!result.valid) {
    const err = new Error(result.reason);
    err.code = "UNAUTHORIZED";
    throw err;
  }
}

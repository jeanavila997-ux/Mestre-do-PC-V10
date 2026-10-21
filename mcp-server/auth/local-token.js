// Autenticação local para tools MCP que acessam banco de dados e recursos sensíveis.
// O token é carregado de MESTRE_LOCAL_MCP_TOKEN (env ou .env.local).
// Em stdio o header não chega literalmente, mas o MCP server pode requerer o token
// nos argumentos do tool quando o acesso for via HTTP/SSE ou quando o client
// encaminha metadados. Para stdio puro, usamos também uma validação de "modo local"
// baseada na ausência de token: se nenhum token foi configurado, os tools de banco
// ficam desabilitados por segurança.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");
const TOKEN_KEY = "MESTRE_LOCAL_MCP_TOKEN";
const TOKEN_LINE_RE = /^[ \t]*MESTRE_LOCAL_MCP_TOKEN[ \t]*=.*$/m;

// Caminho do .env.local. MESTRE_ENV_LOCAL_PATH existe para testes isolarem o
// arquivo; em uso normal é sempre <raiz do projeto>/.env.local.
export function getEnvLocalPath() {
  return process.env.MESTRE_ENV_LOCAL_PATH || join(PROJECT_ROOT, ".env.local");
}

// Carrega .env.local silenciosamente, se existir.
async function loadEnvLocal() {
  const envPath = getEnvLocalPath();
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

// Modo legado (cliente "mcp" sem token) só com opt-in explícito. Existe apenas
// como saída de emergência; o padrão é fail-closed.
export function isLegacyMcpAllowed() {
  return process.env.MESTRE_ALLOW_LEGACY_MCP === "1";
}

// Relê o token do .env.local quando o processo começou antes de ele existir
// (ex.: MCP server iniciado antes do launcher gerar o token). Não sobrescreve
// um valor já presente no ambiente.
export function refreshLocalMcpTokenFromFile() {
  if (getExpectedToken()) return true;
  try {
    const envPath = getEnvLocalPath();
    if (!existsSync(envPath)) return false;
    const match = readFileSync(envPath, "utf8").match(TOKEN_LINE_RE);
    if (!match) return false;
    const value = match[0].slice(match[0].indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    if (!value) return false;
    process.env[TOKEN_KEY] = value;
    return true;
  } catch {
    return false;
  }
}

// Garante que exista um token antes de o launcher aceitar o cliente "mcp".
// Idempotente: se o token já está configurado (env ou .env.local), não faz nada.
// Se faltar, gera um token novo, grava no .env.local (substituindo uma linha
// vazia vinda do .env.example, ou acrescentando) e o aplica a este processo.
// Retorna { status: "configured" | "created" | "legacy", path? }.
export async function ensureLocalMcpToken() {
  if (refreshLocalMcpTokenFromFile()) return { status: "configured" };
  if (isLegacyMcpAllowed()) return { status: "legacy" };

  const envPath = getEnvLocalPath();
  const token = generateLocalMcpToken();
  const line = `${TOKEN_KEY}=${token}`;
  let content = existsSync(envPath) ? await readFile(envPath, "utf8") : "";
  if (TOKEN_LINE_RE.test(content)) {
    content = content.replace(TOKEN_LINE_RE, line);
  } else {
    const header = content ? "" : "# Gerado automaticamente pelo launcher do Mestre do PC. NUNCA commite este arquivo.\n";
    content = `${content}${content && !content.endsWith("\n") ? "\n" : ""}${header}${line}\n`;
  }
  await writeFile(envPath, content, { encoding: "utf8", mode: 0o600 });
  try { await chmod(envPath, 0o600); } catch { /* Windows ignora modos POSIX */ }
  process.env[TOKEN_KEY] = token;
  return { status: "created", path: envPath };
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

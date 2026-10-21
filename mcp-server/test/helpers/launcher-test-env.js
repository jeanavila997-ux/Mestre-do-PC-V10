// Ambiente compartilhado pelos testes que sobem o launcher.
//
// O launcher é fail-closed para o cliente "mcp": sem MESTRE_LOCAL_MCP_TOKEN,
// ele gera um token e o grava no .env.local. Para os testes não tocarem o
// .env.local real do projeto, fixamos um token de teste e apontamos o
// .env.local para um arquivo temporário. Importe este módulo ANTES de montar
// o env do spawn (os testes fazem { ...process.env, ... }).
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export const TEST_MCP_TOKEN = "test-" + randomBytes(16).toString("hex");

process.env.MESTRE_LOCAL_MCP_TOKEN = TEST_MCP_TOKEN;
process.env.MESTRE_ENV_LOCAL_PATH = join(tmpdir(), `mestre-test-env-${process.pid}.local`);
delete process.env.MESTRE_ALLOW_LEGACY_MCP;

export const MCP_TOKEN_HEADER = { "X-Mestre-Mcp-Token": TEST_MCP_TOKEN };

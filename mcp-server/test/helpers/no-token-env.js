// Ambiente para testes que precisam do cenário "nenhum token configurado".
//
// O launcher é fail-closed (ver helpers/launcher-test-env.js): no primeiro boot
// ele gera MESTRE_LOCAL_MCP_TOKEN e grava no .env.local. Como
// auth/local-token.js lê esse arquivo na importação, um .env.local real
// existente tornaria impossível testar o cenário sem token.
//
// Importe este módulo ANTES de auth/local-token.js (ou de qualquer módulo que
// o importe) para que o ambiente já esteja limpo quando ele carregar.
import { tmpdir } from "node:os";
import { join } from "node:path";

delete process.env.MESTRE_LOCAL_MCP_TOKEN;
delete process.env.MESTRE_ALLOW_LEGACY_MCP;

// Aponta o .env.local para um arquivo temporário inexistente, para não ler o
// .env.local real do projeto.
process.env.MESTRE_ENV_LOCAL_PATH = join(tmpdir(), `mestre-test-no-token-${process.pid}.local`);

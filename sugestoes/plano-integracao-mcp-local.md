# Plano de integração: servidores MCP locais com autenticação e banco de dados

## Contexto

Este plano propõe a integração de servidores MCP locais, autenticação e banco de dados locais nos projetos ativos do workspace `C:\Users\JEANPC`:

- `Mestre-do-PC-V10/` — app Windows de diagnóstico e manutenção, com launcher Node.js (`v10/launcher.js`) em `127.0.0.1:7777` e MCP server (`mcp-server/index.js`) via stdio.
- `ext-apps/` — SDK TypeScript MCP Apps (`@modelcontextprotocol/ext-apps`).

## Decisões pendentes

Para finalizar a implementação, responda às perguntas abaixo. O plano já apresenta uma arquitetura padrão recomendada e alternativas.

### 1. Qual projeto integrar primeiro?

- **Mestre-do-PC-V10** (recomendado — já tem infraestrutura MCP, segurança e auditoria).
- `ext-apps`.
- Ambos.

### 2. Qual banco de dados local usar?

- **SQLite** (recomendado — arquivo local, zero configuração, ideal para começar).
- PostgreSQL via Docker.
- MySQL / MariaDB.
- MongoDB.

### 3. Acesso de rede do servidor MCP

- **Apenas `127.0.0.1`** (recomendado — alinhado com o modelo de segurança do Mestre do PC).
- Também pela rede local (outros dispositivos na mesma rede).

### 4. MCP client já configurado?

- Claude Desktop.
- VS Code com Claude Code.
- Copilot CLI.
- Nenhum (configuraremos do zero).

### 5. Como definir as credenciais?

- **Gerar senhas automáticas seguras** e guardar em `.env.local`.
- Definir manualmente depois.

## Arquitetura recomendada padrão

### Opção A: expandir o MCP server do Mestre do PC V10 (recomendada)

Aproveitar o `mcp-server/index.js` existente e adicionar novos tools que falem com o banco local.

```
Claude Desktop / VS Code / Copilot CLI
    │  stdio
    ▼
mcp-server/index.js
    │
    ├── tools existentes (comandos Windows via launcher 7777)
    └── novos tools MCP:
          • query_database
          • store_memory
          • list_sessions
          • authenticate_user
    │
    ▼
Banco local (SQLite/PostgreSQL/MySQL/MongoDB)
```

**Vantagens:**
- Reaproveita `security.js`, `audit-logger.js` e validação de tokens.
- O MCP server já é consumido por clientes MCP.
- Implementação rápida.

**Desvantagens:**
- Pode misturar responsabilidades caso o banco seja genérico.
- stdio não permite acesso HTTP/SSE nativamente.

### Opção B: criar um servidor MCP genérico separado

Criar uma pasta `local-mcp-server/` com servidor MCP próprio, via stdio ou SSE, independente do Mestre do PC.

```
MCP Client
    │  stdio ou SSE (http://127.0.0.1:PORT/sse)
    ▼
local-mcp-server/index.js
    │
    ├── auth middleware (token Bearer ou X-Mestre-Client)
    ├── DB connector
    └── tools genéricos:
          • query_sql
          • insert_record
          • update_record
          • delete_record
          • list_tables
          • create_backup
```

**Vantagens:**
- Separação clara de responsabilidades.
- Reutilizável pelos dois projetos.
- Pode expor HTTP/SSE.

**Desvantagens:**
- Mais arquivos para manter.
- Requer configuração adicional no MCP client.

## Recomendação executiva

Começar com a **Opção A** dentro de `Mestre-do-PC-V10`:

1. Banco SQLite local em `v10/data/mcp-store.sqlite`.
2. Novos tools MCP em `mcp-server/index.js`.
3. Autenticação via token `MESTRE_LOCAL_MCP_TOKEN`.
4. Configuração do MCP client para apontar para `mcp-server/index.js`.

Depois, se necessário, extrair para a **Opção B** como servidor genérico.

## Estrutura de arquivos proposta (Opção A)

```
Mestre-do-PC-V10/
├── mcp-server/
│   ├── index.js                    (já existe; adicionar novos tools)
│   ├── package.json                (já existe; adicionar driver do banco)
│   ├── db/
│   │   ├── connector.js            — singleton de conexão SQLite
│   │   ├── schema.sql              — DDL inicial
│   │   └── migrations/
│   │       ├── 001_initial.sql
│   │       └── migrate.mjs
│   ├── auth/
│   │   └── local-token.js          — validação de X-Mestre-Local-Mcp-Token
│   └── test/
│       └── local-mcp-db.test.js
├── v10/
│   └── data/
│       └── mcp-store.sqlite        — banco gerado automaticamente
└── .env.example                    — template de variáveis
```

## Autenticação proposta

- Gerar token seguro de 32 bytes em Base64.
- Armazenar em `.env.local` (não versionado) como `MESTRE_LOCAL_MCP_TOKEN`.
- Requerer o token no header `X-Mestre-Local-Mcp-Token` para todos os tools de banco.
- Se o token não estiver configurado, os tools de banco recusam com erro autoritativo.

## Drivers de banco por opção

| Escolha | Driver npm | Observação |
| :--- | :--- | :--- |
| SQLite | `better-sqlite3` ou `sqlite3` | Recomendado para testes locais. |
| PostgreSQL | `pg` | Requer servidor rodando (Docker ou local). |
| MySQL | `mysql2` | Requer servidor rodando. |
| MongoDB | `mongodb` | Requer `mongod` rodando. |

## Passos de implementação

1. Confirmar as 5 decisões pendentes com o usuário.
2. Criar estrutura de pastas e arquivos.
3. Instalar driver de banco no `mcp-server/package.json`.
4. Implementar `mcp-server/db/connector.js` e schema inicial.
5. Implementar `mcp-server/auth/local-token.js`.
6. Adicionar novos tools MCP em `mcp-server/index.js`:
   - `query_database`
   - `store_memory`
   - `list_tables`
   - `create_backup`
7. Criar `.env.example` com variáveis necessárias.
8. Adicionar testes em `mcp-server/test/local-mcp-db.test.js`.
9. Configurar o MCP client escolhido (Claude Desktop, VS Code ou Copilot CLI).
10. Documentar em `docs/MCP-LOCAL.md` e atualizar `CLAUDE.md`.

## Arquivos envolvidos

- `mcp-server/package.json`
- `mcp-server/db/connector.js` (novo)
- `mcp-server/db/schema.sql` (novo)
- `mcp-server/db/migrations/001_initial.sql` (novo)
- `mcp-server/db/migrations/migrate.mjs` (novo)
- `mcp-server/auth/local-token.js` (novo)
- `mcp-server/index.js` (adição de tools)
- `mcp-server/test/local-mcp-db.test.js` (novo)
- `.env.example` (novo)
- `docs/MCP-LOCAL.md` (novo)
- `CLAUDE.md` (seção sobre MCP local)
- Configuração do MCP client conforme escolha do usuário.

## Restrições e segurança

- Não expor o servidor MCP para a internet.
- Não versionar credenciais (`MESTRE_LOCAL_MCP_TOKEN`, strings de conexão).
- Não alterar o `launcher.js` do Mestre do PC nesta fase.
- Manter o MCP server como processo local (`127.0.0.1` ou stdio).
- Reutilitar `audit-logger.js` para registrar acessos ao banco.

## Próxima ação

Assim que o usuário confirmar as 5 decisões, este plano será refinado e a implementação será iniciada.

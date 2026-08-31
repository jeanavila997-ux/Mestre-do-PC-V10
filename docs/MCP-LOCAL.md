# MCP Local do Mestre do PC V10

Servidores MCP locais com autenticação e banco de dados MySQL/MariaDB.

## Visão geral

O `mcp-server/index.js` do Mestre do PC V10 agora expõe tools adicionais para acesso a banco de dados local. Os tools de banco são:

- `mcp_local_db_status` — testa conexão com MySQL/MariaDB.
- `mcp_local_db_query` — executa SELECT/SHOW/DESCRIBE/EXPLAIN parametrizado.
- `mcp_local_db_insert_memory` — armazena memória persistente.
- `mcp_local_db_list_memories` — lista memórias.
- `mcp_local_db_create_task` — cria tarefa de acompanhamento.
- `mcp_local_db_list_tasks` — lista tarefas.

## Segurança

- Os tools de banco só aparecem quando `MESTRE_LOCAL_MCP_TOKEN` está configurado.
- Cada chamada requer `local_mcp_token` nos argumentos.
- Apenas consultas de leitura são permitidas via `mcp_local_db_query`.
- Todas as chamadas são auditadas via `audit-logger.js`.

## Configuração

1. Copie `.env.example` para `.env.local`:
   ```powershell
   cd Mestre-do-PC-V10
   Copy-Item .env.example .env.local
   ```

2. Gere um token seguro:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

3. Cole o token em `.env.local`:
   ```
   MESTRE_LOCAL_MCP_TOKEN=SEU_TOKEN_AQUI
   ```

4. Configure o banco MySQL/MariaDB:
   ```
   MYSQL_HOST=127.0.0.1
   MYSQL_PORT=3306
   MYSQL_USER=root
   MYSQL_PASSWORD=senha_local
   MYSQL_DATABASE=mestre_pc
   MYSQL_SSL=0
   ```

   Para Hostinger (remoto), use algo como:
   ```
   MYSQL_HOST=seu-host.hostinger.com
   MYSQL_PORT=3306
   MYSQL_USER=u123456789_mestre
   MYSQL_PASSWORD=senha_forte
   MYSQL_DATABASE=u123456789_mestre_pc
   MYSQL_SSL=1
   MYSQL_SSL_REJECT_UNAUTHORIZED=0
   ```

5. Instale as dependências:
   ```powershell
   cd mcp-server
   npm install
   ```

6. Aplique as migrações:
   ```powershell
   node db/migrations/migrate.mjs
   ```

## Uso nos MCP clients

### Claude Desktop

Adicione em `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mestre-do-pc": {
      "command": "node",
      "args": [
        "C:\\Users\\JEANPC\\Mestre-do-PC-V10\\mcp-server\\index.js"
      ],
      "env": {
        "MESTRE_LOCAL_MCP_TOKEN": "SEU_TOKEN_AQUI",
        "MYSQL_HOST": "127.0.0.1",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "root",
        "MYSQL_PASSWORD": "senha_local",
        "MYSQL_DATABASE": "mestre_pc"
      }
    }
  }
}
```

### VS Code (Claude Code extension)

Na configuração de MCP servers do VS Code, adicione:

```json
{
  "mcpServers": {
    "mestre-do-pc": {
      "command": "node",
      "args": [
        "C:/Users/JEANPC/Mestre-do-PC-V10/mcp-server/index.js"
      ],
      "env": {
        "MESTRE_LOCAL_MCP_TOKEN": "SEU_TOKEN_AQUI",
        "MYSQL_HOST": "127.0.0.1",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "root",
        "MYSQL_PASSWORD": "senha_local",
        "MYSQL_DATABASE": "mestre_pc"
      }
    }
  }
}
```

### Copilot CLI

O Copilot CLI não suporta MCP servers nativamente. Use o Claude Desktop ou VS Code.

## Rede local

Por padrão o MCP server funciona via stdio e não abre porta de rede. Para acesso via SSE/HTTP na rede local, será necessário criar um wrapper HTTP no futuro (não implementado nesta fase).

## Testes

```powershell
cd mcp-server
node --test test/local-mcp-db.test.js
```

## Manutenção

- `mcp-server/db/schema.sql` — DDL inicial.
- `mcp-server/db/migrations/` — migrações versionadas.
- `mcp-server/auth/local-token.js` — lógica de token.
- `mcp-server/db/connector.js` — pool de conexões MySQL.

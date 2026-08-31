# Repository Guidelines

## Project Overview
O **Mestre do PC V10** (ou **Oh My Pi**) é um assistente de automação e manutenção para computadores Windows, especializado em:
- **Automação de tarefas**: Execução de comandos PowerShell, gerenciamento de serviços e processos.
- **Integração com IA**: Uso de modelos locais (Ollama) e cloud para análise de código, Chain-of-Thought, RAG e comparação de modelos.
- **Gerenciamento de banco de dados**: Conexão com MySQL/MariaDB para armazenamento de memórias, tarefas e logs.
- **Segurança e auditoria**: Proteção contra prompt injection, autenticação local e logs detalhados de operações.
- **Integração com ferramentas externas**: Webhooks (Discord, Teams, Slack), análise de código PowerShell e monitoramento de recursos.


## Architecture & Data Flow
### Arquitetura de Alto Nível
1. **MCP Server (`mcp-server/`)**:
   - **Núcleo do sistema**: Implementado em Node.js, utiliza o framework `@modelcontextprotocol/sdk` para gerenciar ferramentas, autenticação e comunicação via `stdio` ou HTTP/SSE.
   - **Ferramentas**: Mapeia operações da whitelist (`allowed-operations.json`) para comandos executáveis no launcher do Mestre do PC.
   - **Integração com IA**: Comunicação com modelos Ollama (local e cloud) para análise de código, RAG, Chain-of-Thought e comparação de modelos.
   - **Banco de dados**: Conexão com MySQL/MariaDB para armazenamento de memórias, tarefas e logs de auditoria.
   - **Segurança**: Validação de prompts, autenticação local e logs de auditoria.

2. **Launcher (`v10/`)**:
   - **Whitelist de operações**: Define comandos permitidos (`allowed-operations.json`) para execução no sistema.
   - **Execução de comandos**: Comunica-se com o MCP Server via HTTP/SSE para executar operações.

3. **Fluxo de Dados**:
   - **Entrada**: Requisições via `stdio` ou HTTP/SSE com parâmetros de ferramentas.
   - **Processamento**:
     - Validação de segurança (prompt injection, autenticação).
     - Execução de comandos (PowerShell, banco de dados, IA).
     - Integração com modelos Ollama para análise e geração de respostas.
   - **Saída**: Respostas estruturadas em JSON ou texto formatado para webhooks.


## Key Directories
| Diretório/Arquivo                     | Propósito                                                                                     |
|---------------------------------------|-----------------------------------------------------------------------------------------------|
| `mcp-server/`                         | Núcleo do projeto. Contém lógica principal, ferramentas, autenticação e integrações.         |
| `mcp-server/index.js`                 | Arquivo principal. Configura o servidor, ferramentas e handlers de requisições.              |
| `mcp-server/auth/`                    | Autenticação local para ferramentas sensíveis (ex.: banco de dados).                          |
| `mcp-server/db/`                      | Ferramentas de banco de dados (MySQL/MariaDB) e migrações.                                    |
| `mcp-server/db/migrations/`           | Migrações para criação e atualização do schema do banco de dados.                             |
| `mcp-server/db/schema.sql`            | Schema do banco de dados.                                                                     |
| `mcp-server/transports/`              | Implementação de transportes (ex.: HTTP/SSE).                                                |
| `mcp-server/test/`                    | Testes unitários e de integração para ferramentas e segurança.                                |
| `v10/allowed-operations.json`         | Whitelist de comandos permitidos para execução no launcher.                                   |
| `v10/operation-registry.js`           | Carrega e valida a whitelist de operações.                                                    |
| `logs/audit/`                         | Logs de auditoria das operações executadas.                                                   |


## Development Commands
### Comandos Principais
| Comando                          | Descrição                                                                                     |
|----------------------------------|-----------------------------------------------------------------------------------------------|
| `node mcp-server/index.js`       | Inicia o MCP Server em modo `stdio`.                                                          |
| `npm install`                    | Instala dependências do projeto.                                                              |
| `npm test`                       | Executa testes unitários e de integração (localizados em `mcp-server/test/`).                |
| `pwsh mcp-server/check-status.ps1` | Verifica o status do MCP Server e do launcher.                                                |
| `pwsh mcp-server/start-launcher.ps1` | Inicia o launcher do Mestre do PC.                                                            |
| `pwsh mcp-server/generate-mcp-skills.ps1` | Gera dinamicamente o registro de ferramentas a partir da whitelist.                          |
| `pwsh mcp-server/fix-allowed-ops.ps1` | Corrige permissões da whitelist de operações.                                                 |


## Code Conventions & Common Patterns
### Formatação e Nomenclatura
- **Nomenclatura**:
  - Funções e variáveis: `camelCase` (ex.: `sanitizeToolArgument`, `executeLauncherCommand`).
  - Arquivos: `kebab-case` (ex.: `audit-logger.js`, `mcp-db-tools.js`).
  - Constantes: `UPPER_SNAKE_CASE` (ex.: `OLLAMA_API_KEY`, `MESTRE_BASE_URL`).

- **Tratamento de Erros**:
  - Uso de `try/catch` para operações assíncronas (ex.: requisições HTTP, consultas ao banco de dados).
  - Erros são auditados e retornados com mensagens claras (ex.: `auditLog(AuditLevel.SECURITY, ...)`).
  - Validação de entradas com schemas (ex.: `inputSchema` nas ferramentas).

- **Padrões Assíncronos**:
  - Uso de `async/await` para operações assíncronas (ex.: `ollamaChat`, `executeLauncherCommand`).
  - Promessas são tratadas com `.catch()` em casos críticos (ex.: inicialização do servidor).

- **Injeção de Dependências**:
  - Dependências são importadas explicitamente no início dos arquivos (ex.: `import { query } from "./connector.js"`).
  - Configurações são carregadas via variáveis de ambiente (ex.: `process.env.OLLAMA_URL`).

- **Gerenciamento de Estado**:
  - Estado global é gerenciado via variáveis de ambiente e arquivos de configuração (ex.: `model-profiles.json`).
  - Banco de dados é utilizado para persistência de memórias e tarefas.


## Important Files
| Arquivo                              | Propósito                                                                                     |
|---------------------------------------|-----------------------------------------------------------------------------------------------|
| `mcp-server/index.js`                 | Ponto de entrada do MCP Server. Configura ferramentas, handlers e integrações.                |
| `mcp-server/auth/local-token.js`      | Autenticação local para ferramentas sensíveis.                                                |
| `mcp-server/db/mcp-db-tools.js`       | Ferramentas de banco de dados (MySQL/MariaDB).                                                |
| `mcp-server/db/schema.sql`            | Schema do banco de dados.                                                                     |
| `mcp-server/security.js`              | Validação de prompts e sanitização de argumentos.                                             |
| `mcp-server/audit-logger.js`          | Registro de logs de auditoria.                                                                |
| `v10/allowed-operations.json`         | Whitelist de comandos permitidos para execução no launcher.                                   |
| `mcp-server/model-profiles.json`      | Perfis de modelos Ollama para automação.                                                      |
| `mcp-server/test/`                    | Testes unitários e de integração.                                                             |


## Runtime/Tooling Preferences
- **Runtime**: Node.js (versão 18+ recomendada).
- **Gerenciador de Pacotes**: npm.
- **Banco de Dados**: MySQL ou MariaDB (opcional, para ferramentas locais).
- **Modelos de IA**: Ollama (local ou cloud).
- **Ferramentas Externas**:
  - PowerShell para execução de comandos no Windows.
  - Webhooks para integração com Discord, Teams e Slack.
  - Bibliotecas: `@modelcontextprotocol/sdk`, `express`, `hono`, `zod`, `mysql2`.


## Testing & QA
### Frameworks de Teste
- **Jest**: Utilizado para testes unitários e de integração (ex.: `mcp-server/test/`).
- **Testes de Segurança**: Validação de prompt injection, autenticação e whitelist de comandos.

### Execução de Testes
| Comando               | Descrição                                                                                     |
|-----------------------|-----------------------------------------------------------------------------------------------|
| `npm test`            | Executa todos os testes localizados em `mcp-server/test/`.                                   |
| `node test/<arquivo>` | Executa um teste específico (ex.: `node test/whitelist-enforcement.test.js`).                 |

### Cobertura de Testes
- **Ferramentas**: Testes cobrem validação de schemas, execução de comandos, segurança e integração com IA.
- **Expectativas**: Testes devem garantir que:
  - Comandos não permitidos sejam bloqueados.
  - Prompts maliciosos sejam detectados.
  - Integrações com banco de dados e IA funcionem corretamente.


## Exemplo de Padrões de Código
### 1. Tratamento de Erros
```javascript
async function executeLauncherCommand(commandOrPayload, options = {}) {
  try {
    const { cmd, args } = typeof commandOrPayload === "string"
      ? { cmd: commandOrPayload, args: [] }
      : commandOrPayload;
    const classification = await classifyLauncherCommand(cmd);
    if (classification.allowed === false) {
      throw new Error(`Comando bloqueado: ${classification.reason || "não está na whitelist."}`);
    }
    const result = await runChildProcess(cmd, args, options);
    return { content: result };
  } catch (error) {
    await auditLog(AuditLevel.ERROR, "launcher_command_failed", { cmd, error: error.message });
    return { isError: true, content: [{ type: "text", text: `❌ ${error.message}` }] };
  }
}
```

### 2. Validação de Prompts
```javascript
export function checkPromptInjection(text) {
  if (!text || typeof text !== "string") {
    return { classification: "invalid", score: 1.0, details: ["Entrada vazia ou invalida."] };
  }
  const patterns = [
    { regex: /ignore\s+(all\s+)?previous\s+(instructions?|commands?|prompts?)/gi, weight: 0.9, label: "Injecao: ignore previous instructions" },
    { regex: /forget\s+(everything|all\s+previous|your\s+instructions)/gi, weight: 0.85, label: "Injecao: forget instructions" },
  ];
  // ...
}
```

### 3. Integração com Banco de Dados
```javascript
export async function handleDbTool(name, args) {
  if (!isLocalMcpEnabled()) {
    return { isError: true, content: [{ type: "text", text: "🔒 MCP local de banco de dados está desabilitado." }] };
  }
  try {
    requireLocalMcpToken(args);
  } catch (e) {
    await auditLog(AuditLevel.SECURITY, "mcp_local_db_unauthorized", { tool: name, error: e.message });
    return { isError: true, content: [{ type: "text", text: `🚫 ${e.message}` }] };
  }
  // ...
}
```
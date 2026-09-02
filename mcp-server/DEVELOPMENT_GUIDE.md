# Guia de Desenvolvimento MCP - Mestre do PC V10/V11

## 🚀 Quick Start

### Instalar e Rodar
```bash
cd mcp-server
npm install
npm start
```

### Rodar Testes
```bash
npm test
```

### Testar com MCP Inspector
```bash
npx @modelcontextprotocol/inspector
```

---

## 📁 Estrutura de Arquivos

```
mcp-server/
├── index.js                      # Ponto de entrada, 68 ferramentas
├── operation-registry.js         # Single source of truth (v10/)
├── security.js                   # Prompt injection guard
├── audit-logger.js               # Auditoria com 7 níveis
├── model-profiles.json           # Perfis de modelo Ollama
├── transports/
│   └── http-sse.js               # Transporte HTTP-SSE (remoto)
├── db/
│   ├── connector.js              # Conector MySQL
│   └── mcp-db-tools.js           # Ferramentas de banco
├── auth/
│   └── local-token.js            # Autenticação local
├── agents/
│   └── mini-copilot-cli.js       # Agente CLI
└── test/
    ├── whitelist-enforcement.test.js
    ├── launcher-security.test.js
    ├── ollama-config.test.js
    └── ... (17 arquivos de teste)
```

---

## 🛠️ Adicionando Nova Ferramenta

### Passo 1: Definir Schema (EXTRA_TOOLS em index.js)

```javascript
{
  name: "minha_nova_ferramenta",
  description: "Descrição clara que o agente verá ao buscar ferramentas.",
  inputSchema: {
    type: "object",
    properties: {
      parametro1: {
        type: "string",
        description: "Descrição do parâmetro"
      },
      parametro2: {
        type: "number",
        description: "Valor numérico (mínimo: 0)",
        minimum: 0,
      },
    },
    required: ["parametro1"],
  },
}
```

### Passo 2: Implementar Handler (CallToolRequestSchema)

```javascript
if (name === "minha_nova_ferramenta") {
  const parametro1 = args?.parametro1;
  const parametro2 = args?.parametro2 || 10;

  if (!parametro1) {
    throw new McpError(ErrorCode.InvalidParams, "parâmetro1 obrigatório");
  }

  // Guard contra prompt injection (se receber texto do usuário)
  const blocked = await guardPromptInjection(parametro1, "minha_nova_ferramenta");
  if (blocked) return blocked;

  try {
    // Lógica da ferramenta
    const resultado = await fazerAlgo(parametro1, parametro2);

    // Auditoria
    await auditLog(AuditLevel.INFO, "minha_nova_ferramenta_exec", {
      parametro1,
      parametro2,
    });

    return {
      content: [{
        type: "text",
        text: `✅ Sucesso: ${resultado}`
      }]
    };
  } catch (error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return {
        isError: true,
        content: [{
          type: "text",
          text: "⏱️ Timeout: operação demorou mais de 60s"
        }]
      };
    }
    return {
      isError: true,
      content: [{
        type: "text",
        text: `Falha: ${error.message}`
      }]
    };
  }
}
```

### Passo 3: Adicionar Teste

```javascript
// test/minha-ferramenta.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Minha Ferramenta', () => {
  it('deve retornar erro quando parametro1 estiver ausente', async () => {
    // Testar validação de parâmetros
  });

  it('deve bloquear prompt injection', async () => {
    // Testar guard de segurança
  });

  it('deve executar com sucesso', async () => {
    // Testar fluxo happy path
  });
});
```

---

## 🔒 Segurança

### Checklist Obrigatório

- [ ] **Validar parâmetros**: Usar schemas Zod/JSON com constraints
- [ ] **Prompt injection guard**: `guardPromptInjection()` para texto do usuário
- [ ] **Auditoria**: `auditLog()` em nível apropriado
- [ ] **Timeout**: `AbortSignal.timeout()` em chamadas externas
- [ ] **Error handling**: Try/catch com mensagens acionáveis
- [ ] **Classificação**: Verificar se é destrutivo via `classifyLauncherCommand()`

### Níveis de Auditoria

```javascript
AuditLevel.INFO          // Operações rotineiras
AuditLevel.WARNING       // Avisos, não críticos
AuditLevel.ERROR         // Erros de execução
AuditLevel.SECURITY      // Operações sensíveis (free command, approvals)
AuditLevel.COMMAND_EXEC  // Execução de comandos do launcher
AuditLevel.IA_OPERATION  // Chamadas de IA (Ollama)
AuditLevel.WEBHOOK       // Envio de notificações externas
```

---

## 🤖 Integração com Ollama

### Padrão de Chamada

```javascript
const result = await ollamaChat({
  messages: [{ role: "user", content: pergunta }],
  system: OLLAMA_SYSTEM_PROMPT,  // Ou customizado
  timeoutMs: 60000,               // Default: 60s
  think: true,                    // Ativa reasoning (modelos compatíveis)
});

// Resultado:
// - result.content: Resposta principal
// - result.thinking: Raciocínio (se think=true)
// - result.meta: Token counts, duração
// - result.raw: Resposta completa da API
```

### Perfis de Modelo

```javascript
// model-profiles.json
{
  "fast": {
    "label": "Rápido",
    "model": "qwen2.5-coder:3b-instruct",
    "fallbackModel": "phi3:3.8b",
    "description": "Modelo leve para tarefas simples",
    "recommended": { "minRamGB": 8 }
  },
  "balanced": {
    "label": "Equilibrado",
    "model": "qwen2.5:7b-instruct",
    "fallbackModel": "llama3.1:8b",
    "description": "Balanço entre velocidade e qualidade"
  },
  "agent": {
    "label": "Agente",
    "model": "qwen2.5:14b-instruct",
    "fallbackModel": "llama3.1:8b",
    "description": "Modelo principal para automação"
  },
  "coding": {
    "label": "Código",
    "model": "qwen2.5-coder:7b-instruct",
    "description": "Otimizado para geração e análise de código"
  },
  "reasoning": {
    "label": "Raciocínio",
    "model": "gpt-oss:20b",
    "description": "Modelo com chain-of-thought para problemas complexos"
  }
}
```

---

## 📊 Webhooks

### Discord

```javascript
await sendDiscordWebhook(webhookUrl, titulo, mensagem, cor);
// cor: hexadecimal "00ff00" (verde), "ff0000" (vermelho)
```

### Teams

```javascript
await sendTeamsWebhook(webhookUrl, titulo, mensagem, tema);
// tema: "Information", "Warning", "Danger", "Success"
```

### Slack

```javascript
await sendSlackWebhook(webhookUrl, mensagem, canal, emoji);
// canal: "#geral", emoji: ":robot_face:"
```

---

## 🧪 Testes

### Estrutura de Teste

```javascript
import { describe, it, before } from 'node:test';
import assert from 'node:assert';

describe('Feature X', () => {
  let serverState;

  before(async () => {
    // Setup
  });

  it('deve fazer algo', async () => {
    assert.strictEqual(resultado, esperado);
  });

  it('deve lidar com erro', async () => {
    await assert.rejects(async () => {
      await funcaoQueFalha();
    }, /mensagem de erro esperada/);
  });
});
```

### Rodar Testes Específicos

```bash
# Todos os testes
npm test

# Teste específico
node --test test/whitelist-enforcement.test.js

# Teste com watch (dev)
node --test --watch
```

---

## 🔧 Debug

### Logs de Auditoria

```javascript
// Consultar logs
const logs = await queryAuditLog({
  level: "ERROR",
  action: "execute_free_command",
  limit: 50,
});

// Exportar relatório
const report = await exportAuditReport({
  start_date: "2026-09-01T00:00:00Z",
  end_date: "2026-09-01T23:59:59Z",
  limit: 100,
});
```

### Variáveis de Ambiente

```bash
# Ollama
OLLAMA_MODEL=qwen2.5-coder:3b-instruct
OLLAMA_MODEL_PROFILE=balanced
OLLAMA_NUM_CTX=8192
OLLAMA_TEMPERATURE=0.7
OLLAMA_API_KEY=  # (opcional, para cloud)

# Launcher
MESTRE_BASE_URL=http://127.0.0.1:7777
MESTRE_PROJETO_PATH=C:/Mestre-do-PC-V10

# Database
MCP_DB_ENABLED=false
```

---

## 📚 Recursos

### Documentação MCP

- **Especificação**: https://modelcontextprotocol.io/specification/draft.md
- **TypeScript SDK**: https://github.com/modelcontextprotocol/typescript-sdk
- **Python SDK**: https://github.com/modelcontextprotocol/python-sdk

### Internos

- `MCP_ANALYSIS.md`: Análise completa do servidor
- `evaluation.xml`: 10 perguntas de avaliação
- `reference/mcp_best_practices.md`: Melhores práticas MCP
- `reference/node_mcp_server.md`: Guia TypeScript

---

## ✅ Checklist PR

Antes de abrir PR:

- [ ] Código segue convenções (2 espaços, aspas simples, camelCase)
- [ ] Nova ferramenta tem schema JSON bem definido
- [ ] Error handling com try/catch e mensagens acionáveis
- [ ] Auditoria implementada no nível correto
- [ ] Prompt injection guard para entrada do usuário
- [ ] Testes adicionados/atu alizados
- [ ] `npm test` passa localmente
- [ ] Commit segue Conventional Commits (`feat:`, `fix:`, `chore:`)

---

## 🆘 Troubleshooting

### Ollama não responde
```bash
# Verificar se está rodando
ollama serve

# Testar conexão
curl http://localhost:11434/api/tags

# Verificar modelo
ollama list
```

### Launcher indisponível
```bash
# Verificar status
curl http://127.0.0.1:7777/status

# Reiniciar launcher
.\MestreDoPC-Launcher.ps1
```

### Testes falhando
```bash
# Limpar cache
npm cache clean --force

# Reinstalar dependências
rm -rf node_modules package-lock.json
npm install

# Rodar testes com verbose
node --test --test-reporter=spec
```

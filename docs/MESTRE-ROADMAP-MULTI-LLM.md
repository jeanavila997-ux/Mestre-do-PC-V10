# 🗺️ Mestre do PC — Roadmap Multi-LLM (Executive Summary)

**Data:** 23 de agosto de 2026  
**Status:** Planejamento Estratégico  
**Responsável:** Claude Code (Jean Avila)

---

## 📌 1. Visão em 30 Segundos

O Mestre do PC V10/V11 é um excelente servidor MCP local, mas está **locked-in em Ollama**. 

**Proposta:** Implementar **camada de abstração de providers** que permite trocar entre Claude, OpenAI, Gemini, e Ollama com uma variável de ambiente, **sem quebrar compatibilidade**.

**Investimento:** 18-24 semanas (Phase 0-4) ou 6-9 semanas para MVP (Phase 0-1)

**ROI:** Privacidade (local), economia (batch 50%, caching 90%), confiabilidade (fallback automático), flexibilidade (melhor LLM por caso)

---

## 🎯 2. Problema Atual

| Limitação | Impacto | Solução |
|-----------|--------|--------|
| Locked-in Ollama | Sem acesso a Claude, OpenAI, Gemini | Provider abstraction |
| Sem fallback | Se Ollama cai, sem IA | Fallback chain config |
| Sem batch processing | Custos altos em queries repetidas | OpenAI Batch API (~50% economia) |
| Sem RAG | Respostas genéricas sem contexto PC | Azure Search + local RAG |
| Sem agentes avançados | Apenas chat simples | OpenAI Agents SDK (Phase 4) |
| Sem SSO corporativo | Não serve empresas com Entra ID | Microsoft Entra integration (Phase 4) |

---

## ✨ 3. Solução Proposta

### 3.1 Architecture: Provider Abstraction

```
┌─ mcp-server/index.js (não muda)
│
├─ providers/
│  ├─ base-provider.js      ← Interface uniforme
│  ├─ ollama-provider.js    ← Migração código existente
│  ├─ claude-provider.js    ← 🆕 Claude API
│  ├─ openai-provider.js    ← 🆕 OpenAI + Azure
│  ├─ gemini-provider.js    ← 🆕 Google Gemini
│  └─ provider-factory.js   ← Seleciona provider por env var
│
└─ Config:
   AI_PROVIDER=claude        (ou: openai, gemini, ollama, fallback)
   ANTHROPIC_API_KEY=...
```

### 3.2 Configuration-Driven

```bash
# .env — Escolher provider com uma linha

# Opção 1: Ollama (padrão, local, FREE)
AI_PROVIDER=ollama
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5-coder:1.5b

# Opção 2: Claude (poderoso, caching 90%)
AI_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-opus-4-1-20250805

# Opção 3: OpenAI (batch 50%, streaming)
AI_PROVIDER=openai
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o

# Opção 4: Fallback chain (tenta cada um até sucesso)
AI_PROVIDER=fallback
AI_PROVIDER_CHAIN=claude,openai,ollama
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
OLLAMA_URL=http://127.0.0.1:11434
```

### 3.3 Unified Interface

Todos providers implementam:

```javascript
interface AIProvider {
  async query(prompt, context?)              // Chat simples
  async agentic_loop(system, msg, tools)     // Com tool use
  async rag_query(query, documents)          // RAG
  async chain_of_thought(problem)            // CoT reasoning
  async health()                             // Health check
}
```

---

## 🚀 4. Roadmap Executivo (4 Fases)

### Phase 0: Abstraction Foundation (Semanas 1-3)
**Meta:** Base sem quebrar Ollama  
**Deliverables:**
- [ ] `providers/base-provider.js` (interface)
- [ ] `providers/ollama-provider.js` (migração)
- [ ] `providers/provider-factory.js` (factory)
- [ ] Testes: 100% compatibilidade Ollama
- [ ] Docs: `MULTI_LLM_ARCHITECTURE.md`

**Risco:** Nenhum — abstração pura, sem mudança de behavior

---

### Phase 1: Claude API Support (Semanas 4-6)
**Meta:** Claude como alternativa premium a Ollama  
**Deliverables:**
- [ ] `providers/claude-provider.js`
  - Tool use (function calling)
  - Vision (análise imagens)
  - Fallback: Claude → Ollama
- [ ] Testes: agentic loop com Claude
- [ ] Docs: setup guide (ANTHROPIC_API_KEY)

**MVP:** Com Phase 0 + Phase 1, Mestre do PC suporta Claude + Ollama + fallback automático

**Estimativa esforço:** 3 devs × 2 semanas = 6 dev-weeks

---

### Phase 2: OpenAI & Gemini (Semanas 7-9)
**Meta:** Suporte multi-cloud (OpenAI, Google)  
**Deliverables:**
- [ ] `providers/openai-provider.js`
  - Batch processing API (50% economia)
  - Streaming support
- [ ] `providers/gemini-provider.js`
- [ ] Config: `AI_PROVIDER=openai/gemini`
- [ ] Testes: multi-provider

---

### Phase 3: Advanced Features (Semanas 10-13)
**Meta:** Recursos que usam force de cada provider  
**Deliverables:**
- [ ] RAG framework (Azure Search ou local)
- [ ] Streaming WebSocket (UI real-time)
- [ ] Vision integration (screenshots/logs)
- [ ] Multi-model comparison

**Nota:** Features ortogonais — podem ser implementadas em qualquer ordem

---

### Phase 4: Enterprise (Semanas 14-18)
**Meta:** Integração corporativa (Entra, Teams, Agents SDK)  
**Deliverables:**
- [ ] OpenAI Agents SDK (Python service separado)
- [ ] Microsoft Entra ID (SSO + RBAC)
- [ ] Teams webhooks (notificações)
- [ ] Graph change notifications

**Nota:** Dependências externas — só após Phase 0-3 estáveis

---

## 💰 5. Business Case

### Investment
- **Phase 0-1 (MVP):** 4-6 dev-weeks, ~$20-30k (1 dev, 1.5 meses)
- **Phase 0-4 (Full):** 18-24 dev-weeks, ~$90-120k (1-2 devs, 6 meses)

### Returns

#### Custo-Benefício Imediato (Phase 0-1)
| Métrica | Antes | Depois | Ganho |
|---------|-------|--------|-------|
| LLMs suportados | 1 (Ollama) | 3+ (Claude, OpenAI, Ollama) | 3x flexibilidade |
| Privacidade | Depende Ollama | Opção 100% local | ✅ |
| Confiabilidade | Single point of failure | Fallback automático | ✅ |
| Esforço manutenção | Alto (integração hard-coded) | Baixo (abstração) | 50% menos tempo |

#### Economia (Phase 2-3)
| Use Case | Ferramenta | Economia |
|----------|-----------|----------|
| Queries repetidas (logs, telemetria) | OpenAI Batch | 50% |
| Grandes prompts com contexto | Claude Prompt Caching | ~90% |
| Vision (screenshot analysis) | Claude/OpenAI | +capability |

**Exemplo:** PC com 1000 queries/mês
- Ollama local: $0 (mas precisa GPU, 8GB RAM)
- OpenAI sem batch: ~$50/mês
- OpenAI com batch: ~$25/mês (50% economia)
- Claude: ~$15/mês (com caching)

#### Confiabilidade
- **Downtime reduzido:** Fallback automático (se Claude cai, usa OpenAI ou Ollama)
- **Observabilidade:** Health checks para cada provider
- **Resilience:** Retry logic com backoff exponencial

---

## 🎓 6. Como Começar (Imediatamente)

### Step 1: Preparar infraestrutura (1 dia)
```bash
cd Mestre-do-PC-V10-clean/mcp-server

# Criar branch
git checkout -b feature/provider-abstraction

# Instalar dependências (placeholder, não quebra nada)
npm install  # Ollama SDK já está, adicionaremos outros na Phase 1+

# Criar estrutura
mkdir providers
touch providers/{base-provider,ollama-provider,provider-factory}.js
```

### Step 2: Implementar base-provider.js (2-3 dias)

```javascript
// providers/base-provider.js
export class BaseProvider {
  constructor(config) {
    this.config = config;
  }

  async query(prompt, context) {
    throw new Error("Subclass must implement query()");
  }

  async agentic_loop(system, userMsg, tools, maxIterations = 5) {
    throw new Error("Subclass must implement agentic_loop()");
  }

  async health() {
    throw new Error("Subclass must implement health()");
  }
}
```

### Step 3: Migrar Ollama para provider (2-3 dias)

```javascript
// providers/ollama-provider.js
import { BaseProvider } from "./base-provider.js";

export class OllamaProvider extends BaseProvider {
  async query(prompt, context) {
    // Migrar código existente de mcp-server/index.js aqui
    // (método perguntar_ia, etc.)
  }

  async agentic_loop(system, userMsg, tools) {
    // Migrar código de resolução de problemas
  }

  async health() {
    // GET /api/tags no Ollama
  }
}
```

### Step 4: Factory pattern (1 dia)

```javascript
// providers/provider-factory.js
import { OllamaProvider } from "./ollama-provider.js";
import { ClaudeProvider } from "./claude-provider.js";  // Phase 1
import { OpenAIProvider } from "./openai-provider.js";  // Phase 2

export function createProvider(config) {
  const provider = config.AI_PROVIDER || "ollama";
  
  switch (provider) {
    case "ollama":
      return new OllamaProvider(config);
    case "claude":
      return new ClaudeProvider(config);
    case "openai":
      return new OpenAIProvider(config);
    case "fallback":
      return new FallbackProvider(config);  // Tenta chain
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
```

### Step 5: Atualizar mcp-server/index.js (1-2 dias)

```javascript
// mcp-server/index.js
import { createProvider } from "./providers/provider-factory.js";

const aiProvider = createProvider({
  AI_PROVIDER: process.env.AI_PROVIDER || "ollama",
  OLLAMA_URL: process.env.OLLAMA_URL,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  // ... outros
});

// Usar aiProvider ao invés de chamar Ollama diretamente
async function handleToolCall(toolName, params) {
  if (toolName === "perguntar_ia") {
    const response = await aiProvider.query(params.prompt);
    return response;
  }
  // ...
}
```

### Step 6: Testes (2-3 dias)

```javascript
// mcp-server/test/provider-factory.test.js
import { createProvider } from "../providers/provider-factory.js";

test("Ollama provider should work with existing code", async () => {
  const provider = createProvider({
    AI_PROVIDER: "ollama",
    OLLAMA_URL: "http://127.0.0.1:11434"
  });
  
  const result = await provider.health();
  assert(result.status === "ok", "Ollama should be healthy");
});

test("Fallback should retry on error", async () => {
  // Se Claude API_KEY não configurada, deve retornar Ollama
  // Se Ollama cai, deve dar erro apropriado
});
```

### Step 7: PR & Review (1-2 dias)

- Abrir PR em `Mestre-do-PC-V10-clean`
- Code review + CI (testes de compatibilidade)
- Merge para main

**Estimativa Total Phase 0:** 12-15 dias (2-3 semanas) com 1 dev

---

## 📊 7. Métricas de Sucesso

### Phase 0 Completion Criteria
- ✅ 100% testes passando (existing Ollama tests)
- ✅ 0 mudanças de behavior (backward compatible)
- ✅ Performance: latência < 5% vs. código atual
- ✅ Código review aprovado
- ✅ Docs: MULTI_LLM_ARCHITECTURE.md + setup guide

### Phase 1 Completion Criteria
- ✅ Claude API funcionando end-to-end
- ✅ Fallback chain: Claude → Ollama
- ✅ Tool use (Claude function calling)
- ✅ 90% dos testes existentes passando com Claude
- ✅ Docs: Como configurar ANTHROPIC_API_KEY
- ✅ User can switch: `AI_PROVIDER=claude` → funciona

### MVP Success (Phase 0 + Phase 1)
- ✅ Mestre do PC suporta Ollama + Claude + fallback
- ✅ Compatibilidade 100% com código existente
- ✅ 0 breaking changes
- ✅ Performance não degrada

---

## ⚠️ 8. Riscos & Mitigação

| Risco | Impacto | Mitigação |
|-------|--------|-----------|
| **Quebrar Ollama** | Crítico | Testes exaustivos de compatibilidade antes de merge |
| **API key exposure** | Alto | Nunca commitar keys; usar env vars; audit logging |
| **Rate limiting** | Médio | Implementar backoff + retry; monitoring |
| **Latência adicional** | Baixo | Factory pattern é O(1); profile antes/depois |
| **Dependências outdated** | Médio | npm audit regularmente; pin versions |

---

## 📚 9. Documentação a Criar

### Phase 0
- [ ] `MULTI_LLM_ARCHITECTURE.md` — design decisions + diagrams
- [ ] `PROVIDER_ABSTRACTION.md` — como estender com novo provider

### Phase 1
- [ ] `PROVIDER_SETUP_GUIDE.md` — um doc por provider (Claude, OpenAI, etc.)
- [ ] `FALLBACK_STRATEGY.md` — configuração de fallback chain

### Phase 3
- [ ] `RAG_INTEGRATION.md` — setup de Azure Search ou local RAG
- [ ] `STREAMING_GUIDE.md` — WebSocket + real-time updates

### Phase 4
- [ ] `OPENAI_AGENTS_SDK.md` — deployment do serviço Python
- [ ] `ENTRA_ID_INTEGRATION.md` — SSO setup

---

## 🔗 10. Integração com Awesome Copilot Agents

| Artefato | Aplicação |
|----------|-----------|
| **Custom Agents** | Criar agente "PC Diagnostician" + "Security Auditor" |
| **Agent Skills** | Create `SKILL.md` para "PC Diagnostics" (portável) |
| **Prompts** | Documentar prompts ótimos por provider (Claude vs OpenAI nuances) |
| **Instructions** | `.instructions.md` para Windows diagnostics |

---

## 🎬 11. Próximo Passo (HOJE)

**Ação imediata:**

1. ✅ Análise concluída → `analise-mestre-do-pc-multi-llm.html`
2. ✅ Roadmap definido → `MESTRE-ROADMAP-MULTI-LLM.md` (este arquivo)
3. ⏭️ **Criar issues no GitHub:**
   - `[Phase 0] Provider Abstraction Foundation`
   - `[Phase 1] Claude API Support`
   - `[Phase 2] OpenAI & Gemini Providers`
   - `[Phase 3] RAG + Streaming Features`
   - `[Phase 4] Enterprise Integration`

4. ⏭️ **Designar proprietário:**
   - Jean Avila (ou designado) como tech lead
   - Começar Phase 0 ASAP

5. ⏭️ **Comunicar stakeholders:**
   - Apresentar ROI (economia, confiabilidade, flexibilidade)
   - Confirmar prioridade (MVP em 6-9 semanas)

---

## 📞 Contatos & Refs

**Documentação Oficial:**
- MCP Spec: https://modelcontextprotocol.io
- Claude API: https://claude.ai/api
- OpenAI: https://platform.openai.com/docs
- Gemini: https://ai.google.dev
- Ollama: https://ollama.ai
- Microsoft Learn: https://learn.microsoft.com

**Projetos Relacionados:**
- Mestre-do-PC-V10: https://github.com/jeanavila997-ux/Mestre-do-PC-V10
- Awesome Copilot Agents: https://github.com/Code-and-Sorts/awesome-copilot-agents

---

**Documento Final:** 23 de agosto de 2026  
**Status:** Pronto para implementação  
**Aprovação:** Aguardando tech lead assignment


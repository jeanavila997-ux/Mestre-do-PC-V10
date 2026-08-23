# ✅ Mestre do PC — Phase 0 Implementation Checklist

**Objetivo:** Implementar camada de abstração de providers mantendo 100% compatibilidade com Ollama  
**Prazo:** 2-3 semanas  
**Dev-time:** 1 dev, part-time ou 0.5 devs full-time

---

## 📋 Pre-Implementation

### Preparação do Repositório
- [ ] Clonar `Mestre-do-PC-V10-clean`
- [ ] Criar branch: `git checkout -b feature/phase-0-provider-abstraction`
- [ ] Verificar testes existentes passam: `npm test` em `mcp-server/`
- [ ] Documentar commit baseline (para comparação pós-refactor)

### Análise de Código Existente
- [ ] Revisar `mcp-server/index.js` (linhas com Ollama API calls)
- [ ] Identificar pattern: "perguntar_ia", "resolver_problema_passo_a_passo", etc.
- [ ] Listar todos métodos que chamam Ollama HTTP
- [ ] Revisar `mcp-server/security.js` (validações que precisam permanecer)

### Setup Local
```bash
cd Mestre-do-PC-V10-clean/mcp-server
npm ci                              # install deps
npm test                            # garantir tudo passa
node --check index.js               # syntax check
```

---

## 🔨 Phase 0 Tasks (In Priority Order)

### Task 1: Create Base Provider Interface (Day 1-2)

**File:** `mcp-server/providers/base-provider.js`

**Checklist:**
- [ ] Criar arquivo `providers/base-provider.js`
- [ ] Define abstract class `BaseProvider`
- [ ] Implementar métodos abstratos (throw NotImplementedError):
  - [ ] `async query(prompt, context)`
  - [ ] `async agentic_loop(system, userMsg, tools, maxIterations)`
  - [ ] `async rag_query(query, documents, instructions)` (opcional para Phase 0)
  - [ ] `async chain_of_thought(problem)` (opcional para Phase 0)
  - [ ] `async health()`
  - [ ] `async compare_models(query, models)` (opcional para Phase 0)
- [ ] Adicionar JSDoc comments
- [ ] Exportar `BaseProvider`

**Code Template:**
```javascript
// mcp-server/providers/base-provider.js

/**
 * BaseProvider - Abstract base for LLM providers
 * All implementations must inherit this and implement all abstract methods
 */
export class BaseProvider {
  /**
   * @param {Object} config - Provider configuration
   * @param {string} config.name - Provider name (ollama, claude, openai, etc)
   */
  constructor(config) {
    this.name = config.name || "unknown";
    this.config = config;
  }

  /**
   * Simple query to the LLM
   * @param {string} prompt - User prompt
   * @param {Object} options - Optional settings (temperature, max_tokens, etc)
   * @returns {Promise<string>} LLM response text
   */
  async query(prompt, options = {}) {
    throw new Error(`${this.name}: query() not implemented`);
  }

  /**
   * Agentic loop - LLM with tool access
   * @param {string} system - System prompt
   * @param {string} userMsg - User message
   * @param {Array<Object>} tools - Available tools with schema
   * @param {number} maxIterations - Max loop iterations (default 5)
   * @returns {Promise<Object>} { response, tool_calls: [...], iterations: N }
   */
  async agentic_loop(system, userMsg, tools, maxIterations = 5) {
    throw new Error(`${this.name}: agentic_loop() not implemented`);
  }

  /**
   * Health check
   * @returns {Promise<Object>} { status: 'ok'|'error', message: string }
   */
  async health() {
    throw new Error(`${this.name}: health() not implemented`);
  }

  /**
   * RAG query (Phase 3)
   * @param {string} query - User query
   * @param {Array<string>} documents - Context documents
   * @returns {Promise<string>} Response with context
   */
  async rag_query(query, documents = [], instructions = null) {
    throw new Error(`${this.name}: rag_query() not implemented`);
  }

  /**
   * Chain-of-Thought reasoning (Phase 3)
   * @param {string} problem - Problem to solve
   * @returns {Promise<Object>} { reasoning_steps: [...], final_answer: string }
   */
  async chain_of_thought(problem) {
    throw new Error(`${this.name}: chain_of_thought() not implemented`);
  }

  /**
   * Compare multiple models (Phase 3)
   * @param {string} query - Query to compare
   * @param {Array<string>} models - Model names to compare
   * @returns {Promise<Object>} { models: { model: response } }
   */
  async compare_models(query, models = []) {
    throw new Error(`${this.name}: compare_models() not implemented`);
  }
}
```

**Testing:**
- [ ] Arquivo criado e syntactically valid: `node --check providers/base-provider.js`
- [ ] Instanciação fails: `const p = new BaseProvider({}); p.query()` → throw error

---

### Task 2: Migrate Ollama to OllamaProvider (Day 3-5)

**File:** `mcp-server/providers/ollama-provider.js`

**Checklist:**
- [ ] Criar arquivo `providers/ollama-provider.js`
- [ ] Imports: `import { BaseProvider } from "./base-provider.js"`
- [ ] Extrair código Ollama de `mcp-server/index.js`:
  - [ ] Copiar função `perguntar_ia()` → refactor para `async query()`
  - [ ] Copiar função `resolver_problema_passo_a_passo()` → refactor para `async agentic_loop()`
  - [ ] Copiar function resolving de tools → integrar no agentic loop
- [ ] Implementar `health()` (GET `/api/tags` no Ollama)
- [ ] Config via constructor:
  - [ ] `OLLAMA_URL` (default: `http://127.0.0.1:11434`)
  - [ ] `OLLAMA_MODEL` (default: `qwen2.5-coder:1.5b`)
  - [ ] `OLLAMA_TEMPERATURE`, etc. (env vars)

**Code Template:**
```javascript
// mcp-server/providers/ollama-provider.js
import { BaseProvider } from "./base-provider.js";
import { auditLog, AuditLevel } from "../audit-logger.js";

export class OllamaProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.name = "ollama";
    this.url = config.OLLAMA_URL || "http://127.0.0.1:11434";
    this.model = config.OLLAMA_MODEL || "qwen2.5-coder:1.5b";
    this.temperature = parseFloat(config.OLLAMA_TEMPERATURE || "0.7");
    this.topP = parseFloat(config.OLLAMA_TOP_P || "0.9");
    this.topK = parseInt(config.OLLAMA_TOP_K || "40");
  }

  async query(prompt, options = {}) {
    try {
      const response = await fetch(`${this.url}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt,
          temperature: options.temperature ?? this.temperature,
          top_p: options.top_p ?? this.topP,
          top_k: options.top_k ?? this.topK,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();
      await auditLog(AuditLevel.INFO, "ollama_query", { prompt, model: this.model });
      return data.response;
    } catch (error) {
      await auditLog(AuditLevel.ERROR, "ollama_error", { error: error.message });
      throw error;
    }
  }

  async health() {
    try {
      const response = await fetch(`${this.url}/api/tags`);
      if (response.ok) {
        return { status: "ok", message: "Ollama is healthy" };
      } else {
        return { status: "error", message: `Ollama error: ${response.statusText}` };
      }
    } catch (error) {
      return { status: "error", message: `Ollama unreachable: ${error.message}` };
    }
  }

  async agentic_loop(system, userMsg, tools, maxIterations = 5) {
    // Implementar lógica de resolução de problemas com tool calling
    // Ver: mcp-server/index.js - função "resolver_problema_passo_a_passo"
    throw new Error("Ollama agentic_loop not fully implemented for Phase 0");
  }
}
```

**Testing:**
- [ ] Imports corretos: `node --check providers/ollama-provider.js`
- [ ] Herança: `const o = new OllamaProvider({}); o instanceof BaseProvider` → true
- [ ] Health check local:
  ```bash
  node -e "
  import('./providers/ollama-provider.js').then(m => {
    const p = new m.OllamaProvider({});
    p.health().then(h => console.log(h));
  });
  "
  ```

---

### Task 3: Create Provider Factory (Day 6-7)

**File:** `mcp-server/providers/provider-factory.js`

**Checklist:**
- [ ] Criar arquivo `providers/provider-factory.js`
- [ ] Função `createProvider(config)` que:
  - [ ] Lê `AI_PROVIDER` env var (default: "ollama")
  - [ ] Retorna instância apropriada
  - [ ] Suporta `AI_PROVIDER=ollama` → `new OllamaProvider()`
  - [ ] Suporta `AI_PROVIDER=fallback` → `new FallbackProvider([...])` (Phase 1+)
  - [ ] Log do provider selecionado em startup
- [ ] Validação: se provider não reconhecido, throw error

**Code Template:**
```javascript
// mcp-server/providers/provider-factory.js
import { OllamaProvider } from "./ollama-provider.js";
// import { ClaudeProvider } from "./claude-provider.js";      // Phase 1
// import { OpenAIProvider } from "./openai-provider.js";      // Phase 2
// import { GeminiProvider } from "./gemini-provider.js";      // Phase 2

export function createProvider(env = process.env) {
  const provider = (env.AI_PROVIDER || "ollama").toLowerCase().trim();

  const config = {
    name: provider,
    OLLAMA_URL: env.OLLAMA_URL,
    OLLAMA_MODEL: env.OLLAMA_MODEL,
    OLLAMA_TEMPERATURE: env.OLLAMA_TEMPERATURE,
    OLLAMA_TOP_P: env.OLLAMA_TOP_P,
    OLLAMA_TOP_K: env.OLLAMA_TOP_K,
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,  // Phase 1
    OPENAI_API_KEY: env.OPENAI_API_KEY,        // Phase 2
    GOOGLE_API_KEY: env.GOOGLE_API_KEY,        // Phase 2
  };

  switch (provider) {
    case "ollama":
      return new OllamaProvider(config);

    // Phase 1
    // case "claude":
    //   return new ClaudeProvider(config);

    // Phase 2
    // case "openai":
    //   return new OpenAIProvider(config);
    // case "gemini":
    //   return new GeminiProvider(config);

    // case "fallback":
    //   const chain = (env.AI_PROVIDER_CHAIN || "claude,openai,ollama").split(",");
    //   return new FallbackProvider(chain.map(p => createProvider({ ...env, AI_PROVIDER: p })));

    default:
      throw new Error(`Unknown AI_PROVIDER: ${provider}. Use: ollama, claude, openai, gemini, fallback`);
  }
}
```

**Testing:**
- [ ] Syntax: `node --check providers/provider-factory.js`
- [ ] Default (Ollama):
  ```bash
  node -e "
  import('./providers/provider-factory.js').then(m => {
    const p = m.createProvider({});
    console.log(p.name);  // Should be 'ollama'
  });
  "
  ```
- [ ] Error on unknown provider:
  ```bash
  node -e "
  import('./providers/provider-factory.js').then(m => {
    try {
      m.createProvider({ AI_PROVIDER: 'unknown' });
      console.error('Should have thrown');
    } catch (e) {
      console.log('Correctly rejected');
    }
  });
  "
  ```

---

### Task 4: Refactor mcp-server/index.js (Day 8-10)

**Checklist:**
- [ ] Adicionar import: `import { createProvider } from "./providers/provider-factory.js"`
- [ ] Em startup, criar provider:
  ```javascript
  const aiProvider = createProvider(process.env);
  console.log(`[MCP] Using AI provider: ${aiProvider.name}`);
  ```
- [ ] Refactor cada tool que chamava Ollama:
  - [ ] `perguntar_ia` → `aiProvider.query(...)`
  - [ ] `resolver_problema_passo_a_passo` → `aiProvider.agentic_loop(...)`
  - [ ] etc.
- [ ] Remover código Ollama duplicado (mantém lógica em provider)
- [ ] Garantir que `aiProvider` está em escopo global (ou passar via context)
- [ ] Adicionar error handling se provider não saudável no startup

**Refactor Template:**
```javascript
// Before (inline Ollama):
async function handlePerguntar_ia(params) {
  const response = await fetch("http://127.0.0.1:11434/api/generate", {
    method: "POST",
    body: JSON.stringify({ prompt: params.prompt, ... })
  });
  return response.json();
}

// After (provider abstraction):
const aiProvider = createProvider(process.env);

async function handlePerguntar_ia(params) {
  const response = await aiProvider.query(params.prompt);
  return { response: response };
}
```

**Testing:**
- [ ] Syntax: `node --check index.js`
- [ ] Testes MCP ainda passam: `npm test`
- [ ] Ollama provider é default se sem env var
- [ ] Health check no startup:
  ```javascript
  const health = await aiProvider.health();
  if (health.status !== "ok") {
    console.warn(`[MCP] Provider ${aiProvider.name} not healthy: ${health.message}`);
    // Don't fail startup — provider pode estar offline
  }
  ```

---

### Task 5: Create Comprehensive Tests (Day 11-12)

**File:** `mcp-server/test/provider-factory.test.js`

**Checklist:**
- [ ] Teste: Factory cria OllamaProvider por default
- [ ] Teste: Factory rejeita provider desconhecido
- [ ] Teste: OllamaProvider.health() funciona (se Ollama local rodando)
- [ ] Teste: OllamaProvider.query() retorna string não-vazia
- [ ] Teste: BaseProvider não pode ser instanciado
- [ ] Teste: Todos os métodos abstratos throw error se não overridden

**File:** `mcp-server/test/integration.test.js` (novo)

**Checklist:**
- [ ] Integração: Criar provider, testar "perguntar_ia" tool
- [ ] Integração: Mudar `AI_PROVIDER=ollama` no env, garante compatibilidade
- [ ] Performance: latência de factory creation < 10ms
- [ ] Performance: query latência similar a antes (< 5% overhead)

**Test Template:**
```javascript
// mcp-server/test/provider-factory.test.js
import assert from "node:assert";
import { test } from "node:test";
import { createProvider } from "../providers/provider-factory.js";
import { BaseProvider } from "../providers/base-provider.js";
import { OllamaProvider } from "../providers/ollama-provider.js";

test("Factory creates OllamaProvider by default", () => {
  const provider = createProvider({});
  assert(provider instanceof OllamaProvider);
  assert.equal(provider.name, "ollama");
});

test("Factory rejects unknown provider", () => {
  assert.throws(
    () => createProvider({ AI_PROVIDER: "unknown" }),
    /Unknown AI_PROVIDER/
  );
});

test("BaseProvider cannot be instantiated", () => {
  const base = new BaseProvider({});
  assert.throws(() => base.query("test"), /not implemented/);
});

test("OllamaProvider health check works", async () => {
  const provider = new OllamaProvider({ OLLAMA_URL: "http://127.0.0.1:11434" });
  const health = await provider.health();
  assert(health.status === "ok" || health.status === "error");
  assert(typeof health.message === "string");
});
```

**Run Tests:**
```bash
cd mcp-server
npm test
npm test test/provider-factory.test.js    # single file
```

---

### Task 6: Update Documentation (Day 13)

**Files to Create/Update:**

1. **NEW:** `docs/MULTI_LLM_ARCHITECTURE.md`
   - [ ] Architecture diagram (ASCII or SVG)
   - [ ] Design decisions
   - [ ] Future phases preview

2. **NEW:** `docs/PROVIDER_ABSTRACTION.md`
   - [ ] How to extend with new provider
   - [ ] BaseProvider interface definition
   - [ ] Code template for new provider

3. **UPDATE:** `mcp-server/README.md` (if exists) or `docs/MCP_SERVER.md`
   - [ ] Note Phase 0 completed
   - [ ] How to select provider via `AI_PROVIDER` env var
   - [ ] Example configurations

4. **UPDATE:** `CLAUDE.md` or `AGENTS.md`
   - [ ] Add section on AI providers
   - [ ] Configuration options

**Docs Checklist:**
- [ ] Example: `AI_PROVIDER=ollama` (default)
- [ ] Example: future `AI_PROVIDER=claude` (Phase 1)
- [ ] Fallback chain explanation
- [ ] How to debug provider issues

---

### Task 7: Final Validation & PR (Day 14-15)

**Pre-Merge Checklist:**
- [ ] All tests pass: `npm test` (100% of existing tests)
- [ ] No syntax errors: `node --check index.js` + all providers
- [ ] Backward compatible: If no `AI_PROVIDER` set, defaults to Ollama
- [ ] Performance: Profile latency (compare before/after)
- [ ] Security: No secrets logged in console or tests
- [ ] Documentation: All docs are clear and complete

**Performance Benchmark:**
```bash
# Before refactor: baseline latency of "perguntar_ia" tool
time node -e "
import('./index.js').then(() => {
  // measure tool execution
});
"

# After refactor: should be within 5% of baseline
```

**Create PR:**
- [ ] Title: `feat: Phase 0 - Provider Abstraction Foundation`
- [ ] Description:
  ```
  - Implement BaseProvider interface
  - Migrate Ollama to OllamaProvider
  - Create ProviderFactory for selection
  - Refactor mcp-server/index.js to use abstraction
  - 100% backward compatible
  - All existing tests passing
  - Ready for Phase 1 (Claude API)
  ```
- [ ] Link issues (if any)
- [ ] Request code review from team lead
- [ ] Merge after approval

---

## 🎯 Definition of Done (Phase 0)

**Acceptance Criteria:**
- ✅ All existing tests pass (100% compatibility)
- ✅ Zero performance degradation (< 5% overhead acceptable)
- ✅ No breaking changes to MCP tool API
- ✅ Provider selection works via `AI_PROVIDER` env var
- ✅ Documentation complete and clear
- ✅ Code reviewed and approved
- ✅ Merged to main branch

**Deliverables:**
1. `mcp-server/providers/base-provider.js` (abstract interface)
2. `mcp-server/providers/ollama-provider.js` (migrated)
3. `mcp-server/providers/provider-factory.js` (factory pattern)
4. `mcp-server/test/provider-factory.test.js` (tests)
5. `docs/MULTI_LLM_ARCHITECTURE.md` (design doc)
6. `docs/PROVIDER_ABSTRACTION.md` (extension guide)

---

## 📊 Effort Estimation

| Task | Effort | Notes |
|------|--------|-------|
| Task 1: BaseProvider | 4-6 hours | Straightforward abstract class |
| Task 2: OllamaProvider | 6-8 hours | Extract existing logic, test |
| Task 3: ProviderFactory | 2-3 hours | Simple switch/case factory |
| Task 4: Refactor index.js | 4-6 hours | Find & replace, test each tool |
| Task 5: Tests | 6-8 hours | Unit + integration + perf |
| Task 6: Documentation | 4-6 hours | Architecture + setup guide |
| Task 7: PR & validation | 2-4 hours | Code review, merge |
| **TOTAL** | **28-41 hours** | **~1 dev, 2-3 weeks** |

---

## 🚀 How to Use This Checklist

1. **Print or bookmark** this file
2. **Check off** each task as completed
3. **Test locally** before moving to next task
4. **Commit frequently:** Each task = 1-2 commits
5. **Keep PR reviewers updated:** Comments with status

**Commits should follow conventional commits:**
```
feat(providers): add BaseProvider interface
feat(providers): implement OllamaProvider
feat(providers): create ProviderFactory
refactor(mcp-server): use provider abstraction
test(providers): comprehensive test suite
docs: add Multi-LLM architecture guide
```

---

## 📞 Help & Support

**If stuck on a task:**
1. Check the Code Template above (each task has one)
2. Run existing tests to see current behavior
3. Ask for code review earlier (don't wait for PR)
4. Reference Phase 0 docs once created

**Common issues:**
- **"Ollama tests failing after refactor"** → Check OllamaProvider passes same config to HTTP calls
- **"Factory not creating right provider"** → Verify env var case sensitivity (use `.toLowerCase()`)
- **"Performance degraded"** → Profile with `console.time()` to find bottleneck
- **"Import errors"** → Check `.js` extension on all imports (ES modules)

---

**Last updated:** 23 de agosto de 2026  
**Status:** Ready for implementation  
**Next step:** Assign developer to Phase 0


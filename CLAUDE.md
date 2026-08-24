# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 📌 Projeto

**Mestre do PC V10/V11** é um aplicativo Windows de diagnóstico, manutenção e automação com backend MCP + IA avançada. 

### Stack Principal
- **Frontend:** HTML5 + Vanilla JS SPA (http://127.0.0.1:7777)
- **Backend não-elevado:** Node.js 20+ MCP server (`mcp-server/index.js`)
- **Backend elevado:** Node.js launcher (`v10/launcher.js`) ou PowerShell launcher (`MestreDoPC-Launcher.ps1`)
- **IA Local/Cloud:** Ollama (http://127.0.0.1:11434) — suporta cloud mode com chaves
- **Extensão:** Manifest V3 (Chrome/Firefox)
- **Segurança:** Auditoria rotatória, sanitização, prompt-injection detection
- **Webhooks:** Discord, Teams, Slack com notificações

### Estrutura de Pastas
```
.
├── mcp-server/              ← Servidor MCP (non-elevated, ~68 tools)
│   ├── index.js            ← Definições de ferramentas
│   ├── security.js         ← Sanitização e injection detection
│   ├── audit-logger.js     ← Logs rotativos com 7 níveis
│   ├── model-profiles.json ← Presets Ollama (fast, balanced, agent, coding, reasoning)
│   ├── test/               ← Testes segurança, launcher, MCP, prompt-guard
│   └── prompt-guard-server.py ← Microserviço Python detection (opcional)
│
├── v10/                     ← Interface + Launcher elevado
│   ├── index.html          ← SPA principal (servida por launcher) - 2375 linhas
│   ├── launcher.js         ← HTTP server port 7777 (elevado)
│   ├── rede-dashboard.js   ← Painel diagnóstico de rede
│   ├── allowed-operations.json ← Whitelist (~301 comandos)
│   └── novidades-v11.html  ← Release notes
│
├── browser-extension/       ← Manifest V3 (Chrome/Firefox)
│   ├── manifest.json
│   ├── popup.js/html       ← UI popup
│   ├── background.js       ← Service worker
│   └── dist/               ← Zips pré-compiladas
│
├── docs/                    ← Documentação
│   ├── MESTRE-ROADMAP-MULTI-LLM.md  ← Phase 0-4 roadmap
│   ├── MESTRE-IMPLEMENTATION-CHECKLIST.md ← Checklist Phase 0
│   ├── notepad-plus-plus-integration.md ← Integração NPP
│   └── analise-mestre-do-pc-multi-llm.html ← Análise estratégica
│
├── startup/                 ← Scripts de inicialização
├── scripts/                 ← Auxiliares (relatórios, setup)
└── sugestoes/               ← Sugestões e melhorias (não rastreado)
```

---

## 🏗️ Arquitetura de 3 Camadas

```
┌─ MCP Client (Claude Desktop / Copilot / Codex / Qwen Code)
│  (comunicação via stdio — MCP protocol)
│
├─ mcp-server/index.js [NON-ELEVATED]
│  └─ 68+ ferramentas MCP: perguntar_ia, diagnostico_completo, etc.
│     │  HTTP POST http://127.0.0.1:7777/run
│     │  Header: X-Mestre-Client: mcp
│     │
│     └─ [VALIDATED AGAINST WHITELIST]
│
├─ v10/launcher.js ou MestreDoPC-Launcher.ps1 [ELEVATED]
│  └─ HTTP server port 7777
│     │  Valida contra allowed-operations.json
│     │  Executa comandos em PowerShell jobs (max 3 simultâneos)
│     │  Timeout: 15 minutos
│     │  Suporta templates com {{PLACEHOLDER}} + regex validation
│     │  Endpoints: /run, /run-status, /ping, /shutdown, /ollama/*, /npp, /mcp/*
│     │
│     └─ [EXECUTE ONLY WHITELISTED OPERATIONS]
│
└─ PowerShell.exe [OS LEVEL]
   └─ Comandos administrativos (drivers, WMI, regras de firewall, etc.)
```

**Princípio fundamental:** Separação clara entre non-elevated e elevated. O MCP NUNCA executa comandos diretamente.

---

## 🌐 Interface Web (v10/index.html)

A UI SPA possui abas de navegação:

| Aba | Conteúdo |
|-----|----------|
| 🏠 Início | Dashboard com categorias de comandos |
| 💬 Chat IA | Chat com Ollama (local/cloud) |
| 📊 Logs | Logs de auditoria em tempo real |
| 📋 Git | Status, commit, push, pull |
| ⚙️ Config | Variáveis de ambiente, perfis de modelo |
| 🔌 MCP (NOVO) | Integração Multi-LLM com servidores, ferramentas e histórico |

**Nova aba MCP (V11.1):**
- Grid de servidores MCP conectados
- Accordion de ferramentas por categoria
- Histórico de execuções com status
- Modais para adicionar servidores e executar ferramentas
- CSS dedicado (`.mcp-tab-content`, `.mcp-servers-grid`, `.mcp-tools-accordion`)

---

## 🔑 Variáveis de Ambiente Críticas

| Variável | Padrão | Uso |
|----------|--------|-----|
| `MESTRE_BASE_URL` | `http://127.0.0.1:7777` | Endpoint do launcher (MCP + UI) |
| `MESTRE_PROJETO_PATH` | diretório do launcher | Raiz para git/logs (OBRIGATÓRIO: use sempre!) |
| `MESTRE_AUDIT_LOG_DIR` | `logs/audit` | Logs rotativos (10MB max, 30 arquivos) |
| `MESTRE_EXTENSION_TOKEN` | — | Token auth para `X-Mestre-Client: browser-extension` |
| **Ollama (Local)** | | |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | URL Ollama local |
| `OLLAMA_MODEL` | `qwen2.5-coder:1.5b` | Modelo padrão |
| `OLLAMA_MODEL_PROFILE` | — | Perfil pré-configurado (fast/balanced/agent/coding/reasoning) |
| `OLLAMA_TEMPERATURE` | `0.7` | Sampling (0=determinístico, 2=caótico) |
| `OLLAMA_TOP_P` | `0.9` | Nucleus sampling |
| `OLLAMA_TOP_K` | `40` | Top-K sampling |
| `OLLAMA_NUM_PREDICT` | `0` (ilimitado) | Tokens máximos na resposta |
| `OLLAMA_SEED` | `0` (aleatório) | Seed para reprodutibilidade |
| `OLLAMA_KEEP_ALIVE` | `5m` | Tempo de life do modelo |
| **Ollama Cloud** | | |
| `OLLAMA_API_KEY` | — | Se definida: ativa cloud mode, muda URL p/ `https://ollama.com/api`, adiciona header `Authorization: Bearer` |
| **Multi-LLM (Phase 1+)** | | |
| `AI_PROVIDER` | `ollama` | Provider a usar: `ollama`, `claude`, `openai`, `gemini`, `fallback` |
| `ANTHROPIC_API_KEY` | — | Chave Claude (Phase 1) |
| `OPENAI_API_KEY` | — | Chave OpenAI (Phase 2) |
| `AI_PROVIDER_CHAIN` | — | Fallback chain se `AI_PROVIDER=fallback` (ex: `claude,openai,ollama`) |

**IMPORTANTE:** Sempre use `MESTRE_PROJETO_PATH` ao invés de hardcoding caminhos pessoais no código.

---

## 🛡️ Segurança (Hard Rules)

### 1. **Whitelist Obrigatória**
- Todos os comandos devem estar em `v10/allowed-operations.json`.
- Campo `id`: identificador único, usado nos tools MCP.
- Campo `command`: comando PowerShell exato.
- Campo `destructive`: `true` se deleta/desativa (exige confirmação do usuário).
- Comandos paramétricos usam `{{UPPERCASE_NAME}}` + regex validation.
- **Nunca adicione comandos free-form gerados por IA.**

### 2. **Sanitização**
- Função `sanitizeToolArgument()` em `mcp-server/security.js` rejeita tudo fora de `[a-zA-Z0-9_. -]` (max 128 chars).
- Nunca passe input do usuário diretamente a PowerShell.
- Validações regex por parâmetro (ex: path, port, email).

### 3. **Prompt Injection Detection**
- `checkPromptInjection()` em `security.js` verifica 10 padrões:
  - `ignore previous`, `act as`, `you are now`, `system`, `persona change`, `privilege escalation`, etc.
- Scan ocorre ANTES de Ollama receber o prompt.

### 4. **Confirmação Obrigatória**
- Operações destrutivas: `desativar_servico`, `encerrar_processo`, `limpar_*` exigem aprovação do usuário.
- Comandos sugeridos pela IA também exigem confirmação.

### 5. **Headers de Segurança**
- Sempre incluir:
  ```
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Cache-Control: no-store
  CSP frame-ancestors: 'none'
  ```
- Nunca restaure `CORS: *`.
- Nunca re-abra UI via `file://`.

### 6. **Validação de Origem**
- MCP: `X-Mestre-Client: mcp` (nenhuma validação origem necessária)
- UI: `X-Mestre-Client: v10-web` (origem deve bater `MESTRE_BASE_URL`)
- Extensão: `X-Mestre-Client: browser-extension` + `MESTRE_EXTENSION_TOKEN`

---

## 🎯 Ferramentas MCP Principais (~68)

### Diagnóstico
- `diagnostico_completo` — Full system audit
- `verificar_espaco_disco` — Disk space
- `verificar_saude_disco` — SMART health
- `temperatura_cpu` — CPU temp (WMI)
- `monitorar_uso_ram` — RAM usage
- `diagnostico_rede` — Network diagnostics

### Manutenção
- `reparar_arquivos_sfc` — System File Checker
- `reparar_imagem_dism` — DISM repair
- `limpeza_rapida_completa` — Full cleanup
- `driver_atualizar` — Update drivers
- `atualizar_windows` — Windows updates

### IA & Análise
- `perguntar_ia` — Simple chat (Ollama)
- `perguntar_ia_com_contexto` — RAG com logs/código
- `resolver_problema_passo_a_passo` — CoT reasoning
- `comparar_modelos_ia` — Multi-model comparison
- `analisar_codigo_powershell` — Code analysis + security
- `ia_comando_sugerir` — IA sugere comando PowerShell
- `transcrever_audio` — Whisper (Ollama) para texto

### Auditoria
- `consultar_logs_auditoria` — Query audit logs
- `exportar_relatorio_auditoria` — Export audit report
- (7 níveis: INFO, WARNING, ERROR, SECURITY, COMMAND_EXEC, IA_OPERATION, WEBHOOK)

### Webhooks
- `enviar_webhook_discord` — Discord notifications
- `enviar_webhook_slack` — Slack notifications
- `integracao_teams_enviar_notificacao` — Teams

### Git
- `git_status` — Status
- `git_pull` — Pull changes
- `gerar_snapshot_git` — Snapshot

### Gerenciamento de Pacotes
- `instalar_pacote_npm_global` — npm install -g
- `desinstalar_pacote_npm_global` — npm uninstall -g
- `instalar_pacote_pip` — pip install
- `desinstalar_pacote_pip` — pip uninstall
- `auditar_seguranca_npm` — npm audit
- `verificar_dependencias_desatualizadas_npm` — npm outdated

### Fontes Gov (Phase 1+)
- `consultar_fonte_oficial_gov` — Extrai tabelas de URLs gov.br
- `extrair_evidencia_de_pdf_local` — Busca termos em PDFs validados
- `congelar_tabela_final` — Define CSV como somente-leitura
- `simular_cenario_economico` — Injeta premissas no modelo matemático

Veja `mcp-server/index.js` para lista completa.

---

## 🚀 Desenvolvimento & Comandos

### Instalação Inicial
```powershell
cd mcp-server
npm ci              # Install locked dependencies
npm test            # Run all test suites
node --check index.js  # Syntax check
node --check ..\v10\launcher.js
```

### Testes (Split por Concern)
```powershell
cd mcp-server

# Todos os testes
npm test

# Testes específicos
node --test test/security.test.js                    # Sanitização, injection
node --test test/launcher-security.test.js          # Launcher validation
node --test test/browser-extension.test.js          # Extension auth
node --test test/ollama-config.test.js              # Ollama modes
node --test test/prompt-guard.test.js               # Prompt injection
node --test test/project-smoke.test.js              # Smoke tests

# Single test por name pattern
node --test --test-name-pattern "sanitize"
```

### Validação do Projeto Inteiro
```powershell
# Valida: PowerShell parse + JS syntax + MCP tests + Launcher checks
.\validate_all.ps1

# Ou manual:
.\validate_all.ps1 -Check PowerShell
.\validate_all.ps1 -Check JavaScript
.\validate_all.ps1 -Check MCP
```

### Validar PowerShell Scripts
```powershell
$code = Get-Content .\MestreDoPC-Launcher.ps1 -Raw
[System.Management.Automation.Language.Parser]::ParseFile(
  "MestreDoPC-Launcher.ps1",
  [ref]$null,
  [ref]$null
)
```

### Verificar Status MCP
```powershell
.\mcp-server\check-mcp-status.ps1
# ou:
http://127.0.0.1:7777/status  (em navegador)
```

---

## 📝 Adicionando uma Operação

1. **Registre em `v10/allowed-operations.json`:**
   ```json
   {
     "id": "limpar_temp_files",
     "title": "Limpar Temp Files",
     "category": "Cleanup",
     "destructive": true,
     "command": "Remove-Item -Path $env:TEMP\\* -Recurse -Force -EA SilentlyContinue"
   }
   ```

2. **Para operações paramétricos:**
   ```json
   {
     "id": "encerrar_processo_por_nome",
     "command": "Stop-Process -Name {{PROCESS_NAME}} -Force",
     "params": {
       "PROCESS_NAME": {
         "pattern": "^[a-zA-Z0-9_-]{1,255}\\.exe$",
         "description": "Executable name (e.g., notepad.exe)"
       }
     }
   }
   ```

3. **Adicione entry em `mcp-server/index.js`:**
   ```javascript
   {
     name: "limpar_temp_files",
     description: "Remove temporary files from %TEMP%",
     inputSchema: {
       type: "object",
       properties: {}
     }
   }
   ```

4. **Adicione/atualize testes em `mcp-server/test/`:**
   ```javascript
   test("limpar_temp_files should be in whitelist", async (t) => {
     const op = allowedOperations.find(o => o.id === "limpar_temp_files");
     assert(op, "Operation not found in whitelist");
     assert(op.destructive === true, "Should be marked destructive");
   });
   ```

5. **Validate:**
   ```powershell
   npm test
   node --check v10\launcher.js
   ```

---

## 🔄 Fluxo de Features & Branches

### Branches Principais
- `main` — Produção; merge apenas após code review
- `feat/chat-redesign-aplicado` — Sistema de Gestão de Memórias (v11+)
  - Commits: `7119262`, `bf4ce40`
  - Features: API REST memória, interface web, 6 tipos, tags, busca
- `feat/phase-0-provider-abstraction` — Multi-LLM Foundation
  - BaseProvider interface, OllamaProvider migration, ProviderFactory
  - Próximas: Phase 1 (Claude), Phase 2 (OpenAI/Gemini), Phase 3 (RAG), Phase 4 (Enterprise)

### Workflow Feature
1. Cria branch: `git checkout -b feat/meu-recurso`
2. Implementa com commits convencionais: `feat:`, `fix:`, `docs:`, `chore:`
3. Testa localmente: `npm test && .\validate_all.ps1`
4. Push: `git push -u origin feat/meu-recurso`
5. Abre PR no GitHub
6. Espera aprovação de code review
7. Merge para `main`

---

## 📊 Auditoria & Logging

### Sistema de Auditoria
- **Arquivo:** `mcp-server/audit-logger.js`
- **Níveis:** INFO, WARNING, ERROR, SECURITY, COMMAND_EXEC, IA_OPERATION, WEBHOOK
- **Rotação:** 10MB máximo, 30 arquivos (configurable)
- **Sanitização:** Tokens/senhas automaticamente mascaradas
- **Localização:** `$MESTRE_AUDIT_LOG_DIR` (padrão: `logs/audit/`)

### Tools Auditoria
- `consultar_logs_auditoria` — Query por data/nível/tipo
- `exportar_relatorio_auditoria` — Export estruturado (JSON/CSV)

### Exemplo Log Entry
```
[2026-08-23T10:30:45.123Z] [COMMAND_EXEC] [mcp] → diagnostico_completo
[2026-08-23T10:30:55.456Z] [SECURITY] Prompt injection detected: "ignore previous"
[2026-08-23T10:31:00.789Z] [IA_OPERATION] perguntar_ia: tokens=1205, time=2345ms
```

---

## 🤝 Convenções & Best Practices

### Commits Convencionais
```
feat:     Novo recurso
fix:      Correção de bug
docs:     Documentação
chore:    Build, deps, infra (nenhuma mudança código produção)
test:     Testes (nenhuma mudança código produção)
refactor: Reorganização código (CUIDADO: pode quebrar!)
```

### npm Overrides (Pinned Dependencies)
- `package.json` contém bloco `overrides` com versões patched.
- `npm audit fix` NÃO atualiza overridden packages.
- Para atualizar: edite manualmente `overrides`, rode `npm install`, teste com `npm test`.

### UI (v10/index.html)
- Single-page app (SPA) vanilla JS.
- Comunica com launcher via `fetch` com header `X-Mestre-Client: v10-web`.
- Base URL vem de `MESTRE_BASE_URL`.
- Nunca faça requisições cross-origin; sempre localhost.

### PowerShell Scripts
- Use `-ErrorAction SilentlyContinue` (ou `-EA 0`) para cleanup não-críticos.
- Suporte máximo 3 jobs simultâneos no launcher.
- Timeout máximo: 15 minutos.
- Valide sempre com `Parser.ParseFile()`.

### Segurança na Prática
- ✅ Sempre sanitize com `sanitizeToolArgument()`
- ✅ Sempre valide regex se paramétrico
- ✅ Sempre registre em `allowed-operations.json`
- ✅ Sempre marque `destructive: true` se deleta/desativa
- ✅ Sempre teste com `npm test`
- ❌ Nunca passe input direto a PowerShell
- ❌ Nunca adicione comandos AI-generated
- ❌ Nunca restaure `CORS: *` ou `file://`

---

## 📌 Phase 0-4 Multi-LLM Roadmap (2026)

**Objetivo:** Suportar Claude, OpenAI, Gemini, Ollama com abstração simples + fallback automático.

### Phase 0 (2-3 sem) — ✅ CONCLUÍDA
- `providers/base-provider.js` — Interface uniforme
- `providers/ollama-provider.js` — Migração código existente
- `providers/provider-factory.js` — Factory pattern
- Testes: 100% compatibilidade Ollama
- Branch: `feat/phase-0-provider-abstraction` (merged)
- **Integração UI MCP:** Aba "🔌 Integração MCP" em `v10/index.html` com grid de servidores, accordion de ferramentas, histórico e modais

### Phase 1 (2-3 sem) — ⏳ Próximo
- `providers/claude-provider.js` — Claude API support
- Tool use (function calling)
- Fallback: Claude → Ollama
- MVP: Claude + Ollama + fallback automático

### Phase 2 (2-3 sem)
- `providers/openai-provider.js` — OpenAI + Azure
- `providers/gemini-provider.js` — Google Gemini
- Batch processing (50% economia)
- Streaming

### Phase 3 (4 sem)
- RAG (Azure Search ou local)
- WebSocket streaming UI
- Vision (screenshots/logs)
- Multi-model comparison

### Phase 4 (4-5 sem)
- OpenAI Agents SDK (Python service)
- Microsoft Entra ID (SSO + RBAC)
- Teams integration
- Graph change notifications

Docs: `docs/MESTRE-ROADMAP-MULTI-LLM.md`, `MESTRE-IMPLEMENTATION-CHECKLIST.md`

---

## 🔗 Referências Importantes

### Documentação Oficial
- [MCP Spec](https://modelcontextprotocol.io)
- [Claude API](https://claude.ai/api)
- [OpenAI Docs](https://platform.openai.com/docs)
- [Gemini](https://ai.google.dev)
- [Ollama](https://ollama.ai)

### Arquivos Críticos
- `v10/allowed-operations.json` — Whitelist (~301 comandos)
- `mcp-server/security.js` — Sanitização + injection detection
- `mcp-server/audit-logger.js` — Auditoria e logs
- `.github/workflows/ci.yml` — CI/CD (Node 20 + 22, Windows)
- `SECURITY-REVIEW.md` — Análise de segurança completa

### Problemas Comuns
- **"X-Mestre-Client header missing"** → Verifique se requisição tem header correto (mcp/v10-web/browser-extension)
- **"Command not in whitelist"** → Registre em `allowed-operations.json` com `id`, `command`, `destructive`
- **Ollama não responde** → `http://127.0.0.1:11434/api/tags` deve retornar 200
- **Prompt injection bloqueado** → Check `checkPromptInjection()` patterns em `security.js`
- **Testes falhando** → Rode `npm ci` (não `npm install`), valide com `npm test`

---

## 📋 Checklist Antes de Mergear PR

- [ ] `npm test` passa (mcp-server)
- [ ] `node --check` valida JS files (index.js, security.js, launcher.js)
- [ ] `.\validate_all.ps1` passa (PowerShell + JS + MCP)
- [ ] Commits são convencionais (feat:, fix:, docs:, chore:)
- [ ] Operações novas estão em `allowed-operations.json`
- [ ] Testes novos adicionados em `mcp-server/test/`
- [ ] Nenhuma credencial hardcoded (use env vars)
- [ ] Segurança: sanitização, validação, confirmação se destrutivo
- [ ] PR tem descrição clara (what/why/how)
- [ ] Code review aprovado

# 📊 Análise Completa da Arquitetura - Mestre do PC V10/V11

> **Data da análise:** 17 de Agosto de 2026  
> **Autor:** Agente de Código  
> **Versão analisada:** V10/V11 (código-fonte em `Mestre-do-PC-V10-clean/`)

---

## 🏗️ Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MESTRE DO PC V10/V11                            │
│  Aplicativo Windows de Diagnóstico, Manutenção e Automação de Desktop   │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐         ┌──────────────────────────┐         ┌─────────────────────────┐
│  Browser / UI   │────────▶│  LAUNCHER (Porta 7777)   │────────▶│  PowerShell Jobs        │
│  v10/index.html │  HTTP   │  - PowerShell (elevado)  │  Jobs   │  (Whitelist-only)       │
│                 │         │  - OU Node.js (dev)      │         │  ~113 operações         │
└─────────────────┘         └──────────────────────────┘         └─────────────────────────┘
         ▲                            ▲
         │                            │
         │                            │
┌─────────────────┐         ┌──────────────────────────┐
│  Browser Ext    │         │  MCP SERVER (stdio)      │
│  (Chrome/Edge)  │         │  - 36 ferramentas        │
│  Content/Popup  │         │  - IA com Ollama         │
└─────────────────┘         │  - Auditoria completa    │
                            │  - Webhooks (Discord,    │
┌─────────────────┐         │    Teams, Slack)         │
│  Notepad++      │         │  - RAG, Chain-of-Thought │
│  Plugin Python  │         └──────────────────────────┘
└─────────────────┘                    │
                            ┌──────────▼──────────┐
                            │   OLLAMA (IA Local)  │
                            │   127.0.0.1:11434    │
                            └─────────────────────┘
```

---

## 📁 Estrutura de Pastas e Arquivos Principais

| Pasta/Arquivo | Função | Tamanho/Complexidade |
|---------------|--------|---------------------|
| **`MestreDoPC-Launcher.ps1`** | Launcher PowerShell em produção (auto-eleva como Admin) | 42KB, ~600 linhas |
| **`v10/launcher.js`** | Launcher Node.js (dev/fallback) | 38KB, ~600 linhas |
| **`v10/index.html`** | Interface web completa (SPA) | 175KB, UI rica |
| **`v10/allowed-operations.json`** | **Catálogo de operações permitidas** (~113 operações) | 155KB |
| **`mcp-server/index.js`** | Servidor MCP por stdio (36 ferramentas) | 92KB, ~1800 linhas |
| **`mcp-server/security.js`** | Sanitização + detecção de prompt injection | 2.8KB |
| **`mcp-server/audit-logger.js`** | Logging estruturado (7 níveis) | 7.7KB |
| **`mcp-server/model-profiles.json`** | 5 perfis de IA (fast, balanced, agent, coding, reasoning) | 2.4KB |
| **`browser-extension/`** | Extensão Chrome/Edge Manifest V3 | ~10 arquivos |
| **`v10/notepad-plus-plus/`** | Integração NPP via plugin PythonScript | - |
| **`logs/audit/`** | Logs de auditoria (rotação 30 dias, 10MB) | - |

---

## 🔐 Modelo de Segurança

### 1. **Whitelist de Comandos**

- **Única fonte da verdade:** `v10/allowed-operations.json`
- O launcher **recusa tudo** que não estiver no catálogo
- Templates parametrizados usam regex para validar inputs
- Exemplo de template:

```json
{
  "id": "matar_processo_por_nome",
  "pattern": "Get-Process -Name {{NOME}} | Stop-Process -Force",
  "params": {
    "nome": "^[a-zA-Z0-9_.-]{1,64}$"
  }
}
```

### 2. **Separação de Privilégios**

```
MCP Server (NÃO elevado) ──HTTP──▶ Launcher (ELEVADO/Admin) ──▶ PowerShell
```

- MCP roda como usuário normal
- Launcher eleva-se automaticamente (`net session` check)
- Comunicação via `POST /run` + `GET /run-status`

### 3. **Autorização por Cliente**

| Cliente | Header Requerido | Origem |
|---------|------------------|--------|
| `v10-web` | `X-Mestre-Client: v10-web` | `http://127.0.0.1:7777` |
| `mcp` | `X-Mestre-Client: mcp` | Sem origem |
| `browser-extension` | `X-Mestre-Client: browser-extension` + `X-Mestre-Extension-Token` | Allowlist |
| `notepad-plus-plus` | `X-Mestre-Client: notepad-plus-plus` + `X-Mestre-Npp-Token` | `127.0.0.1` |

### 4. **Prompt Injection Detection**

- Heurística com 10+ padrões (score 0.0-1.0)
- Classificações: `benigno`, `suspeito` (0.35+), `malicioso` (0.7+)
- Bloqueia entradas `malicioso` antes de enviar ao Ollama
- Logs de segurança em `AUDIT-SECURITY`

**Padrões detectados:**
- `ignore previous instructions`
- `forget everything`
- `you are now` (persona override)
- `bypass rules/security`
- `developer mode / admin mode / DAN mode`
- Delimitadores de sistema (`<<<sys>>>`, `[system]`)
- `jailbreak`, `prompt injection`
- `sudo/root access`

---

## 🤖 IA e MCP Server

### **36 Ferramentas MCP Principais**

| Categoria | Ferramentas |
|-----------|-------------|
| **Diagnóstico** | `diagnostico_completo`, `verificar_espaco_disco`, `verificar_temperatura_cpu`, `listar_processos`, `diagnosticar_rede` |
| **Limpeza** | `limpar_memoria_ram`, `limpar_temp`, `limpar_cache_dns`, `otimizar_ssd` |
| **Windows Update** | `listar_atualizacoes`, `instalar_atualizacoes`, `resolver_windows_update` |
| **Serviços** | `listar_servicos`, `iniciar_servico`, `parar_servico`, `configurar_servico` |
| **IA** | `perguntar_ia`, `perguntar_ia_com_contexto` (RAG), `resolver_problema_passo_a_passo`, `comparar_modelos_ia`, `analisar_codigo_powershell` |
| **Webhooks** | `enviar_webhook_discord`, `enviar_webhook_teams`, `enviar_webhook_slack`, `monitorar_e_notificar` |
| **Auditoria** | `consultar_logs_auditoria`, `exportar_relatorio_auditoria` |
| **Web Search** | `pesquisar_web` (DuckDuckGo) |

### **Perfis de Modelo (model-profiles.json)**

| Perfil | Modelo | Contexto | Uso | RAM Mínima | GPU |
|--------|--------|----------|-----|------------|-----|
| `fast` | `qwen2.5-coder:1.5b` | 4K | Consultas rápidas | 4GB | Não |
| `balanced` | `qwen2.5-coder:3b-instruct` | 8K | **Padrão** | 8GB | Não |
| `agent` | `fazendaavila2026/agente:latest` | 8K | Automação | 8GB | Sim |
| `coding` | `qwen2.5-coder:7b` | 16K | Scripts PowerShell | 12GB | Sim |
| `reasoning` | `deepseek-r1:7b` | 16K | Diagnósticos complexos | 16GB | Sim |

**Fallback:** Se o modelo principal falhar, usa `qwen2.5-coder:7b` (agent) ou `phi4:14b` (reasoning).

---

## 📝 Sistema de Auditoria (V11)

### **7 Níveis de Log**

```javascript
INFO          // Informações gerais
WARNING       // Avisos
ERROR         // Erros
SECURITY      // Eventos de segurança (prompt injection, etc.)
COMMAND_EXEC  // Execução de comandos PowerShell
IA_OPERATION  // Operações de IA
WEBHOOK       // Envio de webhooks
```

### **Recursos**

- Rotação automática (10MB, 30 dias)
- Redaction de dados sensíveis (tokens, senhas)
- Consultas filtradas por nível, ação, data
- Exportação em Markdown
- Logs diários: `audit-YYYY-MM-DD.log`

### **Exemplo de Entrada de Log**

```json
{
  "timestamp": "2026-08-17T14:30:00.000Z",
  "level": "COMMAND_EXEC",
  "action": "execute_launcher_command",
  "userId": "system",
  "computerName": "DESKTOP-JEAN",
  "pid": 12345,
  "details": {
    "commandId": "limpar_temp_usuario",
    "payload": { "id": "[REDACTED]" },
    "options": { "timeoutMs": 900000 }
  }
}
```

---

## 🔌 Integrações

### **1. Webhooks (V11)**

```javascript
// Discord
enviar_webhook_discord(webhook_url, titulo, mensagem, cor)
// cor: hexadecimal (ex: "ff0000" = vermelho)

// Microsoft Teams
enviar_webhook_teams(webhook_url, titulo, mensagem, tema)
// tema: Information, Warning, Danger, Success

// Slack
enviar_webhook_slack(webhook_url, mensagem, canal, emoji)

// Monitoramento automático
monitorar_e_notificar(webhook_url, cpu_limite: 80, ram_limite: 80, disco_limite: 90, plataforma: "discord")
```

**Exemplo de Alerta:**
```
🚨 Alerta de Sistema
PC: DESKTOP-JEAN

⚠️ CPU: 92% (limite: 80%)
⚠️ RAM: 87% usada (limite: 80%)

Data: 17/08/2026 14:30:00
```

### **2. Notepad++**

- Plugin `MestreDoPC.py` (PythonScript)
- Ação: `explain_code` via Ollama
- Token: `MESTRE_NPP_TOKEN`
- Guia de setup em `docs/notepad-plus-plus-integration.md`

### **3. Extensão Browser**

- Manifest V3
- Background script + Content script + Popup
- Token: `MESTRE_EXTENSION_TOKEN`
- Origens allowlist: `MESTRE_EXTENSION_ORIGINS` (CSV)

---

## 🧪 Testes

**12 arquivos de teste em `mcp-server/test/`:**

| Arquivo | Função |
|---------|--------|
| `security.test.js` | Sanitização de argumentos |
| `launcher-security.test.js` | Whitelist enforcement |
| `notepad-plus-plus.test.js` | Integração NPP |
| `v11-security.test.js` | Auditoria + redaction |
| `browser-extension.test.js` | Permissões da extensão |
| `ollama-config.test.js` | Configuração de modelos |
| `v11-1-novos-tools.test.js` | Novas ferramentas V11 |
| `chat-permissions.test.js` | Permissões de chat |
| `whitelist-enforcement.test.js` | Validação de whitelist |
| `prompt-guard.test.js` | Guard de prompt injection |
| `project-smoke.test.js` | Smoke tests do projeto |
| `ollama-smoke-script.test.js` | Smoke tests do Ollama |

**Executar:**
```powershell
cd mcp-server
npm test
```

---

## 🚀 Fluxo de Execução Típico

```
1. Usuário clica "Limpar TEMP" na UI (v10/index.html)
   ↓
2. UI envia POST para http://127.0.0.1:7777/run
   { "id": "limpar_temp_usuario" }
   ↓
3. Launcher valida:
   - Origem = http://127.0.0.1:7777
   - X-Mestre-Client = v10-web
   - Operação existe em allowed-operations.json
   ↓
4. Cria job PowerShell:
   Remove-Item -Path "$env:TEMP\*" -Recurse -Force -ErrorAction SilentlyContinue
   ↓
5. Polling em /run-status?id=UUID
   ↓
6. Job completa → UI mostra output
   ↓
7. Auditoria loga em logs/audit/audit-YYYY-MM-DD.log
```

---

## 📦 Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `MESTRE_PROJETO_PATH` | - | Caminho raiz do projeto |
| `MESTRE_BASE_URL` | `http://127.0.0.1:7777` | URL do launcher |
| `MESTRE_AUDIT_LOG_DIR` | `logs/audit` | Diretório de auditoria |
| `MESTRE_EXTENSION_TOKEN` | - | Token da extensão |
| `MESTRE_EXTENSION_ORIGINS` | - | Origens da extensão (CSV) |
| `MESTRE_NPP_TOKEN` | - | Token do Notepad++ |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | URL do Ollama |
| `OLLAMA_API_KEY` | - | Cloud mode (muda para `https://ollama.com/api`) |
| `OLLAMA_MODEL` | `qwen2.5-coder:3b-instruct` | Modelo padrão |
| `OLLAMA_MODEL_PROFILE` | `balanced` | Perfil ativo |
| `OLLAMA_NUM_CTX` | `8192` | Contexto máximo |
| `OLLAMA_TEMPERATURE` | `0.7` | Criatividade |
| `OLLAMA_TOP_P` | `0.9` | Top-P sampling |
| `OLLAMA_TOP_K` | `40` | Top-K sampling |
| `OLLAMA_NUM_PREDICT` | `1024` | Tokens máximos de resposta |
| `OLLAMA_SEED` | - | Seed para reprodutibilidade |
| `OLLAMA_KEEP_ALIVE` | - | Tempo de keep-alive do modelo |

---

## 📈 Métricas do Projeto (V11)

| Categoria | V10 | V11 | Crescimento |
|-----------|-----|-----|-------------|
| Operações PowerShell | ~80 | **~113** | **+41%** |
| Ferramentas MCP | ~25 | **~36** | **+44%** |
| Integrações | 0 | **3** | Discord, Teams, Slack |
| Níveis de Log | 0 | **7** | Sistema completo |
| Testes | ~5 | **~12** | **+140%** |

---

## 🎯 Principais Inovações da V11

1. **RAG (Retrieval-Augmented Generation)** — IA com contexto adicional
   - `perguntar_ia_com_contexto(pergunta, contexto)`
   - Ideal para análise de logs, código, documentos

2. **Chain-of-Thought** — Resolução passo a passo de problemas
   - `resolver_problema_passo_a_passo(problema)`
   - Divide problemas complexos em etapas lógicas

3. **Comparação de Modelos** — Valida consistência entre múltiplos LLMs
   - `comparar_modelos_ia(pergunta, modelos: "qwen,llama,mistral")`
   - Útil para validar diagnósticos críticos

4. **Análise de Código PowerShell**
   - `analisar_codigo_powershell(codigo)`
   - Explicação, sugestões de melhoria, notas de segurança

5. **Sugestão de Comandos**
   - `ia_comando_sugerir(tarefa)`
   - Descreva uma tarefa → IA sugere o comando exato

6. **Webhooks** — Alertas automáticos para Discord/Teams/Slack
   - Monitoramento de CPU, RAM, disco
   - Notificações proativas

7. **Auditoria Completa** — Todos os comandos e operações de IA logados
   - 7 níveis de log
   - Redaction automático
   - Consultas filtradas

8. **Monitoramento em Tempo Real** — CPU, RAM, disco com limites configuráveis
   - `monitorar_e_notificar(webhook_url, cpu_limite, ram_limite, disco_limite)`

---

## 🔧 Comandos de Build, Execução e Validação

### **Instalação e Validação**

```powershell
# Backend MCP
cd C:\Users\Jeanc\Mestre-do-PC-V10-clean\mcp-server
npm ci
npm test
node --check index.js

# Launcher Node.js (modo autônomo/dev)
cd ..\v10
npm install
npm start

# Validação de sintaxe PowerShell
[System.Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path "..\MestreDoPC-Launcher.ps1"),
    [ref]$null,
    [ref]$null
)
```

### **Execução Local**

1. Certifique-se de que o Ollama está rodando (`ollama serve`) ou configure `OLLAMA_API_KEY` para cloud.
2. Inicie o launcher preferido:
   - **Produção/elevação:** `MestreDoPC-Launcher.ps1` (auto-eleva se necessário).
   - **Dev:** `cd v10 && npm start`.
3. Abra `http://127.0.0.1:7777/` no navegador.
4. Para o MCP: configure o cliente MCP para executar `node mcp-server/index.js` via stdio.

---

## 📚 Documentação Interna

| Arquivo | Descrição |
|---------|-----------|
| `GUIA-RAPIDO-V11.md` | Exemplos práticos de uso |
| `README-V11.md` | Resumo executivo da V11 |
| `CHANGELOG-V11.md` | Mudanças detalhadas |
| `SECURITY.md` | Políticas de segurança |
| `CHECKLIST-IMPLANTACAO-V11.md` | Checklist de implantação |
| `REVISAO-COMANDOS-V11.md` | Revisão de comandos |
| `RESUMO-EXECUTIVO-V11.md` | Resumo executivo |
| `docs/deployment.md` | Guia de deployment |
| `docs/notepad-plus-plus-integration.md` | Integração Notepad++ |
| `docs/RAG.md` | Implementação RAG |
| `docs/REDE-DIAGNOSTICO.md` | Diagnóstico de rede |
| `docs/OUTPUT-PANEL.md` | Painel de output |

---

## 🛡️ Regras de Segurança (Hard Rules)

1. **Preserve a separação entre MCP não elevado e launcher elevado.**
2. **Nunca adicione entrada do usuário diretamente para PowerShell.**
3. **Comandos destrutivos e comandos sugeridos pela IA exigem confirmação.**
4. **Use `MESTRE_PROJETO_PATH`; não grave caminhos pessoais no HTML/JS/PS.**
5. **Adicione ou atualize testes em `mcp-server/test/`.**
6. **Use commits convencionais (`fix:`, `feat:`, `docs:`, `chore:`).**
7. **Não reative `file://`, não restaure CORS `*`, não remova validação de origem em `POST`.**
8. **Não altere `legado/` para corrigir a V10.**

---

## 🔮 Futuro (V12) - Roadmap Planejado

- [ ] Suporte a Azure Functions
- [ ] Integração AWS Lambda
- [ ] Dashboard web em tempo real
- [ ] Gráficos de histórico
- [ ] Alertas por e-mail (SMTP)
- [ ] Criptografia de logs sensíveis

---

## 📞 Suporte

- **Documentação:** `docs/`
- **Changelog:** `CHANGELOG-V11.md`
- **Security:** `SECURITY.md`
- **Contribuição:** `CONTRIBUTING.md`

---

**Mestre do PC V11** - Desenvolvido por JEAN  
*Versão: 11.0.0 | Data: Agosto 2026*

---

## 📋 Índice Remissivo

- [Arquitetura Geral](#-visão-geral-da-arquitetura)
- [Estrutura de Pastas](#-estrutura-de-pastas-e-arquivos-principais)
- [Segurança](#-modelo-de-segurança)
- [IA e MCP](#-ia-e-mcp-server)
- [Auditoria](#-sistema-de-auditoria-v11)
- [Integrações](#-integrações)
- [Testes](#-testes)
- [Fluxo de Execução](#-fluxo-de-execução-típico)
- [Variáveis de Ambiente](#-variáveis-de-ambiente)
- [Métricas](#-métricas-do-projeto-v11)
- [Inovações V11](#-principais-inovações-da-v11)
- [Comandos](#-comandos-de-build-execução-e-validação)
- [Documentação](#-documentação-interna)
- [Regras de Segurança](#-regras-de-segurança-hard-rules)

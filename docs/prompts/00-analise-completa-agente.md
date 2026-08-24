# Prompt: Análise Completa do Mestre do PC V10/V11

**Objetivo:** Realizar uma análise completa e estruturada do projeto Mestre do PC antes de iniciar qualquer implementação, refatoração ou correção.

**Contexto:** Você é um agente especializado em análise de arquitetura de software. Sua tarefa é entender profundamente o estado atual do projeto, identificar dependências, mapear componentes e produzir um plano claro de trabalho.

---

## Instruções para o Agente

### 1. 📋 LEITURA DO CONTEXTO DO PROJETO

Primeiro, consulte as fontes de verdade do projeto na seguinte ordem:

1. **`AGENTS.md`** na raiz do repositório (`C:\Users\Jeanc\AGENTS.md`)
   - Leia as seções: "O que é este repositório", "Projetos ativos", "Mestre do PC V10/V11"
   - Anote: stack, arquitetura, componentes principais, regras de segurança

2. **`projects-index/INDEX.md`**
   - Verifique se há atualizações de status ou caminhos diferentes

3. **`Mestre-do-PC-V10-clean/`** (diretório do projeto ativo)
   - Este é o diretório canônico da versão V10/V11

---

### 2. 🔍 ANÁLISE DE ARQUITETURA

Leia e documente os seguintes arquivos-chave:

#### Camada 1: Frontend
- `Mestre-do-PC-V10-clean/v10/index.html` → Interface web (SPA)
- `Mestre-do-PC-V10-clean/v10/rede-dashboard.js` → Painel de rede

#### Camada 2: Launcher (dois modos)
- `Mestre-do-PC-V10-clean/v10/launcher.js` → Launcher Node.js (dev/fallback)
- `Mestre-do-PC-V10-clean/MestreDoPC-Launcher.ps1` → Launcher PowerShell (produção/elevado)

#### Camada 3: MCP Server
- `Mestre-do-PC-V10-clean/mcp-server/index.js` → Servidor MCP (~68 ferramentas)
- `Mestre-do-PC-V10-clean/mcp-server/security.js` → Sanitização e prompt injection
- `Mestre-do-PC-V10-clean/mcp-server/audit-logger.js` → Logs de auditoria
- `Mestre-do-PC-V10-clean/mcp-server/model-profiles.json` → Perfis de IA

#### Catálogo de Operações
- `Mestre-do-PC-V10-clean/v10/allowed-operations.json` → **Whitelist de comandos**

#### Integrações
- `Mestre-do-PC-V10-clean/browser-extension/` → Extensão Chrome/Edge
- `Mestre-do-PC-V10-clean/v10/notepad-plus-plus/` → Integração Notepad++

#### Documentação Existente
- `Mestre-do-PC-V10-clean/docs/` → Documentação complementar

---

### 3. 📊 STATUS ATUAL DO PROJETO

Para cada componente abaixo, determine e documente:

#### 3.1 Estado do Código

**Frontend (v10/index.html):**
- Total de linhas
- Funcionalidades implementadas
- Funcionalidades marcadas como TODO/FIXME/BUG no código
- Temas suportados (claro/escuro)
- Integrações ativas (Ollama, launcher, extensão)

**Launcher Node.js (v10/launcher.js):**
- Whitelist implementada
- Endpoints HTTP: `/status`, `/run`, `/run-status`, `/shutdown`, `/npp`
- Proxy Ollama configurado
- Jobs PowerShell (máximo 3 simultâneos)
- Validação de origem/CORS

**Launcher PowerShell (MestreDoPC-Launcher.ps1):**
- Auto-elevação (Administrator)
- Mesma whitelist do Node.js
- Escuta em `127.0.0.1:7777`

**MCP Server (mcp-server/index.js):**
- Número de ferramentas registradas
- Categorias de ferramentas
- Integração com Ollama (local/cloud)
- Integração com launcher (POST /run)

**Segurança (mcp-server/security.js):**
- Função `sanitizeToolArgument`
- Função `checkPromptInjection`
- Heurísticas de detecção

**Testes (mcp-server/test/):**
- `security.test.js` → testes de sanitização
- `notepad-plus-plus.test.js` → testes de integração /npp
- Cobertura atual

#### 3.2 Dependências Externas

| Dependência | Tipo | Status | Versão/URL |
|-------------|------|--------|------------|
| Node.js | Runtime | [ ] Instalado | `node --version` |
| npm | Pacote | [ ] Instalado | `npm --version` |
| PowerShell 5.1 | Shell | [ ] Disponível | `$PSVersionTable` |
| PowerShell 7 | Shell | [ ] Disponível | `pwsh --version` |
| Ollama | IA local | [ ] Rodando | `http://127.0.0.1:11434` |
| Windows 10/11 | SO | [ ] Compatível | x64 |

#### 3.3 Dependências de Pacote (npm)

- `Mestre-do-PC-V10-clean/v10/package.json` → dependências do launcher
- `Mestre-do-PC-V10-clean/mcp-server/package.json` → dependências do MCP
- `Mestre-do-PC-V10-clean/browser-extension/package.json` → dependências da extensão

Execute (se aplicável):
```powershell
cd Mestre-do-PC-V10-clean\v10
npm ls --depth=0

cd ..\mcp-server
npm ls --depth=0
```

#### 3.4 Variáveis de Ambiente

| Variável | Significado | Valor Atual | Obrigatória? |
|----------|-------------|-------------|--------------|
| `MESTRE_PROJETO_PATH` | Caminho raiz | | Sim |
| `MESTRE_BASE_URL` | URL do launcher | `http://127.0.0.1:7777` | Não |
| `MESTRE_EXTENSION_TOKEN` | Token extensão | | Habilita integração |
| `MESTRE_NPP_TOKEN` | Token Notepad++ | | Habilita integração |
| `OLLAMA_URL` | URL Ollama | `http://127.0.0.1:11434` | Não |
| `OLLAMA_API_KEY` | Modo cloud | | Opcional |
| `OLLAMA_MODEL` | Modelo IA | | Opcional |
| `OLLAMA_MODEL_PROFILE` | Perfil (fast/balanced/etc) | | Opcional |

---

### 4. 🧩 MAPEAMENTO DE DEPENDÊNCIAS INTERNAS

```
┌─────────────────────────────────────────────────────────────┐
│                    USUÁRIO / NAVEGADOR                       │
│              http://127.0.0.1:7777 (v10/index.html)          │
└────────────────────────┬────────────────────────────────────┘
                         │ X-Mestre-Client: v10-web
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      LAUNCHER (7777)                         │
│  [v10/launcher.js] OU [MestreDoPC-Launcher.ps1]             │
│  • Valida contra allowed-operations.json                    │
│  • Gerencia jobs PowerShell (max 3)                         │
│  • Proxy Ollama                                             │
│  • Endpoint /npp (Notepad++)                                │
└────────────┬──────────────────────────────────┬─────────────┘
             │                                  │
             │ POST /run                        │ GET /status
             ▼                                  ▼
┌────────────────────────────┐    ┌────────────────────────────┐
│       MCP SERVER (stdio)   │    │    STATUS DO LAUNCHER      │
│  mcp-server/index.js       │    │  • Jobs ativos             │
│  ~68 ferramentas           │    │  • Whitelist               │
│  X-Mestre-Client: mcp      │    │  • Uptime                  │
└────────────────────────────┘    └────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│                    OLLAMA (11434)                            │
│  Local: http://127.0.0.1:11434                              │
│  Cloud: https://ollama.com/api (se OLLAMA_API_KEY)          │
└─────────────────────────────────────────────────────────────┘
```

---

### 5. 🎯 IDENTIFICAÇÃO DO PLANO DE TRABALHO

Com base na análise acima, produza:

#### 5.1 Estado Atual (AS-IS)

Descreva em 3-5 parágrafos:
- O que está funcionando
- O que está parcialmente implementado
- O que está quebrado/incompleto
- Gaps de documentação
- Dívida técnica identificada

#### 5.2 Estado Desejado (TO-BE)

Com base em:
- Comentários TODO/FIXME no código
- Issues em aberto (se houver)
- Funcionalidades mencionadas na documentação mas não implementadas
- Melhorias de arquitetura sugeridas

Descreva a visão de estado completo.

#### 5.3 Dependências Críticas

**Pré-requisitos absolutos** (nada funciona sem isso):
- Node.js 20+ instalado
- Ollama rodando
- PowerShell com Execution Policy adequada

**Dependências de build/teste**:
- `npm install` em v10/ e mcp-server/
- `npm test` passando

**Dependências de runtime**:
- Launcher rodando (Node ou PS)
- MCP server conectado
- Tokens de integração configurados

**Dependências opcionais** (habilitam features):
- Extensão do navegador
- Notepad++ com plugin PythonScript
- Modo cloud Ollama (API key)

#### 5.4 Plano de Ação Proposto

**Fase 0: Validação de Ambiente (Dia 1)**
- [ ] Verificar Node.js, npm, PowerShell
- [ ] Verificar Ollama (local ou cloud)
- [ ] Clonar/atualizar repositório
- [ ] Instalar dependências npm

**Fase 1: Smoke Test (Dia 1)**
- [ ] Iniciar launcher (Node ou PS)
- [ ] Acessar http://127.0.0.1:7777
- [ ] Executar comando simples via UI
- [ ] Rodar `npm test` no mcp-server

**Fase 2: Análise de Gaps (Dia 2)**
- [ ] Listar funcionalidades faltantes
- [ ] Priorizar com o usuário
- [ ] Criar backlog estruturado

**Fase 3+: Implementação (a definir)**
- [ ] Depende da priorização do usuário

---

### 6. 📝 ENTREGÁVEL FINAL

Produza um relatório em Markdown com a seguinte estrutura:

```markdown
# Relatório de Análise - Mestre do PC V10/V11

## Resumo Executivo
(3-5 frases sobre o estado geral)

## 1. Arquitetura Atual
(Diagrama + descrição dos componentes)

## 2. Status por Componente
| Componente | Status | Observações |
|------------|--------|-------------|
| Frontend   | ✅/⚠️/❌ | ... |
| Launcher   | ✅/⚠️/❌ | ... |
| MCP Server | ✅/⚠️/❌ | ... |
| Testes     | ✅/⚠️/❌ | ... |

## 3. Dependências
### 3.1 Externas
(lista com status de instalação/configuração)

### 3.2 Internas
(grau de acoplamento entre módulos)

## 4. Gaps Identificados
- Funcionalidades incompletas
- Bugs conhecidos
- Dívida técnica

## 5. Plano de Ação Recomendado
### Fase 0: Ambiente
(passos validados)

### Fase 1: Smoke Test
(comandos exatos)

### Fase 2+: Implementação
(priorização sugerida)

## 6. Riscos e Mitigações
| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| ...   | ...     | ...       |

## 7. Próximos Passos Imediatos
1. [ ] Ação 1
2. [ ] Ação 2
3. [ ] Ação 3
```

---

## Critérios de Sucesso

- [ ] Todos os arquivos-chave foram lidos e compreendidos
- [ ] Dependências externas verificadas (instaladas/não instaladas)
- [ ] Dependências internas mapeadas (grafo de acoplamento)
- [ ] Status de cada componente documentado (✅/⚠️/❌)
- [ ] Plano de ação priorizado e factível
- [ ] Riscos identificados com mitigação
- [ ] Usuário pode executar "Fase 0" e "Fase 1" imediatamente após a análise

---

## Notas Importantes

- **Nunca** execute comandos destrutivos sem confirmação explícita
- **Sempre** verifique a sintaxe antes de rodar scripts (node --check, PowerShell Parser)
- **Prefira** ferramentas MCP do Mestre do PC para diagnóstico quando disponível
- **Mantenha** separação entre launcher elevado e MCP não-elevado
- **Respeite** a whitelist de `allowed-operations.json` — não sugira comandos fora dela

---

**Fim do Prompt**

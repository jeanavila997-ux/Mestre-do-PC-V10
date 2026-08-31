# Projeto Agente CLI Python + Ollama + VPS/Hostinger

**Data de criação:** 31/08/2026  
**Status:** Em planejamento — continuação em momento futuro

---

## 📋 Visão Geral

Este documento consolida o contexto e plano de arquitetura para um **Agente de IA autônomo** baseado em Python, utilizando Ollama como motor de inferência, com deploy em VPS via Docker.

---

## 🏗️ Arquitetura Principal

| Componente | Tecnologia | Finalidade |
|------------|------------|------------|
| **Runtime** | Python + CLI | Interface de linha de comando para execução de tarefas |
| **Motor de IA** | Ollama | Inferência local de modelos LLM para decisão/raziocínio |
| **Orquestração** | Docker + Docker Compose | Containerização e deploy consistente |
| **Infraestrutura** | VPS/Hostinger | Hospedagem remota para acesso 24/7 |
| **Memória** | RAG (Retrieval-Augmented Generation) | Persistência e recuperação de contexto |
| **Tool Calling** | Funções/tools | Capacidade de executar ações externas |
| **Arquitetura** | Planner/Executor | Separação entre planejamento e execução |
| **Segurança** | Permissões/whitelist | Controle de acesso e operações seguras |
| **Multimodal** | Voz + texto | Interfaces naturais de interação |
| **Evolução** | Multi-Agent | Futura expansão para múltiplos agentes especializados |

---

## 📄 Documentos de Referência

### PDF Consolidado
- **Arquivo:** `sugestoes/plano_agente_cli_python_ollama_hostinger.pdf`
- **Conteúdo:** Plano completo do projeto com arquitetura, roadmap e critérios de sucesso

### Materiais Base Utilizados
- Material sobre Ollama e integração com MCP
- Arquitetura do Agente CLI existente no projeto Mestre do PC
- Documentação de comandos Copilot CLI (`docs/copilot-cli-commands/commands.md`)

---

## 🔗 Relação com o Mestre do PC V10

Este projeto é uma **evolução/extensão** do Mestre do PC V10, que já possui:

### Infraestrutura Existente (V10)
- ✅ MCP Server para integração com IAs (Claude, Copilot)
- ✅ Ollama integrado (local `127.0.0.1:11434` ou cloud via `OLLAMA_API_KEY`)
- ✅ Whitelist de operações (`v10/allowed-operations.json`)
- ✅ Sistema de memória com IndexedDB + JSON (`v10/data/memories/`)
- ✅ Chat com streaming e contexto (`v10/chat/chat-module.js`)
- ✅ Arquitetura launcher (`v10/launcher.js`) + MCP (`mcp-server/index.js`)

### Diferenciais do Agente CLI Python
| Mestre do PC V10 | Agente CLI Python |
|------------------|-------------------|
| Node.js + Windows | Python + Cross-platform |
| Local (Windows) | VPS/Cloud 24/7 |
| Reativo (comandos) | Autônomo (Planner/Executor) |
| Memória de curto prazo | RAG + memória de longo prazo |
| Single-agent | Multi-agent (futuro) |

---

## 🎯 Componentes Principais

### 1. Agent Runtime
- Loop principal de execução
- Gerenciamento de estado e contexto
- Integração com tools externas

### 2. Python + CLI
- Interface de linha de comando
- Argumentos e flags de configuração
- Modo interativo vs. batch

### 3. Ollama como Motor
- Modelos suportados (Llama, Mistral, etc.)
- Configuração local vs. cloud
- Perfis de modelo (`model-profiles.json`)

### 4. Docker + Docker Compose
- Containerização do runtime Python
- Serviço Ollama em container separado
- Volumes para memória e dados persistentes
- Rede interna entre containers

### 5. VPS/Hostinger
- Configuração de servidor Ubuntu/Debian
- Segurança (firewall, SSH, fail2ban)
- Deploy automatizado via CI/CD
- Monitoramento e logs

### 6. Memória e RAG
- Vector store (ChromaDB, FAISS, ou similar)
- Embeddings para recuperação semântica
- Context window management
- Histórico de conversas e ações

### 7. Tool Calling
- Registro de ferramentas disponíveis
- Schema de parâmetros
- Validação e sanitização
- Execução segura com whitelist

### 8. Planner/Executor
- **Planner:** Analisa objetivo, cria plano de ação
- **Executor:** Executa passos do plano, reporta progresso
- Feedback loop entre os dois componentes

### 9. Segurança e Permissões
- Autenticação e autorização
- Whitelist de operações permitidas
- Audit logging (`SECURITY`, `COMMAND_EXEC`, `IA_OPERATION`)
- Rate limiting e quotas

### 10. Voz e Multimodalidade
- STT (Speech-to-Text) para entrada de voz
- TTS (Text-to-Speech) para saída
- Processamento de arquivos (PDF, imagens, etc.)

### 11. Evolução Multi-Agent
- Agente especialista em código
- Agente especialista em infraestrutura
- Agente especialista em dados
- Orquestrador de agentes

---

## 📅 Roadmap de MVP em Sprints

### Sprint 1 — Fundação
- [ ] Scaffold do projeto Python
- [ ] CLI básica com argparse/click
- [ ] Integração com Ollama local
- [ ] Hello world do agente

### Sprint 2 — Tool Calling
- [ ] Sistema de registro de tools
- [ ] Validação de parâmetros
- [ ] Execução segura com whitelist
- [ ] Audit logging

### Sprint 3 — Memória RAG
- [ ] Vector store setup
- [ ] Embeddings e retrieval
- [ ] Context management
- [ ] Persistência em disco

### Sprint 4 — Dockerização
- [ ] Dockerfile Python
- [ ] docker-compose.yml
- [ ] Volumes e redes
- [ ] Testes em container

### Sprint 5 — Deploy VPS
- [ ] Configuração de servidor
- [ ] SSH e segurança
- [ ] Deploy automatizado
- [ ] Monitoramento básico

### Sprint 6 — Planner/Executor
- [ ] Lógica de planejamento
- [ ] Loop de execução
- [ ] Feedback e ajuste
- [ ] Tratamento de erros

### Sprint 7 — Multimodal
- [ ] STT integration
- [ ] TTS integration
- [ ] Processamento de arquivos

### Sprint 8 — Multi-Agent
- [ ] Arquitetura de agentes
- [ ] Comunicação entre agentes
- [ ] Orquestração

---

## ✅ Critérios de Sucesso

### Funcionais
- [ ] Agente executa tarefas via CLI
- [ ] Tool calling funciona com validação
- [ ] Memória RAG recupera contexto relevante
- [ ] Deploy em VPS acessível 24/7
- [ ] Planner/Executor completa objetivos

### Não Funcionais
- [ ] Latência < 2s para respostas simples
- [ ] Audit log de todas as operações
- [ ] Whitelist previne operações não autorizadas
- [ ] Container é reproduzível e versionado
- [ ] Monitoramento alerta falhas

### Segurança
- [ ] Autenticação configurada
- [ ] Whitelist de operações ativa
- [ ] Logs de segurança (nível `SECURITY`)
- [ ] Rate limiting implementado
- [ ] SSH hardening na VPS

---

## 📁 Estrutura de Diretórios Sugerida

```
Mestre-do-PC-V10/
└── agente-cli-python/
    ├── README.md
    ├── requirements.txt
    ├── Dockerfile
    ├── docker-compose.yml
    ├── src/
    │   ├── __init__.py
    │   ├── cli.py
    │   ├── agent.py
    │   ├── planner.py
    │   ├── executor.py
    │   ├── tools/
    │   │   ├── __init__.py
    │   │   ├── registry.py
    │   │   └── whitelist.py
    │   ├── memory/
    │   │   ├── __init__.py
    │   │   ├── rag.py
    │   │   └── vector_store.py
    │   └── security/
    │       ├── __init__.py
    │       └── audit.py
    ├── tests/
    │   ├── __init__.py
    │   ├── test_cli.py
    │   ├── test_agent.py
    │   └── test_tools.py
    └── docs/
        ├── arquitetura.md
        ├── deploy.md
        └── tools.md
```

---

## 🔧 Comandos e Scripts Úteis

### Desenvolvimento Local
```bash
cd Mestre-do-PC-V10/agente-cli-python
python -m venv venv
source venv/bin/activate  # ou `venv\Scripts\Activate` no Windows
pip install -r requirements.txt
python src/cli.py --help
```

### Docker
```bash
docker-compose build
docker-compose up -d
docker-compose logs -f
```

### Testes
```bash
pytest tests/
pytest tests/ -v --cov=src
```

---

## 📚 Referências Técnicas

### Projeto Mestre do PC V10
- `v10/launcher.js` — Servidor HTTP local (porta 7777)
- `v10/operation-registry.js` — Registro de operações
- `v10/allowed-operations.json` — Whitelist de comandos
- `mcp-server/index.js` — MCP stdio server
- `mcp-server/security.js` — Sanitização e prompt injection guard
- `mcp-server/audit-logger.js` — Audit log writer
- `v10/chat/chat-module.js` — Chat com streaming
- `v10/memory-manager.js` — Gerenciamento de memórias
- `docs/` — Documentação completa em PT/EN

### MCP Server Integration
```
AI clients (Claude Desktop / Copilot / browser)
    │  stdio (MCP) ou HTTP
    ▼
mcp-server/index.js          ← bridge non-elevated
    │  POST {id, params?}
    ▼
v10/launcher.js              ← Node.js HTTP, 127.0.0.1:7777
    │  valida origin + header, resolve via operation-registry.js
    ▼
powershell.exe               ← apenas comandos da whitelist
```

### Padrões de Segurança
- Parameterized commands: `{{UPPERCASE_NAME}}` com regex ancorado
- Sanitização: `[a-zA-Z0-9_. -]+` (max 128 chars), **rejeita** input perigoso
- Prompt injection guard: `benigno`, `suspeito`, `malicioso`
- Headers de segurança: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`
- Audit logging: 7 níveis (`INFO`, `WARNING`, `ERROR`, `SECURITY`, `COMMAND_EXEC`, `IA_OPERATION`, `WEBHOOK`)

---

## 🔄 Próximos Passos

1. **Definir escopo do MVP** — quais tools são essenciais?
2. **Escolher vector store** — ChromaDB, FAISS, Qdrant?
3. **Configurar ambiente Python** — versão, dependências
4. **Criar scaffold inicial** — estrutura de diretórios
5. **Implementar CLI básica** — hello world com Ollama
6. **Iterar em sprints** — conforme roadmap acima

---

## 📝 Notas de Decisão

### Por que Python?
- Cross-platform (Windows, Linux, macOS)
- Ecossistema rico para IA/ML
- Bibliotecas maduras para RAG, embeddings, vector stores
- Facilita integração com ferramentas de infraestrutura

### Por que VPS/Hostinger?
- Acesso 24/7 independente da máquina local
- Isolamento do ambiente de execução
- Escalabilidade vertical/horizontal
- Custo-benefício para desenvolvimento

### Por que Multi-Agent no futuro?
- Separação de responsabilidades
- Especialização por domínio
- Paralelismo de execução
- Resiliência (falha em um agente não para o sistema)

---

**Fim do documento de contexto.**  
Continuação do desenvolvimento em momento futuro.

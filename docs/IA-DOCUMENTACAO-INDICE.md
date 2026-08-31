# 🧭 Índice de Documentação de IA - Mestre do PC V11

> **Data:** 24 de Agosto de 2026  
> **Versão:** 1.0.0  
> **Status:** ✅ Documentação completa

---

## 📚 Visão Geral

Este índice centraliza toda a documentação relacionada à **IA do Mestre do PC V11**, incluindo modelos, perfis, identidade do agente e guias de uso.

---

## 📄 Documentos Disponíveis

### 1. **Soul.md** — Identidade do Agente CHAT IA
**Local:** `v10/chat/Soul.md`

**Conteúdo:**
- 👤 Quem sou eu (identidade e personalidade)
- 🏠 Onde moro (localização dos arquivos)
- 👤 Quem é meu dono (JEAN e preferências)
- 🎯 Minha função principal
- 🔒 Regras de segurança (não negociáveis)
- 🗣️ Tom de voz e estilo
- 🔄 Fluxo de diagnóstico (passo-a-passo)
- 📚 Exemplos de prompts
- 🧠 Memória do sistema
- 🎯 Nosso plano (visão de futuro)

**Quando usar:**
- Para entender como o agente deve se comportar
- Para configurar novos agentes
- Para treinamento e fine-tuning
- Para manter consistência nas respostas

---

### 2. **MODELOS-ANALISE-COMPLETA.md** — Análise de Modelos
**Local:** `docs/MODELOS-ANALISE-COMPLETA.md`

**Conteúdo:**
- 📊 Visão geral dos 13 modelos disponíveis
- 🖥️ Análise detalhada de modelos locais (3)
- ☁️ Análise detalhada de modelos cloud (10)
- 📊 Tabela comparativa completa
- 🎯 Recomendações por cenário de uso
- 📈 Curva de custo-benefício
- 🔧 Como trocar de modelo
- 📝 Notas de configuração

**Modelos documentados:**
| Modelo | Tipo | Melhor Uso |
|--------|------|------------|
| `whisper-tiny:latest` | Local | Transcrição de áudio |
| `agente:latest` | Local | Automação MCP |
| `qwen2.5-coder:3b` | Local | Chat diário (padrão) |
| `deepseek-v4-flash:cloud` | Cloud | Respostas rápidas |
| `qwen3.5:cloud` | Cloud | Uso geral |
| `glm-5.2:cloud` | Cloud | Raciocínio lógico |
| `mistral-large-3:675b-cloud` | Cloud | Raciocínio complexo ⭐ |
| `minimax-m3:cloud` | Cloud | Diálogo natural |
| `qwen3.5:397b-cloud` | Cloud | Contexto longo |
| `kimi-k2.7-code:cloud` | Cloud | Código especializado ⭐ |
| `kimi-k2.6:cloud` | Cloud | Backup |
| `deepseek-v4-pro:cloud` | Cloud | Documentação técnica |
| `gpt-oss:120b-cloud` | Cloud | Código open-source |

**Quando usar:**
- Para escolher o melhor modelo para uma tarefa
- Para entender capacidades e limitações
- Para configurar perfis no `model-profiles.json`
- Para justificar escolhas de modelo

---

### 3. **TEMPLATE-MODELO-IA.md** — Template de Documentação
**Local:** `docs/TEMPLATE-MODELO-IA.md`

**Conteúdo:**
- 🆔 Identificação do modelo
- 📊 Especificações técnicas
- ⭐ Avaliação de desempenho (1-5 estrelas)
- 🎯 Casos de uso (melhor para / limitações)
- 🔧 Configuração no Mestre do PC
- 📈 Benchmarks (opcional)
- 💰 Custo (se cloud)
- 📝 Notas adicionais
- 🧪 Testes realizados
- ✅ Checklist de validação

**Quando usar:**
- Ao adicionar um novo modelo ao catálogo
- Para documentar testes de modelos experimentais
- Para padronizar documentação de modelos
- Para comparar modelos de forma estruturada

---

### 4. **model-profiles.json** — Configuração de Perfis
**Local:** `mcp-server/model-profiles.json`

**Conteúdo:**
- 7 perfis configurados:
  - `fast` → qwen2.5-coder:3b-instruct (local)
  - `balanced` → qwen2.5-coder:3b-instruct (local) ⭐ Padrão
  - `agent` → fazendaavila2026/agente:latest (local)
  - `coding` → kimi-k2.7-code:cloud (especializado)
  - `reasoning` → mistral-large-3:675b-cloud (675B)
  - `dialogue` → minimax-m3:cloud (humano)
  - `transcription` → whisper-tiny:latest (áudio)
- Catálogo completo de modelos (local e cloud)
- Fallback models para cada perfil
- Opções de geração (temperature, top_p, etc.)

**Quando usar:**
- Para configurar qual modelo cada perfil usa
- Para definir fallbacks quando modelo principal falha
- Para ajustar parâmetros de geração
- Para adicionar novos perfis

---

### 5. **SISTEMA-MEMORIAS.md** — Gestão de Memórias
**Local:** `docs/SISTEMA-MEMORIAS.md`

**Conteúdo:**
- 📋 Visão geral do sistema de memórias
- 📁 Estrutura de arquivos
- 🔌 API REST (endpoints)
- 📊 Formato de exportação (CSV, XLSX, JSON)
- 🖥️ Interface web
- 🔧 Como usar (exemplos de código)
- 📝 Tipos de memória (6 tipos)
- 🏷️ Sistema de tags
- ⭐ Níveis de importância (1-5)
- 🗄️ Armazenamento
- 🧹 Limpeza automática

**Quando usar:**
- Para salvar conversas importantes
- Para exportar diagnósticos
- Para buscar soluções anteriores
- Para backup de configurações

---

### 6. **AGENTS.md** — Instruções Gerais (Raiz)
**Local:** `C:\Users\Jeanc\AGENTS.md`

**Conteúdo:**
- Visão geral do repositório
- Projetos ativos do usuário
- Arquitetura do Mestre do PC V10/V11
- Stack e requisitos
- Componentes principais
- Comandos de build e validação
- Convenções de código
- Regras de segurança

**Quando usar:**
- Para contexto geral do projeto
- Para entender a arquitetura
- Para comandos de build/teste
- Para regras de segurança

---

### 7. **QWEN.md** — Instruções Específicas (Qwen Code)
**Local:** `Mestre-do-PC-V10-clean\QWEN.md`

**Conteúdo:**
- Visão geral do projeto
- Arquitetura (diagrama)
- Two-backend design (PS + Node.js)
- Build & run commands
- Key files table
- Testing (node --test)
- Security model
- Environment variables
- V11 features

**Quando usar:**
- Para desenvolvimento com Qwen Code
- Para comandos de execução
- Para entender segurança
- Para variáveis de ambiente

---

## 🔗 Relacionamento entre Documentos

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENTS.md (Raiz)                         │
│          Contexto geral do repositório e projetos            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    QWEN.md (Projeto)                         │
│     Detalhes específicos do Mestre do PC V10/V11             │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────┐
│   Soul.md       │ │  MODELOS-       │ │  SISTEMA-           │
│   (Identidade)  │ │  ANALISE-       │ │  MEMORIAS.md        │
│                 │ │  COMPLETA.md    │ │                     │
│ - Personalidade │ │                 │ │ - API de memórias   │
│ - Regras        │ │ - 13 modelos    │ │ - 6 tipos           │
│ - Fluxo         │ │ - Comparativos  │ │ - Exportação        │
│ - Exemplos      │ │ - Configuração  │ │ - Busca             │
└─────────────────┘ └─────────────────┘ └─────────────────────┘
         │                  │                    │
         └──────────────────┼────────────────────┘
                            ▼
                 ┌─────────────────────┐
                 │  model-profiles.json │
                 │                     │
                 │ - 7 perfis          │
                 │ - Catálogo          │
                 │ - Fallbacks         │
                 └─────────────────────┘
```

---

## 🚀 Guia Rápido de Consulta

### "Qual modelo devo usar para...?"

| Tarefa | Modelo Recomendado | Perfil |
|--------|-------------------|--------|
| Chat diário | `qwen2.5-coder:3b-instruct` | `balanced` |
| Automação MCP | `fazendaavila2026/agente:latest` | `agent` |
| Código PowerShell | `kimi-k2.7-code:cloud` | `coding` |
| Problema complexo | `mistral-large-3:675b-cloud` | `reasoning` |
| Diálogo humano | `minimax-m3:cloud` | `dialogue` |
| Transcrição | `whisper-tiny:latest` | `transcription` |
| Resposta rápida | `deepseek-v4-flash:cloud` | `fast` |

---

### "Onde encontro...?"

| Informação | Arquivo | Seção |
|------------|---------|-------|
| Personalidade do agente | `Soul.md` | "Minha Identidade" |
| Regras de segurança | `Soul.md` | "Regras de Segurança" |
| Fluxo de diagnóstico | `Soul.md` | "Fluxo de Diagnóstico" |
| Análise de modelo X | `MODELOS-ANALISE-COMPLETA.md` | Seção do modelo |
| Como configurar perfil | `model-profiles.json` | `profiles.{nome}` |
| Como salvar memória | `SISTEMA-MEMORIAS.md` | "Como Usar" |
| Comandos MCP | `Soul.md` | "Comandos MCP Disponíveis" |

---

### "Como faço para...?"

| Tarefa | Documento | Passos |
|--------|-----------|--------|
| Adicionar novo modelo | `TEMPLATE-MODELO-IA.md` | Preencher template → Salvar em `docs/modelos/` |
| Criar novo perfil | `model-profiles.json` | Adicionar em `profiles.{nome}` |
| Salvar conversa | `SISTEMA-MEMORIAS.md` | POST `/memories/create` |
| Trocar modelo | `MODELOS-ANALISE-COMPLETA.md` | Via UI, MCP ou env var |
| Validar comando | `Soul.md` | "Regra #1: Whitelist é Sagrada" |

---

## 📊 Status da Documentação

| Documento | Status | Última Atualização | Próx. Revisão |
|-----------|--------|-------------------|---------------|
| `Soul.md` | ✅ Completo | 2026-08-24 | 2026-09-24 |
| `MODELOS-ANALISE-COMPLETA.md` | ✅ Completo | 2026-08-24 | 2026-09-24 |
| `TEMPLATE-MODELO-IA.md` | ✅ Completo | 2026-08-24 | 2026-09-24 |
| `model-profiles.json` | ✅ Atualizado | 2026-08-24 | Conforme necessidade |
| `SISTEMA-MEMORIAS.md` | ✅ Completo | 2026-08-17 | 2026-09-17 |
| `AGENTS.md` | ✅ Completo | 2026-08-24 | Conforme necessidade |
| `QWEN.md` | ✅ Completo | 2026-08-24 | Conforme necessidade |

---

## 🔄 Ciclo de Vida da Documentação

### Criação
1. Identificar gap de documentação
2. Usar template apropriado (se existir)
3. Salvar em local padrão
4. Atualizar este índice

### Atualização
1. Revisar documentos mensalmente (ou conforme necessidade)
2. Validar informações com código atual
3. Atualizar data e versão
4. Registrar mudanças em `CHANGELOG.md`

### Depreciação
1. Marcar como "⚠️ Desatualizado" no topo
2. Link para documento substituto
3. Manter por 30 dias antes de remover
4. Atualizar referências cruzadas

---

## 📞 Suporte

**Dúvidas sobre documentação?**
- Consulte este índice primeiro
- Use busca full-text nos arquivos `.md`
- Verifique `CHANGELOG-V11.md` para mudanças recentes

**Erros ou omissões?**
- Reporte via issue no GitHub
- Envie PR com correção
- Atualize a seção "Status da Documentação"

---

**Mestre do PC V11 - Ultimate Plus**  
**Desenvolvido por JEAN**  
*Índice de Documentação de IA v1.0*

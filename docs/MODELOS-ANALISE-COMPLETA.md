# 🧠 Análise Completa dos Modelos de IA - Mestre do PC V11

> **Data:** 24 de Agosto de 2026  
> **Versão:** 1.0.0  
> **Status:** ✅ Documentação completa dos modelos disponíveis

---

## 📊 Visão Geral

Este documento apresenta uma análise detalhada de **cada modelo de IA** disponível no Mestre do PC V11, incluindo suas capacidades, pontos fortes, limitações e casos de uso recomendados.

### Modelos Disponíveis

| Tipo | Quantidade | Modelos |
|------|------------|---------|
| **Locais** | 3 | `whisper-tiny`, `agente:latest`, `qwen2.5-coder:3b` |
| **Cloud** | 10 | `deepseek-v4-flash`, `qwen3.5`, `mistral-large-3`, `kimi-k2.7-code`, etc. |
| **Total** | **13** | — |

---

## 🖥️ Modelos Locais (Ollama)

### 1. `dimavz/whisper-tiny:latest`

**Tipo:** Speech-to-Text (ASR)  
**Tamanho:** ~40 MB  
**RAM Mínima:** 2 GB  
**GPU Recomendada:** Não

#### 🔍 Análise

| Critério | Avaliação |
|----------|-----------|
| **Velocidade** | ⭐⭐⭐⭐⭐ Extremamente rápido |
| **Precisão** | ⭐⭐⭐⭐ Boa para áudio limpo |
| **Consumo** | ⭐⭐⭐⭐⭐ Mínimo |
| **Versatilidade** | ⭐⭐ Especializado |

#### ✅ Melhor Para
- Transcrição de áudio em tempo real
- Comandos de voz para automação
- Legendas automáticas
- Notas de voz → texto

#### ❌ Limitações
- **Apenas transcrição** — não gera texto, não responde perguntas
- Precisa de áudio de boa qualidade
- Não suporta múltiplos idiomas simultaneamente

#### 🎯 Caso de Uso no Mestre do PC
```powershell
# Exemplo: Transcrever reunião e salvar em memórias
mcp__mestre-do-pc__transcrever_audio -AudioPath "C:\gravacoes\reuniao.wav"
```

**Recomendação:** Use para **entrada de dados por voz**, não para chat ou diagnóstico.

---

### 2. `fazendaavila2026/agente:latest`

**Tipo:** Agente Customizado  
**Tamanho:** ~7 GB (estimado)  
**RAM Mínima:** 8 GB  
**GPU Recomendada:** Sim

#### 🔍 Análise

| Critério | Avaliação |
|----------|-----------|
| **Velocidade** | ⭐⭐⭐ Moderada |
| **Precisão** | ⭐⭐⭐⭐ Muito boa no contexto |
| **Consumo** | ⭐⭐⭐ Moderado |
| **Versatilidade** | ⭐⭐⭐⭐⭐ Alta (customizado) |

#### ✅ Melhor Para
- **Automação do Mestre do PC** — já conhece o contexto
- Execução de ferramentas MCP
- Diagnóstico de sistema
- Respostas contextualizadas ao projeto

#### ❌ Limitações
- Requer mais RAM que o qwen2.5-coder:3b
- Pode não estar disponível em outras máquinas
- Menos testado em tarefas gerais

#### 🎯 Caso de Uso no Mestre do PC
```powershell
# Definir como perfil "agent"
mcp__mestre-do-pc__definir_perfil_modelo -Perfil "agent"

# Usar para automação
mcp__mestre-do-pc__diagnostico_completo
```

**Recomendação:** **Modelo principal para automação** — use para executar ferramentas MCP e diagnósticos.

---

### 3. `qwen2.5-coder:3b-instruct`

**Tipo:** Código / Uso Geral  
**Tamanho:** ~3.5 GB  
**RAM Mínima:** 4 GB  
**GPU Recomendada:** Não

#### 🔍 Análise

| Critério | Avaliação |
|----------|-----------|
| **Velocidade** | ⭐⭐⭐⭐ Rápido |
| **Precisão** | ⭐⭐⭐⭐ Boa para código |
| **Consumo** | ⭐⭐⭐⭐ Baixo |
| **Versatilidade** | ⭐⭐⭐⭐ Alta |

#### ✅ Melhor Para
- **Geração de scripts PowerShell**
- Código Python, JavaScript, TypeScript
- Explicação de conceitos técnicos
- Chat geral do Mestre do PC
- Uso contínuo sem fadiga de RAM

#### ❌ Limitações
- Contexto limitado (3B parâmetros)
- Pode errar em raciocínios muito complexos
- Não é o melhor para análise crítica profunda

#### 🎯 Caso de Uso no Mestre do PC
```powershell
# Perfil "balanced" já usa este modelo
# Ideal para:
mcp__mestre-do-pc__perguntar_ia -Pergunta "Como limpar cache do Windows Update?"
mcp__mestre-do-pc__analisar_codigo_powershell -Codigo "Get-Process | Sort-Object RAM -Descending"
```

**Recomendação:** **Modelo padrão para chat** — equilibrado, rápido, não consome API.

---

## ☁️ Modelos Cloud (Ollama API)

### 4. `deepseek-v4-flash:cloud`

**Tipo:** Uso Geral Rápido  
**Tamanho:** N/A (Cloud)  
**RAM Mínima:** N/A  
**Custo:** Baixo (modelo "flash")

#### 🔍 Análise

| Critério | Avaliação |
|----------|-----------|
| **Velocidade** | ⭐⭐⭐⭐⭐ Muito rápido |
| **Precisão** | ⭐⭐⭐⭐ Boa |
| **Custo** | ⭐⭐⭐⭐ Baixo |
| **Versatilidade** | ⭐⭐⭐⭐ Alta |

#### ✅ Melhor Para
- Respostas rápidas e objetivas
- Tarefas do dia-a-dia
- Validação de informações
- Chat casual

#### ❌ Limitações
- Requer API key
- Menos preciso que modelos "pro"
- Latência de rede

#### 🎯 Caso de Uso
Use quando precisar de **respostas rápidas** sem gastar recursos locais.

---

### 5. `qwen3.5:cloud`

**Tipo:** Uso Geral Balanceado  
**Tamanho:** N/A (Cloud)  
**RAM Mínima:** N/A  
**Custo:** Moderado

#### 🔍 Análise

| Critério | Avaliação |
|----------|-----------|
| **Velocidade** | ⭐⭐⭐⭐ Rápida |
| **Precisão** | ⭐⭐⭐⭐ Boa |
| **Custo** | ⭐⭐⭐ Moderado |
| **Versatilidade** | ⭐⭐⭐⭐⭐ Alta |

#### ✅ Melhor Para
- **Uso geral equilibrado**
- Respostas em português brasileiro
- Tarefas que exigem contexto moderado
- Substituto do qwen2.5-coder:3b quando precisar de mais capacidade

#### ❌ Limitações
- Custo de API
- Latência de rede

#### 🎯 Caso de Uso
**Perfil "balanced" alternativo** — use quando o modelo local não for suficiente.

---

### 6. `glm-5.2:cloud`

**Tipo:** Raciocínio Geral (Zhipu GLM)  
**Tamanho:** N/A (Cloud)  
**RAM Mínima:** N/A  
**Custo:** Moderado

#### 🔍 Análise

| Critério | Avaliação |
|----------|-----------|
| **Velocidade** | ⭐⭐⭐ Moderada |
| **Precisão** | ⭐⭐⭐⭐ Boa |
| **Custo** | ⭐⭐⭐ Moderado |
| **Versatilidade** | ⭐⭐⭐⭐ Alta |

#### ✅ Melhor Para
- Compreensão de contexto longo
- Raciocínio lógico
- Análise de documentos
- Perguntas complexas

#### ❌ Limitações
- Menos testado em código
- Latência de rede

#### 🎯 Caso de Uso
Use para **análise de logs** e **diagnóstico de problemas complexos**.

---

### 7. `mistral-large-3:675b-cloud` ⭐

**Tipo:** Raciocínio Avançado  
**Tamanho:** **675 Bilhões de parâmetros**  
**RAM Mínima:** N/A (Cloud)  
**Custo:** Alto (modelo premium)

#### 🔍 Análise

| Critério | Avaliação |
|----------|-----------|
| **Velocidade** | ⭐⭐ Lenta (modelo pesado) |
| **Precisão** | ⭐⭐⭐⭐⭐ Excelente |
| **Custo** | ⭐ Alto |
| **Versatilidade** | ⭐⭐⭐⭐⭐ Máxima |

#### ✅ Melhor Para
- **Raciocínio complexo e análise crítica**
- Diagnósticos de falhas críticas
- Planejamento de arquitetura
- Revisão de código segurança-crítica
- **Perfil "reasoning"**

#### ❌ Limitações
- **Custo mais alto**
- Latência alta (modelo pesado)
- Overkill para tarefas simples

#### 🎯 Caso de Uso
```powershell
# Use para problemas complexos
mcp__mestre-do-pc__perguntar_ia_com_contexto `
  -Pergunta "Por que o Windows Update falha com erro 0x80070005?" `
  -Contexto @(Get-Content "C:\logs\windowsupdate.log" -Tail 100) `
  -Modelo "mistral-large-3:675b-cloud"
```

**Recomendação:** Use **apenas para problemas críticos** que exigem raciocínio profundo.

---

### 8. `minimax-m3:cloud`

**Tipo:** Conversação Natural (Moonshot AI)  
**Tamanho:** N/A (Cloud)  
**RAM Mínima:** N/A  
**Custo:** Moderado

#### 🔍 Análise

| Critério | Avaliação |
|----------|-----------|
| **Velocidade** | ⭐⭐⭐⭐ Rápida |
| **Precisão** | ⭐⭐⭐⭐ Boa |
| **Custo** | ⭐⭐⭐ Moderado |
| **Versatilidade** | ⭐⭐⭐⭐ Alta |

#### ✅ Melhor Para
- **Diálogo natural e humano**
- Explicações didáticas
- Suporte ao usuário
- Tom amigável

#### ❌ Limitações
- Menos preciso em código
- Latência de rede

#### 🎯 Caso de Uso
Use para **chat com usuário** quando quiser um tom mais humano e menos técnico.

---

### 9. `qwen3.5:397b-cloud`

**Tipo:** Modelo Grande de Uso Geral  
**Tamanho:** **397 Bilhões de parâmetros**  
**RAM Mínima:** N/A (Cloud)  
**Custo:** Alto

#### 🔍 Análise

| Critério | Avaliação |
|----------|-----------|
| **Velocidade** | ⭐⭐ Lenta |
| **Precisão** | ⭐⭐⭐⭐⭐ Excelente |
| **Custo** | ⭐ Alto |
| **Versatilidade** | ⭐⭐⭐⭐⭐ Máxima |

#### ✅ Melhor Para
- Tarefas que exigem **muito contexto**
- Código longo e complexo
- Análise de múltiplos arquivos
- Substituto mais barato do Mistral-675b

#### ❌ Limitações
- Custo alto
- Latência alta

#### 🎯 Caso de Uso
Use para **análise de código longo** ou **documentação extensa**.

---

### 10. `kimi-k2.7-code:cloud` ⭐

**Tipo:** Código Especializado (Moonshot AI)  
**Tamanho:** N/A (Cloud)  
**RAM Mínima:** N/A  
**Custo:** Moderado-Alto

#### 🔍 Análise

| Critério | Avaliação |
|----------|-----------|
| **Velocidade** | ⭐⭐⭐ Moderada |
| **Precisão** | ⭐⭐⭐⭐⭐ Excelente em código |
| **Custo** | ⭐⭐ Moderado-Alto |
| **Versatilidade** | ⭐⭐⭐ Especializado |

#### ✅ Melhor Para
- **Geração e revisão de código**
- Debugging complexo
- Refatoração
- **Perfil "coding"**
- Explicação de algoritmos

#### ❌ Limitações
- **Especializado em código** — menos versátil para outras tarefas
- Custo mais alto que modelos gerais

#### 🎯 Caso de Uso
```powershell
# Perfil "coding"
mcp__mestre-do-pc__definir_perfil_modelo -Perfil "coding"

# Analisar script complexo
mcp__mestre-do-pc__analisar_codigo_powershell `
  -Codigo (Get-Content "MestreDoPC-Launcher.ps1" -Raw) `
  -Modelo "kimi-k2.7-code:cloud"
```

**Recomendação:** **Melhor modelo para código** — use para revisão de scripts PowerShell e debugging.

---

### 11. `kimi-k2.6:cloud`

**Tipo:** Uso Geral (Moonshot AI)  
**Tamanho:** N/A (Cloud)  
**RAM Mínima:** N/A  
**Custo:** Moderado

#### 🔍 Análise

| Critério | Avaliação |
|----------|-----------|
| **Velocidade** | ⭐⭐⭐⭐ Rápida |
| **Precisão** | ⭐⭐⭐⭐ Boa |
| **Custo** | ⭐⭐⭐ Moderado |
| **Versatilidade** | ⭐⭐⭐⭐ Alta |

#### ✅ Melhor Para
- Uso geral alternativo ao qwen3.5
- Quando o kimi-k2.7-code estiver ocupado
- Tarefas que não exigem código

#### ❌ Limitações
- Versão anterior (k2.6 < k2.7)
- Menos testado no projeto

#### 🎯 Caso de Uso
**Backup** para o qwen3.5 ou kimi-k2.7-code.

---

### 12. `deepseek-v4-pro:cloud`

**Tipo:** Análise Técnica Avançada  
**Tamanho:** N/A (Cloud)  
**RAM Mínima:** N/A  
**Custo:** Alto

#### 🔍 Análise

| Critério | Avaliação |
|----------|-----------|
| **Velocidade** | ⭐⭐ Moderada |
| **Precisão** | ⭐⭐⭐⭐⭐ Excelente |
| **Custo** | ⭐ Alto |
| **Versatilidade** | ⭐⭐⭐⭐ Alta |

#### ✅ Melhor Para
- **Documentação técnica**
- Análise de arquitetura
- Explicação de sistemas complexos
- Troubleshooting avançado

#### ❌ Limitações
- Custo alto
- Latência alta

#### 🎯 Caso de Uso
Use para **documentação técnica** e **análise de arquitetura**.

---

### 13. `gpt-oss:120b-cloud`

**Tipo:** Código Open-Source  
**Tamanho:** **120 Bilhões de parâmetros**  
**RAM Mínima:** N/A (Cloud)  
**Custo:** Moderado-Alto

#### 🔍 Análise

| Critério | Avaliação |
|----------|-----------|
| **Velocidade** | ⭐⭐⭐ Moderada |
| **Precisão** | ⭐⭐⭐⭐ Boa em código |
| **Custo** | ⭐⭐ Moderado-Alto |
| **Versatilidade** | ⭐⭐⭐⭐ Alta |

#### ✅ Melhor Para
- Código open-source
- Integração com ferramentas GNU
- Scripts PowerShell e Bash
- Análise de repositórios Git

#### ❌ Limitações
- Menos testado no projeto
- Custo moderado-alto

#### 🎯 Caso de Uso
Use para **código open-source** e **integração com ferramentas GNU**.

---

## 📊 Tabela Comparativa

| Modelo | Tipo | RAM | Velocidade | Precisão | Custo | Melhor Uso |
|--------|------|-----|------------|----------|-------|------------|
| **whisper-tiny** | Local | 2GB | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Gratis | Transcrição |
| **agente:latest** | Local | 8GB | ⭐⭐⭐ | ⭐⭐⭐⭐ | Gratis | Automação MCP |
| **qwen2.5-coder:3b** | Local | 4GB | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Gratis | **Padrão Chat** |
| **deepseek-v4-flash** | Cloud | N/A | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Baixo | Respostas rápidas |
| **qwen3.5:cloud** | Cloud | N/A | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Moderado | Uso geral |
| **glm-5.2:cloud** | Cloud | N/A | ⭐⭐⭐ | ⭐⭐⭐⭐ | Moderado | Raciocínio |
| **mistral-large-3:675b** | Cloud | N/A | ⭐⭐ | ⭐⭐⭐⭐⭐ | Alto | **Raciocínio complexo** |
| **minimax-m3:cloud** | Cloud | N/A | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Moderado | Diálogo |
| **qwen3.5:397b** | Cloud | N/A | ⭐⭐ | ⭐⭐⭐⭐⭐ | Alto | Contexto longo |
| **kimi-k2.7-code:cloud** | Cloud | N/A | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Moderado-Alto | **Código** |
| **kimi-k2.6:cloud** | Cloud | N/A | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Moderado | Backup |
| **deepseek-v4-pro:cloud** | Cloud | N/A | ⭐⭐ | ⭐⭐⭐⭐⭐ | Alto | Documentação |
| **gpt-oss:120b** | Cloud | N/A | ⭐⭐⭐ | ⭐⭐⭐⭐ | Moderado-Alto | Código OSS |

---

## 🎯 Recomendações por Cenário

### 📌 Cenário: Chat Diário no Mestre do PC

**Modelo Recomendado:** `qwen2.5-coder:3b-instruct` (local)

**Por quê?**
- ✅ Rápido e responsivo
- ✅ Não consome API
- ✅ Bom o suficiente para 90% das perguntas
- ✅ Não esquenta a RAM (4GB)

**Configuração:**
```json
{
  "defaultProfile": "balanced",
  "model": "qwen2.5-coder:3b-instruct"
}
```

---

### 📌 Cenário: Automação e Ferramentas MCP

**Modelo Recomendado:** `fazendaavila2026/agente:latest` (local)

**Por quê?**
- ✅ Customizado para o Mestre do PC
- ✅ Conhece o contexto do projeto
- ✅ Otimizado para executar ferramentas

**Configuração:**
```json
{
  "profile": "agent",
  "model": "fazendaavila2026/agente:latest"
}
```

---

### 📌 Cenário: Revisão de Código PowerShell

**Modelo Recomendado:** `kimi-k2.7-code:cloud`

**Por quê?**
- ✅ Especializado em código
- ✅ Melhor precisão em debugging
- ✅ Explica erros e sugere correções

**Configuração:**
```json
{
  "profile": "coding",
  "model": "kimi-k2.7-code:cloud"
}
```

---

### 📌 Cenário: Diagnóstico de Falha Crítica

**Modelo Recomendado:** `mistral-large-3:675b-cloud`

**Por quê?**
- ✅ 675B parâmetros = raciocínio profundo
- ✅ Melhor para análise crítica
- ✅ Identifica causas raiz complexas

**Configuração:**
```json
{
  "profile": "reasoning",
  "model": "mistral-large-3:675b-cloud"
}
```

---

### 📌 Cenário: Respostas Rápidas (API)

**Modelo Recomendado:** `deepseek-v4-flash:cloud`

**Por quê?**
- ✅ Muito rápido
- ✅ Baixo custo
- ✅ Bom para validação

**Configuração:**
```json
{
  "profile": "fast",
  "model": "deepseek-v4-flash:cloud"
}
```

---

## 📈 Curva de Custo-Benefício

```
Custo-Benefício (1-5):

Modelo Local (Gratis)         Modelo Cloud (Pago)
━━━━━━━━━━━━━━━━━━━━━━━━      ━━━━━━━━━━━━━━━━━━━━━━━━
qwen2.5-coder:3b     █████ 5   deepseek-v4-flash   █████ 5
agente:latest        █████ 4   qwen3.5:cloud       █████ 4
whisper-tiny         █████ 5   minimax-m3:cloud    █████ 4
                                   glm-5.2:cloud       ████ 4
                                   kimi-k2.6:cloud     ████ 4
                                   kimi-k2.7-code      ███ 3
                                   gpt-oss:120b        ███ 3
                                   deepseek-v4-pro     ███ 3
                                   qwen3.5:397b        ██ 2
                                   mistral-675b        ██ 2
```

---

## 🔧 Como Trocar de Modelo

### Via Interface Web
1. Abra `http://127.0.0.1:7777/`
2. Clique no botão de configurações (⚙️)
3. Selecione o modelo desejado
4. Clique em "Aplicar"

### Via MCP Server
```powershell
# Definir perfil (usa modelo do profile)
mcp__mestre-do-pc__definir_perfil_modelo -Perfil "coding"

# Ou usar diretamente em uma pergunta
mcp__mestre-do-pc__perguntar_ia `
  -Pergunta "Analise este código..." `
  -Modelo "kimi-k2.7-code:cloud"
```

### Via Variável de Ambiente
```powershell
# PowerShell (sessão atual)
$env:OLLAMA_MODEL = "kimi-k2.7-code:cloud"
$env:OLLAMA_MODEL_PROFILE = "coding"

# Permanente (PowerShell profile)
[Environment]::SetEnvironmentVariable(
  "OLLAMA_MODEL",
  "kimi-k2.7-code:cloud",
  "User"
)
```

---

## 📝 Notas de Configuração

### RAM Mínima Recomendada

| Modelo | RAM Mínima | RAM Recomendada |
|--------|------------|-----------------|
| whisper-tiny | 2 GB | 4 GB |
| qwen2.5-coder:3b | 4 GB | 8 GB |
| agente:latest | 8 GB | 16 GB |
| Modelos Cloud | N/A | 4 GB (rede) |

### GPU Recomendada

- **Sim:** `agente:latest`, modelos cloud pesados (>100B)
- **Não:** whisper-tiny, qwen2.5-coder:3b, deepseek-v4-flash

### Latência de Rede

Modelos cloud adicionam **100-500ms** de latência. Para chat contínuo, prefira modelos locais.

---

## 🚀 Próximos Passos

1. **Testar cada modelo** com prompts padronizados
2. **Criar perfis personalizados** no `model-profiles.json`
3. **Documentar resultados** de benchmarks
4. **Atualizar este arquivo** com aprendizados

---

**Mestre do PC V11** - Desenvolvido por JEAN  
*Documentação de Modelos de IA v1.0*

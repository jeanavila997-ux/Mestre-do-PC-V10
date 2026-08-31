# 📘 Guia Rápido - Mestre do PC V11

## 🚀 Início Rápido

### 1. Iniciar o Sistema
```powershell
# Terminal 1 (Admin): Iniciar Launcher
cd C:\Users\Jeanc\Mestre-do-PC-V10-clean
.\MestreDoPC-Launcher.ps1

# Terminal 2: Iniciar MCP Server
cd mcp-server
npm start

# Acessar interface
# http://127.0.0.1:7777/
```

### 2. Validar Instalação
```powershell
.\validate-v11.ps1
# ✅ Todos os scripts devem passar
```

---

## 📦 Novas Operações - Exemplos Práticos

### Backup

#### Backup do Registro
```powershell
# Via UI: Selecione "Backup Completo do Registro"
# Arquivo salvo em: %USERPROFILE%\MestrePC-Backups\
```

#### Backup de Drivers
```powershell
# Via UI: "Backup de Drivers Instalados"
# Exporta todos os drivers para pasta de backup
```

### Monitoramento de Temperatura

#### Ver Temperatura CPU
```powershell
# Via UI: "Temperatura CPU (Leitura Direta)"
# Retorna: Temperatura atual em °C
# Cores: Verde (<60°C), Amarelo (60-80°C), Vermelho (>80°C)
```

#### Monitoramento Contínuo
```powershell
# Via UI: "Monitoramento Contínuo de Temperatura"
# 10 leituras com intervalo de 5 segundos
```

### Gestão de Drivers

#### Listar Drivers
```powershell
# Via UI: "Listar Todos os Drivers Instalados"
# Mostra: Nome, Versão, Fabricante, Data
```

#### Atualizar Drivers
```powershell
# Via UI: "Atualizar Drivers via Windows Update"
# Busca e instala drivers automaticamente
```

### Apps UWP (Windows Store)

#### Diagnosticar Apps
```powershell
# Via UI: "Diagnóstico de Apps UWP"
# Identifica apps corrompidos
```

#### Reinstalar Apps
```powershell
# Via UI: "Reinstalar Todos Apps Padrão"
# Restaura apps do Windows
```

### SSD

#### Otimizar TRIM
```powershell
# Via UI: "Otimizar TRIM (Todos os Drives)"
# Executa TRIM em todos os SSDs
```

#### Verificar Saúde
```powershell
# Via UI: "Verificar Saúde Completa do SSD"
# Status SMART, tipo, tamanho
```

---

## 🤖 IA Avançada - Exemplos MCP

### 1. Perguntar IA com Contexto (RAG)

```javascript
// Via MCP Client
{
  "name": "perguntar_ia_com_contexto",
  "arguments": {
    "pergunta": "Qual erro mais crítico nestes logs?",
    "contexto": "Event ID 41, Kernel-Power, System... [cole logs completos]"
  }
}
```

**Retorno:**
```
💭 Raciocínio: [se presente]
---
Resposta da IA com análise dos logs...
📊 prompt: X tokens | resposta: Y tokens | Zms
```

### 2. Resolver Problema Passo a Passo

```javascript
{
  "name": "resolver_problema_passo_a_passo",
  "arguments": {
    "problema": "Windows Update falhando com erro 0x80070005"
  }
}
```

**Retorno:**
```
🔍 Análise do Problema

1. Identificar causa raiz do erro 0x80070005
2. Verificar permissões do Windows Update
3. Reparar componentes do Windows Update
4. Executar Windows Update novamente

✅ Solução Final
[Detalhes da solução]
```

### 3. Comparar Modelos de IA

```javascript
{
  "name": "comparar_modelos_ia",
  "arguments": {
    "pergunta": "Como otimizar SSD no Windows 11?",
    "modelos": "qwen2.5-coder:3b,llama3.1:8b,mistral:7b"
  }
}
```

**Retorno:**
```
📊 Comparação de Modelos

---
🤖 qwen2.5-coder:3b
[Resposta do modelo 1]

---
🤖 llama3.1:8b
[Resposta do modelo 2]

---
🤖 mistral:7b
[Resposta do modelo 3]
```

### 4. Analisar Código PowerShell

```javascript
{
  "name": "analisar_codigo_powershell",
  "arguments": {
    "codigo": "Get-Process | Sort-Object CPU -Descending | Select-Object -First 10"
  }
}
```

**Retorno:**
```
🔍 Análise de Código PowerShell

**Explicação:**
Este código lista os 10 processos que mais usam CPU...

**Sugestões de Melhoria:**
- Adicionar tratamento de erro
- Usar Get-Process -Name específico

**Notas de Segurança:**
- Comando seguro, apenas leitura
```

### 5. IA Sugerir Comando

```javascript
{
  "name": "ia_comando_sugerir",
  "arguments": {
    "tarefa": "Listar processos usando mais de 1GB de RAM"
  }
}
```

**Retorno:**
```
💡 Comando Sugerido

```powershell
Get-Process | Where-Object WorkingSet64 -gt 1GB | Sort-Object WorkingSet64 -Descending
```

⚠️ Importante: Revise antes de executar
```

---

## 🔗 Integrações - Webhooks

### Discord

#### Configurar Webhook no Discord
1. Canal → Configurações do Canal → Integrações
2. Webhooks → Novo Webhook
3. Copiar URL do Webhook

#### Enviar Mensagem
```javascript
{
  "name": "enviar_webhook_discord",
  "arguments": {
    "webhook_url": "https://discord.com/api/webhooks/...",
    "titulo": "Alerta de Sistema",
    "mensagem": "CPU ultrapassou 90%!",
    "cor": "ff0000"
  }
}
```

**Embed no Discord:**
```
┌─────────────────────────────┐
│ Alerta de Sistema           │
├─────────────────────────────┤
│ CPU ultrapassou 90%!        │
│                             │
│ 📅 16/08/2026 14:30         │
│ Mestre do PC V11            │
└─────────────────────────────┘
```

### Microsoft Teams

#### Configurar Webhook no Teams
1. Teams → Canal → ⋯ → Conectores
2. Webhook de Entrada → Configurar
3. Copiar URL

#### Enviar Mensagem
```javascript
{
  "name": "enviar_webhook_teams",
  "arguments": {
    "webhook_url": "https://outlook.office.com/webhook/...",
    "titulo": "Alerta de Sistema",
    "mensagem": "Disco quase cheio (95%)",
    "tema": "Danger"
  }
}
```

**Temas Disponíveis:**
- `Information` (azul)
- `Warning` (laranja)
- `Danger` (vermelho)
- `Success` (verde)

### Slack

#### Configurar Webhook no Slack
1. Slack → Apps → Incoming Webhooks
2. Ativar e adicionar novo
3. Copiar URL

#### Enviar Mensagem
```javascript
{
  "name": "enviar_webhook_slack",
  "arguments": {
    "webhook_url": "https://hooks.slack.com/services/...",
    "mensagem": "🚨 Alerta: RAM em 95%",
    "canal": "#monitoramento",
    "emoji": ":warning:"
  }
}
```

---

## 🎯 Monitoramento Automático

### Monitorar e Enviar Alertas

```javascript
{
  "name": "monitorar_e_notificar",
  "arguments": {
    "webhook_url": "https://discord.com/api/webhooks/...",
    "cpu_limite": 80,
    "ram_limite": 80,
    "disco_limite": 90,
    "plataforma": "discord"
  }
}
```

**Comportamento:**
- Verifica CPU, RAM e Disco
- Envia alerta apenas se ultrapassar limites
- Retorna "Sistema dentro dos limites" se OK

**Exemplo de Alerta:**
```
🚨 Alerta de Sistema
PC: DESKTOP-JEAN

⚠️ CPU: 92% (limite: 80%)
⚠️ RAM: 87% usada (limite: 80%)

Data: 16/08/2026 14:30:00
```

---

## 📋 Auditoria e Logs

### Consultar Logs de Auditoria

```javascript
{
  "name": "consultar_logs_auditoria",
  "arguments": {
    "level": "SECURITY",
    "action": "webhook",
    "limit": 20
  }
}
```

**Níveis de Log:**
- `INFO` - Informações gerais
- `WARNING` - Avisos
- `ERROR` - Erros
- `SECURITY` - Eventos de segurança
- `COMMAND_EXEC` - Execução de comandos
- `IA_OPERATION` - Operações de IA
- `WEBHOOK` - Envio de webhooks

**Retorno:**
```
📋 Logs de Auditoria (5 entradas)

🟢 [WEBHOOK] discord_webhook_send
   🕐 16/08/2026 14:30:00
   👤 Usuário: system

🔴 [ERROR] execute_launcher_command_failed
   🕐 16/08/2026 14:25:00
   👤 Usuário: system
```

### Exportar Relatório de Auditoria

```javascript
{
  "name": "exportar_relatorio_auditoria",
  "arguments": {
    "start_date": "2026-08-01T00:00:00Z",
    "end_date": "2026-08-16T23:59:59Z",
    "limit": 100
  }
}
```

**Retorno:** Relatório em Markdown formatado

---

## 🔧 Comandos Úteis

### Validar Scripts
```powershell
.\validate-v11.ps1 -Verbose
```

### Executar Testes MCP
```powershell
cd mcp-server
npm test
```

### Verificar Sintaxe JavaScript
```powershell
cd mcp-server
node --check index.js
```

---

## 📊 Variáveis de Ambiente

| Variável | Valor Padrão | Descrição |
|----------|--------------|-----------|
| `MESTRE_AUDIT_LOG_DIR` | `logs/audit` | Diretório dos logs |
| `MESTRE_BASE_URL` | `http://127.0.0.1:7777` | URL do Launcher |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | URL do Ollama |
| `OLLAMA_API_KEY` | - | API Key (cloud) |
| `OLLAMA_MODEL` | `qwen2.5-coder:3b-instruct` | Modelo padrão |
| `OLLAMA_MODEL_PROFILE` | `balanced` | Perfil (fast/balanced/agent/coding/reasoning) |
| `OLLAMA_NUM_CTX` | `8192` | Contexto máximo |
| `OLLAMA_TEMPERATURE` | `0.7` | Criatividade (0-2) |

### Configurar Variáveis

```powershell
# PowerShell (sessão atual)
$env:OLLAMA_MODEL_PROFILE = "agent"
$env:OLLAMA_NUM_CTX = "16384"

# PowerShell (permanente)
[System.Environment]::SetEnvironmentVariable(
    "OLLAMA_MODEL_PROFILE", 
    "agent", 
    "User"
)
```

---

## 🐛 Solução de Problemas

### Launcher não inicia
```powershell
# Verificar se porta 7777 está ocupada
netstat -ano | findstr :7777

# Matar processo antigo
taskkill /F /PID <PID>
```

### MCP Server falha
```powershell
# Verificar sintaxe
cd mcp-server
node --check index.js

# Reinstalar dependências
npm ci
```

### Ollama offline
```powershell
# Verificar se está rodando
netstat -ano | findstr :11434

# Iniciar Ollama
ollama serve
```

### Webhook falha
- Verificar URL do webhook
- Testar conectividade: `Invoke-WebRequest <URL>`
- Verificar logs de auditoria

---

## 📞 Suporte

- **Documentação Completa**: `README-V11.md`
- **Changelog**: `CHANGELOG-V11.md`
- **Resumo Executivo**: `RESUMO-EXECUTIVO-V11.md`
- **Security**: `SECURITY.md`

---

**Mestre do PC V11** - Desenvolvido por JEAN  
*Versão: 11.0.0 | Agosto 2026*

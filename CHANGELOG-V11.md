# Mestre do PC V11 - Changelog

## Versão 11.0.0 - Atualização Completa

### 🎯 Visão Geral

O Mestre do PC V11 traz melhorias significativas em todas as áreas do sistema, com foco em:
- **IA Avançada**: RAG, Chain-of-Thought, comparação de modelos
- **Integrações**: Discord, Teams, Slack via webhooks
- **Segurança**: Sistema completo de logs de auditoria
- **Novas Operações**: +33 comandos PowerShell em áreas críticas

---

## 📦 Novas Funcionalidades

### 1. Operações PowerShell (+33 novas)

#### Backup
- `backup_registro_completo` - Backup completo do registro do Windows
- `backup_drivers_instalados` - Exporta todos os drivers instalados
- `backup_lista_de_programas_instalados` - Lista de software em arquivo texto
- `backup_configuracao_de_rede` - Backup de configurações de rede
- `backup_chaves_de_registro_especificas` - Backup de chaves específicas

#### Monitoramento de Temperatura
- `temperatura_cpu_leitura_direta` - Lê temperatura da CPU via WMI
- `temperatura_monitoramento_continuo` - Monitora por 10 leituras (5s cada)
- `monitorar_temperatura_gpu` - Tenta ler temperatura da GPU
- `alerta_temperatura_alta` - Alerta sonoro se CPU > 85°C

#### Drivers
- `driver_listar_todos_instalados` - Lista completa de drivers
- `driver_atualizar_via_windows_update` - Busca atualizações de drivers
- `driver_reinstalar_dispositivo` - Reinstala driver por nome
- `driver_rollback_versao_anterior` - Rollback de driver
- `driver_exportar_lista_completa` - Exporta lista em CSV

#### Apps UWP (Windows Store)
- `uwp_listar_todos_apps` - Lista todos os apps UWP
- `uwp_reinstalar_todos_apps_padrao` - Reinstala apps padrão
- `uwp_reset_app_especifico` - Reset de app específico
- `uwp_limpar_cache_de_todos_apps` - Limpa cache de todos os apps
- `uwp_diagnostico_de_apps` - Diagnóstico de apps corrompidos

#### SSD
- `ssd_otimizar_trim_todos_drives` - TRIM em todos os SSDs
- `ssd_verificar_saude_completa` - Saúde completa via SMART
- `ssd_historico_de_uso` - Histórico SMART
- `ssd_alinhar_particoes` - Verifica alinhamento de partições
- `ssd_configurar_prefetch_para_ssd` - Otimiza Windows para SSD

#### Monitoramento
- `monitorar_uso_de_cpu_ram_disk` - Monitora uso em tempo real (5 leituras)

#### Relatórios
- `exportar_relatorio_completo_em_pdf` - Gera relatório HTML do sistema

#### Tarefas Agendadas
- `agendar_tarefa_de_limpeza_diaria` - Limpeza automática às 03:00

#### Integrações
- `webhook_enviar_status_para_discord` - Envia status para Discord
- `integracao_teams_enviar_notificacao` - Envia notificação para Teams

---

### 2. IA Avançada (MCP Server)

#### Novas Ferramentas de IA

| Ferramenta | Descrição |
|------------|-----------|
| `perguntar_ia_com_contexto` | RAG - IA com contexto adicional (logs, código, documentos) |
| `resolver_problema_passo_a_passo` | Chain-of-Thought para problemas complexos |
| `comparar_modelos_ia` | Compara respostas de múltiplos modelos |
| `analisar_codigo_powershell` | Análise de código com sugestões e segurança |
| `ia_comando_sugerir` | IA sugere comando PowerShell para tarefa |

#### Funções Internas Adicionadas

```javascript
// RAG - Retrieval-Augmented Generation
ragQuery(query, contextDocs)

// Chain-of-Thought
chainOfThought(problem)

// Comparação de Modelos
compareModels(query, models)

// Análise de Código PowerShell
analyzePowerShellCode(code)
```

---

### 3. Webhooks e Integrações

#### Discord Webhook
- **Ferramenta**: `enviar_webhook_discord`
- **Recursos**: Embed formatado, cor personalizada, timestamp
- **Uso**: Notificações, alertas de sistema

#### Microsoft Teams Webhook
- **Ferramenta**: `enviar_webhook_teams`
- **Recursos**: MessageCard formatado, temas (Information, Warning, Danger)
- **Uso**: Alertas corporativos

#### Slack Webhook
- **Ferramenta**: `enviar_webhook_slack`
- **Recursos**: Mensagem formatada, emoji personalizado, canal
- **Uso**: Notificações em canais

#### Monitoramento com Alertas
- **Ferramenta**: `monitorar_e_notificar`
- **Recursos**:
  - Monitora CPU, RAM, Disco
  - Envia alerta se ultrapassar limites
  - Suporta Discord, Teams, Slack

---

### 4. Sistema de Auditoria

#### Módulo `audit-logger.js`

**Níveis de Log**:
- `INFO` - Informações gerais
- `WARNING` - Avisos
- `ERROR` - Erros
- `SECURITY` - Eventos de segurança
- `COMMAND_EXEC` - Execução de comandos
- `IA_OPERATION` - Operações de IA
- `WEBHOOK` - Envio de webhooks

**Funções Exportadas**:
```javascript
auditLog(level, action, details, userId)
queryAuditLog(filters)
exportAuditReport(options)
```

**Ferramentas MCP**:
- `consultar_logs_auditoria` - Consulta logs com filtros
- `exportar_relatorio_auditoria` - Relatório em Markdown

**Recursos**:
- Rotação automática de logs (10MB, 30 arquivos)
- Sanitização de dados sensíveis
- Consultas filtradas por nível, ação, usuário, data
- Exportação em formato legível

---

## 🔧 Melhorias Técnicas

### MCP Server

#### Auditoria Integrada
- Todas as execuções de comandos são logadas
- Webhooks registram envio e falhas
- Erros são categorizados por nível de severidade

#### Security
- Sanitização de dados sensíveis nos logs
- Redaction de tokens e senhas
- Validação de parâmetros reforçada

### Performance
- Logs assíncronos não bloqueiam operações
- Rotação automática previne disco cheio
- Timeout configurável por operação

---

## 📋 Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `MESTRE_AUDIT_LOG_DIR` | `logs/audit` | Diretório dos logs de auditoria |
| `MESTRE_BASE_URL` | `http://127.0.0.1:7777` | URL do Launcher |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | URL do Ollama |
| `OLLAMA_API_KEY` | - | API key para Ollama Cloud |
| `OLLAMA_MODEL` | `qwen2.5-coder:3b-instruct` | Modelo padrão |
| `OLLAMA_MODEL_PROFILE` | `balanced` | Perfil de modelo |

---

## 🚀 Como Usar

### Exemplo: Enviar Alerta Discord

```javascript
// Via MCP
{
  "name": "enviar_webhook_discord",
  "arguments": {
    "webhook_url": "https://discord.com/api/webhooks/...",
    "titulo": "Alerta de CPU",
    "mensagem": "CPU ultrapassou 90%!",
    "cor": "ff0000"
  }
}
```

### Exemplo: Monitorar e Notificar

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

### Exemplo: Consultar Logs

```javascript
{
  "name": "consultar_logs_auditoria",
  "arguments": {
    "level": "SECURITY",
    "limit": 20
  }
}
```

### Exemplo: IA com Contexto

```javascript
{
  "name": "perguntar_ia_com_contexto",
  "arguments": {
    "pergunta": "Qual erro mais crítico?",
    "contexto": "[logs do Event Viewer aqui]"
  }
}
```

---

## 🔐 Segurança

### Logs de Auditoria
- Todos os comandos executados são registrados
- Dados sensíveis são automaticamente redactados
- Logs são rotacionados e limitados a 30 dias

### Webhooks
- URLs de webhook não são logadas em claro
- Mensagens são pré-visualizadas (primeiros 100 chars)
- Falhas são registradas com código de status

### IA
- Prompts são analisados para injection
- Contexto é sanitizado antes de envio
- Respostas são validadas

---

## 📊 Estatísticas V11

| Categoria | V10 | V11 | Mudança |
|-----------|-----|-----|---------|
| Operações PowerShell | ~80 | ~113 | +33 |
| Ferramentas MCP | ~25 | ~36 | +11 |
| Integrações | 0 | 3 | +3 |
| Logs de Auditoria | 0 | 7 níveis | +7 |

---

## 🐛 Correções

- Timeout de IA aumentado para 90s em operações RAG
- Validação de webhook URLs reforçada
- Sanitização de detalhes em logs de auditoria
- Rotação de logs previne uso excessivo de disco

---

## 📝 Notas de Migração

### Do V10 para V11

1. **Backup**: Execute `backup_registro_completo` antes de atualizar
2. **Configuração**: Adicione `MESTRE_AUDIT_LOG_DIR` se quiser customizar
3. **Webhooks**: Configure webhooks no Discord/Teams/Slack antes de usar
4. **IA**: Verifique se Ollama está rodando para funcionalidades de IA

### Compatibilidade
- ✅ Operações V10 compatíveis
- ✅ MCP tools V10 compatíveis
- ✅ Configurações existentes preservadas

---

## 🔮 Futuro (V12)

- [ ] Suporte a Azure Functions como webhook
- [ ] Integração com AWS Lambda
- [ ] Dashboard web em tempo real
- [ ] Gráficos de histórico de métricas
- [ ] Alertas por e-mail (SMTP)
- [ ] Criptografia de logs sensíveis

---

**Mestre do PC V11** - Desenvolvido por JEAN

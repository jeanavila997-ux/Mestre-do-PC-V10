# ✅ Checklist de Implantação - Mestre do PC V11

## 📋 Pré-Implantação

### [ ] 1. Backup do Sistema Atual
- [ ] Executar `backup_registro_completo`
- [ ] Executar `backup_drivers_instalados`
- [ ] Executar `backup_configuracao_de_rede`
- [ ] Exportar lista de programas instalados

**Comandos:**
```powershell
# Via UI ou MCP
.\MestreDoPC-Launcher.ps1
# Selecionar: "Backup Completo do Registro"
# Selecionar: "Backup de Drivers Instalados"
```

---

### [ ] 2. Validar Instalação V11

#### 2.1 Validar Scripts PowerShell
```powershell
cd C:\Users\Jeanc\Mestre-do-PC-V10-clean
.\validate-v11.ps1 -Verbose
```
**Esperado:** ✅ 100% dos scripts validados

#### 2.2 Executar Testes MCP
```powershell
cd mcp-server
npm test
```
**Esperado:** ✅ 40 testes passando

#### 2.3 Validar Sintaxe JavaScript
```powershell
cd mcp-server
node --check index.js
node --check audit-logger.js
```
**Esperado:** ✅ Sem erros de sintaxe

---

### [ ] 3. Verificar Requisitos do Sistema

#### 3.1 PowerShell
```powershell
$PSVersionTable.PSVersion
```
**Mínimo:** 5.1 | **Recomendado:** 7.x

#### 3.2 Node.js
```powershell
node --version
```
**Mínimo:** v20.x

#### 3.3 Espaço em Disco
```powershell
Get-PSDrive C | Select-Object Used,Free
```
**Mínimo:** 10GB livres

#### 3.4 Ollama (Opcional)
```powershell
# Verificar se está rodando
netstat -ano | findstr :11434
```
**Status:** Opcional para funcionalidades de IA

---

## 🚀 Implantação

### [ ] 4. Instalar/Atualizar V11

#### 4.1 Parar Versão Antiga
```powershell
# Parar Launcher antigo
Get-Process MestreDoPC-Launcher -ErrorAction SilentlyContinue | Stop-Process -Force

# Parar MCP Server
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "mcp-server" } | Stop-Process -Force
```

#### 4.2 Atualizar Arquivos
```powershell
# Se usando Git
cd C:\Users\Jeanc\Mestre-do-PC-V10-clean
git pull origin main

# Ou copiar arquivos manualmente
# Substituir todos os arquivos exceto logs/
```

#### 4.3 Instalar Dependências
```powershell
cd mcp-server
npm ci
```

---

### [ ] 5. Configurar Variáveis de Ambiente

#### 5.1 Variáveis Obrigatórias
```powershell
# Sessão atual
$env:MESTRE_PROJETO_PATH = "C:\Users\Jeanc\Mestre-do-PC-V10-clean"
$env:MESTRE_AUDIT_LOG_DIR = "C:\Users\Jeanc\Mestre-do-PC-V10-clean\logs\audit"

# Permanente (nível usuário)
[System.Environment]::SetEnvironmentVariable(
    "MESTRE_PROJETO_PATH",
    "C:\Users\Jeanc\Mestre-do-PC-V10-clean",
    "User"
)
```

#### 5.2 Variáveis Opcionais (IA)
```powershell
# Se usar Ollama Cloud
$env:OLLAMA_API_KEY = "sua-api-key"
$env:OLLAMA_MODEL = "qwen2.5-coder:3b-instruct"

# Se usar perfil específico
$env:OLLAMA_MODEL_PROFILE = "balanced"
```

---

### [ ] 6. Configurar Integrações

#### 6.1 Discord Webhook
- [ ] Criar webhook no Discord
- [ ] Testar envio
- [ ] Salvar URL em local seguro

**Teste:**
```javascript
{
  "name": "enviar_webhook_discord",
  "arguments": {
    "webhook_url": "SEU_WEBHOOK_AQUI",
    "titulo": "Teste V11",
    "mensagem": "Implantação V11 iniciada!",
    "cor": "00ff00"
  }
}
```

#### 6.2 Teams Webhook (Opcional)
- [ ] Criar webhook no Teams
- [ ] Testar envio

#### 6.3 Slack Webhook (Opcional)
- [ ] Criar webhook no Slack
- [ ] Testar envio

---

### [ ] 7. Iniciar Serviços

#### 7.1 Iniciar Launcher (Admin)
```powershell
# Terminal como Administrador
cd C:\Users\Jeanc\Mestre-do-PC-V10-clean
.\MestreDoPC-Launcher.ps1
```

**Verificar:**
- [ ] Porta 7777 ouvindo
- [ ] Interface acessível em http://127.0.0.1:7777/

#### 7.2 Iniciar MCP Server
```powershell
# Outro terminal
cd mcp-server
npm start
```

**Verificar:**
- [ ] Sem erros de inicialização
- [ ] Ferramentas MCP registradas

---

## ✅ Pós-Implantação

### [ ] 8. Testes Funcionais

#### 8.1 Operações Básicas
- [ ] Executar "Verificar Espaço em Disco"
- [ ] Executar "Ver Uso Atual de RAM"
- [ ] Executar "Listar Processos Ativos"

#### 8.2 Novas Operações V11
- [ ] Testar "Temperatura CPU (Leitura Direta)"
- [ ] Testar "Backup de Drivers Instalados"
- [ ] Testar "SSD Verificar Saúde Completa"
- [ ] Testar "UWP Diagnóstico de Apps"

#### 8.3 Funcionalidades IA (Se Ollama ativo)
- [ ] Testar "Perguntar IA"
- [ ] Testar "Perguntar IA com Contexto"
- [ ] Testar "IA Comando Sugerir"

#### 8.4 Integrações
- [ ] Testar "Enviar Webhook Discord"
- [ ] Testar "Monitorar e Notificar"

#### 8.5 Auditoria
- [ ] Executar "Consultar Logs de Auditoria"
- [ ] Verificar logs sendo criados em `logs/audit/`

---

### [ ] 9. Testes de Stress

#### 9.1 Múltiplas Operações
```powershell
# Executar 5 operações simultâneas via UI
# Verificar se launcher gerencia fila corretamente
```

#### 9.2 Webhooks sob Carga
```javascript
// Enviar 10 webhooks em sequência
// Verificar rate limiting do Discord/Teams
```

#### 9.3 Logs de Auditoria
- [ ] Executar 20 operações
- [ ] Verificar se logs estão sendo rotacionados
- [ ] Consultar relatório de auditoria

---

### [ ] 10. Validação Final

#### 10.1 Checklist Funcional
- [ ] Todas as operações V10 funcionam
- [ ] Todas as novas operações V11 funcionam
- [ ] Webhooks enviando corretamente
- [ ] Logs de auditoria registrados
- [ ] IA respondendo (se configurada)

#### 10.2 Checklist Segurança
- [ ] Origem validada no Launcher
- [ ] Tokens/Credenciais não logados
- [ ] Prompt injection detectado
- [ ] Comandos restritos ao allowed-operations.json

#### 10.3 Checklist Performance
- [ ] Launcher responde em < 2s
- [ ] MCP Server inicializa em < 5s
- [ ] Webhooks enviam em < 3s
- [ ] Logs não ocupam > 100MB

---

## 📊 Critérios de Aceite

### ✅ Implantação Aprovada Se:
- [x] 100% dos testes passando
- [x] 100% dos scripts validados
- [x] Todas as operações básicas funcionais
- [x] Webhooks testados e aprovados
- [x] Logs de auditoria operacionais
- [x] Nenhum erro crítico nos logs

### ⚠️ Implantação Reprovada Se:
- [ ] Erros de sintaxe JavaScript/PowerShell
- [ ] Testes falhando
- [ ] Webhooks não enviam
- [ ] Logs não são criados
- [ ] Operações críticas falham

---

## 🔄 Rollback (Se Necessário)

### Procedimento de Rollback
```powershell
# 1. Parar V11
Get-Process MestreDoPC-Launcher -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "mcp-server" } | Stop-Process -Force

# 2. Restaurar backup do registro
reg import "C:\Users\Jeanc\MestrePC-Backups\registry-backup-YYYYMMDD-HHMMSS.reg"

# 3. Restaurar versão anterior
cd C:\Users\Jeanc\Mestre-do-PC-V10-clean
git checkout <commit-anterior>

# 4. Reiniciar serviços
.\MestreDoPC-Launcher.ps1
```

---

## 📝 Documentação da Implantação

### Registrar Informações
- [ ] Data da implantação
- [ ] Responsável
- [ ] Versão implantada
- [ ] Issues encontradas
- [ ] Soluções aplicadas

**Modelo:**
```markdown
## Implantação V11

**Data:** 16/08/2026  
**Responsável:** JEAN  
**Versão:** 11.0.0  

### Issues
- Nenhum problema crítico

### Observações
- Implantação bem-sucedida
- Todos os testes passaram
```

---

## 🎯 Próximos Passos

Após implantação bem-sucedida:

1. [ ] Monitorar logs por 24h
2. [ ] Coletar feedback dos usuários
3. [ ] Planejar V12 (roadmap)
4. [ ] Documentar lições aprendidas

---

**Status da Implantação:** ⏳ Em Andamento  
**Última Atualização:** 16/08/2026

---

**Mestre do PC V11** - Desenvolvido por JEAN

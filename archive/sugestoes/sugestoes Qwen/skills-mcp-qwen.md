# Integração MCP - Qwen Code

## Visão Geral

Esta documentação descreve a integração do **Mestre do PC V11** com o **Qwen Code** via **MCP (Model Context Protocol)**.

---

## 📋 Configuração Realizada

### Servidor MCP

```json
{
  "nome": "mestre-do-pc",
  "transporte": "stdio",
  "comando": "node C:\\Users\\Jeanc\\Mestre-do-PC-V10-clean\\mcp-server\\index.js",
  "escopo": "usuário (todos os projetos)",
  "status": "✅ Conectado"
}
```

### Comando de Instalação

```bash
qwen mcp add --scope user --transport stdio mestre-do-pc node C:\Users\Jeanc\Mestre-do-PC-V10-clean\mcp-server\index.js
```

### Verificação

```bash
qwen mcp list
# Saída esperada:
# ✓ mestre-do-pc: node C:\Users\Jeanc\Mestre-do-PC-V10-clean\mcp-server\index.js (stdio) - Connected
```

---

## 🛠️ Ferramentas Disponíveis (68)

O servidor MCP expõe as seguintes categorias de ferramentas para o Qwen Code:

### 1. Diagnóstico e Monitoramento
- `diagnostico_completo` - Triagem completa do PC
- `diagnostico_rede` - Configuração de rede
- `verificar_espaco_disco` - Espaço em disco
- `ver_uso_ram` - Memória RAM livre/total
- `listar_processos_alto_consumo_ram` - Top 15 processos por RAM
- `verificar_temperatura_cpu` - Temperatura do processador
- `verificar_saude_disco` - S.M.A.R.T. do disco

### 2. Limpeza e Manutenção
- `limpeza_rapida_completa` - Limpa temporários e lixeira
- `liberar_memoria_ram` - Garbage Collector do .NET
- `esvaziar_lixeira` - Esvazia lixeira permanentemente
- `limpar_cache_npm/pip/thumbnail/windows_update`

### 3. Reparos do Sistema
- `reparar_arquivos_sfc` - System File Checker
- `reparar_imagem_dism` - DISM restore health
- `renovar_ip` - Flush DNS + release/renew
- `reiniciar_explorer` - Reinicia explorer.exe

### 4. Gerenciamento de Pacotes
- `instalar_pacote_npm_global` / `desinstalar_pacote_npm_global`
- `instalar_pacote_pip` / `desinstalar_pacote_pip`
- `auditar_seguranca_npm` - npm audit
- `verificar_dependencias_desatualizadas_npm` - npm outdated

### 5. IA e Modelos
- `perguntar_ia` - Ollama local ou cloud
- `perguntar_ia_com_contexto` - RAG com contexto
- `comparar_modelos_ia` - Multi-model comparison
- `transcrever_audio` - Whisper via Ollama
- `verificar_prompt` - Detecção de prompt injection
- `listar_modelos_ollama` - Modelos disponíveis
- `definir_perfil_modelo` - fast, balanced, agent, coding, reasoning

### 6. Segurança
- `verificar_defender` - Status Windows Defender
- `scan_defender_rapido` - Quick scan
- `verificar_execution_policy` - PowerShell policies

### 7. Automação e Webhooks
- `enviar_webhook_discord`
- `enviar_webhook_slack`
- `enviar_webhook_teams`
- `buscar_na_web` - DuckDuckGo search
- `consultar_fonte_oficial_gov` - Domínios .gov.br, .usp.br, .embrapa.br

### 8. Git e Projetos
- `git_status`
- `git_pull`
- `gerar_snapshot_git` - Commit automatizado

### 9. Sistema e Ambiente
- `listar_variaveis_de_ambiente`
- `listar_variaveis_de_ambiente_path`
- `verificar_versao_node/python/pip`
- `verificar_informacoes_sistema`

### 10. Auditoria
- `consultar_logs_auditoria`
- `exportar_relatorio_auditoria`
- `analisar_logs_sistema` - Event Viewer últimos 20 erros

---

## 🚀 Como Usar no Qwen Code

### Exemplos de Comandos

```
Use diagnosticar_completo para verificar meu PC
```

```
Listar processos que mais consomem RAM
```

```
Perguntar à IA: como otimizar o uso de memória no Windows?
```

```
Enviar webhook para Discord: "Deploy concluído!"
```

```
Verificar espaço em disco e esvaziar lixeira se necessário
```

---

## 📁 Arquitetura

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────────┐
│   Qwen Code     │────▶│  MCP Server (stdio)  │────▶│  MestreDoPC Launcher    │
│   (IDE/Editor)  │     │  mcp-server/index.js │     │  (porta 7777)           │
└─────────────────┘     └──────────────────────┘     └─────────────────────────┘
         │                          │                          │
         │                          │                          ▼
         │                          │                ┌─────────────────┐
         │                          │                │ PowerShell Jobs │
         │                          │                │ (elevados)      │
         │                          │                └─────────────────┘
         ▼                          ▼
   68 ferramentas MCP         Security.js              allowed-operations.json
   discovery via stdio        (sanitização)            (whitelist)
```

---

## 🔐 Segurança

1. **Whitelist de operações**: `allowed-operations.json` define comandos permitidos
2. **Sanitização**: `security.js` valida argumentos e detecta prompt injection
3. **Auditoria**: Todos as chamadas são logadas em `logs/audit/`
4. **Separação de privilégios**:
   - MCP server roda **não elevado**
   - Launcher executa comandos **elevados** via HTTP (porta 7777)

---

## 📝 Variáveis de Ambiente

| Variável | Significado |
|---|---|
| `MESTRE_PROJETO_PATH` | Caminho raiz do projeto |
| `MESTRE_BASE_URL` | Base do launcher (padrão: `http://127.0.0.1:7777`) |
| `OLLAMA_URL` | URL do Ollama (padrão: `http://127.0.0.1:11434`) |
| `OLLAMA_API_KEY` | Ativa modo cloud |
| `OLLAMA_MODEL_PROFILE` | Perfil ativo (fast, balanced, agent, coding, reasoning) |

---

## 🔄 Fluxo de uma Chamada MCP

1. **Qwen Code** recebe solicitação do usuário
2. **MCP Client** descobre ferramentas via `tools/list`
3. **Usuário** solicita ação (ex: "verificar disco")
4. **MCP Client** chama `tools/call` com `mcp__mestre-do-pc__verificar_espaco_disco`
5. **MCP Server** (`mcp-server/index.js`):
   - Valida argumentos (`sanitizeToolArgument`)
   - Detecta prompt injection (`checkPromptInjection`)
   - Log de auditoria (`auditLog`)
   - Chama launcher via `POST http://127.0.0.1:7777/run`
6. **Launcher** executa comando whitelistado via PowerShell job
7. **Resposta** retorna através da cadeia

---

## 🛠️ Troubleshooting

### Servidor MCP aparece como "Disconnected"

```bash
# Verificar se o servidor está rodando
qwen mcp list

# Se disconnected, verificar se o Node.js está acessível
node --version

# Reiniciar o Qwen Code para re-descobrir servidores
```

### Launcher na porta 7777 não responde

```bash
# Verificar se a porta está em uso
netstat -ano | findstr :7777

# Se necessário, reiniciar o launcher
cd Mestre-do-PC-V10-clean\v10
npm start
```

### Ferramentas não aparecem

1. Reinicie o Qwen Code
2. Verifique `/mcp` para ver status do servidor
3. Confira se `mcp-server/index.js` tem sintaxe válida:
   ```bash
   node --check Mestre-do-PC-V10-clean\mcp-server\index.js
   ```

---

## 📚 Próximos Passos

- [ ] Adicionar mais ferramentas de diagnóstico específico
- [ ] Integrar com outros LLMs (Claude, GPT-4, etc.)
- [ ] Criar menu "MCP" na UI do Mestre do PC
- [ ] Adicionar suporte a webhooks personalizados
- [ ] Expandir catálogo de operações permitidas

---

## 📞 Suporte

- **Documentação principal**: `Mestre-do-PC-V10-clean\README.md`
- **AGENTS.md**: Diretrizes para agentes de código
- **Pasta logs**: `Mestre-do-PC-V10-clean\logs\audit\`

---

*Última atualização: 2026-08-23*
*Integração realizada por: Qwen Code*

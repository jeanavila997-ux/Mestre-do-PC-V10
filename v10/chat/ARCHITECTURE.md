# Arquitetura do Chat IA do Mestre do PC

## Visao geral

O chat de IA e um componente client-side que se comunica exclusivamente com o launcher local (`v10/launcher.js`) na porta `7777`. O launcher faz o papel de proxy e executor, isolando o navegador do Ollama e do PowerShell.

```text
+-------------+      HTTP (mesma origem)      +----------------+      HTTP/local     +-----------+
|  Navegador  |  ---------------------------->  |  Launcher      |  -------------->  |  Ollama   |
|  (chat UI)  |  /ollama/chat, /classify, /run  |  127.0.0.1:7777|                   |  :11434   |
+-------------+                                +----------------+                   +-----------+
                                                      |
                                                      v
                                               +-------------+
                                               |  PowerShell |
                                               |  (jobs)     |
                                               +-------------+
```

## Endpoints utilizados

### 1. `GET /ping`
Verifica se o launcher esta ativo.

**Resposta:**
```json
{ "status": "ok", "admin": true, "state": "idle", "activeJobs": 0, "version": "10.1.0", "pid": 1234 }
```

### 2. `GET /status`
Retorna metricas do sistema.

**Resposta:**
```json
{ "cpu": 12.5, "ramFree": 4.2, "ramTotal": 16.0, "diskFree": 120.0, "diskUsed": 350.0, "uptimeSec": 3600 }
```

### 3. `GET /ollama/tags`
Lista modelos disponiveis no Ollama.

**Resposta:**
```json
{ "models": [{ "name": "qwen2.5-coder:3b-instruct" }] }
```

### 4. `POST /ollama/chat`
Envia mensagens para o Ollama via proxy do launcher, com streaming NDJSON.

**Corpo:**
```json
{
  "model": "qwen2.5-coder:3b-instruct",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "stream": true,
  "keep_alive": "10m"
}
```

**Resposta:** stream de objetos JSON:
```ndjson
{"message":{"content":"Olá"}}
{"message":{"content":"!"}}
{"done":true}
```

**Seguranca:** o launcher executa `checkPromptInjection()` sobre a ultima mensagem do usuario. Se classificado como `malicioso`, retorna HTTP 400 e bloqueia.

### 5. `POST /classify`
Verifica se um comando esta na whitelist sem executa-lo.

**Corpo:**
```json
{ "cmd": "Stop-Process -Name notepad -Force" }
```

**Resposta:**
```json
{ "allowed": true, "destructive": false, "id": "encerrar_processo", "title": "Encerrar processo", "category": "Sistema", "cmd": "..." }
```

### 6. `POST /run`
Executa um comando PowerShell aprovado via job.

**Corpo:**
```json
{ "cmd": "Stop-Process -Name notepad -Force" }
```

**Resposta:**
```json
{ "success": true, "accepted": true, "jobId": "uuid", "state": "running" }
```

### 7. `GET /run-status?id=<jobId>`
Consulta o andamento de um job.

**Resposta:**
```json
{ "jobId": "uuid", "state": "completed", "success": true, "exitCode": 0, "output": "..." }
```

## Fluxos principais

### Envio de mensagem (`sendIA`)

1. Usuario digita mensagem e pressiona Enter
2. Mensagem do usuario e exibida na UI
3. Anexos ativos sao convertidos em contexto (`buildContextPrompt`)
4. Historico + system prompt sao montados
5. `POST /ollama/chat` e chamado com streaming
6. Resposta e renderizada com suporte a Markdown basico
7. Blocos de codigo PowerShell ganham botao "▶ Executar"

### Execucao de comando sugerido pela IA (`runIACmd`)

1. Usuario clica em "▶ Executar" em um bloco de codigo
2. `POST /classify` verifica se o comando esta na whitelist
3. Se nao estiver: modal de bloqueio com opcao de copiar
4. Todo comando permitido exibe um modal de confirmacao explicita
5. Operacoes destrutivas recebem aviso reforcado no mesmo modal
6. Somente apos a confirmacao o chat envia `POST /run`
7. Job e polling via `GET /run-status`
8. Output e adicionado ao painel de output e ao historico

### Anexos de contexto (`attachContext`)

O usuario pode anexar contexto a mensagem atual:

- `dashboard` — metricas de `/status`
- `models` — lista de modelos Ollama
- `memory` — top processos por RAM
- `files` — arquivo de texto selecionado
- `terminal` — ultimo output do terminal
- `app` — informacoes do launcher
- `image` — imagem em base64 para modelos de visao

### Memórias (`Memories`)

Memórias persistentes sao armazenadas no IndexedDB (`MestreDoPC_V10` -> `memories`) com fallback para `localStorage`. Podem ser ativadas para injetar contexto no proximo prompt.

## Variaveis de ambiente relevantes

| Variavel | Efeito |
|---|---|
| `OLLAMA_URL` | URL base do Ollama (padrao `http://127.0.0.1:11434`) |
| `OLLAMA_MODEL` | Modelo padrao |
| `OLLAMA_MODEL_PROFILE` | Perfil ativo (`fast`, `balanced`, `agent`, `coding`, `reasoning`) |
| `OLLAMA_API_KEY` | Ativa modo cloud |

## Confianca e limites

- Maximo de 100 mensagens persistidas em `localStorage`
- Maximo de 200 entradas no historico de comandos
- Maximo de 100 entradas no historico de outputs
- Timeout de 15 minutos para jobs PowerShell
- Limite de 3 jobs simultaneos

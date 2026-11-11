# DeepSeek Harness (dsh) — integração nativa

O [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) (`@deepseek-ai/dsh@0.2.2-rc.1`, MIT) embutido no Mestre do PC como **último elo da cascata de provedores**: o launcher lança o `dsh` em modo headless, lê o NDJSON do stdout e devolve texto e tentativas para o job — sob a mesma autorização, auditoria e isolamento do resto do launcher.

> Escopo: o `dsh` é um **harness de agentes completo** (tools, sessões, sandbox), não uma lib de chat. Não tem REST `/v1/chat/completions`, não tem OpenAPI e não tem MCP server — a única integração possível é **lançar o processo** e ler o que ele imprime.

**Developer preview.** O README do pacote avisa que a compatibilidade vai quebrar entre releases. A versão fica pinada em `DSH_VERSION` (`v10/dsh-bridge.js`) e no `npx`; subir de versão é decisão consciente, não `latest`.

---

## O que é e por que existe no Mestre

O Mestre já fala com vários provedores (Grok, 9Router, OpenCode, Ollama). O `dsh` entra como **runner de tarefas longas**: em vez de um único turno de chat, ele abre sessão, usa ferramentas no workspace, executa shell e só então responde. Quando o chat normal não resolve — tarefa multi-passo, edição de arquivos, investigação dentro do projeto — `/dsh/run` aciona esse runner; se o provedor estiver sem credencial ou fora do ar, a cascata desce um degrau em vez de falhar de imediato.

---

## Arquitetura da integração

```
chat / mobile / extensão / curl
        │  HTTP + X-Mestre-Client (+ token quando exigido)
        ▼
v10/launcher.js  ──►  dsh-routes  ──►  dsh-bridge  ──►  npx -y @deepseek-ai/dsh@0.2.2-rc.1
  (127.0.0.1:7777)      │                  │                  headless --patch <yml> --json "<task>"
                        │                  │                        │
                        │                  │                        └─ NDJSON no stdout
                        │                  │                           session · text · thinking
                        │                  │                           tool_call · tool_result · final
                        │                  ├─ patch do provedor por tentativa (%DSH_HOME%\patches)
                        │                  └─ auditLog(SECURITY, "dsh_run")
                        └─ jobId + polling (GET /dsh/job?id=)
```

Três camadas, cada uma com um papel só:

| Camada | Papel |
|---|---|
| `v10/dsh-routes.js` | Três rotas, autorização igual à de `/run`, job assíncrono, teto de concorrência e retenção em memória. Não conhece o dsh. |
| `v10/dsh-bridge.js` | Valida entrada e `cwd`, monta a linha de comando, grava o patch do provedor, percorre a cascata, limita a saída e audita. |
| processo `dsh` | Roda a tarefa e devolve eventos; a ponte só extrai `text`, `sessionId` e o `final`. |

O patch do provedor é regravado **antes de cada tentativa** (`%DSH_HOME%\patches\<provedor>.yml`), porque a cascata troca de endpoint no meio do caminho. A chave nunca vai no arquivo: o patch guarda só o **nome** da variável (`apiKeyEnv`) e o valor entra pelo ambiente do processo filho.

---

## Rotas HTTP

Mesma autorização de `/run` (`X-Mestre-Client` + token quando exigido), `Cache-Control: no-store`, `OPTIONS` → `204`.

| Rota | Entrada | Resposta |
|---|---|---|
| `GET /dsh/status` | — | `{ ok, installed, mode, version, home, providers[], timeoutMs, retryRounds, patchDir }` |
| `POST /dsh/run` | `{ task, cwd?, provider?, timeoutMs?, retry? }` | `202 { ok, accepted:true, jobId, state:"queued" }` |
| `GET /dsh/job?id=` | — | `{ id, state, startedAt, finishedAt, result?, error? }` |

Estados do job: `queued` → `running` → `completed` \| `failed`. Retenção de 30 min; no máximo **2 jobs** ativos por vez.

```powershell
# POST /dsh/run → 202
$job = Invoke-RestMethod http://127.0.0.1:7777/dsh/run -Method Post `
  -Headers @{ 'X-Mestre-Client'='v10-web' } -ContentType 'application/json' `
  -Body '{"task":"liste os arquivos da raiz do projeto"}'
$job.jobId

# GET /dsh/job?id=… → 200 (terminado, com sucesso)
# {
#   "id": "8f2c…",
#   "state": "completed",
#   "startedAt": 1762800000000,
#   "finishedAt": 1762800042000,
#   "result": {
#     "ok": true,
#     "provider": "grok",
#     "model": "grok-4.7",
#     "text": "…",
#     "sessionId": "…",
#     "attempts": [ { "provider": "grok", "ok": true, "code": 0, "ms": 41230, "reasonKind": "completed" } ],
#     "ms": 41230
#   }
# }
```

**Exit code 0 sozinho não basta.** A ponte só aceita o resultado quando, além de `code === 0`, o último evento `final` traz `reason.kind === "completed"` — o dsh pode sair 0 depois de abortar a tarefa, e o job vira `failed` com o motivo real.

Erros seguem o padrão da casa:

| Status | Quando |
|---|---|
| `403` | sem `X-Mestre-Client` / token inválido |
| `400` | JSON inválido, `task` vazia ou > 8000 caracteres, `cwd` relativo/com `..`/de sistema/fora das raízes/inexistente |
| `429` | já há 2 jobs `queued` ou `running` |
| `404` | `id` desconhecido em `/dsh/job` |

---

## Cascata de provedores e retry

Ordem fixa, do topo para baixo; quem não tem credencial é **pulado**, não é tentado:

| # | Provedor | Credencial | Endpoint | Modelo |
|---|---|---|---|---|
| 1 | `grok` | `XAI_API_KEY` | `https://api.x.ai/v1` | `grok-4.7` |
| 2 | `9router` | `NINEROUTER_API_KEY` | `http://127.0.0.1:20128/v1` | `gcli/grok-4.7-build-fast` |
| 3 | `opencode` | `OPENCODE_API_KEY` | `https://opencode.ai/zen/v1` | (quem escolhe é o dsh) |
| 4 | `opencode-go` | `OPENCODE_GO_API_KEY` | `https://opencode.ai/inference/go/openai/v1` | `kimi-k2.7-code` |
| 5 | `ollama` | — (local) | `http://127.0.0.1:11434/v1` | `qwen2.5-coder:3b-instruct` |
| 6 | `deepseek` | `DEEPSEEK_API_KEY` | `https://api.deepseek.com/v1` | `deepseek-chat` |

| Regra | Valor | Variável |
|---|---|---|
| Timeout **por tentativa** | `300000` ms (30 s–30 min) | `MPC_DSH_TIMEOUT_MS` |
| Rodadas extras da cadeia inteira | `2` | `MPC_DSH_RETRY_ROUNDS` |
| Espera entre rodadas | `300000` ms | — (fixo) |
| Saída guardada | ~2 MiB e 200 eventos | — (fixo) |
| Jobs simultâneos | `2` | — (fixo) |

- Rodada extra só acontece com **`retry: true`** no corpo: sem isso é uma passada pela cadeia e o job termina `failed`.
- Cada rodada recomeça do **topo** da cadeia (não retoma do degrau onde parou).
- Sem nenhuma credencial configurada, a cadeia cai no Ollama local; se ele também estiver fora do ar, o job termina `failed` com o erro da última tentativa depois de uma passada completa.
- Toda tentativa entra em `attempts[]` com `provider`, `code`, `ms` e `reasonKind`; a mensagem de erro da última é a que o job devolve.

---

## Configuração

`DSH_HOME` é o diretório onde o dsh guarda perfil, plugins, patches, sessões e credenciais. Nesta integração ele **não** é o `~/.dsh` do usuário: cada instalação do Mestre aponta para um home próprio, e é isso que torna config e telemetria previsíveis.

| Variável | Default | Nota |
|---|---|---|
| `MPC_DSH_HOME` | `%LOCALAPPDATA%\MestreDoPC\dsh-home` | vira `DSH_HOME` no processo filho |
| `MPC_DSH_TIMEOUT_MS` | `300000` | timeout por tentativa (30 s–30 min) |
| `MPC_DSH_RETRY_ROUNDS` | `2` | rodadas extras quando `retry: true` (0–5) |
| `MPC_DSH_ALLOWED_ROOTS` | — | raízes extras de `cwd`, separadas por `;` |
| `MPC_DSH_COMMAND` | — | força um binário `dsh` específico (senão `node_modules/.bin` → `npx`) |
| `MPC_DSH_ENV_FILE` | `<projeto>\.env.local` | arquivo de onde vêm as credenciais (usado por testes) |
| `DSH_TELEMETRY_MODE` | `DISABLED` | repassada ao dsh |

Credenciais: ambiente do processo **vence** o `.env.local` da raiz do projeto. Nada de chave em JSON, em `chat-skills.json` ou versionada.

Layout do home:

```
%DSH_HOME%\
  profiles\headless\
    package.json        manifesto do perfil (bundles, em ordem)
    cordis.patch.yml    sua camada de patch (YAML Cordis)
  patches\<provedor>.yml  gerado pela ponte, sobrescrito a cada tentativa
```

O perfil `headless` nasce do template do pacote na primeira execução; `web`, `sdk` e `acp` só existem se você subir esses modos. O provedor é declarado como row `@deepseek-ai/dsh-llm-pi-ai` com `api: openai-completions`:

```yaml
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    api: openai-completions
    baseURL: https://api.x.ai/v1
    apiKeyEnv: XAI_API_KEY
    models:
      - grok-4.7
```

> **Armadilha:** um patch **substitui** o `config` inteiro da row — não faz merge profundo. Mexer só em `models` apaga `baseURL` e `apiKeyEnv`. Copie o bloco inteiro do provedor anterior e troque o necessário.

**Trocar o provedor primário** — três caminhos, do menos ao mais invasivo:

1. Por requisição: `{"task":"…","provider":"deepseek"}` coloca o escolhido na frente; se ele falhar, os demais continuam na ordem original.
2. Por credencial: exponha a chave do provedor desejado e **remova** a dos que vêm antes dele na tabela — a cascata começa no primeiro que tiver chave.
3. Por código: reordenar `PROVIDERS` em `v10/dsh-bridge.js`.

O adaptador `@deepseek-ai/dsh-llm-deepseek` fala **Anthropic Messages** (`/v1/messages`) e por isso **não serve** para endpoint OpenAI-compatible; o caminho é o `llm-pi-ai` com `api: openai-completions`.

---

## Privacidade e o que é desligado

O dsh tem telemetria e **upload de log de sessão**, ambos ligados por padrão. O `session-log-deepseek` envia o log da sessão em blocos de até 8 MiB por request, e isso vale também quando o provedor é um gateway customizado — não é um recurso exclusivo de quem usa a API oficial da DeepSeek. O OTel fica em `FEEDBACK_ONLY`.

Nada disso é aceitável para um launcher local que lê caminhos e arquivos do Jean. O que esta integração faz:

- `DSH_HOME` isolado em `%LOCALAPPDATA%\MestreDoPC\dsh-home` — sessões e credenciais não se misturam com o `~/.dsh` pessoal.
- `DSH_TELEMETRY_MODE=DISABLED` no ambiente do filho.
- Row do `session-log-deepseek` **desligada** no perfil.
- Chave de API fora do patch, do log e da resposta: só o nome da variável no YAML, valor no ambiente.
- Auditoria (`dsh_run`) registra provedor, `code`, `cwd`, tamanho da tarefa e duração — nunca a chave nem o texto da tarefa.

Fora de `$DSH_HOME`, o dsh escreve em `~/.agents` e `~/.cache/deepseek-harness`. No projeto, nada.

---

## Limitações conhecidas

- **Developer preview.** `0.2.2-rc.1` é release candidate: flags e formato de evento podem mudar. Pin obrigatório, e atualizar exige reler o README do bundle headless.
- **Uma tarefa por invocação, sem follow-up.** Cada `/dsh/run` é sessão nova; não há como mandar a segunda mensagem para a mesma sessão pelo launcher.
- **Primeira execução é lenta e baixa ~739 MB.** O `npx -y` puxa o pacote para o cache do npm (`%LOCALAPPDATA%\npm-cache\_npx`), não para o `DSH_HOME` — que fica com ~134 KB. Medi **124,9 s** na estreia e **12–17 s** depois. Precisa de rede na primeira vez.
- **Sem streaming para o chat.** A ponte lê o NDJSON até o fim e o cliente faz polling em `/dsh/job` — como `/run-status` e `/rea/job`.
- **Exige Node ≥ 24.9.0** para o `npx`. O launcher herda o PATH do shell que o subiu; se ali houver um Node mais antigo, o boot do dsh falha com erro de `engines`.
- **Roda com permissão `workspace-write`** (`shell` + edição de arquivos). O `cwd` é validado e **não** passamos `--add-dir` extra: o alcance é o diretório da tarefa (padrão: raiz do projeto).

---

## Como testar manualmente

```powershell
# 0. Node e harness
node -v                                   # precisa ser >= 24.9.0
npx -y @deepseek-ai/dsh@0.2.2-rc.1 --version

# 1. Instalação e cascata visível (só quem tem credencial)
Invoke-RestMethod http://127.0.0.1:7777/dsh/status -Headers @{ 'X-Mestre-Client'='v10-web' }

# 2. Tarefa assíncrona
$job = Invoke-RestMethod http://127.0.0.1:7777/dsh/run -Method Post `
  -Headers @{ 'X-Mestre-Client'='v10-web' } -ContentType 'application/json' `
  -Body '{"task":"liste os arquivos da raiz do projeto e diga o que faz o launcher"}'
$job.jobId

# 3. Polling até state = completed|failed
Invoke-RestMethod "http://127.0.0.1:7777/dsh/job?id=$($job.jobId)" -Headers @{ 'X-Mestre-Client'='v10-web' }

# 4. Forçar outro provedor, com rodada extra
Invoke-RestMethod http://127.0.0.1:7777/dsh/run -Method Post `
  -Headers @{ 'X-Mestre-Client'='v10-web' } -ContentType 'application/json' `
  -Body '{"task":"responda apenas: ok","provider":"deepseek","retry":true}'

# 5. Mesmo teste sem PowerShell
$body = @{ task = "responda apenas: ok" } | ConvertTo-Json -Compress
curl.exe -s http://127.0.0.1:7777/dsh/status -H "X-Mestre-Client: v10-web"
curl.exe -s -X POST http://127.0.0.1:7777/dsh/run -H "X-Mestre-Client: v10-web" `
  -H "Content-Type: application/json" -d $body

# 6. Recusas esperadas
# 403 sem header; 400 com task vazia; 429 com dois jobs em andamento
```

Cada execução grava `SECURITY` em `logs/audit/` (`dsh_run`), com provedor, `cwd`, `taskLength` e duração.

---

## Testes

```powershell
node --test mcp-server/test/dsh-bridge.test.js   # 6: status, ordem da cadeia, validação, parser, cascata, retry
node --check v10/dsh-bridge.js
node --check v10/dsh-routes.js
node scripts/validate.mjs --depth=quick
```

---

## Referências

- README do harness: `@deepseek-ai/dsh/README.md` (dentro do pacote npm instalado) — modos de entrada (`headless`, `web`, `sdk`, `acp`), perfis, camadas de patch, `engines`.
- `packages/bundle/headless/README.md` (no monorepo do harness) — bundle headless: flags, saída NDJSON e contrato de `final`.
- `packages/llm/llm-pi-ai/README.md` (no monorepo do harness) — adaptador OpenAI-completions: row, `api`, `baseURL`, `apiKeyEnv`, `models[]`.
- Monorepo do harness: `deepseek-ai/deepseek-harness` (o pacote npm corresponde a `apps/cli`).
- Integração irmã, com o mesmo desenho de ponte: `docs/ENGENHARIA-REVERSA-REA.md`.

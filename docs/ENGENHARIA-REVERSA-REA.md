# Engenharia Reversa (REA) — integração nativa

Skill de engenharia reversa do [REA](https://github.com/morluto/rea) embutida no Mestre do PC: aparece no **chat** (skill + ferramentas) e no **menu de comandos** (`/gerenciar-comandos.html`), com as mesmas regras de autorização e auditoria do resto do launcher.

> Escopo: analisa **artefato entregue** (app Electron/ASAR, árvore JavaScript empacotada, pacote). Repositório de código-fonte completo não é alvo de REA — ali se lê o código.

---

## Fluxo

```
chat (skill /engenharia-reversa)  ─┐
chat (Ferramentas → rea_*)        ─┼─► v10/rea-bridge.js ─► rea | npx rea-agents ─► Evidência
menu de comandos (eng_reversa_*)  ─┤        │
HTTP /rea/* (mobile, extensão)    ─┘        └─ auditLog(SECURITY)
```

## Arquivos

| Arquivo | Papel |
|---|---|
| `v10/rea-bridge.js` | Núcleo: detecta o REA (`rea` local, PATH ou `npx`), valida alvo, monta o comando, executa com timeout, limita saída, audita. |
| `v10/rea-routes.js` | Rotas HTTP `/rea/status`, `/rea/doctor`, `/rea/analyze` (+ job) e `/rea/job`. |
| `scripts/rea-cli.mjs` | CLI usado pelas operações da whitelist e por testes. |
| `v10/chat-integrado/chat-skills.json` | Skill `engenharia-reversa` (biblioteca de Skills, atalho `/`, cápsula no chat). |
| `v10/chat-integrado/tools-api.js` | Tools do chat: `rea_status`, `rea_doctor`, `rea_analisar_app_js`. |
| `v10/allowed-operations.json` | Operações `eng_reversa_*` (viram tools MCP automaticamente). |
| `mcp-server/test/rea-bridge.test.js` | Contrato da ponte: alvo, raízes, metacaracteres. |
| `mcp-server/test/rea-operations.test.js` | Contrato da whitelist + skill do chat. |

## Chat

1. **Skill**: cápsula `🔬 Engenharia reversa` ou digite `/engenharia-reversa` no campo de mensagem. O corpo da skill entra no prompt com o método (quando usar, regras de alvo, disciplina de evidência).
2. **Ferramentas** (`🛠️ Ferramentas`): `rea_status`, `rea_doctor` rodam sem argumento; `rea_analisar_app_js` pede o caminho absoluto.
3. O resultado volta como JSON do REA e a resposta deve separar **observado / inferido / desconhecido**.

## Menu de comandos

Categoria **Engenharia Reversa (REA)** em `/gerenciar-comandos.html`:

| ID | Tipo | O que faz |
|---|---|---|
| `eng_reversa_status` | fixa | Como o REA está sendo chamado + versão + raízes permitidas |
| `eng_reversa_doctor` | fixa | `rea doctor --json` (read-only) |
| `eng_reversa_analisar_app_js` | template | `analyze-js "{{CAMINHO}}"` |

O registry gera as tools MCP (`mestre_*`) a partir dessas entradas — não registre tool nova em `mcp-server/index.js`.

## HTTP

Mesma autorização de `/run` (`X-Mestre-Client` + token quando exigido):

```powershell
# status
Invoke-RestMethod http://127.0.0.1:7777/rea/status -Headers @{ 'X-Mestre-Client'='v10-web' }

# análise assíncrona
$job = Invoke-RestMethod http://127.0.0.1:7777/rea/analyze -Method Post `
  -Headers @{ 'X-Mestre-Client'='v10-web' } -ContentType 'application/json' `
  -Body '{"target":"C:\\Users\\Jean\\Downloads\\app.asar"}'
Invoke-RestMethod "http://127.0.0.1:7777/rea/job?id=$($job.jobId)" -Headers @{ 'X-Mestre-Client'='v10-web' }
```

## Segurança

- **Alvo nunca é executado.** A ponte lê o artefato e devolve relatório.
- Caminho **absoluto** e existente; raízes permitidas: projeto, perfil do usuário, TEMP, Program Files (extras em `REA_ALLOWED_ROOTS`, separadas por `;`).
- Caminho com `"`, `&`, `|`, `<`, `>`, `^`, `%`, `!` é recusado — o template da whitelist valida por regex e a ponte revalida.
- A linha de comando é montada pela ponte e passada ao shell como **uma string**: no Windows, `spawn` com array de argumentos reescapa aspas (verificado), então `shell: true` + string montada é o caminho seguro aqui.
- Toda análise e o `doctor` gravam `SECURITY` em `logs/audit/` (`rea_analyze`, `rea_doctor`).
- Saída limitada (`REA_MAX_OUTPUT_BYTES`, padrão 4 MB) e timeout (`REA_TIMEOUT_MS`, padrão 5 min, teto 15 min).

## Variáveis

| Variável | Default | Nota |
|---|---|---|
| `REA_PACKAGE` | `rea-agents@6.8.0` | versão pinada usada no fallback npx |
| `REA_COMMAND` | — | força um binário/atalho específico do REA |
| `REA_ALLOWED_ROOTS` | — | raízes extras de alvo, separadas por `;` |
| `REA_TIMEOUT_MS` | `300000` | timeout da análise (10 s–15 min) |
| `REA_DOCTOR_TIMEOUT_MS` | `120000` | timeout do doctor |
| `REA_MAX_OUTPUT_BYTES` | `4194304` | teto da saída guardada |

## Limitações conhecidas

- **Binário nativo** (PE/ELF/APK, decompilação com Ghidra) exige o servidor **MCP** do REA. A ponte HTTP do launcher cobre JavaScript/Electron e `doctor`; `rea_status` declara `capabilities.nativeBinary: false`.
- Sem `rea` instalado, a primeira execução usa `npx -y rea-agents@<versão>` e **precisa de rede**. Para fixar: `npm i -g rea-agents@6.8.0` ou `REA_COMMAND`.
- O launcher roda PowerShell 5.1; o REA exige Node ≥ 20 (o Node do Mestre é ≥ 22.13).

## Testes

```powershell
node --test mcp-server/test/rea-bridge.test.js
node --test mcp-server/test/rea-operations.test.js
node scripts/validate.mjs --depth=quick
```

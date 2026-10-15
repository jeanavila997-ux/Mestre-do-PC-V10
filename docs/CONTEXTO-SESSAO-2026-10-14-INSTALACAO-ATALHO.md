# 🧠 Memória de Sessão — Instalação, execução e atalho do Mestre do PC V10

> **Data:** 14/10/2026 (madrugada de 15/10 em UTC)
> **Máquina:** Acer Nitro AN515-57 · Windows 11 · `C:\Users\Jeanc`
> **Agente:** GitHub Copilot CLI
> **Escopo:** clonar → identificar dependências → instalar → executar → criar atalho na Área de Trabalho

---

## ✅ Resumo executivo

| Etapa | Resultado |
|---|---|
| Clone do repositório | ✅ `C:\Users\Jeanc\Mestre-do-PC-V10` limpo, `main` = `2bf990d` |
| Dependências identificadas | ✅ 4 `package.json` (raiz, `v10/`, `mcp-server/`, `browser-extension/`) + 4 scripts Python opcionais |
| Instalação | ✅ 104 (raiz) + 106 (`mcp-server`) + 629 (`v10`) pacotes |
| Execução | ✅ Launcher em `http://127.0.0.1:7777` (v10.1.0), UI 200, MCP `mestre-do-pc-mcp v1.1.0` |
| Atalho na Área de Trabalho | ✅ `Mestre do PC V10.lnk`, cold start em **10,8 s** (era ~100 s) |
| Testes | ✅ 129 testes · 128 pass · 0 fail · 1 skipped |
| Bug corrigido | 🛠️ `localhost` → `127.0.0.1` no `start-mestre-v10.ps1` |
| Incidente | ⚠️ 3 operações pesadas da whitelist foram interrompidas (ver §7) |

---

## 1. Ambiente verificado nesta sessão

| Ferramenta | Versão / caminho | Observação |
|---|---|---|
| Node.js | `v24.21.0` — `C:\Program Files\nodejs\node.exe` | atende `engines: >=22.13.0` |
| npm | `11.19.0` | **novo gate `install-scripts`** (ver §3) |
| Ollama | `0.40.2` ativo em `127.0.0.1:11434` | roda 100% CPU nesta máquina |
| PowerShell | `pwsh 7.6.6` | `Get-ChildItem` **não aceita `-MaxDepth`** (usar `-Depth`) |
| Git / gh | Git 2.56.0 · gh autenticado (`jeanavila997-ux`, escopos `repo`, `workflow`) | |
| MySQL/MariaDB | **ausente** | opcional — tools de banco ficam desabilitadas sem `MESTRE_LOCAL_MCP_TOKEN` |
| Área de Trabalho | `C:\Users\Jeanc\OneDrive\Área de Trabalho` | redirecionada para OneDrive |

> A memória da home (`C:\Users\Jeanc\AGENTS.md`) registrava **Node v26.7.0**. O binário
> efetivamente no PATH é **v24.21.0** — usar essa versão como referência.

---

## 2. Dependências identificadas

### 2.1 Manifests npm

| Manifest | Papel | Lockfile |
|---|---|---|
| `package.json` (raiz) | dev/meta do projeto | `package-lock.json` (rastreado) |
| `v10/package.json` | **launcher** (produto principal) | `v10/package-lock.json` (criado nesta sessão) |
| `mcp-server/package.json` | servidor MCP + testes | `mcp-server/package-lock.json` (rastreado) |
| `browser-extension/package.json` | extensão de navegador | sem lockfile (usa só builtins) |

Dependências externas reais do JavaScript:

- `@modelcontextprotocol/sdk` e `@modelcontextprotocol/server` — protocolo MCP
- `@wonderwhy-er/desktop-commander` (v0.2.52) — automação de desktop, usado por `mcp-server/desktop-commander-client.js`
- `@qwen-code/cua-sdk` — computer-use
- `mysql2` — banco de dados (opcional em runtime)

### 2.2 Dependências Python (opcionais, não instaladas)

| Script | Requisitos |
|---|---|
| `prompt-guard-server.py` | `transformers`, `torch` |
| `scripts/langchain_mestre_agent.py` | `langchain` |
| `docs/prompts/install_nvidia_skills.py` | — |
| `v10/notepad-plus-plus/MestreDoPC.py` | Python 2 + `win32com` |

> Nenhum fluxo do launcher, MCP ou testes depende desses scripts.

---

## 3. Instalação executada

```powershell
cd C:\Users\Jeanc\Mestre-do-PC-V10
npm ci --ignore-scripts          # raiz  → 104 pacotes
cd mcp-server ; npm ci           # MCP   → 106 pacotes
cd ..\v10 ; npm install          # launcher → 629 pacotes (~10 min)
```

### ⚠️ npm 11.19 — gate `install-scripts`

O npm 11.19 bloqueia *postinstall* de dependências novas. Três pacotes foram afetados:

| Pacote | Postinstall bloqueado | Impacto real |
|---|---|---|
| `@wonderwhy-er/desktop-commander` | verifica `ripgrep` no PATH | **nenhum** — `dist/index.js` não referencia ripgrep; testes passam |
| `puppeteer` | baixa Chromium (~150–200 MB) | só afeta `md-to-pdf` (transitivo do desktop-commander) |
| `sharp` | compila binário nativo | **nenhum** — prebuilt `@img/sharp-win32-x64` já vem no pacote |

Comandos úteis: `npm install-scripts ls` · `npm install-scripts approve <pacote>` · `npm install-scripts deny <pacote>`.

---

## 4. Execução e verificação

| Verificação | Resultado |
|---|---|
| `GET http://127.0.0.1:7777/ping` | `{"status":"ok","admin":true,"state":"idle","activeJobs":0,"version":"10.1.0"}` |
| `GET /` (interface) | 200 · *"Mestre do PC V11 - Ultimate Plus"* · 221 KB |
| Cabeçalhos de segurança | `X-Content-Type-Options: nosniff` · `Referrer-Policy: no-referrer` · `Cache-Control: no-store` |
| Handshake MCP (stdio) | `serverInfo: mestre-do-pc-mcp v1.1.0` |
| `node --check` | OK em `v10/launcher.js`, `mcp-server/index.js`, `mcp-server/security.js` |
| Suíte de testes | 129 testes · 128 pass · **0 fail** · 1 skipped · ~17 s · exit 0 |
| Ollama | `{"version":"0.40.2"}` em `127.0.0.1:11434` |

### Tempo de inicialização

| Cenário | Tempo |
|---|---|
| Antes da correção (`localhost`) | **~100 s** (1º boot medido: 160 s) |
| Depois da correção (`127.0.0.1`) | **10,8 s** a frio |
| Só o launcher Node (`node v10/launcher.js`, porta livre) | ~0,7 s |

Evidência em `logs/shortcut.log` (execução 23:10:52 → 23:11:02).

---

## 5. 🛠️ Bug encontrado e corrigido — `localhost` vs `127.0.0.1`

### Sintoma

O atalho demorava **~100 s** para abrir a interface, mesmo com o Ollama ativo.

### Causa raiz

Nesta máquina `localhost` resolve primeiro para **`::1` (IPv6)**, mas o Ollama escuta
**apenas em IPv4 (`127.0.0.1`)**. O `Invoke-RestMethod -TimeoutSec 2` do script não falhava
rápido: estourava o timeout a cada tentativa, e o laço de espera do script somava
3 × ~3 s + 30 × ~3 s ≈ 100 s antes de seguir.

| Endereço | Resposta |
|---|---|
| `http://localhost:11434` | timeout (`TaskCanceledException` em ~2,1 s) |
| `http://127.0.0.1:11434` | **20–60 ms** |

### Correção aplicada (`start-mestre-v10.ps1`)

```diff
-#   1. Verifica/ativa o Ollama em localhost:11434
+#   1. Verifica/ativa o Ollama em 127.0.0.1:11434

 $OllamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
-$OllamaApi = "http://localhost:11434"
+# 127.0.0.1 em vez de localhost: "localhost" costuma resolver para ::1 (IPv6)
+# primeiro, e o Ollama escuta apenas em IPv4 — o probe estourava o TimeoutSec
+# de 2s e o script esperava ~100s antes de seguir. Mesmo endereco usado pelo
+# launcher (v10\launcher.js) e pelo .env.example.
+$OllamaApi = "http://127.0.0.1:11434"
```

### O mesmo antipadrão continua em outros arquivos (NÃO alterados nesta sessão)

| Arquivo | Linha(s) |
|---|---|
| `startup/MestreDoPC-Startup.ps1` | 9 (comentário), **18** (`$OllamaApi`) |
| `v10/allowed-operations.json` | **656**, **2440**, 3184 (título), **3187** |
| `v10/index.html` | 1064, **1191**, **1192** |
| `scripts/test_ollama.mjs` | 14 (comentário), **26** (`HOST` default) |
| `scripts/test-ollama.ps1` | 2 |
| `scripts/test-chat-ia.ps1` | 6 |
| `docs/INSTALACAO-CLIENTE.md`, `docs/REDE-DIAGNOSTICO.md`, `mcp-server/DEVELOPMENT_GUIDE.md`, `dist/site/docs.html` | apenas documentação/exemplos |
| `scripts/install.sh` | 86–98 — Linux/WSL, onde `localhost` normalmente funciona |

> **Recomendação:** trocar por `127.0.0.1` em `startup/MestreDoPC-Startup.ps1:18` (é o script
> do *startup* automático, sofre do mesmo atraso) e nas entradas
> `allowed-operations.json` 3187/656 e `index.html` 1191–1192 (essas usam
> `TimeoutSec 5` e também vão falhar com `localhost`).

---

## 6. Atalho na Área de Trabalho

| Propriedade | Valor |
|---|---|
| Arquivo | `C:\Users\Jeanc\OneDrive\Área de Trabalho\Mestre do PC V10.lnk` |
| Destino | `pwsh.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Users\Jeanc\Mestre-do-PC-V10\start-mestre-v10.ps1"` |
| WorkingDirectory | `C:\Users\Jeanc\Mestre-do-PC-V10` |
| Ícone | `icon.ico` (do projeto) |

O que o atalho faz, em ordem: ativa o Ollama → ativa o launcher Node (`v10/launcher.js` na
porta 7777) → abre `http://127.0.0.1:7777` no navegador padrão.

Validação: atalho executado 3× por `Start-Process` no `.lnk`; `/ping` respondeu OK nas 3.

---

## 7. ⚠️ Incidente — operações pesadas interrompidas

Durante a sessão, com o launcher já no ar, **três operações destrutivas da whitelist**
foram disparadas (23:15:10, 23:15:32 e 23:15:52) e foram **encerradas por segurança**:

| PID | Operação | Comando real |
|---|---|---|
| 18592 | `otimizar_desfragmentar_disco` | `Optimize-Volume -DriveLetter C -Defrag -Verbose` |
| 19392 | `limpar_cache_do_microsoft_store` | `wsreset.exe` (processo `wsreset` órfão 20632 também encerrado) |
| 17696 | `remover_arquivos_tmp_do_sistema` | `Get-ChildItem C:\ -Recurse -Filter *.tmp \| Remove-Item -Force` |

### Análise de origem

- **Nenhum teste** do repositório referencia esses IDs de operação (verificação estática).
- O `logs/audit/audit-2026-10-14.log` **não** contém entradas `COMMAND_EXEC` para elas —
  consistente com jobs encerrados antes de concluir.
- Conclusão mais provável: **cliques do usuário na interface web** recém-aberta (a UI estava
  aberta no navegador). Não foi possível atribuir com certeza.

### ⚠️ Lição aprendida — os testes NÃO são isolados do ambiente

- Vários testes sobem launchers próprios em portas reservadas, mas **escrevem no diretório
  real** `logs/audit/` (só `diagnosticar-saude.test.js` isola via `MESTRE_AUDIT_LOG_DIR`).
- `desktop-commander-client.test.js` roda de verdade quando o pacote está instalado; o
  **primeiro spawn a frio levou 22 s** e estourou o `CONNECT_TIMEOUT_MS = 20000` — com cache
  quente conecta em 1,95 s.

> **Regra prática:** **parar o launcher antes de rodar `npm test`**, para não confundir
> jobs reais com jobs de teste e para não escrever no log de auditoria de produção.

---

## 8. Pendências e próximos passos (não bloqueantes)

| Item | Situação | Ação sugerida |
|---|---|---|
| `ripgrep` ausente | postinstall do Desktop Commander bloqueado pelo npm 11 | `npm i -g @vscode/ripgrep` ou `npm install-scripts approve @wonderwhy-er/desktop-commander` |
| `puppeteer` sem Chromium | postinstall bloqueado | só necessário para `md-to-pdf`; aprovar quando usar |
| MySQL/MariaDB ausente | tools de banco desabilitadas | instalar + `MESTRE_LOCAL_MCP_TOKEN` quando quiser o MCP local |
| `localhost:11434` em outros arquivos | ver §5 | aplicar a mesma troca |
| `v10/package-lock.json` | criado nesta sessão e **agora versionado** | melhora reprodutibilidade; reverter com `git rm --cached v10/package-lock.json` se indesejado |
| Memória interna do app | **não** utilizada | opcional: `POST http://127.0.0.1:7777/memories/create` (ver `docs/SISTEMA-MEMORIAS.md`) |

---

## 9. Arquivos alterados/criados nesta sessão

| Arquivo | Mudança |
|---|---|
| `start-mestre-v10.ps1` | `localhost` → `127.0.0.1` (+ comentário explicativo) |
| `v10/package-lock.json` | **novo** (gerado pelo `npm install`) — versionado a partir daqui |
| `docs/CONTEXTO-SESSAO-2026-10-14-INSTALACAO-ATALHO.md` | **novo** — este documento |
| `AGENTS.md` | nova seção de notas de sessão/troubleshooting |
| `.github/copilot-instructions.md` | notas de instalação (versões, gate `install-scripts`, `127.0.0.1`) |
| `C:\Users\Jeanc\OneDrive\Área de Trabalho\Mestre do PC V10.lnk` | **criado** (fora do repositório) |

Relacionados: `docs/SISTEMA-MEMORIAS.md` (memória interna do app),
`docs/CONTEXTO-SESSAO-RESUMO.md` (sessão anterior de 17/08/2026).

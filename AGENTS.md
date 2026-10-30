# AGENTS.md — Mestre do PC V10

Instruções para agentes (Grok, Codex, OpenCode, Copilot). Leia este arquivo **antes** de editar. Detalhe de arquitetura: `docs/CLAUDE.md`. Segurança: `SECURITY.md`. Deploy VPS: `docs/VPS-DEPLOY.md`.

Responda em **pt-BR**. Strings da UI e docs visíveis ao Jean também em pt-BR. Identificadores de API, env vars e nomes de arquivo ficam em inglês.

Clone de trabalho: **`C:\Users\Jean\Projetos\Mestre-do-PC-V10`**. Existe cópia antiga em `Projetos\ProjetosPessoais\Mestre-do-PC-V10` — **não use**. Sempre `Set-Location` neste repo antes de `git`.

---

## O que é

Assistente local de diagnóstico e manutenção do Windows. Clientes de IA **nunca** executam PowerShell direto: todo comando administrativo passa pelo launcher, que só aceita a whitelist.

| Superfície | Onde | Porta / URL |
|---|---|---|
| Launcher + UI desktop | `v10/launcher.js`, `v10/index.html` | `http://127.0.0.1:7777` |
| PWA mobile | `v10/mobile/` (espelho em `dist/site/mobile/`) | `http://127.0.0.1:7777/mobile/` |
| MCP | `mcp-server/index.js` (stdio) | chama o launcher via HTTP |
| GitHub Pages | `dist/site/` | `https://jeanavila997-ux.github.io/Mestre-do-PC-V10/` |
| VPS (site + PWA) | `deploy/vps/` | `https://mestre.72-62-11-116.sslip.io` |

O launcher **só escuta `127.0.0.1`**. `MPC_HOST` diferente de `127.0.0.1` aborta o processo. Na VPS sobe só o site estático em `127.0.0.1:7780` atrás do Traefik — o launcher Windows continua no PC.

---

## Arquitetura (não quebre este fluxo)

```
cliente (UI / MCP / extensão / mobile)
    │  HTTP + X-Mestre-Client (+ token quando exigido)
    ▼
v10/launcher.js          127.0.0.1:7777
    │  operation-registry.js ← allowed-operations.json
    │  POST /run  → jobId; GET /run-status?id=
    ▼
powershell.exe           só comandos da whitelist
```

- MCP **não** executa comando. Só `POST /run` no launcher com `X-Mestre-Client: mcp` + `X-Mestre-Mcp-Token`.
- Fonte da verdade da whitelist: `v10/allowed-operations.json` + `v10/operation-registry.js`. **Não** cadastre tool nova em `mcp-server/index.js`.
- Concorrência do launcher: no máximo 3 jobs; timeout 15 min; retenção 30 min. Tools MCP `mestre_*` em paralelo falham com “Limite de comandos simultâneos” — serialize.
- `pageId` do chrome-devtools-mcp é **1-based**.

---

## Comandos

Rodar a partir da raiz do repo, em **pwsh**.

```powershell
# Launcher (produção local)
pwsh mcp-server/check-status.ps1
pwsh mcp-server/start-launcher.ps1   # UAC; Jean precisa aprovar
# ping: Invoke-RestMethod http://127.0.0.1:7777/ping

# MCP stdio
node mcp-server/index.js

# Testes — PARE o launcher de produção antes
cd mcp-server; npm test                          # node --test --test-concurrency=1
node --test test/whitelist-enforcement.test.js   # um arquivo
node --check ..\v10\launcher.js

# Validação unificada
node scripts/validate.mjs                  # quick + testes + PS + HTML
node scripts/validate.mjs --depth=quick
node scripts/validate.mjs --depth=ci

# Extensão
cd browser-extension; node build.js chrome; node build.js firefox

# VPS — pasta completa, nada na Área de Trabalho
pwsh -NoProfile -File scripts/deploy-vps.ps1 -SkipRemote   # só empacota
pwsh -NoProfile -File scripts/deploy-vps.ps1               # scp + compose
```

Atalho desktop: `.\start-mestre-v10.ps1`. Instalador: `install.ps1` (Admin) — cria **somente `.lnk`**. Código fica em `$InstallDir`.

CI (`.github/workflows/ci.yml`): Node 22.x e 24.x, `npm ci` na raiz e em `mcp-server/`, `npm test`, `node --check` em launcher / origin-policy / mobile / mcp.

---

## Regras duras

1. **`127.0.0.1`, nunca `localhost`.** No Windows `localhost` → `::1` e o Ollama só escuta IPv4; vira timeout de ~2 s em vez de falha rápida.
2. **ESM puro** (`"type": "module"`): `import`/`export`, imports `node:fs` / `node:path`. Sem `require`.
3. **Não invente suíte de teste.** Testes oficiais = `node --test` em `mcp-server/test/` (+ `v10/security/origin-policy.test.mjs`). Sem Jest.
4. **Não edite `v10/allowed-operations.json` sem o Jean confirmar.** Operação nova: entrada no JSON (`id`, `title`, `category`, `destructive`, `description`, `command` ou `pattern`+`params`) + teste de contrato. O registry gera as tools MCP sozinho.
5. **Não passe input do usuário para o PowerShell.** `sanitizeToolArgument()` em `mcp-server/security.js` — só `[a-zA-Z0-9_. -]`, máx. 128. Prompt vai em `checkPromptInjection()` antes do Ollama.
6. **Não reabra `file://`, CORS `*` nem tire validação de Origin** nos POST. Clientes: `mcp`, `v10-web`, `browser-extension`, `notepad-plus-plus`. Origens extras: `v10/security/origin-policy.js` (`isTrustedClientOrigin`).
7. **Não espalhe arquivos.** Pasta completa do projeto permanece junta. Desktop só recebe `.lnk`. Staging VPS = `dist/vps-bundle/` (gitignored via `dist/*`, com exceção de `dist/site/`). Não copie `node_modules`, `.git`, `logs/`, `data/`, `.env` para a VPS.
8. **Não commite segredos.** `.env`, `.keys/`, tokens, `sk-…`. Chave OpenAI do login ChatGPT fica no `localStorage` do browser (`mestre-openai-key`), não no repo.
9. **Não desabilite o Defender** nem crie exclusões sem o Jean pedir.
10. **Não gere APK / não instale Java / Bubblewrap** neste ciclo, a menos que o Jean peça de novo. “Download Android” = PWA + URL pública.
11. **Não commite leftovers** sem confirmação: `v10/chat-integrado/chat-integrado.js`, `v10/chat/Soul.md`, `v10/chat/chat-module.js`, `v10/chat/chat-template.html`, `docs/superpowers/`.
12. Use `MESTRE_PROJETO_PATH`. Não grave `C:\Users\Jean\...` em HTML/scripts versionados.

---

## Auth HTTP

| Cliente | Header | Extra |
|---|---|---|
| UI / mobile no launcher | `X-Mestre-Client: v10-web` | Origin loopback ou trusted |
| MCP | `X-Mestre-Client: mcp` | `X-Mestre-Mcp-Token` (obrigatório; gerado em `.env.local`) |
| Extensão | `X-Mestre-Client: browser-extension` | `X-Mestre-Extension-Token` |
| Notepad++ | `X-Mestre-Client: notepad-plus-plus` | `X-Mestre-Npp-Token` (`/npp` = 501 se vazio) |

Site estático / PWA (Pages e VPS): sessão em `localStorage` `mestre-site-session` + conta `mestre-site-account`. Login ChatGPT **não é OAuth** — é chave `sk-…` validada em `GET https://api.openai.com/v1/models`, depois chat em `/v1/chat/completions`.

Testes que sobem o launcher: importar `mcp-server/test/helpers/launcher-test-env.js` **antes** de montar o env (fixa `TEST_MCP_TOKEN` e `.env.local` temporário).

---

## Pastas que importam

| Caminho | Função |
|---|---|
| `v10/launcher.js` | Backend HTTP. Cache-Control: `no-store`. |
| `v10/allowed-operations.json` | Whitelist. |
| `v10/operation-registry.js` | Resolve `{id}` / `{id,params}` / `{cmd}`. |
| `v10/index.html` | SPA desktop, sem bundler. |
| `v10/mobile/` | PWA. Ao mudar, copie para `dist/site/mobile/`. |
| `v10/chat/` | Chat da UI (`initChat` → `#chat-root`). |
| `v10/chat-integrado/` | Chat Integrado; skills em `chat-skills.json`. |
| `v10/security/origin-policy.js` | Origens confiáveis (VPS, sslip.io, github.io, trycloudflare). |
| `mcp-server/` | MCP stdio + testes. |
| `mcp-server/chrome-devtools-bridge.js` | Tools `chrome_*`. |
| `mcp-server/nexo-bridge.js` | Tools `nexo_*`. |
| `dist/site/` | O que o GitHub Pages e a VPS servem. |
| `deploy/vps/` | `server.mjs` + `docker-compose.yml`. |
| `scripts/deploy-vps.ps1` | Empacota a árvore (sem node_modules/.git/logs/data/.env) e envia. |
| `browser-extension/` | MV3 Chrome/Firefox. |
| `skills-globais/` | Skills DevTools; sync com `sincronizar-para-agentes.ps1`. |
| `logs/audit/` | Auditoria real — testes **escrevem aqui**. |
| `.agents/`, `data/` | gitignored. |

UI desktop não tem build. Edite HTML/CSS/JS servidos. Mobile: altere `v10/mobile/` **e** o espelho `dist/site/mobile/` na mesma mudança (Pages/VPS leem o `dist`).

---

## Mobile / Android / VPS

- PWA em `/mobile/`. Manifest + `sw.js` no próprio diretório mobile.
- URL pública Android (PWA): `https://jeanavila997-ux.github.io/Mestre-do-PC-V10/mobile/`
- URL VPS: `https://mestre.72-62-11-116.sslip.io/mobile/`
- Atalhos embutidos: `BUILTIN_OPS` (Cmds) e `BUILTIN_PROMPTS` (Mais + chips) em `v10/mobile/app.js`. IDs = whitelist real.
- Deploy VPS: unidade = pasta completa em `/opt/apps/mestre-do-pc`. SSH `root@72.62.11-116` com `%USERPROFILE%\.ssh\id_ed25519_vps` (Host `srv1483039`). Firewall só 22/80/443. Porta 7780 só em loopback.
- SSH recusa `publickey` até a chave pública estar no hPanel (Hostinger → VPS → Settings → SSH keys). Pública documentada em `docs/VPS-DEPLOY.md`. **Não reinicie a VPS** para “tentar de novo”.

---

## Testes — pegadinhas

- Runner: **`node --test --test-concurrency=1`**, não Jest.
- A suíte escreve em `logs/audit/` real (exceto `diagnosticar-saude.test.js` com `MESTRE_AUDIT_LOG_DIR`).
- Vários testes sobem launcher extra em `MPC_PORT` livre + `TEST_MCP_TOKEN`.
- **Pare o launcher de produção** (`:7777`) antes de `npm test`.
- `desktop-commander-client.test.js`: primeiro spawn a frio ~22 s pode estourar 20 s; com cache quente ~2 s. Repita uma vez antes de investigar.
- Smoke mínimo de API nova: 403 sem `X-Mestre-Client`; URL GitHub inválida → 400; GET com shape estável.

---

## Env (os que mais quebram sessão)

| Variável | Default | Nota |
|---|---|---|
| `MPC_PORT` / `MPC_HOST` | `7777` / `127.0.0.1` | HOST ≠ loopback → crash |
| `MESTRE_BASE_URL` | `http://127.0.0.1:7777` | MCP → launcher |
| `MESTRE_LOCAL_MCP_TOKEN` | gerado | obrigatório para cliente `mcp` |
| `MESTRE_ALLOW_LEGACY_MCP` | `0` | emergência; loga SECURITY |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | IPv4 |
| `MESTRE_EXTENSION_TOKEN` | vazio | extensão |
| `MESTRE_NPP_TOKEN` | vazio | `/npp` |
| `MESTRE_SOUL_DIR` | — | isola writes de `/soul*` nos testes |

npm 12 (máquina do Jean) **bloqueia postinstall**. Neste repo o impacto conhecido é `@wonderwhy-er/desktop-commander`, `puppeteer`, `sharp` — não quebra a suíte.

---

## Git

Prefixos observados: `feat:`, `feat(escopo):`, `fix(escopo):`, `docs+feat:`, `docs:`. Mensagens em pt-BR, minúsculas.

`dist/site/` **entra** no Git (Pages). `dist/vps-bundle/` **não**. Lockfiles npm da raiz e de `mcp-server/` entram; `yarn.lock` / `pnpm-lock.yaml` não.

HEAD de referência na época deste init: `7deedb7` (`feat(auth): login com ChatGPT/OpenAI…`) em `origin/main`.

---

## Verificação rápida

```powershell
Invoke-RestMethod http://127.0.0.1:7777/ping
# version ~10.1.0, pid, ok

# UI
# http://127.0.0.1:7777/
# http://127.0.0.1:7777/mobile/
# http://127.0.0.1:7777/login.html   (bloco ChatGPT)

# Header de smoke na UI
# Invoke-WebRequest http://127.0.0.1:7777/run -Headers @{ 'X-Mestre-Client'='v10-web' }
```

Reinicie **só** o processo Node do launcher. `v10/restart-launcher.ps1` mata **todo** Node da máquina — não use sem aviso.

Skill de auditoria: `/auditar-mestre-pc` (`~\.grok\skills\auditar-mestre-pc`).

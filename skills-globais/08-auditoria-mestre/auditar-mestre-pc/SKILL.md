---
name: auditar-mestre-pc
description: >
  Auditoria completa do Mestre do PC V10/V11 (launcher :7777): pastas, APIs HTTP,
  auth, UI web, mobile, desempenho (Lighthouse + CWV), responsividade e integração
  Grok Bot. Use when the user runs /auditar-mestre-pc, pede "auditar o Mestre",
  "análise completa do launcher", health-check profundo, ou review operacional
  do Mestre do PC. Combina requesting-code-review + analisar-desempenho + emular-dispositivos.
---

# Auditar Mestre do PC

Workflow operacional + code review do launcher local. Entrega relatório com evidência
(números, status HTTP, file:line). Não invente resultados.

## Pré-requisitos

- Projeto: `C:\Users\Jean\Projetos\Mestre-do-PC-V10` (nunca `ProjetosPessoais\`).
- Use sempre `127.0.0.1` (nunca `localhost` no Windows para Ollama/launcher).
- Header de auth UI: `X-Mestre-Client: v10-web`.
- **Não** rode `npm test` com o launcher de produção ativo (polui `logs/audit/`).
- **Não** edite `v10/allowed-operations.json` sem confirmação explícita.
- **Não** execute `/run` de comandos destrutivos nesta auditoria.

## Fase 0 — Health rápido

```powershell
Invoke-RestMethod http://127.0.0.1:7777/ping
Invoke-RestMethod http://127.0.0.1:11434/api/tags
```

Anote: `status`, `version`, `admin`, `pid`, `state`, `activeJobs`, contagem de modelos Ollama.

Se `/ping` falhar: `pwsh mcp-server/check-status.ps1` → avise UAC antes de `start-launcher.ps1`.

## Fase 1 — Estrutura e entry points

Liste e resuma propósito: `v10/`, `mcp-server/`, `browser-extension/`, `mobile/`,
`skills-globais/`, `docs/`, `dist/site/`, `logs/audit/`, `v10/data/`.

Entry points a citar: `v10/launcher.js`, `start-mestre-v10.ps1`, `mcp-server/index.js`.

## Fase 2 — APIs e auth

Probe (COM e SEM header `X-Mestre-Client: v10-web`):

| Rota | Esperado sem header | Esperado com header |
|---|---|---|
| `/ping`, `/status` | 200 | 200 |
| `/api/skills`, `/api/config`, `/api/sync/status` | 403 | 200 |
| `/sw.js`, `/manifest.json` | 200 se PWA ok | idem |
| `/mobile/sw.js` | 200 | 200 |
| POST `/npp` | 501 se token ausente | 501 |

Medir latência de `/status` (`Measure-Command`). Se > 3 s, cruzar com
`loadDashboard()` em `v10/index.html` (`AbortSignal.timeout(3000)`).

Checar: `mysqlConfigurado` em `/api/sync/status`, tokens `MESTRE_EXTENSION_TOKEN` /
`MESTRE_NPP_TOKEN` / `MESTRE_MOBILE_TOKEN`, bind só em `127.0.0.1`.

## Fase 3 — UI web (browser MCP `chrome_*`)

1. Sessão de teste (só loopback): injetar
   `localStorage.mestre-site-session = {user, expiresAt: Date.now()+7d }`.
2. Navegar: `/`, `/chat-integrado/chat-integrado.html`, `/memories.html`,
   `/novidades-v11.html`, `/gerenciar-comandos.html`, `/mobile/`.
3. Snapshot + console (`error`/`warn`) + screenshot viewport.
4. Validar redirects: UA mobile → `/mobile/`; sem sessão → `/login.html`.

## Fase 4 — Desempenho (skill analisar-desempenho)

Em `/` autenticado, desktop:

1. `performance.getEntriesByType('navigation')[0]` + paints.
2. `chrome_performance_start_trace` (reload, ignoreCache).
3. `chrome_lighthouse_audit` (navigation, desktop) — A11y/BP/SEO (sem Performance completa).
4. Se CLS > 0.1: `chrome_performance_analyze_insight` em `CLSCulprits`.

Entregar LCP, CLS, tamanho do documento, 3 achados acionáveis com severidade.

## Fase 5 — Responsividade (skill emular-dispositivos)

1. Emular `390x844x3,mobile,touch` + UA iPhone → confirmar `/mobile/`.
2. Overflow-X, FCP, console limpo, telemetria viva (CPU/RAM/Disco).
3. Screenshot mobile vs desktop.

## Fase 6 — Code review dos hotspots (skill requesting-code-review)

Despachar revisor read-only nos achados vivos. Checklist mínimo (já falhou em 2026-10-29):

- `v10/index.html` `loadDashboard` timeout vs latência `/status`
- Registro `/sw.js` vs rota no `launcher.js`
- `loadGrokBotStatus` definido vs chamado em `chat-integrado.js`
- `createMemory(...)` arity vs `grokbot-bridge.js` / `[object Object]` em memórias
- Log MySQL “ativo” vs `mysqlConfigurado`
- Secrets hardcoded (ex.: fallback de API key) — **nunca** copiar a chave para o relatório; peça rotação
- `/mcp` anunciado vs realmente montado no launcher
- Naming de versão package vs `/ping` vs UI V10/V11

## Fase 7 — Grok Bot / Chat Integrado

- `GET /api/grokbot/status` com auth.
- Skills catalog: `GET /api/skills` — confirmar item `auditar-mestre-pc` se presente.
- Tools `grokbot__*` listadas; não dispare otimizações destrutivas sem pedido.
- Se bridge untracked: verificar imports quebrados (`isRouter9Model`, etc.).

## Entrega (formato obrigatório)

1. **Estado agora** — tabela ping/Ollama/MCP/MySQL/RAM.
2. **Mapa web** — URLs e status.
3. **Desempenho** — LCP/CLS/Lighthouse + 3 fixes.
4. **Issues** — Critical / Important / Minor com file:line.
5. **Pronto para merge?** — só se houver diff sob review; senão “N/A (auditoria)”.
6. **Próximos passos** — ordenados, acionáveis.

Feche em modo professor: 3–5 bullets “O que você aprendeu” + mini-exercício opcional.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Mestre do PC V10/V11 is a Windows diagnostic-and-maintenance app: a local elevated
PowerShell backend, a single-page HTML/JS UI, an MCP server for AI agents, and an
optional Ollama integration for local/cloud AI. Everything runs on `127.0.0.1:7777`.

- `v10/index.html` — active UI, served by the launcher (embedded CSS/JS, no build step).
- `MestreDoPC-Launcher.ps1` — primary elevated backend (`System.Net.HttpListener`) on port 7777; auto-elevates to admin. Started by `start-mestre-v10.ps1` / `INSTALAR.bat`.
- `v10/launcher.js` — alternative, non-elevated Node.js backend with the same routes/protocol, for development without admin rights (`cd v10 && npm start`).
- `v10/allowed-operations.json` — **the security boundary**: whitelist of PowerShell operations (plain `command` entries and `{{PLACEHOLDER}}` templates) that either backend is allowed to run.
- `mcp-server/index.js` — MCP server over `stdio`; never runs commands itself, always calls the launcher over HTTP.
- `mcp-server/security.js` — `sanitizeToolArgument()` and `checkPromptInjection()`.
- `mcp-server/audit-logger.js` — audit logging (7 levels, rotation at 10MB / 30 files kept).
- `mcp-server/prompt-guard-server.py` — optional standalone Python microservice (`127.0.0.1:7778/classify`) for prompt-injection detection; falls back to a regex heuristic without `transformers`/`torch`. Not started automatically, unrelated to the Node MCP/launcher stack.
- `browser-extension/` — Manifest V3 extension (Chrome + Firefox) that talks to the launcher via `X-Mestre-Client: browser-extension` and a token from `MESTRE_EXTENSION_TOKEN`.
- Ollama — local/cloud AI at `127.0.0.1:11434`, called directly by the MCP server (not proxied through the launcher) for `perguntar_ia` and related tools.
- `legado/`: old versions; do not touch them to fix V10/V11 behavior.

## Development commands

Run from the project root unless noted:

```powershell
# MCP server — install, test, syntax check
cd mcp-server
npm ci
npm test                          # node --test (all files in mcp-server/test/)
node --test test/security.test.js # run a single test file
node --check index.js
node --check security.js

# V10 launcher (Node.js backend) — syntax check
node --check v10\launcher.js

# Validate a PowerShell script
[System.Management.Automation.Language.Parser]::ParseFile("MestreDoPC-Launcher.ps1", [ref]$null, [ref]$null)

# Project-wide validation (PowerShell parse + JS syntax + MCP tests)
.\validate_all.ps1
.\validate-v11.ps1
```

CI (`.github/workflows/ci.yml`) runs on `windows-latest` against Node 20.x and 22.x:
`npm ci && npm test` in `mcp-server/`, then `node --check` on `v10/launcher.js`,
`mcp-server/index.js`, and `mcp-server/security.js`.

Tests use Node's built-in test runner (no external framework). `mcp-server/test/`
is split by concern: `security.test.js`, `launcher-security.test.js`,
`whitelist-enforcement.test.js`, `browser-extension.test.js`, `notepad-plus-plus.test.js`,
`ollama-config.test.js`, `ollama-smoke-script.test.js`, `chat-permissions.test.js`,
`prompt-guard.test.js`, `project-smoke.test.js`, `v11-security.test.js`,
`v11-1-novos-tools.test.js`.

## Architecture

```
MCP Client (Claude Desktop / Codex / other MCP-compatible agent)
    │  stdio (MCP protocol)
    ▼
mcp-server/index.js              ← non-elevated; wraps allowed-operations as MCP tools
    │  POST /run  (X-Mestre-Client: mcp, no Origin header)
    ▼
MestreDoPC-Launcher.ps1  or  v10/launcher.js   ← elevated HTTP server on :7777
    │  validates request against v10/allowed-operations.json
    │  spawns powershell.exe, tracks the run as a job
    ▼
PowerShell                        ← only whitelisted commands ever execute
```

Both launcher implementations (`MestreDoPC-Launcher.ps1` and `v10/launcher.js`)
serve the same routes and enforce the same security model — origin validation,
`X-Mestre-Client` header checks, and the operation whitelist — so a change to one
usually needs the equivalent change in the other.

**Key design decisions:**
- The MCP server **never** executes commands directly; every administrative action goes through a launcher, which polls back via `/run-status`.
- The launcher supports two invocation shapes: `{id}` for parameterless operations, and `{id, params}` for templated operations where `{{PLACEHOLDER}}` tokens are substituted after per-parameter regex validation (compiled in `v10/launcher.js`, `escapeRegex` + named capture groups).
- `mcp-server/index.js` builds its MCP tool list (`TOOLS`) from two sources: the `mestreTools` map (each entry auto-derives its MCP `inputSchema` from `{{PLACEHOLDER}}` tokens in the command) plus a smaller set of manually declared tools (AI/Ollama, webhooks, audit queries). Don't hardcode a specific tool count in docs or comments — it drifts; read `TOOLS.length` if you need the real number.
- Ollama is called directly by the MCP server for AI tools; the launcher is not involved in AI queries.
- `v10/launcher.js` also exposes an optional `/npp` endpoint for the Notepad++ integration (`docs/notepad-plus-plus-integration.md`), gated by `X-Mestre-Client: notepad-plus-plus` + `X-Mestre-Npp-Token`, disabled (501) unless `MESTRE_NPP_TOKEN` is set.
- `v10/rede-dashboard.js` — client-side network diagnostics panel loaded by `index.html`.
- `browser-extension/` is built via `build.js` (`npm run build:chrome` / `build:firefox`); there is no committed `dist/` output (gitignored).

## Security model (hard rules)

- **Never** pass user input directly into PowerShell. Every argument goes through `sanitizeToolArgument()` in `mcp-server/security.js`, which rejects anything outside `[a-zA-Z0-9_. -]` (max 128 chars).
- **Never** add free-form commands. Every operation must be registered in `v10/allowed-operations.json` with an `id` and `command` (or a `pattern` + `params` for templated ones); AI-suggested or user-typed commands outside that catalog are rejected outright.
- **Never** re-enable `file://` access to the UI, restore CORS `*`, or remove origin validation on POST endpoints. Requests are authorized by `X-Mestre-Client`: `mcp` (no Origin), `v10-web` (Origin must equal `BASE_URL`), `browser-extension` (+ `X-Mestre-Extension-Token`), or `notepad-plus-plus` (+ `X-Mestre-Npp-Token`).
- Destructive operations (`desativar_servico`, `encerrar_processo`, `limpar_*`, etc.) and any AI-suggested command require explicit user confirmation before execution.
- `checkPromptInjection()` in `security.js` scores prompts against ~10 pattern categories (ignore-instructions, persona override, system-prompt leak, privilege escalation, etc.) before they reach Ollama; classifies as `benigno` / `suspeito` / `malicioso`.
- Use `MESTRE_PROJETO_PATH`; never write personal/absolute paths into the HTML or scripts.

## Adding a new operation

1. Add an entry to `v10/allowed-operations.json` — `id`, `title`, `category`, `destructive`, and `command` (or `pattern` + `params` with regex per placeholder for templated ones).
2. Add a matching entry to `mestreTools` in `mcp-server/index.js` with the same `id`, a `description`, and the same `command`/`{{PLACEHOLDER}}` shape — the MCP `inputSchema` is derived automatically from the placeholders.
3. Add or update tests in `mcp-server/test/`.
4. Run `npm test` in `mcp-server/` and `node --check v10\launcher.js` (and the PowerShell parser check if `MestreDoPC-Launcher.ps1` changed too).

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `MESTRE_BASE_URL` | `http://127.0.0.1:7777` | Launcher endpoint used by the MCP server |
| `MESTRE_PROJETO_PATH` | launcher directory | Project root for git/log tools |
| `MESTRE_AUDIT_LOG_DIR` | `logs/audit` | Audit log directory |
| `MESTRE_EXTENSION_TOKEN` | *(empty)* | Auth token for the browser extension (`X-Mestre-Client: browser-extension`) |
| `MESTRE_EXTENSION_ORIGINS` | *(empty)* | Comma-separated allowed origins for the browser extension |
| `MESTRE_NPP_TOKEN` | *(empty)* | Auth token for the Notepad++ integration; `/npp` returns 501 until this is set |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama API base (auto-switches to `https://ollama.com/api` when `OLLAMA_API_KEY` is set) |
| `OLLAMA_API_KEY` | *(empty)* | Enables Ollama Cloud mode + auth header |
| `OLLAMA_MODEL` | `qwen2.5-coder:1.5b` | Default model |
| `OLLAMA_MODEL_PROFILE` | *(empty)* | Selects a preset from `mcp-server/model-profiles.json` (fast, balanced, agent, coding, reasoning); explicit `OLLAMA_*` vars override the profile |
| `OLLAMA_NUM_CTX` | `8192` | Context window (tokens) |
| `OLLAMA_TEMPERATURE` | `0.7` | Sampling temperature |
| `OLLAMA_TOP_P` | `0.9` | Nucleus sampling |
| `OLLAMA_TOP_K` | `40` | Top-K sampling |
| `OLLAMA_NUM_PREDICT` | `0` (unlimited) | Max tokens in the response |
| `OLLAMA_SEED` | `0` (random) | Seed for reproducibility |
| `OLLAMA_KEEP_ALIVE` | `5m` | How long the model stays loaded after use |
| `MPC_PORT` | `7777` | Launcher port (Node.js backend / tests) |
| `MPC_HOST` | `127.0.0.1` | Launcher bind address (Node.js backend) |

## Conventions

- Conventional commits (`fix:`, `feat:`, `docs:`, `chore:`).
- Keep the MCP (non-elevated) / launcher (elevated) split intact — the MCP server must never run commands itself.
- `mcp-server/package.json` pins transitive dependencies via an `overrides` block (fast-uri, hono, @hono/node-server, ip-address, etc.). `npm audit fix` alone won't bump overridden packages — update the `overrides` versions by hand, then `npm install && npm test`.
- `v10/index.html` is a single-file SPA served by the launcher; it talks to the backend via `fetch` with `X-Mestre-Client: v10-web`.
- PowerShell commands in `allowed-operations.json` use `-ErrorAction SilentlyContinue` (`-EA 0`) for non-critical cleanup steps.
- The launcher caps concurrency at 3 simultaneous jobs and enforces a 15-minute timeout per job.
- All HTTP responses include `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`; the UI's CSP sets `frame-ancestors 'none'`.

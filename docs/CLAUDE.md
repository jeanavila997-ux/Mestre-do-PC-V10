# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Mestre do PC V10/V11 is a local Windows diagnostic-and-maintenance app. It exposes a whitelist of PowerShell operations through a web UI, an MCP server (Claude/Copilot), a browser extension, and a Notepad++ plugin. The system is designed so that **AI clients never run shell code directly**; every administrative command is validated against a strict whitelist before execution.

Everything runs on `127.0.0.1:7777` by default.

Prerequisites: Windows 10/11 (64-bit), PowerShell 5.1+, Node.js 20+.

- `v10/launcher.js` — **primary backend**: Node.js HTTP server on port 7777. Serves the UI, validates and runs whitelisted PowerShell commands, proxies Ollama, and hosts memory/chat routes.
- `v10/index.html` — single-file SPA (no build step), served by the launcher.
- `mcp-server/index.js` — MCP server over `stdio`; never runs commands itself, always calls the launcher over HTTP.
- `v10/operation-registry.js` — single source of truth: loads `v10/allowed-operations.json` and derives both the launcher command resolver and the MCP tool list/schemas.
- `mcp-server/security.js` — `sanitizeToolArgument()` and `checkPromptInjection()`.
- `mcp-server/audit-logger.js` — audit logging (7 levels, rotation at 10MB / 30 files kept).
- `v10/memory-manager.js` + `v10/memory-routes.js` — persistent memory store (IndexedDB in the UI, JSON on disk via `/memories/*`).
- `v10/chat/` — chat module: `chat-module.js`, `chat-template.html`, `chat-styles.css`, Ollama streaming integration, and `Soul.md` (persona/behavior spec).
- `v10/rede-dashboard.js` — client-side network diagnostics panel loaded by `index.html`.
- `browser-extension/` — Manifest V3 extension (Chrome + Firefox) that talks to the launcher via `X-Mestre-Client: browser-extension` and a token from `MESTRE_EXTENSION_TOKEN`.
- `MestreDoPC-Launcher.ps1` — legacy elevated PowerShell backend; still present but not the default. `start-mestre-v10.ps1` starts the Node.js launcher.
- `prompt-guard-server.py` — optional standalone Python microservice (`127.0.0.1:7778/classify`) for prompt-injection detection; falls back to a regex heuristic without `transformers`/`torch`. Not started automatically, unrelated to the Node MCP/launcher stack.
- `docs/` — architecture and feature docs (RAG, memory system, network diagnostics, deployment, Notepad++ integration).
- `SECURITY.md`, `AGENTS.md`, `QWEN.md` — related/parallel instruction and security docs at the repo root; keep in sync if you change security behavior or agent-facing conventions described here.

## Development commands

Run from the project root unless noted.

```powershell
# MCP server — install, test, syntax check
cd mcp-server
npm ci
npm test                          # node --test (all files in mcp-server/test/)
node --test test/security.test.js # run a single test file
node --test --test-name-pattern "sanitize"

# V10 launcher (Node.js backend) — syntax check and start
node --check v10\launcher.js
cd v10
npm install
npm start                         # development backend on 127.0.0.1:7777

# Unified validation (preferred)
node scripts\validate.mjs              # quick + npm test + PS syntax + HTML smoke
node scripts\validate.mjs --depth=ci   # CI-friendly JSON output
node scripts\validate.mjs --depth=quick # fast static checks only

# Ollama connectivity/model smoke check
node scripts\test_ollama.mjs

# Legacy validation scripts (kept for reference)
.\validate-v11.ps1               # PowerShell syntax/style only
.\validate_all.ps1                # JSON/HTML smoke only

# PowerShell parse check for a single file
[System.Management.Automation.Language.Parser]::ParseFile("MestreDoPC-Launcher.ps1", [ref]$null, [ref]$null)

# Browser extension build
cd browser-extension
node build.js chrome
node build.js firefox

# Shortcut-style full activation (starts Ollama + launcher + browser)
.\start-mestre-v10.ps1

# Interactive update/activation (git pull, deps, tests, launcher, scheduled tasks)
.\ativar-atualizar-tudo.ps1
```

CI (`.github/workflows/ci.yml`) runs on `windows-latest` against Node 20.x and 22.x:
`npm ci && npm test` in `mcp-server/`, then `node --check` on `v10/launcher.js`,
`mcp-server/index.js`, and `mcp-server/security.js`.

Tests use Node's built-in test runner (no external framework). `mcp-server/test/`
is split by concern:
- `security.test.js` — argument sanitization and PowerShell metacharacter rejection
- `launcher-security.test.js` — origin validation and `X-Mestre-Client` enforcement
- `whitelist-enforcement.test.js` — operation-whitelist enforcement and registry mapping
- `browser-extension.test.js` — extension integration
- `notepad-plus-plus.test.js` — Notepad++ integration
- `ollama-config.test.js` — model profiles and env-var configuration
- `ollama-smoke-script.test.js` — Ollama smoke checks
- `chat-permissions.test.js` — chat permission boundaries
- `prompt-guard.test.js` — prompt-injection detection
- `project-smoke.test.js` — project structure smoke tests
- `v11-security.test.js` — V11-specific security validations
- `v11-1-novos-tools.test.js` — V11.1 MCP tools

## Architecture

```
MCP Client (Claude Desktop / Copilot / other MCP-compatible agent)
    │  stdio (MCP protocol)
    ▼
mcp-server/index.js              ← non-elevated; calls launcher over HTTP
    │  POST /run  (X-Mestre-Client: mcp, no Origin header)
    ▼
v10/launcher.js                  ← Node.js HTTP backend on 127.0.0.1:7777
    │  validates request against v10/allowed-operations.json
    │  spawns powershell.exe, tracks the run as a job
    ▼
PowerShell                        ← only whitelisted commands ever execute
```

Key flows:

- **Command execution**: client `POST /run` (`{id}` or `{id, params}`) → `operation-registry.js:resolve()` → spawn `powershell.exe` → return `jobId`; client polls `GET /run-status?id=<jobId>`.
- **Classification**: `POST /classify` returns `{allowed, destructive, id, title, category, cmd}` so the UI/MCP can require confirmation for destructive operations.
- **AI chat**: `POST /ollama/chat` runs `checkPromptInjection()` then proxies streaming to Ollama (local `127.0.0.1:11434` or cloud via `OLLAMA_API_KEY`).
- **Memory**: chat uses IndexedDB locally and syncs to `/memories/*`, persisted in `v10/data/memories/chat-memories.json`.
- **Modo Livre**: `POST /modo-livre` toggles opt-in; `POST /run-free` then accepts any PowerShell command and logs at `SECURITY` level. Off by default.

**Key design decisions:**
- The MCP server **never** executes commands directly; every administrative action goes through a launcher, which polls back via `/run-status`.
- `v10/operation-registry.js` is the single source of truth. It reads `v10/allowed-operations.json` and exposes:
  - `resolve(body)` — validates `{id}` / `{id, params}` / `{cmd}` against exact operations and compiled regex templates.
  - `buildMcpToolRegistry()` — builds the legacy-style `mestreTools` map for the MCP server.
  - `buildMcpToolSchemas(extraTools)` — builds the MCP `inputSchema` for every whitelisted tool automatically from `{{PLACEHOLDER}}` tokens.
- The launcher supports two invocation shapes: `{id}` for parameterless operations, and `{id, params}` for templated operations where `{{PLACEHOLDER}}` tokens are substituted after per-parameter regex validation.
- Ollama is called directly by the MCP server and by the launcher for AI tools; the launcher proxies chat streaming.
- `v10/launcher.js` also exposes an optional `/npp` endpoint for the Notepad++ integration (`docs/notepad-plus-plus-integration.md`), gated by `X-Mestre-Client: notepad-plus-plus` + `X-Mestre-Npp-Token`, disabled (501) unless `MESTRE_NPP_TOKEN` is set.
- `v10/soul-routes.js` serves the `/soul*` routes behind the same client authorization, letting `/gerenciar-comandos.html` (tab "Perfil do Agente") read and edit the agent persona files (`v10/chat/Soul.md` and the workspace `SOUL.md`). Only the fixed profile IDs `chat` and `workspace` are accepted — never an arbitrary path. Writes are capped at 256 KB, save the previous file as `.bak`, and are audited at `SECURITY` level.
- The launcher caps concurrency at 3 simultaneous jobs, enforces a 15-minute timeout per job, and retains jobs for 30 minutes.
- All HTTP responses include `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`; the UI's CSP sets `frame-ancestors 'none'`.

## Security model (hard rules)

- **Never** pass user input directly into PowerShell. Every argument goes through `sanitizeToolArgument()` in `mcp-server/security.js`, which rejects anything outside `[a-zA-Z0-9_. -]` (max 128 chars).
- **Never** add free-form commands to the normal catalog. Every operation must be registered in `v10/allowed-operations.json` with an `id` and `command` (or a `pattern` + `params` for templated ones); AI-suggested or user-typed commands outside that catalog are rejected outright. The separate `/run-free` endpoint (Modo Livre) exists only as an explicit opt-in escape hatch and logs at `SECURITY` level.
- **Never** re-enable `file://` access to the UI, restore CORS `*`, or remove origin validation on POST endpoints. Requests are authorized by `X-Mestre-Client`: `mcp` (no Origin), `v10-web` (Origin must equal `BASE_URL`), `browser-extension` (+ `X-Mestre-Extension-Token`), or `notepad-plus-plus` (+ `X-Mestre-Npp-Token`).
- Destructive operations (`desativar_servico`, `encerrar_processo`, `limpar_*`, etc.) and any AI-suggested command require explicit user confirmation before execution.
- `checkPromptInjection()` in `security.js` scores prompts against ~10 pattern categories (ignore-instructions, persona override, system-prompt leak, privilege escalation, etc.) before they reach Ollama; classifies as `benigno` / `suspeito` / `malicioso`.
- Use `MESTRE_PROJETO_PATH`; never write personal/absolute paths into the HTML or scripts.

## Adding a new operation

1. Add an entry to `v10/allowed-operations.json` — `id`, `title`, `category`, `destructive`, `description`, and `command` (or `pattern` + `params` with anchored regex per placeholder for templated ones).
2. Do **not** edit `mcp-server/index.js` to add the tool. The `mestreTools` map and `TOOLS` array are built dynamically from `v10/operation-registry.js`.
3. Add or update tests in `mcp-server/test/` (at minimum a whitelist-enforcement check and a `/classify` or `/run` contract test).
4. Run `node scripts\validate.mjs --depth=full` (or `npm test` in `mcp-server/`, `node --check v10\launcher.js`, and `.\validate-v11.ps1`).
5. If the operation is destructive or unusual, document it in `docs/` or `CHANGELOG-V11.md`.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `MESTRE_BASE_URL` | `http://127.0.0.1:7777` | Launcher endpoint used by the MCP server |
| `MESTRE_PROJETO_PATH` | launcher directory | Project root for git/log/tools. **Always use this instead of hardcoding personal paths.** |
| `MESTRE_AUDIT_LOG_DIR` | `logs/audit` | Audit log directory |
| `MESTRE_EXTENSION_TOKEN` | *(empty)* | Auth token for the browser extension (`X-Mestre-Client: browser-extension`) |
| `MESTRE_EXTENSION_ORIGINS` | *(empty)* | Comma-separated allowed origins for the browser extension |
| `MESTRE_NPP_TOKEN` | *(empty)* | Auth token for the Notepad++ integration; `/npp` returns 501 until this is set |
| `MESTRE_MODO_LIVRE` | *(empty)* | Set to `1` to enable Modo Livre on startup (persisted in `logs/config/modo-livre.json`) |
| `MESTRE_SOUL_DIR` | *(empty)* | Base directory for agent persona files served by `/soul*` (used by tests to isolate writes; defaults: `v10/chat/Soul.md` and `%USERPROFILE%/SOUL.md`) |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama API base (auto-switches to `https://ollama.com/api` when `OLLAMA_API_KEY` is set) |
| `OLLAMA_API_KEY` | *(empty)* | Enables Ollama Cloud mode + auth header |
| `OLLAMA_MODEL` | `qwen2.5-coder:1.5b` | Default model |
| `OLLAMA_MODEL_PROFILE` | *(empty)* | Selects a preset from `mcp-server/model-profiles.json` (fast, balanced, agent, coding, reasoning) |
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

- Conventional commits (`fix:`, `feat:`, `docs:`, `chore:`, `security:`).
- User-visible strings and documentation are in Brazilian Portuguese; keep English for protocol names, API identifiers, environment variables, and code symbols.
- JavaScript uses ES modules and `node:` imports for built-ins. The V10 UI has no bundler or frontend build step; edit the served HTML/CSS/JS directly.
- Keep `v10/chat/chat-module.js`, `chat-template.html`, and `chat-styles.css` aligned when changing chat UI behavior or markup structure.
- Keep the MCP (non-elevated) / launcher (elevated) split intact — the MCP server must never run commands itself.
- `mcp-server/package.json` pins transitive dependencies via an `overrides` block (fast-uri, hono, @hono/node-server, ip-address, path-to-regexp, qs, body-parser). `npm audit fix` alone won't bump overridden packages — update the `overrides` versions by hand, then `npm install && npm test`.
- PowerShell commands in `allowed-operations.json` use `-ErrorAction SilentlyContinue` (`-EA 0`) for non-critical cleanup steps.
- Validate PowerShell scripts with `node scripts\validate.mjs --depth=full` (or `.\validate-v11.ps1`) before committing.
- Audit logging uses 7 levels (`INFO`, `WARNING`, `ERROR`, `SECURITY`, `COMMAND_EXEC`, `IA_OPERATION`, `WEBHOOK`) with rotation (10 MB max, 30 files retained) and redacts sensitive data.

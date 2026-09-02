# Copilot Instructions for Mestre do PC V10/V11

## Installation and activation

### First-time installation

```powershell
# 1. Clone the repository
git clone https://github.com/jeanavila997-ux/Mestre-do-PC-V10.git
cd Mestre-do-PC-V10

# 2. Install MCP server dependencies (uses pinned transitive versions)
cd mcp-server
npm ci

# 3. Install V10/V11 launcher dependencies
cd ..\v10
npm install
```

Or run the automated installer as Administrator:

```powershell
pwsh -ExecutionPolicy Bypass -File install.ps1
```

### Manual activation after opening the shortcut

The desktop shortcut **only opens the app**. After opening the shortcut, activation is performed manually by the user.

1. Open the desktop shortcut for Mestre do PC V10.
2. The shortcut launches `start-mestre-v10.ps1`, which starts Ollama (if present), starts the Node.js launcher on `127.0.0.1:7777`, and opens the browser.
3. If you prefer a fully manual update-and-activation workflow, run:
   ```powershell
   cd <project-root>
   .\ativar-atualizar-tudo.ps1
   ```
   This script pauses for confirmation before each major step (elevation, `git pull`, dependency install, tests, launcher start).

### Production/scheduled activation

For a background launcher that survives logoffs, register the scheduled task `MestreDoPC_Admin_Launcher` with `RunLevel Highest`. The helper `mcp-server\start-launcher.ps1` starts the Node.js launcher manually for development.

## Build, test, and lint

All commands run from the project root (`Mestre-do-PC-V10/`).

```powershell
# Unified validation (preferred entry point)
node scripts\validate.mjs                 # quick + npm test + PS syntax + HTML smoke
node scripts\validate.mjs --depth=full    # full checks
node scripts\validate.mjs --depth=ci      # CI-friendly JSON output

# MCP server — install dependencies and run the full suite
cd mcp-server
npm ci
npm test                          # node --test (all files under test/)

# Run a single test file
node --test test/security.test.js
node --test test/whitelist-enforcement.test.js
# Run a single test by name
node --test --test-name-pattern "sanitize"

# Syntax-check JS entry points
node --check mcp-server\index.js
node --check mcp-server\security.js
node --check mcp-server\audit-logger.js
node --check v10\launcher.js
node --check v10\operation-registry.js

# Validate PowerShell scripts (all .ps1 files under the project root)
.\validate-v11.ps1

# Project-wide smoke validation (JSON/HTML checks)
.\validate_all.ps1

# Ollama connectivity/model smoke check
node scripts\test_ollama.mjs

# Build the browser extension bundle
cd browser-extension
node build.js chrome
node build.js firefox
```

The MCP test suite lives in `mcp-server/test/` and is organized by concern:
- `security.test.js` — argument sanitization and PowerShell metacharacter rejection
- `prompt-guard.test.js` — prompt-injection detection
- `launcher-security.test.js` — origin validation and `X-Mestre-Client` enforcement
- `ollama-config.test.js` — model profiles and env-var configuration
- `browser-extension.test.js` — extension integration
- `chat-permissions.test.js` — chat permission boundaries
- `whitelist-enforcement.test.js` — operation-whitelist enforcement
- `v11-security.test.js` — V11-specific security validations
- `v11-1-novos-tools.test.js` — five new V11.1 MCP tools
- `notepad-plus-plus.test.js` — Notepad++ integration
- `ollama-smoke-script.test.js` — Ollama smoke checks
- `project-smoke.test.js` — project structure smoke tests

Run one file with `node --test test/<file>.js`. CI (`.github/workflows/ci.yml`) runs on Windows with Node 22.x and 24.x, executing `npm ci && npm test` in `mcp-server/` plus `node --check` on `v10/launcher.js`, `mcp-server/index.js`, and `mcp-server/security.js`.

## Architecture

```
MCP Client (Claude Desktop / Codex / Copilot / Copilot CLI)
    │  stdio (MCP protocol)
    ▼
mcp-server/index.js          ← non-elevated, 36+ tools
    │  HTTP POST to 127.0.0.1:7777/run
    │  (X-Mestre-Client: mcp header required)
    ▼
v10/launcher.js               ← primary Node.js HTTP backend (same port/protocol)
    │  validates against allowed-operations.json
    │  spawns powershell.exe with job tracking
    ▼
PowerShell                    ← only whitelisted commands execute
```

**Key design decisions:**
- The MCP server **never** runs commands directly. All administrative operations go through the launcher on `127.0.0.1:7777`.
- The launcher validates every command against `v10/allowed-operations.json`. Free-form or AI-generated commands are rejected.
- The primary backend in this repository is `v10/launcher.js` — a pure Node.js HTTP server on port 7777. Start it with `cd v10 && npm start` (development) or via `mcp-server\start-launcher.ps1`.
- `v10/operation-registry.js` is the single source of truth: it loads `v10/allowed-operations.json` and exposes `resolve()`, `buildMcpToolRegistry()`, and `buildMcpToolSchemas()`. Both the launcher and the MCP server derive their tool lists from this module.
- `MestreDoPC-Launcher.ps1` is the legacy elevated PowerShell backend and still exists, but it is not the default path. Do not recreate it unless explicitly required.
- The Node.js backend enforces the same security model as the legacy PowerShell backend: origin validation, required `X-Mestre-Client` header, and the operation whitelist.
- Ollama runs at `127.0.0.1:11434`. The MCP server calls it directly for AI tools; the launcher proxies chat streaming but is not involved in command execution.
- Parameterized templates in `allowed-operations.json` use `{{UPPERCASE_NAME}}` placeholders. The launcher compiles them into anchored regexes with named groups and validates each parameter against its declared regex before substitution.
- The Node.js backend supports `{id}` for exact operations and `{id, params}` for parameterized templates. Jobs are tracked with a max of 3 concurrent, a 15-minute timeout, and 30-minute retention.

**Other components:**
- `v10/index.html` — single-file SPA (no build step), served by the launcher. Uses CSS custom properties and vanilla JS; the `CATS` array defines command categories, and `renderCards()` renders cards (V11 cards get neon-green glow via `.cmd-card-new`).
- `v10/chat/` — reusable chat module, synchronized template/styles, and Ollama streaming integration. Keep `chat-module.js` and `chat-template.html` aligned when changing the chat markup.
- `browser-extension/` — Manifest V3 Chrome/Firefox extension. It talks to the launcher with `X-Mestre-Client: browser-extension` and a token from `MESTRE_EXTENSION_TOKEN`. Build with `cd browser-extension && node build.js`; prebuilt zips live in `browser-extension/dist/`.
- `v10/notepad-plus-plus/` — Notepad++ integration for explaining code, asking the AI, suggesting commands, and generating diagnostics. See `docs/notepad-plus-plus-integration.md`.
- `v10/rede-dashboard.js` — client-side network diagnostics panel loaded by `index.html`.
- `v10/memory-manager.js` + `v10/memory-routes.js` — persistent memory store. The UI keeps data in IndexedDB and syncs to `/memories/*`, persisted in `v10/data/memories/chat-memories.json`.
- `mcp-server/auth/local-token.js`, `mcp-server/db/mcp-db-tools.js`, and `mcp-server/transports/` — local authentication, MySQL/MariaDB tools, and transport implementations. Database tools are gated by `MESTRE_LOCAL_MCP_TOKEN`; they remain disabled when the token is unset.
- `mcp-server/prompt-guard-server.py` — optional Python microservice on `127.0.0.1:7778/classify` for prompt-injection detection. It falls back to the regex heuristic in `security.js` if `transformers`/`torch` are unavailable. Not started automatically; unrelated to the Node MCP/launcher stack.
- `testsprite-plans/` and `testsprite-backend/` — TestSprite frontend plans and Python backend smoke tests ready for integration once the launcher is running. These are not executed by `npm test`; see `ONBOARD_TESTSPRITE.md`.

## Security model (hard rules)

- **Never** pass user input directly into PowerShell. All arguments go through `sanitizeToolArgument()` in `mcp-server/security.js`, which rejects anything outside `[a-zA-Z0-9_. -]` (max 128 chars).
- **Never** add free-form commands. Every operation must be registered in `v10/allowed-operations.json` with an `id`, `title`, `category`, `command`, and `destructive` flag.
- **Never** re-enable `file://` access to the UI, restore CORS `*`, or remove origin validation on POST endpoints. The launcher only accepts requests with:
  - `X-Mestre-Client: mcp` (no origin required), or
  - `X-Mestre-Client: v10-web` with origin matching `BASE_URL`, or
  - `X-Mestre-Client: browser-extension` plus a valid `X-Mestre-Extension-Token`.
- Destructive operations (`desativar_servico`, `encerrar_processo`, `limpar_*`) require user confirmation in the UI.
- The `checkPromptInjection()` function in `security.js` scans AI prompts for injection/jailbreak patterns (10 weighted categories) before they reach Ollama.
- The Node.js backend returns security headers on every response: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`. The UI's CSP includes `frame-ancestors 'none'`.

## Adding a new operation

1. Add an entry to `v10/allowed-operations.json` with `id`, `title`, `category`, `destructive`, `command`, and `description`.
2. For parameterized commands, use `{{UPPERCASE_NAME}}` placeholders and define `params` with regex validation per parameter. Keep regex anchored (`^...$`).
3. The MCP server derives its tool list automatically from `v10/operation-registry.js`, which reads `v10/allowed-operations.json`. **Do not** add a manual entry to `mcp-server/index.js`; the `mestreTools` object is built dynamically.
4. Add or update tests in `mcp-server/test/` (at minimum a whitelist-enforcement check and a `/classify` or `/run` contract test).
5. Run `npm test` in `mcp-server/`, `node --check v10\launcher.js`, and `.\validate-v11.ps1`.
6. If the operation is destructive or unusual, add it to `docs/` or update `CHANGELOG-V11.md`.

## Contributing workflow

1. Create a branch from `main`.
2. Make small, documented changes.
3. Run `npm ci && npm test` in `mcp-server/` and `node --check v10\launcher.js`.
4. Do not add free-form commands; new operations must be added to the catalog and receive a security review.
5. Open a pull request describing risk, impact, and rollback steps.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `MESTRE_BASE_URL` | `http://127.0.0.1:7777` | Launcher endpoint used by the MCP server |
| `MESTRE_PROJETO_PATH` | launcher directory | Project root for git/log/export tools. **Always use this instead of hardcoding personal paths.** |
| `MESTRE_AUDIT_LOG_DIR` | `logs/audit` | Audit log directory |
| `MESTRE_EXTENSION_TOKEN` | *(empty)* | Auth token for the browser extension (`X-Mestre-Client: browser-extension`) |
| `MESTRE_EXTENSION_ORIGINS` | *(empty)* | Comma-separated allowed extension origins |
| `MESTRE_NPP_TOKEN` | *(empty)* | Auth token for Notepad++ integration; `/npp` returns 501 until this is set |
| `MESTRE_MODO_LIVRE` | *(empty)* | Set to `1` to enable Modo Livre on startup (persisted in `logs/config/modo-livre.json`) |
| `MESTRE_SOUL_DIR` | *(empty)* | Base directory for agent persona files served by `/soul*` (used by tests to isolate writes; defaults: `v10/chat/Soul.md` and `%USERPROFILE%/SOUL.md`) |
| `MESTRE_LOCAL_MCP_TOKEN` | *(empty)* | Enables local MySQL/MariaDB MCP tools in `mcp-server/db/mcp-db-tools.js`; database tools stay disabled when unset |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama API base URL. Switches to `https://ollama.com/api` automatically when `OLLAMA_API_KEY` is set |
| `OLLAMA_API_KEY` | *(empty)* | API key for Ollama Cloud; activates cloud mode and adds an auth header |
| `OLLAMA_MODEL` | `qwen2.5-coder:3b-instruct` | Default model |
| `OLLAMA_MODEL_PROFILE` | *(empty)* | Selects a preset from `mcp-server/model-profiles.json`: `fast`, `balanced`, `agent`, `coding`, `reasoning` |
| `OLLAMA_TEMPERATURE` | `0.7` | Sampling temperature |
| `OLLAMA_TOP_P` | `0.9` | Nucleus sampling |
| `OLLAMA_TOP_K` | `40` | Top-K sampling |
| `OLLAMA_NUM_PREDICT` | `0` (unlimited) | Max tokens in the response |
| `OLLAMA_NUM_CTX` | `8192` | Context window (tokens) |
| `OLLAMA_SEED` | `0` (random) | Seed for reproducibility |
| `OLLAMA_KEEP_ALIVE` | `5m` | Time the model stays in memory after use |
| `MPC_PORT` | `7777` | Launcher port (Node.js backend and tests) |
| `MPC_HOST` | `127.0.0.1` | Launcher bind address |

Explicit `OLLAMA_*` values override the selected profile. Always use `MESTRE_PROJETO_PATH` rather than hardcoding paths in HTML, PowerShell, or JS.

## Conventions

- Use conventional commits (`fix:`, `feat:`, `docs:`, `chore:`, `security:`).
- User-visible strings and documentation are normally written in Brazilian Portuguese; preserve English for protocol names, API identifiers, environment variables, and code symbols.
- JavaScript uses ES modules and `node:` imports for built-ins. The V10 UI has no bundler or frontend build step; edit the served HTML/CSS/JS directly.
- Keep the MCP (non-elevated) / launcher (elevated) split. The MCP server only ever calls the launcher over HTTP; it does not spawn PowerShell.
- `mcp-server/package.json` uses an `overrides` block to pin transitive dependencies (fast-uri, hono, @hono/node-server, ip-address, path-to-regexp, qs, body-parser) to patched versions. `npm audit fix` alone cannot bump overridden packages — update the `overrides` versions manually, then run `npm install` and `npm test`.
- The UI (`v10/index.html`) is a single-file app with no build step. All CSS is inline, uses CSS custom properties (`--accent`, `--card`, etc.), and vanilla JS. The `CATS` array defines categories; V11 cards use `.cmd-card-new` with `@keyframes neonGreenPulse`/`neonGreenTextGlow`/`neonGreenBtnGlow`.
- PowerShell commands in `allowed-operations.json` use `-ErrorAction SilentlyContinue` (abbreviated `-EA 0`) for non-critical cleanup steps.
- Validate changes before committing with `node scripts\validate.mjs --depth=full` (or `.\validate-v11.ps1` for PowerShell-only checks).
- The launcher enforces job concurrency (max 3 simultaneous jobs), a 15-minute timeout per job, and 30-minute job retention.
- Audit logging uses 7 levels (`INFO`, `WARNING`, `ERROR`, `SECURITY`, `COMMAND_EXEC`, `IA_OPERATION`, `WEBHOOK`) with rotation (10 MB max, 30 files retained) and redacts sensitive data.
- The UI's CSP includes `frame-ancestors 'none'`; all launcher responses include `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `Cache-Control: no-store`.
- Legacy `MestreDoPC-Launcher.ps1` PowerShell backend still exists but is no longer the default path. Treat it as historical; do not recreate it unless explicitly required.

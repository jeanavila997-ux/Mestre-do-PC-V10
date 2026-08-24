# Repository Guidelines

## Project Overview

**Mestre do PC V10/V11** is a local Windows desktop automation harness. It exposes whitelisted PowerShell maintenance operations through a web UI, an MCP server (Claude/Copilot), a browser extension, and a Notepad++ plugin. The system is designed so that **AI clients never run shell code directly**; every administrative command is validated against a strict whitelist before execution.

- User-facing language: Brazilian Portuguese.
- Code identifiers / protocol names: English.
- License: MIT (see `LICENSE`).

## Architecture & Data Flow

```text
AI clients (Claude Desktop / Copilot CLI / browser / Notepad++)
    │  stdio (MCP) or HTTP
    ▼
mcp-server/index.js          ← non-elevated, AI-facing bridge
    │  POST {id, params?} or {cmd}
    │  header: X-Mestre-Client: mcp
    ▼
v10/launcher.js              ← Node.js HTTP backend, 127.0.0.1:7777
    │  validates origin + header, resolves via operation-registry.js
    ▼
powershell.exe               ← only allowed-operations.json commands execute
```

Key flows:

- **Command execution**: client `POST /run` → `registry.resolve()` → spawn `powershell.exe` → return `jobId`; client polls `GET /run-status?id=<jobId>`.
- **AI chat**: `POST /ollama/chat` → `guardChatInjection()` with `checkPromptInjection()` → proxy streaming to Ollama (local `127.0.0.1:11434` or cloud via `OLLAMA_API_KEY`).
- **Command classification**: `POST /classify` returns `{allowed, destructive, id, title, category, cmd}` so the UI can require confirmation for destructive operations.
- **Free-command mode**: `POST /modo-livre` toggles opt-in; `POST /run-free` then accepts any PowerShell command but logs at `SECURITY` level.
- **Memory**: chat module uses IndexedDB locally and syncs to `/memories/*` endpoints, persisted in `v10/data/memories/chat-memories.json`.

## Key Directories

| Directory | Purpose |
|---|---|
| `v10/` | Node.js launcher (`launcher.js`), operation registry, vanilla-JS SPA (`index.html`), chat module, memory manager/routes, network dashboard. |
| `mcp-server/` | MCP stdio server, shared security (`security.js`), audit logging (`audit-logger.js`), model profiles, test suite. |
| `browser-extension/` | Manifest V3 extension packager and source. |
| `docs/` | Portuguese/English docs: architecture, memory system, Notepad++ integration, RAG, deployment, etc. |
| `testsprite-backend/` | Python smoke tests for a running launcher. |
| `testsprite-plans/` | TestSprite frontend UI automation plans. |
| `startup/` | Logon startup PowerShell script. |

## Development Commands

Run all commands from the repo root unless noted.

### Start the stack

```powershell
# Launcher (port 7777)
cd v10
npm install
npm start

# MCP server (stdio; register with Claude Desktop / Copilot)
cd mcp-server
npm ci
npm start
```

### Run tests

```powershell
# MCP / launcher test suite
cd mcp-server
npm ci
npm test

# Single file
node --test test/security.test.js
node --test test/whitelist-enforcement.test.js

# Single test by name
node --test --test-name-pattern "sanitize"

# Python backend smoke tests (require launcher running)
cd testsprite-backend
python test_ping.py
python test_status.py
python test_run_safe_command.py
python test_run_blocked_command.py
```

### Validate and lint

```powershell
# PowerShell syntax/style checks
.\validate-v11.ps1

# JSON/HTML structural smoke checks
.\validate_all.ps1

# JS syntax checks
node --check v10\launcher.js
node --check mcp-server\index.js
node --check mcp-server\security.js
```

### Build browser extension

```powershell
cd browser-extension
node build.js chrome
node build.js firefox
```

### Full activation/update

```powershell
.\ativar-atualizar-tudo.ps1   # interactive; runs git pull, deps, tests, starts launcher, registers tasks
.\start-mestre-v10.ps1       # shortcut-style: starts Ollama + launcher + browser
```

## Code Conventions & Common Patterns

- **ES modules everywhere** (`"type": "module"` in `package.json` files); use `node:` prefixes for built-ins.
- **Single source of truth**: operations are declared once in `v10/allowed-operations.json` and consumed through `v10/operation-registry.js` by both the launcher and the MCP server.
- **Parameterized commands**: templates use `{{UPPERCASE_NAME}}` placeholders with a per-parameter anchored regex, e.g. `"params": { "nome": "^[a-zA-Z0-9_. -]{1,128}$" }`.
- **Argument sanitization**: `mcp-server/security.js::sanitizeToolArgument` accepts only `[a-zA-Z0-9_. -]+` (max 128) and **rejects** (never strips) dangerous input.
- **Prompt-injection guard**: `checkPromptInjection()` returns `benigno`, `suspeito`, or `malicioso`; only `malicioso` blocks.
- **Async patterns**: top-level `await` at module load; `fetch` with `AbortSignal.timeout`; Promise-based job polling; stdout/stderr accumulation via `data` event listeners for PowerShell jobs.
- **Security headers**: every launcher response sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`; HTML CSP includes `frame-ancestors 'none'`.
- **PowerShell environment**: `cleanPSEnv()` rebuilds `PSModulePath` to avoid MSIX PS7 pollution; commands spawn with `-NoProfile -ExecutionPolicy Bypass`.
- **Audit logging**: `mcp-server/audit-logger.js` writes JSON lines with 7 levels (`INFO`, `WARNING`, `ERROR`, `SECURITY`, `COMMAND_EXEC`, `IA_OPERATION`, `WEBHOOK`), 10 MB rotation, 30-file retention, and redacts sensitive keys.

## Important Files

### Entry points

- `v10/launcher.js` — Node.js HTTP backend (`127.0.0.1:7777`).
- `mcp-server/index.js` — MCP stdio server.
- `browser-extension/build.js` — extension packager.

### Core modules

- `v10/operation-registry.js` — loads `v10/allowed-operations.json`, compiles parameterized templates, resolves commands, builds MCP tool registry/schemas.
- `mcp-server/security.js` — `sanitizeToolArgument`, `checkPromptInjection`.
- `mcp-server/audit-logger.js` — audit log writer/query helpers.
- `v10/chat/chat-module.js` — `MestreChat` class (streaming, memory, attachments, command confirmation).
- `v10/memory-manager.js` — memory CRUD, search/relevance, export/import.
- `v10/memory-routes.js` — HTTP route handlers for `/memories/*`.
- `v10/rede-dashboard.js` — network diagnostics panel.

### Configuration / catalogs

- `v10/allowed-operations.json` — command whitelist (exact + parameterized templates).
- `mcp-server/model-profiles.json` — Ollama model presets (`fast`, `balanced`, `agent`, `coding`, `reasoning`, `dialogue`, `transcription`).
- `.github/workflows/ci.yml` — GitHub Actions workflow.

## Runtime/Tooling Preferences

- **Runtime**: Node.js **20.x or 22.x** (CI matrix).
- **Package manager**: npm. Use `npm ci` in `mcp-server/` (lockfile-backed with `overrides`), `npm install` in `v10/` and `browser-extension/`.
- **OS**: Windows 10/11 64-bit. PowerShell 5.1 is the execution target.
- **Optional AI backend**: Ollama local on `127.0.0.1:11434`, or cloud via `OLLAMA_API_KEY` (switches to `https://ollama.com/api`).
- **Environment variables** (never hardcode paths):
  - `MESTRE_BASE_URL` — launcher endpoint (default `http://127.0.0.1:7777`).
  - `MESTRE_PROJETO_PATH` — project root for git/log/export tools.
  - `MESTRE_EXTENSION_TOKEN`, `MESTRE_NPP_TOKEN` — auth tokens for integrations.
  - `OLLAMA_MODEL`, `OLLAMA_MODEL_PROFILE`, `OLLAMA_*` options.

## Testing & QA

### Frameworks

- **Node tests**: built-in `node:test` + `node:assert/strict` under `mcp-server/test/`.
- **Python smoke tests**: plain `requests` + `assert` under `testsprite-backend/`.

### Test organization (`mcp-server/test/`)

| File | Concern |
|---|---|
| `security.test.js` | Argument sanitization |
| `prompt-guard.test.js` | Prompt-injection classification |
| `launcher-security.test.js` | CORS, CSP, headers, origin enforcement, id+params execution |
| `whitelist-enforcement.test.js` | Catalog consistency, `/classify`, registry mapping |
| `ollama-config.test.js` | Model profiles and env-var configuration |
| `chat-permissions.test.js` | Chat guard, attachments, CSP |
| `browser-extension.test.js` | Extension token / origin enforcement |
| `notepad-plus-plus.test.js` | `/npp` auth and action allowlist |
| `v11-security.test.js` | Additional injection/sanitize coverage |
| `v11-1-novos-tools.test.js` | V11.1 specialized MCP tools |
| `project-smoke.test.js` | HTML/JS structure assertions |
| `ollama-smoke-script.test.js` | `scripts/test_ollama.mjs` behavior; live test gated by `RUN_OLLAMA_SMOKE` |

### Common test patterns

- Ephemeral launcher:
  ```js
  const child = spawn(process.execPath, [join(root, "v10", "launcher.js")], {
    env: { ...process.env, MPC_PORT: String(port) },
    windowsHide: true,
    stdio: "ignore",
  });
  t.after(() => child.kill());
  ```
- Reserve a free port with `node:net.createServer().listen(0, "127.0.0.1")`.
- Poll `/ping` with `waitForServer(url)` up to 10 s.
- Source-text regression guards: many tests read source files and assert required/forbidden strings.

### CI

`.github/workflows/ci.yml` runs on `windows-latest` for Node 20.x/22.x:

1. `cd mcp-server && npm ci`
2. `cd mcp-server && npm test`
3. `node --check` on `v10/launcher.js`, `mcp-server/index.js`, `mcp-server/security.js`.

### Coverage

No coverage tooling is currently configured; tests focus on security invariants and high-level contracts.

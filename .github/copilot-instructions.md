# Copilot Instructions for Mestre do PC V10

## Build, test, and lint

All commands run from the project root (`Mestre-do-PC-V10-clean/`).

```powershell
# MCP server — install, test, syntax check
cd mcp-server
npm ci
npm test                          # node --test (all test files)
node --test test/security.test.js # run a single test file
node --check index.js
node --check security.js

# V10 launcher — syntax check
node --check v10\launcher.js

# Validate PowerShell scripts
$code = Get-Content .\MestreDoPC-Launcher.ps1 -Raw
[System.Management.Automation.Language.Parser]::ParseFile("MestreDoPC-Launcher.ps1", [ref]$null, [ref]$null)

# Project-wide validation (PowerShell parse + JS syntax + MCP tests)
.\validate_all.ps1
```

The MCP test suite lives in `mcp-server/test/` and is split by concern: `security.test.js`, `launcher-security.test.js`, `browser-extension.test.js`, `ollama-config.test.js`, `prompt-guard.test.js`, `project-smoke.test.js`. Run one file with `node --test test/<file>.js`.

CI (`.github/workflows/ci.yml`) runs on Windows with Node 20.x and 22.x: `npm ci && npm test` in `mcp-server/`, plus `node --check` on all JS files.

## Architecture

```
MCP Client (Claude Desktop / Codex / Copilot)
    │  stdio (MCP protocol)
    ▼
mcp-server/index.js          ← non-elevated, 33 tools
    │  HTTP POST to 127.0.0.1:7777/run
    │  (X-Mestre-Client: mcp header required)
    ▼
v10/launcher.js              ← elevated HTTP server on port 7777
    │  validates against allowed-operations.json
    │  spawns powershell.exe with job tracking
    ▼
PowerShell                    ← only whitelisted commands execute
```

**Key design decisions:**
- The MCP server **never** runs commands directly. All administrative operations go through the launcher.
- The launcher validates every command against `v10/allowed-operations.json` — free-form or AI-generated commands are rejected.
- Ollama runs at `127.0.0.1:11434`. The MCP server calls it directly for `perguntar_ia` and `analisar_logs_sistema`; the launcher is not involved in AI queries.
- The launcher supports two execution modes: `{id}` for simple operations and `{id, params}` for parameterized templates with `{{PLACEHOLDER}}` substitution validated by regex.

**Other components:**
- `browser-extension/` — Manifest V3 extension (Chrome + Firefox) that talks to the launcher with `X-Mestre-Client: browser-extension` and a token from `MESTRE_EXTENSION_TOKEN`. Built via `build.js`; prebuilt zips live in `browser-extension/dist/`.
- `v10/rede-dashboard.js` — client-side network diagnostics panel loaded by `index.html`.
- `mcp-server/prompt-guard-server.py` — optional Python microservice on `127.0.0.1:7778/classify` for prompt-injection detection (falls back to a regex heuristic if `transformers`/`torch` are absent). Not started automatically; unrelated to the Node MCP/launcher stack.

## Security model (hard rules)

- **Never** pass user input directly into PowerShell. All arguments go through `sanitizeToolArgument()` in `mcp-server/security.js`, which rejects anything outside `[a-zA-Z0-9_. -]` (max 128 chars).
- **Never** add free-form commands. Every operation must be registered in `v10/allowed-operations.json` with an `id`, `command`, and `destructive` flag.
- **Never** re-enable `file://` access to the UI, restore CORS `*`, or remove origin validation on POST endpoints. The launcher only accepts requests with `X-Mestre-Client: mcp` (no origin) or `X-Mestre-Client: v10-web` with origin matching `BASE_URL`.
- Destructive operations (`desativar_servico`, `encerrar_processo`, `limpar_*`) require user confirmation.
- The `checkPromptInjection()` function in `security.js` scans AI prompts for injection/jailbreak patterns before they reach Ollama.

## Adding a new operation

1. Add an entry to `v10/allowed-operations.json` with `id`, `title`, `category`, `destructive`, and `command`.
2. For parameterized commands, use `{{UPPERCASE_NAME}}` placeholders and define `params` with regex validation per parameter.
3. Add a corresponding entry in the `mestreTools` object in `mcp-server/index.js` with matching `id`, `description`, and `command`.
4. Add or update tests in `mcp-server/test/`.
5. Run `npm test` in `mcp-server/` and `node --check v10\launcher.js`.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `MESTRE_BASE_URL` | `http://127.0.0.1:7777` | Launcher endpoint |
| `MESTRE_PROJETO_PATH` | launcher directory | Project root for git/log tools |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama API (auto: `https://ollama.com/api` se `OLLAMA_API_KEY` definida) |
| `OLLAMA_API_KEY` | *(vazio)* | API key para Ollama Cloud (ollama.com) — ativa modo cloud + auth header |
| `OLLAMA_MODEL` | `qwen2.5-coder:1.5b` | Default model |
| `OLLAMA_MODEL_PROFILE` | *(vazio)* | Selects a preset from `mcp-server/model-profiles.json` (fast, balanced, agent, coding, reasoning); explicit `OLLAMA_*` vars override the profile |
| `MESTRE_EXTENSION_TOKEN` | *(vazio)* | Auth token for the browser extension (`X-Mestre-Client: browser-extension`) |
| `OLLAMA_NUM_CTX` | `8192` | Context window (tokens) |
| `OLLAMA_TEMPERATURE` | `0.7` | Creatividade (0=determinístico, 2=caótico) |
| `OLLAMA_TOP_P` | `0.9` | Nucleus sampling |
| `OLLAMA_TOP_K` | `40` | Top-K sampling |
| `OLLAMA_NUM_PREDICT` | `0` (ilimitado) | Máximo de tokens na resposta |
| `OLLAMA_SEED` | `0` (aleatório) | Seed para reprodutibilidade |
| `OLLAMA_KEEP_ALIVE` | `5m` | Tempo que o modelo fica em memória após uso |
| `MPC_PORT` | `7777` | Launcher port (used in tests) |
| `MPC_HOST` | `127.0.0.1` | Launcher bind address |

Always use `MESTRE_PROJETO_PATH` instead of hardcoding personal paths.

## Conventions

- Use conventional commits (`fix:`, `feat:`, `docs:`, `chore:`).
- Keep the MCP (non-elevated) / launcher (elevated) split — the MCP server never runs commands directly.
- `mcp-server/package.json` uses an `overrides` block to pin transitive dependencies (fast-uri, hono, @hono/node-server, ip-address, etc.) to patched versions. `npm audit fix` alone cannot bump overridden packages — update the `overrides` versions manually, then run `npm install` and `npm test`.
- The UI (`v10/index.html`) is a single-page app served by the launcher. It communicates with the launcher via `fetch` with `X-Mestre-Client: v10-web` header.
- PowerShell commands in `allowed-operations.json` use `-ErrorAction SilentlyContinue` (abbreviated `-EA 0`) for non-critical cleanup steps.
- The launcher enforces job concurrency (max 3 simultaneous jobs) and a 15-minute timeout per job.
- All responses include security headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
- The UI's CSP includes `frame-ancestors 'none'` to prevent clickjacking.

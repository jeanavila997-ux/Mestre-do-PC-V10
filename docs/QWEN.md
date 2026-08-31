# QWEN.md — Mestre do PC (V10/V11)

## Project Overview

**Mestre do PC** is a Windows diagnostic and maintenance application with a local web UI, MCP (Model Context Protocol) server, and optional Ollama AI integration. It runs entirely on `127.0.0.1:7777` and executes pre-registered PowerShell operations as an elevated administrator.

- **Languages/Stack:** PowerShell 5.1+ (elevated backend), Node.js 20+ (MCP server, alternative launcher), vanilla HTML/CSS/JS (frontend)
- **Current version:** V11 (branded as "V11 - Ultimate Plus" in the UI; package.json still says V10)
- **License:** MIT
- **Author:** Jeanc (JEAN)

### Architecture

```
Browser (http://127.0.0.1:7777)
  │
  ├── v10/index.html          Frontend UI (single-page, embedded CATS array + renderCards())
  ├── v10/launcher.js          Node.js alternative launcher (same port, same protocol)
  │
  ├── MestreDoPC-Launcher.ps1  Primary elevated PowerShell backend (HttpListener)
  │   ├── Serves index.html, novidades-v11.html, favicon
  │   ├── POST /run            Executes whitelisted operations as admin jobs
  │   ├── GET  /run-status     Polls job status
  │   └── GET  /ping           Health check
  │
  ├── mcp-server/index.js      MCP server (stdio) — 36 tools, talks to launcher via HTTP
  ├── mcp-server/security.js   Prompt injection detection + argument sanitization
  ├── mcp-server/audit-logger.js  Audit logging (7 levels, rotation)
  │
  ├── v10/allowed-operations.json  243+ whitelisted PowerShell operations (the security boundary)
  ├── browser-extension/      Manifest V3 Chrome/Firefox extension
  │
  └── Ollama (127.0.0.1:11434) Optional local/cloud AI
```

### Two-Backend Design

There are **two interchangeable backends** for port 7777:

1. **`MestreDoPC-Launcher.ps1`** (primary) — PowerShell `System.Net.HttpListener`, auto-elevates to admin. This is the production backend started by `start-mestre-v10.ps1` and `INSTALAR.bat`.
2. **`v10/launcher.js`** (alternative) — Pure Node.js HTTP server, same protocol and routes. Useful for development without admin rights. Run via `cd v10 && npm start`.

Both enforce the same security model: origin validation, `X-Mestre-Client` header check, and operation whitelist.

## Build & Run

### Prerequisites
- Windows 10/11 64-bit
- PowerShell 5.1+
- Node.js 20+
- Ollama (optional, for AI features)

### Install
```powershell
# From project root — requires admin
pwsh -ExecutionPolicy Bypass -File install.ps1
# With flags: -SkipNode -SkipMcpConfig -NoShortcuts -Quiet
```

### Start the app (production — PowerShell backend)
```powershell
# Starts Ollama + Launcher + opens browser
.\start-mestre-v10.ps1
# Or double-click:
.\INSTALAR.bat
```

### Start the app (development — Node.js backend)
```powershell
cd mcp-server && npm ci
cd ..\v10 && npm install && npm start
```

### Run MCP server
```powershell
cd mcp-server
npm start          # node index.js (stdio transport)
```

### Run tests
```powershell
cd mcp-server
npm ci && npm test          # node --test (built-in test runner)
```

### Syntax checks
```powershell
node --check mcp-server\index.js
node --check v10\launcher.js
# PowerShell validation:
[System.Management.Automation.Language.Parser]::ParseFile("MestreDoPC-Launcher.ps1", [ref]$null, [ref]$null)
```

### Validation scripts
```powershell
.\validate_all.ps1
.\validate-v11.ps1
```

## Key Files

| File | Purpose |
|------|---------|
| `MestreDoPC-Launcher.ps1` | Primary elevated PowerShell HTTP backend (port 7777) |
| `v10/launcher.js` | Alternative Node.js backend (same port/protocol) |
| `v10/index.html` | Main UI — 2375 lines, embedded CSS + JS, CATS array of command categories |
| `v10/allowed-operations.json` | **Security boundary** — 243+ whitelisted PowerShell operations + parametrized templates |
| `v10/novidades-v11.html` | V11 changelog/feature page |
| `mcp-server/index.js` | MCP stdio server — 36 tools (diagnostics, AI, webhooks, audit) |
| `mcp-server/security.js` | `sanitizeToolArgument()` + `checkPromptInjection()` |
| `mcp-server/audit-logger.js` | Audit logging with 7 levels, rotation (10MB/30 files) |
| `mcp-server/model-profiles.json` | Ollama model profiles: fast, balanced, agent, coding, reasoning |
| `browser-extension/` | Manifest V3 extension for Chrome/Firefox integration |
| `install.ps1` | Automated installer (admin required) |
| `start-mestre-v10.ps1` | Desktop shortcut activator (starts Ollama + Launcher + browser) |

## Testing

Tests use Node.js built-in test runner (`node --test`) — no external test framework. Test files live in `mcp-server/test/`:

| Test File | Coverage |
|-----------|----------|
| `security.test.js` | Argument sanitization, PowerShell metacharacter rejection |
| `prompt-guard.test.js` | Prompt injection detection patterns |
| `launcher-security.test.js` | Origin validation, client header checks |
| `ollama-config.test.js` | Ollama model profiles, env var configuration |
| `v11-security.test.js` | V11-specific security validations |
| `v11-1-novos-tools.test.js` | 5 new V11.1 MCP tools (gov domain validation, PDF extraction, etc.) |
| `browser-extension.test.js` | Extension integration tests |
| `project-smoke.test.js` | Project structure smoke tests |

## Security Model

This is a **security-critical** application. It executes PowerShell as admin. Key rules:

### Operation Whitelist
- The launcher **only** executes commands present in `v10/allowed-operations.json`
- Free-form AI-generated or manual commands are **rejected**
- Parametrized templates use named regex groups with per-parameter validation

### Request Authorization
- **Web UI:** `Origin: http://127.0.0.1:7777` + `X-Mestre-Client: v10-web`
- **MCP server:** No Origin + `X-Mestre-Client: mcp`
- **Browser extension:** `X-Mestre-Client: browser-extension` + `X-Mestre-Extension-Token` (from `MESTRE_EXTENSION_TOKEN` env var)
- CORS is restricted to `127.0.0.1:7777` only — **never** restore `*`

### Hard Rules (from CLAUDE.md / AGENTS.md)
- **Never** pass user input directly into PowerShell
- **Never** re-enable `file://` access to the UI
- **Never** restore CORS `*` or remove origin validation on POST endpoints
- Destructive operations and AI-suggested commands **require confirmation**
- Use `MESTRE_PROJETO_PATH` env var — **never** hardcode personal paths
- Preserve the MCP (non-elevated) / launcher (elevated) split
- Add/update tests in `mcp-server/test/` for any new functionality

### AI Safety
- `security.js` runs prompt injection detection (10 pattern categories, weighted scoring)
- Arguments are sanitized via `^[a-zA-Z0-9_. -]+$` regex (max 128 chars)
- Ollama responses are validated before use
- Audit logs capture all AI operations (`IA_OPERATION` level)

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MESTRE_PROJETO_PATH` | — | Project root path (replaces hardcoded paths) |
| `MESTRE_BASE_URL` | `http://127.0.0.1:7777` | Launcher URL for MCP server |
| `MESTRE_AUDIT_LOG_DIR` | `logs/audit` | Audit log directory |
| `MESTRE_EXTENSION_TOKEN` | — | Browser extension auth token |
| `MESTRE_EXTENSION_ORIGINS` | — | Comma-separated allowed extension origins |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama API URL |
| `OLLAMA_API_KEY` | — | Enables Ollama Cloud mode (changes base URL to `https://ollama.com/api`) |
| `OLLAMA_MODEL` | `qwen2.5-coder:3b-instruct` | Default model |
| `OLLAMA_MODEL_PROFILE` | `balanced` | Profile selector: fast/balanced/agent/coding/reasoning |
| `MPC_PORT` | `7777` | Launcher port (Node.js backend) |
| `MPC_HOST` | `127.0.0.1` | Launcher bind address (Node.js backend) |

## Development Conventions

- **Commits:** Conventional (`fix:`, `feat:`, `docs:`, `chore:`)
- **JavaScript:** ES modules (`"type": "module"`), Node.js built-in test runner
- **PowerShell:** Validate with `Parser::ParseFile` before committing
- **CSS:** Inline in `index.html`, uses CSS custom properties (`--accent`, `--card`, etc.), `@keyframes` animations
- **Frontend:** No build step — vanilla HTML/CSS/JS, single file (`v10/index.html`)
- **Contributing:** See `CONTRIBUTING.md` — small documented changes, run tests, no free-form commands
- **Branching:** Branch from `main`, PR with risk/effect/reversal description

## V11 Features (Current Version)

### New PowerShell Operations (+33)
- Backup (registry, drivers, network config, installed programs)
- Temperature monitoring (CPU, GPU, continuous, alerts)
- Driver management (list, update, reinstall, rollback, export)
- UWP apps (list, reinstall, reset, cache clear, diagnostics)
- SSD optimization (TRIM, SMART health, partition alignment)
- Real-time monitoring (CPU/RAM/Disk)
- Report export, scheduled tasks
- Webhooks (Discord, Teams, Slack)

### New MCP Tools (+11)
- `perguntar_ia_com_contexto` — RAG with context documents
- `resolver_problema_passo_a_passo` — Chain-of-Thought reasoning
- `comparar_modelos_ia` — Multi-model comparison
- `analisar_codigo_powershell` — Code analysis with security suggestions
- `ia_comando_sugerir` — AI-suggested PowerShell commands
- `enviar_webhook_discord` / `enviar_webhook_teams` / `enviar_webhook_slack`
- `monitorar_e_notificar` — Monitoring with webhook alerts
- `consultar_logs_auditoria` / `exportar_relatorio_auditoria`

### Audit System
- 7 log levels: INFO, WARNING, ERROR, SECURITY, COMMAND_EXEC, IA_OPERATION, WEBHOOK
- Automatic rotation (10MB max, 30 files retained)
- Sensitive data sanitization/redaction
- Queryable by level, action, user, date

### UI Enhancements
- Neon green glow animation (`@keyframes neonGreenPulse`, `neonGreenTextGlow`, `neonGreenBtnGlow`) on V11 command cards (`.cmd-card-new` class)
- V11 categories marked with "NOVO V11" badge: cat14–cat18, cat_sec
- `renderCards()` accepts `isNew` parameter to apply neon styling
- Novidades V11 page at `/novidades-v11.html`

## Directory Structure

```
Mestre-do-PC-V10-clean/
├── MestreDoPC-Launcher.ps1     # Primary PowerShell backend (admin)
├── v10/
│   ├── index.html              # Main UI (2375 lines, single-file SPA)
│   ├── launcher.js             # Alternative Node.js backend
│   ├── allowed-operations.json # Operation whitelist (security boundary)
│   ├── novidades-v11.html      # V11 features page
│   ├── rede-dashboard.js       # Network dashboard module
│   └── *.ps1                   # Helper/diagnostic scripts
├── mcp-server/
│   ├── index.js                # MCP server (1822 lines, 36 tools)
│   ├── security.js             # Prompt injection + sanitization
│   ├── audit-logger.js         # Audit logging module
│   ├── model-profiles.json    # Ollama model profiles
│   └── test/                   # 8 test files (node --test)
├── browser-extension/          # Manifest V3 Chrome/Firefox extension
├── docs/                       # Documentation (deployment, AI, integrations)
├── startup/                    # Startup helper scripts
├── logs/                       # Runtime + audit logs (gitignored)
├── install.ps1                 # Automated installer
├── start-mestre-v10.ps1        # Desktop activator
├── INSTALAR.bat                # One-click installer
├── CLAUDE.md                   # Claude Code instructions
├── AGENTS.md                   # Agent instructions (same as CLAUDE.md)
├── CHANGELOG-V11.md            # V11 detailed changelog
├── README-V11.md               # V11 summary
└── SECURITY.md                 # Security policy
```
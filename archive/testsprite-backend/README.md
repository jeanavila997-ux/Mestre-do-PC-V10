# TestSprite Backend Tests — Mestre do PC V10

These scripts exercise the public and privileged endpoints of the V10 launcher.

## Important — do NOT hardcode credentials

For endpoints that require authentication (`/run`, `/open-terminal`), TestSprite injects
`__AUTH_HEADERS__` into the test file at runtime from the project's Authentication settings.
Currently these scripts use a local `AUTH_HEADERS` dict because the credential is a static
header (`X-Mestre-Client: v10-web`). After creating the backend project, configure the
credential with:

```bash
testsprite project credential <BE_PROJECT_ID> --type "API key" --credential "v10-web"
```

Then replace the local `AUTH_HEADERS` block with:

```python
r = requests.post(..., headers={**__AUTH_HEADERS__, "Content-Type": "application/json"})
```

## Running locally (before TestSprite upload)

With the launcher running on `http://127.0.0.1:7777`:

```bash
cd testsprite-backend
python test_ping.py
python test_status.py
python test_run_safe_command.py
```

## Endpoint coverage

| File | Endpoint | Auth | Notes |
| --- | --- | --- | --- |
| `test_ping.py` | GET /ping | No | Liveness probe |
| `test_status.py` | GET /status | No | System metrics |
| `test_mcp_status.py` | GET /mcp-status | No | MCP health |
| `test_ollama_tags.py` | GET /ollama/tags | No | Model list proxy |
| `test_run_safe_command.py` | POST /run | Yes | Executes allowed `whoami` and polls job |
| `test_run_blocked_command.py` | POST /run | Yes | Verifies forbidden command is rejected |
| `test_open_terminal_rejects_unauthorized.py` | POST /open-terminal | Yes | Origin/header enforcement |
| `test_static_assets.py` | GET /, /index.html, /logo*.png, /favicon.png | No | Cache headers |

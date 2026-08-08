# Onboarding TestSprite — Mestre do PC V10

This repo currently has **no TestSprite tests**. The artefacts below are ready to be uploaded
once the TestSprite CLI is available and the launcher is running.

## 1. Start the launcher

Open PowerShell as Administrator in `Mestre-do-PC-V10-repo-pronto/Mestre-do-PC-V10-clean/`:

```powershell
.\MestreDoPC-Launcher.ps1
```

Wait for:

```text
[OK] Aguardando comandos do HTML...
```

## 2. Ensure `testsprite setup` has run

```bash
testsprite project list
```

If this errors on auth, run `testsprite setup` first.

## 3. Create projects

### Frontend project

```bash
cd Mestre-do-PC-V10-repo-pronto/Mestre-do-PC-V10-clean
testsprite project create --type frontend --name "Mestre do PC V10" --url http://127.0.0.1:7777/
```

Capture the returned `projectId` (e.g. `proj_abc123`) and replace `__FE_PROJECT_ID__` in every
file under `testsprite-plans/*.json`.

### Backend project

```bash
testsprite project create --type backend --name "Mestre do PC V10 Backend"
```

Capture the returned `projectId` (e.g. `proj_def456`).

Configure the static credential so TestSprite injects `__AUTH_HEADERS__`:

```bash
testsprite project credential <BE_PROJECT_ID> --type "API key" --credential "v10-web"
```

Then update the backend scripts (`test_run_safe_command.py`, `test_run_blocked_command.py`,
`test_open_terminal_rejects_unauthorized.py`) to spread `__AUTH_HEADERS__` instead of the local
`AUTH_HEADERS` dict. Example:

```python
r = requests.post(
    f"{TARGET_URL}/run",
    headers={**__AUTH_HEADERS__, "Content-Type": "application/json"},
    json=payload,
    timeout=10,
)
```

## 4. Create tests

Frontend (batch):

```bash
testsprite test create-batch --plan-from-dir ./testsprite-plans
```

Backend (one per file):

```bash
testsprite test create --type backend --name "ping returns ok" --code-file ./testsprite-backend/test_ping.py --project <BE_PROJECT_ID>
testsprite test create --type backend --name "status returns system metrics" --code-file ./testsprite-backend/test_status.py --project <BE_PROJECT_ID>
testsprite test create --type backend --name "mcp status is reachable" --code-file ./testsprite-backend/test_mcp_status.py --project <BE_PROJECT_ID>
testsprite test create --type backend --name "ollama tags returns model list" --code-file ./testsprite-backend/test_ollama_tags.py --project <BE_PROJECT_ID>
testsprite test create --type backend --name "run safe readonly command" --code-file ./testsprite-backend/test_run_safe_command.py --project <BE_PROJECT_ID>
testsprite test create --type backend --name "run rejects unallowed command" --code-file ./testsprite-backend/test_run_blocked_command.py --project <BE_PROJECT_ID>
testsprite test create --type backend --name "open terminal requires auth header" --code-file ./testsprite-backend/test_open_terminal_rejects_unauthorized.py --project <BE_PROJECT_ID>
testsprite test create --type backend --name "static assets served with cache headers" --code-file ./testsprite-backend/test_static_assets.py --project <BE_PROJECT_ID>
```

## 5. Smoke-run a few (protect credits)

Pick 2–3 happy-path tests, for example:

```bash
testsprite test run <testId-ping> --wait
testsprite test run <testId-status> --wait
testsprite test run <testId-fe-server-status> --wait
```

Do **not** run the full 16-test suite automatically — it would cost ~30–35 credits. Running the
rest is the user's choice.

## Test summary

- **Frontend**: 8 plans covering dashboard status, command execution, search, favorites, IA chat,
  copy-to-clipboard, sidebar navigation and theme toggle.
- **Backend**: 8 Python tests covering `/ping`, `/status`, `/mcp-status`, `/ollama/tags`, `/run`
  (happy + rejection), `/open-terminal` auth enforcement and static-asset cache headers.

Total: **16 tests**.

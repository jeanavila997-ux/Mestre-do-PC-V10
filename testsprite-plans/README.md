# TestSprite Frontend Plans — Mestre do PC V10

These plans target `http://127.0.0.1:7777/` (the V10 web UI served by the launcher).

## Creating the frontend project

```bash
testsprite project create --type frontend --name "Mestre do PC V10" --url http://127.0.0.1:7777/
```

## Creating the tests

After replacing `__FE_PROJECT_ID__` in every JSON file with the real project ID:

```bash
testsprite test create-batch --plan-from-dir ./testsprite-plans
```

## Plans

1. **01-server-status.json** — dashboard loads and shows launcher / MCP / Ollama status.
2. **02-run-safe-command.json** — executes a read-only health-check command and shows output.
3. **03-search-catalog.json** — search filters the command catalog.
4. **04-favorite-command.json** — toggling a favorite updates the favorites bar.
5. **05-open-ai-chat.json** — opens and closes the Mestre IA chat modal.
6. **06-copy-command.json** — copy button shows confirmation toast.
7. **07-sidebar-navigation.json** — sidebar navigation expands and scrolls to category.
8. **08-theme-toggle.json** — toggles between light and dark themes.

# CLAUDE.md

## Projeto

Mestre do PC V10 é um aplicativo Windows de diagnóstico e manutenção:

- `v10/index.html`: interface ativa, servida pelo launcher.
- `MestreDoPC-Launcher.ps1`: backend elevado em `127.0.0.1:7777`.
- `mcp-server/index.js`: servidor MCP por `stdio`.
- Ollama: IA local/cloud em `127.0.0.1:11434`.
- `legado/`: versões antigas; não altere para corrigir a V10.

## Comandos de desenvolvimento

```powershell
cd mcp-server
npm ci
npm test
node --check index.js
node --check ..\v10\launcher.js
```

Valide scripts PowerShell com
`System.Management.Automation.Language.Parser.ParseFile`.

## Fluxo de execução

O MCP anuncia 33 ferramentas. Ferramentas administrativas enviam `POST /run`
com `X-Mestre-Client: mcp`; o launcher executa o comando em um job elevado e o
MCP consulta `/run-status`.

A interface abre em `http://127.0.0.1:7777/` e usa
`X-Mestre-Client: v10-web`. Não volte a abrir a V10 por `file://`, não restaure
CORS `*` e não remova a validação de origem dos endpoints POST.

O modelo Ollama padrão é configurável por `OLLAMA_MODEL`, com
`qwen2.5-coder:1.5b` como fallback local.

## Regras para mudanças

- Preserve a separação entre MCP não elevado e launcher elevado.
- Nunca adicione entrada do usuário diretamente a PowerShell.
- Comandos destrutivos e comandos sugeridos pela IA exigem confirmação.
- Use `MESTRE_PROJETO_PATH`; não grave caminhos pessoais no HTML.
- Adicione ou atualize testes em `mcp-server/test/`.
- Use commits convencionais (`fix:`, `feat:`, `docs:`, `chore:`).

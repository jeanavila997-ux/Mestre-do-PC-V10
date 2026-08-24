# AGENTS.md

## Projeto

Mestre do PC V10/V11 é um aplicativo Windows de diagnóstico e manutenção:

- `v10/index.html`: interface ativa SPA (~2375 linhas), servida pelo launcher.
- `MestreDoPC-Launcher.ps1`: backend elevado em `127.0.0.1:7777`.
- `mcp-server/index.js`: servidor MCP por `stdio` (~68 ferramentas).
- `browser-extension/`: extensão Manifest V3 para integrar o navegador com o launcher.
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

O MCP anuncia ~68 ferramentas. Ferramentas administrativas enviam `POST /run`
com `X-Mestre-Client: mcp`; o launcher executa o comando em um job elevado e o
MCP consulta `/run-status`.

A interface abre em `http://127.0.0.1:7777/` e usa
`X-Mestre-Client: v10-web`. A extensão do navegador usa
`X-Mestre-Client: browser-extension` e um token configurado via
`MESTRE_EXTENSION_TOKEN`. Não volte a abrir a V10 por `file://`, não restaure
CORS `*` e não remova a validação de origem dos endpoints POST.

## Interface Web (v10/index.html)

A UI SPA possui abas de navegação:

| Aba | Conteúdo |
|-----|----------|
| 🏠 Início | Dashboard com categorias de comandos |
| 💬 Chat IA | Chat com Ollama (local/cloud) |
| 📊 Logs | Logs de auditoria em tempo real |
| 📋 Git | Status, commit, push, pull |
| ⚙️ Config | Variáveis de ambiente, perfis de modelo |
| 🔌 MCP (NOVO V11.1) | Integração Multi-LLM com servidores, ferramentas e histórico |

**Nova aba MCP:**
- Grid de servidores MCP conectados
- Accordion de ferramentas por categoria
- Histórico de execuções com status (sucesso/erro)
- Modais para adicionar servidores e executar ferramentas
- Endpoints no launcher: `GET /mcp/servers`, `POST /mcp/execute`, `POST /mcp/configure`

## Modelos e Perfis

O modelo Ollama padrão é configurável por `OLLAMA_MODEL`, com
`qwen2.5-coder:1.5b` como fallback local. Perfis de modelos locais para
automação de desktop estão em `mcp-server/model-profiles.json` (fast,
balanced, agent, coding, reasoning) e são selecionados pela env var
`OLLAMA_MODEL_PROFILE`. A API key do Ollama Cloud (`OLLAMA_API_KEY`)
ativa modo cloud com auth header e muda a base URL para
`https://ollama.com/api` automaticamente. Opções de geração
(temperature, top_p, top_k, seed, num_predict, keep_alive) são
configuráveis por env vars `OLLAMA_*` e têm precedência sobre o perfil.

## Regras para mudanças

- Preserve a separação entre MCP não elevado e launcher elevado.
- Nunca adicione entrada do usuário diretamente a PowerShell.
- Comandos destrutivos e comandos sugeridos pela IA exigem confirmação.
- Use `MESTRE_PROJETO_PATH`; não grave caminhos pessoais no HTML.
- Adicione ou atualize testes em `mcp-server/test/`.
- Use commits convencionais (`fix:`, `feat:`, `docs:`, `chore:`).

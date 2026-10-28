---
name: conectar-navegador-agente
description: Conecta o agente CLI ao navegador real via CDP/chrome-devtools-mcp, Edge com remote debugging, e explica limites (edge://, headless vs janela). Use quando o browser não responde, edge:// falha, CDP recusa conexão, ou para melhorar o acesso do agente ao DevTools.
---

# Conectar Navegador ao Agente

Meta-skill: como o agente **entra na oficina** do DevTools (CDP), não só quais ferramentas usar lá dentro.

## Regras
- URLs `edge://` e `chrome://` são **páginas internas** — o MCP headless Chromium **não** abre a sessão do Edge do usuário nem essas URLs de settings.
- No Mestre do PC, as tools `chrome_*` vêm da ponte `mcp-server/chrome-devtools-bridge.js` (pacote `chrome-devtools-mcp`).
- `pageId` começa em **1**. Sem `chrome_list_pages`, não chute.
- Prefira `127.0.0.1` a `localhost` no Windows.
- Para inspecionar o **Edge já aberto** do Jean, é preciso Edge/Chrome com `--remote-debugging-port=PORT` e CDP em `http://127.0.0.1:PORT`.

## Passo a passo — caminho padrão (Mestre)
1. Confirme launcher/MCP no ar (`pwsh mcp-server/check-status.ps1`).
2. `chrome_list_pages` — se só `about:blank`, navegue.
3. Trabalhe com snapshot → ação → snapshot (loop curto).
4. Se a tool faltar: reinstale `chrome-devtools-mcp` em `mcp-server/` e **reinicie** o MCP Server.

## Passo a passo — anexar ao Edge do usuário
1. Feche instâncias soltas ou use um perfil de debug dedicado.
2. Inicie:
   ```powershell
   & "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe" `
     --remote-debugging-port=9222 `
     --user-data-dir="$env:TEMP\edge-cdp-profile"
   ```
3. Probe: `Invoke-WebRequest http://127.0.0.1:9222/json/version`
4. Aponte REA/`list_browser_targets` ou o MCP para esse endpoint.
5. Nunca exponha a porta CDP na rede externa (só loopback).

## Limitações observadas (28/10/2026)
| Situação | Resultado |
|---|---|
| Abrir `edge://settings/...` via chrome MCP | Não espelha o Edge do usuário |
| CDP 9222/9223 sem flag | Timeout / conexão recusada |
| HeadlessChrome do MCP | UA headless; cookies/perfil separados do Edge Beta |
| learn.microsoft.com | Acessível via HTTPS normal no MCP |

## Analogia
CDP é uma **porta dos fundos com crachá**. Sem abrir a porta (`--remote-debugging-port`), o agente fica numa oficina vazia (Chromium headless), não na sua mesa real (Edge com suas abas).

## Referência oficial
- https://learn.microsoft.com/pt-br/microsoft-edge/devtools/landing/
- https://learn.microsoft.com/pt-br/microsoft-edge/devtools/about-tools
- Docs do projeto: `AGENTS.md` seção “Ponte Chrome DevTools”

## Entrega
Estado da conexão (headless vs anexado), `pageId`/URL ativos, e próximo comando se estiver offline.

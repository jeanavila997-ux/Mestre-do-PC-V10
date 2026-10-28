# Coleta DevTools — 28/10/2026

## Contexto
- Pedido do Jean com URL `edge://settings/privacy/sitePermissions/...site=https://learn.microsoft.com`
- Histórico real do Edge: documentação **Microsoft Edge DevTools** em learn.microsoft.com
- Ferramenta de coleta: ponte `chrome_*` (chrome-devtools-mcp) via Mestre do PC

## Página analisada
- URL: https://learn.microsoft.com/pt-br/microsoft-edge/devtools/landing/
- Título: Documentação do Microsoft Edge DevTools
- readyState: complete
- User-Agent do agente: HeadlessChrome/156 (não é o Edge Beta do usuário)
- Performance navigation: DOMContentLoaded ≈ 446 ms · loadEventEnd ≈ 608 ms · transferSize ≈ 41 KB

## Console
- 1 erro: `Uncaught (in promise) NotFoundError: Failed to execute 'removeChild' on 'Node'...` (ruído típico de banner/consent)

## Rede (amostra)
- Document 200: landing DevTools
- Scripts learn.microsoft.com + consent (wcp) + telemetria OneCollector
- toc.json / breadcrumbs / site-header JSON 200

## Achado crítico para o agente
| Tentativa | Resultado |
|---|---|
| CDP `127.0.0.1:9222` / `9223` no Edge já aberto | Timeout — remote debugging **não** estava ligado |
| Abrir `edge://settings/...` | Página interna do Edge; MCP headless não enxerga a sessão do usuário |
| Abrir `https://learn.microsoft.com/...` | OK via Chromium headless do MCP |

## Conclusão
O agente leu a documentação pública com sucesso. Para controlar as **abas reais do Edge** (incluindo settings), é obrigatório subir o Edge com `--remote-debugging-port` ou usar o fluxo headless já existente.

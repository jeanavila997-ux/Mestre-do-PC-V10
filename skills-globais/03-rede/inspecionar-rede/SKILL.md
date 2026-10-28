---
name: inspecionar-rede
description: Inspeciona requisições de rede (document, XHR, fetch, scripts) — status, falhas e payloads. Use para debug de API, 4xx/5xx, CORS, carregamento lento ou painel Rede do DevTools.
---

# Inspecionar Rede

Equivalente da ferramenta **Rede** (+ Condições / Console de Rede) do Edge DevTools.

## Regras
- Liste requests **depois** da navegação que importa (`chrome_list_network_requests`).
- Filtre por `resourceTypes` (`document`, `xhr`, `fetch`, `script`, …) para não afogar no ruído.
- Não cole Authorization headers ou cookies no chat/relatório.
- Telemetria (OneCollector, analytics) quase nunca é a causa do bug do usuário — foque na API do app.

## Passo a passo
1. Navegue/recarregue a página do fluxo sob teste.
2. `chrome_list_network_requests` com `pageSize` adequado e tipos certos.
3. Para um `reqid` suspeito: inspecione status, URL e tipo; se a tool de detalhe existir, use-a.
4. Cruzar com Console (`depurar-console`) se houver CORS ou JSON parse error.
5. No app local, confirme se a chamada usa `127.0.0.1` e o header de auth esperado.

## Mapeamento DevTools → MCP
| DevTools | Tool MCP |
|---|---|
| Painel Network | `chrome_list_network_requests` |
| Replay / edição (limitado) | `chrome_evaluate_script` + `fetch` controlado |

## Referência oficial
- https://learn.microsoft.com/pt-br/microsoft-edge/devtools/network/
- https://learn.microsoft.com/pt-br/microsoft-edge/devtools/network-conditions/network-conditions-tool

## Entrega
Tabela curta: método, URL resumida, status, se falhou, e próximo passo.

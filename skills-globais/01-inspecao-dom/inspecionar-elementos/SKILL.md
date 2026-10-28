---
name: inspecionar-elementos
description: Inspeciona DOM, CSS e árvore de acessibilidade de páginas web via snapshot/screenshot/click. Use quando o usuário pedir para inspecionar elementos, achar seletores, verificar layout, HTML/CSS ou o painel Elementos do DevTools.
---

# Inspecionar Elementos

Equivalente da ferramenta **Elementos** + **Inspecionar** do Microsoft Edge DevTools.

## Regras
- Prefira `chrome_take_snapshot` (árvore a11y com `uid`) a screenshot para interagir.
- `pageId` é **1-based** — descubra com `chrome_list_pages` antes de agir.
- Não invente seletores: use `uid` do snapshot mais recente.
- Use sempre `127.0.0.1` em URLs locais (no Windows, `localhost` → `::1`).

## Passo a passo
1. `chrome_list_pages` → anote o `pageId` da aba certa.
2. Se a URL estiver errada: `chrome_navigate_page` com `type=url`.
3. `chrome_take_snapshot` → leia headings, botões, links e `uid`.
4. Interaja com `chrome_click` / `chrome_hover` / `chrome_fill` usando o `uid`.
5. Para CSS/DOM cru: `chrome_evaluate_script` com função que lê `getComputedStyle` ou `outerHTML`.
6. Confirme visualmente com `chrome_take_screenshot` só quando o layout importa.

## Mapeamento DevTools → MCP
| DevTools | Tool MCP |
|---|---|
| Inspecionar / Elements | `chrome_take_snapshot`, `chrome_take_screenshot` |
| Click / hover na página | `chrome_click`, `chrome_hover` |
| Editar no console do Elements | `chrome_evaluate_script` |

## Referência oficial
- https://learn.microsoft.com/pt-br/microsoft-edge/devtools/css/inspect
- https://learn.microsoft.com/pt-br/microsoft-edge/devtools/dom/
- https://learn.microsoft.com/pt-br/microsoft-edge/devtools/about-tools

## Entrega
Relato curto: o que encontrou no DOM, `uid`/seletor usado, e se a UI bate com o esperado.

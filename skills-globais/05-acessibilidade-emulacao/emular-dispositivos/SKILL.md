---
name: emular-dispositivos
description: Emula viewport mobile/desktop e valida layout responsivo. Use para testar celular, tablet, device mode, media queries ou quebra de layout em telas estreitas.
---

# Emular Dispositivos

Equivalente da **Emulação do dispositivo** (Device Mode) do Edge DevTools.

## Regras
- Mudanças de layout responsivo pedem verificação em **pelo menos** desktop e uma largura mobile (~390px).
- Emulação aproxima — não substitui aparelho real para touch/gestos complexos.
- Depois de redimensionar/emular, tire novo snapshot (UIDs mudam).

## Passo a passo
1. Abra a página no `pageId` correto.
2. Se a tool de emulação/viewport estiver disponível no MCP, aplique o preset (ex.: Pixel 7 / iPhone).
3. Alternativa: `chrome_evaluate_script` para ler `window.innerWidth` / `matchMedia`.
4. Re-navegue ou recarregue se o app só calcula layout no boot.
5. `chrome_take_snapshot` + screenshot nas duas viewports; compare quebras.

## Mapeamento DevTools → MCP
| DevTools | Abordagem agente |
|---|---|
| Device toolbar | Emulação CDP / resize via tools chrome_* |
| Sensors (geo/orientação) | Só se tool específica existir — senão documente limitação |

## Referência oficial
- https://learn.microsoft.com/pt-br/microsoft-edge/devtools/device-mode/
- https://learn.microsoft.com/pt-br/microsoft-edge/devtools/sensors/

## Entrega
O que quebrou em mobile vs desktop, com evidência (snapshot/screenshot).

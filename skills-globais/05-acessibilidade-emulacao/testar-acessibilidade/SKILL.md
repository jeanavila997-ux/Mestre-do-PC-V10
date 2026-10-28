---
name: testar-acessibilidade
description: Testa acessibilidade web — contraste, alt text, teclado, árvore a11y e Lighthouse a11y. Use quando o usuário pedir acessibilidade, WCAG, leitor de tela, contraste ou painel Acessibilidade do DevTools.
---

# Testar Acessibilidade

Equivalente dos recursos de **acessibilidade** do Edge DevTools (Issues, Inspect overlay, Lighthouse, Rendering).

## Regras
- O snapshot a11y (`chrome_take_snapshot`) é a base — nomes, roles e ordem importam.
- Verifique teclado: foco visível, ordem Tab, botões acionáveis sem mouse.
- Imagens informativas precisam de `alt`; decorativas devem ser ignoradas pela árvore.
- Contraste: sinalize texto baixo contraste; confirme com Lighthouse quando possível.

## Passo a passo
1. `chrome_take_snapshot` (e `verbose=true` se faltar detalhe).
2. Percorra headings na ordem — hierarquia H1→H2→H3 faz sentido?
3. Cheque imagens/botões sem nome acessível.
4. `chrome_lighthouse_audit` e filtre achados de accessibility.
5. Se o app tiver tema claro/escuro, teste os dois estados de UI.

## Checklist rápido (docs Microsoft)
- Alt em imagens
- Suporte a teclado + indicador de foco
- Contraste de texto
- Labels em inputs
- Usável com daltonismo / reduced motion (quando couber)

## Referência oficial
- https://learn.microsoft.com/pt-br/microsoft-edge/devtools/accessibility/reference

## Entrega
Lista de problemas com severidade + sugestão de correção (atributo ARIA, texto, CSS).

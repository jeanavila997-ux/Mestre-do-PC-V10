---
name: auditar-seguranca-armazenamento
description: Audita segurança e armazenamento do site — cookies, localStorage, HTTPS misturado, service workers. Use para login quebrado, sessão, storage, painel Aplicativo ou Segurança do DevTools.
---

# Auditar Segurança e Armazenamento

Equivalente das ferramentas **Aplicativo** e **Segurança** do Edge DevTools.

## Regras
- Nunca imprima valores de cookies de sessão, tokens ou refresh tokens.
- Prefira dizer **nomes das chaves** e se existem (`localStorage` key X presente).
- Mixed content (HTTP em página HTTPS) é achado de segurança — reporte.
- Em apps locais (`http://127.0.0.1`), Secure cookies se comportam diferente de produção HTTPS.

## Passo a passo
1. Confirme protocolo da página (`https:` vs `http:`).
2. Via `chrome_evaluate_script`, inventarie chaves: `Object.keys(localStorage)`, `sessionStorage`.
3. Para sessão do Mestre Chat Integrado: chave esperada `mestre-site-session` (não dump do JSON completo se tiver segredo).
4. Cheque Service Worker / caches só se o sintoma for PWA offline.
5. Cruzar falhas de rede 401/403 com ausência de cookie/header.

## Referência oficial
- https://learn.microsoft.com/pt-br/microsoft-edge/devtools/storage/application-tool
- https://learn.microsoft.com/pt-br/microsoft-edge/devtools/security/
- https://learn.microsoft.com/pt-br/microsoft-edge/devtools/progressive-web-apps/

## Entrega
Estado do storage (chaves), protocolo, e hipótese segura sem vazar segredos.

# Design curto — Mobile com Chat no centro

**Data:** 2026-10-30  
**Escopo:** `v10/mobile/` (PWA do Mestre)  
**Abordagem escolhida:** B — Chat no centro

## Intent

Tornar o `/mobile/` usável de verdade no celular: o chat é a tela principal (estilo WhatsApp), e o controle remoto (Desktop / VPS / 9Router) fica a um toque, sem sumir.

## Por quê agora

Jean pediu passe geral de usabilidade + confirmação de acesso remoto por VPS. A VPS (`72.62.11.116:7777`) hoje **não responde** daqui (timeout); o desenho do app já permite remoto via endpoint + token. A UI precisa deixar o alvo e o status óbvios, sem empurrar o chat para uma aba secundária.

## Goals

1. Abrir `/mobile/` já no **Chat**.
2. Composer fixo embaixo, mensagens com scroll, teclado sem cobrir o input.
3. Alvo (Desktop / VPS / 9Router) + status online/offline + latência em header compacto.
4. Endpoint/token em drawer ou sheet (não no meio da tela o tempo todo).
5. Pulso, Comandos, VPS e Prompts continuam acessíveis na nav inferior.
6. Quando o alvo estiver offline, o chat mostra banner claro e ainda permite editar endpoint.

## Non-goals

- Não reescrever o backend do launcher nem o protocolo `/ollama/chat`.
- Não abrir firewall/portas na VPS neste PR (só a UX que usa o endpoint).
- Não mudar o catálogo de apps sslip.io nem o Arquiteto de Prompts.

## Anti-goals

- Esconder o seletor de alvo atrás de 3 toques (quebra o remoto).
- Chat que some o composer quando o teclado abre.
- Depender de VPS no ar para o app local funcionar.

## Constraints

- Só arquivos em `v10/mobile/` (`index.html`, `app.js`, `styles.css`; README se precisar).
- Manter ESM/vanilla, PWA, CSP atual, `X-Mestre-Mobile-Token`.
- Viewport 390×844 como referência; safe-area iOS.

## Approaches consideradas

| | Ideia | Tradeoff |
|---|---|---|
| A | Controle remoto primeiro | Melhor para VPS, chat secundário |
| **B (escolhida)** | Chat no centro + alvo no header/drawer | Uso diário = conversa; remoto ainda a 1 toque |
| C | Limpeza visual só | Pouco impacto no fluxo remoto |

## Como fica (decisões)

1. **Tab default:** `chat` (não `home`).
2. **Header:** marca compacta + chips Desktop/VPS/9Router + bolinha de status (verde/vermelho) + latência. Link Desktop permanece.
3. **Endpoint:** botão “Conexão” abre sheet com URL + token + Salvar + “Testar” (`/ping`). Form some do fluxo principal.
4. **Chat layout:** `messages` flex-grow; `composer` sticky bottom com `env(safe-area-inset-bottom)`; chips de atalho acima do composer ou no topo do painel.
5. **Nav inferior:** Chat | Pulso | Comandos | VPS | Mais (Prompts/Memórias) — ícones + label curta; Chat no centro visual.
6. **Offline:** banner no chat (“Alvo offline — toque em Conexão”); Pulso e Comandos usam cache como hoje.
7. **VPS tab:** mantém apps/serviços; botão Verificar; se `:7777` falhar, o status do header já reflete.

## Call do builder

- Ordem dos ícones da nav: Chat no meio (recomendado) vs Chat à esquerda — **call: Chat no meio**.
- Sheet vs página full-screen para endpoint — **call: sheet bottom**.
- Não mexer em service worker além do necessário para cache dos assets CSS/JS.

## Verificação

- Browser em 390×844: abrir `/mobile/`, ver chat ativo, enviar mensagem (se Ollama/9Router no ar), trocar alvo, abrir Conexão, testar ping.
- Confirmar Pulso/Comandos/VPS/Prompts ainda navegam.
- Não commitar até o Jean pedir.

# Chat Integrado layout Conversa — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Colocar a conversa em coluna flex com composer no rodapé e menus que não cobrem o chat.

**Architecture:** Reorganizar o HTML existente em `thread` + `dock`, ajustar CSS e encurtar títulos na renderização. Sem API nova.

**Tech Stack:** HTML/CSS/JS servidos por `v10/launcher.js`.

**Spec:** `docs/superpowers/specs/2026-11-11-chat-integrado-layout-b-design.md`

## Global Constraints

- Sem bundler e sem dependência nova.
- Textos visíveis em pt-BR.
- Não alterar whitelist nem contratos HTTP.
- IDs dos botões e painéis atuais permanecem.

## Review Focus

- Tema claro não pode pintar um painel vazio por cima das mensagens.
- Escape fecha ferramentas/skills/memórias.
- Título `]` vira "Conversa".
- Em 390 px a lateral continua gaveta e o composer cabe na tela.
- "Executar na whitelist" continua no bloco de código.

### Task 1: Casca

**Files:** `v10/chat-integrado/chat-integrado.html`, `styles.css`

- [ ] Agrupar nav extra em `<details class="more-nav">`.
- [ ] Envolver mensagens em `.thread` e composer/atalhos/painéis em `.dock`.
- [ ] CSS: coluna flex, painéis com `max-height: 40vh` acima do dock, título sólido no tema claro, atalhos numa faixa com scroll.

### Task 2: Títulos e Escape

**Files:** `v10/chat-integrado/chat-integrado.js`

- [ ] `conversationTitle(raw)` corta em 42 e devolve "Conversa" se sobrar pontuação.
- [ ] Usar na lista e ao criar conversa.
- [ ] Escape chama `closeAllMenus()` quando o modal está fechado.

### Task 3: Verificar no navegador

- [ ] Abrir `/chat-integrado/chat-integrado.html` vazio, tema claro e escuro, abrir Ferramentas, checar um título ruim na lista.

# Chat estilo Grok + contexto livre — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans (native). Steps use checkbox syntax.

**Goal:** Tom Grok + histórico longo (~80 msgs / ~48k chars) no chat da home e no Chat Integrado, com Soul.md alinhado; whitelist `/run` intacta.

**Architecture:** Reescrever `SYSTEM_PROMPT` / `DEFAULT_SYSTEM_PROMPT` nos dois frontends; helper `selectHistoryForApi(messages)` com limite de mensagens e orçamento de caracteres; greeting menos “só manutenção”; Soul.md personalidade Grok.

**Tech Stack:** Vanilla JS ESM no launcher V10 (`127.0.0.1:7777`), Soul.md editável via `/soul`.

**Spec:** `docs/superpowers/specs/2026-10-30-chat-grok-contexto-livre-design.md`

## Global Constraints

- Não alterar `/classify`, whitelist nem Modo Livre
- pt-BR; sem expor senhas/chaves no prompt
- ESM puro; sem `require`

## Review Focus

- Histórico muito longo não estoura contexto do modelo 3B (budget de chars)
- Mensagens antigas caem do fim (mais recentes ficam)
- Greeting e prompt não pedem execução fora da whitelist

---

### Task 1: Helper de histórico + prompt Grok no chat da home

**Files:**
- Modify: `v10/chat/chat-module.js` (DEFAULT_SYSTEM_PROMPT, slice(-20)×2, greeting)
- Modify: `v10/chat/chat-template.html` (greeting espelho, se existir)

- [ ] **Step 1:** Adicionar `HISTORY_MESSAGE_LIMIT = 80`, `HISTORY_CHAR_BUDGET = 48000`, função `selectHistoryForApi(messages)` (do fim para o início, somando `content.length`, parar no budget).
- [ ] **Step 2:** Substituir `DEFAULT_SYSTEM_PROMPT` por texto estilo Grok (livre + PC como superpoder + regras de comando PowerShell + segurança).
- [ ] **Step 3:** Trocar `slice(-20)` em send e regenerate por `selectHistoryForApi(...)`.
- [ ] **Step 4:** Atualizar greeting HTML (TEMPLATE + clear-chat + template.html).

### Task 2: Mesmo no Chat Integrado

**Files:**
- Modify: `v10/chat-integrado/chat-integrado.js`

- [ ] **Step 1:** Mesmas constantes/helper (local ao arquivo; sem shared module novo para manter o diff pequeno).
- [ ] **Step 2:** `SYSTEM_PROMPT` Grok + menção a tools MCP.
- [ ] **Step 3:** `streamOllamaReply` usa `selectHistoryForApi(state.messages)`.

### Task 3: Soul.md

**Files:**
- Modify: `v10/chat/Soul.md` (seções identidade/personalidade)

- [ ] **Step 1:** Personalidade: franco, bem-humorado, contexto livre; PC continua o superpoder; whitelist intacta.

### Task 4: Verificar no navegador

- [ ] Home chat: abrir overlay, mandar pergunta não-PC, ver resposta livre.
- [ ] Chat Integrado: login se preciso, mesma checagem + follow-up que use histórico.

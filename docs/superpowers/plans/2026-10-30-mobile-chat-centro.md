# Mobile Chat no Centro — Implementation Plan

> **For agentic workers:** Native execution in this session (Jean aprovou design + “implemente”).

**Goal:** `/mobile/` abre no Chat; alvo Desktop/VPS/9Router + status no header; endpoint/token em sheet “Conexão”.

**Architecture:** Vanilla PWA em `v10/mobile/`. Reusa `#sheet` e `openSheet` patterns; form de endpoint sai do header permanente. Status via `/ping` periódico.

**Tech Stack:** HTML/CSS/JS vanilla, PWA existente.

**Spec:** `docs/superpowers/specs/2026-10-30-mobile-chat-centro-design.md`

## Global Constraints

- Só `v10/mobile/{index.html,app.js,styles.css}` (+ README se necessário)
- Sem mudar launcher/backend
- Sem commit automático
- Viewport referência 390×844

## Review Focus

- Alvo offline: banner no chat + bolinha vermelha
- Trocar alvo limpa mensagens (já existe) e atualiza status
- Teclado: composer permanece acessível (chat-layout flex)
- Sheet Conexão fecha no backdrop e salva URL/token
- Tab default chat mesmo após reload (sem localStorage de tab)

---

### Task 1: HTML — chat default, header compacto, sheet conexão, nav

**Files:** Modify `v10/mobile/index.html`

- [ ] body `data-tab="chat"`; panel-chat active; panel-home inactive
- [ ] Header: brand + status-dot + lat + botão Conexão; target-switch permanece; remover form endpoint do fluxo visível (mover para `#conn-sheet` ou `#sheet-extra` dedicado `#connection-sheet`)
- [ ] Banner `#chat-offline` no painel chat
- [ ] Tabbar: Pulso | Comandos | **Chat** | VPS | Prompts (Chat no meio)
- [ ] Connection sheet com URL, token, Testar, Salvar

### Task 2: CSS — header compacto + chat sticky + sheet conexão

**Files:** Modify `v10/mobile/styles.css`

- [ ] `.top` compacto; `.status-row` com dot ok/bad
- [ ] `.chat-layout` column flex; composer sticky no painel
- [ ] `.connection-sheet` / reuso `.sheet`
- [ ] Tabbar labels curtas; Chat destaque visual

### Task 3: JS — default chat, ping status, connection sheet, banner

**Files:** Modify `v10/mobile/app.js`

- [ ] `state.tab = "chat"`; `showTab("chat")` no boot
- [ ] `updateConnectionStatus()` via `/ping` (ou skip router flavor); seta `#status-dot`, `#status-lat`, `#chat-offline`
- [ ] Bind Conexão → abre sheet; Testar → ping toast; Salvar → settings + close
- [ ] Remover toggle inline antigo do endpoint (ou redirecionar para sheet)
- [ ] refreshActive/chat chama status

### Task 4: Verificar no browser 390×844

- [ ] Abrir `/mobile/`, chat ativo, Conexão sheet, trocar abas, ping local
- [ ] Não commitar

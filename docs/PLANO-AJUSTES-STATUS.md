# Plano de Ajustes — Status Atual e Próximos Passos

> **Data:** 24 de Agosto de 2026
> **Origem:** continuação do plano `vamos-integrar-mais-coisas-declarative-wilkinson.md`
> **Pedido do usuário:** "Salve o plano de ajustes com documento detalhado"

Este documento consolida o que já foi implementado, o que ficou pendente, e os pontos que precisam de decisão do usuário. É o complemento operacional do plano original (que permanece como registro da decisão de escopo — Modo Livre + memória agora, Supabase depois).

---

## 1. O que já está implementado e testado

### 1.1 Modo Livre (execução sem whitelist, opt-in)
- Implementado em **duas** implementações paralelas do launcher:
  - `v10/launcher.js` (Node.js) — rotas `/modo-livre` (GET/POST) e `/run-free` (POST).
  - `MestreDoPC-Launcher.ps1` (PowerShell) — **esta é a que roda de fato na porta 7777** neste ambiente (confirmado via `Get-NetTCPConnection -LocalPort 7777`).
- Toggle na UI do chat (`v10/chat/chat-module.js`): botão `🔓 Modo Livre`, com `confirm()` de segurança ao ligar.
- Auditoria: toda execução em Modo Livre é logada em nível `SECURITY` (`Write-AuditLog` no PS, `AuditLevel.SECURITY` no Node).
- Ferramentas MCP novas: `definir_modo_livre`, `executar_comando_livre` (`mcp-server/index.js`).
- **Testado e confirmado** end-to-end: OFF por padrão → `/run-free` retorna 403 → liga via UI → executa comando fora da whitelist → desliga → volta a exigir whitelist/confirmação. Whitelist normal (`/classify`) continua intacta quando desligado.

### 1.2 Memória persistente no servidor
- Rotas `/memories/list|create|update|delete` implementadas no `MestreDoPC-Launcher.ps1` (arquivo `v10/data/memories/chat-memories.json`) e já existiam como referência em `v10/memory-routes.js` (Node, usa `memory-manager.js`).
- `chat-module.js`: memória agora busca do servidor primeiro, com fallback para IndexedDB/localStorage offline.
- **Testado**: CRUD completo funcionando, incluindo verificação específica de um bug conhecido do PowerShell 5.1 (`ConvertTo-Json` pode colapsar array de 1 elemento) — confirmado que **não** ocorre aqui porque o array vem dentro de um hashtable, não solto.

### 1.3 Redesign do painel "Output do Comando" + exportação de relatórios
- Arquivo: `v10/index.html` (commit `c5e7913`).
- Novo visual: cabeçalho com gradiente, pills de estatística (total/ok/erro), cards arredondados por entrada.
- Exportação em 6 formatos, tudo client-side sem dependências novas (mantendo a convenção do projeto de não usar bundler):
  - Markdown (.md), Texto (.txt), CSV (.csv)
  - Excel (.xls, via SpreadsheetML)
  - Word (.doc, via HTML + namespaces do Word)
  - PDF (.pdf, via `window.print()` — usuário escolhe "Salvar como PDF")
- **Testado** via browser headless: menu abre/fecha, todos os 6 formatos disparam download com nome de arquivo correto, zero erros no console.

### 1.4 Ambiente de arquivos no Google Drive
- Pasta raiz criada: "Mestre do PC - Backups e Relatórios" (dentro de "Área de Trabalho").
- Subpastas: "Relatórios de Output", "Logs de Auditoria", "Backups de Configuração".
- Ainda **sem sincronização automática** — nada é enviado lá automaticamente hoje.

---

## 2. Pendências que dependem de decisão do usuário

| # | Item | Situação | Decisão necessária |
|---|------|----------|---------------------|
| 1 | PR para o commit `c5e7913` | Está apenas na branch `fix/70-botoes-quebrados-ui`, não foi aberto PR ainda | Abrir PR agora ou deixar acumular mais commits antes? |
| 2 | `/code-review` do Modo Livre (commit `37844d7`) | Interrompido por limite de gasto mensal da API (4 de 5 agentes falharam) | Tentar de novo mais tarde (quando o limite resetar) ou aceitar a revisão parcial que já foi feita manualmente? |
| 3 | Inconsistência no `CLAUDE.md` | Documento diz que `v10/launcher.js` é o "backend primário", mas quem roda de fato na porta 7777 é o `MestreDoPC-Launcher.ps1` | Corrigir a documentação para refletir a realidade, ou migrar de fato para o Node como primário (mudança maior)? |
| 4 | Sincronização com Google Drive | Pastas criadas, mas vazias e sem automação | Quer que eu configure upload automático de relatórios/logs, ou prefere fazer isso manualmente por enquanto? |

---

## 3. Observação sobre trabalho concorrente

Durante esta sessão, outra sessão/processo modificou o mesmo repositório em paralelo — trocou o mapa estático `mestreTools` por `v10/operation-registry.js` (`buildMcpToolSchemas`), reescreveu `allowed-operations.json`, adicionou `v10/chat-integrado/web-search.js` e `scripts/validate.mjs`, entre outros. Por instrução já validada do usuário, essas mudanças foram commitadas junto (**"commitar tudo como está no disco agora"**), mas **não foram revisadas em profundidade** por mim — apenas `node --check` nos arquivos JS alterados e validação de JSON. Isso é o principal motivo do item 2 da tabela acima ainda estar em aberto.

---

## 4. Roadmap Supabase (não implementado, apenas registrado)

Mantido sem alteração em relação ao plano original — fase futura, não iniciada:
- Auth de clientes via Supabase Auth.
- Tabela `subscriptions` associada ao usuário.
- MCP gratuito (subconjunto de tools) sem login.
- Chat + Modo Livre + memória sincronizada exigindo assinatura ativa.
- Processador de pagamento: ainda não definido (Stripe é candidato natural).

---

## 5. Referência

Plano original completo: `C:\Users\Jeanc\.claude\plans\vamos-integrar-mais-coisas-declarative-wilkinson.md`

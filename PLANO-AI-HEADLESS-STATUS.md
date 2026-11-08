# Mestre-do-PC → AI Headless — Status do Plano

**Repositório:** `jeanavila997-ux/Mestre-do-PC-V10`
**Branch:** `feat/phase-0-provider-abstraction`
**Última atualização:** 23/08/2026
**Responsável:** Jean Avila

---

## 1. A tese (recap)

O produto deixa de ser o painel gráfico e passa a ser a **capacidade exposta a agentes de IA**. O agente do usuário (Claude Desktop, Claude Code, Cursor, etc.) vira o front-end. O Mestre-do-PC vira o back-end agêntico: regras de negócio, autenticação, controle de assinatura, e expõe de forma determinística apenas as tools que o usuário tem direito de usar.

**Regra de ouro do plano:** cada fase só começa depois que a anterior foi validada de verdade — não arquitetar o próximo sem confirmar que o atual funciona.

---

## 2. Onde estamos agora

```
FASE 0  ████████████████████ 100% ✅ CONCLUÍDA
FASE 1  ██████░░░░░░░░░░░░░░  30% 🔄 EM ANDAMENTO
FASE 2  ░░░░░░░░░░░░░░░░░░░░   0% ⏳ NÃO INICIADA
FASE 3  ░░░░░░░░░░░░░░░░░░░░   0% ⏳ NÃO INICIADA
FASE 4  ░░░░░░░░░░░░░░░░░░░░   0% ⏳ NÃO INICIADA
```

### ✅ FASE 0 — Validação (CONCLUÍDA, 23/08)

Objetivo: confirmar que `mcp-server/` funciona conectado a um cliente real.

| Ação | Resultado |
|------|-----------|
| `npm ci` | ✅ 93 pacotes, 0 vulnerabilidades |
| `npm test` | ✅ 74/75 passaram (1 falha não-crítica: NPP token) |
| `node --check index.js` | ✅ Sem erros de sintaxe |
| Config `claude_desktop_config.json` | ✅ `mcpServers.mestre-do-pc` configurado |
| Teste real: `verificar_espaco_disco` | ✅ Retornou dados reais dos discos C/E/F |

**Veredito:** ✅ **Funcionou** — já existe AI headless funcional. Confirmado com evidência real (Claude Desktop reconectou e executou operação real via `allowed-operations.json`).

**Documento:** `FASE-0-RESULTADO.md`

---

### 🔄 FASE 1 — Contrato de Tools (EM ANDAMENTO)

Objetivo: as tools serem entendíveis por qualquer LLM, não só por quem escreveu o código.

| Tarefa | Status |
|--------|--------|
| Auditar cada tool (nome, description, schema) | ✅ Feito — `FASE-1-AUDIT-TOOLS.md` categoriza ~40 tools |
| Reescrever descriptions em linguagem de intenção | 🔄 ~20 de 40 tools reescritas |
| Garantir confirmação explícita em operações destrutivas | ⏳ Pendente |
| Padronizar retornos (sucesso/erro/aviso) | ⏳ Pendente |
| Revisar `allowed-operations.json` como fronteira de segurança | ⏳ Pendente |

**O que já foi feito:**
- Descriptions de diagnóstico (disco, RAM, temperatura, rede, sistema) reescritas: `"Mostra X. Use quando Y."`
- Descriptions de limpeza/manutenção reescritas com contexto de uso
- Descriptions de operações perigosas (`encerrar_processo`, `desativar_servico`) marcadas com ⚠️ avisos de risco explícitos
- Descriptions de SFC/DISM, Defender, Git, terminal reescritas

**O que falta:**
- ~20 tools restantes (backup, drivers, UWP apps, SSD, webhooks, auditoria, IA)
- Implementar `requiresApproval: true` no JSON Schema das tools destrutivas
- Modal de confirmação real no launcher (hoje a confirmação é só na description, não é mecânica)
- Formato padrão de retorno: `{ success, message, data }` / `{ success: false, error, code }`

---

### ⏳ FASE 2 — Multi-cliente (NÃO INICIADA)

Objetivo: provar que nada está acoplado a um cliente específico.

| Cliente | Status |
|---------|--------|
| Claude Desktop | ✅ Validado na Fase 0 |
| Claude Code | ⏳ Não testado |
| Cursor | ⏳ Não testado |
| Agente local próprio (Jean) | ⏳ Não testado |

**Critério de saída:** mesma tool, mesmo resultado, em 3+ clientes distintos.

**Pré-requisito:** Fase 1 completa (descriptions e confirmação padronizadas — testar em múltiplos clientes com tools mal descritas so retrabalho).

---

### ⏳ FASE 3 — Camada de negócio (NÃO INICIADA)

Objetivo: onde o projeto vira produto comercial.

| Item | Status |
|------|--------|
| Auth (API Key por usuário) | ⏳ Não iniciado |
| Licença por máquina (fingerprint) | ⏳ Não iniciado |
| Tools por plano (free vs pago) | ⏳ Não iniciado |
| Cobrança (Stripe/Cakto) | ⏳ Não iniciado |
| Telemetria mínima | ⏳ Não iniciado |

**Bloqueado por:** Fase 2 (não entrar em cobrança sem 3+ clientes reais funcionando).

---

### ⏳ FASE 4 — Distribuição (NÃO INICIADA)

| Item | Status |
|------|--------|
| Publicar no npm (`@jeanavila/mestre-do-pc-mcp`) | ⏳ Não iniciado |
| Comando de instalação por cliente | ⏳ Não iniciado |
| Submeter ao MCP Registry | ⏳ Não iniciado |
| Desktop Extension (`.mcpb`) | ⏳ Não iniciado |
| README com GIF demo | ⏳ Não iniciado |

**Bloqueado por:** Fase 3.

---

## 3. Decisões tomadas (sem mudanças)

| Decisão | Escolha | Motivo |
|---|---|---|
| Um MCP por LLM? | Não | Protocolo aberto, um servidor atende todos |
| Adotar Invocta agora? | Não | Framework sem histórico, reescrita é risco puro |
| Painel gráfico morre? | Não | Vira interface secundária/fallback |
| Prioridade | Fase 0 antes de tudo | ✅ Cumprido — não pular etapa de novo |

---

## 4. Incidente resolvido nesta sessão

Durante commit da Fase 1, um `git add -A` amplo trouxe acidentalmente **~800MB de perfil binário do Chrome** (usado pelo chat-agent do Notepad++, `v10/notepad-plus-plus/chat-agent/profiles/`) para o staging. O arquivo `chrome.dll` sozinho tinha 313MB — acima do limite de 100MB do GitHub, o que bloqueou o push (`GH001: Large files detected`).

**Correção:**
- Pasta removida do tracking do git (`git rm --cached`)
- Adicionada ao `.gitignore`
- Histórico local reescrito (`git reset --soft`) antes do push, já que os commits envolvidos nunca haviam sido publicados — nenhuma reescrita de histórico público ocorreu

**Lição:** evitar `git add -A` em pastas com dados binários de terceiros (perfis de navegador, node_modules, builds). Preferir adicionar arquivos específicos.

---

## 5. Próxima ação imediata

1. Finalizar push do commit limpo da Fase 1 (descriptions reescritas) para `feat/phase-0-provider-abstraction`
2. Continuar Fase 1: reescrever as ~20 descriptions restantes + implementar confirmação mecânica
3. Ao concluir Fase 1: abrir Fase 2 testando o mesmo servidor em Claude Code e Cursor

---

## 6. Riscos (sem mudança desde o plano original)

| Risco | Mitigação |
|---|---|
| Reescrever o que já funciona | Fase 0 já validou — não há motivo para trocar framework |
| Escopo inflar para "plataforma" | Fases fechadas, entrega validável em cada uma |
| Agente executando comando destrutivo | `allowed-operations.json` + confirmação explícita (Fase 1, em andamento) + tools de escrita só em plano pago (Fase 3) |
| Construir Fase 3 sem usuário real | Só entrar em cobrança depois de 3+ clientes na Fase 2 |
| Arquivos binários grandes no git | `.gitignore` atualizado; adicionar arquivos específicos, não `-A`, em pastas com dados de terceiros |

---

**Documentos relacionados:**
- `FASE-0-RESULTADO.md` — evidência de validação da Fase 0
- `FASE-1-AUDIT-TOOLS.md` — auditoria completa das ~40 tools e checklist de reescrita

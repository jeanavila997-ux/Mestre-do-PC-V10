# Plano: Mestre-do-PC → AI Headless

**Repositório:** `jeanavila997-ux/Mestre-do-PC-V10`
**Data:** 22/08/2026
**Responsável:** Jean Avila

---

## 1. A tese

O produto deixa de ser o painel gráfico e passa a ser a **capacidade exposta a agentes de IA**.

O agente do usuário (Claude Code, Claude Desktop, Codex, Cursor, ChatGPT, Grok, ou os agentes locais do próprio Jean) vira o **front-end**. O Mestre-do-PC vira o **back-end agêntico**: concentra regras de negócio, autenticação, controle de assinatura e expõe de forma determinística apenas as tools que aquele usuário tem direito de usar.

**Origem da ideia:** vídeo "Headless é o futuro dos agentes, você está preparado?" (Vini Lana / AI Coders Academy), a partir de reflexão de Tarik, líder do Claude Code na Anthropic.

### Antes e depois

| Hoje | Modelo headless |
|---|---|
| Usuário abre painel em `127.0.0.1:7777` | Usuário fala com o agente que já usa |
| Precisa aprender a interface V10 | "Meu PC tá lento, resolve" |
| MCP é recurso lateral | MCP **é** o produto |
| Monetização por licença de app | Monetização por capacidade exposta |
| Distribuição = instalar app | Distribuição = `npm run mcp install` |

---

## 2. O que já existe (ativos confirmados no repo)

| Ativo | Status | Por que importa |
|---|---|---|
| `mcp-server/` | Existe, com `npm test` próprio | A base do produto headless já está escrita |
| `allowed-operations.json` | Existe | **Contrato determinístico** — o agente não inventa comando, só executa o cadastrado. Exatamente o que o modelo agêntico exige. Acerto por instinto. |
| Operações reais de diagnóstico/reparo Windows | Existe | É o valor de verdade. Sem isso, não há produto. |
| Integração opcional Ollama | Existe | Permite operação local/offline |
| Painel local | Existe | Passa a ser opcional, não o produto |
| Deploy GitHub Actions → Hostinger | Existe (outro repo) | Padrão de deploy já conhecido |

**O que NÃO existe no repo público:** licenciamento por máquina, pagamentos, painel administrativo.

---

## 3. Diagnóstico honesto

> **Nenhuma etapa de arquitetura deve começar antes de confirmar que o `mcp-server/` atual funciona conectado a um cliente real.**

Discutimos arquitetura por várias mensagens sem essa confirmação. Esse é o risco recorrente: construir o próximo antes de validar o atual.

**Ponto de atenção sobre o Invocta:** framework brasileiro recém-lançado, sem histórico de produção. Migrar um `mcp-server/` funcional para um framework novo é reescrita com ganho incerto. Só entra em cena se a Fase 0 provar que o servidor atual está quebrado a ponto de não valer consertar.

---

## 4. Roadmap

### FASE 0 — Validação (HOJE, ~30 min) 🔴 BLOQUEANTE

Nada abaixo começa antes disso passar.

```bash
cd mcp-server
npm ci
npm test
```

Depois, conectar no Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mestre-do-pc": {
      "command": "node",
      "args": ["CAMINHO_ABSOLUTO/mcp-server/index.js"]
    }
  }
}
```

**Teste de aceitação:** pedir ao agente um diagnóstico de disco e verificar se ele executa uma operação real do `allowed-operations.json`.

**Resultados possíveis:**

- ✅ **Funcionou** → Você já tem AI headless. Só não tinha percebido. Vai para Fase 1.
- ⚠️ **Conecta mas as tools falham** → Corrigir schemas/handlers. 1–2 dias.
- ❌ **Não conecta** → Diagnosticar transporte (STDIO). Só aqui o Invocta vira candidato.

**Registrar:** o que funcionou, o que falhou, mensagens de erro.

---

### FASE 1 — Contrato de tools (2–3 dias)

Objetivo: as tools serem entendíveis por qualquer LLM, não só por quem escreveu o código.

- [ ] Auditar cada tool: nome, `description`, JSON Schema de input
- [ ] Reescrever descriptions em linguagem de intenção do usuário, não de implementação
  - ❌ `run_sfc_scannow`
  - ✅ `verificar_integridade_sistema` — "Verifica e repara arquivos corrompidos do Windows. Use quando o usuário relatar travamentos, erros ou instabilidade."
- [ ] Garantir que toda operação destrutiva exija confirmação explícita
- [ ] Padronizar retornos: sucesso, erro, e o que o agente deve dizer ao usuário
- [ ] Revisar `allowed-operations.json` — é a fronteira de segurança do produto

---

### FASE 2 — Multi-cliente (2–3 dias)

Provar que não há nada acoplado a um cliente específico.

- [ ] Claude Desktop (STDIO)
- [ ] Claude Code
- [ ] Cursor
- [ ] Um agente local próprio (validação do caso de uso real do Jean)
- [ ] Documentar o snippet de config de cada cliente no README

**Critério de saída:** mesma tool, mesmo resultado, em 3+ clientes distintos.

---

### FASE 3 — Camada de negócio (1–2 semanas)

Onde o projeto vira produto comercial. Só depois das fases anteriores.

- [ ] **Auth** — API Key por usuário (mais simples que OAuth para desktop local)
- [ ] **Licença por máquina** — fingerprint do hardware, validação online com cache offline
- [ ] **Tools por plano** — o servidor expõe conjuntos diferentes conforme a assinatura
  - Free: diagnóstico (leitura)
  - Pago: reparo e otimização (escrita)
- [ ] **Cobrança** — Stripe ou Cakto
- [ ] **Telemetria mínima** — quais tools são realmente usadas

**Chave arquitetural:** o filtro de plano acontece no **servidor**, na listagem de tools. O agente nem enxerga o que o usuário não pode usar.

---

### FASE 4 — Distribuição (1 semana)

- [ ] Publicar no npm: `npx @jeanavila/mestre-do-pc-mcp`
- [ ] Comando de instalação em um passo por cliente
- [ ] Submeter ao MCP Registry
- [ ] Avaliar Desktop Extension (`.mcpb`) para instalação em um clique
- [ ] README com GIF mostrando: usuário pede em linguagem natural → PC é reparado

---

## 5. Decisões tomadas

| Decisão | Escolha | Motivo |
|---|---|---|
| Um MCP por LLM? | **Não** | MCP é protocolo aberto. Um servidor correto atende todos os clientes. |
| Adotar Invocta agora? | **Não** | Framework sem histórico. Reescrita de código funcional é risco puro. Reavaliar só se a Fase 0 falhar feio. |
| Painel gráfico morre? | **Não** | Vira interface secundária/fallback. Deixa de ser o produto. |
| Prioridade | **Fase 0 antes de tudo** | Padrão recorrente a evitar: arquitetar o próximo sem validar o atual. |

---

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Reescrever o que já funciona | Fase 0 obrigatória antes de qualquer decisão de framework |
| Escopo inflar para "plataforma" | Fases fechadas, entrega validável em cada uma |
| Segurança: agente executando comando destrutivo | `allowed-operations.json` + confirmação explícita + tools de escrita só em plano pago |
| Construir Fase 3 sem usuário real | Só entrar na camada de cobrança depois de 3+ clientes funcionando na Fase 2 |
| Novo projeto substituir validação pendente | Este plano só avança pela ordem das fases |

---

## 7. Próxima ação

**Rodar a Fase 0 e reportar o resultado.** Nenhuma outra decisão até lá.

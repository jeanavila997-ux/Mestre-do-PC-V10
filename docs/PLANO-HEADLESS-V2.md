# Plano: Mestre-do-PC Headless — V2

**Repositório:** `jeanavila997-ux/Mestre-do-PC-V10`
**Data:** 24/08/2026
**Responsável:** Jean Avila
**Substitui:** `planomestredopcheadless.md` (22/08/2026)

---

## 1. O que mudou desde o plano anterior

O plano de 22/08 tinha uma Fase 0 bloqueante: *"nada começa antes de confirmar que o `mcp-server/` funciona conectado a um cliente real"*.

**Essa fase está concluída.** O servidor MCP está conectado ao Claude Code neste momento, expondo **306 operações** do `allowed-operations.json` como tools nomeadas em português (`diagnostico_de_rede_completo`, `verificar_saude_do_disco_smart`, `limpeza_profunda_tudo`, etc.). O teste de aceitação que o plano pedia — "pedir um diagnóstico e verificar se executa uma operação real" — já acontece rotineiramente.

O diagnóstico honesto do plano antigo ("construir o próximo antes de validar o atual") continua válido como princípio, mas o débito específico que ele apontava foi pago.

### Ativos novos que o plano antigo não previa

| Ativo | O que é | Impacto no modelo headless |
|---|---|---|
| `v10/operation-registry.js` | Fonte única de verdade: carrega `allowed-operations.json` e gera os schemas MCP via `buildMcpToolSchemas()` | **Grande.** Elimina o mapa estático duplicado. Adicionar operação agora é editar um JSON, não dois arquivos. É exatamente a base que a Fase 1 do plano antigo pedia. |
| Modo Livre (`/run-free` + `/modo-livre`) | Execução de PowerShell arbitrário, opt-in, auditada em nível `SECURITY` | **Ambíguo — ver seção 3.** É o recurso mais poderoso e o maior risco do produto ao mesmo tempo. |
| Memória persistente (`/memories/*`) | CRUD server-side em JSON, com fallback offline no navegador | Prepara a troca para Supabase por usuário sem reescrever a UI. |
| Exportação de relatórios (6 formatos) | md/txt/csv/xls/doc/pdf, client-side, sem dependências | Valor entregável ao cliente final. Relatório é o artefato que se vende. |
| 12 suítes de teste em `mcp-server/test/` | Inclui `whitelist-enforcement`, `prompt-guard`, `v11-security` | A rede de segurança para mexer no contrato de tools sem quebrar nada. |

### Ativos que continuam não existindo

Licenciamento por máquina, pagamentos, painel administrativo, publicação no npm. Igual ao plano antigo.

---

## 2. A tese, reafirmada e ajustada

O produto é a **capacidade exposta a agentes**. Isso segue de pé.

O ajuste: o plano antigo tratava `allowed-operations.json` como "contrato determinístico — o agente não inventa comando". Com o Modo Livre, essa afirmação deixou de ser universal. Existem agora **dois contratos**:

- **Contrato fechado** (306 operações catalogadas) — determinístico, auditável, seguro por construção. É o que se vende para quem não é técnico.
- **Contrato aberto** (Modo Livre) — o agente escreve PowerShell arbitrário. É poder de verdade, e é o que diferencia de qualquer concorrente. Também é o que pode destruir a máquina de um cliente.

**O produto comercial precisa tratar esses dois contratos como planos diferentes, não como um toggle escondido na UI.**

---

## 3. O Modo Livre é a decisão central deste plano

Hoje o Modo Livre é um botão local, ligado pelo usuário, gravado em `logs/config/modo-livre.json`. Isso é adequado para o Jean usar na própria máquina. **Não é adequado para um produto pago.**

O que precisa ser resolvido antes de qualquer venda:

| Problema | Por que importa | Direção proposta |
|---|---|---|
| Sem limite de escopo | `/run-free` aceita literalmente qualquer coisa, inclusive `Remove-Item -Recurse -Force C:\` | Lista de padrões proibidos mesmo em Modo Livre (formatação de disco, remoção recursiva em raiz, desativação de defesas) — um "piso" que nem o modo livre atravessa |
| Sem confirmação por comando | O `confirm()` acontece uma vez, ao ligar o modo. Depois disso tudo passa direto | Reintroduzir confirmação para comandos classificados como destrutivos, mesmo em Modo Livre |
| Sem timeout de sessão | Liga e esquece ligado | Desligar automaticamente após N minutos de inatividade |
| Sem rollback | Não existe ponto de restauração automático | Criar ponto de restauração antes da primeira execução livre da sessão (a operação `criar_ponto_de_restauracao` já existe no catálogo) |

Nenhum desses itens é opcional se o Modo Livre for vendido. Todos são dispensáveis enquanto for uso pessoal.

---

## 4. Roadmap

### FASE A — Consolidar o que existe (1–2 dias) 🔴 PRIMEIRO

O equivalente da "Fase 0" deste plano: não construir o próximo antes de fechar o atual.

- [ ] Rodar `cd mcp-server && npm test` e registrar o resultado. Nenhuma suíte foi executada desde o refactor do `operation-registry.js`.
- [ ] Resolver a inconsistência de qual launcher é o principal. Hoje o `CLAUDE.md` diz `v10/launcher.js` (Node), mas quem escuta na porta 7777 é o `MestreDoPC-Launcher.ps1`. **Duas implementações do mesmo servidor em paridade manual é o maior gerador de bug latente do projeto.**
  - Opção 1: assumir o PS1 como oficial, marcar o Node como legado.
  - Opção 2: migrar de fato para Node e aposentar o PS1.
  - Opção 3 (atual, pior): manter as duas e sincronizar na mão.
- [ ] Fechar o code-review pendente do commit `37844d7` (Modo Livre) — interrompido por limite de gasto da API.
- [ ] Abrir PR do commit `c5e7913` (painel de output) ou consolidar a branch.

**Critério de saída:** testes passando, um único launcher declarado como oficial, branch limpa.

---

### FASE B — Endurecer o Modo Livre (2–3 dias)

Implementar os quatro itens da seção 3. Cada um com teste em `mcp-server/test/`, seguindo o padrão de `whitelist-enforcement.test.js`.

**Critério de saída:** existe um teste que prova que um comando catastrófico é recusado mesmo com o Modo Livre ligado.

---

### FASE C — Contrato de tools (2–3 dias)

Herdada do plano antigo, mas agora muito mais barata porque o `operation-registry.js` centralizou tudo.

- [ ] Auditar as 306 operações: descriptions em linguagem de intenção do usuário, não de implementação.
- [ ] Padronizar retornos: o que o agente deve dizer ao usuário em sucesso, erro parcial e falha.
- [ ] Marcar explicitamente no JSON quais operações são destrutivas, quais são leitura pura, e quais exigem elevação.
- [ ] Essa marcação vira a base do filtro por plano da Fase E — fazer agora evita refazer depois.

---

### FASE D — Multi-cliente (2 dias)

- [x] Claude Code (STDIO) — **funcionando**
- [ ] Claude Desktop
- [ ] Cursor
- [ ] Documentar o snippet de config de cada cliente no README

**Critério de saída:** mesma tool, mesmo resultado, em 3+ clientes.

---

### FASE E — Camada de negócio (1–2 semanas)

Só depois de A–D. Agora com uma divisão de planos mais nítida do que a do plano antigo:

| Plano | O que expõe |
|---|---|
| **Free** | Operações de leitura/diagnóstico (~metade do catálogo) |
| **Pago** | Catálogo completo: reparo, limpeza, otimização, drivers |
| **Pro** | Modo Livre endurecido (Fase B) + memória sincronizada + relatórios exportáveis |

- [ ] Auth via API Key por usuário (Supabase Auth, projeto já existe)
- [ ] Tabela `subscriptions`
- [ ] Filtro de plano **no servidor**, na listagem de tools — o agente nem enxerga o que o usuário não pode usar. Ponto arquitetural do plano antigo que continua correto.
- [ ] Migrar `/memories/*` do JSON local para tabela `memories` por usuário
- [ ] Cobrança: Stripe ou Cakto (ainda em aberto)
- [ ] Telemetria mínima: quais das 306 operações são realmente usadas — provavelmente justifica cortar boa parte do catálogo

---

### FASE F — Distribuição (1 semana)

- [ ] Renomear o pacote: `mcp-server` → `@jeanavila/mestre-do-pc-mcp` (hoje o `package.json` tem nome genérico, não publicável)
- [ ] Publicar no npm, instalação via `npx`
- [ ] Submeter ao MCP Registry
- [ ] Avaliar Desktop Extension (`.mcpb`)
- [ ] README com demonstração: usuário pede em linguagem natural → PC é reparado

---

## 5. Decisões

| Decisão | Escolha | Motivo |
|---|---|---|
| Fase 0 do plano antigo | **Concluída** | MCP conectado e operando com 306 tools |
| Invocta | **Descartado** | A Fase 0 passou. O gatilho que o justificaria não ocorreu. |
| Dois launchers (Node + PS1) | **Escolher um na Fase A** | Paridade manual entre duas implementações é dívida técnica ativa |
| Modo Livre no produto | **Só depois da Fase B** | Vender execução arbitrária sem trava de segurança é risco jurídico, não só técnico |
| Painel gráfico | **Interface secundária** | Mantido. Ganhou valor com a exportação de relatórios. |
| Ordem | **A → B → C → D → E → F** | E/F sem A/B é vender o que não está pronto |

---

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Modo Livre destruir a máquina de um cliente | Fase B obrigatória antes de qualquer exposição comercial |
| Divergência silenciosa entre launcher Node e PS1 | Decisão de launcher único na Fase A |
| Refactor concorrente quebrar algo sem ninguém notar | Rodar `npm test` na Fase A e antes de cada merge |
| Catálogo de 306 operações virar peso morto | Telemetria na Fase E para cortar o que ninguém usa |
| Escopo inflar para "plataforma" | Fases fechadas com critério de saída explícito |

---

## 7. Próxima ação

**Fase A, item 1: rodar `npm test` no `mcp-server/` e reportar o resultado.** É a única coisa neste plano que custa cinco minutos e pode invalidar tudo o que veio depois do refactor do `operation-registry.js`.

```bash
cd mcp-server && npm test
```

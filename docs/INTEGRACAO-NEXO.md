# Integração Mestre do PC ↔ nexo-core (sessão de funções `nexo_*`)

O Mestre do PC passa a atuar como **cliente MCP do [nexo-core](https://github.com/jeanavila997-ux/nexo-core)**
e re-expõe as ferramentas do núcleo como uma nova sessão de funções, prefixadas
com `nexo_`. Assim o Mestre ganha, sem duplicar código, o catálogo de 452
comandos, a memória persistente, as skills e o agente ReAct do nexo.

## Como funciona

```
Cliente MCP (Claude Code / chat)
        │  stdio (JSON-RPC)
        ▼
mcp-server/index.js  ──(nexo-bridge.js, stdio)──►  nexo-core (nexo.mjs serve-stdio)
  tools do Mestre            cliente MCP               9 tools + 4 resources
  + tools nexo_*
```

- **Transporte:** stdio (subprocesso local). Nenhuma porta de rede é aberta.
- **Zero dependências novas:** o bridge usa apenas APIs nativas do Node.
- **Segurança atravessa a fronteira:** o gate do nexo (`confirm: true`,
  `dry_run: true`) continua decidindo no núcleo. A ponte nunca contorna confirmações.
- **Degradação graciosa:** se o nexo-core não estiver presente/saudável, o
  Mestre do PC roda normalmente — apenas sem as tools `nexo_*`.

## Ferramentas expostas

`nexo_catalog_search`, `nexo_catalog_get`, `nexo_catalog_categories`,
`nexo_catalog_run`, `nexo_memory_save`, `nexo_memory_search`,
`nexo_skills_list`, `nexo_skill_read`, `nexo_agent_run`
(e `nexo_shell_run` se a política do nexo abrir o modo shell).

## Configuração (`.env.local`)

```ini
NEXO_HOME=C:\Users\JEANPC\nexo-core   # pasta onde está o nexo.mjs
NEXO_ENABLED=1                        # 0 desliga a ponte
# NEXO_TOOL_PREFIX=nexo_
# NEXO_START_TIMEOUT_MS=15000
# NEXO_CALL_TIMEOUT_MS=120000
```

Se `NEXO_HOME` não for definido, a ponte tenta localizar um `../nexo-core`
irmão. Não achando, segue sem as tools (sem erro).

## Validação rápida

```bash
# o nexo precisa ter o catálogo convertido uma vez:
cd nexo-core && node nexo.mjs catalog convert   # gera data/catalog/commands.json

# depois, com o Mestre instalado (npm install em mcp-server/):
cd Mestre-do-PC-V10 && npm start
# no log deve aparecer: [nexo-bridge] conectado: 9 tools nexo_* disponíveis.
```

## ⚠️ Nota de segurança (ler antes de usar em produção)

A ponte amplia a superfície de execução do Mestre: `nexo_catalog_run` e
`nexo_shell_run` **executam comandos no núcleo do nexo-core, fora da whitelist
`v10/allowed-operations.json` do Mestre**. A autorização passa a depender também
da política do nexo (`nexo-core/data/policy.json`):

- O split do Mestre (MCP não-elevado → launcher) permanece intacto: a ponte
  **não** roda PowerShell dentro do Mestre; ela delega ao executor do nexo.
- Mantenha `shell_mode` **fechado** em `data/policy.json` em produção — com ele
  aberto, `nexo_shell_run` vira execução arbitrária (equivalente ao Modo Livre).
- Comandos destrutivos do nexo continuam exigindo `confirm: true`; a ponte
  **nunca** injeta confirmação automática.
- `NEXO_ENABLED=0` desliga a sessão `nexo_*` por completo.

## Pré-requisitos

- Node.js ≥ 22.13 (Mestre) / ≥ 20 (nexo).
- `nexo-core/data/catalog/commands.json` presente (gerado por `catalog convert`).
- `nexo_agent_run` requer Ollama no ar; as demais tools não.

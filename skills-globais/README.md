# Skills Globais — Mestre do PC V10

Pacote de skills reutilizáveis por **qualquer agente CLI ou harness** (Claude Code, Codex, OpenCode, Grok Build, Cursor, Gemini CLI, OMP).

Fonte didática: [Documentação do Microsoft Edge DevTools](https://learn.microsoft.com/pt-br/microsoft-edge/devtools/landing/) (Microsoft Learn, coletada em 28/10/2026).

## Por que existe

O DevTools do Edge/Chrome tem mais de 30 ferramentas. Agentes CLI não abrem o painel visual, mas acessam o mesmo poder via **Chrome DevTools Protocol (CDP)** — no Mestre do PC, pelas tools `chrome_*` da ponte `chrome-devtools-mcp`.

Cada skill desta pasta traduz uma área do DevTools em instruções curtas, em **português**, com mapeamento para tools MCP.

## Categorias

| Pasta | Tema | Skills |
|---|---|---|
| `01-inspecao-dom` | Elementos / Inspecionar | `inspecionar-elementos` |
| `02-console-javascript` | Console | `depurar-console` |
| `03-rede` | Network | `inspecionar-rede` |
| `04-desempenho` | Performance / Lighthouse / Memória | `analisar-desempenho` |
| `05-acessibilidade-emulacao` | A11y + Device Mode | `testar-acessibilidade`, `emular-dispositivos` |
| `06-seguranca-armazenamento` | Security + Application | `auditar-seguranca-armazenamento` |
| `07-acesso-navegador-agente` | Como o agente liga no browser | `conectar-navegador-agente` |

## Como instalar nos agentes

Rode o sincronizador (copia só o `SKILL.md` de cada skill para os destinos globais):

```powershell
pwsh -NoProfile -File .\skills-globais\sincronizar-para-agentes.ps1
```

Destinos padrão:

| Agente | Pasta |
|---|---|
| Claude Code | `~\.claude\skills\` |
| Codex CLI | `~\.codex\skills\` |
| Grok Build | `~\.grok\skills\` |
| Agentes genéricos | `~\.agents\skills\` |

Flags úteis:

```powershell
# só listar o que seria copiado
.\sincronizar-para-agentes.ps1 -WhatIf

# só Claude + Grok
.\sincronizar-para-agentes.ps1 -Destinos claude,grok
```

## Formato

Cada skill segue o padrão Agent Skills (`SKILL.md` + frontmatter YAML `name` / `description`), compatível com Microsoft Agent Framework, Claude Code, Codex e Copilot.

## Relatórios

- `relatorios/coleta-devtools-2026-10-28.md` — evidências coletadas via CDP nesta sessão
- `../docs/relatorio-melhorias-acesso-navegador-agente.pdf` — sugestões para o agente ter acesso melhor ao navegador

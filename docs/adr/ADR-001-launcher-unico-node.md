# ADR-001: Launcher único — `v10/launcher.js` (Node.js)

**Status:** Accepted (ratifica decisão já implementada no código)
**Data:** 2026-09-03
**Decisor:** JEAN (Jean Carlos de Avila)
**Substitui a questão aberta em:** `docs/PLANO-HEADLESS-V2.md:59` (Fase A)

---

## Contexto

O projeto manteve por muito tempo **duas implementações do mesmo servidor HTTP na porta 7777**:

| Implementação | Linhas | Papel declarado |
|---|---|---|
| `MestreDoPC-Launcher.ps1` | 1220 | Launcher PowerShell, auto-elevado |
| `v10/launcher.js` | 927 | Launcher Node.js |

O plano headless classificou isso como o problema arquitetural número um:

> "Duas implementações do mesmo servidor em paridade manual é o maior gerador de bug latente do projeto."
> — `docs/PLANO-HEADLESS-V2.md:59`

E listou três saídas: adotar o PS1, migrar para Node, ou continuar sincronizando os dois à mão.

### A constatação que motiva este ADR

**A decisão já foi tomada e implementada no código — mas nunca foi registrada, e parte do
repositório ainda afirma o contrário.**

`MestreDoPC-Launcher.ps1` não é mais um servidor. É um redirecionador de 12 linhas:

```powershell
# MestreDoPC-Launcher.ps1:1-13
# Compatibilidade: o launcher PowerShell foi substituído por v10\launcher.js.
# Mantido apenas para instalações antigas que ainda chamam este arquivo.
$nodeLauncher = Join-Path $PSScriptRoot "start-mestre-v10.ps1"
...
Write-Warning "MestreDoPC-Launcher.ps1 está obsoleto; iniciando o launcher Node.js."
& $nodeLauncher
exit $LASTEXITCODE

# Implementação legada mantida abaixo apenas para histórico e não é executada.
```

As ~1207 linhas seguintes estão abaixo de um `exit` — código morto.

### Evidências de que o Node já é o oficial

| Evidência | Fonte |
|---|---|
| PS1 é shim; linha 13 declara o resto inexecutável | `MestreDoPC-Launcher.ps1:1-13` |
| Guia do projeto: Node = "primary backend"; PS1 = "legacy… not the default" | `docs/CLAUDE.md:13,23` |
| Inicializador: "o launcher primário é o Node.js… PS1 permanece apenas como redirecionador" | `start-mestre-v10.ps1:17-19` |
| Tarefa agendada executa `node launcher.js` com `RunLevel Highest` | `scripts/Register-MestreTask.ps1:28-36` |
| 7 suítes de teste sobem `v10/launcher.js`; CI roda `node --check v10/launcher.js`. **Zero** teste cobre o PS1 | `mcp-server/test/*.test.js`, `.github/workflows/ci.yml` |
| Processos legados do PS1 são encerrados ativamente na ativação | `scripts/ativar-atualizar-tudo.ps1:529-531` |

Este ADR, portanto, **não escolhe entre duas opções vivas**. Ele ratifica o que já vale, registra
o porquê, e converte o resto inacabado da migração em ações rastreáveis.

---

## Decisão

**`v10/launcher.js` (Node.js) é o único launcher oficial do Mestre do PC V10.**

`MestreDoPC-Launcher.ps1` permanece temporariamente como shim de compatibilidade para instalações
antigas que ainda apontam para ele, e será removido quando não houver mais instalações nessa
condição (ver Itens de Ação, P2).

---

## Opções consideradas

### Opção A: PS1 como oficial, Node aposentado

| Dimensão | Avaliação |
|---|---|
| Complexidade | **Alta** — exigiria reescrever em PowerShell tudo que hoje é modular em Node |
| Custo | **Alto** — perda de 7 suítes de teste e da verificação de CI |
| Escalabilidade | **Baixa** — arquivo monolítico de 1220 linhas |
| Familiaridade | Alta (PowerShell é nativo do domínio Windows) |

**Prós:** elevação embutida via `-Verb RunAs`; zero dependência de runtime externo.

**Contras:** perderia as rotas que só existem no Node (`/api/`, `/operations`, `/soul`, `/npp`,
`/ollama/pull`, `/chat-integrado/`); perderia `operation-registry.js` como fonte única de verdade;
manteria a duplicação da camada de segurança (`Write-AuditLog` em `:124` e `Test-PromptInjection`
em `:275` são reimplementações PowerShell de `mcp-server/audit-logger.js` e
`mcp-server/security.js`); nenhum teste automatizado existe para essa implementação.

### Opção B: Node como oficial, PS1 aposentado ✅ **ESCOLHIDA**

| Dimensão | Avaliação |
|---|---|
| Complexidade | **Baixa** — já implementada |
| Custo | **Baixo** — resta pagar o débito residual da migração |
| Escalabilidade | **Alta** — 927 linhas modulares, com rotas em arquivos separados |
| Familiaridade | Alta — o servidor MCP já é Node e compartilha módulos |

**Prós:**

- **Fonte única de verdade:** importa `operation-registry.js`, `memory-routes.js`,
  `operation-routes.js`, `soul-routes.js` e `security/origin-policy.js`
  (`v10/launcher.js:16-22`), e **compartilha** `mcp-server/security.js` e
  `mcp-server/audit-logger.js` com o servidor MCP — uma cópia da camada de segurança, não duas.
- **Superfície funcional maior** que o PS1 jamais teve.
- **Rede de testes real:** 7 suítes + verificação de sintaxe em CI.

**Contras:** introduz o runtime Node como dependência dura no cliente final.

### Opção C: manter os dois em paridade manual

| Dimensão | Avaliação |
|---|---|
| Complexidade | **Alta** — toda mudança precisa ser feita duas vezes |
| Custo | **Crescente** — divergência acumula silenciosamente |
| Escalabilidade | **Nenhuma** |
| Familiaridade | Irrelevante |

**Contras:** é exatamente o estado que produziu a duplicação de `Test-PromptInjection` e
`Write-AuditLog`. Divergência em código de segurança não falha alto — falha em silêncio.

---

## Análise de trade-offs

O único trade-off real da Opção B é a **dependência de runtime Node no cliente final**. Ele já
está mitigado:

- `install.ps1:82` instala Node.js LTS via `winget` quando ausente, de forma idempotente
- `mcp-server/package.json:30` fixa `"node": ">=22.13.0"`
- o servidor MCP já exige Node — logo, a dependência não é nova, apenas passa a valer também
  para o launcher

**A elevação nunca foi vantagem arquitetural do PS1.** Elevar é um problema de *bootstrap*, não
uma capacidade do servidor. O `-Verb RunAs` do PS1 foi substituído por tarefa agendada com
`RunLevel Highest` (`scripts/Register-MestreTask.ps1:35-36`), que é a forma correta no Windows —
inclusive melhor, porque não dispara prompt UAC a cada logon.

---

## Consequências

**O que fica mais fácil**

- Uma implementação para manter, testar e auditar
- Mudanças no catálogo passam por `operation-registry.js` e valem para launcher e MCP de uma vez
- Toda alteração no launcher é coberta por testes reais e por CI

**O que fica mais difícil**

- Node vira dependência dura: falha do `winget` passa a ser falha de instalação
- Perde-se a auto-elevação de clique único; a elevação agora depende da tarefa agendada estar
  registrada corretamente — ver P0 abaixo

**O que precisará ser revisitado**

- Se o público final não-técnico tropeçar na instalação do Node, avaliar empacotar o runtime
  (executável único / Node embutido) em vez de depender do `winget`

---

## Itens de ação

### 🔴 P0 — `install.ps1` aborta em instalação limpa

O commit `b2a75f5` renomeou `Register-MestreTask.ps1` → `scripts/Register-MestreTask.ps1`
(rename puro, R100) e **não atualizou as duas referências** no instalador:

- `install.ps1:49` — exige o arquivo na **raiz** do `$InstallDir` (lista de obrigatórios)
- `install.ps1:133` — invoca o arquivo na **raiz**

Com `$ErrorActionPreference = "Stop"` (`install.ps1:20`), a instalação morre no passo 1 com
`"Arquivo obrigatorio nao encontrado"`. Consequência em cadeia: a tarefa
`MestreDoPC_Admin_Launcher` nunca é registrada → o launcher sobe **sem elevação** → todo o
catálogo administrativo falha.

- [x] Corrigir `install.ps1:49` e `install.ps1:133` para `scripts\Register-MestreTask.ps1`
- [x] Garantir que `scripts/build-package.js` inclua `Register-MestreTask.ps1` no pacote do cliente
- [x] Adicionar verificação que falhe se um arquivo da lista de obrigatórios não existir no
      layout do repositório — `mcp-server/test/install-required-files.test.js`, que faz o parse
      da lista `$required` do próprio `install.ps1` e dos scripts resolvidos via `$InstallDir`

> **Fora do escopo deste ADR, mas registrado:** o pacote gerado por `scripts/build-package.js`
> contém apenas instalador, desinstalador, ícone e atalhos — **não inclui a aplicação**
> (`v10/`, `mcp-server/`, `startup/`). Rodado a partir desse pacote, o `install.ps1` falharia na
> lista de obrigatórios por vários arquivos, não só por este. Merece um ADR próprio sobre o
> formato de distribuição.

### 🟡 P1 — Débito residual da migração

- [x] Remover as ~1207 linhas mortas de `MestreDoPC-Launcher.ps1`, preservando apenas o shim
      (o arquivo passou de 1220 para 14 linhas; o código legado segue no histórico do git)
- [x] Corrigir a documentação que ainda afirmava o oposto:
  - `docs/PLANO-HEADLESS-V2.md` (Fase A) — apresentava a escolha como questão aberta; agora
    aponta para este ADR
  - `docs/PLANO-AJUSTES-STATUS.md` §1.1 — afirmava que o PS1 "é a que roda de fato na porta 7777"

### 🟢 P2 — Remoção do shim

- [ ] Definir o gatilho de remoção (ex.: após N versões, ou quando não houver mais instalações
      apontando para o PS1)
- [ ] Ao remover, limpar também a entrada `"MestreDoPC-Launcher.ps1"` em
      `scripts/validate.mjs:31-37` (`LEGACY_SCRIPTS`)

> Nota: `LEGACY_SCRIPTS` é um conjunto de **exclusão de lint**, não uma lista de arquivos
> obrigatórios. Apagar o PS1 não quebra `scripts/validate.mjs`.

---

## Referências

- `docs/PLANO-HEADLESS-V2.md` — plano headless V2, Fase A (origem da questão)
- `docs/CLAUDE.md` — guia de arquitetura do projeto (já reflete esta decisão)
- `scripts/Register-MestreTask.ps1` — estratégia de elevação vigente
- `.github/workflows/ci.yml` — verificação de CI do launcher Node

# Camada de Segurança v1.1.1 — Mestre do PC

Implementação executável do adendo `v1.1.0` (Regras #6–#14), **com as correções** dos
defeitos encontrados na revisão contra o código instalado.

> Pasta de *staging*: nada do app importa daqui. O launcher em execução não é afetado.
> Para ativar, copie para `mcp-server/security/` (ver §Migração).

```
node --test --test-concurrency=1 "test/security.test.js"
# → 47 testes, 47 pass, 0 fail
```

---

## 1. O que mudou em relação ao adendo v1.1.0

| Regra | Defeito no adendo | Correção aqui | Teste |
|---|---|---|---|
| todas | `require()` em projeto **ESM** (`"type": "module"`) → `ERR_REQUIRE_ESM` | `import`/`export` | — |
| todas | `SecurityError` usada em 6 arquivos, **nunca definida** | `errors.js` com `code` + `meta` + `toAuditError` | — |
| #6 | `os` usado sem import → `ReferenceError` | importado | — |
| #6 | `abs.includes('..')` depois de `path.resolve()`: check **morto** e falso-positivo em `rel..atorio.txt` | contenção real (`path.relative` / prefixo com separador) | `prefixo de string não engana` |
| #6 | `startsWith(root)` aceitava `...\Temp-malicioso` | idem, com separador de diretório | idem |
| #6 | junction/symlink não resolvido | `fs.realpathSync.native` com fallback para alvo inexistente | `junction para fora do projeto` |
| #6 | comparação case-sensitive (Windows não é) | `toLowerCase()` canônico | — |
| #6 | `arquivo.txt:fluxo` (ADS) passava | detecta `:` após o drive | `fluxo alternativo (ADS)` |
| #6 | raiz única projeto+Temp quebrava diagnóstico (CBS, Minidump, WER) | `readRoots` separado de `writeRoots` | — |
| #6 | `MESTRE_PROJETO_PATH` vazio → só Temp → tudo bloqueado | `projectRoot` obrigatório, **sem fallback silencioso** | `política inválida` |
| #7 | regra genérica `{32,}` **destruía** SHA-256 e a própria Regra #9 | prefixos de provedor; hex/UUID **preservados** | `NÃO mascara SHA-256` |
| #7 | webhook Discord (segredo no path, host permitido) vazava | regra dedicada Discord/Slack | `token de webhook Discord` |
| #7 | `redact` aplicado **depois** do corte de 500 chars | `redactAndTruncate` redige → depois corta | `redige ANTES de truncar` |
| #8 | buckets nunca podados → leak + O(n·m) | `sweep()` + poda por janela | `sweep não deixa a memória crescer` |
| #8 | limite global de 30/60s estourava **dentro** de um diagnóstico | escopo por invocação de ferramenta | `escopado por invocação` |
| #9 | SHA-256 com hash esperado **ao lado do JSON** = forjável | **HMAC** com chave do launcher + `timingSafeEqual` | `sem chave falha fechado` |
| #9 | `Get-FileHash` (MAIÚSCULAS) vs `digest('hex')` (minúsculas) → `READ_ONLY` permanente | normalização + tolerância a BOM/CRLF | `hash em MAIÚSCULAS`, `BOM + CRLF` |
| #9 | verificação só no boot (TOCTOU) | `loadVerifiedWhitelist` congela snapshot em memória | `snapshot congelado` |
| #10 | `v10/logs/audit.jsonl` paralelo ao `audit-logger.js` existente | sink injetado → **uma** trilha | — |
| #10 | `String(x).slice(0,500)` antes de redigir | ordem invertida | (coberto em #7) |
| #10 | `JSON.stringify` circular perdia a entrada **no erro** | `stableStringify` + `"[Circular]"` | `argumento circular` |
| #10 | "hash chain" que não encadeava | `prev`/`hash` reais por entrada | `cadeia de hash` |
| #13 | `host.endsWith('discord.com')` aceita **`evildiscord.com`** | igualdade exata ou sufixo `.dominio` | `evildiscord.com é bloqueado` |
| #13 | HTTP permitido, `new URL` estourando sem catch, redirects seguidos | só HTTPS, erro tipado, `redirect: 'manual'` no chamador | `HTTP e URL malformada` |
| #13 | segredo em base64 passava | varredura de candidatos base64 | `segredo em base64` |
| #14 | **assumia** que toda operação honra `dryRun` | `supportsDryRun !== true` → **não executa** | `operação sem suporte NÃO executa` |
| #14 | `"confirmo"` como senha — **o próprio modelo conhece a string** | nonce HMAC ligado a `(op + args)`, TTL 60s, uso único, emitido pela UI | `"confirmo" vindo do modelo é recusado` |

### O bug mais grave do adendo (verificado no código real)

`v10/chat-integrado/tools-api.js:223` é a **única** ocorrência de `dryRun` em todo o `v10/`:

```js
if (options.dryRun) return data;
```

Nenhuma operação da whitelist declara suporte. Com a Regra #14 do adendo,
`runOperation(op, { dryRun: true })` **executa de verdade** enquanto a UI mostra
"⚠️ simulação" — e o usuário digita `"confirmo"` achando que ainda vai aprovar.
Aqui isso é impossível: sem `supportsDryRun === true`, o `runner` nunca é chamado
(`assert.equal(chamadas, 0)`).

---

## 2. Lista fechada de gatilhos — agora com 11

O adendo dizia "8" mas bloqueava em ~11 comportamentos (rate limit, timeout,
elevação e "não inventar dado" ficavam de fora). Contrato que vaza é pior que
contrato nenhum. `TRIGGERS` em `index.js` é a fonte única:

| # | Código | Regra |
|---|---|---|
| 1 | `NAO_WHITELIST` | #1 |
| 2 | `SEM_APROVACAO` | #14 |
| 3 | `APROVACAO_FORJADA` | #14 |
| 4 | `PROMPT_INJECTION` | #3 |
| 5 | `METACARACTERE` | #4 |
| 6 | `PATH_*` | #6 |
| 7 | `INTEGRIDADE_VIOLADA` | #9 |
| 8 | `HALT_ATIVO` | #11 |
| 9 | `EXFIL_*` | #13 |
| 10 | `LOOP_DETECTADO` | #8 |
| 11 | `OP_SEM_DRYRUN` | #14 |

---

## 3. Uso

```js
import {
  buildPolicy, RateLimiter, ApprovalBroker, createAuditRecorder,
  loadVerifiedWhitelist, preflightExfil, executeDestructive, NIVEL,
} from './security/index.js';

const policy = buildPolicy({
  projectRoot: process.env.MESTRE_PROJETO_PATH,   // obrigatório
  readRoots: ['C:\\Windows\\Logs\\CBS', 'C:\\Windows\\Minidump'],
  writeRoots: [],
});

// Toda operação de arquivo passa por aqui
const alvo = policy.guard(args.caminho, 'write');

const limiter = new RateLimiter({ perOp: 3, global: 30 });
limiter.assertAllowed('limpeza_rapida_completa', { scope: toolCallId });

const broker = new ApprovalBroker({ key: process.env.MESTRE_APPROVAL_KEY });
const audit = createAuditRecorder({ sink: (entry) => auditLog(/* ... */) });
```

### Instalar a proteção de whitelist

```powershell
$k = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))
$k | Out-File "$env:ProgramData\MestreDoPC\whitelist.key" -Encoding ascii -NoNewline

# Assinar (só depois de revisar o diff à mão)
node -e "import('./security/integrity.js').then(m=>console.log(m.signWhitelist({jsonPath:process.argv[1], key:process.argv[2]})))" `
  "$env:MESTRE_PROJETO_PATH\v10\allowed-operations.json" (Get-Content "$env:ProgramData\MestreDoPC\whitelist.key" -Raw)
```

A chave fica **fora** do alcance do agente. Sem ela → `READ_ONLY` (fail-closed).

---

## 4. Migração (sem duplicar o que já existe)

Não crie uma segunda camada. O projeto já tem
`mcp-server/security.js` (`sanitizeToolArgument`, `checkPromptInjection`) e
`mcp-server/audit-logger.js` (`AuditLevel`, `auditLog`, `queryAuditLog`).

```
sugestões\security-v1.1.1\*.js
        ↓ copiar
mcp-server\security\
        ↓
index.js  →  re-exporta; security.js passa a delegar para cá
audit.js  →  sink = mcp-server/audit-logger.js (NÃO criar audit.jsonl)
```

```powershell
New-Item -ItemType Directory -Force "$env:MESTRE_PROJETO_PATH\mcp-server\security"
Copy-Item ".\sugestões\security-v1.1.1\*.js" "$env:MESTRE_PROJETO_PATH\mcp-server\security\"
```

`mcp-server/` já é `"type": "module"` — nada a mudar.

---

## 5. O que ainda NÃO está aqui (P1/P2)

1. **Autenticação do launcher elevado.** É o risco nº 1 real: processo `Admin=True`
   escutando `127.0.0.1:7777`. Já existem `v10/security/origin-policy.js` e
   `mcp-server/auth/local-token.js` — falta exigir token **por requisição** nas
   rotas de operação (não só CORS de resposta).
2. **Kill de árvore de processos.** `child.kill()` no Windows não mata netos:
   `sfc`/`dism` sobrevivem ao timeout. Precisa `taskkill /T /F` + verificação.
3. **`.HALT` fora da área gravável pelo agente** (`%ProgramData%` com ACL) e
   checado **no launcher**, não só no MCP.
4. **`supportsDryRun` na whitelist** — o gate existe; o dado ainda não.

---

## 6. Nota sobre `tempDir`

`buildPolicy` inclui `os.tmpdir()` como raiz de leitura **e** escrita (necessário
para limpeza de temporários). Isso é amplo por definição. Se quiser escopo menor,
passe `tempDir: null` e adicione alvos explícitos em `writeRoots`.

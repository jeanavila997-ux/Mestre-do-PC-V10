# Integração Mestre do PC V10 com Notepad++

Esta integração permite que o **Notepad++** se comunique com o Mestre do PC V10 para:
- Explicar código/texto selecionado via IA local (Ollama).
- Responder perguntas sobre o conteúdo selecionado.
- Sugerir comandos do Mestre do PC para resolver problemas descritos.
- Gerar diagnósticos rápidos do PC.
- Buscar na web pelo texto selecionado.

A comunicação é feita por HTTP no endpoint `/npp` do launcher (`http://127.0.0.1:7777`), autenticada por token.

## Como funciona

```text
Notepad++ (PythonScript plugin)
        │
        │ POST /npp
        │ Headers: X-Mestre-Client: notepad-plus-plus
        │          X-Mestre-Npp-Token: <token>
        │ Body: {"action": "explain_code", "payload": {"text": "..."}}
        ▼
v10/launcher.js
        │
        ├── valida token/client
        ├── valida action contra allowlist
        └── executa handler apropriado
        │
        ▼
   Resposta JSON → novo documento no Notepad++
```

## Operações suportadas

| Action | Payload | Descrição |
|--------|---------|-----------|
| `explain_code` | `text`, `language` (opcional) | Explicação do código/texto. |
| `ask_ai` | `text`, `question` | Resposta da IA sobre o contexto. |
| `suggest_cmd` | `text` | Sugere comando do Mestre do PC. |
| `quick_diag` | — | Relatório rápido do PC. |
| `search_web` | `query`, `max_results` | Busca DuckDuckGo. |

## Segurança

- O endpoint `/npp` é **desabilitado por padrão**. Só é ativado quando a variável de ambiente `MESTRE_NPP_TOKEN` é definida.
- Apenas ações **não destrutivas** são permitidas. Não é possível executar `/run` ou operações como `encerrar_processo`, `desativar_servico` ou limpeza de arquivos.
- O launcher valida o header `X-Mestre-Client: notepad-plus-plus` e o token `X-Mestre-Npp-Token`.
- Origens `127.0.0.1`/`localhost` ou vazias são aceitas, pois o PythonScript não envia `Origin` consistente.

## Configuração

Veja o guia passo a passo em [`v10/notepad-plus-plus/setup-npp.md`](../v10/notepad-plus-plus/setup-npp.md).

Resumo:
1. Defina `MESTRE_NPP_TOKEN` no sistema ou no script de inicialização do launcher.
2. Instale o plugin **PythonScript** no Notepad++.
3. Copie `v10/notepad-plus-plus/MestreDoPC.py` para os scripts do PythonScript.
4. Configure atalhos de teclado para as funções `mestre_*`.

## Arquivos relacionados

- `v10/launcher.js` — rota `/npp`, validação de token e handlers.
- `v10/notepad-plus-plus/MestreDoPC.py` — script PythonScript.
- `v10/notepad-plus-plus/setup-npp.md` — guia de instalação.
- `mcp-server/test/notepad-plus-plus.test.js` — testes de segurança/funcionalidade.

## Limitações conhecidas

- O PythonScript usa Python 2.7 (versão mais comum do plugin). O script foi escrito para ser compatível com Python 2/3.
- A busca na web pode ser bloqueada temporariamente pelo DuckDuckGo em caso de rate-limit.
- A IA depende do modelo Ollama configurado (`OLLAMA_MODEL`).

# MCP do Mestre do PC V10

Servidor MCP por `stdio` que publica 33 ferramentas de diagnóstico e manutenção.
Comandos administrativos são encaminhados ao launcher local em
`http://127.0.0.1:7777`; consultas de IA usam o Ollama diretamente.

## Instalar e testar

```powershell
npm ci
npm test
node --check index.js
```

Normalmente o Claude Desktop ou Codex inicia `index.js`; não é necessário manter
`npm start` aberto manualmente.

## Variáveis de ambiente

| Variável | Padrão | Uso |
|---|---|---|
| `MESTRE_BASE_URL` | `http://127.0.0.1:7777` | Launcher administrativo |
| `MESTRE_PROJETO_PATH` | Diretório do launcher | Diretório usado pelas ferramentas Git/logs |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | API do Ollama |
| `OLLAMA_MODEL` | `qwen2.5-coder:1.5b` | Modelo padrão |

## Claude Desktop

```json
{
  "mcpServers": {
    "mestre_do_pc": {
      "command": "node",
      "args": ["C:\\caminho\\MestreDoPC_V7_clone\\mcp-server\\index.js"],
      "env": {
        "MESTRE_PROJETO_PATH": "C:\\caminho\\MestreDoPC_V7_clone"
      }
    }
  }
}
```

O MCP identifica suas requisições administrativas com `X-Mestre-Client: mcp`;
chamadas HTTP genéricas ao launcher são recusadas.

## Auditoria de dependências

Em 2026-07-26, o SDK MCP foi atualizado para `1.29.0` (versão mais recente no
registro) e as dependências transitivas compatíveis receberam versões
corrigidas por `overrides`.

`npm audit --omit=dev` ainda informa dois registros moderados que representam a
mesma vulnerabilidade em `@hono/node-server` (`serveStatic` no Windows). O
servidor do MestreDoPC usa transporte `stdio` e não importa nem publica essa
rota. A correção disponível exige forçar uma versão principal que o SDK MCP
ainda não declara compatível; por isso ela não foi aplicada automaticamente.

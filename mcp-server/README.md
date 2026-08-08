# MCP do Mestre do PC V10

Servidor MCP por `stdio` que publica ferramentas de diagnóstico, manutenção,
consulta de IA local e busca na web.
Comandos administrativos são encaminhados ao launcher local em
`http://127.0.0.1:7777`; consultas de IA usam o Ollama diretamente; buscas na
web usam DuckDuckGo HTML.

## Instalar e testar

```powershell
npm ci
npm test
node --check index.js
```

Normalmente o Claude Desktop ou Codex inicia `index.js`; não é necessário manter
`npm start` aberto manualmente.

## Ferramentas incluídas

- Diagnóstico e manutenção do Windows (RAM, disco, rede, processos, etc.).
- `perguntar_ia` — envia perguntas ao Ollama. Aceita `usar_web: true` para
  buscar na web antes e enriquecer a resposta.
- `buscar_na_web` — busca no DuckDuckGo e retorna título, URL e trecho.
- `analisar_logs_sistema` — coleta erros do Event Viewer e resume com IA.
- `verificar_prompt` — detecta prompt injection/jailbreak.
- `verificar_modelo_ollama` — checa se o modelo padrão está instalado.

## Variáveis de ambiente

| Variável | Padrão | Uso |
|---|---|---|
| `MESTRE_BASE_URL` | `http://127.0.0.1:7777` | Launcher administrativo |
| `MESTRE_PROJETO_PATH` | Diretório do launcher | Diretório usado pelas ferramentas Git/logs |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | API do Ollama |
| `OLLAMA_MODEL` | `qwen2.5-coder:3b-instruct` | Modelo padrão |
| `OLLAMA_NUM_CTX` | `8192` | Contexto máximo (tokens) enviado ao Ollama |

## Claude Desktop

```json
{
  "mcpServers": {
    "mestre_do_pc": {
      "command": "node",
      "args": ["C:\\Users\\Jeanc\\Mestre-do-PC-V10-clean\\mcp-server\\index.js"],
      "env": {
        "MESTRE_PROJETO_PATH": "C:\\Users\\Jeanc\\Mestre-do-PC-V10-clean",
        "OLLAMA_NUM_CTX": "8192"
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

## Web search

A ferramenta `buscar_na_web` usa o front-end HTML do DuckDuckGo
(`html.duckduckgo.com`). Não exige API key. Os resultados incluem título,
URL decodificada e trecho da página.

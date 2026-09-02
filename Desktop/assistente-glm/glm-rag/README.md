# glm-rag — base de conhecimento do assistente-glm

RAG local, híbrida, exposta como **servidor MCP stdio**. Roda inteiramente offline
depois do primeiro download dos modelos de embedding.

## Por que MCP e não import direto

O assistente-glm é híbrido (Python + Node). In-process obrigaria a manter duas
implementações da RAG. Com MCP:

- o lado Python pode importar `ragcore` direto **ou** falar MCP;
- o lado Node fala MCP sem uma linha de Python;
- Claude Desktop e qualquer agente futuro plugam na mesma base;
- o índice vira infraestrutura, não dependência de um binário.

## Instalação

```powershell
cd C:\Users\JEANPC\Desktop\assistente-glm
git clone <este-diretorio> glm-rag   # ou copie a pasta
cd glm-rag
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Configuração

Ajuste os caminhos em `ragcore/config.py` ou via variáveis de ambiente:

```powershell
$env:GLM_AGENT_ROOT    = "C:\Users\JEANPC\Desktop\assistente-glm"
$env:GLM_OBSIDIAN_ROOT = "C:\Users\JEANPC\Documents\Obsidian"   # ajuste
$env:GLM_INDEX_DIR     = "C:\Users\JEANPC\.glm-rag"
```

O índice fica **fora** do repo do agente de propósito — não polui o git e
sobrevive a um `git clean`.

## Ingestão

```powershell
python -m ragcore.ingest            # incremental: só arquivos com mtime novo
python -m ragcore.ingest --full     # reconstrói do zero
python -m ragcore.ingest --source obsidian
```

O manifesto (`manifest.json`) guarda `mtime:size` por arquivo. Reingestão diária
custa segundos.

## Rodar o servidor

```powershell
python server.py
```

## Tools expostas

| Tool | Para quê |
|---|---|
| `buscar_conhecimento` | Busca híbrida. Filtros opcionais por `fonte` e `tipo`. |
| `quem_usa_parametro` | Grafo `step → parameters_used`. "O que quebra se eu renomear X." |
| `ler_arquivo_indexado` | Todos os chunks de um arquivo. |
| `status_indice` | Contagens e diagnóstico. |

## Plugando no lado Node

```jsonc
// mcp.config.json do agente
{
  "mcpServers": {
    "glm-rag": {
      "command": "C:\\Users\\JEANPC\\Desktop\\assistente-glm\\glm-rag\\.venv\\Scripts\\python.exe",
      "args": ["C:\\Users\\JEANPC\\Desktop\\assistente-glm\\glm-rag\\server.py"],
      "env": { "GLM_INDEX_DIR": "C:\\Users\\JEANPC\\.glm-rag" }
    }
  }
}
```

Com `@modelcontextprotocol/sdk`:

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const rag = new Client({ name: "assistente-glm", version: "1.0" });
await rag.connect(new StdioClientTransport({
  command: ".\\glm-rag\\.venv\\Scripts\\python.exe",
  args: ["glm-rag\\server.py"],
}));

const r = await rag.callTool({
  name: "buscar_conhecimento",
  arguments: { consulta: "como validar step_number duplicado", k: 5 },
});
console.log(r.content[0].text);
```

## Plugando no lado Python

```python
from ragcore.index import HybridIndex

idx = HybridIndex()
for hit in idx.search("validação de parâmetros do workflow", k=5):
    print(hit["meta"]["path"], hit["score"])
```

## Decisões de projeto que importam

**Sanitização antes de tudo.** O arquivo real que originou este projeto tinha 500
linhas, das quais 217 (45%) eram bloco de assinatura Authenticode em base64. Sem
o filtro de `sanitize.py`, quase metade dos chunks seria certificado da
Microsoft — envenenando toda busca por similaridade. O sanitizador também
substitui valores de `api_key`/`token`/`password` por `<REDACTED>`: o agente vê
que a variável existe, o valor nunca entra no índice.

**Chunking estrutural, não por caractere.** Python é fatiado por `ast.parse()`,
então nenhum `def` é cortado no meio e cada chunk carrega assinatura + docstring
no topo (melhora muito o recall). `workflow_schema.json` vira um chunk por
parâmetro e um por step. Markdown quebra por heading.

**Dois espaços vetoriais.** Código usa `jina-embeddings-v2-base-code`, texto usa
`multilingual-e5-small` (entende PT-BR, ~130MB, CPU). Modelos diferentes não
podem compartilhar coleção — daí as coleções `text` e `code` separadas.

**Híbrido com RRF.** Busca densa erra identificadores literais
(`parameters_used`, nome de função); BM25 erra paráfrase. Reciprocal Rank Fusion
combina os dois rankings sem calibrar pesos. O título entra duplicado no corpus
BM25 para dar peso extra a nomes.

**Grafo em vez de torcer pela similaridade.** A relação `step → parameters_used`
já é explícita no schema. `quem_usa_parametro` percorre a aresta e responde com
precisão o que a busca semântica só chutaria.

## Manutenção

Agende a reingestão incremental:

```powershell
schtasks /Create /SC DAILY /TN "glm-rag-ingest" /ST 03:00 ^
  /TR "C:\Users\JEANPC\Desktop\assistente-glm\glm-rag\.venv\Scripts\python.exe -m ragcore.ingest"
```

## Ressalvas conhecidas

- Seções de Markdown com menos de 30 caracteres são descartadas por
  `is_worth_indexing`. Ajuste o limiar em `chunkers.py` se suas notas do Obsidian
  forem muito curtas.
- O chunker de JS/TS usa regex, não um parser real. Cobre `function`, `class` e
  arrow functions atribuídas; classes com métodos complexos podem ficar em um
  chunk só. Se virar problema, troque por `tree-sitter`.
- `logs` pode inflar o índice rápido. Considere limitar a janela de dias.

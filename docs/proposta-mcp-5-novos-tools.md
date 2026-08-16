# Proposta: 5 Novos Comandos MCP (V11.1)

**Status:** Rascunho de design — sem implementação ainda.
**Data:** 2026-08-16
**Autor:** JEAN + assistente IA

Esta proposta expande o arsenal do servidor MCP do Mestre do PC V10 misturando a
capacidade de sistema do **Mestre-do-PC** com o rigor metodológico esperado de
projetos de dados (ex: Pecuária Acre). Os comandos se concentram em três
frentes:

1. **Extração Segura** — só fontes oficiais, só PDFs já validados.
2. **Análise Sandboxed** — IA vira operadora; cálculo fica no script oficial.
3. **Proteção de Sistema** — imutabilidade e versionamento de marcos.

Todos os comandos são projetados para passar pelo verificador
`allowed-operations.json`, mantendo a filosofia de segurança do V10.

---

## 1. `consultar_fonte_oficial_gov` — Scraper com Lista Branca

Restringe a extração da IA **exclusivamente** a domínios de alta confiança
cadastrados. Se a IA tentar usar Wikipedia ou blog solto, o MCP bloqueia.

```json
{
  "name": "consultar_fonte_oficial_gov",
  "description": "Extrai tabelas ou textos de uma URL, mas a requisição falhará se o domínio não for gov.br, usp.br ou embrapa.br.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "url_alvo": {
        "type": "string",
        "description": "A URL exata do órgão oficial contendo os dados."
      },
      "seletor_css": {
        "type": "string",
        "description": "(Opcional) Tabela ou div específica para extrair."
      }
    },
    "required": ["url_alvo"]
  }
}
```

**Por que é bom:** força a IA a citar Embrapa/IBGE em vez de fontes frágeis.

## 2. `extrair_evidencia_de_pdf_local` — RAG Offline Seguro

Lê PDFs já baixados em `06_REFERENCIAS/pdfs/` (cadastrados no
`fontes_mestre.csv`) e devolve apenas os trechos relevantes. Nada vai para
nuvem.

```json
{
  "name": "extrair_evidencia_de_pdf_local",
  "description": "Busca menções a um termo específico dentro de um PDF já validado e listado no fontes_mestre.csv.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "id_fonte": { "type": "string", "description": "ID da fonte, ex: FON-0012." },
      "termo_de_busca": { "type": "string", "description": "Palavra-chave ou conceito a procurar no PDF." },
      "contexto_linhas": { "type": "integer", "description": "Linhas antes/depois do termo (máx 5)." }
    },
    "required": ["id_fonte", "termo_de_busca"]
  }
}
```

**Por que é bom:** varrida local de artigos veterinários/IBGE sem alucinar
dados externos.

## 3. `simular_cenario_economico` — Python Sandboxed

IA passa premissas; MCP executa o script oficial `03_modelo_perdas.py` e
devolve o resultado. Zero cálculo de matemática pela IA.

```json
{
  "name": "simular_cenario_economico",
  "description": "Injeta premissas no modelo matemático oficial do projeto para calcular impacto econômico.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "tamanho_rebanho": { "type": "number" },
      "prevalencia_pct": { "type": "number", "description": "% do rebanho afetado (ex: 5.5)" },
      "perda_arroba_por_animal": { "type": "number" },
      "preco_arroba_brl": { "type": "number" }
    },
    "required": ["tamanho_rebanho", "prevalencia_pct", "perda_arroba_por_animal", "preco_arroba_brl"]
  }
}
```

**Por que é bom:** erros de cálculo por alucinação ficam zerados. Lógica
matemática continua 100% no script local.

## 4. `congelar_tabela_final` — OS-Level Security

Permite que a IA bloqueie um CSV aprovado em nível de sistema operacional
(read-only). Só executa com token humano de aprovação.

```json
{
  "name": "congelar_tabela_final",
  "description": "Altera permissões do SO para 'Somente Leitura' de um CSV já aprovado, impedindo edições acidentais.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "nome_tabela": { "type": "string", "description": "Nome do CSV em 02_DADOS/03_final/" },
      "approval_id": { "type": "string", "description": "Token de aprovação humano." }
    },
    "required": ["nome_tabela", "approval_id"]
  }
}
```

**Por que é bom:** garante imutabilidade. "Aprovado" + token = tabela selada
no Windows.

## 5. `gerar_snapshot_git` — Versionamento Automático

Cria um "ponto de salvamento" git a cada micro-conquista (consolidação de
tabela, fim de fase, etc.).

```json
{
  "name": "gerar_snapshot_git",
  "description": "Executa git commit automatizado para registrar um marco do projeto.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "mensagem_commit": { "type": "string", "description": "Mensagem clara do que foi concluído." },
      "fase_cronograma": { "type": "string", "description": "Fase atingida (ex: F2, F3)." }
    },
    "required": ["mensagem_commit"]
  }
}
```

**Por que é bom:** se a IA fizer bobagem na etapa 5, basta `git revert` para a
etapa 4.

---

## Mapeamento no `allowed-operations.json`

```json
{
  "operations": [
    {
      "name": "consultar_fonte_oficial_gov",
      "type": "network",
      "allowed_domains": ["ibge.gov.br", "embrapa.br", "usp.br", "gov.br"]
    },
    {
      "name": "simular_cenario_economico",
      "type": "execute",
      "allowed_scripts": ["PROJETO_PECUARIA_ACRE/03_ANALISE/scripts/03_modelo_perdas.py"]
    },
    {
      "name": "congelar_tabela_final",
      "type": "system",
      "command_template": "attrib +R {file_path}"
    }
  ]
}
```

---

## Próximos Passos (quando sair do rascunho)

1. Implementar `extrair_evidencia_de_pdf_local` usando `pdf-parse` (Node) ou
   `pdfplumber` (Python via shell) com cache de páginas em
   `MESTRE_AUDIT_LOG_DIR`.
2. Implementar `consultar_fonte_oficial_gov` com `cheerio` + checagem de
   domínio antes do `fetch`.
3. Implementar `simular_cenario_economico` como wrapper de
   `child_process.spawn("python", [script, ...premissas])` com timeout e
   auditoria.
4. Implementar `congelar_tabela_final` via `child_process.spawn("attrib", ...)`
   no Windows, validando `approval_id` contra um arquivo local de aprovações
   (`logs/audit/approvals.json`).
5. Implementar `gerar_snapshot_git` via `child_process.spawn("git", ["commit", "-am", msg])`
   restrito a repositórios previamente cadastrados no `allowed-operations.json`.
6. Adicionar testes em `mcp-server/test/` cobrindo: domínio bloqueado, PDF
   não indexado, script fora da whitelist, approval_id inválido, repo git
   não cadastrado.
7. Atualizar `CHANGELOG-V11.md` e `RESUMO-EXECUTIVO-V11.md` quando a
   implementação entrar.

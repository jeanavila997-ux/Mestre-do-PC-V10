# Plano futuro — App de Memória do Mestre do PC

> **Status:** sugestão / não implementado
> **Objetivo:** transformar a memória do Mestre do PC em um serviço organizado, local, seguro e reutilizável pelo chat, Hermes e outros agentes.

---

## 1. Análise da proposta recebida

### Veredito

A proposta faz sentido e está alinhada com a evolução do Mestre do PC. O conceito mais importante está correto: a memória não deve ser um único bloco de histórico enviado inteiro ao modelo. Ela deve ser recuperada por relevância, escopo e importância.

A ordem geral também é boa, mas a implementação precisa começar menor:

1. organizar o modelo de dados;
2. consolidar o armazenamento;
3. melhorar a busca lexical;
4. integrar a memória ao chat;
5. só depois adicionar embeddings e um servidor MCP dedicado.

### O que já existe no projeto

O repositório já possui uma primeira implementação em `v10/memory-manager.js` e `v10/memory-routes.js`:

- criação, listagem, atualização e exclusão de memórias;
- tipos atuais: `conversation`, `command`, `context`, `note`, `diagnostic` e `config`;
- filtros por tipo, tags, texto, data e importância;
- exportação/importação em JSON, CSV, TXT e XML compatível com Excel;
- rotas HTTP em `/memories/create`, `/memories/list`, `/memories/search` e outras;
- limite atual de 1.000 memórias no arquivo.

Também existem ferramentas de banco no `mcp-server/db/mcp-db-tools.js`, mas elas usam uma tabela de memórias do banco local e não constituem ainda o `Memory Manager` unificado proposto neste documento.

### O que ainda não corresponde à proposta

- O armazenamento principal atual é um arquivo JSON (`v10/data/memories/chat-memories.json`), não SQLite.
- A busca atual é lexical, baseada em correspondência de texto, tags, importância e recência; não usa embeddings.
- O modelo atual não possui campos obrigatórios e explícitos para `user_id`, `agent_id`, `project_id` e `session_id`.
- Não há, neste momento, um extrator automático que decida se uma mensagem deve virar memória.
- Não existe ainda um Memory MCP Server independente com operações como `remember`, `search`, `forget`, `list` e `context`.
- O fluxo completo "buscar antes da resposta e extrair depois da resposta" ainda precisa ser integrado ao chat.

---

## 2. Decisões recomendadas

### 2.1 Começar com uma única fonte de verdade

Usar SQLite como armazenamento principal quando a migração começar. Não manter simultaneamente JSON, MySQL e SQLite como fontes concorrentes da mesma memória.

Durante a transição:

- preservar o JSON atual como backup;
- criar um importador idempotente;
- validar contagens e conteúdo antes de trocar a leitura para SQLite;
- manter exportação JSON para recuperação e portabilidade.

### 2.2 Separar memória por escopo

Cada registro deve possuir escopo explícito:

- `global`: fatos gerais compartilhados por todos;
- `user`: preferências e informações do usuário;
- `project`: contexto de um projeto específico;
- `agent`: conhecimento privado de um agente;
- `session`: contexto temporário de uma conversa.

Uma memória pode ter mais de um identificador de contexto, mas o sistema deve aplicar regras claras de visibilidade. O padrão deve ser negar acesso fora do escopo solicitado.

### 2.3 Não salvar tudo automaticamente

A memória automática deve ser conservadora. O extrator deve guardar apenas fatos estáveis, decisões, preferências, tarefas e contexto realmente útil.

Exemplos que normalmente não devem ser salvos:

- saudações;
- perguntas simples sem consequência futura;
- respostas temporárias;
- segredos, tokens, senhas ou chaves de API;
- dados pessoais sem necessidade clara.

O usuário deve poder revisar, editar e apagar as memórias salvas.

### 2.4 Embeddings como segunda etapa

Embeddings locais são uma boa evolução, mas não devem bloquear a primeira versão. A interface `memory.search()` deve ser criada desde o início para permitir trocar a implementação lexical por busca semântica depois.

Modelo de evolução:

```text
V1: SQLite + busca lexical/ranking
V2: SQLite + embeddings locais e índice vetorial
V3: PostgreSQL + pgvector, somente quando houver necessidade real de VPS ou múltiplos usuários
```

---

## 3. Arquitetura do app

```text
Chat / Interface Mobile / Hermes / Agentes
                    │
              Memory API
                    │
             Memory Manager
          ┌─────────┼─────────┐
          │         │         │
       SQLite    Ranking   Extractor
          │         │         │
          └──── Embeddings ──┘
                    │
             Ollama opcional
```

O `Memory Manager` deve ser a única camada conhecida pelos consumidores. Chat, Hermes e agentes não devem acessar diretamente arquivos, tabelas ou o índice vetorial.

---

## 4. Modelo inicial de dados

Tabela principal sugerida: `memories`.

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  agent_id TEXT,
  project_id TEXT,
  session_id TEXT,
  scope TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  importance REAL NOT NULL DEFAULT 0.5,
  source TEXT NOT NULL DEFAULT 'chat',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
```

Índices mínimos:

- `user_id + scope`;
- `project_id`;
- `agent_id`;
- `type`;
- `updated_at`;
- busca textual no título e conteúdo.

Tabelas futuras, se necessárias:

- `sessions` para conversas e resumos;
- `tasks` para tarefas persistentes;
- `memory_embeddings` para vetores;
- `memory_audit` para histórico de criação, alteração e exclusão.

---

## 5. API do Memory Manager

Interface interna sugerida:

```js
await memory.remember({
  userId: 'jean',
  scope: 'project',
  projectId: 'mestre-do-pc',
  type: 'decision',
  content: 'Hermes será executado localmente no Windows.',
  importance: 0.95,
  source: 'chat'
});

await memory.search({
  query: 'Onde o Hermes deve rodar?',
  userId: 'jean',
  projectId: 'mestre-do-pc',
  limit: 5
});
```

Operações mínimas:

- `remember`
- `search`
- `get`
- `update`
- `forget`
- `list`
- `context`
- `export`
- `import`

A operação `context` deve montar um pacote pequeno e ordenado para o prompt, aplicando limite de tamanho e prioridade. Nunca enviar todas as memórias por padrão.

---

## 6. Memory Extractor

O extrator deve receber a mensagem do usuário e, quando apropriado, a resposta ou o resultado da tarefa. Deve retornar uma estrutura validada:

```json
{
  "save": true,
  "type": "preference",
  "scope": "user",
  "content": "Priorizar soluções gratuitas e modelos locais via Ollama.",
  "importance": 0.9,
  "reason": "Preferência explícita do usuário"
}
```

Regras obrigatórias:

- validar o tipo e o escopo com listas permitidas;
- limitar tamanho de título e conteúdo;
- rejeitar credenciais e segredos;
- evitar duplicatas por conteúdo normalizado;
- permitir confirmação do usuário para decisões sensíveis;
- registrar a origem da memória.

O extrator pode usar Ollama, mas a aplicação deve continuar funcionando se o modelo local estiver indisponível. Nesse caso, a criação manual continua disponível e a extração automática é ignorada.

---

## 7. Integração com o app mobile

A versão mobile deve consumir a mesma API do Mestre do PC, sem implementar uma memória separada no celular.

### Funcionalidades da primeira versão

- visualizar memórias recentes;
- pesquisar memórias;
- filtrar por projeto, tipo e escopo;
- abrir detalhes;
- criar memória manual;
- editar e excluir com confirmação;
- exportar backup;
- mostrar quando uma memória foi usada no contexto do chat.

### Fora da primeira versão

- embeddings executados no celular;
- sincronização offline bidirecional;
- múltiplos usuários;
- acesso remoto sem túnel seguro;
- exclusão automática sem revisão;
- publicação de dados sensíveis em notificações.

---

## 8. Exposição via MCP

Depois que a API interna estiver estável, criar um servidor MCP de memória ou adicionar ferramentas ao servidor existente:

- `memory_remember`
- `memory_search`
- `memory_context`
- `memory_list`
- `memory_update`
- `memory_forget`
- `memory_export`

A autenticação deve reutilizar o mecanismo seguro do projeto. O token nunca deve aparecer no conteúdo de uma memória nem ser enviado pelo modelo como parte normal do texto.

---

## 9. Roadmap de implementação

### Fase 0 — Preparação

- documentar o contrato da memória;
- criar fixtures de teste;
- fazer backup do JSON atual;
- definir os valores válidos de `scope` e `type`.

### Fase 1 — Memory Manager estável

- criar uma interface independente do armazenamento;
- adicionar `userId`, `agentId`, `projectId` e `sessionId`;
- melhorar validação, deduplicação e paginação;
- manter as rotas existentes compatíveis.

### Fase 2 — Migração para SQLite

- criar schema e migrações;
- importar o JSON atual;
- comparar quantidade e conteúdo importados;
- trocar a leitura principal para SQLite;
- manter exportação e backup.

### Fase 3 — Integração com chat

- buscar contexto antes da chamada ao LLM;
- limitar o contexto por tokens/tamanho;
- extrair memórias após respostas relevantes;
- exibir e auditar a origem das memórias.

### Fase 4 — Interface mobile

- criar tela de consulta e gerenciamento;
- adicionar autenticação adequada ao cenário local/remoto;
- testar na mesma rede do PC;
- evitar exposição direta do launcher na internet.

### Fase 5 — Busca semântica

- gerar embeddings com Ollama;
- armazenar vetores com uma interface substituível;
- combinar similaridade, escopo, importância e recência;
- medir qualidade antes de adotar a busca semântica como padrão.

### Fase 6 — Memory MCP

- expor as operações via MCP;
- integrar Hermes e demais agentes;
- aplicar isolamento por usuário, projeto e agente;
- registrar auditoria de todas as operações de escrita e exclusão.

---

## 10. Critérios de conclusão da primeira versão

A V1 será considerada pronta quando:

- todas as memórias existentes puderem ser importadas sem perda verificável;
- o chat conseguir recuperar memórias relevantes sem exceder o limite de contexto;
- o usuário puder visualizar, corrigir e apagar memórias;
- memórias de projetos diferentes não forem misturadas;
- segredos forem rejeitados pelo fluxo automático;
- backup e restauração forem testados;
- rotas não autorizadas continuarem bloqueadas;
- os testes cobrirem criação, busca, atualização, exclusão, escopo e migração.

## Conclusão

O plano original é tecnicamente válido, mas descreve uma arquitetura futura como se já estivesse parcialmente pronta. O caminho recomendado para o Mestre do PC é evoluir o módulo existente, adotar SQLite como fonte única, preservar a interface `Memory Manager` e deixar embeddings, MCP dedicado e PostgreSQL para fases posteriores. Isso reduz risco, evita duplicação de dados e mantém o app mobile compatível com o mesmo núcleo de memória.

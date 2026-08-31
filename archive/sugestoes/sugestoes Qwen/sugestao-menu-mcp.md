# Sugestão: Menu MCP - Integração Multi-LLM

## Visão Geral

Adicionar um novo menu **"MCP"** na interface do Mestre do PC V11 que permita integrar com múltiplos LLMs via **Model Context Protocol (MCP)**.

---

## 🎯 Objetivo

Criar um hub centralizado de integração com LLMs que permita:

1. **Conectar-se a múltiplos provedores** (Qwen, Claude, GPT-4, Gemini, etc.)
2. **Gerenciar servidores MCP** ativos
3. **Executar ferramentas** de cada servidor MCP
4. **Alternar entre modelos** facilmente

---

## 📐 Arquitetura Proposta

### 1. Backend (launcher.js / MestreDoPC-Launcher.ps1)

Adicionar endpoints HTTP para gerenciamento MCP:

```javascript
// GET /mcp/list          - Lista servidores MCP configurados
// GET /mcp/tools/:name   - Lista ferramentas de um servidor
// POST /mcp/call         - Chama uma ferramenta MCP
// GET /mcp/status        - Status de todos os servidores
// POST /mcp/configure    - Adiciona/remove servidor MCP
```

### 2. Frontend (index.html)

Novo menu na navegação principal:

```html
<nav>
  <a href="#" data-tab="dashboard">Dashboard</a>
  <a href="#" data-tab="comandos">Comandos</a>
  <a href="#" data-tab="chat-ia">Chat IA</a>
  <a href="#" data-tab="mcp" class="new">🔌 MCP</a>
  <a href="#" data-tab="config">Configurações</a>
</nav>
```

---

## 🖥️ UI Proposta

### Aba MCP - Seções

#### 1. **Servidores Conectados** (cards)

```
┌─────────────────────────────────────────────────────────────┐
│  🟢 mestre-do-pc                      [⚙️] [🗑️] [🔄]       │
│  Transporte: stdio                                          │
│  Ferramentas: 68                                            │
│  Último uso: 2 min atrás                                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  ⚪ claude-mcp                        [+ Adicionar]         │
│  Transporte: http                                           │
│  URL: http://localhost:8080                                 │
│  Status: Desconectado                                       │
└─────────────────────────────────────────────────────────────┘
```

#### 2. **Catálogo de Ferramentas** (accordion por categoria)

```
▼ Diagnóstico e Monitoramento (7)
  ├── 🔧 diagnosticar_completo
  ├── 🔧 verificar_espaco_disco
  ├── 🔧 ver_uso_ram
  └── ...

▼ Limpeza e Manutenção (8)
  ├── 🧹 limpeza_rapida_completa
  ├── 🧹 liberar_memoria_ram
  └── ...
```

#### 3. **Executor de Ferramentas** (modal)

```
┌─────────────────────────────────────────────────────────┐
│  Executar: diagnosticar_completo              [X]       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Descrição: Diagnóstico completo do PC: RAM, disco,     │
│             processos, rede e sistema.                  │
│                                                         │
│  Parâmetros:                                            │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Nenhum parâmetro necessário                     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Cancelar]                    [▶ Executar]             │
└─────────────────────────────────────────────────────────┘
```

#### 4. **Adicionar Novo Servidor** (modal)

```
┌─────────────────────────────────────────────────────────┐
│  Adicionar Servidor MCP                       [X]       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Nome do servidor:                                      │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ex: claude-mcp                                  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Transporte:                                            │
│  ○ stdio (processo local)                               │
│  ○ HTTP (serviço remoto)                                │
│  ○ SSE (legado)                                         │
│                                                         │
│  Comando/URL:                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │ node /path/to/server.js                         │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Variáveis de ambiente (opcional):                      │
│  ┌─────────────────────────────────────────────────┐   │
│  │ API_KEY=sk-...                                  │   │
│  │ [+ Adicionar]                                    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Cancelar]                    [💾 Salvar]              │
└─────────────────────────────────────────────────────────┘
```

---

## 🔌 Integrações Planejadas

### 1. **Qwen Code** (✅ Já implementado)

- **Tipo:** stdio
- **Comando:** `node mcp-server/index.js`
- **Ferramentas:** 68
- **Status:** ✅ Conectado

### 2. **Claude Desktop** (Planejado)

- **Tipo:** stdio
- **Comando:** `claude-mcp-server` (a instalar)
- **Ferramentas esperadas:**
  - `file_read` - Ler arquivos
  - `file_write` - Escrever arquivos
  - `directory_list` - Listar diretórios
  - `web_search` - Busca na web
  - `browser_automation` - Automação de navegador

- **Configuração necessária:**
  ```json
  {
    "mcpServers": {
      "claude-mcp": {
        "command": "npx",
        "args": ["-y", "@anthropic/mcp-server"],
        "env": {
          "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
        }
      }
    }
  }
  ```

### 3. **GPT-4 / OpenAI** (Planejado)

- **Tipo:** HTTP
- **URL:** `https://api.openai.com/v1/mcp` (quando disponível)
- **Ferramentas esperadas:**
  - `chat_completion` - Chat com GPT-4
  - `image_generation` - DALL-E 3
  - `code_interpreter` - Execução de código
  - `web_browsing` - Navegação web

### 4. **Google Gemini** (Planejado)

- **Tipo:** HTTP
- **URL:** `https://generativelanguage.googleapis.com/mcp`
- **Ferramentas esperadas:**
  - `generate_content` - Geração de conteúdo
  - `analyze_image` - Análise de imagens
  - `search_grounding` - Busca com grounding

### 5. **Ollama Local** (Expansão)

- **Tipo:** HTTP
- **URL:** `http://127.0.0.1:11434/mcp`
- **Ferramentas:**
  - `generate` - Geração local
  - `chat` - Chat com contexto
  - `embed` - Embeddings
  - `list_models` - Listar modelos

---

## 🔧 Implementação Técnica

### 1. Backend - Adicionar ao `launcher.js`

```javascript
// ===== MCP SERVER MANAGEMENT =====
const MCP_SERVERS = new Map();

app.get('/mcp/list', async (req, res) => {
  const servers = Array.from(MCP_SERVERS.entries()).map(([name, server]) => ({
    name,
    status: server.status,
    transport: server.transport,
    toolsCount: server.tools?.length || 0
  }));
  res.json({ success: true, servers });
});

app.get('/mcp/tools/:name', async (req, res) => {
  const server = MCP_SERVERS.get(req.params.name);
  if (!server) return res.status(404).json({ success: false, error: 'Servidor não encontrado' });
  res.json({ success: true, tools: server.tools || [] });
});

app.post('/mcp/call', async (req, res) => {
  const { server, tool, args } = req.body;
  // Validação e execução da ferramenta
  // ...
});

app.get('/mcp/status', async (req, res) => {
  // Status de todos os servidores
  // ...
});
```

### 2. Frontend - HTML/CSS/JS

#### Estrutura HTML (adicionar após aba Chat IA)

```html
<div id="mcp" class="tab-content" style="display: none;">
  <h2 class="section-title">🔌 Integração MCP</h2>
  
  <!-- Seção 1: Servidores -->
  <div class="mcp-section">
    <h3>Servidores Conectados</h3>
    <div id="mcp-servers-grid" class="cards-grid">
      <!-- Cards inseridos via JS -->
    </div>
    <button class="btn-primary" onclick="showAddServerModal()">+ Adicionar Servidor</button>
  </div>
  
  <!-- Seção 2: Ferramentas -->
  <div class="mcp-section">
    <h3>Ferramentas Disponíveis</h3>
    <div id="mcp-tools-accordion">
      <!-- Accordion inserido via JS -->
    </div>
  </div>
  
  <!-- Seção 3: Executor -->
  <div id="mcp-executor-modal" class="modal">
    <!-- Modal de execução -->
  </div>
  
  <!-- Seção 4: Adicionar Servidor -->
  <div id="mcp-add-modal" class="modal">
    <!-- Modal de configuração -->
  </div>
</div>
```

#### JavaScript (funções principais)

```javascript
// Carregar servidores MCP
async function loadMcpServers() {
  try {
    const res = await fetch(API + '/mcp/list');
    const data = await res.json();
    renderMcpServers(data.servers);
  } catch (err) {
    console.error('Erro ao carregar MCP servers:', err);
  }
}

// Renderizar cards de servidores
function renderMcpServers(servers) {
  const grid = document.getElementById('mcp-servers-grid');
  grid.innerHTML = servers.map(server => `
    <div class="mcp-server-card ${server.status}">
      <div class="card-header">
        <span class="status-icon">${server.status === 'connected' ? '🟢' : '⚪'}</span>
        <h4>${server.name}</h4>
        <div class="card-actions">
          <button onclick="configureServer('${server.name}')">⚙️</button>
          <button onclick="removeServer('${server.name}')">🗑️</button>
          <button onclick="refreshServer('${server.name}')">🔄</button>
        </div>
      </div>
      <div class="card-body">
        <p><strong>Transporte:</strong> ${server.transport}</p>
        <p><strong>Ferramentas:</strong> ${server.toolsCount}</p>
        <p><strong>Status:</strong> ${server.status}</p>
      </div>
      <button class="btn-secondary" onclick="showServerTools('${server.name}')">
        Ver Ferramentas
      </button>
    </div>
  `).join('');
}

// Executar ferramenta MCP
async function executeMcpTool(server, tool, args = {}) {
  const res = await fetch(API + '/mcp/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ server, tool, args })
  });
  return await res.json();
}
```

---

## 📋 Configuração Atual (Qwen)

```json
{
  "mcpServers": {
    "mestre-do-pc": {
      "command": "node",
      "args": ["C:\\Users\\Jeanc\\Mestre-do-PC-V10-clean\\mcp-server\\index.js"],
      "transport": "stdio",
      "scope": "user",
      "status": "connected",
      "toolsCount": 68
    }
  }
}
```

---

## 🗺️ Roadmap

### Fase 1: Estrutura Base (✅ Concluída)
- [x] Integração Qwen MCP via stdio
- [x] 68 ferramentas disponíveis
- [x] Documentação da integração

### Fase 2: UI do Menu MCP (Próximo)
- [ ] Criar aba MCP no index.html
- [ ] Implementar grid de servidores
- [ ] Implementar accordion de ferramentas
- [ ] Criar modais de execução e configuração

### Fase 3: Backend MCP
- [ ] Adicionar endpoints `/mcp/*` no launcher
- [ ] Implementar cliente MCP no Node.js
- [ ] Gerenciar múltiplos servidores simultâneos

### Fase 4: Novas Integrações
- [ ] Claude Desktop MCP
- [ ] Ollama MCP local
- [ ] OpenAI MCP (quando disponível)
- [ ] Google Gemini MCP

### Fase 5: Recursos Avançados
- [ ] Histórico de execuções MCP
- [ ] Favoritos de ferramentas
- [ ] Atalhos de teclado
- [ ] Exportar/importar configurações

---

## 🔐 Segurança

1. **Whitelist de servidores**: Apenas servidores configurados explicitamente
2. **Validação de argumentos**: Sanitização via `security.js`
3. **Auditoria**: Log de todas as chamadas MCP
4. **Confirmação**: Diálogo de confirmação para ferramentas destrutivas
5. **Timeout**: Limite de tempo por chamada de ferramenta

---

## 📊 Exemplo de Uso

```javascript
// Usuário clica em "Verificar Espaço em Disco"
await executeMcpTool('mestre-do-pc', 'verificar_espaco_disco', {});

// Output esperado:
{
  "success": true,
  "output": {
    "C:": { "free": 255.83, "used": 219.84, "total": 475.67 },
    "D:": { "free": 120.50, "used": 89.30, "total": 209.80 }
  }
}
```

---

## 📞 Referências

- **Documentação MCP**: https://modelcontextprotocol.io/
- **Qwen Code MCP**: `skills-mcp-qwen.md` (esta pasta)
- **Claude MCP**: https://docs.anthropic.com/claude/docs/mcp
- **OpenAI MCP**: (em desenvolvimento)

---

*Documento de proposta técnica*
*Data: 2026-08-23*
*Autor: Qwen Code*

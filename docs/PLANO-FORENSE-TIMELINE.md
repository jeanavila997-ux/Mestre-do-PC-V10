# Plano: AI Forensic Timeline (Linha do Tempo Forense)

> **Status:** proposta, **não implementada**. Origem: blueprint gerado por outro assistente (preservado integralmente na seção "Blueprint original" abaixo). Esta página abre com a revisão contra o código atual do repositório.
> Salvo em 2026-10-21.

## Revisão contra o código atual

### 1. Já existe parte disso (validar antes de construir)

- `v10/index.html` já tem a categoria **"🕵️ Forense & Análise"**.
- `v10/allowed-operations.json` já tem operações com `Get-WinEvent`: `seg_logins_falhos`, `seg_logins_sucesso`, `seg_eventos_sistema`, `verificar_erros_recentes_do_sistema`, `tempo_de_boot_do_windows`, `tempo_inicializacao_boot`.
- **Antes de criar `Get-ForensicTimeline.ps1`:** medir o que essas operações já entregam. A feature nova pode ser só uma operação que **consolida** as existentes em um JSON único, em vez de um módulo novo.

### 2. O código do blueprint viola a arquitetura do projeto

Conforme `docs/CLAUDE.md`: clientes de IA nunca executam shell; `mcp-server/index.js` **nunca roda comandos**, sempre chama o launcher via HTTP; toda operação vem de `v10/allowed-operations.json` via `v10/operation-registry.js`.

| Trecho do blueprint | Problema | Correção |
| --- | --- | --- |
| `mcp-server/tools/forensics.js` com `spawn('powershell.exe', ['-ExecutionPolicy','Bypass', ...])` | O MCP passaria a executar PowerShell por conta própria, com `Bypass`. Quebra o split MCP (não elevado) → launcher | Registrar como **operação** em `allowed-operations.json`; o MCP deriva a tool do registry e chama o launcher |
| Rotas `/api/mcp-tool/get_forensic_timeline` e `/api/ollama-chat` | Não seguem as rotas existentes do launcher | Usar o resolvedor de operações e as rotas do chat/Ollama que já existem |
| `fetch` sem credencial | Depende do patch pendente de `isAuthorized()` (bypass por `X-Mestre-Client`) | **Só entregar depois** desse patch |
| `Get-WinEvent -LogName Security` | Exige elevação; o MCP/launcher não elevado vai falhar ou retornar vazio | Rodar pelo caminho elevado já usado por `seg_logins_*` |

### 3. Riscos específicos desta feature

- **Prompt injection via logs:** o texto de eventos do Windows (campo `Message`) é controlado por terceiros (nomes de processo, usuários, strings de apps). Mandar isso ao Ollama como "contexto" é injeção indireta. Tratar como **dado**: truncar, remover quebras/controle, passar por `checkPromptInjection()` e delimitar no prompt.
- **Privacidade:** logon events carregam usuário e IP de origem. O blueprint descarta esses campos (bom); manter assim e não persistir a timeline em disco sem mascarar.
- **Robustez do script:** `ConvertTo-Json` retorna objeto (não array) quando há 1 evento; `-MaxEvents 50/30` trunca silenciosamente; `-ErrorAction SilentlyContinue` esconde falta de permissão (cai no mesmo padrão `-EA 0` já listado como dívida técnica). Retornar também `{ truncated, errors }`.
- **Escopo "Prefetch / registro / WMI"** citado no texto não está no código de exemplo (só System e Security).

### 4. Prioridade

O estado atual do projeto tem itens críticos abertos: patch de `isAuthorized()`, injeção nos seis placeholders e o tracking Meta Pixel → Cakto. Esta feature é incremental e **não deve passar na frente** deles.

### 5. Caminho sugerido (revisado)

1. Rodar as operações `seg_*` existentes e anotar o que falta para uma timeline.
2. Se faltar pouco: nova operação `forense_timeline` (somente leitura, `riskTier` baixo) consolidando as existentes, em `allowed-operations.json`.
3. Tool MCP derivada do registry (nenhum `spawn` no MCP).
4. Aba "Forense IA" reutilizando a categoria "Forense & Análise" do painel.
5. Resumo via Ollama com os eventos sanitizados e delimitados como dados.

---

# Blueprint original (inalterado)

Como Arquiteto de Software Sênior, analisei profundamente a arquitetura do **Mestre do PC V10** (Node.js, PowerShell, Interface Web `v10/`, Servidor MCP e Ollama).

A maior oportunidade inexplorada no seu projeto é transformar o Windows — que é notoriamente opaco em seus logs — em um sistema transparente e explicável. Por isso, proponho a criação da **Sessão de Linha do Tempo Forense Assistida por IA (AI Forensic Timeline)**.

Abaixo está o blueprint completo para você implementar essa nova feature.

---

### 1. Nome e Objetivo
**Nome do Módulo:** `AI Forensic Timeline` (Linha do Tempo Forense)
**O que faz:** Coleta eventos críticos do Windows (inicializações, crashes de processos, logins, alterações de registro, execução de arquivos via Prefetch) das últimas 24 horas e os consolida em uma linha do tempo visual.
**O papel da IA (Ollama):** Em vez de mostrar códigos de erro crús (ex: *Event ID 4625* ou *0xC0000005*), o Ollama lê o JSON da timeline e gera um resumo em linguagem natural: *"Hoje às 14h, o processo `chrome.exe` travou 3 vezes logo após a instalação da extensão X. Recomendo desabilitá-la."*

---

### 2. Arquitetura da Sessão
Esta feature toca as três camadas do seu projeto:

1.  **Camada de Coleta (PowerShell):** Um novo script em `scripts/` que extrai logs do Event Viewer, WMI e Prefetch, formatando tudo em um JSON estruturado.
2.  **Camada de Orquestração (MCP Server):** Uma nova *Tool* registrada no `mcp-server/` chamada `get_forensic_timeline`. O Ollama (ou o painel web) chama essa ferramenta.
3.  **Camada de Visualização (Interface Web `v10/`):** Uma nova aba no painel chamada **"🕵️ Forense IA"** que renderiza a timeline e exibe o resumo gerado pelo Ollama.

---

### 3. Esboço de Código (Pronto para Implementação)

#### A. O Script de Coleta (PowerShell)
Crie o arquivo: `scripts/Get-ForensicTimeline.ps1`

```powershell
# scripts/Get-ForensicTimeline.ps1
param([int]$Hours = 24)

$StartTime = (Get-Date).AddHours(-$Hours)
$Timeline = @()

# 1. Coletar Eventos Críticos do Sistema (Crashes, Erros, Inicialização)
$SystemEvents = Get-WinEvent -FilterHashtable @{LogName='System'; Level=1,2; StartTime=$StartTime} -MaxEvents 50 -ErrorAction SilentlyContinue
foreach ($evt in $SystemEvents) {
    $Timeline += @{
        Timestamp = $evt.TimeCreated.ToString("o")
        Source    = "System"
        EventID   = $evt.Id
        Message   = $evt.Message -replace "`r`n", " " # Sanitiza quebras de linha
        Severity  = "Error"
    }
}

# 2. Coletar Logins e Falhas de Autenticação
$SecEvents = Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624,4625; StartTime=$StartTime} -MaxEvents 30 -ErrorAction SilentlyContinue
foreach ($evt in $SecEvents) {
    $Timeline += @{
        Timestamp = $evt.TimeCreated.ToString("o")
        Source    = "Security"
        EventID   = $evt.Id
        Message   = if($evt.Id -eq 4625){"Falha de Login Detectada"}else{"Login Bem-Sucedido"}
        Severity  = if($evt.Id -eq 4625){"Warning"}else{"Info"}
    }
}

# 3. Ordenar Cronologicamente e retornar JSON
$Timeline | Sort-Object Timestamp -Descending | ConvertTo-Json -Depth 4
```

#### B. A Nova Ferramenta MCP (Node.js)
Adicione esta ferramenta ao seu `mcp-server/` (onde você registra as 480+ ferramentas).

```javascript
// mcp-server/tools/forensics.js
const { spawn } = require('child_process');
const path = require('path');

const getForensicTimelineTool = {
  name: "get_forensic_timeline",
  description: "Retorna uma linha do tempo de eventos críticos do Windows (crashes, logins, erros) das últimas X horas para análise forense.",
  inputSchema: {
    type: "object",
    properties: {
      hours: { type: "number", description: "Número de horas para olhar para trás (padrão: 24)" }
    }
  },
  handler: async (args) => {
    const hours = args.hours || 24;
    const scriptPath = path.resolve(__dirname, '../../scripts/Get-ForensicTimeline.ps1');
    
    return new Promise((resolve, reject) => {
      const ps = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Hours', hours]);
      let output = '';
      
      ps.stdout.on('data', (data) => { output += data.toString(); });
      ps.stderr.on('data', (data) => { console.error(`PS Error: ${data}`); });
      
      ps.on('close', (code) => {
        if (code === 0) {
          resolve({ content: [{ type: "text", text: output }] });
        } else {
          reject(new Error(`PowerShell falhou com código ${code}`));
        }
      });
    });
  }
};

module.exports = getForensicTimelineTool;
```
*Lembre-se de registrar essa tool no array principal do seu servidor MCP e adicioná-la ao `v10/allowed-operations.json` (como leitura/segura).*

#### C. A Nova Tela na Interface Web (`v10/`)
Crie uma nova rota/view no seu painel web (`v10/views/forensics.html` ou componente React/Vue equivalente).

```html
<!-- Exemplo de estrutura para a nova aba "🕵️ Forense IA" -->
<div class="forensics-session">
    <h2>Linha do Tempo Forense (Últimas 24h)</h2>
    
    <!-- Área do Resumo da IA -->
    <div class="ai-insight-box" id="ai-summary">
        <h3>🧠 Análise do Ollama</h3>
        <p id="ai-text">Clique em "Analisar com IA" para que o Ollama leia os logs e resuma os problemas do seu PC.</p>
        <button onclick="askOllama()">Analisar com IA</button>
    </div>

    <!-- Timeline Visual -->
    <div class="timeline-container" id="timeline-feed">
        <!-- Os eventos do PowerShell serão injetados aqui via JS -->
        <ul id="event-list"></ul>
    </div>
</div>

<script>
    async function loadTimeline() {
        // Chama o backend local que expõe a tool MCP
        const response = await fetch('http://127.0.0.1:7777/api/mcp-tool/get_forensic_timeline');
        const events = await response.json();
        renderEvents(events);
    }

    async function askOllama() {
        document.getElementById('ai-text').innerText = "Ollama está pensando...";
        // Envia o JSON dos eventos para o endpoint local do Ollama
        const res = await fetch('http://127.0.0.1:7777/api/ollama-chat', {
            method: 'POST',
            body: JSON.stringify({
                prompt: "Atue como um especialista em Windows. Analise esta timeline JSON de eventos e me dê 3 insights sobre a saúde do PC e possíveis ameaças. Seja breve.",
                context: document.getElementById('event-list').innerText // Passa os logs como contexto
            })
        });
        const aiResponse = await res.json();
        document.getElementById('ai-text').innerText = aiResponse.message;
    }
</script>
```

---

### 4. Integração com IA (O Pulo do Gato)

O verdadeiro valor dessa sessão não é apenas mostrar os logs, mas **como o Ollama interage com eles via MCP**.

Quando um usuário (ou você, via Claude Code/VS Code) usar o servidor MCP do Mestre do PC, você poderá dar o seguinte prompt para a IA:

> *"Chame a ferramenta `get_forensic_timeline` do Mestre do PC filtrando as últimas 12 horas. Com base no JSON retornado, identifique se houve algum pico de erros de disco (Event ID 51, 129) ou travamentos do `explorer.exe`. Se encontrar, sugira qual ferramenta de reparo do MCP eu devo executar em seguida."*

**Por que isso é inovador?**
A maioria das ferramentas de diagnóstico apenas mostra gráficos de CPU/RAM. A sua ferramenta vai dizer: *"Seu PC não está lento por falta de RAM, ele está lento porque o serviço do Windows Search está crashando em loop a cada 5 minutos (Event ID 7031). Quer que eu o reinicie e desative a indexação temporariamente?"*

### Próximos Passos no Repositório

Para commitar isso no seu projeto, sugiro a seguinte ordem:
1.  **Commit 1:** Adicionar `scripts/Get-ForensicTimeline.ps1` e testar no terminal.
2.  **Commit 2:** Registrar a tool `get_forensic_timeline` no `mcp-server/`.
3.  **Commit 3:** Atualizar o `v10/allowed-operations.json` marcando essa tool como `read-only` (segura para a IA rodar sozinha).
4.  **Commit 4:** Criar a view `forensics` na interface web.

O que achou dessa arquitetura? Se quiser, posso gerar agora o **código exato de como integrar o fetch dessa API no seu backend Node.js (`v10/`)** para conectar o PowerShell ao painel web!
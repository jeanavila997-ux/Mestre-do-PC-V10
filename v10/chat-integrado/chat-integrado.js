/**
 * chat-integrado.js — Módulo ES frontend do Chat Integrado
 *
 * Chat totalmente funcional com:
 *   - Streaming via /ollama/chat (launcher proxy)
 *   - 24 ferramentas MCP via /api/tools/:name
 *   - Banco SQLite via /api/conversas, /api/memorias
 *   - Sync MySQL via /api/sync
 *   - Perfis de modelo via /api/profiles
 *   - Execução de comandos via /classify + /run
 *   - Visual baseado no chat-ia.html
 */

const BASE = ""; // mesma origem do launcher

const SYSTEM_PROMPT = `Você é o Mestre do PC V10, um assistente especializado em manutenção de computadores Windows.
REGRAS:
1. Responda SEMPRE em português brasileiro.
2. Quando sugerir uma ação, inclua o comando PowerShell exato entre \`\`\`powershell e \`\`\`.
3. NUNCA invente comandos. Use APENAS comandos PowerShell reais do Windows.
4. Seja direto e objetivo. O usuário quer soluções rápidas.
5. Se o usuário descrever um problema, sugira no máximo 3 ações ordenadas por prioridade.
Você tem acesso a ferramentas MCP que podem executar diagnósticos, buscar na web, analisar código, enviar webhooks e muito mais.
Quando achar relevante, sugira o uso de uma ferramenta específica.`;

const TOOL_DESCRIPTIONS = {
  perguntar_ia: { icon: "🧠", desc: "Perguntar à IA local" },
  buscar_na_web: { icon: "🔍", desc: "Buscar na web (DuckDuckGo)" },
  perguntar_ia_com_contexto: { icon: "📚", desc: "IA com documentos de contexto" },
  resolver_problema_passo_a_passo: { icon: "🔧", desc: "Resolver problema passo a passo" },
  comparar_modelos_ia: { icon: "⚖️", desc: "Comparar respostas de modelos" },
  analisar_codigo_powershell: { icon: "📋", desc: "Analisar código PowerShell" },
  ia_comando_sugerir: { icon: "💡", desc: "Sugerir comando PowerShell" },
  analisar_logs_sistema: { icon: "📊", desc: "Analisar logs de erro do Windows" },
  enviar_webhook_discord: { icon: "💬", desc: "Enviar mensagem Discord" },
  enviar_webhook_teams: { icon: "👥", desc: "Enviar mensagem Teams" },
  enviar_webhook_slack: { icon: "📢", desc: "Enviar mensagem Slack" },
  monitorar_e_notificar: { icon: "📡", desc: "Monitorar e alertar sistema" },
  consultar_fonte_oficial_gov: { icon: "🏛️", desc: "Consultar fonte oficial .gov.br" },
  verificar_prompt: { icon: "🛡️", desc: "Verificar prompt injection" },
  listar_perfis_modelo: { icon: "⚙️", desc: "Listar perfis de modelo" },
  definir_perfil_modelo: { icon: "🎛️", desc: "Definir perfil de modelo" },
  consultar_logs_auditoria: { icon: "📝", desc: "Consultar logs de auditoria" },
  exportar_relatorio_auditoria: { icon: "📤", desc: "Exportar relatório de auditoria" },
  gerar_snapshot_git: { icon: "📸", desc: "Gerar snapshot Git" },
};

// ── Estado global ───────────────────────────────────────────────────

const state = {
  conversaId: null,
  conversas: [],
  memorias: [],
  tools: [],
  toolsDesativadas: [],
  perfis: [],
  perfilAtivo: "balanced",
  modeloAtivo: "",
  isWaiting: false,
  voiceRecognition: null,
  abortController: null,
  messages: [], // histórico local para envio ao Ollama
};

// ── API helpers ─────────────────────────────────────────────────────

async function apiGet(path) {
  const resp = await fetch(BASE + path, {
    headers: { "X-Mestre-Client": "v10-web" },
  });
  return resp.json();
}

async function apiPost(path, body) {
  const resp = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mestre-Client": "v10-web" },
    body: JSON.stringify(body),
  });
  return resp.json();
}

async function apiPut(path, body) {
  const resp = await fetch(BASE + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Mestre-Client": "v10-web" },
    body: JSON.stringify(body),
  });
  return resp.json();
}

async function apiDelete(path) {
  const resp = await fetch(BASE + path, {
    method: "DELETE",
    headers: { "X-Mestre-Client": "v10-web" },
  });
  return resp.json();
}

// ── DOM helpers ─────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }
function $$(sel) { return document.querySelectorAll(sel); }

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderMarkdown(text) {
  if (text == null) return "";
  let html = escapeHtml(String(text));

  // 1. Blocos de código (preserva conteúdo bruto)
  const codeBlocks = [];
  html = html.replace(/```([\s\S]*?)```/g, (m, code) => {
    codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return `\u0000CODE${codeBlocks.length - 1}\u0000`;
  });

  // 2. Títulos
  html = html.replace(/^### (.*)$/gm, "<h4>$1</h4>");
  html = html.replace(/^## (.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^# (.*)$/gm, "<h2>$1</h2>");

  // 3. Tabelas (| a | b |)
  html = html.replace(/((?:^\|.*\|\s*$\n?)+)/gm, (m) => {
    const rows = m.trim().split("\n").filter((r) => r.trim());
    if (rows.length < 2) return m;
    const parseRow = (r) =>
      r
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim());
    const header = parseRow(rows[0]);
    const isSep = (r) => /^[\s:|-]+$/.test(r.replace(/\|/g, ""));
    const body = rows.slice(1).filter((r) => !isSep(r));
    let out = "<table><thead><tr>";
    header.forEach((h) => (out += `<th>${h}</th>`));
    out += "</tr></thead><tbody>";
    body.forEach((r) => {
      out += "<tr>";
      parseRow(r).forEach((c) => (out += `<td>${c}</td>`));
      out += "</tr>";
    });
    out += "</tbody></table>";
    return out;
  });

  // 4. Listas não ordenadas
  html = html.replace(/((?:^[ \t]*[-*+][ \t]+.*(?:\n|$))+)/gm, (m) => {
    const items = m
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^[-*+][ \t]+/.test(l))
      .map((l) => `<li>${l.replace(/^[-*+][ \t]+/, "")}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  });

  // 5. Listas ordenadas
  html = html.replace(/((?:^[ \t]*\d+[.)][ \t]+.*(?:\n|$))+)/gm, (m) => {
    const items = m
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^\d+[.)][ \t]+/.test(l))
      .map((l) => `<li>${l.replace(/^\d+[.)][ \t]+/, "")}</li>`)
      .join("");
    return `<ol>${items}</ol>`;
  });

  // 6. Citações
  html = html.replace(/^&gt; (.*)$/gm, "<blockquote>$1</blockquote>");

  // 7. Parágrafos (linhas em branco separam blocos)
  html = html.replace(/\n{2,}/g, "</p><p>");
  html = html.replace(/\n/g, "<br>");

  // 8. Inline: negrito, itálico, código, links
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // 9. Restaura blocos de código
  html = html.replace(/\u0000CODE(\d+)\u0000/g, (m, i) => codeBlocks[Number(i)] || "");

  return html;
}

// ── Messages UI ─────────────────────────────────────────────────────

function addMessage(text, role, extra = {}) {
  const container = $("messagesContainer");
  const row = document.createElement("div");
  row.className = "msg-row" + (role === "user" ? " user" : "");

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar " + (role === "user" ? "user" : "ai");
  avatar.textContent = role === "user" ? "JA" : "M";

  const body = document.createElement("div");
  body.className = "msg-body" + (extra.toolResult ? " tool-result" : "");

  if (role === "ai" || extra.toolResult) {
    body.innerHTML = renderMarkdown(text);
  } else {
    body.textContent = text;
  }

  if (extra.toolName) {
    const meta = document.createElement("div");
    meta.className = "msg-meta";
    meta.innerHTML = `<span class="sync-badge">🔧 ${extra.toolName}</span>`;
    body.appendChild(meta);
  }

  row.appendChild(avatar);
  row.appendChild(body);
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
  return body;
}

function showTyping() {
  const container = $("messagesContainer");
  const el = document.createElement("div");
  el.className = "ia-typing";
  el.id = "typingIndicator";
  el.innerHTML = "<span></span><span></span><span></span>";
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function removeTyping() {
  const el = $("typingIndicator");
  if (el) el.remove();
}

// ── Memórias ativas no prompt ─────────────────────────────────────

function buildUserPromptWithMemories(userText) {
  const active = state.memorias.filter((m) => m.ativa);
  if (!active.length) return userText;
  const parts = active.map((m) => `[Memória: ${m.titulo}]\n${m.conteudo}`);
  return `${userText}\n\n---\nMemórias ativas para esta mensagem:\n\n${parts.join("\n\n")}`;
}

function renderActiveMemoryChips() {
  const container = $("activeMemories");
  if (!container) return;
  const active = state.memorias.filter((m) => m.ativa);
  if (!active.length) {
    container.innerHTML = "";
    container.style.display = "none";
    return;
  }
  container.innerHTML = active
    .map(
      (m) =>
        `<span class="active-memory-chip">🧠 ${escapeHtml(m.titulo)} <button data-id="${m.id}" title="Desativar">✕</button></span>`
    )
    .join("");
  container.style.display = "flex";
  container.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await apiPost(`/api/memorias/${btn.dataset.id}/toggle`);
      loadMemorias();
    });
  });
}

// ── Streaming via /ollama/chat ──────────────────────────────────────

async function streamOllamaReply(userText) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...state.messages.slice(-20),
    { role: "user", content: buildUserPromptWithMemories(userText) },
  ];

  const body = {
    model: state.modeloAtivo || undefined,
    messages,
    stream: true,
    options: state.profileOptions || undefined,
  };

  state.abortController = new AbortController();
  const signal = state.abortController.signal;

  const resp = await fetch(BASE + "/ollama/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mestre-Client": "v10-web" },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Ollama HTTP ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          if (chunk.message?.content) {
            fullText += chunk.message.content;
            updateStreamingMessage(fullText);
          }
          if (chunk.done) break;
        } catch { /* linha incompleta, ignora */ }
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      updateStreamingMessage(fullText + "\n\n⏹ _geração interrompida_");
      throw new Error("Geração interrompida pelo usuário.");
    }
    throw err;
  } finally {
    state.abortController = null;
  }

  return fullText;
}

function stopStreaming() {
  if (state.abortController) {
    state.abortController.abort();
  }
}

let streamingBodyEl = null;

function updateStreamingMessage(text) {
  if (!streamingBodyEl) {
    removeTyping();
    const container = $("messagesContainer");
    const row = document.createElement("div");
    row.className = "msg-row";
    const avatar = document.createElement("div");
    avatar.className = "msg-avatar ai";
    avatar.textContent = "M";
    streamingBodyEl = document.createElement("div");
    streamingBodyEl.className = "msg-body";
    row.appendChild(avatar);
    row.appendChild(streamingBodyEl);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
  }
  streamingBodyEl.innerHTML = renderMarkdown(text);
  $("messagesContainer").scrollTop = $("messagesContainer").scrollHeight;
}

function finalizeStreamingMessage() {
  streamingBodyEl = null;
}

// ── Tool execution ──────────────────────────────────────────────────

async function executeTool(toolName, args) {
  addMessage(`Executando ferramenta: ${toolName}`, "ai", { toolName });
  const result = await apiPost(`/api/tools/${toolName}`, args);
  return result;
}

function renderToolsGrid() {
  const grid = $("toolsPanel").querySelector(".tools-grid");
  grid.innerHTML = "";
  const todas = [...state.tools, ...state.toolsDesativadas];
  for (const toolName of todas) {
    const info = TOOL_DESCRIPTIONS[toolName] || { icon: "❓", desc: toolName };
    const ativa = state.tools.includes(toolName);
    const card = document.createElement("div");
    card.className = "tool-card" + (ativa ? "" : " disabled");
    card.innerHTML = `
      <div class="tool-icon">${info.icon}</div>
      <div class="tool-name">${toolName}</div>
      <div class="tool-desc">${info.desc}</div>
      <button class="tool-toggle-btn ${ativa ? "on" : "off"}" data-tool="${toolName}" title="${ativa ? "Desativar ferramenta" : "Ativar ferramenta"}">${ativa ? "🟢 Ativa" : "⏸ Desativada"}</button>
    `;
    card.addEventListener("click", (e) => {
      if (e.target.closest(".tool-toggle-btn")) {
        toggleTool(toolName);
        return;
      }
      if (state.tools.includes(toolName)) {
        $("toolsPanel").classList.remove("show");
        handleToolClick(toolName);
      }
    });
    grid.appendChild(card);
  }
}

async function toggleTool(toolName) {
  try {
    await apiPost(`/api/tools/${toolName}/toggle`);
    await loadTools();
    renderToolsGrid();
  } catch (err) {
    alert("Falha ao alternar ferramenta: " + (err.message || "erro"));
  }
}

function showToolsPanel() {
  renderToolsGrid();
  $("toolsPanel").classList.toggle("show");
}

async function handleToolClick(toolName) {
  const info = TOOL_DESCRIPTIONS[toolName] || { icon: "❓", desc: "" };

  // Ferramentas que não precisam de argumentos
  const noArgTools = [
    "listar_perfis_modelo",
    "analisar_logs_sistema",
    "verificar_prompt",
    "consultar_logs_auditoria",
    "exportar_relatorio_auditoria",
  ];

  if (noArgTools.includes(toolName)) {
    $("heroHeading").style.display = "none";
    $("quickCategories").style.display = "none";
    $("messagesContainer").style.display = "flex";

    addMessage(`Executando ${info.icon} ${toolName}...`, "user");
    $("typingIndicator") || showTyping();

    try {
      const result = await executeTool(toolName, {});
      removeTyping();
      const resultStr = JSON.stringify(result, null, 2);
      addMessage(resultStr, "ai", { toolName, toolResult: true });
    } catch (err) {
      removeTyping();
      addMessage(`❌ Erro: ${err.message}`, "ai", { toolName });
    }
    return;
  }

  // Ferramentas que precisam de input do usuário
  const promptMap = {
    perguntar_ia: "Digite sua pergunta para a IA:",
    buscar_na_web: "Digite o termo de busca:",
    perguntar_ia_com_contexto: "Digite sua pergunta (com contexto):",
    resolver_problema_passo_a_passo: "Descreva o problema:",
    comparar_modelos_ia: "Digite a pergunta para comparar modelos:",
    analisar_codigo_powershell: "Cole o código PowerShell para análise:",
    ia_comando_sugerir: "Descreva o que você quer fazer:",
    enviar_webhook_discord: "Digite a URL do webhook Discord:",
    enviar_webhook_teams: "Digite a URL do webhook Teams:",
    enviar_webhook_slack: "Digite a URL do webhook Slack:",
    monitorar_e_notificar: "Digite a URL do webhook para alertas:",
    consultar_fonte_oficial_gov: "Digite a URL .gov.br para consultar:",
    verificar_prompt: "Digite o texto para verificar:",
    definir_perfil_modelo: "Digite o nome do perfil (fast/balanced/agent/coding/reasoning):",
    gerar_snapshot_git: "Digite a fase/descrição do snapshot (opcional):",
  };

  const promptText = promptMap[toolName] || `Argumentos para ${toolName}:`;
  const input = prompt(promptText);
  if (!input) return;

  $("heroHeading").style.display = "none";
  $("quickCategories").style.display = "none";
  $("messagesContainer").style.display = "flex";

  addMessage(`${info.icon} ${toolName}: ${input.slice(0, 100)}`, "user");
  showTyping();

  try {
    let args = {};
    switch (toolName) {
      case "perguntar_ia": args = { pergunta: input }; break;
      case "buscar_na_web": args = { query: input }; break;
      case "perguntar_ia_com_contexto": args = { pergunta: input, contexto: [] }; break;
      case "resolver_problema_passo_a_passo": args = { problema: input }; break;
      case "comparar_modelos_ia": args = { query: input }; break;
      case "analisar_codigo_powershell": args = { codigo: input }; break;
      case "ia_comando_sugerir": args = { descricao: input }; break;
      case "enviar_webhook_discord": {
        const msg = prompt("Digite a mensagem:") || "";
        args = { webhook_url: input, titulo: "Mestre do PC", mensagem: msg };
        break;
      }
      case "enviar_webhook_teams": {
        const msg = prompt("Digite a mensagem:") || "";
        args = { webhook_url: input, titulo: "Mestre do PC", mensagem: msg };
        break;
      }
      case "enviar_webhook_slack": {
        const msg = prompt("Digite a mensagem:") || "";
        args = { webhook_url: input, mensagem: msg };
        break;
      }
      case "monitorar_e_notificar": args = { webhook_url: input }; break;
      case "consultar_fonte_oficial_gov": {
        const termo = prompt("Termo de busca (opcional):") || "";
        args = { url: input, termo };
        break;
      }
      case "verificar_prompt": args = { texto: input }; break;
      case "definir_perfil_modelo": args = { perfil: input }; break;
      case "gerar_snapshot_git": args = { fase: input }; break;
      default: args = { input };
    }

    const result = await executeTool(toolName, args);
    removeTyping();
    const resultStr = JSON.stringify(result, null, 2);
    addMessage(resultStr, "ai", { toolName, toolResult: true });
  } catch (err) {
    removeTyping();
    addMessage(`❌ Erro ao executar ${toolName}: ${err.message}`, "ai", { toolName });
  }
}

// ── Conversas ───────────────────────────────────────────────────────

async function loadConversas() {
  const data = await apiGet("/api/conversas?limit=50");
  state.conversas = data.conversas || [];
  renderConversas();
}

function renderConversas() {
  const list = $("chatHistory");
  list.innerHTML = "";

  for (const conv of state.conversas) {
    const item = document.createElement("div");
    item.className = "chat-item" + (conv.id === state.conversaId ? " active" : "");
    item.textContent = conv.titulo || "Nova conversa";
    item.title = conv.titulo || "";

    const del = document.createElement("span");
    del.className = "del-btn";
    del.textContent = "✕";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Deletar esta conversa?")) return;
      await apiDelete(`/api/conversas/${conv.id}`);
      if (state.conversaId === conv.id) {
        state.conversaId = null;
        state.messages = [];
        resetChatView();
      }
      loadConversas();
    });
    item.appendChild(del);

    item.addEventListener("click", () => loadConversa(conv.id));
    list.appendChild(item);
  }
}

async function loadConversa(id) {
  const data = await apiGet(`/api/conversas/${id}`);
  if (!data.conversa) return;

  state.conversaId = id;
  state.messages = [];

  $("heroHeading").style.display = "none";
  $("quickCategories").style.display = "none";
  $("messagesContainer").style.display = "flex";
  $("messagesContainer").innerHTML = "";

  for (const msg of data.mensagens || []) {
    const role = msg.role === "assistant" ? "ai" : msg.role === "user" ? "user" : "ai";
    addMessage(msg.content, role, {
      toolName: msg.tool_name || undefined,
      toolResult: msg.tool_result ? true : false,
    });
    state.messages.push({ role: msg.role, content: msg.content });
  }

  renderConversas();
}

async function newConversa() {
  const data = await apiPost("/api/conversas", { titulo: "Nova conversa" });
  state.conversaId = data.id;
  state.messages = [];
  resetChatView();
  $("messagesContainer").innerHTML = "";
  loadConversas();
}

function resetChatView() {
  $("heroHeading").style.display = "flex";
  $("quickCategories").style.display = "flex";
  $("messagesContainer").style.display = "none";
  $("messagesContainer").innerHTML = "";
}

// ── Memórias ────────────────────────────────────────────────────────

async function loadMemorias() {
  const data = await apiGet("/api/memorias");
  state.memorias = data.memorias || [];
  renderMemorias();
  renderActiveMemoryChips();
}

function renderMemorias() {
  const panel = $("memoriesPanel");
  const list = panel.querySelector(".mem-list");
  list.innerHTML = "";

  for (const mem of state.memorias) {
    const item = document.createElement("div");
    item.className = "memory-item";
    item.innerHTML = `
      <div class="mem-content">
        <div class="mem-title">${escapeHtml(mem.titulo)}</div>
        <div class="mem-text">${escapeHtml(mem.conteudo)}</div>
      </div>
      <div class="mem-actions">
        <button class="toggle" title="Ativar/Desativar">${mem.ativa ? "✅" : "⬜"}</button>
        <button class="del" title="Deletar">🗑️</button>
      </div>
    `;
    item.querySelector(".toggle").addEventListener("click", async () => {
      await apiPost(`/api/memorias/${mem.id}/toggle`);
      loadMemorias();
    });
    item.querySelector(".del").addEventListener("click", async () => {
      if (!confirm("Deletar esta memória?")) return;
      await apiDelete(`/api/memorias/${mem.id}`);
      loadMemorias();
    });
    list.appendChild(item);
  }
}

async function addMemoria() {
  const input = $("memInput");
  const text = input.value.trim();
  if (!text) return;

  const titulo = text.slice(0, 50);
  const conteudo = text;

  await apiPost("/api/memorias", { titulo, conteudo });
  input.value = "";
  loadMemorias();
}

// ── Profiles ────────────────────────────────────────────────────────

async function loadProfiles() {
  try {
    const data = await apiGet("/api/profiles");
    state.perfis = data.perfis || [];
    state.perfilAtivo = data.perfil_ativo || "balanced";
    state.modeloAtivo = data.modelo_local || data.modelo_ativo || "";
    state.profileOptions = data.opcoes || {};
    renderProfilesMenu();
    updateModelBadge();
  } catch { /* launcher pode estar reiniciando */ }
}

function renderProfilesMenu() {
  const menu = $("modelsMenu");
  const items = menu.querySelectorAll(".menu-item");
  items.forEach(i => i.remove());

  const header = menu.querySelector("div");
  if (header) header.remove();

  const titleDiv = document.createElement("div");
  titleDiv.style.cssText = "font-size:11px;color:var(--text-muted);padding:6px";
  titleDiv.textContent = "PERFIS DE MODELO";
  menu.appendChild(titleDiv);

  for (const p of state.perfis) {
    const item = document.createElement("div");
    item.className = "menu-item" + (p.id === state.perfilAtivo ? " selected" : "");
    item.innerHTML = `<span>${p.label || p.id}</span><small>${p.model || ""}</small>`;
    item.addEventListener("click", async () => {
      const result = await apiPost("/api/profiles/activate", { perfil: p.id });
      if (result.modelo) {
        state.perfilAtivo = p.id;
        state.modeloAtivo = result.modelo;
      }
      renderProfilesMenu();
      menu.classList.remove("show");
      updateModelBadge();
    });
    menu.appendChild(item);
  }
}

function updateModelBadge() {
  const badge = $("btnModelSelect");
  const span = badge.querySelector("span");
  if (state.perfilAtivo && state.perfis.length) {
    const p = state.perfis.find(x => x.id === state.perfilAtivo);
    span.textContent = `🔀 ${p?.label || state.perfilAtivo}`;
  } else {
    span.textContent = "🔀 Auto";
  }
}

// ── Tools list ──────────────────────────────────────────────────────

async function loadTools() {
  try {
    const data = await apiGet("/api/tools");
    state.tools = data.tools || [];
    state.toolsDesativadas = data.desativadas || [];
    $("btnConnectors").querySelector("span").textContent = `🔧 Ferramentas (${state.tools.length})`;
  } catch { /* offline */ }
}

// ── Sync status ─────────────────────────────────────────────────────

async function loadSyncStatus() {
  try {
    const status = await apiGet("/api/sync/status");
    const badge = $("syncBadge");
    if (status.mysqlConfigurado) {
      badge.className = "sync-badge " + (status.unsynced?.total > 0 ? "pending" : "synced");
      badge.textContent = `Sync: ${status.unsynced?.total || 0} pending`;
    } else {
      badge.className = "sync-badge";
      badge.textContent = "Sync: local";
    }
  } catch { /* ignora */ }
}

// ── Send message ────────────────────────────────────────────────────

async function sendMessage() {
  if (state.isWaiting) return;
  const input = $("promptInput");
  const msg = input.value.trim();
  if (!msg) return;

  // Cria conversa se não existir
  if (!state.conversaId) {
    const conv = await apiPost("/api/conversas", { titulo: msg.slice(0, 40) });
    state.conversaId = conv.id;
    loadConversas();
  }

  $("heroHeading").style.display = "none";
  $("quickCategories").style.display = "none";
  $("messagesContainer").style.display = "flex";

  addMessage(msg, "user");
  input.value = "";
  state.isWaiting = true;
  state.messages.push({ role: "user", content: msg });

  // Salva mensagem do usuário no banco
  apiPost(`/api/conversas/${state.conversaId}/msg`, {
    role: "user",
    content: msg,
  }).catch(() => {});

  showTyping();
  $("btnStop").style.display = "";
  $("btnSend").style.display = "none";

  try {
    const reply = await streamOllamaReply(msg);
    removeTyping();
    streamingBodyEl = null;

    if (reply) {
      addMessage(reply, "ai");
      state.messages.push({ role: "assistant", content: reply });

      // Salva resposta no banco
      apiPost(`/api/conversas/${state.conversaId}/msg`, {
        role: "assistant",
        content: reply,
      }).catch(() => {});
    } else {
      addMessage("(resposta vazia)", "ai");
    }
  } catch (err) {
    removeTyping();
    streamingBodyEl = null;
    if (err.message !== "Geração interrompida pelo usuário.") {
      addMessage(`❌ Erro: ${err.message}`, "ai");
    }
  } finally {
    state.isWaiting = false;
    $("btnStop").style.display = "none";
    $("btnSend").style.display = "";
    input.focus();
    loadSyncStatus();
  }
}

// ── Quick categories ────────────────────────────────────────────────

const QUICK_CATEGORIES = [
  { label: "💻 Diagnóstico do PC", msg: "Faz um diagnóstico completo do meu PC" },
  { label: "🧹 Limpeza", msg: "Quero limpar arquivos temporários do meu PC" },
  { label: "⚡ Performance", msg: "Como posso melhorar a performance do meu PC?" },
  { label: "📊 Status do sistema", msg: "Mostre o status atual do sistema" },
  { label: "🔍 Buscar na web", msg: "", tool: "buscar_na_web" },
  { label: "🛠️ Ferramentas", msg: "", action: "showTools" },
];

function renderQuickCategories() {
  const container = $("quickCategories");
  container.innerHTML = "";
  for (const cat of QUICK_CATEGORIES) {
    const el = document.createElement("div");
    el.className = "cat-capsule";
    el.textContent = cat.label;
    el.addEventListener("click", () => {
      if (cat.action === "showTools") {
        showToolsPanel();
      } else if (cat.tool) {
        handleToolClick(cat.tool);
      } else if (cat.msg) {
        $("promptInput").value = cat.msg;
        sendMessage();
      }
    });
    container.appendChild(el);
  }
}

// ── Init ────────────────────────────────────────────────────────────

export async function initChatIntegrado() {
  // Theme toggle
  $("btnTheme").addEventListener("click", () => {
    document.body.classList.toggle("light");
    localStorage.setItem("mestre-theme", document.body.classList.contains("light") ? "light" : "dark");
  });

  // Restore theme
  if (localStorage.getItem("mestre-theme") === "light") {
    document.body.classList.add("light");
  }

  // Collapse sidebar
  $("collapseBtn").addEventListener("click", () => {
    document.body.classList.toggle("sidebar-collapsed");
  });

  // New chat
  $("btnNewChat").addEventListener("click", () => {
    state.conversaId = null;
    state.messages = [];
    resetChatView();
  });

  // Nav: Ferramentas
  $("btnToolsNav").addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllMenus();
    showToolsPanel();
  });

  // Nav: Tema
  $("btnThemeNav").addEventListener("click", () => {
    $("btnTheme").click();
  });

  // Nav: Limpar chat
  $("btnClearNav").addEventListener("click", () => {
    if (confirm("Limpar todo o chat atual?")) {
      $("messagesContainer").innerHTML = "";
      $("heroHeading").style.display = "flex";
      $("quickCategories").style.display = "flex";
      $("messagesContainer").style.display = "none";
      state.messages = [];
    }
  });

  // Send on Enter
  $("promptInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Send button
  $("btnSend").addEventListener("click", () => sendMessage());

  // Stop button
  $("btnStop").addEventListener("click", () => stopStreaming());

  // Popup menus
  function closeAllMenus() {
    $$(".popup-menu").forEach(m => m.classList.remove("show"));
    $("toolsPanel").classList.remove("show");
    $("memoriesPanel").classList.remove("show");
  }

  $("btnPlus").addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = $("plusMenu");
    const isShow = menu.classList.contains("show");
    closeAllMenus();
    if (!isShow) menu.classList.add("show");
  });

  $("btnConnectors").addEventListener("click", (e) => {
    e.stopPropagation();
    const panel = $("toolsPanel");
    const isShow = panel.classList.contains("show");
    closeAllMenus();
    if (!isShow) showToolsPanel();
  });

  $("btnModelSelect").addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = $("modelsMenu");
    const isShow = menu.classList.contains("show");
    closeAllMenus();
    if (!isShow) menu.classList.add("show");
  });

  $("btnMemories").addEventListener("click", (e) => {
    e.stopPropagation();
    const panel = $("memoriesPanel");
    const isShow = panel.classList.contains("show");
    closeAllMenus();
    if (!isShow) {
      panel.classList.add("show");
      loadMemorias();
    }
  });

  document.addEventListener("click", () => closeAllMenus());

  $$(".popup-menu").forEach(m => {
    m.addEventListener("click", (e) => e.stopPropagation());
  });
  $("toolsPanel").addEventListener("click", (e) => e.stopPropagation());
  $("memoriesPanel").addEventListener("click", (e) => e.stopPropagation());

  // Memory add
  $("memAddBtn").addEventListener("click", () => addMemoria());
  $("memInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addMemoria(); }
  });

  // Toggle switches (connectors visual)
  $$(".toggle-sw").forEach(sw => {
    sw.addEventListener("click", (e) => {
      e.stopPropagation();
      sw.classList.toggle("active");
    });
  });

  // Voice input
  $("btnMic").addEventListener("click", () => {
    if (state.voiceRecognition) {
      state.voiceRecognition.stop();
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      $("btnMic").title = "Entrada por voz indisponível neste navegador";
      return;
    }
    state.voiceRecognition = new Recognition();
    state.voiceRecognition.lang = "pt-BR";
    state.voiceRecognition.continuous = false;
    state.voiceRecognition.interimResults = true;
    $("btnMic").classList.add("is-listening");
    $("btnMic").title = "Parar entrada por voz";
    state.voiceRecognition.onresult = (event) => {
      $("promptInput").value = Array.from(event.results)
        .map(r => r[0]?.transcript || "")
        .join("")
        .trim();
    };
    state.voiceRecognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        $("btnMic").title = "Permita o acesso ao microfone para usar a entrada por voz";
      }
    };
    state.voiceRecognition.onend = () => {
      state.voiceRecognition = null;
      $("btnMic").classList.remove("is-listening");
      $("btnMic").title = "Entrada por voz";
      $("promptInput").focus();
    };
    try {
      state.voiceRecognition.start();
    } catch {
      state.voiceRecognition = null;
      $("btnMic").classList.remove("is-listening");
    }
  });

  // Quick categories
  renderQuickCategories();

  // Load data
  await Promise.all([
    loadTools(),
    loadProfiles(),
    loadConversas(),
    loadSyncStatus(),
    loadMemorias(),
  ]);

  // Auto-refresh sync status every 30s
  setInterval(loadSyncStatus, 30000);

  console.log("[chat-integrado] Inicializado. Tools:", state.tools.length, "Perfis:", state.perfis.length);
}
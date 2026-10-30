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

import { applySkillShortcut, buildAttachmentContext, filterSkills } from "./chat-utils.js";

const BASE = ""; // mesma origem do launcher

const LS_SESSION = "mestre-site-session";
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "json", "xml", "yaml", "yml", "ini", "conf", "env", "log",
  "ps1", "bat", "cmd", "html", "css", "js", "jsx", "ts", "tsx", "py", "java", "c", "cpp", "h",
  "hpp", "sql", "sh", "toml",
]);

const HISTORY_MESSAGE_LIMIT = 80;
const HISTORY_CHAR_BUDGET = 48000;

/**
 * Seleciona as mensagens mais recentes para a API, com teto de contagem e de caracteres.
 * @param {Array<{role: string, content?: string}>} messages
 * @returns {Array<{role: string, content?: string}>}
 */
function selectHistoryForApi(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const capped = messages.slice(-HISTORY_MESSAGE_LIMIT);
  let total = 0;
  const picked = [];
  for (let i = capped.length - 1; i >= 0; i--) {
    const msg = capped[i];
    const len = typeof msg?.content === "string" ? msg.content.length : 0;
    if (picked.length > 0 && total + len > HISTORY_CHAR_BUDGET) break;
    picked.push(msg);
    total += len;
  }
  return picked.reverse();
}

const SYSTEM_PROMPT = `Você é o Mestre IA do Mestre do PC — um assistente no estilo Grok: franco, bem-humorado, direto e útil, em português brasileiro.

TOM E CONTEXTO:
- Conversa livre: código, ideias, curiosidades, explicações, brainstorm — não fique preso só a manutenção de PC.
- Quando o assunto for o PC Windows do JEAN, use seu superpoder: diagnóstico, PowerShell, ferramentas MCP e manutenção.
- Seja claro e honesto. Humor leve quando couber; sem enrolação.
- Prefira respostas úteis e acionáveis. Em problemas do PC, no máximo 3 ações por prioridade.

COMANDOS E SEGURANÇA (só quando sugerir execução no PC):
1. Inclua o comando PowerShell exato entre \`\`\`powershell e \`\`\`.
2. NUNCA invente comandos — só PowerShell/Windows reais.
3. A execução passa pela whitelist do launcher (/classify + /run). Não prometa rodar o que a whitelist não cobre; oriente cadastrar em /gerenciar-comandos.html se precisar.
4. Nunca peça nem repita senhas, tokens ou chaves.

FERRAMENTAS:
Você tem acesso a ferramentas MCP (diagnósticos, web, código, webhooks, etc.). Quando for relevante, sugira ou use a ferramenta certa.`;

const TOOL_DESCRIPTIONS = {
  perguntar_ia: { icon: "🧠", desc: "Perguntar à IA local" },
  buscar_na_web: { icon: "🔍", desc: "Buscar na web (DuckDuckGo)" },
  buscar_e_resumir_pagina: { icon: "📰", desc: "Buscar e resumir uma página" },
  ler_pagina_web: { icon: "🌐", desc: "Ler página web e responder perguntas" },
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
  attachments: [],
  skills: [],
  selectedSkillIndex: 0,
  toolMetadata: {},
  desktopCommander: null,
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

// ── Modal próprio (substituto acessível de alert/confirm/prompt) ────

let modalResolve = null;
let modalMode = "confirm";

function initModal() {
  const overlay = $("modalOverlay");
  if (!overlay) return;

  $("modalOk").addEventListener("click", () => resolveModal(true));
  $("modalCancel").addEventListener("click", () => resolveModal(false));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) resolveModal(false);
  });

  document.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      resolveModal(false);
    } else if (e.key === "Enter" && !e.ctrlKey && !e.shiftKey && document.activeElement !== $("modalTextarea")) {
      e.preventDefault();
      resolveModal(true);
    } else if (e.key === "Tab") {
      const itens = [...overlay.querySelectorAll("button, input, textarea")].filter((el) => !el.hidden);
      if (!itens.length) return;
      const idx = itens.indexOf(document.activeElement);
      const next = idx === -1 ? 0 : e.shiftKey ? (idx - 1 + itens.length) % itens.length : (idx + 1) % itens.length;
      itens[next].focus();
      e.preventDefault();
    }
  });
}

function resolveModal(aceito) {
  const overlay = $("modalOverlay");
  if (overlay.hidden || !modalResolve) return;
  const resolver = modalResolve;
  modalResolve = null;
  overlay.hidden = true;
  if (modalMode === "prompt") {
    modalMode = "confirm";
    const usaTextarea = !$("modalTextarea").hidden;
    const el = usaTextarea ? $("modalTextarea") : $("modalInput");
    resolver(aceito ? el.value : null);
  } else {
    resolver(!!aceito);
  }
}

function openModal({ title, body, okText = "OK", cancelText = "Cancelar", mode = "confirm", value = "", useTextarea = false }) {
  const overlay = $("modalOverlay");
  if (!overlay.hidden) resolveModal(false);

  modalMode = mode;
  const titleEl = $("modalTitle");
  titleEl.textContent = title || "";
  titleEl.hidden = !title;

  const bodyEl = $("modalBody");
  bodyEl.textContent = String(body || "");
  bodyEl.hidden = !bodyEl.textContent;

  const inputEl = $("modalInput");
  const textareaEl = $("modalTextarea");
  const usaTextarea = mode === "prompt" && useTextarea;
  inputEl.hidden = mode !== "prompt" || usaTextarea;
  textareaEl.hidden = !usaTextarea;
  inputEl.value = textareaEl.value = String(value);

  const okBtn = $("modalOk");
  okBtn.textContent = okText;
  const cancelBtn = $("modalCancel");
  cancelBtn.textContent = cancelText;
  cancelBtn.hidden = !cancelText;

  overlay.hidden = false;
  (usaTextarea ? textareaEl : inputEl.hidden ? okBtn : inputEl).focus();
  return new Promise((resolve) => { modalResolve = resolve; });
}

function getLocalSession() {
  try {
    const session = JSON.parse(localStorage.getItem(LS_SESSION) || "null");
    return session && session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

function ensureLocalSession() {
  let session = getLocalSession();
  if (!session) {
    session = {
      user: "Jean Avila",
      email: "jean@mestre.local",
      createdAt: Date.now(),
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
    };
    try {
      localStorage.setItem(LS_SESSION, JSON.stringify(session));
    } catch { /* ignore storage quota errors */ }
  }
  const user = String(session.user || "Jean Avila");
  if ($("userName")) $("userName").textContent = user.toUpperCase();
  if ($("userAvatar")) $("userAvatar").textContent = user.slice(0, 2).toUpperCase();
  if ($("userEmail")) $("userEmail").textContent = "Sessão local ativa";
  return true;
}

function fileExtension(name) {
  return String(name || "").split(".").pop().toLowerCase();
}

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function renderAttachments() {
  const container = $("attachmentsList");
  if (!container) return;
  container.innerHTML = "";
  for (const [index, attachment] of state.attachments.entries()) {
    const item = document.createElement("div");
    item.className = "attachment-chip";
    item.title = attachment.kind === "binary"
      ? "O nome será enviado; este formato não é extraído pelo navegador."
      : attachment.name;
    item.innerHTML = `<span>${attachment.kind === "image" ? "🖼️" : attachment.kind === "binary" ? "📦" : "📄"}</span><span class="attachment-name"></span><button type="button" title="Remover arquivo">✕</button>`;
    item.querySelector(".attachment-name").textContent = `${attachment.name} (${formatBytes(attachment.size)})`;
    item.querySelector("button").addEventListener("click", () => {
      state.attachments.splice(index, 1);
      renderAttachments();
    });
    container.appendChild(item);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function importFiles(fileList) {
  const files = Array.from(fileList || []);
  let currentTotal = state.attachments.reduce((total, item) => total + item.size, 0);
  for (const file of files) {
    if (currentTotal + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
      await openModal({ title: "Limite de anexos", body: `Limite total de anexos: ${formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)}.`, cancelText: "", okText: "Entendi" });
      break;
    }

    try {
      const extension = fileExtension(file.name);
      if (file.type.startsWith("image/")) {
        if (file.size > MAX_TEXT_FILE_BYTES * 2) {
          await openModal({ title: "Arquivo excedido", body: `${file.name} excede o limite de imagem de ${formatBytes(MAX_TEXT_FILE_BYTES * 2)}.`, cancelText: "", okText: "Entendi" });
          continue;
        }
        const dataUrl = await readDataUrl(file);
        state.attachments.push({
          name: file.name,
          size: file.size,
          kind: "image",
          mime: file.type,
          dataUrl,
          base64: dataUrl.split(",")[1] || "",
        });
      } else if (TEXT_EXTENSIONS.has(extension) || file.type.startsWith("text/")) {
        if (file.size > MAX_TEXT_FILE_BYTES) {
          await openModal({ title: "Arquivo excedido", body: `${file.name} excede o limite de texto de ${formatBytes(MAX_TEXT_FILE_BYTES)}.`, cancelText: "", okText: "Entendi" });
          continue;
        }
        const content = (await file.text()).slice(0, 12000);
        state.attachments.push({ name: file.name, size: file.size, kind: "text", content });
      } else {
        state.attachments.push({ name: file.name, size: file.size, mime: file.type, kind: "binary" });
      }
      currentTotal += file.size;
    } catch (err) {
      await openModal({ title: `Falha ao importar ${file.name}`, body: String(err.message || "erro desconhecido"), cancelText: "", okText: "Entendi" });
    }
  }
  renderAttachments();
  $("promptInput").focus();
}

async function loadSkills() {
  try {
    const data = await apiGet("/api/skills");
    state.skills = Array.isArray(data.skills) ? data.skills : [];
  } catch {
    state.skills = [];
  }
  const visibleSkills = state.skills.filter((skill) => skill.kind !== "tool");
  $("btnSkills").querySelector("span").textContent = `Skills (${visibleSkills.length})`;
  $("skillsCount").textContent = String(visibleSkills.length);
  renderSkillsLibrary();
}

function renderSkillsLibrary() {
  const container = $("skillsLibraryGrid");
  const query = $("skillsSearch").value;
  const knowledgeSkills = state.skills.filter((skill) => skill.kind !== "tool");
  const matches = filterSkills(knowledgeSkills, query, knowledgeSkills.length);
  container.innerHTML = "";

  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "skill-library-empty";
    empty.textContent = "Nenhuma skill encontrada para esta busca.";
    container.appendChild(empty);
    return;
  }

  for (const skill of matches) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "skill-library-card";
    card.innerHTML = `
      <span class="skill-library-category"></span>
      <span class="skill-library-title"></span>
      <span class="skill-library-id"></span>
      <span class="skill-library-description"></span>
    `;
    card.querySelector(".skill-library-category").textContent = skill.category || "Skill";
    card.querySelector(".skill-library-title").textContent = skill.title || skill.id;
    card.querySelector(".skill-library-id").textContent = `/${skill.id}`;
    card.querySelector(".skill-library-description").textContent = skill.description || "";
    card.addEventListener("click", () => chooseSkill(skill));
    container.appendChild(card);
  }
}

function showSkillsLibrary() {
  renderSkillsLibrary();
  $("skillsLibraryPanel").classList.toggle("show");
  refreshAria();
  if ($("skillsLibraryPanel").classList.contains("show")) {
    $("skillsSearch").focus();
  }
}

// Sincroniza aria-expanded dos gatilhos com o estado visível dos painéis
function refreshAria() {
  const pares = [
    ["btnPlus", "plusMenu"],
    ["btnConnectors", "toolsPanel"],
    ["btnSkills", "skillsLibraryPanel"],
    ["btnModelSelect", "modelsMenu"],
    ["btnMemories", "memoriesPanel"],
    ["btnToolsNav", "toolsPanel"],
    ["btnSkillsNav", "skillsLibraryPanel"],
  ];
  for (const [triggerId, painelId] of pares) {
    const trigger = $(triggerId);
    const painel = $(painelId);
    if (!trigger || !painel) continue;
    const aberto = painel.classList.contains("show");
    trigger.setAttribute("aria-expanded", String(aberto));
    painel.setAttribute("aria-hidden", String(!aberto));
  }
}

function hideSkillsMenu() {
  $("skillsMenu").classList.remove("show");
  state.selectedSkillIndex = 0;
}

async function ensureSkillBody(skill) {
  if (!skill || skill.body) return skill;
  try {
    const full = await apiGet(`/api/skills/${encodeURIComponent(skill.id)}`);
    if (full?.skill?.body) skill.body = full.skill.body;
  } catch {
    /* description permanece como fallback */
  }
  return skill;
}

function chooseSkill(skill) {
  $("promptInput").value = `/${skill.id} `;
  hideSkillsMenu();
  $("skillsLibraryPanel").classList.remove("show");
  $("promptInput").focus();
  void ensureSkillBody(skill);
}

function renderSkillsMenu() {
  const input = $("promptInput");
  const menu = $("skillsMenu");
  const value = input.value;
  if (!value.startsWith("/") || value.includes("\n") || value.slice(1).includes(" ")) {
    hideSkillsMenu();
    return;
  }

  const suggestions = filterSkills(state.skills, value.slice(1));
  menu.innerHTML = "";
  if (!suggestions.length) {
    hideSkillsMenu();
    return;
  }
  state.selectedSkillIndex = Math.min(state.selectedSkillIndex, suggestions.length - 1);
  suggestions.forEach((skill, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `skill-suggestion${index === state.selectedSkillIndex ? " selected" : ""}`;
    item.setAttribute("role", "option");
    item.innerHTML = `<span class="skill-suggestion-title"></span><small></small>`;
    item.querySelector(".skill-suggestion-title").textContent = `/${skill.id}`;
    item.querySelector("small").textContent = skill.title || skill.category || "skill";
    item.addEventListener("click", () => chooseSkill(skill));
    menu.appendChild(item);
  });
  menu.classList.add("show");
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, label, url) => {
    const hrefUrl = url.replace(/"/g, "%22").replace(/'/g, "%27");
    return `<a href="${hrefUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

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
    attachRunButtons(body);
  } else {
    body.textContent = text;
  }

  if (extra.toolName) {
    const meta = document.createElement("div");
    meta.className = "msg-meta";
    meta.innerHTML = `<span class="sync-badge">🔧 ${escapeHtml(extra.toolName)}</span>`;
    body.appendChild(meta);
  }

  if (extra.skillName) {
    const meta = document.createElement("div");
    meta.className = "msg-meta";
    meta.innerHTML = `<span class="sync-badge">⚡ <span class="skill-meta-name"></span></span>`;
    meta.querySelector(".skill-meta-name").textContent = extra.skillName;
    body.appendChild(meta);
  }

  if (Array.isArray(extra.attachments) && extra.attachments.length) {
    const list = document.createElement("div");
    list.className = "message-attachments";
    for (const attachment of extra.attachments) {
      const chip = document.createElement("span");
      chip.textContent = `${attachment.kind === "image" ? "🖼️" : attachment.kind === "binary" ? "📦" : "📄"} ${attachment.name}`;
      list.appendChild(chip);
    }
    body.appendChild(list);
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
  const history = selectHistoryForApi(state.messages);
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((message, index, msgs) =>
      index === msgs.length - 1 && message.role === "user"
        ? { ...message, content: buildUserPromptWithMemories(message.content) }
        : message
    ),
  ];

  const body = {
    model: state.modeloAtivo || "qwen2.5-coder:3b-instruct",
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
let pendingStreamText = null;
let streamRafId = 0;

function updateStreamingMessage(text) {
  pendingStreamText = text;
  if (streamRafId) return;
  streamRafId = requestAnimationFrame(() => {
    streamRafId = 0;
    const container = $("messagesContainer");
    let forcarScroll = false;
    if (!streamingBodyEl) {
      removeTyping();
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
      forcarScroll = true;
    }
    const estavaNoFim = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    streamingBodyEl.innerHTML = renderMarkdown(pendingStreamText);
    if (forcarScroll || estavaNoFim) container.scrollTop = container.scrollHeight;
  });
}

function commandFromFence(text) {
  return String(text || "").replace(/^(powershell|pwsh|ps1)\s*\n/i, "").trim();
}

function attachRunButtons(container) {
  if (!container) return;
  container.querySelectorAll("pre").forEach((pre) => {
    if (pre.querySelector(".run-cmd")) return;
    const cmd = commandFromFence(pre.querySelector("code")?.textContent || pre.textContent);
    if (!cmd) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "run-cmd";
    btn.innerHTML = "<span class=\"run-cmd-icon\">▶</span><span>Executar na whitelist</span>";
    btn.addEventListener("click", () => {
      runSuggestedCommand(cmd, btn).catch((err) => addMessage("❌ " + err.message, "ai"));
    });
    pre.appendChild(btn);
  });
}

function setRunStatusMessage(row, text, tone = "info") {
  if (!row) {
    addMessage(text, "ai");
    row = $("messagesContainer")?.lastElementChild || null;
  }
  const body = row?.querySelector(".msg-body");
  if (!body) return row;
  body.classList.remove("run-status-info", "run-status-wait", "run-status-ok", "run-status-fail");
  body.classList.add("run-status", `run-status-${tone}`);
  body.innerHTML = renderMarkdown(text);
  row.scrollIntoView({ behavior: "smooth", block: "end" });
  return row;
}

async function runSuggestedCommand(cmd, triggerBtn = null) {
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.classList.add("is-busy");
  }

  let statusRow = setRunStatusMessage(null, "🔎 **Classificando** comando na whitelist…", "wait");

  try {
    const classified = await fetch("/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Mestre-Client": "v10-web" },
      body: JSON.stringify({ cmd }),
    });
    const verdict = await classified.json().catch(() => ({}));
    if (!classified.ok || !verdict.allowed) {
      setRunStatusMessage(
        statusRow,
        "🚫 Esse comando **não está na whitelist** do Mestre. " + (verdict.reason || "Nada foi executado."),
        "fail",
      );
      return;
    }

    const aviso = verdict.destructive
      ? "Operação destrutiva da whitelist. Revise antes de autorizar."
      : "Comando da whitelist. Confirme antes de executar.";
    const titulo = [verdict.title, verdict.category].filter(Boolean).join(" · ");
    setRunStatusMessage(
      statusRow,
      `✅ **Whitelist OK** — ${titulo || verdict.id || "comando"}. Aguardando confirmação…`,
      "info",
    );

    const aprovado = await openModal({
      title: titulo || "Comando da whitelist",
      body: `${aviso}\n\n${cmd}`,
      okText: "Executar",
    });
    if (!aprovado) {
      setRunStatusMessage(statusRow, "⏹️ Execução cancelada.", "info");
      return;
    }

    setRunStatusMessage(
      statusRow,
      `⚙️ **Executando:** ${verdict.title || verdict.id || "comando"}…`,
      "wait",
    );

    const submitRes = await fetch("/run", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Mestre-Client": "v10-web" },
      body: JSON.stringify({ cmd }),
    });
    const submit = await submitRes.json().catch(() => ({}));
    if (!submitRes.ok || !submit.jobId) {
      setRunStatusMessage(
        statusRow,
        "❌ " + (submit.output || "O launcher recusou o comando."),
        "fail",
      );
      return;
    }

    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 800));
      const statusRes = await fetch("/run-status?id=" + encodeURIComponent(submit.jobId), {
        headers: { "X-Mestre-Client": "v10-web" },
      });
      const status = await statusRes.json().catch(() => ({}));
      if (status.state === "running") {
        setRunStatusMessage(
          statusRow,
          `⚙️ **Executando:** ${verdict.title || verdict.id || "comando"}…\n\n_Job \`${submit.jobId.slice(0, 8)}\`_`,
          "wait",
        );
        continue;
      }
      const saida = status.output || "(sem saída)";
      const ok = !!status.success;
      setRunStatusMessage(
        statusRow,
        (ok ? "✅ **Concluído**" : "❌ **Falhou**") + "\n\n```\n" + saida.slice(0, 4000) + "\n```",
        ok ? "ok" : "fail",
      );
      return;
    }
    setRunStatusMessage(
      statusRow,
      `⏳ O comando ainda está rodando. Acompanhe pelo job \`${submit.jobId}\`.`,
      "wait",
    );
  } finally {
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.classList.remove("is-busy");
    }
  }
}

/** Reinicia a thread local (mesmo efeito do botão Novo chat). */
function startFreshChat() {
  state.conversaId = null;
  state.messages = [];
  if (state.abortController) {
    try { state.abortController.abort(); } catch { /* ignore */ }
  }
  resetChatView();
}

const WHITELIST_DEMO_RAM =
  "Get-CimInstance Win32_PhysicalMemory | Select-Object Manufacturer,PartNumber,@{N='GB';E={[math]::Round($_.Capacity/1GB,0)}},Speed,DeviceLocator | Format-Table -AutoSize";

/** Injeta um fence pronto da whitelist para o usuário clicar em Executar. */
function suggestWhitelistDemo(cmd = WHITELIST_DEMO_RAM, title = "Informações da Memória RAM") {
  startFreshChat();
  $("heroHeading").style.display = "none";
  $("quickCategories").style.display = "none";
  $("messagesContainer").style.display = "flex";
  addMessage(
    `Atalho de teste da whitelist — **${title}**.\n\nClique em **Executar na whitelist** no bloco abaixo (o Mestre vai classificar e pedir confirmação).\n\n\`\`\`powershell\n${cmd}\n\`\`\``,
    "ai",
  );
}

function finalizeStreamingMessage() {
  if (streamRafId) {
    cancelAnimationFrame(streamRafId);
    streamRafId = 0;
  }
  if (streamingBodyEl && pendingStreamText != null) {
    streamingBodyEl.innerHTML = renderMarkdown(pendingStreamText);
  }
  pendingStreamText = null;
  attachRunButtons(streamingBodyEl);
  streamingBodyEl = null;
}

async function ensureModel() {
  if (state.modeloAtivo) return;
  try {
    const data = await apiGet("/ollama/tags");
    const names = (data.models || []).map((m) => m.name || m.model).filter(Boolean);
    state.modeloAtivo = names.find((n) => n === "qwen2.5-coder:3b-instruct") || names[0] || "";
    document.body.dataset.modelo = state.modeloAtivo;
  } catch { /* o status do topo mostra o launcher mesmo sem modelo */ }
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
    const metadata = state.toolMetadata[toolName];
    const info = TOOL_DESCRIPTIONS[toolName] || {
      icon: metadata?.provider === "desktop-commander" ? "DC" : "?",
      desc: metadata?.description || toolName,
      title: metadata?.title || toolName,
    };
    const ativa = state.tools.includes(toolName);
    const card = document.createElement("div");
    card.className = "tool-card" + (ativa ? "" : " disabled");
    card.innerHTML = `
      <div class="tool-icon">${escapeHtml(info.icon)}</div>
      <div class="tool-name">${escapeHtml(info.title || toolName)}</div>
      <div class="tool-desc">${escapeHtml(info.desc)}</div>
      <button class="tool-toggle-btn ${ativa ? "on" : "off"}" data-tool="${escapeHtml(toolName)}" title="${ativa ? "Desativar ferramenta" : "Ativar ferramenta"}">${ativa ? "🟢 Ativa" : "⏸ Desativada"}</button>
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
    await openModal({ title: "Falha ao alternar ferramenta", body: String(err.message || "erro"), cancelText: "", okText: "Entendi" });
  }
}

function showToolsPanel() {
  renderToolsGrid();
  $("toolsPanel").classList.toggle("show");
  refreshAria();
}

function defaultValueForToolProperty(name, schema = {}) {
  if (name === "timeout_ms") return 10000;
  if (name === "pid" || schema.type === "number" || schema.type === "integer") return 0;
  if (schema.type === "array") return [];
  if (schema.type === "object") return {};
  if (schema.type === "boolean") return false;
  if (name === "path" || name === "file_path" || name === "source" || name === "destination") {
    return "C:\\caminho\\absoluto";
  }
  return "";
}

async function handleDesktopCommanderToolClick(toolName) {
  const metadata = state.toolMetadata[toolName];
  if (!metadata) {
    await openModal({ title: "Ferramenta indisponível", body: "Metadados da ferramenta Desktop Commander não estão disponíveis.", cancelText: "", okText: "Entendi" });
    return;
  }

  const required = metadata.inputSchema?.required || [];
  const properties = metadata.inputSchema?.properties || {};
  const template = Object.fromEntries(required.map((name) => [name, defaultValueForToolProperty(name, properties[name])]));
  let args = {};

  if (required.length) {
    const raw = await openModal({
      mode: "prompt",
      title: `Argumentos JSON para ${metadata.title || metadata.name}`,
      body: "Preencha os campos obrigatórios em JSON:",
      value: JSON.stringify(template, null, 2),
      useTextarea: true,
      okText: "Executar",
    });
    if (raw == null) return;
    try {
      args = JSON.parse(raw);
      if (!args || Array.isArray(args) || typeof args !== "object") {
        throw new Error("Use um objeto JSON.");
      }
    } catch (err) {
      await openModal({ title: "JSON inválido", body: String(err.message || err), cancelText: "", okText: "Entendi" });
      return;
    }
  }

  if (metadata.requiresConfirmation) {
    const accepted = await openModal({
      title: `Executar ${metadata.title || metadata.name}?`,
      body: "A ferramenta pode alterar arquivos, processos ou configurações. Confirma a execução?",
      okText: "Executar",
    });
    if (!accepted) return;
    args.__confirm = true;
  }

  $("heroHeading").style.display = "none";
  $("quickCategories").style.display = "none";
  $("messagesContainer").style.display = "flex";
  addMessage(`Desktop Commander: ${metadata.title || metadata.name}`, "user");
  showTyping();

  try {
    const result = await executeTool(toolName, args);
    removeTyping();
    addMessage(JSON.stringify(result, null, 2), "ai", { toolName, toolResult: true });
  } catch (err) {
    removeTyping();
    addMessage(`Erro ao executar ${metadata.name}: ${err.message}`, "ai", { toolName });
  }
}

async function handleToolClick(toolName) {
  const metadata = state.toolMetadata[toolName];
  if (metadata?.provider === "desktop-commander") {
    await handleDesktopCommanderToolClick(toolName);
    return;
  }

  const info = TOOL_DESCRIPTIONS[toolName] || { icon: "❓", desc: "" };

  // Ferramentas que não precisam de argumentos
  const noArgTools = [
    "listar_perfis_modelo",
    "analisar_logs_sistema",
    "verificar_prompt",
    "consultar_logs_auditoria",
    "exportar_relatorio_auditoria",
    "grokbot__status",
    "grokbot__optimize_pc",
    "grokbot__sync_memories",
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
    buscar_e_resumir_pagina: "Digite o termo de busca para encontrar a página:",
    ler_pagina_web: "Digite a URL da página:",
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
    grokbot__chat: "Digite sua pergunta para o Grok Bot (Grok 4.7 via 9Router):",
    grokbot__delegate_task: "Digite o título/objetivo da tarefa para a fila do Grok Bot:",
  };

  const promptText = promptMap[toolName] || `Argumentos para ${toolName}:`;
  const input = await openModal({ mode: "prompt", title: promptText, okText: "Executar", value: "" });
  if (input == null || !input.trim()) return;

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
      case "buscar_e_resumir_pagina": {
        const pergunta = (await openModal({ mode: "prompt", title: "Pergunta sobre a página (opcional):", okText: "Continuar" })) || "";
        args = { query: input, pergunta };
        break;
      }
      case "ler_pagina_web": {
        const pergunta = (await openModal({ mode: "prompt", title: "Pergunta sobre a página (opcional):", okText: "Continuar" })) || "";
        args = { url: input, pergunta };
        break;
      }
      case "perguntar_ia_com_contexto": args = { pergunta: input, contexto: [] }; break;
      case "resolver_problema_passo_a_passo": args = { problema: input }; break;
      case "comparar_modelos_ia": args = { query: input }; break;
      case "analisar_codigo_powershell": args = { codigo: input }; break;
      case "ia_comando_sugerir": args = { descricao: input }; break;
      case "enviar_webhook_discord": {
        const msg = (await openModal({ mode: "prompt", title: "Digite a mensagem:", okText: "Enviar" })) || "";
        args = { webhook_url: input, titulo: "Mestre do PC", mensagem: msg };
        break;
      }
      case "enviar_webhook_teams": {
        const msg = (await openModal({ mode: "prompt", title: "Digite a mensagem:", okText: "Enviar" })) || "";
        args = { webhook_url: input, titulo: "Mestre do PC", mensagem: msg };
        break;
      }
      case "enviar_webhook_slack": {
        const msg = (await openModal({ mode: "prompt", title: "Digite a mensagem:", okText: "Enviar" })) || "";
        args = { webhook_url: input, mensagem: msg };
        break;
      }
      case "monitorar_e_notificar": args = { webhook_url: input }; break;
      case "consultar_fonte_oficial_gov": {
        const termo = (await openModal({ mode: "prompt", title: "Termo de busca (opcional):", okText: "Continuar" })) || "";
        args = { url: input, termo };
        break;
      }
      case "verificar_prompt": args = { texto: input }; break;
      case "definir_perfil_modelo": args = { perfil: input }; break;
      case "gerar_snapshot_git": args = { fase: input }; break;
      case "grokbot__chat": args = { pergunta: input }; break;
      case "grokbot__delegate_task": args = { titulo: input }; break;
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
    const item = document.createElement("button");
    item.type = "button";
    item.className = "chat-item" + (conv.id === state.conversaId ? " active" : "");
    item.textContent = conv.titulo || "Nova conversa";
    item.title = conv.titulo || "";

    const del = document.createElement("span");
    del.className = "del-btn";
    del.textContent = "✕";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await openModal({ title: "Deletar conversa", body: "Deletar esta conversa? A ação não pode ser desfeita.", okText: "Deletar" });
      if (!ok) return;
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

async function clearCurrentChat() {
  const ok = await openModal({ title: "Limpar chat", body: "Limpar as mensagens da conversa atual? A conversa será mantida no histórico.", okText: "Limpar" });
  if (!ok) return;
  if (state.conversaId) {
    const result = await apiPost(`/api/conversas/${state.conversaId}/clear`, {});
    if (!result?.success) throw new Error(result?.error || "Não foi possível limpar a conversa.");
  }
  state.messages = [];
  resetChatView();
  await loadConversas();
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
      const ok = await openModal({ title: "Deletar memória", body: "Deletar esta memória? A ação não pode ser desfeita.", okText: "Deletar" });
      if (!ok) return;
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
    try { const salvo = localStorage.getItem("mestre.perfilAtivo"); const sp = salvo && state.perfis.find(x => x.id === salvo); if (sp && sp.id !== state.perfilAtivo) { state.perfilAtivo = sp.id; if (sp.model) state.modeloAtivo = sp.model; } } catch {}
    renderProfilesMenu();
    updateModelBadge();
    await ensureModel();
  } catch { /* launcher pode estar reiniciando */ }
}

function renderProfilesMenu() {
  const menu = $("modelsMenu");
  if (!menu) return;
  menu.replaceChildren();
  const title = document.createElement("div");
  title.className = "models-title";
  title.textContent = "Perfis de modelo";
  menu.appendChild(title);
  if (!state.perfis || !state.perfis.length) {
    const empty = document.createElement("div");
    empty.className = "models-empty";
    empty.textContent = "Nenhum perfil disponível (Ollama offline?)";
    menu.appendChild(empty);
    return;
  }
  for (const p of state.perfis) {
    const ativo = p.id === state.perfilAtivo;
    const item = document.createElement("div");
    item.className = "menu-item" + (ativo ? " selected" : "");
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(ativo));
    item.tabIndex = -1;
    item.dataset.id = String(p.id);
    const check = document.createElement("span"); check.className = "mi-check"; check.textContent = ativo ? "✓" : "";
    const label = document.createElement("span"); label.className = "mi-label"; label.textContent = String(p.label || p.id);
    const model = document.createElement("small"); model.textContent = String(p.model || ""); model.title = String(p.model || "");
    item.append(check, label, model);
    item.addEventListener("click", () => activateProfile(p, item));
    item.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); activateProfile(p, item); } });
    menu.appendChild(item);
  }
}

async function activateProfile(p, item) {
  const menu = $("modelsMenu");
  if (p.id === state.perfilAtivo) { closeModelsMenu(); return; }
  menu.querySelectorAll(".menu-item").forEach(i => i.setAttribute("aria-disabled", "true"));
  try {
    const result = await apiPost("/api/profiles/activate", { perfil: p.id });
    if (!result || result.error || !result.modelo) throw new Error(result?.error || "Falha ao ativar perfil");
    state.perfilAtivo = p.id;
    state.modeloAtivo = result.modelo;
    if (result.opcoes) state.profileOptions = result.opcoes;
    try { localStorage.setItem("mestre.perfilAtivo", p.id); } catch {}
    updateModelBadge();
    closeModelsMenu();
  } catch (err) {
    console.error("[modelos]", err);
    if (typeof showToast === "function") showToast("Não foi possível trocar o modelo: " + err.message);
    else alert("Não foi possível trocar o modelo: " + err.message);
  } finally {
    renderProfilesMenu();
  }
}

function positionModelsMenu() {
  const menu = $("modelsMenu"), btn = $("btnModelSelect");
  if (!menu || !btn) return;
  const r = btn.getBoundingClientRect(), m = 12, gap = 8;
  const w = Math.min(340, window.innerWidth - m * 2);
  const below = window.innerHeight - r.bottom - m - gap, above = r.top - m - gap;
  const openDown = below >= 260 || below >= above;
  const maxH = Math.max(160, Math.min(420, openDown ? below : above));
  menu.style.width = w + "px";
  menu.style.maxHeight = maxH + "px";
  menu.style.left = Math.max(m, Math.min(r.left, window.innerWidth - w - m)) + "px";
  menu.style.top = openDown ? (r.bottom + gap) + "px" : "auto";
  menu.style.bottom = openDown ? "auto" : (window.innerHeight - r.top + gap) + "px";
  menu.style.right = "auto";
}

function openModelsMenu() {
  const menu = $("modelsMenu");
  closeAllMenus();
  renderProfilesMenu();
  menu.classList.add("show");
  positionModelsMenu();
  (menu.querySelector(".menu-item.selected") || menu.querySelector(".menu-item"))?.focus();
  refreshAria();
}

function closeModelsMenu() {
  $("modelsMenu")?.classList.remove("show");
  refreshAria();
}

(function wireModelsMenuKeys() {
  document.addEventListener("keydown", (ev) => {
    const menu = $("modelsMenu");
    if (!menu || !menu.classList.contains("show")) return;
    const items = [...menu.querySelectorAll(".menu-item")];
    const i = items.indexOf(document.activeElement);
    if (ev.key === "Escape") { ev.preventDefault(); closeModelsMenu(); $("btnModelSelect")?.focus(); }
    else if (ev.key === "ArrowDown") { ev.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
  });
  window.addEventListener("resize", () => { if ($("modelsMenu")?.classList.contains("show")) positionModelsMenu(); });
  window.addEventListener("scroll", () => { if ($("modelsMenu")?.classList.contains("show")) positionModelsMenu(); }, true);
})();
function updateModelBadge() {
  const badge = $("btnModelSelect");
  const span = badge.querySelector("span");
  if (state.perfilAtivo && state.perfis.length) {
    const p = state.perfis.find(x => x.id === state.perfilAtivo);
    span.textContent = `🔀 ${p?.label || state.perfilAtivo}`;
  } else if (state.modeloAtivo) {
    span.textContent = `🔀 ${state.modeloAtivo}`;
  } else {
    span.textContent = "🔀 Auto";
  }
  document.body.dataset.modelo = state.modeloAtivo || "";
}

// ── Tools list ──────────────────────────────────────────────────────

async function loadTools() {
  try {
    const data = await apiGet("/api/tools");
    state.tools = data.tools || [];
    state.toolsDesativadas = data.desativadas || [];
    state.toolMetadata = data.metadata || {};
    state.desktopCommander = data.desktopCommander || null;
    $("btnConnectors").querySelector("span").textContent = `🔧 Ferramentas (${state.tools.length})`;
    const desktopBadge = $("desktopCommanderBadge");
    if (state.desktopCommander?.connected) {
      desktopBadge.textContent = `Desktop Commander: conectado (${state.desktopCommander.tools})`;
      desktopBadge.className = "sync-badge synced";
    } else {
      desktopBadge.textContent = "Desktop Commander: indisponível";
      desktopBadge.className = "sync-badge pending";
      desktopBadge.title = state.desktopCommander?.error || "Falha ao iniciar o servidor MCP.";
    }
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
  const typedMessage = input.value.trim();
  const attachments = state.attachments.map((attachment) => ({ ...attachment }));
  if (!typedMessage && !attachments.length) return;

  const shortcutMatch = typedMessage.match(/^\/([^\s]+)/);
  if (shortcutMatch) {
    const shortcut = shortcutMatch[1].toLowerCase();
    const listed = state.skills.find((item) => String(item.id).toLowerCase() === shortcut);
    if (listed) await ensureSkillBody(listed);
  }
  const skillResult = applySkillShortcut(typedMessage, state.skills);
  const prompt = skillResult.matched ? skillResult.text : typedMessage;
  const attachmentContext = buildAttachmentContext(prompt || "Analise os arquivos anexados.", attachments);
  const visibleMessage = typedMessage || "Analise os arquivos anexados.";

  // Cria conversa se não existir
  if (!state.conversaId) {
    const conv = await apiPost("/api/conversas", { titulo: visibleMessage.slice(0, 40) });
    state.conversaId = conv.id;
    loadConversas();
  }

  $("heroHeading").style.display = "none";
  $("quickCategories").style.display = "none";
  $("messagesContainer").style.display = "flex";
  hideSkillsMenu();

  addMessage(visibleMessage, "user", {
    attachments,
    skillName: skillResult.matched ? skillResult.skill.title : undefined,
  });
  input.value = "";
  state.attachments = [];
  renderAttachments();
  state.isWaiting = true;
  state.messages.push({ role: "user", content: attachmentContext.text, images: attachmentContext.images });

  // Salva mensagem do usuário no banco
  apiPost(`/api/conversas/${state.conversaId}/msg`, {
    role: "user",
    content: attachmentContext.text,
  }).catch(() => {});

  showTyping();
  $("btnStop").style.display = "";
  $("btnSend").style.display = "none";

  try {
    const reply = await streamOllamaReply(attachmentContext.text);
    removeTyping();

    if (reply) {
      // O balão já foi criado e atualizado pelo streaming.
      finalizeStreamingMessage();
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
    if (streamRafId) { cancelAnimationFrame(streamRafId); streamRafId = 0; }
    pendingStreamText = null;
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
  { label: "💻 Diagnóstico do PC", msg: "Faz um diagnóstico completo do meu PC", fresh: true },
  { label: "🧹 Limpeza", msg: "Quero limpar arquivos temporários do meu PC", fresh: true },
  { label: "⚡ Performance", msg: "Como posso melhorar a performance do meu PC?" },
  { label: "📊 Status do sistema", msg: "Mostre o status atual do sistema" },
  { label: "✅ Testar whitelist (RAM)", action: "whitelistRam" },
  { label: "🔍 Buscar na web", msg: "", tool: "buscar_na_web" },
  { label: "Skills", msg: "", action: "showSkills" },
  { label: "Revisar código", msg: "", skill: "code-review" },
  { label: "React/Next.js", msg: "", skill: "react-nextjs" },
  { label: "Explicar GitHub", msg: "", skill: "github-project-explainer" },
  { label: "🛠️ Ferramentas", msg: "", action: "showTools" },
];

function renderQuickCategories() {
  const container = $("quickCategories");
  container.innerHTML = "";
  for (const cat of QUICK_CATEGORIES) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "cat-capsule" + (cat.action === "whitelistRam" ? " cat-capsule-accent" : "");
    el.textContent = cat.label;
    el.addEventListener("click", () => {
      if (cat.action === "showTools") {
        showToolsPanel();
      } else if (cat.action === "showSkills") {
        showSkillsLibrary();
      } else if (cat.action === "whitelistRam") {
        suggestWhitelistDemo();
      } else if (cat.skill) {
        const skill = state.skills.find((item) => item.id === cat.skill);
        if (skill) chooseSkill(skill);
      } else if (cat.tool) {
        handleToolClick(cat.tool);
      } else if (cat.msg) {
        if (cat.fresh) startFreshChat();
        $("promptInput").value = cat.msg;
        sendMessage();
      }
    });
    container.appendChild(el);
  }
}

// ── Init ────────────────────────────────────────────────────────────

export async function initChatIntegrado() {
  if (!ensureLocalSession()) return;

  // Modal próprio (substituto acessível de alert/confirm/prompt)
  initModal();

  // Theme toggle (+ color-scheme para controles/scrollbar nativos seguirem o tema)
  const aplicarColorScheme = () => {
    document.documentElement.style.colorScheme = document.body.classList.contains("light") ? "light" : "dark";
  };
  $("btnTheme").addEventListener("click", () => {
    document.body.classList.toggle("light");
    localStorage.setItem("mestre-theme", document.body.classList.contains("light") ? "light" : "dark");
    aplicarColorScheme();
  });

  // Restore theme
  if (localStorage.getItem("mestre-theme") === "light") {
    document.body.classList.add("light");
  }
  aplicarColorScheme();

  // Collapse sidebar
  $("collapseBtn").addEventListener("click", () => {
    document.body.classList.toggle("sidebar-collapsed");
  });

  // New chat
  $("btnNewChat").addEventListener("click", () => {
    startFreshChat();
  });
  $("btnNewChatTop")?.addEventListener("click", () => {
    startFreshChat();
  });

  // Nav: Ferramentas
  $("btnToolsNav").addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllMenus();
    showToolsPanel();
  });

  $("btnSkillsNav").addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllMenus();
    showSkillsLibrary();
  });

  // Nav: Tema
  $("btnThemeNav").addEventListener("click", () => {
    $("btnTheme").click();
  });

  $("btnDiagnosticoNav").addEventListener("click", () => {
    // Thread limpa evita a IA responder "OK" por causa do histórico anterior.
    startFreshChat();
    $("promptInput").value = "Faz um diagnóstico completo do meu PC e sugere no máximo 3 ações.";
    sendMessage();
  });
  $("btnManutencaoNav").addEventListener("click", () => {
    startFreshChat();
    $("promptInput").value = "Quero uma manutenção segura: temporários, lixeira e o que mais a whitelist permitir.";
    sendMessage();
  });
  $("btnDashboardNav").addEventListener("click", () => {
    location.href = "/";
  });
  $("btnGerenciarNav").addEventListener("click", () => {
    location.href = "/gerenciar-comandos.html";
  });

  // Nav: Limpar chat
  $("btnClearNav").addEventListener("click", () => {
    clearCurrentChat().catch(async (err) => {
      await openModal({ title: "Falha ao limpar o chat", body: String(err.message || "erro desconhecido"), cancelText: "", okText: "Entendi" });
    });
  });

  // Send on Enter
  $("promptInput").addEventListener("input", () => {
    state.selectedSkillIndex = 0;
    renderSkillsMenu();
  });
  $("promptInput").addEventListener("keydown", (e) => {
    const skillsMenu = $("skillsMenu");
    const suggestionsVisible = skillsMenu.classList.contains("show");
    if (suggestionsVisible && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const count = skillsMenu.querySelectorAll(".skill-suggestion").length;
      state.selectedSkillIndex = (state.selectedSkillIndex + (e.key === "ArrowDown" ? 1 : -1) + count) % count;
      renderSkillsMenu();
      return;
    }
    if (suggestionsVisible && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const skill = filterSkills(state.skills, $("promptInput").value.slice(1))[state.selectedSkillIndex];
      if (skill) chooseSkill(skill);
      return;
    }
    if (e.key === "Escape") {
      hideSkillsMenu();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Send button
  $("btnSend").addEventListener("click", () => sendMessage());

  // Stop button
  $("btnStop").addEventListener("click", () => stopStreaming());

  // Importação de arquivos pelo botão + e pelo atalho Ctrl/Cmd+O
  $("itemImport").addEventListener("click", () => {
    closeAllMenus();
    $("fileInput").click();
  });
  $("fileInput").addEventListener("change", (e) => {
    importFiles(e.currentTarget.files);
    e.currentTarget.value = "";
  });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
      e.preventDefault();
      $("fileInput").click();
    }
  });

  $("userProfile").addEventListener("click", async () => {
    const ok = await openModal({ title: "Sair da sessão", body: "Sair da sessão local?", okText: "Sair" });
    if (!ok) return;
    localStorage.removeItem(LS_SESSION);
    location.href = "/login.html";
  });

  // Popup menus
  function closeAllMenus() {
    $$(".popup-menu").forEach(m => m.classList.remove("show"));
    $("toolsPanel").classList.remove("show");
    $("skillsLibraryPanel").classList.remove("show");
    $("memoriesPanel").classList.remove("show");
    hideSkillsMenu();
    refreshAria();
  }

  $("btnPlus").addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = $("plusMenu");
    const isShow = menu.classList.contains("show");
    closeAllMenus();
    if (!isShow) menu.classList.add("show");
    refreshAria();
  });

  $("btnConnectors").addEventListener("click", (e) => {
    e.stopPropagation();
    const panel = $("toolsPanel");
    const isShow = panel.classList.contains("show");
    closeAllMenus();
    if (!isShow) showToolsPanel();
  });

  $("btnSkills").addEventListener("click", (e) => {
    e.stopPropagation();
    const panel = $("skillsLibraryPanel");
    const isShow = panel.classList.contains("show");
    closeAllMenus();
    if (!isShow) showSkillsLibrary();
  });

  $("btnModelSelect").addEventListener("click", (e) => {
    e.stopPropagation();
    if ($("modelsMenu").classList.contains("show")) closeModelsMenu(); else openModelsMenu();
  });
  $("btnModelSelect").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); openModelsMenu(); }
  });
  $("modelsMenu").addEventListener("click", (e) => e.stopPropagation());

  $("btnMemories").addEventListener("click", (e) => {
    e.stopPropagation();
    const panel = $("memoriesPanel");
    const isShow = panel.classList.contains("show");
    closeAllMenus();
    if (!isShow) {
      panel.classList.add("show");
      loadMemorias();
    }
    refreshAria();
  });

  document.addEventListener("click", () => closeAllMenus());

  $$(".popup-menu").forEach(m => {
    m.addEventListener("click", (e) => e.stopPropagation());
  });
  $("toolsPanel").addEventListener("click", (e) => e.stopPropagation());
  $("skillsLibraryPanel").addEventListener("click", (e) => e.stopPropagation());
  $("memoriesPanel").addEventListener("click", (e) => e.stopPropagation());
  $("skillsSearch").addEventListener("input", () => renderSkillsLibrary());

  // Memory add
  $("memAddBtn").addEventListener("click", () => addMemoria());
  $("memInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addMemoria(); }
  });

  // Status sync e auditoria (migrados do HTML → modal próprio)
  $("itemSync").addEventListener("click", async () => {
    closeAllMenus();
    const status = await apiGet("/api/sync/status").catch(() => null);
    if (status) {
      await openModal({
        title: "Status de sincronização MySQL",
        body: `Configurado: ${status.mysqlConfigurado ? "Sim" : "Não"}\nThreshold: ${status.threshold}\nPendentes: ${status.unsynced?.total || 0}\nÚltimo sync: ${status.ultimoSync || "Nunca"}\nTotal sincronizado: ${status.totalSynced || 0}`,
        cancelText: "",
        okText: "Entendi",
      });
    } else {
      await openModal({ title: "Sync MySQL", body: "Não foi possível obter o status do launcher.", cancelText: "", okText: "Entendi" });
    }
  });

  $("itemAudit").addEventListener("click", async () => {
    closeAllMenus();
    const data = await apiGet("/api/audit?limit=20").catch(() => null);
    if (data?.entries?.length) {
      const texto = data.entries.map(e => `[${e.criada_em}] ${e.level}: ${e.action}`).join("\n");
      await openModal({
        title: `Auditoria — últimas ${data.entries.length} entradas`,
        body: texto,
        cancelText: "",
        okText: "Entendi",
      });
    } else {
      await openModal({ title: "Auditoria", body: "Nenhuma entrada de auditoria encontrada.", cancelText: "", okText: "Entendi" });
    }
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
  const grokBtn = $("grokbotTopBtn");
  if (grokBtn) {
    grokBtn.addEventListener("click", () => handleToolClick("grokbot__status"));
  }

  await Promise.all([
    loadTools(),
    loadProfiles(),
    loadConversas(),
    loadSyncStatus(),
    loadMemorias(),
    loadSkills(),
    loadGrokBotStatus(),
  ]);

  // Auto-refresh sync status every 30s
  setInterval(loadSyncStatus, 30000);

  console.log("[chat-integrado] Inicializado. Tools:", state.tools.length, "Perfis:", state.perfis.length);
}
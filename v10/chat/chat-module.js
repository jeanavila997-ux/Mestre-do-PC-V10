/**
 * Mestre do PC V10/V11 - Modulo de Chat IA
 *
 * Refatoracao modularizada do chat original em v10/index.html.
 * Realiza chamadas ao launcher local (127.0.0.1:7777) para:
 *   - Conversacao com Ollama via /ollama/chat (streaming)
 *   - Classificacao de comandos via /classify
 *   - Execucao de comandos aprovados via /run
 *   - Gerenciamento de memorias (IndexedDB + localStorage fallback)
 *   - Anexos de contexto (dashboard, arquivos, imagens, terminal, app)
 */

const DEFAULT_SYSTEM_PROMPT = `Você é o Mestre do PC V10, um assistente especializado em manutenção de computadores Windows.
REGRAS:
1. Responda SEMPRE em português brasileiro.
2. Quando sugerir uma ação, inclua o comando PowerShell exato entre \`\`\`powershell e \`\`\`.
3. NUNCA invente comandos. Use APENAS comandos PowerShell reais do Windows.
4. Seja direto e objetivo. O usuário quer soluções rápidas.
5. Se o usuário descrever um problema, sugira no máximo 3 ações ordenadas por prioridade.
COMANDOS QUE VOCÊ CONHECE:
- Limpeza: Remove-Item no TEMP, Clear-RecycleBin, cleanmgr, DISM StartComponentCleanup
- RAM: Get-Process, [System.GC]::Collect(), SysMain
- Disco: Get-PSDrive, Optimize-Volume, chkdsk, Get-PhysicalDisk
- Rede: ipconfig, Test-Connection, Resolve-DnsName, netsh, Get-NetAdapter
- Sistema: Get-ComputerInfo, sfc /scannow, DISM, bootrec
- Segurança: Get-MpComputerStatus, Start-MpScan, Get-NetFirewallProfile
- Performance: powercfg, Game Mode, efeitos visuais
- Backup: Checkpoint-Computer, Export-WindowsDriver, reg export
- Drivers: Get-WmiObject Win32_PnPSignedDriver, pnputil
- Privacidade: AllowTelemetry, AdvertisingInfo, Cortana`;

const OLLAMA_MODEL_PREFERENCES = [
  "qwen2.5-coder:3b-instruct",
  "glm-5.2:cloud",
  "minimax-m3:cloud",
  "kimi-k2.5:cloud",
  "gemma4:cloud",
  "glm-5.1:cloud",
];
const MAX_CHAT_TEXT_FILE_BYTES = 2 * 1024 * 1024;

const TEMPLATE = `
<div class="mestre-chat-overlay" id="mestreChatOverlay" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="mestreChatDialogTitle">
  <div class="mestre-chat-modal">
    <div class="mestre-chat-header">
      <div>
        <h3 id="mestreChatDialogTitle">🧠 Mestre IA (Ollama)</h3>
        <span class="mestre-chat-status" id="mestreChatStatus">Verificando conexão...</span>
        <select id="mestreChatModelSelect" class="mestre-chat-model-select" aria-label="Modelo do Ollama"></select>
      </div>
      <div class="mestre-chat-header-actions">
      <button class="mestre-chat-minimize" id="mestreChatMinimize" aria-label="Minimizar chat" title="Minimizar chat">▁</button>
      <button class="mestre-chat-close" id="mestreChatClose" aria-label="Fechar chat" title="Fechar chat">✕</button>
      </div>
    </div>
    <div class="mestre-chat-tabs">
      <button class="mestre-chat-tab active" data-tab="chat">💬 Chat</button>
      <button class="mestre-chat-tab" data-tab="memories">🧠 Memórias</button>
    </div>
    <div class="mestre-chat-tab-body active" data-tab-body="chat">
      <div class="mestre-chat-toolbar">
        <button data-attach="dashboard" title="Enviar métricas atuais de CPU/RAM/disco">📊 Painel</button>
        <button data-attach="models" title="Listar modelos Ollama instalados">🤖 Modelos</button>
        <button data-attach="memory" title="Enviar uso de RAM e processos pesados">🧠 Memória</button>
        <button data-attach="files" title="Selecionar arquivo local para análise">📁 Arquivo</button>
        <button data-attach="terminal" title="Enviar último output do terminal">🖥️ Terminal</button>
        <button data-attach="app" title="Enviar informações do app Mestre do PC">🛡️ App</button>
        <button data-attach="image" title="Anexar imagem para análise visual">🖼️ Imagem</button>
        <button data-action="open-memories" title="Abrir interface completa de memórias" style="border-color:rgba(88,166,255,0.6);color:var(--accent)">🧠 Memórias</button>
        <button data-action="save-context" title="Baixar todo o contexto do chat em JSON">💾 Salvar</button>
        <button data-action="export-md" title="Baixar conversa em relatório Markdown">📥 MD</button>
        <button data-action="clear-attachments" title="Limpar contextos anexados">🧹 Limpar</button>
        <button data-action="clear-chat" title="Limpar todo o histórico de chat da IA" style="border-color:rgba(248,81,73,0.4);color:var(--danger)">🗑️ Limpar Chat</button>
      </div>
      <div class="mestre-chat-attach-panel" id="mestreChatAttachPanel">
        <h4 id="mestreChatAttachTitle">Anexos ao contexto</h4>
        <div class="mestre-chat-attach-list" id="mestreChatAttachList"></div>
      </div>
      <div class="mestre-chat-memory-chips" id="mestreChatActiveMemoryChips"></div>
      <input type="file" id="mestreChatFileInput" style="display:none" accept=".txt,.md,.json,.csv,.log,.ps1,.bat,.cmd,.xml,.yaml,.yml,.ini,.conf,.env,.html,.css,.js,.ts,.py" />
      <input type="file" id="mestreChatImageInput" style="display:none" accept="image/*" />
      <div class="mestre-chat-messages" id="mestreChatMessages">
        <div class="mestre-chat-msg ai">Olá! Sou o <strong>Mestre IA</strong>, seu assistente de manutenção do PC. 🖥️<br/>Me diga o que está acontecendo e eu sugiro os melhores comandos para resolver!</div>
      </div>
      <div class="mestre-chat-input-area">
        <input type="text" id="mestreChatInput" aria-label="Mensagem para o Mestre IA" placeholder="Digite sua mensagem..." autocomplete="off" />
        <button id="mestreChatAttachFileBtn" class="icon-btn secondary" title="Anexar arquivo de texto">📎</button>
        <button id="mestreChatAttachImageBtn" class="icon-btn secondary" title="Anexar imagem">🖼️</button>
        <button id="mestreChatVoiceBtn" class="icon-btn secondary" title="Falar mensagem" aria-label="Falar mensagem">🎤</button>
        <button id="mestreChatSendBtn">Enviar ➤</button>
        <button id="mestreChatStopBtn" class="stop-btn" style="display:none;" title="Parar geração">⏹ Parar</button>
      </div>
    </div>
    <div class="mestre-chat-tab-body" data-tab-body="memories">
      <div class="mestre-chat-memories-header">
        <button class="mestre-chat-memories-new" id="mestreChatNewMemoryBtn">➕ Nova memória</button>
        <span class="mestre-chat-memories-count" id="mestreChatMemoriesCount">0 memórias</span>
      </div>
      <div class="mestre-chat-memories-list" id="mestreChatMemoriesList"></div>
      <div class="mestre-chat-memory-editor" id="mestreChatMemoryEditor">
        <input type="hidden" id="mestreChatMemoryId" />
        <input type="text" id="mestreChatMemoryTitle" placeholder="Título da memória..." />
        <textarea id="mestreChatMemoryContent" placeholder="Conteúdo que o modelo deve lembrar..."></textarea>
        <div class="mestre-chat-memory-editor-actions">
          <button id="mestreChatSaveMemoryBtn">💾 Salvar</button>
          <button class="secondary" id="mestreChatCancelMemoryBtn">Cancelar</button>
        </div>
      </div>
    </div>
  </div>
</div>
<div class="mestre-chat-confirm-overlay" id="mestreChatConfirmOverlay">
  <div class="mestre-chat-confirm-modal" id="mestreChatConfirmModal">
    <div class="mestre-chat-confirm-head" id="mestreChatConfirmHead">⚠️ Confirmação de segurança</div>
    <div class="mestre-chat-confirm-body">
      <div id="mestreChatConfirmReason"></div>
      <pre id="mestreChatConfirmCode"></pre>
      <div class="mestre-chat-confirm-meta" id="mestreChatConfirmMeta"></div>
    </div>
    <div class="mestre-chat-confirm-foot">
      <button type="button" id="mestreChatConfirmCancel">Cancelar</button>
      <button type="button" class="primary" id="mestreChatConfirmOk">Executar como Administrador</button>
    </div>
  </div>
</div>
`;

function fmtUptime(sec) {
  sec = Number(sec) || 0;
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d${h}h`;
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export class MestreChat {
  constructor(options = {}) {
    this.launcherUrl = options.launcherUrl || (window.location.protocol.startsWith("http") ? window.location.origin : "http://127.0.0.1:7777");
    this.clientHeader = options.clientHeader || "v10-web";
    this.systemPrompt = options.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    this.defaultModel = options.defaultModel || "qwen2.5-coder:3b-instruct";
    this.storageKey = options.storageKey || "mestre_v10_ia_conversation";
    this.memoryStorageKey = options.memoryStorageKey || "mestre_v10_memories";
    this.outputStorageKey = options.outputStorageKey || "mestre_v10_output_history";
    this.rootSelector = options.rootSelector || "body";
    this.lastTerminalOutput = options.lastTerminalOutput || "";
    this.onOutput = options.onOutput || null;
    this.onToast = options.onToast || null;

    this.selectedModel = this.defaultModel;
    this.conversation = [];
    this.attachments = [];
    this.activeMemoryIds = new Set();
    this.memoriesCache = [];
    this.memoriesDb = null;
    this.abortController = null;
    this.confirmResolver = null;
    this.outputHistory = [];
    this.voiceRecognition = null;
    this.isListening = false;

    this.headers = {
      "Content-Type": "application/json",
      "X-Mestre-Client": this.clientHeader,
    };

    this._ensureRoot();
    this._bindElements();
    this._bindEvents();
    this._restoreConversation();
    this._initMemoriesDb().then(() => this._loadMemories()).catch(() => this._loadMemories());
    this._loadOutputHistory();
  }

  _ensureRoot() {
    const existing = document.getElementById("mestreChatOverlay");
    if (existing) {
      this.root = existing.closest(".mestre-chat-root") || document.body;
      return;
    }
    this.root = document.querySelector(this.rootSelector) || document.body;
    const wrapper = document.createElement("div");
    wrapper.className = "mestre-chat-root";
    wrapper.innerHTML = TEMPLATE;
    this.root.appendChild(wrapper);
  }

  _bindElements() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      overlay: $("mestreChatOverlay"),
      close: $("mestreChatClose"),
      minimize: $("mestreChatMinimize"),
      header: document.querySelector(".mestre-chat-header"),
      status: $("mestreChatStatus"),
      modelSelect: $("mestreChatModelSelect"),
      tabs: document.querySelectorAll(".mestre-chat-tab"),
      tabBodies: document.querySelectorAll(".mestre-chat-tab-body"),
      messages: $("mestreChatMessages"),
      input: $("mestreChatInput"),
      sendBtn: $("mestreChatSendBtn"),
      stopBtn: $("mestreChatStopBtn"),
      attachFileBtn: $("mestreChatAttachFileBtn"),
      attachImageBtn: $("mestreChatAttachImageBtn"),
      voiceBtn: $("mestreChatVoiceBtn"),
      fileInput: $("mestreChatFileInput"),
      imageInput: $("mestreChatImageInput"),
      attachPanel: $("mestreChatAttachPanel"),
      attachList: $("mestreChatAttachList"),
      activeMemoryChips: $("mestreChatActiveMemoryChips"),
      memoriesList: $("mestreChatMemoriesList"),
      memoriesCount: $("mestreChatMemoriesCount"),
      newMemoryBtn: $("mestreChatNewMemoryBtn"),
      memoryEditor: $("mestreChatMemoryEditor"),
      memoryId: $("mestreChatMemoryId"),
      memoryTitle: $("mestreChatMemoryTitle"),
      memoryContent: $("mestreChatMemoryContent"),
      saveMemoryBtn: $("mestreChatSaveMemoryBtn"),
      cancelMemoryBtn: $("mestreChatCancelMemoryBtn"),
      confirmOverlay: $("mestreChatConfirmOverlay"),
      confirmModal: $("mestreChatConfirmModal"),
      confirmHead: $("mestreChatConfirmHead"),
      confirmReason: $("mestreChatConfirmReason"),
      confirmCode: $("mestreChatConfirmCode"),
      confirmMeta: $("mestreChatConfirmMeta"),
      confirmCancel: $("mestreChatConfirmCancel"),
      confirmOk: $("mestreChatConfirmOk"),
    };
  }

  _bindEvents() {
    this.el.close.addEventListener("click", () => this.close());
    this.el.minimize.addEventListener("click", () => this.toggleMinimize());
    this.el.header.addEventListener("click", (e) => {
      if (this.el.overlay.classList.contains("minimized") && !e.target.closest(".mestre-chat-close") && !e.target.closest(".mestre-chat-minimize")) {
        this.restore();
      }
    });
    this.el.sendBtn.addEventListener("click", () => this.send());
    this.el.stopBtn.addEventListener("click", () => this.stop());
    this.el.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.send();
      }
    });
    this.el.attachFileBtn.addEventListener("click", () => this.el.fileInput.click());
    this.el.attachImageBtn.addEventListener("click", () => this.el.imageInput.click());
    this.el.voiceBtn.addEventListener("click", () => this._toggleVoiceInput());
    this.el.fileInput.addEventListener("change", (e) => this._onFileSelected(e.currentTarget));
    this.el.imageInput.addEventListener("change", (e) => this._onImageSelected(e.currentTarget));

    this.el.tabs.forEach((tab) => {
      tab.addEventListener("click", () => this._switchTab(tab.dataset.tab));
    });

    this.el.modelSelect.addEventListener("change", () => {
      this.selectedModel = this.el.modelSelect.value;
    });

    document.querySelectorAll(".mestre-chat-toolbar button[data-attach]").forEach((btn) => {
      btn.addEventListener("click", () => this.attachContext(btn.dataset.attach));
    });

    document.querySelectorAll(".mestre-chat-toolbar button[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => this._runAction(btn.dataset.action));
    });

    this.el.newMemoryBtn.addEventListener("click", () => this._openMemoryEditor());
    this.el.saveMemoryBtn.addEventListener("click", () => this._saveMemory());
    this.el.cancelMemoryBtn.addEventListener("click", () => this._closeMemoryEditor());

    this.el.confirmCancel.addEventListener("click", () => this._resolveConfirm(false));
    this.el.confirmOk.addEventListener("click", () => this._resolveConfirm(true));
    this.el.overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
  }

  _switchTab(tabName) {
    this.el.tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tabName));
    this.el.tabBodies.forEach((b) => b.classList.toggle("active", b.dataset.tabBody === tabName));
    if (tabName === "memories") this._loadMemories();
    if (tabName === "chat") setTimeout(() => this.el.input.focus(), 50);
  }

  open() {
    this.el.overlay.classList.add("open");
    this.el.overlay.setAttribute("aria-hidden", "false");
    this.restore();
    this.el.input.focus();
    this._checkOllama().then(() => this._preloadModel()).catch(() => {});
    this._loadMemories();
  }

  close() {
    this.el.overlay.classList.remove("open");
    this.el.overlay.setAttribute("aria-hidden", "true");
  }

  toggleMinimize() {
    if (this.el.overlay.classList.contains("minimized")) {
      this.restore();
    } else {
      this.minimize();
    }
  }

  minimize() {
    this.el.overlay.classList.add("minimized");
    this.el.minimize.title = "Restaurar chat";
    this.el.minimize.textContent = "▣";
    try {
      localStorage.setItem("mestre_v10_chat_minimized", "1");
    } catch {}
  }

  restore() {
    this.el.overlay.classList.remove("minimized");
    this.el.minimize.title = "Minimizar chat";
    this.el.minimize.textContent = "▁";
    try {
      localStorage.removeItem("mestre_v10_chat_minimized");
    } catch {}
    setTimeout(() => this.el.input.focus(), 50);
  }

  toast(msg, type = "info") {
    if (this.onToast) {
      this.onToast(msg, type);
      return;
    }
    const t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText = `
      position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
      background: ${type === "error" ? "var(--danger)" : "var(--accent2)"};
      color: ${type === "error" ? "#fff" : "#000"}; padding: 12px 24px; border-radius: 50px;
      font-weight: bold; box-shadow: 0 8px 24px rgba(0,0,0,0.4); z-index: 99999;
      font-family: "Segoe UI", system-ui, sans-serif;
    `;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  _toggleVoiceInput() {
    if (this.isListening) {
      this.voiceRecognition?.stop();
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      this.toast("🎤 Seu navegador não oferece entrada por voz.", "warning");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = true;
    this.voiceRecognition = recognition;
    this.isListening = true;
    this.el.voiceBtn.classList.add("is-listening");
    this.el.voiceBtn.textContent = "⏹";
    this.el.voiceBtn.title = "Parar entrada por voz";
    this.el.status.textContent = "🎤 Ouvindo...";

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join("")
        .trim();
      if (transcript) this.el.input.value = transcript;
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        this.toast("🎤 Permita o acesso ao microfone para usar a entrada por voz.", "warning");
      } else if (event.error !== "aborted") {
        this.toast(`🎤 Falha na entrada por voz: ${event.error}`, "error");
      }
    };
    recognition.onend = () => {
      this.isListening = false;
      this.voiceRecognition = null;
      this.el.voiceBtn.classList.remove("is-listening");
      this.el.voiceBtn.textContent = "🎤";
      this.el.voiceBtn.title = "Falar mensagem";
      if (!this.abortController) this._checkOllama().catch(() => {});
      this.el.input.focus();
    };

    try {
      recognition.start();
    } catch (error) {
      recognition.onend = null;
      this.isListening = false;
      this.voiceRecognition = null;
      this.el.voiceBtn.classList.remove("is-listening");
      this.el.voiceBtn.textContent = "🎤";
      this.el.voiceBtn.title = "Falar mensagem";
      this.toast("🎤 Não foi possível iniciar o microfone: " + error.message, "error");
    }
  }

  async _request(path, options = {}) {
    const url = `${this.launcherUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...(options.headers || {}) },
      signal: options.signal,
    });
    return res;
  }

  async _checkOllama() {
    try {
      const res = await this._request("/ollama/tags", { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error("ollama offline");
      const data = await res.json();
      const models = (data.models || []).map((m) => m.name || m.model);
      if (models.length > 0) {
        this.selectedModel = OLLAMA_MODEL_PREFERENCES.find((m) => models.includes(m)) || models.find((m) => m.toLowerCase().includes("qwen")) || models[0];
        const options = models.map((model) => {
          const option = document.createElement("option");
          option.value = model;
          option.textContent = model;
          option.selected = model === this.selectedModel;
          return option;
        });
        this.el.modelSelect.replaceChildren(...options);
        this.el.status.textContent = "🟢 Conectado — Modelo: " + this.selectedModel;
        this.el.status.style.color = "var(--accent2)";
      } else {
        this.el.status.textContent = "🟡 Sem modelos. Execute: ollama pull qwen2.5-coder:3b-instruct";
        this.el.status.style.color = "#f0ad4e";
      }
    } catch {
      this.el.status.textContent = "🔴 Ollama offline — Execute 'ollama serve'";
      this.el.status.style.color = "var(--danger)";
    }
  }

  async _preloadModel() {
    if (!this.selectedModel) return;
    try {
      await this._request("/ollama/chat", {
        method: "POST",
        body: JSON.stringify({ model: this.selectedModel, keep_alive: "10m", messages: [], stream: false }),
      });
    } catch {}
  }

  _saveConversation() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.conversation.slice(-100)));
    } catch (e) {
      console.warn("Falha ao salvar conversa:", e);
    }
  }

  _restoreConversation() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      this.conversation = parsed;
      this.el.messages.innerHTML = "";
      for (const msg of this.conversation) {
        this._addMessage(msg.content, msg.role === "user" ? "user" : "ai", false);
      }
    } catch (e) {
      console.warn("Falha ao restaurar conversa:", e);
    }
  }

  _clearConversation() {
    this.conversation = [];
    localStorage.removeItem(this.storageKey);
    this.el.messages.innerHTML = '<div class="mestre-chat-msg ai">Olá! Sou o <strong>Mestre IA</strong>, seu assistente de manutenção do PC. 🖥️<br/>Me diga o que está acontecendo e eu sugiro os melhores comandos para resolver!</div>';
    this.toast("💬 Sessão de chat limpa", "info");
  }

  _addMessage(text, role, save = true) {
    const el = document.createElement("div");
    el.className = `mestre-chat-msg ${role}`;
    if (role === "user") {
      el.textContent = text;
    } else {
      this._renderMarkdown(el, text);
    }
    this.el.messages.appendChild(el);
    this._scrollToBottom();
    if (save) {
      this.conversation.push({ role, content: text });
      this._saveConversation();
    }
    return el;
  }

  _renderMarkdown(el, text) {
    let html = escapeHtml(text)
      .replace(/```(?:powershell)?\n?([\s\S]*?)```/g, (_, code) => {
        const safe = code.trim();
        return `<div class="ia-code-block"><pre>${safe}</pre><button class="ia-run-btn" data-cmd="${safe}">▶ Executar</button></div>`;
      })
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");
    el.innerHTML = html;
    el.querySelectorAll(".ia-run-btn").forEach((btn) => {
      btn.addEventListener("click", () => this._runAiCommand(btn.dataset.cmd));
    });
  }

  _scrollToBottom() {
    this.el.messages.scrollTop = this.el.messages.scrollHeight;
  }

  _showTyping() {
    const el = document.createElement("div");
    el.className = "mestre-chat-typing";
    el.id = "mestreChatTyping";
    el.innerHTML = "<span></span><span></span><span></span>";
    this.el.messages.appendChild(el);
    this._scrollToBottom();
    return el;
  }

  _buildContextPrompt(userMessage, imageCount = 0) {
    let extra = "";
    for (const a of this.attachments) {
      if (a.type === "image") continue;
      extra += `\n\n[${a.title}]\n${a.content}`;
    }
    const memoryExtras = [];
    if (this.activeMemoryIds.size > 0) {
      for (const mem of this.memoriesCache) {
        if (this.activeMemoryIds.has(mem.id)) {
          memoryExtras.push(`[Memória: ${mem.title}]\n${mem.content}`);
        }
      }
    }
    let result = userMessage;
    if (memoryExtras.length) {
      result += "\n\n---\nMemórias ativas para esta mensagem:\n\n" + memoryExtras.join("\n\n");
    }
    if (extra) {
      result += "\n\n---\nContexto local anexado:" + extra;
    }
    if (imageCount > 0) {
      result += `\n\n[${imageCount} imagem(ns) anexada(s) — analise-as se o modelo suportar visão]`;
    }
    return result;
  }

  async send() {
    if (this.abortController) {
      this.toast("⏳ Aguarde a resposta atual ou clique em Parar.", "warning");
      return;
    }
    const msg = this.el.input.value.trim();
    const imageAttachments = this.attachments.filter((a) => a.type === "image" && !a.used);
    if (!msg && imageAttachments.length === 0) return;

    const displayMsg = msg || (imageAttachments.length ? "[imagem anexada]" : "");
    this._addMessage(displayMsg, "user");
    this.el.input.value = "";

    const fullMessage = this._buildContextPrompt(msg, imageAttachments.length);
    const userPayload = { role: "user", content: fullMessage };
    if (imageAttachments.length > 0) {
      userPayload.images = imageAttachments.map((a) => a.base64);
    }
    this.conversation[this.conversation.length - 1].images = imageAttachments.map((a) => ({ name: a.name, mime: a.mime }));
    this._saveConversation();

    const messagesForApi = [
      { role: "system", content: this.systemPrompt },
      ...this.conversation.slice(-20).map((m, i, arr) => {
        const isLastUser = m.role === "user" && i === arr.length - 1;
        const out = { role: m.role };
        if (isLastUser) {
          out.content = fullMessage;
          if (userPayload.images) out.images = userPayload.images;
        } else {
          out.content = m.content;
        }
        return out;
      }),
    ];

    const result = await this._streamOllamaReply(messagesForApi);
    if (result.ok) {
      this.conversation.push({ role: "assistant", content: result.content });
      this._saveConversation();
      for (const a of this.attachments) {
        if (a.type === "image") a.used = true;
      }
      if (this.activeMemoryIds.size > 0) {
        this.activeMemoryIds.clear();
        this._renderActiveMemoryChips();
      }
    } else if (result.blocked) {
      this.conversation.pop();
      this._saveConversation();
    }
  }

  stop() {
    if (this.abortController) this.abortController.abort();
  }

  async _streamOllamaReply(messagesForApi) {
    this.el.sendBtn.style.display = "none";
    this.el.stopBtn.style.display = "";
    const typingEl = this._showTyping();
    this.abortController = new AbortController();
    let aiMsgEl = null;
    let fullResponse = "";
    let renderFrameId = null;
    const flushStreamRender = () => {
      if (renderFrameId !== null) cancelAnimationFrame(renderFrameId);
      renderFrameId = null;
      if (!aiMsgEl) return;
      this._renderMarkdown(aiMsgEl, fullResponse);
      this._scrollToBottom();
    };
    const scheduleStreamRender = () => {
      if (renderFrameId !== null) return;
      renderFrameId = requestAnimationFrame(flushStreamRender);
    };

    try {
      const res = await this._request("/ollama/chat", {
        method: "POST",
        body: JSON.stringify({
          model: this.selectedModel,
          messages: messagesForApi,
          stream: true,
          keep_alive: "10m",
        }),
        signal: this.abortController.signal,
      });

      if (res.status === 400) {
        typingEl.remove();
        const info = await res.json().catch(() => ({}));
        const pct = typeof info.score === "number" ? ` (score ${(info.score * 100).toFixed(0)}%)` : "";
        this._addMessage("🛡️ " + (info.error || "Mensagem bloqueada pelo filtro de segurança.") + pct, "ai");
        return { ok: false, blocked: true };
      }

      if (!res.ok || !res.body) throw new Error("Falha no proxy Ollama: HTTP " + res.status);

      typingEl.remove();
      aiMsgEl = this._addMessage("", "ai", false);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.message?.content) {
              fullResponse += json.message.content;
              scheduleStreamRender();
            }
          } catch {}
        }
      }

      if (pending.trim()) {
        try {
          const json = JSON.parse(pending);
          if (json.message?.content) {
            fullResponse += json.message.content;
          }
        } catch {}
      }

      flushStreamRender();
      this._addMessageActions(aiMsgEl, fullResponse);
      return { ok: true, content: fullResponse };
    } catch (err) {
      typingEl.remove();
      if (err.name === "AbortError") {
        if (aiMsgEl) this._renderMarkdown(aiMsgEl, fullResponse + "\n\n⏹ _interrompido pelo usuário_");
        else this._addMessage("⏹ Geração interrompida.", "ai");
        return { ok: false, aborted: true };
      }
      this._addMessage("❌ Erro ao conectar ao Ollama: " + err.message, "ai");
      return { ok: false, error: err };
    } finally {
      if (renderFrameId !== null) cancelAnimationFrame(renderFrameId);
      this.abortController = null;
      this.el.sendBtn.style.display = "";
      this.el.stopBtn.style.display = "none";
      this.el.input.focus();
    }
  }

  _addMessageActions(el, content) {
    const bar = document.createElement("div");
    bar.className = "mestre-chat-msg-actions";

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "📋 Copiar";
    copyBtn.addEventListener("click", () => {
      navigator.clipboard
        .writeText(content)
        .then(() => this.toast("📋 Resposta copiada", "info"))
        .catch(() => this.toast("⚠️ Não foi possível copiar", "warning"));
    });
    bar.appendChild(copyBtn);

    const regenBtn = document.createElement("button");
    regenBtn.textContent = "🔁 Regenerar";
    regenBtn.addEventListener("click", () => this._regenerate(el));
    bar.appendChild(regenBtn);

    el.appendChild(bar);
  }

  async _regenerate(el) {
    if (this.abortController) {
      this.toast("⏳ Aguarde a geração atual terminar.", "warning");
      return;
    }
    if (!this.conversation.length || this.conversation[this.conversation.length - 1].role !== "assistant") return;
    this.conversation.pop();
    this._saveConversation();
    el.remove();
    const messagesForApi = [
      { role: "system", content: this.systemPrompt },
      ...this.conversation.slice(-20).map((m) => ({ role: m.role, content: m.content })),
    ];
    const result = await this._streamOllamaReply(messagesForApi);
    if (result.ok) {
      this.conversation.push({ role: "assistant", content: result.content });
      this._saveConversation();
    }
  }

  async attachContext(type) {
    if (type === "dashboard") {
      try {
        const res = await this._request("/status", { signal: AbortSignal.timeout(3000) });
        const d = await res.json();
        const ramPct = d.ramTotal ? Math.round(100 - (d.ramFree / d.ramTotal) * 100) : 0;
        const preview = `CPU ${d.cpu ?? 0}% · RAM ${d.ramFree ?? 0}/${d.ramTotal ?? 0} GB · Disco ${d.diskFree ?? 0} GB livre`;
        const text = `Métricas atuais do PC:\n- CPU: ${d.cpu ?? 0}%\n- RAM livre: ${d.ramFree ?? 0} GB de ${d.ramTotal ?? 0} GB (${ramPct}% usada)\n- Disco C livre: ${d.diskFree ?? 0} GB\n- Uptime: ${fmtUptime(d.uptimeSec || 0)}`;
        this._addAttachment("dashboard", "Painel", preview, text);
      } catch {
        this.toast("Falha ao ler painel", "error");
      }
    } else if (type === "models") {
      try {
        const res = await this._request("/ollama/tags", { signal: AbortSignal.timeout(3000) });
        const data = await res.json();
        const models = (data.models || []).map((m) => m.name || m.model);
        const preview = `${models.length} modelos`;
        const text = `Modelos Ollama instalados:\n${models.join("\n") || "Nenhum"}`;
        this._addAttachment("models", "Modelos", preview, text);
      } catch {
        this.toast("Falha ao listar modelos", "error");
      }
    } else if (type === "memory") {
      try {
        const ps = `Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 15 Name,@{N="RAM(MB)";E={[math]::Round($_.WorkingSet64/1MB,2)}} | Format-Table -AutoSize`;
        const data = await this._dispatchCommand(ps, { timeoutMs: 15000 });
        const top = data.output || "";
        const res = await this._request("/status", { signal: AbortSignal.timeout(3000) });
        const d = await res.json();
        const preview = `RAM ${d.ramFree ?? 0}/${d.ramTotal ?? 0} GB · 15 processos`;
        const text = `Uso de memória:\n- RAM livre: ${d.ramFree ?? 0} GB de ${d.ramTotal ?? 0} GB\n- Top 15 processos por RAM:\n\n${top}`;
        this._addAttachment("memory", "Memória", preview, text);
      } catch {
        this.toast("Falha ao ler memória", "error");
      }
    } else if (type === "files") {
      this.el.fileInput.click();
    } else if (type === "terminal") {
      if (!this.lastTerminalOutput) {
        this.toast("Nenhum output de terminal ainda", "warning");
        return;
      }
      this._addAttachment("terminal", "Terminal", `output (${this.lastTerminalOutput.length} chars)`, `Último output do terminal:\n\n${this.lastTerminalOutput}`);
    } else if (type === "app") {
      try {
        const res = await this._request("/ping", { signal: AbortSignal.timeout(3000) });
        const d = await res.json();
        const info = `Informações do app Mestre do PC:\n- Status: ${d.status}\n- Versão: ${d.version || "?"}\n- PID: ${d.pid}\n- Jobs ativos: ${d.activeJobs}\n- Estado: ${d.state}\n- URL: ${this.launcherUrl}`;
        this._addAttachment("app", "App", `v${d.version || "?"} · PID ${d.pid}`, info);
      } catch {
        this.toast("Falha ao ler app", "error");
      }
    } else if (type === "image") {
      this.el.imageInput.click();
    }
  }

  async addMemory(title, content) {
    const now = Date.now();
    await this._saveMemoryToDb({ title, content, createdAt: now, updatedAt: now });
    await this._loadMemories();
  }

  _addAttachment(type, title, preview, content) {
    this.attachments = this.attachments.filter((a) => a.type !== type);
    this.attachments.push({ type, title, preview, content });
    this._renderAttachments();
    this.toast(`${title} anexado ao contexto`, "info");
  }

  _removeAttachment(index) {
    this.attachments.splice(index, 1);
    this._renderAttachments();
  }

  _clearAttachments() {
    this.attachments = [];
    this._renderAttachments();
    this.toast("Contextos limpos", "info");
  }

  _renderAttachments() {
    if (!this.attachments.length) {
      this.el.attachPanel.classList.remove("show");
      return;
    }
    this.el.attachPanel.classList.add("show");
    this.el.attachList.innerHTML = this.attachments
      .map((a, i) => {
        let icon = "📎";
        if (a.type === "dashboard") icon = "📊";
        if (a.type === "models") icon = "🤖";
        if (a.type === "memory") icon = "🧠";
        if (a.type === "files") icon = "📁";
        if (a.type === "terminal") icon = "🖥️";
        if (a.type === "app") icon = "🛡️";
        if (a.type === "image") icon = "🖼️";
        let extra = "";
        if (a.type === "image") extra = ` <img src="${a.dataUrl}" class="mestre-chat-image-preview" alt="" />`;
        return `<span class="mestre-chat-attach-chip active" title="${escapeHtml(a.title)}: ${escapeHtml(a.preview)}" data-index="${i}">${icon} ${escapeHtml(a.title)}${a.used ? " ✅" : ""} ✕${extra}</span>`;
      })
      .join("");
    this.el.attachList.querySelectorAll(".mestre-chat-attach-chip").forEach((chip) => {
      chip.addEventListener("click", () => this._removeAttachment(Number(chip.dataset.index)));
    });
  }

  _onFileSelected(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > MAX_CHAT_TEXT_FILE_BYTES) {
      this.toast("Arquivo muito grande. O limite para anexos de texto é 2 MB.", "error");
      input.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      const preview = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      this._addAttachment("files", file.name, preview, `Arquivo local "${file.name}":\n\n${text.slice(0, 12000)}${text.length > 12000 ? "\n\n[... arquivo truncado por limite de contexto ...]" : ""}`);
    };
    reader.onerror = () => this.toast("Falha ao ler arquivo", "error");
    reader.readAsText(file);
    input.value = "";
  }

  _onImageSelected(input) {
    const file = input.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      this.toast("Arquivo não é uma imagem", "error");
      input.value = "";
      return;
    }
    this._resizeImageToDataUrl(file, 1024, 0.8)
      .then((dataUrl) => {
        const base64 = dataUrl.split(",")[1];
        const preview = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        this.attachments.push({ type: "image", name: file.name, mime: file.type, dataUrl, base64, preview, title: file.name, used: false });
        this._renderAttachments();
        this.toast("🖼️ Imagem anexada", "info");
      })
      .catch((err) => this.toast("Erro ao processar imagem: " + err.message, "error"));
    input.value = "";
  }

  _resizeImageToDataUrl(file, maxSide = 1024, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          const ratio = Math.min(maxSide / width, maxSide / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
        const outQuality = file.type === "image/png" ? undefined : quality;
        resolve(canvas.toDataURL(outType, outQuality));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Não foi possível carregar a imagem"));
      };
      img.src = url;
    });
  }

  _runAction(action) {
    switch (action) {
      case "open-memories":
        window.open("acessar-memorias.html", "_blank");
        this.toast("🧠 Interface de memórias aberta em nova aba", "info");
        break;
      case "save-context":
        this._downloadChatContext();
        break;
      case "export-md":
        this._downloadChatMarkdown();
        break;
      case "clear-attachments":
        this._clearAttachments();
        break;
      case "clear-chat":
        this._clearConversation();
        break;
    }
  }

  async _runAiCommand(cmd) {
    if (!cmd) return;
    this.el.sendBtn.disabled = true;
    try {
      const verdict = await this._classifyCommand(cmd);
      if (!verdict.allowed) {
        const copy = await this._askCommandConfirmation({
          code: cmd,
          reason: "Comando fora da whitelist da V10 — não pode ser executado.",
          meta: verdict.reason || "Somente operações cadastradas em allowed-operations.json são executáveis.",
          okLabel: "Copiar comando",
        });
        if (copy) {
          try {
            await navigator.clipboard.writeText(cmd);
            this.toast("📋 Comando copiado.");
          } catch {
            this.toast("⚠️ Não foi possível copiar.", "warning");
          }
        }
        return;
      }

      const ok = await this._askCommandConfirmation({
        code: cmd,
        reason: verdict.destructive
          ? "Operação destrutiva sugerida pela IA. Revise antes de autorizar."
          : "Comando sugerido pela IA. Confirme antes de executar.",
        meta: [verdict.title, verdict.category].filter(Boolean).join(" • "),
      });
      if (!ok) return;

      const data = await this._dispatchCommand(cmd);
      const success = data.success === true && data.state === "completed";
      this._addOutputEntry(cmd, data.output || "", success);
      if (this.onOutput) this.onOutput(cmd, data.output || "", success);
      this.toast(success ? "✅ Comando concluído" : "❌ Comando falhou", success ? "info" : "error");
    } catch (err) {
      this.toast("❌ Erro: " + err.message, "error");
    } finally {
      this.el.sendBtn.disabled = false;
    }
  }

  async _classifyCommand(cmd) {
    try {
      const res = await this._request("/classify", {
        method: "POST",
        body: JSON.stringify({ cmd }),
        signal: AbortSignal.timeout(5000),
      });
      return await res.json();
    } catch (e) {
      return { allowed: false, destructive: false, reason: "Não foi possível falar com o launcher: " + e.message };
    }
  }

  async _dispatchCommand(cmd, options = {}) {
    const submitRes = await this._request("/run", {
      method: "POST",
      body: JSON.stringify({ cmd }),
      signal: AbortSignal.timeout(options.submitTimeoutMs || 10000),
    });
    const submitData = await submitRes.json();
    if (!submitRes.ok || submitData.success !== true || submitData.accepted !== true || submitData.jobId == null) {
      throw new Error(submitData.output || "Falha ao enviar o comando.");
    }
    const timeoutMs = options.timeoutMs || 900000;
    const pollIntervalMs = options.pollIntervalMs || 1200;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const statusRes = await this._request("/run-status?id=" + encodeURIComponent(submitData.jobId), {
        signal: AbortSignal.timeout(5000),
      });
      const statusData = await statusRes.json();
      if (statusData.state === "running") {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        continue;
      }
      return statusData;
    }
    throw new Error("Timeout aguardando a conclusão do comando.");
  }

  _askCommandConfirmation({ code, reason, meta = "", safe = false, okLabel = "Executar como Administrador" }) {
    return new Promise((resolve) => {
      this.confirmResolver = resolve;
      this.el.confirmReason.textContent = reason;
      this.el.confirmCode.textContent = code;
      this.el.confirmMeta.textContent = meta;
      this.el.confirmModal.classList.toggle("safe", safe);
      this.el.confirmOk.classList.toggle("safe", safe);
      this.el.confirmOk.textContent = okLabel;
      this.el.confirmOverlay.classList.add("open");
    });
  }

  _resolveConfirm(ok) {
    this.el.confirmOverlay.classList.remove("open");
    const resolve = this.confirmResolver;
    this.confirmResolver = null;
    if (resolve) resolve(ok);
  }

  // ===== Memórias =====

  async _initMemoriesDb() {
    if (this.memoriesDb) return this.memoriesDb;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("MestreDoPC_V10", 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        this.memoriesDb = req.result;
        resolve(this.memoriesDb);
      };
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("memories")) {
          db.createObjectStore("memories", { keyPath: "id", autoIncrement: true });
        }
      };
    });
  }

  async _getAllMemories() {
    try {
      const db = await this._initMemoriesDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("memories", "readonly");
        const store = tx.objectStore("memories");
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      try {
        const raw = localStorage.getItem(this.memoryStorageKey);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    }
  }

  async _saveMemoryToDb(memory) {
    try {
      const db = await this._initMemoriesDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("memories", "readwrite");
        const store = tx.objectStore("memories");
        const req = store.put(memory);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch {
      const list = await this._getAllMemories();
      if (memory.id) {
        const idx = list.findIndex((m) => m.id === memory.id);
        if (idx >= 0) list[idx] = memory;
        else list.push(memory);
      } else {
        memory.id = Date.now();
        list.push(memory);
      }
      localStorage.setItem(this.memoryStorageKey, JSON.stringify(list));
      return memory.id;
    }
  }

  async _deleteMemoryFromDb(id) {
    try {
      const db = await this._initMemoriesDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("memories", "readwrite");
        const store = tx.objectStore("memories");
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      const list = (await this._getAllMemories()).filter((m) => m.id !== id);
      localStorage.setItem(this.memoryStorageKey, JSON.stringify(list));
    }
  }

  async _loadMemories() {
    this.memoriesCache = await this._getAllMemories();
    this.memoriesCache.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    this.el.memoriesCount.textContent = `${this.memoriesCache.length} memória${this.memoriesCache.length === 1 ? "" : "s"}`;
    this._renderMemoriesList();
    this._renderActiveMemoryChips();
  }

  _renderMemoriesList() {
    if (!this.memoriesCache.length) {
      this.el.memoriesList.innerHTML = `<div class="mestre-chat-empty-state">Nenhuma memória salva ainda.<br/>Clique em <strong>Nova memória</strong> para criar uma.</div>`;
      return;
    }
    this.el.memoriesList.innerHTML = this.memoriesCache
      .map((m) => {
        const isActive = this.activeMemoryIds.has(m.id);
        return `<div class="mestre-chat-memory-card ${isActive ? "active" : ""}" data-id="${m.id}">
          <h4>${escapeHtml(m.title)}</h4>
          <p>${escapeHtml(m.content)}</p>
          <div class="mestre-chat-memory-card-actions">
            <button class="use ${isActive ? "active" : ""}" data-action="toggle" data-id="${m.id}">${isActive ? "✅ Usando" : "⚡ Usar agora"}</button>
            <button data-action="edit" data-id="${m.id}">✏️ Editar</button>
            <button data-action="delete" data-id="${m.id}">🗑️ Excluir</button>
          </div>
        </div>`;
      })
      .join("");
    this.el.memoriesList.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.id);
        const action = btn.dataset.action;
        if (action === "toggle") this._toggleActiveMemory(id);
        else if (action === "edit") this._openMemoryEditor(id);
        else if (action === "delete") this._deleteMemory(id);
      });
    });
  }

  _renderActiveMemoryChips() {
    const active = this.memoriesCache.filter((m) => this.activeMemoryIds.has(m.id));
    if (!active.length) {
      this.el.activeMemoryChips.innerHTML = "";
      return;
    }
    this.el.activeMemoryChips.innerHTML = active
      .map((m) => `<span class="mestre-chat-memory-chip">🧠 ${escapeHtml(m.title)} <button data-id="${m.id}">✕</button></span>`)
      .join("");
    this.el.activeMemoryChips.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => this._toggleActiveMemory(Number(btn.dataset.id)));
    });
  }

  _openMemoryEditor(id = null) {
    const mem = id ? this.memoriesCache.find((m) => m.id === id) : null;
    this.el.memoryId.value = mem ? mem.id : "";
    this.el.memoryTitle.value = mem ? mem.title : "";
    this.el.memoryContent.value = mem ? mem.content : "";
    this.el.memoryEditor.classList.add("open");
    setTimeout(() => this.el.memoryTitle.focus(), 50);
  }

  _closeMemoryEditor() {
    this.el.memoryEditor.classList.remove("open");
  }

  async _saveMemory() {
    const idRaw = this.el.memoryId.value;
    const title = this.el.memoryTitle.value.trim();
    const content = this.el.memoryContent.value.trim();
    if (!title || !content) {
      this.toast("Preencha título e conteúdo", "warning");
      return;
    }
    const now = Date.now();
    const memory = { title, content, updatedAt: now };
    if (idRaw) memory.id = Number(idRaw);
    else memory.createdAt = now;
    await this._saveMemoryToDb(memory);
    this._closeMemoryEditor();
    await this._loadMemories();
    this.toast("💾 Memória salva", "info");
  }

  async _deleteMemory(id) {
    if (!confirm("Tem certeza que deseja excluir esta memória?")) return;
    this.activeMemoryIds.delete(id);
    await this._deleteMemoryFromDb(id);
    await this._loadMemories();
    this.toast("🗑️ Memória excluída", "info");
  }

  _toggleActiveMemory(id) {
    if (this.activeMemoryIds.has(id)) this.activeMemoryIds.delete(id);
    else this.activeMemoryIds.add(id);
    this._renderMemoriesList();
    this._renderActiveMemoryChips();
    if (this._currentTab() === "chat") {
      this.toast(this.activeMemoryIds.has(id) ? "🧠 Memória ativada para a próxima mensagem" : "Memória desativada", "info");
    }
  }

  _currentTab() {
    const active = document.querySelector(".mestre-chat-tab.active");
    return active ? active.dataset.tab : "chat";
  }

  // ===== Output / Historico =====

  _loadOutputHistory() {
    try {
      const raw = localStorage.getItem(this.outputStorageKey);
      this.outputHistory = raw ? JSON.parse(raw) : [];
    } catch {
      this.outputHistory = [];
    }
  }

  _saveOutputHistory() {
    try {
      localStorage.setItem(this.outputStorageKey, JSON.stringify(this.outputHistory.slice(-100)));
    } catch (e) {
      console.warn("Falha ao salvar histórico de outputs:", e);
    }
  }

  _addOutputEntry(cmd, output, success) {
    const entry = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      cmd: cmd || "",
      output: output || "",
      success: success === true,
      date: new Date().toISOString(),
    };
    this.outputHistory.push(entry);
    this._saveOutputHistory();
  }

  // ===== Exportacoes =====

  _downloadChatMarkdown() {
    if (!this.conversation.length) {
      this.toast("⚠️ Chat vazio — nada para exportar", "warning");
      return;
    }
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    let md = `# 💬 Conversa — Mestre IA (Ollama)\n\n`;
    md += `**Data:** ${d.toLocaleString("pt-BR")}\n`;
    md += `**Modelo:** ${this.selectedModel}\n`;
    md += `**Mensagens:** ${this.conversation.length}\n\n---\n\n`;
    for (const m of this.conversation) {
      const who = m.role === "user" ? "👤 **Você**" : "🤖 **Mestre IA**";
      md += `${who}:\n\n${m.content}\n\n---\n\n`;
    }
    this._downloadBlob(md, "text/markdown", `mestre-chat-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}.md`);
    this.toast("📥 Chat baixado em Markdown", "info");
  }

  _downloadChatContext() {
    const activeMemories = this.memoriesCache.filter((m) => this.activeMemoryIds.has(m.id));
    const payload = {
      app: "Mestre do PC V10/V11",
      date: new Date().toISOString(),
      model: this.selectedModel,
      messages: this.conversation,
      attachments: this.attachments.map((a) => ({ type: a.type, title: a.title, preview: a.preview, content: a.type === "image" ? a.dataUrl : a.content, used: a.used })),
      activeMemories: activeMemories.map((m) => ({ id: m.id, title: m.title, content: m.content })),
    };
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    this._downloadBlob(JSON.stringify(payload, null, 2), "application/json", `mestre-contexto-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.json`);
    this.toast("💾 Contexto baixado", "info");
  }

  _downloadBlob(content, mime, filename) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }
}

/**
 * Inicializa o chat no DOM.
 * @param {object} options
 * @param {string} options.rootSelector — selector do container (default: body)
 * @param {string} options.launcherUrl — URL do launcher (default: mesma origem ou 127.0.0.1:7777)
 * @param {string} options.clientHeader — valor do header X-Mestre-Client (default: v10-web)
 * @param {string} options.systemPrompt — system prompt customizado
 * @param {string} options.defaultModel — modelo padrao
 * @param {function} options.onOutput — callback(cmd, output, success) quando comando e executado
 * @param {function} options.onToast — callback(msg, type) para notificacoes
 * @returns {MestreChat} instancia do chat
 */
export function initChat(options = {}) {
  return new MestreChat(options);
}

export { DEFAULT_SYSTEM_PROMPT };

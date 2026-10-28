(() => {
  const SETTINGS_KEY = "mestre_mobile_settings";
  const FAV_KEY = "mestre_mobile_favs";
  const RECENT_KEY = "mestre_mobile_recent";
  const PAGE_SIZE = 40;
  const CLOUD_MODELS = ["gcli/grok-4.7-build-fast", "qwen2.5-coder:3b-instruct"];
  const PRESETS = [
    { id: "desktop", label: "PC Desktop", detail: "DESKTOP-O7T3I00" },
    { id: "vps", label: "VPS", detail: "72.62.11.116" },
    { id: "router", label: "9Router", detail: ":20128" },
  ];
  const DECK = [
    { icon: "🚀", label: "Otimizar RAM Agora", ids: ["liberar_memoria_ram_imediatamente"] },
    { icon: "🧹", label: "Limpar Temp Usuário & Windows", ids: ["limpar_temp_usuario", "limpar_temp_do_windows"], destructive: true },
    { icon: "🗑️", label: "Esvaziar Lixeira", ids: ["esvaziar_lixeira"], destructive: true },
    { icon: "🌐", label: "Flush DNS", ids: ["limpar_cache_dns"] },
    { icon: "⚡", label: "Speedtest Rápido", ids: ["rede_speedtest_mini"] },
    { icon: "🔄", label: "Sincronizar Memórias", action: "sync" },
  ];
  const VPS_APPS = [
    ["chat-ia", "https://chat-ia.72-62-11-116.sslip.io"],
    ["homeovet-app", "https://homeovet-app.72-62-11-116.sslip.io"],
    ["ia-oportunidades", "https://ia-oportunidades.72-62-11-116.sslip.io"],
    ["nexolab", "https://nexolab.72-62-11-116.sslip.io"],
    ["nexus", "https://nexus.72-62-11-116.sslip.io"],
    ["vitrine-de-apps", "https://vitrine-de-apps.72-62-11-116.sslip.io"],
    ["n8n", "https://n8n.72-62-11-116.sslip.io"],
    ["paperclip", "https://paperclip.72-62-11-116.sslip.io"],
  ];
  const VPS_SERVICES = [
    { name: "MySQL", port: 32768, kind: "tcp" },
    { name: "PostgreSQL", port: 32769, kind: "tcp" },
    { name: "Adminer", port: 32771, kind: "http" },
    { name: "Ollama", port: 11434, kind: "http", path: "/api/tags" },
    { name: "Nexus-Terminal", port: 3100, kind: "http" },
    { name: "Hermes API", port: 8642, kind: "http" },
    { name: "n8n", port: 5677, kind: "http" },
    { name: "9Router Proxy", port: 20128, kind: "http", path: "/v1/models" },
  ];
  const SYSTEM_PROMPT = [
    "Você é o Mestre do PC no celular. Responda em português, curto e direto.",
    "Regra de evidência: use [confirmado] só para dados presentes na conversa e [inferência] para hipótese.",
    "Não invente métricas. Se faltar leitura, diga isso.",
    "Não peça para contornar a whitelist. Operações destrutivas são confirmadas na interface.",
  ].join(" ");

  const $ = (id) => document.getElementById(id);
  const state = {
    tab: "home",
    sub: "architect",
    settings: loadSettings(),
    favs: new Set(readJson(FAV_KEY, [])),
    recent: readJson(RECENT_KEY, []),
    ops: [],
    categorias: [],
    filter: "todas",
    search: "",
    shown: PAGE_SIZE,
    opsOffline: false,
    messages: [],
    conversas: {},
    streaming: false,
    chatAbort: null,
    masterPrompt: "",
    memories: [],
    install: null,
    recognition: null,
  };

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function detectedDesktop() {
    const host = location.hostname;
    const staticHost = host.endsWith("github.io") || host.endsWith("pages.dev");
    if (location.protocol.startsWith("http") && !staticHost) return location.origin;
    return "http://127.0.0.1:7777";
  }

  function loadSettings() {
    const defaults = {
      targetId: "desktop",
      targets: {
        desktop: detectedDesktop(),
        vps: "http://72.62.11.116:7777",
        router: "http://127.0.0.1:20128",
      },
      model: "qwen2.5-coder:3b-instruct",
      speak: false,
      autoSend: false,
      mobileToken: "",
    };
    const saved = readJson(SETTINGS_KEY, null);
    if (!saved || typeof saved !== "object") return defaults;
    return {
      ...defaults,
      ...saved,
      targets: { ...defaults.targets, ...(saved.targets || {}) },
    };
  }

  function saveSettings() {
    const copy = { ...state.settings, mobileToken: state.settings.mobileToken || "" };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(copy));
    idbSet("settings", copy);
  }

  function apiBase() {
    return String(state.settings.targets[state.settings.targetId] || detectedDesktop()).replace(/\/+$/, "");
  }

  function isRouterTarget() {
    if (state.settings.targetId === "router") return true;
    try { return new URL(apiBase()).port === "20128"; } catch { return false; }
  }

  let dbPromise;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) return reject(new Error("indexedDB indisponível"));
        const request = indexedDB.open("mestre-mobile-v11", 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("kv")) request.result.createObjectStore("kv");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return dbPromise;
  }

  async function idbSet(key, value) {
    try {
      const database = await db();
      await new Promise((resolve, reject) => {
        const tx = database.transaction("kv", "readwrite");
        tx.objectStore("kv").put(value, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch { /* localStorage permanece como cache */ }
  }

  async function idbGet(key) {
    try {
      const database = await db();
      return await new Promise((resolve, reject) => {
        const request = database.transaction("kv", "readonly").objectStore("kv").get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return undefined;
    }
  }

  function toast(message) {
    const node = $("toast");
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { node.hidden = true; }, 3200);
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function api(path, { method = "GET", body, timeout = 15000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(apiBase() + path, {
        method,
        signal: controller.signal,
        cache: "no-store",
        headers: {
          "X-Mestre-Client": "v10-web",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(state.settings.mobileToken ? { "X-Mestre-Mobile-Token": state.settings.mobileToken } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const latency = Math.round(performance.now() - (api.started || performance.now()));
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
      if (!response.ok) {
        const error = new Error((data && (data.error || data.output)) || text || `HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return { data, response, latencyMs: latency };
    } finally {
      clearTimeout(timer);
    }
  }

  async function timed(path) {
    const started = performance.now();
    api.started = started;
    const result = await api(path, { timeout: 8000 });
    result.latencyMs = Math.round(performance.now() - started);
    return result;
  }

  function renderTargets() {
    const host = $("target-switch");
    host.replaceChildren();
    for (const preset of PRESETS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = preset.id === state.settings.targetId ? "active" : "";
      button.setAttribute("aria-pressed", preset.id === state.settings.targetId ? "true" : "false");
      const name = document.createElement("strong");
      name.textContent = preset.label;
      const detail = document.createElement("small");
      detail.textContent = preset.detail;
      button.append(name, detail);
      button.addEventListener("click", () => {
        state.settings.targetId = preset.id;
        saveSettings();
        renderTargets();
        refreshActive();
      });
      host.append(button);
    }
    const preset = PRESETS.find((item) => item.id === state.settings.targetId);
    const auto = state.settings.targetId === "desktop" && apiBase() === location.origin;
    $("endpoint-hint").textContent = `${preset.detail} · ${apiBase()}${auto ? " · detectado neste servidor" : ""}`;
    $("endpoint-url").value = apiBase();
    $("endpoint-token").value = state.settings.mobileToken || "";
    const endpoint = apiBase();
    if (state.chatEndpoint && state.chatEndpoint !== endpoint) {
      if (state.chatAbort) state.chatAbort.abort();
      state.messages = [];
      const box = $("messages");
      if (box) box.replaceChildren();
    }
    state.chatEndpoint = endpoint;
    const desktop = $("desktop-link");
    desktop.href = `${apiBase()}/?desktop=1`;
  }

  function setGauge(id, valueNode, percent, text) {
    const gauge = $(id);
    const safe = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
    gauge.style.setProperty("--p", String(safe));
    gauge.classList.toggle("warn", safe >= 70 && safe < 85);
    gauge.classList.toggle("hot", safe >= 85);
    $(valueNode).textContent = text;
  }

  function renderDeck() {
    const root = $("deck");
    root.replaceChildren();
    for (const item of DECK) {
      const button = document.createElement("button");
      button.type = "button";
      const icon = document.createElement("span");
      icon.textContent = item.icon;
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("strong");
      label.textContent = item.label;
      button.append(icon, label);
      button.addEventListener("click", () => executeDeck(item));
      root.append(button);
    }
  }

  async function refreshHome() {
    $("updated").textContent = "lendo…";
    let latency = null;
    let ping = null;
    let status = null;
    let brain = null;
    try {
      const result = await timed("/ping");
      ping = result.data;
      latency = result.latencyMs;
    } catch { ping = null; }
    try { status = (await api("/status", { timeout: 8000 })).data; } catch { status = null; }
    try {
      if (isRouterTarget()) brain = (await api("/v1/models", { timeout: 6000 })).data;
      else brain = (await api("/ollama/tags", { timeout: 6000 })).data;
    } catch { brain = null; }

    if (status && Number.isFinite(Number(status.cpu))) {
      const cpu = Number(status.cpu);
      setGauge("g-cpu", "cpu-value", cpu, `${Math.round(cpu)}%`);
    } else setGauge("g-cpu", "cpu-value", 0, "--");

    if (status && Number(status.ramTotal) > 0) {
      const total = Number(status.ramTotal);
      const free = Number(status.ramFree);
      const used = Math.max(0, total - free);
      setGauge("g-ram", "ram-value", (used / total) * 100, `${used.toFixed(1)}`);
      $("ram-detail").textContent = `RAM ${used.toFixed(1)} GB usada · ${free.toFixed(1)} GB livre · ${total.toFixed(1)} GB total`;
    } else {
      setGauge("g-ram", "ram-value", 0, "--");
      $("ram-detail").textContent = "RAM indisponível neste alvo";
    }

    if (status && (Number(status.diskUsed) > 0 || Number(status.diskFree) > 0)) {
      const used = Number(status.diskUsed);
      const free = Number(status.diskFree);
      const total = used + free;
      setGauge("g-disk", "disk-value", total ? (used / total) * 100 : 0, `${free.toFixed(0)}`);
      $("disk-detail").textContent = `Disco C: ${used.toFixed(1)} GB usados · ${free.toFixed(1)} GB livres`;
    } else {
      setGauge("g-disk", "disk-value", 0, "--");
      $("disk-detail").textContent = "Disco C: sem leitura";
    }

    setGauge("g-lat", "lat-value", latency == null ? 0 : Math.min(100, latency / 10), latency == null ? "--" : `${latency}`);
    const net = $("net-pill");
    net.className = "pill";
    net.textContent = ping ? `Rede ${ping.state || "ok"} · ${latency} ms` : "Rede sem resposta";
    net.classList.add(ping ? "ok" : "bad");

    const brainPill = $("ollama-pill");
    brainPill.className = "pill";
    const listed = brain && (Array.isArray(brain.models) ? brain.models : Array.isArray(brain.data) ? brain.data : []);
    const modelCount = listed ? listed.length : 0;
    if (brain) {
      brainPill.textContent = isRouterTarget() ? `9Router · ${modelCount} modelo(s)` : `Ollama · ${modelCount} modelo(s)`;
      brainPill.classList.add("ok");
    } else {
      brainPill.textContent = isRouterTarget() ? "9Router sem resposta" : "Ollama / 9Router sem resposta";
      brainPill.classList.add("bad");
    }

    const admin = $("admin-pill");
    admin.className = "pill";
    if (!ping) {
      admin.textContent = "Sessão offline";
      admin.classList.add("bad");
    } else {
      admin.textContent = ping.admin ? "Elevado" : "Usuário comum";
      admin.classList.add(ping.admin ? "ok" : "wait");
    }
    const clock = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    $("updated").textContent = status || ping ? `atualizado ${clock}` : "sem telemetria neste alvo";
    state.lastStatus = status;
  }

  function showLive(title, text) {
    $("live-title").textContent = title;
    $("live-pre").textContent = text || "Aguardando saída…";
    $("live-log").hidden = false;
  }

  async function pollJob(jobId, title) {
    const started = Date.now();
    let last = "";
    while (Date.now() - started < 180000) {
      const { data } = await api(`/run-status?id=${encodeURIComponent(jobId)}`, { timeout: 8000 });
      if ((data.output || "") !== last) {
        last = data.output || "";
        showLive(title, last || "Executando…");
      }
      if (data.done || data.state === "timed_out") return data;
      await wait(700);
    }
    throw new Error("Tempo esgotado aguardando a operação.");
  }

  async function runIds(ids, title, destructive, detail) {
    if (destructive) {
      const confirmed = await openSheet({
        title,
        body: detail || "Essa ação altera o Windows. Confirme só se o PC alvo for o que você está vendo no endpoint.",
        okLabel: "Executar",
        danger: true,
      });
      if (!confirmed) return;
    }
    showLive(title, "Enviando…");
    const chunks = [];
    for (const id of ids) {
      const { data } = await api("/run", { method: "POST", body: { id }, timeout: 20000 });
      if (!data.jobId) throw new Error(data.output || "O launcher não aceitou a operação.");
      const job = await pollJob(data.jobId, title);
      chunks.push(`# ${id}\n${job.output || "(sem saída)"}`);
      showLive(title, chunks.join("\n\n"));
      pushRecent({ id, title, at: Date.now(), ok: job.success !== false && job.state !== "timed_out" });
    }
    toast(`${title} concluído`);
  }

  async function executeDeck(item) {
    try {
      if (item.action === "sync") {
        await syncMemories();
        return;
      }
      await runIds(item.ids, item.label, !!item.destructive);
    } catch (error) {
      toast(error.message || "Falha ao executar");
      showLive(item.label, error.message || "Falha");
    }
  }

  function pushRecent(entry) {
    state.recent = [entry, ...state.recent.filter((item) => item.id !== entry.id)].slice(0, 20);
    localStorage.setItem(RECENT_KEY, JSON.stringify(state.recent));
    idbSet("recent", state.recent);
    if (state.tab === "commands" && state.filter === "recentes") renderCommands();
  }

  function saveFavs() {
    const list = [...state.favs];
    localStorage.setItem(FAV_KEY, JSON.stringify(list));
    idbSet("favs", list);
  }

  async function loadOperations() {
    try {
      const { data } = await api("/operations");
      state.ops = data.operations || [];
      state.categorias = data.categorias || [];
      state.opsOffline = false;
      await idbSet("operations", { operations: state.ops, categorias: state.categorias });
    } catch (error) {
      const cached = await idbGet("operations");
      if (cached && Array.isArray(cached.operations)) {
        state.ops = cached.operations;
        state.categorias = cached.categorias || [];
        state.opsOffline = true;
      }
      toast(error.message || "Catálogo indisponível");
    }
    renderCommands();
  }

  function filteredOps() {
    const query = state.search.trim().toLowerCase();
    return state.ops.filter((op) => {
      if (state.filter === "favoritos" && !state.favs.has(op.id)) return false;
      if (state.filter !== "todas" && state.filter !== "favoritos" && state.filter !== "recentes" && op.category !== state.filter) return false;
      if (!query) return true;
      return [op.title, op.id, op.category, op.description].join(" ").toLowerCase().includes(query);
    });
  }

  function renderCommands() {
    $("cmd-offline").hidden = !state.opsOffline;
    const chips = $("cmd-chips");
    chips.replaceChildren();
    const filters = ["todas", "favoritos", "recentes", ...state.categorias];
    for (const name of filters) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = name === "todas" ? "Todas" : name === "favoritos" ? "⭐ Favoritos" : name === "recentes" ? "Recentes" : name;
      button.className = state.filter === name ? "active" : "";
      button.addEventListener("click", () => {
        state.filter = name;
        state.shown = PAGE_SIZE;
        renderCommands();
      });
      chips.append(button);
    }

    const list = $("cmd-list");
    list.replaceChildren();
    if (state.filter === "recentes") {
      renderRecent(list);
      $("cmd-count").textContent = `${state.recent.length} recente(s)`;
      $("cmd-more").hidden = true;
      return;
    }
    const ops = filteredOps();
    $("cmd-count").textContent = `${ops.length} operação(ões)`;
    const slice = ops.slice(0, state.shown);
    if (!slice.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = state.ops.length ? "Nada com esse filtro." : "Catálogo ainda não carregou.";
      list.append(empty);
    }
    for (const op of slice) list.append(operationCard(op));
    $("cmd-more").hidden = slice.length >= ops.length;
  }

  function renderRecent(list) {
    if (!state.recent.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "Nenhuma execução nesta sessão do aparelho.";
      list.append(empty);
      return;
    }
    for (const item of state.recent) {
      const card = document.createElement("article");
      card.className = "card";
      const copy = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = item.title || item.id;
      const meta = document.createElement("p");
      meta.textContent = `${item.ok ? "concluída" : "com falha"} · ${new Date(item.at).toLocaleString("pt-BR")}`;
      copy.append(title, meta);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "De novo";
      button.addEventListener("click", () => {
        const op = state.ops.find((entry) => entry.id === item.id);
        runOperation(op || { id: item.id, title: item.title, destructive: true, type: "operation" });
      });
      card.append(copy, button);
      list.append(card);
    }
  }

  function operationCard(op) {
    const card = document.createElement("article");
    card.className = "op";
    const star = document.createElement("button");
    star.type = "button";
    star.textContent = state.favs.has(op.id) ? "⭐" : "☆";
    star.setAttribute("aria-label", "Favorito");
    star.addEventListener("click", () => {
      if (state.favs.has(op.id)) state.favs.delete(op.id);
      else state.favs.add(op.id);
      saveFavs();
      renderCommands();
    });
    const copy = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = op.title || op.id;
    const description = document.createElement("p");
    description.textContent = op.description || op.category || op.id;
    const meta = document.createElement("div");
    meta.className = "meta";
    const badge = document.createElement("span");
    badge.className = op.destructive ? "badge bad" : "badge ok";
    badge.textContent = op.enabled === false ? "inativa" : op.destructive ? "destrutiva" : "segura";
    const category = document.createElement("span");
    category.className = "badge";
    category.textContent = op.category || "Geral";
    meta.append(badge, category);
    copy.append(title, description, meta);
    const run = document.createElement("button");
    run.type = "button";
    run.textContent = "Executar";
    run.disabled = op.enabled === false;
    if (op.destructive) run.className = "danger";
    run.addEventListener("click", () => runOperation(op));
    card.append(star, copy, run);
    return card;
  }

  async function runOperation(op) {
    try {
      if (op.type === "template" && op.params && Object.keys(op.params).length) {
        const params = await openSheet({
          title: op.title || op.id,
          body: "Preencha os parâmetros permitidos pela whitelist.",
          okLabel: "Executar",
          danger: !!op.destructive,
          fields: Object.keys(op.params).map((name) => ({ name, label: name })),
        });
        if (!params) return;
        showLive(op.title || op.id, "Enviando…");
        const { data } = await api("/run", { method: "POST", body: { id: op.id, params }, timeout: 20000 });
        if (!data.jobId) throw new Error(data.output || "O launcher não aceitou a operação.");
        const job = await pollJob(data.jobId, op.title || op.id);
        pushRecent({ id: op.id, title: op.title, at: Date.now(), ok: job.success !== false && job.state !== "timed_out" });
        toast(`${op.title || op.id} concluído`);
        return;
      }
      await runIds([op.id], op.title || op.id, !!op.destructive, op.description);
    } catch (error) {
      toast(error.message || "Falha ao executar");
      showLive(op.title || op.id, error.message || "Falha");
    }
  }

  function addBubble(role, text) {
    const item = document.createElement("article");
    item.className = `bubble ${role}`;
    const who = document.createElement("span");
    who.textContent = role === "user" ? "Você" : role === "assistant" ? "Mestre" : "Sistema";
    const body = document.createElement("p");
    body.textContent = text;
    item.append(who, body);
    $("messages").append(item);
    item.scrollIntoView({ block: "end" });
    return body;
  }

  function renderModels() {
    const select = $("model");
    const current = state.settings.model;
    const names = [...new Set([current, ...CLOUD_MODELS, ...(state.models || [])])];
    select.replaceChildren();
    for (const name of names) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      if (name === current) option.selected = true;
      select.append(option);
    }
  }

  async function loadModels() {
    const found = [];
    try {
      if (isRouterTarget()) {
        const { data } = await api("/v1/models", { timeout: 8000 });
        for (const item of data.data || []) if (item.id) found.push(item.id);
      } else {
        const { data } = await api("/ollama/tags", { timeout: 8000 });
        for (const item of data.models || []) if (item.name) found.push(item.name);
      }
    } catch { /* a lista local continua disponível */ }
    state.models = found;
    renderModels();
  }

  async function loadChatMeta() {
    try {
      const [tools, skills] = await Promise.all([
        api("/api/tools", { timeout: 8000 }),
        api("/api/skills", { timeout: 8000 }),
      ]);
      $("chat-meta").textContent = `${tools.data.total || 0} ferramentas · ${skills.data.total || 0} skills`;
    } catch {
      $("chat-meta").textContent = "Chat no endpoint configurado. Ferramentas locais indisponíveis agora.";
    }
  }

  function conversaKey() {
    return apiBase();
  }

  async function ensureConversa() {
    const key = conversaKey();
    if (state.conversas[key]) return state.conversas[key];
    try {
      const { data } = await api("/api/conversas", {
        method: "POST",
        body: { titulo: "Mobile V11", modelo: state.settings.model },
      });
      state.conversas[key] = data.id || null;
    } catch {
      state.conversas[key] = null;
    }
    return state.conversas[key];
  }

  async function persistMessage(role, content) {
    const id = await ensureConversa();
    if (!id) return;
    try {
      await api(`/api/conversas/${encodeURIComponent(id)}/msg`, {
        method: "POST",
        body: { role, content },
      });
    } catch { /* a conversa local continua na tela */ }
  }

  function chatAttempts() {
    if (isRouterTarget()) {
      return [
        { url: `${apiBase()}/v1/chat/completions`, flavor: "openai" },
        { url: `${apiBase()}/api/chat`, flavor: "ollama" },
      ];
    }
    return [{ url: `${apiBase()}/ollama/chat`, flavor: "ollama" }];
  }

  async function readStream(response, flavor, onDelta) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
        if (payload === "[DONE]") continue;
        let chunk;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }
        if (chunk && chunk.error) {
          const detail = typeof chunk.error === "string"
            ? chunk.error
            : (chunk.error.message || "Erro no streaming do chat");
          const streamError = new Error(detail);
          streamError.streamError = true;
          throw streamError;
        }
        const delta = flavor === "openai"
          ? (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) || ""
          : (chunk.message && chunk.message.content) || chunk.response || "";
        if (delta) {
          full += delta;
          onDelta(full);
        }
      }
    }
    return full;
  }

  async function streamChat(messages, onDelta) {
    let lastError = new Error("Chat indisponível");
    for (const attempt of chatAttempts()) {
      state.chatAbort = new AbortController();
      try {
        const response = await fetch(attempt.url, {
          method: "POST",
          signal: state.chatAbort.signal,
          headers: {
            "Content-Type": "application/json",
            "X-Mestre-Client": "v10-web",
            ...(state.settings.mobileToken ? { "X-Mestre-Mobile-Token": state.settings.mobileToken } : {}),
          },
          body: JSON.stringify(attempt.flavor === "openai"
            ? { model: state.settings.model, messages, stream: true }
            : { model: state.settings.model, messages, stream: true }),
        });
        if (!response.ok) {
          const text = await response.text();
          const error = new Error(text.slice(0, 180) || `HTTP ${response.status}`);
          error.status = response.status;
          throw error;
        }
        return await readStream(response, attempt.flavor, onDelta);
      } catch (error) {
        if (error.name === "AbortError" || error.streamError) throw error;
        lastError = error;
        if (error.status && error.status !== 404 && error.status !== 405) throw error;
      }
    }
    throw lastError;
  }

  async function sendChat(text) {
    const content = text.trim();
    if (!content || state.streaming) return;
    $("chat-input").value = "";
    state.messages.push({ role: "user", content });
    addBubble("user", content);
    persistMessage("user", content);
    const bubble = addBubble("assistant", "…");
    state.streaming = true;
    $("send").textContent = "Parar";
    try {
      const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...state.messages.slice(-12)];
      const answer = await streamChat(messages, (partial) => { bubble.textContent = partial; });
      const finalText = answer || "(sem resposta)";
      bubble.textContent = finalText;
      state.messages.push({ role: "assistant", content: finalText });
      persistMessage("assistant", finalText);
      if (state.settings.speak) speak(finalText);
    } catch (error) {
      const message = error.name === "AbortError" ? "Geração interrompida." : (error.message || "Falha no chat");
      const partial = bubble.textContent && bubble.textContent !== "…" ? bubble.textContent : "";
      bubble.textContent = partial ? `${partial}\n\n${message}` : message;
      addBubble("system", message);
    } finally {
      state.streaming = false;
      state.chatAbort = null;
      $("send").textContent = "Enviar";
    }
  }

  function speak(text) {
    if (!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 400));
    utterance.lang = "pt-BR";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function renderChips() {
    const root = $("chips");
    const chips = [
      { label: "/arquiteto-de-prompts", run: () => showTab("prompts") },
      { label: "Status do PC", run: () => sendChat(statusPrompt()) },
      { label: "Otimizar RAM", run: () => executeDeck(DECK[0]) },
      { label: "Resumo da VPS", run: () => sendChat(vpsPrompt()) },
    ];
    root.replaceChildren();
    for (const chip of chips) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = chip.label;
      button.addEventListener("click", () => chip.run());
      root.append(button);
    }
  }

  function statusPrompt() {
    const status = state.lastStatus;
    const reading = status
      ? `CPU ${status.cpu}% [confirmado], RAM livre ${status.ramFree} GB de ${status.ramTotal} GB [confirmado], disco livre ${status.diskFree} GB [confirmado].`
      : "Não há leitura de /status neste aparelho [confirmado].";
    return `Faça um diagnóstico curto do PC com a regra de evidência. Dados locais: ${reading}`;
  }

  function vpsPrompt() {
    const apps = VPS_APPS.map(([name, url]) => `${name} ${url}`).join(", ");
    return `Resuma a infraestrutura da VPS srv1483039 (72.62.11.116). Apps conhecidos: ${apps}. Portas: MySQL 32768, PostgreSQL 32769, Adminer 32771, Ollama 11434, Nexus-Terminal 3100, Hermes 8642, n8n 5677, 9Router 20128. Marque [confirmado] só o que estiver nesta lista e [inferência] o restante.`;
  }

  function voiceTarget() {
    const active = document.activeElement;
    if (active && (active.tagName === "TEXTAREA" || (active.tagName === "INPUT" && active.type !== "password" && active.type !== "url"))) {
      return active;
    }
    if (state.tab === "prompts" && state.sub === "memories") return $("mem-content");
    if (state.tab === "prompts") return $("ideia");
    return $("chat-input");
  }

  function toggleVoice() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      toast("Este navegador não expõe a Web Speech API.");
      return;
    }
    if (state.recognition) {
      state.recognition.stop();
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "pt-BR";
    recognition.interimResults = true;
    recognition.onstart = () => {
      state.recognition = recognition;
      $("mic").setAttribute("aria-pressed", "true");
    };
    recognition.onend = () => {
      state.recognition = null;
      $("mic").setAttribute("aria-pressed", "false");
    };
    recognition.onerror = () => toast("Não foi possível ouvir o microfone.");
    recognition.onresult = (event) => {
      let transcript = "";
      let isFinal = false;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
        if (event.results[index].isFinal) isFinal = true;
      }
      const field = voiceTarget();
      field.value = transcript;
      if (isFinal && state.settings.autoSend && field === $("chat-input")) sendChat(transcript);
    };
    try {
      recognition.start();
    } catch {
      state.recognition = null;
      $("mic").setAttribute("aria-pressed", "false");
      toast("Não foi possível iniciar o microfone.");
    }
  }

  async function probe(url) {
    if (location.protocol === "https:" && url.startsWith("http:")) {
      return { state: "bloqueado", detail: "HTTPS não abre HTTP" };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const started = performance.now();
    try {
      await fetch(url, { mode: "no-cors", signal: controller.signal, cache: "no-store" });
      return { state: "respondeu", detail: `${Math.round(performance.now() - started)} ms` };
    } catch {
      return { state: "sem resposta", detail: "falha de rede" };
    } finally {
      clearTimeout(timer);
    }
  }

  function serviceUrl(service) {
    const path = service.path || "/";
    return `http://72.62.11.116:${service.port}${path}`;
  }

  async function refreshVps() {
    const apps = $("vps-apps");
    const services = $("vps-services");
    apps.replaceChildren();
    services.replaceChildren();
    for (const [name, url] of VPS_APPS) {
      const card = document.createElement("article");
      card.className = "card";
      const copy = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = name;
      const detail = document.createElement("p");
      detail.textContent = "verificando…";
      copy.append(title, detail);
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Abrir";
      card.append(copy, link);
      apps.append(card);
      probe(url).then((result) => { detail.textContent = `${result.state} · ${result.detail}`; });
    }
    for (const service of VPS_SERVICES) {
      const card = document.createElement("article");
      card.className = "card";
      const copy = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = `${service.name} :${service.port}`;
      const detail = document.createElement("p");
      detail.textContent = service.kind === "tcp" ? "porta interna — o navegador não fala MySQL/PostgreSQL" : "verificando…";
      copy.append(title, detail);
      card.append(copy);
      services.append(card);
      if (service.kind === "http") {
        probe(serviceUrl(service)).then((result) => { detail.textContent = `${result.state} · ${result.detail}`; });
      }
    }
  }

  function promptFields() {
    return {
      ideia: $("ideia").value,
      papel: $("papel").value,
      contexto: $("contexto").value,
      tarefa: $("tarefa").value,
      restricoes: $("restricoes").value,
      formato: $("formato").value,
    };
  }

  function buildMasterPrompt(fields) {
    const text = (value) => (value || "").trim() || "(não informado)";
    return [
      "# Master Prompt — O Arquiteto de Prompts v2",
      "Framework R.C.T.R.F. (Role, Context, Task, Restrictions, Format).",
      "",
      "## Papel (Role)",
      text(fields.papel),
      "",
      "## Contexto",
      text(fields.contexto),
      "",
      "## Tarefa",
      text(fields.tarefa),
      "",
      "## Restrições",
      text(fields.restricoes),
      "",
      "## Formato",
      text(fields.formato),
      "",
      "## Ideia bruta",
      text(fields.ideia),
      "",
      "## Regra de Evidência",
      "Separe cada afirmação. Use [confirmado] apenas para o que estiver explícito na ideia, no contexto ou em dados fornecidos. Use [inferência] para hipótese ou recomendação sem medição. Se faltar dado, declare a lacuna. Não converta inferência em fato.",
    ].join("\n");
  }

  async function copyText(text) {
    if (!text) return toast("Gere o prompt antes de copiar.");
    try {
      await navigator.clipboard.writeText(text);
      toast("Master Prompt copiado");
    } catch {
      toast("A área de transferência bloqueou a cópia");
    }
  }

  function renderMemoryStats(stats) {
    const root = $("mem-stats");
    root.replaceChildren();
    const total = document.createElement("span");
    total.className = "pill ok";
    total.textContent = `${stats && Number.isFinite(stats.total) ? stats.total : state.memories.length} memórias`;
    root.append(total);
    const byType = (stats && stats.byType) || {};
    for (const [type, count] of Object.entries(byType)) {
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = `${type}: ${count}`;
      root.append(pill);
    }
  }

  function renderMemories(memories) {
    state.memories = memories || [];
    const list = $("mem-list");
    list.replaceChildren();
    if (!state.memories.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "Nenhuma memória neste cache.";
      list.append(empty);
      return;
    }
    for (const memory of state.memories.slice(0, 40)) {
      const card = document.createElement("article");
      card.className = "card";
      const copy = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = memory.title || memory.type || "Memória";
      const body = document.createElement("p");
      body.textContent = memory.content || "";
      copy.append(title, body);
      card.append(copy);
      list.append(card);
    }
  }

  async function loadMemories() {
    try {
      const [list, stats] = await Promise.all([
        api("/memories/list?limit=200"),
        api("/memories/stats"),
      ]);
      const memories = list.data.memories || [];
      await idbSet("memories", memories);
      await idbSet("memory-stats", stats.data.stats || null);
      $("mem-offline").hidden = true;
      renderMemoryStats(stats.data.stats);
      renderMemories(memories);
    } catch {
      const cached = await idbGet("memories");
      const stats = await idbGet("memory-stats");
      $("mem-offline").hidden = false;
      renderMemoryStats(stats);
      renderMemories(Array.isArray(cached) ? cached : []);
    }
  }

  async function syncMemories() {
    await loadMemories();
    toast(`${state.memories.length} memórias no cache`);
  }

  async function searchMemories(query) {
    if (!query) return loadMemories();
    try {
      const { data } = await api(`/memories/search?q=${encodeURIComponent(query)}&limit=20`);
      $("mem-offline").hidden = true;
      renderMemories(data.memories || []);
    } catch {
      const cached = (await idbGet("memories")) || state.memories;
      const needle = query.toLowerCase();
      renderMemories((cached || []).filter((memory) => `${memory.title || ""} ${memory.content || ""}`.toLowerCase().includes(needle)));
      $("mem-offline").hidden = false;
    }
  }

  function showSub(name) {
    state.sub = name;
    $("sub-architect").hidden = name !== "architect";
    $("sub-memories").hidden = name !== "memories";
    for (const button of document.querySelectorAll("[data-sub]")) {
      const on = button.dataset.sub === name;
      button.classList.toggle("active", on);
      button.setAttribute("aria-selected", on ? "true" : "false");
    }
    if (name === "memories" && !state.memories.length) loadMemories();
  }

  function showTab(name) {
    state.tab = name;
    document.body.dataset.tab = name;
    for (const panel of document.querySelectorAll("[data-tab-panel]")) {
      const on = panel.dataset.tabPanel === name;
      panel.classList.toggle("active", on);
      panel.setAttribute("aria-hidden", on ? "false" : "true");
    }
    for (const button of document.querySelectorAll(".tabbar [data-tab]")) {
      const on = button.dataset.tab === name;
      button.classList.toggle("active", on);
      button.setAttribute("aria-selected", on ? "true" : "false");
    }
    $("mic").hidden = name !== "chat" && name !== "prompts";
    const titles = { home: "Pulso", chat: "Chat IA", commands: "Comandos", vps: "VPS", prompts: "Prompts" };
    document.title = `Mestre Mobile — ${titles[name] || "V11"}`;
    if (name === "commands" && !state.ops.length) loadOperations();
    if (name === "chat") {
      loadModels();
      loadChatMeta();
    }
    if (name === "vps" && !$("vps-apps").childElementCount) refreshVps();
    if (name === "prompts" && state.sub === "memories") loadMemories();
  }

  async function refreshActive() {
    if (state.tab === "home") return refreshHome();
    if (state.tab === "commands") return loadOperations();
    if (state.tab === "vps") return refreshVps();
    if (state.tab === "chat") {
      await loadModels();
      return loadChatMeta();
    }
    if (state.tab === "prompts" && state.sub === "memories") return loadMemories();
    return undefined;
  }

  function openSheet({ title, body, okLabel, danger, fields = [] }) {
    return new Promise((resolve) => {
      const sheet = $("sheet");
      $("sheet-title").textContent = title;
      $("sheet-body").textContent = body || "";
      const extra = $("sheet-extra");
      extra.replaceChildren();
      const inputs = [];
      for (const field of fields) {
        const label = document.createElement("label");
        const span = document.createElement("span");
        span.textContent = field.label;
        const input = document.createElement("input");
        input.name = field.name;
        input.autocomplete = "off";
        label.append(span, input);
        extra.append(label);
        inputs.push(input);
      }
      const ok = $("sheet-ok");
      ok.textContent = okLabel || "Confirmar";
      ok.classList.toggle("danger", !!danger);
      sheet.hidden = false;
      const finish = (value) => {
        sheet.hidden = true;
        ok.removeEventListener("click", onOk);
        $("sheet-cancel").removeEventListener("click", onCancel);
        sheet.querySelector("[data-sheet-dismiss]").removeEventListener("click", onCancel);
        resolve(value);
      };
      const onCancel = () => finish(null);
      const onOk = () => {
        if (!inputs.length) return finish(true);
        const params = {};
        for (const input of inputs) {
          if (!input.value.trim()) return toast("Preencha todos os parâmetros.");
          params[input.name] = input.value.trim();
        }
        finish(params);
      };
      ok.addEventListener("click", onOk);
      $("sheet-cancel").addEventListener("click", onCancel);
      sheet.querySelector("[data-sheet-dismiss]").addEventListener("click", onCancel);
    });
  }

  function bindPullToRefresh() {
    const scroller = $("scroller");
    let pull = null;
    const activeScroll = () => {
      if (state.tab === "chat") return $("messages");
      return document.querySelector(".tab.active");
    };
    scroller.addEventListener("touchstart", (event) => {
      const node = activeScroll();
      if (!node || node.scrollTop > 4) return;
      pull = { y: event.touches[0].clientY, dy: 0 };
    }, { passive: true });
    scroller.addEventListener("touchmove", (event) => {
      if (!pull) return;
      pull.dy = event.touches[0].clientY - pull.y;
      const ptr = $("ptr");
      if (pull.dy > 16 && activeScroll().scrollTop <= 4) {
        ptr.hidden = false;
        ptr.textContent = pull.dy > 72 ? "Solte para atualizar" : "Puxe para atualizar";
      }
    }, { passive: true });
    scroller.addEventListener("touchend", async () => {
      const ptr = $("ptr");
      const should = pull && pull.dy > 72 && !ptr.hidden;
      pull = null;
      if (!should) {
        ptr.hidden = true;
        return;
      }
      ptr.textContent = "Atualizando…";
      try { await refreshActive(); } catch (error) { toast(error.message || "Falha ao atualizar"); }
      ptr.hidden = true;
    });
  }

  function bind() {
    renderTargets();
    renderDeck();
    renderChips();
    renderModels();
    $("speak").checked = !!state.settings.speak;
    $("auto-send").checked = !!state.settings.autoSend;
    $("endpoint-toggle").addEventListener("click", () => {
      $("endpoint-form").classList.toggle("open");
    });
    $("endpoint-form").addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        const url = new URL($("endpoint-url").value.trim());
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Use http ou https");
        state.settings.targets[state.settings.targetId] = url.origin;
        state.settings.mobileToken = $("endpoint-token").value.trim();
        saveSettings();
        $("endpoint-form").classList.remove("open");
        renderTargets();
        toast("Endpoint salvo neste aparelho");
        refreshActive();
      } catch {
        toast("URL inválida");
      }
    });
    for (const button of document.querySelectorAll(".tabbar [data-tab]")) {
      button.addEventListener("click", () => showTab(button.dataset.tab));
    }
    for (const button of document.querySelectorAll("[data-sub]")) {
      button.addEventListener("click", () => showSub(button.dataset.sub));
    }
    const onChatSend = (event) => {
      if (event) event.preventDefault();
      if (state.streaming && state.chatAbort) {
        state.chatAbort.abort();
        return;
      }
      const text = $("chat-input").value;
      if (!text.trim()) {
        toast("Escreva uma mensagem.");
        return;
      }
      sendChat(text);
    };
    $("send").addEventListener("click", onChatSend);
    $("chat-form").addEventListener("submit", onChatSend);
    $("model").addEventListener("change", () => {
      state.settings.model = $("model").value;
      saveSettings();
    });
    $("speak").addEventListener("change", () => {
      state.settings.speak = $("speak").checked;
      saveSettings();
    });
    $("auto-send").addEventListener("change", () => {
      state.settings.autoSend = $("auto-send").checked;
      saveSettings();
    });
    $("mic").addEventListener("click", toggleVoice);
    $("cmd-search").addEventListener("input", () => {
      state.search = $("cmd-search").value;
      state.shown = PAGE_SIZE;
      renderCommands();
    });
    $("cmd-more").addEventListener("click", () => {
      state.shown += PAGE_SIZE;
      renderCommands();
    });
    $("vps-refresh").addEventListener("click", refreshVps);
    $("prompt-form").addEventListener("submit", (event) => {
      event.preventDefault();
      state.masterPrompt = buildMasterPrompt(promptFields());
      $("prompt-output").textContent = state.masterPrompt;
    });
    $("prompt-copy").addEventListener("click", () => copyText(state.masterPrompt));
    $("prompt-send").addEventListener("click", () => {
      if (!state.masterPrompt) state.masterPrompt = buildMasterPrompt(promptFields());
      $("prompt-output").textContent = state.masterPrompt;
      showTab("chat");
      sendChat(state.masterPrompt);
    });
    $("mem-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await api("/memories/create", {
          method: "POST",
          body: {
            type: $("mem-type").value,
            title: $("mem-title").value.trim(),
            content: $("mem-content").value.trim(),
          },
        });
        $("mem-title").value = "";
        $("mem-content").value = "";
        toast("Memória criada");
        await loadMemories();
      } catch (error) {
        toast(error.message || "Não foi possível salvar");
      }
    });
    $("mem-search-form").addEventListener("submit", (event) => {
      event.preventDefault();
      searchMemories($("mem-search").value.trim());
    });
    $("live-close").addEventListener("click", () => { $("live-log").hidden = true; });
    $("install").addEventListener("click", async () => {
      if (!state.install) return;
      state.install.prompt();
      await state.install.userChoice;
      state.install = null;
      $("install").hidden = true;
    });
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.install = event;
      $("install").hidden = false;
    });
    bindPullToRefresh();
  }

  function boot() {
    bind();
    showTab("home");
    refreshHome().catch((error) => toast(error.message || "Falha ao ler o pulso"));
    if ("serviceWorker" in navigator) {
      const scope = new URL("./", window.location.href);
      navigator.serviceWorker.register(new URL("sw.js", scope), { scope: scope.href }).catch(() => {});
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

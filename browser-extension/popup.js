/**
 * Popup script for Mestre do PC browser extension.
 * Communicates with the local launcher and optional Chat Hub integration.
 */

const DEFAULT_LAUNCHER_URL = "http://127.0.0.1:7777";
const DEFAULT_CHATHUB_URL = "http://127.0.0.1:3000";

const UI = {
  launcherDot: document.getElementById("launcherDot"),
  launcherText: document.getElementById("launcherText"),
  ollamaDot: document.getElementById("ollamaDot"),
  ollamaText: document.getElementById("ollamaText"),
  chathubDot: document.getElementById("chathubDot"),
  chathubText: document.getElementById("chathubText"),
  message: document.getElementById("message"),
  btnDiagnostico: document.getElementById("btnDiagnostico"),
  btnLimpeza: document.getElementById("btnLimpeza"),
  btnEnviarPagina: document.getElementById("btnEnviarPagina"),
  btnOptions: document.getElementById("btnOptions"),
  linkOpenApp: document.getElementById("linkOpenApp"),
  linkRefresh: document.getElementById("linkRefresh"),
};

async function getSettings() {
  return chrome.storage.sync.get({
    launcherUrl: DEFAULT_LAUNCHER_URL,
    chathubUrl: DEFAULT_CHATHUB_URL,
    chathubEnabled: false,
    extensionToken: "",
  });
}

function setStatus(dot, text, state, label) {
  dot.className = "status-dot " + state;
  text.textContent = label;
}

function showMessage(msg, type = "error") {
  UI.message.textContent = msg;
  UI.message.className = "message show " + type;
  setTimeout(() => {
    UI.message.className = "message";
  }, 4000);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function checkLauncher(settings) {
  try {
    const res = await fetchWithTimeout(settings.launcherUrl + "/ping");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    setStatus(UI.launcherDot, UI.launcherText, "online", `Online (v${data.version || "?"})`);
    return true;
  } catch (e) {
    setStatus(UI.launcherDot, UI.launcherText, "offline", "Offline");
    return false;
  }
}

async function checkOllama(settings) {
  try {
    const res = await fetchWithTimeout(settings.launcherUrl + "/ollama/tags");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name || m.model);
    if (models.length > 0) {
      setStatus(UI.ollamaDot, UI.ollamaText, "online", `${models.length} modelo(s)`);
    } else {
      setStatus(UI.ollamaDot, UI.ollamaText, "unknown", "Sem modelos");
    }
  } catch (e) {
    setStatus(UI.ollamaDot, UI.ollamaText, "offline", "Offline");
  }
}

async function checkChatHub(settings) {
  if (!settings.chathubEnabled || !settings.chathubUrl) {
    setStatus(UI.chathubDot, UI.chathubText, "unknown", "Não configurado");
    return;
  }
  try {
    const res = await fetchWithTimeout(settings.chathubUrl + "/ping", {}, 3000);
    if (!res.ok) throw new Error("HTTP " + res.status);
    setStatus(UI.chathubDot, UI.chathubText, "online", "Online");
  } catch (e) {
    setStatus(UI.chathubDot, UI.chathubText, "offline", "Offline");
  }
}

async function runLauncherCommand(id, settings) {
  if (!settings.extensionToken) {
    showMessage("Configure o token de extensão nas opções.", "error");
    return;
  }
  try {
    const res = await fetchWithTimeout(settings.launcherUrl + "/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mestre-Client": "browser-extension",
        "X-Mestre-Extension-Token": settings.extensionToken,
      },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!res.ok || !data.accepted) {
      showMessage(data.output || `Erro ${res.status}`, "error");
      return;
    }
    showMessage(`Comando aceito: ${data.jobId}`, "success");
  } catch (e) {
    showMessage("Falha ao enviar comando: " + e.message, "error");
  }
}

async function sendPageToAI(settings) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showMessage("Nenhuma aba ativa.", "error");
    return;
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        title: document.title,
        url: location.href,
        selection: window.getSelection().toString().trim(),
      }),
    });
    const page = results?.[0]?.result || {};
    const prompt = `Analise esta página e sugira ações de manutenção ou automação se aplicável:\n\nTítulo: ${page.title}\nURL: ${page.url}\n${page.selection ? `Seleção: ${page.selection}` : ""}`;

    // Envia para o Ollama local via launcher proxy.
    const res = await fetchWithTimeout(settings.launcherUrl + "/ollama/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mestre-Client": "browser-extension",
        "X-Mestre-Extension-Token": settings.extensionToken,
      },
      body: JSON.stringify({
        model: "qwen2.5-coder:3b-instruct",
        messages: [{ role: "user", content: prompt }],
        stream: false,
        keep_alive: "5m",
      }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    showMessage(data.message?.content?.slice(0, 120) + "..." || "Resposta recebida.", "success");
  } catch (e) {
    showMessage("Falha ao enviar página: " + e.message, "error");
  }
}

async function init() {
  const settings = await getSettings();
  await checkLauncher(settings);
  await checkOllama(settings);
  await checkChatHub(settings);

  UI.btnDiagnostico.addEventListener("click", () => runLauncherCommand("diagnostico_completo", settings));
  UI.btnLimpeza.addEventListener("click", () => runLauncherCommand("limpeza_rapida_completa", settings));
  UI.btnEnviarPagina.addEventListener("click", () => sendPageToAI(settings));
  UI.btnOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
  UI.linkOpenApp.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: settings.launcherUrl });
  });
  UI.linkRefresh.addEventListener("click", (e) => {
    e.preventDefault();
    init();
  });
}

document.addEventListener("DOMContentLoaded", init);

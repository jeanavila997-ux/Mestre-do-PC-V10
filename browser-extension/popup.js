/**
 * Popup script for Mestre do PC browser extension.
 * Communicates with the local launcher and optional Chat Hub integration.
 */

import { getSettings, localBaseUrl, fetchLocal as fetchWithTimeout } from "./settings.js";

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
  if (settings.allowPageAnalysis !== true) {
    showMessage("Autorize o envio de titulo, URL e selecao para IA nas configuracoes.", "error");
    return;
  }
  if (!settings.extensionToken) {
    showMessage("Configure o token de extensão nas opções.", "error");
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showMessage("Nenhuma aba ativa.", "error");
    return;
  }
  UI.btnEnviarPagina.disabled = true;
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
    }, 90000);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const resposta = data.message?.content || "Resposta recebida, sem texto.";
    showMessage(resposta.slice(0, 500), "success");
  } catch (e) {
    showMessage("Falha ao enviar página: " + e.message, "error");
  } finally {
    UI.btnEnviarPagina.disabled = false;
  }
}

function wireActions() {
  if (wireActions.done) return;
  wireActions.done = true;
  UI.btnDiagnostico.addEventListener("click", () => getSettings().then(settings => runLauncherCommand("diagnostico_completo", settings)).catch(e => showMessage(e.message)));
  UI.btnLimpeza.addEventListener("click", () => getSettings().then(settings => runLauncherCommand("limpeza_rapida_completa", settings)).catch(e => showMessage(e.message)));
  UI.btnEnviarPagina.addEventListener("click", () => getSettings().then(sendPageToAI).catch(e => showMessage(e.message)));
  UI.btnOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
  UI.linkOpenApp.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const settings = await getSettings();
      await chrome.tabs.create({ url: localBaseUrl(settings.launcherUrl) + "/chat-integrado/chat-integrado.html" });
    } catch (error) { showMessage(error.message); }
  });
  UI.linkRefresh.addEventListener("click", (e) => {
    e.preventDefault();
    init();
  });
}

async function init() {
  wireActions();
  try {
    const settings = await getSettings();
    await Promise.all([checkLauncher(settings), checkOllama(settings), checkChatHub(settings)]);
  } catch (error) { showMessage(error.message); }
}

document.addEventListener("DOMContentLoaded", init);

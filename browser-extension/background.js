/**
 * Background service worker for Mestre do PC browser extension.
 * Manages context menus and relays secure messages to the local launcher.
 */

import { getSettings, fetchLocal as fetchWithTimeout } from "./settings.js";

async function sendToLauncher(id, params = {}) {
  const settings = await getSettings();
  if (!settings.extensionToken) {
    throw new Error("Token de extensão não configurado.");
  }
  const res = await fetchWithTimeout(settings.launcherUrl + "/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mestre-Client": "browser-extension",
      "X-Mestre-Extension-Token": settings.extensionToken,
    },
    body: JSON.stringify({ id, params }),
  });
  const data = await res.json();
  if (!res.ok || !data.accepted) {
    throw new Error(data.output || `Erro ${res.status}`);
  }
  return data;
}

async function sendSelectionToAI(text, pageUrl, pageTitle) {
  const settings = await getSettings();
  if (settings.allowPageAnalysis !== true) {
    throw new Error("Autorize o envio de titulo, URL e selecao para IA nas configuracoes.");
  }
  if (!settings.extensionToken) {
    throw new Error("Token de extensão não configurado.");
  }
  const prompt = `Contexto da página: ${pageTitle}\nURL: ${pageUrl}\n\nTexto selecionado:\n${text}\n\nCom base nisso, sugira ações de automação ou manutenção do Windows, se aplicável.`;
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
  return data.message?.content || "Sem resposta.";
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "mestre-diagnostico",
    title: "🖥️ Mestre do PC: Diagnóstico rápido",
    contexts: ["page", "selection"],
  });
  chrome.contextMenus.create({
    id: "mestre-limpeza",
    title: "🧹 Mestre do PC: Limpeza rápida",
    contexts: ["page", "selection"],
  });
  chrome.contextMenus.create({
    id: "mestre-analisar-texto",
    title: "🧠 Mestre do PC: Analisar com IA",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === "mestre-diagnostico") {
      await sendToLauncher("diagnostico_completo");
      await chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Mestre do PC",
        message: "Diagnóstico iniciado no app local.",
      });
    } else if (info.menuItemId === "mestre-limpeza") {
      await sendToLauncher("limpeza_rapida_completa");
      await chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Mestre do PC",
        message: "Limpeza rápida iniciada no app local.",
      });
    } else if (info.menuItemId === "mestre-analisar-texto" && info.selectionText) {
      const answer = await sendSelectionToAI(info.selectionText, tab.url, tab.title);
      await chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Mestre do PC - Análise",
        message: answer.slice(0, 120) + (answer.length > 120 ? "..." : ""),
      });
    }
  } catch (e) {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Mestre do PC - Erro",
      message: e.message,
    });
  }
});

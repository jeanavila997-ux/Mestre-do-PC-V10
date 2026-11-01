/**
 * Background service worker for Mestre do PC browser extension.
 * Manages context menus and relays secure messages to the local launcher.
 */

import { getSettings, fetchLocal as fetchWithTimeout } from "./settings.js";
import {
  summarizeMemory,
  closeJunkTabs,
  closeDuplicateTabs,
  discardInactiveTabs,
  openSpeedtest,
} from "./tab-actions.js";

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

function notify(title, message) {
  return chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message: String(message).slice(0, 180),
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  const items = [
    { id: "mestre-diagnostico", title: "🖥️ Mestre do PC: Diagnóstico rápido", contexts: ["page", "selection"] },
    { id: "mestre-limpeza", title: "🧹 Mestre do PC: Limpeza rápida", contexts: ["page", "selection"] },
    { id: "mestre-speedtest", title: "⚡ Mestre do PC: Speedtest", contexts: ["page"] },
    { id: "mestre-abas-memoria", title: "🧠 Mestre do PC: Memória das abas", contexts: ["page"] },
    { id: "mestre-fechar-lixo", title: "🗑️ Mestre do PC: Fechar abas sucata", contexts: ["page"] },
    { id: "mestre-duplicadas", title: "📑 Mestre do PC: Fechar duplicadas", contexts: ["page"] },
    { id: "mestre-discard", title: "💤 Mestre do PC: Descartar abas inativas", contexts: ["page"] },
    { id: "mestre-analisar-texto", title: "🧠 Mestre do PC: Analisar com IA", contexts: ["selection"] },
  ];
  for (const item of items) {
    chrome.contextMenus.create(item);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === "mestre-diagnostico") {
      await sendToLauncher("diagnostico_completo");
      await notify("Mestre do PC", "Diagnóstico iniciado no app local.");
    } else if (info.menuItemId === "mestre-limpeza") {
      await sendToLauncher("limpeza_rapida_completa");
      await notify("Mestre do PC", "Limpeza rápida iniciada no app local.");
    } else if (info.menuItemId === "mestre-speedtest") {
      await openSpeedtest();
      await notify("Mestre do PC", "Speedtest aberto (fast.com + Cloudflare).");
    } else if (info.menuItemId === "mestre-abas-memoria") {
      const s = await summarizeMemory();
      await notify("Mestre do PC", `Abas: ${s.total} · descartadas: ${s.discarded} · pin: ${s.pinned}.`);
    } else if (info.menuItemId === "mestre-fechar-lixo") {
      const r = await closeJunkTabs();
      await notify("Mestre do PC", `Fechou ${r.closed} aba(s) sucata.`);
    } else if (info.menuItemId === "mestre-duplicadas") {
      const r = await closeDuplicateTabs();
      await notify("Mestre do PC", `Fechou ${r.closed} duplicada(s).`);
    } else if (info.menuItemId === "mestre-discard") {
      const r = await discardInactiveTabs();
      await notify("Mestre do PC", `Descartou ${r.discarded} aba(s) inativa(s).`);
    } else if (info.menuItemId === "mestre-analisar-texto" && info.selectionText) {
      const answer = await sendSelectionToAI(info.selectionText, tab.url, tab.title);
      await notify("Mestre do PC - Análise", answer);
    }
  } catch (e) {
    await notify("Mestre do PC - Erro", e.message);
  }
});

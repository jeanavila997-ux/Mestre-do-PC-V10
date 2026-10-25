/**
 * Options page script for Mestre do PC browser extension.
 */

import { DEFAULTS, getSettings, localBaseUrl } from "./settings.js";

function showError(error) {
  const status = document.getElementById("status");
  status.textContent = error.message;
  status.style.color = "#f85149";
  status.focus();
}

async function load() {
  const settings = await getSettings();
  document.getElementById("launcherUrl").value = settings.launcherUrl;
  document.getElementById("extensionToken").value = settings.extensionToken;
  document.getElementById("chathubEnabled").checked = settings.chathubEnabled;
  document.getElementById("chathubUrl").value = settings.chathubUrl;
  document.getElementById("allowPageAnalysis").checked = settings.allowPageAnalysis === true;
}

async function save() {
  const settings = {
    launcherUrl: localBaseUrl(document.getElementById("launcherUrl").value.trim() || DEFAULTS.launcherUrl),
    extensionToken: document.getElementById("extensionToken").value.trim(),
    chathubEnabled: document.getElementById("chathubEnabled").checked,
    chathubUrl: localBaseUrl(document.getElementById("chathubUrl").value.trim() || DEFAULTS.chathubUrl),
    allowPageAnalysis: document.getElementById("allowPageAnalysis").checked,
  };
  const origins = [settings.launcherUrl + "/*"];
  if (settings.chathubEnabled) origins.push(settings.chathubUrl + "/*");
  if (!await chrome.permissions.request({ origins })) {
    throw new Error("Acesso ao app local nao autorizado. Configuracoes nao foram alteradas.");
  }
  await chrome.storage.local.set(settings);
  await chrome.storage.sync.remove(Object.keys(DEFAULTS));
  const status = document.getElementById("status");
  status.textContent = "✅ Configurações salvas.";
  status.style.color = "#00ff88";
  setTimeout(() => { status.textContent = ""; }, 3000);
}

document.addEventListener("DOMContentLoaded", () => load().catch(showError));
document.getElementById("save").addEventListener("click", () => save().catch(showError));

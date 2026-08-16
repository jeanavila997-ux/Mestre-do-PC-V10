/**
 * Options page script for Mestre do PC browser extension.
 */

const DEFAULTS = {
  launcherUrl: "http://127.0.0.1:7777",
  chathubUrl: "http://127.0.0.1:3000",
  chathubEnabled: false,
  extensionToken: "",
};

async function load() {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  document.getElementById("launcherUrl").value = settings.launcherUrl;
  document.getElementById("extensionToken").value = settings.extensionToken;
  document.getElementById("chathubEnabled").checked = settings.chathubEnabled;
  document.getElementById("chathubUrl").value = settings.chathubUrl;
}

async function save() {
  const settings = {
    launcherUrl: document.getElementById("launcherUrl").value.trim() || DEFAULTS.launcherUrl,
    extensionToken: document.getElementById("extensionToken").value.trim(),
    chathubEnabled: document.getElementById("chathubEnabled").checked,
    chathubUrl: document.getElementById("chathubUrl").value.trim() || DEFAULTS.chathubUrl,
  };
  await chrome.storage.sync.set(settings);
  const status = document.getElementById("status");
  status.textContent = "✅ Configurações salvas.";
  status.style.color = "#00ff88";
  setTimeout(() => { status.textContent = ""; }, 3000);
}

document.addEventListener("DOMContentLoaded", load);
document.getElementById("save").addEventListener("click", save);

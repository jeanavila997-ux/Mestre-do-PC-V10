export const DEFAULTS = {
  launcherUrl: "http://127.0.0.1:7777",
  chathubUrl: "http://127.0.0.1:3000",
  chathubEnabled: false,
  extensionToken: "",
  allowPageAnalysis: false,
};

export async function getSettings() {
  const keys = Object.keys(DEFAULTS);
  const [local, legacy] = await Promise.all([
    chrome.storage.local.get(keys), chrome.storage.sync.get(keys),
  ]);
  const settings = { ...DEFAULTS, ...legacy, ...local };
  if (Object.keys(legacy).length) {
    // Remove a copia sincronizada somente depois de preservar os dados locais.
    await chrome.storage.local.set(settings);
    await chrome.storage.sync.remove(Object.keys(legacy));
  }
  return settings;
}

function localUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.search || url.hash) {
    throw new Error("Use HTTP em 127.0.0.1, sem credenciais, consulta ou fragmento.");
  }
  return url;
}

export function localBaseUrl(value) {
  const url = localUrl(value);
  if (url.pathname !== "/") throw new Error("Informe somente a origem local, sem caminho.");
  return url.origin;
}

export async function fetchLocal(value, options = {}, timeoutMs = 8000) {
  const url = localUrl(value);
  return fetch(url.href, { ...options, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
}

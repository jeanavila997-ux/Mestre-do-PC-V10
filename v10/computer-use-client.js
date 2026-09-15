// Mestre do PC V10 - Computer Use Client
// Adaptador direto e tipado para @qwen-code/cua-sdk.

import { ComputerUse } from "@qwen-code/cua-sdk/computer-use";

const CACHE_TTL_MS = 5 * 60 * 1000;
let computer = null;
let initialization = null;
let appsCache = [];
let appsCacheTime = 0;
const sessionState = {
  error: null,
  lastInitialized: null,
};

export async function initializeComputerUse() {
  if (computer) return true;
  if (initialization) return initialization;

  initialization = (async () => {
    try {
      computer = await ComputerUse.create();
      sessionState.error = null;
      sessionState.lastInitialized = Date.now();
      return true;
    } catch (error) {
      computer = null;
      sessionState.error = error?.message || String(error);
      return false;
    } finally {
      initialization = null;
    }
  })();

  return initialization;
}

export function getStatus() {
  const connected = computer !== null;
  return {
    connected,
    initialized: connected,
    pid: null,
    appsCount: appsCache.length,
    error: sessionState.error,
    lastInitialized: sessionState.lastInitialized,
  };
}

async function getComputer() {
  await initializeComputerUse();
  if (!computer) {
    throw new Error(sessionState.error || "Falha ao inicializar Computer Use");
  }
  return computer;
}

async function invoke(method, options) {
  try {
    const instance = await getComputer();
    return await instance[method](options);
  } catch (error) {
    sessionState.error = error?.message || String(error);
    throw error;
  }
}

export async function listApps({ refresh = false } = {}) {
  const now = Date.now();
  if (!refresh && appsCache.length > 0 && now - appsCacheTime < CACHE_TTL_MS) {
    return appsCache;
  }

  const apps = await invoke("listApps", {});
  appsCache = Array.isArray(apps) ? apps : [];
  appsCacheTime = now;
  return appsCache;
}

export async function listWindows(pid) {
  const parsedPid = Number(pid);
  if (!Number.isInteger(parsedPid) || parsedPid <= 0) {
    throw new Error("PID deve ser um número inteiro positivo");
  }
  return invoke("listWindows", { pid: parsedPid });
}

export async function observeWindow(options) {
  return invoke("observeWindow", options);
}

export async function click(options) {
  return invoke("click", options);
}

export async function typeText(options) {
  return invoke("typeText", options);
}

export async function pressKey(options) {
  return invoke("pressKey", options);
}

export async function scroll(options) {
  return invoke("scroll", options);
}

export async function setValue(options) {
  return invoke("setValue", options);
}

export async function performSecondaryAction(options) {
  return invoke("performSecondaryAction", options);
}

export async function hotkey(options) {
  return invoke("hotkey", options);
}

export async function closeComputerUse() {
  if (initialization) await initialization;
  const instance = computer;
  computer = null;
  appsCache = [];
  appsCacheTime = 0;
  if (instance) await instance.close();
  return { success: true };
}

// Aliases mantidos para consumidores anteriores.
export const type = typeText;
export const key = pressKey;
export const list_apps = listApps;
export const list_windows = listWindows;

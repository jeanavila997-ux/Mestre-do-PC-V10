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

const READ_ONLY_TOOLS = new Set(["list_apps", "list_windows", "get_window_state"]);

async function invoke(tool, args = {}) {
  try {
    const instance = await getComputer();
    const observation = await instance.appCall(tool, args, { readOnly: READ_ONLY_TOOLS.has(tool) });
    return observation.structured ?? { text: observation.text, images: observation.images };
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

  const result = await invoke("list_apps", {});
  appsCache = Array.isArray(result?.apps) ? result.apps : [];
  appsCacheTime = now;
  return appsCache;
}

export async function listWindows(pid) {
  const parsedPid = Number(pid);
  if (!Number.isInteger(parsedPid) || parsedPid <= 0) {
    throw new Error("PID deve ser um número inteiro positivo");
  }
  return invoke("list_windows", { pid: parsedPid });
}

export async function observeWindow(options) {
  return invoke("get_window_state", options);
}

export async function click(options) {
  return invoke("click", options);
}

export async function typeText(options) {
  return invoke("type_text", options);
}

export async function pressKey(options) {
  return invoke("press_key", options);
}

export async function scroll(options) {
  return invoke("scroll", options);
}

export async function setValue(options) {
  return invoke("set_value", options);
}

export async function performSecondaryAction(options) {
  return invoke("perform_secondary_action", options);
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

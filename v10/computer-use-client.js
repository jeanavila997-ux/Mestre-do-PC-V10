// Mestre do PC V10 - Computer Use Client
// Wrapper para interagir com o Computer Use via @qwen-code/cua-sdk
// Mantém compatibilidade com a interface anterior baseada em child process
// mas usa instancia direta para evitar overhead e problemas de JSON

import { ComputerUse } from '@qwen-code/cua-sdk/computer-use';

let computer = null;
let initializing = false;
let initError = null;
const sessionState = {
  error: null,
  lastInitialized: null
};

const PROJECT_DIR = process.cwd();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
let appsCache = [];
let appsCacheTime = 0;

/**
 * Inicializa a instância do Computer Use (se ainda não inicializada)
 * @returns {Promise<boolean>} true se inicializado com sucesso
 */
export async function initializeComputerUse() {
  if (computer) return true;
  if (initializing) {
    // Aguarda a inicialização em curso
    while (initializing) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return !!computer;
  }

  initializing = true;
  try {
    computer = await ComputerUse.create();
    initError = null;
    sessionState.error = null;
    sessionState.lastInitialized = Date.now();
    return true;
  } catch (error) {
    initError = error;
    sessionState.error = error.message || String(error);
    computer = null;
    return false;
  } finally {
    initializing = false;
  }
}

/**
 * Retorna o status atual da instancia do Computer Use
 * @returns {{ initialized: boolean, error: string|null, lastInitialized: number|null }}
 */
export function getStatus() {
  return {
    initialized: !!computer,
    error: sessionState.error,
    lastInitialized: sessionState.lastInitialized
  };
}

/**
 * Lista aplicativos disponíveis
 * @param {{ refresh?: boolean }} opts
 * @returns {Promise<Array>} lista de aplicativos
 */
export async function listApps({ refresh = false } = {}) {
  const now = Date.now();
  if (!refresh && appsCache.length > 0 && now - appsCacheTime < CACHE_TTL_MS) {
    return appsCache;
  }

  try {
    await initializeComputerUse();
    if (!computer) {
      throw new Error(sessionState.error || 'Falha ao inicializar Computer Use');
    }
    const apps = await computer.listApps();
    appsCache = apps;
    appsCacheTime = now;
    return apps;
  } catch (error) {
    sessionState.error = error.message || String(error);
    throw error;
  }
}

/**
 * Lista janelas de um aplicativo
 * @param {number|string} pid - ID do processo
 * @returns {Promise<Array>} lista de janelas
 */
export async function listWindows(pid) {
  if (!pid) {
    throw new Error('PID é obrigatório para listWindows');
  }
  const pidNum = Number(pid);
  if (isNaN(pidNum)) {
    throw new Error('PID deve ser um número válido');
  }

  try {
    await initializeComputerUse();
    if (!computer) {
      throw new Error(sessionState.error || 'Falha ao inicializar Computer Use');
    }
    const windows = await computer.listWindows({ pid: pidNum });
    return windows;
  } catch (error) {
    sessionState.error = error.message || String(error);
    throw error;
  }
}

/**
 * Realiza um clique em um elemento ou coordenada
 * @param {{ element?: number, coordinate?: [number, number], button?: 'left'|'right'|'middle', modifiers?: string[] }} opts
 * @returns {Promise<Object>} resultado da ação
 */
export async function click(opts = {}) {
  try {
    await initializeComputerUse();
    if (!computer) {
      throw new Error(sessionState.error || 'Falha ao inicializar Computer Use');
    }
    return await computer.click(opts);
  } catch (error) {
    sessionState.error = error.message || String(error);
    throw error;
  }
}

/**
 * Digita texto
 * @param {{ text: string, modifiers?: string[] }} opts
 * @returns {Promise<Object>} resultado da ação
 */
export async function type(opts = {}) {
  try {
    await initializeComputerUse();
    if (!computer) {
      throw new Error(sessionState.error || 'Falha ao inicializar Computer Use');
    }
    return await computer.type(opts);
  } catch (error) {
    sessionState.error = error.message || String(error);
    throw error;
  }
}

/**
 * Pressiona uma tecla ou combinação
 * @param {{ keys: string, modifiers?: string[] }} opts
 * @returns {Promise<Object>} resultado da ação
 */
export async function key(opts = {}) {
  try {
    await initializeComputerUse();
    if (!computer) {
      throw new Error(sessionState.error || 'Falha ao inicializar Computer Use');
    }
    return await computer.key(opts);
  } catch (error) {
    sessionState.error = error.message || String(error);
    throw error;
  }
}

/**
 * Captura a tela
 * @param {{ mode?: 'som'|'vision'|'ax', app?: string }} opts
 * @returns {Promise<Object>} resultado da captura (imagem base64 ou AX tree)
 */
export async function capture(opts = {}) {
  try {
    await initializeComputerUse();
    if (!computer) {
      throw new Error(sessionState.error || 'Falha ao inicializar Computer Use');
    }
    return await computer.capture(opts);
  } catch (error) {
    sessionState.error = error.message || String(error);
    throw error;
  }
}

/**
 * Aguarda por um determinado número de segundos
 * @param {{ seconds: number }} opts
 * @returns {Promise<Object>} resultado da ação
 */
export async function wait(opts = {}) {
  try {
    await initializeComputerUse();
    if (!computer) {
      throw new Error(sessionState.error || 'Falha ao inicializar Computer Use');
    }
    return await computer.wait(opts);
  } catch (error) {
    sessionState.error = error.message || String(error);
    throw error;
  }
}

/**
 * Lista aplicativos disponíveis (atalho)
 * @returns {Promise<Array>} lista de aplicativos
 */
export async function list_apps() {
  return listApps();
}

/**
 * Lista janelas de um aplicativo (atalho)
 * @param {number|string} pid
 * @returns {Promise<Array>} lista de janelas
 */
export async function list_windows(pid) {
  return listWindows(pid);
}

/**
 * Foca em um aplicativo
 * @param {{ app: string, raise_window?: boolean }} opts
 * @returns {Promise<Object>} resultado da ação
 */
export async function focus_app(opts = {}) {
  try {
    await initializeComputerUse();
    if (!computer) {
      throw new Error(sessionState.error || 'Falha ao inicializar Computer Use');
    }
    return await computer.focus_app(opts);
  } catch (error) {
    sessionState.error = error.message || String(error);
    throw error;
  }
}
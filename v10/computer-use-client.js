// Mestre do PC V11 - Computer Use Client
// Wrapper em torno do @qwen-code/cua-sdk para controle de UI via acessibilidade Windows
// Similar ao desktop-commander-client.js, mas focado em automação de interface

import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(__dirname, "..");
const NODE_REPL_SCRIPT = join(PROJECT_DIR, "scripts", "computer-use-repl.js");

// Estado da conexão
let sessionState = {
  connected: false,
  pid: null,
  windowId: null,
  lastObservation: null,
  elements: [],
  error: null,
};

// Cache de aplicativos
let appsCache = [];
let appsCacheTime = 0;
const CACHE_TTL_MS = 30000;

/**
 * Inicializa o Computer Use via Node REPL
 * Retorna true se sucesso, false se falha
 */
export async function initializeComputerUse() {
  try {
    // Verifica se o SDK está instalado
    const sdkPath = join(PROJECT_DIR, "node_modules", "@qwen-code", "cua-sdk");
    if (!existsSync(sdkPath)) {
      throw new Error(
        "@qwen-code/cua-sdk não está instalado. Execute: npm install @qwen-code/cua-sdk@0.20.4"
      );
    }

    // Script de inicialização do Computer Use
    const initScript = `
      globalThis.computer = await (
        await import('@qwen-code/cua-sdk/computer-use')
      ).ComputerUse.create();
      JSON.stringify({ status: 'ready', pid: process.pid })
    `;

    // Executa via node_repl ou diretamente
    const result = await executeInRepl(initScript, []);
    const parsed = JSON.parse(result);

    if (parsed.status === "ready") {
      sessionState.connected = true;
      sessionState.pid = parsed.pid;
      sessionState.error = null;
      return true;
    }

    return false;
  } catch (error) {
    sessionState.error = error.message || String(error);
    return false;
  }
}

/**
 * Executa script no Node REPL
 * @param {string} script - Script JavaScript para executar com node -e
 * @param {string[]} args - Argumentos a serem passados para o script (process.argv.slice(2))
 */
async function executeInRepl(script, args = []) {
  return new Promise((resolve, reject) => {
    try {
      const nodeProcess = spawn("node", ["-e", script, ...args], {
        cwd: PROJECT_DIR,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env }
      });

      let output = "";
      let errorOutput = "";

      nodeProcess.stdout.on("data", (data) => {
        output += String(data);
      });

      nodeProcess.stderr.on("data", (data) => {
        errorOutput += String(data);
      });

      nodeProcess.on("close", (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(errorOutput.trim() || `Exit code ${code}`));
        }
      });

      nodeProcess.on("error", (err) => {
        reject(err);
      });

      // Timeout de 30 segundos
      setTimeout(() => {
        nodeProcess.kill();
        reject(new Error("Timeout ao executar no REPL"));
      }, 30000);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Lista aplicativos disponíveis
 */
export async function listApps({ refresh = false } = {}) {
  const now = Date.now();
  if (appsCache.length > 0 && now - appsCacheTime < CACHE_TTL_MS && !refresh) {
    return appsCache;
  }

  try {
    const script = `
      if (!globalThis.computer) {
        globalThis.computer = await (
          await import('@qwen-code/cua-sdk/computer-use')
        ).ComputerUse.create();
      }
      const apps = await globalThis.computer.listApps();
      JSON.stringify(apps)
    `;

    const result = await executeInRepl(script, []);
    appsCache = JSON.parse(result);
    appsCacheTime = now;

    return appsCache;
  } catch (error) {
    sessionState.error = error.message || String(error);
    throw error;
  }
}

/**
 * Lista janelas de um aplicativo
 */
export async function listWindows(pid) {
  if (!pid) {
    throw new Error("PID é obrigatório para listWindows");
  }

  try {
    const script = `
      if (!globalThis.computer) {
        globalThis.computer = await (
          await import('@qwen-code/cua-sdk/computer-use')
        ).ComputerUse.create();
      }
      const [pidStr] = process.argv.slice(2);
      const pid = Number(pidStr);
      const windows = await globalThis.computer.listWindows({ pid });
      JSON.stringify(windows)
    `;

    const result = await executeInRepl(script, [String(pid)]);
    return JSON.parse(result);
  } catch (error) {
    sessionState.error = error.message || String(error);
    throw error;
  }
}

/**
 * Observa estado de uma janela (árvore de acessibilidade)
 */
export async function observeWindow({ pid, windowId, includeScreenshot = false, disableDiff = false } = {}) {
  if (!pid) {
    throw new Error("PID é obrigatório para observeWindow");
  }

  try {
    const screenshotOpt = includeScreenshot ? "true" : "false";
    const diffOpt = disableDiff ? "true" : "false";

    const script = `
      if (!globalThis.computer) {
        globalThis.computer = await (
          await import('@qwen-code/cua-sdk/computer-use')
        ).ComputerUse.create();
      }
      const [pidStr, windowIdStr, screenshotOptStr, disableDiffOptStr] = process.argv.slice(2);
      const pid = Number(pidStr);
      const windowId = windowIdStr === "undefined" ? undefined : windowIdStr;
      const includeScreenshot = screenshotOptStr === "true";
      const disableDiff = disableDiffOptStr === "true";
      const state = await globalThis.computer.observeWindow({
        pid,
        windowId,
        includeScreenshot,
        disableDiff
      });
      // Filtra campos não serializáveis
      JSON.stringify({
        pid: state.pid,
        windowId: state.windowId,
        mode: state.mode,
        text: state.text,
        elements: state.elements || [],
        screenshot: state.screenshot ? {
          images: state.screenshot.images.map(img => ({
            mimeType: img.mimeType,
            dataBase64: img.dataBase64.substring(0, 1000) + '...[truncated]'
          }))
        } : null
      })
    `;

    const result = await executeInRepl(script, [
      String(pid),
      windowId ?? "undefined",
      screenshotOpt,
      diffOpt
    ]);
    const state = JSON.parse(result);

    sessionState.lastObservation = state;
    sessionState.elements = state.elements || [];

    return state;
  } catch (error) {
    sessionState.error = error.message || String(error);
    throw error;
  }
}

/**
 * Executa clique em elemento ou coordenada
 */
export async function click({ pid, windowId, elementToken, x, y, button = "left", count = 1 } = {}) {
  if (!pid) {
    throw new Error("PID é obrigatório para click");
  }

  try {
    const script = `
      if (!globalThis.computer) {
        globalThis.computer = await (
          await import('@qwen-code/cua-sdk/computer-use')
        ).ComputerUse.create();
      }
      const [pidStr, windowIdStr, elementTokenStr, xStr, yStr, buttonStr, countStr] = process.argv.slice(2);
      const pid = Number(pidStr);
      const windowId = windowIdStr === "undefined" ? undefined : windowIdStr;
      const elementToken = elementTokenStr === "undefined" ? undefined : elementTokenStr;
      const x = xStr === "undefined" ? undefined : Number(xStr);
      const y = yStr === "undefined" ? undefined : Number(yStr);
      const button = buttonStr;
      const count = Number(countStr);
      const target = elementToken 
        ? { pid, windowId: windowId || undefined, elementToken }
        : { pid, windowId: windowId || undefined, x, y };
      const result = await globalThis.computer.click(target, { button, count });
      JSON.stringify(result)
    `;

    const result = await executeInRepl(script, [
      String(pid),
      windowId ?? "undefined",
      elementToken ?? "undefined",
      x ?? "undefined",
      y ?? "undefined",
      button,
      String(count)
    ]);
    return JSON.parse(result);
  } catch (error) {
    sessionState.error = error.message || String(error);
    throw error;
  }
}

/**
 * Digita texto em elemento ou janela
 */
export async function typeText({ pid, windowId, elementToken, text } = {}) {
  if (!pid) {
    throw new Error("PID é obrigatório para typeText");
  }
  if (!text) {
    throw new Error("Texto é obrigatório para typeText");
  }

  try {
    const script = `
      if (!globalThis.computer) {
        globalThis.computer = await (
          await import('@qwen-code/cua-sdk/computer-use')
        ).ComputerUse.create();
      }
      const [pidStr, windowIdStr, elementTokenStr, textStr] = process.argv.slice(2);
      const pid = Number(pidStr);
      const windowId = windowIdStr === "undefined" ? undefined : windowIdStr;
      const elementToken = elementTokenStr === "undefined" ? undefined : elementTokenStr;
      const target = elementToken 
        ? { pid, windowId: windowId || undefined, elementToken }
        : { pid, windowId: windowId || undefined };
      const result = await globalThis.computer.typeText(target, { text: textStr });
      JSON.stringify(result)
    `;

    const result = await executeInRepl(script, [
      String(pid),
      windowId ?? "undefined",
      elementToken ?? "undefined",
      text
    ]);
    return JSON.parse(result);
  } catch (error) {
    sessionState.error = error.message || String(error);
    throw error;
  }
}

/**
 * Pressiona uma tecla
 */
export async function pressKey({ pid, windowId, elementToken, key, modifiers = [] } = {}) {
  if (!pid) {
    throw new Error("PID é obrigatório para pressKey");
  }
  if (!key) {
    throw new Error("Tecla é obrigatória para pressKey");
  }

  try {
    const modifiersStr = JSON.stringify(modifiers);

    const script = `
      if (!globalThis.computer) {
        globalThis.computer = await (
          await import('@qwen-code/cua-sdk/computer-use')
        ).ComputerUse.create();
      }
      const [pidStr, windowIdStr, elementTokenStr, keyStr, modifiersStr] = process.argv.slice(2);
      const pid = Number(pidStr);
      const windowId = windowIdStr === "undefined" ? undefined : windowIdStr;
      const elementToken = elementTokenStr === "undefined" ? undefined : elementTokenStr;
      const key = keyStr;
      const modifiers = JSON.parse(modifiersStr);
      const target = elementToken 
        ? { pid, windowId: windowId || undefined, elementToken }
        : { pid, windowId: windowId || undefined };
      const result = await globalThis.computer.pressKey(target, { key, modifiers });
      JSON.stringify(result)
    `;

    const result = await executeInRepl(script, [
      String(pid),
      windowId ?? "undefined",
      elementToken ?? "undefined",
      key,
      modifiersStr
    ]);
    return JSON.parse(result);
  } catch (error) {
    sessionState.error = error.message || String(error);
    throw error;
  }
}

/**
 * Executa scroll
 */
export async function scroll({ pid, windowId, elementToken, direction, amount = 1 } = {}) {
  if (!pid) {
    throw new Error("PID é obrigatório para scroll");
  }
  if (!direction || !['up', 'down', 'left', 'right'].includes(direction)) {
    throw new Error("Direção inválida (use: up, down, left, right)");
  }

  try {
    const script = `
      if (!globalThis.computer) {
        globalThis.computer = await (
          await import('@qwen-code/cua-sdk/computer-use')
        ).ComputerUse.create();
      }
      const [pidStr, windowIdStr, elementTokenStr, directionStr, amountStr] = process.argv.slice(2);
      const pid = Number(pidStr);
      const windowId = windowIdStr === "undefined" ? undefined : windowIdStr;
      const elementToken = elementTokenStr === "undefined" ? undefined : elementTokenStr;
      const direction = directionStr;
      const amount = Number(amountStr);
      const target = elementToken 
        ? { pid, windowId: windowId || undefined, elementToken }
        : { pid, windowId: windowId || undefined };
      const result = await globalThis.computer.scroll(target, { direction, amount });
      JSON.stringify(result)
    `;

    const result = await executeInRepl(script, [
      String(pid),
      windowId ?? "undefined",
      elementToken ?? "undefined",
      direction,
      String(amount)
    ]);
    return JSON.parse(result);
  } catch (error) {
    sessionState.error = error.message || String(error);
    throw error;
  }
}

/**
 * Define valor em elemento (input, textarea, etc.)
 */
export async function setValue({ pid, windowId, elementToken, value } = {}) {
  if (!pid) {
    throw new Error("PID é obrigatório para setValue");
  }
  if (!elementToken) {
    throw new Error("elementToken é obrigatório para setValue");
  }
  if (value === undefined) {
    throw new Error("Valor é obrigatório para setValue");
  }

  try {
    const script = `
      if (!globalThis.computer) {
        globalThis.computer = await (
          await import('@qwen-code/cua-sdk/computer-use')
        ).ComputerUse.create();
      }
      const [pidStr, windowIdStr, elementTokenStr, valueStr] = process.argv.slice(2);
      const pid = Number(pidStr);
      const windowId = windowIdStr === "undefined" ? undefined : windowIdStr;
      const elementToken = elementTokenStr === "undefined" ? undefined : elementTokenStr;
      const target = { pid, windowId: windowId || undefined, elementToken };
      const result = await globalThis.computer.setValue(target, { value: valueStr });
      JSON.stringify(result)
    `;

    const result = await executeInRepl(script, [
      String(pid),
      windowId ?? "undefined",
      elementToken ?? "undefined",
      String(value)
    ]);
    return JSON.parse(result);
  } catch (error) {
    sessionState.error = error.message || String(error);
    throw error;
  }
}

/**
 * Executa ação secundária (menu, expandir, etc.)
 */
export async function performSecondaryAction({ pid, windowId, elementToken, action } = {}) {
  if (!pid) {
    throw new Error("PID é obrigatório para performSecondaryAction");
  }
  if (!elementToken) {
    throw new Error("elementToken é obrigatório para performSecondaryAction");
  }
  if (!action) {
    throw new Error("Ação é obrigatória para performSecondaryAction");
  }

  try {
    const script = `
      if (!globalThis.computer) {
        globalThis.computer = await (
          await import('@qwen-code/cua-sdk/computer-use')
        ).ComputerUse.create();
      }
      const [pidStr, windowIdStr, elementTokenStr, actionStr] = process.argv.slice(2);
      const pid = Number(pidStr);
      const windowId = windowIdStr === "undefined" ? undefined : windowIdStr;
      const elementToken = elementTokenStr === "undefined" ? undefined : elementTokenStr;
      const target = { pid, windowId: windowId || undefined, elementToken };
      const result = await globalThis.computer.performSecondaryAction(target, { action: actionStr });
      JSON.stringify(result)
    `;

    const result = await executeInRepl(script, [
      String(pid),
      windowId ?? "undefined",
      elementToken ?? "undefined",
      action.replace(/\"/g, '\\\\"')
    ]);
    return JSON.parse(result);
  } catch (error) {
    sessionState.error = error.message || String(error);
    throw error;
  }
}

/**
 * Executa hotkey (combinação de teclas)
 */
export async function hotkey({ pid, windowId, elementToken, keys = [] } = {}) {
  if (!pid) {
    throw new Error("PID é obrigatório para hotkey");
  }
  if (!keys || keys.length === 0) {
    throw new Error("Teclas são obrigatórias para hotkey");
  }

  try {
    const keysStr = JSON.stringify(keys);

    const script = `
      if (!globalThis.computer) {
        globalThis.computer = await (
          await import('@qwen-code/cua-sdk/computer-use')
        ).ComputerUse.create();
      }
      const [pidStr, windowIdStr, elementTokenStr, keysStr] = process.argv.slice(2);
      const pid = Number(pidStr);
      const windowId = windowIdStr === "undefined" ? undefined : windowIdStr;
      const elementToken = elementTokenStr === "undefined" ? undefined : elementTokenStr;
      const target = elementToken 
        ? { pid, windowId: windowId || undefined, elementToken }
        : { pid, windowId: windowId || undefined };
      const result = await globalThis.computer.hotkey(target, { keys: JSON.parse(keysStr) });
      JSON.stringify(result)
    `;

    const result = await executeInRepl(script, [
      String(pid),
      windowId ?? "undefined",
      elementToken ?? "undefined",
      keysStr
    ]);
    return JSON.parse(result);
  } catch (error) {
    sessionState.error = error.message || String(error);
    throw error;
  }
}

/**
 * Fecha a sessão do Computer Use
 */
export async function closeComputerUse() {
  try {
    const script = `
      if (globalThis.computer) {
        await globalThis.computer.close();
        globalThis.computer = undefined;
      }
      JSON.stringify({ status: 'closed' })
    `;

    await executeInRepl(script, []);
    sessionState = {
      connected: false,
      pid: null,
      windowId: null,
      lastObservation: null,
      elements: [],
      error: null,
    };
    appsCache = [];
    appsCacheTime = 0;

    return { status: "closed" };
  } catch (error) {
    sessionState.error = error.message || String(error);
    throw error;
  }
}

/**
 * Retorna status do Computer Use
 */
export function getStatus() {
  return {
    ...sessionState,
    appsCount: appsCache.length,
    appsCached: appsCacheTime > 0,
  };
}
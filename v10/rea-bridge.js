/**
 * rea-bridge.js — Ponte nativa do Mestre do PC com o REA (engenharia reversa).
 *
 * O REA analisa artefatos ENTREGUES (ASAR/árvore JavaScript/Electron, pacotes,
 * binários) e responde com Evidência. Este módulo só expõe operações de
 * ANÁLISE: elas leem o alvo e devolvem relatório. Nada aqui executa o alvo.
 *
 * Regras de segurança desta ponte:
 *  - alvo obrigatório, absoluto, existente e dentro de raízes permitidas;
 *  - conjunto de caracteres do caminho é restrito (nada de aspas, %, !, &, |, <, >, ^);
 *  - a linha de comando é montada por nós e passada ao shell como UMA string,
 *    porque no Windows `spawn` reescapa aspas de argumentos (verificado);
 *  - toda análise é auditada em nível SECURITY;
 *  - saída é limitada para não estourar memória do launcher.
 *
 * Uso típico:
 *   reaStatus()            → detecta rea local / npx / ausente
 *   reaDoctor()            → rea doctor --json
 *   reaAnalyzeAppJs(path)  → rea analyze-javascript-application <path> --json
 */

import { spawn, execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { auditLog, AuditLevel } from "../mcp-server/audit-logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PROJECT_DIR = resolve(__dirname, "..");
export const REA_PACKAGE = process.env.REA_PACKAGE || "rea-agents@6.8.0";
export const REA_DOCS_URL = "https://github.com/morluto/rea";

const STATUS_TIMEOUT_MS = clamp(Number(process.env.REA_STATUS_TIMEOUT_MS || 8000), 1000, 30000);
const DOCTOR_TIMEOUT_MS = clamp(Number(process.env.REA_DOCTOR_TIMEOUT_MS || 120000), 5000, 300000);
const ANALYZE_TIMEOUT_MS = clamp(Number(process.env.REA_TIMEOUT_MS || 300000), 10000, 900000);
const MAX_OUTPUT_BYTES = clamp(Number(process.env.REA_MAX_OUTPUT_BYTES || 4 * 1024 * 1024), 65536, 32 * 1024 * 1024);

// Caminho do alvo: letra de unidade, sem aspas/metacaracteres de shell.
const TARGET_RE = /^[A-Za-z]:[\\/][A-Za-z0-9 ._\\/()\-]{1,240}$/;

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** Raízes onde o REA pode ler. Fora delas o alvo é recusado. */
export function allowedRoots() {
  const extra = String(process.env.REA_ALLOWED_ROOTS || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  return [
    PROJECT_DIR,
    homedir(),
    tmpdir(),
    "C:\\Program Files",
    "C:\\Program Files (x86)",
    ...extra,
  ]
    .filter(Boolean)
    .map((root) => resolve(root));
}

function underRoot(target) {
  return allowedRoots().some((root) => {
    const normalizedRoot = root.endsWith(sep) ? root : root + sep;
    return target === root || target.toLowerCase().startsWith(normalizedRoot.toLowerCase());
  });
}

/**
 * Valida o alvo informado. Não lança: devolve { ok, path, type } ou { ok:false, error }.
 */
export async function validateTarget(input) {
  if (typeof input !== "string" || !input.trim()) {
    return { ok: false, error: "Informe o caminho do artefato a analisar." };
  }
  const raw = input.trim().replace(/^"+|"+$/g, "");
  if (!isAbsolute(raw)) {
    return { ok: false, error: "Use caminho absoluto (ex: C:\\Users\\Jean\\Downloads\\app.asar)." };
  }
  if (!TARGET_RE.test(raw)) {
    return {
      ok: false,
      error: "Caminho recusado: use apenas letras, números, espaço, ponto, hífen, parênteses, barra e barra invertida.",
    };
  }
  const target = resolve(raw);
  if (!underRoot(target)) {
    return {
      ok: false,
      error: "Alvo fora das raízes permitidas. Libere outra raiz em REA_ALLOWED_ROOTS (separadas por ';').",
    };
  }
  try {
    const info = await stat(target);
    return { ok: true, path: target, type: info.isDirectory() ? "directory" : "file", size: info.size };
  } catch {
    return { ok: false, error: `Alvo não encontrado: ${target}` };
  }
}

function quoteToken(token) {
  const value = String(token);
  if (/^[A-Za-z0-9._\\/:=@+-]+$/.test(value)) return value;
  return `"${value}"`;
}

function buildCommandLine(argv, args = []) {
  return [...argv, ...args].map(quoteToken).join(" ");
}

function whereRea() {
  return new Promise((resolvePath) => {
    try {
      execFile("where.exe", ["rea"], { windowsHide: true, timeout: 5000 }, (error, stdout) => {
        if (error) return resolvePath(null);
        const first = String(stdout || "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find(Boolean);
        resolvePath(first || null);
      });
    } catch {
      resolvePath(null);
    }
  });
}

/**
 * Decide como chamar o REA.
 * Ordem: REA_COMMAND → node_modules/.bin/rea.cmd → `rea` no PATH → npx (baixa na 1ª vez).
 * Devolve argv (não string) para que cada token seja citado individualmente.
 */
export async function resolveRea() {
  const forced = String(process.env.REA_COMMAND || "").trim();
  if (forced) {
    return { mode: "custom", argv: [forced], display: forced, installed: true, needsNetwork: false };
  }
  const localBins = [
    join(PROJECT_DIR, "node_modules", ".bin", "rea.cmd"),
    join(PROJECT_DIR, "v10", "node_modules", ".bin", "rea.cmd"),
    join(PROJECT_DIR, "mcp-server", "node_modules", ".bin", "rea.cmd"),
  ];
  for (const bin of localBins) {
    if (existsSync(bin)) {
      return { mode: "local", argv: [bin], display: bin, installed: true, needsNetwork: false };
    }
  }
  const onPath = await whereRea();
  if (onPath) {
    return { mode: "path", argv: [onPath], display: onPath, installed: true, needsNetwork: false };
  }
  return {
    mode: "npx",
    argv: ["npx", "-y", REA_PACKAGE],
    display: `npx -y ${REA_PACKAGE}`,
    installed: false,
    needsNetwork: true,
  };
}

/**
 * Executa uma linha de comando já montada. shell:true com UMA string evita o
 * reescape de aspas que o spawn aplica a argumentos no Windows.
 */
function runCommandLine(commandLine, { timeoutMs }) {
  return new Promise((resolveRun) => {
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun({
        commandLine,
        durationMs: Date.now() - startedAt,
        timedOut,
        truncated,
        stdout: truncated ? stdout.slice(0, MAX_OUTPUT_BYTES) : stdout,
        stderr: stderr.slice(0, 16384),
        ...payload,
      });
    };

    const child = spawn(commandLine, {
      shell: true,
      windowsHide: true,
      cwd: PROJECT_DIR,
      env: { ...process.env, MESTRE_PROJETO_PATH: PROJECT_DIR },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch { /* já saiu */ }
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      if (truncated) return;
      stdout += chunk.toString();
      if (stdout.length > MAX_OUTPUT_BYTES) {
        truncated = true;
        stdout = stdout.slice(0, MAX_OUTPUT_BYTES);
      }
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 16384) stderr += chunk.toString();
    });
    child.on("error", (error) => finish({ ok: false, code: null, error: error.message }));
    child.on("close", (code) => finish({ ok: code === 0 && !timedOut, code }));
  });
}

function tryParseJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch { /* saída pode ter log antes do JSON */ }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch { /* não é JSON */ }
  }
  return null;
}

/**
 * Estado do REA nesta máquina. Não baixa nada: só detecta e, se já instalado,
 * pergunta a versão.
 */
export async function reaStatus() {
  const how = await resolveRea();
  let version = null;
  let probeError = null;
  if (how.installed) {
    const probe = await runCommandLine(buildCommandLine(how.argv, ["--version"]), {
      timeoutMs: STATUS_TIMEOUT_MS,
    });
    const text = (probe.stdout || probe.stderr || "").trim();
    version = text ? text.split(/\r?\n/)[0].slice(0, 120) : null;
    if (!probe.ok) probeError = (probe.stderr || "falha ao executar --version").slice(0, 400);
  }
  return {
    available: true,
    mode: how.mode,
    command: how.display,
    installed: how.installed,
    needsNetwork: how.needsNetwork,
    version,
    probeError,
    package: REA_PACKAGE,
    docs: REA_DOCS_URL,
    projectDir: PROJECT_DIR,
    allowedRoots: allowedRoots(),
    capabilities: {
      javascriptApplication: true,
      doctor: true,
      nativeBinary: false,
      note: "Binários nativos usam o servidor MCP do REA (open_binary/Ghidra), fora do launcher.",
    },
    hint: how.needsNetwork
      ? "REA não instalado: a primeira análise baixa o pacote via npx (precisa de rede). Para fixar a versão: npm i -g rea-agents@6.8.0."
      : "REA local detectado.",
  };
}

/** Roda `rea doctor --json`. Read-only; instala nada. */
export async function reaDoctor() {
  const how = await resolveRea();
  const result = await runCommandLine(buildCommandLine(how.argv, ["doctor", "--json"]), {
    timeoutMs: DOCTOR_TIMEOUT_MS,
  });
  const report = tryParseJson(result.stdout) || tryParseJson(result.stderr);
  try {
    await auditLog(AuditLevel.SECURITY, "rea_doctor", {
      mode: how.mode,
      ok: result.ok,
      code: result.code,
      durationMs: result.durationMs,
    });
  } catch { /* auditoria indisponível não impede o diagnóstico */ }
  return {
    ok: result.ok,
    mode: how.mode,
    command: result.commandLine,
    durationMs: result.durationMs,
    timedOut: result.timedOut,
    report,
    stdout: report ? "" : result.stdout.slice(0, 6000),
    stderr: result.stderr,
    hint: result.ok ? undefined : "Falhou. Veja stderr; sem rede a primeira execução do npx não baixa o pacote.",
  };
}

/**
 * Analisa uma aplicação JavaScript/Electron entregue (árvore extraída, .asar,
 * ou pasta de projeto com asar/build). Devolve a Evidência do REA.
 */
export async function reaAnalyzeAppJs({ target } = {}) {
  const check = await validateTarget(target);
  if (!check.ok) {
    return { ok: false, stage: "validation", error: check.error, allowedRoots: allowedRoots() };
  }
  const how = await resolveRea();
  // Flags do CLI do REA são fixas de propósito: nada de inventar opção que a
  // versão pinada não aceita. Saída completa vem em um único --json.
  const args = ["analyze-javascript-application", check.path, "--json"];
  const result = await runCommandLine(buildCommandLine(how.argv, args), {
    timeoutMs: ANALYZE_TIMEOUT_MS,
  });
  const evidence = tryParseJson(result.stdout);
  try {
    await auditLog(AuditLevel.SECURITY, "rea_analyze", {
      target: check.path,
      targetType: check.type,
      mode: how.mode,
      ok: result.ok,
      code: result.code,
      durationMs: result.durationMs,
      evidenceId: evidence?.evidence_id || evidence?.id || null,
    });
  } catch { /* segue */ }
  return {
    ok: result.ok,
    stage: result.ok ? "analysis" : "execution",
    target: check.path,
    targetType: check.type,
    mode: how.mode,
    command: result.commandLine,
    durationMs: result.durationMs,
    timedOut: result.timedOut,
    truncated: result.truncated,
    evidence,
    stdout: evidence ? "" : result.stdout.slice(0, 8000),
    stderr: result.stderr,
    hint:
      result.ok && !evidence
        ? "O comando terminou sem JSON: leia stdout e rode de novo com --json."
        : undefined,
  };
}

export default { reaStatus, reaDoctor, reaAnalyzeAppJs, validateTarget, resolveRea, allowedRoots };

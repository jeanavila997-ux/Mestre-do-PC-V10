/**
 * dsh-bridge.js — Ponte do Mestre do PC com o DeepSeek Harness (dsh).
 *
 * O dsh roda uma tarefa em modo headless (`headless --patch <patch> --json <task>`)
 * e devolve eventos NDJSON. Este módulo monta a linha de comando, gera o patch de
 * provedor antes de cada tentativa e percorre uma cadeia de provedores quando um falha.
 *
 * Regras de segurança desta ponte:
 *  - tarefa obrigatória (1..8000 caracteres);
 *  - cwd absoluto, existente, sem `..`, fora de diretórios de sistema
 *    (C:\Windows, System32) e dentro das raízes permitidas;
 *  - a linha de comando é montada por nós e passada ao shell como UMA string,
 *    porque no Windows `spawn` reescapa aspas de argumentos (verificado);
 *  - a chave do provedor NUNCA aparece em patch, log ou resposta: o patch guarda
 *    só o NOME da variável (`apiKeyEnv`) e o valor vai pelo ambiente do filho;
 *  - saída limitada a ~2 MiB e 200 eventos para não estourar a memória;
 *  - toda execução é auditada em nível SECURITY.
 *
 * Uso típico:
 *   dshStatus()        → instalação, home e cadeia visível de provedores
 *   providerChain()    → ordem da cascata, só quem tem credencial
 *   runTask({ task })  → executa com cascata e devolve texto + tentativas
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { auditLog, AuditLevel } from "../mcp-server/audit-logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_DIR = resolve(__dirname, "..");

export const DSH_VERSION = "0.2.2-rc.1";
export const DSH_PACKAGE = `@deepseek-ai/dsh@${DSH_VERSION}`;

const ATTEMPT_TIMEOUT_MS = clamp(Number(process.env.MPC_DSH_TIMEOUT_MS || 300000), 30000, 1800000);
const RETRY_ROUNDS = clamp(Number(process.env.MPC_DSH_RETRY_ROUNDS ?? 2), 0, 5);
const RETRY_WAIT_MS = 300000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_EVENTS = 200;
const MAX_STRING = 8 * 1024;
const MAX_TASK = 8000;
const MAX_STDERR = 16 * 1024;

/** Caminho do .env.local. MPC_DSH_ENV_FILE existe para testes isolarem o arquivo. */
const ENV_FILE = process.env.MPC_DSH_ENV_FILE || join(PROJECT_DIR, ".env.local");

/**
 * Cadeia de provedores, na ordem da cascata. `local` dispensa chave (Ollama).
 * `displayName`/`api` alimentam a row `llm-pi-ai` do patch YAML.
 */
const PROVIDERS = [
  {
    id: "grok",
    displayName: "Grok (xAI)",
    api: "openai-completions",
    envKey: "XAI_API_KEY",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-4.7",
  },
  {
    id: "9router",
    displayName: "9Router",
    api: "openai-completions",
    envKey: "NINEROUTER_API_KEY",
    baseUrl: "http://127.0.0.1:20128/v1",
    model: "deepseek/deepseek-v4-flash",
  },
  {
    id: "opencode",
    displayName: "OpenCode (Zen)",
    api: "openai-completions",
    envKey: "OPENCODE_API_KEY",
    baseUrl: "https://opencode.ai/zen/v1",
    model: "",
  },
  {
    id: "opencode-go",
    displayName: "OpenCode Go",
    api: "openai-completions",
    envKey: "OPENCODE_GO_API_KEY",
    baseUrl: "https://opencode.ai/inference/go/openai/v1",
    model: "kimi-k2.7-code",
  },
  {
    id: "ollama",
    displayName: "Ollama (local)",
    api: "openai-completions",
    envKey: null,
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "qwen2.5-coder:3b-instruct",
    local: true,
  },
  {
    id: "deepseek",
    displayName: "DeepSeek",
    api: "openai-completions",
    envKey: "DEEPSEEK_API_KEY",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
];

// Diretórios onde o dsh não pode trabalhar, mesmo que estejam sob uma raiz liberada.
const DENIED_ROOTS = [
  "C:\\Windows",
  "C:\\Windows\\System32",
  "C:\\Windows\\SysWOW64",
  "C:\\Program Files\\WindowsApps",
];

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
}

/** Raízes onde o dsh pode trabalhar. Fora delas o cwd é recusado. */
export function allowedRoots() {
  const extra = String(process.env.MPC_DSH_ALLOWED_ROOTS || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  return [PROJECT_DIR, homedir(), tmpdir(), ...extra].filter(Boolean).map((root) => resolve(root));
}

function underRoot(target, roots) {
  return roots.some((root) => {
    const normalizedRoot = root.endsWith(sep) ? root : root + sep;
    return target === root || target.toLowerCase().startsWith(normalizedRoot.toLowerCase());
  });
}

function isSystemPath(target) {
  const roots = [...DENIED_ROOTS, process.env.SystemRoot || "C:\\Windows"].map((root) => resolve(root));
  if (underRoot(target, roots)) return true;
  return /^[A-Za-z]:\\?$/.test(target);
}

/** Home do dsh. Fica fora do repositório: patches e sessões não são versionados. */
export function dshHome(deps = {}) {
  const env = deps.env || process.env;
  const override = String(env.MPC_DSH_HOME || "").trim();
  if (override) return resolve(override);
  return join(env.LOCALAPPDATA || tmpdir(), "MestreDoPC", "dsh-home");
}

/**
 * Lê o .env.local no formato CHAVE=valor (CRLF ou LF). Devolve um objeto.
 * Nunca imprime nem devolve valores fora deste módulo.
 */
function readEnvFile(file) {
  if (!file || !existsSync(file)) return {};
  try {
    const out = {};
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      out[key] = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

function envFileFor(deps) {
  if (deps.envFile === null) return {};
  return readEnvFile(deps.envFile || ENV_FILE);
}

/** Valor resolvido de uma credencial: ambiente do processo vence o .env.local. */
function secret(envKey, env, file) {
  if (!envKey) return "";
  const value = String(env[envKey] || file[envKey] || "").trim();
  return value;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Store vivo da tela "Chaves de API & Provedores" (JSON). Pode estar corrompido:
 * qualquer falha devolve {} — esta ponte nunca lança por causa do store.
 */
function readProviderStore(deps = {}) {
  if (deps.providersFile === null) return {};
  const env = deps.env || process.env;
  const file = deps.providersFile || env.MPC_DSH_PROVIDERS_FILE || join(PROJECT_DIR, "v10", "data", "providers.json");
  try {
    if (!existsSync(file)) return {};
    const data = JSON.parse(readFileSync(file, "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function storeEntries(store) {
  const providers = store && typeof store.providers === "object" && store.providers ? store.providers : {};
  return providers;
}

function storeEntry(entries, id) {
  const value = entries[id];
  return value && typeof value === "object" ? value : {};
}

/** Chave do provedor: env do processo → .env.local → store da UI. Nunca sai daqui. */
function credentialFor(provider, env, file, entries) {
  return secret(provider.envKey, env, file) || text(storeEntry(entries, provider.id).apiKey);
}

/**
 * Resolve a cadeia e o que ficou de fora. O store da UI tem precedência prática:
 * baseUrl/model salvos vencem os defaults; apiKey salvo conta como credencial;
 * `enabled: false` remove o provedor. Provedor sem model também sai, porque o
 * patch precisa da row `agent-default-model` — o motivo vai em `skipped`.
 */
function resolveProviders(deps = {}) {
  const env = deps.env || process.env;
  const file = envFileFor(deps);
  const entries = storeEntries(readProviderStore(deps));
  const chain = [];
  const skipped = [];
  for (const base of PROVIDERS) {
    const saved = storeEntry(entries, base.id);
    if (saved.enabled === false) {
      skipped.push({ id: base.id, reason: "desativado na tela de provedores" });
      continue;
    }
    const credential = credentialFor(base, env, file, entries);
    if (!base.local && !credential) {
      skipped.push({ id: base.id, reason: `sem credencial (${base.envKey})` });
      continue;
    }
    const model = text(saved.model) || base.model || "";
    if (!model) {
      skipped.push({ id: base.id, reason: "sem model resolvido (faltaria agent-default-model)" });
      continue;
    }
    chain.push({
      id: base.id,
      label: base.displayName || base.id,
      displayName: base.displayName || base.id,
      api: base.api || "openai-completions",
      envKey: base.envKey,
      baseUrl: text(saved.baseUrl) || base.baseUrl,
      model,
      local: Boolean(base.local),
      ready: true,
    });
  }
  return { chain, skipped };
}

/**
 * Ordem efetiva da cascata: só provedores com credencial e model resolvidos.
 * `ready: true` porque a cadeia já é o subconjunto utilizável; `label` alimenta
 * as tools do chat (v10/chat-integrado/tools-api.js). A chave nunca sai daqui.
 */
export function providerChain(deps = {}) {
  return resolveProviders(deps).chain;
}

/** Caminho do dsh: MPC_DSH_COMMAND → node_modules/.bin → npx (baixa na 1ª vez). */
function resolveDsh(deps = {}) {
  const env = deps.env || process.env;
  const forced = String(env.MPC_DSH_COMMAND || "").trim();
  if (forced) {
    return { mode: "custom", argv: [forced], display: forced, installed: true };
  }
  const localBins = [
    join(PROJECT_DIR, "node_modules", ".bin", "dsh.cmd"),
    join(PROJECT_DIR, "v10", "node_modules", ".bin", "dsh.cmd"),
    join(PROJECT_DIR, "mcp-server", "node_modules", ".bin", "dsh.cmd"),
  ];
  for (const bin of localBins) {
    if (existsSync(bin)) return { mode: "local", argv: [bin], display: bin, installed: true };
  }
  return { mode: "npx", argv: ["npx", "-y", DSH_PACKAGE], display: `npx -y ${DSH_PACKAGE}`, installed: false };
}

/** Cita um token só quando necessário; o shell recebe tudo como uma única string. */
function quoteToken(token) {
  const value = String(token);
  if (/^[A-Za-z0-9._\\/:=@+-]+$/.test(value)) return value;
  return `"${value}"`;
}

function buildCommandLine(argv, args = []) {
  return [...argv, ...args].map(quoteToken).join(" ");
}

/** Valor YAML simples: aspas só quando necessário (JSON é YAML válido). */
function yamlScalar(value) {
  const text = String(value);
  if (/^[A-Za-z0-9][A-Za-z0-9 ._/:\-()]*$/.test(text) && !text.includes(": ")) return text;
  return JSON.stringify(text);
}

/**
 * Patch YAML do provedor. O dsh endereça rows por `id:` e SUBSTITUI o `config`
 * inteiro (sem merge), então o patch traz as três rows completas:
 *   1. llm-pi-ai            — adapter e credencial do provedor;
 *   2. agent-default-model  — modelo default do agente (sem ela o agente não sabe o que usar);
 *   3. session-log-deepseek — desliga o upload do log da sessão.
 * Só o NOME da variável da chave entra aqui; o valor vai pelo env do filho.
 */
function patchYaml(provider) {
  const lines = [
    "# Patch gerado pelo Mestre do PC — sobrescrito a cada tentativa.",
    `# Provedor: ${provider.id}`,
    "- id: llm-pi-ai",
    "  config:",
    "    providers:",
    `      ${provider.id}:`,
    `        displayName: ${yamlScalar(provider.displayName || provider.id)}`,
    `        api: ${provider.api || "openai-completions"}`,
    `        baseURL: ${yamlScalar(provider.baseUrl)}`,
  ];
  if (provider.envKey) lines.push(`        apiKeyEnv: ${provider.envKey}`);
  if (provider.model) {
    lines.push("        models:", `          - id: ${yamlScalar(provider.model)}`);
    lines.push(
      "",
      "- id: agent-default-model",
      "  config:",
      `    provider: ${provider.id}`,
      `    model: ${yamlScalar(provider.model)}`,
    );
  }
  lines.push("", "- id: session-log-deepseek", "  config:", "    enabled: false");
  return lines.join("\n") + "\n";
}

async function writePatch(home, provider) {
  const dir = join(home, "patches");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${provider.id}.yml`);
  await writeFile(file, patchYaml(provider), { encoding: "utf8", mode: 0o600 });
  return file;
}

/** Estado local do dsh. Síncrono: só olha o disco, não baixa nada. */
export function dshStatus(deps = {}) {
  const how = resolveDsh(deps);
  const home = dshHome(deps);
  const { chain, skipped } = resolveProviders(deps);
  return {
    ok: true,
    // installed = há binário local; available = o modo atual alcança o dsh (npx baixa na 1ª vez).
    installed: how.installed,
    available: true,
    version: DSH_VERSION,
    mode: how.mode,
    home,
    providers: chain,
    skipped,
    command: `${how.display} headless --patch <patchFile> --json "<task>"`,
    package: DSH_PACKAGE,
    timeoutMs: clamp(Number((deps.env || process.env).MPC_DSH_TIMEOUT_MS || ATTEMPT_TIMEOUT_MS), 30000, 1800000),
    retryRounds: clamp(Number((deps.env || process.env).MPC_DSH_RETRY_ROUNDS ?? RETRY_ROUNDS), 0, 5),
    patchDir: join(home, "patches"),
  };
}

/**
 * Valida a entrada. Não lança: devolve { ok, task, cwd } ou { ok:false, error }.
 */
export async function validateTask({ task, cwd } = {}) {
  if (typeof task !== "string" || !task.trim()) {
    return { ok: false, error: "Informe a tarefa a executar." };
  }
  const text = task.trim();
  if (text.length > MAX_TASK) {
    return { ok: false, error: `Tarefa muito longa: máximo de ${MAX_TASK} caracteres.` };
  }

  const rawCwd = cwd === undefined || cwd === null ? "" : String(cwd).trim();
  const target = rawCwd ? resolve(rawCwd) : PROJECT_DIR;
  if (rawCwd) {
    if (!isAbsolute(rawCwd)) {
      return { ok: false, error: "Use caminho absoluto para cwd (ex: C:\\Users\\Jean\\Projetos\\app)." };
    }
    if (/(^|[\\/])\.\.([\\/]|$)/.test(rawCwd)) {
      return { ok: false, error: "cwd recusado: não pode conter '..'." };
    }
    if (isSystemPath(target)) {
      return { ok: false, error: "cwd recusado: diretório de sistema sensível (Windows/System32)." };
    }
    if (!underRoot(target, allowedRoots())) {
      return {
        ok: false,
        error: "cwd fora das raízes permitidas. Libere outra raiz em MPC_DSH_ALLOWED_ROOTS (separadas por ';').",
      };
    }
    try {
      const info = await stat(target);
      if (!info.isDirectory()) return { ok: false, error: `cwd não é uma pasta: ${target}` };
    } catch {
      return { ok: false, error: `cwd não encontrado: ${target}` };
    }
  }
  return { ok: true, task: text, cwd: target };
}

function trimStrings(value, depth = 0) {
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…(truncado)` : value;
  }
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => trimStrings(item, depth + 1));
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = trimStrings(item, depth + 1);
  return out;
}

function isFinalEvent(event) {
  return event.type === "final" || event.kind === "final" || event.final === true || Boolean(event?.reason?.kind);
}

/**
 * Lê o stdout do dsh como NDJSON. Guarda no máximo `maxEvents` eventos (os mais
 * recentes), trunca strings longas e extrai texto, sessionId e motivo do último
 * `final`. Linhas que não são JSON (avisos do npx) são ignoradas.
 */
export function parseEvents(stdout, { maxEvents = MAX_EVENTS } = {}) {
  const events = [];
  let dropped = 0;
  for (const rawLine of String(stdout || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line[0] !== "{") continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!event || typeof event !== "object") continue;
    events.push(trimStrings(event));
    if (events.length > maxEvents) {
      events.shift();
      dropped += 1;
    }
  }
  const finals = events.filter(isFinalEvent);
  const final = finals.length ? finals[finals.length - 1] : null;
  const last = events.length ? events[events.length - 1] : null;
  const session = [...events].reverse().find((event) => event.type === "session" || event.sessionId || event.session_id) || null;
  const rawText = final?.text ?? final?.result?.text ?? final?.output ?? "";
  return {
    events,
    dropped,
    final,
    last,
    lastIsFinal: Boolean(last && isFinalEvent(last)),
    text: typeof rawText === "string" ? rawText : "",
    sessionId: session?.sessionId || session?.session_id || session?.id || final?.sessionId || null,
    reasonKind: final?.reason?.kind ?? final?.reasonKind ?? null,
  };
}

/** Mata o processo e os filhos. No Windows o shell do npx deixa netos vivos. */
function killTree(child) {
  if (!child) return;
  try {
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" }).on(
        "error",
        () => {
          try {
            child.kill();
          } catch {
            /* já saiu */
          }
        },
      );
      return;
    }
    child.kill("SIGTERM");
  } catch {
    try {
      child.kill();
    } catch {
      /* já saiu */
    }
  }
}

/**
 * Executa uma linha de comando já montada. shell:true com UMA string evita o
 * reescape de aspas que o spawn aplica a argumentos no Windows.
 */
function runCommandLine(commandLine, { timeoutMs, cwd, env }) {
  return new Promise((resolveRun) => {
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let bytes = 0;
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
        stderr: stderr.slice(0, MAX_STDERR),
        ...payload,
      });
    };

    const child = spawn(commandLine, {
      shell: true,
      windowsHide: true,
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      if (truncated) return;
      bytes += chunk.length;
      stdout += chunk.toString();
      if (bytes > MAX_OUTPUT_BYTES) {
        truncated = true;
        killTree(child);
      }
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < MAX_STDERR) stderr += chunk.toString();
    });
    child.on("error", (error) => finish({ ok: false, code: null, error: error.message }));
    child.on("close", (code) => finish({ ok: code === 0 && !timedOut && !truncated, code }));
  });
}

function defaultSleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

/**
 * stderr do dsh é sempre `dsh: <CODE>: <msg>`. Devolve { code, message } ou null.
 * O código (AUTH, MISSING_CREDENTIAL, ...) é útil no diagnóstico da cascata.
 */
function parseDshError(stderr) {
  const match = /dsh:\s*([A-Z][A-Z0-9_]*)\s*:\s*([^\r\n]*)/.exec(String(stderr || ""));
  if (!match) return null;
  return { code: match[1], message: match[2].trim().slice(0, 300) };
}

/**
 * Motivo legível da falha. `coldStart` marca a primeira tentativa da primeira
 * rodada: npx -y baixa ~739 MB na estreia (~125 s medidos) e pode estourar o
 * orçamento antes do runner existir.
 */
function failureMessage(result, parsed, { coldStart = false, dshError = null } = {}) {
  if (result.error) return result.error;
  if (result.timedOut) {
    const seconds = Math.round((result.durationMs || 0) / 1000);
    return coldStart
      ? `Tempo esgotado após ${seconds}s na primeira execução (cold start: o npx baixa ~739 MB na estreia; rode de novo ou aumente MPC_DSH_TIMEOUT_MS).`
      : `Tempo esgotado após ${seconds}s.`;
  }
  if (result.truncated) return `Saída do dsh excedeu ${Math.round(MAX_OUTPUT_BYTES / (1024 * 1024))} MiB; processo encerrado.`;
  if (dshError) return `dsh falhou (${dshError.code}): ${dshError.message || "sem detalhe"}`;
  if (parsed.reasonKind && parsed.reasonKind !== "completed") {
    return `dsh terminou com motivo "${parsed.reasonKind}".`;
  }
  if (result.code !== 0) {
    const detail = String(result.stderr || "").trim().split(/\r?\n/)[0] || "sem stderr";
    return `dsh saiu com código ${result.code}: ${detail.slice(0, 300)}`;
  }
  if (parsed.reasonKind !== "completed") return `dsh terminou com motivo "${parsed.reasonKind || "desconhecido"}".`;
  if (!parsed.lastIsFinal) return "dsh saiu com código 0 sem evento final: o turno não concluiu.";
  return "dsh não concluiu a tarefa.";
}

/**
 * Executa a tarefa em cascata. Falha de provedor não lança: devolve o resultado
 * com a lista de tentativas. Só entrada inválida lança (erro de validação).
 *
 * deps.run(commandLine, { timeoutMs, cwd, env }) existe para testes.
 */
export async function runTask(opts = {}, deps = {}) {
  const check = await validateTask(opts);
  if (!check.ok) {
    const error = new Error(check.error);
    error.code = "DSH_VALIDATION";
    throw error;
  }

  const startedAt = Date.now();
  const env = deps.env || process.env;
  const file = envFileFor(deps);
  const home = deps.home || dshHome(deps);
  const run = deps.run || runCommandLine;
  const sleep = deps.sleep || defaultSleep;
  const timeoutMs = clamp(Number(opts.timeoutMs ?? env.MPC_DSH_TIMEOUT_MS ?? ATTEMPT_TIMEOUT_MS), 30000, 1800000);
  const how = resolveDsh(deps);

  const { chain, skipped } = resolveProviders(deps);
  const entries = storeEntries(readProviderStore(deps));
  const preferred = typeof opts.provider === "string" ? opts.provider.trim() : "";
  let order = chain;
  if (preferred) {
    const chosen = chain.find((provider) => provider.id === preferred);
    if (!chosen) {
      const known = PROVIDERS.some((provider) => provider.id === preferred);
      const skip = skipped.find((item) => item.id === preferred);
      return {
        ok: false,
        provider: preferred,
        model: null,
        text: "",
        sessionId: null,
        attempts: [],
        ms: Date.now() - startedAt,
        error: !known
          ? `Provedor desconhecido: ${preferred}.`
          : skip
            ? `Provedor "${preferred}" fora da cascata: ${skip.reason}.`
            : `Provedor "${preferred}" indisponível.`,
      };
    }
    order = [chosen, ...chain.filter((provider) => provider.id !== preferred)];
  }
  if (!order.length) {
    return {
      ok: false,
      provider: null,
      model: null,
      text: "",
      sessionId: null,
      attempts: [],
      ms: Date.now() - startedAt,
      error: "Nenhum provedor com credencial e model configurados para o dsh.",
      skipped,
    };
  }

  const attempts = [];
  const retryRounds = clamp(Number(env.MPC_DSH_RETRY_ROUNDS ?? RETRY_ROUNDS), 0, 5);
  const rounds = opts.retry === true ? retryRounds + 1 : 1;
  const childBase = { ...(deps.baseEnv || process.env), ...(deps.env || {}) };
  let lastError = null;

  for (let round = 0; round < rounds; round += 1) {
    for (let index = 0; index < order.length; index += 1) {
      const provider = order[index];
      const coldStart = round === 0 && index === 0;
      const attemptStartedAt = Date.now();
      const attempt = { provider: provider.id, ok: false, code: null, ms: 0 };
      try {
        const patchFile = await writePatch(home, provider);
        // Ordem de argv do dsh: flags do launcher (--patch) ANTES de --json;
        // o texto da tarefa vai por último, como um único argumento citado.
        const commandLine = buildCommandLine(how.argv, ["headless", "--patch", patchFile, "--json", check.task]);
        const childEnv = {
          ...childBase,
          DSH_HOME: home,
          DSH_TELEMETRY_MODE: "DISABLED",
        };
        // A chave vai só pelo ambiente do filho — nunca no patch, log ou retorno.
        // Fontes: env do processo → .env.local → store da UI. Env vazia NÃO é
        // exportada: `XAI_API_KEY=""` sombreia o .env do dsh e vira
        // MISSING_CREDENTIAL.
        if (provider.envKey) {
          const key = credentialFor(provider, env, file, entries);
          if (key) childEnv[provider.envKey] = key;
          else delete childEnv[provider.envKey];
        }
        const result = await run(commandLine, { timeoutMs, cwd: check.cwd, env: childEnv });
        attempt.ms = Date.now() - attemptStartedAt;
        attempt.exitCode = result?.code ?? null;
        attempt.durationMs = result?.durationMs ?? attempt.ms;
        const parsed = parseEvents(result?.stdout);
        const dshError = parseDshError(result?.stderr);
        attempt.reasonKind = parsed.reasonKind;
        // O código do dsh (AUTH, MISSING_CREDENTIAL, ...) vence o exit code.
        attempt.code = dshError?.code ?? attempt.exitCode;
        // Sucesso exige exit 0 E a ÚLTIMA linha NDJSON ser um final "completed":
        // falha dentro do turno também emite final (com text vazio).
        const done =
          Boolean(result?.ok) &&
          !result?.timedOut &&
          !result?.truncated &&
          parsed.lastIsFinal &&
          parsed.reasonKind === "completed";
        if (done) {
          attempt.ok = true;
          attempts.push(attempt);
          const output = {
            ok: true,
            provider: provider.id,
            model: provider.model || null,
            text: parsed.text,
            sessionId: parsed.sessionId,
            attempts,
            ms: Date.now() - startedAt,
          };
          try {
            await auditLog(AuditLevel.SECURITY, "dsh_run", {
              provider: provider.id,
              ok: true,
              code: attempt.code,
              cwd: check.cwd,
              taskLength: check.task.length,
              durationMs: output.ms,
              rounds: round + 1,
            });
          } catch {
            /* auditoria indisponível não invalida a tarefa */
          }
          return output;
        }
        attempt.error = failureMessage(result || {}, parsed, { coldStart, dshError });
        lastError = attempt.error;
        attempts.push(attempt);
      } catch (error) {
        attempt.ms = Date.now() - attemptStartedAt;
        attempt.error = error.message;
        lastError = error.message;
        attempts.push(attempt);
      }
    }
    if (round < rounds - 1) await sleep(RETRY_WAIT_MS);
  }

  const output = {
    ok: false,
    provider: null,
    model: null,
    text: "",
    sessionId: null,
    attempts,
    ms: Date.now() - startedAt,
    error: lastError || "dsh não concluiu a tarefa.",
  };
  try {
    await auditLog(AuditLevel.SECURITY, "dsh_run", {
      providers: order.map((provider) => provider.id),
      ok: false,
      cwd: check.cwd,
      taskLength: check.task.length,
      durationMs: output.ms,
      attempts: attempts.length,
      rounds,
    });
  } catch {
    /* segue */
  }
  return output;
}

export const __testables = { parseEvents, parseDshError, buildCommandLine, patchYaml, quoteToken };

export default { dshStatus, providerChain, runTask, validateTask, allowedRoots, dshHome, DSH_VERSION };

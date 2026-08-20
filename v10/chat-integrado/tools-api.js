/**
 * tools-api.js — Ponte entre as ferramentas do MCP e o launcher HTTP
 *
 * Importa diretamente security.js, audit-logger.js e model-profiles.json
 * do mcp-server, e implementa as 24 ferramentas MCP como funções chamáveis
 * via HTTP (endpoint /api/tools no launcher.js).
 *
 * Isso permite que o Chat Integrado (web) acesse todas as ferramentas MCP
 * sem precisar do transporte stdio do MCP server.
 */

import { checkPromptInjection, sanitizeToolArgument } from "../../mcp-server/security.js";
import { auditLog, queryAuditLog, exportAuditReport, AuditLevel } from "../../mcp-server/audit-logger.js";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_DIR = join(__dirname, "..", "..", "mcp-server");

// ── Configuração ────────────────────────────────────────────────────

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || "";
const OLLAMA_BASE = OLLAMA_API_KEY ? "https://ollama.com/api" : OLLAMA_URL;
const MESTRE_BASE_URL = process.env.MESTRE_BASE_URL || "http://127.0.0.1:7777";

// Carregar perfis de modelo
let modelProfiles = { defaultProfile: "balanced", profiles: {} };
try {
  const raw = await readFile(join(MCP_DIR, "model-profiles.json"), "utf8");
  modelProfiles = JSON.parse(raw);
} catch { /* profiles opcionais */ }

const activeProfile = process.env.OLLAMA_MODEL_PROFILE || modelProfiles.defaultProfile || "balanced";

// ── Helpers internos ────────────────────────────────────────────────

function getProfileModel(profile = activeProfile) {
  const p = modelProfiles.profiles[profile];
  return process.env.OLLAMA_MODEL || p?.model || "qwen2.5-coder:3b-instruct";
}

function getProfileOptions(profile = activeProfile) {
  const p = modelProfiles.profiles[profile];
  if (!p?.options) return {};
  const opts = { ...p.options };
  if (process.env.OLLAMA_NUM_CTX) opts.num_ctx = Number(process.env.OLLAMA_NUM_CTX);
  if (process.env.OLLAMA_TEMPERATURE) opts.temperature = Number(process.env.OLLAMA_TEMPERATURE);
  if (process.env.OLLAMA_TOP_P) opts.top_p = Number(process.env.OLLAMA_TOP_P);
  if (process.env.OLLAMA_TOP_K) opts.top_k = Number(process.env.OLLAMA_TOP_K);
  if (process.env.OLLAMA_NUM_PREDICT) opts.num_predict = Number(process.env.OLLAMA_NUM_PREDICT);
  if (process.env.OLLAMA_SEED) opts.seed = Number(process.env.OLLAMA_SEED);
  if (process.env.OLLAMA_KEEP_ALIVE) opts.keep_alive = process.env.OLLAMA_KEEP_ALIVE;
  return opts;
}

function buildOllamaOptions() {
  return getProfileOptions(activeProfile);
}

function buildHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (OLLAMA_API_KEY) headers["Authorization"] = `Bearer ${OLLAMA_API_KEY}`;
  return headers;
}

function guardPromptInjection(text, toolName = "chat-integrado") {
  const result = checkPromptInjection(text);
  if (result.classification === "malicioso") {
    auditLog(AuditLevel.SECURITY, "prompt_injection_bloqueado", {
      tool: toolName, classification: result.classification, score: result.score,
    });
    return { blocked: true, result };
  }
  if (result.classification === "suspeito") {
    auditLog(AuditLevel.WARNING, "prompt_injection_suspeito", {
      tool: toolName, classification: result.classification, score: result.score,
    });
  }
  return { blocked: false, result };
}

// ── Ollama Chat (não-streaming, para ferramentas) ───────────────────

async function ollamaChat({ messages, system, timeoutMs = 60000, think }) {
  const model = getProfileModel();
  const options = buildOllamaOptions();
  if (think) options.think = true;

  const body = {
    model,
    messages: system ? [{ role: "system", content: system }, ...messages] : messages,
    stream: false,
    options,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(`${OLLAMA_BASE}/chat`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Ollama HTTP ${resp.status}: ${errText.slice(0, 200)}`);
    }
    const data = await resp.json();
    return data.message?.content || "";
  } catch (err) {
    if (err.name === "AbortError") throw new Error(`Ollama timeout após ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Launcher (executar comandos whitelisted) ────────────────────────

async function executeLauncherCommand(payload, options = {}) {
  const headers = { "Content-Type": "application/json", "X-Mestre-Client": "mcp" };
  const resp = await fetch(`${MESTRE_BASE_URL}/run`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (!data.accepted && !data.success) {
    throw new Error(data.output || data.reason || "Comando recusado pelo launcher");
  }

  if (options.dryRun) return data;

  // Polling do resultado
  const jobId = data.jobId;
  if (!jobId) return data;

  const maxAttempts = options.maxAttempts || 120;
  const intervalMs = options.intervalMs || 500;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    const statusResp = await fetch(`${MESTRE_BASE_URL}/run-status?id=${jobId}`, { headers });
    const status = await statusResp.json();
    if (status.done) {
      auditLog(AuditLevel.COMMAND_EXEC, "launcher_exec", {
        operationId: status.operationId,
        success: status.success,
        exitCode: status.exitCode,
      });
      return status;
    }
  }
  throw new Error(`Timeout aguardando comando ${payload.id}`);
}

async function classifyLauncherCommand(cmd) {
  const resp = await fetch(`${MESTRE_BASE_URL}/classify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mestre-Client": "mcp" },
    body: JSON.stringify({ cmd }),
  });
  return resp.json();
}

// ── Busca web (DuckDuckGo) ──────────────────────────────────────────

async function searchWeb(query, maxResults = 5) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  const html = await resp.text();
  const results = [];
  const regex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g;
  let match;
  while ((match = regex.exec(html)) && results.length < maxResults) {
    const title = match[2].replace(/<[^>]*>/g, "").trim();
    let link = match[1];
    if (link.startsWith("//duckduckgo.com/l/?uddg=")) {
      link = decodeURIComponent(link.split("uddg=")[1].split("&")[0]);
    }
    results.push({ title, link });
  }
  return results;
}

// ── RAG Query ───────────────────────────────────────────────────────

async function ragQuery(query, contextDocs = []) {
  const context = contextDocs.map((d, i) => `[Documento ${i + 1}]: ${d}`).join("\n\n");
  const system = `Você é um assistente que responde com base em documentos de contexto fornecidos. Responda em português brasileiro. Se a resposta não estiver nos documentos, diga que não encontrou informação.`;
  const messages = [{ role: "user", content: `Contexto:\n${context}\n\nPergunta: ${query}` }];
  return ollamaChat({ messages, system, timeoutMs: 90000 });
}

// ── Chain of Thought ────────────────────────────────────────────────

async function chainOfThought(problem) {
  const analysis = await ollamaChat({
    messages: [{ role: "user", content: `Analise este problema técnico passo a passo: ${problem}` }],
    system: "Você é um engenheiro de sistemas. Analise problemas em português brasileiro, decompondo em causas possíveis.",
  });
  const solution = await ollamaChat({
    messages: [{ role: "user", content: `Problema: ${problem}\n\nAnálise preliminar:\n${analysis}\n\nForneça a solução definitiva em português brasileiro.` }],
    system: "Você é um engenheiro de sistemas. Forneça soluções técnicas diretas em português brasileiro.",
  });
  return { analise: analysis, solucao: solution };
}

// ── Comparar modelos ────────────────────────────────────────────────

async function compareModels(query, models = []) {
  const defaultModels = models.length ? models : [getProfileModel(), "llama3.1:8b", "mistral:7b"];
  const results = {};
  for (const model of defaultModels) {
    try {
      const resp = await fetch(`${OLLAMA_BASE}/chat`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ model, messages: [{ role: "user", content: query }], stream: false }),
      });
      const data = await resp.json();
      results[model] = data.message?.content || "(sem resposta)";
    } catch (err) {
      results[model] = `Erro: ${err.message}`;
    }
  }
  return results;
}

// ── Análise de código PowerShell ────────────────────────────────────

async function analyzePowerShellCode(code) {
  return ollamaChat({
    messages: [{ role: "user", content: `Analise este código PowerShell e sugira melhorias de segurança e performance:\n\n${code}` }],
    system: "Você é um especialista em PowerShell. Analise código em português brasileiro, focando em segurança, boas práticas e performance.",
  });
}

// ── Webhooks ────────────────────────────────────────────────────────

async function sendDiscordWebhook(webhookUrl, title, message, color = "00ff00") {
  const resp = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{ title, description: message, color: parseInt(color, 16) }],
    }),
  });
  return { success: resp.ok, status: resp.status };
}

async function sendTeamsWebhook(webhookUrl, title, message, theme = "Information") {
  const resp = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ "@type": "MessageCard", "@context": "http://schema.org/extensions", themeColor: "00FF00", title, text: message }),
  });
  return { success: resp.ok, status: resp.status };
}

async function sendSlackWebhook(webhookUrl, message, channel, emoji = ":robot_face:") {
  const resp = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel: channel || undefined, text: `${emoji} ${message}` }),
  });
  return { success: resp.ok, status: resp.status };
}

// ── Monitoramento e alerta ──────────────────────────────────────────

async function monitorAndAlert(webhookUrl, cpuLimite = 80, ramLimite = 80, discoLimite = 90, plataforma = "discord") {
  const resp = await fetch(`${MESTRE_BASE_URL}/status`);
  const s = await resp.json();
  const ramUsada = ((s.ramTotal - s.ramFree) / s.ramTotal) * 100;
  const discoUsado = (s.diskUsed / (s.diskUsed + s.diskFree)) * 100;
  const alerts = [];
  if (s.cpu > cpuLimite) alerts.push(`CPU: ${s.cpu}% (limite: ${cpuLimite}%)`);
  if (ramUsada > ramLimite) alerts.push(`RAM: ${ramUsada.toFixed(1)}% (limite: ${ramLimite}%)`);
  if (discoUsado > discoLimite) alerts.push(`Disco: ${discoUsado.toFixed(1)}% (limite: ${discoLimite}%)`);

  if (!alerts.length) return { alerts: false, message: "Sistema saudável" };

  const msg = `⚠️ Alertas do Mestre do PC:\n${alerts.join("\n")}`;
  if (plataforma === "discord") await sendDiscordWebhook(webhookUrl, "Alerta de Sistema", msg, "f85149");
  else if (plataforma === "teams") await sendTeamsWebhook(webhookUrl, "Alerta de Sistema", msg);
  else if (plataforma === "slack") await sendSlackWebhook(webhookUrl, msg);

  return { alerts: true, message: msg, metrics: { cpu: s.cpu, ramUsada, discoUsado } };
}

// ── Consultar fonte oficial gov ─────────────────────────────────────

async function consultarFonteOficialGov(url, termo) {
  const dominiosPermitidos = ["gov.br", "ibge.gov.br", "embrapa.br", "in.gov.br", "planalto.gov.br", "usp.br", "unicamp.br", "fiocruz.br"];
  const parsed = new URL(url);
  const permitido = dominiosPermitidos.some(d => parsed.hostname.endsWith(d));
  if (!permitido) throw new Error(`Domínio não permitido: ${parsed.hostname}. Use apenas fontes oficiais.`);
  const resp = await fetch(url);
  const html = await resp.text();
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!termo) return text.slice(0, 5000);
  const idx = text.toLowerCase().indexOf(termo.toLowerCase());
  if (idx === -1) return `Termo "${termo}" não encontrado no conteúdo da página.`;
  return text.slice(Math.max(0, idx - 200), idx + 2000);
}

// ── Catálogo de ferramentas ─────────────────────────────────────────

export const TOOLS_API = {
  perguntar_ia: async ({ pergunta, usar_web, pensar }) => {
    const guard = guardPromptInjection(pergunta, "perguntar_ia");
    if (guard.blocked) return { error: "Prompt bloqueado por segurança", details: guard.result };
    let context = "";
    if (usar_web) {
      const results = await searchWeb(pergunta, 3);
      context = results.map(r => r.title).join("; ");
    }
    const system = "Você é o Mestre do PC, assistente especializado em Windows. Responda em português brasileiro de forma direta.";
    const messages = [{ role: "user", content: context ? `${pergunta}\n\nContexto da web: ${context}` : pergunta }];
    const answer = await ollamaChat({ messages, system, think: pensar });
    return { resposta: answer, web_results: usar_web ? await searchWeb(pergunta, 3) : undefined };
  },

  buscar_na_web: async ({ query, max_results = 5 }) => {
    const results = await searchWeb(query, max_results);
    return { results };
  },

  perguntar_ia_com_contexto: async ({ pergunta, contexto }) => {
    const guard = guardPromptInjection(pergunta, "perguntar_ia_com_contexto");
    if (guard.blocked) return { error: "Prompt bloqueado", details: guard.result };
    const answer = await ragQuery(pergunta, Array.isArray(contexto) ? contexto : [contexto]);
    return { resposta: answer };
  },

  resolver_problema_passo_a_passo: async ({ problema }) => {
    const guard = guardPromptInjection(problema, "resolver_problema");
    if (guard.blocked) return { error: "Prompt bloqueado", details: guard.result };
    const result = await chainOfThought(problema);
    return result;
  },

  comparar_modelos_ia: async ({ query, modelos }) => {
    const results = await compareModels(query, modelos);
    return { comparacao: results };
  },

  analisar_codigo_powershell: async ({ codigo }) => {
    const result = await analyzePowerShellCode(codigo);
    return { analise: result };
  },

  ia_comando_sugerir: async ({ descricao }) => {
    const guard = guardPromptInjection(descricao, "ia_comando_sugerir");
    if (guard.blocked) return { error: "Prompt bloqueado", details: guard.result };
    const system = "Você é o Mestre do PC. Sugira UM comando PowerShell para o problema descrito. Responda apenas com o comando, sem explicações.";
    const cmd = await ollamaChat({ messages: [{ role: "user", content: descricao }], system });
    const cleanCmd = cmd.replace(/```powershell\n?/g, "").replace(/```\n?/g, "").trim();
    const classification = await classifyLauncherCommand(cleanCmd);
    return { comando_sugerido: cleanCmd, classificacao: classification };
  },

  analisar_logs_sistema: async () => {
    const result = await executeLauncherCommand({ id: "verificar_eventos_erro" }, { maxAttempts: 30 });
    const logs = result.output || "Sem logs disponíveis";
    const system = "Você é o Mestre do PC. Analise os logs de erro do Windows e forneça um diagnóstico em português brasileiro.";
    const analysis = await ollamaChat({ messages: [{ role: "user", content: logs }], system, timeoutMs: 90000 });
    return { logs, analise: analysis };
  },

  enviar_webhook_discord: async ({ webhook_url, titulo, mensagem, cor = "00ff00" }) => {
    return sendDiscordWebhook(webhook_url, titulo, mensagem, cor);
  },

  enviar_webhook_teams: async ({ webhook_url, titulo, mensagem }) => {
    return sendTeamsWebhook(webhook_url, titulo, mensagem);
  },

  enviar_webhook_slack: async ({ webhook_url, mensagem, canal, emoji }) => {
    return sendSlackWebhook(webhook_url, mensagem, canal, emoji);
  },

  monitorar_e_notificar: async ({ webhook_url, cpu_limite = 80, ram_limite = 80, disco_limite = 90, plataforma = "discord" }) => {
    return monitorAndAlert(webhook_url, cpu_limite, ram_limite, disco_limite, plataforma);
  },

  consultar_fonte_oficial_gov: async ({ url, termo }) => {
    return { conteudo: await consultarFonteOficialGov(url, termo) };
  },

  verificar_prompt: async ({ texto }) => {
    return checkPromptInjection(texto);
  },

  listar_perfis_modelo: async () => {
    return { perfis: listProfiles(), perfil_ativo: activeProfile };
  },

  definir_perfil_modelo: async ({ perfil }) => {
    if (!modelProfiles.profiles[perfil]) return { error: `Perfil "${perfil}" não existe` };
    return {
      perfil,
      mensagem: `Para ativar o perfil "${perfil}", defina a variável de ambiente OLLAMA_MODEL_PROFILE=${perfil} e reinicie o launcher.`,
      modelo: getProfileModel(perfil),
      opcoes: getProfileOptions(perfil),
    };
  },

  consultar_logs_auditoria: async ({ level, action, start_date, end_date, limit = 100 }) => {
    const entries = queryAuditLog({ level, action, startDate: start_date, endDate: end_date, limit });
    return { entries, total: entries.length };
  },

  exportar_relatorio_auditoria: async ({ level, start_date, end_date }) => {
    const report = exportAuditReport({ level, startDate: start_date, endDate: end_date });
    return { relatorio: report };
  },

  gerar_snapshot_git: async ({ fase }) => {
    const projectPath = process.env.MESTRE_PROJETO_PATH;
    if (!projectPath) return { error: "MESTRE_PROJETO_PATH não configurado" };
    const msg = fase ? `snapshot: ${fase}` : "snapshot do projeto";
    const { execSync } = await import("node:child_process");
    try {
      execSync("git add -A", { cwd: projectPath });
      execSync(`git commit -m "${msg}"`, { cwd: projectPath });
      const status = execSync("git log -1 --oneline", { cwd: projectPath }).toString().trim();
      return { success: true, commit: status };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// Lista de nomes de ferramentas para descoberta
export const TOOL_NAMES = Object.keys(TOOLS_API);

// Executor unificado
export async function executarTool(nome, args = {}) {
  const fn = TOOLS_API[nome];
  if (!fn) throw new Error(`Ferramenta "${nome}" não existe`);
  auditLog(AuditLevel.IA_OPERATION, "tool_call", { tool: nome, args: Object.keys(args) });
  return fn(args);
}

function listProfiles() {
  return Object.entries(modelProfiles.profiles).map(([key, p]) => ({
    id: key,
    label: p.label || key,
    model: p.model,
    ramMin: p.ramMin,
    gpu: p.gpu,
  }));
}

export { guardPromptInjection, ollamaChat, executeLauncherCommand, classifyLauncherCommand, getProfileModel, getProfileOptions, buildOllamaOptions, listProfiles };
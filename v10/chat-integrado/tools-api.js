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
import { searchWeb, fetchWebPage, isGovBrDomain } from "./web-search.js";
import { callGrokBotTool, callGrokRouterChat, isRouter9Model, DEFAULT_GROK_MODEL } from "./grokbot-bridge.js";
import { reaStatus, reaDoctor, reaAnalyzeAppJs } from "../rea-bridge.js";
import { refreshLocalMcpTokenFromFile } from "../../mcp-server/auth/local-token.js";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
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

// ── Detecção de modelos disponíveis no Ollama ───────────────────────

let availableModels = [];
let localModels = [];
let modelsCheckedAt = 0;

async function refreshAvailableModels() {
  // Cache de 60s
  if (Date.now() - modelsCheckedAt < 60000 && availableModels.length) return;
  modelsCheckedAt = Date.now();

  // Modelos locais (Ollama em 127.0.0.1:11434) — usado para streaming pelo launcher
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`);
    if (resp.ok) {
      const data = await resp.json();
      localModels = (data.models || []).map(m => m.name);
    }
  } catch { /* Ollama local offline */ }

  // Modelos cloud (se API key configurada) — usado para ferramentas
  if (OLLAMA_API_KEY) {
    try {
      const resp = await fetch(`${OLLAMA_BASE}/tags`, { headers: buildHeaders() });
      if (resp.ok) {
        const data = await resp.json();
        availableModels = (data.models || []).map(m => m.name);
      }
    } catch { /* cloud offline */ }
  }

  // Sem API key: modelos locais = modelos disponíveis
  if (!OLLAMA_API_KEY) {
    availableModels = localModels;
  }
}

function isModelAvailable(modelName) {
  return availableModels.some(m => m === modelName || m.startsWith(modelName.split(":")[0] + ":"));
}

function isLocalModelAvailable(modelName) {
  return localModels.some(m => m === modelName || m.startsWith(modelName.split(":")[0] + ":"));
}

// ── Helpers internos ────────────────────────────────────────────────

function getProfileModel(profile = activeProfile) {
  const p = modelProfiles.profiles[profile];
  return process.env.OLLAMA_MODEL || p?.model || "qwen2.5-coder:3b-instruct";
}

/**
 * Retorna o melhor modelo disponível (cloud ou local): tenta o do perfil,
 * depois OLLAMA_MODEL, depois o primeiro modelo disponível.
 */
async function getBestAvailableModel(profile = activeProfile) {
  await refreshAvailableModels();
  const configured = getProfileModel(profile);
  if (!availableModels.length) return configured; // tudo offline, deixa o configurado
  if (isModelAvailable(configured)) return configured;
  // Fallback: primeiro modelo disponível
  console.warn(`[tools-api] Modelo "${configured}" não encontrado. Usando "${availableModels[0]}".`);
  return availableModels[0];
}

/**
 * Retorna o melhor modelo LOCAL disponível (para streaming via launcher).
 * O launcher faz proxy direto para 127.0.0.1:11434, sem API key.
 */
async function getBestLocalModel(profile = activeProfile) {
  await refreshAvailableModels();
  const configured = getProfileModel(profile);
  if (!localModels.length) return configured; // Ollama local offline, deixa o configurado
  if (isLocalModelAvailable(configured)) return configured;
  // Fallback: primeiro modelo local disponível
  console.warn(`[tools-api] Modelo local "${configured}" não encontrado. Usando "${localModels[0]}".`);
  return localModels[0];
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
  const model = await getBestAvailableModel();
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
    try {
      return await callGrokRouterChat({
        messages,
        system,
        model: isRouter9Model(model) ? model : DEFAULT_GROK_MODEL,
        timeoutMs,
      });
    } catch {
      if (err.name === "AbortError") throw new Error(`Ollama timeout após ${timeoutMs}ms`);
      throw err;
    }
  } finally {
    clearTimeout(timer);
  }
}

// ── Launcher (executar comandos whitelisted) ────────────────────────

// O launcher exige token para o cliente "mcp" (fail-closed). Este módulo roda
// dentro do processo do launcher, que garante o token no boot; lemos a cada
// chamada para pegar o valor mesmo se ele foi gerado depois do import.
function launcherMcpHeaders() {
  refreshLocalMcpTokenFromFile();
  const h = { "Content-Type": "application/json", "X-Mestre-Client": "mcp" };
  const token = process.env.MESTRE_LOCAL_MCP_TOKEN || "";
  if (token) h["X-Mestre-Mcp-Token"] = token;
  return h;
}

async function executeLauncherCommand(payload, options = {}) {
  const headers = launcherMcpHeaders();
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
    headers: launcherMcpHeaders(),
    body: JSON.stringify({ cmd }),
  });
  return resp.json();
}

// ── DeepSeek Harness (dsh) ──────────────────────────────────────────
// O dsh é um agent harness: recebe uma tarefa de código e a executa de ponta a
// ponta com as próprias tools. O launcher expõe GET /dsh/status, POST /dsh/run
// (→ { jobId }) e GET /dsh/job?id= (→ { id, state, result?, error? }), com a
// mesma autorização local das rotas do REA.

async function dshRequest(path, options = {}) {
  const resp = await fetch(`${MESTRE_BASE_URL}${path}`, {
    ...options,
    headers: launcherMcpHeaders(),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `dsh HTTP ${resp.status}`);
  return data;
}

/** Texto final, provedor que respondeu e tentativas (quando o job informa). */
function extrairResultadoDsh(job = {}) {
  const result = job.result;
  const texto = typeof result === "string"
    ? result
    : String(result?.output || result?.text || result?.result || result?.message || "");
  const provedor = job.provider || result?.provider || result?.providerId || result?.model || "";
  const tentativas = Array.isArray(job.attempts) ? job.attempts
    : Array.isArray(result?.attempts) ? result.attempts
      : [];
  return { texto, provedor: String(provedor || ""), tentativas };
}

function errosDasTentativas(tentativas = []) {
  return tentativas
    .map((t) => (typeof t === "string" ? t : t?.error || t?.erro || ""))
    .filter(Boolean);
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
  if (!isGovBrDomain(url)) {
    throw new Error("Domínio não permitido. Use apenas fontes oficiais (.gov.br, ibge.gov.br, embrapa.br, etc.).");
  }
  const page = await fetchWebPage(url);
  if (!termo) return page.content.slice(0, 5000);
  const idx = page.content.toLowerCase().indexOf(termo.toLowerCase());
  if (idx === -1) return `Termo "${termo}" não encontrado no conteúdo da página.`;
  return page.content.slice(Math.max(0, idx - 200), idx + 2000);
}

// ── Catálogo de ferramentas ─────────────────────────────────────────

export const TOOLS_API = {
  perguntar_ia: async ({ pergunta, usar_web, pensar }) => {
    const guard = guardPromptInjection(pergunta, "perguntar_ia");
    if (guard.blocked) return { error: "Prompt bloqueado por segurança", details: guard.result };
    let context = "";
    let webResults;
    if (usar_web) {
      webResults = await searchWeb(pergunta, 3);
      context = webResults.map(r => `${r.title}: ${r.snippet}`).join("\n");
    }
    const system = "Você é o Mestre do PC, assistente especializado em Windows. Responda em português brasileiro de forma direta.";
    const messages = [{ role: "user", content: context ? `${pergunta}\n\nContexto da web:\n${context}` : pergunta }];
    const answer = await ollamaChat({ messages, system, think: pensar });
    return { resposta: answer, web_results: webResults };
  },

  buscar_na_web: async ({ query, max_results = 5 }) => {
    const results = await searchWeb(query, max_results);
    return { results };
  },

  buscar_e_resumir_pagina: async ({ query, pergunta, max_results = 3 }) => {
    const guard = guardPromptInjection(`${query}\n${pergunta || ""}`, "buscar_e_resumir_pagina");
    if (guard.blocked) return { error: "Prompt bloqueado por segurança", details: guard.result };
    const webResults = await searchWeb(query, max_results);
    if (!webResults.length) return { error: "Nenhum resultado encontrado." };
    const first = webResults[0];
    const page = await fetchWebPage(first.url);
    let resposta;
    if (pergunta) {
      const system = "Você é o Mestre do PC. Responda com base no conteúdo da página, em português brasileiro.";
      const messages = [
        { role: "user", content: `Página: ${page.title}\nURL: ${first.url}\n\nConteúdo:\n${page.content.slice(0, 12000)}\n\nPergunta: ${pergunta}` },
      ];
      resposta = await ollamaChat({ messages, system, timeoutMs: 90000 });
    }
    return {
      busca: webResults,
      pagina: { titulo: page.title, url: first.url, resumo: page.content.slice(0, 500) + "..." },
      resposta,
    };
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

  ler_pagina_web: async ({ url, pergunta, max_chars = 8000 }) => {
    const guard = guardPromptInjection(`${url}\n${pergunta || ""}`, "ler_pagina_web");
    if (guard.blocked) return { error: "Prompt/URL bloqueado por segurança", details: guard.result };
    const page = await fetchWebPage(url);
    let resposta;
    if (pergunta) {
      const system = "Você é o Mestre do PC. Responda com base no conteúdo da página fornecida, em português brasileiro.";
      const content = page.content.slice(0, Math.min(Math.max(500, Number(max_chars) || 8000), 20000));
      const messages = [
        { role: "user", content: `Página: ${page.title}\nURL: ${page.url || url}\n\nConteúdo:\n${content}\n\nPergunta: ${pergunta}` },
      ];
      resposta = await ollamaChat({ messages, system, timeoutMs: 90000 });
    }
    return {
      titulo: page.title,
      url,
      resumo: page.content.slice(0, 500) + (page.content.length > 500 ? "..." : ""),
      resposta,
      links: page.links.slice(0, 20),
    };
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
    const { execFileSync } = await import("node:child_process");
    try {
      execFileSync("git", ["add", "-A"], { cwd: projectPath });
      execFileSync("git", ["commit", "-m", msg], { cwd: projectPath });
      const status = execFileSync("git", ["log", "-1", "--oneline"], { cwd: projectPath }).toString().trim();
      return { success: true, commit: status };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  // ── Ferramentas Nativas Grok Bot (MCP + 9Router + Otimização) ──────
  grokbot__status: async (args = {}) => callGrokBotTool("grokbot__status", args),
  grokbot__chat: async (args = {}) => callGrokBotTool("grokbot__chat", args),
  grokbot__optimize_pc: async (args = {}) => callGrokBotTool("grokbot__optimize_pc", args),
  grokbot__sync_memories: async (args = {}) => callGrokBotTool("grokbot__sync_memories", args),
  grokbot__delegate_task: async (args = {}) => callGrokBotTool("grokbot__delegate_task", args),

  // ── Engenharia Reversa (REA) — análise de artefato entregue ────────
  // Read-only: lê o alvo e devolve Evidência. Nunca executa o alvo.
  rea_status: async () => ({ rea: await reaStatus() }),

  rea_doctor: async () => reaDoctor(),

  rea_analisar_app_js: async ({ caminho, target } = {}) => {
    const alvo = String(caminho || target || "").trim();
    if (!alvo) return { error: "Informe 'caminho' com o caminho absoluto do app (.asar ou pasta extraída)." };
    return reaAnalyzeAppJs({ target: alvo });
  },

  // ── DeepSeek Harness (dsh) — tarefa de código de ponta a ponta ──────
  // Use para trabalho de engenharia longo (feature, refatoração, bug com
  // reprodução, testes em vários arquivos). Pergunta rápida fica no chat normal.

  /** Estado do dsh: instalado, versão/modo e quais provedores da cascata estão prontos. */
  dsh_status: async () => {
    const status = await dshRequest("/dsh/status");
    const provedores = Array.isArray(status.providers) ? status.providers : [];
    return {
      instalado: Boolean(status.installed),
      versao: status.version || null,
      modo: status.mode || null,
      home: status.home || null,
      comando: status.command || null,
      provedores_prontos: provedores
        .filter((p) => p && p.ready)
        .map((p) => ({ id: p.id, label: p.label, model: p.model })),
      provedores: provedores.map((p) => ({
        id: p?.id, label: p?.label, model: p?.model, ready: Boolean(p?.ready),
      })),
    };
  },

  /**
   * Roda UMA tarefa no dsh e acompanha o job até o fim. Devolve o texto final,
   * o provedor que respondeu e os erros de cada tentativa. Sem follow-up: para
   * continuar, dispare outra tarefa. Com `retry`, a cascata repete a cada 5 min.
   */
  dsh_rodar_tarefa: async ({ task, cwd, provider, retry, timeoutMs } = {}) => {
    const tarefa = String(task || "").trim();
    if (!tarefa) return { error: "Informe 'task' com a descrição da tarefa para o dsh." };

    const corpo = { task: tarefa };
    if (cwd) {
      const alvo = String(cwd).trim();
      if (!isAbsolute(alvo)) return { error: "Informe 'cwd' com um caminho absoluto (ex: C:\\Users\\Jean\\Projetos\\app)." };
      corpo.cwd = alvo;
    }
    if (provider) corpo.provider = String(provider).trim();
    if (retry) corpo.retry = true;
    // Teto de tempo de UMA tentativa do harness (o launcher mata o job em 15 min).
    const limiteMs = Math.min(Math.max(Number(timeoutMs) || 300000, 30000), 900000);
    corpo.timeoutMs = limiteMs;

    const inicio = Date.now();
    const job = await dshRequest("/dsh/run", { method: "POST", body: JSON.stringify(corpo) });
    const jobId = job.jobId || job.id;
    if (!jobId) return { error: "O launcher não devolveu jobId para a tarefa do dsh.", resposta: job };

    // Polling: com retry a cadeia pode repetir a cada 5 min, então o teto é maior.
    const intervaloMs = 4000;
    const tetoMs = Math.min(limiteMs * (corpo.retry ? 2 : 1) + 90000, 13 * 60 * 1000);
    const maxConsultas = Math.max(1, Math.ceil(tetoMs / intervaloMs));
    let ultimo = { id: jobId, state: "queued" };
    let erros = [];
    let falhasSeguidas = 0;

    for (let i = 0; i < maxConsultas; i++) {
      await new Promise((r) => setTimeout(r, intervaloMs));
      try {
        ultimo = await dshRequest(`/dsh/job?id=${encodeURIComponent(jobId)}`);
        falhasSeguidas = 0;
        if (Array.isArray(ultimo.errors)) erros = ultimo.errors;
        if (ultimo.state === "completed" || ultimo.state === "failed") break;
      } catch (err) {
        falhasSeguidas++;
        if (falhasSeguidas >= 5) {
          throw new Error(`dsh: GET /dsh/job falhou 5 vezes seguidas (${err.message})`);
        }
      }
    }

    const detalhe = extrairResultadoDsh(ultimo);
    const errosTentativas = erros.length ? erros : errosDasTentativas(detalhe.tentativas);
    const duracaoSegundos = Math.round((Date.now() - inicio) / 1000);

    if (ultimo.state !== "completed" && ultimo.state !== "failed") {
      return {
        ok: false,
        pendente: true,
        jobId,
        estado: ultimo.state,
        provedor: detalhe.provedor || null,
        erro: `Teto de ${Math.round(tetoMs / 1000)}s de acompanhamento atingido com o job em "${ultimo.state}". Consulte GET /dsh/job?id=${jobId}.`,
        erros: errosTentativas,
        duracaoSegundos,
      };
    }

    if (ultimo.state === "failed") {
      return {
        ok: false,
        jobId,
        estado: "failed",
        provedor: detalhe.provedor || null,
        erro: ultimo.error || "A tarefa falhou no dsh.",
        erros: errosTentativas,
        duracaoSegundos,
      };
    }

    return {
      ok: true,
      jobId,
      estado: "completed",
      provedor: detalhe.provedor || null,
      resultado: detalhe.texto,
      erros: errosTentativas,
      duracaoSegundos,
    };
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

export { guardPromptInjection, ollamaChat, executeLauncherCommand, classifyLauncherCommand, getProfileModel, getProfileOptions, buildOllamaOptions, listProfiles, getBestAvailableModel, getBestLocalModel, refreshAvailableModels, availableModels };
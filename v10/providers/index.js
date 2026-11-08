// Mestre do PC V11 — Camada única de provedores de IA
// Ativos: grok (xAI), 9router. Fallback local: ollama. Demais: "em breve".
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.MPC_PROVIDERS_FILE || join(__dirname, "..", "data", "providers.json");
const OPENCODE_GO_BASE = "https://opencode.ai/inference/go/openai/v1";
const PROCESS_SESSION = "ses_mestre_" + randomBytes(8).toString("hex");

export const CATALOG = {
  grok:      { name: "Grok (xAI)",      type: "openai",     baseUrl: "https://api.x.ai/v1",           model: "grok-4.7",                   envKey: "XAI_API_KEY",        implemented: true },
  "9router": { name: "9Router",          type: "openai",     baseUrl: "http://127.0.0.1:20128/v1",     model: "gcli/grok-4.7-build-fast",  envKey: "NINEROUTER_API_KEY", implemented: true, local: true },
  ollama:    { name: "Ollama (local)",   type: "ollama",     baseUrl: "http://127.0.0.1:11434",        model: "qwen2.5-coder:3b-instruct", envKey: null,                 implemented: true, local: true },
  llamacpp:  { name: "llama.cpp",        type: "openai",     baseUrl: "http://127.0.0.1:8080/v1",      model: "",                         envKey: null,                 implemented: true, local: true },
  lmstudio:  { name: "LM Studio",        type: "openai",     baseUrl: "http://127.0.0.1:1234/v1",      model: "",                         envKey: null,                 implemented: true, local: true },
  opencode:  { name: "OpenCode (Zen)",   type: "openai",     baseUrl: "https://opencode.ai/zen/v1",    model: "",                         envKey: "OPENCODE_API_KEY",   implemented: true },
  "opencode-go": {
    name: "OpenCode Go",
    type: "openai",
    baseUrl: OPENCODE_GO_BASE,
    model: "kimi-k2.7-code",
    envKey: "OPENCODE_GO_API_KEY",
    envBaseUrl: "OPENCODE_GO_BASE_URL",
    envModel: "OPENCODE_GO_MODEL",
    modelsUrl: "https://opencode.ai/inference/go/v1/models",
    userAgent: "MestreDoPC/11.2.1",
    sessionHeader: "x-opencode-session",
    implemented: true,
  },
  openai:    { name: "OpenAI",           type: "openai",     baseUrl: "https://api.openai.com/v1",     model: "gpt-4o-mini",              envKey: "OPENAI_API_KEY",     implemented: true },
  claude:    { name: "Claude / Claude Code", type: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4",       envKey: "ANTHROPIC_API_KEY",  implemented: true },
  gemini:    { name: "Gemini",           type: "openai",     baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash", envKey: "GEMINI_API_KEY", implemented: true },
  groq:      { name: "Groq",             type: "openai",     baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", envKey: "GROQ_API_KEY",       implemented: true },
  mistral:   { name: "Mistral",          type: "openai",     baseUrl: "https://api.mistral.ai/v1",     model: "mistral-small-latest",     envKey: "MISTRAL_API_KEY",    implemented: true },
  deepseek:  { name: "DeepSeek",         type: "openai",     baseUrl: "https://api.deepseek.com/v1",   model: "deepseek-chat",            envKey: "DEEPSEEK_API_KEY",   implemented: true },
  openrouter:{ name: "OpenRouter",       type: "openai",     baseUrl: "https://openrouter.ai/api/v1",  model: "openrouter/auto",          envKey: "OPENROUTER_API_KEY", implemented: true },
  firecrawl: { name: "Firecrawl (web scraping)", type: "firecrawl", baseUrl: "https://api.firecrawl.dev/v2", model: "", envKey: "FIRECRAWL_API_KEY", implemented: true },
};

function load() {
  try { return existsSync(DATA_FILE) ? JSON.parse(readFileSync(DATA_FILE, "utf8")) : {}; } catch { return {}; }
}
function save(data) {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
}
export function mask(key) {
  if (!key) return "";
  return key.length <= 8 ? "••••" : key.slice(0, 4) + "••••" + key.slice(-4);
}

function httpBase(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let url;
  try { url = new URL(raw); } catch { return ""; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  if (url.username || url.password) return "";
  return url.toString().replace(/\/+$/, "");
}

function isOpenCodeAiHttps(value) {
  let url;
  try { url = new URL(String(value || "").trim()); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return host === "opencode.ai" || host.endsWith(".opencode.ai");
}

function normalizeOpenCodeGoBase(url) {
  const trimmed = String(url || "").replace(/\/+$/, "");
  if (trimmed === "https://opencode.ai/inference/go") return OPENCODE_GO_BASE;
  return trimmed;
}

function envText(name, max = 128) {
  const value = String(process.env[name] || "").trim();
  if (!value || value.length > max || /[\r\n]/.test(value)) return "";
  return value;
}

function sessionValue(raw) {
  const cleaned = String(raw || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120);
  if (!cleaned) return PROCESS_SESSION;
  return cleaned.startsWith("ses_") ? cleaned : "ses_" + cleaned;
}

export function notConfiguredMessage(p) {
  return p.envKey
    ? `${p.name} não configurado. Defina ${p.envKey}.`
    : `${p.name} não configurado.`;
}

export function getProvider(id) {
  const base = CATALOG[id];
  if (!base) return null;
  const saved = (load().providers || {})[id] || {};
  const apiKey = saved.apiKey || (base.envKey ? process.env[base.envKey] || "" : "");
  const envBase = base.envBaseUrl ? httpBase(process.env[base.envBaseUrl]) : "";
  let baseUrl = saved.baseUrl || envBase || base.baseUrl;
  if (id === "opencode-go") {
    // A env é o único jeito de apontar outro host. URL salva na UI só entra se for https em opencode.ai.
    if (envBase) baseUrl = envBase;
    else if (isOpenCodeAiHttps(saved.baseUrl)) baseUrl = saved.baseUrl;
    else baseUrl = base.baseUrl;
    baseUrl = normalizeOpenCodeGoBase(baseUrl);
  }
  const model = saved.model || (base.envModel ? envText(base.envModel) : "") || base.model;
  const needsKey = !base.local && base.type !== "ollama" && base.type !== "firecrawl";
  return {
    id, ...base,
    baseUrl,
    model,
    enabled: saved.enabled ?? (!!base.local || !!apiKey),
    apiKey,
    local: !!base.local,
    needsKey,
    configured: !needsKey || !!apiKey,
  };
}

function assertReady(id) {
  const p = getProvider(id);
  if (!p) throw new Error("Provedor desconhecido: " + id);
  if (!p.implemented) throw new Error(p.name + ": em breve");
  if (p.needsKey && !p.apiKey) throw new Error(notConfiguredMessage(p));
  return p;
}

export function listProviders() {
  const data = load();
  return {
    defaultProvider: data.defaultProvider || "grok",
    providers: Object.keys(CATALOG).map((id) => {
      const p = getProvider(id);
      return { id, name: p.name, implemented: p.implemented, enabled: p.enabled, baseUrl: p.baseUrl,
               model: p.model, hasKey: !!p.apiKey, keyMasked: mask(p.apiKey), envKey: p.envKey,
               local: !!p.local, needsKey: p.needsKey, configured: p.configured,
               status: p.configured ? "configured" : "not_configured" };
    }),
  };
}

export function updateProvider(id, patch = {}) {
  if (!CATALOG[id]) throw new Error("Provedor desconhecido: " + id);
  const data = load();
  data.providers = data.providers || {};
  const cur = data.providers[id] || {};
  for (const k of ["baseUrl", "model"]) if (patch[k] !== undefined) {
    const v = String(patch[k]).trim();
    if (!v) { delete cur[k]; continue; }
    if (k === "baseUrl" && id === "opencode-go" && !isOpenCodeAiHttps(v)) {
      throw new Error("Base URL do OpenCode Go deve usar https e o host opencode.ai. Para outro host, defina OPENCODE_GO_BASE_URL.");
    }
    cur[k] = v;
  }
  if (patch.enabled !== undefined) cur.enabled = !!patch.enabled;
  if (patch.reset) { data.providers[id] = {}; save(data); return listProviders(); }
  if (typeof patch.apiKey === "string" && patch.apiKey && !patch.apiKey.includes("••")) cur.apiKey = patch.apiKey.trim();
  if (patch.clearKey) delete cur.apiKey;
  data.providers[id] = cur;
  if (patch.makeDefault) data.defaultProvider = id;
  save(data);
  return listProviders();
}

export function setDefault(id) {
  if (!CATALOG[id]) throw new Error("Provedor desconhecido: " + id);
  const data = load(); data.defaultProvider = id; save(data); return listProviders();
}

function headers(p, sessionId) {
  const h = { "Content-Type": "application/json" };
  if (p.type === "anthropic") { if (p.apiKey) h["x-api-key"] = p.apiKey; h["anthropic-version"] = "2023-06-01"; }
  else if (p.apiKey) h.Authorization = "Bearer " + p.apiKey;
  if (p.userAgent) h["User-Agent"] = p.userAgent;
  if (p.sessionHeader) h[p.sessionHeader] = sessionValue(sessionId);
  return h;
}

function modelsEndpoint(p) {
  const base = String(p.baseUrl || "").replace(/\/+$/, "");
  const catalogBase = p.id === "opencode-go"
    ? normalizeOpenCodeGoBase(CATALOG[p.id]?.baseUrl || "")
    : String(CATALOG[p.id]?.baseUrl || "").replace(/\/+$/, "");
  if (p.modelsUrl && base === catalogBase) return p.modelsUrl;
  return base + "/models";
}

export async function listModels(id) {
  const p = getProvider(id);
  if (!p) throw new Error("Provedor desconhecido");
  if (!p.implemented) throw new Error(p.name + ": em breve");
  if (p.type === "firecrawl") {
    if (!p.apiKey) throw new Error("Informe a chave da Firecrawl (fc-...)");
    const r = await fetch(p.baseUrl + "/team/credit-usage", { headers: headers(p), signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 200));
    const j = await r.json(); const c = j.data?.remainingCredits ?? j.data?.remaining_credits ?? "?";
    return ["Créditos restantes: " + c];
  }
  if (p.type === "ollama") {
    const r = await fetch(p.baseUrl + "/api/tags", { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return ((await r.json()).models || []).map((m) => m.name);
  }
  if (p.needsKey && !p.apiKey) throw new Error(notConfiguredMessage(p));
  const r = await fetch(modelsEndpoint(p), { headers: headers(p), signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 200));
  const body = await r.json();
  return (body.data || body.models || []).map((m) => m.id || m.name).filter(Boolean);
}

export async function testProvider(id) {
  const t0 = Date.now();
  try {
    const models = await listModels(id);
    return { ok: true, ms: Date.now() - t0, models: models.slice(0, 50) };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e.message };
  }
}

// Chat não-streaming. messages = [{role, content}]
export async function chat(messages, { provider, model, temperature, sessionId } = {}) {
  if (provider) assertReady(provider);
  const fallback = [listProviders().defaultProvider, "grok", "9router", "openai", "gemini", "claude", "opencode", "opencode-go", "groq", "mistral", "deepseek", "openrouter", "llamacpp", "lmstudio", "ollama"];
  const order = (provider ? [provider] : fallback).filter((v, i, a) => v && a.indexOf(v) === i);
  let lastErr;
  for (const id of order) {
    const p = getProvider(id);
    if (!p || !p.implemented || !p.enabled || p.type === "firecrawl") continue;
    if (!p.local && p.type !== "ollama" && !p.apiKey) continue;
    try {
      const useModel = (id === (provider || order[0]) && model) || p.model;
      if (p.type === "anthropic") {
        const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
        const msgs = messages.filter((m) => m.role !== "system");
        const r = await fetch(p.baseUrl + "/messages", { method: "POST", headers: headers(p, sessionId),
          body: JSON.stringify({ model: useModel, max_tokens: 4096, ...(sys ? { system: sys } : {}), messages: msgs }),
          signal: AbortSignal.timeout(120000) });
        if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 200));
        const j = await r.json();
        return { provider: id, model: useModel, content: (j.content || []).map((c) => c.text || "").join("") };
      }
  if (p.type === "ollama") {
        const r = await fetch(p.baseUrl + "/api/chat", { method: "POST", headers: headers(p, sessionId),
          body: JSON.stringify({ model: useModel, messages, stream: false }), signal: AbortSignal.timeout(120000) });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const j = await r.json();
        return { provider: id, model: useModel, content: j.message?.content || "" };
      }
      const r = await fetch(p.baseUrl + "/chat/completions", { method: "POST", headers: headers(p, sessionId),
        body: JSON.stringify({ model: useModel, messages, temperature: temperature ?? 0.7, stream: false }),
        signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 200));
      const j = await r.json();
      return { provider: id, model: useModel, content: j.choices?.[0]?.message?.content || "" };
    } catch (e) { lastErr = new Error(id + ": " + e.message); if (provider) break; }
  }
  throw lastErr || new Error(provider ? provider + ": provedor indisponível." : "Nenhum provedor ativo com chave configurada.");
}

// Streaming OpenAI-compatível (SSE) repassado ao cliente; Ollama usa proxy existente.
export async function chatStream(messages, res, { provider, model, sessionId } = {}) {
  const id = provider || listProviders().defaultProvider;
  const p = assertReady(id);
  if (p.type !== "openai") throw new Error("Streaming disponível para provedores compatíveis com OpenAI (Grok, 9Router, llama.cpp, LM Studio, Groq, Mistral, DeepSeek, OpenRouter, OpenAI, Gemini, OpenCode, OpenCode Go)");
  const clientGone = new AbortController();
  const onClose = () => { if (!res.writableEnded) clientGone.abort(); };
  if (typeof res.on === "function") res.on("close", onClose);
  const signal = AbortSignal.any([AbortSignal.timeout(120000), clientGone.signal]);
  let started = false;
  try {
    const r = await fetch(p.baseUrl + "/chat/completions", { method: "POST", headers: headers(p, sessionId),
      body: JSON.stringify({ model: model || p.model, messages, stream: true }), signal });
    if (!r.ok || !r.body) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 200));
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
    started = true;
    for await (const chunk of r.body) {
      if (res.writableEnded || res.destroyed) break;
      res.write(chunk);
    }
  } catch (e) {
    if (started || res.headersSent) return;
    if (e?.name === "AbortError" || e?.name === "TimeoutError") throw new Error("Tempo esgotado ou conexão encerrada.");
    throw e;
  } finally {
    if (typeof res.off === "function") res.off("close", onClose);
    if (started && !res.writableEnded) {
      try { res.end(); } catch { /* cliente já encerrou */ }
    }
  }
}

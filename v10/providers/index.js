// Mestre do PC V11 — Camada única de provedores de IA
// Ativos: grok (xAI), 9router. Fallback local: ollama. Demais: "em breve".
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.MPC_PROVIDERS_FILE || join(__dirname, "..", "data", "providers.json");

export const CATALOG = {
  grok:     { name: "Grok (xAI)",      type: "openai", baseUrl: "https://api.x.ai/v1",           model: "grok-4.7",                      envKey: "XAI_API_KEY",        implemented: true },
  "9router":{ name: "9Router",          type: "openai", baseUrl: "http://127.0.0.1:20128/v1",     model: "gcli/grok-4.7-build-fast",     envKey: "NINEROUTER_API_KEY", implemented: true },
  ollama:   { name: "Ollama (local)",   type: "ollama", baseUrl: "http://127.0.0.1:11434",        model: "qwen2.5-coder:3b-instruct",    envKey: null,                 implemented: true },
  opencode: { name: "OpenCode (Zen)",   type: "openai", baseUrl: "https://opencode.ai/zen/v1",    model: "",                            envKey: "OPENCODE_API_KEY",   implemented: true },
  openai:   { name: "OpenAI",           type: "openai", baseUrl: "https://api.openai.com/v1",     model: "gpt-4o-mini",                 envKey: "OPENAI_API_KEY",     implemented: true },
  claude:   { name: "Claude / Claude Code", type: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4",      envKey: "ANTHROPIC_API_KEY",  implemented: true },
  gemini:   { name: "Gemini",           type: "openai", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash", envKey: "GEMINI_API_KEY", implemented: true },
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

export function getProvider(id) {
  const base = CATALOG[id];
  if (!base) return null;
  const saved = (load().providers || {})[id] || {};
  const apiKey = saved.apiKey || (base.envKey ? process.env[base.envKey] || "" : "");
  return {
    id, ...base,
    baseUrl: saved.baseUrl || base.baseUrl,
    model: saved.model || base.model,
    enabled: saved.enabled ?? (id === "ollama" || !!apiKey || id === "9router"),
    apiKey,
  };
}

export function listProviders() {
  const data = load();
  return {
    defaultProvider: data.defaultProvider || "grok",
    providers: Object.keys(CATALOG).map((id) => {
      const p = getProvider(id);
      return { id, name: p.name, implemented: p.implemented, enabled: p.enabled, baseUrl: p.baseUrl,
               model: p.model, hasKey: !!p.apiKey, keyMasked: mask(p.apiKey), envKey: p.envKey };
    }),
  };
}

export function updateProvider(id, patch = {}) {
  if (!CATALOG[id]) throw new Error("Provedor desconhecido: " + id);
  const data = load();
  data.providers = data.providers || {};
  const cur = data.providers[id] || {};
  for (const k of ["baseUrl", "model"]) if (patch[k] !== undefined) { const v = String(patch[k]).trim(); if (v) cur[k] = v; else delete cur[k]; }
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

function headers(p) {
  const h = { "Content-Type": "application/json" };
  if (p.type === "anthropic") { if (p.apiKey) h["x-api-key"] = p.apiKey; h["anthropic-version"] = "2023-06-01"; }
  else if (p.apiKey) h.Authorization = "Bearer " + p.apiKey;
  return h;
}

export async function listModels(id) {
  const p = getProvider(id);
  if (!p) throw new Error("Provedor desconhecido");
  if (!p.implemented) throw new Error(p.name + ": em breve");
  if (p.type === "ollama") {
    const r = await fetch(p.baseUrl + "/api/tags", { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return ((await r.json()).models || []).map((m) => m.name);
  }
  const r = await fetch(p.baseUrl + "/models", { headers: headers(p), signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 200));
  return ((await r.json()).data || []).map((m) => m.id);
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
export async function chat(messages, { provider, model, temperature } = {}) {
  const order = [provider || listProviders().defaultProvider, "grok", "9router", "openai", "gemini", "claude", "opencode", "ollama"]
    .filter((v, i, a) => v && a.indexOf(v) === i);
  let lastErr;
  for (const id of order) {
    const p = getProvider(id);
    if (!p || !p.implemented || !p.enabled) continue;
    if (p.type !== "ollama" && id !== "9router" && !p.apiKey) continue;
    try {
      const useModel = (id === (provider || order[0]) && model) || p.model;
      if (p.type === "anthropic") {
        const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
        const msgs = messages.filter((m) => m.role !== "system");
        const r = await fetch(p.baseUrl + "/messages", { method: "POST", headers: headers(p),
          body: JSON.stringify({ model: useModel, max_tokens: 4096, ...(sys ? { system: sys } : {}), messages: msgs }),
          signal: AbortSignal.timeout(120000) });
        if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 200));
        const j = await r.json();
        return { provider: id, model: useModel, content: (j.content || []).map((c) => c.text || "").join("") };
      }
      if (p.type === "ollama") {
        const r = await fetch(p.baseUrl + "/api/chat", { method: "POST", headers: headers(p),
          body: JSON.stringify({ model: useModel, messages, stream: false }), signal: AbortSignal.timeout(120000) });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const j = await r.json();
        return { provider: id, model: useModel, content: j.message?.content || "" };
      }
      const r = await fetch(p.baseUrl + "/chat/completions", { method: "POST", headers: headers(p),
        body: JSON.stringify({ model: useModel, messages, temperature: temperature ?? 0.7, stream: false }),
        signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 200));
      const j = await r.json();
      return { provider: id, model: useModel, content: j.choices?.[0]?.message?.content || "" };
    } catch (e) { lastErr = new Error(id + ": " + e.message); }
  }
  throw lastErr || new Error("Nenhum provedor ativo com chave configurada.");
}

// Streaming OpenAI-compatível (SSE) repassado ao cliente; Ollama usa proxy existente.
export async function chatStream(messages, res, { provider, model } = {}) {
  const id = provider || listProviders().defaultProvider;
  const p = getProvider(id);
  if (!p || !p.implemented || p.type !== "openai") throw new Error("Streaming disponível para provedores compatíveis com OpenAI (Grok, 9Router, OpenAI, Gemini, OpenCode)");
  const r = await fetch(p.baseUrl + "/chat/completions", { method: "POST", headers: headers(p),
    body: JSON.stringify({ model: model || p.model, messages, stream: true }) });
  if (!r.ok || !r.body) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 200));
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  for await (const chunk of r.body) res.write(chunk);
  res.end();
}

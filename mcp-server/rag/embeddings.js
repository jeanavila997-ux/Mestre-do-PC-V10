// Embeddings via Ollama.
//
// Usa o endpoint atual `POST /api/embed` (aceita lote) e cai para o legado
// `POST /api/embeddings` (um texto por vez) se o servidor for antigo.
//
// A resolução de URL/credenciais espelha mcp-server/index.js (OLLAMA_URL,
// OLLAMA_API_KEY). Não importamos de lá para não criar ciclo: index.js importa
// este módulo.
import { ragConfig } from "./config.js";

const DEFAULT_LOCAL_URL = "http://127.0.0.1:11434";
const CLOUD_URL = "https://ollama.com/api";

export function getOllamaEndpoint() {
  const apiKey = process.env.OLLAMA_API_KEY || "";
  const base = (process.env.OLLAMA_URL || (apiKey ? CLOUD_URL : DEFAULT_LOCAL_URL)).replace(/\/+$/, "");
  return { base, apiKey };
}

function headers(apiKey) {
  const h = { "Content-Type": "application/json" };
  if (apiKey) h.Authorization = `Bearer ${apiKey}`;
  return h;
}

function timeout(ms) {
  return AbortSignal.timeout(ms);
}

/**
 * Gera embeddings para uma lista de textos.
 * @param {string[]} textos
 * @param {{model?: string, timeoutMs?: number}} [options]
 * @returns {Promise<number[][]>}
 */
export async function embedTexts(textos, options = {}) {
  const list = Array.isArray(textos) ? textos.filter((t) => typeof t === "string" && t.trim()) : [];
  if (list.length === 0) return [];

  const model = options.model || ragConfig().embedModel;
  const timeoutMs = options.timeoutMs ?? 120000;
  const { base, apiKey } = getOllamaEndpoint();

  // Endpoint atual: lote de inputs em uma só chamada.
  const res = await fetch(`${base}/api/embed`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ model, input: list, truncate: true, keep_alive: "5m" }),
    signal: timeout(timeoutMs),
  });

  if (res.ok) {
    const data = await res.json();
    const vectors = data?.embeddings;
    if (Array.isArray(vectors) && vectors.length === list.length) return vectors;
    throw new Error("Resposta inesperada de /api/embed: quantidade de embeddings não corresponde ao número de textos.");
  }

  // Servidor antigo (sem /api/embed): cai para /api/embeddings, um por texto.
  if (res.status === 404) {
    const out = [];
    for (const texto of list) {
      const legacy = await fetch(`${base}/api/embeddings`, {
        method: "POST",
        headers: headers(apiKey),
        body: JSON.stringify({ model, prompt: texto }),
        signal: timeout(timeoutMs),
      });
      if (!legacy.ok) {
        const body = await legacy.text().catch(() => "");
        throw new Error(`Falha ao gerar embedding (HTTP ${legacy.status}): ${body.slice(0, 200)}`);
      }
      const data = await legacy.json();
      if (!Array.isArray(data?.embedding)) throw new Error("Resposta inesperada de /api/embeddings.");
      out.push(data.embedding);
    }
    return out;
  }

  const body = await res.text().catch(() => "");
  if (res.status === 404 || /model.+not found/i.test(body)) {
    throw new Error(
      `Modelo de embedding "${model}" não encontrado no Ollama. Instale com: ollama pull ${model}`
    );
  }
  throw new Error(`Falha ao gerar embedding (HTTP ${res.status}): ${body.slice(0, 200)}`);
}

/**
 * Verifica se o modelo de embedding está disponível e retorna a dimensão.
 * @returns {Promise<{available: boolean, model: string, dimensions?: number, reason?: string}>}
 */
export async function embedProbe(options = {}) {
  const model = options.model || ragConfig().embedModel;
  try {
    const [vector] = await embedTexts(["ping"], { model, timeoutMs: options.timeoutMs ?? 30000 });
    return { available: true, model, dimensions: vector?.length ?? 0 };
  } catch (e) {
    return { available: false, model, reason: e.message };
  }
}

/**
 * web-search.js — Módulo centralizado de busca web e extração de página.
 *
 * Usa a API oficial da Ollama Cloud (web_search / web_fetch) quando
 * OLLAMA_API_KEY está configurada. Quando não está, faz fallback para
 * scraping no DuckDuckGo (busca) ou fetch manual + strip HTML (páginas).
 *
 * Consumido por:
 *   - v10/chat-integrado/tools-api.js   (chat integrado / UI web)
 *   - mcp-server/index.js                (ferramentas MCP)
 */

import { auditLog, AuditLevel } from "../../mcp-server/audit-logger.js";
import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";
import { sanitizeToolArgument } from "../../mcp-server/security.js";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || "";
const OLLAMA_BASE = OLLAMA_API_KEY ? "https://ollama.com/api" : OLLAMA_URL;

const MAX_QUERY_LEN = 256;
const MAX_URL_LEN = 2048;

function stripHtml(html) {
  if (typeof html !== "string") return "";
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOllamaSearchResult(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    title: String(raw.title || "").trim(),
    url: String(raw.url || "").trim(),
    snippet: String(raw.content || "").trim(),
  };
}

function buildOllamaHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (OLLAMA_API_KEY) headers["Authorization"] = `Bearer ${OLLAMA_API_KEY}`;
  return headers;
}

/**
 * Busca na web. Tenta Ollama Cloud; fallback DuckDuckGo.
 * @param {string} query
 * @param {number} maxResults
 * @returns {Promise<Array<{title:string, url:string, snippet:string}>>}
 */
export async function searchWeb(query, maxResults = 5) {
  const cleanQuery = validateSearchQuery(query);

  const limit = Math.min(Math.max(1, Math.floor(Number(maxResults) || 5)), 10);

  if (OLLAMA_API_KEY) {
    try {
      const res = await fetch(`${OLLAMA_BASE}/web_search`, {
        method: "POST",
        headers: buildOllamaHeaders(),
        body: JSON.stringify({ query: cleanQuery, max_results: limit }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`Ollama web_search HTTP ${res.status}`);
      const data = await res.json();
      const results = (data.results || [])
        .map(normalizeOllamaSearchResult)
        .filter((r) => r && r.url);
      if (results.length) {
        await auditLog(AuditLevel.IA_OPERATION, "web_search_ollama", { query: cleanQuery, count: results.length });
        return results.slice(0, limit);
      }
    } catch (err) {
      await auditLog(AuditLevel.WARNING, "web_search_ollama_fallback", { query: cleanQuery, error: err.message });
    }
  }

  // Fallback DuckDuckGo HTML scraping
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}&kl=br-pt`;
  const res = await fetch(searchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`DuckDuckGo retornou HTTP ${res.status}`);

  const html = await res.text();
  if (html.includes("anomaly.js") || html.includes("challenge-form")) {
    throw new Error("DuckDuckGo bloqueou a requisição (anti-bot). Tente novamente em alguns segundos.");
  }

  const results = [];
  const blocks = html.split(/<div class="result[^"]*">/i).slice(1);
  for (const block of blocks.slice(0, limit)) {
    const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
    if (titleMatch) {
      let url = titleMatch[1];
      const uddg = url.match(/[?&]uddg=([^&]+)/i);
      if (uddg) {
        try { url = decodeURIComponent(uddg[1]); } catch {}
      }
      results.push({
        title: stripHtml(titleMatch[2]).trim(),
        url: url.trim(),
        snippet: snippetMatch ? stripHtml(snippetMatch[1]).trim() : "",
      });
    }
  }

  if (!results.length) {
    const linkMatches = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*class="result[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)];
    for (const m of linkMatches.slice(0, limit)) {
      results.push({ title: stripHtml(m[2]).trim(), url: m[1].trim(), snippet: "" });
    }
  }

  await auditLog(AuditLevel.IA_OPERATION, "web_search_duckduckgo", { query: cleanQuery, count: results.length });
  return results.slice(0, limit);
}

/**
 * Extrai o conteúdo textual de uma página web.
 * Tenta Ollama Cloud web_fetch; fallback manual.
 * @param {string} url
 * @returns {Promise<{title:string, content:string, links:string[]}>}
 */
export async function fetchWebPage(url) {
  const { cleanUrl, parsed } = validateWebUrl(url);

  if (OLLAMA_API_KEY) {
    try {
      const res = await fetch(`${OLLAMA_BASE}/web_fetch`, {
        method: "POST",
        headers: buildOllamaHeaders(),
        body: JSON.stringify({ url: cleanUrl }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`Ollama web_fetch HTTP ${res.status}`);
      const data = await res.json();
      if (data.content) {
        await auditLog(AuditLevel.IA_OPERATION, "web_fetch_ollama", { url: cleanUrl, chars: String(data.content).length });
        return {
          title: String(data.title || "").trim(),
          content: String(data.content || "").trim(),
          links: Array.isArray(data.links) ? data.links.filter((l) => typeof l === "string") : [],
        };
      }
    } catch (err) {
      await auditLog(AuditLevel.WARNING, "web_fetch_ollama_fallback", { url: cleanUrl, error: err.message });
    }
  }

  // Fallback manual
  const res = await safeRemoteFetch(cleanUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar página.`);
  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const text = stripHtml(html);
  await auditLog(AuditLevel.IA_OPERATION, "web_fetch_manual", { url: cleanUrl, chars: text.length });
  return { title: titleMatch ? stripHtml(titleMatch[1]) : parsed.hostname, content: text.slice(0, 20000), links: [] };
}

/** Valida texto de busca como dado web, sem as restrições de argumentos PowerShell. */
export function validateSearchQuery(value) {
  const rawQuery = typeof value === "string" ? value : "";
  if (/[\u0000-\u001f\u007f]/.test(rawQuery)) throw new Error("Termo de busca contém caracteres inválidos.");
  const cleanQuery = rawQuery.trim();
  if (!cleanQuery) throw new Error("Termo de busca inválido ou vazio.");
  if (cleanQuery.length > MAX_QUERY_LEN) throw new Error("Termo de busca muito longo.");
  return cleanQuery;
}

/** Valida URLs sem aplicar a regra restrita usada para argumentos de comandos. */
export function validateWebUrl(value) {
  const rawUrl = typeof value === "string" ? value : "";
  if (/[\u0000-\u001f\u007f]/.test(rawUrl)) throw new Error("URL contém caracteres inválidos.");
  const cleanUrl = rawUrl.trim();
  if (!cleanUrl) throw new Error("URL inválida ou vazia.");
  if (cleanUrl.length > MAX_URL_LEN) throw new Error("URL muito longa.");

  let parsed;
  try {
    parsed = new URL(cleanUrl);
  } catch {
    throw new Error("URL malformada.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Apenas URLs http/https são permitidas.");
  }
  if (parsed.username || parsed.password) throw new Error("URLs com credenciais não são permitidas.");
  return { cleanUrl, parsed };
}

function isPrivateAddress(address) {
  if (address.includes(":")) {
    const normalized = address.toLowerCase();
    return normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("::ffff:");
  }

  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 ||
    a === 10 ||
    a === 127 ||
    a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 ||
    a === 192 && b === 168 ||
    a === 100 && b >= 64 && b <= 127 ||
    a >= 224;
}

export async function assertSafeRemoteUrl(value) {
  const { cleanUrl, parsed } = validateWebUrl(value);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("URLs locais ou privadas não são permitidas.");
  }

  let addresses;
  if (isIP(hostname)) {
    addresses = [hostname];
  } else {
    const [ipv4, ipv6] = await Promise.all([
      resolve4(hostname).catch(() => []),
      resolve6(hostname).catch(() => []),
    ]);
    addresses = [...ipv4, ...ipv6];
  }
  if (!addresses.length) throw new Error("Não foi possível resolver o endereço da URL.");
  if (addresses.some(isPrivateAddress)) throw new Error("URLs locais ou privadas não são permitidas.");
  return cleanUrl;
}

async function safeRemoteFetch(value, options) {
  let currentUrl = value;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    await assertSafeRemoteUrl(currentUrl);
    const response = await fetch(currentUrl, { ...options, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    currentUrl = new URL(location, currentUrl).href;
  }
  throw new Error("A página excedeu o limite de redirecionamentos.");
}
/**
 * Verifica se a URL pertence a domínios governamentais/institucionais brasileros.
 */
export function isGovBrDomain(url) {
  const allowed = [
    "gov.br",
    "ibge.gov.br",
    "embrapa.br",
    "in.gov.br",
    "planalto.gov.br",
    "usp.br",
    "unicamp.br",
    "fiocruz.br",
    "datasus.gov.br",
  ];
  try {
    const host = new URL(url).hostname.toLowerCase();
    return allowed.some((d) => host === d || host.endsWith("." + d));
  } catch {
    return false;
  }
}

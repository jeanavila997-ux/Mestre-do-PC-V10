#!/usr/bin/env node
/**
 * Smoke test for the Ollama API (local or cloud).
 *
 * Usage:
 *   # Local Ollama (default)
 *   node scripts/test_ollama.mjs
 *
 *   # Cloud (Ollama.com)
 *   OLLAMA_API_KEY=... OLLAMA_HOST=https://ollama.com OLLAMA_MODEL=fazendaavila2026/agente \
 *     node scripts/test_ollama.mjs
 *
 * Environment:
 *   OLLAMA_HOST    - default http://localhost:11434
 *   OLLAMA_MODEL   - default fazendaavila2026/agente
 *   OLLAMA_API_KEY - if set, sent as Authorization: Bearer ... (cloud mode)
 *   PROMPT         - default "Hello!"
 *   TIMEOUT_MS     - default 30000
 *
 * The script NEVER logs the API key. On any non-2xx response it prints
 * {status, body} and exits with code 1.
 */

import process from 'node:process';

const HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'fazendaavila2026/agente';
const PROMPT = process.env.PROMPT || 'Hello!';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 30000);

const headers = { 'content-type': 'application/json' };
if (process.env.OLLAMA_API_KEY) {
  headers.authorization = `Bearer ${process.env.OLLAMA_API_KEY}`;
}

const body = JSON.stringify({
  model: MODEL,
  messages: [{ role: 'user', content: PROMPT }],
  stream: false,
});

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

const started = Date.now();
let res;
try {
  res = await fetch(`${HOST.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers,
    body,
    signal: controller.signal,
  });
} catch (err) {
  clearTimeout(timer);
  console.error(`[ollama] request failed: ${err.name === 'AbortError' ? 'timeout' : err.message}`);
  process.exit(2);
}
clearTimeout(timer);

const text = await res.text();
const elapsed = Date.now() - started;

if (!res.ok) {
  console.error(`[ollama] HTTP ${res.status} in ${elapsed}ms`);
  try {
    const parsed = JSON.parse(text);
    console.error(JSON.stringify(parsed, null, 2));
  } catch {
    console.error(text);
  }
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  console.error('[ollama] non-JSON response:');
  console.error(text);
  process.exit(1);
}

const content = parsed?.message?.content ?? '';
console.log(`[ollama] model=${MODEL} host=${HOST} ms=${elapsed}`);
console.log(content);

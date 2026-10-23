// Configuração do RAG local (embeddings via Ollama + índice vetorial em JSON).
//
// Tudo é opt-in por variável de ambiente; os padrões funcionam sem configurar
// nada, apontando o índice para <raiz do projeto>/.rag/index.json (ignorado
// pelo git).

import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(__dirname, "../..");

function toInt(value, fallback) {
  const n = parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Raízes permitidas para indexação. Sem configuração, só a raiz do projeto —
// evitar que uma chamada de IA consiga varrer o disco inteiro.
function parseAllowedRoots(raw) {
  const parts = String(raw || "")
    .split(/[;,]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return [PROJECT_ROOT];
  return parts.map((p) => resolve(p));
}

export function ragConfig() {
  return {
    embedModel: process.env.RAG_EMBED_MODEL || "nomic-embed-text",
    indexFile: process.env.RAG_INDEX_PATH || join(PROJECT_ROOT, ".rag", "index.json"),
    chunkChars: toInt(process.env.RAG_CHUNK_CHARS, 900),
    chunkOverlap: toInt(process.env.RAG_CHUNK_OVERLAP, 150),
    topK: toInt(process.env.RAG_TOP_K, 5),
    maxFileBytes: toInt(process.env.RAG_MAX_FILE_BYTES, 1_000_000),
    maxChunksPerRun: toInt(process.env.RAG_MAX_CHUNKS_PER_RUN, 2000),
    allowedRoots: parseAllowedRoots(process.env.RAG_ALLOWED_ROOTS),
  };
}

// Extensões consideradas texto. Qualquer outra é ignorada na varredura de
// diretórios (evita tentar embeddar binários).
export const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".rst",
  ".json", ".jsonc", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf", ".env",
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
  ".py", ".ps1", ".psm1", ".bat", ".cmd", ".sh",
  ".html", ".htm", ".css", ".scss", ".svg", ".xml",
  ".sql", ".csv", ".tsv", ".log", ".c", ".h", ".cpp", ".hpp", ".java", ".go", ".rs",
]);

export const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".rag", "dist", "build", ".next", "coverage",
  ".venv", "venv", "__pycache__", ".cache", "logs",
]);

export function isTextFile(filePath) {
  const lower = filePath.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot === -1) return false;
  return TEXT_EXTENSIONS.has(lower.slice(dot));
}

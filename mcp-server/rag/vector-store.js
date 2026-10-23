// Índice vetorial local em JSON, com busca por similaridade de cosseno.
//
// Deliberadamente sem dependências: para uso pessoal (dezenas de milhares de
// chunks) a busca bruta em JS responde em poucas dezenas de milissegundos e
// evita binários nativos (LanceDB/FAISS) no Windows.
//
// Gravação atômica: escreve em .tmp e faz rename, para um crash no meio do
// processo não corromper o índice.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

const FORMAT_VERSION = 1;

export function hashContent(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex").slice(0, 32);
}

function normalize(vector) {
  let sum = 0;
  for (const v of vector) sum += v * v;
  const norm = Math.sqrt(sum);
  if (!norm) return { vec: vector.slice(), norm: 0 };
  return { vec: vector.map((v) => Number((v / norm).toFixed(6))), norm: 1 };
}

export class VectorStore {
  /**
   * @param {{indexFile: string, dimensions?: number, model?: string}} options
   */
  constructor({ indexFile, dimensions = 0, model = "" }) {
    this.indexFile = indexFile;
    this.dimensions = dimensions;
    this.model = model;
    this.chunks = [];
    this._norms = [];
  }

  static async load(indexFile) {
    const store = new VectorStore({ indexFile });
    if (!existsSync(indexFile)) return store;
    const raw = await readFile(indexFile, "utf8");
    if (!raw.trim()) return store;
    const data = JSON.parse(raw);
    if (data?.version !== FORMAT_VERSION) {
      throw new Error(`Índice RAG em formato incompatível (versão ${data?.version}). Use rag_limpar para recriar.`);
    }
    store.dimensions = data.dimensions || 0;
    store.model = data.model || "";
    store.chunks = Array.isArray(data.chunks) ? data.chunks : [];
    store._recomputeNorms();
    return store;
  }

  _recomputeNorms() {
    this._norms = this.chunks.map((c) => {
      let sum = 0;
      for (const v of c.vec) sum += v * v;
      return Math.sqrt(sum) || 1;
    });
  }

  get size() {
    return this.chunks.length;
  }

  /** Fontes distintas já indexadas. */
  sources() {
    return [...new Set(this.chunks.map((c) => c.source))].sort();
  }

  has(hash) {
    return this.chunks.some((c) => c.hash === hash);
  }

  removeSource(source) {
    const before = this.chunks.length;
    this.chunks = this.chunks.filter((c) => c.source !== source);
    this._recomputeNorms();
    return before - this.chunks.length;
  }

  /**
   * Adiciona chunks com seus vetores. Ignora hashes repetidos.
   * @param {Array<{source: string, index: number, text: string, vec: number[]}>} entries
   * @returns {{added: number, skipped: number}}
   */
  addMany(entries) {
    let added = 0;
    let skipped = 0;
    for (const entry of entries) {
      const hash = hashContent(entry.text);
      if (this.has(hash)) {
        skipped++;
        continue;
      }
      if (!this.dimensions) this.dimensions = entry.vec.length;
      if (entry.vec.length !== this.dimensions) {
        throw new Error(
          `Dimensão do embedding (${entry.vec.length}) difere do índice (${this.dimensions}). ` +
            "Use rag_limpar e reindexe com o mesmo modelo."
        );
      }
      const { vec } = normalize(entry.vec);
      this.chunks.push({
        id: hash,
        hash,
        source: entry.source,
        index: entry.index,
        text: entry.text,
        vec,
      });
      added++;
    }
    this._recomputeNorms();
    return { added, skipped };
  }

  /**
   * Busca os k chunks mais similares.
   * @param {number[]} queryVec
   * @param {{k?: number, minScore?: number}} [options]
   * @returns {Array<{source: string, index: number, text: string, score: number}>}
   */
  search(queryVec, options = {}) {
    const k = Math.max(1, options.k ?? 5);
    const minScore = options.minScore ?? 0;
    if (this.chunks.length === 0 || !Array.isArray(queryVec) || queryVec.length === 0) return [];
    if (this.dimensions && queryVec.length !== this.dimensions) {
      throw new Error(
        `Consulta com dimensão ${queryVec.length}, índice tem ${this.dimensions}. ` +
          "O modelo de embedding mudou: reindexe (rag_limpar + rag_indexar)."
      );
    }

    let qn = 0;
    for (const v of queryVec) qn += v * v;
    qn = Math.sqrt(qn) || 1;

    const scored = [];
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      let dot = 0;
      for (let d = 0; d < queryVec.length; d++) dot += queryVec[d] * chunk.vec[d];
      const score = dot / (qn * this._norms[i]);
      if (score >= minScore) {
        scored.push({ source: chunk.source, index: chunk.index, text: chunk.text, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  toJSON() {
    return {
      version: FORMAT_VERSION,
      model: this.model,
      dimensions: this.dimensions,
      updatedAt: new Date().toISOString(),
      chunks: this.chunks,
    };
  }

  async save() {
    await mkdir(dirname(this.indexFile), { recursive: true });
    const tmp = `${this.indexFile}.tmp`;
    await writeFile(tmp, JSON.stringify(this.toJSON()), "utf8");
    try {
      await rename(tmp, this.indexFile);
    } catch (e) {
      await unlink(tmp).catch(() => {});
      throw e;
    }
  }

  async clear() {
    this.chunks = [];
    this._norms = [];
    this.dimensions = 0;
    if (existsSync(this.indexFile)) await unlink(this.indexFile);
  }
}

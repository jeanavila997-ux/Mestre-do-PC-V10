import crypto from 'node:crypto';
import { toAuditError } from './errors.js';
import { redactAndTruncate, redactDeep } from './redact.js';
import { stableStringify } from './canonical.js';

/**
 * Regra #10 — Auditoria.
 *
 * Não cria arquivo paralelo: o projeto JÁ tem `mcp-server/audit-logger.js`
 * (AuditLevel, auditLog, queryAuditLog, arquivos diários em logs/audit/).
 * O adendo mandava escrever em `v10/logs/audit.jsonl`, o que geraria duas
 * trilhas incompletas. Aqui o destino é injetado (o sink existente).
 *
 * Ganhos sobre o adendo:
 *  - cadeia de hash real (cada entrada referencia o hash da anterior);
 *  - `redact` ANTES de truncar (o adendo truncava primeiro e vazava segredo
 *    partido no meio da janela de 500 chars);
 *  - serialização que não estoura com objeto circular;
 *  - correlationId + regra que decidiu, que é o que falta na hora de depurar.
 */

export const NIVEL = Object.freeze({
  N0: 'N0', // consultas, leituras, explicações
  N1: 'N1', // escritas e pacotes
  N2: 'N2', // alterações de configuração de segurança
  N3: 'N3', // destrutivos, rede, elevação
});

/** Mapeia N0..N3 para o AuditLevel já existente no projeto. */
export const NIVEL_TO_AUDIT_LEVEL = Object.freeze({
  N0: 'INFO',
  N1: 'OPERATION',
  N2: 'SECURITY',
  N3: 'SECURITY',
});

export function createAuditRecorder({ sink, now = () => new Date() } = {}) {
  if (typeof sink !== 'function') {
    throw new TypeError('createAuditRecorder exige sink(entry) — use o auditLog existente.');
  }

  let chain = '0'.repeat(64);
  let entries = 0;

  return {
    /**
     * @param {{
     *   tool: string,
     *   args?: unknown,
     *   nivel?: string,
     *   approvedBy?: string|null,
     *   result?: unknown,
     *   durationMs?: number,
     *   error?: unknown,
     *   correlationId?: string,
     *   decision?: string|null,
     * }} input
     */
    record({
      tool,
      args = {},
      nivel = NIVEL.N0,
      approvedBy = null,
      result = null,
      durationMs = null,
      error = null,
      correlationId = null,
      decision = null,
    }) {
      const err = error ? toAuditError(error) : null;

      const body = {
        ts: now().toISOString(),
        correlationId: correlationId || crypto.randomUUID(),
        tool,
        args: redactDeep(args),
        nivel,
        aprovado: redactAndTruncate(approvedBy, 120) || null,
        duracaoMs: durationMs,
        status: err ? 'FALHA' : 'OK',
        errorCode: err?.code || null,
        errorMsg: err ? redactAndTruncate(err.message, 300) : null,
        decisao: decision,
        saida: result === null ? null : redactAndTruncate(result, 500),
      };

      const payload = stableStringify(body);
      const next = crypto.createHash('sha256').update(chain).update(payload).digest('hex');

      const entry = { ...body, prev: chain, hash: next };
      chain = next;
      entries += 1;

      sink(entry);
      return entry;
    },

    getChainHead() {
      return { head: chain, entries };
    },
  };
}

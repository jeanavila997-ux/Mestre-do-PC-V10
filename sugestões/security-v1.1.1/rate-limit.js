import { SecurityError } from './errors.js';

/**
 * Regra #8 — Loop guard / rate limit.
 *
 * Correções em relação ao adendo v1.1.0:
 *  1. Buckets eram podados nunca -> vazamento de memória + custo O(n·m) por chamada.
 *  2. O limite global de 30/60s disparava DENTRO de uma única operação legítima
 *     (diagnosticar_saude encadeia dezenas de comandos). Agora o contador global
 *     é escopado por invocação de ferramenta, não por comando interno.
 *  3. O adendo lançava exceção prometendo "confirmação manual". Agora o
 *     resultado é explícito: `requiresHumanConfirmation`.
 */
export class RateLimiter {
  constructor({ perOp = 3, global = 30, windowMs = 60_000, now = Date.now } = {}) {
    this.perOp = perOp;
    this.global = global;
    this.windowMs = windowMs;
    this.now = now;
    this.buckets = new Map(); // opId -> number[] (timestamps)
  }

  #prune(ts, cutoff) {
    return ts.filter((t) => t >= cutoff);
  }

  /**
   * @param {string} opId
   * @param {{ kind?: 'read'|'write', scope?: string }} opts
   *   `scope` = id da invocação de ferramenta; o limite global conta por scope.
   */
  check(opId, { kind = 'read', scope = 'default' } = {}) {
    const now = this.now();
    const cutoff = now - this.windowMs;

    const prev = this.#prune(this.buckets.get(opId) || [], cutoff);

    if (prev.length >= this.perOp) {
      this.buckets.set(opId, prev);
      return {
        ok: false,
        code: 'LOOP_DETECTADO',
        requiresHumanConfirmation: true,
        message: `Operação "${opId}" executada ${prev.length}x em ${Math.round(this.windowMs / 1000)}s. Confirmação manual necessária.`,
        meta: { opId, count: prev.length, kind },
      };
    }

    const scopeKey = `scope:${scope}`;
    const scopePrev = this.#prune(this.buckets.get(scopeKey) || [], cutoff);
    if (scopePrev.length >= this.global) {
      this.buckets.set(scopeKey, scopePrev);
      return {
        ok: false,
        code: 'RATE_LIMIT_GLOBAL',
        requiresHumanConfirmation: true,
        message: `Limite global de ${this.global} operações em ${Math.round(this.windowMs / 1000)}s atingido (escopo: ${scope}).`,
        meta: { scope, count: scopePrev.length, kind },
      };
    }

    prev.push(now);
    this.buckets.set(opId, prev);
    scopePrev.push(now);
    this.buckets.set(scopeKey, scopePrev);

    return { ok: true, remaining: this.perOp - prev.length, code: null };
  }

  /** Versão que lança — use quando o chamador não quer tratar o resultado. */
  assertAllowed(opId, opts) {
    const result = this.check(opId, opts);
    if (!result.ok) throw new SecurityError(result.code, result.message, result.meta);
    return result;
  }

  /** Limpeza de buckets vazios / expirados (chamar periodicamente). */
  sweep() {
    const cutoff = this.now() - this.windowMs;
    let removed = 0;
    for (const [key, ts] of this.buckets) {
      const kept = this.#prune(ts, cutoff);
      if (kept.length === 0) {
        this.buckets.delete(key);
        removed += 1;
      } else {
        this.buckets.set(key, kept);
      }
    }
    return removed;
  }

  snapshot() {
    return {
      buckets: this.buckets.size,
      windowMs: this.windowMs,
      perOp: this.perOp,
      global: this.global,
    };
  }
}

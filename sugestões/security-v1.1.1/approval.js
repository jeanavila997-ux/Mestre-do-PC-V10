import crypto from 'node:crypto';
import { SecurityError } from './errors.js';
import { stableStringify } from './canonical.js';

/**
 * Regra #14 (parte humana) — Aprovação fora de banda.
 *
 * O furo do adendo: `if (userApproval !== 'confirmo') throw`.
 * Quem preenche `userApproval`? Se é argumento de ferramenta, é o MODELO.
 * E o próprio Soul.md ensina a ele que a string é "confirmo". Um prompt
 * injection em log/página/tool output passa o portão.
 *
 * Aqui a confirmação é um nonce assinado, ligado a (op + args canônicos),
 * com TTL e uso único, emitido pela UI que o humano clica.
 */

const FORGED_WORDS = /^(confirmo|confirmado|sim|ok|aprovo|yes)$/i;

export class ApprovalBroker {
  /**
   * @param {{ key: string|Buffer, ttlMs?: number, now?: () => number }} opts
   *   `key` = segredo do launcher (nunca exposto ao MCP server).
   */
  constructor({ key, ttlMs = 60_000, now = Date.now } = {}) {
    if (!key || (typeof key === 'string' && key.trim() === '')) {
      throw new SecurityError('APROVACAO_SEM_CHAVE', 'ApprovalBroker exige chave secreta.');
    }
    this.key = key;
    this.ttlMs = ttlMs;
    this.now = now;
    this.used = new Set();
  }

  #binding({ op, args, action }) {
    return crypto
      .createHash('sha256')
      .update(`${action}|${op}|${stableStringify(args)}`)
      .digest('hex');
  }

  #sign(payload) {
    return crypto.createHmac('sha256', this.key).update(payload).digest('base64url').slice(0, 43);
  }

  /**
   * Chamado pela camada HUMANA (painel/UI), nunca pela ferramenta do modelo.
   * @returns {{ token: string, expiresAt: number, binding: string }}
   */
  issue({ op, args, action = 'destructive' }) {
    const binding = this.#binding({ op, args, action });
    const expires = this.now() + this.ttlMs;
    const payload = `v1.${binding}.${expires}`;
    return { token: `${payload}.${this.#sign(payload)}`, expiresAt: expires, binding };
  }

  /**
   * Chamado pelo launcher elevado.
   * @returns {{ ok: true, binding: string }}
   */
  consume(token, { op, args, action = 'destructive' }) {
    if (typeof token !== 'string' || token.trim() === '') {
      throw new SecurityError('APROVACAO_AUSENTE', 'Operação destrutiva exige aprovação explícita.');
    }

    // A "senha" que o modelo conhece. Recusada por construção.
    if (FORGED_WORDS.test(token.trim())) {
      throw new SecurityError(
        'APROVACAO_FORJADA',
        'A palavra de confirmação não é uma aprovação. Use o botão do painel (nonce assinado).',
        { token: token.trim() },
      );
    }

    const parts = token.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new SecurityError('APROVACAO_INVALIDA', 'Token de aprovação malformado.');
    }

    const [, binding, expiresRaw, sig] = parts;
    const payload = `v1.${binding}.${expiresRaw}`;
    const expectedSig = this.#sign(payload);

    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new SecurityError('APROVACAO_INVALIDA', 'Assinatura da aprovação inválida.');
    }

    if (this.used.has(token)) {
      throw new SecurityError('APROVACAO_REUTILIZADA', 'Este token de aprovação já foi usado.');
    }

    const expires = Number(expiresRaw);
    if (!Number.isFinite(expires) || this.now() > expires) {
      throw new SecurityError('APROVACAO_EXPIRADA', 'Token de aprovação expirado.');
    }

    const expectedBinding = this.#binding({ op, args, action });
    if (binding !== expectedBinding) {
      // Aprovar A e executar B.
      throw new SecurityError(
        'APROVACAO_ARGS_DIVERGENTES',
        'A aprovação não corresponde a esta operação/argumentos.',
        { approvedFor: binding, requested: expectedBinding },
      );
    }

    this.used.add(token);
    return { ok: true, binding };
  }
}

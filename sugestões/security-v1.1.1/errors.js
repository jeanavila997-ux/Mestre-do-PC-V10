/**
 * Erro de segurança tipado. Todo bloqueio da camada passa por aqui.
 *
 * O addendo v1.1.0 usava `SecurityError` em 6 arquivos sem nunca defini-la.
 */
export class SecurityError extends Error {
  /**
   * @param {string} code  Código estável (usado em testes e na auditoria).
   * @param {string} message Mensagem em pt-BR, exibível ao usuário.
   * @param {object} meta   Contexto estruturado (caminho, op, host...).
   */
  constructor(code, message, meta = {}) {
    super(message);
    this.name = 'SecurityError';
    this.code = code;
    this.meta = meta;
    this.status = 403;
    if (Error.captureStackTrace) Error.captureStackTrace(this, SecurityError);
  }

  toJSON() {
    return { name: this.name, code: this.code, message: this.message, meta: this.meta };
  }
}

export function isSecurityError(err) {
  return err instanceof SecurityError || err?.name === 'SecurityError';
}

/** Normaliza qualquer erro para uma entrada de auditoria. */
export function toAuditError(err) {
  if (isSecurityError(err)) {
    return { code: err.code, message: err.message, meta: err.meta };
  }
  return { code: err?.code || 'ERRO_INTERNO', message: String(err?.message ?? err), meta: {} };
}

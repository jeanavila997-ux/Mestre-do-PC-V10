/**
 * API pública da camada de segurança — v1.1.1
 *
 * Lista FECHADA de gatilhos de recusa, agora com 11 itens (o adendo dizia "8"
 * e deixava de fora rate limit, timeout, elevação e "não inventar dado").
 * A contagem tem que ser honesta: um contrato "fechado" que vaza é pior que
 * nenhum contrato.
 */

export { SecurityError, isSecurityError, toAuditError } from './errors.js';
export { stableStringify } from './canonical.js';
export { buildPolicy, resolveReal } from './path-guard.js';
export { redactSecrets, redactDeep, redactAndTruncate } from './redact.js';
export { RateLimiter } from './rate-limit.js';
export { verifyWhitelist, loadVerifiedWhitelist, signWhitelist, computeDigest } from './integrity.js';
export { preflightExfil, DEFAULT_ALLOWED_HOSTS } from './exfil-guard.js';
export { ApprovalBroker } from './approval.js';
export { executeDestructive } from './dry-run.js';
export { createAuditRecorder, NIVEL, NIVEL_TO_AUDIT_LEVEL } from './audit.js';

export const TRIGGERS = Object.freeze([
  { id: 1, code: 'NAO_WHITELIST', regra: 1, bloqueia: true, mensagem: 'Comando fora de allowed-operations.json.' },
  { id: 2, code: 'SEM_APROVACAO', regra: 14, bloqueia: true, mensagem: 'Destrutivo sem nonce de aprovação válido.' },
  { id: 3, code: 'APROVACAO_FORJADA', regra: 14, bloqueia: true, mensagem: '"confirmo" no chat não é aprovação.' },
  { id: 4, code: 'PROMPT_INJECTION', regra: 3, bloqueia: true, mensagem: 'Prompt injection detectado.' },
  { id: 5, code: 'METACARACTERE', regra: 4, bloqueia: true, mensagem: 'Metacaractere não sanitizável.' },
  { id: 6, code: 'PATH_*', regra: 6, bloqueia: true, mensagem: 'Caminho interdito, fora de escopo, ADS, UNC ou traversal.' },
  { id: 7, code: 'INTEGRIDADE_VIOLADA', regra: 9, bloqueia: true, mensagem: 'Whitelist com assinatura divergente -> SOMENTE LEITURA.' },
  { id: 8, code: 'HALT_ATIVO', regra: 11, bloqueia: true, mensagem: 'Sentinela .HALT presente.' },
  { id: 9, code: 'EXFIL_*', regra: 13, bloqueia: true, mensagem: 'Host não autorizado ou payload com dado protegido.' },
  { id: 10, code: 'LOOP_DETECTADO', regra: 8, bloqueia: true, mensagem: 'Mesma operação >3x/60s -> confirmação humana.' },
  { id: 11, code: 'OP_SEM_DRYRUN', regra: 14, bloqueia: true, mensagem: 'Operação destrutiva sem suporte a simulação.' },
]);

export function isClosedTrigger(code) {
  return TRIGGERS.some((t) => t.code === code || (t.code.endsWith('*') && code.startsWith(t.code.slice(0, -1))));
}

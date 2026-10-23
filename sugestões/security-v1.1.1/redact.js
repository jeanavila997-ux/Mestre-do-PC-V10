/**
 * Regra #7 — Redação de segredos.
 *
 * Decisões que mudam em relação ao adendo v1.1.0:
 *
 *  1. NÃO existe regra genérica `\b[A-Za-z0-9_-]{32,}\b`.
 *     Ela mascararia SHA-256, base64, Product ID, SHAs do git — e destruiria
 *     a própria Regra #9 (o hash que o usuário é instruído a calcular viraria
 *     `****`). Prefixos conhecidos + entropia só em token curto resolvem melhor.
 *
 *  2. Webhook do Discord carrega o segredo NO PATH e discord.com é host
 *     PERMITIDO na Regra #13 -> tinha que entrar na redação, ou o token do
 *     webhook vazava para a auditoria.
 *
 *  3. Aplicar SEMPRE antes de truncar (o audit.js do adendo truncava primeiro,
 *     deixando segredo cortado no meio da janela sobreviver).
 */

const RULES = [
  // Bloco PEM (precisa vir primeiro: contém qualquer coisa)
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    '-----BEGIN PRIVATE KEY-----****'],

  // Prefixos de provedor
  [/\b(gh[pousr]_)[A-Za-z0-9]{20,}\b/g, '$1****'],
  [/\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, '$1****'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, 'xox*-****'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, 'AIza****'],
  [/\bsk-(ant-)?[A-Za-z0-9_-]{16,}/g, 'sk-****'],
  [/\bhf_[A-Za-z0-9]{20,}/g, 'hf_****'],

  // Webhook Discord/Slack: o segredo está no path
  [/(https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/)[A-Za-z0-9_-]{20,}/g, '$1****'],
  [/(https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/)[A-Za-z0-9]+\/[A-Za-z0-9]+/g, '$1****'],

  // JWT
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, 'eyJ****'],

  // Credencial embutida em URL
  [/([a-z][a-z0-9+.-]*:\/\/)([^:@\/\s]+):([^@\/\s]+)@/gi, '$1$2:****@'],

  // chave=valor
  [/(\b(?:password|senha|passwd|pwd|token|secret|apikey|api_key|access_key|client_secret)\b\s*[=:]\s*)(["']?)([^\s"',;]{4,})\2/gi,
    '$1$2****$2'],
];

/** Mascara segredos de uma string. Idempotente. */
export function redactSecrets(text) {
  if (typeof text !== 'string' || text === '') return text;
  return RULES.reduce((acc, [re, sub]) => acc.replace(re, sub), text);
}

/** Mascara segredos em estrutura profunda, sem estourar em circular. */
export function redactDeep(value, seen = new WeakSet()) {
  if (typeof value === 'string') return redactSecrets(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((v) => redactDeep(v, seen));

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = /^(password|senha|token|secret|apikey|api_key)$/i.test(k) && typeof v === 'string'
      ? '****'
      : redactDeep(v, seen);
  }
  return out;
}

/**
 * Redige e SÓ DEPOIS trunca. Ordem importa: truncar primeiro deixa um
 * segredo partido ao meio e a regex não casa.
 */
export function redactAndTruncate(value, max = 500) {
  const safe = redactSecrets(typeof value === 'string' ? value : String(value ?? ''));
  return safe.length > max ? `${safe.slice(0, max)}…[+${safe.length - max}]` : safe;
}

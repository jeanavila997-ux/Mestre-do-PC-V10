import { SecurityError } from './errors.js';
import { redactSecrets } from './redact.js';
import { stableStringify } from './canonical.js';

/**
 * Regra #13 — Antiexfiltração.
 *
 * Bug do adendo: `host.endsWith('discord.com')` aceita `evildiscord.com`.
 * Verificado: 'evildiscord.com'.endsWith('discord.com') === true.
 * Correção: igualdade exata OU sufixo com ponto.
 *
 * Também: só HTTPS, redirects proibidos (o fetch padrão segue 302 e fura a
 * allowlist), limite de tamanho e varredura de base64.
 */

export const DEFAULT_ALLOWED_HOSTS = [
  'discord.com',
  'discordapp.com',
  'hooks.slack.com',
  'outlook.office.com',
  'webhook.office.com',
];

const EXFIL_DENY = [
  [/(^|[\\/])COFRE REMOTO([\\/]|$)/i, 'COFRE REMOTO'],
  [/[\\/]\.ssh([\\/]|$)/i, '.ssh'],
  [/(^|[\\/])\.env\b/i, '.env'],
  [/id_rsa/i, 'id_rsa'],
  [/\.(pem|pfx|p12|kdbx)\b/i, 'chave/certificado/cofre'],
  [/BEGIN [A-Z ]*PRIVATE KEY/, 'chave privada'],
  [/(obsidian-recovery-codes|api[ _-]?mistral)/i, 'segredo conhecido da máquina'],
];

function hostAllowed(host, allowedHosts) {
  const h = host.toLowerCase().replace(/\.$/, '');
  return allowedHosts.some((allowed) => {
    const a = allowed.toLowerCase();
    return h === a || h.endsWith(`.${a}`);
  });
}

function decodeSniff(text) {
  const candidates = text.match(/[A-Za-z0-9+/]{40,}={0,2}/g) || [];
  const findings = [];
  for (const cand of candidates.slice(0, 20)) {
    try {
      const decoded = Buffer.from(cand, 'base64').toString('utf8');
      if (!/^[\x09\x0a\x0d\x20-\x7e\u00a0-\uffff]+$/.test(decoded)) continue;
      for (const [re, label] of EXFIL_DENY) {
        if (re.test(decoded)) findings.push(`base64:${label}`);
      }
    } catch {
      /* candidato não é base64 válido */
    }
  }
  return findings;
}

/**
 * @param {{ url: string, payload: unknown, allowedHosts?: string[], maxBytes?: number }} opts
 * @returns {{ ok: true, host: string, body: string }}
 * @throws {SecurityError}
 */
export function preflightExfil({ url, payload, allowedHosts = DEFAULT_ALLOWED_HOSTS, maxBytes = 256 * 1024 }) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new SecurityError('EXFIL_URL_INVALIDA', 'URL malformada — envio bloqueado.', { url: String(url) });
  }

  if (parsed.protocol !== 'https:') {
    throw new SecurityError('EXFIL_SCHEME', `Apenas HTTPS é permitido (recebido: ${parsed.protocol}).`);
  }

  if (!hostAllowed(parsed.hostname, allowedHosts)) {
    throw new SecurityError('EXFIL_HOST', `Host não autorizado: ${parsed.hostname}`, {
      hostname: parsed.hostname,
      allowedHosts,
    });
  }

  const body = typeof payload === 'string' ? payload : stableStringify(payload);

  const bytes = Buffer.byteLength(body, 'utf8');
  if (bytes > maxBytes) {
    throw new SecurityError('EXFIL_TAMANHO', `Payload ${bytes}B excede o limite de ${maxBytes}B.`);
  }

  const hits = EXFIL_DENY.filter(([re]) => re.test(body)).map(([, label]) => label);
  hits.push(...decodeSniff(body));
  if (hits.length > 0) {
    throw new SecurityError('EXFIL_SENSIVEL', `Payload contém dados protegidos: ${[...new Set(hits)].join(', ')}`, {
      findings: [...new Set(hits)],
    });
  }

  return { ok: true, host: parsed.hostname, body: redactSecrets(body) };
}

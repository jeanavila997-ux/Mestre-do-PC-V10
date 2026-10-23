import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SecurityError } from './errors.js';

/**
 * Regra #9 — Integridade da whitelist.
 *
 * O adendo chamava isto de "hash chain" e usava SHA-256 simples com o hash
 * esperado guardado ao lado do JSON, na mesma pasta gravável. Não protege
 * nada: quem edita o JSON edita o .sha256 no mesmo gesto.
 *
 * Aqui:
 *   - HMAC-SHA256 com chave que o agente não lê (passada pelo launcher/DPAPI);
 *   - comparação em tempo constante;
 *   - tolerância a MAIÚSCULAS (Get-FileHash gera uppercase, digest('hex') lowercase
 *     -> o adendo entrava em READ_ONLY permanente por causa disso);
 *   - tolerância a BOM (Out-File -Encoding utf8 no PS 5.1 grava \uFEFF e o trim()
 *     não remove);
 *   - snapshot em memória para matar o TOCTOU (verificar no boot e usar depois).
 */

const BOM = /^\uFEFF/;

function readExpected(hashPath) {
  const raw = fs.readFileSync(hashPath, 'utf8');
  return raw.replace(BOM, '').trim().toLowerCase();
}

function timingSafeEqualHex(a, b) {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function computeDigest(jsonPath, key) {
  const bytes = fs.readFileSync(jsonPath);
  if (key) return crypto.createHmac('sha256', key).update(bytes).digest('hex');
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * @param {{ jsonPath: string, key?: string|Buffer|null, hashPath?: string }} opts
 * @returns {{ ok: boolean, mode: 'FULL'|'READ_ONLY', code: string|null, actual: string, expected: string|null, message: string }}
 */
export function verifyWhitelist({ jsonPath, key = null, hashPath = null }) {
  const expectedPath = hashPath || `${jsonPath}.hmac`;

  if (!fs.existsSync(jsonPath)) {
    return {
      ok: false, mode: 'READ_ONLY', code: 'WHITELIST_AUSENTE', actual: '', expected: null,
      message: `Whitelist não encontrada: ${jsonPath}`,
    };
  }

  // Fail-closed: sem chave não há integridade — SHA-256 nu é forjável por quem
  // escreve o arquivo, então nem fingimos.
  if (!key) {
    return {
      ok: false, mode: 'READ_ONLY', code: 'CHAVE_AUSENTE', actual: '', expected: null,
      message:
        'Chave de integridade ausente (MESTRE_WHITELIST_KEY). ' +
        'Sem ela a whitelist não pode ser verificada: modo SOMENTE LEITURA.',
    };
  }

  const actual = computeDigest(jsonPath, key);

  if (!fs.existsSync(expectedPath)) {
    return {
      ok: false, mode: 'READ_ONLY', code: 'ASSINATURA_AUSENTE', actual, expected: null,
      message: `Assinatura ausente: ${expectedPath}. Rode: node security/cli.js sign`,
    };
  }

  const expected = readExpected(expectedPath);

  if (!timingSafeEqualHex(actual, expected)) {
    return {
      ok: false, mode: 'READ_ONLY', code: 'INTEGRIDADE_VIOLADA', actual, expected,
      message:
        `⚠️ INTEGRIDADE VIOLADA.\nEsperado: ${expected}\nAtual:    ${actual}\n` +
        'A whitelist pode ter sido alterada. Execução bloqueada.',
    };
  }

  return { ok: true, mode: 'FULL', code: null, actual, expected, message: 'Whitelist íntegra.' };
}

/**
 * Carrega, verifica e CONGELA a whitelist em memória.
 * Verificação só no boot é TOCTOU: o arquivo pode mudar depois.
 */
export function loadVerifiedWhitelist({ jsonPath, key, hashPath = null }) {
  const result = verifyWhitelist({ jsonPath, key, hashPath });

  if (!result.ok) {
    const err = new SecurityError(result.code, result.message, { jsonPath, mode: result.mode });
    err.integrity = result;
    throw err;
  }

  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8').replace(BOM, ''));
  const snapshot = deepFreeze(parsed);

  return { snapshot, digest: result.actual, path: jsonPath, mode: result.mode };
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}

/** Escreve a assinatura. Só deve rodar após revisão manual do diff. */
export function signWhitelist({ jsonPath, key, hashPath = null }) {
  if (!key) throw new SecurityError('CHAVE_AUSENTE', 'Chave de integridade obrigatória para assinar.');
  const target = hashPath || `${jsonPath}.hmac`;
  const digest = computeDigest(jsonPath, key);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${digest}\n`, { encoding: 'utf8' });
  return { hashPath: target, digest };
}

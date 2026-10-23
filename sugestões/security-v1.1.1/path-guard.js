import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SecurityError } from './errors.js';

/**
 * Regra #6 — Path Guard.
 *
 * Correções em relação ao adendo v1.1.0:
 *  1. `os` era usado sem import (ReferenceError).
 *  2. `abs.includes('..')` é morto depois de path.resolve() -> trocado por
 *     contenção real via path.relative/prefixo com separador.
 *  3. `startsWith(root)` deixava passar `...\Temp-malicioso` -> prefixo de diretório.
 *  4. Junction/symlink não era resolvido -> realpathSync.native.
 *  5. Comparação não era case-insensitive (Windows é).
 *  6. Fluxo alternativo (ADS) `arquivo.txt:fluxo` passava.
 */

const DENIED = [
  [/(^|[\\/])OneDrive[\\/]COFRE REMOTO([\\/]|$)/i, 'Área interditada: COFRE REMOTO.'],
  [/(^|[\\/])Windows[\\/]System32[\\/]config([\\/]|$)/i, 'Hives do registro do sistema.'],
  [/(^|[\\/])Windows[\\/]NTDS([\\/]|$)/i, 'Banco do Active Directory.'],
  [/(^|[\\/])Microsoft[\\/]Crypto([\\/]|$)/i, 'Chaves criptográficas do usuário.'],
  [/(^|[\\/])Microsoft[\\/]Protect([\\/]|$)/i, 'Chaves mestras DPAPI.'],
  [/(^|[\\/])\.ssh([\\/]|$)/i, 'Chaves SSH.'],
  [/(^|[\\/])\.aws([\\/]|$)/i, 'Credenciais AWS.'],
  [/(^|[\\/])\.gnupg([\\/]|$)/i, 'Chaves GnuPG.'],
];

const DEVICE_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
const DRIVE_ROOT = /^[a-z]:[\\/]?$/i;

function norm(p) {
  const resolved = path.resolve(p);
  return resolved.endsWith(path.sep) ? resolved.slice(0, -1).toLowerCase() : resolved.toLowerCase();
}

/**
 * Resolve o caminho real mesmo quando o alvo ainda não existe:
 * sobe até o ancestral existente, resolve symlink/junction e remonta a cauda.
 */
export function resolveReal(p) {
  const abs = path.resolve(p);
  const tail = [];
  let cur = abs;

  for (let i = 0; i < 64; i += 1) {
    try {
      const real = fs.realpathSync.native(cur);
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return abs;
      tail.push(path.basename(cur));
      cur = parent;
    }
  }
  return abs;
}

function assertUsableRoot(root, label) {
  if (typeof root !== 'string' || root.trim() === '') {
    throw new SecurityError('POLICY_INVALIDA', `Raiz ${label} vazia.`);
  }
  if (root.startsWith('\\\\')) {
    throw new SecurityError('POLICY_INVALIDA', `Raiz ${label} é UNC (rede).`);
  }
  if (DRIVE_ROOT.test(root.trim())) {
    throw new SecurityError('POLICY_INVALIDA', `Raiz ${label} é a raiz do disco (${root}).`);
  }
  return resolveReal(root);
}

/**
 * Monta a política. Diferente do adendo, leitura e escrita são separadas:
 * sem isso, as operações de diagnóstico (CBS, Minidump, WER) quebravam.
 */
export function buildPolicy({
  projectRoot,
  readRoots = [],
  writeRoots = [],
  tempDir = os.tmpdir(),
} = {}) {
  const warnings = [];

  if (!projectRoot) {
    throw new SecurityError(
      'POLICY_INVALIDA',
      'projectRoot ausente. Defina MESTRE_PROJETO_PATH — sem fallback silencioso.',
    );
  }

  const reads = new Map();
  const writes = new Map();

  const add = (store, root, label) => {
    const real = assertUsableRoot(root, label);
    store.set(norm(real), real);
  };

  add(writes, projectRoot, 'projectRoot(escrita)');
  add(reads, projectRoot, 'projectRoot(leitura)');
  for (const r of writeRoots) add(writes, r, 'writeRoots');
  for (const r of readRoots) add(reads, r, 'readRoots');
  for (const [k, v] of writes) reads.set(k, v);

  if (tempDir) {
    try {
      const real = resolveReal(tempDir);
      writes.set(norm(real), real);
      reads.set(norm(real), real);
    } catch {
      warnings.push(`Temp ignorado: ${tempDir}`);
    }
  }

  const homeKey = norm(os.homedir());
  for (const key of reads.keys()) {
    if (key === homeKey) {
      warnings.push('Raiz de leitura inclui o perfil do usuário inteiro — escopo amplo demais.');
    }
  }

  const within = (store, realTarget) => {
    const t = norm(realTarget);
    for (const key of store.keys()) {
      if (t === key || t.startsWith(`${key}${path.sep}`)) return store.get(key);
    }
    return null;
  };

  return {
    warnings,
    reads: [...reads.values()],
    writes: [...writes.values()],

    /**
     * @param {string} target
     * @param {'read'|'write'} mode
     * @returns {string} caminho real, com caixa original
     */
    guard(target, mode = 'read') {
      if (typeof target !== 'string' || target.trim() === '') {
        throw new SecurityError('PATH_INVALIDO', 'Caminho vazio ou não-string.');
      }
      if (target.includes('\0')) {
        throw new SecurityError('PATH_INVALIDO', 'Caminho contém NUL.');
      }
      if (target.startsWith('\\\\') || target.startsWith('//')) {
        throw new SecurityError('PATH_UNC', 'Caminho de rede não autorizado.');
      }

      const abs = path.resolve(target);

      for (const [re, why] of DENIED) {
        if (re.test(abs)) {
          throw new SecurityError('PATH_INTERDITADO', why, { path: abs });
        }
      }

      const real = resolveReal(abs);

      for (const [re, why] of DENIED) {
        if (re.test(real)) {
          throw new SecurityError('PATH_INTERDITADO', why, { path: real, via: 'realpath' });
        }
      }

      const rest = real.slice(2);
      if (/^[a-z]:/i.test(real) && rest.includes(':')) {
        throw new SecurityError('PATH_ADS', 'Fluxo alternativo de arquivo (ADS) não permitido.', {
          path: real,
        });
      }

      if (DEVICE_NAMES.test(path.basename(real))) {
        throw new SecurityError('PATH_DEVICE', 'Nome de dispositivo reservado do Windows.', { path: real });
      }

      const store = mode === 'write' ? writes : reads;
      if (!within(store, real)) {
        throw new SecurityError(
          'PATH_FORA_ESCOPO',
          `Fora das raízes permitidas (${mode}): ${real}`,
          { path: real, mode },
        );
      }

      return real;
    },
  };
}

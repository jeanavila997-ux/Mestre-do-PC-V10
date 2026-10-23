import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { SecurityError } from '../errors.js';
import { stableStringify } from '../canonical.js';
import { buildPolicy } from '../path-guard.js';
import { redactSecrets, redactDeep, redactAndTruncate } from '../redact.js';
import { RateLimiter } from '../rate-limit.js';
import { signWhitelist, verifyWhitelist, loadVerifiedWhitelist } from '../integrity.js';
import { preflightExfil } from '../exfil-guard.js';
import { ApprovalBroker } from '../approval.js';
import { executeDestructive } from '../dry-run.js';
import { createAuditRecorder, TRIGGERS, isClosedTrigger } from '../index.js';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mestre-sec-'));
const proj = path.join(tmpRoot, 'projeto');
fs.mkdirSync(proj, { recursive: true });

const makePolicy = (extra = {}) => buildPolicy({ projectRoot: proj, ...extra });
const codeOf = (fn) => {
  try { fn(); return null; } catch (err) { return err.code || err.name; }
};

// ────────────────────────────────  path-guard  ────────────────────────────────

test('path-guard: aceita escrita dentro do projeto', () => {
  const p = makePolicy();
  const out = p.guard(path.join(proj, 'sub', 'arquivo.txt'), 'write');
  assert.ok(out.toLowerCase().endsWith('arquivo.txt'));
});

test('path-guard: prefixo de string não engana (projeto-evil)', () => {
  // tempDir: null isola a propriedade de contenção — com Temp como raiz,
  // 'projeto-evil' cairia dentro de Temp e o teste não provaria nada.
  const p = buildPolicy({ projectRoot: proj, tempDir: null });
  // O adendo usava startsWith(root): 'projeto-evil' passava.
  assert.equal(codeOf(() => p.guard(path.join(tmpRoot, 'projeto-evil', 'x.txt'), 'write')), 'PATH_FORA_ESCOPO');
  // O irmão legítimo ('projeto2') também não pode ser confundido com 'projeto'.
  const irmao = path.join(tmpRoot, 'projeto2');
  fs.mkdirSync(irmao, { recursive: true });
  assert.equal(codeOf(() => p.guard(path.join(irmao, 'x.txt'), 'write')), 'PATH_FORA_ESCOPO');
});

test('path-guard: traversal resolvido é bloqueado', () => {
  const p = makePolicy();
  const alvo = path.join(proj, '..', '..', '..', 'Windows', 'System32', 'x.txt');
  assert.equal(codeOf(() => p.guard(alvo, 'read')), 'PATH_FORA_ESCOPO');
});

test('path-guard: COFRE REMOTO é interdito antes de qualquer escopo', () => {
  const p = makePolicy();
  const alvo = 'C:\\Users\\Jean\\OneDrive\\COFRE REMOTO\\notas.txt';
  assert.equal(codeOf(() => p.guard(alvo, 'read')), 'PATH_INTERDITADO');
});

test('path-guard: UNC bloqueado', () => {
  const p = makePolicy();
  assert.equal(codeOf(() => p.guard('\\\\servidor\\share\\x.txt', 'read')), 'PATH_UNC');
});

test('path-guard: fluxo alternativo (ADS) bloqueado', () => {
  const p = makePolicy();
  assert.equal(codeOf(() => p.guard(path.join(proj, 'a.txt:segredo'), 'read')), 'PATH_ADS');
});

test('path-guard: caminho vazio e NUL bloqueados', () => {
  const p = makePolicy();
  assert.equal(codeOf(() => p.guard('', 'read')), 'PATH_INVALIDO');
  assert.equal(codeOf(() => p.guard(`a\0b`, 'read')), 'PATH_INVALIDO');
});

test('path-guard: junction para fora do projeto é resolvido pelo realpath', (t) => {
  const p = makePolicy();
  const link = path.join(proj, 'atalho-windows');
  try {
    fs.symlinkSync('C:\\Windows', link, 'junction');
  } catch {
    t.skip('junction não suportada neste ambiente');
    return;
  }
  const alvo = path.join(link, 'System32', 'drivers', 'etc', 'hosts');
  assert.equal(codeOf(() => p.guard(alvo, 'read')), 'PATH_FORA_ESCOPO');
});

test('path-guard: política inválida falha fechado', () => {
  assert.throws(() => buildPolicy({}), SecurityError);
  assert.throws(() => buildPolicy({ projectRoot: 'C:\\' }), SecurityError);
  assert.throws(() => buildPolicy({ projectRoot: '\\\\host\\share' }), SecurityError);
});

// ────────────────────────────────  redact  ────────────────────────────────

test('redact: prefixos de provedor são mascarados', () => {
  const ghp = `ghp_${'A'.repeat(36)}`;
  const aws = 'AKIAABCDEFGHIJKLMNOP';

  // Solto: a regra de prefixo preserva o provedor (útil no diagnóstico).
  const solto = redactSecrets(`valor ${ghp} e ${aws} fim`);
  assert.ok(!solto.includes(ghp));
  assert.match(solto, /ghp_\*{4}/);
  assert.match(solto, /AKIA\*{4}/);

  // Em contexto chave=valor a regra genérica é mais conservadora e come o
  // prefixo também — o segredo continua mascarado, que é o que importa.
  const kv = redactSecrets(`token=${ghp} aws=${aws}`);
  assert.ok(!kv.includes(ghp));
  assert.ok(!kv.includes(aws));
});

test('redact: JWT, credencial de URL e password= ', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop';
  const out = redactSecrets(`Bearer ${jwt} https://user:SenhaForte@host/x password=Abc12345`);
  assert.ok(!out.includes(jwt));
  assert.ok(!out.includes('SenhaForte'));
  assert.ok(!out.includes('Abc12345'));
  assert.match(out, /user:\*{4}@/);
});

test('redact: bloco de chave privada', () => {
  const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----';
  const out = redactSecrets(`arquivo: ${pem}`);
  assert.ok(!out.includes('MIIEow'));
});

test('redact: token de webhook Discord (segredo no path) é mascarado', () => {
  const url = `https://discord.com/api/webhooks/123456789/${'aBcD'.repeat(8)}`;
  const out = redactSecrets(url);
  assert.ok(!out.includes('aBcDaBcDaBcD'), 'token do webhook vazou');
  assert.match(out, /\/webhooks\/123456789\/\*{4}/);
});

test('redact: NÃO mascara SHA-256 (regressão da Regra #9)', () => {
  const sha = 'a'.repeat(64);
  assert.equal(redactSecrets(`hash: ${sha}`), `hash: ${sha}`);
});

test('redact: NÃO mascara UUID nem caminho comum', () => {
  const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
  const p = 'C:\\Users\\Jean\\Projetos\\Mestre-do-PC-V10\\v10\\launcher.js';
  assert.equal(redactSecrets(`${uuid} ${p}`), `${uuid} ${p}`);
});

test('redact: é idempotente', () => {
  const src = `ghp_${'Z'.repeat(36)} password=Segredo123`;
  const once = redactSecrets(src);
  assert.equal(redactSecrets(once), once);
});

test('redact: redige ANTES de truncar (segredo partido no limite)', () => {
  const token = `ghp_${'Q'.repeat(36)}`;
  const texto = `${'x'.repeat(495)}${token}`; // o corte de 500 cai no meio do token
  const out = redactAndTruncate(texto, 500);
  assert.ok(!out.includes('Q'.repeat(5)), 'segredo sobreviveu ao corte');
});

test('redact: redactDeep mascara campo sensível', () => {
  const out = redactDeep({ token: 'abc123', senha: 'x', ok: 1 });
  assert.equal(out.token, '****');
  assert.equal(out.senha, '****');
  assert.equal(out.ok, 1);
});

// ────────────────────────────────  rate limit  ────────────────────────────────

test('rate-limit: bloqueia a 4ª execução da mesma operação', () => {
  let t = 0;
  const rl = new RateLimiter({ now: () => t });
  for (let i = 0; i < 3; i += 1) assert.equal(rl.check('limpeza').ok, true);
  const blocked = rl.check('limpeza');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'LOOP_DETECTADO');
  assert.equal(blocked.requiresHumanConfirmation, true);
});

test('rate-limit: janela deslizante libera depois de expirar', () => {
  let t = 0;
  const rl = new RateLimiter({ now: () => t });
  for (let i = 0; i < 3; i += 1) rl.check('op');
  assert.equal(rl.check('op').ok, false);
  t = 61_000;
  assert.equal(rl.check('op').ok, true);
});

test('rate-limit: limite global é escopado por invocação de ferramenta', () => {
  let t = 0;
  const rl = new RateLimiter({ global: 5, perOp: 100, now: () => t });
  for (let i = 0; i < 5; i += 1) assert.equal(rl.check(`cmd${i}`, { scope: 'diag-1' }).ok, true);
  assert.equal(rl.check('cmd6', { scope: 'diag-1' }).ok, false);
  // Uma nova invocação começa com o contador zerado.
  assert.equal(rl.check('cmd7', { scope: 'diag-2' }).ok, true);
});

test('rate-limit: sweep não deixa a memória crescer', () => {
  let t = 0;
  const rl = new RateLimiter({ now: () => t });
  for (let i = 0; i < 50; i += 1) rl.check(`op${i}`);

  const antes = rl.snapshot().buckets;
  assert.ok(antes > 0, 'deveria ter buckets vivos');

  t = 120_000; // tudo fora da janela de 60s
  assert.equal(rl.sweep(), antes, 'sweep deveria remover todos os buckets vivos');
  assert.equal(rl.snapshot().buckets, 0);
});

// ────────────────────────────────  integridade  ────────────────────────────────

const KEY = Buffer.from('chave-de-teste-do-launcher', 'utf8');

function whitelistFixture() {
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'wl-'));
  const jsonPath = path.join(dir, 'allowed-operations.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ operations: [{ id: 'ver_uso_ram' }] }, null, 2));
  return { dir, jsonPath, hashPath: `${jsonPath}.hmac` };
}

test('integridade: assina e verifica', () => {
  const { jsonPath } = whitelistFixture();
  const signed = signWhitelist({ jsonPath, key: KEY });
  const res = verifyWhitelist({ jsonPath, key: KEY });
  assert.equal(res.ok, true);
  assert.equal(res.mode, 'FULL');
  assert.equal(res.actual, signed.digest);
});

test('integridade: hash em MAIÚSCULAS (Get-FileHash) é aceito', () => {
  const { jsonPath, hashPath } = whitelistFixture();
  const { digest } = signWhitelist({ jsonPath, key: KEY });
  fs.writeFileSync(hashPath, `${digest.toUpperCase()}\n`);
  assert.equal(verifyWhitelist({ jsonPath, key: KEY }).ok, true);
});

test('integridade: BOM + CRLF no arquivo de assinatura são tolerados', () => {
  const { jsonPath, hashPath } = whitelistFixture();
  const { digest } = signWhitelist({ jsonPath, key: KEY });
  fs.writeFileSync(hashPath, `\uFEFF${digest.toUpperCase()}\r\n`);
  assert.equal(verifyWhitelist({ jsonPath, key: KEY }).ok, true);
});

test('integridade: alteração na whitelist é detectada', () => {
  const { jsonPath } = whitelistFixture();
  signWhitelist({ jsonPath, key: KEY });
  fs.writeFileSync(jsonPath, JSON.stringify({ operations: [{ id: 'formatar_disco' }] }));
  const res = verifyWhitelist({ jsonPath, key: KEY });
  assert.equal(res.ok, false);
  assert.equal(res.mode, 'READ_ONLY');
  assert.equal(res.code, 'INTEGRIDADE_VIOLADA');
});

test('integridade: sem chave falha fechado (SHA-256 nu é forjável)', () => {
  const { jsonPath } = whitelistFixture();
  signWhitelist({ jsonPath, key: KEY });
  const res = verifyWhitelist({ jsonPath, key: null });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'CHAVE_AUSENTE');
});

test('integridade: snapshot em memória é congelado (anti-TOCTOU)', () => {
  const { jsonPath } = whitelistFixture();
  signWhitelist({ jsonPath, key: KEY });
  const { snapshot } = loadVerifiedWhitelist({ jsonPath, key: KEY });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.throws(() => { snapshot.operations.push({ id: 'injetado' }); }, TypeError);
});

// ────────────────────────────────  antiexfil  ────────────────────────────────

test('antiexfil: evildiscord.com é bloqueado (bug do endsWith)', () => {
  assert.equal(
    codeOf(() => preflightExfil({ url: 'https://evildiscord.com/api/webhooks/1/x', payload: {} })),
    'EXFIL_HOST',
  );
  assert.equal(
    codeOf(() => preflightExfil({ url: 'https://discord.com.evil.io/x', payload: {} })),
    'EXFIL_HOST',
  );
});

test('antiexfil: host legítimo e subdomínio autorizado passam', () => {
  assert.equal(preflightExfil({ url: 'https://discord.com/api/webhooks/1/x', payload: { a: 1 } }).ok, true);
  assert.equal(preflightExfil({ url: 'https://x.hooks.slack.com/services/a/b', payload: { a: 1 } }).ok, true);
});

test('antiexfil: HTTP e URL malformada bloqueados', () => {
  assert.equal(codeOf(() => preflightExfil({ url: 'http://discord.com/x', payload: {} })), 'EXFIL_SCHEME');
  assert.equal(codeOf(() => preflightExfil({ url: 'nao-e-url', payload: {} })), 'EXFIL_URL_INVALIDA');
});

test('antiexfil: payload com dado protegido bloqueado', () => {
  assert.equal(
    codeOf(() => preflightExfil({ url: 'https://discord.com/x', payload: { p: 'C:\\Users\\Jean\\.ssh\\id_rsa' } })),
    'EXFIL_SENSIVEL',
  );
});

test('antiexfil: segredo escondido em base64 também é detectado', () => {
  const b64 = Buffer.from('conteudo de OneDrive\\COFRE REMOTO', 'utf8').toString('base64');
  assert.equal(
    codeOf(() => preflightExfil({ url: 'https://discord.com/x', payload: { blob: b64 } })),
    'EXFIL_SENSIVEL',
  );
});

test('antiexfil: limite de tamanho', () => {
  assert.equal(
    codeOf(() => preflightExfil({ url: 'https://discord.com/x', payload: 'a'.repeat(300 * 1024) })),
    'EXFIL_TAMANHO',
  );
});

// ────────────────────────────────  aprovação  ────────────────────────────────

test('aprovação: "confirmo" vindo do modelo é recusado', () => {
  const broker = new ApprovalBroker({ key: KEY });
  assert.equal(
    codeOf(() => broker.consume('confirmo', { op: 'limpeza', args: {} })),
    'APROVACAO_FORJADA',
  );
});

test('aprovação: token válido é aceito uma única vez', () => {
  const broker = new ApprovalBroker({ key: KEY });
  const { token } = broker.issue({ op: 'limpeza', args: { alvo: 'temp' } });
  assert.equal(broker.consume(token, { op: 'limpeza', args: { alvo: 'temp' } }).ok, true);
  assert.equal(codeOf(() => broker.consume(token, { op: 'limpeza', args: { alvo: 'temp' } })), 'APROVACAO_REUTILIZADA');
});

test('aprovação: aprovar A e executar B é recusado', () => {
  const broker = new ApprovalBroker({ key: KEY });
  const { token } = broker.issue({ op: 'limpeza', args: { alvo: 'temp' } });
  assert.equal(
    codeOf(() => broker.consume(token, { op: 'limpeza', args: { alvo: 'C:\\' } })),
    'APROVACAO_ARGS_DIVERGENTES',
  );
});

test('aprovação: token expirado é recusado', () => {
  let t = 1_000_000;
  const broker = new ApprovalBroker({ key: KEY, ttlMs: 1000, now: () => t });
  const { token } = broker.issue({ op: 'op', args: {} });
  t += 5000;
  assert.equal(codeOf(() => broker.consume(token, { op: 'op', args: {} })), 'APROVACAO_EXPIRADA');
});

test('aprovação: assinatura adulterada é recusada', () => {
  const broker = new ApprovalBroker({ key: KEY });
  const { token } = broker.issue({ op: 'op', args: {} });
  const forged = `${token.slice(0, -1)}A`;
  assert.equal(codeOf(() => broker.consume(forged, { op: 'op', args: {} })), 'APROVACAO_INVALIDA');
});

// ────────────────────────────────  dry-run  ────────────────────────────────

test('dry-run: operação sem suporte NÃO executa (fail-closed)', async () => {
  let chamadas = 0;
  const res = await executeDestructive({
    op: 'limpeza_rapida_completa',
    args: { alvo: 'C:\\Temp' },
    supportsDryRun: false,
    runner: async () => { chamadas += 1; return { removed: 1 }; },
  });
  assert.equal(res.status, 'BLOQUEADO_SEM_DRYRUN');
  assert.equal(chamadas, 0, 'executou apesar de não suportar simulação');
});

test('dry-run: preview real, e nada além do preview sem token', async () => {
  const vistos = [];
  const res = await executeDestructive({
    op: 'limpeza',
    args: { alvo: 'C:\\Temp' },
    supportsDryRun: true,
    runner: async ({ dryRun }) => { vistos.push(dryRun); return { removeria: 42 }; },
  });
  assert.equal(res.status, 'PREVIEW');
  assert.deepEqual(vistos, [true]);
  assert.match(res.mensagem, /simulação/);
});

test('dry-run: com aprovação válida executa de verdade', async () => {
  const broker = new ApprovalBroker({ key: KEY });
  const args = { alvo: 'C:\\Temp' };
  const { token } = broker.issue({ op: 'limpeza', args });
  const vistos = [];
  const res = await executeDestructive({
    op: 'limpeza',
    args,
    supportsDryRun: true,
    broker,
    token,
    runner: async ({ dryRun }) => { vistos.push(dryRun); return { ok: true }; },
  });
  assert.equal(res.status, 'EXECUTADO');
  assert.deepEqual(vistos, [true, false]);
});

test('dry-run: token de outra operação não executa', async () => {
  const broker = new ApprovalBroker({ key: KEY });
  const { token } = broker.issue({ op: 'outra', args: {} });
  let chamadas = 0;
  await assert.rejects(
    executeDestructive({
      op: 'limpeza',
      args: {},
      supportsDryRun: true,
      broker,
      token,
      runner: async () => { chamadas += 1; return {}; },
    }),
    (err) => err.code === 'APROVACAO_ARGS_DIVERGENTES',
  );
  assert.equal(chamadas, 1, 'só o preview deveria ter rodado');
});

// ────────────────────────────────  auditoria  ────────────────────────────────

test('auditoria: entrada tem cadeia de hash e redação', () => {
  const recebidas = [];
  const rec = createAuditRecorder({ sink: (e) => recebidas.push(e) });
  rec.record({ tool: 'ver_uso_ram', nivel: 'N0', result: 'ok', args: { password: 'segredo' } });
  rec.record({ tool: 'limpeza', nivel: 'N3', error: new SecurityError('PATH_INTERDITADO', 'x') });

  assert.equal(recebidas.length, 2);
  assert.equal(recebidas[0].prev, '0'.repeat(64));
  assert.equal(recebidas[1].prev, recebidas[0].hash);
  assert.equal(recebidas[0].args.password, '****');
  assert.equal(recebidas[1].status, 'FALHA');
  assert.equal(recebidas[1].errorCode, 'PATH_INTERDITADO');
  assert.equal(rec.getChainHead().entries, 2);
});

test('auditoria: argumento circular não perde a entrada', () => {
  const recebidas = [];
  const rec = createAuditRecorder({ sink: (e) => recebidas.push(e) });
  const circular = { a: 1 };
  circular.self = circular;
  assert.doesNotThrow(() => rec.record({ tool: 'x', args: circular }));
  assert.equal(recebidas.length, 1);
});

// ────────────────────────────────  contrato  ────────────────────────────────

test('contrato: lista de gatilhos é fechada e cobre os códigos reais', () => {
  assert.equal(TRIGGERS.length, 11);
  for (const code of ['LOOP_DETECTADO', 'OP_SEM_DRYRUN', 'PATH_FORA_ESCOPO', 'EXFIL_HOST', 'APROVACAO_FORJADA']) {
    assert.equal(isClosedTrigger(code), true, `${code} não está na lista fechada`);
  }
  assert.equal(isClosedTrigger('GOSTEI_MUITO'), false);
});

test('canonical: ordem de chaves não altera a saída', () => {
  assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }));
});

test.after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

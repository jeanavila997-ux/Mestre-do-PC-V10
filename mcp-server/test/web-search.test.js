import test from "node:test";
import assert from "node:assert/strict";

import {
  assertSafeRemoteUrl,
  validateSearchQuery,
  validateWebUrl,
} from "../../v10/chat-integrado/web-search.js";

test("busca web aceita português, pontuação e até 256 caracteres", () => {
  assert.equal(
    validateSearchQuery(" atualização do Windows: erros 0x800f081f? "),
    "atualização do Windows: erros 0x800f081f?",
  );
  assert.equal(validateSearchQuery("a".repeat(256)), "a".repeat(256));
});

test("busca web rejeita controles, vazio e excesso de tamanho", () => {
  assert.throws(() => validateSearchQuery("linha\nseguinte"), /caracteres inválidos/);
  assert.throws(() => validateSearchQuery("   "), /inválido ou vazio/);
  assert.throws(() => validateSearchQuery("a".repeat(257)), /muito longo/);
});

test("URL web aceita http/https completos e rejeita protocolos ou credenciais", () => {
  assert.equal(
    validateWebUrl("https://example.com:443/status?ready=true#resultado").cleanUrl,
    "https://example.com:443/status?ready=true#resultado",
  );
  assert.throws(() => validateWebUrl("file:///C:/Windows/win.ini"), /http\/https/);
  assert.throws(() => validateWebUrl("https://user:secret@example.com"), /credenciais/);
});

test("fetch web bloqueia endereços locais e privados sem consultar a rede", async () => {
  for (const url of [
    "http://localhost/admin",
    "http://127.0.0.1:7777/ping",
    "http://10.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[::ffff:7f00:1]/",
  ]) {
    await assert.rejects(assertSafeRemoteUrl(url), /locais ou privadas/);
  }
});

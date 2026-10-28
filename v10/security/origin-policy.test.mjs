import assert from "node:assert/strict";
import test from "node:test";
import { isTrustedClientOrigin, parseExtraOrigins } from "./origin-policy.js";

test("aceita localhost, LAN, túnel, VPS e as páginas do projeto", () => {
  assert.equal(isTrustedClientOrigin(""), true);
  assert.equal(isTrustedClientOrigin("http://127.0.0.1:7777"), true);
  assert.equal(isTrustedClientOrigin("http://localhost:8787"), true);
  assert.equal(isTrustedClientOrigin("http://192.168.0.20:7777"), true);
  assert.equal(isTrustedClientOrigin("http://10.1.2.3:7777"), true);
  assert.equal(isTrustedClientOrigin("http://172.16.5.5:7777"), true);
  assert.equal(isTrustedClientOrigin("https://abc.trycloudflare.com"), true);
  assert.equal(isTrustedClientOrigin("http://72.62.11.116:7777"), true);
  assert.equal(isTrustedClientOrigin("https://chat-ia.72-62-11-116.sslip.io"), true);
  assert.equal(isTrustedClientOrigin("https://jeanavila997-ux.github.io"), true);
  assert.equal(isTrustedClientOrigin("https://mestre-do-pc-mobile.pages.dev"), true);
});

test("recusa origem pública desconhecida", () => {
  assert.equal(isTrustedClientOrigin("https://evil.example"), false);
  assert.equal(isTrustedClientOrigin("http://8.8.8.8"), false);
  assert.equal(isTrustedClientOrigin("https://outro.github.io"), false);
  assert.equal(isTrustedClientOrigin("https://random.sslip.io"), false);
  assert.equal(isTrustedClientOrigin("javascript:alert(1)"), false);
  assert.equal(isTrustedClientOrigin("not a url"), false);
});

test("origens extras configuráveis", () => {
  const extra = parseExtraOrigins(" https://app.exemplo.dev , *.pages.dev ");
  assert.deepEqual(extra, ["https://app.exemplo.dev", "*.pages.dev"]);
  assert.equal(isTrustedClientOrigin("https://app.exemplo.dev", extra), true);
  assert.equal(isTrustedClientOrigin("https://mestre.pages.dev", extra), true);
  assert.equal(isTrustedClientOrigin("https://pages.dev", extra), false);
});

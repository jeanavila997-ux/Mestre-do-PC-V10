import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeToolArgument } from "../security.js";

test("aceita nomes seguros de processo e servico", () => {
  assert.equal(sanitizeToolArgument("Windows-Update_1.2"), "Windows-Update_1.2");
  assert.equal(sanitizeToolArgument("Google Chrome"), "Google Chrome");
});

test("rejeita metacaracteres PowerShell em vez de remove-los", () => {
  for (const value of [
    "spooler; Stop-Computer",
    "$(Get-Process)",
    "nome`whoami",
    "servico | Out-File x",
    "processo&calc",
    '"quoted"',
  ]) {
    assert.equal(sanitizeToolArgument(value), null);
  }
});

test("rejeita valores vazios e excessivamente longos", () => {
  assert.equal(sanitizeToolArgument("   "), null);
  assert.equal(sanitizeToolArgument("a".repeat(129)), null);
});

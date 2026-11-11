import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const bridge = await import(new URL("../../v10/rea-bridge.js", import.meta.url));

test("rea: status sempre responde com modo de execução e raízes", async () => {
  const status = await bridge.reaStatus();
  assert.equal(status.available, true);
  assert.ok(["custom", "local", "path", "npx"].includes(status.mode));
  assert.equal(status.package, bridge.REA_PACKAGE);
  assert.ok(Array.isArray(status.allowedRoots) && status.allowedRoots.length > 0);
  assert.equal(status.capabilities.nativeBinary, false, "binário nativo depende do MCP do REA, não do launcher");
});

test("rea: alvo relativo, inexistente ou fora das raízes é recusado", async () => {
  const relativo = await bridge.validateTarget("app.asar");
  assert.equal(relativo.ok, false);
  assert.match(relativo.error, /absoluto/i);

  const inexistente = await bridge.validateTarget(join(root, "nao-existe-xyz.asar"));
  assert.equal(inexistente.ok, false);
  assert.match(inexistente.error, /não encontrado/i);

  const windows = await bridge.validateTarget("C:\\Windows\\System32\\notepad.exe");
  assert.equal(windows.ok, false);
  assert.match(windows.error, /raízes permitidas/i);
});

test("rea: caminho com metacaractere de shell é recusado", async () => {
  for (const alvo of [
    join(root, 'a"; calc.asar'),
    join(root, "a&calc.asar"),
    join(root, "a|calc.asar"),
    join(root, "a%PATH%.asar"),
    join(root, "a^calc.asar"),
  ]) {
    const check = await bridge.validateTarget(alvo);
    assert.equal(check.ok, false, `deveria recusar ${alvo}`);
    assert.match(check.error, /recusado/i);
  }
});

test("rea: alvo válido dentro da raiz do projeto é aceito", async () => {
  const check = await bridge.validateTarget(root);
  assert.equal(check.ok, true);
  assert.equal(check.type, "directory");
});

test("rea: análise de alvo inválido falha na validação, sem executar nada", async () => {
  const result = await bridge.reaAnalyzeAppJs({ target: "C:\\Windows\\System32\\notepad.exe" });
  assert.equal(result.ok, false);
  assert.equal(result.stage, "validation");
  assert.equal(result.evidence, undefined);
});

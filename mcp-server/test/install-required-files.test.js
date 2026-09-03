// Regressao ADR-001: o commit b2a75f5 moveu Register-MestreTask.ps1 para scripts/
// sem atualizar install.ps1. Como o instalador roda com $ErrorActionPreference="Stop",
// a instalacao limpa abortava no passo 1 e a tarefa que da elevacao ao launcher
// nunca era registrada. Este teste le a lista $required do proprio install.ps1 e
// exige que cada caminho exista no repositorio.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));

// Extrai os literais do bloco `$required = @( ... )` do install.ps1.
function parseRequiredList(installScript) {
  const block = installScript.match(/\$required\s*=\s*@\(([\s\S]*?)\)/);
  assert.ok(block, "bloco $required nao encontrado em install.ps1");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

test("todo arquivo de $required do install.ps1 existe no repositorio", async () => {
  const installScript = await readFile(join(root, "install.ps1"), "utf8");
  const required = parseRequiredList(installScript);

  assert.ok(required.length > 0, "lista $required vazia — parser provavelmente quebrou");

  const missing = required.filter((rel) => !existsSync(join(root, rel.replace(/\\/g, "/"))));
  assert.deepEqual(
    missing,
    [],
    `install.ps1 exige arquivos que nao existem no repositorio: ${missing.join(", ")}`
  );
});

test("scripts invocados pelo install.ps1 existem no caminho declarado", async () => {
  const installScript = await readFile(join(root, "install.ps1"), "utf8");

  // Casa `Join-Path $InstallDir "<caminho>"` seguido de invocacao com `&`.
  const invocations = [...installScript.matchAll(/Join-Path\s+\$InstallDir\s+"([^"]+\.ps1)"/g)].map(
    (m) => m[1]
  );

  assert.ok(invocations.length > 0, "nenhum script .ps1 resolvido via $InstallDir encontrado");

  const missing = invocations.filter((rel) => !existsSync(join(root, rel.replace(/\\/g, "/"))));
  assert.deepEqual(
    missing,
    [],
    `install.ps1 invoca scripts inexistentes: ${missing.join(", ")}`
  );
});

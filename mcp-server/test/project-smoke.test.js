import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));

test("script inline da V10 compila e inicializa regras antes da renderizacao", async () => {
  const html = await readFile(join(root, "v10", "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Function(scripts[0][1]));

  const declaration = html.indexOf("const DANGER_PATTERNS");
  const firstUse = html.indexOf("const danger = isDangerous");
  assert.ok(declaration >= 0 && firstUse >= 0 && declaration < firstUse);
  assert.match(html, /Stop-Computer\|Restart-Computer\|logoff/);
  assert.match(html, /SetSuspendState/);
  assert.match(html, /shutdown\\s\+\\\/\[rshl\]/);
});

test("V10 usa caminho de projeto do ambiente e cabeçalho privilegiado", async () => {
  const html = await readFile(join(root, "v10", "index.html"), "utf8");
  assert.match(html, /\$env:MESTRE_PROJETO_PATH/);
  assert.match(html, /"X-Mestre-Client": "v10-web"/);
  assert.doesNotMatch(html, /C:\\\\MestreDoPC_V7/);
  assert.doesNotMatch(html, /C:\\\\Users\\\\Jeanc\\\\MestreDoPC_V7/);
});

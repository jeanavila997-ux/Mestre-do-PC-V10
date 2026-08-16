import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));

test("script inline da V10 compila e inicializa regras antes da renderizacao", async () => {
  const html = await readFile(join(root, "v10", "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  const inlineScripts = scripts.filter((s) => s[1].trim().length > 0);
  assert.ok(inlineScripts.length >= 1, "esperado pelo menos 1 script inline");
  assert.doesNotThrow(() => new Function(inlineScripts[0][1]));

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

test("V10 exibe status do perfil de modelo na interface", async () => {
  const html = await readFile(join(root, "v10", "index.html"), "utf8");
  assert.match(html, /modelProfileStatus/);
  assert.match(html, /modelProfileText/);
  assert.match(html, /modelProfile/);
  assert.match(html, /modelProfileIcon/);
});

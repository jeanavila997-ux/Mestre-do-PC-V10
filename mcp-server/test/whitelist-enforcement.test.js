import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(url) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url + "/ping");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Launcher Node não iniciou no prazo.");
}

async function startLauncher(t) {
  const port = await reservePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(root, "v10", "launcher.js")], {
    cwd: join(root, "v10"),
    env: { ...process.env, MPC_PORT: String(port) },
    windowsHide: true,
    stdio: "ignore",
  });
  t.after(() => child.kill());
  await waitForServer(base);
  return base;
}

function classify(base, body) {
  return fetch(base + "/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mestre-Client": "mcp" },
    body: JSON.stringify(body),
  });
}

test("launcher Node.js só executa comandos resolvidos pela whitelist", async () => {
  const launcher = await readFile(join(root, "v10", "launcher.js"), "utf8");
  const registry = await readFile(join(root, "v10", "operation-registry.js"), "utf8");

  // O catálogo é carregado via OperationRegistry antes de o listener aceitar requisições.
  assert.match(launcher, /loadOperationRegistry/);
  assert.match(launcher, /allowed-operations\.json/);
  assert.match(registry, /class OperationRegistry/);

  // O /run resolve antes de agendar; o job nunca recebe o texto cru do cliente.
  assert.match(launcher, /const resolved = resolveCommand\(body\)/);
  assert.match(launcher, /runPowerShell\(resolved\.cmd/);
  assert.doesNotMatch(launcher, /runPowerShell\(body\.cmd\)/);

  // Mensagem de bloqueio em paridade com o backend legado.
  assert.match(registry, /Operação bloqueada: somente comandos cadastrados na V10/);

  // /classify e a heurística de injection existem no backend Node também.
  assert.match(launcher, /\/classify/);
  assert.match(launcher, /checkPromptInjection/);
});

test("catálogo: templates com command fixo são alcançáveis", async () => {
  const catalog = JSON.parse(await readFile(join(root, "v10", "allowed-operations.json"), "utf8"));
  const fixed = catalog.templates.filter((t) => typeof t.command === "string");
  const parametrized = catalog.templates.filter((t) => typeof t.pattern === "string");

  // Toda entrada de templates precisa ser executável de alguma forma.
  assert.equal(fixed.length + parametrized.length, catalog.templates.length);
  assert.ok(fixed.length > 0, "esperado ao menos um template de comando fixo");
});

test("/classify aprova operação exata, template válido e bloqueia comando livre", async (t) => {
  const base = await startLauncher(t);
  const catalog = JSON.parse(await readFile(join(root, "v10", "allowed-operations.json"), "utf8"));

  const lowRisk = catalog.operations.find((op) => !op.destructive);
  const exact = await (await classify(base, { cmd: lowRisk.command })).json();
  assert.equal(exact.allowed, true);
  assert.equal(exact.destructive, false);
  assert.equal(exact.id, lowRisk.id);

  const destructive = catalog.operations.find((op) => op.destructive);
  const destructiveResult = await (await classify(base, { id: destructive.id })).json();
  assert.equal(destructiveResult.allowed, true);
  assert.equal(destructiveResult.destructive, true);

  const tpl = await (await classify(base, { id: "encerrar_processo", params: { nome: "notepad" } })).json();
  assert.equal(tpl.allowed, true);
  assert.equal(tpl.destructive, true);
  assert.match(tpl.cmd, /notepad/);

  const badParam = await (await classify(base, { id: "encerrar_processo", params: { nome: "notepad; Stop-Computer" } })).json();
  assert.equal(badParam.allowed, false);

  const free = await (await classify(base, { cmd: "Write-Host LIVRE" })).json();
  assert.equal(free.allowed, false);
  assert.match(free.reason, /Operação bloqueada/);
});

test("/classify exige cliente autorizado", async (t) => {
  const base = await startLauncher(t);
  const anon = await fetch(base + "/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "ver_uso_ram" }),
  });
  assert.equal(anon.status, 403);
});

test("template parametrizado casa por cmd literal (modo legado)", async (t) => {
  const base = await startLauncher(t);
  const compiled = await (await classify(base, { id: "encerrar_processo", params: { nome: "notepad" } })).json();
  const legacy = await (await classify(base, { cmd: compiled.cmd })).json();
  assert.equal(legacy.allowed, true);
  assert.equal(legacy.id, "encerrar_processo");
});

test("template HTTPS rejeita expansão de expressão PowerShell", async () => {
  const catalog = JSON.parse(await readFile(join(root, "v10", "allowed-operations.json"), "utf8"));
  const { OperationRegistry } = await import(pathToFileURL(join(root, "v10", "operation-registry.js")).href);
  const registry = new OperationRegistry(catalog);
  const maliciousUrl = "https://example.com/" + "$" + "(whoami)";

  const blocked = registry.resolve({ id: "testar_https_de_site", params: { url_teste: maliciousUrl } });
  assert.match(blocked.error || "", /Parâmetro inválido/);

  const allowed = registry.resolve({
    id: "testar_https_de_site",
    params: { url_teste: "https://example.com/status?ready=true" },
  });
  assert.equal(allowed.id, "testar_https_de_site");
  assert.match(allowed.cmd, /https:\/\/example\.com\/status\?ready=true/);

  for (const url of ["https://example.com:443/health", "https://example.com?ready=true", "https://example.com#status"]) {
    assert.equal(registry.resolve({ id: "testar_https_de_site", params: { url_teste: url } }).id, "testar_https_de_site");
  }
});

test("MCP delega a validação de parâmetros ao OperationRegistry", async () => {
  const source = await readFile(join(root, "mcp-server", "index.js"), "utf8");
  assert.match(source, /operationRegistry\.resolve\(\{ id: toolConfig\.id, params \}\)/);
  assert.doesNotMatch(source, /const sanitizedValue = sanitizeToolArgument\(value\)/);
});

test("todo id do registry MCP existe em allowed-operations.json", async () => {
  // O MCP server agora deriva suas ferramentas de v10/operation-registry.js,
  // que carrega allowed-operations.json. Este teste garante que nenhuma tool
  // publicada pelo MCP tenha um id que não exista no catálogo.
  const catalog = JSON.parse(await readFile(join(root, "v10", "allowed-operations.json"), "utf8"));
  const catalogIds = new Set([
    ...catalog.operations.map((op) => op.id),
    ...catalog.templates.map((tpl) => tpl.id),
  ]);

  const { loadOperationRegistry } = await import(pathToFileURL(join(root, "v10", "operation-registry.js")).href);
  const registry = await loadOperationRegistry(pathToFileURL(join(root, "v10", "allowed-operations.json")).href);
  const mcpRegistry = registry.buildMcpToolRegistry();
  const mcpIds = Object.keys(mcpRegistry);

  assert.ok(mcpIds.length > 0, "nenhuma tool derivada do registry");

  const missing = mcpIds.filter((id) => !catalogIds.has(id));
  assert.deepEqual(missing, [], `ids do registry MCP ausentes do catálogo: ${missing.join(", ")}`);

  // Cobertura inversa: toda operação do catálogo deve estar publicada como tool MCP.
  // (Exceto operações sem descrição/title mínimos — nenhuma no catálogo atual.)
  const publishedIds = new Set(mcpIds);
  const unpublished = [...catalogIds].filter((id) => !publishedIds.has(id));
  assert.deepEqual(unpublished, [], `operações do catálogo não publicadas como tools MCP: ${unpublished.join(", ")}`);
});

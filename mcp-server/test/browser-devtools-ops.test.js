import test from "node:test";
import { TEST_MCP_TOKEN } from "./helpers/launcher-test-env.js";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const BROWSER_IDS = [
  "browser_speedtest_mini",
  "browser_abrir_speedtest",
  "browser_devtools_config",
  "browser_abrir_paginas_devtools",
  "browser_memoria_processos",
  "browser_memoria_virtual",
  "browser_melhorar_velocidade",
  "browser_listar_abas",
  "browser_fechar_abas_descartaveis",
  "browser_analisar_devtools",
  "browser_iniciar_edge_cdp",
  "browser_abrir_extensao_pasta",
];

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

test("script browser-devtools.ps1 existe", () => {
  assert.equal(existsSync(join(root, "scripts", "browser-devtools.ps1")), true);
});

test("catálogo tem sessão Navegador com os 12 comandos novos", async () => {
  const catalog = JSON.parse(await readFile(join(root, "v10", "allowed-operations.json"), "utf8"));
  const byId = new Map(catalog.operations.map((op) => [op.id, op]));
  for (const id of BROWSER_IDS) {
    const op = byId.get(id);
    assert.ok(op, `faltando ${id}`);
    assert.equal(op.category, "Navegador");
    assert.match(op.command, /browser-devtools\.ps1/);
  }
  assert.equal(byId.get("browser_fechar_abas_descartaveis").destructive, true);
});

test("index.html declara cat_browser e os -Action do script", async () => {
  const html = await readFile(join(root, "v10", "index.html"), "utf8");
  assert.match(html, /id: "cat_browser"/);
  assert.match(html, /19\. Navegador \/ DevTools/);
  for (const action of [
    "speedtest-mini",
    "open-speedtest",
    "config-devtools",
    "open-devtools-pages",
    "memoria-processos",
    "memoria-virtual",
    "melhorar-velocidade",
    "listar-abas",
    "fechar-abas-descartaveis",
    "analisar-devtools",
    "iniciar-edge-cdp",
    "abrir-extensao-pasta",
  ]) {
    assert.match(html, new RegExp(`-Action ${action}`));
  }
});

test("/classify aprova ids de navegador e marca fechar-abas como destrutivo", async (t) => {
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

  const headers = {
    "Content-Type": "application/json",
    "X-Mestre-Client": "mcp",
    "X-Mestre-Mcp-Token": TEST_MCP_TOKEN,
  };

  const ok = await (await fetch(base + "/classify", {
    method: "POST",
    headers,
    body: JSON.stringify({ id: "browser_memoria_processos" }),
  })).json();
  assert.equal(ok.allowed, true);
  assert.equal(ok.destructive, false);
  assert.equal(ok.id, "browser_memoria_processos");

  const dest = await (await fetch(base + "/classify", {
    method: "POST",
    headers,
    body: JSON.stringify({ id: "browser_fechar_abas_descartaveis" }),
  })).json();
  assert.equal(dest.allowed, true);
  assert.equal(dest.destructive, true);

  const anon = await fetch(base + "/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "browser_memoria_processos" }),
  });
  assert.equal(anon.status, 403);
});

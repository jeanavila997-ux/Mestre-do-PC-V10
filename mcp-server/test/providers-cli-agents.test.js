import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { CATALOG, listProviders } from "../../v10/providers/index.js";

const root = fileURLToPath(new URL("../../", import.meta.url));

test("catálogo inclui llama.cpp e provedores extras", () => {
  for (const id of ["llamacpp", "lmstudio", "groq", "mistral", "deepseek", "openrouter", "ollama", "9router"]) {
    assert.ok(CATALOG[id], `faltando ${id}`);
    assert.equal(CATALOG[id].implemented, true);
  }
  assert.equal(CATALOG.llamacpp.local, true);
  assert.equal(CATALOG.llamacpp.baseUrl, "http://127.0.0.1:8080/v1");
  const listed = listProviders().providers.map((p) => p.id);
  assert.ok(listed.includes("llamacpp"));
  assert.equal(listProviders().providers.find((p) => p.id === "llamacpp").local, true);
});

test("script e menu de agentes CLI existem", async () => {
  assert.equal(existsSync(join(root, "scripts", "cli-agents.ps1")), true);
  const html = await readFile(join(root, "v10", "index.html"), "utf8");
  assert.match(html, /openAgent\('opencode'\)/);
  const catalog = JSON.parse(await readFile(join(root, "v10", "allowed-operations.json"), "utf8"));
  // Desde o #60 a categoria vem do catálogo (/operations), não do index.html.
  assert.ok(catalog.operations.some((o) => o.category === "Agentes CLI"), "categoria Agentes CLI ausente");
  const ids = catalog.operations.map((o) => o.id);
  for (const id of ["cli_agentes_status", "cli_agentes_instalar_opencode", "cli_agentes_abrir_opencode"]) {
    assert.ok(ids.includes(id), id);
  }
});

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
      if ((await fetch(url + "/ping")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Launcher não iniciou");
}

test("/open-terminal rejeita agente fora da allowlist", async (t) => {
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
  const res = await fetch(base + "/open-terminal", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mestre-Client": "v10-web" },
    body: JSON.stringify({ agent: "cmd.exe /c calc" }),
  });
  assert.equal(res.status, 400);
});

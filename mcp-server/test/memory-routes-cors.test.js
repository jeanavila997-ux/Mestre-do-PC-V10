import test from "node:test";
import { TEST_MCP_TOKEN } from "./helpers/launcher-test-env.js";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

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

test("rotas /memories: erros autenticados não devolvem Access-Control-Allow-Origin *", async (t) => {
  const memoriesDir = await mkdtemp(join(tmpdir(), "mestre-memories-"));
  t.after(async () => { await rm(memoriesDir, { recursive: true, force: true }); });

  const port = await reservePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(root, "v10", "launcher.js")], {
    cwd: join(root, "v10"),
    env: { ...process.env, MPC_PORT: String(port), MESTRE_MEMORIES_DIR: memoriesDir },
    windowsHide: true,
    stdio: "ignore",
  });
  t.after(() => child.kill());

  await waitForServer(base);

  const headers = {
    "Content-Type": "application/json",
    "X-Mestre-Client": "mcp",
    "X-Mestre-Mcp-Token": TEST_MCP_TOKEN,
    Origin: base,
  };

  const cases = [
    { method: "POST", path: "/memories/create", body: "{}", status: 400, error: "Conteúdo é obrigatório." },
    { method: "GET", path: "/memories/get/nao-existe", status: 404, error: "Memória não encontrada." },
    { method: "PUT", path: "/memories/update/nao-existe", body: "{}", status: 404, error: "Memória não encontrada." },
    { method: "POST", path: "/memories/import", body: "{}", status: 400, error: "Conteúdo é obrigatório." },
  ];

  for (const item of cases) {
    const response = await fetch(base + item.path, {
      method: item.method,
      headers,
      body: item.body,
    });
    const allowOrigin = response.headers.get("access-control-allow-origin");
    assert.equal(response.status, item.status, item.path);
    assert.equal(allowOrigin, base, item.path);
    assert.notEqual(allowOrigin, "*");
    const payload = await response.json();
    assert.equal(payload.error, item.error);
  }

  const noOrigin = await fetch(base + "/memories/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mestre-Client": "mcp",
      "X-Mestre-Mcp-Token": TEST_MCP_TOKEN,
    },
    body: "{}",
  });
  assert.equal(noOrigin.status, 400);
  assert.equal(noOrigin.headers.get("access-control-allow-origin"), base);
});

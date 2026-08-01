import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
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

test("launcher Node serve a V10 e bloqueia POSTs externos", async (t) => {
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

  const page = await fetch(base + "/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
  assert.match(await page.text(), /Mestre do PC V10/);

  const noHeader = await fetch(base + "/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd: "Write-Host NAO_EXECUTAR" }),
  });
  assert.equal(noHeader.status, 403);

  const externalOrigin = await fetch(base + "/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://example.com",
      "X-Mestre-Client": "v10-web",
    },
    body: JSON.stringify({ cmd: "Write-Host NAO_EXECUTAR" }),
  });
  assert.equal(externalOrigin.status, 403);

  const preflight = await fetch(base + "/run", {
    method: "OPTIONS",
    headers: { "Origin": "https://example.com" },
  });
  assert.equal(preflight.status, 403);
});

test("launcher Node aceita id+params e rejeita comandos não cadastrados", async (t) => {
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

  const pingJob = await fetch(base + "/run", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mestre-Client": "mcp" },
    body: JSON.stringify({ id: "ver_uso_ram" }),
  });
  assert.equal(pingJob.status, 202);
  const submit = await pingJob.json();
  assert.equal(submit.success, true);
  assert.ok(submit.jobId);

  const tpl = await fetch(base + "/run", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mestre-Client": "mcp" },
    body: JSON.stringify({ id: "encerrar_processo", params: { nome: "notepad" } }),
  });
  assert.equal(tpl.status, 202);
  const tplSubmit = await tpl.json();
  assert.equal(tplSubmit.success, true);

  const bad = await fetch(base + "/run", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mestre-Client": "mcp" },
    body: JSON.stringify({ id: "encerrar_processo", params: { nome: "notepad; Stop-Computer" } }),
  });
  assert.equal(bad.status, 403);

  const free = await fetch(base + "/run", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mestre-Client": "mcp" },
    body: JSON.stringify({ cmd: "Write-Host LIVRE" }),
  });
  assert.equal(free.status, 403);
});

